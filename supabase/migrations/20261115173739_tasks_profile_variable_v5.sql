create or replace function public.crm_task_profile_v5(p_task uuid,p_profile jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.crm_task_assignments_v5;category text;v_assortment text;total integer;ours integer;
begin
 select * into a from public.crm_task_assignments_v5 where task_id=p_task for update;
 if not found or a.cancelled or not public.crm_tasks_access_v4(a.client_id,a.manager_name) then raise exception 'TASK_PROFILE_FORBIDDEN' using errcode='42501';end if;
 category:=p_profile->>'role_type';v_assortment:=btrim(p_profile->>'assortment');
 total:=(p_profile->>'sku_count')::integer;ours:=(p_profile->>'sku_our')::integer;
 if category is null or category not in('A','B','C') or coalesce(length(v_assortment),0) not between 2 and 1000
 or total is null or ours is null or total<0 or ours<0 or ours>total then raise exception 'TASK_PROFILE_INVALID';end if;
 update public.clients set role_type=category,assortment=v_assortment,sku_count=total,sku_our=ours where id=a.client_id;
 update public.crm_task_assignments_v5 set profile_confirmed_at=now(),profile_evidence=p_profile where task_id=p_task;
 insert into public.crm_task_events_v4(task_id,kind,actor_id,payload) values(p_task,'profile_confirmed',auth.uid(),p_profile);
 return jsonb_build_object('saved',true,'client_id',a.client_id);
end $$;
revoke all on function public.crm_task_profile_v5(uuid,jsonb) from public,anon;
grant execute on function public.crm_task_profile_v5(uuid,jsonb) to authenticated;

