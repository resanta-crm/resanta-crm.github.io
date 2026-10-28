-- The original daily LLM counter had an independent CHECK(calls <= 20).
-- Expand both the claim policy and its storage invariant to 300; retain nonnegative lower bound.
ALTER TABLE public.crm_ai360_llm_usage_v1 DROP CONSTRAINT crm_ai360_llm_usage_v1_calls_check;
ALTER TABLE public.crm_ai360_llm_usage_v1 ADD CONSTRAINT crm_ai360_llm_usage_v1_calls_check CHECK (calls>=0 AND calls<=300);
