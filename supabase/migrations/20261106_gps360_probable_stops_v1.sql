CREATE OR REPLACE FUNCTION public.gps_director360_classify_stops_v20261106(p_workday_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_catalog'
AS $function$
DECLARE
 v_day public.gps_workdays%rowtype;
 v_zone public.gps_home_zones_v236417%rowtype;
 v_stops jsonb;
 v_facts jsonb;
 v_stop jsonb;
 v_match jsonb;
 v_probable jsonb;
 v_count integer;
 v_result jsonb:='[]'::jsonb;
 v_lat double precision;
 v_lng double precision;
 v_start timestamptz;
 v_end timestamptz;
 v_minutes numeric;
 v_home_distance numeric;
 v_zone_lat double precision;
 v_zone_lng double precision;
 v_home boolean;
 v_class text;
 v_label text;
 v_detail text;
BEGIN
 IF auth.uid() IS NULL OR NOT public.gps_has_control_access() THEN
   RAISE EXCEPTION 'Нет доступа к GPS-контролю' USING ERRCODE='42501';
 END IF;
 SELECT * INTO v_day FROM public.gps_workdays WHERE id=p_workday_id;
 IF NOT FOUND THEN RETURN '[]'::jsonb; END IF;
 SELECT * INTO v_zone FROM public.gps_home_zones_v236417
  WHERE user_id=v_day.user_id LIMIT 1;
 IF v_zone.status='confirmed' THEN
   v_zone_lat:=v_zone.confirmed_lat;v_zone_lng:=v_zone.confirmed_lng;
 ELSIF v_zone.status='suggested' THEN
   v_zone_lat:=v_zone.suggested_lat;v_zone_lng:=v_zone.suggested_lng;
 END IF;
 -- The live detector reads valid raw GPS points, bypassing stale physical_stops caches.
 v_stops:=public.gps_detect_workday_stops(p_workday_id);
 SELECT coalesce(jsonb_agg(to_jsonb(f)),'[]'::jsonb) INTO v_facts
 FROM public.gps_workday_visit_facts_v236421(p_workday_id) f;
 FOR v_stop IN SELECT value FROM jsonb_array_elements(coalesce(v_stops,'[]'::jsonb))
 LOOP
   v_lat:=nullif(v_stop->>'lat','')::double precision;
   v_lng:=nullif(v_stop->>'lng','')::double precision;
   v_start:=nullif(v_stop->>'start_at','')::timestamptz;
   v_end:=nullif(v_stop->>'end_at','')::timestamptz;
   v_minutes:=coalesce(nullif(v_stop->>'minutes','')::numeric,0);
   v_home_distance:=null;v_match:=null;v_probable:=null;v_count:=0;
   IF v_lat IS NOT NULL AND v_lng IS NOT NULL
     AND v_zone_lat IS NOT NULL AND v_zone_lng IS NOT NULL THEN
     v_home_distance:=public.gps_haversine_m(v_lat,v_lng,v_zone_lat,v_zone_lng);
   END IF;
   v_home:=(
     coalesce(nullif(v_stop->>'seq','')::integer,0)=1
     AND v_minutes>=10 AND v_start IS NOT NULL AND v_end IS NOT NULL
     AND v_home_distance IS NOT NULL
     AND v_home_distance<=coalesce(v_zone.radius_m,150)
     AND v_start<=v_day.started_at+interval '20 minutes'
     AND v_end>=v_day.started_at+interval '10 minutes'
   );
   IF NOT v_home AND v_lat IS NOT NULL AND v_lng IS NOT NULL THEN
     SELECT x.value INTO v_match
     FROM jsonb_array_elements(v_facts) x(value)
     WHERE x.value->>'actual_arrival_at' IS NOT NULL
       AND x.value->>'actual_departure_at' IS NOT NULL
       AND coalesce(nullif(x.value->>'actual_minutes','')::numeric,0)>=2
       AND x.value->>'trusted_lat' IS NOT NULL
       AND x.value->>'trusted_lng' IS NOT NULL
       AND v_start IS NOT NULL AND v_end IS NOT NULL
       AND (x.value->>'actual_arrival_at')::timestamptz<=v_end+interval '2 minutes'
       AND (x.value->>'actual_departure_at')::timestamptz>=v_start-interval '2 minutes'
       AND public.gps_haversine_m(v_lat,v_lng,
         (x.value->>'trusted_lat')::double precision,
         (x.value->>'trusted_lng')::double precision)<=250
     ORDER BY public.gps_haversine_m(v_lat,v_lng,
         (x.value->>'trusted_lat')::double precision,
         (x.value->>'trusted_lng')::double precision),
       (x.value->>'actual_minutes')::numeric DESC
     LIMIT 1;
   END IF;
   IF NOT v_home AND v_match IS NULL AND v_lat IS NOT NULL AND v_lng IS NOT NULL
      AND v_start IS NOT NULL AND v_end IS NOT NULL AND v_minutes>=2 THEN
      SELECT COUNT(*),MAX(x.value::text)::jsonb INTO v_count,v_probable
      FROM jsonb_array_elements(v_facts) x(value)
      WHERE x.value->>'visit_id' IS NOT NULL
       AND x.value->>'visit_created_at' IS NOT NULL
       AND x.value->>'trusted_lat' IS NOT NULL
       AND x.value->>'trusted_lng' IS NOT NULL
       AND (x.value->>'visit_created_at')::timestamptz
        BETWEEN v_start-interval '45 minutes' AND v_end+interval '45 minutes'
       AND public.gps_haversine_m(v_lat,v_lng,
         (x.value->>'trusted_lat')::double precision,
         (x.value->>'trusted_lng')::double precision)<=125;
      IF v_count<>1 THEN v_probable:=null;END IF;
   END IF;
   IF v_home AND v_zone.status='confirmed' THEN
     v_class:='home';v_label:='Дом / начало рабочего дня';
     v_detail:='Подтверждённая домашняя геозона; не клиентская ТТ';
   ELSIF v_home THEN
     v_class:='start_zone';v_label:='Предполагаемая стартовая зона';
     v_detail:='Требуется подтверждение стартовой зоны';
   ELSIF v_match IS NOT NULL THEN
     v_class:='planned_tt';v_label:='GPS подтверждён у ТТ';
     v_detail:='Реальная GPS-сессия не менее 2 минут, координаты и время совпадают';
   ELSIF v_probable IS NOT NULL THEN
     v_class:='probable_tt';v_label:='Вероятный визит у торговой точки';
     v_detail:='GPS-стоянка и отчёт совпали по месту и времени; не равно независимому подтверждению GPS-сессии';
   ELSE
     v_class:='unidentified';v_label:='Неопознанная стоянка';
     v_detail:='Нет достоверного соответствия ТТ / стартовой зоне; техническая причина не доказана';
   END IF;
   v_result:=v_result||jsonb_build_array(v_stop||jsonb_build_object(
     'classification',v_class,
     'classification_label',v_label,
     'classification_detail',v_detail,
     'matched_client_name',coalesce(v_match->>'client_name',v_probable->>'client_name'),
     'distance_to_home_m',CASE WHEN v_home_distance IS NULL THEN NULL
        ELSE round(v_home_distance,0) END,
     'source','live_raw_gps_v20261106'
   ));
 END LOOP;
 RETURN v_result;
END;
$function$
;

REVOKE ALL ON FUNCTION public.gps_director360_classify_stops_v20261106(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.gps_director360_classify_stops_v20261106(uuid) TO authenticated,service_role;
