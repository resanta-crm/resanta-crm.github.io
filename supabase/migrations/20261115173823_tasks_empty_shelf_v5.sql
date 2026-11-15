alter table public.crm_shelf_scans_v4 drop constraint crm_shelf_scans_v4_items_check;
alter table public.crm_shelf_scans_v4 add constraint crm_shelf_scans_v4_items_check check(jsonb_typeof(items)='array' and jsonb_array_length(items) between 0 and 100 and (jsonb_array_length(items)>0 or transcript='Подтверждаю: наших товаров на полке нет'));
create or replace function public.crm_shelf_save_v4(p_client uuid,p_route uuid,p_items jsonb,p_transcript text default '',p_note text default '',p_photos jsonb default '[]')
returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.route_plans;u public.users;item jsonb;seen text[]:='{}';path text;scan uuid;
begin
 select * into u from public.users where id=(select auth.uid());
 select * into r from public.route_plans where id=p_route and not coalesce(removed,false)
  and (client_id=p_client or p_client=any(linked_client_ids));
 if not found or not public.crm_tasks_access_v4(p_client,r.manager_name) then raise exception 'SHELF_SCOPE' using errcode='42501';end if;
 if p_items is null or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items) not between 0 and 100 or (jsonb_array_length(p_items)=0 and p_transcript is distinct from 'Подтверждаю: наших товаров на полке нет')
  or length(p_transcript)>10000 or length(p_note)>2000 or jsonb_typeof(p_photos)<>'array' or jsonb_array_length(p_photos)>6 then raise exception 'SHELF_INVALID';end if;
 for item in select value from jsonb_array_elements(p_items) loop
  if (item->>'sku')=any(seen) then raise exception 'SHELF_DUPLICATE_SKU';end if;
  seen:=array_append(seen,item->>'sku');
  if not exists(select 1 from public.price_list where sku=item->>'sku') then raise exception 'SHELF_UNKNOWN_SKU';end if;
  if (item->>'shelf_qty') is null or (item->>'shelf_qty')::numeric<0 or (item->>'shelf_qty')::numeric>100000
    or ((item->>'reserve_qty') is not null and ((item->>'reserve_qty')::numeric<0 or (item->>'reserve_qty')::numeric>100000)) then raise exception 'SHELF_QUANTITY';end if;
 end loop;
 for path in select jsonb_array_elements_text(p_photos) loop
  if not starts_with(path,u.id::text||'/'||p_client::text||'/') or not exists(select 1 from storage.objects where bucket_id='crm-shelf-v4' and name=path)
   then raise exception 'SHELF_PHOTO_SCOPE';end if;
 end loop;
 insert into public.crm_shelf_scans_v4(client_id,route_id,physical_point_id,created_by,manager_name,transcript,items,merchandising_note,photo_paths)
  values(p_client,p_route,r.physical_point_id,u.id,r.manager_name,p_transcript,p_items,p_note,p_photos) returning id into scan;
 return jsonb_build_object('saved',true,'id',scan);
end $$;
