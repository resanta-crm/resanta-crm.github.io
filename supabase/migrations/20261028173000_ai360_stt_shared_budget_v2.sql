-- Conservative OpenAI STT expense accounting under same RUB monthly envelope.
-- Billed by gpt-transcribe duration at $0.0045 / minute, protective 100 RUB/USD.
ALTER TABLE public.crm_ai360_core_month_v2 ADD COLUMN IF NOT EXISTS stt_clips integer NOT NULL DEFAULT 0;
ALTER TABLE public.crm_ai360_core_month_v2 ADD COLUMN IF NOT EXISTS stt_seconds numeric(12,2) NOT NULL DEFAULT 0;
ALTER TABLE public.crm_ai360_core_month_v2 ADD COLUMN IF NOT EXISTS stt_spent_rub numeric(14,4) NOT NULL DEFAULT 0;
CREATE OR REPLACE FUNCTION public.crm_ai360_stt_claim_v2(p_user_id uuid,p_duration_seconds numeric)
RETURNS jsonb LANGUAGE plpgsql SET search_path TO '' AS $$
DECLARE m date:=date_trunc('month',now() at time zone 'Europe/Minsk')::date;
 cost numeric(14,4); v_spent numeric; v_reserved numeric; v_tts numeric;
BEGIN
 IF p_user_id IS NULL OR p_duration_seconds IS NULL OR p_duration_seconds<0.5 OR p_duration_seconds>16.5 THEN
  RETURN jsonb_build_object('allowed',false,'reason','invalid_duration');
 END IF;
 cost:=round((p_duration_seconds/60)*0.0045*100,4);
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id::text||m::text,0));
 INSERT INTO public.crm_ai360_core_month_v2(user_id,month_start) VALUES(p_user_id,m) ON CONFLICT DO NOTHING;
 SELECT spent_rub,reserved_rub INTO v_spent,v_reserved FROM public.crm_ai360_core_month_v2
 WHERE user_id=p_user_id AND month_start=m FOR UPDATE;
 SELECT coalesce(reserved_rub,0) INTO v_tts FROM public.crm_ai360_yandex_monthly_spend_v1
 WHERE user_id=p_user_id AND month_start=m;
 v_tts:=coalesce(v_tts,0);
 IF v_spent+v_reserved+v_tts+cost>5000 THEN
  RETURN jsonb_build_object('allowed',false,'reason','monthly_budget_exhausted',
  'remaining_rub',greatest(0,5000-v_spent-v_reserved-v_tts),'budget_rub',5000);
 END IF;
 UPDATE public.crm_ai360_core_month_v2 SET
   spent_rub=spent_rub+cost, stt_spent_rub=stt_spent_rub+cost,
   stt_seconds=stt_seconds+p_duration_seconds,
   stt_clips=stt_clips+1,updated_at=now()
 WHERE user_id=p_user_id AND month_start=m;
 RETURN jsonb_build_object('allowed',true,'estimated_cost_rub',cost,'budget_rub',5000,
   'monthly_used_rub',v_spent+v_reserved+v_tts+cost);
END $$;
REVOKE ALL ON FUNCTION public.crm_ai360_stt_claim_v2(uuid,numeric) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.crm_ai360_stt_claim_v2(uuid,numeric) TO service_role;