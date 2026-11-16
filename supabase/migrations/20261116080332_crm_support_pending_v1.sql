create function public.crm_support_pending_v1() returns setof public.crm_support_tickets_v1 language sql stable security definer set search_path='' as $$ select * from public.crm_support_tickets_v1 where revision>analyzed_revision and status in('new','review','needs_info','awaiting_approval') order by blocking desc,created_at limit 8 $$;
revoke all on function public.crm_support_pending_v1() from public,anon,authenticated;
grant execute on function public.crm_support_pending_v1() to service_role;
