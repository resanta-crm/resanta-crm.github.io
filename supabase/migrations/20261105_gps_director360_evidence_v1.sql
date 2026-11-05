-- GPS Director 360 v1, NEW read-only RPC. The legacy report and raw GPS remain untouched.
-- Only director access. Historic visited flags and old saved auto-"technical" records do not imply GPS proof.
CREATE OR REPLACE FUNCTION public.gps_director360_evidence_v20261105(
 p_from date,
 p_to date,
 p_manager text DEFAULT 'all'
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public','auth','pg_catalog'
AS $function$
DECLARE
 v_result jsonb;
 v_manager text:=coalesce(nullif(trim(p_manager),''),'all');
BEGIN
 IF auth.uid() IS NULL OR NOT public.gps_has_control_access() THEN
  RAISE EXCEPTION 'Нет доступа к директорскому GPS-обзору' USING ERRCODE='42501';
 END IF;
 IF p_from IS NULL OR p_to IS NULL OR p_from>p_to OR p_to>current_date
   OR p_to-p_from>41 OR p_from<date '2024-01-01' THEN
  RAISE EXCEPTION 'Период GPS: максимум 42 дня, не позднее сегодняшней даты'
   USING ERRCODE='22007';
 END IF;
 IF v_manager<>'all' AND lower(v_manager) NOT IN
   ('ачинович','руднев','шкуран') THEN
  RAISE EXCEPTION 'Недопустимый менеджер GPS' USING ERRCODE='22023';
 END IF;
 WITH
 days AS MATERIALIZED (
  SELECT DISTINCT ON (w.work_date,lower(trim(w.manager_name)))
   w.id,w.work_date,w.manager_name,w.status workday_status,
   w.last_point_at,w.last_sync_at,a.aggregation_status,a.generated_at,
   a.source_updated_at,a.stop_count,a.planned_count,a.visited_count,a.valid_points
  FROM public.gps_workdays w
  LEFT JOIN public.gps_workday_aggregates a ON a.workday_id=w.id
  WHERE w.work_date BETWEEN (p_to-41) AND p_to
   AND (v_manager='all' OR lower(trim(w.manager_name))=lower(v_manager))
   AND lower(trim(w.manager_name)) IN ('ачинович','руднев','шкуран')
  ORDER BY w.work_date,lower(trim(w.manager_name)),
   w.started_at DESC NULLS LAST,w.id
 ),
 facts AS MATERIALIZED (
  SELECT d.id workday_id,d.work_date,d.manager_name,d.workday_status,
    d.aggregation_status,d.generated_at,d.source_updated_at,
    f.route_plan_id,f.client_name,f.city,f.address,
    (f.visit_id IS NOT NULL) report_exists,
    (f.actual_arrival_at IS NOT NULL AND f.actual_departure_at IS NOT NULL
      AND coalesce(f.actual_minutes,0)>=2) gps_session,
    (f.trusted_lat IS NULL OR f.trusted_lng IS NULL) coordinates_missing,
    coalesce(f.coordinate_conflict,false) coordinate_conflict,
    f.coordinate_source,f.actual_minutes,
    f.actual_arrival_at,f.actual_departure_at
  FROM days d
  CROSS JOIN LATERAL public.gps_workday_visit_facts_v236421(d.id) f
 ),
 selected AS MATERIALIZED (
  SELECT f.*,
   (f.coordinates_missing OR f.coordinate_conflict) coordinates_issue,
   (f.report_exists AND NOT f.gps_session) report_without_gps,
   (f.gps_session AND NOT f.report_exists) gps_without_report,
   (NOT f.report_exists AND NOT f.gps_session) no_evidence
  FROM facts f WHERE f.work_date BETWEEN p_from AND p_to
 ),
 live_stops AS MATERIALIZED (
  SELECT d.id workday_id,d.work_date,d.manager_name,
    (s->>'seq')::integer stop_seq,
    coalesce(nullif(s->>'minutes','')::numeric,0) minutes,
    s->>'start_at' start_at,s->>'end_at' end_at,
    s->>'classification' original_class,
    CASE WHEN s->>'classification'='technical' THEN 'unidentified'
     ELSE coalesce(s->>'classification','unclassified') END stop_class,
    s->>'matched_client_name' matched_client
  FROM days d CROSS JOIN LATERAL
    jsonb_array_elements(public.gps_classify_workday_stops_v236421(d.id)) s
  WHERE d.work_date BETWEEN p_from AND p_to
 ),
 manager_visits AS (
  SELECT manager_name,
   count(*)::integer planned,
   count(*) FILTER (WHERE report_exists)::integer reports,
   count(*) FILTER (WHERE gps_session)::integer gps_confirmed,
   count(*) FILTER (WHERE coordinates_issue)::integer coordinates_issues,
   count(*) FILTER (WHERE coordinates_missing)::integer no_coordinates,
   count(*) FILTER (WHERE coordinate_conflict)::integer coordinate_conflicts,
   count(*) FILTER (WHERE report_without_gps)::integer report_only,
   count(*) FILTER (WHERE gps_without_report)::integer gps_only,
   count(*) FILTER (WHERE no_evidence)::integer no_evidence,
   count(*) FILTER (WHERE report_without_gps OR gps_without_report
       OR coordinates_issue OR no_evidence)::integer attention_visits
  FROM selected GROUP BY manager_name
 ),
 manager_stops AS (
  SELECT manager_name,
    count(*) FILTER (WHERE stop_class='unidentified' AND minutes>=5)::integer unidentified_stops,
    coalesce(round(sum(minutes) FILTER (
       WHERE stop_class='unidentified' AND minutes>=5),0),0) unidentified_minutes,
    count(*) FILTER (WHERE stop_class='home')::integer home_stops,
    count(*) FILTER (WHERE stop_class='start_zone')::integer start_zone_stops,
    count(*) FILTER (WHERE stop_class IN ('planned_tt','offplan'))::integer tt_stops
  FROM live_stops GROUP BY manager_name
 ),
 manager_days AS (
  SELECT manager_name,
   count(*)::integer workdays,
   count(*) FILTER (WHERE workday_status='active')::integer active_days,
   count(*) FILTER (WHERE aggregation_status IS DISTINCT FROM 'ready'
        OR generated_at IS NULL
        OR (source_updated_at IS NOT NULL AND generated_at<source_updated_at))::integer stale_days
  FROM days WHERE work_date BETWEEN p_from AND p_to
  GROUP BY manager_name
 ),
 all_managers AS (
  SELECT coalesce(v.manager_name,s.manager_name,d.manager_name) manager_name,
   coalesce(v.planned,0) planned,coalesce(v.reports,0) reports,
   coalesce(v.gps_confirmed,0) gps_confirmed,
   coalesce(v.coordinates_issues,0) coordinates_issues,
   coalesce(v.no_coordinates,0) no_coordinates,
   coalesce(v.coordinate_conflicts,0) coordinate_conflicts,
   coalesce(v.report_only,0) report_only,
   coalesce(v.gps_only,0) gps_only,
   coalesce(v.no_evidence,0) no_evidence,
   coalesce(v.attention_visits,0) attention_visits,
   coalesce(s.unidentified_stops,0) unidentified_stops,
   coalesce(s.unidentified_minutes,0) unidentified_minutes,
   coalesce(s.home_stops,0) home_stops,
   coalesce(s.start_zone_stops,0) start_zone_stops,
   coalesce(s.tt_stops,0) tt_stops,
   coalesce(d.active_days,0) active_days,
   coalesce(d.stale_days,0) stale_days,
   coalesce(d.workdays,0) workdays
  FROM manager_visits v FULL OUTER JOIN manager_stops s USING(manager_name)
  FULL OUTER JOIN manager_days d USING(manager_name)
 ),
 weeks AS (
  SELECT i,(p_to-(41-7*i))::date week_from,
    (p_to-(35-7*i))::date week_to FROM generate_series(0,5) i
 ),
 week_values AS (
  SELECT wk.i,wk.week_from,wk.week_to,f.manager_name,
   count(*)::integer planned,
   count(*) FILTER (WHERE f.report_exists)::integer reports,
   count(*) FILTER (WHERE f.gps_session)::integer gps_confirmed,
   count(*) FILTER (WHERE NOT f.gps_session OR f.coordinates_missing OR f.coordinate_conflict)::integer issues
  FROM weeks wk JOIN facts f ON f.work_date BETWEEN wk.week_from AND wk.week_to
  GROUP BY wk.i,wk.week_from,wk.week_to,f.manager_name
 ),
 checked_tech AS (
  SELECT count(*)::integer confirmed
  FROM public.gps_stop_classifications_v236417 t
  JOIN days d ON d.id=t.workday_id
  WHERE d.work_date BETWEEN p_from AND p_to
   AND t.classification='technical'
   AND (t.source->>'director_verified'='true' OR t.source->>'director_confirmed'='true')
 ),
 problems AS (
  SELECT 'no_coordinates' key,'Нет доверенных координат ТТ' label,
   coalesce(sum(no_coordinates),0)::integer total FROM all_managers
  UNION ALL
  SELECT 'coordinate_conflict','Конфликт геозон',
    coalesce(sum(coordinate_conflicts),0)::integer FROM all_managers
  UNION ALL
  SELECT 'report_without_gps','Отчёт без GPS-сессии',
    coalesce(sum(report_only),0)::integer FROM all_managers
  UNION ALL
  SELECT 'gps_without_report','GPS есть, отчёта нет',
    coalesce(sum(gps_only),0)::integer FROM all_managers
  UNION ALL
  SELECT 'unidentified_stops','Неопознанные стоянки (от 5 мин)',
    coalesce(sum(unidentified_stops),0)::integer FROM all_managers
  UNION ALL
  SELECT 'stale_days','Сводка устарела / не готова',
    coalesce(sum(stale_days),0)::integer FROM all_managers
 ),
 urgent AS (
  SELECT * FROM all_managers
  ORDER BY attention_visits DESC,unidentified_stops DESC,manager_name LIMIT 1
 )
 SELECT jsonb_build_object(
  'version','gps-director360-evidence-v1',
  'period',jsonb_build_object('from',p_from,'to',p_to,'manager',v_manager),
  'evidence',jsonb_build_object(
    'gps','Независимая GPS-сессия: минимум две минуты в геозоне ТТ; отчёт и visited не являются доказательством GPS',
    'stops','Неопознанная стоянка не равна подтверждённой технической остановке',
    'historical','Исходные треки, планы, посещения и решения не изменяются',
    'overlap','Категории проблем могут пересекаться, складывать их между собой нельзя'),
  'kpi',(SELECT jsonb_build_object(
    'planned',coalesce(sum(planned),0),
    'reports',coalesce(sum(reports),0),
    'gps_confirmed',coalesce(sum(gps_confirmed),0),
    'review',coalesce(sum(attention_visits),0),
    'no_coordinates',coalesce(sum(no_coordinates),0),
    'coordinate_conflicts',coalesce(sum(coordinate_conflicts),0),
    'report_only',coalesce(sum(report_only),0),
    'gps_only',coalesce(sum(gps_only),0),
    'unidentified_stops',coalesce(sum(unidentified_stops),0),
    'unidentified_minutes',coalesce(sum(unidentified_minutes),0),
    'verified_technical',(SELECT confirmed FROM checked_tech),
    'active_days',coalesce(sum(active_days),0),
    'stale_days',coalesce(sum(stale_days),0),
    'workdays',coalesce(sum(workdays),0)
    ) FROM all_managers),
  'managers',coalesce((
    SELECT jsonb_agg(to_jsonb(m) ORDER BY m.manager_name)
    FROM all_managers m),'[]'::jsonb),
  'weeks',coalesce((
    SELECT jsonb_agg(jsonb_build_object('start',week_from,'end',week_to,
      'manager',manager_name,'planned',planned,'reports',reports,
      'gps_confirmed',gps_confirmed,'issues',issues)
    ORDER BY i,manager_name) FROM week_values),'[]'::jsonb),
  'problems',coalesce((
    SELECT jsonb_agg(jsonb_build_object('key',key,'label',label,'count',total)
    ORDER BY total DESC,key) FROM problems),'[]'::jsonb),
  'urgent',(SELECT jsonb_build_object('manager',manager_name,
      'review',attention_visits,'unidentified',unidentified_stops,
      'no_coordinates',no_coordinates,'stale_days',stale_days)
    FROM urgent),
  'cases',coalesce((
    SELECT jsonb_agg(jsonb_build_object(
     'route_plan_id',route_plan_id,'workday_id',workday_id,
     'date',work_date,'manager',manager_name,'client',client_name,
     'city',city,'address',address,'report_exists',report_exists,
     'gps_confirmed',gps_session,'coordinate_missing',coordinates_missing,
     'coordinate_conflict',coordinate_conflict,
     'actual_minutes',actual_minutes,'day_active',workday_status='active',
     'issue',CASE WHEN coordinates_issue THEN 'coords_review'
       WHEN report_without_gps THEN 'report_without_gps'
       WHEN gps_without_report THEN 'gps_without_report'
       ELSE 'no_evidence' END
    ) ORDER BY work_date DESC,manager_name,client_name)
    FROM (SELECT * FROM selected
      WHERE coordinates_issue OR report_without_gps OR gps_without_report OR no_evidence
      ORDER BY work_date DESC,manager_name,client_name LIMIT 75) sample
    ),'[]'::jsonb),
  'stops',coalesce((
    SELECT jsonb_agg(jsonb_build_object(
      'workday_id',workday_id,'date',work_date,
      'manager',manager_name,'seq',stop_seq,'minutes',minutes,
      'start_at',start_at,'end_at',end_at,
      'type','unidentified','reason','Нет достоверного соответствия ТТ или стартовой зоне; требуется разбор'
    ) ORDER BY minutes DESC,work_date DESC)
    FROM (SELECT * FROM live_stops
      WHERE stop_class='unidentified' AND minutes>=5
      ORDER BY minutes DESC,work_date DESC LIMIT 35) s
    ),'[]'::jsonb),
  'generated_at',now()
 ) INTO v_result;
 RETURN v_result;
END;
$function$;
REVOKE ALL ON FUNCTION public.gps_director360_evidence_v20261105(date,date,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.gps_director360_evidence_v20261105(date,date,text) TO authenticated,service_role;
