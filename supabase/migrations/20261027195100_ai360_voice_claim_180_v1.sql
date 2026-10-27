-- Increase the already existing, transaction-safe daily STT reservation from 60 to 180
-- for the director voice pilot. No changes to auth, user records, or media storage.
-- Upper bound: 180 requests/day; 12-second clips at current GPT-Transcribe prices
-- would cost approximately $0.16/day of STT usage if all 180 are full-length.
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
 WHERE c.requests < 180
 RETURNING requests INTO n;
 RETURN n IS NOT NULL;
END;
$function$;
