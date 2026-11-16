-- Applied and rollback-tested 2026-11-16. Preserve existing ACL (service_role only).
-- Forward accounting only; no historical spend is rewritten.
CREATE OR REPLACE FUNCTION public.crm_ai360_core_finish_v2(p_claim_id uuid, p_actual_rub numeric, p_input_tokens integer DEFAULT 0, p_output_tokens integer DEFAULT 0, p_rounds integer DEFAULT 0, p_status text DEFAULT 'ok'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE r public.crm_ai360_core_requests_v2%ROWTYPE; actual numeric;
BEGIN
 IF p_claim_id IS NULL THEN RETURN jsonb_build_object('ok',false,'reason','claim_missing'); END IF;
 SELECT * INTO r FROM public.crm_ai360_core_requests_v2 WHERE id=p_claim_id FOR UPDATE;
 IF NOT FOUND OR r.status<>'reserved' THEN RETURN jsonb_build_object('ok',false,'reason','already_finished_or_missing'); END IF;
 actual:=GREATEST(0,coalesce(p_actual_rub,r.reserved_rub));
 UPDATE public.crm_ai360_core_requests_v2 SET
  actual_rub=actual,finished_at=now(),
  input_tokens=greatest(0,coalesce(p_input_tokens,0)),
  output_tokens=greatest(0,coalesce(p_output_tokens,0)),
  rounds=greatest(0,coalesce(p_rounds,0)),
  status=CASE WHEN p_status IN ('ok','legacy_estimated') THEN p_status ELSE 'failed' END
 WHERE id=r.id;
 UPDATE public.crm_ai360_core_month_v2 SET
  reserved_rub=greatest(0,reserved_rub-r.reserved_rub),
  spent_rub=spent_rub+actual,
  input_tokens=input_tokens+greatest(0,coalesce(p_input_tokens,0)),
  output_tokens=output_tokens+greatest(0,coalesce(p_output_tokens,0)),
  failures=failures+CASE WHEN p_status IN ('ok','legacy_estimated') THEN 0 ELSE 1 END,
  updated_at=now() WHERE user_id=r.user_id AND month_start=r.month_start;
 RETURN jsonb_build_object('ok',true,'charged_rub',actual,'status',p_status);
END $function$
;
