-- RESANTA CRM v23.6.221
-- Fast paged Excel export for Triovist / 21vek with MRC control.
create or replace function public.triovist_content_export_v236221(
  p_manager_email text default null,
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
  a record;
  v_filter text:=lower(trim(coalesce(p_manager_email,'')));
  v_offset integer:=greatest(coalesce(p_offset,0),0);
  v_limit integer:=least(greatest(coalesce(p_limit,500),1),500);
  v_rows jsonb:='[]'::jsonb;
  v_total integer:=0;
  v_snapshot date;
begin
  select * into a from public.triovist_content_actor();
  if a.actor_email is null then
    raise exception 'Пользователь не найден' using errcode='42501';
  end if;

  if a.actor_email in ('payushin_ar@resanta.ru','sidarovich_kn@resanta.ru') then
    if v_filter not in ('','aleksandrenko_av@resanta.ru','krishtal_na@resanta.ru') then
      raise exception 'Некорректный менеджер' using errcode='22023';
    end if;
  elsif a.actor_email in ('aleksandrenko_av@resanta.ru','krishtal_na@resanta.ru') then
    v_filter:=a.actor_email;
  else
    raise exception 'Нет доступа к выгрузке 21vek' using errcode='42501';
  end if;

  with ci as materialized (
    select id,manager_email,snapshot_date
    from public.triovist_content_imports
    where is_current and status='complete'
      and (v_filter='' or manager_email=v_filter)
  )
  select count(*),max(ci.snapshot_date)
  into v_total,v_snapshot
  from ci
  join public.triovist_content_cards c on c.import_id=ci.id;

  with ci as materialized (
    select id,manager_email,snapshot_date
    from public.triovist_content_imports
    where is_current and status='complete'
      and (v_filter='' or manager_email=v_filter)
  ),
  page_rows as (
    select
      c.manager_name,
      c.manager_email,
      c.sku,
      c.donor_article,
      c.product_name,
      c.category,
      c.subgroup,
      c.product_url,
      c.price,
      m.mrc_byn,
      case when m.mrc_byn>0 and c.price is not null
           then round(c.price-m.mrc_byn,2) end as mrc_delta_byn,
      case when m.mrc_byn>0 and c.price is not null
           then round((c.price-m.mrc_byn)/m.mrc_byn*100,2) end as mrc_delta_pct,
      case
        when m.mrc_byn is null then 'Нет МРЦ'
        when c.price is null then 'Нет цены'
        when coalesce(c.in_stock,false)=false and c.price<m.mrc_byn then 'Ниже МРЦ · нет в наличии'
        when c.price<m.mrc_byn*0.95 then 'Ниже МРЦ >5%'
        when c.price<m.mrc_byn*0.98 then 'Ниже МРЦ 2–5%'
        when c.price<m.mrc_byn then 'Ниже МРЦ <2%'
        when c.price=m.mrc_byn then 'МРЦ'
        else 'Выше МРЦ'
      end as mrc_status,
      c.description_present,
      c.warranty_present,
      c.keyword,
      c.listing_position,
      case
        when c.listing_position is not null and c.listing_position<=30 then 'TOP-30'
        when c.listing_position is not null and c.listing_position<=60 then 'TOP-60'
        when c.listing_position is not null and c.listing_position>60 then 'Вне TOP-60'
        else 'Не проверено'
      end as top_status,
      c.product_rating,
      c.last_review_rating,
      c.review_count,
      c.photo_count,
      c.video_count,
      c.in_stock,
      c.negative_reviews,
      c.unanswered_negative_reviews,
      c.latest_review_date,
      c.latest_review_text,
      c.latest_review_answered,
      ci.snapshot_date
    from ci
    join public.triovist_content_cards c on c.import_id=ci.id
    left join public.triovist_mrc_current m on trim(m.sku)=trim(c.sku)
    order by c.manager_name,c.category,c.subgroup,c.product_name,c.sku
    limit v_limit offset v_offset
  )
  select coalesce(jsonb_agg(to_jsonb(page_rows)),'[]'::jsonb)
  into v_rows
  from page_rows;

  return jsonb_build_object(
    'version','v23.6.221',
    'rows',v_rows,
    'total',v_total,
    'offset',v_offset,
    'limit',v_limit,
    'has_more',(v_offset + jsonb_array_length(v_rows) < v_total),
    'snapshot_date',v_snapshot,
    'manager_filter',nullif(v_filter,'')
  );
end;
$$;
grant execute on function public.triovist_content_export_v236221(text,integer,integer) to authenticated;