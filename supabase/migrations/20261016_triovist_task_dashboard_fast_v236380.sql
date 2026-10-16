-- RESANTA CRM v23.6.380
-- Speed up monthly Triovist task dashboard by filtering the month/manager first,
-- then aggregating task items only for the selected task ids.

create or replace function public.triovist_tasks_get_dashboard_month_v23648(
  p_manager_email text,
  p_month date
)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  a record;
  v_filter text:=lower(trim(coalesce(p_manager_email,'')));
  v_month date:=date_trunc('month',coalesce(p_month,current_date))::date;
  v_tasks jsonb;
  v_summary jsonb;
  v_groups jsonb;
  v_managers jsonb;
begin
  select * into a from public.triovist_content_actor();
  if a.actor_email is null then raise exception 'Пользователь не найден'; end if;

  if a.actor_role='boss' and a.actor_email in ('payushin_ar@resanta.ru','sidarovich_kn@resanta.ru') then
    if v_filter not in ('','aleksandrenko_av@resanta.ru','krishtal_na@resanta.ru') then
      raise exception 'Некорректный менеджер';
    end if;
  elsif a.actor_scope='triovist' and a.actor_email in ('aleksandrenko_av@resanta.ru','krishtal_na@resanta.ru') then
    v_filter:=a.actor_email;
  else
    raise exception 'Нет доступа к задачам 21vek';
  end if;

  with filtered_tasks as materialized (
    select t.*
    from public.triovist_ai_tasks t
    where t.period_month=v_month
      and (v_filter='' or t.manager_email=v_filter)
  ),
  item_agg as materialized (
    select
      ti.task_id,
      jsonb_agg(
        jsonb_build_object(
          'id',ti.id,
          'card_key',ti.card_key,
          'issue_type',ti.issue_type,
          'issue_title',ti.issue_title,
          'sku',ti.sku,
          'donor_article',ti.donor_article,
          'product_name',ti.product_name,
          'product_url',ti.product_url,
          'baseline_value',ti.baseline_value,
          'target_value',ti.target_value,
          'current_value',ti.current_value,
          'item_status',ti.item_status,
          'verified_at',ti.verified_at
        )
        order by
          case ti.item_status when 'open' then 0 when 'missing' then 1 when 'verified' then 2 else 3 end,
          ti.product_name,ti.sku,ti.issue_title
      ) items,
      count(*)::integer item_count,
      count(*) filter(where ti.item_status='verified')::integer verified_item_count
    from public.triovist_ai_task_items ti
    join filtered_tasks ft on ft.id=ti.task_id
    group by ti.task_id
  )
  select coalesce(jsonb_agg(to_jsonb(x) order by
    case x.status
      when 'pending_approval' then 0
      when 'in_progress' then 1
      when 'accepted' then 2
      when 'waiting_21vek' then 3
      when 'awaiting_check' then 4
      when 'partial' then 5
      when 'overdue' then 6
      when 'new' then 7
      when 'verified' then 8
      when 'not_achieved' then 9
      when 'not_relevant' then 10
      when 'cancelled' then 11
      else 12 end,
    x.priority_score desc,x.due_date,x.manager_name,x.group_name),'[]'::jsonb)
  into v_tasks
  from (
    select
      t.*,
      coalesce(ia.items,'[]'::jsonb) as items,
      coalesce(ia.item_count,0) as item_count,
      coalesce(ia.verified_item_count,0) as verified_item_count
    from filtered_tasks t
    left join item_agg ia on ia.task_id=t.id
  ) x;

  select jsonb_build_object(
    'total',count(*),
    'pending_approval',count(*) filter(where status='pending_approval'),
    'active',count(*) filter(where status in ('new','accepted','in_progress','waiting_21vek','awaiting_check')),
    'partial',count(*) filter(where status='partial'),
    'overdue',count(*) filter(where status='overdue'),
    'not_achieved',count(*) filter(where status='not_achieved'),
    'verified',count(*) filter(where status='verified'),
    'cancelled',count(*) filter(where status='cancelled'),
    'not_relevant',count(*) filter(where status='not_relevant'),
    'ai_pending',count(*) filter(where ai_state<>'generated' and status not in ('verified','cancelled','not_relevant'))
  )
  into v_summary
  from public.triovist_ai_tasks
  where period_month=v_month
    and (v_filter='' or manager_email=v_filter);

  select coalesce(jsonb_agg(to_jsonb(g) order by g.manager_name,g.group_name),'[]'::jsonb)
  into v_groups
  from (
    select
      manager_email,manager_name,group_name,
      count(*)::integer as tasks_total,
      count(*) filter(where status in ('pending_approval','new','accepted','in_progress','waiting_21vek','awaiting_check','partial','overdue'))::integer as active_tasks,
      count(*) filter(where status='verified')::integer as verified_tasks,
      count(*) filter(where status='not_achieved')::integer as not_achieved_tasks
    from public.triovist_ai_tasks
    where period_month=v_month
      and (v_filter='' or manager_email=v_filter)
    group by manager_email,manager_name,group_name
  ) g;

  select coalesce(jsonb_agg(to_jsonb(m) order by m.manager_name),'[]'::jsonb)
  into v_managers
  from (
    select
      x.manager_email,x.manager_name,
      count(t.id)::integer as total_tasks,
      count(t.id) filter(where t.status in ('pending_approval','new','accepted','in_progress','waiting_21vek','awaiting_check','partial','overdue'))::integer as active_tasks,
      count(t.id) filter(where t.status='verified')::integer as verified_tasks,
      count(t.id) filter(where t.status='overdue')::integer as overdue_tasks,
      count(t.id) filter(where t.status='not_achieved')::integer as not_achieved_tasks,
      count(t.id) filter(where t.status='pending_approval')::integer as pending_tasks
    from (values
      ('aleksandrenko_av@resanta.ru','Александренко'),
      ('krishtal_na@resanta.ru','Кришталь')
    ) as x(manager_email,manager_name)
    left join public.triovist_ai_tasks t
      on t.manager_email=x.manager_email
     and t.period_month=v_month
    where v_filter='' or x.manager_email=v_filter
    group by x.manager_email,x.manager_name
  ) m;

  return jsonb_build_object(
    'tasks',v_tasks,
    'summary',coalesce(v_summary,'{}'::jsonb),
    'groups',v_groups,
    'managers',v_managers,
    'period_month',v_month,
    'generated_at',now()
  );
end;
$function$;

create index if not exists triovist_ai_tasks_period_manager_priority_v236380_idx
  on public.triovist_ai_tasks(period_month,manager_email,priority_score desc,due_date);

grant execute on function public.triovist_tasks_get_dashboard_month_v23648(text,date) to authenticated, service_role;
