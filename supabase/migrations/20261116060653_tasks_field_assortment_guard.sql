-- Field-manager route plans: inverter welders cannot be approved, including direct RPC calls. Existing history is unchanged.
create or replace function public.crm_task_create_v5(p_route uuid,p_client uuid,p_items jsonb,p_title text,p_basis text,p_expected text,p_stage text default 'shipment')
returns jsonb language plpgsql security definer set search_path='' as $$
declare u public.users;r public.route_plans;c public.clients;t public.tasks;item jsonb;
 targets jsonb:='[]';qty numeric;product text;available numeric;latest date;control_day date;enrolled jsonb;
begin
 select * into u from public.users where id=(select auth.uid());
 if not found or u.role<>'boss' or u.region not in('Витебск','Все филиалы') then raise exception 'TASK_CREATE_FORBIDDEN' using errcode='42501';end if;
 select * into r from public.route_plans where id=p_route and not coalesce(removed,false) and (approved or review_status='approved');
 if not found or coalesce(r.is_network_point,false) or r.network_point_id is not null then raise exception 'TASK_ROUTE_REQUIRED';end if;
 if p_client is null or not coalesce(p_client=r.client_id or p_client=any(coalesce(r.linked_client_ids,'{}'::uuid[])),false) then raise exception 'TASK_ROUTE_MISMATCH';end if;
 select * into c from public.clients where id=p_client;
 if not found or not public.crm_tasks_access_v4(c.id,r.manager_name) or c.manager_name<>r.manager_name then raise exception 'TASK_CLIENT_SCOPE';end if;
 if c.client_status is null or c.client_status not in('Рабочий','Потенциальный') then raise exception 'TASK_CLIENT_STATUS';end if;
 if coalesce(length(btrim(p_title)),0) not between 3 and 160 or coalesce(length(btrim(p_expected)),0) not between 5 and 1000 or coalesce(length(btrim(p_basis)),0) not between 3 and 2000 then raise exception 'TASK_PLAN_REQUIRED';end if;
 if p_stage is null or (c.client_status='Рабочий' and p_stage<>'shipment') or (c.client_status='Потенциальный' and p_stage not in('profile','proposal','decision')) then raise exception 'TASK_STAGE_INVALID';end if;
 control_day:=date_trunc('week',r.visit_date)::date+4;
 if control_day<(now()at time zone'Europe/Minsk')::date then raise exception 'TASK_WEEK_IN_PAST';end if;
 if p_items is null or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)>10 then raise exception 'TASK_TARGETS_INVALID';end if;
 if c.client_status='Рабочий' then
  if jsonb_array_length(p_items)=0 then raise exception 'TASK_SKU_TARGETS_REQUIRED';end if;
  select max(report_date)into latest from public.stock_balances where warehouse='Витебск';
  if latest is null or latest<(now()at time zone'Europe/Minsk')::date-1 or latest>(now()at time zone'Europe/Minsk')::date then raise exception 'TASK_STOCK_STALE';end if;
  for item in select value from jsonb_array_elements(p_items) loop
   qty:=(item->>'qty')::numeric;
   select min(p.product) into product from public.price_list p where p.sku=item->>'sku' having count(distinct p.product)=1;
   if product ~* 'свароч' and (product ~* 'инвертор' or product ~* '(^|[^а-я])саи([^а-я]|$)') then raise exception 'TASK_FIELD_INVERTER_FORBIDDEN';end if;
   if product is null or qty is null or qty<=0 or qty>100000 or exists(select 1 from jsonb_array_elements(targets)x where x->>'sku'=item->>'sku') then raise exception 'TASK_TARGETS_INVALID';end if;
   select coalesce(sum(s.qty_avail),0)into available from public.stock_balances s where s.warehouse='Витебск' and s.report_date=latest and s.sku=item->>'sku';
   if available<qty then raise exception 'TASK_INSUFFICIENT_STOCK: %',item->>'sku';end if;
   targets:=targets||jsonb_build_array(jsonb_build_object('sku',item->>'sku','product',product,'qty',qty));
  end loop;
 end if;
 insert into public.tasks(client_id,manager_name,manager_id,text,title,due_date,done,auto_generated,review_status,reviewed_at,reviewed_by,source,ai_stock_items,expected_result,criteria,basis)
 values(c.id,r.manager_name,(select id from public.users where name=r.manager_name and role='manager' and region='Витебск' limit 1),
  p_expected,
  p_title,
  control_day,false,false,'approved',now(),u.name,'must_list',targets,
  p_expected,
  case when c.client_status='Рабочий' then 'Автоматическая сверка SKU и количеств с дневными реализациями 1С' else 'Содержательный результат переговоров и конкретный следующий шаг' end,
  p_basis)returning * into t;
 if c.client_status='Рабочий' then enrolled:=public.crm_task_enroll_v4(t.id,r.id);end if;
 insert into public.crm_task_assignments_v5(task_id,route_id,client_id,manager_name,week_start,route_day,kind,stage) values(t.id,r.id,c.id,r.manager_name,date_trunc('week',r.visit_date)::date,r.visit_date,case when c.client_status='Рабочий' then 'work' else 'potential' end,p_stage);
 insert into public.crm_shelf_plans_v4(route_id,client_id,task_id,manager_name,route_day) values(r.id,c.id,t.id,r.manager_name,r.visit_date) on conflict(route_id,client_id) do nothing;
 return jsonb_build_object('task',to_jsonb(t),'verification',enrolled);
end $$;
revoke all on function public.crm_task_create_v5(uuid,uuid,jsonb,text,text,text,text) from public,anon;
grant execute on function public.crm_task_create_v5(uuid,uuid,jsonb,text,text,text,text) to authenticated;