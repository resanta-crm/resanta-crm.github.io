-- Corrective Client 360 functions. Existing 1C clients, visits, GPS samples, and routes are not modified.
-- All mutations are explicit, director-only, audited through existing auth and database roles.

CREATE OR REPLACE FUNCTION public.client360_manage_entity_v2(
 p_entity_id uuid, p_name text, p_unlink_client_ids uuid[] DEFAULT '{}'::uuid[]
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $$
DECLARE v_role text;v_email text;v_previous text;v_n int:=0;v_new text;
BEGIN
 SELECT u.role,lower(a.email) INTO v_role,v_email
 FROM public.users u JOIN auth.users a ON a.id=u.id
 WHERE u.id=auth.uid() AND lower(a.email)=lower(u.email) AND a.email_confirmed_at IS NOT NULL;
 IF v_role<>'boss' OR v_email NOT IN ('payushin_ar@resanta.ru','sidarovich_kn@resanta.ru')
 THEN RAISE EXCEPTION 'Только ДФС и ДФ могут изменять связи юрлиц' USING errcode='42501';END IF;
 IF p_entity_id IS NULL THEN RAISE EXCEPTION 'Выберите юрлицо';END IF;
 SELECT name INTO v_previous FROM public.client360_entities_v1 WHERE id=p_entity_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Юрлицо не найдено';END IF;
 v_new:=btrim(coalesce(p_name,''));
 IF length(v_new) NOT BETWEEN 3 AND 160 THEN RAISE EXCEPTION 'Название: от 3 до 160 символов';END IF;
 IF EXISTS(SELECT 1 FROM public.client360_entities_v1 e WHERE lower(btrim(e.name))=lower(v_new) AND e.id<>p_entity_id)
 THEN RAISE EXCEPTION 'Юрлицо с таким названием уже существует';END IF;
 IF coalesce(array_length(p_unlink_client_ids,1),0)>150 THEN RAISE EXCEPTION 'Слишком много карточек за одну операцию';END IF;
 UPDATE public.client360_entities_v1 SET name=v_new WHERE id=p_entity_id;
 WITH removed AS (
  DELETE FROM public.client360_entity_clients_v1 ec
  WHERE ec.entity_id=p_entity_id AND ec.client_id=ANY(coalesce(p_unlink_client_ids,'{}'::uuid[]))
  RETURNING 1
 ) SELECT count(*)::int INTO v_n FROM removed;
 RETURN jsonb_build_object('ok',true,'entity_id',p_entity_id,'name',v_new,'old_name',v_previous,'unlinked',v_n);
END $$;

CREATE OR REPLACE FUNCTION public.client360_update_store_v2(
 p_point_id uuid, p_city text, p_address text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $$
DECLARE v_role text;v_email text;v_old public.route_physical_points%rowtype;
BEGIN
 SELECT u.role,lower(a.email) INTO v_role,v_email
 FROM public.users u JOIN auth.users a ON a.id=u.id
 WHERE u.id=auth.uid() AND lower(a.email)=lower(u.email) AND a.email_confirmed_at IS NOT NULL;
 IF v_role<>'boss' OR v_email NOT IN ('payushin_ar@resanta.ru','sidarovich_kn@resanta.ru')
 THEN RAISE EXCEPTION 'Только ДФС и ДФ могут изменять адреса торговых точек' USING errcode='42501';END IF;
 IF length(btrim(coalesce(p_city,''))) NOT BETWEEN 2 AND 100 OR
    length(btrim(coalesce(p_address,''))) NOT BETWEEN 5 AND 220
 THEN RAISE EXCEPTION 'Укажите город и полный адрес торговой точки';END IF;
 SELECT * INTO v_old FROM public.route_physical_points WHERE id=p_point_id FOR UPDATE;
 IF NOT FOUND OR coalesce(v_old.active,true)=false THEN RAISE EXCEPTION 'Торговая точка не найдена';END IF;
 IF btrim(v_old.city) IS DISTINCT FROM btrim(p_city) OR btrim(v_old.address) IS DISTINCT FROM btrim(p_address) THEN
  UPDATE public.route_physical_points
  SET city=btrim(p_city), address=btrim(p_address),geocode_status='pending',updated_at=now()
  WHERE id=p_point_id;
 END IF;
 -- Coordinates and historical routes/GPS are preserved; pending means address needs reconfirmation.
 RETURN jsonb_build_object('ok',true,'point_id',p_point_id,'needs_geocode',true);
END $$;

CREATE OR REPLACE FUNCTION public.client360_route_labels_v2()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $$
DECLARE v_role text;v_name text;v_out jsonb;
BEGIN
 SELECT u.role,u.name INTO v_role,v_name FROM public.users u JOIN auth.users a ON a.id=u.id
 WHERE u.id=auth.uid() AND lower(a.email)=lower(u.email) AND a.email_confirmed_at IS NOT NULL;
 IF v_role NOT IN ('boss','manager') THEN RAISE EXCEPTION 'Нет доступа' USING errcode='42501';END IF;
 SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) INTO v_out
 FROM (
  SELECT ec.client_id,ec.entity_id,e.name entity_name
  FROM public.client360_entity_clients_v1 ec
  JOIN public.client360_entities_v1 e ON e.id=ec.entity_id
  JOIN public.clients c ON c.id=ec.client_id
  WHERE v_role='boss' OR lower(btrim(c.manager_name))=lower(btrim(v_name))
  ORDER BY e.name,c.name
  LIMIT 2500
 ) x;
 RETURN jsonb_build_object('ok',true,'labels',v_out);
END $$;

CREATE OR REPLACE FUNCTION public.client360_my_store_requests_v2()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $$
DECLARE v_role text;v_out jsonb;
BEGIN
 SELECT u.role INTO v_role FROM public.users u JOIN auth.users a ON a.id=u.id
 WHERE u.id=auth.uid() AND lower(a.email)=lower(u.email) AND a.email_confirmed_at IS NOT NULL;
 IF v_role<>'manager' THEN RAISE EXCEPTION 'Только МПП' USING errcode='42501';END IF;
 SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.created_at DESC),'[]'::jsonb) INTO v_out
 FROM (
  SELECT r.id,r.status,r.city,r.address,r.created_at,r.comment,c.name client_name
  FROM public.client360_point_requests_v1 r
  JOIN public.clients c ON c.id=r.client_id
  WHERE r.manager_id=auth.uid() ORDER BY r.created_at DESC LIMIT 30
 ) x;
 RETURN jsonb_build_object('ok',true,'requests',v_out);
END $$;

REVOKE ALL ON FUNCTION public.client360_manage_entity_v2(uuid,text,uuid[]) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.client360_update_store_v2(uuid,text,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.client360_route_labels_v2() FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.client360_my_store_requests_v2() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.client360_manage_entity_v2(uuid,text,uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.client360_update_store_v2(uuid,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.client360_route_labels_v2() TO authenticated;
GRANT EXECUTE ON FUNCTION public.client360_my_store_requests_v2() TO authenticated;
