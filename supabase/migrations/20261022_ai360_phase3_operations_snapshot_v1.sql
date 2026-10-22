CREATE OR REPLACE FUNCTION public.crm_ai360_operations_snapshot_v1(p_manager text DEFAULT NULL::text, p_month date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
 SET statement_timeout TO '10s'
AS $function$
with
 params as (
   select date_trunc('month',coalesce(p_month,(now() at time zone 'Europe/Minsk')::date))::date as m,
          (now() at time zone 'Europe/Minsk')::date as today,
          nullif(trim(p_manager),'') manager
 ),
 periods as (
   select m,today,manager,
          (m-interval '1 month')::date as completed_month,
          (m-interval '13 months')::date as completed_year_ago
   from params
 ),
 active as materialized (
   select c.id, c.name, c.manager_name,c.region
   from public.clients c cross join periods p
   where not coalesce(c.is_archived,false) and not coalesce(c.to_delete,false)
     and (p.manager is null or lower(trim(c.manager_name))=lower(trim(p.manager)))
 ),
 sales as materialized (
   select c.id client_id,
          round(coalesce(sum(ph.revenue) filter(where ph.month=p.completed_month),0),2) closed_month,
          round(coalesce(sum(ph.revenue) filter(where ph.month=p.completed_year_ago),0),2) closed_year_ago,
          round(coalesce(sum(ph.revenue) filter(where ph.month=p.m),0),2) current_month,
          count(ph.id) filter(where ph.month=p.m)::int current_rows,
          count(ph.id) filter(where ph.month=p.completed_month)::int closed_rows,
          count(ph.id) filter(where ph.month=p.completed_year_ago)::int year_ago_rows
   from active c cross join periods p
   left join public.purchase_history ph on ph.client_id=c.id
     and ph.month in (p.m,p.completed_month,p.completed_year_ago)
   group by c.id
 ),
 last_visits as materialized (
   select v.client_id,max(v.date) last_visit,
          count(*) filter(where v.date>=(select today-interval '90 days' from periods))::int visits_90d
   from public.visits v join active c on c.id=v.client_id
   where not coalesce(v.is_duplicate,false)
     and v.date<=(select today from periods)
   group by v.client_id
 ),
 task_by_client as materialized (
   select t.client_id,
          count(*) filter(where not coalesce(t.done,false))::int open_tasks,
          count(*) filter(where not coalesce(t.done,false) and t.due_date<(select today from periods))::int overdue_tasks
   from public.tasks t join active c on c.id=t.client_id
   group by t.client_id
 ),
 route_by_client as materialized (
   select r.client_id,
      min(r.visit_date) filter(where r.visit_date between (select today from periods)
                        and (select today+30 from periods)) next_route
   from public.route_plans r join active c on c.id=r.client_id
   where not coalesce(r.removed,false) and r.visit_date>=(select today from periods)
   group by r.client_id
 ),
 ranked as materialized (
   select c.id,c.name,c.manager_name,
      s.closed_month,s.closed_year_ago,s.current_month,
      s.current_rows,s.closed_rows,s.year_ago_rows,
      round(s.closed_month-s.closed_year_ago,2) closed_delta,
      lv.last_visit,coalesce(lv.visits_90d,0) visits_90d,
      coalesce(t.open_tasks,0) open_tasks,coalesce(t.overdue_tasks,0) overdue_tasks,
      r.next_route,
      case when s.closed_year_ago>0 then round((s.closed_month/s.closed_year_ago-1)*100,1) end yoy_closed_pct
   from active c join sales s on s.client_id=c.id
   left join last_visits lv on lv.client_id=c.id
   left join task_by_client t on t.client_id=c.id
   left join route_by_client r on r.client_id=c.id
 ),
 debt_current as materialized (
   select d.client_name, d.manager_name, d.debt_overdue, d.debt_overdue_days,d.report_date
   from public.client_debt d cross join periods p
   where d.report_date=(select max(report_date) from public.client_debt)
     and (p.manager is null or lower(split_part(trim(d.manager_name),' ',1))=lower(trim(p.manager)))
     and coalesce(d.debt_overdue,0)>0
 ),
 task_summary as (
   select count(*)::int all_tasks,
       count(*) filter(where not coalesce(t.done,false))::int open_tasks,
       count(*) filter(where not coalesce(t.done,false) and t.due_date<p.today)::int overdue_tasks
   from public.tasks t cross join periods p
   where p.manager is null or lower(trim(t.manager_name))=lower(trim(p.manager))
 ),
 visit_summary as (
   select count(*) filter(where v.date between p.today-89 and p.today)::int visits_90d,
          max(v.date) last_visit
   from public.visits v cross join periods p
   where not coalesce(v.is_duplicate,false)
     and (p.manager is null or lower(trim(v.manager_name))=lower(trim(p.manager)))
 ),
 route_summary as (
   select count(*) filter(where r.visit_date between p.today and p.today+30)::int planned_next30,
          count(*) filter(where r.visit_date between p.today and p.today+30 and coalesce(r.approved,false))::int approved_next30
   from public.route_plans r cross join periods p
   where not coalesce(r.removed,false)
     and (p.manager is null or lower(trim(r.manager_name))=lower(trim(p.manager)))
 ),
 debt_summary as (
   select coalesce(round(sum(debt_overdue),2),0) amount,
          count(*)::int debtor_rows,
          count(*) filter(where debt_overdue_days>=30)::int rows_30d,
          count(*) filter(where debt_overdue_days>=60)::int rows_60d,
          max(report_date) report_date
   from debt_current
 ),
 client_summary as (
   select count(*)::int active_clients,
     count(*) filter(where current_rows>0)::int buying_clients_in_month,
     count(*) filter(where closed_year_ago>0 and closed_month<closed_year_ago)::int yoy_down_clients,
     coalesce(round(sum(closed_month),2),0) closed_sales_linked,
     coalesce(round(sum(closed_year_ago),2),0) year_ago_sales_linked,
     coalesce(round(sum(current_month),2),0) current_sales_linked,
     count(*) filter(where year_ago_rows=0)::int clients_no_linked_yoy_baseline
   from ranked
 )
select jsonb_build_object(
 'period',jsonb_build_object('selected_month',to_char(p.m,'YYYY-MM'),
   'last_closed_month',to_char(p.completed_month,'YYYY-MM'),
   'last_closed_year_ago',to_char(p.completed_year_ago,'YYYY-MM'),
   'as_of',p.today),
 'scope',coalesce(p.manager,'вся доступная клиентская сеть'),
 'client_summary',(select to_jsonb(s) from client_summary s),
 'task_summary',(select to_jsonb(s) from task_summary s),
 'visit_summary',(select to_jsonb(s) from visit_summary s),
 'route_summary',(select to_jsonb(s) from route_summary s),
 'debt_summary',(select to_jsonb(s) from debt_summary s),
 'declining_clients',coalesce((
   select jsonb_agg(to_jsonb(z) order by z.loss desc) from (
    select left(r.name,100) client_name,
           left(coalesce(r.manager_name,''),65) manager_name,
           r.closed_month,r.closed_year_ago,r.yoy_closed_pct,
           round(r.closed_year_ago-r.closed_month,2) loss,
           r.current_month,r.last_visit,r.visits_90d,
           r.open_tasks,r.overdue_tasks,r.next_route
    from ranked r where r.closed_year_ago>0 and r.closed_month<r.closed_year_ago
    order by r.closed_year_ago-r.closed_month desc,r.name limit 8
   ) z
 ),'[]'::jsonb),
 'overdue_debtors',coalesce((
   select jsonb_agg(to_jsonb(z) order by z.debt_overdue desc) from (
     select left(client_name,100) client_name,
       left(manager_name,65) manager_name,
       round(debt_overdue,2) debt_overdue, debt_overdue_days,report_date
     from debt_current
     order by debt_overdue desc,client_name limit 8
   ) z
 ),'[]'::jsonb),
 'overdue_tasks_sample',coalesce((
   select jsonb_agg(to_jsonb(z) order by z.due_date asc) from (
     select left(coalesce(c.name,'Клиент не привязан'),100) client_name,
       left(coalesce(nullif(t.title,''),nullif(t.text,''),'Задача без названия'),120) title,
       t.due_date, left(coalesce(t.manager_name,''),60) manager_name
     from public.tasks t cross join periods p
     left join public.clients c on c.id=t.client_id
     where not coalesce(t.done,false) and t.due_date<p.today
       and (p.manager is null or lower(trim(t.manager_name))=lower(trim(p.manager)))
     order by t.due_date asc, t.id limit 6
   ) z
 ),'[]'::jsonb),
 'warnings',jsonb_build_array(
   'Сравнение клиентов только по последнему ЗАКРЫТОМУ месяцу и тому же месяцу прошлого года; текущий месяц предварительный, дневная выручка недоступна.',
   'Клиентская выручка по client_id включает только связанные продажи. Остальные строки импорта не распределяются по клиентам и не добавляются искусственно.',
   'Клиенты закреплены за менеджерами в ТЕКУЩИЙ момент; исторические передачи менеджеру неизвестны.',
   'ПДЗ: имена менеджеров сопоставляются по ПЕРВОМУ слову ФИО, только на дату последнего отчёта. Связь долгов с client_id не подтверждена.',
   'Визиты отражают сохранённые записи без дубликатов и НЕ подтверждают физическую достоверность GPS.',
   'План маршрутов на следующие 30 дней — только не удалённые записи; посещение по плану не означает выполненный визит.',
   'Задачи и маршруты текущие на дату as_of даже при запросе исторических продаж. Предлагать поручения можно только как черновик для утверждения директором.'
 )
)
from periods p;
$function$
;
revoke all on function public.crm_ai360_operations_snapshot_v1(text,date) from public,anon,authenticated;
grant execute on function public.crm_ai360_operations_snapshot_v1(text,date) to service_role;
