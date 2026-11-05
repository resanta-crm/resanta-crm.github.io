-- Triovist: retire deprecated 8/10/12/15 subgroup AI task generator.
-- This matches the verified production hotfix of 2026-11-05.
-- Historical task records were archived separately, not carried in the source repository.
-- Existing authorization checks are preserved; do not start a new generator until explicit approval.
CREATE OR REPLACE FUNCTION public.triovist_tasks_generate_subgroup_v236254(
  p_manager_email text,
  p_target_count integer,
  p_month_end date,
  p_rows jsonb,
  p_meta jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','auth','pg_catalog','pg_temp'
AS $disable$
DECLARE
  v_actor public.users%rowtype;
BEGIN
  SELECT * INTO v_actor FROM public.users WHERE id = auth.uid();
  IF v_actor.id IS NULL THEN
    RAISE EXCEPTION 'Требуется вход в CRM';
  END IF;
  IF COALESCE(v_actor.role,'') <> 'boss'
    AND lower(COALESCE(v_actor.email,'')) NOT IN ('payushin_ar@resanta.ru','sidarovich_kn@resanta.ru') THEN
    RAISE EXCEPTION 'Недостаточно прав для формирования плана Triovist';
  END IF;
  RAISE EXCEPTION 'Старая методика задач Триовист отключена руководителем 05.11.2026. Новый план будет формироваться только по новой согласованной методике.';
END;
$disable$;
