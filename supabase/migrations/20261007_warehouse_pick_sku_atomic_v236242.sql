-- RESANTA CRM v23.6.242
-- One SKU in one order must belong wholly to one TSD.
-- Applied live to Supabase. This migration persists the same contract.

create or replace function public.warehouse_pick_guard_sku_single_device_v236242()
returns trigger
language plpgsql
security definer
set search_path to 'public','pg_catalog','pg_temp'
as $function$
declare v_sku text;
begin
  if coalesce(new.assigned_qty,0)<=0 then return new; end if;
  select lower(trim(i.sku)) into v_sku
  from public.warehouse_pick_items_v1 i
  where i.id=new.item_id and not i.is_removed;
  if v_sku is null or v_sku='' then return new; end if;
  if exists(
    select 1
    from public.warehouse_pick_item_assignments_v2 a
    join public.warehouse_pick_items_v1 i on i.id=a.item_id
    where a.order_id=new.order_id
      and a.item_id<>new.item_id
      and a.assigned_qty>0
      and not i.is_removed
      and lower(trim(i.sku))=v_sku
      and a.device_key<>new.device_key
  ) then
    raise exception 'SKU % is already assigned to another TSD in this order',v_sku using errcode='23514';
  end if;
  return new;
end;
$function$;

drop trigger if exists warehouse_pick_guard_sku_single_device_v236242
  on public.warehouse_pick_item_assignments_v2;

create trigger warehouse_pick_guard_sku_single_device_v236242
before insert or update of device_key,assigned_qty,order_id,item_id
on public.warehouse_pick_item_assignments_v2
for each row execute function public.warehouse_pick_guard_sku_single_device_v236242();

-- Full function bodies are maintained in the live database and source snapshot;
-- split assignment validates same-SKU rows use one device, and correction sync
-- reuses the existing SKU owner before load-balancing a genuinely new SKU.
