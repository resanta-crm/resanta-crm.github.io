begin;
select set_config('request.jwt.claims','{"sub":"544fb1e2-ef70-44de-bc62-e0e1596a4bfc","role":"authenticated"}',true);
do $test$
declare ids uuid[];a jsonb;expected numeric;before_sum numeric;after_sum numeric;tab text;checks jsonb:='{}';point_count int;manager_id uuid;denied bool;begin
 foreach tab in array array['clients','purchase_history','promotion_budgets','route_plans','visits','route_physical_points','route_physical_point_clients'] loop
 execute format('select coalesce(sum(hashtextextended(to_jsonb(t)::text,0)::numeric),0) from public.%I t',tab) into before_sum;
 checks:=checks||jsonb_build_object(tab,before_sum);
 end loop;
 select array_agg(c.id) into ids from public.clients c where c.name ilike 'Аникогрупп ЧТПУП (%' and not coalesce(c.is_archived,false);
 if cardinality(ids)<>4 or exists(select 1 from public.client360_entity_clients_v1 l where l.client_id=any(ids)) then raise exception 'source_fixture_changed';end if;
 select count(distinct point_id) into point_count from public.route_physical_point_clients where client_id=any(ids);
 perform public.client360_group_clients_v1('Аникогрупп ЧТПУП',ids);
 a:=public.crm_clients_detail_v1(ids[1],'2026-11');
 select sum(revenue) into expected from public.purchase_history where client_name='Аникогрупп ЧТПУП' and month='2026-11-01';
 if (select (x->>'revenue')::numeric from jsonb_array_elements(a->'sales') x where x->>'month'='2026-11') is distinct from expected then raise exception 'legal_sales_mismatch';end if;
 if jsonb_array_length(a->'members')<>4 or jsonb_array_length(a->'points')<>point_count then raise exception 'lost_original_points';end if;
 perform set_config('request.jwt.claims','{"sub":"19dd9943-99ae-47c4-a39c-4f82a11059a6","role":"authenticated"}',true);
 a:=public.crm_clients_detail_v1(ids[1],'2026-11');
 if (select (x->>'revenue')::numeric from jsonb_array_elements(a->'sales') x where x->>'month'='2026-11') is distinct from expected then raise exception 'manager_legal_sales_mismatch';end if;
 perform set_config('request.jwt.claims','{"sub":"3d935a76-c6fe-44b6-b248-fcbe58c6bf1c","role":"authenticated"}',true);
 denied:=false;begin perform public.crm_clients_detail_v1(ids[1],'2026-11');exception when insufficient_privilege then denied:=true;end;if not denied then raise exception 'foreign_manager_leak';end if;
 foreach tab in array array['clients','purchase_history','promotion_budgets','route_plans','visits','route_physical_points','route_physical_point_clients'] loop
 execute format('select coalesce(sum(hashtextextended(to_jsonb(t)::text,0)::numeric),0) from public.%I t',tab) into after_sum;
 if after_sum<>(checks->>tab)::numeric then raise exception 'protected_data_changed %',tab;end if;
 end loop;
end $test$;
rollback;
