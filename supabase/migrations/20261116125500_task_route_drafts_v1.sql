-- Durable paid proposals. Opening/retrying a route is never permission to pay
-- for new model calls. No existing task, route, contract or history is changed.
create table public.crm_task_route_drafts_v1(
 route_id uuid not null references public.route_plans(id),
 client_id uuid not null references public.clients(id),
 kind text not null check(kind in('work','potential')),
 legal_key text not null,week_start date not null,route_day date not null,
 manager_name text not null,
 state text not null check(state in('preparing','ready','failed')),
 proposal jsonb check(proposal is null or jsonb_typeof(proposal)='object'),
 revision bigint not null default 1 check(revision>0),
 request_id uuid not null,request jsonb not null check(jsonb_typeof(request)='object'),
 request_fingerprint text not null,last_error text,
 created_by uuid not null references public.users(id),updated_by uuid not null references public.users(id),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 started_at timestamptz not null default now(),finished_at timestamptz,
 versions jsonb not null default '[]' check(jsonb_typeof(versions)='array'),
 primary key(route_id,client_id)
);
-- Mirrors the existing shipment-contract uniqueness rule. The other visits and
-- linked client IDs remain intact; they reference the original proposal.
create unique index crm_task_route_drafts_legal_week_v1 on public.crm_task_route_drafts_v1(legal_key,week_start) where kind='work';
alter table public.crm_task_route_drafts_v1 enable row level security;
revoke all on public.crm_task_route_drafts_v1 from public,anon,authenticated;
grant select,insert,update on public.crm_task_route_drafts_v1 to service_role;

create schema if not exists crm_task_private_v1;
revoke all on schema crm_task_private_v1 from public,anon;
grant usage on schema crm_task_private_v1 to authenticated;

-- Non-exposed definer is needed only for the service-only proposal metadata.
-- Every path checks the current actor and exact route/client access first.
create or replace function crm_task_private_v1.task_route_coverage_row_v1(p_route uuid,p_client uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare u public.users;r public.route_plans;c public.clients;legal text;week date;existing jsonb;draft_ref jsonb;
begin
 select * into u from public.users where id=(select auth.uid());
 if not found or u.role is distinct from 'boss' or not coalesce(u.region in('Витебск','Все филиалы'),false)then raise exception 'TASK_CREATE_FORBIDDEN' using errcode='42501';end if;
 select * into r from public.route_plans where id=p_route and not coalesce(removed,false) and (approved or review_status='approved');
 if not found or coalesce(r.is_network_point,false) or r.network_point_id is not null then raise exception 'TASK_ROUTE_REQUIRED';end if;
 if not coalesce(p_client=r.client_id or p_client=any(coalesce(r.linked_client_ids,'{}'::uuid[])),false)then raise exception 'TASK_ROUTE_MISMATCH';end if;
 select * into c from public.clients where id=p_client;
 if not found or c.manager_name is distinct from r.manager_name or not coalesce(public.crm_tasks_access_v4(c.id,r.manager_name),false)then raise exception 'TASK_CLIENT_SCOPE' using errcode='42501';end if;
 if c.client_status is null or c.client_status not in('Рабочий','Потенциальный')then raise exception 'TASK_CLIENT_STATUS';end if;
 legal:=public.crm_tasks_legal_key_v4(c.id);week:=date_trunc('week',r.visit_date)::date;
 select jsonb_build_object('reason','route_assignment','task_id',a.task_id,'client_id',a.client_id,'route_id',a.route_id,'route_day',a.route_day,'cancelled',a.cancelled,'title',t.title)
 into existing from public.crm_task_assignments_v5 a join public.tasks t on t.id=a.task_id where a.route_id=r.id and a.client_id=c.id;
 if existing is null and c.client_status='Рабочий' then
  select jsonb_build_object('reason','legal_week','task_id',v.task_id,'client_id',v.client_id,'route_id',v.route_id,'route_day',v.route_day,'state',v.state,'title',t.title)
  into existing from public.crm_task_contracts_v4 v join public.tasks t on t.id=v.task_id
  where v.legal_key=legal and v.week_start=week and v.branch='Витебск' and public.crm_tasks_access_v4(v.client_id,v.manager_name);
 end if;
 select jsonb_build_object('route_id',d.route_id,'client_id',d.client_id,'route_day',d.route_day,'manager_name',d.manager_name,'revision',d.revision,'state',d.state,'obsolete',coalesce(anchor.removed,false)or anchor.visit_date is distinct from d.route_day)
 into draft_ref from public.crm_task_route_drafts_v1 d join public.route_plans anchor on anchor.id=d.route_id
 where ((d.route_id=r.id and d.client_id=c.id)or(c.client_status='Рабочий' and d.kind='work' and d.legal_key=legal and d.week_start=week))
 and public.crm_tasks_access_v4(d.client_id,d.manager_name)
 order by (d.route_id=r.id and d.client_id=c.id)desc limit 1;
 return jsonb_build_object('scope',jsonb_build_object('kind',case when c.client_status='Рабочий' then 'work' else 'potential' end,'legal_key',legal,'week_start',week,'route_day',r.visit_date,'manager_name',r.manager_name),'existing',existing,'draft_ref',draft_ref);
end $$;
revoke all on function crm_task_private_v1.task_route_coverage_row_v1(uuid,uuid) from public,anon,authenticated;
grant execute on function crm_task_private_v1.task_route_coverage_row_v1(uuid,uuid) to authenticated;

create or replace function public.crm_task_route_existing_v1(p_route uuid,p_client uuid)
returns jsonb language sql stable security invoker set search_path='' as $$
 select crm_task_private_v1.task_route_coverage_row_v1(p_route,p_client)
$$;
revoke all on function public.crm_task_route_existing_v1(uuid,uuid) from public,anon,authenticated;
grant execute on function public.crm_task_route_existing_v1(uuid,uuid) to authenticated;

create or replace function public.crm_task_route_coverage_v1(p_manager text,p_week date)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare u public.users;week date;result jsonb;
begin
 select * into u from public.users where id=(select auth.uid());
 if not found or u.role is distinct from 'boss' or not coalesce(u.region in('Витебск','Все филиалы'),false)then raise exception 'TASK_CREATE_FORBIDDEN' using errcode='42501';end if;
 if p_week is null then raise exception 'TASK_WEEK_REQUIRED';end if;
 week:=date_trunc('week',p_week::timestamp)::date;
 select coalesce(jsonb_agg(jsonb_build_object('route_id',r.id,'client_id',c.id,'client_status',c.client_status,'legal_key',coverage.value->'scope'->'legal_key','existing',coverage.value->'existing','draft_ref',coverage.value->'draft_ref')order by r.visit_date,r.id,c.id),'[]'::jsonb)
 into result from public.route_plans r
 cross join lateral(select distinct x as client_id from unnest(array_prepend(r.client_id,coalesce(r.linked_client_ids,'{}'::uuid[])))x where x is not null) ids
 join public.clients c on c.id=ids.client_id
 cross join lateral(select crm_task_private_v1.task_route_coverage_row_v1(r.id,c.id)as value)coverage
 where (p_manager is null or btrim(p_manager)='' or r.manager_name=p_manager)
 and r.visit_date>=week and r.visit_date<week+7 and not coalesce(r.removed,false)
 and (r.approved or r.review_status='approved') and not coalesce(r.is_network_point,false) and r.network_point_id is null
 and c.manager_name=r.manager_name and c.client_status in('Рабочий','Потенциальный') and public.crm_tasks_access_v4(c.id,r.manager_name);
 return result;
end $$;
revoke all on function public.crm_task_route_coverage_v1(text,date) from public,anon,authenticated;
grant execute on function public.crm_task_route_coverage_v1(text,date) to authenticated;
