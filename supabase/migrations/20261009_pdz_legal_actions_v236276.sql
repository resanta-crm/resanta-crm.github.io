-- PDZ legal action audit: claim sent / documents submitted to court.
create table if not exists public.pdz_legal_actions (
  id uuid primary key default gen_random_uuid(),
  client_key text not null,
  client_name text not null,
  client_id uuid null references public.clients(id) on delete set null,
  action_type text not null check (action_type in ('claim_sent','court_submitted')),
  action_at timestamptz not null default now(),
  comment text null,
  report_date date null,
  debt_days integer null,
  debt_amount numeric null,
  author_user_id uuid not null references public.users(id) on delete restrict,
  author_name text not null,
  author_email text null,
  created_at timestamptz not null default now()
);

create index if not exists pdz_legal_actions_client_idx
  on public.pdz_legal_actions (client_key, action_type, action_at desc);

alter table public.pdz_legal_actions enable row level security;

drop policy if exists pdz_legal_actions_select_authenticated on public.pdz_legal_actions;
create policy pdz_legal_actions_select_authenticated
on public.pdz_legal_actions for select
to authenticated
using (true);

drop policy if exists pdz_legal_actions_write_service_role on public.pdz_legal_actions;
create policy pdz_legal_actions_write_service_role
on public.pdz_legal_actions for all
to public
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

create or replace function public.crm_pdz_record_legal_action_v1(
  p_client_name text,
  p_action_type text,
  p_comment text default null,
  p_report_date date default null,
  p_debt_days integer default null,
  p_debt_amount numeric default null,
  p_client_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_catalog','pg_temp'
as $function$
declare
  u public.users%rowtype;
  k text;
  r public.pdz_legal_actions%rowtype;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  select * into u from public.users where id=auth.uid();
  if not found then
    raise exception 'CRM_USER_NOT_FOUND';
  end if;

  if lower(coalesce(u.email,'')) not in ('sidarovich_kn@resanta.ru','payushin_ar@resanta.ru') then
    raise exception 'PDZ_LEGAL_ACTION_FORBIDDEN';
  end if;

  if p_action_type not in ('claim_sent','court_submitted') then
    raise exception 'INVALID_ACTION_TYPE';
  end if;

  if coalesce(btrim(p_client_name),'')='' then
    raise exception 'CLIENT_REQUIRED';
  end if;

  k=btrim(regexp_replace(lower(replace(p_client_name,'ё','е')),'[^0-9a-zа-я]+',' ','g'));

  insert into public.pdz_legal_actions(
    client_key,client_name,client_id,action_type,comment,report_date,debt_days,debt_amount,
    author_user_id,author_name,author_email
  )
  values(
    k,btrim(p_client_name),p_client_id,p_action_type,nullif(btrim(coalesce(p_comment,'')),''),
    p_report_date,p_debt_days,p_debt_amount,u.id,u.name,u.email
  )
  returning * into r;

  return jsonb_build_object(
    'ok',true,'id',r.id,'client_key',r.client_key,'client_name',r.client_name,
    'action_type',r.action_type,'action_at',r.action_at,'comment',r.comment,
    'author_name',r.author_name,'author_email',r.author_email
  );
end;
$function$;

revoke all on function public.crm_pdz_record_legal_action_v1(text,text,text,date,integer,numeric,uuid) from public;
grant execute on function public.crm_pdz_record_legal_action_v1(text,text,text,date,integer,numeric,uuid) to authenticated;
