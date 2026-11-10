-- PDZ 360 / 2026-11-10: truthful daily report-date changes from 1C,
-- scoped by logged-in CRM identity. No imported debt, comments or tasks are changed.
create or replace function public.crm_pdz360_daily_v1(
 p_manager text default null, p_days integer default 30
) returns jsonb
language plpgsql stable security definer
set search_path to 'public','auth','pg_catalog'
as $pdz$
declare
 v_role text;
 v_user_name text;
 v_manager text;
 v_days int:=least(42,greatest(7,coalesce(p_days,30)));
 v_latest date;
 v_previous date;
 v_total numeric;
 v_prev_total numeric;
 v_out jsonb;
begin
 if auth.uid() is null then
  raise exception 'Необходима авторизация' using errcode='42501';
 end if;
 select u.role,u.name into v_role,v_user_name
 from public.users u where u.id=auth.uid() limit 1;
 if coalesce(v_role,'') not in ('boss','manager') then
  raise exception 'Нет доступа к задолженности' using errcode='42501';
 end if;
 if v_role='manager' then
  v_manager:=nullif(split_part(btrim(v_user_name),' ',1),'');
  if v_manager is null then raise exception 'Нет закреплённого менеджера' using errcode='42501';end if;
  if nullif(btrim(coalesce(p_manager,'')),'') is not null and
   lower(split_part(btrim(p_manager),' ',1)) not in ('all',lower(v_manager)) then
   raise exception 'Недоступна ПДЗ чужих клиентов' using errcode='42501';
  end if;
 else
  v_manager:=nullif(btrim(coalesce(p_manager,'')),'');
  if lower(coalesce(v_manager,''))='all' then v_manager:=null;end if;
 end if;
 select max(report_date) into v_latest from public.client_debt_history_v1;
 if v_latest is null then
  return jsonb_build_object('version','pdz360.daily.1','report_date',null,
   'series','[]'::jsonb,'rows','[]'::jsonb,'managers','[]'::jsonb,'no_data',true);
 end if;
 select max(report_date) into v_previous from public.client_debt_history_v1
 where report_date<v_latest;

 with scoped as materialized(
  select h.report_date,h.client_name,h.manager_name,
   coalesce(h.debt_overdue,0)::numeric as overdue,
   coalesce(h.debt_overdue_days,0)::int as days_overdue,
   coalesce(h.debt_overdue_pct,0)::numeric as overdue_pct,
   h.imported_at
  from public.client_debt_history_v1 h
  where h.report_date>=v_latest-v_days::int-2
    and h.report_date<=v_latest and coalesce(h.debt_overdue,0)>0
    and (v_manager is null or
      lower(split_part(btrim(h.manager_name),' ',1))=lower(split_part(btrim(v_manager),' ',1)))
 ),
 daily as materialized(
  select s.report_date,round(sum(s.overdue),2) total,
   count(*)::int debtors,round(coalesce(sum(s.overdue) filter(where s.days_overdue>=30),0),2) over_30
  from scoped s group by s.report_date
 ),
 latest as materialized (
  select * from scoped where report_date=v_latest
 ),
 previous as materialized(
  select lower(regexp_replace(btrim(client_name),'\s+',' ','g')) as ck,
   lower(split_part(btrim(manager_name),' ',1)) as mk,round(sum(overdue),2) amount
  from scoped where report_date=v_previous
  group by 1,2
 ),
 linked_clients as materialized (
  select lower(regexp_replace(btrim(c.name),'\s+',' ','g')) as ck,
   case when count(distinct c.id)=1 then min(c.id::text)::uuid else null end as client_id
  from public.clients c where coalesce(c.is_archived,false)=false
  group by 1
 ),
 current_clients as materialized (
  select l.client_name,l.manager_name,l.overdue,l.days_overdue,l.overdue_pct,
   l.report_date,coalesce(pr.amount,0) previous_amount,
   round(l.overdue-coalesce(pr.amount,0),2) day_change,
   lc.client_id,
   case when l.days_overdue>=90 and l.overdue>=1000 then 'critical'
    when l.days_overdue>=60 and l.overdue>=1000 then 'high'
    when l.days_overdue>=30 then 'warning' else 'control' end as risk
  from latest l
  left join previous pr
   on pr.ck=lower(regexp_replace(btrim(l.client_name),'\s+',' ','g'))
   and pr.mk=lower(split_part(btrim(l.manager_name),' ',1))
  left join linked_clients lc on lc.ck=lower(regexp_replace(btrim(l.client_name),'\s+',' ','g'))
 ),
 with_comments as materialized (
  select c.*,dc.comment last_comment,dc.created_at last_contact_at,
   dc.promised_date,dc.amount promise_amount,dc.author last_author,
   (select pa.action_type from public.pdz_legal_actions pa
     where pa.client_key=public.crm_client_key(c.client_name)
     order by pa.action_at desc limit 1) legal_action
  from current_clients c
  left join lateral (
   select d.comment,d.created_at,d.promised_date,d.amount,d.author
   from public.debt_comments d where c.client_id is not null and d.client_id=c.client_id
   order by d.created_at desc limit 1
  ) dc on true
 ),
 statuses as materialized(
  select c.*,
   (c.promised_date between v_latest and v_latest+7
      and c.promise_amount>0) as upcoming_promise
  from with_comments c
 ),
 metrics as materialized (
  select round(coalesce(sum(overdue),0),2) amount,count(*)::int debtors,
   round(coalesce(sum(overdue) filter(where days_overdue>=30),0),2) over_30,
   round(coalesce(sum(overdue) filter(where days_overdue>60),0),2) over_60,
   count(*) filter(where days_overdue>=60 and overdue>=1000)::int high_risk,
   round(coalesce(sum(overdue) filter(where days_overdue>=60 and overdue>=1000),0),2) high_amount,
   count(*) filter(where upcoming_promise)::int promised_clients,
   round(coalesce(sum(least(promise_amount,overdue)) filter(where upcoming_promise),0),2) promised_amount,
   round(coalesce(sum(overdue) filter(where days_overdue<8),0),2) band_0_7,
   round(coalesce(sum(overdue) filter(where days_overdue>=8 and days_overdue<=30),0),2) band_8_30,
   round(coalesce(sum(overdue) filter(where days_overdue>=31 and days_overdue<=60),0),2) band_31_60,
   round(coalesce(sum(overdue) filter(where days_overdue>60),0),2) band_61_plus
  from statuses
 ),
 mgrs as materialized(
  select manager_name,round(sum(overdue),2) amount,count(*)::int debtors
  from statuses group by manager_name
 )
 select jsonb_build_object(
  'version','pdz360.daily.1','report_date',v_latest,'previous_report_date',v_previous,
  'manager',v_manager,'days_requested',v_days,
  'imported_at',(select max(imported_at) from latest),
  'metrics',(select to_jsonb(m) from metrics m),
  'previous_amount',coalesce((select total from daily where report_date=v_previous),0),
  'day_change',(select amount from metrics)-coalesce((select total from daily where report_date=v_previous),0),
  'series',coalesce((select jsonb_agg(to_jsonb(t) order by t.report_date) from
   (select report_date,total,debtors,over_30 from daily order by report_date desc limit v_days) t),'[]'::jsonb),
  'managers',coalesce((select jsonb_agg(to_jsonb(m) order by amount desc) from mgrs m),'[]'::jsonb),
  'rows',coalesce((select jsonb_agg(to_jsonb(z) order by
   case z.risk when 'critical' then 0 when 'high' then 1 when 'warning' then 2 else 3 end,
   z.overdue desc,z.client_name) from statuses z),'[]'::jsonb),
  'limits',jsonb_build_object('source','1C PDZ daily report snapshots',
   'report_day_not_import_day',true,'day_change_is_not_confirmed_payment',true,
   'high_risk','60+ days and >=1000 BYN; critical 90+ and >=1000',
   'promises','only recorded and dated manager comments')
 ) into v_out;
 return v_out;
end;
$pdz$;
revoke all on function public.crm_pdz360_daily_v1(text,integer) from public,anon;
grant execute on function public.crm_pdz360_daily_v1(text,integer) to authenticated,service_role;
