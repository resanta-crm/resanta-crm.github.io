-- RESANTA CRM v23.6.351
-- Own 21vek positional listing: exact positions, movement history and cached metrics.
-- Competitor parser is intentionally untouched.

create table if not exists public.triovist_21vek_position_metrics_v236351 (
  manager_email text not null,
  manager_name text not null,
  card_key text not null,
  sku text,
  donor_article text,
  product_name text,
  category text,
  subgroup text,
  keyword text,
  current_position integer,
  current_exact boolean not null default false,
  current_top60 boolean,
  current_label text not null,
  current_observed_at timestamptz not null,
  previous_position integer,
  previous_label text not null default '—',
  previous_observed_at timestamptz,
  position_delta integer,
  movement text not null,
  pos_1d text not null default '—',
  pos_3d text not null default '—',
  pos_7d text not null default '—',
  pos_14d text not null default '—',
  pos_30d text not null default '—',
  best_30d integer,
  worst_30d text not null default '—',
  changed_at timestamptz,
  price_21vek numeric,
  mrc_byn numeric,
  in_stock boolean,
  search_total integer,
  current_error text,
  reason_context jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key(manager_email,card_key)
);

create index if not exists triovist_21vek_position_metrics_mgr_move_v236351_idx
  on public.triovist_21vek_position_metrics_v236351(lower(manager_email),movement,current_position);
create index if not exists triovist_21vek_position_metrics_sku_v236351_idx
  on public.triovist_21vek_position_metrics_v236351(lower(manager_email),sku);
create index if not exists triovist_21vek_position_metrics_changed_v236351_idx
  on public.triovist_21vek_position_metrics_v236351(lower(manager_email),changed_at desc);

alter table public.triovist_21vek_position_metrics_v236351 enable row level security;
revoke all on public.triovist_21vek_position_metrics_v236351 from public,anon,authenticated;

CREATE OR REPLACE FUNCTION private.triovist_own_listing_metrics_v236351(p_manager_filter text DEFAULT ''::text)
 RETURNS TABLE(manager_email text, manager_name text, card_key text, sku text, donor_article text, product_name text, category text, subgroup text, keyword text, current_position integer, current_exact boolean, current_top60 boolean, current_label text, current_observed_at timestamp with time zone, previous_position integer, previous_label text, previous_observed_at timestamp with time zone, position_delta integer, movement text, pos_1d text, pos_3d text, pos_7d text, pos_14d text, pos_30d text, best_30d integer, worst_30d text, changed_at timestamp with time zone, price_21vek numeric, mrc_byn numeric, in_stock boolean, search_total integer, current_error text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'private', 'pg_catalog'
AS $function$
with curr as materialized (
  select
    c.manager_email,
    c.manager_name,
    c.card_key,
    c.sku,
    c.donor_article,
    c.product_name,
    c.category,
    c.subgroup,
    coalesce(nullif(btrim(t.keyword),''),nullif(btrim(tc.keyword),''),c.keyword,'') keyword,
    coalesce(t.position,tc.position) current_position,
    coalesce(t.position_exact,tc.position_exact,false) current_exact,
    coalesce(t.top60,tc.top60) current_top60,
    private.triovist_position_label_v236351(
      coalesce(t.position,tc.position),
      coalesce(t.position_exact,tc.position_exact,false),
      coalesce(t.top60,tc.top60),
      coalesce(t.error_text,tc.error_text)
    ) current_label,
    coalesce(t.observed_at,tc.observed_at,ci.completed_at,ci.created_at) current_observed_at,
    c.price price_21vek,
    m.mrc_byn,
    c.in_stock,
    coalesce(t.search_total,tc.search_total) search_total,
    coalesce(t.error_text,tc.error_text) current_error
  from public.triovist_content_imports ci
  join public.triovist_content_cards c on c.import_id=ci.id
  left join public.triovist_21vek_top_snapshots t
    on t.run_id=(
      case
        when substring(ci.source_file from 'top:([0-9a-fA-F-]{36})$') is not null
        then substring(ci.source_file from 'top:([0-9a-fA-F-]{36})$')::uuid
        else null
      end
    )
   and t.manager_email=c.manager_email
   and t.card_key=c.card_key
  left join public.triovist_21vek_top_current tc
    on t.id is null
   and tc.manager_email=c.manager_email
   and tc.card_key=c.card_key
  left join public.triovist_mrc_current m on btrim(m.sku)=btrim(c.sku)
  where ci.is_current and ci.status='complete'
    and (coalesce(p_manager_filter,'')='' or lower(c.manager_email)=lower(p_manager_filter))
),
hist as materialized (
  select
    c.manager_email,
    c.card_key,
    c.current_label,
    c.current_observed_at,
    s.observed_at,
    s.position,
    s.position_exact,
    s.top60,
    s.error_text,
    private.triovist_position_label_v236351(s.position,s.position_exact,s.top60,s.error_text) state_label
  from curr c
  join public.triovist_21vek_top_snapshots s
    on s.manager_email=c.manager_email
   and s.card_key=c.card_key
   and s.observed_at<=c.current_observed_at
  join public.triovist_21vek_top_runs r
    on r.id=s.run_id
   and r.status='complete'
),
ranked0 as (
  select
    h.*,
    row_number() over(partition by h.manager_email,h.card_key order by h.observed_at desc) rn
  from hist h
),
ranked as (
  select
    r0.*,
    min(case when r0.state_label is distinct from r0.current_label then r0.rn end)
      over(partition by r0.manager_email,r0.card_key) first_diff_rn
  from ranked0 r0
),
agg as (
  select
    c.manager_email,c.card_key,
    (array_agg(r.position order by r.observed_at desc) filter(where r.rn=2))[1] previous_position,
    (array_agg(r.state_label order by r.observed_at desc) filter(where r.rn=2))[1] previous_label,
    (array_agg(r.observed_at order by r.observed_at desc) filter(where r.rn=2))[1] previous_observed_at,
    (array_agg(r.state_label order by r.observed_at desc)
      filter(where r.observed_at<=c.current_observed_at-interval '1 day'))[1] pos_1d,
    (array_agg(r.state_label order by r.observed_at desc)
      filter(where r.observed_at<=c.current_observed_at-interval '3 days'))[1] pos_3d,
    (array_agg(r.state_label order by r.observed_at desc)
      filter(where r.observed_at<=c.current_observed_at-interval '7 days'))[1] pos_7d,
    (array_agg(r.state_label order by r.observed_at desc)
      filter(where r.observed_at<=c.current_observed_at-interval '14 days'))[1] pos_14d,
    (array_agg(r.state_label order by r.observed_at desc)
      filter(where r.observed_at<=c.current_observed_at-interval '30 days'))[1] pos_30d,
    min(r.position) filter(
      where r.position_exact and r.position between 1 and 60
        and r.observed_at>=c.current_observed_at-interval '30 days'
    ) best_30d,
    case
      when bool_or(r.top60 is false) filter(where r.observed_at>=c.current_observed_at-interval '30 days') then '>60'
      else max(r.position) filter(
        where r.position_exact and r.position between 1 and 60
          and r.observed_at>=c.current_observed_at-interval '30 days'
      )::text
    end worst_30d,
    min(r.observed_at) filter(
      where r.rn < coalesce(r.first_diff_rn,2147483647)
    ) changed_at
  from curr c
  left join ranked r
    on r.manager_email=c.manager_email and r.card_key=c.card_key
  group by c.manager_email,c.card_key,c.current_observed_at
)
select
  c.manager_email,
  c.manager_name,
  c.card_key,
  c.sku,
  c.donor_article,
  c.product_name,
  c.category,
  c.subgroup,
  c.keyword,
  c.current_position,
  c.current_exact,
  c.current_top60,
  c.current_label,
  c.current_observed_at,
  a.previous_position,
  coalesce(a.previous_label,'—') previous_label,
  a.previous_observed_at,
  case
    when c.current_exact and a.previous_position between 1 and 60
      then a.previous_position-c.current_position
    else null
  end position_delta,
  case
    when a.previous_label is null then 'new'
    when c.current_label='Ошибка' then 'error'
    when c.current_exact and a.previous_position between 1 and 60 and c.current_position<a.previous_position then 'up'
    when c.current_exact and a.previous_position between 1 and 60 and c.current_position>a.previous_position then 'down'
    when c.current_exact and a.previous_position between 1 and 60 and c.current_position=a.previous_position then 'same'
    when c.current_exact and a.previous_label='>60' then 'entered'
    when c.current_label='>60' and a.previous_position between 1 and 60 then 'exited'
    when c.current_label='>60' and a.previous_label='>60' then 'outside'
    else 'unknown'
  end movement,
  coalesce(a.pos_1d,'—') pos_1d,
  coalesce(a.pos_3d,'—') pos_3d,
  coalesce(a.pos_7d,'—') pos_7d,
  coalesce(a.pos_14d,'—') pos_14d,
  coalesce(a.pos_30d,'—') pos_30d,
  a.best_30d,
  coalesce(a.worst_30d,'—') worst_30d,
  coalesce(a.changed_at,c.current_observed_at) changed_at,
  c.price_21vek,
  c.mrc_byn,
  c.in_stock,
  c.search_total,
  c.current_error
from curr c
left join agg a on a.manager_email=c.manager_email and a.card_key=c.card_key
$function$


CREATE OR REPLACE FUNCTION private.triovist_position_label_v236351(p_position integer, p_position_exact boolean, p_top60 boolean, p_error text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  select case
    when nullif(btrim(coalesce(p_error,'')),'') is not null then 'Ошибка'
    when coalesce(p_position_exact,false) and p_position between 1 and 60 then p_position::text
    when p_top60 is false then '>60'
    else 'Не проверено'
  end
$function$


CREATE OR REPLACE FUNCTION private.triovist_refresh_position_metrics_trigger_v236351()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'pg_catalog'
AS $function$
begin
  if new.is_current and new.status='complete' then
    if tg_op='INSERT'
       or old.is_current is distinct from new.is_current
       or old.status is distinct from new.status
       or old.source_file is distinct from new.source_file then
      begin
        perform private.triovist_refresh_position_metrics_v236351(new.manager_email);
      exception when others then
        raise warning 'TRIOVIST_POSITION_METRICS_REFRESH_FAILED manager=% error=%',new.manager_email,sqlerrm;
      end;
    end if;
  end if;
  return new;
end;
$function$


CREATE OR REPLACE FUNCTION private.triovist_refresh_position_metrics_v236351(p_manager_email text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'pg_catalog'
AS $function$
declare
  v_email text:=lower(btrim(coalesce(p_manager_email,'')));
  v_count integer:=0;
begin
  if v_email not in ('aleksandrenko_av@resanta.ru','krishtal_na@resanta.ru') then
    return 0;
  end if;

  delete from public.triovist_21vek_position_metrics_v236351
   where lower(manager_email)=v_email;

  insert into public.triovist_21vek_position_metrics_v236351(
    manager_email,manager_name,card_key,sku,donor_article,product_name,category,subgroup,keyword,
    current_position,current_exact,current_top60,current_label,current_observed_at,
    previous_position,previous_label,previous_observed_at,position_delta,movement,
    pos_1d,pos_3d,pos_7d,pos_14d,pos_30d,best_30d,worst_30d,changed_at,
    price_21vek,mrc_byn,in_stock,search_total,current_error,reason_context,updated_at
  )
  select
    x.manager_email,x.manager_name,x.card_key,x.sku,x.donor_article,x.product_name,x.category,x.subgroup,x.keyword,
    x.current_position,x.current_exact,x.current_top60,x.current_label,x.current_observed_at,
    x.previous_position,x.previous_label,x.previous_observed_at,x.position_delta,x.movement,
    x.pos_1d,x.pos_3d,x.pos_7d,x.pos_14d,x.pos_30d,x.best_30d,x.worst_30d,x.changed_at,
    x.price_21vek,x.mrc_byn,x.in_stock,x.search_total,x.current_error,
    jsonb_build_object(
      'schema_version','v23.6.351',
      'price_21vek',x.price_21vek,
      'mrc_byn',x.mrc_byn,
      'in_stock',x.in_stock,
      'future_reason_analysis',true
    ),
    now()
  from private.triovist_own_listing_metrics_v236351(v_email) x;

  get diagnostics v_count=row_count;
  return v_count;
end;
$function$


CREATE OR REPLACE FUNCTION public.triovist_content_export_v236221(p_manager_email text DEFAULT NULL::text, p_offset integer DEFAULT 0, p_limit integer DEFAULT 500)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_catalog'
AS $function$
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
    select id,manager_email,snapshot_date,source_file
    from public.triovist_content_imports
    where is_current and status='complete'
      and (v_filter='' or manager_email=v_filter)
  )
  select count(*),max(ci.snapshot_date)
  into v_total,v_snapshot
  from ci
  join public.triovist_content_cards c on c.import_id=ci.id;

  with ci as materialized (
    select id,manager_email,snapshot_date,source_file
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
      coalesce(pm.keyword,nullif(trim(t.keyword),''),c.keyword) as keyword,

      -- Старые поля оставлены для обратной совместимости.
      case
        when coalesce(t.position_exact,false) then t.position::numeric
        else c.listing_position
      end as listing_position,
      t.position as top_position,
      t.position_exact as top_position_exact,
      coalesce(t.top30,case when c.listing_position is not null then c.listing_position<=30 else null end) as top30,
      coalesce(t.top60,case when c.listing_position is not null then c.listing_position<=60 else null end) as top60,
      t.search_total as top_search_total,
      t.error_text as top_error,
      case
        when t.error_text is not null then 'Ошибка'
        when t.top30 is true then 'TOP-30'
        when t.top60 is true then 'TOP-60'
        when t.top60 is false then 'Вне TOP-60'
        when c.listing_position between 1 and 30 then 'TOP-30'
        when c.listing_position between 31 and 60 then 'TOP-60'
        when c.listing_position>60 then 'Вне TOP-60'
        else 'Не проверено'
      end as top_status,

      -- v23.6.351: позиционный листинг.
      pm.current_label as position_now,
      pm.current_position as position_now_numeric,
      pm.previous_label as position_previous,
      pm.previous_position as position_previous_numeric,
      pm.position_delta,
      pm.movement as position_movement,
      pm.pos_1d as position_1d,
      pm.pos_3d as position_3d,
      pm.pos_7d as position_7d,
      pm.pos_14d as position_14d,
      pm.pos_30d as position_30d,
      pm.best_30d as position_best_30d,
      pm.worst_30d as position_worst_30d,
      pm.changed_at as position_changed_at,
      pm.current_observed_at as position_checked_at,

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
    left join public.triovist_21vek_top_snapshots t
      on t.run_id=(
           case
             when substring(ci.source_file from 'top:([0-9a-fA-F-]{36})$') is not null
             then substring(ci.source_file from 'top:([0-9a-fA-F-]{36})$')::uuid
             else null
           end
         )
     and t.manager_email=c.manager_email
     and t.card_key=c.card_key
    left join public.triovist_21vek_position_metrics_v236351 pm
      on pm.manager_email=c.manager_email and pm.card_key=c.card_key
    left join public.triovist_mrc_current m on trim(m.sku)=trim(c.sku)
    order by c.manager_name,c.category,c.subgroup,c.product_name,c.sku
    limit v_limit offset v_offset
  )
  select coalesce(jsonb_agg(to_jsonb(page_rows)),'[]'::jsonb)
  into v_rows
  from page_rows;

  return jsonb_build_object(
    'version','v23.6.351',
    'rows',v_rows,
    'total',v_total,
    'offset',v_offset,
    'limit',v_limit,
    'has_more',(v_offset + jsonb_array_length(v_rows) < v_total),
    'snapshot_date',v_snapshot,
    'manager_filter',nullif(v_filter,''),
    'listing_mode','position_history'
  );
end;
$function$


CREATE OR REPLACE FUNCTION public.triovist_own_listing_history_v236351(p_manager_email text, p_card_key text, p_days integer DEFAULT 30)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_catalog', 'private'
AS $function$
declare
  a record;
  v_email text:=lower(btrim(coalesce(p_manager_email,'')));
  v_key text:=btrim(coalesce(p_card_key,''));
  v_days int:=least(greatest(coalesce(p_days,30),1),60);
  v_latest timestamptz;
  v_meta jsonb;
  v_rows jsonb;
begin
  select * into a from public.triovist_content_actor();
  if a.actor_email is null then raise exception 'Пользователь не найден' using errcode='42501'; end if;

  if a.actor_email in ('payushin_ar@resanta.ru','sidarovich_kn@resanta.ru') then
    if v_email not in ('aleksandrenko_av@resanta.ru','krishtal_na@resanta.ru') then
      raise exception 'Некорректный менеджер' using errcode='22023';
    end if;
  elsif a.actor_email in ('aleksandrenko_av@resanta.ru','krishtal_na@resanta.ru') then
    if v_email<>a.actor_email then raise exception 'Нет доступа к другому менеджеру' using errcode='42501'; end if;
  else
    raise exception 'Нет доступа к истории листинга' using errcode='42501';
  end if;

  if v_key='' then raise exception 'Не передана карточка' using errcode='22023'; end if;

  select current_observed_at,
         jsonb_build_object(
           'manager_email',manager_email,
           'manager_name',manager_name,
           'card_key',card_key,
           'sku',sku,
           'product_name',product_name,
           'keyword',keyword,
           'current_label',current_label,
           'current_position',current_position,
           'changed_at',changed_at,
           'price_21vek',price_21vek,
           'mrc_byn',mrc_byn,
           'in_stock',in_stock,
           'reason_context',reason_context
         )
  into v_latest,v_meta
  from public.triovist_21vek_position_metrics_v236351
  where lower(manager_email)=v_email and card_key=v_key;

  if v_latest is null then raise exception 'Карточка листинга не найдена' using errcode='22023'; end if;

  with h0 as (
    select
      s.observed_at,
      s.position,
      s.position_exact,
      s.top60,
      s.search_total,
      s.error_text,
      private.triovist_position_label_v236351(s.position,s.position_exact,s.top60,s.error_text) position_label
    from public.triovist_21vek_top_snapshots s
    join public.triovist_21vek_top_runs r on r.id=s.run_id and r.status='complete'
    where lower(s.manager_email)=v_email
      and s.card_key=v_key
      and s.observed_at<=v_latest
      and s.observed_at>=v_latest-make_interval(days=>v_days)
  ),
  h as (
    select
      h0.*,
      lag(position) over(order by observed_at) prev_position,
      lag(position_exact) over(order by observed_at) prev_exact,
      lag(position_label) over(order by observed_at) prev_label
    from h0
  ),
  ready as (
    select
      observed_at,
      position,
      position_exact,
      top60,
      position_label,
      search_total,
      error_text,
      prev_label,
      case
        when prev_label is null then 'new'
        when position_label='Ошибка' then 'error'
        when position_exact and prev_exact and position<prev_position then 'up'
        when position_exact and prev_exact and position>prev_position then 'down'
        when position_exact and prev_exact and position=prev_position then 'same'
        when position_exact and prev_label='>60' then 'entered'
        when position_label='>60' and prev_exact then 'exited'
        when position_label='>60' and prev_label='>60' then 'outside'
        else 'unknown'
      end movement,
      case when position_exact and prev_exact then prev_position-position else null end position_delta,
      observed_at as detected_at
    from h
  )
  select coalesce(jsonb_agg(to_jsonb(ready) order by observed_at),'[]'::jsonb)
  into v_rows
  from ready;

  return jsonb_build_object(
    'version','v23.6.351',
    'days',v_days,
    'meta',v_meta,
    'rows',v_rows,
    'change_semantics','Изменение обнаружено во время очередного запуска; фактически оно произошло между предыдущей и этой проверкой.'
  );
end;
$function$


CREATE OR REPLACE FUNCTION public.triovist_own_listing_positions_v236351(p_manager_email text DEFAULT NULL::text, p_search text DEFAULT NULL::text, p_movement text DEFAULT NULL::text, p_offset integer DEFAULT 0, p_limit integer DEFAULT 200)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_catalog'
AS $function$
declare
  a record;
  v_filter text:=lower(btrim(coalesce(p_manager_email,'')));
  v_search text:=lower(btrim(coalesce(p_search,'')));
  v_move text:=lower(btrim(coalesce(p_movement,'')));
  v_offset int:=greatest(coalesce(p_offset,0),0);
  v_limit int:=least(greatest(coalesce(p_limit,200),20),300);
  v_total int:=0;
  v_rows jsonb:='[]'::jsonb;
  v_summary jsonb:='{}'::jsonb;
begin
  select * into a from public.triovist_content_actor();
  if a.actor_email is null then raise exception 'Пользователь не найден' using errcode='42501'; end if;

  if a.actor_email in ('payushin_ar@resanta.ru','sidarovich_kn@resanta.ru') then
    if v_filter not in ('','aleksandrenko_av@resanta.ru','krishtal_na@resanta.ru') then
      raise exception 'Некорректный менеджер' using errcode='22023';
    end if;
  elsif a.actor_email in ('aleksandrenko_av@resanta.ru','krishtal_na@resanta.ru') then
    v_filter:=a.actor_email;
  else
    raise exception 'Нет доступа к листингу 21vek' using errcode='42501';
  end if;

  with base as materialized (
    select *
    from public.triovist_21vek_position_metrics_v236351 m
    where (v_filter='' or lower(m.manager_email)=v_filter)
      and (
        v_search=''
        or lower(coalesce(m.sku,'')) like '%'||v_search||'%'
        or lower(coalesce(m.product_name,'')) like '%'||v_search||'%'
        or lower(coalesce(m.keyword,'')) like '%'||v_search||'%'
      )
  )
  select jsonb_build_object(
    'cards',count(*),
    'exact',count(*) filter(where current_exact),
    'outside',count(*) filter(where current_label='>60'),
    'up',count(*) filter(where movement='up'),
    'down',count(*) filter(where movement='down'),
    'same',count(*) filter(where movement='same'),
    'entered',count(*) filter(where movement='entered'),
    'exited',count(*) filter(where movement='exited'),
    'new',count(*) filter(where movement='new'),
    'errors',count(*) filter(where movement='error' or current_label='Ошибка'),
    'drop_10_plus',count(*) filter(where movement='down' and coalesce(position_delta,0)<=-10),
    'rise_10_plus',count(*) filter(where movement='up' and coalesce(position_delta,0)>=10),
    'last_checked',max(current_observed_at),
    'cache_updated_at',max(updated_at)
  )
  into v_summary
  from base;

  with filtered as (
    select *
    from public.triovist_21vek_position_metrics_v236351 m
    where (v_filter='' or lower(m.manager_email)=v_filter)
      and (
        v_search=''
        or lower(coalesce(m.sku,'')) like '%'||v_search||'%'
        or lower(coalesce(m.product_name,'')) like '%'||v_search||'%'
        or lower(coalesce(m.keyword,'')) like '%'||v_search||'%'
      )
      and (v_move='' or m.movement=v_move)
  ),
  counted as (
    select count(*) over() total_count,f.*
    from filtered f
    order by
      case when f.movement='down' then 0 when f.movement='exited' then 1 when f.movement='up' then 2 when f.movement='entered' then 3 else 4 end,
      abs(coalesce(f.position_delta,0)) desc,
      f.manager_name,f.product_name,f.sku
    limit v_limit offset v_offset
  )
  select coalesce(max(total_count),0),
         coalesce(jsonb_agg(to_jsonb(counted)-'reason_context'-'total_count'),'[]'::jsonb)
  into v_total,v_rows
  from counted;

  return jsonb_build_object(
    'version','v23.6.351',
    'manager_filter',nullif(v_filter,''),
    'movement_filter',nullif(v_move,''),
    'summary',coalesce(v_summary,'{}'::jsonb),
    'rows',v_rows,
    'total',v_total,
    'offset',v_offset,
    'limit',v_limit,
    'has_more',v_offset+jsonb_array_length(v_rows)<v_total,
    'position_depth',60,
    'outside_label','>60',
    'change_semantics','Время изменения = первый запуск парсера, на котором новое значение было обнаружено.'
  );
end;
$function$



drop trigger if exists triovist_refresh_position_metrics_v236351 on public.triovist_content_imports;
create trigger triovist_refresh_position_metrics_v236351
after insert or update of is_current,status,source_file
on public.triovist_content_imports
for each row
execute function private.triovist_refresh_position_metrics_trigger_v236351();

revoke all on function private.triovist_position_label_v236351(integer,boolean,boolean,text) from public,anon,authenticated;
revoke all on function private.triovist_own_listing_metrics_v236351(text) from public,anon,authenticated;
revoke all on function private.triovist_refresh_position_metrics_v236351(text) from public,anon,authenticated;
revoke all on function public.triovist_own_listing_positions_v236351(text,text,text,integer,integer) from public,anon;
revoke all on function public.triovist_own_listing_history_v236351(text,text,integer) from public,anon;
revoke all on function public.triovist_content_export_v236221(text,integer,integer) from public,anon;

grant execute on function public.triovist_own_listing_positions_v236351(text,text,text,integer,integer) to authenticated;
grant execute on function public.triovist_own_listing_history_v236351(text,text,integer) to authenticated;
grant execute on function public.triovist_content_export_v236221(text,integer,integer) to authenticated;

comment on table public.triovist_21vek_position_metrics_v236351 is
'v23.6.351 cached exact-position metrics for own 21vek listing; reason_context reserves current price/MRC/stock for future reason analysis';

select private.triovist_refresh_position_metrics_v236351('aleksandrenko_av@resanta.ru');
select private.triovist_refresh_position_metrics_v236351('krishtal_na@resanta.ru');
