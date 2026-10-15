-- RESANTA CRM v23.6.363 · partial-month promotion evidence
-- Calendar-month 1C turnover is shown month by month for promotions whose
-- start/end date is inside a month. Boundary-month turnover is evidence only:
-- it is never auto-counted into plan completion unless exact snapshots prove it.

CREATE OR REPLACE FUNCTION public.crm_promotion_sales_truth_v236360(p_promotion_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  p public.promotions%rowtype;
  v_skus text[] := array[]::text[];
  v_item_count int := 0;
  v_start_month date;
  v_end_month date;
  v_target_date date;
  v_target_month date;
  v_full_period boolean := false;
  v_name_norm text := '';
  v_id_exists boolean := false;
  v_name_id_count int := 0;
  v_name_any_count int := 0;
  v_match_mode text := 'no_history';
  v_match_warning boolean := true;
  v_calendar_sales numeric := 0;
  v_calendar_qty numeric := 0;
  v_calendar_activity_rows integer := 0;
  v_calendar_month_breakdown jsonb := '[]'::jsonb;
  v_prelaunch_month date;
  v_prelaunch_sales numeric := 0;
  v_prelaunch_qty numeric := 0;
  v_covered_full_month_sales numeric := 0;
  v_sales_1c numeric := 0;
  v_effective numeric := 0;
  v_exact_total numeric := 0;
  v_exact_ready boolean := true;
  v_cursor date;
  v_month_end date;
  v_seg_start date;
  v_seg_end date;
  v_base numeric;
  v_end numeric;
  v_month_total numeric;
  v_quality text := 'preliminary_month';
  v_label text := '';
  v_source text := '1c_preliminary';
  v_sales_exact boolean := false;
  v_manual_conflict boolean := false;
  v_confirmed numeric := null;
begin
  select * into p
  from public.promotions
  where id=p_promotion_id;

  if p.id is null then
    raise exception 'PROMOTION_NOT_FOUND';
  end if;

  select
    coalesce(array_agg(distinct trim(i.sku)) filter(where trim(coalesce(i.sku,''))<>''),array[]::text[]),
    count(*) filter(where trim(coalesce(i.sku,''))<>'')
  into v_skus,v_item_count
  from public.promotion_items i
  where i.promotion_id=p.id;

  if v_item_count=0 then
    return jsonb_build_object(
      'promotion_id',p.id,
      'scope_mode','legacy',
      'sales_exact',false,
      'manual_conflict',false,
      'confirmed_sales',p.confirmed_sales
    );
  end if;

  v_start_month:=date_trunc('month',p.start_date)::date;
  v_end_month:=date_trunc('month',p.end_date)::date;
  v_prelaunch_month:=(v_start_month-interval '1 month')::date;
  v_target_date:=least(current_date,p.end_date);
  v_target_month:=date_trunc('month',v_target_date)::date;
  v_full_period:=
    p.start_date=v_start_month
    and p.end_date=(v_end_month+interval '1 month - 1 day')::date;
  v_confirmed:=p.confirmed_sales;
  v_name_norm:=lower(regexp_replace(trim(coalesce(p.client_name,'')),'\s+',' ','g'));

  select exists(
    select 1 from public.purchase_history h
    where p.client_id is not null and h.client_id=p.client_id
  ) into v_id_exists;

  select
    count(distinct h.client_id) filter(where h.client_id is not null),
    count(*)
  into v_name_id_count,v_name_any_count
  from public.purchase_history h
  where v_name_norm<>''
    and lower(regexp_replace(trim(coalesce(h.client_name,'')),'\s+',' ','g'))=v_name_norm;

  if p.client_id is not null and v_id_exists then
    v_match_mode:='client_id'; v_match_warning:=false;
  elsif v_name_norm<>'' and v_name_id_count=1 then
    v_match_mode:='name_unique_fallback'; v_match_warning:=true;
  elsif p.client_id is null and v_name_norm<>'' and v_name_any_count>0 and v_name_id_count<=1 then
    v_match_mode:='name_only'; v_match_warning:=true;
  elsif v_name_norm<>'' and v_name_id_count>1 then
    v_match_mode:='name_ambiguous'; v_match_warning:=true;
  else
    v_match_mode:='no_history'; v_match_warning:=true;
  end if;

  if v_match_mode='name_ambiguous' then
    return jsonb_build_object(
      'promotion_id',p.id,'scope_mode','exact_sku','item_count',v_item_count,
      'client_match_mode',v_match_mode,'client_match_warning',true,
      'current_sales_1c',0,'current_sales_calendar_month',0,
      'calendar_month_breakdown','[]'::jsonb,
      'prelaunch_month',v_prelaunch_month,'prelaunch_sales',0,'prelaunch_qty',0,
      'total_with_prelaunch',coalesce(v_confirmed,0),
      'prelaunch_separate_from_plan',true,
      'covered_full_month_sales',0,'effective_sales',coalesce(v_confirmed,0),
      'sales_source',case when v_confirmed is null then 'unavailable' else 'confirmed_manual' end,
      'sales_exact',false,'manual_conflict',false,
      'confirmed_sales',v_confirmed,'data_quality','client_match_ambiguous',
      'sales_label','Нельзя надёжно сопоставить клиента CRM с историей 1С'
    );
  end if;

  select
    coalesce(sum(h.revenue),0)::numeric,
    coalesce(sum(h.qty),0)::numeric,
    count(*) filter(where abs(coalesce(h.revenue,0))>0.0001 or abs(coalesce(h.qty,0))>0.0001)
  into v_calendar_sales,v_calendar_qty,v_calendar_activity_rows
  from public.purchase_history h
  where (
      (v_match_mode='client_id' and h.client_id=p.client_id)
      or (v_match_mode in ('name_unique_fallback','name_only')
          and lower(regexp_replace(trim(coalesce(h.client_name,'')),'\s+',' ','g'))=v_name_norm)
    )
    and h.month between v_start_month and v_end_month
    and trim(coalesce(h.sku,''))=any(v_skus);

  with months as (
    select gs::date as month_start,
           (gs+interval '1 month - 1 day')::date as month_end
    from generate_series(v_start_month::timestamp,v_end_month::timestamp,interval '1 month') gs
  ),
  hist as (
    select h.month,
           coalesce(sum(h.revenue),0)::numeric as sales,
           coalesce(sum(h.qty),0)::numeric as qty
    from public.purchase_history h
    where (
        (v_match_mode='client_id' and h.client_id=p.client_id)
        or (v_match_mode in ('name_unique_fallback','name_only')
            and lower(regexp_replace(trim(coalesce(h.client_name,'')),'\s+',' ','g'))=v_name_norm)
      )
      and h.month between v_start_month and v_end_month
      and trim(coalesce(h.sku,''))=any(v_skus)
    group by h.month
  )
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'month',m.month_start,
      'sales',round(coalesce(h.sales,0),2),
      'qty',round(coalesce(h.qty,0),2),
      'period_from',greatest(p.start_date,m.month_start),
      'period_to',least(p.end_date,m.month_end),
      'full_month_inside',p.start_date<=m.month_start and p.end_date>=m.month_end,
      'boundary_partial',not (p.start_date<=m.month_start and p.end_date>=m.month_end),
      'boundary_side',case
        when p.start_date>m.month_start and p.end_date<m.month_end then 'start_end'
        when p.start_date>m.month_start then 'start'
        when p.end_date<m.month_end then 'end'
        else 'full'
      end
    )
    order by m.month_start
  ),'[]'::jsonb)
  into v_calendar_month_breakdown
  from months m
  left join hist h on h.month=m.month_start;

  select
    coalesce(sum(h.revenue),0)::numeric,
    coalesce(sum(h.qty),0)::numeric
  into v_prelaunch_sales,v_prelaunch_qty
  from public.purchase_history h
  where (
      (v_match_mode='client_id' and h.client_id=p.client_id)
      or (v_match_mode in ('name_unique_fallback','name_only')
          and lower(regexp_replace(trim(coalesce(h.client_name,'')),'\s+',' ','g'))=v_name_norm)
    )
    and h.month=v_prelaunch_month
    and trim(coalesce(h.sku,''))=any(v_skus);

  select coalesce(sum(h.revenue),0)::numeric
  into v_covered_full_month_sales
  from public.purchase_history h
  where (
      (v_match_mode='client_id' and h.client_id=p.client_id)
      or (v_match_mode in ('name_unique_fallback','name_only')
          and lower(regexp_replace(trim(coalesce(h.client_name,'')),'\s+',' ','g'))=v_name_norm)
    )
    and h.month between v_start_month and v_end_month
    and h.month>=p.start_date
    and (h.month+interval '1 month - 1 day')::date<=p.end_date
    and trim(coalesce(h.sku,''))=any(v_skus);

  if current_date<p.start_date then
    v_sales_1c:=0;
    v_effective:=0;
    v_quality:='future';
    v_label:='Акция ещё не началась';
    v_source:='future';
    v_sales_exact:=true;
  elsif v_full_period then
    v_sales_1c:=v_calendar_sales;
    v_effective:=v_sales_1c;
    v_sales_exact:=true;
    v_source:='1c_exact';
    if current_date>p.end_date then
      v_quality:='exact_closed_month';
      v_label:='Точно по закрытым календарным месяцам 1С';
    else
      v_quality:='live_month';
      v_label:='Текущий накопительный итог календарных месяцев 1С';
    end if;
  else
    if v_calendar_activity_rows=0 then
      v_sales_1c:=0;
      v_effective:=0;
      v_sales_exact:=true;
      v_source:='1c_exact_zero';
      if current_date>p.end_date then
        v_quality:='exact_zero_period';
        v_label:='Точный нулевой факт: по SKU акции в затронутых календарных месяцах 1С нет продаж и количества';
      else
        v_quality:='exact_zero_live';
        v_label:='На текущий момент по SKU акции в затронутых календарных месяцах 1С нет продаж и количества';
      end if;
    else
      v_exact_total:=0;
      v_exact_ready:=true;
      v_cursor:=v_start_month;

    while v_cursor<=v_target_month loop
      v_month_end:=(v_cursor+interval '1 month - 1 day')::date;
      v_seg_start:=greatest(p.start_date,v_cursor);
      v_seg_end:=least(v_target_date,p.end_date,v_month_end);

      if v_seg_start<=v_seg_end then
        if v_seg_start=v_cursor then
          v_base:=0;
        else
          select s.cumulative_sales
          into v_base
          from public.promotion_sales_snapshots s
          where s.promotion_id=p.id
            and s.report_month=v_cursor
            and s.scope_version='exact_sku_v236360'
            and (s.snapshot_at at time zone 'Europe/Minsk')::date<v_seg_start
          order by s.snapshot_at desc
          limit 1;

          if v_base is null then
            v_exact_ready:=false;
          end if;
        end if;

        if v_exact_ready then
          if v_seg_end=v_month_end and current_date>v_month_end then
            select coalesce(sum(h.revenue),0)::numeric
            into v_month_total
            from public.purchase_history h
            where (
                (v_match_mode='client_id' and h.client_id=p.client_id)
                or (v_match_mode in ('name_unique_fallback','name_only')
                    and lower(regexp_replace(trim(coalesce(h.client_name,'')),'\s+',' ','g'))=v_name_norm)
              )
              and h.month=v_cursor
              and trim(coalesce(h.sku,''))=any(v_skus);
            v_end:=v_month_total;
          else
            select s.cumulative_sales
            into v_end
            from public.promotion_sales_snapshots s
            where s.promotion_id=p.id
              and s.report_month=v_cursor
              and s.scope_version='exact_sku_v236360'
              and (s.snapshot_at at time zone 'Europe/Minsk')::date=v_seg_end
            order by s.snapshot_at desc
            limit 1;

            if v_end is null then
              v_exact_ready:=false;
            end if;
          end if;
        end if;

        if v_exact_ready then
          v_exact_total:=v_exact_total+coalesce(v_end,0)-coalesce(v_base,0);
        end if;
      end if;

      exit when not v_exact_ready;
      v_cursor:=(v_cursor+interval '1 month')::date;
    end loop;

    if v_exact_ready then
      v_sales_1c:=round(v_exact_total,2);
      v_effective:=v_sales_1c;
      v_sales_exact:=true;
      v_source:='1c_exact';
      if current_date>p.end_date then
        v_quality:='exact_snapshots';
        v_label:='Точно по SKU и накопительным снимкам 1С внутри периода акции';
      else
        v_quality:='snapshot_live';
        v_label:='По точным SKU и накопительным снимкам 1С на текущий момент';
      end if;
    else
      v_sales_1c:=v_calendar_sales;
      v_sales_exact:=false;
      v_quality:='preliminary_month';
      if v_confirmed is not null then
        if v_confirmed+0.01<v_covered_full_month_sales then
          v_manual_conflict:=true;
          v_effective:=v_covered_full_month_sales;
          v_source:='1c_proven_minimum';
          v_label:='Ручной итог ниже доказанных продаж 1С по полным месяцам внутри акции. Показан подтверждённый минимум 1С; требуется сверка.';
        else
          v_effective:=v_confirmed;
          v_source:='confirmed_manual';
          v_label:='Неполный период: итог подтверждён руководителем. Продажи 1С по затронутым календарным месяцам показываются отдельно как справочные.';
        end if;
      else
        v_effective:=v_calendar_sales;
        v_source:='1c_preliminary';
        v_label:='Недостаточно точных снимков 1С для границ акции; показан предварительный оборот по затронутым календарным месяцам.';
      end if;
    end if;
    end if;
  end if;

  if v_sales_exact and v_confirmed is not null and abs(v_confirmed-v_sales_1c)>0.01 then
    v_manual_conflict:=true;
    v_effective:=v_sales_1c;
    v_source:='1c_exact';
    v_label:=v_label||'. Ранее подтверждённая вручную сумма отличается и больше не перекрывает точный факт 1С.';
  end if;

  if v_match_mode='name_unique_fallback' then
    v_label:=v_label||'. Клиент сопоставлен по уникальному точному названию.';
  elsif v_match_mode='name_only' then
    v_label:=v_label||'. Клиент сопоставлен по точному названию.';
  elsif v_match_mode='no_history' then
    v_label:=v_label||'. По клиенту нет строк в истории 1С.';
  end if;

  return jsonb_build_object(
    'promotion_id',p.id,
    'scope_mode','exact_sku',
    'item_count',v_item_count,
    'client_match_mode',v_match_mode,
    'client_match_warning',v_match_warning,
    'current_sales_1c',round(v_sales_1c,2),
    'current_sales_calendar_month',round(v_calendar_sales,2),
    'current_qty_calendar_month',round(v_calendar_qty,2),
    'calendar_month_breakdown',v_calendar_month_breakdown,
    'prelaunch_month',v_prelaunch_month,
    'prelaunch_sales',round(v_prelaunch_sales,2),
    'prelaunch_qty',round(v_prelaunch_qty,2),
    'total_with_prelaunch',round(coalesce(v_effective,0)+coalesce(v_prelaunch_sales,0),2),
    'prelaunch_separate_from_plan',true,
    'covered_full_month_sales',round(v_covered_full_month_sales,2),
    'effective_sales',round(v_effective,2),
    'sales_source',v_source,
    'sales_exact',v_sales_exact,
    'manual_conflict',v_manual_conflict,
    'confirmed_sales',v_confirmed,
    'data_quality',v_quality,
    'sales_label',v_label
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.crm_promotions_effectiveness_v236203()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
declare
  v_actor public.users%rowtype;
  p public.promotions%rowtype;
  v_rows jsonb := '[]'::jsonb;
  v_items jsonb;
  v_exact_skus text[];
  v_exact_count int;
  v_exact boolean;
  v_start_month date;
  v_end_month date;
  v_month_end date;
  v_prev_start date;
  v_prev_end date;
  v_full_month boolean;
  v_same_month boolean;
  v_name_norm text;
  v_id_exists boolean;
  v_name_id_count int;
  v_name_any_count int;
  v_match_mode text;
  v_match_warning boolean;
  v_month_sales numeric;
  v_current numeric;
  v_effective numeric;
  v_prev numeric;
  v_baseline_comparable boolean;
  v_incremental numeric;
  v_eval_cost numeric;
  v_required_margin numeric;
  v_quality text;
  v_label text;
  v_snap_base numeric;
  v_snap_end numeric;
  v_snap_end_date date;
  v_snap_base_ok boolean;
  v_snapshot_ok boolean;
  v_target_date date;
  v_truth jsonb;
begin
  select * into v_actor from public.users where id=auth.uid();
  if v_actor.id is null then raise exception 'Требуется вход в CRM'; end if;

  for p in
    select x.* from public.promotions x
    where coalesce(v_actor.role,'')='boss'
       or lower(trim(coalesce(x.manager_name,'')))=lower(trim(coalesce(v_actor.name,'')))
    order by x.start_date desc, x.created_at desc
  loop
    select
      coalesce(array_agg(distinct trim(i.sku)) filter (where trim(coalesce(i.sku,''))<>''), array[]::text[]),
      count(*)
      into v_exact_skus, v_exact_count
    from public.promotion_items i
    where i.promotion_id=p.id;

    v_exact := v_exact_count>0;
    v_start_month := date_trunc('month',p.start_date)::date;
    v_end_month := date_trunc('month',p.end_date)::date;
    v_month_end := (date_trunc('month',p.end_date)+interval '1 month - 1 day')::date;
    v_prev_start := (v_start_month - interval '1 year')::date;
    v_prev_end := (v_end_month - interval '1 year')::date;
    v_full_month := p.start_date=v_start_month and p.end_date=v_month_end;
    v_same_month := v_start_month=v_end_month;
    v_name_norm := lower(regexp_replace(trim(coalesce(p.client_name,'')), '\s+', ' ', 'g'));

    select exists(
      select 1 from public.purchase_history h
      where p.client_id is not null and h.client_id=p.client_id
    ) into v_id_exists;

    select
      count(distinct h.client_id) filter (where h.client_id is not null),
      count(*)
      into v_name_id_count, v_name_any_count
    from public.purchase_history h
    where v_name_norm<>''
      and lower(regexp_replace(trim(coalesce(h.client_name,'')), '\s+', ' ', 'g'))=v_name_norm;

    if p.client_id is not null and v_id_exists then
      v_match_mode := 'client_id';
      v_match_warning := false;
    elsif v_name_norm<>'' and v_name_id_count=1 then
      v_match_mode := 'name_unique_fallback';
      v_match_warning := true;
    elsif p.client_id is null and v_name_norm<>'' and v_name_any_count>0 and v_name_id_count<=1 then
      v_match_mode := 'name_only';
      v_match_warning := true;
    elsif v_name_norm<>'' and v_name_id_count>1 then
      v_match_mode := 'name_ambiguous';
      v_match_warning := true;
    else
      v_match_mode := 'no_history';
      v_match_warning := true;
    end if;

    select coalesce(sum(h.revenue),0) into v_month_sales
    from public.purchase_history h
    where (
        (v_match_mode='client_id' and h.client_id=p.client_id)
        or (v_match_mode in ('name_unique_fallback','name_only')
            and lower(regexp_replace(trim(coalesce(h.client_name,'')), '\s+', ' ', 'g'))=v_name_norm)
      )
      and h.month between v_start_month and v_end_month
      and (
        (v_exact and trim(coalesce(h.sku,''))=any(v_exact_skus))
        or (not v_exact and public.crm_promo_legacy_scope_match_v236132(h.category,h.subgroup,h.sku,h.product,p.product_filters))
      );

    select coalesce(sum(h.revenue),0) into v_prev
    from public.purchase_history h
    where (
        (v_match_mode='client_id' and h.client_id=p.client_id)
        or (v_match_mode in ('name_unique_fallback','name_only')
            and lower(regexp_replace(trim(coalesce(h.client_name,'')), '\s+', ' ', 'g'))=v_name_norm)
      )
      and h.month between v_prev_start and v_prev_end
      and (
        (v_exact and trim(coalesce(h.sku,''))=any(v_exact_skus))
        or (not v_exact and public.crm_promo_legacy_scope_match_v236132(h.category,h.subgroup,h.sku,h.product,p.product_filters))
      );

    v_current := v_month_sales;
    v_quality := 'preliminary_month';
    v_label := 'Предварительно по календарным месяцам 1С';
    v_snapshot_ok := false;
    v_snap_base := null;
    v_snap_end := null;
    v_snap_end_date := null;
    v_snap_base_ok := false;
    v_target_date := least(current_date,p.end_date);

    if current_date < p.start_date then
      v_current := 0;
      v_quality := 'future';
      v_label := 'Акция ещё не началась';
    elsif v_match_mode='name_ambiguous' then
      v_current := 0;
      v_quality := 'client_match_ambiguous';
      v_label := 'Нельзя надёжно сопоставить клиента CRM с историей 1С';
    elsif v_full_month then
      if current_date>p.end_date then
        v_quality := 'exact_closed_month';
        v_label := 'Точно по закрытому календарному месяцу 1С';
      else
        v_quality := 'live_month';
        v_label := 'Текущий накопительный итог календарного месяца 1С';
      end if;
    elsif v_same_month and v_match_mode='client_id' then
      if p.start_date=v_start_month then
        v_snap_base := 0;
        v_snap_base_ok := true;
      else
        select s.cumulative_sales
          into v_snap_base
        from public.promotion_sales_snapshots s
        where s.promotion_id=p.id
          and s.report_month=v_start_month
          and (s.snapshot_at at time zone 'Europe/Minsk')::date < p.start_date
        order by s.snapshot_at desc
        limit 1;
        v_snap_base_ok := v_snap_base is not null;
      end if;

      select s.cumulative_sales,(s.snapshot_at at time zone 'Europe/Minsk')::date
        into v_snap_end,v_snap_end_date
      from public.promotion_sales_snapshots s
      where s.promotion_id=p.id
        and s.report_month=v_start_month
        and (s.snapshot_at at time zone 'Europe/Minsk')::date between p.start_date and v_target_date
      order by s.snapshot_at desc
      limit 1;

      if v_snap_base_ok and v_snap_end is not null then
        v_current := v_snap_end-coalesce(v_snap_base,0);
        if current_date>p.end_date and v_snap_end_date=p.end_date then
          v_snapshot_ok := true;
          v_quality := 'exact_snapshots';
          v_label := 'Точно по накопительным снимкам 1С внутри периода акции';
        else
          v_quality := 'snapshot_live';
          v_label := 'По накопительным снимкам 1С на текущий момент';
        end if;
      else
        v_quality := 'preliminary_month';
        v_label := 'Недостаточно снимков 1С для точного отделения периода акции; показан календарный месяц';
      end if;
    else
      v_quality := 'preliminary_month';
      v_label := 'Неполный многомесячный период: календарный отчёт 1С не отделяет границы акции точно';
    end if;

    if v_match_mode='name_unique_fallback' then
      v_label := v_label || '. Клиент сопоставлен по уникальному точному названию, потому что ID CRM не найден в истории 1С';
    elsif v_match_mode='name_only' then
      v_label := v_label || '. Клиент сопоставлен по точному названию';
    elsif v_match_mode='no_history' then
      v_label := v_label || '. По клиенту нет строк в истории 1С';
    end if;

    v_truth := null;
    if v_exact then
      v_truth := public.crm_promotion_sales_truth_v236360(p.id);
      if coalesce(v_truth->>'scope_mode','')='exact_sku' then
        v_current := coalesce((v_truth->>'current_sales_1c')::numeric,v_current);
        v_month_sales := coalesce((v_truth->>'current_sales_calendar_month')::numeric,v_month_sales);
        v_quality := coalesce(v_truth->>'data_quality',v_quality);
        v_label := coalesce(v_truth->>'sales_label',v_label);
        v_match_mode := coalesce(v_truth->>'client_match_mode',v_match_mode);
        v_match_warning := coalesce((v_truth->>'client_match_warning')::boolean,v_match_warning);
      end if;
    end if;

    v_effective := case
      when v_truth is not null and coalesce(v_truth->>'scope_mode','')='exact_sku'
        then coalesce((v_truth->>'effective_sales')::numeric,v_current)
      when p.confirmed_sales is not null then p.confirmed_sales
      else v_current
    end;
    v_baseline_comparable := v_full_month and current_date>p.end_date and v_match_mode<>'name_ambiguous';
    v_incremental := case when v_baseline_comparable then v_effective-v_prev else null end;
    v_eval_cost := greatest(coalesce(p.actual_spend,0),coalesce(p.budget_reserved,0));
    v_required_margin := case when v_incremental is not null and v_incremental>0 and v_eval_cost>0
                              then v_eval_cost/v_incremental*100 else null end;

    if v_exact then
      select coalesce(jsonb_agg(jsonb_build_object(
        'sku',q.sku,
        'product_name',q.product_name,
        'category',q.category,
        'subgroup',q.subgroup,
        'base_price_vat',q.base_price_vat,
        'discount_pct',q.discount_pct,
        'promo_price_vat',q.promo_price_vat,
        'current_sales_calendar_month',q.current_sales,
        'current_qty_calendar_month',q.current_qty,
        'previous_year_sales',q.previous_year_sales,
        'previous_year_qty',q.previous_year_qty
      ) order by q.current_sales desc, q.sku),'[]'::jsonb)
      into v_items
      from (
        select i.sku,i.product_name,i.category,i.subgroup,i.base_price_vat,i.discount_pct,i.promo_price_vat,
          coalesce((select sum(h.revenue) from public.purchase_history h
            where (
              (v_match_mode='client_id' and h.client_id=p.client_id)
              or (v_match_mode in ('name_unique_fallback','name_only') and lower(regexp_replace(trim(coalesce(h.client_name,'')), '\s+', ' ', 'g'))=v_name_norm)
            )
            and h.month between v_start_month and v_end_month
            and trim(coalesce(h.sku,''))=trim(i.sku)),0) current_sales,
          coalesce((select sum(h.qty) from public.purchase_history h
            where (
              (v_match_mode='client_id' and h.client_id=p.client_id)
              or (v_match_mode in ('name_unique_fallback','name_only') and lower(regexp_replace(trim(coalesce(h.client_name,'')), '\s+', ' ', 'g'))=v_name_norm)
            )
            and h.month between v_start_month and v_end_month
            and trim(coalesce(h.sku,''))=trim(i.sku)),0) current_qty,
          coalesce((select sum(h.revenue) from public.purchase_history h
            where (
              (v_match_mode='client_id' and h.client_id=p.client_id)
              or (v_match_mode in ('name_unique_fallback','name_only') and lower(regexp_replace(trim(coalesce(h.client_name,'')), '\s+', ' ', 'g'))=v_name_norm)
            )
            and h.month between v_prev_start and v_prev_end
            and trim(coalesce(h.sku,''))=trim(i.sku)),0) previous_year_sales,
          coalesce((select sum(h.qty) from public.purchase_history h
            where (
              (v_match_mode='client_id' and h.client_id=p.client_id)
              or (v_match_mode in ('name_unique_fallback','name_only') and lower(regexp_replace(trim(coalesce(h.client_name,'')), '\s+', ' ', 'g'))=v_name_norm)
            )
            and h.month between v_prev_start and v_prev_end
            and trim(coalesce(h.sku,''))=trim(i.sku)),0) previous_year_qty
        from public.promotion_items i
        where i.promotion_id=p.id
      ) q;
    else
      v_items := '[]'::jsonb;
    end if;

    v_rows := v_rows || jsonb_build_array(jsonb_build_object(
      'promotion_id',p.id,
      'client_id',p.client_id,
      'scope_mode',case when v_exact then 'exact_sku' else 'legacy' end,
      'item_count',v_exact_count,
      'client_match_mode',v_match_mode,
      'client_match_warning',v_match_warning,
      'current_sales_1c',v_current,
      'current_sales_calendar_month',v_month_sales,
      'effective_sales',v_effective,
      'confirmed_sales',p.confirmed_sales,
      'sales_source',case when v_truth is not null then v_truth->>'sales_source' else case when p.confirmed_sales is not null then 'confirmed_manual' else 'legacy_auto' end end,
      'sales_exact',case when v_truth is not null then coalesce((v_truth->>'sales_exact')::boolean,false) else false end,
      'manual_conflict',case when v_truth is not null then coalesce((v_truth->>'manual_conflict')::boolean,false) else false end,
      'covered_full_month_sales',case when v_truth is not null then coalesce((v_truth->>'covered_full_month_sales')::numeric,0) else 0 end,
      'calendar_month_breakdown',case when v_truth is not null then coalesce(v_truth->'calendar_month_breakdown','[]'::jsonb) else '[]'::jsonb end,
      'prelaunch_month',case when v_truth is not null then v_truth->>'prelaunch_month' else null end,
      'prelaunch_sales',case when v_truth is not null then coalesce((v_truth->>'prelaunch_sales')::numeric,0) else 0 end,
      'prelaunch_qty',case when v_truth is not null then coalesce((v_truth->>'prelaunch_qty')::numeric,0) else 0 end,
      'total_with_prelaunch',case when v_truth is not null then coalesce((v_truth->>'total_with_prelaunch')::numeric,v_effective) else v_effective end,
      'prelaunch_separate_from_plan',true,
      'previous_year_sales',v_prev,
      'baseline_sales',v_prev,
      'baseline_comparable',v_baseline_comparable,
      'incremental_sales',v_incremental,
      'actual_spend',coalesce(p.actual_spend,0),
      'reserved_budget',coalesce(p.budget_reserved,0),
      'evaluation_cost',v_eval_cost,
      'required_margin_pct',v_required_margin,
      'financial_roi_available',false,
      'financial_note','Для точного ROI нужна валовая прибыль или себестоимость. До её появления CRM показывает дополнительный оборот и минимальную маржу, необходимую для покрытия затрат/резерва.',
      'period_partial',not v_full_month,
      'data_quality',v_quality,
      'sales_label',v_label,
      'items',v_items
    ));
  end loop;

  return v_rows;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.crm_promotion_close_summary_v1(p_promotion_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  p public.promotions%rowtype;
  v_exact_count integer := 0;
  v_start_month date;
  v_end_month date;
  v_prev_start date;
  v_prev_end date;
  v_current_auto numeric := 0;
  v_prev_auto numeric := 0;
  v_effective numeric := null;
  v_completion numeric := null;
  v_days_total integer := 1;
  v_days_elapsed integer := 0;
  v_elapsed_pct numeric := 0;
  v_pace numeric := null;
  v_full_month boolean := false;
  v_items jsonb := '[]'::jsonb;
  v_required text[] := '{}'::text[];
  v_have text[] := '{}'::text[];
  v_missing text[] := '{}'::text[];
  v_report_ok boolean := false;
  v_partial_sales_ok boolean := true;
  v_not_ended boolean := false;
  v_truth jsonb;
begin
  if auth.uid() is null or not exists(select 1 from public.users where id=auth.uid()) then
    raise exception 'AUTH_REQUIRED';
  end if;

  select * into p from public.promotions where id=p_promotion_id;
  if not found then raise exception 'PROMOTION_NOT_FOUND'; end if;

  select count(*) into v_exact_count from public.promotion_items where promotion_id=p.id;

  v_start_month := date_trunc('month',p.start_date)::date;
  v_end_month := date_trunc('month',p.end_date)::date;
  v_prev_start := (v_start_month - interval '1 year')::date;
  v_prev_end := (v_end_month - interval '1 year')::date;
  v_full_month := p.start_date=v_start_month and p.end_date=(v_end_month + interval '1 month - 1 day')::date;

  if v_exact_count>0 then
    with item_sales as (
      select
        i.id,i.sku,i.product_name,i.category,i.subgroup,i.base_price_vat,i.discount_pct,i.promo_price_vat,
        coalesce(sum(ph.revenue) filter(where ph.month between v_start_month and v_end_month),0)::numeric as current_sales,
        coalesce(sum(ph.revenue) filter(where ph.month between v_prev_start and v_prev_end),0)::numeric as previous_year_sales
      from public.promotion_items i
      left join public.purchase_history ph
        on lower(trim(coalesce(ph.sku,'')))=lower(trim(i.sku))
       and (
         (p.client_id is not null and ph.client_id=p.client_id)
         or (p.client_id is null and lower(trim(ph.client_name))=lower(trim(p.client_name)))
       )
       and ph.month between v_prev_start and v_end_month
      where i.promotion_id=p.id
      group by i.id,i.sku,i.product_name,i.category,i.subgroup,i.base_price_vat,i.discount_pct,i.promo_price_vat
    )
    select
      coalesce(sum(current_sales),0),
      coalesce(sum(previous_year_sales),0),
      coalesce(jsonb_agg(jsonb_build_object(
        'sku',sku,
        'product_name',product_name,
        'category',category,
        'subgroup',subgroup,
        'base_price_vat',base_price_vat,
        'discount_pct',discount_pct,
        'promo_price_vat',promo_price_vat,
        'sales',current_sales,
        'previous_year_sales',previous_year_sales,
        'delta',current_sales-previous_year_sales
      ) order by sku),'[]'::jsonb)
    into v_current_auto,v_prev_auto,v_items
    from item_sales;
  end if;

  v_truth := null;
  if v_exact_count>0 then
    v_truth := public.crm_promotion_sales_truth_v236360(p.id);
    if coalesce(v_truth->>'scope_mode','')='exact_sku' then
      v_current_auto := coalesce((v_truth->>'current_sales_1c')::numeric,v_current_auto);
      v_effective := coalesce((v_truth->>'effective_sales')::numeric,v_current_auto);
    end if;
  end if;

  if v_effective is null then
    if p.confirmed_sales is not null then
      v_effective := p.confirmed_sales;
    elsif v_exact_count>0 then
      v_effective := v_current_auto;
    end if;
  end if;

  if p.sales_plan>0 and v_effective is not null then
    v_completion := round((v_effective/p.sales_plan*100)::numeric,1);
  end if;

  v_days_total := greatest(1,(p.end_date-p.start_date)+1);
  v_days_elapsed := greatest(0,least(v_days_total,(current_date-p.start_date)+1));
  v_elapsed_pct := round((v_days_elapsed::numeric/v_days_total::numeric*100),1);
  if v_completion is not null then v_pace := round(v_completion-v_elapsed_pct,1); end if;

  v_required := coalesce(p.required_photo_stages,'{}'::text[]);
  select coalesce(array_agg(distinct ph.stage order by ph.stage),'{}'::text[])
    into v_have
  from public.promotion_photos ph
  where ph.promotion_id=p.id and ph.approved is distinct from false;
  select coalesce(array_agg(x order by x),'{}'::text[])
    into v_missing
  from unnest(v_required) x
  where not (x=any(v_have));

  v_report_ok := length(trim(coalesce(p.manager_report,'')))>0;
  v_partial_sales_ok := v_full_month
    or (v_truth is not null and coalesce((v_truth->>'sales_exact')::boolean,false))
    or p.confirmed_sales is not null;
  v_not_ended := current_date<p.end_date;

  return jsonb_build_object(
    'promotion_id',p.id,
    'scope_mode',case when v_exact_count>0 then 'exact_sku' else 'legacy' end,
    'exact_item_count',v_exact_count,
    'items',v_items,
    'sales_plan',p.sales_plan,
    'confirmed_sales',p.confirmed_sales,
    'auto_sales',case when v_exact_count>0 then v_current_auto else null end,
    'sales_fact',v_effective,
    'sales_source',case when v_truth is not null then v_truth->>'sales_source' else case when p.confirmed_sales is not null then 'confirmed_manual' else 'legacy_auto' end end,
    'sales_exact',case when v_truth is not null then coalesce((v_truth->>'sales_exact')::boolean,false) else false end,
    'manual_conflict',case when v_truth is not null then coalesce((v_truth->>'manual_conflict')::boolean,false) else false end,
    'calendar_sales_1c',case when v_truth is not null then coalesce((v_truth->>'current_sales_calendar_month')::numeric,v_current_auto) else v_current_auto end,
    'covered_full_month_sales',case when v_truth is not null then coalesce((v_truth->>'covered_full_month_sales')::numeric,0) else 0 end,
    'calendar_month_breakdown',case when v_truth is not null then coalesce(v_truth->'calendar_month_breakdown','[]'::jsonb) else '[]'::jsonb end,
    'prelaunch_month',case when v_truth is not null then v_truth->>'prelaunch_month' else null end,
    'prelaunch_sales',case when v_truth is not null then coalesce((v_truth->>'prelaunch_sales')::numeric,0) else 0 end,
    'prelaunch_qty',case when v_truth is not null then coalesce((v_truth->>'prelaunch_qty')::numeric,0) else 0 end,
    'total_with_prelaunch',case when v_truth is not null then coalesce((v_truth->>'total_with_prelaunch')::numeric,v_effective) else v_effective end,
    'prelaunch_separate_from_plan',true,
    'sales_label',case when v_truth is not null then v_truth->>'sales_label' else null end,
    'previous_year_sales',case when v_exact_count>0 then v_prev_auto else null end,
    'completion_pct',v_completion,
    'delta_vs_previous_year',case when v_exact_count>0 and v_effective is not null then v_effective-v_prev_auto else null end,
    'days_total',v_days_total,
    'days_elapsed',v_days_elapsed,
    'elapsed_pct',v_elapsed_pct,
    'pace_pp',v_pace,
    'full_month_period',v_full_month,
    'required_photo_stages',to_jsonb(v_required),
    'have_photo_stages',to_jsonb(v_have),
    'missing_photo_stages',to_jsonb(v_missing),
    'report_ready',v_report_ok,
    'partial_sales_ready',v_partial_sales_ok,
    'not_ended',v_not_ended,
    'close_blockers',to_jsonb(array_remove(array[
      case when not v_report_ok then 'manager_report' end,
      case when cardinality(v_missing)>0 then 'missing_photos' end,
      case when not v_partial_sales_ok then 'confirmed_sales' end
    ],null)),
    'data_note',case
      when v_exact_count=0 then 'legacy_scope'
      when v_truth is not null then coalesce(v_truth->>'data_quality','unknown')
      when not v_full_month and p.confirmed_sales is null then 'monthly_1c_partial_period'
      when not v_full_month and p.confirmed_sales is not null then 'confirmed_sales_partial_period'
      else 'exact_sku_monthly_1c'
    end
  );
end;
$function$
;

revoke all on function public.crm_promotions_effectiveness_v236203() from public,anon;
grant execute on function public.crm_promotions_effectiveness_v236203() to authenticated,service_role;

revoke all on function public.crm_promotion_close_summary_v1(uuid) from public,anon;
grant execute on function public.crm_promotion_close_summary_v1(uuid) to authenticated,service_role;
