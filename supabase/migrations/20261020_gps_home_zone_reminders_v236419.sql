-- RESANTA CRM v23.6.419
-- GPS home/start zones, September-October derived-stop audit and Telegram workday reminders.
-- Raw GPS points, visits, route plans and mileage are not modified.

create table if not exists public.gps_home_zones_v236417(
  user_id uuid primary key,
  manager_name text not null,
  status text not null default 'suggested' check(status in ('suggested','confirmed','rejected')),
  suggested_lat double precision,
  suggested_lng double precision,
  confirmed_lat double precision,
  confirmed_lng double precision,
  radius_m integer not null default 150 check(radius_m between 80 and 500),
  evidence_workdays integer not null default 0,
  starts_within_150m integer not null default 0,
  starts_within_300m integer not null default 0,
  home_like_stops_10m integer not null default 0,
  avg_home_like_minutes numeric,
  max_home_like_minutes numeric,
  evidence_from date,
  evidence_to date,
  confirmed_at timestamptz,
  confirmed_by text,
  updated_at timestamptz not null default now()
);
alter table public.gps_home_zones_v236417 enable row level security;
revoke all on public.gps_home_zones_v236417 from anon,authenticated;

create table if not exists public.gps_stop_classifications_v236417(
  workday_id uuid not null,
  stop_seq integer not null,
  manager_name text not null,
  work_date date not null,
  classification text not null check(classification in ('home','start_zone','planned_tt','offplan','technical')),
  label text not null,
  detail text,
  matched_client_name text,
  distance_to_home_m numeric,
  classified_at timestamptz not null default now(),
  source jsonb not null default '{}'::jsonb,
  primary key(workday_id,stop_seq)
);
alter table public.gps_stop_classifications_v236417 enable row level security;
revoke all on public.gps_stop_classifications_v236417 from anon,authenticated;

create table if not exists public.gps_workday_reminder_log_v236417(
  workday_id uuid not null,
  reminder_kind text not null check(reminder_kind in ('18:10','20:00')),
  user_id uuid not null,
  manager_name text not null,
  work_date date not null,
  sent_at timestamptz,
  telegram_chat_id bigint,
  status text not null default 'pending' check(status in ('pending','sent','failed','no_binding')),
  error_text text,
  created_at timestamptz not null default now(),
  primary key(workday_id,reminder_kind)
);
alter table public.gps_workday_reminder_log_v236417 enable row level security;
revoke all on public.gps_workday_reminder_log_v236417 from anon,authenticated;

CREATE OR REPLACE FUNCTION public.crm_run_gps_workday_reminder_v236417(p_phase text)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_catalog'
AS $function$
declare
  s text;
  req_id bigint;
begin
  if p_phase not in ('18:10','20:00') then raise exception 'INVALID_PHASE'; end if;

  select value->>'secret' into s
  from public.crm_telegram_runtime
  where key='dispatch_secret';

  if coalesce(s,'')='' then raise exception 'DISPATCH_SECRET_MISSING'; end if;

  select net.http_post(
    url := 'https://baqchjtvtmcfzwjjluhs.supabase.co/functions/v1/crm-gps-workday-reminder-v236417',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'x-crm-dispatch-secret',s
    ),
    body := jsonb_build_object('phase',p_phase),
    timeout_milliseconds := 15000
  ) into req_id;

  return req_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.gps_classify_workday_stops_v236417(p_workday_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_catalog'
AS $function$
declare
  w public.gps_workdays%rowtype;
  a jsonb;
  offp jsonb;
  z public.gps_home_zones_v236417%rowtype;
  zone_lat double precision;
  zone_lng double precision;
  s jsonb;
  p jsonb;
  o jsonb;
  outj jsonb:='[]'::jsonb;
  seq_i integer;
  mins numeric;
  slat double precision;
  slng double precision;
  sstart timestamptz;
  send timestamptz;
  d_home numeric;
  cls text;
  lbl text;
  det text;
  matched text;
  home_candidate boolean;
  suggested_strong boolean:=false;
begin
  if not public.gps_has_control_access() then
    raise exception 'Нет доступа к GPS-контролю' using errcode='42501';
  end if;

  select * into w from public.gps_workdays where id=p_workday_id;
  if w.id is null then return '[]'::jsonb; end if;

  a:=public.gps_get_workday_aggregate_director_v2365(p_workday_id);
  offp:=public.gps_get_offplan_gps_stops_v2365(p_workday_id);

  select * into z
  from public.gps_home_zones_v236417
  where user_id=w.user_id
  limit 1;

  if z.status='confirmed' then
    zone_lat:=z.confirmed_lat; zone_lng:=z.confirmed_lng;
  elsif z.status='suggested' then
    zone_lat:=z.suggested_lat; zone_lng:=z.suggested_lng;
    suggested_strong:=(
      coalesce(z.evidence_workdays,0)>=5
      and coalesce(z.starts_within_150m,0)>=greatest(3,ceil(coalesce(z.evidence_workdays,0)*0.60)::int)
    );
  end if;

  for s in select value from jsonb_array_elements(coalesce(a->'physical_stops','[]'::jsonb))
  loop
    seq_i:=coalesce(nullif(s->>'seq','')::integer,0);
    mins:=coalesce(nullif(s->>'minutes','')::numeric,0);
    slat:=nullif(s->>'lat','')::double precision;
    slng:=nullif(s->>'lng','')::double precision;
    sstart:=nullif(s->>'start_at','')::timestamptz;
    send:=nullif(s->>'end_at','')::timestamptz;
    p:=null;
    o:=null;
    matched:=null;
    d_home:=null;

    select value into p
    from jsonb_array_elements(coalesce(a->'planned_points','[]'::jsonb))
    where nullif(value->>'stop_seq','')::integer=seq_i
    limit 1;

    select value into o
    from jsonb_array_elements(coalesce(offp,'[]'::jsonb))
    where coalesce(nullif(value->>'cluster_id','')::integer,nullif(value->>'first_seq','')::integer)=seq_i
    limit 1;

    if zone_lat is not null and zone_lng is not null and slat is not null and slng is not null then
      d_home:=round(public.gps_haversine_m(slat,slng,zone_lat,zone_lng)::numeric,0);
    end if;

    home_candidate:=(
      seq_i=1
      and mins>=10
      and d_home is not null
      and d_home<=coalesce(z.radius_m,150)
      and sstart is not null
      and send is not null
      and sstart<=w.started_at+interval '20 minutes'
      and send>=w.started_at+interval '10 minutes'
    );

    if p is not null then
      cls:='planned_tt';
      matched:=p->>'client_name';
      lbl:='✅ Плановая ТТ · '||coalesce(matched,'клиент');
      det:='Остановка сопоставлена с утверждённой плановой ТТ.';
    elsif home_candidate and z.status='confirmed' then
      cls:='home';
      lbl:='🏠 Дом · GPS включён, выезд ещё не начат';
      det:='Не считается клиентской ТТ. Фактический выезд — окончание этой остановки.';
    elsif home_candidate and z.status='suggested' and suggested_strong then
      cls:='start_zone';
      lbl:='📍 Стартовая стоянка · ожидает подтверждения директора';
      det:='Повторяющаяся стартовая зона. После подтверждения директором будет отображаться как «Дом».';
    elsif o is not null then
      cls:='offplan';
      matched:=o->>'client_name';
      lbl:='⚠️ Внеплановая остановка · '||coalesce(matched,'клиент рядом');
      det:='GPS видит остановку у клиента, которого нет в утверждённом плане.';
    elsif home_candidate and z.status='suggested' then
      cls:='start_zone';
      lbl:='📍 Стартовая стоянка · требуется подтверждение';
      det:='Стартовая зона пока имеет недостаточно повторов для автоматической уверенной подсказки.';
    else
      cls:='technical';
      lbl:='🔧 Техническая остановка';
      det:='Не сопоставлена с плановой ТТ и не подтверждена как домашняя стартовая зона.';
    end if;

    outj:=outj||jsonb_build_array(
      s||jsonb_build_object(
        'classification',cls,
        'classification_label',lbl,
        'classification_detail',det,
        'matched_client_name',matched,
        'distance_to_home_m',d_home,
        'home_zone_status',coalesce(z.status,'none')
      )
    );
  end loop;

  return outj;
end;
$function$;

CREATE OR REPLACE FUNCTION public.gps_get_workday_aggregate_director_v236417(p_workday_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_catalog'
AS $function$
declare
  a jsonb;
  s jsonb;
  w public.gps_workdays%rowtype;
  z public.gps_home_zones_v236417%rowtype;
  depart timestamptz;
  basis text:='gps_started';
begin
  if not public.gps_has_control_access() then
    raise exception 'Нет доступа к GPS-контролю' using errcode='42501';
  end if;

  a:=public.gps_get_workday_aggregate_director_v2365(p_workday_id);
  select * into w from public.gps_workdays where id=p_workday_id;
  select * into z from public.gps_home_zones_v236417 where user_id=w.user_id limit 1;
  s:=public.gps_classify_workday_stops_v236417(p_workday_id);

  select nullif(e->>'end_at','')::timestamptz
  into depart
  from jsonb_array_elements(coalesce(s,'[]'::jsonb)) e
  where nullif(e->>'seq','')::integer=1
    and e->>'classification' in ('home','start_zone')
    and coalesce(nullif(e->>'minutes','')::numeric,0)>=10
  limit 1;

  if depart is not null then
    basis:=case when z.status='confirmed' then 'confirmed_home_zone' else 'suggested_start_zone' end;
  else
    depart:=w.started_at;
  end if;

  return a||jsonb_build_object(
    'physical_stops',coalesce(s,'[]'::jsonb),
    'gps_enabled_at',w.started_at,
    'actual_departure_at',depart,
    'departure_basis',basis,
    'home_zone_status',coalesce(z.status,'none'),
    'home_zone_evidence_workdays',coalesce(z.evidence_workdays,0),
    'home_zone_starts_within_150m',coalesce(z.starts_within_150m,0),
    'director_version','v23.6.417'
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.gps_home_zone_decide_v236417(p_manager_name text, p_action text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_catalog'
AS $function$
declare
  z public.gps_home_zones_v236417%rowtype;
  e text:=lower(coalesce(auth.jwt()->>'email',''));
begin
  if not public.gps_has_control_access() then
    raise exception 'Нет доступа к GPS-контролю' using errcode='42501';
  end if;

  select * into z
  from public.gps_home_zones_v236417
  where lower(manager_name)=lower(trim(p_manager_name))
  limit 1
  for update;

  if z.user_id is null then raise exception 'Стартовая зона менеджера не найдена'; end if;

  if lower(trim(p_action))='confirm' then
    update public.gps_home_zones_v236417
    set status='confirmed',
        confirmed_lat=suggested_lat,
        confirmed_lng=suggested_lng,
        confirmed_at=now(),
        confirmed_by=e,
        updated_at=now()
    where user_id=z.user_id;

    update public.gps_stop_classifications_v236417
    set classification='home',
        label='🏠 Дом · GPS включён, выезд ещё не начат',
        detail='Не считается клиентской ТТ. Фактический выезд — окончание этой остановки.',
        classified_at=now(),
        source=source||jsonb_build_object('home_zone_status','confirmed')
    where lower(manager_name)=lower(z.manager_name)
      and classification='start_zone';

  elsif lower(trim(p_action))='reject' then
    update public.gps_home_zones_v236417
    set status='rejected',
        confirmed_lat=null,
        confirmed_lng=null,
        confirmed_at=now(),
        confirmed_by=e,
        updated_at=now()
    where user_id=z.user_id;

    delete from public.gps_stop_classifications_v236417
    where lower(manager_name)=lower(z.manager_name)
      and classification in ('home','start_zone');

  elsif lower(trim(p_action))='reset' then
    update public.gps_home_zones_v236417
    set status='suggested',
        confirmed_lat=null,
        confirmed_lng=null,
        confirmed_at=null,
        confirmed_by=null,
        updated_at=now()
    where user_id=z.user_id;

    update public.gps_stop_classifications_v236417
    set classification='start_zone',
        label='📍 Стартовая стоянка · ожидает подтверждения директора',
        detail='Повторяющаяся стартовая зона. После подтверждения директором будет отображаться как «Дом».',
        classified_at=now(),
        source=source||jsonb_build_object('home_zone_status','suggested')
    where lower(manager_name)=lower(z.manager_name)
      and classification='home';
  else
    raise exception 'Неизвестное действие';
  end if;

  return jsonb_build_object('ok',true,'manager_name',z.manager_name,'action',lower(trim(p_action)));
end;
$function$;

CREATE OR REPLACE FUNCTION public.gps_home_zone_list_v236417()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_catalog'
AS $function$
declare
  v jsonb;
begin
  if not public.gps_has_control_access() then
    raise exception 'Нет доступа к GPS-контролю' using errcode='42501';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'user_id',user_id,
    'manager_name',manager_name,
    'status',status,
    'radius_m',radius_m,
    'evidence_workdays',evidence_workdays,
    'starts_within_150m',starts_within_150m,
    'starts_within_300m',starts_within_300m,
    'home_like_stops_10m',home_like_stops_10m,
    'avg_home_like_minutes',avg_home_like_minutes,
    'max_home_like_minutes',max_home_like_minutes,
    'evidence_from',evidence_from,
    'evidence_to',evidence_to,
    'confirmed_at',confirmed_at,
    'confirmed_by',confirmed_by
  ) order by manager_name),'[]'::jsonb)
  into v
  from public.gps_home_zones_v236417;
  return v;
end;
$function$;

CREATE OR REPLACE FUNCTION public.gps_rebuild_workday_aggregate_v236417(p_workday_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_catalog'
AS $function$
begin
  if not public.gps_has_control_access() then
    raise exception 'Нет доступа к GPS-контролю' using errcode='42501';
  end if;
  perform public.gps_rebuild_workday_aggregate_v2365(p_workday_id);
  return public.gps_get_workday_aggregate_director_v236417(p_workday_id);
end;
$function$;

CREATE OR REPLACE FUNCTION public.gps_refresh_home_zone_suggestions_v236417(p_from date DEFAULT '2026-09-01'::date, p_to date DEFAULT CURRENT_DATE)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_catalog'
AS $function$
declare
  r record;
  v_count integer:=0;
begin
  if not public.gps_has_control_access() then
    raise exception 'Нет доступа к GPS-контролю' using errcode='42501';
  end if;

  for r in
    with starts as (
      select w.id,w.user_id,w.manager_name,w.work_date,w.start_lat,w.start_lng,a.physical_stops,a.planned_points
      from public.gps_workdays w
      left join public.gps_workday_aggregates a on a.workday_id=w.id
      where w.work_date between p_from and p_to
        and w.user_id is not null
        and w.start_lat is not null and w.start_lng is not null
    ), centers as (
      select user_id,
             max(manager_name) manager_name,
             count(*)::int evidence_workdays,
             percentile_cont(0.5) within group(order by start_lat) center_lat,
             percentile_cont(0.5) within group(order by start_lng) center_lng
      from starts
      group by user_id
      having count(*)>=5
    )
    select c.user_id,c.manager_name,c.evidence_workdays,c.center_lat,c.center_lng,
      count(*) filter(
        where public.gps_haversine_m(s.start_lat,s.start_lng,c.center_lat,c.center_lng)<=150
      )::int starts_150,
      count(*) filter(
        where public.gps_haversine_m(s.start_lat,s.start_lng,c.center_lat,c.center_lng)<=300
      )::int starts_300,
      count(*) filter(
        where s.physical_stops is not null
          and jsonb_array_length(coalesce(s.physical_stops,'[]'::jsonb))>0
          and coalesce(nullif(s.physical_stops->0->>'minutes','')::numeric,0)>=10
          and nullif(s.physical_stops->0->>'lat','') is not null
          and nullif(s.physical_stops->0->>'lng','') is not null
          and public.gps_haversine_m(
            (s.physical_stops->0->>'lat')::double precision,
            (s.physical_stops->0->>'lng')::double precision,
            c.center_lat,c.center_lng
          )<=150
          and not exists(
            select 1
            from jsonb_array_elements(coalesce(s.planned_points,'[]'::jsonb)) p
            where nullif(p->>'stop_seq','')::int=1
          )
      )::int home_like_count,
      round(avg(nullif(s.physical_stops->0->>'minutes','')::numeric) filter(
        where s.physical_stops is not null
          and jsonb_array_length(coalesce(s.physical_stops,'[]'::jsonb))>0
          and coalesce(nullif(s.physical_stops->0->>'minutes','')::numeric,0)>=10
          and nullif(s.physical_stops->0->>'lat','') is not null
          and nullif(s.physical_stops->0->>'lng','') is not null
          and public.gps_haversine_m(
            (s.physical_stops->0->>'lat')::double precision,
            (s.physical_stops->0->>'lng')::double precision,
            c.center_lat,c.center_lng
          )<=150
          and not exists(
            select 1 from jsonb_array_elements(coalesce(s.planned_points,'[]'::jsonb)) p
            where nullif(p->>'stop_seq','')::int=1
          )
      ),1) avg_home_like,
      round(max(nullif(s.physical_stops->0->>'minutes','')::numeric) filter(
        where s.physical_stops is not null
          and jsonb_array_length(coalesce(s.physical_stops,'[]'::jsonb))>0
          and coalesce(nullif(s.physical_stops->0->>'minutes','')::numeric,0)>=10
          and nullif(s.physical_stops->0->>'lat','') is not null
          and nullif(s.physical_stops->0->>'lng','') is not null
          and public.gps_haversine_m(
            (s.physical_stops->0->>'lat')::double precision,
            (s.physical_stops->0->>'lng')::double precision,
            c.center_lat,c.center_lng
          )<=150
          and not exists(
            select 1 from jsonb_array_elements(coalesce(s.planned_points,'[]'::jsonb)) p
            where nullif(p->>'stop_seq','')::int=1
          )
      ),1) max_home_like
    from centers c
    join starts s on s.user_id=c.user_id
    group by c.user_id,c.manager_name,c.evidence_workdays,c.center_lat,c.center_lng
  loop
    insert into public.gps_home_zones_v236417(
      user_id,manager_name,status,suggested_lat,suggested_lng,radius_m,
      evidence_workdays,starts_within_150m,starts_within_300m,
      home_like_stops_10m,avg_home_like_minutes,max_home_like_minutes,
      evidence_from,evidence_to,updated_at
    ) values(
      r.user_id,r.manager_name,'suggested',r.center_lat,r.center_lng,150,
      r.evidence_workdays,r.starts_150,r.starts_300,
      r.home_like_count,r.avg_home_like,r.max_home_like,
      p_from,p_to,now()
    )
    on conflict(user_id) do update set
      manager_name=excluded.manager_name,
      suggested_lat=excluded.suggested_lat,
      suggested_lng=excluded.suggested_lng,
      evidence_workdays=excluded.evidence_workdays,
      starts_within_150m=excluded.starts_within_150m,
      starts_within_300m=excluded.starts_within_300m,
      home_like_stops_10m=excluded.home_like_stops_10m,
      avg_home_like_minutes=excluded.avg_home_like_minutes,
      max_home_like_minutes=excluded.max_home_like_minutes,
      evidence_from=excluded.evidence_from,
      evidence_to=excluded.evidence_to,
      status=case
        when public.gps_home_zones_v236417.status in ('confirmed','rejected')
          then public.gps_home_zones_v236417.status
        else 'suggested'
      end,
      updated_at=now();
    v_count:=v_count+1;
  end loop;

  return jsonb_build_object('ok',true,'managers',v_count,'from',p_from,'to',p_to);
end;
$function$;

CREATE OR REPLACE FUNCTION public.gps_refresh_stop_classifications_v236417(p_from date DEFAULT '2026-09-01'::date, p_to date DEFAULT CURRENT_DATE)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_catalog'
AS $function$
declare
  w record;
  s jsonb;
  e jsonb;
  days_n integer:=0;
  stops_n integer:=0;
begin
  if not public.gps_has_control_access() then
    raise exception 'Нет доступа к GPS-контролю' using errcode='42501';
  end if;

  delete from public.gps_stop_classifications_v236417 c
  using public.gps_workdays w0
  where c.workday_id=w0.id
    and w0.work_date between p_from and p_to;

  for w in
    select id,manager_name,work_date
    from public.gps_workdays
    where work_date between p_from and p_to
    order by work_date,manager_name
  loop
    s:=public.gps_classify_workday_stops_v236417(w.id);
    for e in select value from jsonb_array_elements(coalesce(s,'[]'::jsonb))
    loop
      insert into public.gps_stop_classifications_v236417(
        workday_id,stop_seq,manager_name,work_date,classification,label,detail,
        matched_client_name,distance_to_home_m,classified_at,source
      ) values(
        w.id,
        coalesce(nullif(e->>'seq','')::integer,0),
        w.manager_name,w.work_date,
        coalesce(e->>'classification','technical'),
        coalesce(e->>'classification_label','🔧 Техническая остановка'),
        e->>'classification_detail',
        e->>'matched_client_name',
        nullif(e->>'distance_to_home_m','')::numeric,
        now(),
        jsonb_build_object('version','v23.6.417','home_zone_status',e->>'home_zone_status')
      )
      on conflict(workday_id,stop_seq) do update set
        classification=excluded.classification,
        label=excluded.label,
        detail=excluded.detail,
        matched_client_name=excluded.matched_client_name,
        distance_to_home_m=excluded.distance_to_home_m,
        classified_at=now(),
        source=excluded.source;
      stops_n:=stops_n+1;
    end loop;
    days_n:=days_n+1;
  end loop;

  return jsonb_build_object('ok',true,'days',days_n,'stops',stops_n,'from',p_from,'to',p_to);
end;
$function$;


revoke all on function public.gps_refresh_home_zone_suggestions_v236417(date,date) from public,anon;
grant execute on function public.gps_refresh_home_zone_suggestions_v236417(date,date) to authenticated;
revoke all on function public.gps_home_zone_list_v236417() from public,anon;
grant execute on function public.gps_home_zone_list_v236417() to authenticated;
revoke all on function public.gps_home_zone_decide_v236417(text,text) from public,anon;
grant execute on function public.gps_home_zone_decide_v236417(text,text) to authenticated;
revoke all on function public.gps_classify_workday_stops_v236417(uuid) from public,anon;
grant execute on function public.gps_classify_workday_stops_v236417(uuid) to authenticated;
revoke all on function public.gps_get_workday_aggregate_director_v236417(uuid) from public,anon;
grant execute on function public.gps_get_workday_aggregate_director_v236417(uuid) to authenticated;
revoke all on function public.gps_rebuild_workday_aggregate_v236417(uuid) from public,anon;
grant execute on function public.gps_rebuild_workday_aggregate_v236417(uuid) to authenticated;
revoke all on function public.gps_refresh_stop_classifications_v236417(date,date) from public,anon;
grant execute on function public.gps_refresh_stop_classifications_v236417(date,date) to authenticated;
revoke all on function public.crm_run_gps_workday_reminder_v236417(text) from public,anon,authenticated;
grant execute on function public.crm_run_gps_workday_reminder_v236417(text) to service_role;

do $$
declare j bigint;
begin
  select jobid into j from cron.job where jobname='gps-workday-reminder-1810-minsk' limit 1;
  if j is not null then perform cron.unschedule(j); end if;
  select jobid into j from cron.job where jobname='gps-workday-reminder-2000-minsk' limit 1;
  if j is not null then perform cron.unschedule(j); end if;
end $$;

select cron.schedule(
  'gps-workday-reminder-1810-minsk',
  '10 15 * * *',
  $$select public.crm_run_gps_workday_reminder_v236417('18:10');$$
);
select cron.schedule(
  'gps-workday-reminder-2000-minsk',
  '0 17 * * *',
  $$select public.crm_run_gps_workday_reminder_v236417('20:00');$$
);
