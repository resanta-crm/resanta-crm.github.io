-- RESANTA CRM v23.6.250
-- Triovist AI: 21vek free stock is now an active task-planning signal.
-- Source of availability: Excel column 10 "Свободно".
-- "В пути" is diagnostic only and never increases currently available stock.
-- Zero stock is not an active sales priority; low stock is deprioritized;
-- balanced/high stock is prioritized for sell-out.
-- Group monetary target remains unchanged for review task-by-task.

CREATE OR REPLACE FUNCTION public.triovist_ai_logic_private_v236245()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'auth', 'pg_catalog'
AS $function$
declare
  v_email text:=lower(coalesce(auth.jwt()->>'email',''));
begin
  if v_email<>'payushin_ar@resanta.ru' then
    raise exception 'Доступ к внутренней логике ИИ разрешён только Александру Паюшину'
      using errcode='42501';
  end if;

  return jsonb_build_object(
    'version','v23.6.250',
    'engine_version','v23.6.250',
    'status','active_logic_not_generated_yet',
    'visible_only_to','payushin_ar@resanta.ru',
    'task_scope','group',
    'allowed_task_counts',jsonb_build_array(8,10,12,15),
    'deadline_rule','Последний день текущего месяца',
    'current_logic',jsonb_build_array(
      '1. Использовать продажи аналогичного месяца прошлого года.',
      '2. Использовать продажи аналогичного месяца 2024 года.',
      '3. Остаток Чехова обязателен. Допуск задачи считается на уровне всей группы: суммарный остаток группы в Чехове должен быть не менее 200 шт.; если меньше 200 — задача по группе не создаётся.',
      '4. Одна задача = одна закреплённая за менеджером группа товаров. SKU внутри задачи — только приоритеты. Если отдельный SKU невозможно выполнить из-за наличия, но денежная цель всей группы выполнена, задача закрывается.',
      '5. Берутся только группы, закреплённые за конкретным менеджером Triovist.',
      '6. Остаток 21vek свежий до 10 дней. Для выполнимости SKU используется строго колонка 10 Excel «Свободно». «В пути» хранится отдельно и не увеличивает доступный остаток. Остаток реально влияет на порядок SKU: нулевой остаток не является активным приоритетом продаж, низкий запас понижает приоритет, сбалансированный/высокий свободный остаток повышает sell-out приоритет.',
      '7. Темп продаж 21vek = 50% последнего периода + 30% предыдущего + 20% третьего. Покрытие >=3 месяцев = высокий запас; <0,75 месяца = низкий.',
      '8. Листинг только из собственного парсера, свежесть 72 часа. Вне TOP-60 → вернуть в TOP-60; 31–60 → TOP-30; сильное падение внутри TOP-30 → вернуть предыдущую позицию.',
      '9. Сезонность обязательна: используется профиль сезонности по группе; дополнительно сами аналогичные месяцы 2025 и 2024 являются сезонной историей.'
    ),
    'implementation_details',jsonb_build_array(
      'Денежная цель группы сейчас считается как максимум продаж аналогичного месяца прошлого года и аналогичного месяца 2024 года. Текущий месяц является фактом/базой прогресса.',
      'Если текущий факт группы уже достиг исторической денежной цели, новая задача по этой группе не создаётся.',
      'Сезонный коэффициент не раздувает денежную цель повторно; он влияет на приоритет выбора групп.',
      'Чехов >=200 — жёсткий фильтр группы. Остаток 21vek для SKU берётся из колонки 10 «Свободно». 900/... полностью исключён из исторических продаж, текущего факта, целей и закрытия задач.',
      'До 12 SKU с максимальным приоритетом показываются внутри группы, но выполнение каждого из них отдельно не требуется.',
      'Группа закрывается автоматически, когда общая выручка группы за месяц достигает target_revenue.',
      'План менеджера может отображаться в CRM как справка, но в v23.6.250 не масштабирует денежную цель группы.'
    ),
    'reset_state',jsonb_build_object(
      'reset_date','2026-10-07',
      'active_october_tasks',0,
      'backup_batch','2026-10-07-ai-reset-v236245',
      'generation_after_logic_change','not_started'
    )
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.triovist_task_result_revenue_v23651(p_task_id uuid, p_month date)
 RETURNS numeric
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  t public.triovist_ai_tasks%rowtype;
  v_month date:=date_trunc('month',p_month)::date;
  v_count integer:=0;
  v_result numeric:=0;
  v_items jsonb;
  v_scope text;
begin
  select * into t from public.triovist_ai_tasks where id=p_task_id;
  if not found then return 0; end if;

  v_scope:=lower(trim(coalesce(
    t.task_snapshot#>>'{commercial_context,task_scope}',
    t.commercial_context->>'task_scope',
    ''
  )));

  -- v23.6.250: group tasks close only by total revenue of the whole assigned group.
  -- Priority SKU are guidance only and never block completion.
  if v_scope='group' or coalesce(t.candidate_key,'') like 'v236247|%' or coalesce(t.candidate_key,'') like 'v236249|%' or coalesce(t.candidate_key,'') like 'v236250|%' then
    select coalesce(sum(s.revenue),0) into v_result
    from public.triovist_sales_resolved_cache s
    where s.month=v_month
      and trim(coalesce(s.sku,'')) !~* '^900(/|$)'
      and public.triovist_norm(coalesce(s.assigned_group,''))=public.triovist_norm(t.group_name)
      and exists(
        select 1
        from public.triovist_group_assignments ga
        where ga.active
          and lower(ga.manager_email)=lower(t.manager_email)
          and public.triovist_norm(ga.group_name)=public.triovist_norm(t.group_name)
      );
    return round(coalesce(v_result,0),2);
  end if;

  v_items:=coalesce(
    t.task_snapshot#>'{commercial_context,plan_items}',
    t.commercial_context->'plan_items',
    '[]'::jsonb
  );

  if v_scope<>'subgroup' and coalesce(t.candidate_key,'') not like 'v227319|%' then
    if jsonb_typeof(v_items)='array' then
      select count(*) into v_count
      from jsonb_array_elements(v_items) x
      where nullif(x->>'sku','') is not null;
    end if;

    if v_count>0 then
      with keys as (
        select distinct upper(regexp_replace(coalesce(x->>'sku',''),'[^A-Za-zА-Яа-яЁё0-9]+','','g')) k
        from jsonb_array_elements(v_items) x
        where nullif(x->>'sku','') is not null
      )
      select coalesce(sum(o.revenue),0) into v_result
      from public.triovist_sales_override o
      join keys k
        on upper(regexp_replace(coalesce(o.sku,''),'[^A-Za-zА-Яа-яЁё0-9]+','','g'))=k.k
      where o.month=v_month;
      return round(coalesce(v_result,0),2);
    end if;
  end if;

  select coalesce(sum(o.revenue),0) into v_result
  from public.triovist_sales_override o
  left join public.triovist_group_assignments ga
    on ga.active
   and public.triovist_norm(ga.group_name)=public.triovist_norm(public.triovist_resolve_group(o.category,o.subgroup))
  where o.month=v_month
    and lower(coalesce(ga.manager_email,''))=lower(t.manager_email)
    and public.triovist_task_group_match_v23651(
      t.group_name,
      public.triovist_resolve_group(o.category,o.subgroup),
      o.subgroup,
      o.product
    );

  return round(coalesce(v_result,0),2);
end;
$function$;

CREATE OR REPLACE FUNCTION public.triovist_task_snapshot_guard_v23651()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_month text;
  v_base numeric;
  v_target numeric;
  v_is_month_task boolean:=false;
  v_manual_target boolean:=false;
begin
  v_is_month_task:=coalesce(new.candidate_key,'') like 'v227319|%'
                  or coalesce(new.candidate_key,'') like 'v236247|%'
                  or coalesce(new.candidate_key,'') like 'v236249|%'
                  or coalesce(new.candidate_key,'') like 'v236250|%';

  if tg_op='INSERT' then
    if new.period_month is null then
      v_month:=substring(coalesce(new.candidate_key,'') from '\|([0-9]{4}-[0-9]{2})\|');
      if v_month is not null then
        new.period_month:=to_date(v_month||'-01','YYYY-MM-DD');
      else
        new.period_month:=date_trunc('month',new.due_date)::date;
      end if;
    end if;

    if v_is_month_task then
      if coalesce(new.commercial_context->>'subgroup_current_revenue','') ~ '^-?[0-9]+([.][0-9]+)?$' then
        v_base:=(new.commercial_context->>'subgroup_current_revenue')::numeric;
      elsif coalesce(new.commercial_context->>'current_revenue','') ~ '^-?[0-9]+([.][0-9]+)?$' then
        v_base:=(new.commercial_context->>'current_revenue')::numeric;
      else
        v_base:=public.triovist_parse_money_v23651(new.basis,'сейчас\s+([0-9 ]+(?:,[0-9]+)?)\s+BYN');
      end if;

      if coalesce(new.commercial_context->>'target_revenue','') ~ '^-?[0-9]+([.][0-9]+)?$' then
        v_target:=(new.commercial_context->>'target_revenue')::numeric;
      else
        v_target:=public.triovist_parse_money_v23651(
          coalesce(new.criteria,'')||' '||coalesce(new.expected_result,''),
          '(?:≥|минимум до)\s*([0-9 ]+(?:,[0-9]+)?)\s*BYN'
        );
      end if;

      new.baseline_revenue:=coalesce(new.baseline_revenue,v_base);
      new.target_revenue:=coalesce(new.target_revenue,v_target);

      if coalesce(new.task_snapshot,'{}'::jsonb)='{}'::jsonb then
        new.task_snapshot:=jsonb_build_object(
          'version',case when coalesce(new.candidate_key,'') like 'v236250|%' then 'v23.6.250'
               when coalesce(new.candidate_key,'') like 'v236249|%' then 'v23.6.249'
               when coalesce(new.candidate_key,'') like 'v236247|%' then 'v23.6.247'
               else 'v23.6.51' end,
          'captured_at',now(),
          'period_month',new.period_month,
          'task_scope',coalesce(new.commercial_context->>'task_scope',''),
          'group_name',new.group_name,
          'candidate_key',new.candidate_key,
          'task_text',new.task_text,
          'basis',new.basis,
          'expected_result',new.expected_result,
          'criteria',new.criteria,
          'commercial_context',coalesce(new.commercial_context,'{}'::jsonb)
        );
      end if;
    end if;
  else
    v_manual_target:=
      coalesce(new.commercial_context->>'target_source','')='leader_manual'
      and new.target_revenue is not null
      and new.target_revenue>0
      and new.target_revenue is distinct from old.target_revenue;

    if coalesce(old.task_snapshot,'{}'::jsonb)<>'{}'::jsonb then
      new.task_snapshot:=old.task_snapshot;
    end if;
    if old.baseline_revenue is not null then
      new.baseline_revenue:=old.baseline_revenue;
    end if;
    if old.target_revenue is not null and not v_manual_target then
      new.target_revenue:=old.target_revenue;
    end if;
    if old.period_month is not null then
      new.period_month:=old.period_month;
    end if;
  end if;

  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.triovist_tasks_generate_group_v236247(p_manager_email text, p_target_count integer, p_month_end date, p_rows jsonb, p_meta jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_catalog', 'pg_temp'
AS $function$
declare
  v_actor public.users%rowtype;
  v_manager text:=lower(trim(coalesce(p_manager_email,'')));
  v_target integer:=coalesce(p_target_count,10);
  v_month_end date:=p_month_end;
  v_month_start date;
  v_active text[]:=array['pending_approval','new','accepted','in_progress','waiting_21vek','awaiting_check','partial','overdue'];
  v_pack jsonb;
  v_rows jsonb;
  v_row jsonb;
  v_ctx jsonb;
  v_key text;
  v_group text;
  v_rep_sku text;
  v_insert jsonb;
  v_task_id text;
  v_constraint text;
  v_deleted integer:=0;
  v_locked integer:=0;
  v_need integer:=0;
  v_created integer:=0;
  v_processed integer:=0;
  v_skipped integer:=0;
  v_created_ids jsonb:='[]'::jsonb;
begin
  select * into v_actor from public.users where id=auth.uid();
  if v_actor.id is null then raise exception 'Требуется вход в CRM'; end if;
  if coalesce(v_actor.role,'')<>'boss'
     and lower(coalesce(v_actor.email,'')) not in ('payushin_ar@resanta.ru','sidarovich_kn@resanta.ru') then
    raise exception 'Недостаточно прав для формирования плана Triovist';
  end if;

  if v_manager not in ('aleksandrenko_av@resanta.ru','krishtal_na@resanta.ru') then
    raise exception 'v23.6.250 STOP: unsupported manager %',v_manager;
  end if;
  if v_target not in (8,10,12,15) then
    raise exception 'v23.6.250 STOP: target must be 8, 10, 12 or 15';
  end if;
  if v_month_end is null
     or v_month_end<>(date_trunc('month',v_month_end)::date+interval '1 month - 1 day')::date then
    raise exception 'v23.6.250 STOP: p_month_end must be the last day of a month';
  end if;

  v_month_start:=date_trunc('month',v_month_end)::date;
  if v_month_start<>date_trunc('month',current_date)::date then
    raise exception 'v23.6.250 STOP: generation is allowed only for the current month';
  end if;

  v_pack:=public.triovist_tasks_month_candidates_v236247(v_manager,v_target);
  v_rows:=coalesce(v_pack->'candidates','[]'::jsonb);
  if jsonb_typeof(v_rows)<>'array' then
    raise exception 'v23.6.250 STOP: invalid server candidates';
  end if;

  -- Replace only unsent/pending generated plans for the same manager/month.
  delete from public.triovist_ai_tasks t
  where lower(coalesce(t.manager_email,''))=v_manager
    and t.period_month=v_month_start
    and t.status='pending_approval'
    and (
      coalesce(t.candidate_key,'') like 'v227319|%'
      or coalesce(t.candidate_key,'') like 'v236250|%'
    );
  get diagnostics v_deleted=row_count;

  select count(*)::int into v_locked
  from public.triovist_ai_tasks t
  where lower(coalesce(t.manager_email,''))=v_manager
    and t.period_month=v_month_start
    and t.status=any(v_active)
    and coalesce(t.candidate_key,'') like 'v236250|%';

  v_need:=greatest(0,v_target-v_locked);

  if v_need<=0 then
    return jsonb_build_object(
      'version','v23.6.250','manager_email',v_manager,'target_count',v_target,
      'month_end',v_month_end,'deleted_pending',v_deleted,'locked_group_tasks',v_locked,
      'created',0,'created_task_ids','[]'::jsonb,'received_candidates',jsonb_array_length(v_rows)
    );
  end if;

  for v_row in
    select x.value
    from jsonb_array_elements(v_rows) with ordinality x(value,ord)
    order by x.ord
    limit 20
  loop
    exit when v_created>=v_need;
    v_processed:=v_processed+1;

    v_key:=trim(coalesce(v_row->>'candidate_key',''));
    v_group:=trim(coalesce(v_row->>'group_name',''));
    v_rep_sku:=trim(coalesce(v_row->>'sku',''));
    v_ctx:=coalesce(v_row->'commercial_context','{}'::jsonb);

    if lower(trim(coalesce(v_row->>'manager_email','')))<>v_manager
       or v_key not like 'v236250|%'
       or v_group=''
       or v_rep_sku=''
       or coalesce(v_ctx->>'task_scope','')<>'group'
       or coalesce((v_ctx->>'selected_sku_count')::int,0)<=0
       or coalesce((v_ctx->>'chekhov_group_total')::numeric,0)<200
       or not exists(
          select 1 from public.triovist_group_assignments ga
          where ga.active
            and lower(ga.manager_email)=v_manager
            and public.triovist_norm(ga.group_name)=public.triovist_norm(v_group)
       )
    then
      v_skipped:=v_skipped+1;
      continue;
    end if;

    if exists(
      select 1 from public.triovist_ai_tasks t
      where t.status=any(v_active)
        and (
          coalesce(t.candidate_key,'')=v_key
          or (
            lower(t.manager_email)=v_manager
            and t.period_month=v_month_start
            and coalesce(t.commercial_context->>'task_scope','')='group'
            and public.triovist_norm(t.group_name)=public.triovist_norm(v_group)
          )
        )
    ) then
      v_skipped:=v_skipped+1;
      continue;
    end if;

    v_ctx:=v_ctx||jsonb_build_object(
      'task_scope','group',
      'plan_month',to_char(v_month_start,'YYYY-MM'),
      'plan_due_date',v_month_end,
      'plan_target_count',v_target,
      'generation_meta',(v_pack-'candidates')||jsonb_build_object(
        'server_source','triovist_tasks_month_candidates_v236247',
        'server_forced',true,
        'client_candidates_ignored',coalesce(jsonb_array_length(coalesce(p_rows,'[]'::jsonb)),0)
      )
    );

    v_row:=jsonb_set(v_row,'{commercial_context}',v_ctx,true);
    v_row:=jsonb_set(v_row,'{due_date}',to_jsonb(v_month_end),true);
    v_row:=jsonb_set(v_row,'{generator_version}',to_jsonb('v23.6.250'::text),true);
    v_row:=jsonb_set(v_row,'{task_key}',to_jsonb(v_key),true);
    v_row:=jsonb_set(v_row,'{period_month}',to_jsonb(v_month_start),true);
    v_row:=v_row-'priority_label'-'ai_state'-'source'-'source_type';

    begin
      v_insert:=public.triovist_task_insert_adaptive_v227313(v_row,false);
    exception
      when unique_violation then
        get stacked diagnostics v_constraint=constraint_name;
        v_skipped:=v_skipped+1;
        continue;
    end;

    if coalesce((v_insert->>'inserted')::boolean,false) then
      v_task_id:=nullif(v_insert->>'task_id','');
      if v_task_id is null then raise exception 'v23.6.250 STOP: insert succeeded without task id'; end if;
      v_created:=v_created+1;
      v_created_ids:=v_created_ids||jsonb_build_array(v_task_id);
    end if;
  end loop;

  return jsonb_build_object(
    'version','v23.6.250',
    'manager_email',v_manager,
    'target_count',v_target,
    'month_end',v_month_end,
    'deleted_pending',v_deleted,
    'locked_group_tasks',v_locked,
    'needed_new_tasks',v_need,
    'created',v_created,
    'created_task_ids',v_created_ids,
    'received_candidates',jsonb_array_length(v_rows),
    'processed_candidates',v_processed,
    'skipped',v_skipped,
    'task_scope','group'
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.triovist_tasks_month_candidates_v236247(p_manager_email text, p_target_count integer DEFAULT 10)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_catalog'
AS $function$
declare
  v_actor public.users%rowtype;
  v_manager text:=lower(trim(coalesce(p_manager_email,'')));
  v_target int:=case when p_target_count in (8,10,12,15) then p_target_count else 10 end;
  v_target_month date:=date_trunc('month',current_date)::date;
  v_y1 date:=(date_trunc('month',current_date)-interval '1 year')::date;
  v_y2 date:=(date_trunc('month',current_date)-interval '2 years')::date;
  v_chekhov_date date;
  v_partner_date date;
  v_partner_fresh boolean:=false;
  v_manager_name text;
  v_manager_plan numeric:=0;
  v_manager_current_revenue numeric:=0;
  v_candidates jsonb:='[]'::jsonb;
  v_count int:=0;
  v_season_version text;
begin
  select * into v_actor from public.users where id=auth.uid();
  if v_actor.id is null then raise exception 'Требуется вход в CRM'; end if;
  if coalesce(v_actor.role,'')<>'boss'
     and lower(coalesce(v_actor.email,'')) not in ('payushin_ar@resanta.ru','sidarovich_kn@resanta.ru') then
    raise exception 'Недостаточно прав для формирования плана Triovist';
  end if;
  if v_manager not in ('aleksandrenko_av@resanta.ru','krishtal_na@resanta.ru') then
    raise exception 'Неизвестный менеджер Triovist';
  end if;

  select max(snapshot_date) into v_chekhov_date from public.triovist_chekhov_stock;
  if v_chekhov_date is null then
    raise exception 'Нет загруженного остатка Чехова. План ИИ не формируется без Чехова.';
  end if;

  select max(snapshot_date) into v_partner_date from public.triovist_partner_stock;
  v_partner_fresh:=v_partner_date is not null and (current_date-v_partner_date)<=10;

  select version into v_season_version
  from public.triovist_seasonality_profiles
  order by updated_at desc
  limit 1;

  select coalesce(max(manager_name),
    case when v_manager='aleksandrenko_av@resanta.ru' then 'Александренко' else 'Кришталь' end)
  into v_manager_name
  from public.triovist_group_assignments
  where active and lower(manager_email)=v_manager;

  select coalesce(max(plan_amount),0) into v_manager_plan
  from public.triovist_plans
  where lower(manager_email)=v_manager and period_month=v_target_month;

  select coalesce(sum(s.revenue),0) into v_manager_current_revenue
  from public.triovist_sales_resolved_cache s
  where s.month=v_target_month
    and trim(coalesce(s.sku,'')) !~* '^900(/|$)'
    and lower(trim(coalesce(s.assigned_group,''))) in (
      select lower(trim(group_name))
      from public.triovist_group_assignments
      where active and lower(manager_email)=v_manager
    );

  with
  groups as (
    select lower(trim(group_name)) group_norm,max(group_name) group_name
    from public.triovist_group_assignments
    where active and lower(manager_email)=v_manager
      and coalesce(group_name,'') !~* '(^|[^0-9])900([^0-9]|$)'
    group by lower(trim(group_name))
  ),
  season_profile as (
    select version,profile
    from public.triovist_seasonality_profiles
    order by updated_at desc
    limit 1
  ),
  season_factor as (
    select g.group_norm,g.group_name,
      coalesce((
        select nullif(e.value->'factors'->>(extract(month from v_target_month)::int-1),'')::numeric
        from season_profile sp
        cross join lateral jsonb_each(sp.profile->'levels'->'category') e
        where public.triovist_norm(e.key)=public.triovist_norm(g.group_name)
        limit 1
      ),1)::numeric factor
    from groups g
  ),
  hist_group as (
    select lower(trim(s.assigned_group)) group_norm,
      greatest(coalesce(sum(s.revenue) filter(where s.month=v_y1),0),0)::numeric rev_y1,
      greatest(coalesce(sum(s.revenue) filter(where s.month=v_y2),0),0)::numeric rev_y2,
      greatest(coalesce(sum(s.revenue) filter(where s.month=v_target_month),0),0)::numeric rev_current
    from public.triovist_sales_resolved_cache s
    join groups g on g.group_norm=lower(trim(coalesce(s.assigned_group,'')))
    where s.month in (v_y1,v_y2,v_target_month)
      and trim(coalesce(s.sku,'')) !~* '^900(/|$)'
    group by lower(trim(s.assigned_group))
  ),
  sku_hist as (
    select
      lower(trim(s.assigned_group)) group_norm,
      trim(s.sku) sku,
      max(s.product) product,
      max(s.subgroup) subgroup,
      greatest(coalesce(sum(s.revenue) filter(where s.month=v_y1),0),0)::numeric rev_y1,
      greatest(coalesce(sum(s.qty) filter(where s.month=v_y1),0),0)::numeric qty_y1,
      greatest(coalesce(sum(s.revenue) filter(where s.month=v_y2),0),0)::numeric rev_y2,
      greatest(coalesce(sum(s.qty) filter(where s.month=v_y2),0),0)::numeric qty_y2,
      greatest(coalesce(sum(s.revenue) filter(where s.month=v_target_month),0),0)::numeric rev_current,
      greatest(coalesce(sum(s.qty) filter(where s.month=v_target_month),0),0)::numeric qty_current
    from public.triovist_sales_resolved_cache s
    join groups g on g.group_norm=lower(trim(coalesce(s.assigned_group,'')))
    where s.month in (v_y1,v_y2,v_target_month)
      and nullif(trim(s.sku),'') is not null
      and trim(s.sku) !~* '^900(/|$)'
    group by lower(trim(s.assigned_group)),trim(s.sku)
  ),
  chekhov as (
    select trim(c.sku) sku,
           max(greatest(coalesce(c.qty_total,0),0))::numeric qty
    from public.triovist_chekhov_stock c
    where c.snapshot_date=v_chekhov_date
    group by trim(c.sku)
  ),
  partner as (
    select trim(p.sku) sku,
      max(
        case
          when p.match_note is not null and pg_input_is_valid(p.match_note,'jsonb')
               and (p.match_note::jsonb ? 'free_now')
            then greatest(coalesce(nullif(p.match_note::jsonb->>'free_now','')::numeric,0),0)
          else greatest(coalesce(p.qty_free,0),0)
        end
      )::numeric partner_total,
      max(
        case
          when p.match_note is not null and pg_input_is_valid(p.match_note,'jsonb')
            then greatest(coalesce(nullif(p.match_note::jsonb->>'in_transit','')::numeric,0),0)
          else 0
        end
      )::numeric partner_in_transit,
      max(greatest(coalesce(p.sales_m1,0),0))::numeric sales_m1,
      max(greatest(coalesce(p.sales_m2,0),0))::numeric sales_m2,
      max(greatest(coalesce(p.sales_m3,0),0))::numeric sales_m3,
      round((
        max(greatest(coalesce(p.sales_m1,0),0))*0.50+
        max(greatest(coalesce(p.sales_m2,0),0))*0.30+
        max(greatest(coalesce(p.sales_m3,0),0))*0.20
      )::numeric,2) velocity
    from public.triovist_partner_stock p
    where v_partner_fresh
      and p.snapshot_date=v_partner_date
      and coalesce(p.excluded,false)=false
    group by trim(p.sku)
  ),
  listing_latest as (
    select distinct on (trim(s.sku))
      trim(s.sku) sku,
      s.position listing_position,
      coalesce(s.top30,false) listing_top30,
      coalesce(s.top60,false) listing_top60,
      s.keyword listing_keyword,
      s.observed_at listing_observed_at
    from public.triovist_21vek_top_snapshots s
    where lower(s.manager_email)=v_manager
      and s.error_text is null
      and s.observed_at>=now()-interval '72 hours'
      and nullif(trim(s.sku),'') is not null
    order by trim(s.sku),s.observed_at desc
  ),
  listing_prev as (
    select distinct on (trim(h.sku))
      trim(h.sku) sku,
      h.position previous_listing_position,
      h.observed_at previous_listing_observed_at
    from public.triovist_21vek_top_snapshots h
    join listing_latest l on trim(l.sku)=trim(h.sku)
    where lower(h.manager_email)=v_manager
      and h.error_text is null
      and h.observed_at<=l.listing_observed_at-interval '3 days'
      and h.observed_at>=l.listing_observed_at-interval '14 days'
    order by trim(h.sku),
      abs(extract(epoch from (h.observed_at-(l.listing_observed_at-interval '7 days'))))
  ),
  item_base as (
    select
      sh.group_norm,sh.sku,sh.product,sh.subgroup,
      sh.rev_y1,sh.qty_y1,sh.rev_y2,sh.qty_y2,sh.rev_current,sh.qty_current,
      coalesce(ch.qty,0)::numeric chekhov_qty,
      case when v_partner_fresh then coalesce(pa.partner_total,0) else null end partner_total,
      case when v_partner_fresh then coalesce(pa.partner_in_transit,0) else null end partner_in_transit,
      case when v_partner_fresh then coalesce(pa.sales_m1,0) else null end partner_sales_m1,
      case when v_partner_fresh then coalesce(pa.sales_m2,0) else null end partner_sales_m2,
      case when v_partner_fresh then coalesce(pa.sales_m3,0) else null end partner_sales_m3,
      case when v_partner_fresh then coalesce(pa.velocity,0) else null end partner_velocity,
      case
        when not v_partner_fresh then 'unknown'
        when coalesce(pa.partner_total,0)<=0 then 'zero'
        when coalesce(pa.velocity,0)<=0 then 'overstock'
        when coalesce(pa.partner_total,0)/nullif(pa.velocity,0)>=3 then 'overstock'
        when coalesce(pa.partner_total,0)/nullif(pa.velocity,0)<0.75 then 'low'
        else 'balanced'
      end stock_strategy,
      case
        when not v_partner_fresh then null
        when coalesce(pa.partner_total,0)>0 and coalesce(pa.velocity,0)>0
          then round(coalesce(pa.partner_total,0)/nullif(pa.velocity,0),2)
        when coalesce(pa.partner_total,0)>0 then 99::numeric
        else 0::numeric
      end stock_cover_months,
      case
        when (sh.qty_y1+sh.qty_y2+sh.qty_current)>0
          then round((sh.rev_y1+sh.rev_y2+sh.rev_current)/nullif(sh.qty_y1+sh.qty_y2+sh.qty_current,0),2)
        else 0::numeric
      end reference_unit_revenue,
      case
        when not v_partner_fresh then null
        when coalesce(pa.partner_total,0)<=0 then 0::numeric
        when (sh.qty_y1+sh.qty_y2+sh.qty_current)>0
          then round(coalesce(pa.partner_total,0)*
            ((sh.rev_y1+sh.rev_y2+sh.rev_current)/nullif(sh.qty_y1+sh.qty_y2+sh.qty_current,0)),2)
        else 0::numeric
      end free_stock_revenue_capacity,
      case
        when not v_partner_fresh then true
        when coalesce(pa.partner_total,0)>0 then true
        else false
      end sales_priority_eligible,
      coalesce(sf.factor,1)::numeric season_factor,
      ll.listing_position,
      coalesce(ll.listing_top30,false) listing_top30,
      coalesce(ll.listing_top60,false) listing_top60,
      ll.listing_keyword,
      ll.listing_observed_at,
      lp.previous_listing_position,
      lp.previous_listing_observed_at,
      case
        when ll.sku is null then 0
        when coalesce(ll.listing_top60,false)=false then 3
        when lp.previous_listing_position is not null and ll.listing_position is not null
             and ll.listing_position-lp.previous_listing_position>=15 then 3
        when ll.listing_position is not null and ll.listing_position>30 then 2
        when lp.previous_listing_position is not null and ll.listing_position is not null
             and ll.listing_position-lp.previous_listing_position>=5 then 2
        else 0
      end::int listing_risk
    from sku_hist sh
    left join chekhov ch using(sku)
    left join partner pa using(sku)
    left join listing_latest ll using(sku)
    left join listing_prev lp using(sku)
    left join season_factor sf using(group_norm)
  ),
  group_rollup as (
    select
      g.group_norm,g.group_name,
      coalesce(h.rev_y1,0)::numeric rev_y1,
      coalesce(h.rev_y2,0)::numeric rev_y2,
      coalesce(h.rev_current,0)::numeric rev_current,
      greatest(coalesce(h.rev_y1,0),coalesce(h.rev_y2,0),0)::numeric target_revenue,
      coalesce(sf.factor,1)::numeric season_factor,
      coalesce(sum(ib.chekhov_qty),0)::numeric chekhov_group_total,
      count(*) filter(where ib.chekhov_qty>=200)::int chekhov_sku_ge_200,
      count(*) filter(where ib.listing_risk>0)::int listing_problem_count,
      count(*) filter(where ib.listing_risk>=3)::int listing_critical_count,
      count(*) filter(where ib.listing_risk>0 and ib.listing_position>30)::int listing_below_top30_count,
      count(*) filter(where ib.listing_risk>=3 and ib.listing_top60=false)::int listing_out_top60_count,
      count(*) filter(where ib.stock_strategy='overstock')::int overstock_sku_count,
      count(*) filter(where ib.stock_strategy='low')::int low_stock_sku_count,
      count(*) filter(where ib.stock_strategy='zero')::int zero_stock_sku_count,
      count(*) filter(where ib.stock_strategy='balanced')::int balanced_stock_sku_count,
      count(*) filter(where ib.sales_priority_eligible)::int sellable_sku_count,
      case when v_partner_fresh then sum(coalesce(ib.partner_total,0)) else null end partner_total_all,
      case when v_partner_fresh then sum(coalesce(ib.partner_in_transit,0)) else null end partner_in_transit_all,
      case when v_partner_fresh then sum(coalesce(ib.free_stock_revenue_capacity,0)) else null end free_stock_revenue_capacity_all,
      sum(coalesce(ib.partner_velocity,0))::numeric partner_velocity_all
    from groups g
    left join hist_group h using(group_norm)
    left join season_factor sf using(group_norm)
    left join item_base ib using(group_norm)
    group by g.group_norm,g.group_name,h.rev_y1,h.rev_y2,h.rev_current,sf.factor
  ),
  item_rank as (
    select ib.*,
      row_number() over(
        partition by ib.group_norm
        order by
          case
            when not v_partner_fresh then 3
            when ib.stock_strategy='overstock' then 5
            when ib.stock_strategy='balanced' then 4
            when ib.stock_strategy='low' then 2
            when ib.stock_strategy='zero' then 0
            else 1
          end desc,
          case when ib.sales_priority_eligible then 1 else 0 end desc,
          coalesce(ib.partner_total,0) desc,
          (
            greatest(ib.rev_y1,ib.rev_y2)*greatest(ib.season_factor,0.35)
            + least(ib.chekhov_qty,5000)*0.10
            + case when ib.listing_risk>=3 then 5000 when ib.listing_risk=2 then 2500 else 0 end
          ) desc,
          ib.chekhov_qty desc,
          ib.sku
      ) rn
    from item_base ib
  ),
  packed as (
    select
      gr.*,
      coalesce((
        select jsonb_agg(jsonb_build_object(
          'sku',x.sku,
          'product_name',x.product,
          'subgroup',x.subgroup,
          'priority_only',true,
          'mandatory_for_group_close',false,
          'sales_analog_last_year',round(x.rev_y1,2),
          'sales_analog_2024',round(x.rev_y2,2),
          'current_revenue',round(x.rev_current,2),
          'chekhov_qty',round(x.chekhov_qty,2),
          'partner_stock_available',v_partner_fresh,
          'partner_total',x.partner_total,
          'partner_stock_source','Excel column 10 Свободно',
          'partner_in_transit',x.partner_in_transit,
          'partner_in_transit_counts_as_available',false,
          'partner_sales_m1',x.partner_sales_m1,
          'partner_sales_m2',x.partner_sales_m2,
          'partner_sales_m3',x.partner_sales_m3,
          'partner_sales_velocity',x.partner_velocity,
          'stock_strategy',x.stock_strategy,
          'stock_cover_months',x.stock_cover_months,
          'reference_unit_revenue',x.reference_unit_revenue,
          'free_stock_revenue_capacity',x.free_stock_revenue_capacity,
          'sales_priority_eligible',x.sales_priority_eligible,
          'stock_used_in_priority',true,
          'listing_position',x.listing_position,
          'previous_listing_position',x.previous_listing_position,
          'listing_risk',x.listing_risk,
          'listing_target',
            case
              when x.listing_risk>=3 and x.listing_top60=false then 'Вернуть минимум в TOP-60'
              when x.listing_position between 31 and 60 then 'Поднять в TOP-30'
              when x.listing_risk>=3 and x.previous_listing_position is not null then 'Вернуть не хуже предыдущей позиции'
              when x.listing_risk=2 and x.previous_listing_position is not null and x.listing_position<=30 then 'Вернуть не хуже предыдущей позиции'
              else null
            end,
          'availability_note',
            case
              when not v_partner_fresh then 'Остаток 21vek неизвестен: файл старше 10 дней или отсутствует'
              when x.stock_strategy='zero' then 'Нет свободного остатка 21vek: SKU не является активным приоритетом продаж'
              when x.stock_strategy='low' then 'Низкий свободный остаток 21vek: SKU учитывается с пониженным приоритетом'
              when x.stock_strategy='overstock' then 'Высокий свободный остаток 21vek: SKU получает повышенный приоритет sell-out, но задача не равна продаже всего остатка'
              else 'Свободный остаток 21vek сбалансирован: SKU доступен для приоритета продаж'
            end
        ) order by x.rn)
        from item_rank x
        where x.group_norm=gr.group_norm and x.rn<=12
      ),'[]'::jsonb) items,
      coalesce((
        select x.sku from item_rank x
        where x.group_norm=gr.group_norm
        order by case when x.sales_priority_eligible then 0 else 1 end,x.rn
        limit 1
      ),'') representative_sku,
      coalesce((
        select x.product from item_rank x
        where x.group_norm=gr.group_norm
        order by case when x.sales_priority_eligible then 0 else 1 end,x.rn
        limit 1
      ),gr.group_name) representative_product
    from group_rollup gr
    where gr.chekhov_group_total>=200
      and gr.target_revenue>0
      and gr.rev_current<gr.target_revenue
      and (not v_partner_fresh or gr.sellable_sku_count>0)
  ),
  ranked as (
    select p.*,
      row_number() over(
        order by
          (p.target_revenue*greatest(p.season_factor,0.35)
           + case when p.listing_critical_count>0 then 25000 when p.listing_problem_count>0 then 10000 else 0 end
          ) desc,
          p.chekhov_group_total desc,
          p.group_name
      ) rnk
    from packed p
  ),
  final_rows as (
    select
      r.*,
      least(98,
        45
        + case when r.season_factor>=1.5 then 20 when r.season_factor>=1 then 15 when r.season_factor>=0.75 then 10 else 5 end
        + case when r.target_revenue>=100000 then 18 when r.target_revenue>=50000 then 14 when r.target_revenue>=10000 then 10 else 6 end
        + case when r.listing_critical_count>0 then 10 when r.listing_problem_count>0 then 6 else 0 end
        + case when r.chekhov_group_total>=10000 then 5 when r.chekhov_group_total>=1000 then 3 else 1 end
      )::int priority_score
    from ranked r
    where r.rnk<=greatest(v_target+5,15)
  )
  select
    coalesce(jsonb_agg(
      jsonb_build_object(
        'manager_email',v_manager,
        'manager_name',v_manager_name,
        'sku',representative_sku,
        'product_name',representative_product,
        'group_name',group_name,
        'task_type','sales_group',
        'title',to_char(v_target_month,'MM.YYYY')||' · '||group_name||' · цель группы',
        'task_text',
          'Отработать группу «'||group_name||'» на '||to_char(v_target_month,'MM.YYYY')||'. '||
          'Продажи аналогичного месяца '||extract(year from v_y1)::int||': '||to_char(rev_y1,'FM999G999G999G990D00')||' BYN; '||
          extract(year from v_y2)::int||': '||to_char(rev_y2,'FM999G999G999G990D00')||' BYN. '||
          'Текущий факт: '||to_char(rev_current,'FM999G999G999G990D00')||' BYN. '||
          'Остаток Чехова по группе: '||to_char(chekhov_group_total,'FM999G999G990D00')||' шт.; порог 200 шт. пройден. '||
          'Сезонный коэффициент: '||to_char(season_factor,'FM990D00')||'. '||
          case when v_partner_fresh
            then 'Остаток 21vek свежий: для выполнимости SKU используется только колонка 10 «Свободно». «В пути» показывается отдельно и не увеличивает доступный остаток. '
            else 'Свежий остаток 21vek отсутствует: он считается неизвестным, а не нулём. '
          end||
          case when v_partner_fresh
            then 'По выбранным SKU сейчас свободно на 21vek: '||to_char(coalesce(partner_total_all,0),'FM999G999G990D00')||
                 ' шт.; в пути отдельно: '||to_char(coalesce(partner_in_transit_all,0),'FM999G999G990D00')||
                 ' шт.; SKU с доступным остатком: '||sellable_sku_count||'. '
            else ''
          end||
          'SKU внутри задачи — приоритеты для работы, но не отдельные обязательные мини-задачи. '||
          'Задача закрывается по общей сумме продаж группы, даже если отдельный приоритетный SKU невозможно выполнить из-за наличия.',
        'basis',
          to_char(v_y1,'MM.YYYY')||': '||to_char(rev_y1,'FM999G999G999G990D00')||' BYN; '||
          to_char(v_y2,'MM.YYYY')||': '||to_char(rev_y2,'FM999G999G999G990D00')||' BYN; '||
          'Чехов: '||to_char(chekhov_group_total,'FM999G999G990D00')||' шт.; сезонность: x'||to_char(season_factor,'FM990D00'),
        'expected_result',
          'Получить по всей группе не менее '||to_char(target_revenue,'FM999G999G999G990D00')||
          ' BYN до конца месяца. Закрытие идёт по общей сумме группы; выполнение каждого SKU отдельно не требуется.',
        'criteria',
          'Факт всей группы ≥ '||to_char(target_revenue,'FM999G999G999G990D00')||
          ' BYN. SKU — только приоритет. Остаток 21vek ограничивает выполнимость SKU, но не меняет правило закрытия группы. '||
          'Листинг: вне TOP-60 → TOP-60; 31–60 → TOP-30; сильное падение внутри TOP-30 → предыдущая позиция.',
        'next_step','Контролировать факт группы, приоритетные SKU, наличие 21vek и листинг минимум еженедельно.',
        'reason_code',case when listing_critical_count>0 then 'group_history_listing_critical' else 'group_history_seasonal' end,
        'candidate_key','v236250|'||v_manager||'|'||to_char(v_target_month,'YYYY-MM')||'|'||md5(group_norm),
        'generator_version','v23.6.250',
        'baseline_revenue',round(rev_current,2),
        'target_revenue',round(target_revenue,2),
        'base_priority',priority_score,
        'priority_score',priority_score,
        'commercial_context',
          jsonb_build_object(
            'task_scope','group',
            'group_name',group_name,
            'selected_sku_count',jsonb_array_length(items),
            'priority_sku_not_mandatory',true,
            'group_close_by_total_revenue',true,
            'analog_month_last_year',to_char(v_y1,'YYYY-MM'),
            'analog_month_2024',to_char(v_y2,'YYYY-MM'),
            'analog_sales_last_year',round(rev_y1,2),
            'analog_sales_2024',round(rev_y2,2),
            'current_revenue',round(rev_current,2),
            'target_revenue',round(target_revenue,2),
            'target_source','max_of_analog_month_last_year_and_2024',
            'chekhov_snapshot_date',v_chekhov_date,
            'chekhov_group_total',round(chekhov_group_total,2),
            'chekhov_threshold',200,
            'chekhov_gate_passed',chekhov_group_total>=200,
            'seasonality_profile_version',v_season_version,
            'seasonality_factor',round(season_factor,4),
            'partner_stock_available',v_partner_fresh,
            'partner_snapshot_date',v_partner_date,
            'partner_fresh_days',10,
            'partner_stock_source','Excel column 10 Свободно',
            'partner_in_transit_counts_as_available',false,
            'partner_total',partner_total_all,
            'partner_in_transit',partner_in_transit_all,
            'sellable_sku_count',sellable_sku_count,
            'free_stock_revenue_capacity',free_stock_revenue_capacity_all,
            'stock_affects_sku_priority',true,
            'zero_stock_not_sales_priority',true,
            'partner_sales_velocity',round(coalesce(partner_velocity_all,0),2),
            'partner_velocity_weights',jsonb_build_array(0.50,0.30,0.20),
            'overstock_sku_count',overstock_sku_count,
            'low_stock_sku_count',low_stock_sku_count,
            'zero_stock_sku_count',zero_stock_sku_count,
            'balanced_stock_sku_count',balanced_stock_sku_count,
            'listing_fresh_hours',72,
            'listing_problem_count',listing_problem_count,
            'listing_critical_count',listing_critical_count,
            'listing_out_top60_count',listing_out_top60_count,
            'listing_below_top30_count',listing_below_top30_count,
            'plan_items',items,
            'logic_version','v23.6.250'
          )
      )
      order by rnk
    ),'[]'::jsonb),
    count(*)::int
  into v_candidates,v_count
  from final_rows;

  return jsonb_build_object(
    'ok',true,
    'version','v23.6.250',
    'mode','group_history_chekhov_seasonality',
    'task_scope','group',
    'target_month',to_char(v_target_month,'YYYY-MM'),
    'analog_month_last_year',to_char(v_y1,'YYYY-MM'),
    'analog_month_2024',to_char(v_y2,'YYYY-MM'),
    'chekhov_snapshot_date',v_chekhov_date,
    'chekhov_threshold',200,
    'partner_snapshot_date',v_partner_date,
    'partner_stock_available',v_partner_fresh,
    'partner_fresh_days',10,
    'listing_fresh_hours',72,
    'manager_email',v_manager,
    'manager_plan_amount',v_manager_plan,
    'manager_current_revenue',v_manager_current_revenue,
    'candidate_count',v_count,
    'candidates',v_candidates,
    'warning',case when v_partner_fresh then null else 'Остаток 21vek старше 10 дней или отсутствует: считается неизвестным, не нулём.' end
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.triovist_tasks_reconcile_sales_v23651(p_month date, p_finalize boolean DEFAULT false, p_manager_email text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_month date:=date_trunc('month',p_month)::date;
  t record;
  v_actual numeric;
  v_base numeric;
  v_target numeric;
  v_ratio numeric;
  v_old text;
  v_new text;
  v_done integer:=0;
  v_verified integer:=0;
  v_partial integer:=0;
  v_failed integer:=0;
  v_filter text:=lower(trim(coalesce(p_manager_email,'')));
  v_group_scope boolean;
begin
  for t in
    select *
    from public.triovist_ai_tasks
    where period_month=v_month
      and (
        coalesce(candidate_key,'') like 'v227319|%'
        or coalesce(candidate_key,'') like 'v236247|%'
        or coalesce(candidate_key,'') like 'v236249|%'
        or coalesce(candidate_key,'') like 'v236250|%'
      )
      and status not in ('cancelled','not_relevant')
      and (v_filter='' or lower(manager_email)=v_filter)
    order by manager_email,created_at
  loop
    v_group_scope:=coalesce(t.commercial_context->>'task_scope','')='group'
      or coalesce(t.candidate_key,'') like 'v236247|%'
      or coalesce(t.candidate_key,'') like 'v236249|%'
      or coalesce(t.candidate_key,'') like 'v236250|%';

    v_base:=coalesce(t.baseline_revenue,
      public.triovist_parse_money_v23651(t.basis,'сейчас\s+([0-9 ]+(?:,[0-9]+)?)\s+BYN'),0);
    v_target:=coalesce(t.target_revenue,
      public.triovist_parse_money_v23651(
        coalesce(t.criteria,'')||' '||coalesce(t.expected_result,''),
        '(?:≥|минимум до)\s*([0-9 ]+(?:,[0-9]+)?)\s*BYN'
      )
    );

    v_actual:=public.triovist_task_result_revenue_v23651(t.id,v_month);

    if v_target is null then
      v_ratio:=null;
    elsif v_target>v_base then
      v_ratio:=round(greatest(0,least(100,(v_actual-v_base)/(v_target-v_base)*100)),2);
    elsif v_actual>=v_target then
      v_ratio:=100;
    else
      v_ratio:=0;
    end if;

    v_old:=t.status;
    v_new:=t.status;

    if v_target is not null and v_actual>=v_target then
      v_new:='verified';
    elsif (p_finalize or v_month<date_trunc('month',current_date)::date or current_date>t.due_date) then
      if v_target is not null and coalesce(v_ratio,0)>=50 then v_new:='partial';
      else v_new:='not_achieved';
      end if;
    end if;

    update public.triovist_ai_tasks
    set baseline_revenue=coalesce(baseline_revenue,v_base),
        target_revenue=coalesce(target_revenue,v_target),
        result_revenue=v_actual,
        result_ratio=v_ratio,
        result_checked_at=now(),
        result_source=case when v_group_scope
          then 'Продажи всей группы Triovist за '||to_char(v_month,'YYYY-MM')
          else 'Продажи 21vek за '||to_char(v_month,'YYYY-MM')
        end,
        status=v_new,
        result_summary=case
          when v_target is null then 'Автопроверка продаж: денежная цель не распознана.'
          when v_group_scope then
            'Автопроверка всей группы: факт '||to_char(v_actual,'FM999G999G999G990D00')||
            ' BYN · старт '||to_char(v_base,'FM999G999G999G990D00')||
            ' · цель '||to_char(v_target,'FM999G999G999G990D00')||
            ' · прогресс '||coalesce(to_char(v_ratio,'FM990D00'),'—')||
            '%. SKU внутри задачи — приоритеты; отдельный SKU не блокирует закрытие группы.'
          else
            'Автопроверка продаж 21vek: факт '||to_char(v_actual,'FM999G999G999G990D00')||
            ' BYN · старт '||to_char(v_base,'FM999G999G999G990D00')||
            ' · цель '||to_char(v_target,'FM999G999G999G990D00')||
            ' · прогресс '||coalesce(to_char(v_ratio,'FM990D00'),'—')||'%.'
        end,
        verified_at=case when v_new='verified' then coalesce(verified_at,now()) else verified_at end,
        closed_at=case
          when v_new in ('verified','not_achieved')
            or (v_new='partial' and (p_finalize or v_month<date_trunc('month',current_date)::date))
          then coalesce(closed_at,now()) else closed_at
        end,
        updated_at=now()
    where id=t.id;

    if v_new<>v_old then
      insert into public.triovist_ai_task_events(
        task_id,event_type,old_status,new_status,comment,payload,actor_email,actor_name
      )
      values(
        t.id,'sales_auto_reconcile_v236250',v_old,v_new,
        case when v_group_scope
          then 'Автопроверка по общей сумме группы; приоритетные SKU не являются отдельным условием закрытия'
          else 'Автопроверка по фактическим продажам'
        end,
        jsonb_build_object(
          'month',v_month,'baseline',v_base,'target',v_target,'actual',v_actual,
          'progress',v_ratio,'finalize',p_finalize,'task_scope',
          case when v_group_scope then 'group' else 'legacy' end
        ),
        'system','CRM'
      );
    end if;

    v_done:=v_done+1;
    if v_new='verified' then v_verified:=v_verified+1;
    elsif v_new='partial' then v_partial:=v_partial+1;
    elsif v_new='not_achieved' then v_failed:=v_failed+1;
    end if;
  end loop;

  return jsonb_build_object(
    'month',v_month,'checked',v_done,'verified',v_verified,'partial',v_partial,
    'not_achieved',v_failed,'finalized',p_finalize,'logic_version','v23.6.250'
  );
end;
$function$;


revoke all on function public.triovist_tasks_month_candidates_v236247(text,integer) from public,anon;
grant execute on function public.triovist_tasks_month_candidates_v236247(text,integer) to authenticated;

revoke all on function public.triovist_tasks_generate_group_v236247(text,integer,date,jsonb,jsonb) from public,anon;
grant execute on function public.triovist_tasks_generate_group_v236247(text,integer,date,jsonb,jsonb) to authenticated;

revoke all on function public.triovist_ai_logic_private_v236245() from public,anon;
grant execute on function public.triovist_ai_logic_private_v236245() to authenticated;
