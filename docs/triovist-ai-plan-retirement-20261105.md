# Триовист · отмена устаревшего генератора задач (05.11.2026)

Это запись о **уже применённом** исправлении в Supabase (migration `triovist_disable_discarded_subgroup_tasks_v236254_20261105`). Она не является новым генератором и не выполняется при публикации Pages.

- Серверная функция `triovist_tasks_generate_subgroup_v236254` теперь после прежней проверки прав возвращает управляемую ошибку о прекращении старой методики. Старый alias `v227319` ведёт к той же функции.
- Пакет очистки `20261105_retire_subgroup_plan_v236254`: 53 системные задачи версии v23.6.254 удалены после архивирования 53 оригинальных строк и 79 событий в `triovist_task_cleanup_backup_v2273021`. Другие исторические задачи не тронуты.
- Полноценную новую методику считать не внедрённой: сначала согласование расчёта по остаткам, сезонности, динамике продаж и доступности SKU.
- Следующий генератор должен быть отдельной версией RPC и отдельным согласованным PR.

## Серверный защитный контракт (зафиксированная функция)

```sql
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
```
