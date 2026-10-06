-- RESANTA CRM v23.6.228 · fix competitor dashboard/export SQL aliases
-- Root cause: PL/pgSQL actor variable "a" collided with SQL alias "a".
-- Also fixes the Excel summary CTE lifetime bug.
-- No parser/data model changes; this only restores the already-collected market data UI/export.

create or replace function public.triovist_market_dashboard_v236224()
returns jsonb
language plpgsql
stable
security definer
set search_path=public,auth,pg_catalog
as $$
declare
  v_actor record;
  result jsonb;
begin
  select * into v_actor from public.triovist_content_actor();
  if v_actor.actor_email is null or v_actor.actor_email not in (
    'payushin_ar@resanta.ru','sidarovich_kn@resanta.ru',
    'aleksandrenko_av@resanta.ru','krishtal_na@resanta.ru'
  ) then
    raise exception 'Нет доступа к конкурентам 21vek' using errcode='42501';
  end if;

  with primary_cmp as (
    select cmp.*
    from public.triovist_market_analysis_current_v1 cmp
    where cmp.is_primary
  ),
  brand_map as (
    select p.scope_key,
      jsonb_agg(jsonb_build_object(
        'brand',p.brand,'models',p.models,'best_position',p.best_position,
        'avg_position',p.avg_position,'share_pct',p.share_pct
      ) order by p.models desc,p.best_position) brands
    from (
      select scope_key,coalesce(nullif(brand,''),'Не определён') brand,
        count(*) models,min(position) best_position,
        round(avg(position)::numeric,1) avg_position,
        round(count(*)*100.0/sum(count(*)) over(partition by scope_key),1) share_pct
      from public.triovist_market_products_current_v1
      where error_text is null
      group by scope_key,coalesce(nullif(brand,''),'Не определён')
    ) p
    group by p.scope_key
  ),
  scopes as (
    select jsonb_agg(jsonb_build_object(
      'scope_key',s.scope_key,'category',s.source_category,'subgroup',s.source_subgroup,
      'search_query',s.search_query,'profile_key',s.profile_key,'own_sku_count',s.own_sku_count,
      'competitors',(select count(*) from public.triovist_market_products_current_v1 p where p.scope_key=s.scope_key and p.error_text is null),
      'brands',coalesce(b.brands,'[]'::jsonb),
      'gaps',(select count(*) from public.triovist_market_gaps_current_v1 g where g.scope_key=s.scope_key)
    ) order by s.source_category,s.source_subgroup) j
    from public.triovist_market_scopes_v1 s
    left join brand_map b on b.scope_key=s.scope_key
    where s.enabled
  ),
  rows as (
    select jsonb_agg(jsonb_build_object(
      'scope_key',p.scope_key,'subgroup',s.source_subgroup,'profile_key',s.profile_key,
      'product_key',p.product_key,'brand',p.brand,'model',p.model,'product_url',p.product_url,
      'external_id',p.external_id,'page_no',p.page_no,'position',p.position,
      'competitor_price',p.current_price,'base_price',p.base_price,'in_stock',p.in_stock,
      'rating',p.product_rating,'review_count',p.review_count,
      'our_sku',cmp.our_sku,'our_product_name',o.product_name,'our_product_url',o.product_url,
      'our_price',cmp.our_price,'mrc_byn',cmp.mrc_byn,'mrc_delta_byn',cmp.mrc_delta_byn,'mrc_delta_pct',cmp.mrc_delta_pct,
      'price_delta_byn',cmp.price_delta_byn,'price_delta_pct',cmp.price_delta_pct,
      'similarity_score',cmp.similarity_score,'analog_grade',cmp.analog_grade,
      'competitiveness_score',cmp.competitiveness_score,'status',cmp.status,
      'advantages',cmp.advantages,'disadvantages',cmp.disadvantages,'recommendation',cmp.recommendation,
      'our_specs',cmp.our_specs,'competitor_specs',cmp.competitor_specs,
      'is_gap',(g.product_key is not null),'gap_reason',g.reason,'best_similarity',g.best_similarity,
      'price_7d',(select x.current_price from public.triovist_market_product_snapshots_v1 x
                  where x.scope_key=p.scope_key and x.product_key=p.product_key
                    and x.observed_at<=now()-interval '7 days' and x.error_text is null
                  order by x.observed_at desc limit 1),
      'position_7d',(select x.position from public.triovist_market_product_snapshots_v1 x
                  where x.scope_key=p.scope_key and x.product_key=p.product_key
                    and x.observed_at<=now()-interval '7 days' and x.error_text is null
                  order by x.observed_at desc limit 1),
      'price_30d',(select x.current_price from public.triovist_market_product_snapshots_v1 x
                  where x.scope_key=p.scope_key and x.product_key=p.product_key
                    and x.observed_at<=now()-interval '30 days' and x.error_text is null
                  order by x.observed_at desc limit 1),
      'position_30d',(select x.position from public.triovist_market_product_snapshots_v1 x
                  where x.scope_key=p.scope_key and x.product_key=p.product_key
                    and x.observed_at<=now()-interval '30 days' and x.error_text is null
                  order by x.observed_at desc limit 1)
    ) order by p.scope_key,p.position)
    j
    from public.triovist_market_products_current_v1 p
    join public.triovist_market_scopes_v1 s on s.scope_key=p.scope_key
    left join primary_cmp cmp on cmp.scope_key=p.scope_key and cmp.product_key=p.product_key
    left join public.triovist_market_own_specs_current_v1 o on o.sku=cmp.our_sku
    left join public.triovist_market_gaps_current_v1 g on g.scope_key=p.scope_key and g.product_key=p.product_key
    where p.error_text is null and s.enabled
  ),
  lr as (
    select to_jsonb(r) j from public.triovist_market_runs_v1 r order by r.started_at desc limit 1
  )
  select jsonb_build_object(
    'version','v23.6.224',
    'allowed_users',jsonb_build_array('Паюшин','Сидарович','Александренко','Кришталь'),
    'summary',jsonb_build_object(
      'scopes',(select count(*) from public.triovist_market_scopes_v1 where enabled),
      'products',(select count(*) from public.triovist_market_products_current_v1 where error_text is null),
      'brands',(select count(distinct lower(brand)) from public.triovist_market_products_current_v1 where error_text is null and nullif(brand,'') is not null),
      'ours_stronger',(select count(*) from primary_cmp where status='ours_stronger'),
      'parity',(select count(*) from primary_cmp where status='parity'),
      'competitor_stronger',(select count(*) from primary_cmp where status='competitor_stronger'),
      'gaps',(select count(*) from public.triovist_market_gaps_current_v1),
      'below_mrc',(select count(*) from primary_cmp where coalesce(mrc_delta_pct,0)<0)
    ),
    'last_run',(select j from lr),
    'scopes',coalesce((select j from scopes),'[]'::jsonb),
    'rows',coalesce((select j from rows),'[]'::jsonb)
  ) into result;
  return result;
end;
$$;
grant execute on function public.triovist_market_dashboard_v236224() to authenticated;

create or replace function public.triovist_market_export_v236224(
  p_kind text,
  p_offset integer default 0,
  p_limit integer default 500
)
returns jsonb
language plpgsql
stable
security definer
set search_path=public,auth,pg_catalog
as $$
declare
  v_actor record;
  k text:=lower(trim(coalesce(p_kind,'')));
  off int:=greatest(coalesce(p_offset,0),0);
  lim int:=least(greatest(coalesce(p_limit,500),1),500);
  rowsj jsonb:='[]'::jsonb;
  totaln int:=0;
begin
  select * into v_actor from public.triovist_content_actor();
  if v_actor.actor_email is null or v_actor.actor_email not in (
    'payushin_ar@resanta.ru','sidarovich_kn@resanta.ru',
    'aleksandrenko_av@resanta.ru','krishtal_na@resanta.ru'
  ) then raise exception 'Нет доступа к выгрузке конкурентов 21vek' using errcode='42501'; end if;

  if k='comparison' then
    with q as (
      select s.source_category as "Группа",s.source_subgroup as "Подгруппа",
        cmp.our_sku as "Наш SKU",o.product_name as "Наш товар",cmp.mrc_byn as "МРЦ",
        cmp.our_price as "Наша цена",cmp.mrc_delta_pct as "Отклонение МРЦ %",
        p.brand as "Бренд конкурента",p.model as "Модель конкурента",p.position as "Позиция",
        p.page_no as "Страница",p.current_price as "Цена конкурента",
        cmp.price_delta_pct as "Разница цены %",cmp.similarity_score as "Сопоставимость %",
        cmp.analog_grade as "Класс аналога",cmp.advantages as "Наши преимущества",
        cmp.disadvantages as "Преимущества конкурента",cmp.status as "Итог",
        cmp.recommendation as "Рекомендация",o.product_url as "Ссылка наша",
        p.product_url as "Ссылка конкурента"
      from public.triovist_market_analysis_current_v1 cmp
      join public.triovist_market_products_current_v1 p on p.scope_key=cmp.scope_key and p.product_key=cmp.product_key
      join public.triovist_market_scopes_v1 s on s.scope_key=cmp.scope_key
      left join public.triovist_market_own_specs_current_v1 o on o.sku=cmp.our_sku
      where cmp.is_primary
      order by s.source_category,s.source_subgroup,p.position
    )
    select count(*),coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) into totaln,rowsj
    from (select * from q offset off limit lim) x;
    select count(*) into totaln from public.triovist_market_analysis_current_v1 where is_primary;

  elsif k='raw' then
    select count(*) into totaln from public.triovist_market_products_current_v1;
    select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) into rowsj
    from (
      select s.source_category as "Группа",s.source_subgroup as "Подгруппа",p.search_query as "Запрос 21vek",
        p.position as "Позиция",p.page_no as "Страница",p.brand as "Бренд",p.model as "Модель",
        p.external_id as "ID 21vek",p.current_price as "Цена",p.base_price as "Старая цена",
        p.in_stock as "В наличии",p.product_rating as "Рейтинг",p.review_count as "Отзывы",
        p.specs_normalized as "Характеристики",p.observed_at as "Проверено",p.product_url as "Ссылка",
        p.error_text as "Ошибка"
      from public.triovist_market_products_current_v1 p
      join public.triovist_market_scopes_v1 s on s.scope_key=p.scope_key
      order by s.source_category,s.source_subgroup,p.position
      offset off limit lim
    ) x;

  elsif k='gaps' then
    select count(*) into totaln from public.triovist_market_gaps_current_v1;
    select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) into rowsj
    from (
      select s.source_category as "Группа",s.source_subgroup as "Подгруппа",p.brand as "Бренд",
        p.model as "Модель",p.position as "Позиция",p.current_price as "Цена конкурента",
        g.best_similarity as "Лучшее совпадение %",g.reason as "Причина",p.product_url as "Ссылка конкурента"
      from public.triovist_market_gaps_current_v1 g
      join public.triovist_market_products_current_v1 p on p.scope_key=g.scope_key and p.product_key=g.product_key
      join public.triovist_market_scopes_v1 s on s.scope_key=g.scope_key
      order by s.source_category,s.source_subgroup,p.position
      offset off limit lim
    ) x;

  elsif k='errors' then
    select count(*) into totaln from public.triovist_market_products_current_v1 where error_text is not null;
    select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) into rowsj
    from (
      select s.source_category as "Группа",s.source_subgroup as "Подгруппа",p.position as "Позиция",
        p.brand as "Бренд",p.model as "Модель",p.product_url as "Ссылка",p.error_text as "Ошибка",
        p.observed_at as "Проверено"
      from public.triovist_market_products_current_v1 p
      join public.triovist_market_scopes_v1 s on s.scope_key=p.scope_key
      where p.error_text is not null
      order by s.source_category,s.source_subgroup,p.position
      offset off limit lim
    ) x;

  elsif k='summary' then
    with brands as (
      select scope_key,string_agg(brand||' — '||cnt,', ' order by cnt desc,brand) brands
      from (
        select scope_key,coalesce(nullif(brand,''),'Не определён') brand,count(*) cnt
        from public.triovist_market_products_current_v1 where error_text is null
        group by scope_key,coalesce(nullif(brand,''),'Не определён')
      ) b group by scope_key
    )
    select count(*) into totaln from public.triovist_market_scopes_v1 where enabled;
    with brands as (
      select scope_key,string_agg(brand||' — '||cnt,', ' order by cnt desc,brand) brands
      from (
        select scope_key,coalesce(nullif(brand,''),'Не определён') brand,count(*) cnt
        from public.triovist_market_products_current_v1 where error_text is null
        group by scope_key,coalesce(nullif(brand,''),'Не определён')
      ) b group by scope_key
    )
    select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) into rowsj
    from (
      select s.source_category as "Группа",s.source_subgroup as "Подгруппа",s.own_sku_count as "Наших SKU",
        (select count(*) from public.triovist_market_products_current_v1 p where p.scope_key=s.scope_key and p.error_text is null) as "Конкурентов",
        coalesce(b.brands,'') as "Бренды TOP-2",
        (select count(*) from public.triovist_market_analysis_current_v1 cmp where cmp.scope_key=s.scope_key and cmp.is_primary and cmp.status='ours_stronger') as "Мы сильнее",
        (select count(*) from public.triovist_market_analysis_current_v1 cmp where cmp.scope_key=s.scope_key and cmp.is_primary and cmp.status='parity') as "Паритет",
        (select count(*) from public.triovist_market_analysis_current_v1 cmp where cmp.scope_key=s.scope_key and cmp.is_primary and cmp.status='competitor_stronger') as "Конкурент сильнее",
        (select count(*) from public.triovist_market_gaps_current_v1 g where g.scope_key=s.scope_key) as "Пробелы ассортимента",
        (select count(*) from public.triovist_market_analysis_current_v1 cmp where cmp.scope_key=s.scope_key and cmp.is_primary and coalesce(cmp.mrc_delta_pct,0)<0) as "Ниже МРЦ"
      from public.triovist_market_scopes_v1 s
      left join brands b on b.scope_key=s.scope_key
      where s.enabled
      order by s.source_category,s.source_subgroup
      offset off limit lim
    ) x;
  else
    raise exception 'Unknown export kind' using errcode='22023';
  end if;

  return jsonb_build_object('kind',k,'rows',rowsj,'total',totaln,'offset',off,'limit',lim,
    'has_more',(off+jsonb_array_length(rowsj)<totaln));
end;
$$;
grant execute on function public.triovist_market_export_v236224(text,integer,integer) to authenticated;
