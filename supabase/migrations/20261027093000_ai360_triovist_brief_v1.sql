-- Director-only read-only Triovist aggregate for AI360 briefing.
-- SECURITY INVOKER; only service_role receives EXECUTE. Does NOT create tasks.
create or replace function public.crm_ai360_triovist_brief_v1(p_month date)
returns jsonb language sql stable security invoker
set search_path=public,pg_temp
as $$
with bounds as (
 select date_trunc('month',coalesce(p_month,(now() at time zone 'Europe/Minsk')::date))::date as mon
),
actual as (
 select count(*)::int as positions, coalesce(round(sum(c.revenue)::numeric,2),0) as revenue
 from public.triovist_sales_resolved_cache c,bounds b where c.month=b.mon
),
plans as (
 select count(*)::int as rows,coalesce(round(sum(p.plan_amount)::numeric,2),0) as amount
 from public.triovist_plans p,bounds b where p.period_month=b.mon
),
sales_upload as (
 select max(s.imported_at) as at from public.triovist_sales_imports s,bounds b where s.month=b.mon
),
stock as (
 select max(snapshot_date) filter(where source='partner') as partner_date,
        max(snapshot_date) filter(where source='chekhov') as chekhov_date
 from public.triovist_stock_import_log
),
task_counts as (
 select count(*) filter(where status='pending_approval')::int as pending,
        count(*) filter(where status='new')::int as new_tasks
 from public.triovist_ai_tasks
)
select jsonb_build_object(
 'month',b.mon,'revenue',a.revenue,'revenue_positions',a.positions,
 'plan',p.amount,'plan_rows',p.rows,'sales_import_at',i.at,
 'partner_stock_date',s.partner_date,'chekhov_stock_date',s.chekhov_date,
 'pending_approval',t.pending,'new_tasks',t.new_tasks,
 'basis','triovist_sales_resolved_cache / triovist_plans / triovist_stock_import_log'
)
from bounds b cross join actual a cross join plans p cross join sales_upload i
 cross join stock s cross join task_counts t;
$$;
revoke all on function public.crm_ai360_triovist_brief_v1(date) from PUBLIC,anon,authenticated;
grant execute on function public.crm_ai360_triovist_brief_v1(date) to service_role;
comment on function public.crm_ai360_triovist_brief_v1(date) is
 'Read-only director briefing: resolved month-to-date Triovist sales, plans, and stock freshness. Restricted to Edge service_role.';
