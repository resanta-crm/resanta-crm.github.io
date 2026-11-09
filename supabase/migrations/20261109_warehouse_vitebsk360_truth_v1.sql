-- Витебск 360: read-only comparison of physical 1C stock and cost report.
-- No update to active warehouse inventory, scans, 1C or order generator.
CREATE OR REPLACE FUNCTION public.warehouse_vitebsk360_truth_v1(
 p_mode text DEFAULT 'unmatched',
 p_search text DEFAULT '',
 p_limit integer DEFAULT 50,
 p_offset integer DEFAULT 0
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
 SET search_path TO 'public','auth','pg_catalog'
AS $function$
DECLARE
 v_stock_date date;
 v_cost_month date;
 v_cost_date date;
 v_chekhov_date date;
 v_row_count integer;
 v_total integer;
 v_missing integer;
 v_missing_positive integer;
 v_cost_only_value numeric;
 v_onhand numeric;
 v_free numeric;
 v_reserve numeric;
 v_other_unavailable numeric;
 v_stock_rows integer;
 v_cost_rows integer;
 v_open numeric;
 v_expense numeric;
 v_closing numeric;
 v_factor numeric;
 v_session jsonb;
 v_rows jsonb;
 v_limit integer := greatest(1,least(coalesce(p_limit,50),100));
 v_offset integer := greatest(0,coalesce(p_offset,0));
BEGIN
 IF NOT public.warehouse_is_boss() THEN
   RAISE EXCEPTION 'Нет доступа к директорскому складу Витебск' USING ERRCODE='42501';
 END IF;
 IF p_mode NOT IN ('unmatched','all') THEN
   RAISE EXCEPTION 'Недопустимый фильтр склада';
 END IF;
 IF length(coalesce(p_search,''))>100 THEN RAISE EXCEPTION 'Слишком длинный поиск'; END IF;
 SELECT max(report_date) INTO v_stock_date
 FROM public.stock_balances WHERE warehouse='Витебск';
 SELECT report_month, report_date, row_count, opening_cost_byn, expense_cost_byn, closing_cost_byn
 INTO v_cost_month,v_cost_date,v_cost_rows,v_open,v_expense,v_closing
 FROM public.warehouse_cost_import_log
 ORDER BY report_date DESC,imported_at DESC LIMIT 1;
 SELECT max(snapshot_date) INTO v_chekhov_date FROM public.triovist_chekhov_stock;
 IF v_stock_date IS NULL THEN
   RETURN jsonb_build_object('has_data',false,'warehouse','Витебск',
     'reason','Нет снимка физических остатков склада Витебск');
 END IF;
 SELECT count(*),coalesce(sum(qty_onhand),0),coalesce(sum(qty_reserve),0),
        coalesce(sum(qty_avail),0)
 INTO v_stock_rows,v_onhand,v_reserve,v_free
 FROM public.stock_balances
 WHERE warehouse='Витебск' AND report_date=v_stock_date;
 v_other_unavailable:=v_onhand-v_reserve-v_free;
 v_factor:=CASE WHEN v_cost_month IS NOT NULL
             THEN public.warehouse_norm_factor(v_cost_month) ELSE NULL END;
 SELECT jsonb_build_object(
   'id',id,'status',status,'started_at',started_at,'stock_report_date',stock_report_date,
   'sku_count',stock_sku_count,'stock_onhand',stock_qty_onhand,
   'note','Это замороженная база инвентаризации; она не должна заменяться новым снимком.')
 INTO v_session FROM public.warehouse_inventory_sessions
 WHERE warehouse='Витебск' AND status='active'
 ORDER BY started_at DESC LIMIT 1;

 WITH snapshot AS (
   SELECT sku,product,qty_onhand,qty_reserve,qty_avail
   FROM public.stock_balances
   WHERE warehouse='Витебск' AND report_date=v_stock_date
 ), costs AS (
   SELECT sku,product,closing_qty,unit_cost_byn
   FROM public.warehouse_cost_snapshots
   WHERE report_month=v_cost_month
 ), matched AS (
   SELECT coalesce(s.sku,c.sku) sku,coalesce(s.product,c.product) product,
      s.qty_onhand,s.qty_reserve,s.qty_avail,c.closing_qty,c.unit_cost_byn,
      CASE WHEN s.sku IS NULL THEN 'not_in_physical_snapshot'
           WHEN c.sku IS NULL THEN 'not_in_cost_report'
           ELSE 'matched' END source_state
   FROM snapshot s FULL OUTER JOIN costs c USING(sku)
 )
 SELECT count(*) FILTER (WHERE source_state<>'matched'),
        count(*) FILTER (WHERE source_state='not_in_physical_snapshot' AND closing_qty>0),
        coalesce(sum(greatest(0,coalesce(closing_qty,0))*coalesce(unit_cost_byn,0))
          FILTER (WHERE source_state='not_in_physical_snapshot'),0)
 INTO v_missing,v_missing_positive,v_cost_only_value FROM matched;

 WITH snapshot AS (
   SELECT sku,product,qty_onhand,qty_reserve,qty_avail
   FROM public.stock_balances WHERE warehouse='Витебск' AND report_date=v_stock_date
 ), costs AS (
   SELECT sku,product,closing_qty,unit_cost_byn
   FROM public.warehouse_cost_snapshots WHERE report_month=v_cost_month
 ), matched AS (
   SELECT coalesce(s.sku,c.sku) sku,coalesce(s.product,c.product) product,
      s.qty_onhand,s.qty_reserve,s.qty_avail,c.closing_qty,c.unit_cost_byn,
      CASE WHEN s.sku IS NULL THEN 'not_in_physical_snapshot'
           WHEN c.sku IS NULL THEN 'not_in_cost_report' ELSE 'matched' END source_state
   FROM snapshot s FULL OUTER JOIN costs c USING(sku)
 ), filtered AS (
   SELECT * FROM matched
   WHERE (p_mode='all' OR source_state<>'matched')
     AND (coalesce(p_search,'')='' OR sku ILIKE '%'||p_search||'%' OR product ILIKE '%'||p_search||'%')
 ), page AS (
   SELECT * FROM filtered ORDER BY
     CASE WHEN source_state='not_in_physical_snapshot' THEN 0
          WHEN source_state='not_in_cost_report' THEN 1 ELSE 2 END,
     CASE WHEN source_state='not_in_physical_snapshot'
          THEN greatest(0,coalesce(closing_qty,0))*coalesce(unit_cost_byn,0) ELSE 0 END DESC,sku
   LIMIT v_limit OFFSET v_offset
 )
 SELECT (SELECT count(*) FROM filtered),
        coalesce(jsonb_agg(jsonb_build_object(
          'sku',p.sku,'product',p.product,'physical_onhand',p.qty_onhand,
          'physical_reserve',p.qty_reserve,'physical_free',p.qty_avail,
          'cost_report_closing_qty',p.closing_qty,'unit_cost_byn',p.unit_cost_byn,
          'source_state',p.source_state,'unknown_not_zero',p.qty_onhand IS NULL
        )),'[]'::jsonb)
 INTO v_total,v_rows FROM page p;

 RETURN jsonb_build_object(
   'version','vitebsk360-v1','has_data',true,'warehouse','Витебск',
   'stock_date',v_stock_date,'stock_rows',v_stock_rows,
   'onhand_qty',v_onhand,'free_qty',v_free,'reserve_qty',v_reserve,
   'other_unavailable_qty',v_other_unavailable,
   'other_unavailable_note','Прочие ограничения доступности из 1С (не приписывать к резерву)',
   'cost_month',v_cost_month,'cost_date',v_cost_date,'cost_rows',v_cost_rows,
   'opening_cost_byn',v_open,'expense_cost_byn',v_expense,
   'closing_cost_byn',v_closing,'norm_factor',v_factor,
   'sn_overlimit_byn',CASE WHEN v_factor IS NULL THEN NULL
       ELSE greatest(0,v_open-v_expense*v_factor) END,
   'sn_raw_byn',CASE WHEN v_factor IS NULL THEN NULL ELSE v_open-v_expense*v_factor END,
   'formula','SN = MAX(0; начальный остаток − расход по себестоимости × коэффициент месяца)',
   'unmatched_sku',v_missing,'cost_skus_not_in_physical_positive',v_missing_positive,
   'cost_only_value_byn',v_cost_only_value,
   'chekhov_date_reference_only',v_chekhov_date,
   'active_inventory',v_session,
   'mode',p_mode,'total',v_total,'offset',v_offset,'limit',v_limit,'rows',v_rows,
   'warning','Стоимость и количество из разных отчётов не складываются и не заменяют друг друга. Инвентаризация использует отдельный зафиксированный снимок.');
END;
$function$;
REVOKE ALL ON FUNCTION public.warehouse_vitebsk360_truth_v1(text,text,integer,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.warehouse_vitebsk360_truth_v1(text,text,integer,integer) TO authenticated;
