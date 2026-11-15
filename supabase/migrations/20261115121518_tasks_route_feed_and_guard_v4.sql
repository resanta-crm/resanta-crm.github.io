-- Expose feed health only, never the branch-wide customer sales rows.
create function public.crm_tasks_feed_status_v4()
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not exists(select 1 from public.users where id=(select auth.uid())
  and ((role='manager' and region='Витебск')or(role='boss'and region in('Витебск','Все филиалы'))))
 then raise exception 'TASK_FEED_FORBIDDEN' using errcode='42501';end if;
 return(select jsonb_build_object('report_day',report_day,'source_message_at',source_message_at,'row_count',row_count,
  'explicit_empty',explicit_empty,'unresolved_count',unresolved_count)
  from public.crm_daily_sales_runs_v4 where branch='Витебск' order by report_day desc,source_message_at desc limit 1);
end $$;
revoke all on function public.crm_tasks_feed_status_v4() from public,anon;
grant execute on function public.crm_tasks_feed_status_v4() to authenticated;

-- Working-client commercial tasks cannot be closed from an older browser or
-- the visit quick form even while awaiting enrollment of explicit SKU targets.
create or replace function public.crm_task_close_guard_v4()
returns trigger language plpgsql security invoker set search_path='' as $$
declare protected boolean;
begin
 if current_user in('postgres','service_role','supabase_admin') then return case when TG_OP='DELETE' then old else new end;end if;
 protected:=exists(select 1 from public.crm_task_contracts_v4 where task_id=old.id);
 if protected then
  if TG_OP='DELETE' then raise exception 'TASK_1C_CONTRACT_PROTECTED' using errcode='42501';end if;
  if (new.done,new.result_achieved,new.done_at,new.client_id,new.manager_name,new.ai_stock_items,new.due_date,new.review_status)
    is distinct from (old.done,old.result_achieved,old.done_at,old.client_id,old.manager_name,old.ai_stock_items,old.due_date,old.review_status)
  then raise exception 'TASK_CLOSED_ONLY_BY_1C' using errcode='42501';end if;
 elsif TG_OP='UPDATE' and old.source='must_list' and exists(select 1 from public.clients c where c.id=old.client_id and c.region='Витебск' and c.client_status='Рабочий')
 and (new.done,new.result_achieved,new.done_at) is distinct from(old.done,old.result_achieved,old.done_at)
 then raise exception 'TASK_SKU_VERIFICATION_REQUIRED' using errcode='42501';
 end if;
 return case when TG_OP='DELETE' then old else new end;
end $$;
