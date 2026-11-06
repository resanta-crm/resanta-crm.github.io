-- Optional manager on-site geoverification for exact physical TT.
-- An action is recorded once per route. Only independently matching raw GPS can commit coordinates.
CREATE TABLE IF NOT EXISTS public.gps360_store_onsite_v1(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 route_plan_id uuid NOT NULL REFERENCES public.route_plans(id),
 point_id uuid NOT NULL REFERENCES public.route_physical_points(id),
 manager_id uuid NOT NULL,
 manager_name text NOT NULL,
 visit_date date NOT NULL,
 observed_at timestamptz NOT NULL,
 observed_lat double precision,
 observed_lng double precision,
 observed_accuracy_m double precision,
 decision text NOT NULL CHECK(decision IN ('confirm','not_here')),
 status text NOT NULL CHECK(status IN ('pending_sync','verified','not_here','conflict')),
 created_at timestamptz NOT NULL DEFAULT now(),
 verified_at timestamptz,
 UNIQUE(route_plan_id,manager_id)
);
CREATE INDEX IF NOT EXISTS gps360_store_onsite_pending_v1 ON
 public.gps360_store_onsite_v1(manager_id,status,created_at DESC);
ALTER TABLE public.gps360_store_onsite_v1 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.gps360_store_onsite_v1 FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.gps360_store_onsite_preview_v20261106(
 p_route_plan_id uuid, p_accuracy_m double precision DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public','auth','pg_catalog'
AS $function$
DECLARE v_user public.users%rowtype;v_plan public.route_plans%rowtype;
 v_point public.route_physical_points%rowtype;v_current text;
BEGIN
 SELECT u.* INTO v_user FROM public.users u JOIN auth.users a ON a.id=u.id
 WHERE u.id=auth.uid() AND lower(u.email)=lower(a.email)
 AND a.email_confirmed_at IS NOT NULL;
 IF v_user.id IS NULL OR v_user.role<>'manager' OR
  v_user.name NOT IN ('Руднев','Ачинович','Шкуран') THEN
  RAISE EXCEPTION 'Подтверждение GPS-ТТ доступно только закреплённому менеджеру'
   USING ERRCODE='42501';
 END IF;
 SELECT * INTO v_plan FROM public.route_plans WHERE id=p_route_plan_id AND
  lower(trim(manager_name))=lower(trim(v_user.name)) AND
  approved IS TRUE AND review_status='approved' AND
  coalesce(removed,false)=false;
 IF NOT FOUND OR v_plan.physical_point_id IS NULL OR
  v_plan.visit_date<timezone('Europe/Minsk',now())::date-7 OR
  v_plan.visit_date>timezone('Europe/Minsk',now())::date THEN
  RETURN jsonb_build_object('prompt',false,'reason','no_current_exact_store');
 END IF;
 SELECT * INTO v_point FROM public.route_physical_points
 WHERE id=v_plan.physical_point_id AND active IS DISTINCT FROM false;
 IF NOT FOUND OR (v_point.lat IS NOT NULL AND v_point.lng IS NOT NULL) THEN
  RETURN jsonb_build_object('prompt',false,'reason','store_already_verified');
 END IF;
 SELECT status INTO v_current FROM public.gps360_store_onsite_v1
 WHERE route_plan_id=v_plan.id AND manager_id=auth.uid();
 IF v_current IS NOT NULL THEN
  RETURN jsonb_build_object('prompt',false,'reason',v_current);
 END IF;
 IF p_accuracy_m IS NULL OR p_accuracy_m<=0 OR p_accuracy_m>60 THEN
  RETURN jsonb_build_object('prompt',false,'reason','need_better_gps');
 END IF;
 RETURN jsonb_build_object('prompt',true,'route_plan_id',v_plan.id,
  'point_id',v_point.id,'client',v_plan.client_name,
  'city',v_point.city,'address',v_point.address,
  'accuracy_m',round(p_accuracy_m::numeric,0),
  'note','Подтверждение привязывается только к выбранному физическому магазину');
END;
$function$;
REVOKE ALL ON FUNCTION public.gps360_store_onsite_preview_v20261106(uuid,double precision)
 FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.gps360_store_onsite_preview_v20261106(uuid,double precision)
 TO authenticated,service_role;

-- Internal reconciliation: never trusts GPS from the UI alone.
CREATE OR REPLACE FUNCTION public.gps360_store_onsite_finalize_internal_v20261106(p_action_id uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO 'public','auth','pg_catalog'
AS $function$
DECLARE v_action public.gps360_store_onsite_v1%rowtype;
 v_point public.route_physical_points%rowtype;v_matched integer:=0;
BEGIN
 SELECT * INTO v_action FROM public.gps360_store_onsite_v1
  WHERE id=p_action_id AND manager_id=auth.uid() FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('status','not_found');END IF;
 IF v_action.status<>'pending_sync' THEN
  RETURN jsonb_build_object('status',v_action.status);END IF;
 SELECT * INTO v_point FROM public.route_physical_points WHERE id=v_action.point_id FOR UPDATE;
 IF NOT FOUND OR v_point.active IS FALSE THEN
  UPDATE public.gps360_store_onsite_v1 SET status='conflict' WHERE id=v_action.id;
  RETURN jsonb_build_object('status','conflict');END IF;
 IF v_point.lat IS NOT NULL OR v_point.lng IS NOT NULL THEN
  UPDATE public.gps360_store_onsite_v1 SET status='verified',verified_at=now()
   WHERE id=v_action.id;
  RETURN jsonb_build_object('status','already_verified');
 END IF;
 -- 2 independent valid native GPS samples close in time and position
 -- to prevent a manager supplied browser lat/lng from writing an arbitrary store geozone.
 SELECT count(*) INTO v_matched FROM (
  SELECT g.recorded_at
  FROM public.gps_track_points g
  JOIN public.gps_workdays w ON w.id=g.workday_id
  WHERE w.user_id=auth.uid() AND w.work_date=v_action.visit_date
    AND lower(trim(w.manager_name))=lower(trim(v_action.manager_name))
    AND g.is_valid IS TRUE AND coalesce(g.is_mock,false)=false
    AND g.accuracy BETWEEN 1 AND 65
    AND g.recorded_at BETWEEN v_action.observed_at-interval '25 minutes'
       AND v_action.observed_at+interval '25 minutes'
    AND public.gps_haversine_m(g.lat,g.lng,v_action.observed_lat,v_action.observed_lng)<=75
  ORDER BY g.recorded_at DESC LIMIT 2
 ) points;
 IF v_matched<2 THEN
  RETURN jsonb_build_object('status','pending_sync','matching_samples',v_matched);
 END IF;
 -- Collision check with existing independently verified physical stores.
 IF EXISTS(
  SELECT 1 FROM public.route_physical_points other
  WHERE other.id<>v_point.id AND other.active IS DISTINCT FROM false
   AND other.lat IS NOT NULL AND other.lng IS NOT NULL
   AND public.gps_haversine_m(other.lat,other.lng,
    v_action.observed_lat,v_action.observed_lng)<35
 ) THEN
  UPDATE public.gps360_store_onsite_v1 SET status='conflict' WHERE id=v_action.id;
  RETURN jsonb_build_object('status','conflict');
 END IF;
 INSERT INTO public.gps360_store_geo_audit_v1(
  point_id,old_row,lat,lng,source,evidence,actor_id)
 VALUES(v_point.id,to_jsonb(v_point),v_action.observed_lat,
  v_action.observed_lng,'gps_manager_onsite',
  jsonb_build_object('route_plan_id',v_action.route_plan_id,
   'action_id',v_action.id,'accuracy',v_action.observed_accuracy_m,
   'matching_native_points',v_matched),auth.uid());
 UPDATE public.route_physical_points
 SET lat=v_action.observed_lat,lng=v_action.observed_lng,
  geocode_status='verified_gps_onsite',
  geocode_label='Менеджер подтвердил физическую ТТ; GPS трек проверен',
  geocoded_at=now(),updated_at=now()
 WHERE id=v_point.id AND lat IS NULL AND lng IS NULL;
 UPDATE public.gps360_store_onsite_v1 SET status='verified',verified_at=now()
 WHERE id=v_action.id;
 RETURN jsonb_build_object('status','verified','point_id',v_point.id);
END;
$function$;
REVOKE ALL ON FUNCTION public.gps360_store_onsite_finalize_internal_v20261106(uuid)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.gps360_store_onsite_finalize_internal_v20261106(uuid)
 TO service_role;

CREATE OR REPLACE FUNCTION public.gps360_store_onsite_decide_v20261106(
 p_route_plan_id uuid,p_lat double precision,p_lng double precision,
 p_accuracy_m double precision,p_observed_at timestamptz,p_choice text
)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO 'public','auth','pg_catalog'
AS $function$
DECLARE v_preview jsonb;v_route public.route_plans%rowtype;v_id uuid;v_result jsonb;
BEGIN
 IF p_choice NOT IN ('confirm','not_here') OR
  p_lat IS NULL OR p_lat NOT BETWEEN -90 AND 90 OR
  p_lng IS NULL OR p_lng NOT BETWEEN -180 AND 180 OR
  p_accuracy_m IS NULL OR p_accuracy_m NOT BETWEEN 1 AND 60 OR
  p_observed_at IS NULL OR p_observed_at>now()+interval '5 minutes' OR
  p_observed_at<now()-interval '7 days' THEN
  RAISE EXCEPTION 'Недопустимые координаты, точность, дата или решение'
   USING ERRCODE='22023';
 END IF;
 v_preview:=public.gps360_store_onsite_preview_v20261106(p_route_plan_id,p_accuracy_m);
 IF coalesce((v_preview->>'prompt')::boolean,false)=false THEN
  RAISE EXCEPTION 'Повторное подтверждение GPS этой ТТ не требуется'
   USING ERRCODE='22023';
 END IF;
 SELECT * INTO v_route FROM public.route_plans WHERE id=p_route_plan_id;
 IF v_route.visit_date<>timezone('Europe/Minsk',p_observed_at)::date THEN
   RAISE EXCEPTION 'Дата GPS не совпадает с маршрутом' USING ERRCODE='22023';
 END IF;
 INSERT INTO public.gps360_store_onsite_v1(
  route_plan_id,point_id,manager_id,manager_name,visit_date,
  observed_at,observed_lat,observed_lng,observed_accuracy_m,decision,status)
 VALUES(v_route.id,v_route.physical_point_id,auth.uid(),v_route.manager_name,
  v_route.visit_date,p_observed_at,p_lat,p_lng,p_accuracy_m,p_choice,
  CASE WHEN p_choice='not_here' THEN 'not_here' ELSE 'pending_sync' END)
 RETURNING id INTO v_id;
 IF p_choice='confirm' THEN
  v_result:=public.gps360_store_onsite_finalize_internal_v20261106(v_id);
 ELSE v_result:=jsonb_build_object('status','not_here');
 END IF;
 RETURN v_result||jsonb_build_object('ok',true,'action_id',v_id,
  'message','Решение сохранено по физической ТТ; старые GPS-данные не менялись');
END;
$function$;
REVOKE ALL ON FUNCTION public.gps360_store_onsite_decide_v20261106(
 uuid,double precision,double precision,double precision,timestamptz,text
) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.gps360_store_onsite_decide_v20261106(
 uuid,double precision,double precision,double precision,timestamptz,text
) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.gps360_store_onsite_retry_v20261106(p_route_plan_id uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO 'public','auth','pg_catalog'
AS $function$
DECLARE v_id uuid;v_role text;v_name text;
BEGIN
 SELECT role,name INTO v_role,v_name FROM public.users WHERE id=auth.uid();
 IF auth.uid() IS NULL OR v_role<>'manager' OR v_name NOT IN
 ('Руднев','Ачинович','Шкуран') THEN
  RAISE EXCEPTION 'Нет доступа к GPS подтверждению' USING ERRCODE='42501';
 END IF;
 SELECT id INTO v_id FROM public.gps360_store_onsite_v1
 WHERE route_plan_id=p_route_plan_id AND manager_id=auth.uid()
  AND status='pending_sync' ORDER BY created_at DESC LIMIT 1;
 IF v_id IS NULL THEN RETURN jsonb_build_object('status','none');END IF;
 RETURN public.gps360_store_onsite_finalize_internal_v20261106(v_id);
END;
$function$;
REVOKE ALL ON FUNCTION public.gps360_store_onsite_retry_v20261106(uuid)
 FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.gps360_store_onsite_retry_v20261106(uuid)
 TO authenticated,service_role;
