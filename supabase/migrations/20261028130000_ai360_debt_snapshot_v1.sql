-- Dedicated director-only, read-only debt snapshot. No purchases, GPS,
-- task or route tables are touched by a debt question.
-- Backend-only: execute privilege is withheld from all client roles.
CREATE OR REPLACE FUNCTION public.crm_ai360_debt_snapshot_v1(p_manager text DEFAULT NULL)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path TO ''
SET statement_timeout TO '3500ms'
AS $function$
WITH last_report AS MATERIALIZED (
 SELECT max(report_date) AS report_date FROM public.client_debt
), current_debt AS MATERIALIZED (
 SELECT left(d.client_name,100) AS client_name,
        left(d.manager_name,85) AS manager_name,
        d.debt_overdue::numeric AS debt_overdue,
        d.debt_overdue_days::int AS debt_overdue_days,
        d.report_date
 FROM public.client_debt d CROSS JOIN last_report lr
 WHERE d.report_date=lr.report_date
   AND coalesce(d.debt_overdue,0)>0
   AND (nullif(trim(p_manager),'') IS NULL OR
        lower(split_part(trim(d.manager_name),' ',1))=lower(trim(p_manager)))
), totals AS (
 SELECT coalesce(round(sum(debt_overdue),2),0) AS amount,
        count(*)::int AS debtor_rows,
        count(*) FILTER (WHERE debt_overdue_days>=30)::int AS rows_30d,
        count(*) FILTER (WHERE debt_overdue_days>=60)::int AS rows_60d,
        max(report_date) AS report_date
 FROM current_debt
)
SELECT jsonb_build_object(
 'source','crm_ai360_debt_snapshot_v1',
 'scope',coalesce(nullif(trim(p_manager),''),'все менеджеры'),
 'debt_summary',jsonb_build_object(
   'amount',(SELECT amount FROM totals),
   'debtor_rows',(SELECT debtor_rows FROM totals),
   'rows_30d',(SELECT rows_30d FROM totals),
   'rows_60d',(SELECT rows_60d FROM totals),
   'report_date',(SELECT report_date FROM last_report)),
 'overdue_debtors',coalesce((
   SELECT jsonb_agg(to_jsonb(z) ORDER BY z.debt_overdue DESC,z.client_name)
   FROM (SELECT client_name,manager_name,round(debt_overdue,2) AS debt_overdue,
                debt_overdue_days,report_date
         FROM current_debt ORDER BY debt_overdue DESC,client_name LIMIT 8) z
 ),'[]'::jsonb),
 'manager_totals',coalesce((
   SELECT jsonb_agg(to_jsonb(g) ORDER BY g.amount DESC,g.manager_name)
   FROM (SELECT manager_name,round(sum(debt_overdue),2) AS amount,
                count(*)::int AS debtor_rows
         FROM current_debt GROUP BY manager_name) g
 ),'[]'::jsonb),
 'warnings',jsonb_build_array(
  'ПДЗ рассчитана только по последней дате загруженного отчёта.',
  'Показаны восемь крупнейших долгов; это не весь реестр должников.',
  'Просрочка от 60 дней уже включена в число строк от 30 дней.',
  'Привязка ПДЗ к менеджеру выполняется по первому слову ФИО в отчёте; связь с client_id не подтверждена.'
 )
);
$function$;
REVOKE ALL ON FUNCTION public.crm_ai360_debt_snapshot_v1(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.crm_ai360_debt_snapshot_v1(text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crm_ai360_debt_snapshot_v1(text) TO service_role;
