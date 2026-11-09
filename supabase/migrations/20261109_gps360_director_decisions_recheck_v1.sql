-- GPS AI 360: no raw-trace, visited status or route-plan writes.
-- Decisions and GPS evidence remain independent; all results are role-scoped.
CREATE OR REPLACE FUNCTION public.gps_director360_decisions_v20261109(
 p_from date,p_to date
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
 SET search_path TO 'public','auth','pg_catalog'
AS $function$
DECLARE v_data jsonb;
BEGIN
 IF auth.uid() IS NULL OR NOT public.gps_has_control_access() THEN
  RAISE EXCEPTION 'Нет доступа к GPS решениям' USING ERRCODE='42501';
 END IF;
 IF p_from IS NULL OR p_to IS NULL OR p_to<p_from OR p_to-p_from>94 THEN
  RAISE EXCEPTION 'Допустимый диапазон до 94 дней' USING ERRCODE='22023';
 END IF;
 SELECT coalesce(jsonb_object_agg(d.route_plan_id::text,
  jsonb_build_object(
   'action',d.action,'case_state',CASE
      WHEN d.action IN ('resolved_verified','resolved_technical') THEN 'closed'
      ELSE 'in_progress' END,
   'closed_by_director',d.action IN ('resolved_verified','resolved_technical'),
   'comment',d.comment,'created_at',d.created_at,
   'gps_verified_by_decision',false,
   'decision_id',d.id
  )),'{}'::jsonb) INTO v_data
 FROM (
  SELECT DISTINCT ON (x.route_plan_id) x.*
  FROM public.gps_director_case_decisions_v236440 x
  JOIN public.route_plans r ON r.id=x.route_plan_id
  WHERE r.visit_date BETWEEN p_from AND p_to
  ORDER BY x.route_plan_id,x.created_at DESC,x.id DESC
 ) d;
 RETURN jsonb_build_object('from',p_from,'to',p_to,'states',coalesce(v_data,'{}'::jsonb),
  'source','latest director journal, no GPS status updates');
END;
$function$;
REVOKE ALL ON FUNCTION public.gps_director360_decisions_v20261109(date,date) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.gps_director360_decisions_v20261109(date,date) TO authenticated;

CREATE OR REPLACE FUNCTION public.gps_director360_stop_close_v20261109(
 p_workday_id uuid,p_stop_seq integer,p_action text,p_comment text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
 SET search_path TO 'public','auth','pg_catalog'
AS $function$
DECLARE v_day public.gps_workdays%rowtype;
 v_stop jsonb;v_id uuid;v_prev uuid;
BEGIN
 IF auth.uid() IS NULL OR NOT public.gps_has_control_access() THEN
  RAISE EXCEPTION 'Нет доступа к GPS решениям' USING ERRCODE='42501';
 END IF;
 IF p_action <> 'forgot_end_day' OR p_stop_seq<1 OR
    length(btrim(coalesce(p_comment,''))) NOT BETWEEN 8 AND 1500 THEN
   RAISE EXCEPTION 'Для закрытия забытого дня необходим комментарий руководителя' USING ERRCODE='22023';
 END IF;
 SELECT * INTO v_day FROM public.gps_workdays WHERE id=p_workday_id FOR SHARE;
 IF NOT FOUND OR v_day.status='active' OR v_day.work_date<current_date-365 THEN
  RAISE EXCEPTION 'Завершённый GPS день не найден' USING ERRCODE='22023';
 END IF;
 SELECT x INTO v_stop
 FROM jsonb_array_elements(public.gps_director360_classify_stops_v20261106(p_workday_id)) x
 WHERE (x->>'seq')::integer=p_stop_seq LIMIT 1;
 IF v_stop IS NULL OR v_stop->>'classification' NOT IN ('unidentified','home','start_zone')
  OR coalesce((v_stop->>'minutes')::numeric,0)<60
  OR coalesce((v_stop->>'samples')::integer,0)<2
  OR coalesce((v_stop->>'distance_to_home_m')::numeric,999999)>150 THEN
   RAISE EXCEPTION 'Недостаточно доказательств длительной стоянки в домашней/стартовой зоне'
    USING ERRCODE='22023';
 END IF;
 SELECT id INTO v_prev FROM public.gps_director360_stop_reviews_v1
 WHERE workday_id=p_workday_id AND stop_seq=p_stop_seq AND action='forgot_end_day'
 ORDER BY created_at DESC LIMIT 1;
 IF v_prev IS NOT NULL THEN RETURN jsonb_build_object('ok',true,'id',v_prev,'action','forgot_end_day',
  'closed',true,'already_closed',true,'raw_gps_unchanged',true); END IF;
 INSERT INTO public.gps_director360_stop_reviews_v1
 (workday_id,stop_seq,action,comment,due_date,actor_id,actor_email)
 VALUES(p_workday_id,p_stop_seq,p_action,btrim(p_comment),NULL,auth.uid(),
  coalesce((SELECT lower(email) FROM auth.users WHERE id=auth.uid()),''))
 RETURNING id INTO v_id;
 RETURN jsonb_build_object('ok',true,'id',v_id,'action','forgot_end_day',
  'closed',true,'raw_gps_unchanged',true,
  'note','Закрыто решение руководителя, но GPS-день, трек и исходные длительности не изменены');
END;
$function$;
REVOKE ALL ON FUNCTION public.gps_director360_stop_close_v20261109(uuid,integer,text,text)
 FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.gps_director360_stop_close_v20261109(uuid,integer,text,text)
 TO authenticated;

-- Strict, read-only corroboration. Only verified anchored coordinates and
-- two reliable, close GPS points separated 2..15 minutes in the visit window.
-- A director decision is never evidence of actual GPS.
CREATE OR REPLACE FUNCTION public.gps_director_case_recheck_v20261109(
 p_route_plan_id uuid
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
 SET search_path TO 'public','auth','pg_catalog'
AS $function$
DECLARE v_detail jsonb;v_workday uuid;v_lat double precision;v_lng double precision;
 v_anchor_verified boolean;v_from timestamptz;v_to timestamptz;
 v_n integer:=0;v_earliest timestamptz;v_latest timestamptz;
 v_pair boolean:=false;v_ambiguous boolean:=false;
 v_plan public.route_plans%rowtype;
BEGIN
 IF auth.uid() IS NULL OR NOT public.gps_has_control_access() THEN
  RAISE EXCEPTION 'Нет доступа к GPS доказательствам' USING ERRCODE='42501';
 END IF;
 SELECT * INTO v_plan FROM public.route_plans WHERE id=p_route_plan_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Торговая точка не найдена'; END IF;
 v_detail:=public.gps_director_case_detail_v236440(p_route_plan_id);
 v_workday:=nullif(v_detail->>'workday_id','')::uuid;
 v_anchor_verified:=nullif(v_detail#>>'{trusted_anchor,verified_at}','') IS NOT NULL;
 v_lat:=nullif(v_detail#>>'{trusted_anchor,lat}','')::double precision;
 v_lng:=nullif(v_detail#>>'{trusted_anchor,lng}','')::double precision;
 v_ambiguous:=jsonb_array_length(coalesce(v_detail->'address_conflicts','[]'::jsonb))>0;
 IF v_workday IS NOT NULL AND v_anchor_verified AND v_lat BETWEEN -90 AND 90
  AND v_lng BETWEEN -180 AND 180 AND v_plan.planned_start IS NOT NULL
  AND v_plan.planned_end IS NOT NULL AND v_plan.planned_end>v_plan.planned_start THEN
   v_from:=(v_plan.visit_date+v_plan.planned_start) AT TIME ZONE 'Europe/Minsk';
   v_to:=(v_plan.visit_date+v_plan.planned_end) AT TIME ZONE 'Europe/Minsk';
   WITH candidate AS MATERIALIZED (
    SELECT recorded_at
    FROM public.gps_track_points p
    WHERE p.workday_id=v_workday AND p.recorded_at>=v_from-interval '20 minutes'
      AND p.recorded_at<=v_to+interval '20 minutes'
      AND p.is_valid IS TRUE AND p.is_mock IS NOT TRUE
      AND p.accuracy BETWEEN 0 AND 35
      AND coalesce(p.speed,0) BETWEEN 0 AND 6
      AND public.gps_haversine_m(p.lat,p.lng,v_lat,v_lng)<=25
   )
   SELECT count(*)::integer,min(recorded_at),max(recorded_at),
    EXISTS(SELECT 1 FROM candidate p1 JOIN candidate p2
       ON p2.recorded_at >= p1.recorded_at+interval '2 minutes'
      AND p2.recorded_at <= p1.recorded_at+interval '15 minutes')
   INTO v_n,v_earliest,v_latest,v_pair FROM candidate;
 END IF;
 RETURN jsonb_build_object('route_plan_id',p_route_plan_id,'workday_id',v_workday,
   'anchor_verified',v_anchor_verified,'ambiguous_clients',v_ambiguous,
   'gps_points_qualifying',v_n,'first_point_at',v_earliest,'last_point_at',v_latest,
   'two_reliable_points_2min',v_pair,
   'gps_proximity_evidence',coalesce(v_anchor_verified AND NOT v_ambiguous AND v_pair,false),
   'decision',v_detail->'last_director_decision',
   'gps_status_changed',false,
   'source','gps_track_points + independently verified store anchor; radius 25m, accuracy <=35m, dwell >=2 min',
   'caveat','Совпадение по GPS не означает автоматического подтверждения конкретного визита при нескольких близких ТТ');
END;
$function$;
REVOKE ALL ON FUNCTION public.gps_director_case_recheck_v20261109(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.gps_director_case_recheck_v20261109(uuid) TO authenticated;

-- Additive facade for the newer director screen. Historic raw datasets,
-- dashboard functions and stored visit facts are not rewritten.
CREATE OR REPLACE FUNCTION public.gps_director360_evidence_v20261109(
 p_from date,p_to date,p_manager text DEFAULT 'all'
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
 SET search_path TO 'public','auth','pg_catalog'
AS $function$
DECLARE v_data jsonb;v_stops jsonb;v_closed integer:=0;v_kpi jsonb;
BEGIN
 IF auth.uid() IS NULL OR NOT public.gps_has_control_access() THEN
  RAISE EXCEPTION 'Нет доступа к GPS директорскому экрану' USING ERRCODE='42501';
 END IF;
 v_data:=public.gps_director360_evidence_v20261106(p_from,p_to,p_manager);
 SELECT count(*)::integer,coalesce(jsonb_agg(
  CASE WHEN x->>'review_action'='forgot_end_day'
   THEN jsonb_set(jsonb_set(x,'{type}','"resolved"'::jsonb),
      '{reason}','"Забыли завершить GPS-день · решение руководителя"'::jsonb)
   ELSE x END
 ),'[]'::jsonb)
 INTO v_closed,v_stops
 FROM jsonb_array_elements(coalesce(v_data->'stops','[]'::jsonb)) x
 WHERE true;
 SELECT count(*)::integer INTO v_closed
 FROM jsonb_array_elements(coalesce(v_data->'stops','[]'::jsonb)) x
 WHERE x->>'review_action'='forgot_end_day';
 v_data:=jsonb_set(v_data,'{stops}',coalesce(v_stops,'[]'::jsonb));
 v_kpi:=coalesce(v_data->'kpi','{}'::jsonb)
   ||jsonb_build_object(
    'resolved_stops',coalesce((v_data#>>'{kpi,resolved_stops}')::integer,0)+v_closed,
    'forgot_end_day_closed',v_closed);
 RETURN jsonb_set(v_data,'{kpi}',v_kpi);
END;
$function$;
REVOKE ALL ON FUNCTION public.gps_director360_evidence_v20261109(date,date,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.gps_director360_evidence_v20261109(date,date,text) TO authenticated;
