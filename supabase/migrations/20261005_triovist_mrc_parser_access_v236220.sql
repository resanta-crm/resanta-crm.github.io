-- RESANTA CRM v23.6.220
-- Triovist / 21vek: MRC visibility + exact competitor access + active-card deviation control.
-- MRC business data itself is uploaded from the approved workbook
-- "РБ МРЦ 06.10.2026.xlsx" into triovist_mrc_current/history.

create or replace function public.triovist_21vek_mrc_dashboard_v236220()
returns jsonb
language plpgsql
stable
security definer
set search_path=public,auth,pg_catalog
as $$
declare
  a record;
  result jsonb;
begin
  select * into a from public.triovist_content_actor();
  if a.actor_email is null or a.actor_email not in (
    'payushin_ar@resanta.ru',
    'sidarovich_kn@resanta.ru',
    'aleksandrenko_av@resanta.ru',
    'krishtal_na@resanta.ru'
  ) then
    raise exception 'Нет доступа к контролю МРЦ 21vek' using errcode='42501';
  end if;

  with cards as (
    select distinct on (trim(c.sku))
      trim(c.sku) sku,c.product_name,c.manager_email,c.manager_name,c.category,c.subgroup,
      c.product_url,c.price,c.in_stock
    from public.triovist_content_imports i
    join public.triovist_content_cards c on c.import_id=i.id
    where i.is_current and i.status='complete'
      and i.source_file like 'own-21vek-shadow:%'
      and nullif(trim(c.sku),'') is not null
    order by trim(c.sku),c.created_at desc
  ), joined as (
    select c.*,m.mrc_byn,
      case when m.mrc_byn>0 and c.price is not null then round(c.price-m.mrc_byn,2) end delta_byn,
      case when m.mrc_byn>0 and c.price is not null then round((c.price-m.mrc_byn)/m.mrc_byn*100,2) end delta_pct
    from cards c
    left join public.triovist_mrc_current m on trim(m.sku)=c.sku
  ), deviations as (
    select *
    from joined
    where mrc_byn is not null and price is not null and abs(coalesce(delta_pct,0))>=0.01
    order by
      case when in_stock and delta_pct<0 then 0
           when not coalesce(in_stock,false) and delta_pct<0 then 1
           else 2 end,
      delta_pct asc,sku
    limit 120
  )
  select jsonb_build_object(
    'version','v23.6.220',
    'source_file','РБ МРЦ 06.10.2026.xlsx',
    'effective_date',(select max(effective_date) from public.triovist_mrc_current where source_file='РБ МРЦ 06.10.2026.xlsx'),
    'summary',jsonb_build_object(
      'mrc_rows',(select count(*) from public.triovist_mrc_current where source_file='РБ МРЦ 06.10.2026.xlsx'),
      'cards',(select count(*) from joined),
      'with_mrc',(select count(*) from joined where mrc_byn is not null),
      'missing_mrc',(select count(*) from joined where mrc_byn is null),
      'below_mrc',(select count(*) from joined where delta_pct<0),
      'below_mrc_in_stock',(select count(*) from joined where in_stock is true and delta_pct<0),
      'critical_below_mrc',(select count(*) from joined where in_stock is true and delta_pct < -5),
      'below_mrc_out_stock',(select count(*) from joined where coalesce(in_stock,false)=false and delta_pct<0),
      'above_mrc',(select count(*) from joined where delta_pct>0),
      'at_mrc',(select count(*) from joined where mrc_byn is not null and abs(coalesce(delta_pct,0))<0.01)
    ),
    'rows',coalesce((
      select jsonb_agg(jsonb_build_object(
        'sku',sku,'product_name',product_name,'manager_email',manager_email,'manager_name',manager_name,
        'category',category,'subgroup',subgroup,'product_url',product_url,'price',price,'mrc_byn',mrc_byn,
        'delta_byn',delta_byn,'delta_pct',delta_pct,'in_stock',in_stock,
        'status',case
          when coalesce(in_stock,false)=false and delta_pct<0 then 'inactive_below'
          when delta_pct < -5 then 'critical'
          when delta_pct < -2 then 'warning'
          when delta_pct < 0 then 'slight'
          when delta_pct > 0 then 'above'
          else 'ok' end
      ) order by
        case when in_stock and delta_pct<0 then 0
             when not coalesce(in_stock,false) and delta_pct<0 then 1
             else 2 end,
        delta_pct asc,sku)
      from deviations
    ),'[]'::jsonb),
    'generated_at',now()
  ) into result;
  return result;
end;
$$;
grant execute on function public.triovist_21vek_mrc_dashboard_v236220() to authenticated;

create or replace function public.triovist_competitor_dashboard_v1()
returns jsonb
language plpgsql
stable
security definer
set search_path=public,auth,pg_catalog
as $$
declare
  a record;
  result jsonb;
begin
  select * into a from public.triovist_content_actor();
  if a.actor_email is null or a.actor_email not in (
    'payushin_ar@resanta.ru',
    'sidarovich_kn@resanta.ru',
    'aleksandrenko_av@resanta.ru',
    'krishtal_na@resanta.ru'
  ) then
    raise exception 'Нет доступа к конкурентам 21vek' using errcode='42501';
  end if;

  with ranked as (
    select x.*,
           row_number() over(partition by x.target_id order by x.similarity_score desc nulls last,x.competitiveness_score desc nulls last) rn
    from public.triovist_competitor_analysis_current x
  ),best as (
    select * from ranked where rn=1
  ),rows_cte as (
    select jsonb_agg(jsonb_build_object(
      'target_id',t.id,'subgroup',t.subgroup,'competitor_brand',t.competitor_brand,
      'competitor_query',t.product_query,'competitor_code',c.external_code,
      'competitor_name',c.product_name,'competitor_url',c.product_url,
      'competitor_price',c.current_price,'competitor_in_stock',c.in_stock,
      'observed_at',c.observed_at,'our_sku',x.our_sku,'our_product_name',x.our_product_name,
      'our_product_url',x.our_product_url,'our_price',x.our_price,'mrc_byn',x.mrc_byn,
      'mrc_delta_byn',x.mrc_delta_byn,'mrc_delta_pct',x.mrc_delta_pct,'mrc_status',x.mrc_status,
      'price_delta_byn',x.price_delta_byn,'price_delta_pct',x.price_delta_pct,
      'similarity_score',x.similarity_score,'competitiveness_score',x.competitiveness_score,
      'status',x.status,'advantages',x.advantages,'disadvantages',x.disadvantages,
      'recommendation',x.recommendation,'sales_pitch',x.sales_pitch,
      'our_specs',x.our_specs,'competitor_specs',x.competitor_specs
    ) order by t.competitor_brand,x.rn) as j
    from ranked x
    join public.triovist_competitor_targets t on t.id=x.target_id
    left join public.triovist_competitor_current c on c.target_id=t.id
    where t.collect_enabled and x.rn<=5
  ),last_run as (
    select to_jsonb(r) j from public.triovist_competitor_runs r order by r.started_at desc limit 1
  )
  select jsonb_build_object(
    'pilot_subgroup','Дрели-шуруповерты аккумуляторные',
    'allowed_users',jsonb_build_array('Паюшин','Сидарович','Александренко','Кришталь'),
    'summary',jsonb_build_object(
      'targets',(select count(*) from public.triovist_competitor_targets where collect_enabled),
      'with_data',(select count(*) from public.triovist_competitor_current c join public.triovist_competitor_targets t on t.id=c.target_id where t.collect_enabled and c.error_text is null),
      'ours_stronger',(select count(*) from best where status='ours_stronger'),
      'parity',(select count(*) from best where status='parity'),
      'competitor_stronger',(select count(*) from best where status='competitor_stronger'),
      'below_mrc',(select count(*) from best where coalesce(mrc_delta_pct,0)<0),
      'strong_mrc_violation',(select count(*) from best where coalesce(mrc_delta_pct,0)<-5)
    ),
    'last_run',(select j from last_run),
    'rows',coalesce((select j from rows_cte),'[]'::jsonb)
  ) into result;
  return result;
end;
$$;
grant execute on function public.triovist_competitor_dashboard_v1() to authenticated;
