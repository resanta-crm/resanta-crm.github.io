-- Director-only read of an immutable approved CSV proposal for manual 1C transfer.
CREATE OR REPLACE FUNCTION public.warehouse_vitebsk360_approved_document_v1(p_approval_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
 SET search_path TO 'public','auth','pg_catalog'
AS $function$
DECLARE v jsonb;
BEGIN
 IF NOT public.warehouse_is_boss() OR auth.uid() IS NULL THEN
   RAISE EXCEPTION 'Нет доступа к согласованной заявке' USING ERRCODE='42501';
 END IF;
 SELECT jsonb_build_object(
   'id',id,'warehouse',warehouse,'status',status,'report_month',report_month,
   'cost_report_date',cost_report_date,'stock_report_date',stock_report_date,
   'chekhov_snapshot_date',chekhov_snapshot_date,'cycle_days',cycle_days,
   'sku_count',sku_count,'units',order_units,'estimated_cost_byn',estimated_cost_byn,
   'approved_by_email',approved_by_email,'approved_at',approved_at,
   'note',note,'items',lines,
   'posting_status','not_sent_to_1c_or_chekhov')
 INTO v FROM public.warehouse_vitebsk360_order_approvals_v1
 WHERE id=p_approval_id AND warehouse='Витебск';
 IF v IS NULL THEN RAISE EXCEPTION 'Заявка не найдена'; END IF;
 RETURN v;
END;
$function$;
REVOKE ALL ON FUNCTION public.warehouse_vitebsk360_approved_document_v1(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.warehouse_vitebsk360_approved_document_v1(uuid) TO authenticated;
