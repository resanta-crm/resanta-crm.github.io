-- v23.6.373 Promotions: quantity by SKU + AI target growth 30%
alter table public.promotion_items
  add column if not exists planned_qty integer;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname='promotion_items_planned_qty_positive'
      and conrelid='public.promotion_items'::regclass
  ) then
    alter table public.promotion_items
      add constraint promotion_items_planned_qty_positive
      check (planned_qty is null or planned_qty > 0);
  end if;
end $$;

comment on column public.promotion_items.planned_qty
  is 'Planned quantity in pieces for the promotion SKU; required by CRM UI for SKU-based promotions.';

CREATE OR REPLACE FUNCTION public.crm_promotion_ai_precheck_v236373(p_promotion_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor public.users%rowtype;
  p public.promotions%rowtype;

  v_item_count int := 0;
  v_qty_count int := 0;
  v_price_count int := 0;
  v_planned_qty numeric := 0;
  v_planned_revenue numeric := 0;
  v_avg_discount numeric := 0;

  v_skus text[] := array[]::text[];
  v_subgroups text[] := array[]::text[];
  v_categories text[] := array[]::text[];

  v_start_month date;
  v_end_month date;
  v_prev_start date;
  v_prev_end date;
  v_recent3_start date;
  v_recent3_end date;
  v_promo_months int := 1;

  v_prev_qty numeric := 0;
  v_recent3_qty numeric := 0;
  v_recent_runrate_qty numeric := 0;
  v_prev_revenue numeric := 0;

  v_sub_prev_qty numeric := 0;
  v_sub_recent3_qty numeric := 0;
  v_sub_prev_skus int := 0;
  v_sub_recent3_skus int := 0;

  v_cat_prev_qty numeric := 0;
  v_cat_recent3_qty numeric := 0;
  v_cat_prev_skus int := 0;
  v_cat_recent3_skus int := 0;

  v_baseline_qty numeric := 0;
  v_baseline_qty_source text := 'no_history';
  v_baseline_qty_label text := 'Нет истории в штуках';
  v_target_qty numeric := null;
  v_qty_growth numeric := null;
  v_target_met boolean := false;
  v_qty_complete boolean := false;

  v_plan numeric := 0;
  v_budget numeric := 0;
  v_plan_coverage numeric := null;
  v_budget_pct_qty_revenue numeric := null;
  v_chance int := 0;
  v_confidence int := 20;
  v_sales_verdict text := 'unknown';
  v_decision text := 'Нужно заполнить количество';
  v_missing_plan_amount numeric := null;

  v_reasons jsonb := '[]'::jsonb;
  v_recs jsonb := '[]'::jsonb;
  v_items jsonb := '[]'::jsonb;
  v_result jsonb;
begin
  select * into v_actor from public.users where id=auth.uid();
  if v_actor.id is null then
    raise exception 'Требуется вход в CRM' using errcode='42501';
  end if;

  select * into p from public.promotions where id=p_promotion_id;
  if p.id is null then raise exception 'Акция не найдена'; end if;

  if coalesce(v_actor.role,'') <> 'boss'
     and lower(trim(coalesce(p.manager_name,''))) <> lower(trim(coalesce(v_actor.name,''))) then
    raise exception 'Нет доступа к ИИ-анализу этой акции' using errcode='42501';
  end if;

  select
    count(*),
    count(*) filter (where i.planned_qty is not null and i.planned_qty>0),
    count(*) filter (where coalesce(i.promo_price_vat,i.base_price_vat,0)>0),
    coalesce(sum(i.planned_qty),0),
    coalesce(sum(coalesce(i.planned_qty,0)*coalesce(i.promo_price_vat,i.base_price_vat,0)),0),
    coalesce(avg(i.discount_pct) filter (where i.discount_pct is not null),0),
    coalesce(array_agg(distinct trim(i.sku)) filter (where trim(coalesce(i.sku,''))<>''),array[]::text[]),
    coalesce(array_agg(distinct trim(i.subgroup)) filter (where trim(coalesce(i.subgroup,''))<>''),array[]::text[]),
    coalesce(array_agg(distinct trim(i.category)) filter (where trim(coalesce(i.category,''))<>''),array[]::text[])
  into
    v_item_count,v_qty_count,v_price_count,v_planned_qty,v_planned_revenue,v_avg_discount,
    v_skus,v_subgroups,v_categories
  from public.promotion_items i
  where i.promotion_id=p.id;

  v_qty_complete := v_item_count>0 and v_qty_count=v_item_count;

  v_start_month := date_trunc('month',p.start_date)::date;
  v_end_month := date_trunc('month',p.end_date)::date;
  v_prev_start := (v_start_month - interval '1 year')::date;
  v_prev_end := (v_end_month - interval '1 year')::date;
  v_recent3_start := (v_start_month - interval '3 months')::date;
  v_recent3_end := (v_start_month - interval '1 month')::date;
  v_promo_months := greatest(1,
    ((extract(year from v_end_month)::int-extract(year from v_start_month)::int)*12
      + extract(month from v_end_month)::int-extract(month from v_start_month)::int + 1));

  if v_item_count>0 then
    select
      greatest(0,coalesce(sum(h.qty),0)),
      greatest(0,coalesce(sum(h.revenue),0))
    into v_prev_qty,v_prev_revenue
    from public.purchase_history h
    where h.client_id=p.client_id
      and h.month between v_prev_start and v_prev_end
      and trim(coalesce(h.sku,''))=any(v_skus);

    select greatest(0,coalesce(sum(h.qty),0))
      into v_recent3_qty
    from public.purchase_history h
    where h.client_id=p.client_id
      and h.month between v_recent3_start and v_recent3_end
      and trim(coalesce(h.sku,''))=any(v_skus);

    v_recent_runrate_qty := round((v_recent3_qty/3.0)*v_promo_months,2);

    if v_prev_qty>0 or v_recent_runrate_qty>0 then
      v_baseline_qty_source := 'exact_sku';
      v_baseline_qty_label := 'Точные SKU клиента';
      if v_prev_qty>0 and v_recent_runrate_qty>0 then
        v_baseline_qty := round(v_prev_qty*0.65 + v_recent_runrate_qty*0.35,2);
      else
        v_baseline_qty := greatest(v_prev_qty,v_recent_runrate_qty);
      end if;
    end if;
  end if;

  if v_baseline_qty=0 and cardinality(v_subgroups)>0 then
    select greatest(0,coalesce(sum(h.qty),0)),count(distinct nullif(trim(h.sku),''))
      into v_sub_prev_qty,v_sub_prev_skus
    from public.purchase_history h
    where h.client_id=p.client_id
      and h.month between v_prev_start and v_prev_end
      and trim(coalesce(h.subgroup,''))=any(v_subgroups);

    select greatest(0,coalesce(sum(h.qty),0)),count(distinct nullif(trim(h.sku),''))
      into v_sub_recent3_qty,v_sub_recent3_skus
    from public.purchase_history h
    where h.client_id=p.client_id
      and h.month between v_recent3_start and v_recent3_end
      and trim(coalesce(h.subgroup,''))=any(v_subgroups);

    if v_sub_prev_qty>0 or v_sub_recent3_qty>0 then
      v_baseline_qty_source := 'subgroup_fallback';
      v_baseline_qty_label := 'Подгруппа клиента';
      if v_sub_prev_skus>0 and v_sub_recent3_skus>0 and v_sub_prev_qty>0 and v_sub_recent3_qty>0 then
        v_baseline_qty := round(
          (
            (v_sub_prev_qty/v_sub_prev_skus)*0.50
            + (((v_sub_recent3_qty/3.0)*v_promo_months)/v_sub_recent3_skus)*0.50
          ) * greatest(1,v_item_count),2);
      elsif v_sub_prev_skus>0 and v_sub_prev_qty>0 then
        v_baseline_qty := round((v_sub_prev_qty/v_sub_prev_skus)*greatest(1,v_item_count),2);
      elsif v_sub_recent3_skus>0 and v_sub_recent3_qty>0 then
        v_baseline_qty := round((((v_sub_recent3_qty/3.0)*v_promo_months)/v_sub_recent3_skus)*greatest(1,v_item_count),2);
      end if;
    end if;
  end if;

  if v_baseline_qty=0 and cardinality(v_categories)>0 then
    select greatest(0,coalesce(sum(h.qty),0)),count(distinct nullif(trim(h.sku),''))
      into v_cat_prev_qty,v_cat_prev_skus
    from public.purchase_history h
    where h.client_id=p.client_id
      and h.month between v_prev_start and v_prev_end
      and trim(coalesce(h.category,''))=any(v_categories);

    select greatest(0,coalesce(sum(h.qty),0)),count(distinct nullif(trim(h.sku),''))
      into v_cat_recent3_qty,v_cat_recent3_skus
    from public.purchase_history h
    where h.client_id=p.client_id
      and h.month between v_recent3_start and v_recent3_end
      and trim(coalesce(h.category,''))=any(v_categories);

    if v_cat_prev_qty>0 or v_cat_recent3_qty>0 then
      v_baseline_qty_source := 'category_fallback';
      v_baseline_qty_label := 'Группа клиента';
      if v_cat_prev_skus>0 and v_cat_recent3_skus>0 and v_cat_prev_qty>0 and v_cat_recent3_qty>0 then
        v_baseline_qty := round(
          (
            (v_cat_prev_qty/v_cat_prev_skus)*0.50
            + (((v_cat_recent3_qty/3.0)*v_promo_months)/v_cat_recent3_skus)*0.50
          ) * greatest(1,v_item_count),2);
      elsif v_cat_prev_skus>0 and v_cat_prev_qty>0 then
        v_baseline_qty := round((v_cat_prev_qty/v_cat_prev_skus)*greatest(1,v_item_count),2);
      elsif v_cat_recent3_skus>0 and v_cat_recent3_qty>0 then
        v_baseline_qty := round((((v_cat_recent3_qty/3.0)*v_promo_months)/v_cat_recent3_skus)*greatest(1,v_item_count),2);
      end if;
    end if;
  end if;

  if v_baseline_qty>0 then
    v_target_qty := ceil(v_baseline_qty*1.30);
    if v_qty_complete then
      v_qty_growth := round((v_planned_qty/v_baseline_qty-1)*100,1);
      v_target_met := v_planned_qty>=v_target_qty;
    end if;
  end if;

  v_plan := greatest(0,coalesce(p.sales_plan,0));
  v_budget := greatest(0,coalesce(p.requested_budget,0));

  if v_plan>0 and v_qty_complete and v_planned_revenue>0 then
    v_plan_coverage := round(v_planned_revenue/v_plan*100,1);
    v_missing_plan_amount := greatest(0,round(v_plan-v_planned_revenue,2));
  end if;
  if v_planned_revenue>0 then
    v_budget_pct_qty_revenue := round(v_budget/v_planned_revenue*100,1);
  end if;

  if not v_qty_complete then
    v_chance := 0;
    v_sales_verdict := 'unknown';
    v_decision := 'Нужно заполнить количество по SKU';
    v_confidence := 25;
  else
    v_confidence := 60;
    if v_baseline_qty>0 then v_confidence:=v_confidence+15; end if;
    if v_baseline_qty_source='exact_sku' then v_confidence:=v_confidence+5; end if;
    if v_item_count>0 and v_price_count=v_item_count then v_confidence:=v_confidence+10; end if;
    v_confidence:=least(95,v_confidence);

    if v_plan<=0 then
      v_chance:=70;
    elsif coalesce(v_plan_coverage,0)>=100 then
      v_chance:=90;
    elsif v_plan_coverage>=80 then
      v_chance:=80;
    elsif v_plan_coverage>=60 then
      v_chance:=65;
    elsif v_plan_coverage>=40 then
      v_chance:=50;
    else
      v_chance:=35;
    end if;

    if v_baseline_qty>0 then
      if v_target_met then v_chance:=least(95,v_chance+5);
      elsif v_planned_qty>=v_baseline_qty then v_chance:=greatest(5,v_chance-5);
      else v_chance:=greatest(5,v_chance-20);
      end if;
    end if;

    if v_chance>=75 then
      v_sales_verdict:='green';
      v_decision:='Можно согласовывать по объёму';
    elsif v_chance>=50 then
      v_sales_verdict:='yellow';
      v_decision:='Нужно проверить объём и план';
    else
      v_sales_verdict:='red';
      v_decision:='Не рекомендую в текущем виде';
    end if;
  end if;

  if v_item_count=0 then
    v_reasons := v_reasons || jsonb_build_array('В акции не выбраны конкретные SKU — количественный анализ в штуках невозможен.');
    v_recs := v_recs || jsonb_build_array('Выбрать SKU акции и указать количество по каждой позиции.');
  elsif not v_qty_complete then
    v_reasons := v_reasons || jsonb_build_array(
      'Количество заполнено не по всем SKU: '||v_qty_count||' из '||v_item_count||'. ИИ не будет делать окончательный вывод без количества.'
    );
    v_recs := v_recs || jsonb_build_array('Указать количество в штуках по каждому SKU акции.');
  else
    v_reasons := v_reasons || jsonb_build_array(
      'Планируемая отгрузка: '||trim(to_char(v_planned_qty,'FM999999990.##'))||' шт. на '||round(v_planned_revenue,2)||' BYN по ценам акции.'
    );
  end if;

  if v_baseline_qty>0 then
    v_reasons := v_reasons || jsonb_build_array(
      'Расчётный исторический объём: '||trim(to_char(v_baseline_qty,'FM999999990.##'))||' шт. Источник: '||v_baseline_qty_label||'.'
    );
    v_reasons := v_reasons || jsonb_build_array(
      'Цель акции зафиксирована как рост +30%: минимум '||trim(to_char(v_target_qty,'FM999999990.##'))||' шт.'
    );
    if v_qty_complete then
      if v_target_met then
        v_reasons := v_reasons || jsonb_build_array(
          'Количество акции выполняет цель +30%: рост к базе '||v_qty_growth||'%.'
        );
      else
        v_reasons := v_reasons || jsonb_build_array(
          'Количество акции не достигает цели +30%: рост к базе '||v_qty_growth||'%.'
        );
        v_recs := v_recs || jsonb_build_array(
          'Для целевого роста +30% нужно минимум '||trim(to_char(v_target_qty,'FM999999990.##'))||' шт.; сейчас указано '||trim(to_char(v_planned_qty,'FM999999990.##'))||' шт.'
        );
      end if;
    end if;
  else
    v_reasons := v_reasons || jsonb_build_array(
      'По клиенту недостаточно истории в штуках по SKU/подгруппе/группе — цель +30% нельзя надёжно привязать к прошлому объёму.'
    );
  end if;

  if v_qty_complete and v_plan_coverage is not null then
    v_reasons := v_reasons || jsonb_build_array(
      'Сумма по введённому количеству обеспечивает '||v_plan_coverage||'% плана менеджера.'
    );
    if v_plan_coverage<100 then
      v_recs := v_recs || jsonb_build_array(
        'По введённому количеству до плана '||round(v_plan,2)||' BYN не хватает '||v_missing_plan_amount||' BYN.'
      );
    else
      v_recs := v_recs || jsonb_build_array(
        'Введённое количество полностью обеспечивает заявленный план продаж по сумме.'
      );
    end if;
  end if;

  if v_item_count>0 and v_price_count<v_item_count then
    v_recs := v_recs || jsonb_build_array(
      'Не по всем SKU есть цена МО2/цена акции — сумма отгрузки рассчитана не полностью.'
    );
  end if;

  if v_qty_complete and v_target_met and coalesce(v_plan_coverage,0)>=80 and jsonb_array_length(v_recs)=0 then
    v_recs := v_recs || jsonb_build_array('Объём соответствует цели роста +30%, сумма отгрузки подтверждает план.');
  end if;

  select coalesce(jsonb_agg(x order by (x->>'sku')), '[]'::jsonb)
    into v_items
  from (
    select jsonb_build_object(
      'sku',i.sku,
      'product_name',i.product_name,
      'planned_qty',i.planned_qty,
      'promo_price_vat',coalesce(i.promo_price_vat,i.base_price_vat),
      'line_revenue',case when i.planned_qty is null then null else round(i.planned_qty*coalesce(i.promo_price_vat,i.base_price_vat,0),2) end
    ) x
    from public.promotion_items i
    where i.promotion_id=p.id
  ) q;

  v_result := jsonb_build_object(
    'version','v23.6.373',
    'promotion_id',p.id,
    'generated_at',now(),
    'decision_recommendation',v_decision,
    'sales_verdict',v_sales_verdict,
    'economics_verdict','unknown',
    'chance_pct',v_chance,
    'confidence_pct',v_confidence,
    'item_count',v_item_count,
    'quantity_complete',v_qty_complete,
    'quantity_filled_count',v_qty_count,
    'planned_qty',round(v_planned_qty,2),
    'baseline_qty',round(v_baseline_qty,2),
    'baseline_qty_source',v_baseline_qty_source,
    'baseline_qty_label',v_baseline_qty_label,
    'target_growth_pct',30,
    'target_qty_30',v_target_qty,
    'qty_growth_pct',v_qty_growth,
    'qty_target_met',v_target_met,
    'planned_revenue_qty',round(v_planned_revenue,2),
    'sales_plan',round(v_plan,2),
    'plan_coverage_pct',v_plan_coverage,
    'missing_plan_amount',v_missing_plan_amount,
    'requested_budget',round(v_budget,2),
    'budget_pct_of_qty_revenue',v_budget_pct_qty_revenue,
    'discount_pct',round(v_avg_discount,1),
    'price_coverage_pct',case when v_item_count>0 then round(v_price_count::numeric/v_item_count*100,0) else 0 end,
    'previous_year_qty',round(v_prev_qty,2),
    'recent_3m_qty',round(v_recent3_qty,2),
    'previous_year_sales',round(v_prev_revenue,2),
    'quantity_items',v_items,
    'reasons',v_reasons,
    'recommendations',v_recs,
    'financial_note','ИИ оценивает количество по SKU, целевой рост +30%, сумму отгрузки по ценам акции и соответствие плану. Рентабельность и минимальная валовая маржа не рассчитываются.'
  );

  update public.promotions
    set ai_precheck=v_result,
        ai_precheck_at=now(),
        ai_precheck_version='v23.6.373'
  where id=p.id;

  insert into public.promotion_ai_assessment_history(promotion_id,version,assessment,actor)
  values(p.id,'v23.6.373',v_result,coalesce(v_actor.name,v_actor.email));

  return v_result;
end;
$function$
;

revoke execute on function public.crm_promotion_ai_precheck_v236373(uuid) from public, anon;
grant execute on function public.crm_promotion_ai_precheck_v236373(uuid) to authenticated, service_role;
