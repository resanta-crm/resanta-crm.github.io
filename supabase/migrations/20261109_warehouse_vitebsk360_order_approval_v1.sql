-- Vitebsk360: director approval of a verifiable, immutable auto-order proposal.
-- This records an internal approval only. No order placement or 1C write.
CREATE TABLE IF NOT EXISTS public.warehouse_vitebsk360_order_approvals_v1(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 fingerprint text NOT NULL UNIQUE,
 status text NOT NULL DEFAULT 'approved' CHECK (status='approved'),
 warehouse text NOT NULL DEFAULT 'Витебск' CHECK (warehouse='Витебск'),
 report_month date NOT NULL,
 cost_report_date date NOT NULL,
 stock_report_date date NOT NULL,
 chekhov_snapshot_date date,
 cycle_days integer NOT NULL CHECK(cycle_days BETWEEN 1 AND 31),
 sku_count integer NOT NULL CHECK(sku_count>=0),
 order_units numeric NOT NULL CHECK(order_units>=0),
 estimated_cost_byn numeric NOT NULL CHECK(estimated_cost_byn>=0),
 lines jsonb NOT NULL CHECK(jsonb_typeof(lines)='array'),
 note text,
 approved_by uuid NOT NULL,
 approved_by_email text NOT NULL,
 approved_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS warehouse_vitebsk360_approval_recent_v1
 ON public.warehouse_vitebsk360_order_approvals_v1(approved_at DESC);
ALTER TABLE public.warehouse_vitebsk360_order_approvals_v1 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.warehouse_vitebsk360_order_approvals_v1 FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.warehouse_vitebsk360_approve_order_v1(
 p_expected_cost_date date,
 p_expected_stock_date date,
 p_note text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER
 SET search_path TO 'public','auth','pg_catalog'
AS $function$
DECLARE
 v_month date;
 v_date date;
 v_stock_date date;
 v_chekhov_date date;
 v_data jsonb;
 v_rows jsonb:='[]'::jsonb;
 v_page jsonb;
 v_line jsonb;
 v_total integer:=0;
 v_offset integer:=0;
 v_cycle integer:=14;
 v_qty numeric:=0;
 v_byn numeric:=0;
 v_approved_id uuid;
 v_fingerprint text;
 v_current_cost date;
 v_current_stock date;
 v_current_chekhov date;
BEGIN
 IF NOT public.warehouse_is_boss() OR auth.uid() IS NULL THEN
   RAISE EXCEPTION 'Только руководитель может согласовать автозаказ' USING ERRCODE='42501';
 END IF;
 SELECT report_month,report_date INTO v_month,v_current_cost
 FROM public.warehouse_cost_import_log ORDER BY report_date DESC,imported_at DESC LIMIT 1;
 SELECT max(report_date) INTO v_current_stock FROM public.stock_balances
 WHERE warehouse='Витебск';
 SELECT max(snapshot_date) INTO v_current_chekhov FROM public.triovist_chekhov_stock;
 IF v_month IS NULL OR p_expected_stock_date IS DISTINCT FROM v_current_stock
    OR p_expected_cost_date IS DISTINCT FROM v_current_cost THEN
    RAISE EXCEPTION 'Исходные отчёты изменились, обновите автозаказ и согласуйте заново';
 END IF;
 IF current_date-v_current_stock>2 OR current_date-v_current_cost>2
    OR v_current_chekhov IS NULL OR current_date-v_current_chekhov>7 THEN
    RAISE EXCEPTION 'Источники неактуальны для утверждения. Запросите свежие остатки/себестоимость/Чехов';
 END IF;
 LOOP
   v_data:=public.warehouse_control_get_items_v2(v_month,'order','',500,v_offset);
   IF v_date IS NULL THEN
     v_date:=nullif(v_data->>'report_date','')::date;
     v_stock_date:=nullif(v_data->>'vitebsk_stock_date','')::date;
     v_chekhov_date:=nullif(v_data->>'chekhov_stock_date','')::date;
     v_cycle:=greatest(1,least(31,coalesce((v_data->>'order_cycle_days')::integer,14)));
     v_total:=coalesce((v_data->>'total')::integer,0);
     IF v_date IS DISTINCT FROM v_current_cost OR
       v_stock_date IS DISTINCT FROM v_current_stock OR
       v_chekhov_date IS DISTINCT FROM v_current_chekhov OR
       v_cycle<>14 THEN
       RAISE EXCEPTION 'Несовпадающие источники или горизонт автозаказа; обновите данные';
     END IF;
     IF v_total>3000 THEN RAISE EXCEPTION 'Слишком много SKU для безопасной заявки; пересмотрите выборку'; END IF;
   ELSIF v_date IS DISTINCT FROM nullif(v_data->>'report_date','')::date
     OR v_stock_date IS DISTINCT FROM nullif(v_data->>'vitebsk_stock_date','')::date
     OR v_chekhov_date IS DISTINCT FROM nullif(v_data->>'chekhov_stock_date','')::date THEN
     RAISE EXCEPTION 'Источники изменились в ходе расчёта — согласование отменено';
   END IF;
   v_page:=coalesce(v_data->'rows','[]'::jsonb);
   FOR v_line IN SELECT value FROM jsonb_array_elements(v_page)
   LOOP
     IF coalesce((v_line->>'recommended_order_qty')::numeric,0)<=0 THEN CONTINUE; END IF;
     IF (v_line->>'vitebsk_avail') IS NULL
        OR (v_line->>'sku') IS NULL OR (v_line->>'chekhov_qty') IS NULL THEN
       RAISE EXCEPTION 'Товар без подтверждённого остатка или артикула в проекте';
     END IF;
     v_rows:=v_rows||jsonb_build_array(jsonb_build_object(
       'sku',v_line->>'sku','product',v_line->>'product',
       'vitebsk_free',(v_line->>'vitebsk_avail')::numeric,
       'forecast_qty',(v_line->>'forecast_qty')::numeric,
       'target_qty',(v_line->>'target_qty')::numeric,
       'need_qty',(v_line->>'need_qty')::numeric,
       'chekhov_qty',(v_line->>'chekhov_qty')::numeric,
       'box_qty',(v_line->>'box_qty')::numeric,
       'approved_qty',(v_line->>'recommended_order_qty')::numeric,
       'cost_byn',(v_line->>'estimated_order_cost_byn')::numeric,
       'forecast_source',v_line->>'forecast_source'));
     v_qty:=v_qty+coalesce((v_line->>'recommended_order_qty')::numeric,0);
     v_byn:=v_byn+coalesce((v_line->>'estimated_order_cost_byn')::numeric,0);
   END LOOP;
   v_offset:=v_offset+jsonb_array_length(v_page);
   EXIT WHEN v_offset>=v_total OR jsonb_array_length(v_page)=0;
 END LOOP;
 IF jsonb_array_length(v_rows)=0 THEN
   RAISE EXCEPTION 'Нет подтверждённых позиций для согласования';
 END IF;
 v_fingerprint:=md5(concat_ws('|',v_month::text,v_date::text,v_stock_date::text,
   v_chekhov_date::text,v_cycle::text,v_rows::text));
 INSERT INTO public.warehouse_vitebsk360_order_approvals_v1(
   fingerprint,report_month,cost_report_date,stock_report_date,
   chekhov_snapshot_date,cycle_days,sku_count,order_units,estimated_cost_byn,
   lines,note,approved_by,approved_by_email
 ) VALUES (
   v_fingerprint,v_month,v_date,v_stock_date,v_chekhov_date,v_cycle,
   jsonb_array_length(v_rows),v_qty,round(v_byn,2),
   v_rows,left(nullif(trim(coalesce(p_note,'')),''),300),
   auth.uid(),public.warehouse_actor_email()
 )
 ON CONFLICT(fingerprint) DO NOTHING
 RETURNING id INTO v_approved_id;
 IF v_approved_id IS NULL THEN
   SELECT id INTO v_approved_id
   FROM public.warehouse_vitebsk360_order_approvals_v1
   WHERE fingerprint=v_fingerprint;
 END IF;
 RETURN jsonb_build_object('approved',true,'approval_id',v_approved_id,'status','approved',
   'sku_count',jsonb_array_length(v_rows),'units',v_qty,'cost_byn',round(v_byn,2),
   'cost_report_date',v_date,'stock_report_date',v_stock_date,
   'chekhov_date',v_chekhov_date,'cycle_days',v_cycle,
   'note','Внутреннее согласование проекта. В 1С и Чехов ничего не отправлено.');
END;
$function$;
REVOKE ALL ON FUNCTION public.warehouse_vitebsk360_approve_order_v1(date,date,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.warehouse_vitebsk360_approve_order_v1(date,date,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.warehouse_vitebsk360_last_approval_v1()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
 SET search_path TO 'public','auth','pg_catalog'
AS $function$
DECLARE v jsonb;BEGIN
 IF NOT public.warehouse_is_boss() THEN
  RAISE EXCEPTION 'Нет доступа к согласованиям склада' USING ERRCODE='42501';
 END IF;
 SELECT jsonb_build_object('approval_id',id,'approved_at',approved_at,
   'approved_by_email',approved_by_email,'cost_report_date',cost_report_date,
   'stock_report_date',stock_report_date,'chekhov_date',chekhov_snapshot_date,
   'sku_count',sku_count,'units',order_units,'cost_byn',estimated_cost_byn,
   'cycle_days',cycle_days,'status','approved',
   'note','Зафиксировано в CRM, автоматически в 1С или Чехов не передавалось')
 INTO v FROM public.warehouse_vitebsk360_order_approvals_v1
 WHERE warehouse='Витебск' ORDER BY approved_at DESC LIMIT 1;
 RETURN coalesce(v,'{}'::jsonb);
END;
$function$;
REVOKE ALL ON FUNCTION public.warehouse_vitebsk360_last_approval_v1() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.warehouse_vitebsk360_last_approval_v1() TO authenticated;
