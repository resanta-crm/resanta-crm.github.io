-- Keep a confirmed shelf-history link at the point level. The route and client registry remain independent.
create table crm_private.shelf_point_history_links_v1 (
  point_id uuid not null,
  point_client_id uuid not null references public.clients(id) on delete cascade,
  history_client_id uuid not null,
  route_address_key text not null check (route_address_key<>''),
  primary key(point_client_id,point_id),
  unique(point_client_id,route_address_key),
  foreign key(point_id,history_client_id) references public.route_physical_point_clients(point_id,client_id) on delete cascade,
  check(point_client_id<>history_client_id)
);
alter table crm_private.shelf_point_history_links_v1 enable row level security;
revoke all on table crm_private.shelf_point_history_links_v1 from public,anon,authenticated;

-- Point: Инструмент маркет, Могилёв, Пионерская 35.
-- Source: ТД ИнструментМаркет ООО, already linked to this exact physical point.
insert into crm_private.shelf_point_history_links_v1(point_id,point_client_id,history_client_id,route_address_key)
values('ae473dab-b512-48be-a3d4-9d5ac335cd6e','52d64fb6-4268-49a6-850d-6f2463d5bcbf','0000f805-8929-47f3-9c93-623994e0997a','пионерская35');

create function crm_private.shelf_point_history_link_v1(p_client uuid,p_route public.route_plans)
returns crm_private.shelf_point_history_links_v1
language sql stable security invoker set search_path='' as $$
 select l from crm_private.shelf_point_history_links_v1 l
 join public.route_physical_points p on p.id=l.point_id and coalesce(p.active,true)
 where l.point_client_id=p_client
   and (l.point_id=p_route.physical_point_id or
    (p_route.physical_point_id is null
     and l.route_address_key=regexp_replace(lower(coalesce(p_route.address,'')),'[^[:alnum:]]+','','g')))
   and public.crm_tasks_access_v4(l.history_client_id,p_route.manager_name);
$$;
revoke all on function crm_private.shelf_point_history_link_v1(uuid,public.route_plans) from public,anon,authenticated;

create or replace function crm_private.shelf_route_v6(p_client uuid,p_route uuid)
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
 if r.physical_point_id is null then
   r.physical_point_id:=(crm_private.shelf_point_history_link_v1(p_client,r)).point_id;
 end if;
 return r;
end $$;

create or replace function public.crm_shelf_visit_context_v6(p_client uuid,p_route uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare r public.route_plans; history jsonb; previous jsonb; saved jsonb; point_address text; linked_history_id uuid; legal_history boolean;
begin
 r:=crm_private.shelf_route_v6(p_client,p_route);
 linked_history_id:=(crm_private.shelf_point_history_link_v1(p_client,r)).history_client_id;
 if (linked_history_id is not null and crm_private.shelf_large_client_v6(linked_history_id))
    or coalesce(r.is_network_point,false) or r.network_point_id is not null or crm_private.shelf_large_client_v6(p_client) then
   return jsonb_build_object('eligible',false);
 end if;
 with linked as (
   select p_client as id
   union
   select linked_history_id where linked_history_id is not null
   union
   select member.client_id from public.client360_entity_clients_v1 source
   join public.client360_entity_clients_v1 member using(entity_id)
   where source.client_id=p_client and public.crm_tasks_access_v4(member.client_id,r.manager_name)
 ), shipped as (
   select btrim(p.sku) sku, max(p.month) last_month, bool_or(p.client_id<>p_client) from_legal,
     (array_agg(nullif(btrim(p.product),'') order by p.month desc,p.product) filter (where nullif(btrim(p.product),'') is not null))[1] product
   from linked l join public.purchase_history p on p.client_id=l.id
   where p.month<=r.visit_date and p.qty>0 and nullif(btrim(p.sku),'') is not null
   group by btrim(p.sku)
 )
 select coalesce(jsonb_agg(to_jsonb(s)-'from_legal' order by s.last_month desc,s.sku),'[]'::jsonb),
   coalesce(bool_or(s.from_legal),false) into history,legal_history from shipped s;

 select jsonb_build_object('items',s.items,'at',s.created_at,'note',s.merchandising_note) into saved
 from public.crm_shelf_scans_v4 s where s.client_id=p_client and s.route_id=p_route
 order by s.created_at desc,s.id desc limit 1;

 if r.physical_point_id is not null then
   select p.address into point_address from public.route_physical_points p where p.id=r.physical_point_id;
   select jsonb_build_object('items',s.items,'at',s.created_at) into previous
   from public.crm_shelf_scans_v4 s join public.route_plans past on past.id=s.route_id
   where (s.client_id in(p_client,linked_history_id) and s.physical_point_id=r.physical_point_id
       or (s.client_id=p_client and s.physical_point_id is null and linked_history_id is not null
           and (crm_private.shelf_point_history_link_v1(p_client,past)).point_id=r.physical_point_id))
     and past.visit_date<r.visit_date
     and public.crm_tasks_access_v4(s.client_id,s.manager_name)
   order by past.visit_date desc,s.created_at desc,s.id desc limit 1;
 end if;
 return jsonb_build_object('eligible',true,'address',coalesce(nullif(btrim(point_address),''),r.address),'items',history,'legal_history',legal_history,'previous',previous,'saved',saved);
end $$;

create or replace function public.crm_shelf_visit_save_v6(p_client uuid,p_route uuid,p_request uuid,p_items jsonb,
 p_transcript text default '',p_note text default '',p_photos jsonb default '[]')
returns jsonb language plpgsql security definer set search_path='' as $$
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
      or outcome not in ('in_stock','not_in_stock','previous_special_order','ordered_for_delivery','slow_moving','shipped_reported') then
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
end $$;
