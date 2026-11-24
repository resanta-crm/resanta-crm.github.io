alter table public.crm_negotiation_training_v1
  add column workspace text not null default 'pilot'
  check (workspace in ('pilot', 'production'));

create index crm_negotiation_training_v1_workspace_owner_created
  on public.crm_negotiation_training_v1 (workspace, owner_id, created_at desc);

create index crm_negotiation_training_v1_workspace_created
  on public.crm_negotiation_training_v1 (workspace, created_at desc);

create index crm_negotiation_training_v1_client
  on public.crm_negotiation_training_v1 (client_id) where client_id is not null;

create index crm_negotiation_training_v1_visit
  on public.crm_negotiation_training_v1 (visit_id) where visit_id is not null;
