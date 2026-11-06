-- GPS360 06.11.2026: restore previously verified exact-physical-store anchors.
-- Does not backfill or update GPS tracks, visits, client/route coordinates or sales.
-- Preserves independent native GPS session (2 points, >=2 min) as visit evidence.
-- This function definition was derived from current production and changes only
-- trusted coordinate selection for an exact one-to-one client/store link.

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
    r.route_lat,r.route_lng,r.physical_point_id,
    case when r.physical_point_id is not null
      then (select pp.lat from public.route_physical_points pp where pp.id=r.physical_point_id)
      else r.route_lat end as physical_lat,
    case when r.physical_point_id is not null
      then (select pp.lng from public.route_physical_points pp where pp.id=r.physical_point_id)
      else r.route_lng end as physical_lng,
    c.lat client_lat,c.lng client_lng,
    c.gps_lat client_gps_lat,c.gps_lng client_gps_lng,
    coalesce(c.gps_samples_cnt,0) client_gps_samples_cnt,c.gps_verified_at client_gps_verified_at,
    -- Only a verified, mutually unique client/store link can reuse October GPS.
    -- Never transfer a legal entity's GPS to a second shop or market pavilion.
    (
      r.physical_point_id is not null and c.id is not null
      and c.gps_verified_at is not null
      and c.gps_lat is not null and c.gps_lng is not null
      and exists (
        select 1
        from public.route_physical_point_clients pc
        join public.route_physical_points pp on pp.id=pc.point_id
        where pc.client_id=c.id and pc.point_id=r.physical_point_id
          and nullif(btrim(coalesce(c.city,'')),'') is not null
          and nullif(btrim(coalesce(c.address,'')),'') is not null
          and lower(btrim(c.city))=lower(btrim(pp.city))
          and lower(btrim(c.address))=lower(btrim(pp.address))
          and not exists (
            select 1 from public.route_physical_point_clients other_pc
            where other_pc.client_id=c.id and other_pc.point_id<>r.physical_point_id
          )
          and not exists (
            select 1 from public.route_physical_point_clients other_client
            where other_client.point_id=r.physical_point_id and other_client.client_id<>c.id
          )
          and (
            (pp.lat is null and pp.lng is null)
            or (pp.lat is not null and pp.lng is not null
             and public.gps_haversine_m(pp.lat,pp.lng,c.gps_lat,c.gps_lng)<=35)
          )
      )
    ) as verified_exact_store_link,
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
      when not b.is_network_point and b.verified_exact_store_link then false
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
      -- Client360: explicit selected store overrides conflicting parent-company GPS.
      -- If this physical point lacks coordinates, never borrow a different store's geo.
      when not b.is_network_point and b.physical_point_id is not null
      then case when b.verified_exact_store_link then b.client_gps_lat else b.physical_lat end
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
      -- Client360: explicit selected store overrides conflicting parent-company GPS.
      -- If this physical point lacks coordinates, never borrow a different store's geo.
      when not b.is_network_point and b.physical_point_id is not null
      then case when b.verified_exact_store_link then b.client_gps_lng else b.physical_lng end
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
      when not b.is_network_point and b.physical_point_id is not null
      then case when b.verified_exact_store_link or (b.physical_lat is not null and b.physical_lng is not null)
        then 'selected_physical_store' else 'selected_store_without_coordinates' end
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

