-- Route shelf counts use purchase history as a candidate list and keep physical observations separate.
create function crm_private.shelf_large_client_v6(p_client uuid)
returns boolean language sql stable security invoker set search_path='' as $$
 select exists (
   select 1 from public.clients c
   where (c.id=p_client or c.id in (
     select linked.client_id from public.client360_entity_clients_v1 source
     join public.client360_entity_clients_v1 linked using(entity_id) where source.client_id=p_client
   )) and (
     translate(upper(btrim(coalesce(c.role_type,''))),'А','A')='AAA'
     or lower(coalesce(c.name,'')) ~ '(руд[[:space:]-]*буд|бахус)'
   )
 );
$$;
revoke all on function crm_private.shelf_large_client_v6(uuid) from public,anon,authenticated;

create function crm_private.shelf_route_v6(p_client uuid,p_route uuid)
returns public.route_plans language plpgsql stable security invoker set search_path='' as $$
declare r public.route_plans;
begin
 perform crm_private.client_actor_v1();
 select * into r from public.route_plans
 where id=p_route and not coalesce(removed,false) and not coalesce(is_office_day,false)
   and (approved or review_status='approved') and
   (client_id=p_client or p_client=any(coalesce(linked_client_ids,'{}'::uuid[])));
 if not found or not public.crm_tasks_access_v4(p_client,r.manager_name) then
   raise exception 'SHELF_SCOPE' using errcode='42501';
 end if;
 return r;
end $$;
revoke all on function crm_private.shelf_route_v6(uuid,uuid) from public,anon,authenticated;

create function public.crm_shelf_visit_context_v6(p_client uuid,p_route uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare r public.route_plans; history jsonb; previous jsonb; saved jsonb;
begin
 r:=crm_private.shelf_route_v6(p_client,p_route);
 if coalesce(r.is_network_point,false) or r.network_point_id is not null or crm_private.shelf_large_client_v6(p_client) then
   return jsonb_build_object('eligible',false);
 end if;
 with linked as (
   select p_client as id
   union
   select member.client_id from public.client360_entity_clients_v1 source
   join public.client360_entity_clients_v1 member using(entity_id)
   where source.client_id=p_client and public.crm_tasks_access_v4(member.client_id,r.manager_name)
 ), shipped as (
   select btrim(p.sku) sku, max(p.month) last_month,
     (array_agg(nullif(btrim(p.product),'') order by p.month desc,p.product) filter (where nullif(btrim(p.product),'') is not null))[1] product
   from linked l join public.purchase_history p on p.client_id=l.id
   where p.month<=r.visit_date and p.qty>0 and nullif(btrim(p.sku),'') is not null
   group by btrim(p.sku)
 )
 select coalesce(jsonb_agg(to_jsonb(s) order by s.last_month desc,s.sku),'[]'::jsonb) into history from shipped s;

 select jsonb_build_object('items',s.items,'at',s.created_at,'note',s.merchandising_note) into saved
 from public.crm_shelf_scans_v4 s where s.client_id=p_client and s.route_id=p_route
 order by s.created_at desc,s.id desc limit 1;

 if r.physical_point_id is not null then
   select jsonb_build_object('items',s.items,'at',s.created_at) into previous
   from public.crm_shelf_scans_v4 s join public.route_plans past on past.id=s.route_id
   where s.client_id=p_client and s.physical_point_id=r.physical_point_id and past.visit_date<r.visit_date
     and public.crm_tasks_access_v4(s.client_id,s.manager_name)
   order by past.visit_date desc,s.created_at desc,s.id desc limit 1;
 end if;
 return jsonb_build_object('eligible',true,'items',history,'previous',previous,'saved',saved);
end $$;
revoke all on function public.crm_shelf_visit_context_v6(uuid,uuid) from public,anon;
grant execute on function public.crm_shelf_visit_context_v6(uuid,uuid) to authenticated;

create function public.crm_shelf_visit_save_v6(p_client uuid,p_route uuid,p_request uuid,p_items jsonb,
 p_transcript text default '',p_note text default '',p_photos jsonb default '[]')
returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.route_plans; item jsonb; sku text; outcome text; counts text; path text;
 seen text[]:='{}'; saved public.crm_shelf_scans_v4; storage_items jsonb:='[]'; ctx jsonb; product text;
begin
 r:=crm_private.shelf_route_v6(p_client,p_route);
 if coalesce(r.is_network_point,false) or r.network_point_id is not null or crm_private.shelf_large_client_v6(p_client) then
   raise exception 'SHELF_EXCLUDED' using errcode='42501';
 end if;
 if p_request is null or jsonb_typeof(p_items) is distinct from 'array'
    or jsonb_typeof(p_photos) is distinct from 'array'
    or p_transcript is null or p_note is null then raise exception 'SHELF_INVALID'; end if;
 if jsonb_array_length(p_items)>100 or jsonb_array_length(p_photos)>6 or length(p_transcript)>10000
    or length(p_note)>2000 or (jsonb_array_length(p_items)=0 and p_transcript<>'Подтверждаю: наших товаров на полке нет')
 then raise exception 'SHELF_INVALID'; end if;

 ctx:=public.crm_shelf_visit_context_v6(p_client,p_route);
 for item in select value from jsonb_array_elements(p_items) loop
   sku:=nullif(btrim(item->>'sku'),'');
   outcome:=item->>'status';
   if sku is null or sku=any(seen) or outcome is null
      or outcome not in ('in_stock','not_in_stock','previous_special_order','ordered_for_delivery') then
     raise exception 'SHELF_INVALID';
   end if;
   seen:=array_append(seen,sku);
   select min(p.product) into product from public.price_list p where p.sku=sku;
   if product is null then
     select x->>'product' into product from jsonb_array_elements(ctx->'items') x where x->>'sku'=sku;
     if not found then raise exception 'SHELF_UNKNOWN_SKU'; end if;
   end if;
   for counts in select val from (values (item->>'shelf_qty'),(item->>'reserve_qty')) v(val) where val is not null loop
     if counts !~ '^[0-9]{1,6}$' or counts::numeric>100000 then raise exception 'SHELF_QUANTITY'; end if;
   end loop;
   if (outcome='in_stock' and coalesce((item->>'shelf_qty')::numeric,0)<=0)
      or (outcome='not_in_stock' and (item->>'shelf_qty')::numeric is distinct from 0) then
     raise exception 'SHELF_QUANTITY';
   end if;
   storage_items:=storage_items||jsonb_build_array(jsonb_build_object('sku',sku,'product',coalesce(product,sku),
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
end $$;
revoke all on function public.crm_shelf_visit_save_v6(uuid,uuid,uuid,jsonb,text,text,jsonb) from public,anon;
grant execute on function public.crm_shelf_visit_save_v6(uuid,uuid,uuid,jsonb,text,text,jsonb) to authenticated;

create or replace function public.crm_shelf_plan_enroll_v4()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.route_id is not null and not crm_private.shelf_large_client_v6(new.client_id) then
   insert into public.crm_shelf_plans_v4(route_id,client_id,task_id,manager_name,route_day)
   values(new.route_id,new.client_id,new.task_id,new.manager_name,new.route_day)
   on conflict(route_id) do nothing;
 end if;
 return new;
end $$;
