-- Applied to Supabase as migration warehouse_abc_order_column_readonly_v1_20261109.
-- Read-only ABC labels for "Склад -> Автозаказ Чехов".
-- Same operative 3-month period and 80/95% group split as the branch ABC screen.
-- No change to stock, automatic order calculation, order approval or 1C imports.
create or replace function public.warehouse_control_abc_classes_v1(p_month date default null)
returns jsonb
language plpgsql stable security definer
set search_path to 'public','auth'
as $function$
declare
  v_end_month date := date_trunc('month',coalesce(p_month,current_date))::date;
  v_classes jsonb;
begin
  if not public.warehouse_is_boss() then
    raise exception 'Нет доступа' using errcode='42501';
  end if;
  with sales as (
    select lower(trim(p.sku)) as sku,
           replace(lower(trim(p.category)),'ё','е') as category,
           sum(coalesce(p.revenue,0)) as revenue,
           sum(coalesce(p.qty,0)) as qty
    from public.purchase_history p
    where p.month >= v_end_month - interval '2 months'
      and p.month < v_end_month + interval '1 month'
      and nullif(trim(p.sku),'') is not null
      and replace(lower(trim(p.category)),'ё','е') = any(array[
        'инструмент','инструмент ресанта','климатическое оборудование','лампы',
        'насосы','насосы ресанта','оборудование','расходные материалы',
        'ручной инструмент','садовая техника','сварочные аппараты',
        'стабилизаторы, латры','электрогенераторы','электроустановочные изделия'
      ])
    group by 1,2
  ), ranked as (
    select s.*,
           sum(s.revenue) filter(where s.revenue>0) over(partition by s.category) as positive_total,
           coalesce(sum(greatest(s.revenue,0)) over(
             partition by s.category order by s.revenue desc,s.qty desc,s.sku
             rows between unbounded preceding and 1 preceding
           ),0) as prior_revenue
    from sales s
  ), firsts as (
    select lower(trim(p.sku)) as sku,
           replace(lower(trim(p.category)),'ё','е') as category,
           min(p.month) as first_month
    from public.purchase_history p
    join (select distinct sku,category from sales) s
      on lower(trim(p.sku))=s.sku
     and replace(lower(trim(p.category)),'ё','е')=s.category
    group by 1,2
  ), classes as (
    select r.sku,r.category,
           case
             when r.revenue<=0 then 'R'
             when r.prior_revenue/nullif(r.positive_total,0)<0.80 then 'A'
             when r.prior_revenue/nullif(r.positive_total,0)<0.95 then 'B'
             when f.first_month>=date_trunc('month',current_date-interval '1 month')::date then 'N'
             else 'C'
           end as abc_class
    from ranked r
    left join firsts f using(sku,category)
  ), unique_sku as (
    -- A SKU occurring in more than one ABC group has no safe single label.
    select sku,min(abc_class) as abc_class
    from classes group by sku having count(*)=1
  )
  select coalesce(jsonb_object_agg(sku,abc_class),'{}'::jsonb) into v_classes
  from unique_sku;

  return jsonb_build_object(
    'month',to_char(v_end_month,'YYYY-MM'),
    'period_start',to_char((v_end_month-interval '2 months')::date,'YYYY-MM'),
    'period_end',to_char(v_end_month,'YYYY-MM'),
    'classes',coalesce(v_classes,'{}'::jsonb)
  );
end;
$function$;
revoke all on function public.warehouse_control_abc_classes_v1(date) from public, anon;
grant execute on function public.warehouse_control_abc_classes_v1(date) to authenticated, service_role;