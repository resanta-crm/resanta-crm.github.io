-- Triovist / 21vek competitor price dynamics v23.6.283
-- Adds historical competitor prices for 3/7/10/14/20/30 day filters.
create or replace function public.triovist_market_dashboard_v236283()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public','auth','pg_catalog'
as $function$
declare
  v_actor record;
  result jsonb;
begin
  select * into v_actor from public.triovist_content_actor();

  if v_actor.actor_email is null or v_actor.actor_email not in (
    'payushin_ar@resanta.ru',
    'sidarovich_kn@resanta.ru',
    'aleksandrenko_av@resanta.ru',
    'krishtal_na@resanta.ru'
  ) then
    raise exception 'Нет доступа к конкурентам 21vek' using errcode='42501';
  end if;

  with configured_profiles as (
    select distinct profile_key
    from public.triovist_market_competitor_priority_v1
    where active and priority='main'
  ),
  primary_cmp as (
    select cmp.*
    from public.triovist_market_analysis_current_v1 cmp
    where cmp.is_primary
  ),
  products_tagged as (
    select p.*, s.profile_key, s.source_category, s.source_subgroup,
      case
        when cp.profile_key is null then true
        when pr.priority='main' and pr.active then true
        else false
      end as is_main_competitor
    from public.triovist_market_products_current_v1 p
    join public.triovist_market_scopes_v1 s on s.scope_key=p.scope_key
    left join configured_profiles cp on cp.profile_key=s.profile_key
    left join public.triovist_market_competitor_priority_v1 pr
      on pr.profile_key=s.profile_key
     and pr.brand_norm=lower(trim(coalesce(p.brand,'')))
     and pr.active
    where p.error_text is null and s.enabled
  ),
  brand_map as (
    select z.scope_key,
      jsonb_agg(jsonb_build_object(
        'brand',z.brand,
        'models',z.models,
        'best_position',z.best_position,
        'avg_position',z.avg_position,
        'share_pct',z.share_pct,
        'is_main_competitor',z.is_main_competitor
      ) order by z.models desc,z.best_position) brands
    from (
      select pt.scope_key,
        coalesce(nullif(pt.brand,''),'Не определён') brand,
        count(*) models,
        min(pt.position) best_position,
        round(avg(pt.position)::numeric,1) avg_position,
        round(count(*)*100.0/sum(count(*)) over(partition by pt.scope_key),1) share_pct,
        bool_or(pt.is_main_competitor) is_main_competitor
      from products_tagged pt
      group by pt.scope_key,coalesce(nullif(pt.brand,''),'Не определён')
    ) z
    group by z.scope_key
  ),
  scopes as (
    select jsonb_agg(jsonb_build_object(
      'scope_key',s.scope_key,
      'category',s.source_category,
      'subgroup',s.source_subgroup,
      'search_query',s.search_query,
      'profile_key',s.profile_key,
      'own_sku_count',s.own_sku_count,
      'competitors',(select count(*) from products_tagged p where p.scope_key=s.scope_key),
      'main_competitors',(select count(*) from products_tagged p where p.scope_key=s.scope_key and p.is_main_competitor),
      'brands',coalesce(b.brands,'[]'::jsonb),
      'gaps',(select count(*) from public.triovist_market_gaps_current_v1 g where g.scope_key=s.scope_key)
    ) order by s.source_category,s.source_subgroup) j
    from public.triovist_market_scopes_v1 s
    left join brand_map b on b.scope_key=s.scope_key
    where s.enabled
  ),
  rows as (
    select jsonb_agg(jsonb_build_object(
      'scope_key',pt.scope_key,
      'subgroup',pt.source_subgroup,
      'profile_key',pt.profile_key,
      'product_key',pt.product_key,
      'brand',pt.brand,
      'model',pt.model,
      'product_url',pt.product_url,
      'external_id',pt.external_id,
      'page_no',pt.page_no,
      'position',pt.position,
      'competitor_price',pt.current_price,
      'base_price',pt.base_price,
      'in_stock',pt.in_stock,
      'rating',pt.product_rating,
      'review_count',pt.review_count,
      'is_main_competitor',pt.is_main_competitor,
      'competitor_role',case when pt.is_main_competitor then 'main' else 'market_reference' end,
      'our_sku',cmp.our_sku,
      'our_product_name',o.product_name,
      'our_product_url',o.product_url,
      'our_price',cmp.our_price,
      'mrc_byn',cmp.mrc_byn,
      'mrc_delta_byn',cmp.mrc_delta_byn,
      'mrc_delta_pct',cmp.mrc_delta_pct,
      'price_delta_byn',cmp.price_delta_byn,
      'price_delta_pct',cmp.price_delta_pct,
      'similarity_score',cmp.similarity_score,
      'analog_grade',cmp.analog_grade,
      'competitiveness_score',cmp.competitiveness_score,
      'status',cmp.status,
      'advantages',cmp.advantages,
      'disadvantages',cmp.disadvantages,
      'recommendation',cmp.recommendation,
      'our_specs',cmp.our_specs,
      'competitor_specs',cmp.competitor_specs,
      'is_gap',(g.product_key is not null),
      'gap_reason',g.reason,
      'best_similarity',g.best_similarity,

      'price_3d',(select x.current_price
                  from public.triovist_market_product_snapshots_v1 x
                  where x.scope_key=pt.scope_key and x.product_key=pt.product_key
                    and x.observed_at<=now()-interval '3 days'
                    and x.error_text is null and x.current_price is not null and x.current_price>0
                  order by x.observed_at desc limit 1),
      'price_7d',(select x.current_price
                  from public.triovist_market_product_snapshots_v1 x
                  where x.scope_key=pt.scope_key and x.product_key=pt.product_key
                    and x.observed_at<=now()-interval '7 days'
                    and x.error_text is null and x.current_price is not null and x.current_price>0
                  order by x.observed_at desc limit 1),
      'price_10d',(select x.current_price
                  from public.triovist_market_product_snapshots_v1 x
                  where x.scope_key=pt.scope_key and x.product_key=pt.product_key
                    and x.observed_at<=now()-interval '10 days'
                    and x.error_text is null and x.current_price is not null and x.current_price>0
                  order by x.observed_at desc limit 1),
      'price_14d',(select x.current_price
                  from public.triovist_market_product_snapshots_v1 x
                  where x.scope_key=pt.scope_key and x.product_key=pt.product_key
                    and x.observed_at<=now()-interval '14 days'
                    and x.error_text is null and x.current_price is not null and x.current_price>0
                  order by x.observed_at desc limit 1),
      'price_20d',(select x.current_price
                  from public.triovist_market_product_snapshots_v1 x
                  where x.scope_key=pt.scope_key and x.product_key=pt.product_key
                    and x.observed_at<=now()-interval '20 days'
                    and x.error_text is null and x.current_price is not null and x.current_price>0
                  order by x.observed_at desc limit 1),
      'price_30d',(select x.current_price
                  from public.triovist_market_product_snapshots_v1 x
                  where x.scope_key=pt.scope_key and x.product_key=pt.product_key
                    and x.observed_at<=now()-interval '30 days'
                    and x.error_text is null and x.current_price is not null and x.current_price>0
                  order by x.observed_at desc limit 1),

      'position_7d',(select x.position
                  from public.triovist_market_product_snapshots_v1 x
                  where x.scope_key=pt.scope_key and x.product_key=pt.product_key
                    and x.observed_at<=now()-interval '7 days' and x.error_text is null
                  order by x.observed_at desc limit 1),
      'position_30d',(select x.position
                  from public.triovist_market_product_snapshots_v1 x
                  where x.scope_key=pt.scope_key and x.product_key=pt.product_key
                    and x.observed_at<=now()-interval '30 days' and x.error_text is null
                  order by x.observed_at desc limit 1)
    ) order by pt.scope_key,pt.position) j
    from products_tagged pt
    left join primary_cmp cmp on cmp.scope_key=pt.scope_key and cmp.product_key=pt.product_key
    left join public.triovist_market_own_specs_current_v1 o on o.sku=cmp.our_sku
    left join public.triovist_market_gaps_current_v1 g on g.scope_key=pt.scope_key and g.product_key=pt.product_key
  ),
  lr as (
    select to_jsonb(r) j
    from public.triovist_market_runs_v1 r
    order by r.started_at desc
    limit 1
  )
  select jsonb_build_object(
    'version','v23.6.283',
    'actor_email',v_actor.actor_email,
    'full_market_access',true,
    'allowed_users',jsonb_build_array('Паюшин','Сидорович','Александренко','Кришталь'),
    'price_history_days',jsonb_build_array(3,7,10,14,20,30),
    'summary',jsonb_build_object(
      'scopes',(select count(*) from public.triovist_market_scopes_v1 where enabled),
      'products',(select count(*) from products_tagged),
      'main_products',(select count(*) from products_tagged where is_main_competitor),
      'market_reference_products',(select count(*) from products_tagged where not is_main_competitor),
      'brands',(select count(distinct lower(brand)) from products_tagged where nullif(brand,'') is not null),
      'ours_stronger',(select count(*) from primary_cmp cmp join products_tagged p on p.scope_key=cmp.scope_key and p.product_key=cmp.product_key where p.is_main_competitor and cmp.status='ours_stronger'),
      'parity',(select count(*) from primary_cmp cmp join products_tagged p on p.scope_key=cmp.scope_key and p.product_key=cmp.product_key where p.is_main_competitor and cmp.status='parity'),
      'competitor_stronger',(select count(*) from primary_cmp cmp join products_tagged p on p.scope_key=cmp.scope_key and p.product_key=cmp.product_key where p.is_main_competitor and cmp.status='competitor_stronger'),
      'gaps',(select count(*) from public.triovist_market_gaps_current_v1),
      'below_mrc',(select count(*) from primary_cmp cmp join products_tagged p on p.scope_key=cmp.scope_key and p.product_key=cmp.product_key where p.is_main_competitor and coalesce(cmp.mrc_delta_pct,0)<0)
    ),
    'last_run',(select j from lr),
    'scopes',coalesce((select j from scopes),'[]'::jsonb),
    'rows',coalesce((select j from rows),'[]'::jsonb)
  ) into result;

  return result;
end;
$function$;

revoke all on function public.triovist_market_dashboard_v236283() from public;
grant execute on function public.triovist_market_dashboard_v236283() to authenticated;
