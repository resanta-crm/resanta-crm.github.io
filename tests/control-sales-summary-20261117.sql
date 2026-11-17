-- Run only after the candidate RPC has been reviewed and applied.
-- Read-only assertions with transaction-local caller claims; no profile/history writes.
begin;
set local statement_timeout='60000';

do $acl$
begin
  if to_regprocedure('public.crm_control_sales_summary_v1(text)') is null then
    raise exception 'candidate_not_applied';
  end if;
  if has_function_privilege('anon','public.crm_control_sales_summary_v1(text)','execute') then
    raise exception 'anon_has_execute';
  end if;
  if has_function_privilege('service_role','public.crm_control_sales_summary_v1(text)','execute') then
    raise exception 'unexpected_service_execute';
  end if;
  if not has_function_privilege('authenticated','public.crm_control_sales_summary_v1(text)','execute') then
    raise exception 'authenticated_missing_execute';
  end if;
end;
$acl$;

set local role authenticated;
do $parity$
declare
  scenario record;
  actual jsonb;
  full_result jsonb;
  expected_sales jsonb;
  rejected boolean;
  bad_month text;
begin
  for scenario in select * from (values
    ('owner','544fb1e2-ef70-44de-bc62-e0e1596a4bfc'::uuid,false),
    ('branch','ba55dfe5-7e48-4f1f-b40e-674c7752fe1a'::uuid,false),
    ('rudnev','19dd9943-99ae-47c4-a39c-4f82a11059a6'::uuid,true),
    ('achinovich','3d935a76-c6fe-44b6-b248-fcbe58c6bf1c'::uuid,true),
    ('shkuran','4fd79fa0-232d-4768-8099-25f47923cc4f'::uuid,true),
    ('protected_executive','a24954b8-2fe1-4852-b629-d8f351e1bd36'::uuid,false)
  ) x(label,user_id,field_actor) loop
    perform set_config('request.jwt.claim.sub',scenario.user_id::text,true);
    perform set_config('request.jwt.claim.role','authenticated',true);
    perform set_config('request.jwt.claims',jsonb_build_object('sub',scenario.user_id,'role','authenticated')::text,true);
    actual:=public.crm_control_sales_summary_v1('2026-11');
    full_result:=public.crm_manager_kpi360_dashboard_v2('2026-11');
    select coalesce(jsonb_agg(jsonb_build_object(
      'manager_name',x.value->'manager_name',
      'shipment',x.value->'shipment',
      'shipment_plan',x.value->'shipment_plan'
    ) order by x.value->>'manager_name'),'[]'::jsonb)
    into expected_sales from jsonb_array_elements(full_result->'sales') x;
    if actual->'sales' is distinct from expected_sales then
      raise exception 'sales_parity_failed: %',scenario.label;
    end if;
    if actual->>'version'<>'kpi360-sales-v1' or actual->>'month'<>'2026-11'
      or actual->'latest_sales_month' is distinct from full_result->'latest_sales_month' then
      raise exception 'envelope_parity_failed: %',scenario.label;
    end if;
    if (select count(*) from jsonb_object_keys(actual))<>4 then
      raise exception 'unexpected_extra_payload: %',scenario.label;
    end if;
    if jsonb_array_length(actual->'sales')<>(case when scenario.field_actor then 1 else 3 end) then
      raise exception 'scope_failed: %',scenario.label;
    end if;
  end loop;

  -- A real excluded account plus a missing profile must fail, not return empty/stale facts.
  for scenario in select * from (values
    ('unauthorized_account','bcc330b8-9100-4c60-b87f-22a36988fc97'::uuid),
    ('missing_profile','00000000-0000-0000-0000-000000000001'::uuid)
  ) x(label,user_id) loop
    perform set_config('request.jwt.claim.sub',scenario.user_id::text,true);
    perform set_config('request.jwt.claims',jsonb_build_object('sub',scenario.user_id,'role','authenticated')::text,true);
    rejected:=false;
    begin
      perform public.crm_control_sales_summary_v1('2026-11');
    exception when insufficient_privilege then rejected:=true;
    end;
    if not rejected then raise exception 'unauthorized_caller_allowed: %',scenario.label; end if;
  end loop;

  perform set_config('request.jwt.claim.sub','544fb1e2-ef70-44de-bc62-e0e1596a4bfc',true);
  perform set_config('request.jwt.claims','{"sub":"544fb1e2-ef70-44de-bc62-e0e1596a4bfc","role":"authenticated"}',true);
  foreach bad_month in array array[null,'','2026-00','2026-13','2026-11-17','November'] loop
    rejected:=false;
    begin
      perform public.crm_control_sales_summary_v1(bad_month);
    exception when invalid_parameter_value then rejected:=true;
    end;
    if not rejected then raise exception 'invalid_month_allowed'; end if;
  end loop;
end;
$parity$;

set local role anon;
do $anonymous$
declare rejected boolean:=false;
begin
  begin
    perform public.crm_control_sales_summary_v1('2026-11');
  exception when insufficient_privilege then rejected:=true;
  end;
  if not rejected then raise exception 'anonymous_caller_allowed'; end if;
end;
$anonymous$;

reset role;
select 'PASS: owner, branch, three field managers, protected executive, denied/missing profiles, invalid months, anonymous ACL' as check_result;
rollback;
