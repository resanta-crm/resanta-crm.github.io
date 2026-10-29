-- Client sales by group / subgroup / SKU; exact verified UUID, no writes.
-- The three most recently COMPLETED months are compared with same months prior year.
CREATE OR REPLACE FUNCTION public.crm_ai360_client_drilldown_v43(
 p_client_id uuid,
 p_level text DEFAULT 'groups',
 p_group text DEFAULT NULL,
 p_subgroup text DEFAULT NULL,
 p_month date DEFAULT NULL,
 p_limit integer DEFAULT 12,
 p_offset integer DEFAULT 0
) RETURNS jsonb LANGUAGE plpgsql STABLE
SET search_path TO '' SET statement_timeout TO '12s' AS $fn$
DECLARE answer jsonb;
BEGIN
 IF p_client_id IS NULL OR p_level NOT IN ('groups','subgroups','sku')
    OR p_limit NOT BETWEEN 1 AND 20 OR p_offset NOT BETWEEN 0 AND 200
    OR (p_level IN ('subgroups','sku') AND nullif(trim(p_group),'') IS NULL)
    OR (p_level='sku' AND nullif(trim(p_subgroup),'') IS NULL)
 THEN RETURN jsonb_build_object('error','invalid_drilldown_parameters'); END IF;
 WITH client AS (
  SELECT id,name,manager_name FROM public.clients
  WHERE id=p_client_id AND coalesce(is_archived,false)=false AND coalesce(to_delete,false)=false
 ),
 bounds AS (
  SELECT least(date_trunc('month',coalesce(p_month,(now() AT TIME ZONE 'Europe/Minsk')::date))::date,
    (date_trunc('month',(now() AT TIME ZONE 'Europe/Minsk')::date)-interval '1 month')::date) last_complete
 ),
 dates AS (
  SELECT (last_complete-interval '2 months')::date cur_start,last_complete cur_end,
    (last_complete-interval '1 year 2 months')::date old_start,
    (last_complete-interval '1 year')::date old_end
  FROM bounds
 ),
 source AS (
  SELECT coalesce(nullif(trim(h.category),''),'Без группы') category,
         coalesce(nullif(trim(h.subgroup),''),'Без подгруппы') subgroup,
         nullif(trim(h.sku),'') sku,
         coalesce(nullif(trim(h.product),''),'Без наименования') product,
         h.month,coalesce(h.revenue,0) rev,coalesce(h.qty,0) qty
  FROM public.purchase_history h JOIN client c ON h.client_id=c.id CROSS JOIN dates d
  WHERE (h.month BETWEEN d.cur_start AND d.cur_end OR h.month BETWEEN d.old_start AND d.old_end)
 ),
 in_scope AS (
  SELECT * FROM source
  WHERE (p_level='groups' OR lower(category)=lower(trim(p_group)))
    AND (p_level<>'sku' OR lower(subgroup)=lower(trim(p_subgroup)))
 ),
 grouped AS (
  SELECT category,
   CASE WHEN p_level IN ('subgroups','sku') THEN subgroup ELSE NULL END subgroup,
   CASE WHEN p_level='sku' THEN max(sku) ELSE NULL END sku,
   CASE WHEN p_level='sku' THEN max(product) ELSE NULL END product,
   round(coalesce(sum(rev) FILTER(WHERE month BETWEEN d.cur_start AND d.cur_end),0),2) current_byn,
   round(coalesce(sum(rev) FILTER(WHERE month BETWEEN d.old_start AND d.old_end),0),2) previous_byn,
   round(coalesce(sum(qty) FILTER(WHERE month BETWEEN d.cur_start AND d.cur_end),0),2) current_qty,
   round(coalesce(sum(qty) FILTER(WHERE month BETWEEN d.old_start AND d.old_end),0),2) previous_qty,
   count(*) FILTER(WHERE month BETWEEN d.cur_start AND d.cur_end) current_rows,
   count(*) FILTER(WHERE month BETWEEN d.old_start AND d.old_end) previous_rows
  FROM in_scope CROSS JOIN dates d
  GROUP BY category,
   CASE WHEN p_level IN ('subgroups','sku') THEN subgroup ELSE NULL END,
   CASE WHEN p_level='sku' THEN coalesce(sku,'__NO_CODE__'||product) ELSE NULL END
 ),
 calculated AS (
  SELECT *,
   round(current_byn-previous_byn,2) delta_byn,
   CASE WHEN previous_byn>0 THEN round((current_byn-previous_byn)*100/previous_byn,1) ELSE NULL END change_pct
  FROM grouped
 ),
 totals AS (
  SELECT count(*)::int total_items,
   count(*) FILTER(WHERE delta_byn<0)::int falling_items,
   round(coalesce(sum(current_byn),0),2) current_byn,
   round(coalesce(sum(previous_byn),0),2) previous_byn,
   round(coalesce(sum(delta_byn),0),2) delta_byn,
   count(*) FILTER(WHERE p_level='sku' AND sku IS NULL)::int sku_without_code
  FROM calculated
 ),
 page AS (
  SELECT category,subgroup,sku,product,current_byn,previous_byn,delta_byn,change_pct,
    current_qty,previous_qty,current_rows,previous_rows,
    (p_level='sku' AND sku IS NULL) as missing_sku
  FROM calculated ORDER BY delta_byn ASC,category,subgroup,sku,product
  LIMIT p_limit OFFSET p_offset
 )
 SELECT jsonb_build_object(
  'domain','client_detail','level',p_level,'source','purchase_history.client_id',
  'client_name',(SELECT name FROM client),'manager',(SELECT manager_name FROM client),
  'scope','client_all','currency','BYN',
  'group_filter',p_group,'subgroup_filter',p_subgroup,
  'current_period',(SELECT to_char(cur_start,'YYYY-MM')||'..'||to_char(cur_end,'YYYY-MM') FROM dates),
  'previous_period',(SELECT to_char(old_start,'YYYY-MM')||'..'||to_char(old_end,'YYYY-MM') FROM dates),
  'total_items',(SELECT total_items FROM totals),
  'falling_items',(SELECT falling_items FROM totals),
  'current_byn',(SELECT current_byn FROM totals),'previous_byn',(SELECT previous_byn FROM totals),
  'delta_byn',(SELECT delta_byn FROM totals),
  'sku_missing_code',(SELECT sku_without_code FROM totals),
  'offset',p_offset,'returned',(SELECT count(*) FROM page),
  'has_more',(SELECT total_items>p_offset+p_limit FROM totals),
  'items',coalesce((SELECT jsonb_agg(to_jsonb(page) ORDER BY delta_byn ASC,category,subgroup,sku,product) FROM page),'[]'::jsonb),
  'limitations','Only verified purchase_history.client_id records are included. Missing SKU codes use product names. No inferred product availability or proven causes of decline. Completed months, year-on-year.'
 ) INTO answer;
 IF NOT EXISTS(SELECT 1 FROM public.clients c WHERE c.id=p_client_id AND coalesce(c.is_archived,false)=false AND coalesce(c.to_delete,false)=false)
 THEN RETURN jsonb_build_object('error','client_not_active'); END IF;
 RETURN answer;
END $fn$;
REVOKE ALL ON FUNCTION public.crm_ai360_client_drilldown_v43(uuid,text,text,text,date,integer,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.crm_ai360_client_drilldown_v43(uuid,text,text,text,date,integer,integer) TO service_role;
