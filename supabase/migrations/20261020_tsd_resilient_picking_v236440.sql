-- RESANTA CRM v23.6.440
-- TSD resilient picking: cached barcode aliases + durable client diagnostics.
-- Approved 2026-10-20. Does not rewrite existing orders or scan events.

create table if not exists public.warehouse_tsd_client_diagnostics_v1(
  id bigint generated always as identity primary key,
  device_key text not null references public.warehouse_pick_devices_v1(device_key) on delete restrict,
  event_type text not null,
  occurred_at timestamptz not null default now(),
  client_at timestamptz null,
  online_hint boolean null,
  queue_len integer null,
  page text null,
  details jsonb not null default '{}'::jsonb
);
create index if not exists warehouse_tsd_diag_device_time_idx_v1
  on public.warehouse_tsd_client_diagnostics_v1(device_key,occurred_at desc);
alter table public.warehouse_tsd_client_diagnostics_v1 enable row level security;
revoke all on public.warehouse_tsd_client_diagnostics_v1 from public,anon,authenticated;

CREATE OR REPLACE FUNCTION public.warehouse_pick_device_detail_v1(p_device_token text, p_order_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog', 'pg_temp'
AS $function$
declare
  v_device text:=public.warehouse_pick_device_from_token_v1(p_device_token);
  v_result jsonb;
begin
  if v_device is null then return jsonb_build_object('ok',false,'reason','device_session_invalid'); end if;
  select jsonb_build_object(
    'ok',true,'id',o.id,'document_no',o.document_no,'document_date',o.document_date,
    'customer_display',o.customer_display,'status',o.status,'version',o.version,'assignment_mode',o.assignment_mode,
    'line_count',(select count(*) from public.warehouse_pick_item_assignments_v2 a
      join public.warehouse_pick_items_v1 i on i.id=a.item_id
      where a.order_id=o.id and a.device_key=v_device and not i.is_removed and a.assigned_qty>0),
    'total_qty',coalesce((select sum(a.assigned_qty) from public.warehouse_pick_item_assignments_v2 a
      join public.warehouse_pick_items_v1 i on i.id=a.item_id
      where a.order_id=o.id and a.device_key=v_device and not i.is_removed),0),
    'overall_line_count',o.line_count,'overall_total_qty',o.total_qty,
    'device_complete',not exists(select 1 from public.warehouse_pick_item_assignments_v2 a
      join public.warehouse_pick_items_v1 i on i.id=a.item_id
      where a.order_id=o.id and a.device_key=v_device and not i.is_removed
        and (a.picked_qty<>a.assigned_qty or i.return_required_qty>0)),
    'items',coalesce((select jsonb_agg(jsonb_build_object(
      'id',i.id,'line_no',i.line_no,'sku',i.sku,'product',i.product,'barcode',i.barcode,
      'barcodes',coalesce((select jsonb_agg(wb.barcode order by wb.barcode)
                           from public.warehouse_barcodes wb
                           where wb.active=true and lower(btrim(wb.sku))=lower(btrim(i.sku))),'[]'::jsonb),
      'unit',i.unit,'expected_qty',a.assigned_qty,'picked_qty',a.picked_qty,
      'overall_expected_qty',i.expected_qty,'overall_picked_qty',i.picked_qty,
      'is_removed',i.is_removed,'return_required_qty',i.return_required_qty,
      'shortage_status',(select s.status from public.warehouse_pick_shortages_v2 s
        where s.item_id=i.id and s.device_key=v_device and s.status in ('pending','waiting','correction_required')
        order by s.reported_at desc limit 1)
    ) order by i.is_removed,i.line_no)
    from public.warehouse_pick_item_assignments_v2 a
    join public.warehouse_pick_items_v1 i on i.id=a.item_id
    where a.order_id=o.id and a.device_key=v_device and (a.assigned_qty>0 or i.return_required_qty>0)),'[]'::jsonb)
  ) into v_result
  from public.warehouse_pick_orders_v1 o
  where o.id=p_order_id
    and exists(select 1 from public.warehouse_pick_item_assignments_v2 a
               where a.order_id=o.id and a.device_key=v_device)
    and o.status in ('waiting_pick','picking','shortage','ready');
  return coalesce(v_result,jsonb_build_object('ok',false,'reason','order_not_assigned'));
end;
$function$;

CREATE OR REPLACE FUNCTION public.warehouse_pick_device_diag_v1(p_device_token text, p_event_type text, p_client_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_online_hint boolean DEFAULT NULL::boolean, p_queue_len integer DEFAULT NULL::integer, p_page text DEFAULT NULL::text, p_details jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog', 'pg_temp'
AS $function$
declare
  v_device text:=public.warehouse_pick_device_from_token_v1(p_device_token);
  v_type text:=left(btrim(coalesce(p_event_type,'')),80);
  v_page text:=left(btrim(coalesce(p_page,'')),120);
  v_details jsonb:=coalesce(p_details,'{}'::jsonb);
begin
  if v_device is null then
    return jsonb_build_object('ok',false,'reason','device_session_invalid');
  end if;
  if v_type='' then
    return jsonb_build_object('ok',false,'reason','invalid_event_type');
  end if;
  if jsonb_typeof(v_details)<>'object' then
    v_details:='{}'::jsonb;
  end if;

  insert into public.warehouse_tsd_client_diagnostics_v1(
    device_key,event_type,client_at,online_hint,queue_len,page,details
  )
  values(
    v_device,v_type,p_client_at,p_online_hint,
    greatest(0,least(coalesce(p_queue_len,0),10000)),
    nullif(v_page,''),
    jsonb_strip_nulls(v_details)
  );

  return jsonb_build_object('ok',true,'device_key',v_device,'received_at',now());
end
$function$;

revoke all on function public.warehouse_pick_device_diag_v1(text,text,timestamptz,boolean,integer,text,jsonb) from public,authenticated;
grant execute on function public.warehouse_pick_device_diag_v1(text,text,timestamptz,boolean,integer,text,jsonb) to anon,service_role;
revoke all on function public.warehouse_pick_device_detail_v1(text,uuid) from public,authenticated;
grant execute on function public.warehouse_pick_device_detail_v1(text,uuid) to anon,service_role;
