-- AI360 v4.1: truthful full-relation analytics for declining clients and warehouse quantities.
-- No grants to browsers, no write access. Dedicated server service-role RPC only.
CREATE OR REPLACE FUNCTION public.crm_ai360_client_risk_v41(
  p_manager text DEFAULT NULL,
  p_month date DEFAULT NULL
) RETURNS jsonb LANGUAGE sql STABLE SET search_path TO '' SET statement_timeout TO '12s'
AS $fn$
WITH bounds AS (
 SELECT least(
   date_trunc('month',coalesce(p_month,(now() at time zone 'Europe/Minsk')::date))::date,
   (date_trunc('month',(now() at time zone 'Europe/Minsk')::date)-interval '1 month')::date
 ) AS last_complete_month
),
periods AS (
 SELECT last_complete_month AS m,
        (last_complete_month-interval '2 months')::date AS first_month,
        (last_complete_month-interval '1 year')::date AS prev_end,
        (last_complete_month-interval '1 year 2 months')::date AS prev_first
 FROM bounds
),
eligible AS (
 SELECT c.id,c.name,c.manager_name
 FROM public.clients c
 WHERE coalesce(c.is_archived,false)=false AND coalesce(c.to_delete,false)=false
 AND (nullif(trim(p_manager),'') IS NULL OR lower(trim(c.manager_name))=lower(trim(p_manager)))
),
sales AS (
 SELECT e.id,e.name,e.manager_name,
   round(coalesce(sum(ph.revenue) FILTER (WHERE ph.month>=p.first_month AND ph.month<=p.m),0),2) current_3m,
   round(coalesce(sum(ph.revenue) FILTER (WHERE ph.month>=p.prev_first AND ph.month<=p.prev_end),0),2) prior_year_3m
 FROM eligible e CROSS JOIN periods p
 LEFT JOIN public.purchase_history ph ON ph.client_id=e.id
  AND ((ph.month>=p.first_month AND ph.month<=p.m)
    OR (ph.month>=p.prev_first AND ph.month<=p.prev_end))
 GROUP BY e.id,e.name,e.manager_name
),
risk AS (
 SELECT name,manager_name,current_3m,prior_year_3m,
   round(prior_year_3m-current_3m,2) loss_byn,
   round((prior_year_3m-current_3m)/nullif(prior_year_3m,0)*100,1) drop_pct
 FROM sales
 WHERE prior_year_3m>=500 AND current_3m<prior_year_3m*0.8
),
summary AS (
 SELECT count(*)::int total_risky,coalesce(round(sum(loss_byn),2),0) total_loss_byn
 FROM risk
)
SELECT jsonb_build_object(
 'scope',case when nullif(trim(p_manager),'') IS NULL THEN 'network' ELSE 'manager' END,
 'manager',nullif(trim(p_manager),''),
 'currency','BYN',
 'period',(SELECT to_char(first_month,'YYYY-MM')||'..'||to_char(m,'YYYY-MM') FROM periods),
 'comparison_period',(SELECT to_char(prev_first,'YYYY-MM')||'..'||to_char(prev_end,'YYYY-MM') FROM periods),
 'basis','purchase_history by client_id / latest clients.manager_name',
 'rule','3 completed calendar months vs same three months last year; prior >= 500 BYN; drop >20%',
 'matched_risky_clients',(SELECT total_risky FROM summary),
 'total_decline_byn',(SELECT total_loss_byn FROM summary),
 'clients',coalesce((SELECT jsonb_agg(to_jsonb(r) ORDER BY r.loss_byn DESC,r.name)
      FROM (SELECT * FROM risk ORDER BY loss_byn DESC,name LIMIT 8) r),'[]'::jsonb),
 'limitations','Revenue comparison is from purchase_history only; clients without client_id links are not included. Current manager assignment, not historical assignment. A declining client is a risk signal, not proof of cause.'
);
$fn$;

CREATE OR REPLACE FUNCTION public.crm_ai360_stock_snapshot_v41(
 p_warehouse text DEFAULT 'Витебск'
) RETURNS jsonb LANGUAGE sql STABLE SET search_path TO '' SET statement_timeout TO '12s'
AS $fn$
WITH dated AS (
 SELECT max(report_date) as d FROM public.stock_balances
 WHERE warehouse=p_warehouse
),
current_stock AS (
 SELECT sku,max(product) as product,
 round(sum(coalesce(qty_onhand,0)),2) onhand,
 round(sum(coalesce(qty_reserve,0)),2) reserved,
 round(sum(coalesce(qty_avail,0)),2) available
 FROM public.stock_balances s CROSS JOIN dated d
 WHERE s.warehouse=p_warehouse AND s.report_date=d.d
 GROUP BY sku
),
totals AS (SELECT count(*)::int sku_count,
  round(coalesce(sum(onhand),0),2) onhand,round(coalesce(sum(reserved),0),2) reserved,
  round(coalesce(sum(available),0),2) available FROM current_stock),
heavy AS (
 SELECT sku,product,onhand,reserved,available FROM current_stock
 ORDER BY onhand DESC,sku LIMIT 8
)
SELECT jsonb_build_object(
 'scope','warehouse',
 'warehouse',p_warehouse,
 'report_date',(SELECT d FROM dated),
 'currency',null,
 'basis','stock_balances, latest stock report for selected warehouse',
 'total_skus',(SELECT sku_count FROM totals),
 'onhand_units',(SELECT onhand FROM totals),
 'reserved_units',(SELECT reserved FROM totals),
 'available_units',(SELECT available FROM totals),
 'largest_onhand_skus',coalesce((SELECT jsonb_agg(to_jsonb(h) ORDER BY onhand DESC,sku) FROM heavy h),'[]'::jsonb),
 'limitations','Only quantity and reservation are verified. Overstock, slow-moving and excess days cannot be calculated without approved stock norms and confirmed SKU sales coverage.'
);
$fn$;
REVOKE ALL ON FUNCTION public.crm_ai360_client_risk_v41(text,date) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.crm_ai360_stock_snapshot_v41(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.crm_ai360_client_risk_v41(text,date) TO service_role;
GRANT EXECUTE ON FUNCTION public.crm_ai360_stock_snapshot_v41(text) TO service_role;