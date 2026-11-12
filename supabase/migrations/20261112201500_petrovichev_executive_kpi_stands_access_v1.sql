-- 2026-11-12. Petrovichev executive supervisor access: exact-identity and role bound.
-- Extend the FOUR existing Vitebsk KPI360 endpoints without changing sales formulas,
-- ranking, filters, role grants, or other users' permissions.
-- The KPI source continues to describe the existing Vitebsk team, not a fabricated network aggregate.
DO $petrovichev_kpi$
DECLARE
  v_name text;
  v_source text;
  v_patched text;
  v_marker text := E'  ) then raise exception ''not_authorized''; end if;';
  v_addition text := E'    or\n    (actor.role=''boss''\n     and actor.id=''a24954b8-2fe1-4852-b629-d8f351e1bd36''::uuid\n     and lower(actor.email)=''petrovichev@resanta.ru''\n     and actor.access_scope=''standard''\n     and actor.region=''Все филиалы'')\n  ) then raise exception ''not_authorized''; end if;';
  v_target_count int;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.users u JOIN auth.users a ON a.id=u.id
    WHERE u.id='a24954b8-2fe1-4852-b629-d8f351e1bd36'::uuid
      AND lower(u.email)='petrovichev@resanta.ru'
      AND lower(a.email)=lower(u.email)
      AND a.email_confirmed_at IS NOT NULL
      AND u.role='boss' AND u.access_scope='standard' AND u.region='Все филиалы'
  ) THEN RAISE EXCEPTION 'Petrovichev identity/scope/role failed preflight'; END IF;
  FOREACH v_name IN ARRAY ARRAY[
      'crm_manager_kpi360_dashboard_v2',
      'crm_manager_kpi360_history_v3',
      'crm_manager_kpi360_history_v4',
      'crm_manager_kpi360_yoy_v1'
    ]
  LOOP
    SELECT pg_get_functiondef(p.oid) INTO v_source
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname=v_name
      AND pg_get_function_identity_arguments(p.oid)='p_month text';
    IF v_source IS NULL THEN
      RAISE EXCEPTION 'Missing KPI RPC: %',v_name;
    END IF;
    -- Idempotent across database environments: never duplicate a previously patched guard.
    IF position('actor.id=''a24954b8-2fe1-4852-b629-d8f351e1bd36''::uuid' IN v_source)>0
       AND position('actor.access_scope=''standard''' IN v_source)>0 THEN
      CONTINUE;
    END IF;
    v_target_count := (length(v_source)-length(replace(v_source,v_marker,''))) / length(v_marker);
    IF v_target_count<>1 OR position('actor.role' IN v_source)=0 THEN
      RAISE EXCEPTION 'Unexpected KPI function guard for % (matches: %)',v_name,v_target_count;
    END IF;
    v_patched := replace(v_source,v_marker,v_addition);
    EXECUTE v_patched;
  END LOOP;
  -- A distinct stand role is required even for users with public.users.role=boss.
  -- DFS matches network director's scope. Existing rows/roles remain untouched.
  INSERT INTO public.stand_roles_v236346(user_id,stand_role)
  SELECT u.id, 'dfs' FROM public.users u JOIN auth.users a ON a.id=u.id
  WHERE u.id='a24954b8-2fe1-4852-b629-d8f351e1bd36'::uuid
    AND lower(u.email)='petrovichev@resanta.ru'
    AND u.role='boss' AND u.access_scope='standard' AND u.region='Все филиалы'
    AND lower(a.email)=lower(u.email)
  ON CONFLICT (user_id) DO NOTHING;
  IF NOT EXISTS (
    SELECT 1 FROM public.stand_roles_v236346
    WHERE user_id='a24954b8-2fe1-4852-b629-d8f351e1bd36'::uuid AND stand_role='dfs'
  ) THEN RAISE EXCEPTION 'Stand supervisor role not enabled'; END IF;
END $petrovichev_kpi$;
