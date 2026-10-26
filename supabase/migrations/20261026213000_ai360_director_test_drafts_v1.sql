-- AI360 TEST-ONLY sandbox. No real task rows, notifications or manager views.
-- Read/write allowed solely to service_role AFTER verified director auth in Edge.
create table if not exists public.ai360_voice_test_drafts_v1 (
  id uuid primary key,
  approval_id uuid not null,
  client_id uuid not null,
  client_name text not null,
  manager_id uuid not null,
  manager_name text not null,
  title text not null,
  text text not null,
  due_date date not null,
  priority text not null default 'средний',
  basis text not null default '',
  expected_result text not null default '',
  criteria text not null default '',
  status text not null default 'test_draft' check (status='test_draft'),
  created_by uuid not null,
  created_at timestamptz not null default now(),
  constraint ai360_test_draft_once_per_approval unique(approval_id,client_id),
  constraint ai360_test_draft_title_max check (char_length(title)<=110),
  constraint ai360_test_draft_text_max check (char_length(text) between 8 and 500)
);
alter table public.ai360_voice_test_drafts_v1 enable row level security;
-- No SELECT/INSERT/UPDATE/DELETE rights for manager (authenticated) sessions.
revoke all on table public.ai360_voice_test_drafts_v1 from public, anon, authenticated;
grant select, insert on table public.ai360_voice_test_drafts_v1 to service_role;
comment on table public.ai360_voice_test_drafts_v1 is
 'Director-only isolated voice AI test results. NOT real tasks; not surfaced to manager/task/notification reports. Edge service_role only. No manager RLS policies.';
