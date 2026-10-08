-- Allow logged-in CRM users to maintain expression indexes on client_aliases.
grant execute on function public.crm_v2263_norm(text) to authenticated;
