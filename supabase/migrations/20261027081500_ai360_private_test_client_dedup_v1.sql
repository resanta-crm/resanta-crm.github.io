-- AI360 pilot: protect test-only ledger from duplicate approvals across DIFFERENT
-- approval_id values while retaining the two existing historic test records.
-- All manager/authenticated roles have no table privileges or RLS policies.
create or replace function public.ai360_reject_duplicate_private_test_client_v1()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if NEW.status <> 'test_draft' then
    raise exception 'invalid_private_test_status' using errcode='23514';
  end if;
  -- Serialize concurrent attempts for one director/client; no table mutations.
  perform pg_advisory_xact_lock(
    hashtextextended(NEW.created_by::text || '|' || NEW.client_id::text, 0)
  );
  if exists(
    select 1 from public.ai360_voice_test_drafts_v1 existing
     where existing.created_by = NEW.created_by
       and existing.client_id = NEW.client_id
       and existing.status = 'test_draft'
  ) then
    raise exception 'ai360_test_client_already_saved' using errcode='23505';
  end if;
  return NEW;
end;
$$;
revoke all on function public.ai360_reject_duplicate_private_test_client_v1() from PUBLIC, anon, authenticated;
grant execute on function public.ai360_reject_duplicate_private_test_client_v1() to service_role;
drop trigger if exists ai360_private_test_unique_client_guard_v1 on public.ai360_voice_test_drafts_v1;
create trigger ai360_private_test_unique_client_guard_v1
before insert on public.ai360_voice_test_drafts_v1
for each row execute function public.ai360_reject_duplicate_private_test_client_v1();
