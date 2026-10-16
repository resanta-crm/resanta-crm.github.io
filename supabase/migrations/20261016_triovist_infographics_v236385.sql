-- Isolated Triovist infographics drafts. Intentionally no changes to sales, market or content sources.
create table if not exists public.triovist_infographics_v1 (
  id uuid primary key default gen_random_uuid(),
  sku text not null check (char_length(sku) between 1 and 80),
  manager_email text not null,
  created_by uuid not null references auth.users(id),
  mode text not null default 'professional' check(mode in ('fast','professional','ab')),
  state text not null default 'draft' check(state in ('draft','approved')),
  concept_key text not null default 'rational',
  product_snapshot jsonb not null default '{}'::jsonb,
  fact_snapshot jsonb not null default '[]'::jsonb,
  design jsonb not null default '{}'::jsonb,
  provider text,
  model text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists triovist_infographics_v1_owner_updated_idx on public.triovist_infographics_v1 (manager_email, updated_at desc);
create index if not exists triovist_infographics_v1_sku_updated_idx on public.triovist_infographics_v1 (sku, updated_at desc);
alter table public.triovist_infographics_v1 enable row level security;
revoke all on public.triovist_infographics_v1 from anon, authenticated;
comment on table public.triovist_infographics_v1 is 'Isolated private infographic drafts. API access only via authenticated Triovist AI Edge function with server-side owner checks. No operational sales/stock table modifications.';
