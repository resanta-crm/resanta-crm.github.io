-- RESANTA CRM v23.6.428
-- GPS trusted TT matching, geofence arrival/departure, technical-stop classification,
-- director period report and client-anchor protection.
-- Approved 2026-10-20. Raw GPS points, route plans, visits and mileage are not modified.

CREATE OR REPLACE FUNCTION public.gps_classify_workday_stops_v236417(p_workday_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_catalog'
AS $function$
  select public.gps_classify_workday_stops_v236421(p_workday_id);
$function$;

CREATE OR REPLACE FUNCTION public.gps_classify_workday_stops_v236421(p_workday_id uuid)
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
  pf_route_plan_id uuid;
  pf_client_name text;
begin
  if not public.gps_has_control_access() then
    raise exception 'Нет доступа к GPS-контролю' using errcode='42501';
  end if;

  select * into w from public.gps_workdays where id=p_workday_id;
  if w.id is null then return '[]'::jsonb; end if;

  a:=public.gps_get_workday_aggregate_director_v2365(p_workday_id);
  offp:=public.gps_get_offplan_gps_stops_v2365(p_workday_id);

  select * into z from public.gps_home_zones_v236417 where user_id=w.user_id limit 1;
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
    matched:=null;d_home:=null;o:=null;
    pf_route_plan_id:=null;pf_client_name:=null;

    if zone_lat is not null and zone_lng is not null and slat is not null and slng is not null then
      d_home:=round(public.gps_haversine_m(slat,slng,zone_lat,zone_lng)::numeric,0);
    end if;

    home_candidate:=(
      seq_i=1 and mins>=10 and d_home is not null and d_home<=coalesce(z.radius_m,150)
      and sstart is not null and send is not null
      and sstart<=w.started_at+interval '20 minutes'
      and send>=w.started_at+interval '10 minutes'
    );

    if not home_candidate then
      select f.route_plan_id,f.client_name
      into pf_route_plan_id,pf_client_name
      from public.gps_workday_visit_facts_v236421(p_workday_id) f
      where f.actual_arrival_at is not null and f.actual_departure_at is not null
        and sstart is not null and send is not null
        and f.actual_arrival_at<=send+interval '2 minutes'
        and f.actual_departure_at>=sstart-interval '2 minutes'
      order by
        case when f.visit_gps_status='confirmed' then 0 else 1 end,
        greatest(0,extract(epoch from (
          least(f.actual_departure_at,send)-greatest(f.actual_arrival_at,sstart)
        ))) desc,
        f.sort_order
      limit 1;
    end if;

    if pf_route_plan_id is null and not home_candidate then
      select value into o
      from jsonb_array_elements(coalesce(offp,'[]'::jsonb))
      where coalesce(nullif(value->>'cluster_id','')::integer,nullif(value->>'first_seq','')::integer)=seq_i
        and coalesce((value->>'ambiguous')::boolean,false)=false
        and coalesce(nullif(value->>'candidate_count','')::integer,0)=1
        and coalesce(nullif(value->>'distance_m','')::numeric,999999)<=100
      limit 1;
    end if;

    if home_candidate and z.status='confirmed' then
      cls:='home';lbl:='🏠 Дом · GPS включён, выезд ещё не начат';
      det:='Не считается клиентской ТТ. Фактический выезд — окончание этой остановки.';
    elsif home_candidate and z.status='suggested' and suggested_strong then
      cls:='start_zone';lbl:='📍 Стартовая стоянка · ожидает подтверждения директора';
      det:='Повторяющаяся стартовая зона.';
    elsif pf_route_plan_id is not null then
      cls:='planned_tt';matched:=pf_client_name;
      lbl:='✅ Плановая ТТ · '||coalesce(matched,'клиент');
      det:='Сопоставлено по доверенной координате и фактическому времени нахождения в геозоне ТТ.';
    elsif o is not null then
      cls:='offplan';matched:=o->>'client_name';
      lbl:='⚠️ Внеплановая остановка · '||coalesce(matched,'клиент рядом');
      det:='Одна однозначная клиентская точка рядом с остановкой.';
    elsif home_candidate and z.status='suggested' then
      cls:='start_zone';lbl:='📍 Стартовая стоянка · требуется подтверждение';
      det:='Стартовая зона пока имеет недостаточно повторов.';
    else
      cls:='technical';lbl:='🔧 Техническая остановка';
      det:='Не сопоставлена с подтверждённой плановой ТТ.';
    end if;

    outj:=outj||jsonb_build_array(
      s||jsonb_build_object(
        'classification',cls,'classification_label',lbl,'classification_detail',det,
        'matched_client_name',matched,'distance_to_home_m',d_home,
        'home_zone_status',coalesce(z.status,'none')
      )
    );
  end loop;
  return outj;
end;
$function$;

CREATE OR REPLACE FUNCTION public.gps_coordinate_conflict_count_v236426(p_from date DEFAULT '2026-09-01'::date, p_to date DEFAULT CURRENT_DATE)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_catalog'
AS $function$
declare r jsonb;
begin
  if not public.gps_has_control_access() then
    raise exception 'Нет доступа к GPS-контролю' using errcode='42501';
  end if;
  select jsonb_build_object(
    'route_points',count(*),
    'with_both',count(*) filter(where diff_m is not null),
    'over_250m',count(*) filter(where diff_m>250),
    'over_1km',count(*) filter(where diff_m>1000),
    'max_m',round(max(diff_m)::numeric,0)
  ) into r
  from (
    select case
      when r.route_lat is not null and r.route_lng is not null
       and c.gps_lat is not null and c.gps_lng is not null
      then public.gps_haversine_m(r.route_lat,r.route_lng,c.gps_lat,c.gps_lng)
    end diff_m
    from public.route_plans r
    join public.clients c on c.id=r.client_id
    where r.visit_date between p_from and p_to
      and coalesce(r.removed,false)=false
      and r.manager_name in ('Руднев','Шкуран','Ачинович')
  ) x;
  return r;
end;
$function$;

CREATE OR REPLACE FUNCTION public.gps_director_report_v236421(p_from date, p_to date, p_manager text DEFAULT 'all'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_catalog'
AS $function$
declare
  result jsonb;
begin
  if not public.gps_has_control_access() then
    raise exception 'Нет доступа к GPS-контролю' using errcode='42501';
  end if;
  if p_from is null or p_to is null or p_to<p_from or p_to-p_from>120 then
    raise exception 'Некорректный период';
  end if;

  with days as (
    select w.id,w.work_date,w.manager_name
    from public.gps_workdays w
    where w.work_date between p_from and p_to
      and (coalesce(p_manager,'all')='all' or lower(w.manager_name)=lower(p_manager))
  ),
  facts as (
    select f.*
    from days d
    cross join lateral public.gps_workday_visit_facts_v236421(d.id) f
  ),
  tech as (
    select d.id workday_id,d.work_date,d.manager_name,e
    from days d
    cross join lateral jsonb_array_elements(public.gps_classify_workday_stops_v236421(d.id)) e
    where e->>'classification'='technical'
  )
  select jsonb_build_object(
    'version','v23.6.421',
    'from',p_from,'to',p_to,'manager',coalesce(p_manager,'all'),
    'visits',coalesce((
      select jsonb_agg(jsonb_build_object(
        'workday_id',workday_id,'date',work_date,'manager_name',manager_name,
        'route_plan_id',route_plan_id,'sort_order',sort_order,'client_id',client_id,
        'client_name',client_name,'city',city,'address',address,
        'planned_start',planned_start,'planned_end',planned_end,'planned_minutes',planned_minutes,
        'actual_arrival_at',actual_arrival_at,'actual_departure_at',actual_departure_at,
        'actual_minutes',actual_minutes,'arrival_delta_minutes',arrival_delta_minutes
      ) order by work_date,manager_name,sort_order,client_name)
      from facts
    ),'[]'::jsonb),
    'technical_stops',coalesce((
      select jsonb_agg(jsonb_build_object(
        'workday_id',workday_id,'date',work_date,'manager_name',manager_name,
        'stop_seq',nullif(e->>'seq','')::integer,
        'start_at',e->>'start_at','end_at',e->>'end_at',
        'minutes',nullif(e->>'minutes','')::numeric,
        'lat',nullif(e->>'lat','')::double precision,
        'lng',nullif(e->>'lng','')::double precision,
        'avg_accuracy',nullif(e->>'avg_accuracy','')::numeric
      ) order by work_date,manager_name,nullif(e->>'seq','')::integer)
      from tech
    ),'[]'::jsonb),
    'generated_at',now()
  ) into result;

  return result;
end;
$function$;

CREATE OR REPLACE FUNCTION public.gps_get_workday_aggregate_director_v236421(p_workday_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_catalog'
AS $function$
declare
  a jsonb;
  p jsonb;
  f record;
  newplans jsonb:='[]'::jsonb;
  stops jsonb;
  stop_match jsonb;
  w public.gps_workdays%rowtype;
  z public.gps_home_zones_v236417%rowtype;
  depart timestamptz;
  basis text:='gps_started';
  visited_n integer:=0;
begin
  if not public.gps_has_control_access() then
    raise exception 'Нет доступа к GPS-контролю' using errcode='42501';
  end if;

  a:=public.gps_get_workday_aggregate_director_v2365(p_workday_id);
  select * into w from public.gps_workdays where id=p_workday_id;
  select * into z from public.gps_home_zones_v236417 where user_id=w.user_id limit 1;
  stops:=public.gps_classify_workday_stops_v236421(p_workday_id);

  for p in select value from jsonb_array_elements(coalesce(a->'planned_points','[]'::jsonb))
  loop
    f:=null;stop_match:=null;
    if nullif(p->>'route_plan_id','') is not null then
      select x.* into f
      from public.gps_workday_visit_facts_v236421(p_workday_id) x
      where x.route_plan_id=(p->>'route_plan_id')::uuid
      limit 1;
    end if;

    if f.route_plan_id is not null then
      if f.actual_arrival_at is not null then
        select e into stop_match
        from jsonb_array_elements(coalesce(stops,'[]'::jsonb)) e
        where e->>'classification'='planned_tt'
          and e->>'matched_client_name'=f.client_name
          and nullif(e->>'start_at','')::timestamptz<=f.actual_departure_at+interval '2 minutes'
          and nullif(e->>'end_at','')::timestamptz>=f.actual_arrival_at-interval '2 minutes'
        order by greatest(0,extract(epoch from(
          least(nullif(e->>'end_at','')::timestamptz,f.actual_departure_at)
          - greatest(nullif(e->>'start_at','')::timestamptz,f.actual_arrival_at)
        ))) desc
        limit 1;
      end if;

      p:=p||jsonb_build_object(
        'lat',f.trusted_lat,'lng',f.trusted_lng,
        'coordinate_source',f.coordinate_source,
        'coordinate_conflict',f.coordinate_conflict,
        'actual_arrival_at',f.actual_arrival_at,
        'actual_departure_at',f.actual_departure_at,
        'actual_minutes',f.actual_minutes,
        'arrival_delta_minutes',f.arrival_delta_minutes,
        'visit_gps_status',f.visit_gps_status,
        'stop_seq',case when stop_match is null then null else nullif(stop_match->>'seq','')::integer end,
        'stop_start_at',case when stop_match is null then null else stop_match->>'start_at' end,
        'stop_end_at',case when stop_match is null then null else stop_match->>'end_at' end,
        'stop_minutes',case when stop_match is null then null else nullif(stop_match->>'minutes','')::numeric end,
        'distance_m',case when f.actual_arrival_at is null then null else p->'distance_m' end,
        'state',case
          when f.actual_arrival_at is not null and f.visit_gps_status='confirmed' then 'gps_and_report'
          when f.actual_arrival_at is not null then 'gps_only'
          when f.visit_id is not null then 'report_no_gps'
          when f.trusted_lat is null then 'no_coordinates'
          else 'pending'
        end
      );
      if f.actual_arrival_at is not null then visited_n:=visited_n+1; end if;
    end if;
    newplans:=newplans||jsonb_build_array(p);
  end loop;

  select nullif(e->>'end_at','')::timestamptz into depart
  from jsonb_array_elements(coalesce(stops,'[]'::jsonb)) e
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
    'planned_points',newplans,'physical_stops',coalesce(stops,'[]'::jsonb),
    'visited_count',visited_n,'gps_enabled_at',w.started_at,'actual_departure_at',depart,
    'departure_basis',basis,'home_zone_status',coalesce(z.status,'none'),
    'home_zone_evidence_workdays',coalesce(z.evidence_workdays,0),
    'home_zone_starts_within_150m',coalesce(z.starts_within_150m,0),
    'director_version','v23.6.425'
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.gps_guard_client_anchor_v236426()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
declare
  d numeric;
begin
  if new.gps_lat is null or new.gps_lng is null then return new; end if;

  if new.lat is not null and new.lng is not null then
    d:=public.gps_haversine_m(new.gps_lat,new.gps_lng,new.lat,new.lng);
  else
    d:=null;
  end if;

  -- One unverified sample must never move the client's main GPS anchor far away
  -- from the address/route coordinate. The sample itself remains in client_gps_samples.
  if lower(coalesce(new.gps_source,''))='samples'
     and new.gps_verified_at is null
     and coalesce(new.gps_samples_cnt,0)<2
     and d is not null and d>1000
     and (
       old.gps_lat is distinct from new.gps_lat
       or old.gps_lng is distinct from new.gps_lng
     )
  then
    new.gps_lat:=old.gps_lat;
    new.gps_lng:=old.gps_lng;
    new.gps_source:=old.gps_source;
    new.gps_radius:=old.gps_radius;
    new.gps_verified_at:=old.gps_verified_at;
  end if;

  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.gps_rebuild_workday_aggregate_v236421(p_workday_id uuid)
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
  return public.gps_get_workday_aggregate_director_v236421(p_workday_id);
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
  where c.workday_id=w0.id and w0.work_date between p_from and p_to;

  for w in
    select id,manager_name,work_date
    from public.gps_workdays
    where work_date between p_from and p_to
    order by work_date,manager_name
  loop
    s:=public.gps_classify_workday_stops_v236421(w.id);
    for e in select value from jsonb_array_elements(coalesce(s,'[]'::jsonb))
    loop
      insert into public.gps_stop_classifications_v236417(
        workday_id,stop_seq,manager_name,work_date,classification,label,detail,
        matched_client_name,distance_to_home_m,classified_at,source
      ) values(
        w.id,coalesce(nullif(e->>'seq','')::integer,0),w.manager_name,w.work_date,
        coalesce(e->>'classification','technical'),
        coalesce(e->>'classification_label','🔧 Техническая остановка'),
        e->>'classification_detail',e->>'matched_client_name',
        nullif(e->>'distance_to_home_m','')::numeric,now(),
        jsonb_build_object('version','v23.6.427','home_zone_status',e->>'home_zone_status')
      )
      on conflict(workday_id,stop_seq) do update set
        classification=excluded.classification,label=excluded.label,detail=excluded.detail,
        matched_client_name=excluded.matched_client_name,distance_to_home_m=excluded.distance_to_home_m,
        classified_at=now(),source=excluded.source;
      stops_n:=stops_n+1;
    end loop;
    days_n:=days_n+1;
  end loop;

  return jsonb_build_object('ok',true,'days',days_n,'stops',stops_n,'from',p_from,'to',p_to,'version','v23.6.427');
end;
$function$;

CREATE OR REPLACE FUNCTION public.gps_workday_visit_facts_v236421(p_workday_id uuid)
 RETURNS TABLE(workday_id uuid, work_date date, manager_name text, route_plan_id uuid, sort_order integer, client_id uuid, client_name text, city text, address text, planned_start time without time zone, planned_end time without time zone, planned_minutes integer, trusted_lat double precision, trusted_lng double precision, coordinate_source text, coordinate_conflict boolean, visit_id uuid, visit_created_at timestamp with time zone, visit_gps_status text, actual_arrival_at timestamp with time zone, actual_departure_at timestamp with time zone, actual_minutes numeric, arrival_delta_minutes numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_catalog'
AS $function$
with wd as (
  select w.id,w.work_date,w.manager_name
  from public.gps_workdays w
  where w.id=p_workday_id
    and public.gps_has_control_access()
),
base0 as (
  select wd.id workday_id,wd.work_date,wd.manager_name,
    r.id route_plan_id,coalesce(r.sort_order,999999)::integer sort_order,
    r.client_id,r.client_name,coalesce(nullif(r.city,''),c.city) city,
    coalesce(nullif(r.address,''),c.address) address,
    r.planned_start,r.planned_end,r.planned_minutes,
    r.route_lat,r.route_lng,c.lat client_lat,c.lng client_lng,
    c.gps_lat client_gps_lat,c.gps_lng client_gps_lng,
    coalesce(c.gps_samples_cnt,0) gps_samples_cnt,c.gps_verified_at,
    greatest(100,least(350,coalesce(c.gps_radius,250)))::double precision radius_m,
    v.id visit_id,v.created_at visit_created_at,lower(coalesce(v.gps_status,'')) visit_gps_status,
    v.gps_lat visit_lat,v.gps_lng visit_lng
  from wd
  join public.route_plans r
    on r.visit_date=wd.work_date
   and lower(trim(coalesce(r.manager_name,'')))=lower(trim(coalesce(wd.manager_name,'')))
   and coalesce(r.removed,false)=false
   and coalesce(r.review_status,'approved') not in ('pending','rejected')
  left join public.clients c on c.id=r.client_id
  left join lateral (
    select vv.*
    from public.visits vv
    where vv.route_plan_id=r.id::text and coalesce(vv.is_duplicate,false)=false
    order by case when lower(coalesce(vv.gps_status,''))='confirmed' then 0 else 1 end,
             vv.created_at desc
    limit 1
  ) v on true
),
base as (
  select b.*,
    case
      when b.client_gps_lat is not null and b.client_gps_lng is not null
       and coalesce(b.route_lat,b.client_lat) is not null and coalesce(b.route_lng,b.client_lng) is not null
      then public.gps_haversine_m(
        b.client_gps_lat,b.client_gps_lng,
        coalesce(b.route_lat,b.client_lat),coalesce(b.route_lng,b.client_lng)
      )>1000 else false
    end coordinate_conflict,
    case
      when b.visit_lat is not null and b.visit_lng is not null and b.visit_gps_status='confirmed'
       and (coalesce(b.route_lat,b.client_lat) is null or b.gps_verified_at is not null
            or public.gps_haversine_m(b.visit_lat,b.visit_lng,coalesce(b.route_lat,b.client_lat),coalesce(b.route_lng,b.client_lng))<=1000)
      then b.visit_lat
      when b.client_gps_lat is not null and b.client_gps_lng is not null and b.gps_verified_at is not null then b.client_gps_lat
      when b.client_gps_lat is not null and b.client_gps_lng is not null and b.gps_samples_cnt>=2
       and (coalesce(b.route_lat,b.client_lat) is null
            or public.gps_haversine_m(b.client_gps_lat,b.client_gps_lng,coalesce(b.route_lat,b.client_lat),coalesce(b.route_lng,b.client_lng))<=1000)
      then b.client_gps_lat
      when b.route_lat is not null and b.route_lng is not null then b.route_lat
      when b.client_lat is not null and b.client_lng is not null then b.client_lat
      else null
    end trusted_lat,
    case
      when b.visit_lat is not null and b.visit_lng is not null and b.visit_gps_status='confirmed'
       and (coalesce(b.route_lat,b.client_lat) is null or b.gps_verified_at is not null
            or public.gps_haversine_m(b.visit_lat,b.visit_lng,coalesce(b.route_lat,b.client_lat),coalesce(b.route_lng,b.client_lng))<=1000)
      then b.visit_lng
      when b.client_gps_lat is not null and b.client_gps_lng is not null and b.gps_verified_at is not null then b.client_gps_lng
      when b.client_gps_lat is not null and b.client_gps_lng is not null and b.gps_samples_cnt>=2
       and (coalesce(b.route_lat,b.client_lat) is null
            or public.gps_haversine_m(b.client_gps_lat,b.client_gps_lng,coalesce(b.route_lat,b.client_lat),coalesce(b.route_lng,b.client_lng))<=1000)
      then b.client_gps_lng
      when b.route_lat is not null and b.route_lng is not null then b.route_lng
      when b.client_lat is not null and b.client_lng is not null then b.client_lng
      else null
    end trusted_lng,
    case
      when b.visit_lat is not null and b.visit_lng is not null and b.visit_gps_status='confirmed'
       and (coalesce(b.route_lat,b.client_lat) is null or b.gps_verified_at is not null
            or public.gps_haversine_m(b.visit_lat,b.visit_lng,coalesce(b.route_lat,b.client_lat),coalesce(b.route_lng,b.client_lng))<=1000)
      then 'confirmed_visit'
      when b.client_gps_lat is not null and b.client_gps_lng is not null and b.gps_verified_at is not null then 'verified_client_gps'
      when b.client_gps_lat is not null and b.client_gps_lng is not null and b.gps_samples_cnt>=2
       and (coalesce(b.route_lat,b.client_lat) is null
            or public.gps_haversine_m(b.client_gps_lat,b.client_gps_lng,coalesce(b.route_lat,b.client_lat),coalesce(b.route_lng,b.client_lng))<=1000)
      then 'multi_sample_gps'
      when b.route_lat is not null and b.route_lng is not null then 'route_point'
      when b.client_lat is not null and b.client_lng is not null then 'address_point'
      else 'no_trusted_coordinates'
    end coordinate_source
  from base0 b
),
inside0 as (
  select b.route_plan_id,g.recorded_at,g.accuracy,
         public.gps_haversine_m(g.lat,g.lng,b.trusted_lat,b.trusted_lng) distance_m,
         lag(g.recorded_at) over(partition by b.route_plan_id order by g.recorded_at) prev_at
  from base b
  join public.gps_track_points g
    on g.workday_id=b.workday_id and coalesce(g.is_valid,true)=true and coalesce(g.accuracy,9999)<=250
  where b.trusted_lat is not null and b.trusted_lng is not null
    and public.gps_haversine_m(g.lat,g.lng,b.trusted_lat,b.trusted_lng)<=b.radius_m
),
inside1 as (
  select *,case when prev_at is null or recorded_at-prev_at>interval '12 minutes' then 1 else 0 end new_session from inside0
),
inside2 as (
  select *,sum(new_session) over(partition by route_plan_id order by recorded_at rows unbounded preceding) session_no from inside1
),
sessions as (
  select route_plan_id,session_no,min(recorded_at) start_at,max(recorded_at) end_at,
         count(*)::integer point_count,min(distance_m) min_distance_m,avg(accuracy) avg_accuracy,
         extract(epoch from(max(recorded_at)-min(recorded_at)))/60.0 minutes
  from inside2 group by route_plan_id,session_no
),
ranked as (
  select b.route_plan_id,s.start_at,s.end_at,s.point_count,s.min_distance_m,s.avg_accuracy,s.minutes,
         row_number() over(
           partition by b.route_plan_id
           order by
             case
               when b.visit_created_at is not null and b.visit_gps_status='confirmed'
                and b.visit_created_at between s.start_at-interval '30 minutes' and s.end_at+interval '30 minutes' then 0
               when b.visit_created_at is not null
                and b.visit_created_at between s.start_at-interval '30 minutes' and s.end_at+interval '30 minutes' then 1
               else 2 end,
             case when s.point_count>=2 and s.minutes>=2 then 0 else 1 end,
             s.minutes desc,s.point_count desc
         ) rn
  from base b join sessions s on s.route_plan_id=b.route_plan_id
),
chosen0 as (
  select * from ranked where rn=1 and point_count>=2 and minutes>=2
),
chosen as (
  select c.*
  from chosen0 c
  join base b on b.route_plan_id=c.route_plan_id
  where not (
    b.visit_gps_status<>'confirmed'
    and exists(
      select 1 from chosen0 c2 join base b2 on b2.route_plan_id=c2.route_plan_id
      where b2.route_plan_id<>b.route_plan_id and b2.visit_gps_status='confirmed'
        and b.trusted_lat is not null and b.trusted_lng is not null
        and b2.trusted_lat is not null and b2.trusted_lng is not null
        and public.gps_haversine_m(b.trusted_lat,b.trusted_lng,b2.trusted_lat,b2.trusted_lng)<=150
        and c2.start_at<=c.end_at+interval '2 minutes'
        and c2.end_at>=c.start_at-interval '2 minutes'
    )
  )
)
select b.workday_id,b.work_date,b.manager_name,b.route_plan_id,b.sort_order,b.client_id,b.client_name,b.city,b.address,
       b.planned_start,b.planned_end,b.planned_minutes,b.trusted_lat,b.trusted_lng,b.coordinate_source,b.coordinate_conflict,
       b.visit_id,b.visit_created_at,b.visit_gps_status,c.start_at,c.end_at,
       case when c.start_at is not null and c.end_at is not null then round((extract(epoch from(c.end_at-c.start_at))/60.0)::numeric,1) end,
       case when c.start_at is not null and b.planned_start is not null
         then round((extract(epoch from(c.start_at-((b.work_date+b.planned_start) at time zone 'Europe/Minsk')))/60.0)::numeric,0) end
from base b
left join chosen c on c.route_plan_id=b.route_plan_id
order by b.sort_order,b.client_name;
$function$;


drop trigger if exists trg_gps_guard_client_anchor_v236426 on public.clients;
create trigger trg_gps_guard_client_anchor_v236426
before update of gps_lat,gps_lng,gps_source,gps_samples_cnt,gps_radius,gps_verified_at
on public.clients
for each row execute function public.gps_guard_client_anchor_v236426();

revoke all on function public.gps_workday_visit_facts_v236421(uuid) from public,anon;
grant execute on function public.gps_workday_visit_facts_v236421(uuid) to authenticated;
revoke all on function public.gps_classify_workday_stops_v236421(uuid) from public,anon;
grant execute on function public.gps_classify_workday_stops_v236421(uuid) to authenticated;
revoke all on function public.gps_get_workday_aggregate_director_v236421(uuid) from public,anon;
grant execute on function public.gps_get_workday_aggregate_director_v236421(uuid) to authenticated;
revoke all on function public.gps_rebuild_workday_aggregate_v236421(uuid) from public,anon;
grant execute on function public.gps_rebuild_workday_aggregate_v236421(uuid) to authenticated;
revoke all on function public.gps_director_report_v236421(date,date,text) from public,anon;
grant execute on function public.gps_director_report_v236421(date,date,text) to authenticated;
revoke all on function public.gps_coordinate_conflict_count_v236426(date,date) from public,anon;
grant execute on function public.gps_coordinate_conflict_count_v236426(date,date) to authenticated;
revoke all on function public.gps_refresh_stop_classifications_v236417(date,date) from public,anon;
grant execute on function public.gps_refresh_stop_classifications_v236417(date,date) to authenticated;
revoke all on function public.gps_classify_workday_stops_v236417(uuid) from public,anon;
grant execute on function public.gps_classify_workday_stops_v236417(uuid) to authenticated;
