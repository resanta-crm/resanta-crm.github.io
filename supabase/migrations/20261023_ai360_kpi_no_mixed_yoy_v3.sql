-- AI360 director KPI: avoid invalid YoY created by mixing leaderboard shipment with differently counted historical revenue.
-- Same current manager KPI as dashboard. Client completed-month comparisons are in the separate operations snapshot.
CREATE OR REPLACE FUNCTION public.crm_ai360_sales_kpi_snapshot_v1(p_month date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
 SET statement_timeout TO '12s'
AS $function$
with
  period as (
    select date_trunc('month',coalesce(p_month,(now() at time zone 'Europe/Minsk')::date))::date as m
  ),
  plans as materialized (
    select trim(k.manager_name) as manager_name,
           max(k.shipment_plan)::numeric plan,
           max(k.akb_plan)::numeric akb_plan,
           max(k.new_clients_plan)::numeric new_clients_plan
    from public.manager_kpi_plans k cross join period p
    where left(k.period_month,7)=to_char(p.m,'YYYY-MM')
      and trim(coalesce(k.manager_name,'')) <> ''
    group by trim(k.manager_name)
  ),
  totals as (
    select case when ph.month=p.m then trim(coalesce(ph.manager_name,''))
           else trim(coalesce(c.manager_name,ph.manager_name,'')) end manager_name,
      round(sum(coalesce(ph.revenue,0)) filter(where ph.month=p.m),2) actual,
      round(sum(coalesce(ph.revenue,0)) filter(where ph.month=(p.m-interval '1 year')::date),2) year_ago,
      count(distinct nullif(trim(ph.client_name),'')) filter(where ph.month=p.m and ph.revenue>0)::int clients_current
    from public.purchase_history ph
    left join public.clients c on c.id=ph.client_id
    cross join period p
    where ph.month in (p.m,(p.m-interval '1 year')::date)
      and lower(trim(coalesce(ph.client_name,''))) <> 'итого'
    group by 1
  ),
  dashboard as materialized (
    select manager_name,shipment
    from public.crm_manager_kpi_leaderboard(to_char((select m from period),'YYYY-MM'))
  ),
  managers as (
    select x.manager_name,
      coalesce(u.region,'Не указано') region,
      x.plan, x.akb_plan, x.new_clients_plan,
      coalesce(d.shipment,t.actual,0) actual,
      null::numeric year_ago,
      coalesce(t.clients_current,0) clients_current,
      case when x.plan>0 then round(coalesce(d.shipment,t.actual,0)/x.plan*100,1) end plan_pct,
      case when x.plan>0 then round(x.plan-coalesce(d.shipment,t.actual,0),2) end to_plan,
      null::numeric yoy_pct
    from plans x
    left join public.users u on lower(trim(u.name))=lower(x.manager_name) and u.role='manager'
    left join totals t on lower(t.manager_name)=lower(x.manager_name)
    left join dashboard d on public.crm_v2263_norm(d.manager_name)=public.crm_v2263_norm(x.manager_name)
  ),
  overall as (
    select round(coalesce(sum(coalesce(ph.revenue,0)) filter(where ph.month=p.m),0),2) network_actual,
           round(coalesce(sum(coalesce(ph.revenue,0)) filter(where ph.month=(p.m-interval '1 year')::date),0),2) network_year_ago
    from public.purchase_history ph cross join period p
    where ph.month in (p.m,(p.m-interval '1 year')::date)
      and lower(trim(coalesce(ph.client_name,''))) <> 'итого'
  )
select jsonb_build_object(
 'month',to_char((select m from period),'YYYY-MM'),
 'scope','KPI только менеджеров с утвержденными планами; остальные продажи показаны отдельно',
 'network_revenue', (select network_actual from overall),
 'network_year_ago', (select network_year_ago from overall),
 'planned_managers_revenue', (select coalesce(sum(actual),0) from managers),
 'planned_managers_plan', (select coalesce(sum(plan),0) from managers),
 'managers', coalesce((select jsonb_agg(to_jsonb(m) order by plan_pct asc nulls last,manager_name) from managers m),'[]'::jsonb),
 'freshness',(select jsonb_build_object('status',s.status,'last_success_at',s.last_success_at,'report_period',s.report_period,'report_date',s.report_date,'row_count',s.row_count)
              from public.crm_import_status s where s.source='sales' limit 1),
 'warnings',jsonb_build_array('Годовой процент изменения продаж по менеджерам временно не рассчитывается: текущий факт соответствует KPI-панели, а прошлогодняя исходная выручка рассчитывалась другой методикой. Нельзя сравнивать эти значения как равнозначные.','План/факт менеджеров основан на том же источнике crm_manager_kpi_leaderboard, что и страница Менеджеры · KPI; он использует правило положительных отгрузок и сопоставление клиентов по алиасам. Общая выручка сети — отдельный расчёт по импорту, поэтому суммы могут различаться.','Импорт продаж помесячный: не делать вид, что известны продажи за конкретный день.',
                              'Октябрь прошлого года по менеджерам сопоставлен с текущим закреплением клиентов по client_id: это портфель текущих менеджеров, исторический менеджер 2025 года в исходных строках отсутствует; часть записей может не попасть в менеджерские итоги.',
                              'Планы менеджеров не являются планами филиалов. Привязка выручки к менеджеру взята из поля manager_name импорта; нераспределённые суммы остаются только в итоговом обороте.',
                              'Причины падения и прогноз конца месяца без дополнительных данных не являются доказанными фактами.')
)
$function$
;
revoke all on function public.crm_ai360_sales_kpi_snapshot_v1(date) from public,anon,authenticated;
grant execute on function public.crm_ai360_sales_kpi_snapshot_v1(date) to service_role;
