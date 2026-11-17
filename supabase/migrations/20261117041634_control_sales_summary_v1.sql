-- Control Center needs only current sales/plan. Reuse the canonical leaderboard;
-- leave the full KPI dashboard and its historical/YoY methods unchanged.
create or replace function public.crm_control_sales_summary_v1(p_month text)
returns jsonb
language plpgsql
security definer
set search_path='public','auth','pg_catalog'
as $function$
declare
  actor public.users%rowtype;
  last_available_month text;
  sales_rows jsonb;
begin
  if p_month is null or p_month !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' then
    raise exception 'invalid_month' using errcode='22023';
  end if;
  -- Match the existing full endpoint's date validity as well as its format.
  perform (p_month||'-01')::date;
  select * into actor from public.users where id=auth.uid();
  if actor.id is null then
    raise exception 'login_required' using errcode='42501';
  end if;
  -- Exact existing KPI360 allowlist, including the protected executive identity.
  -- IS NOT TRUE denies nullable/partially configured profiles explicitly.
  if (
    (actor.role='boss' and actor.region='Витебск' and
      public.crm_v2263_norm(actor.name) in ('александр паюшин','сидарович к н'))
    or
    (actor.role='manager' and actor.region='Витебск' and
      public.crm_v2263_norm(actor.name) in ('руднев','ачинович','шкуран'))
    or
    (actor.role='boss'
      and actor.id='a24954b8-2fe1-4852-b629-d8f351e1bd36'::uuid
      and lower(actor.email)='petrovichev@resanta.ru'
      and actor.access_scope='standard'
      and actor.region='Все филиалы')
  ) is not true then
    raise exception 'not_authorized' using errcode='42501';
  end if;

  select to_char(max(month),'YYYY-MM') into last_available_month
  from public.purchase_history;
  select coalesce(jsonb_agg(jsonb_build_object(
    'manager_name',x.manager_name,
    'shipment',x.shipment,
    'shipment_plan',x.shipment_plan
  ) order by x.manager_name),'[]'::jsonb) into sales_rows
  from public.crm_manager_kpi_leaderboard(p_month) x
  where actor.role='boss' or
    public.crm_v2263_norm(x.manager_name)=public.crm_v2263_norm(actor.name);

  return jsonb_build_object(
    'version','kpi360-sales-v1',
    'month',p_month,
    'latest_sales_month',last_available_month,
    'sales',sales_rows
  );
end;
$function$;
revoke all on function public.crm_control_sales_summary_v1(text) from public,anon,service_role;
grant execute on function public.crm_control_sales_summary_v1(text) to authenticated;
