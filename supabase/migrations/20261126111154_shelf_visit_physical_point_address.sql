create or replace function public.crm_shelf_visit_context_v6(p_client uuid,p_route uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare r public.route_plans; history jsonb; previous jsonb; saved jsonb; point_address text;
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
   select p.address into point_address from public.route_physical_points p where p.id=r.physical_point_id;
   select jsonb_build_object('items',s.items,'at',s.created_at) into previous
   from public.crm_shelf_scans_v4 s join public.route_plans past on past.id=s.route_id
   where s.client_id=p_client and s.physical_point_id=r.physical_point_id and past.visit_date<r.visit_date
     and public.crm_tasks_access_v4(s.client_id,s.manager_name)
   order by past.visit_date desc,s.created_at desc,s.id desc limit 1;
 end if;
 return jsonb_build_object('eligible',true,'address',coalesce(nullif(btrim(point_address),''),r.address),'items',history,'previous',previous,'saved',saved);
end $$;
