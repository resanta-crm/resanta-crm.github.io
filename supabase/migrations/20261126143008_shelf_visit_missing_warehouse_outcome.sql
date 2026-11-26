-- Keep wholesale warehouse availability separate from the sales point observation.
CREATE OR REPLACE FUNCTION public.crm_shelf_visit_save_v6(p_client uuid, p_route uuid, p_request uuid, p_items jsonb, p_transcript text DEFAULT ''::text, p_note text DEFAULT ''::text, p_photos jsonb DEFAULT '[]'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r public.route_plans; item jsonb; resolved_sku text; outcome text; counts text; path text;
 seen text[]:='{}'; saved public.crm_shelf_scans_v4; storage_items jsonb:='[]'; ctx jsonb; product text; linked_history_id uuid;
begin
 r:=crm_private.shelf_route_v6(p_client,p_route);
 linked_history_id:=(crm_private.shelf_point_history_link_v1(p_client,r)).history_client_id;
 if (linked_history_id is not null and crm_private.shelf_large_client_v6(linked_history_id))
    or coalesce(r.is_network_point,false) or r.network_point_id is not null or crm_private.shelf_large_client_v6(p_client) then
   raise exception 'SHELF_EXCLUDED' using errcode='42501';
 end if;
 if p_request is null or jsonb_typeof(p_items) is distinct from 'array'
    or jsonb_typeof(p_photos) is distinct from 'array'
    or p_transcript is null or p_note is null then raise exception 'SHELF_INVALID'; end if;
 if jsonb_array_length(p_items)>100 or jsonb_array_length(p_photos)>6 or length(p_transcript)>10000
    or length(p_note)>2000 or (jsonb_array_length(p_items)=0 and p_transcript<>'Подтверждаю: наших товаров на полке нет')
 then raise exception 'SHELF_INVALID'; end if;

 for item in select value from jsonb_array_elements(p_items) loop
   resolved_sku:=nullif(btrim(item->>'sku'),'');
   outcome:=item->>'status';
   if resolved_sku is null or resolved_sku=any(seen) or outcome is null
      or outcome not in ('in_stock','not_in_stock','previous_special_order','ordered_for_delivery','slow_moving','shipped_reported','not_in_warehouse') then
     raise exception 'SHELF_INVALID';
   end if;
   seen:=array_append(seen,resolved_sku);
   select min(p.product) into product from public.price_list p where p.sku=resolved_sku;
   if product is null then
     ctx:=coalesce(ctx,public.crm_shelf_visit_context_v6(p_client,p_route));
     select x->>'product' into product from jsonb_array_elements(ctx->'items') x where x->>'sku'=resolved_sku;
     if not found then raise exception 'SHELF_UNKNOWN_SKU'; end if;
   end if;
   for counts in select val from (values (item->>'shelf_qty'),(item->>'reserve_qty')) v(val) where val is not null loop
     if counts !~ '^[0-9]{1,6}$' or counts::numeric>100000 then raise exception 'SHELF_QUANTITY'; end if;
   end loop;
   if (outcome='in_stock' and (item->>'shelf_qty')::numeric<=0)
      or (outcome='not_in_stock' and (item->>'shelf_qty')::numeric is distinct from 0) then
     raise exception 'SHELF_QUANTITY';
   end if;
   storage_items:=storage_items||jsonb_build_array(jsonb_build_object('sku',resolved_sku,'product',coalesce(product,resolved_sku),
     'status',outcome,'shelf_qty',(item->>'shelf_qty')::numeric,'reserve_qty',(item->>'reserve_qty')::numeric));
 end loop;

 for path in select jsonb_array_elements_text(p_photos) loop
   if not starts_with(path,auth.uid()::text||'/'||p_client::text||'/') or not exists(
      select 1 from storage.objects where bucket_id='crm-shelf-v4' and name=path
   ) then raise exception 'SHELF_PHOTO_SCOPE'; end if;
 end loop;
 insert into public.crm_shelf_scans_v4(id,client_id,route_id,physical_point_id,created_by,manager_name,transcript,items,merchandising_note,photo_paths)
 values(p_request,p_client,p_route,r.physical_point_id,auth.uid(),r.manager_name,p_transcript,storage_items,p_note,p_photos)
 on conflict(id) do nothing returning * into saved;
 if not found then
   select * into saved from public.crm_shelf_scans_v4 where id=p_request and client_id=p_client and route_id=p_route
      and created_by=auth.uid() and transcript=p_transcript and items=storage_items
      and merchandising_note=p_note and photo_paths=p_photos;
   if not found then raise exception 'SHELF_REQUEST_CONFLICT'; end if;
 end if;
 return jsonb_build_object('saved',true,'id',saved.id,'at',saved.created_at,'items',saved.items,'note',saved.merchandising_note);
end $function$;
