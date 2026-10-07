-- RESANTA CRM v23.6.239
-- Warehouse TSD reliability:
-- 1) fix uuid selection in the fast device dashboard;
-- 2) make Office Manager close verify physical completion on the server,
--    so stale client status cannot block a fully picked order.
-- Client-side scan queue / fast refresh lives in picking.html, inventory.html,
-- receiving.html and tsd.html of the same release.

do $$
declare
  v_oid oid;
  v_ddl text;
  v_old text := 'max(r.id) filter(where r.id=p_selected_order_id)';
  v_new text := '(array_agg(r.id) filter(where r.id=p_selected_order_id))[1]';
begin
  select p.oid into v_oid
  from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public'
    and p.proname='warehouse_pick_device_dashboard_v236222'
    and pg_get_function_identity_arguments(p.oid)='p_device_token text, p_selected_order_id uuid, p_limit integer';

  if v_oid is null then
    raise exception 'warehouse_pick_device_dashboard_v236222 not found';
  end if;

  select pg_get_functiondef(v_oid) into v_ddl;
  if position(v_old in v_ddl)>0 then
    v_ddl:=replace(v_ddl,v_old,v_new);
    execute v_ddl;
  end if;
end $$;

create or replace function public.warehouse_pick_manual_close_v236222(
  p_order_id uuid,
  p_reason text default null::text
)
returns jsonb
language plpgsql
security definer
set search_path to 'public','auth','pg_catalog','pg_temp'
as $function$
declare
  v_role text:=public.warehouse_pick_role_v1();
  v_actor text;
  v_order public.warehouse_pick_orders_v1%rowtype;
  v_open_shortages integer;
  v_return_required numeric;
  v_assignment_count integer;
  v_incomplete integer;
begin
  if v_role not in ('office','supervisor') then
    raise exception 'Only office manager or supervisor may close an order' using errcode='42501';
  end if;
  if p_order_id is null then
    raise exception 'Order is required' using errcode='22023';
  end if;

  select lower(btrim(email)) into v_actor
  from auth.users where id=auth.uid();
  if v_actor is null then
    raise exception 'Authentication required' using errcode='42501';
  end if;

  select * into v_order
  from public.warehouse_pick_orders_v1
  where id=p_order_id
  for update;

  if not found then
    raise exception 'Order not found' using errcode='P0002';
  end if;

  if v_order.status='shipped' then
    return jsonb_build_object('ok',true,'already_closed',true,'status','shipped');
  end if;

  if v_order.status not in ('waiting_pick','picking','shortage','ready') then
    return jsonb_build_object('ok',false,'reason','order_not_ready','status',v_order.status);
  end if;

  select count(*) into v_open_shortages
  from public.warehouse_pick_shortages_v2
  where order_id=p_order_id
    and status in ('pending','waiting','correction_required');

  select coalesce(sum(return_required_qty),0) into v_return_required
  from public.warehouse_pick_items_v1
  where order_id=p_order_id
    and return_required_qty>0;

  select count(*),
         count(*) filter(
           where a.picked_qty<>a.assigned_qty
              or coalesce(i.return_required_qty,0)>0
         )
  into v_assignment_count,v_incomplete
  from public.warehouse_pick_item_assignments_v2 a
  join public.warehouse_pick_items_v1 i on i.id=a.item_id
  where a.order_id=p_order_id
    and a.assigned_qty>0
    and not i.is_removed;

  if v_open_shortages>0 then
    return jsonb_build_object('ok',false,'reason','open_shortages','count',v_open_shortages);
  end if;
  if v_return_required>0 then
    return jsonb_build_object('ok',false,'reason','return_required','qty',v_return_required);
  end if;
  if v_assignment_count=0 or v_incomplete>0 then
    return jsonb_build_object(
      'ok',false,'reason','order_not_ready','status',v_order.status,
      'incomplete_assignments',v_incomplete,'assignment_count',v_assignment_count
    );
  end if;

  update public.warehouse_pick_orders_v1
  set status='shipped',
      ready_at=coalesce(ready_at,now()),
      shipped_at=now(),
      updated_at=now()
  where id=p_order_id;

  insert into public.warehouse_pick_events_v1(order_id,event_type,actor_email,safe_note)
  values(
    p_order_id,
    'manual_closed_by_office',
    v_actor,
    left(
      'Manual close after verified TSD picking. Reason: '||
      coalesce(nullif(btrim(p_reason),''),'confirmed by office manager'),
      500
    )
  );

  return jsonb_build_object(
    'ok',true,'status','shipped','closed_by',v_actor,'closed_at',now(),
    'server_verified_complete',true
  );
end;
$function$;

revoke all on function public.warehouse_pick_manual_close_v236222(uuid,text) from public,anon;
grant execute on function public.warehouse_pick_manual_close_v236222(uuid,text) to authenticated;
