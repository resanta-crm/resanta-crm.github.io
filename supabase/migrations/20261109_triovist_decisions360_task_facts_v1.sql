-- Triovist Decisions360: read-only current 1C evidence for brainstorm-v2 subgroup tasks.
-- No task status changes, payroll writes, 1C sales updates or parser changes.
CREATE OR REPLACE FUNCTION public.triovist_decisions360_task_facts_v1(
  p_month date DEFAULT date_trunc('month',current_date)::date,
  p_manager_email text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public','auth','pg_catalog'
AS $function$
DECLARE
 a record;
 v_month date:=date_trunc('month',coalesce(p_month,current_date))::date;
 v_filter text:=lower(btrim(coalesce(p_manager_email,'')));
 v_count bigint;
 v_import_at timestamptz;
 v_facts jsonb;
BEGIN
 SELECT * INTO a FROM public.triovist_content_actor();
 IF a.actor_email IS NULL THEN RAISE EXCEPTION 'Нет авторизации'; END IF;
 IF a.actor_role='boss' AND a.actor_email IN ('payushin_ar@resanta.ru','sidarovich_kn@resanta.ru') THEN
   IF v_filter NOT IN ('','aleksandrenko_av@resanta.ru','krishtal_na@resanta.ru')
   THEN RAISE EXCEPTION 'Неизвестный менеджер'; END IF;
 ELSIF a.actor_scope='triovist'
   AND a.actor_email IN ('aleksandrenko_av@resanta.ru','krishtal_na@resanta.ru') THEN
   v_filter:=a.actor_email;
 ELSE RAISE EXCEPTION 'Нет доступа к задачам Триовист'; END IF;
 IF v_month>date_trunc('month',current_date)::date THEN
   RAISE EXCEPTION 'Будущий месяц не подтверждён'; END IF;

 SELECT count(*),max(o.imported_at) INTO v_count,v_import_at
 FROM public.triovist_sales_override o WHERE o.month=v_month;

 WITH chosen AS MATERIALIZED (
   SELECT t.id,t.manager_email,t.group_name,t.target_revenue,t.baseline_revenue,
          t.commercial_context->>'subgroup' subgroup,
          lower(btrim(regexp_replace(
            coalesce(t.commercial_context->>'subgroup',''),
            '\s+(Ресанта|Вихрь|Huter|Eurolux)\s*$','','i'))) base_subgroup,
          CASE
            WHEN coalesce(t.commercial_context->>'subgroup','') ~* '\s+Ресанта\s*$' THEN 'ресанта'
            WHEN coalesce(t.commercial_context->>'subgroup','') ~* '\s+Вихрь\s*$' THEN 'вихрь'
            WHEN coalesce(t.commercial_context->>'subgroup','') ~* '\s+Huter\s*$' THEN 'huter'
            WHEN coalesce(t.commercial_context->>'subgroup','') ~* '\s+Eurolux\s*$' THEN 'eurolux'
            ELSE NULL END expected_brand
   FROM public.triovist_ai_tasks t
   WHERE t.generator_version='uni-brainstorm-subgroup-v2'
     AND t.period_month=v_month
     AND (v_filter='' OR lower(t.manager_email)=v_filter)
     AND t.status NOT IN ('cancelled','not_relevant')
 ), facts AS (
   SELECT t.*, count(o.id) AS matched_lines,coalesce(sum(o.revenue),0)::numeric(16,2) AS matched_revenue,
          jsonb_agg(DISTINCT o.subgroup) FILTER(WHERE o.id IS NOT NULL) AS matched_subgroups
   FROM chosen t
   LEFT JOIN public.triovist_sales_override o
     ON o.month=v_month
     AND nullif(btrim(t.subgroup),'') IS NOT NULL
     AND (
       public.triovist_norm(o.subgroup)=public.triovist_norm(t.subgroup)
       OR (t.expected_brand IS NOT NULL
           AND public.triovist_norm(o.subgroup)=public.triovist_norm(t.base_subgroup))
     )
     AND (t.expected_brand IS NULL
       OR lower(coalesce(o.product,'')) LIKE '%'||t.expected_brand||'%')
     AND public.triovist_norm(public.triovist_resolve_group(o.category,o.subgroup))
         =public.triovist_norm(t.group_name)
     AND btrim(coalesce(o.sku,'')) !~* '^900(/|$)'
   GROUP BY t.id,t.manager_email,t.group_name,t.target_revenue,t.baseline_revenue,
            t.subgroup,t.base_subgroup,t.expected_brand
 )
 SELECT coalesce(jsonb_agg(jsonb_build_object(
   'task_id',f.id,'manager_email',f.manager_email,'subgroup',f.subgroup,
   'fact_by_task',CASE WHEN v_count>0 AND nullif(btrim(f.subgroup),'') IS NOT NULL
        THEN f.matched_revenue ELSE NULL END,
   'target',f.target_revenue,'baseline',f.baseline_revenue,
   'matched_lines',f.matched_lines,'matched_subgroups',coalesce(f.matched_subgroups,'[]'::jsonb),
   'fact_pct',CASE WHEN f.target_revenue>0 AND v_count>0 THEN
       round(least(100,greatest(0,f.matched_revenue/f.target_revenue*100)),1) ELSE NULL END,
   'brand_filter',f.expected_brand,
   'fact_status',CASE WHEN v_count=0 THEN 'sales_source_missing'
      WHEN nullif(btrim(f.subgroup),'') IS NULL THEN 'subgroup_missing'
      WHEN f.matched_lines=0 THEN 'no_matched_sales' ELSE 'subgroup_and_brand_verified' END,
   'source','1С · продажи 21vek · точная подгруппа и бренд; возвраты не добавлены',
   'imported_at',v_import_at
 ) ORDER BY f.manager_email,f.subgroup),'[]'::jsonb)
 INTO v_facts FROM facts f;
 RETURN jsonb_build_object(
   'month',v_month,'facts',coalesce(v_facts,'[]'::jsonb),
   'sales_imported_at',v_import_at,'source_rows',v_count,
   'source','triovist_sales_override 1C / subgroup and brand match',
   'note','Факты задач нельзя складывать: несколько задач могут относиться к одной подгруппе. Статусы и премия не меняются.');
END;
$function$;
REVOKE ALL ON FUNCTION public.triovist_decisions360_task_facts_v1(date,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.triovist_decisions360_task_facts_v1(date,text) TO authenticated;
