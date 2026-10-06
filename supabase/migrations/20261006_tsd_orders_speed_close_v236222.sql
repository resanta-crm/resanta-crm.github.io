-- RESANTA CRM v23.6.222 · TSD orders speed + OM manual close

create index if not exists warehouse_pick_assign_device_open_idx_v236222
  on public.warehouse_pick_item_assignments_v2(device_key,order_id)
  where assigned_qty>0;

create index if not exists warehouse_pick_items_order_barcode_idx_v236222
  on public.warehouse_pick_items_v1(order_id,barcode)
  where is_removed=false;

create index if not exists warehouse_pick_items_order_sku_idx_v236222
  on public.warehouse_pick_items_v1(order_id,sku)
  where is_removed=false;

create or replace function public.warehouse_pick_device_from_token_v1(p_token text)
returns text
language plpgsql
security definer
set search_path to 'public','pg_catalog','pg_temp'
as $function$
declare v_key text;v_hash text;
begin
 if p_token is null or p_token !~ '^[0-9a-f]{64}$' then return null;end if;
 v_hash:=encode(extensions.digest(p_token,'sha256'),'hex');
 select t.device_key into v_key
 from public.warehouse_pick_device_tokens_v1 t
 join public.warehouse_pick_devices_v1 d on d.device_key=t.device_key and d.is_active
 where t.token_hash=v_hash and t.revoked_at is null and t.expires_at>now()
 limit 1;
 if v_key is not null then
  update public.warehouse_pick_device_tokens_v1
  set last_seen_at=now()
  where token_hash=v_hash and revoked_at is null
    and (last_seen_at is null or last_seen_at<now()-interval '30 seconds');
 end if;
 return v_key;
end;
$function$;

create or replace function public.warehouse_pick_device_dashboard_v236222(
  p_device_token text,
  p_selected_order_id uuid default null,
  p_limit integer default 30
)
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_catalog','pg_temp'
as $function$
declare
  v_device text:=public.warehouse_pick_device_from_token_v1(p_device_token);
  v_label text;
  v_rows jsonb:='[]'::jsonb;
  v_selected uuid;
  v_detail jsonb;
begin
  if v_device is null then
    return jsonb_build_object('ok',false,'reason','device_session_invalid');
  end if;
  if p_limit not between 1 and 50 then p_limit:=30; end if;

  select label into v_label
  from public.warehouse_pick_devices_v1
  where device_key=v_device;

  with a as (
    select x.order_id,
           count(*) filter(where x.assigned_qty>0) as line_count,
           coalesce(sum(x.assigned_qty),0) as total_qty
    from public.warehouse_pick_item_assignments_v2 x
    join public.warehouse_pick_items_v1 i on i.id=x.item_id
    where x.device_key=v_device and x.assigned_qty>0 and not i.is_removed
    group by x.order_id
  ), r as (
    select o.id,o.document_no,o.document_date,o.customer_display,o.status,o.version,o.assignment_mode,
           a.line_count,a.total_qty,o.line_count overall_line_count,o.total_qty overall_total_qty,
           o.created_at,o.started_at,o.ready_at,o.updated_at
    from public.warehouse_pick_orders_v1 o
    join a on a.order_id=o.id
    where o.status in ('waiting_pick','picking','shortage','ready')
    order by case o.status when 'picking' then 0 when 'waiting_pick' then 1 when 'shortage' then 2 else 3 end,
             o.created_at
    limit p_limit
  )
  select
    coalesce(jsonb_agg(to_jsonb(r) order by
      case r.status when 'picking' then 0 when 'waiting_pick' then 1 when 'shortage' then 2 else 3 end,
      r.created_at),'[]'::jsonb),
    coalesce(
      max(r.id) filter(where r.id=p_selected_order_id),
      (array_agg(r.id order by
        case r.status when 'picking' then 0 when 'waiting_pick' then 1 when 'shortage' then 2 else 3 end,
        r.created_at))[1]
    )
  into v_rows,v_selected
  from r;

  if v_selected is not null then
    select jsonb_build_object(
      'ok',true,'id',o.id,'document_no',o.document_no,'document_date',o.document_date,
      'customer_display',o.customer_display,'status',o.status,'version',o.version,'assignment_mode',o.assignment_mode,
      'line_count',coalesce(a.line_count,0),'total_qty',coalesce(a.total_qty,0),
      'overall_line_count',o.line_count,'overall_total_qty',o.total_qty,
      'device_complete',not exists(
        select 1
        from public.warehouse_pick_item_assignments_v2 ax
        join public.warehouse_pick_items_v1 ix on ix.id=ax.item_id
        where ax.order_id=o.id and ax.device_key=v_device and not ix.is_removed
          and (ax.picked_qty<>ax.assigned_qty or ix.return_required_qty>0)
      ),
      'items',coalesce((
        select jsonb_agg(jsonb_build_object(
          'id',i.id,'line_no',i.line_no,'sku',i.sku,'product',i.product,'barcode',i.barcode,
          'unit',i.unit,'expected_qty',x.assigned_qty,'picked_qty',x.picked_qty,
          'overall_expected_qty',i.expected_qty,'overall_picked_qty',i.picked_qty,
          'is_removed',i.is_removed,'return_required_qty',i.return_required_qty,
          'shortage_status',(
            select s.status
            from public.warehouse_pick_shortages_v2 s
            where s.item_id=i.id and s.device_key=v_device
              and s.status in ('pending','waiting','correction_required')
            order by s.reported_at desc limit 1
          )
        ) order by i.is_removed,i.line_no)
        from public.warehouse_pick_item_assignments_v2 x
        join public.warehouse_pick_items_v1 i on i.id=x.item_id
        where x.order_id=o.id and x.device_key=v_device
          and (x.assigned_qty>0 or i.return_required_qty>0)
      ),'[]'::jsonb)
    )
    into v_detail
    from public.warehouse_pick_orders_v1 o
    left join lateral (
      select count(*) filter(where x.assigned_qty>0 and not i.is_removed) line_count,
             coalesce(sum(x.assigned_qty) filter(where not i.is_removed),0) total_qty
      from public.warehouse_pick_item_assignments_v2 x
      join public.warehouse_pick_items_v1 i on i.id=x.item_id
      where x.order_id=o.id and x.device_key=v_device
    ) a on true
    where o.id=v_selected
      and o.status in ('waiting_pick','picking','shortage','ready')
      and exists(
        select 1 from public.warehouse_pick_item_assignments_v2 x
        where x.order_id=o.id and x.device_key=v_device
      );
  end if;

  return jsonb_build_object(
    'ok',true,'device_key',v_device,'label',v_label,'rows',v_rows,'selected',v_detail
  );
end;
$function$;

grant execute on function public.warehouse_pick_device_dashboard_v236222(text,uuid,integer) to anon,authenticated;

create or replace function public.warehouse_pick_manual_close_v236222(
  p_order_id uuid,
  p_reason text default null
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
begin
  if v_role not in ('office','supervisor') then
    raise exception 'Only office manager or supervisor may close an order' using errcode='42501';
  end if;
  if p_order_id is null then raise exception 'Order is required' using errcode='22023'; end if;

  select lower(btrim(email)) into v_actor from auth.users where id=auth.uid();
  if v_actor is null then raise exception 'Authentication required' using errcode='42501'; end if;

  select * into v_order from public.warehouse_pick_orders_v1 where id=p_order_id for update;
  if not found then raise exception 'Order not found' using errcode='P0002'; end if;

  if v_order.status='shipped' then
    return jsonb_build_object('ok',true,'already_closed',true,'status','shipped');
  end if;
  if v_order.status<>'ready' then
    return jsonb_build_object('ok',false,'reason','order_not_ready','status',v_order.status);
  end if;

  select count(*) into v_open_shortages
  from public.warehouse_pick_shortages_v2
  where order_id=p_order_id and status in ('pending','waiting','correction_required');

  select coalesce(sum(return_required_qty),0) into v_return_required
  from public.warehouse_pick_items_v1
  where order_id=p_order_id and return_required_qty>0;

  if v_open_shortages>0 then
    return jsonb_build_object('ok',false,'reason','open_shortages','count',v_open_shortages);
  end if;
  if v_return_required>0 then
    return jsonb_build_object('ok',false,'reason','return_required','qty',v_return_required);
  end if;

  update public.warehouse_pick_orders_v1
  set status='shipped',shipped_at=now(),updated_at=now()
  where id=p_order_id;

  insert into public.warehouse_pick_events_v1(order_id,event_type,actor_email,safe_note)
  values(
    p_order_id,'manual_closed_by_office',v_actor,
    left('Manual close after TSD picking. Reason: '||coalesce(nullif(btrim(p_reason),''),'confirmed by office manager'),500)
  );

  return jsonb_build_object('ok',true,'status','shipped','closed_by',v_actor,'closed_at',now());
end;
$function$;

grant execute on function public.warehouse_pick_manual_close_v236222(uuid,text) to authenticated;
