-- RESANTA CRM v23.6.435 · network TT GPS truth + unified map truth
-- Production applied 2026-10-21. Raw transfer/GPS history is preserved.

alter table public.route_network_points
  add column if not exists gps_lat double precision,
  add column if not exists gps_lng double precision,
  add column if not exists gps_samples_cnt integer not null default 0,
  add column if not exists gps_radius double precision,
  add column if not exists gps_verified_at timestamptz,
  add column if not exists gps_source text,
  add column if not exists gps_last_sample_at timestamptz;

create index if not exists route_plans_network_transfer_gps_v236435_idx
  on public.route_plans(network_point_id,visit_date)
  where is_network_point=true
    and network_transfer_lat is not null
    and network_transfer_lng is not null;

CREATE OR REPLACE FUNCTION public.crm_v236435_refresh_network_point_gps(p_network_point_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
declare
  v_seed_lat double precision;
  v_seed_lng double precision;
  v_med_lat double precision;
  v_med_lng double precision;
  v_days integer:=0;
  v_rows integer:=0;
  v_last timestamptz;
  v_verified boolean:=false;
begin
  if p_network_point_id is null then
    return jsonb_build_object('ok',false,'reason','missing_network_point_id');
  end if;

  with samples as (
    select r.visit_date::date d,
           r.network_transfer_lat lat,
           r.network_transfer_lng lng,
           r.network_transfer_accuracy accuracy,
           r.network_transfer_completed_at taken_at
    from public.route_plans r
    where r.network_point_id=p_network_point_id
      and coalesce(r.is_network_point,false)=true
      and r.network_transfer_lat between -90 and 90
      and r.network_transfer_lng between -180 and 180
      and coalesce(r.network_transfer_accuracy,9999)>0
      and coalesce(r.network_transfer_accuracy,9999)<=200
  ),
  seeds as (
    select a.lat,a.lng,
           count(*)::integer rows_n,
           count(distinct b.d)::integer days_n,
           avg(coalesce(b.accuracy,200)) avg_accuracy
    from samples a
    join samples b
      on public.gps_haversine_m(a.lat,a.lng,b.lat,b.lng)<=200
    group by a.lat,a.lng
  )
  select lat,lng
  into v_seed_lat,v_seed_lng
  from seeds
  order by days_n desc,rows_n desc,avg_accuracy asc
  limit 1;

  if v_seed_lat is null or v_seed_lng is null then
    update public.route_network_points
    set gps_samples_cnt=0,
        gps_verified_at=null,
        gps_source=null,
        gps_last_sample_at=null
    where id=p_network_point_id;
    return jsonb_build_object('ok',true,'network_point_id',p_network_point_id,'samples',0,'verified',false);
  end if;

  with samples as (
    select r.visit_date::date d,
           r.network_transfer_lat lat,
           r.network_transfer_lng lng,
           r.network_transfer_accuracy accuracy,
           r.network_transfer_completed_at taken_at
    from public.route_plans r
    where r.network_point_id=p_network_point_id
      and coalesce(r.is_network_point,false)=true
      and r.network_transfer_lat between -90 and 90
      and r.network_transfer_lng between -180 and 180
      and coalesce(r.network_transfer_accuracy,9999)>0
      and coalesce(r.network_transfer_accuracy,9999)<=200
  ),
  cluster0 as (
    select *
    from samples
    where public.gps_haversine_m(lat,lng,v_seed_lat,v_seed_lng)<=200
  )
  select percentile_cont(0.5) within group(order by lat),
         percentile_cont(0.5) within group(order by lng)
  into v_med_lat,v_med_lng
  from cluster0;

  with samples as (
    select r.visit_date::date d,
           r.network_transfer_lat lat,
           r.network_transfer_lng lng,
           r.network_transfer_accuracy accuracy,
           r.network_transfer_completed_at taken_at
    from public.route_plans r
    where r.network_point_id=p_network_point_id
      and coalesce(r.is_network_point,false)=true
      and r.network_transfer_lat between -90 and 90
      and r.network_transfer_lng between -180 and 180
      and coalesce(r.network_transfer_accuracy,9999)>0
      and coalesce(r.network_transfer_accuracy,9999)<=200
  ),
  cluster1 as (
    select *
    from samples
    where public.gps_haversine_m(lat,lng,v_med_lat,v_med_lng)<=200
  )
  select count(*)::integer,count(distinct d)::integer,max(taken_at)
  into v_rows,v_days,v_last
  from cluster1;

  v_verified:=coalesce(v_days,0)>=3;

  update public.route_network_points
  set gps_lat=v_med_lat,
      gps_lng=v_med_lng,
      gps_samples_cnt=coalesce(v_days,0),
      gps_radius=case when v_verified then 150 else 250 end,
      gps_verified_at=case
        when v_verified then coalesce(gps_verified_at,now())
        else null
      end,
      gps_source=case when v_verified then 'network_transfer_cluster_verified' else 'network_transfer_cluster_partial' end,
      gps_last_sample_at=v_last,
      updated_at=now()
  where id=p_network_point_id;

  -- Preserve historical rows, but fill previously missing route coordinates so
  -- director reports/navigation can use the physical network TT already observed.
  update public.route_plans r
  set route_lat=coalesce(r.route_lat,v_med_lat),
      route_lng=coalesce(r.route_lng,v_med_lng)
  where r.network_point_id=p_network_point_id
    and coalesce(r.is_network_point,false)=true
    and (r.route_lat is null or r.route_lng is null);

  return jsonb_build_object(
    'ok',true,
    'network_point_id',p_network_point_id,
    'lat',v_med_lat,'lng',v_med_lng,
    'samples',v_rows,'days',v_days,
    'verified',v_verified,
    'radius_m',case when v_verified then 150 else 250 end,
    'last_sample_at',v_last
  );
end;
$function$


revoke all on function public.crm_v236435_refresh_network_point_gps(uuid) from public,anon,authenticated;
grant execute on function public.crm_v236435_refresh_network_point_gps(uuid) to service_role;

CREATE OR REPLACE FUNCTION public.crm_v2271_complete_network_transfer(p_route_plan_id text, p_recipient text, p_comment text, p_lat double precision, p_lng double precision, p_accuracy double precision)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_catalog'
AS $function$
declare
  v_email text;
  v_actor_name text;
  v_actor_role text;
  v_row public.route_plans%rowtype;
  v_recipient text;
  v_comment text;
  v_today date;
  v_target_lat double precision;
  v_target_lng double precision;
  v_distance double precision;
  v_limit double precision;
  v_network record;
  v_refresh jsonb;
begin
  v_email:=lower(coalesce(auth.jwt()->>'email',''));
  if v_email='' then raise exception 'Не удалось определить пользователя. Перезайдите в CRM.'; end if;

  select u.name,u.role into v_actor_name,v_actor_role
  from public.users u
  where lower(coalesce(u.email,''))=v_email
  limit 1;

  if v_actor_name is null or public.crm_v2271_norm(v_actor_role)<>'manager' then
    raise exception 'Передачу может отмечать только менеджер.';
  end if;

  select * into v_row
  from public.route_plans r
  where r.id::text=p_route_plan_id
  for update;

  if not found then raise exception 'Строка маршрута не найдена.'; end if;
  if not coalesce(v_row.is_network_point,false) or v_row.network_point_id is null then
    raise exception 'Это не сетевая точка передачи.';
  end if;
  if public.crm_v2271_norm(v_row.manager_name)<>public.crm_v2271_norm(v_actor_name) then
    raise exception 'Сетевая точка закреплена за другим менеджером.';
  end if;

  v_today:=timezone('Europe/Minsk',now())::date;
  if left(v_row.visit_date::text,10)::date<>v_today then
    raise exception 'Передачу можно отметить только в дату маршрута.';
  end if;

  v_recipient:=trim(coalesce(p_recipient,''));
  v_comment:=trim(coalesce(p_comment,''));

  if char_length(v_recipient)<2 or char_length(v_recipient)>120 then
    raise exception 'Укажите, кому выполнена передача (2–120 символов).';
  end if;
  if char_length(v_comment)>1000 then
    raise exception 'Комментарий не должен превышать 1000 символов.';
  end if;
  if p_lat is null or p_lng is null or p_lat not between -90 and 90 or p_lng not between -180 and 180 then
    raise exception 'Получена некорректная GPS-координата.';
  end if;
  if p_accuracy is null or p_accuracy<=0 or p_accuracy>200 then
    raise exception 'Погрешность GPS должна быть не более 200 м.';
  end if;

  select n.* into v_network
  from public.route_network_points n
  where n.id=v_row.network_point_id;

  -- Only a verified transfer cluster or an explicit/geocoded legacy coordinate may
  -- reject a manager as "too far". One early partial GPS sample never becomes an accusation.
  if v_network.gps_verified_at is not null
     and v_network.gps_lat is not null and v_network.gps_lng is not null then
    v_target_lat:=v_network.gps_lat;
    v_target_lng:=v_network.gps_lng;
  elsif v_network.lat is not null and v_network.lng is not null then
    v_target_lat:=v_network.lat;
    v_target_lng:=v_network.lng;
  end if;

  if v_target_lat is not null and v_target_lng is not null then
    v_distance:=public.gps_haversine_m(p_lat,p_lng,v_target_lat,v_target_lng);
    v_limit:=greatest(300,p_accuracy+150);
    if v_distance>v_limit then
      raise exception 'Вы находитесь слишком далеко от сетевой точки: % м. Допустимо % м.',
        round(v_distance),round(v_limit);
    end if;
  end if;

  update public.route_plans r
  set visited=true,
      network_transfer_status='completed',
      network_transfer_recipient=v_recipient,
      network_transfer_comment=nullif(v_comment,''),
      network_transfer_completed_at=now(),
      network_transfer_completed_by=v_actor_name,
      network_transfer_lat=p_lat,
      network_transfer_lng=p_lng,
      network_transfer_accuracy=p_accuracy,
      network_transfer_distance_m=v_distance
  where r.id=v_row.id
  returning * into v_row;

  insert into public.crm_v2271_network_transfer_audit(
    actor_email,actor_name,route_plan_id,network_point_id,network_name,visit_date,
    recipient,comment,lat,lng,accuracy,distance_m
  )
  values(
    v_email,v_actor_name,v_row.id::text,v_row.network_point_id,v_row.network_name,
    left(v_row.visit_date::text,10)::date,v_recipient,nullif(v_comment,''),
    p_lat,p_lng,p_accuracy,v_distance
  );

  v_refresh:=public.crm_v236435_refresh_network_point_gps(v_row.network_point_id);

  select * into v_row
  from public.route_plans
  where id=v_row.id;

  return jsonb_build_object(
    'row',to_jsonb(v_row),
    'distance_m',v_distance,
    'network_gps',v_refresh
  );
end;
$function$


revoke all on function public.crm_v2271_complete_network_transfer(text,text,text,double precision,double precision,double precision) from public,anon;
grant execute on function public.crm_v2271_complete_network_transfer(text,text,text,double precision,double precision,double precision) to authenticated;

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
  select
    wd.id workday_id,wd.work_date,wd.manager_name,
    r.id route_plan_id,coalesce(r.sort_order,999999)::integer sort_order,
    r.client_id,r.client_name,coalesce(nullif(r.city,''),c.city) city,
    coalesce(nullif(r.address,''),c.address) address,
    r.planned_start,r.planned_end,r.planned_minutes,
    coalesce(r.is_network_point,false) is_network_point,
    r.network_point_id,
    r.route_lat,r.route_lng,
    c.lat client_lat,c.lng client_lng,
    c.gps_lat client_gps_lat,c.gps_lng client_gps_lng,
    coalesce(c.gps_samples_cnt,0) client_gps_samples_cnt,c.gps_verified_at client_gps_verified_at,
    n.gps_lat network_gps_lat,n.gps_lng network_gps_lng,
    coalesce(n.gps_samples_cnt,0) network_gps_samples_cnt,n.gps_verified_at network_gps_verified_at,
    r.network_transfer_lat,r.network_transfer_lng,r.network_transfer_accuracy,
    r.network_transfer_completed_at,
    greatest(
      100,
      least(
        350,
        case when coalesce(r.is_network_point,false)
          then coalesce(n.gps_radius,250)
          else coalesce(c.gps_radius,250)
        end
      )
    )::double precision radius_m,
    v.id visit_id,
    coalesce(
      v.created_at,
      case when coalesce(r.is_network_point,false)
             and r.network_transfer_status='completed'
           then r.network_transfer_completed_at end
    ) visit_created_at,
    case
      when v.id is not null then lower(coalesce(v.gps_status,''))
      when coalesce(r.is_network_point,false)
       and r.network_transfer_status='completed'
       and r.network_transfer_lat is not null
       and r.network_transfer_lng is not null then 'confirmed'
      else ''
    end visit_gps_status,
    coalesce(
      v.gps_lat,
      case when coalesce(r.is_network_point,false)
             and r.network_transfer_status='completed'
           then r.network_transfer_lat end
    ) visit_lat,
    coalesce(
      v.gps_lng,
      case when coalesce(r.is_network_point,false)
             and r.network_transfer_status='completed'
           then r.network_transfer_lng end
    ) visit_lng
  from wd
  join public.route_plans r
    on r.visit_date=wd.work_date
   and lower(trim(coalesce(r.manager_name,'')))=lower(trim(coalesce(wd.manager_name,'')))
   and coalesce(r.removed,false)=false
   and coalesce(r.review_status,'approved') not in ('pending','rejected')
  left join public.clients c on c.id=r.client_id
  left join public.route_network_points n on n.id=r.network_point_id
  left join lateral (
    select vv.*
    from public.visits vv
    where vv.route_plan_id=r.id::text
      and coalesce(vv.is_duplicate,false)=false
    order by case when lower(coalesce(vv.gps_status,''))='confirmed' then 0 else 1 end,
             vv.created_at desc
    limit 1
  ) v on true
),
base as (
  select b.*,
    case
      when b.is_network_point
       and b.network_gps_verified_at is not null
       and b.network_gps_lat is not null and b.network_gps_lng is not null
       and b.route_lat is not null and b.route_lng is not null
      then public.gps_haversine_m(b.network_gps_lat,b.network_gps_lng,b.route_lat,b.route_lng)>1000
      when not b.is_network_point
       and b.client_gps_lat is not null and b.client_gps_lng is not null
       and coalesce(b.route_lat,b.client_lat) is not null
       and coalesce(b.route_lng,b.client_lng) is not null
      then public.gps_haversine_m(
        b.client_gps_lat,b.client_gps_lng,
        coalesce(b.route_lat,b.client_lat),coalesce(b.route_lng,b.client_lng)
      )>1000
      else false
    end coordinate_conflict,

    case
      when b.visit_lat is not null and b.visit_lng is not null and b.visit_gps_status='confirmed'
       and (
         b.is_network_point
         or coalesce(b.route_lat,b.client_lat) is null
         or b.client_gps_verified_at is not null
         or public.gps_haversine_m(
              b.visit_lat,b.visit_lng,
              coalesce(b.route_lat,b.client_lat),coalesce(b.route_lng,b.client_lng)
            )<=1000
       )
      then b.visit_lat
      when b.is_network_point
       and b.network_gps_lat is not null and b.network_gps_lng is not null
       and b.network_gps_verified_at is not null
      then b.network_gps_lat
      when b.is_network_point
       and b.network_gps_lat is not null and b.network_gps_lng is not null
       and b.network_gps_samples_cnt>=2
      then b.network_gps_lat
      when not b.is_network_point
       and b.client_gps_lat is not null and b.client_gps_lng is not null
       and b.client_gps_verified_at is not null
      then b.client_gps_lat
      when not b.is_network_point
       and b.client_gps_lat is not null and b.client_gps_lng is not null
       and b.client_gps_samples_cnt>=2
       and (
         coalesce(b.route_lat,b.client_lat) is null
         or public.gps_haversine_m(
              b.client_gps_lat,b.client_gps_lng,
              coalesce(b.route_lat,b.client_lat),coalesce(b.route_lng,b.client_lng)
            )<=1000
       )
      then b.client_gps_lat
      when b.route_lat is not null and b.route_lng is not null then b.route_lat
      when b.client_lat is not null and b.client_lng is not null then b.client_lat
      else null
    end trusted_lat,

    case
      when b.visit_lat is not null and b.visit_lng is not null and b.visit_gps_status='confirmed'
       and (
         b.is_network_point
         or coalesce(b.route_lat,b.client_lat) is null
         or b.client_gps_verified_at is not null
         or public.gps_haversine_m(
              b.visit_lat,b.visit_lng,
              coalesce(b.route_lat,b.client_lat),coalesce(b.route_lng,b.client_lng)
            )<=1000
       )
      then b.visit_lng
      when b.is_network_point
       and b.network_gps_lat is not null and b.network_gps_lng is not null
       and b.network_gps_verified_at is not null
      then b.network_gps_lng
      when b.is_network_point
       and b.network_gps_lat is not null and b.network_gps_lng is not null
       and b.network_gps_samples_cnt>=2
      then b.network_gps_lng
      when not b.is_network_point
       and b.client_gps_lat is not null and b.client_gps_lng is not null
       and b.client_gps_verified_at is not null
      then b.client_gps_lng
      when not b.is_network_point
       and b.client_gps_lat is not null and b.client_gps_lng is not null
       and b.client_gps_samples_cnt>=2
       and (
         coalesce(b.route_lat,b.client_lat) is null
         or public.gps_haversine_m(
              b.client_gps_lat,b.client_gps_lng,
              coalesce(b.route_lat,b.client_lat),coalesce(b.route_lng,b.client_lng)
            )<=1000
       )
      then b.client_gps_lng
      when b.route_lat is not null and b.route_lng is not null then b.route_lng
      when b.client_lat is not null and b.client_lng is not null then b.client_lng
      else null
    end trusted_lng,

    case
      when b.is_network_point
       and b.visit_lat is not null and b.visit_lng is not null
       and b.visit_gps_status='confirmed'
      then 'network_transfer_gps'
      when b.visit_lat is not null and b.visit_lng is not null and b.visit_gps_status='confirmed'
      then 'confirmed_visit'
      when b.is_network_point
       and b.network_gps_lat is not null and b.network_gps_lng is not null
       and b.network_gps_verified_at is not null
      then 'verified_network_gps'
      when b.is_network_point
       and b.network_gps_lat is not null and b.network_gps_lng is not null
       and b.network_gps_samples_cnt>=2
      then 'multi_sample_network_gps'
      when not b.is_network_point
       and b.client_gps_lat is not null and b.client_gps_lng is not null
       and b.client_gps_verified_at is not null
      then 'verified_client_gps'
      when not b.is_network_point
       and b.client_gps_lat is not null and b.client_gps_lng is not null
       and b.client_gps_samples_cnt>=2
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
    on g.workday_id=b.workday_id
   and coalesce(g.is_mock,false)=false
   and coalesce(g.accuracy,9999)<=250
   and coalesce(g.validation_reason,'') not in (
     'invalid_coordinates','poor_accuracy','gps_jump','impossible_speed',
     'invalid_time','non_monotonic_time','mock_location'
   )
  where b.trusted_lat is not null and b.trusted_lng is not null
    and public.gps_haversine_m(g.lat,g.lng,b.trusted_lat,b.trusted_lng)<=b.radius_m
),
inside1 as (
  select *,
    case when prev_at is null or recorded_at-prev_at>interval '12 minutes' then 1 else 0 end new_session
  from inside0
),
inside2 as (
  select *,
         sum(new_session) over(
           partition by route_plan_id
           order by recorded_at
           rows unbounded preceding
         ) session_no
  from inside1
),
sessions as (
  select route_plan_id,session_no,
         min(recorded_at) start_at,max(recorded_at) end_at,
         count(*)::integer point_count,
         min(distance_m) min_distance_m,
         avg(accuracy) avg_accuracy,
         extract(epoch from(max(recorded_at)-min(recorded_at)))/60.0 minutes
  from inside2
  group by route_plan_id,session_no
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
               else 2
             end,
             case when s.point_count>=2 and s.minutes>=2 then 0 else 1 end,
             s.minutes desc,s.point_count desc
         ) rn
  from base b
  join sessions s on s.route_plan_id=b.route_plan_id
),
chosen0 as (
  select *
  from ranked
  where rn=1 and point_count>=2 and minutes>=2
),
chosen as (
  select c.*
  from chosen0 c
  join base b on b.route_plan_id=c.route_plan_id
  where not (
    b.visit_gps_status<>'confirmed'
    and exists(
      select 1
      from chosen0 c2
      join base b2 on b2.route_plan_id=c2.route_plan_id
      where b2.route_plan_id<>b.route_plan_id
        and b2.visit_gps_status='confirmed'
        and b.trusted_lat is not null and b.trusted_lng is not null
        and b2.trusted_lat is not null and b2.trusted_lng is not null
        and public.gps_haversine_m(b.trusted_lat,b.trusted_lng,b2.trusted_lat,b2.trusted_lng)<=150
        and c2.start_at<=c.end_at+interval '2 minutes'
        and c2.end_at>=c.start_at-interval '2 minutes'
    )
  )
)
select
  b.workday_id,b.work_date,b.manager_name,b.route_plan_id,b.sort_order,
  b.client_id,b.client_name,b.city,b.address,
  b.planned_start,b.planned_end,b.planned_minutes,
  b.trusted_lat,b.trusted_lng,b.coordinate_source,b.coordinate_conflict,
  b.visit_id,b.visit_created_at,b.visit_gps_status,
  c.start_at,c.end_at,
  case when c.start_at is not null and c.end_at is not null
    then round((extract(epoch from(c.end_at-c.start_at))/60.0)::numeric,1)
  end,
  case when c.start_at is not null and b.planned_start is not null
    then round((
      extract(epoch from(
        c.start_at-((b.work_date+b.planned_start) at time zone 'Europe/Minsk')
      ))/60.0
    )::numeric,0)
  end
from base b
left join chosen c on c.route_plan_id=b.route_plan_id
order by b.sort_order,b.client_name;
$function$


revoke all on function public.gps_workday_visit_facts_v236421(uuid) from public,anon;
grant execute on function public.gps_workday_visit_facts_v236421(uuid) to authenticated,service_role;

CREATE OR REPLACE FUNCTION public.gps_map_truth_v236435(p_workday_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_catalog'
AS $function$
declare
  v_workday public.gps_workdays%rowtype;
  v_stops jsonb;
  v_facts jsonb;
  v_current jsonb;
begin
  if not public.gps_has_control_access() then
    raise exception 'Нет доступа к GPS-контролю' using errcode='42501';
  end if;

  select * into v_workday from public.gps_workdays where id=p_workday_id;
  if v_workday.id is null then raise exception 'Рабочий день не найден'; end if;

  v_stops:=public.gps_classify_workday_stops_v236421(p_workday_id);

  select coalesce(jsonb_agg(to_jsonb(f) order by f.sort_order,f.client_name),'[]'::jsonb)
  into v_facts
  from public.gps_workday_visit_facts_v236421(p_workday_id) f;

  with good as (
    select p.*
    from public.gps_track_points p
    where p.workday_id=p_workday_id
      and coalesce(p.is_mock,false)=false
      and p.lat between -90 and 90 and p.lng between -180 and 180
      and coalesce(p.accuracy,9999)<=200
      and coalesce(p.validation_reason,'') not in (
        'invalid_coordinates','invalid_time','non_monotonic_time','mock_location',
        'gps_jump','impossible_speed','poor_accuracy'
      )
  ),
  mx as (
    select max(recorded_at) latest_any,
           max(recorded_at) filter(where lower(coalesce(provider,''))='gps') latest_gps
    from good
  ),
  chosen as (
    select g.recorded_at,g.lat,g.lng,g.accuracy,g.provider,g.validation_reason
    from good g cross join mx
    where (
      mx.latest_gps is not null
      and mx.latest_any-mx.latest_gps<=interval '2 minutes'
      and lower(coalesce(g.provider,''))='gps'
    ) or (
      (mx.latest_gps is null or mx.latest_any-mx.latest_gps>interval '2 minutes')
    )
    order by g.recorded_at desc,g.id desc
    limit 1
  )
  select to_jsonb(chosen) into v_current from chosen;

  return jsonb_build_object(
    'ok',true,'version','v23.6.435.2','workday_id',p_workday_id,
    'classified_stops',coalesce(v_stops,'[]'::jsonb),
    'visit_facts',coalesce(v_facts,'[]'::jsonb),
    'current_position',v_current
  );
end;
$function$


revoke all on function public.gps_map_truth_v236435(uuid) from public,anon;
grant execute on function public.gps_map_truth_v236435(uuid) to authenticated,service_role;

do $block$
declare r record;
begin
  for r in select id from public.route_network_points where active=true
  loop
    perform public.crm_v236435_refresh_network_point_gps(r.id);
  end loop;
end
$block$;

notify pgrst,'reload schema';
