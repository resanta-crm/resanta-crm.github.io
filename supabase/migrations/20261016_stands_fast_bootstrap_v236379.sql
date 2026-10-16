-- RESANTA CRM v23.6.379
-- Fast, explicitly scoped stands bootstrap.
-- The old invoker function relied on RLS helpers inside many nested subqueries.
-- Under concurrent CRM load that could cross the authenticated statement timeout.
-- This SECURITY DEFINER version reproduces the same visibility rules once per request.

create or replace function public.crm_stands_bootstrap_v236346(p_limit integer default 100)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public','private','auth','pg_catalog'
set row_security to 'off'
as $function$
declare
  v_role text:=private.crm_stands_role_v236346();
  v_name text:=private.crm_stands_user_name_v236346();
  v_limit int:=least(greatest(coalesce(p_limit,100),20),300);
  v_result jsonb;
begin
  if (select auth.uid()) is null then raise exception 'Требуется вход в CRM'; end if;
  if v_role not in ('df','dfs','manager') then
    raise exception 'Нет доступа к разделу Стенды';
  end if;

  select jsonb_build_object(
    'version','v23.6.379',
    'actor',jsonb_build_object('name',v_name,'stand_role',v_role,'dfs_internal',v_role='dfs'),
    'summary',jsonb_build_object(
      'os_units',(select coalesce(sum(o.quantity),0) from public.stand_os_lots_v236346 o),
      'physical_assets',(
        select count(*) from public.stand_assets_v236346 a
        where v_role in ('df','dfs')
           or a.status='free'
           or a.current_manager_name=v_name
           or exists(
             select 1
             from public.stand_request_assets_v236346 ra
             join public.stand_requests_v236346 r on r.id=ra.request_id
             where ra.asset_id=a.id and r.manager_name=v_name
           )
      ),
      'free',(
        select count(*) from public.stand_assets_v236346 a
        where a.status='free'
          and (
            v_role in ('df','dfs')
            or a.status='free'
            or a.current_manager_name=v_name
            or exists(
              select 1 from public.stand_request_assets_v236346 ra
              join public.stand_requests_v236346 r on r.id=ra.request_id
              where ra.asset_id=a.id and r.manager_name=v_name
            )
          )
      ),
      'reserved',(
        select count(*) from public.stand_assets_v236346 a
        where a.status='reserved'
          and (
            v_role in ('df','dfs')
            or a.current_manager_name=v_name
            or exists(
              select 1 from public.stand_request_assets_v236346 ra
              join public.stand_requests_v236346 r on r.id=ra.request_id
              where ra.asset_id=a.id and r.manager_name=v_name
            )
          )
      ),
      'installed',(
        select count(*) from public.stand_assets_v236346 a
        where a.status='installed'
          and (
            v_role in ('df','dfs')
            or a.current_manager_name=v_name
            or exists(
              select 1 from public.stand_request_assets_v236346 ra
              join public.stand_requests_v236346 r on r.id=ra.request_id
              where ra.asset_id=a.id and r.manager_name=v_name
            )
          )
      ),
      'repair',(
        select count(*) from public.stand_assets_v236346 a
        where a.status='repair'
          and (
            v_role in ('df','dfs')
            or a.current_manager_name=v_name
            or exists(
              select 1 from public.stand_request_assets_v236346 ra
              join public.stand_requests_v236346 r on r.id=ra.request_id
              where ra.asset_id=a.id and r.manager_name=v_name
            )
          )
      ),
      'legacy_unreconciled',(
        select count(*) from public.stand_placements_v236346 p
        where p.asset_id is null
          and p.status in ('active','legacy_unreconciled','return_requested')
          and (v_role in ('df','dfs') or p.manager_name=v_name)
      ),
      'pending_df',(
        select count(*) from public.stand_requests_v236346 r
        where r.status='pending_df'
          and (v_role in ('df','dfs') or r.manager_name=v_name)
      ),
      'no_contract',(
        select count(*) from public.stand_placements_v236346 p
        where p.status in ('active','legacy_unreconciled','return_requested')
          and p.contract_id is null
          and (v_role in ('df','dfs') or p.manager_name=v_name)
      ),
      'no_transfer_act',(
        select count(*)
        from public.stand_placements_v236346 p
        join public.stand_contracts_v236346 c on c.id=p.contract_id
        where p.status in ('active','legacy_unreconciled','return_requested')
          and c.act_transfer_path is null
          and (v_role in ('df','dfs') or p.manager_name=v_name)
      ),
      'stale_photo',(
        select count(*) from public.stand_placements_v236346 p
        where p.status in ('active','legacy_unreconciled','return_requested')
          and coalesce(p.last_control_at,p.installed_at::timestamptz)<now()-interval '31 days'
          and (v_role in ('df','dfs') or p.manager_name=v_name)
      ),
      'needs_primary_control',(
        select count(*) from public.stand_placements_v236346 p
        where p.status in ('active','legacy_unreconciled','return_requested')
          and (v_role in ('df','dfs') or p.manager_name=v_name)
          and (
            btrim(coalesce(p.last_control_photo_path,p.installation_photo_path,''))=''
            or not exists(
              select 1 from public.stand_placement_items_v236346 i
              where i.placement_id=p.id
            )
          )
      ),
      'history',(
        select count(*) from public.stand_placements_v236346 p
        where p.status in ('returned','archived_manual')
          and (v_role in ('df','dfs') or p.manager_name=v_name)
      )
    ),
    'asset_types',coalesce((
      select jsonb_agg(to_jsonb(x) order by x.name)
      from (select * from public.stand_asset_types_v236346 where active) x
    ),'[]'::jsonb),
    'os_lots',coalesce((
      select jsonb_agg(to_jsonb(x) order by x.acquired_on,x.os_name)
      from (select * from public.stand_os_lots_v236346) x
    ),'[]'::jsonb),
    'assets',coalesce((
      select jsonb_agg(to_jsonb(x) order by x.asset_code)
      from (
        select *
        from public.stand_assets_v236346 a
        where v_role in ('df','dfs')
           or a.status='free'
           or a.current_manager_name=v_name
           or exists(
             select 1
             from public.stand_request_assets_v236346 ra
             join public.stand_requests_v236346 r on r.id=ra.request_id
             where ra.asset_id=a.id and r.manager_name=v_name
           )
        order by a.asset_code
        limit v_limit
      ) x
    ),'[]'::jsonb),
    'requests',coalesce((
      select jsonb_agg(to_jsonb(x) order by x.created_at desc)
      from (
        select *
        from public.stand_requests_v236346 r
        where v_role in ('df','dfs') or r.manager_name=v_name
        order by r.created_at desc
        limit v_limit
      ) x
    ),'[]'::jsonb),
    'request_assets',coalesce((
      select jsonb_agg(to_jsonb(x))
      from (
        select ra.*
        from public.stand_request_assets_v236346 ra
        where v_role in ('df','dfs')
           or exists(
             select 1 from public.stand_requests_v236346 r
             where r.id=ra.request_id and r.manager_name=v_name
           )
        limit v_limit*4
      ) x
    ),'[]'::jsonb),
    'placements',coalesce((
      select jsonb_agg(to_jsonb(x) order by x.installed_at desc,x.created_at desc)
      from (
        select *
        from public.stand_placements_v236346 p
        where p.status in ('active','legacy_unreconciled','return_requested')
          and (v_role in ('df','dfs') or p.manager_name=v_name)
        order by p.installed_at desc,p.created_at desc
        limit v_limit
      ) x
    ),'[]'::jsonb),
    'history',coalesce((
      select jsonb_agg(to_jsonb(x) order by x.removed_at desc nulls last,x.updated_at desc)
      from (
        select *
        from public.stand_placements_v236346 p
        where p.status in ('returned','archived_manual')
          and (v_role in ('df','dfs') or p.manager_name=v_name)
        order by p.removed_at desc nulls last,p.updated_at desc
        limit v_limit
      ) x
    ),'[]'::jsonb),
    'placement_items',coalesce((
      select jsonb_agg(to_jsonb(i) order by i.placement_id,i.added_at,i.sku)
      from public.stand_placement_items_v236346 i
      where i.placement_id in (
        select p.id
        from public.stand_placements_v236346 p
        where p.status in ('active','legacy_unreconciled','return_requested','returned','archived_manual')
          and (v_role in ('df','dfs') or p.manager_name=v_name)
        order by coalesce(p.removed_at,p.installed_at) desc nulls last,p.updated_at desc
        limit v_limit*2
      )
    ),'[]'::jsonb),
    'contracts',coalesce((
      select jsonb_agg(to_jsonb(x) order by x.contract_date desc nulls last)
      from (
        select c.*
        from public.stand_contracts_v236346 c
        where v_role in ('df','dfs')
           or exists(
             select 1 from public.clients cl
             where cl.id=c.client_id and cl.manager_name=v_name
           )
        order by c.contract_date desc nulls last
        limit v_limit*2
      ) x
    ),'[]'::jsonb),
    'vision_tasks',coalesce((
      select jsonb_agg(to_jsonb(x) order by x.done,x.due_date nulls last,x.created_at desc)
      from (
        select t.id,t.client_id,t.manager_id,t.manager_name,t.title,t.text,t.due_date,t.done,t.done_at,t.done_comment,
               t.priority,t.review_status,t.next_step,t.fact_result,t.result_achieved,t.proof,t.ai_check,t.ai_check_note,
               t.ai_selection_context,t.created_at
        from public.tasks t
        where t.source='stand_vision'
          and (
            v_role in ('df','dfs')
            or t.manager_name=v_name
            or t.manager_name is null
            or btrim(t.manager_name)=''
          )
          and coalesce((t.ai_selection_context->>'placement_id'),'') in (
            select p.id::text
            from public.stand_placements_v236346 p
            where p.status in ('active','legacy_unreconciled','return_requested','returned','archived_manual')
              and (v_role in ('df','dfs') or p.manager_name=v_name)
          )
        order by t.done,t.due_date nulls last,t.created_at desc
        limit v_limit*2
      ) x
    ),'[]'::jsonb),
    'recommendations',case when v_role in ('df','dfs') then
      coalesce((
        select jsonb_agg(to_jsonb(x) order by x.score desc nulls last,x.generated_at desc)
        from (
          select * from public.stand_recommendations_v236346
          order by score desc nulls last,generated_at desc
          limit v_limit
        ) x
      ),'[]'::jsonb)
      else '[]'::jsonb end
  ) into v_result;

  return v_result;
end;
$function$;

revoke all on function public.crm_stands_bootstrap_v236346(integer) from public, anon;
grant execute on function public.crm_stands_bootstrap_v236346(integer) to authenticated, service_role;

create index if not exists stand_placements_status_recent_v236379_idx
  on public.stand_placements_v236346(status, installed_at desc, created_at desc);

create index if not exists stand_requests_status_recent_v236379_idx
  on public.stand_requests_v236346(status, created_at desc);
