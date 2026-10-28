-- Yandex TTS and OpenAI text core now share the 5,000 RUB protective monthly envelope.
-- Preserve original 0.1626 RUB reservation per short TTS segment and 240-character limit.
CREATE OR REPLACE FUNCTION public.crm_ai360_yandex_monthly_claim_v1(p_user_id uuid,p_characters integer)
RETURNS jsonb LANGUAGE plpgsql SET search_path TO '' AS $$
DECLARE m date := date_trunc('month',now() at time zone 'Europe/Moscow')::date;
 cost constant numeric(12,4):=0.1626;
 actual_rub numeric(12,4); reserved_count int;
 core_rub numeric(14,4):=0; current_tts numeric(14,4):=0;
 allowed boolean := false;
BEGIN
 IF p_user_id IS NULL OR p_characters IS NULL OR p_characters<1 OR p_characters>240 THEN
  RETURN jsonb_build_object('allowed',false,'error','invalid_segment');
 END IF;
 -- Share transaction lock with text dialog claims. Avoid simultaneous overreservation.
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id::text||m::text,0));
 SELECT coalesce(spent_rub+reserved_rub,0) INTO core_rub
 FROM public.crm_ai360_core_month_v2 WHERE user_id=p_user_id AND month_start=m;
 core_rub:=coalesce(core_rub,0);
 SELECT coalesce(reserved_rub,0),requests INTO current_tts,reserved_count
 FROM public.crm_ai360_yandex_monthly_spend_v1 WHERE user_id=p_user_id AND month_start=m;
 current_tts:=coalesce(current_tts,0);
 IF core_rub+current_tts+cost>5000 THEN
  RETURN jsonb_build_object('allowed',false,'error','monthly_budget_exhausted',
   'limit_rub',5000,'remaining_rub',greatest(0,5000-core_rub-current_tts),
   'reserved_rub',current_tts,'core_rub',core_rub,'requests',coalesce(reserved_count,0));
 END IF;
 INSERT INTO public.crm_ai360_yandex_monthly_spend_v1 AS q
   (user_id,month_start,requests,tts_characters,reserved_rub)
 VALUES(p_user_id,m,1,p_characters,cost)
 ON CONFLICT(user_id,month_start) DO UPDATE SET
   requests=q.requests+1,tts_characters=q.tts_characters+p_characters,
   reserved_rub=q.reserved_rub+cost,updated_at=now()
 WHERE q.reserved_rub+cost+core_rub<=5000
 RETURNING reserved_rub,requests INTO actual_rub,reserved_count;
 allowed:=found;
 IF NOT allowed THEN
  SELECT reserved_rub,requests INTO actual_rub,reserved_count FROM public.crm_ai360_yandex_monthly_spend_v1
  WHERE user_id=p_user_id AND month_start=m;
 END IF;
 RETURN jsonb_build_object('allowed',allowed,'month',to_char(m,'YYYY-MM'),
  'reserved_rub',coalesce(actual_rub,0),'core_rub',core_rub,
  'remaining_rub',greatest(0,5000-core_rub-coalesce(actual_rub,0)),
  'limit_rub',5000,'requests',coalesce(reserved_count,0));
END $$;
REVOKE ALL ON FUNCTION public.crm_ai360_yandex_monthly_claim_v1(uuid,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.crm_ai360_yandex_monthly_claim_v1(uuid,integer) TO service_role;