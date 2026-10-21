-- GPS integrity v23.6.429.1
-- Tune anomaly review thresholds against real production GPS noise.
-- Direct Android mock remains the only automatic low-trust signal.

create or replace function public.gps_integrity_director_v236429(
  p_from date default current_date,
  p_to date default current_date,
  p_manager text default 'all'
)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public','auth','pg_catalog'
as $function$
declare v_result jsonb;
begin
  if not public.gps_has_control_access() then
    raise exception 'Нет доступа к GPS-контролю' using errcode='42501';
  end if;
  if p_from is null or p_to is null or p_from>p_to then raise exception 'Некорректный период'; end if;
  if p_to-p_from>93 then raise exception 'Период контроля GPS не может превышать 93 дня'; end if;

  with days as (
    select w.id,w.work_date,w.manager_name,w.status,w.started_at,w.ended_at,
           w.raw_points,w.valid_points,w.last_point_at,w.total_distance_m
    from public.gps_workdays w
    where w.work_date between p_from and p_to
      and (coalesce(nullif(p_manager,''),'all')='all' or w.manager_name=p_manager)
  ),
  seq as (
    select p.id,p.workday_id,p.recorded_at,p.is_mock,p.is_valid,p.validation_reason,
           lag(p.recorded_at) over(partition by p.workday_id order by p.recorded_at,p.id) prev_at
    from public.gps_track_points p join days d on d.id=p.workday_id
  ),
  agg as (
    select d.id workday_id,d.work_date,d.manager_name,d.status,d.started_at,d.ended_at,
           d.raw_points,d.valid_points,d.last_point_at,d.total_distance_m,
           count(s.id)::integer observed_points,
           count(s.id) filter(where coalesce(s.is_mock,false))::integer mock_points,
           min(s.recorded_at) filter(where coalesce(s.is_mock,false)) first_mock_at,
           max(s.recorded_at) filter(where coalesce(s.is_mock,false)) last_mock_at,
           count(s.id) filter(where s.validation_reason='gps_jump')::integer gps_jump_points,
           count(s.id) filter(where s.validation_reason='impossible_speed')::integer impossible_speed_points,
           count(s.id) filter(where s.validation_reason='non_monotonic_time')::integer non_monotonic_points,
           count(s.id) filter(where s.validation_reason='poor_accuracy')::integer poor_accuracy_points,
           count(s.id) filter(where s.prev_at is not null and s.recorded_at-s.prev_at>interval '10 minutes')::integer gap_over_10m
    from days d left join seq s on s.workday_id=d.id
    group by d.id,d.work_date,d.manager_name,d.status,d.started_at,d.ended_at,
             d.raw_points,d.valid_points,d.last_point_at,d.total_distance_m
  ),
  scored as (
    select a.*,(a.gps_jump_points+a.impossible_speed_points+a.non_monotonic_points) anomaly_points,
      case
        when a.mock_points>0 then 'low'
        when a.observed_points=0 then 'medium'
        when a.impossible_speed_points>=2 or a.non_monotonic_points>=3 then 'medium'
        when (a.gps_jump_points+a.impossible_speed_points+a.non_monotonic_points)>=8
          and ((a.gps_jump_points+a.impossible_speed_points+a.non_monotonic_points)::numeric
               / greatest(a.observed_points,1))>=0.05 then 'medium'
        when a.gap_over_10m>=4 then 'medium'
        else 'high'
      end trust_level
    from agg a
  ),
  rows_json as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'workday_id',workday_id,'date',work_date,'manager_name',manager_name,'status',status,
      'started_at',started_at,'ended_at',ended_at,'raw_points',raw_points,'valid_points',valid_points,
      'observed_points',observed_points,'mock_points',mock_points,'first_mock_at',first_mock_at,'last_mock_at',last_mock_at,
      'gps_jump_points',gps_jump_points,'impossible_speed_points',impossible_speed_points,
      'non_monotonic_points',non_monotonic_points,'poor_accuracy_points',poor_accuracy_points,
      'gap_over_10m',gap_over_10m,'anomaly_points',anomaly_points,
      'trust_level',trust_level,'direct_mock_detected',(mock_points>0)
    ) order by work_date desc,manager_name),'[]'::jsonb) rows from scored
  ),
  summary as (
    select jsonb_build_object(
      'workdays',count(*)::integer,
      'high',count(*) filter(where trust_level='high')::integer,
      'medium',count(*) filter(where trust_level='medium')::integer,
      'low',count(*) filter(where trust_level='low')::integer,
      'mock_workdays',count(*) filter(where mock_points>0)::integer,
      'mock_points',coalesce(sum(mock_points),0)::integer
    ) value from scored
  )
  select jsonb_build_object(
    'ok',true,'version','v23.6.429.1','from',p_from,'to',p_to,
    'manager',coalesce(nullif(p_manager,''),'all'),
    'summary',summary.value,'rows',rows_json.rows,'generated_at',now()
  ) into v_result from rows_json cross join summary;

  return coalesce(v_result,jsonb_build_object(
    'ok',true,'version','v23.6.429.1','from',p_from,'to',p_to,
    'manager',coalesce(nullif(p_manager,''),'all'),
    'summary',jsonb_build_object('workdays',0,'high',0,'medium',0,'low',0,'mock_workdays',0,'mock_points',0),
    'rows','[]'::jsonb,'generated_at',now()
  ));
end;
$function$;

revoke all on function public.gps_integrity_director_v236429(date,date,text) from public,anon;
grant execute on function public.gps_integrity_director_v236429(date,date,text) to authenticated,service_role;
