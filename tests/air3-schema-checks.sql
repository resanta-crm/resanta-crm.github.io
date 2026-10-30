\set ON_ERROR_STOP on
-- Run only on disposable PostgreSQL in GitHub Actions.
DO $$
DECLARE v_count integer;
BEGIN
 SELECT count(*) INTO v_count
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public' AND c.relname IN ('crm_air3_pairings_v1','crm_air3_sessions_v1','crm_air3_rate_limits_v1')
   AND c.relrowsecurity;
 IF v_count<>3 THEN RAISE EXCEPTION 'RLS must be enabled on all three AIR3 tables, got %',v_count; END IF;
 IF has_table_privilege('anon','public.crm_air3_pairings_v1','SELECT')
 OR has_table_privilege('authenticated','public.crm_air3_pairings_v1','SELECT')
 OR has_table_privilege('anon','public.crm_air3_sessions_v1','SELECT')
 OR has_table_privilege('authenticated','public.crm_air3_sessions_v1','SELECT')
 OR has_table_privilege('anon','public.crm_air3_rate_limits_v1','SELECT')
 OR has_table_privilege('authenticated','public.crm_air3_rate_limits_v1','SELECT')
 THEN RAISE EXCEPTION 'AIR3 table readable without service_role'; END IF;
 IF has_table_privilege('anon','public.crm_air3_pairings_v1','INSERT')
 OR has_table_privilege('authenticated','public.crm_air3_sessions_v1','UPDATE')
 THEN RAISE EXCEPTION 'AIR3 table writable by untrusted role'; END IF;
 IF has_function_privilege('anon','public.crm_air3_rate_limit_v1(text,integer,integer)','EXECUTE')
 OR has_function_privilege('authenticated','public.crm_air3_rate_limit_v1(text,integer,integer)','EXECUTE')
 THEN RAISE EXCEPTION 'AIR3 rate limiter publicly executable'; END IF;
 IF NOT has_function_privilege('service_role','public.crm_air3_rate_limit_v1(text,integer,integer)','EXECUTE')
 THEN RAISE EXCEPTION 'service_role cannot call AIR3 rate limiter'; END IF;
END $$;

SET ROLE service_role;
DO $$
BEGIN
 IF NOT public.crm_air3_rate_limit_v1('air3-security-test',2,60) THEN RAISE EXCEPTION 'First request should pass'; END IF;
 IF NOT public.crm_air3_rate_limit_v1('air3-security-test',2,60) THEN RAISE EXCEPTION 'Second request should pass'; END IF;
 IF public.crm_air3_rate_limit_v1('air3-security-test',2,60) THEN RAISE EXCEPTION 'Third request must be rate-limited'; END IF;
END $$;
RESET ROLE;
SELECT 'AIR3 RLS, grants and rate limit verified on disposable PostgreSQL' AS result;
