create table public.crm_negotiation_training_v1 (
  id uuid primary key,
  owner_id uuid not null,
  manager_name text not null,
  client_id uuid references public.clients(id) on delete set null,
  visit_id uuid references public.visits(id) on delete set null,
  prospect_name text not null check (length(prospect_name) between 2 and 180),
  city text not null default '' check (length(city) <= 120),
  address text not null default '' check (length(address) <= 220),
  audio_state text not null default 'draft'
    check (audio_state in ('draft', 'uploading', 'queued', 'ready', 'error')),
  consent_at timestamptz,
  upload_id text,
  upload_size integer,
  upload_part_size integer,
  job_id text,
  next_poll_at timestamptz not null default '-infinity',
  transcript jsonb,
  manager_speaker text,
  review jsonb,
  busy_until timestamptz not null default '-infinity',
  version integer not null default 0,
  created_at timestamptz not null default now()
);

create index crm_negotiation_training_v1_owner_created
  on public.crm_negotiation_training_v1 (owner_id, created_at desc);
create index crm_negotiation_training_v1_created
  on public.crm_negotiation_training_v1 (created_at desc);

alter table public.crm_negotiation_training_v1 enable row level security;
revoke all on table public.crm_negotiation_training_v1 from public, anon, authenticated;
grant select, insert, update on table public.crm_negotiation_training_v1 to service_role;
