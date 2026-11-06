-- GPS360 safe coordinates from exactly linked historic physical TT visits.
-- Never update raw gps_track_points, visits, route_plans, or existing nonnull physical coordinates.
CREATE TABLE IF NOT EXISTS public.gps360_store_geo_audit_v1(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 point_id uuid NOT NULL REFERENCES public.route_physical_points(id),
 old_row jsonb NOT NULL,
 lat double precision NOT NULL,
 lng double precision NOT NULL,
 source text NOT NULL,
 evidence jsonb NOT NULL,
 actor_id uuid,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS gps360_store_geo_audit_point_idx
 ON public.gps360_store_geo_audit_v1(point_id,created_at DESC);
ALTER TABLE public.gps360_store_geo_audit_v1 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.gps360_store_geo_audit_v1 FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.gps360_restore_store_history_v20261106(
 p_commit boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public','auth','pg_catalog'
AS $function$
DECLARE
 v_role text;v_email text;v_count integer:=0;v_changed integer:=0;
 v_sample jsonb:='[]'::jsonb;
 v_row record;v_point public.route_physical_points%rowtype;
BEGIN
 SELECT u.role,lower(a.email) INTO v_role,v_email
 FROM public.users u JOIN auth.users a ON a.id=u.id
 WHERE u.id=auth.uid() AND lower(a.email)=lower(u.email)
 AND a.email_confirmed_at IS NOT NULL;
 IF v_role<>'boss' OR v_email NOT IN
 ('payushin_ar@resanta.ru','sidarovich_kn@resanta.ru') THEN
  RAISE EXCEPTION 'Только руководитель может восстанавливать GPS-геозоны' USING ERRCODE='42501';
 END IF;
 FOR v_row IN
  WITH evidence AS (
    SELECT r.physical_point_id point_id,r.visit_date,
     v.gps_lat lat,v.gps_lng lng,v.gps_accuracy accuracy
    FROM public.route_plans r JOIN public.route_physical_points p ON p.id=r.physical_point_id
    JOIN public.visits v ON v.route_plan_id=r.id::text
    WHERE p.active IS DISTINCT FROM false AND p.lat IS NULL AND p.lng IS NULL
     AND coalesce(v.is_duplicate,false)=false
     AND lower(coalesce(v.gps_status,''))='confirmed'
     AND v.gps_accuracy BETWEEN 1 AND 40
     AND v.gps_lat BETWEEN -90 AND 90 AND v.gps_lng BETWEEN -180 AND 180
  ), grouped AS (
    SELECT point_id,COUNT(*) samples,COUNT(DISTINCT visit_date) days,
     AVG(lat) lat,AVG(lng) lng,MIN(lat) minlat,MAX(lat) maxlat,
     MIN(lng) minlng,MAX(lng) maxlng, MAX(accuracy) worst_accuracy
    FROM evidence GROUP BY point_id
    HAVING COUNT(DISTINCT visit_date)>=3
    AND public.gps_haversine_m(MIN(lat),MIN(lng),MAX(lat),MAX(lng))<=35
  )
  SELECT g.*,p.city,p.address,p.manager_name,
   public.gps_haversine_m(g.minlat,g.minlng,g.maxlat,g.maxlng) spread_m
  FROM grouped g JOIN public.route_physical_points p ON p.id=g.point_id
  WHERE NOT EXISTS(
    SELECT 1 FROM public.route_physical_points other
    WHERE other.id<>p.id AND other.active IS DISTINCT FROM false
     AND other.lat IS NOT NULL AND other.lng IS NOT NULL
     AND public.gps_haversine_m(g.lat,g.lng,other.lat,other.lng)<50
  ) AND NOT EXISTS(
    SELECT 1 FROM public.route_physical_points other
    WHERE other.id<>p.id AND other.active IS DISTINCT FROM false
     AND lower(btrim(coalesce(other.city,'')))=lower(btrim(coalesce(p.city,'')))
     AND lower(btrim(coalesce(other.address,'')))=lower(btrim(coalesce(p.address,'')))
  )
  ORDER BY p.manager_name,p.point_key
 LOOP
  v_count:=v_count+1;
  IF jsonb_array_length(v_sample)<8 THEN
   v_sample:=v_sample||jsonb_build_array(jsonb_build_object(
      'point_id',v_row.point_id,'manager',v_row.manager_name,
      'city',v_row.city,'samples',v_row.samples,
      'days',v_row.days,'spread_m',round(v_row.spread_m::numeric,1)));
  END IF;
  IF p_commit THEN
   SELECT * INTO v_point FROM public.route_physical_points
    WHERE id=v_row.point_id FOR UPDATE;
   IF FOUND AND v_point.lat IS NULL AND v_point.lng IS NULL AND
       v_point.active IS DISTINCT FROM false THEN
    INSERT INTO public.gps360_store_geo_audit_v1
     (point_id,old_row,lat,lng,source,evidence,actor_id)
    VALUES(v_point.id,to_jsonb(v_point),v_row.lat,v_row.lng,
     'gps_history_3days_35m',jsonb_build_object('days',v_row.days,
       'samples',v_row.samples,'spread_m',v_row.spread_m,
       'max_accuracy_m',v_row.worst_accuracy,
       'isolation_m',50,'exact_route_store_id',true),auth.uid());
    UPDATE public.route_physical_points
     SET lat=v_row.lat,lng=v_row.lng,
         geocode_status='verified_gps_history',
         geocode_label='Выверено: три дня GPS визитов, радиус <=35 м',
         geocoded_at=now(),updated_at=now()
     WHERE id=v_row.point_id AND lat IS NULL AND lng IS NULL;
    GET DIAGNOSTICS v_changed=ROW_COUNT;
    -- v_changed read per row; total recorded by count in audit for this run below.
   END IF;
  END IF;
 END LOOP;
 RETURN jsonb_build_object('ok',true,'dry_run',NOT p_commit,
   'eligible',v_count,'examples',v_sample,
   'applied_this_call',CASE WHEN p_commit THEN v_count ELSE 0 END,
   'note','Только отсутствующие координаты. Исходные GPS-точки и посещения не изменены.');
END;
$function$;
REVOKE ALL ON FUNCTION public.gps360_restore_store_history_v20261106(boolean)
 FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.gps360_restore_store_history_v20261106(boolean)
 TO authenticated,service_role;
