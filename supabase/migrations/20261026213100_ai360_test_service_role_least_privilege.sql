-- Least privilege for isolated AI360 testing ledger.
-- Supabase default privilege grants may initially confer more than read/insert to service_role.
revoke all on table public.ai360_voice_test_drafts_v1 from service_role;
grant select, insert on table public.ai360_voice_test_drafts_v1 to service_role;
