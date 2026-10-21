-- RESANTA CRM · GPS integrity v23.6.429
-- Applied to production: 2026-10-21.
-- Backward compatible: existing APKs keep calling gps_ingest_my_track_point
-- with the old argument set; new APKs add Android mock + elapsed realtime evidence.

alter table public.gps_track_points
  add column if not exists is_mock boolean not null default false,
  add column if not exists elapsed_realtime_nanos bigint;

create index if not exists gps_track_points_mock_workday_idx
  on public.gps_track_points(workday_id, recorded_at)
  where is_mock = true;

create or replace function public.gps_validate_track_point()
returns trigger
language plpgsql
security definer
set search_path to 'public','auth','pg_catalog'
as $function$
declare
  v_owner uuid;
  v_started timestamptz;
  v_prev public.gps_track_points%rowtype;
  v_distance double precision;
  v_seconds double precision;
  v_limit double precision;
  v_mock_setting text;
  v_elapsed_setting text;
begin
  v_mock_setting := current_setting('app.gps_mock_location', true);
  v_elapsed_setting := current_setting('app.gps_elapsed_realtime_nanos', true);

  if coalesce(v_mock_setting,'') = '1' then new.is_mock := true; end if;
  if new.elapsed_realtime_nanos is null and coalesce(v_elapsed_setting,'') ~ '^[0-9]+$' then
    new.elapsed_realtime_nanos := v_elapsed_setting::bigint;
  end if;

  select w.user_id,w.started_at into v_owner,v_started
  from public.gps_workdays w where w.id=new.workday_id;

  if v_owner is null then raise exception 'Рабочий день не найден'; end if;
  if new.user_id<>v_owner then raise exception 'Пользователь точки не совпадает с рабочим днём'; end if;

  if new.lat not between -90 and 90 or new.lng not between -180 and 180 then
    new.is_valid:=false;new.validation_reason:='invalid_coordinates';new.segment_m:=0;return new;
  end if;

  if coalesce(new.is_mock,false) then
    new.is_valid:=false;new.validation_reason:='mock_location';new.segment_m:=0;return new;
  end if;

  if new.recorded_at<v_started-interval '5 minutes' or new.recorded_at>now()+interval '5 minutes' then
    new.is_valid:=false;new.validation_reason:='invalid_time';new.segment_m:=0;return new;
  end if;
  if new.accuracy is null or new.accuracy>200 then
    new.is_valid:=false;new.validation_reason:='poor_accuracy';new.segment_m:=0;return new;
  end if;
  if new.speed is not null and new.speed>60 then
    new.is_valid:=false;new.validation_reason:='impossible_speed';new.segment_m:=0;return new;
  end if;

  select * into v_prev from public.gps_track_points p
  where p.workday_id=new.workday_id and p.is_valid and p.recorded_at<new.recorded_at
  order by p.recorded_at desc limit 1;

  if v_prev.id is null then
    new.is_valid:=true;new.validation_reason:=null;new.segment_m:=0;return new;
  end if;

  v_seconds:=extract(epoch from(new.recorded_at-v_prev.recorded_at));
  if v_seconds<=0 then
    new.is_valid:=false;new.validation_reason:='non_monotonic_time';new.segment_m:=0;return new;
  end if;

  v_distance:=public.gps_haversine_m(v_prev.lat,v_prev.lng,new.lat,new.lng);
  if v_distance<15 then
    new.is_valid:=false;new.validation_reason:='stationary';new.segment_m:=0;return new;
  end if;

  v_limit:=greatest(250,v_seconds*60+coalesce(new.accuracy,0)+coalesce(v_prev.accuracy,0));
  if v_distance>v_limit then
    new.is_valid:=false;new.validation_reason:='gps_jump';new.segment_m:=0;return new;
  end if;

  new.is_valid:=true;new.validation_reason:=null;new.segment_m:=round(v_distance::numeric,1);
  return new;
end;
$function$;

create or replace function public.gps_apply_track_point()
returns trigger
language plpgsql
security definer
set search_path to 'public','pg_catalog'
as $function$
begin
  update public.gps_workdays w
  set raw_points=coalesce(w.raw_points,0)+1,
      valid_points=coalesce(w.valid_points,0)+case when new.is_valid then 1 else 0 end,
      total_distance_m=coalesce(w.total_distance_m,0)+case when new.is_valid then coalesce(new.segment_m,0) else 0 end,
      last_lat=case when not coalesce(new.is_mock,false) and new.accuracy is not null and new.accuracy<=200 then new.lat else w.last_lat end,
      last_lng=case when not coalesce(new.is_mock,false) and new.accuracy is not null and new.accuracy<=200 then new.lng else w.last_lng end,
      last_accuracy=case when not coalesce(new.is_mock,false) and new.accuracy is not null and new.accuracy<=200 then new.accuracy else w.last_accuracy end,
      last_point_at=greatest(coalesce(w.last_point_at,new.recorded_at),new.recorded_at),
      last_sync_at=now(),
      native_tracking=case when w.status='active' then true else w.native_tracking end,
      native_last_error=null,
      updated_at=now()
  where w.id=new.workday_id;
  return new;
end;
$function$;

alter function public.gps_ingest_my_track_point(
  text,text,text,double precision,double precision,double precision,
  double precision,double precision,double precision,text
) rename to gps_ingest_my_track_point_legacy_v236429;

revoke all on function public.gps_ingest_my_track_point_legacy_v236429(
  text,text,text,double precision,double precision,double precision,
  double precision,double precision,double precision,text
) from public,anon,authenticated;
grant execute on function public.gps_ingest_my_track_point_legacy_v236429(
  text,text,text,double precision,double precision,double precision,
  double precision,double precision,double precision,text
) to service_role;

create function public.gps_ingest_my_track_point(
  p_point_uuid text,
  p_workday_id text,
  p_recorded_at text,
  p_lat double precision,
  p_lng double precision,
  p_accuracy double precision default null,
  p_speed double precision default null,
  p_bearing double precision default null,
  p_altitude double precision default null,
  p_provider text default 'android',
  p_mock_location boolean default false,
  p_elapsed_realtime_nanos bigint default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public','auth','pg_catalog'
as $function$
declare v_result jsonb;
begin
  if auth.uid() is null then
    raise exception 'Требуется активная авторизация CRM' using errcode='28000';
  end if;
  perform set_config('app.gps_mock_location',case when coalesce(p_mock_location,false) then '1' else '0' end,true);
  perform set_config('app.gps_elapsed_realtime_nanos',coalesce(p_elapsed_realtime_nanos::text,''),true);
  v_result:=public.gps_ingest_my_track_point_legacy_v236429(
    p_point_uuid,p_workday_id,p_recorded_at,p_lat,p_lng,
    p_accuracy,p_speed,p_bearing,p_altitude,p_provider
  );
  return v_result;
end;
$function$;

revoke all on function public.gps_ingest_my_track_point(
  text,text,text,double precision,double precision,double precision,
  double precision,double precision,double precision,text,boolean,bigint
) from public,anon;
grant execute on function public.gps_ingest_my_track_point(
  text,text,text,double precision,double precision,double precision,
  double precision,double precision,double precision,text,boolean,bigint
) to authenticated,service_role;

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
    select a.*,
      case
        when a.mock_points>0 then 'low'
        when a.observed_points=0
          or (a.gps_jump_points+a.impossible_speed_points+a.non_monotonic_points)>=2
          or a.gap_over_10m>=3 then 'medium'
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
      'gap_over_10m',gap_over_10m,'trust_level',trust_level,'direct_mock_detected',(mock_points>0)
    ) order by work_date desc,manager_name),'[]'::jsonb) rows
    from scored
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
    'ok',true,'version','v23.6.429','from',p_from,'to',p_to,
    'manager',coalesce(nullif(p_manager,''),'all'),
    'summary',summary.value,'rows',rows_json.rows,'generated_at',now()
  ) into v_result from rows_json cross join summary;

  return coalesce(v_result,jsonb_build_object(
    'ok',true,'version','v23.6.429','from',p_from,'to',p_to,
    'manager',coalesce(nullif(p_manager,''),'all'),
    'summary',jsonb_build_object('workdays',0,'high',0,'medium',0,'low',0,'mock_workdays',0,'mock_points',0),
    'rows','[]'::jsonb,'generated_at',now()
  ));
end;
$function$;

revoke all on function public.gps_integrity_director_v236429(date,date,text) from public,anon;
grant execute on function public.gps_integrity_director_v236429(date,date,text) to authenticated,service_role;

comment on column public.gps_track_points.is_mock is
  'Android OS mock-location flag. Director audit only; mock points are retained but never trusted for route/distance/visit truth.';
comment on function public.gps_integrity_director_v236429(date,date,text) is
  'Director-only GPS integrity summary v23.6.429. Low trust requires direct Android mock signal; medium is anomaly review, not proof of spoofing.';

notify pgrst,'reload schema';
