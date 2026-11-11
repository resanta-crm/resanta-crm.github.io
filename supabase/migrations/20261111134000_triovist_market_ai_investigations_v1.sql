-- Isolated audit trail for investigation of 21vek ranking movements.
-- Does not change market parser tables, authorization of existing functions or their RLS.
create table if not exists public.triovist_market_ai_investigations_v1 (
  id uuid primary key default gen_random_uuid(),
  snapshot_day date not null,
  scope_key text not null,
  kind text not null check (kind in ('own','competitor')),
  entity_key text not null,
  title text not null,
  manager_email text,
  created_by text,
  observed_at timestamptz not null,
  position_before integer,
  position_at_start integer,
  evidence jsonb not null default '{}'::jsonb,
  ai_result jsonb,
  ai_status text not null default 'pending'
    check (ai_status in ('pending','ready','unavailable')),
  status text not null default 'research'
    check (status in ('research','manager_answered','approved','need_evidence','rejected')),
  manager_answer text,
  manager_source text,
  manager_answer_at timestamptz,
  director_note text,
  director_reviewed_at timestamptz,
  checked_3d_position integer,
  checked_3d_at timestamptz,
  checked_7d_position integer,
  checked_7d_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (snapshot_day,scope_key,kind,entity_key)
);
create index if not exists tm_ai_investigation_recent_v1
  on public.triovist_market_ai_investigations_v1 (created_at desc);
create index if not exists tm_ai_investigation_manager_v1
  on public.triovist_market_ai_investigations_v1 (manager_email,created_at desc);
create index if not exists tm_ai_investigation_followup_v1
  on public.triovist_market_ai_investigations_v1 (snapshot_day,checked_3d_at,checked_7d_at);
alter table public.triovist_market_ai_investigations_v1 enable row level security;
revoke all on public.triovist_market_ai_investigations_v1 from public,anon,authenticated;
grant select,insert,update,delete on public.triovist_market_ai_investigations_v1 to service_role;

create table if not exists public.triovist_market_ai_daily_runs_v1 (
  run_day date primary key,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running'
    check (status in ('running','completed','failed')),
  scopes_seen integer not null default 0,
  candidates_seen integer not null default 0,
  ai_calls integer not null default 0,
  error_code text
);
alter table public.triovist_market_ai_daily_runs_v1 enable row level security;
revoke all on public.triovist_market_ai_daily_runs_v1 from public,anon,authenticated;
grant select,insert,update,delete on public.triovist_market_ai_daily_runs_v1 to service_role;
