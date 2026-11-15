-- Isolated calendar analytics; existing business calculations remain unchanged.
create or replace function public.crm_meeting_source_metrics_v2(p_source text,p_month date,p_manager text default null)
returns jsonb language plpgsql stable security invoker set search_path=public,pg_temp set statement_timeout='8s' as $$
declare result jsonb;
begin
 if p_month is null or p_month<>date_trunc('month',p_month)::date then raise exception 'invalid_month'; end if;
 case p_source
 when 'clients' then
 select jsonb_build_object('source','clients','period_mode','current_state','report_date',null::text,'metrics',jsonb_build_object('rows',count(*),'risk_count',count(*) filter(where nullif(trim(address),'') is null or manager_id is null))) into result from public.clients where (p_manager is null or manager_name=p_manager) and is_archived is not true and to_delete is not true;
 when 'motivation' then
 select jsonb_build_object('source','manager_kpi_plans','period_mode','selected_month','report_date',null::text,'metrics',jsonb_build_object('rows',count(*),'risk_count',null::bigint,'shipment_plan',coalesce(sum(shipment_plan),0),'akb_plan',coalesce(sum(akb_plan),0),'new_clients_plan',coalesce(sum(new_clients_plan),0))) into result from public.manager_kpi_plans where (p_manager is null or manager_name=p_manager) and period_month=to_char(p_month,'YYYY-MM');
 when 'visits' then
 select jsonb_build_object('source','visits','period_mode','selected_month','report_date',null::text,'metrics',jsonb_build_object('rows',count(*),'risk_count',null::bigint)) into result from public.visits where is_duplicate is not true and (p_manager is null or manager_name=p_manager) and date>=p_month and date<(p_month+interval '1 month');
 when 'routes' then
 select jsonb_build_object('source','route_plans','period_mode','selected_month','report_date',null::text,'metrics',jsonb_build_object('rows',count(*),'risk_count',count(*) filter(where visited is not true and visit_date < (now() at time zone 'Europe/Minsk')::date))) into result from public.route_plans where removed is not true and (p_manager is null or manager_name=p_manager) and visit_date>=p_month and visit_date<(p_month+interval '1 month');
 when 'tasks' then
 select jsonb_build_object('source','tasks','period_mode','current_state','report_date',null::text,'metrics',jsonb_build_object('rows',count(*),'risk_count',count(*) filter(where due_date < (now() at time zone 'Europe/Minsk')::date and review_status='approved'),'approved_open',count(*) filter(where review_status='approved'),'stale_open',count(*) filter(where review_status='stale_review'),'stale_overdue',count(*) filter(where review_status='stale_review' and due_date < (now() at time zone 'Europe/Minsk')::date))) into result from public.tasks where done is not true and (p_manager is null or manager_name=p_manager);
 when 'debt' then
 select jsonb_build_object('source','client_debt','period_mode','latest_report_in_or_before_month','report_date',max(report_date),'metrics',jsonb_build_object('rows',count(*),'risk_count',count(*) filter(where debt_overdue>0),'debt_overdue',coalesce(sum(debt_overdue),0))) into result from public.client_debt where (p_manager is null or manager_name=p_manager) and report_date=(select max(report_date) from public.client_debt where report_date<(p_month+interval '1 month'));
 when 'gps' then
 select jsonb_build_object('source','gps_workday_aggregates','period_mode','selected_month','report_date',null::text,'metrics',jsonb_build_object('rows',count(*),'risk_count',count(*) filter(where aggregation_status='stale'),'planned_count',coalesce(sum(planned_count),0),'visited_count',coalesce(sum(visited_count),0),'missed_count',coalesce(sum(missed_count),0),'distance_m',coalesce(sum(distance_m),0))) into result from public.gps_workday_aggregates where (p_manager is null or manager_name=p_manager) and work_date>=p_month and work_date<(p_month+interval '1 month');
 when 'imports' then
 select jsonb_build_object('source','crm_import_status','period_mode','current_state','report_date',max(last_success_at),'metrics',jsonb_build_object('rows',count(*),'risk_count',null::bigint)) into result from public.crm_import_status;
 when 'stock' then
 select jsonb_build_object('source','stock_balances','period_mode','latest_report_in_or_before_month','report_date',max(report_date),'metrics',jsonb_build_object('rows',count(*),'risk_count',null::bigint,'qty_onhand',coalesce(sum(qty_onhand),0),'qty_reserve',coalesce(sum(qty_reserve),0),'qty_avail',coalesce(sum(qty_avail),0))) into result from public.stock_balances where report_date=(select max(report_date) from public.stock_balances where report_date<(p_month+interval '1 month'));
 when 'stock_freshness' then
 select jsonb_build_object('source','warehouse_stock_import_state','period_mode','current_state','report_date',max(report_date),'metrics',jsonb_build_object('rows',count(*),'risk_count',null::bigint)) into result from public.warehouse_stock_import_state;
 when 'markdown' then
 select jsonb_build_object('source','markdown_items','period_mode','current_state','report_date',null::text,'metrics',jsonb_build_object('rows',count(*),'risk_count',null::bigint,'quantity',coalesce(sum(quantity),0))) into result from public.markdown_items where is_active=true;
 when 'stands' then
 select jsonb_build_object('source','stand_assets_v236346','period_mode','current_state','report_date',null::text,'metrics',jsonb_build_object('rows',count(*),'risk_count',null::bigint)) into result from public.stand_assets_v236346;
 when 'warehouse_orders' then
 select jsonb_build_object('source','warehouse_pick_orders_v1','period_mode','current_state','report_date',null::text,'metrics',jsonb_build_object('rows',count(*),'risk_count',null::bigint,'line_count',coalesce(sum(line_count),0),'total_qty',coalesce(sum(total_qty),0))) into result from public.warehouse_pick_orders_v1;
 when 'warehouse_receiving' then
 select jsonb_build_object('source','warehouse_receiving_sessions','period_mode','current_state','report_date',null::text,'metrics',jsonb_build_object('rows',count(*),'risk_count',null::bigint,'expected_sku_count',coalesce(sum(expected_sku_count),0),'expected_qty',coalesce(sum(expected_qty),0))) into result from public.warehouse_receiving_sessions;
 when 'warehouse_inventory' then
 select jsonb_build_object('source','warehouse_inventory_sessions','period_mode','current_state','report_date',null::text,'metrics',jsonb_build_object('rows',count(*),'risk_count',null::bigint,'stock_sku_count',coalesce(sum(stock_sku_count),0))) into result from public.warehouse_inventory_sessions;
 when 'competitors' then
 select jsonb_build_object('source','triovist_competitor_analysis_current','period_mode','current_state','report_date',null::text,'metrics',jsonb_build_object('rows',count(*),'risk_count',null::bigint)) into result from public.triovist_competitor_analysis_current;
 when 'cards_21vek' then
 select jsonb_build_object('source','triovist_content_cards','period_mode','current_state','report_date',null::text,'metrics',jsonb_build_object('rows',count(*),'risk_count',count(*) filter(where unanswered_questions>0 or negative_reviews>0),'unanswered_questions',coalesce(sum(unanswered_questions),0),'negative_reviews',coalesce(sum(negative_reviews),0))) into result from public.triovist_content_cards;
 when 'card_issues' then
 select jsonb_build_object('source','triovist_content_issues','period_mode','current_state','report_date',null::text,'metrics',jsonb_build_object('rows',count(*),'risk_count',null::bigint)) into result from public.triovist_content_issues;
 when 'triovist_stock' then
 select jsonb_build_object('source','triovist_partner_stock','period_mode','latest_report_in_or_before_month','report_date',max(snapshot_date),'metrics',jsonb_build_object('rows',count(*),'risk_count',null::bigint,'qty_free',coalesce(sum(qty_free),0),'qty_orders',coalesce(sum(qty_orders),0))) into result from public.triovist_partner_stock where snapshot_date=(select max(snapshot_date) from public.triovist_partner_stock where snapshot_date<(p_month+interval '1 month'));
 when 'triovist_tasks' then
 select jsonb_build_object('source','triovist_ai_tasks','period_mode','current_state','report_date',null::text,'metrics',jsonb_build_object('rows',count(*),'risk_count',count(*) filter(where due_date < (now() at time zone 'Europe/Minsk')::date and status not in ('done','cancelled')))) into result from public.triovist_ai_tasks;
 when 'vip_actions' then
 select jsonb_build_object('source','vip_action_recommendations','period_mode','current_state','report_date',null::text,'metrics',jsonb_build_object('rows',count(*),'risk_count',null::bigint,'loss_revenue',coalesce(sum(loss_revenue),0))) into result from public.vip_action_recommendations where is_active=true;
 when 'cash' then
 select jsonb_build_object('source','cash_receipts_1c','period_mode','selected_month','report_date',null::text,'metrics',jsonb_build_object('rows',count(*),'risk_count',null::bigint,'amount',coalesce(sum(amount),0))) into result from public.cash_receipts_1c where (p_manager is null or manager_name=p_manager) and document_at>=(p_month::timestamp at time zone 'Europe/Minsk') and document_at<((p_month+interval '1 month') at time zone 'Europe/Minsk');
 when 'promotion_budgets' then
 select jsonb_build_object('source','promotion_budgets','period_mode','selected_month','report_date',null::text,'metrics',jsonb_build_object('rows',count(*),'risk_count',null::bigint,'budget_total',coalesce(sum(budget_total),0))) into result from public.promotion_budgets where (p_manager is null or manager_name=p_manager) and period_start<(p_month+interval '1 month') and period_end>=p_month;
 when 'mrc' then
 select jsonb_build_object('source','triovist_mrc_current','period_mode','current_state','report_date',null::text,'metrics',jsonb_build_object('rows',count(*),'risk_count',null::bigint)) into result from public.triovist_mrc_current;
 when 'infographics' then
 select jsonb_build_object('source','triovist_infographic_factory_batches_v5','period_mode','current_state','report_date',null::text,'metrics',jsonb_build_object('rows',count(*),'risk_count',coalesce(sum(failed_items),0),'total_items',coalesce(sum(total_items),0),'completed_items',coalesce(sum(completed_items),0),'failed_items',coalesce(sum(failed_items),0),'attention_items',coalesce(sum(attention_items),0))) into result from public.triovist_infographic_factory_batches_v5 where created_at>=p_month and created_at<(p_month+interval '1 month');
 when 'parser' then
 select jsonb_build_object('source','triovist_market_position_watch_runs_v236352','period_mode','current_state','report_date',null::text,'metrics',jsonb_build_object('rows',count(*),'risk_count',count(*) filter(where error_count>0),'tracked_count',coalesce(sum(tracked_count),0),'success_count',coalesce(sum(success_count),0),'error_count',coalesce(sum(error_count),0))) into result from public.triovist_market_position_watch_runs_v236352 where started_at>=p_month and started_at<(p_month+interval '1 month');
 when 'lpr' then
 select jsonb_build_object('source','crm_lpr_contacts_v1','period_mode','current_state','report_date',null::text,'metrics',jsonb_build_object('rows',count(*),'missing_birthday',count(*) filter(where birth_month is null or birth_day is null),'missing_responsible',count(*) filter(where responsible_user_id is null),'risk_count',count(*) filter(where birth_month is null or birth_day is null or responsible_user_id is null))) into result
 from public.crm_lpr_contacts_v1 l where l.active and (p_manager is null or exists(select 1 from public.users u where u.id=l.responsible_user_id and u.name=p_manager) or exists(select 1 from public.clients c where c.id=l.client_id and c.manager_name=p_manager));
 else raise exception 'unsupported_source';
 end case;
 return result;
end $$;
revoke all on function public.crm_meeting_source_metrics_v2(text,date,text) from public,anon,authenticated;
grant execute on function public.crm_meeting_source_metrics_v2(text,date,text) to service_role;

-- Calendar access is granted to real CRM accounts except the explicitly excluded user.
create or replace function public.crm_calendar_access_v2() returns boolean
language sql stable security invoker set search_path=public,pg_temp as $$
 select auth.uid() is not null and auth.uid()<>'bcc330b8-9100-4c60-b87f-22a36988fc97'::uuid
 and exists(select 1 from public.users where id=auth.uid() and role<>'auditor_pending')
$$;
revoke all on function public.crm_calendar_access_v2() from public,anon;
grant execute on function public.crm_calendar_access_v2() to authenticated;
alter table public.crm_ai360_meetings_v1 add column if not exists status text not null default 'scheduled' check(status in ('scheduled','cancelled'));
alter table public.crm_ai360_meetings_v1 add column if not exists agenda jsonb not null default '{}'::jsonb check(octet_length(agenda::text)<=64000);
alter table public.crm_ai360_meetings_v1 add column if not exists minutes text not null default '' check(char_length(minutes)<=12000);
alter table public.crm_ai360_meetings_v1 add column if not exists updated_at timestamptz not null default now();
create index if not exists crm_meetings_client_v2 on public.crm_ai360_meetings_v1(client_id) where client_id is not null;
drop policy if exists "Lera meetings read own" on public.crm_ai360_meetings_v1;
create policy "Lera meetings read own" on public.crm_ai360_meetings_v1 for select to authenticated
 using ((select auth.uid())=owner_id and (select public.crm_calendar_access_v2()));
drop policy if exists "Lera meetings insert own" on public.crm_ai360_meetings_v1;
create policy "Lera meetings insert own" on public.crm_ai360_meetings_v1 for insert to authenticated
 with check ((select auth.uid())=owner_id and (select public.crm_calendar_access_v2()));
create policy "Calendar update own v2" on public.crm_ai360_meetings_v1 for update to authenticated
 using ((select auth.uid())=owner_id and (select public.crm_calendar_access_v2()))
 with check ((select auth.uid())=owner_id and (select public.crm_calendar_access_v2()));
grant update(title,purpose,format,starts_at,duration_minutes,location,participants,status,agenda,minutes) on public.crm_ai360_meetings_v1 to authenticated;

-- Serializes all calendar writers, including the existing signed Lera action path.
-- Existing meetings are untouched; the guard applies to new/changed schedules.
create or replace function public.crm_calendar_guard_v2() returns trigger
language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 if new.owner_id='bcc330b8-9100-4c60-b87f-22a36988fc97'::uuid then raise exception 'calendar_not_allowed'; end if;
 if tg_op='UPDATE' and new.owner_id<>old.owner_id then raise exception 'owner_immutable'; end if;
 perform pg_advisory_xact_lock(hashtextextended(new.owner_id::text,812));
 if new.status='scheduled' and (tg_op='INSERT' or new.starts_at is distinct from old.starts_at or new.duration_minutes is distinct from old.duration_minutes or new.status is distinct from old.status) then
  if exists(select 1 from public.crm_ai360_meetings_v1 m where m.owner_id=new.owner_id and m.id<>new.id and m.status='scheduled'
   and m.starts_at<new.starts_at+make_interval(mins=>new.duration_minutes)
   and m.starts_at+make_interval(mins=>m.duration_minutes)>new.starts_at) then raise exception 'calendar_conflict'; end if;
 end if;
 new.updated_at=clock_timestamp();return new;
end $$;
revoke all on function public.crm_calendar_guard_v2() from public,anon,authenticated;
create trigger crm_calendar_guard_v2 before insert or update on public.crm_ai360_meetings_v1 for each row execute function public.crm_calendar_guard_v2();

create or replace function public.crm_calendar_update_v2(p_id uuid,p_expected timestamptz,p_patch jsonb)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp set statement_timeout='8s' as $$
declare m public.crm_ai360_meetings_v1;
begin
 if not public.crm_calendar_access_v2() then raise exception 'calendar_not_allowed'; end if;
 if jsonb_typeof(p_patch)<>'object' or p_patch-'title'-'purpose'-'starts_at'-'duration_minutes'-'status'-'agenda'-'minutes'<>'{}'::jsonb then raise exception 'invalid_patch'; end if;
 select * into m from public.crm_ai360_meetings_v1 where id=p_id and owner_id=auth.uid() for update;
 if not found then raise exception 'meeting_not_found'; end if;
 if p_expected is null or m.updated_at<>p_expected then raise exception 'meeting_changed_refresh'; end if;
 update public.crm_ai360_meetings_v1 set
 title=case when p_patch?'title' then p_patch->>'title' else title end,
 purpose=case when p_patch?'purpose' then p_patch->>'purpose' else purpose end,
 starts_at=case when p_patch?'starts_at' then (p_patch->>'starts_at')::timestamptz else starts_at end,
 duration_minutes=case when p_patch?'duration_minutes' then (p_patch->>'duration_minutes')::integer else duration_minutes end,
 status=coalesce(p_patch->>'status',status),agenda=coalesce(p_patch->'agenda',agenda),minutes=coalesce(p_patch->>'minutes',minutes)
 where id=p_id and owner_id=auth.uid() returning * into m;
 return to_jsonb(m);
end $$;
revoke all on function public.crm_calendar_update_v2(uuid,timestamptz,jsonb) from public,anon;
grant execute on function public.crm_calendar_update_v2(uuid,timestamptz,jsonb) to authenticated;

-- Verified preparation snapshots are written by the authenticated Edge workflow only.
create table public.crm_meeting_preparations_v2(
 id uuid primary key default gen_random_uuid(),owner_id uuid not null references auth.users(id) on delete cascade,
 context jsonb not null,briefing jsonb not null,coverage jsonb not null,created_at timestamptz not null default now()
);
alter table public.crm_meeting_preparations_v2 enable row level security;
revoke all on public.crm_meeting_preparations_v2 from public,anon,authenticated;
grant select on public.crm_meeting_preparations_v2 to authenticated;
grant all on public.crm_meeting_preparations_v2 to service_role;
create policy "Preparation read own v2" on public.crm_meeting_preparations_v2 for select to authenticated
 using ((select auth.uid())=owner_id and (select public.crm_calendar_access_v2()));
create index crm_meeting_preparations_owner_created_v2 on public.crm_meeting_preparations_v2(owner_id,created_at desc);
