begin;
select set_config('request.jwt.claims','{"sub":"544fb1e2-ef70-44de-bc62-e0e1596a4bfc","role":"authenticated"}',true);
do $test$
declare ids uuid[];cid uuid;eid uuid;ev bigint;g jsonb;v jsonb;n bigint;before_sales numeric:=0;after_sales numeric;label text:='Проверка пять ТТ '||gen_random_uuid();
begin
 select array_agg(id) into ids from(select c.id from public.clients c where not coalesce(c.is_archived,false) and not coalesce(c.to_delete,false) and not exists(select 1 from public.client360_entity_clients_v1 l where l.client_id=c.id) and not exists(select 1 from public.route_physical_point_clients l where l.client_id=c.id) order by c.id limit 5) z;
 if array_length(ids,1)<>5 then raise exception 'fixture_insufficient';end if;
 foreach cid in array ids loop
 v:=public.crm_clients_detail_v1(cid,'2026-11');
 before_sales:=before_sales+coalesce((select (x->>'revenue')::numeric from jsonb_array_elements(v->'sales') x where x->>'month'='2026-11'),0);
 perform public.crm_client360_add_store_v1(cid,'Витебск','Временная проверка '||cid::text);
 end loop;
 g:=public.client360_group_clients_v1(label,ids);
 select entity_id into eid from public.client360_entity_clients_v1 where client_id=ids[1];
 v:=public.crm_clients_detail_v1(ids[1],'2026-11');
 if jsonb_array_length(v->'members')<>5 or jsonb_array_length(v->'points')<>5 then raise exception 'five_points_failed';end if;
 select (x->>'revenue')::numeric into after_sales from jsonb_array_elements(v->'sales') x where x->>'month'='2026-11';
 if abs(coalesce(after_sales,0)-before_sales)>.001 then raise exception 'financial_duplication';end if;
 perform public.client360_manage_entity_v2(eid,label,array[ids[5]]);
 v:=public.crm_clients_detail_v1(ids[1],'2026-11');
 select max(a.id) into ev from public.crm_client360_audit_v1 a where a.table_name='client360_entity_clients_v1' and a.operation='DELETE' and a.old_row->>'client_id'=ids[5]::text;
 if ev is null or not exists(select 1 from jsonb_array_elements(v->'audit') a where (a->>'id')::bigint=ev) then raise exception 'unlink_journal_missing';end if;
 perform public.crm_client360_restore_link_v1(ev,true);
 v:=public.crm_clients_detail_v1(ids[1],'2026-11');if jsonb_array_length(v->'members')<>5 then raise exception 'restore_failed';end if;
 perform public.crm_client360_identity_v1(eid,'990' || lpad((floor(random()*1000000)::int)::text,6,'0'),'',true);
 if (public.crm_clients_detail_v1(ids[1],'2026-11')->'entity'->>'tax_id') is null then raise exception 'requisites_failed';end if;
end $test$;
rollback;
