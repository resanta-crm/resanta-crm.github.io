-- Lera AI360 private, user-consented TEXT transcript retention.
-- Audio is never stored. No backfill; previous conversations cannot be restored.
-- All access is through the JWT-verified Agent360 gateway (service_role only).
-- Daily pg_cron purge; expired records are also hidden immediately by the API.

create table if not exists public.crm_ai360_lera_history_settings_v1 (
  user_id uuid primary key references auth.users(id) on delete cascade,
  enabled boolean not null default false,
  updated_at timestamptz not null default now()
);

create table if not exists public.crm_ai360_lera_history_v1 (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  mode text not null check (mode in ('chat','crm')),
  question text not null check (char_length(question) between 1 and 400),
  answer text not null check (char_length(answer) between 1 and 3200),
  answer_verified boolean not null default false,
  feedback_type text check (feedback_type is null or feedback_type in
    ('Неверные данные','Не поняла вопрос','Ошибка озвучки','Неудобный интерфейс','Другое')),
  feedback_note text check (feedback_note is null or char_length(feedback_note)<=500),
  feedback_at timestamptz,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '30 days')
);

create index if not exists crm_ai360_lera_history_user_recent_v1
  on public.crm_ai360_lera_history_v1 (user_id, created_at desc);
create index if not exists crm_ai360_lera_history_expires_v1
  on public.crm_ai360_lera_history_v1 (expires_at);

alter table public.crm_ai360_lera_history_settings_v1 enable row level security;
alter table public.crm_ai360_lera_history_v1 enable row level security;

-- No authenticated/anon table access. This prevents exposing individual chat
-- content via the public Data API even to a high-privilege CRM director.
revoke all on public.crm_ai360_lera_history_settings_v1 from PUBLIC, anon, authenticated;
revoke all on public.crm_ai360_lera_history_v1 from PUBLIC, anon, authenticated;
grant select,insert,update,delete on public.crm_ai360_lera_history_settings_v1 to service_role;
grant select,insert,update,delete on public.crm_ai360_lera_history_v1 to service_role;

-- pg_cron is already installed in the CRM Supabase project.
select cron.schedule(
  'lera_ai360_history_30d_purge',
  '17 3 * * *',
  $$delete from public.crm_ai360_lera_history_v1 where expires_at <= now();$$
);
