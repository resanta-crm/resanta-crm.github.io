-- AI360 unified budget v2. Service-role only. Minsk calendar; protected FX assumption 100 RUB/USD.
CREATE TABLE IF NOT EXISTS public.crm_ai360_core_month_v2 (
  user_id uuid NOT NULL,
  month_start date NOT NULL,
  calls integer NOT NULL DEFAULT 0,
  reserved_rub numeric(14,4) NOT NULL DEFAULT 0,
  spent_rub numeric(14,4) NOT NULL DEFAULT 0,
  input_tokens bigint NOT NULL DEFAULT 0,
  output_tokens bigint NOT NULL DEFAULT 0,
  failures integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(user_id,month_start)
);
CREATE TABLE IF NOT EXISTS public.crm_ai360_core_requests_v2 (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  month_start date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  reserved_rub numeric(12,4) NOT NULL,
  actual_rub numeric(12,4),
  input_tokens integer NOT NULL DEFAULT 0,
  output_tokens integer NOT NULL DEFAULT 0,
  rounds integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'reserved' CHECK (status IN ('reserved','ok','failed','legacy_estimated')),
  FOREIGN KEY (user_id,month_start) REFERENCES public.crm_ai360_core_month_v2(user_id,month_start)
);
CREATE INDEX IF NOT EXISTS crm_ai360_core_requests_v2_user_idx ON public.crm_ai360_core_requests_v2(user_id,created_at DESC);
ALTER TABLE public.crm_ai360_core_month_v2 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_ai360_core_requests_v2 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.crm_ai360_core_month_v2 FROM PUBLIC,anon,authenticated;
REVOKE ALL ON public.crm_ai360_core_requests_v2 FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public.crm_ai360_core_month_v2 TO service_role;
GRANT SELECT,INSERT,UPDATE ON public.crm_ai360_core_requests_v2 TO service_role;

-- Transactional per-user/day claims; includes Yandex TTS reserved amount in shared monthly guard.
CREATE OR REPLACE FUNCTION public.crm_ai360_core_claim_v2(p_user_id uuid,p_reserve_rub numeric DEFAULT 8)
RETURNS jsonb LANGUAGE plpgsql SET search_path TO '' AS $$
DECLARE d date := (now() at time zone 'Europe/Minsk')::date;
 m date := date_trunc('month',now() at time zone 'Europe/Minsk')::date;
 v_spent numeric; v_reserved numeric; v_tts numeric; v_count integer; v_id uuid;
BEGIN
 IF p_user_id IS NULL OR p_reserve_rub IS NULL OR p_reserve_rub < 0.01 OR p_reserve_rub > 20 THEN
  RETURN jsonb_build_object('allowed',false,'reason','invalid_request');
 END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id::text||m::text,0));
 INSERT INTO public.crm_ai360_core_month_v2(user_id,month_start) VALUES(p_user_id,m) ON CONFLICT DO NOTHING;
 SELECT spent_rub,reserved_rub INTO v_spent,v_reserved FROM public.crm_ai360_core_month_v2
 WHERE user_id=p_user_id AND month_start=m FOR UPDATE;
 SELECT coalesce(reserved_rub,0) INTO v_tts FROM public.crm_ai360_yandex_monthly_spend_v1
 WHERE user_id=p_user_id AND month_start=m;
 v_tts:=coalesce(v_tts,0);
 IF v_spent+v_reserved+v_tts+p_reserve_rub>5000 THEN
  RETURN jsonb_build_object('allowed',false,'reason','monthly_budget_exhausted','budget_rub',5000,
     'used_rub',v_spent+v_reserved+v_tts);
 END IF;
 INSERT INTO public.crm_ai360_llm_usage_v1 AS q(user_id,usage_day,calls)
 VALUES(p_user_id,d,1)
 ON CONFLICT(user_id,usage_day) DO UPDATE SET calls=q.calls+1 WHERE q.calls<300
 RETURNING calls INTO v_count;
 IF v_count IS NULL THEN
  RETURN jsonb_build_object('allowed',false,'reason','daily_dialog_limit','daily_limit',300);
 END IF;
 UPDATE public.crm_ai360_core_month_v2 SET reserved_rub=reserved_rub+p_reserve_rub,
    calls=calls+1,updated_at=now() WHERE user_id=p_user_id AND month_start=m;
 INSERT INTO public.crm_ai360_core_requests_v2(user_id,month_start,reserved_rub)
 VALUES(p_user_id,m,p_reserve_rub) RETURNING id INTO v_id;
 RETURN jsonb_build_object('allowed',true,'claim_id',v_id,'calls_today',v_count,'daily_limit',300,
 'budget_rub',5000,'used_rub',v_spent+v_reserved+v_tts+p_reserve_rub,'reservation_rub',p_reserve_rub,
 'fx_guard_rub_per_usd',100,'month',to_char(m,'YYYY-MM'));
END $$;

CREATE OR REPLACE FUNCTION public.crm_ai360_core_finish_v2(
 p_claim_id uuid,p_actual_rub numeric,p_input_tokens integer DEFAULT 0,
 p_output_tokens integer DEFAULT 0,p_rounds integer DEFAULT 0,p_status text DEFAULT 'ok'
) RETURNS jsonb LANGUAGE plpgsql SET search_path TO '' AS $$
DECLARE r public.crm_ai360_core_requests_v2%ROWTYPE; actual numeric;
BEGIN
 IF p_claim_id IS NULL THEN RETURN jsonb_build_object('ok',false,'reason','claim_missing'); END IF;
 SELECT * INTO r FROM public.crm_ai360_core_requests_v2 WHERE id=p_claim_id FOR UPDATE;
 IF NOT FOUND OR r.status<>'reserved' THEN RETURN jsonb_build_object('ok',false,'reason','already_finished_or_missing'); END IF;
 actual:=LEAST(r.reserved_rub,GREATEST(0,coalesce(p_actual_rub,r.reserved_rub)));
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
END $$;
REVOKE ALL ON FUNCTION public.crm_ai360_core_claim_v2(uuid,numeric) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.crm_ai360_core_finish_v2(uuid,numeric,integer,integer,integer,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.crm_ai360_core_claim_v2(uuid,numeric) TO service_role;
GRANT EXECUTE ON FUNCTION public.crm_ai360_core_finish_v2(uuid,numeric,integer,integer,integer,text) TO service_role;

-- Compatible v3 route consumes the same guarded budget, charged conservatively as estimate.
CREATE OR REPLACE FUNCTION public.crm_ai360_llm_claim_v1(p_user_id uuid)
RETURNS boolean LANGUAGE plpgsql SET search_path TO '' AS $$
DECLARE claim jsonb; ignored jsonb;
BEGIN
 claim:=public.crm_ai360_core_claim_v2(p_user_id,5);
 IF coalesce((claim->>'allowed')::boolean,false) IS NOT TRUE THEN RETURN false; END IF;
 ignored:=public.crm_ai360_core_finish_v2((claim->>'claim_id')::uuid,5,0,0,0,'legacy_estimated');
 RETURN coalesce((ignored->>'ok')::boolean,false);
END $$;
REVOKE ALL ON FUNCTION public.crm_ai360_llm_claim_v1(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.crm_ai360_llm_claim_v1(uuid) TO service_role;
