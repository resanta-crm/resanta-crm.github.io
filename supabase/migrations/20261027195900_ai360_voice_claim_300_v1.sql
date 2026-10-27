-- AI360 director voice STT budget: daily per-user ceiling, still scoped by
-- existing server JWT + director role guard in crm-voice-transcribe-v1.
-- Future multiuser launch MUST retain per-user auth & organizational budget.
-- No session resets, login writes, voice recordings, or unrelated CRM changes.
CREATE OR REPLACE FUNCTION public.crm_voice_claim_v1(p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE n integer;
BEGIN
 INSERT INTO public.crm_voice_usage_v1 AS c (user_id,usage_date,requests)
 VALUES (p_user_id,(now() AT TIME ZONE 'utc')::date,1)
 ON CONFLICT (user_id,usage_date)
 DO UPDATE SET requests=c.requests+1, updated_at=now()
 WHERE c.requests < 300
 RETURNING requests INTO n;
 RETURN n IS NOT NULL;
END;
$function$;
