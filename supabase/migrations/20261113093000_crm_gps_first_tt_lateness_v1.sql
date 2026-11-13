-- GPS punctuality evidence: owner-only, read-only, first APPROVED route point.
-- Explicit proof categories; stale or missing GPS never counted as a late arrival.
-- No GPS tracks, visit reports or historic routes are modified.
create or replace function public.crm_gps_first_tt_lateness_v1(
  p_from date default date '2026-09-01',
  p_to date default date '2026-11-13'
)
returns table(
  manager_name text,
  work_date date,
  route_plan_id uuid,
  first_tt_name text,
  planned_time time without time zone,
  actual_arrival timestamptz,
  late_minutes numeric,
  proof_status text,
  proof_reason text,
  distance_m numeric,
  aggregation_status text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is distinct from '544fb1e2-ef70-44de-bc62-e0e1596a4bfc'::uuid or
     not exists (
       select 1 from public.users u
       where u.id = auth.uid() and u.role='boss'
         and lower(u.email)='payushin_ar@resanta.ru'
     )
  then
    raise exception 'not_authorized' using errcode='42501';
  end if;
  if p_from is null or p_to is null or p_from>p_to or
     p_from<date '2026-09-01' or
     p_to>(now() at time zone 'Europe/Minsk')::date or
     p_to-p_from>94
  then
    raise exception 'invalid_period' using errcode='22023';
  end if;

  return query
  with first_route as (
    select distinct on (lower(trim(r.manager_name)),r.visit_date)
      r.manager_name, r.visit_date, r.id, r.client_name, r.planned_start
    from public.route_plans r
    where r.visit_date between p_from and p_to
      and r.approved is true
      and r.review_status = 'approved'
      and r.removed is distinct from true
      and r.is_office_day is distinct from true
      and r.manager_name is not null
    order by lower(trim(r.manager_name)),r.visit_date,
      r.sort_order nulls last,r.planned_start nulls last,r.id
  ),
  matched as (
    select r.*,
      g.aggregation_status as gps_aggregation_status,
      g.workday_status as gps_workday_status,
      point.item as point,
      ((r.visit_date + r.planned_start) at time zone 'Europe/Minsk') as expected_arrival
    from first_route r
    left join public.gps_workday_aggregates g
      on g.work_date=r.visit_date
      and lower(trim(g.manager_name))=lower(trim(r.manager_name))
    left join lateral (
      select x.item
      from jsonb_array_elements(
        case when jsonb_typeof(g.planned_points)='array'
          then g.planned_points else '[]'::jsonb end
      ) as x(item)
      where x.item->>'route_plan_id'=r.id::text
        and x.item->>'state'='confirmed'
      order by x.item->>'stop_start_at' nulls last
      limit 1
    ) as point on true
  ),
  assessed as (
    select m.*,
      case when m.point->>'stop_start_at' ~ '^20[0-9]{2}-[0-9]{2}-[0-9]{2}T'
        then (m.point->>'stop_start_at')::timestamptz
        else null end as raw_arrival,
      case when jsonb_typeof(m.point->'distance_m')='number'
        then (m.point->>'distance_m')::numeric else null end as gps_distance_m,
      case when jsonb_typeof(m.point->'stop_minutes')='number'
        then (m.point->>'stop_minutes')::numeric else null end as stop_minutes
    from matched m
  ),
  qualified as (
    select a.*,
      (a.planned_start is not null
       and a.gps_workday_status='completed'
       and a.gps_aggregation_status='ready'
       and a.point->>'state'='confirmed'
       and a.point->>'report_gps_status'='confirmed'
       and a.gps_distance_m between 0 and 35
       and a.stop_minutes>=2
       and a.raw_arrival is not null
       and (a.raw_arrival at time zone 'Europe/Minsk')::date=a.visit_date
      ) as has_strict_proof
    from assessed a
  )
  select q.manager_name::text,
    q.visit_date,
    q.id::uuid,
    q.client_name::text,
    q.planned_start,
    case when q.has_strict_proof then q.raw_arrival else null end,
    case when q.has_strict_proof
      then greatest(0,ceil(extract(epoch from (q.raw_arrival-q.expected_arrival))/60.0))::numeric
      else null end,
    case when q.has_strict_proof and q.raw_arrival>q.expected_arrival then 'gps_confirmed_late'
         when q.has_strict_proof then 'gps_confirmed_on_time'
         else 'needs_review' end::text,
    case when q.planned_start is null then 'no_approved_time'
         when q.gps_workday_status is distinct from 'completed' then 'unfinished_or_missing_day'
         when q.gps_aggregation_status is distinct from 'ready' then 'stale_or_missing_gps_aggregate'
         when q.point is null then 'no_matched_physical_tt'
         when q.point->>'report_gps_status' is distinct from 'confirmed' then 'visit_gps_unverified'
         when q.gps_distance_m is null or q.gps_distance_m>35 then 'gps_distance_unverified'
         when q.stop_minutes is null or q.stop_minutes<2 then 'short_stop'
         when q.raw_arrival is null or
              (q.raw_arrival at time zone 'Europe/Minsk')::date is distinct from q.visit_date
           then 'arrival_time_unverified'
         else 'confirmed_gps_evidence' end::text,
    q.gps_distance_m,
    q.gps_aggregation_status::text
  from qualified q
  order by q.visit_date desc,q.manager_name;
end;
$$;

revoke all on function public.crm_gps_first_tt_lateness_v1(date,date) from public, anon;
grant execute on function public.crm_gps_first_tt_lateness_v1(date,date) to authenticated;

comment on function public.crm_gps_first_tt_lateness_v1(date,date) is
'Personal director pilot: strict read-only evidence of first approved TT arrival. Stale, absent, disputed GPS never count as lateness. No sanction or work-time conclusion.';
