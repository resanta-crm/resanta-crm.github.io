-- Explicit branch ownership wins over a legacy manager-name fallback.
create or replace function crm_private.client_scope_v1() returns setof uuid language plpgsql stable security definer set search_path='' as $$
declare a public.users%rowtype;
begin
 a:=crm_private.client_actor_v1();
 return query select c.id from public.clients c
 where not coalesce(c.is_archived,false) and not coalesce(c.to_delete,false) and
 ((a.role='manager' and c.manager_name=a.name and (not exists(select 1 from public.crm_client_branch_links_v1 bc where bc.client_id=c.id) or exists(select 1 from public.crm_client_branch_links_v1 bc join public.crm_client_branch_users_v1 bu on bu.branch_id=bc.branch_id where bc.client_id=c.id and bu.user_id=a.id))) or
 (a.role='boss' and (a.id in ('544fb1e2-ef70-44de-bc62-e0e1596a4bfc'::uuid,'a24954b8-2fe1-4852-b629-d8f351e1bd36'::uuid) or
 exists(select 1 from public.crm_client_branch_links_v1 bc join public.crm_client_branch_users_v1 bu on bu.branch_id=bc.branch_id where bc.client_id=c.id and bu.user_id=a.id) or
 (not exists(select 1 from public.crm_client_branch_links_v1 bc where bc.client_id=c.id) and exists(select 1 from public.users m join public.crm_client_branch_users_v1 mu on mu.user_id=m.id
 join public.crm_client_branch_users_v1 bu on bu.branch_id=mu.branch_id where bu.user_id=a.id and m.name=c.manager_name)))));
end $$;
