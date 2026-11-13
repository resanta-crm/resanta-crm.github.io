-- Align the already-deployed STT quota claim with its storage constraint.
-- crm_voice_claim_v1 allows 300 daily claims, but old CHECK capped requests at 60.
-- At request 61 this caused SQLSTATE 23514 -> PostgREST 400 -> STT HTTP 503.
-- Monthly OpenAI and STT budget claims remain unchanged.
ALTER TABLE public.crm_voice_usage_v1
  DROP CONSTRAINT IF EXISTS crm_voice_usage_v1_requests_check;
ALTER TABLE public.crm_voice_usage_v1
  ADD CONSTRAINT crm_voice_usage_v1_requests_check
  CHECK (requests >= 0 AND requests <= 300);
