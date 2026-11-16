create table if not exists public.crm_task_model_cache_v1 (
 key text primary key check(length(key)=64),
 user_id uuid not null,
 status text not null check(status in ('running','ready','failed')),
 result jsonb,
 created_at timestamptz not null default now(),
 check(status <> 'ready' or result is not null)
);
alter table public.crm_task_model_cache_v1 enable row level security;
revoke all on public.crm_task_model_cache_v1 from public, anon, authenticated;
grant select,insert,update,delete on public.crm_task_model_cache_v1 to service_role;
