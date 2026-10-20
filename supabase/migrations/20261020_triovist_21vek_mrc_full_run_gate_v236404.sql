-- RESANTA CRM v23.6.404
-- MRC must use only a FULL successful own-parser run matching the current registry.
-- This prevents push-test / diagnostic partial runs from replacing the MRC price source.

CREATE OR REPLACE FUNCTION public.triovist_21vek_mrc_dashboard_v236220()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_catalog'
AS $function$
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

  with registry_meta as (
    select count(*)::int targets
    from public.triovist_21vek_registry_v236214
  ), latest_run as (
    select r.id,r.finished_at,r.started_at
    from public.triovist_21vek_shadow_runs r
    cross join registry_meta g
    where r.status='complete'
      and coalesce(r.error_count,0)=0
      and coalesce(r.success_count,0)=coalesce(r.total_targets,0)
      and r.total_targets=g.targets
      and g.targets>0
    order by r.finished_at desc nulls last
    limit 1
  ), shadow_cards as (
    select distinct on (trim(s.sku))
      trim(s.sku) sku,s.product_name,s.manager_email,
      coalesce(r.manager_name,'—') manager_name,
      s.category,s.subgroup,s.product_url,s.current_price price,s.in_stock,s.observed_at
    from latest_run lr
    join public.triovist_21vek_shadow_snapshots s on s.run_id=lr.id and s.error_text is null
    left join public.triovist_21vek_registry_v236214 r
      on r.manager_email=s.manager_email and r.card_key=s.card_key
    where nullif(trim(s.sku),'') is not null
    order by trim(s.sku),s.observed_at desc
  ), working_cards as (
    select distinct on (trim(c.sku))
      trim(c.sku) sku,c.product_name,c.manager_email,c.manager_name,
      c.category,c.subgroup,c.product_url,c.price,c.in_stock,c.created_at observed_at
    from public.triovist_content_imports i
    join public.triovist_content_cards c on c.import_id=i.id
    where i.is_current and i.status='complete'
      and i.source_file like 'own-21vek-shadow:%'
      and nullif(trim(c.sku),'') is not null
    order by trim(c.sku),c.created_at desc
  ), cards as (
    select * from shadow_cards
    union all
    select * from working_cards
    where not exists(select 1 from latest_run)
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
  ), missing as (
    select *
    from joined
    where mrc_byn is null
    order by coalesce(in_stock,false) desc,sku
    limit 80
  )
  select jsonb_build_object(
    'version','v23.6.404',
    'source_file','РБ МРЦ 06.10.2026.xlsx',
    'effective_date',(select max(effective_date) from public.triovist_mrc_current where source_file='РБ МРЦ 06.10.2026.xlsx'),
    'price_source',case when exists(select 1 from latest_run) then 'latest_complete_own_parser' else 'working_snapshot_fallback' end,
    'price_run_id',(select id from latest_run),
    'price_observed_at',(select max(observed_at) from cards),
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
        'delta_byn',delta_byn,'delta_pct',delta_pct,'in_stock',in_stock,'observed_at',observed_at,
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
    'missing_mrc_rows',coalesce((
      select jsonb_agg(jsonb_build_object(
        'sku',sku,'product_name',product_name,'manager_email',manager_email,'manager_name',manager_name,
        'product_url',product_url,'price',price,'in_stock',in_stock,'observed_at',observed_at,
        'status','missing_mrc'
      ) order by coalesce(in_stock,false) desc,sku)
      from missing
    ),'[]'::jsonb),
    'generated_at',now()
  ) into result;

  return result;
end;
$function$;

grant execute on function public.triovist_21vek_mrc_dashboard_v236220() to authenticated;
