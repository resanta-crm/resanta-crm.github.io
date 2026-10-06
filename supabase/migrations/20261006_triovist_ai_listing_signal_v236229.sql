-- RESANTA CRM v23.6.229
-- Triovist AI monthly candidates now use fresh own-parser listing signals.
-- Fresh = successful TOP snapshot not older than 72 hours.
-- Signals raise priority when SKU is outside TOP-60, below TOP-30,
-- or has fallen materially versus a historical snapshot ~7 days earlier.

create index if not exists triovist_21vek_top_snapshots_manager_sku_observed_idx_v236229
  on public.triovist_21vek_top_snapshots(lower(manager_email),trim(sku),observed_at desc)
  where error_text is null;

CREATE OR REPLACE FUNCTION public.triovist_tasks_month_candidates_v236210(p_manager_email text, p_target_count integer DEFAULT 10)
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
  v_season_month date:=(date_trunc('month',current_date)-interval '1 year')::date;
  v_recent_month date;
  v_recent_prev_month date;
  v_own_date date;
  v_partner_date date;
  v_partner_fresh boolean:=false;
  v_current_exists boolean:=false;
  v_manager_name text;
  v_candidates jsonb:='[]'::jsonb;
  v_count int:=0;
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

  select max(month) into v_recent_month
  from public.triovist_sales_resolved_cache
  where month < v_target_month;
  if v_recent_month is null then raise exception 'Нет закрытого периода продаж Triovist'; end if;
  v_recent_prev_month:=(v_recent_month-interval '1 year')::date;

  select exists(
    select 1 from public.triovist_sales_resolved_cache where month=v_target_month
  ) into v_current_exists;

  select max(report_date) into v_own_date
  from public.stock_balances
  where lower(trim(warehouse))='витебск';
  if v_own_date is null then raise exception 'Нет остатка Витебска'; end if;

  select max(snapshot_date) into v_partner_date from public.triovist_partner_stock;
  v_partner_fresh := v_partner_date is not null and (current_date-v_partner_date)<=10;

  select coalesce(max(manager_name),
    case when v_manager='aleksandrenko_av@resanta.ru' then 'Александренко' else 'Кришталь' end)
  into v_manager_name
  from public.triovist_group_assignments
  where active and lower(manager_email)=v_manager;

  with
  groups as (
    select lower(trim(group_name)) group_norm,max(group_name) group_name
    from public.triovist_group_assignments
    where active and lower(manager_email)=v_manager
    group by lower(trim(group_name))
  ),
  season as (
    select trim(sku) sku,max(product) product,max(subgroup) subgroup,max(assigned_group) assigned_group,
           sum(revenue)::numeric season_rev,sum(qty)::numeric season_qty
    from public.triovist_sales_resolved_cache
    where month=v_season_month and trim(coalesce(sku,''))<>''
    group by trim(sku)
  ),
  current_m as (
    select trim(sku) sku,max(product) product,max(subgroup) subgroup,max(assigned_group) assigned_group,
           sum(revenue)::numeric current_rev,sum(qty)::numeric current_qty
    from public.triovist_sales_resolved_cache
    where month=v_target_month and trim(coalesce(sku,''))<>''
    group by trim(sku)
  ),
  recent as (
    select trim(sku) sku,max(product) product,max(subgroup) subgroup,max(assigned_group) assigned_group,
           sum(revenue)::numeric recent_rev,sum(qty)::numeric recent_qty
    from public.triovist_sales_resolved_cache
    where month=v_recent_month and trim(coalesce(sku,''))<>''
    group by trim(sku)
  ),
  recent_prev as (
    select trim(sku) sku,sum(revenue)::numeric recent_prev_rev,sum(qty)::numeric recent_prev_qty
    from public.triovist_sales_resolved_cache
    where month=v_recent_prev_month and trim(coalesce(sku,''))<>''
    group by trim(sku)
  ),
  keys as (
    select sku from season union select sku from current_m union select sku from recent
  ),
  own as (
    select trim(sku) sku,max(product) product,max(greatest(coalesce(qty_avail,0),0))::numeric own_qty
    from public.stock_balances
    where lower(trim(warehouse))='витебск' and report_date=v_own_date
    group by trim(sku)
  ),
  partner as (
    select trim(sku) sku,
           max(greatest(coalesce(qty_total,0),0)+greatest(coalesce(qty_transit_reserve,0),0))::numeric partner_total
    from public.triovist_partner_stock
    where v_partner_fresh and snapshot_date=v_partner_date and coalesce(excluded,false)=false
    group by trim(sku)
  ),
  latest_content as (
    select id as import_id,snapshot_date,completed_at
    from public.triovist_content_imports
    where lower(manager_email)=v_manager and coalesce(is_current,false)=true
    order by completed_at desc nulls last, created_at desc
    limit 1
  ),
  listing_latest as (
    select distinct on (trim(s.sku))
           trim(s.sku) sku,
           s.position listing_position,
           coalesce(s.top30,false) listing_top30,
           coalesce(s.top60,false) listing_top60,
           coalesce(s.position_exact,false) position_exact,
           s.keyword listing_keyword,
           s.observed_at listing_observed_at
    from public.triovist_21vek_top_snapshots s
    where lower(s.manager_email)=v_manager
      and s.error_text is null
      and s.observed_at >= now()-interval '72 hours'
      and nullif(trim(s.sku),'') is not null
    order by trim(s.sku),s.observed_at desc
  ),
  listing_prev as (
    select distinct on (trim(h.sku))
           trim(h.sku) sku,
           h.position previous_listing_position,
           coalesce(h.top60,false) previous_top60,
           h.observed_at previous_listing_observed_at
    from public.triovist_21vek_top_snapshots h
    join listing_latest l on trim(l.sku)=trim(h.sku)
    where lower(h.manager_email)=v_manager
      and h.error_text is null
      and h.observed_at <= l.listing_observed_at-interval '3 days'
      and h.observed_at >= l.listing_observed_at-interval '14 days'
    order by trim(h.sku),
             abs(extract(epoch from (h.observed_at-(l.listing_observed_at-interval '7 days'))))
  ),
  content as (
    select trim(c.sku) sku,
           count(*) filter(where i.status='open' and coalesce(i.missing_from_latest,false)=false)::int issue_count,
           max(i.issue_title) filter(where i.status='open' and coalesce(i.missing_from_latest,false)=false) issue_title,
           max(ll.listing_position) listing_position,
           bool_or(coalesce(ll.listing_top30,false)) listing_top30,
           bool_or(coalesce(ll.listing_top60,false)) listing_top60,
           bool_or(ll.sku is not null) listing_fresh,
           max(ll.listing_keyword) listing_keyword,
           max(ll.listing_observed_at) listing_observed_at,
           max(lp.previous_listing_position) previous_listing_position,
           bool_or(coalesce(lp.previous_top60,false)) previous_top60,
           max(lp.previous_listing_observed_at) previous_listing_observed_at
    from public.triovist_content_cards c
    join latest_content li on li.import_id=c.import_id
    left join public.triovist_content_issues i
      on i.card_key=c.card_key and lower(i.manager_email)=lower(c.manager_email)
    left join listing_latest ll on ll.sku=trim(c.sku)
    left join listing_prev lp on lp.sku=trim(c.sku)
    where lower(c.manager_email)=v_manager
    group by trim(c.sku)
  ),
  novelty as (
    select trim(sku) sku,max(first_positive_date) first_positive_date
    from public.triovist_first_positive_stock
    where coalesce(is_legacy,false)=false
      and first_positive_date >= (v_target_month-interval '60 days')::date
    group by trim(sku)
  ),
  base as (
    select
      k.sku,
      coalesce(s.product,cm.product,r.product,o.product,'') product,
      coalesce(nullif(s.subgroup,''),nullif(cm.subgroup,''),nullif(r.subgroup,''),'Без подгруппы') subgroup,
      coalesce(nullif(s.assigned_group,''),nullif(cm.assigned_group,''),nullif(r.assigned_group,''),'') assigned_group,
      coalesce(s.season_rev,0)::numeric season_rev,
      coalesce(s.season_qty,0)::numeric season_qty,
      coalesce(cm.current_rev,0)::numeric current_rev,
      coalesce(cm.current_qty,0)::numeric current_qty,
      coalesce(r.recent_rev,0)::numeric recent_rev,
      coalesce(r.recent_qty,0)::numeric recent_qty,
      coalesce(rp.recent_prev_rev,0)::numeric recent_prev_rev,
      coalesce(rp.recent_prev_qty,0)::numeric recent_prev_qty,
      coalesce(o.own_qty,0)::numeric own_qty,
      case when v_partner_fresh then coalesce(p.partner_total,0) else null end partner_total,
      coalesce(ct.issue_count,0)::int issue_count,
      ct.issue_title,
      coalesce(ct.listing_fresh,false) listing_fresh,
      ct.listing_position,
      coalesce(ct.listing_top30,false) listing_top30,
      coalesce(ct.listing_top60,false) listing_top60,
      ct.listing_keyword,
      ct.listing_observed_at,
      ct.previous_listing_position,
      coalesce(ct.previous_top60,false) previous_top60,
      ct.previous_listing_observed_at,
      case
        when coalesce(ct.listing_fresh,false)=false then 0
        when coalesce(ct.listing_top60,false)=false then 3
        when ct.previous_listing_position is not null and ct.listing_position is not null
             and ct.listing_position-ct.previous_listing_position>=15 then 3
        when ct.listing_position is not null and ct.listing_position>30 then 2
        when ct.previous_listing_position is not null and ct.listing_position is not null
             and ct.listing_position-ct.previous_listing_position>=5 then 2
        else 0
      end::int listing_risk,
      case
        when coalesce(ct.listing_fresh,false)=false then null
        when ct.listing_position is null then null
        when ct.previous_listing_position is null then null
        else (ct.listing_position-ct.previous_listing_position)::numeric
      end listing_delta,
      n.first_positive_date,
      greatest(coalesce(rp.recent_prev_rev,0)-coalesce(r.recent_rev,0),0)::numeric recent_loss,
      (
        coalesce(s.season_rev,0)
        + coalesce(r.recent_rev,0)*0.35
        + greatest(coalesce(rp.recent_prev_rev,0)-coalesce(r.recent_rev,0),0)*0.80
        + case when coalesce(ct.issue_count,0)>0 then 500 else 0 end
        + case when v_partner_fresh and coalesce(p.partner_total,0)<=0 and coalesce(o.own_qty,0)>0 then 700 else 0 end
        + case when n.first_positive_date is not null then 400 else 0 end
        + case
            when coalesce(ct.listing_fresh,false)=false then 0
            when coalesce(ct.listing_top60,false)=false then 1200
            when ct.previous_listing_position is not null and ct.listing_position is not null
                 and ct.listing_position-ct.previous_listing_position>=15 then 900
            when ct.listing_position is not null and ct.listing_position>30 then 700
            when ct.previous_listing_position is not null and ct.listing_position is not null
                 and ct.listing_position-ct.previous_listing_position>=5 then 450
            else 0
          end
      )::numeric commercial_score
    from keys k
    left join season s using(sku)
    left join current_m cm using(sku)
    left join recent r using(sku)
    left join recent_prev rp using(sku)
    left join own o using(sku)
    left join partner p using(sku)
    left join content ct using(sku)
    left join novelty n using(sku)
    join groups g on g.group_norm=lower(trim(coalesce(s.assigned_group,cm.assigned_group,r.assigned_group,'')))
    where k.sku !~* '^900(/|$)'
  ),
  usable as (
    select *,
      case
        when listing_risk>=3 then 'listing_critical'
        when listing_risk=2 then 'listing_weak'
        when season_rev>0 then 'seasonal_demand'
        when recent_loss>0 then 'recent_fall'
        when issue_count>0 then 'content_issue'
        when v_partner_fresh and coalesce(partner_total,0)<=0 and own_qty>0 then 'no_stock_21vek'
        when first_positive_date is not null then 'novelty'
        else 'recent_sales'
      end reason_code,
      case
        when listing_risk>=3 and listing_top60=false then 'Вылетел из TOP-60 21vek'
        when listing_risk>=3 then 'Сильное падение позиции 21vek'
        when listing_risk=2 and listing_position>30 then 'Слабый листинг 21vek: позиция ниже TOP-30'
        when listing_risk=2 then 'Падение позиции 21vek'
        when season_rev>0 then 'Сезонный потенциал: продажи в этом месяце прошлого года'
        when recent_loss>0 then 'Падение в последнем закрытом месяце'
        when issue_count>0 then 'Проблема карточки товара'
        when v_partner_fresh and coalesce(partner_total,0)<=0 and own_qty>0 then 'Нет подтверждённого остатка 21vek при наличии в Витебске'
        when first_positive_date is not null then 'Новинка'
        else 'Сильные продажи последнего закрытого месяца'
      end reason_label
    from base
    where (own_qty>0 or (v_partner_fresh and coalesce(partner_total,0)>0))
      and (season_rev>0 or recent_rev>0 or recent_loss>0 or issue_count>0 or first_positive_date is not null or listing_risk>0)
  ),
  grp as (
    select
      subgroup,
      max(assigned_group) parent_group,
      sum(season_rev)::numeric seasonal_revenue,
      sum(current_rev)::numeric target_current_revenue,
      sum(recent_rev)::numeric recent_revenue,
      sum(recent_prev_rev)::numeric recent_prev_revenue,
      sum(recent_loss)::numeric recent_loss,
      sum(own_qty)::numeric own_qty_all,
      case when v_partner_fresh then sum(coalesce(partner_total,0)) else null end partner_total_all,
      sum(issue_count)::int content_issue_count,
      count(*) filter(where first_positive_date is not null)::int novelty_count,
      count(*) filter(where listing_fresh and listing_risk>0)::int listing_problem_count,
      count(*) filter(where listing_fresh and listing_risk>=3)::int listing_critical_count,
      count(*) filter(where listing_fresh and listing_top60=false)::int listing_out_top60_count,
      count(*) filter(where listing_fresh and listing_position>30)::int listing_below_top30_count,
      sum(commercial_score)::numeric commercial_value
    from usable
    group by subgroup
  ),
  ri as (
    select u.*,
      row_number() over(partition by subgroup order by commercial_score desc,season_rev desc,recent_rev desc,own_qty desc,sku) rn
    from usable u
  ),
  pack as (
    select g.*,
      coalesce((
        select jsonb_agg(jsonb_build_object(
          'sku',x.sku,
          'product_name',x.product,
          'reason_code',x.reason_code,
          'reason_label',x.reason_label,
          'seasonal_revenue',x.season_rev,
          'seasonal_qty',x.season_qty,
          'current_revenue',x.current_rev,
          'current_qty',x.current_qty,
          'recent_revenue',x.recent_rev,
          'recent_previous_revenue',x.recent_prev_rev,
          'loss',x.recent_loss,
          'own_qty',x.own_qty,
          'partner_total',x.partner_total,
          'partner_stock_available',v_partner_fresh,
          'content_issue_count',x.issue_count,
          'content_issue_title',x.issue_title,
          'listing_fresh',x.listing_fresh,
          'listing_position',x.listing_position,
          'listing_top30',x.listing_top30,
          'listing_top60',x.listing_top60,
          'listing_keyword',x.listing_keyword,
          'listing_observed_at',x.listing_observed_at,
          'previous_listing_position',x.previous_listing_position,
          'previous_listing_observed_at',x.previous_listing_observed_at,
          'listing_delta',x.listing_delta,
          'listing_risk',x.listing_risk,
          'novelty_date',x.first_positive_date,
          'target_revenue',round(greatest(x.season_rev*0.25,x.recent_loss*0.35,x.recent_rev*0.15,100::numeric),2),
          'current_value',
            'Октябрь 2025: '||to_char(x.season_rev,'FM999999990D00')||
            ' BYN · '||to_char(v_recent_month,'MM.YYYY')||': '||to_char(x.recent_rev,'FM999999990D00')||
            ' BYN · 21vek: '||case when v_partner_fresh then to_char(coalesce(x.partner_total,0),'FM999999990D00') else 'нет данных' end||
            ' · Витебск: '||to_char(x.own_qty,'FM999999990D00')||
            case when x.listing_fresh then
              ' · листинг: '||
              case when x.listing_top60=false then 'вне TOP-60'
                   else coalesce('#'||x.listing_position::text,'проверен') end||
              case when x.listing_delta is not null and x.listing_delta>0 then ' (падение +'||x.listing_delta::text||')'
                   when x.listing_delta is not null and x.listing_delta<0 then ' (рост '||x.listing_delta::text||')'
                   else '' end
            else ' · листинг: нет свежей проверки' end,
          'target_value',
            'Вернуть/развить не менее '||
            to_char(round(greatest(x.season_rev*0.25,x.recent_loss*0.35,x.recent_rev*0.15,100::numeric),2),'FM999999990D00')||' BYN'
        ) order by x.rn)
        from ri x where x.subgroup=g.subgroup and x.rn<=12
      ),'[]'::jsonb) items,
      coalesce((select count(*) from ri x where x.subgroup=g.subgroup and x.rn<=12),0)::int selected_sku_count,
      coalesce((select sum(x.own_qty) from ri x where x.subgroup=g.subgroup and x.rn<=12),0)::numeric selected_own_qty
    from grp g
  ),
  eligible as (
    select *,
      round(greatest(seasonal_revenue*0.25,recent_loss*0.35,recent_revenue*0.15,300::numeric),2) target_revenue,
      least(98,
        45
        + least(25,round(seasonal_revenue/2000)::int)
        + least(15,round(recent_revenue/3000)::int)
        + least(10,content_issue_count*2)
        + least(15,listing_critical_count*5)
        + least(8,greatest(listing_problem_count-listing_critical_count,0)*2)
        + case when v_partner_fresh and coalesce(partner_total_all,0)<=0 and own_qty_all>0 then 5 else 0 end
      )::int priority_score
    from pack
    where selected_sku_count>0 and commercial_value>0
  ),
  ranked as (
    select *,row_number() over(order by priority_score desc,commercial_value desc,seasonal_revenue desc,subgroup) rnk
    from eligible
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'candidate_key','v227319|v236210|'||v_manager||'|'||to_char(v_target_month,'YYYY-MM')||'|'||md5(subgroup),
      'generator_version','v23.6.229',
      'reason_code','seasonal_month_plan',
      'manager_email',v_manager,
      'manager_name',v_manager_name,
      'group_name',subgroup,
      'sku',items->0->>'sku',
      'product_name',items->0->>'product_name',
      'task_type','listing',
      'priority_score',priority_score,
      'base_priority',priority_score,
      'title','Октябрьский потенциал · '||subgroup,
      'task_text',
        'Отработать подгруппу «'||subgroup||'» на '||to_char(v_target_month,'MM.YYYY')||
        '. Обязательная сезонная база — тот же месяц прошлого года ('||to_char(v_season_month,'MM.YYYY')||
        '), дополнительно учитывать последний закрытый месяц ('||to_char(v_recent_month,'MM.YYYY')||
        ') и его год/год. '||
        case when v_current_exists then 'Текущий месяц уже поступает — корректировать задачу по факту продаж. '
             else 'Текущего месяца продаж ещё нет — это не блокирует план. ' end||
        case when v_partner_fresh then 'Свежие остатки 21vek учтены. '
             else 'Остатки 21vek не подтверждены: считать их UNKNOWN, не 0, и не назначать отгрузку вслепую. ' end||
        case when listing_problem_count>0 then
          'Листинг собственного парсера — обязательный сигнал: проблемных SKU '||listing_problem_count||
          ', критичных '||listing_critical_count||', вне TOP-60 '||listing_out_top60_count||
          ', ниже TOP-30 '||listing_below_top30_count||'. '
        else 'Свежих проблем листинга по выбранным SKU не подтверждено. ' end||
        'По SKU проверить цену, видимость/позицию, карточку, промо и наличие; при подтверждённом дефиците 21vek использовать свободный остаток Витебска.',
      'basis',
        'Сезонная база '||to_char(v_season_month,'MM.YYYY')||': '||to_char(seasonal_revenue,'FM999999990D00')||
        ' BYN. Последний закрытый месяц '||to_char(v_recent_month,'MM.YYYY')||': '||to_char(recent_revenue,'FM999999990D00')||
        ' BYN против '||to_char(recent_prev_revenue,'FM999999990D00')||' BYN годом ранее. '||
        case when v_current_exists then 'Текущий '||to_char(v_target_month,'MM.YYYY')||': '||to_char(target_current_revenue,'FM999999990D00')||' BYN. '
             else 'Продаж за '||to_char(v_target_month,'MM.YYYY')||' ещё нет. ' end||
        'Витебск: '||to_char(selected_own_qty,'FM999999990D00')||' шт. по выбранным SKU. '||
        case when v_partner_fresh then 'Остаток 21vek от '||to_char(v_partner_date,'DD.MM.YYYY')||' учтён.'
             else 'Свежего остатка 21vek нет.' end,
      'expected_result',
        'Получить не менее '||to_char(target_revenue,'FM999999990D00')||
        ' BYN дополнительного/возвращённого оборота по подгруппе до конца месяца либо по каждому приоритетному SKU зафиксировать конкретную причину недостижения.',
      'criteria',
        'Контроль по продажам выбранного месяца и тем же SKU; сезонная база — '||to_char(v_season_month,'MM.YYYY')||
        '. Остаток 21vek использовать только если он подтверждён свежим файлом.',
      'next_step',
        case when v_partner_fresh
          then 'Еженедельно сверять факт текущего месяца с сезонной базой и последним закрытым месяцем.'
          else 'После получения свежих остатков 21vek пересчитать наличие и при необходимости добавить точечную поставку.'
        end,
      'commercial_context',jsonb_build_object(
        'task_scope','subgroup',
        'subgroup_name',subgroup,
        'parent_group',parent_group,
        'selected_sku_count',selected_sku_count,
        'own_qty',selected_own_qty,
        'partner_total',partner_total_all,
        'partner_stock_available',v_partner_fresh,
        'stock_mode',case when v_partner_fresh then 'full' else 'without_partner_stock' end,
        'plan_month',to_char(v_target_month,'YYYY-MM'),
        'seasonal_reference_month',to_char(v_season_month,'YYYY-MM'),
        'sales_reference_month',to_char(v_recent_month,'YYYY-MM'),
        'recent_previous_month',to_char(v_recent_prev_month,'YYYY-MM'),
        'current_month_sales_available',v_current_exists,
        'seasonal_revenue',seasonal_revenue,
        'subgroup_current_revenue',target_current_revenue,
        'recent_revenue',recent_revenue,
        'recent_previous_revenue',recent_prev_revenue,
        'recent_loss',recent_loss,
        'commercial_value',commercial_value,
        'target_revenue',target_revenue,
        'content_issue_count',content_issue_count,
        'listing_problem_count',listing_problem_count,
        'listing_critical_count',listing_critical_count,
        'listing_out_top60_count',listing_out_top60_count,
        'listing_below_top30_count',listing_below_top30_count,
        'listing_source','own_21vek_parser_top_snapshots',
        'listing_fresh_hours',72,
        'novelty_count',novelty_count,
        'own_report_date',v_own_date,
        'partner_snapshot_date',v_partner_date,
        'strategy_label','Сезонность + последний закрытый месяц + текущий факт при наличии',
        'plan_items',items,
        'data_quality_note',
          case when v_partner_fresh
            then 'Сезонность, последний закрытый месяц, текущий месяц при наличии и свежий остаток 21vek учтены.'
            else 'Сезонность, последний закрытый месяц и текущий месяц при наличии учтены; остаток 21vek неизвестен и не подменяется нулём.'
          end
      )
    ) order by rnk),'[]'::jsonb),
    count(*)::int
  into v_candidates,v_count
  from ranked
  where rnk<=greatest(v_target+5,15);

  return jsonb_build_object(
    'ok',true,
    'mode',case when v_partner_fresh then 'seasonal_with_stock' else 'seasonal_without_partner_stock' end,
    'target_month',to_char(v_target_month,'YYYY-MM'),
    'seasonal_reference_month',to_char(v_season_month,'YYYY-MM'),
    'reference_month',to_char(v_recent_month,'YYYY-MM'),
    'recent_previous_month',to_char(v_recent_prev_month,'YYYY-MM'),
    'current_month_sales_available',v_current_exists,
    'own_report_date',v_own_date,
    'partner_snapshot_date',v_partner_date,
    'partner_stock_available',v_partner_fresh,
    'manager_email',v_manager,
    'candidate_count',v_count,
    'candidates',v_candidates,
    'diagnostics',jsonb_build_object(
      'scanned',v_count,
      'no_vitebsk',0,
      'blocked_active',0,
      'group_900',0,
      'no_signal',0,
      'seasonal_reference_month',to_char(v_season_month,'YYYY-MM'),
      'current_month_sales_missing',not v_current_exists,
      'partner_stock_missing',not v_partner_fresh
    ),
    'warning',
      case
        when not v_current_exists and not v_partner_fresh then
          'Текущий месяц продаж и свежие остатки 21vek ещё не получены. План сформирован по сезонной базе прошлого года + последнему закрытому месяцу + Витебску.'
        when not v_current_exists then
          'Текущий месяц продаж ещё не получен. План сформирован по сезонной базе прошлого года + последнему закрытому месяцу; свежие остатки 21vek учтены.'
        when not v_partner_fresh then
          'Свежие остатки 21vek не получены. Текущий месяц продаж учтён; остаток 21vek считается неизвестным.'
        else
          'Все основные источники доступны.'
      end
  );
end;
$function$

