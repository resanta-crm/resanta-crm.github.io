-- RESANTA AI Core 4.2: read-only category evidence & confirmed next-two-day client visits/tasks.
-- Exact client UUID is resolved by the server, not guessed by the language model.
CREATE OR REPLACE FUNCTION public.crm_ai360_client_groups_v42(
  p_client_id uuid, p_month date DEFAULT NULL
) RETURNS jsonb LANGUAGE sql STABLE
SET search_path TO '' SET statement_timeout TO '12s' AS $fn$
WITH c AS (
 SELECT id,name,manager_name FROM public.clients
 WHERE id=p_client_id AND coalesce(to_delete,false)=false
),
bounds AS (
 SELECT least(
   date_trunc('month',coalesce(p_month,(now() AT TIME ZONE 'Europe/Minsk')::date))::date,
   (date_trunc('month',(now() AT TIME ZONE 'Europe/Minsk')::date)-interval '1 month')::date
 ) AS last_complete
),
periods AS (
 SELECT (last_complete-interval '2 months')::date AS recent_start,last_complete AS recent_end,
 (last_complete-interval '1 year 2 months')::date AS previous_start,
 (last_complete-interval '1 year')::date AS previous_end FROM bounds
),
sales AS (
 SELECT coalesce(nullif(trim(ph.category),''),'Без группы') AS category,
 coalesce(sum(ph.revenue) FILTER (WHERE ph.month>=p.recent_start AND ph.month<=p.recent_end),0) AS current_revenue,
 coalesce(sum(ph.revenue) FILTER (WHERE ph.month>=p.previous_start AND ph.month<=p.previous_end),0) AS previous_revenue,
 count(*) FILTER (WHERE ph.month>=p.recent_start AND ph.month<=p.recent_end) AS current_rows,
 count(*) FILTER (WHERE ph.month>=p.previous_start AND ph.month<=p.previous_end) AS previous_rows
 FROM c CROSS JOIN periods p
 JOIN public.purchase_history ph ON ph.client_id=c.id
 WHERE (ph.month BETWEEN p.recent_start AND p.recent_end)
 OR (ph.month BETWEEN p.previous_start AND p.previous_end)
 GROUP BY coalesce(nullif(trim(ph.category),''),'Без группы')
),
groups AS (
 SELECT category,round(current_revenue,2) AS current_byn,round(previous_revenue,2) AS previous_byn,
 round(current_revenue-previous_revenue,2) AS delta_byn,
 CASE WHEN previous_revenue>0 THEN round((current_revenue-previous_revenue)*100/previous_revenue,1) ELSE NULL END AS change_pct,
 current_rows,previous_rows
 FROM sales
),
tot AS (
 SELECT round(coalesce(sum(current_byn),0),2) AS current_byn,
 round(coalesce(sum(previous_byn),0),2) AS previous_byn,
 count(*)::int AS category_count,
 coalesce(sum(current_rows),0)::int AS current_rows,
 coalesce(sum(previous_rows),0)::int AS previous_rows FROM groups
)
SELECT jsonb_build_object(
 'source','purchase_history by exact client UUID',
 'scope','client_all',
 'client_id',p_client_id,
 'client_name',(SELECT name FROM c),
 'manager',(SELECT manager_name FROM c),
 'currency','BYN',
 'recent_period',(SELECT to_char(recent_start,'YYYY-MM')||'..'||to_char(recent_end,'YYYY-MM') FROM periods),
 'previous_period',(SELECT to_char(previous_start,'YYYY-MM')||'..'||to_char(previous_end,'YYYY-MM') FROM periods),
 'current_byn',(SELECT current_byn FROM tot),
 'previous_byn',(SELECT previous_byn FROM tot),
 'delta_byn',(SELECT current_byn-previous_byn FROM tot),
 'category_count',(SELECT category_count FROM tot),
 'current_rows',(SELECT current_rows FROM tot),
 'previous_rows',(SELECT previous_rows FROM tot),
 'groups',coalesce((SELECT jsonb_agg(to_jsonb(g) ORDER BY delta_byn ASC,category)
  FROM (SELECT * FROM groups ORDER BY delta_byn ASC,category LIMIT 10) g),'[]'::jsonb),
 'partial',(SELECT category_count>10 FROM tot),
 'limitations','Three COMPLETED calendar months vs same previous-year months; no unlinked client_name sales included; absent shipment is not proof of lost retail demand'
) WHERE EXISTS(SELECT 1 FROM c);
$fn$;

CREATE OR REPLACE FUNCTION public.crm_ai360_client_schedule_v42(
  p_client_id uuid
) RETURNS jsonb LANGUAGE sql STABLE
SET search_path TO '' SET statement_timeout TO '8s' AS $fn$
WITH today AS (SELECT (now() AT TIME ZONE 'Europe/Minsk')::date AS d),
c AS (SELECT id,name,manager_name FROM public.clients WHERE id=p_client_id AND coalesce(to_delete,false)=false),
routes AS (
 SELECT r.visit_date,r.manager_name,r.city,r.planned_start,r.planned_end,r.review_status,
 r.approved,r.visited
 FROM public.route_plans r CROSS JOIN today t JOIN c ON c.id=r.client_id
 WHERE r.visit_date BETWEEN t.d AND t.d+1
 AND r.approved=true AND r.review_status='approved' AND coalesce(r.removed,false)=false
),
task_rows AS (
 SELECT x.due_date,x.manager_name,coalesce(nullif(x.title,''),x.text) AS title,x.priority,
 x.review_status
 FROM public.tasks x CROSS JOIN today t JOIN c ON c.id=x.client_id
 WHERE x.due_date BETWEEN t.d AND t.d+1 AND x.review_status='approved'
 AND coalesce(x.done,false)=false
)
SELECT jsonb_build_object(
 'scope','client_all',
 'source','approved route_plans and approved open tasks by client_id',
 'client_id',p_client_id,'client_name',(SELECT name FROM c),
 'manager',(SELECT manager_name FROM c),
 'today',(SELECT d FROM today),'tomorrow',(SELECT d+1 FROM today),
 'route_count',(SELECT count(*) FROM routes),
 'task_count',(SELECT count(*) FROM task_rows),
 'routes',coalesce((SELECT jsonb_agg(to_jsonb(r) ORDER BY visit_date,planned_start NULLS LAST)
   FROM (SELECT * FROM routes ORDER BY visit_date,planned_start NULLS LAST LIMIT 12) r),'[]'::jsonb),
 'tasks',coalesce((SELECT jsonb_agg(to_jsonb(t) ORDER BY due_date,priority)
   FROM (SELECT * FROM task_rows ORDER BY due_date,priority LIMIT 12) t),'[]'::jsonb),
 'partial',(SELECT (SELECT count(*) FROM routes)>12 OR (SELECT count(*) FROM task_rows)>12),
 'limitations','Only approved, not-removed routes and approved open tasks linked to client_id are included. A missing record does not prove no offline plan exists.'
) WHERE EXISTS(SELECT 1 FROM c);
$fn$;

REVOKE ALL ON FUNCTION public.crm_ai360_client_groups_v42(uuid,date) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.crm_ai360_client_schedule_v42(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.crm_ai360_client_groups_v42(uuid,date) TO service_role;
GRANT EXECUTE ON FUNCTION public.crm_ai360_client_schedule_v42(uuid) TO service_role;