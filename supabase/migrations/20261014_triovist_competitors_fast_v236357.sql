-- RESANTA CRM v23.6.357
-- Fast competitor market: metadata first, rows/listing/history by selected scope.
-- Keeps the legacy full dashboard cache for rollback compatibility.

create table if not exists public.triovist_market_dashboard_meta_cache_v236357 (
  cache_key text primary key,
  payload jsonb not null,
  refreshed_at timestamptz not null default now()
);
alter table public.triovist_market_dashboard_meta_cache_v236357 enable row level security;
revoke all on table public.triovist_market_dashboard_meta_cache_v236357 from public, anon, authenticated;

create table if not exists public.triovist_market_dashboard_scope_cache_v236357 (
  scope_key text primary key,
  payload jsonb not null,
  refreshed_at timestamptz not null default now()
);
alter table public.triovist_market_dashboard_scope_cache_v236357 enable row level security;
revoke all on table public.triovist_market_dashboard_scope_cache_v236357 from public, anon, authenticated;

create or replace function public.triovist_market_dashboard_refresh_v236357()
returns jsonb
language plpgsql
security definer
set search_path to 'public','auth','pg_catalog'
as $$
declare
  v_payload jsonb;
  v_meta jsonb;
  v_old_claims text;
  v_refreshed timestamptz := clock_timestamp();
  v_scope_count integer := 0;
begin
  v_old_claims := current_setting('request.jwt.claims', true);
  perform set_config('request.jwt.claims','{"email":"payushin_ar@resanta.ru"}',true);

  v_payload := public.triovist_market_dashboard_v236306();
  v_payload := jsonb_set(v_payload,'{version}','"v23.6.357"'::jsonb,true);
  v_meta := (v_payload - 'rows') || jsonb_build_object('lazy_rows',true,'row_loading','by_scope');

  insert into public.triovist_market_dashboard_cache_v1(cache_key,payload,refreshed_at)
  values ('main',v_payload,v_refreshed)
  on conflict (cache_key) do update
    set payload=excluded.payload,refreshed_at=excluded.refreshed_at;

  insert into public.triovist_market_dashboard_meta_cache_v236357(cache_key,payload,refreshed_at)
  values ('main',v_meta,v_refreshed)
  on conflict (cache_key) do update
    set payload=excluded.payload,refreshed_at=excluded.refreshed_at;

  delete from public.triovist_market_dashboard_scope_cache_v236357
  where scope_key is not null;

  with row_groups as (
    select r->>'scope_key' as scope_key,
           jsonb_agg(r order by nullif(r->>'position','')::int nulls last,r->>'product_key') as rows
    from jsonb_array_elements(coalesce(v_payload->'rows','[]'::jsonb)) r
    group by r->>'scope_key'
  ),
  scope_rows as (
    select s->>'scope_key' as scope_key,
           jsonb_build_object('version','v23.6.357','scope_key',s->>'scope_key','rows',coalesce(g.rows,'[]'::jsonb)) as payload
    from jsonb_array_elements(coalesce(v_payload->'scopes','[]'::jsonb)) s
    left join row_groups g on g.scope_key=s->>'scope_key'
  )
  insert into public.triovist_market_dashboard_scope_cache_v236357(scope_key,payload,refreshed_at)
  select scope_key,payload,v_refreshed from scope_rows;

  get diagnostics v_scope_count = row_count;

  if v_old_claims is not null then
    perform set_config('request.jwt.claims',v_old_claims,true);
  end if;

  return jsonb_build_object('ok',true,'refreshed_at',v_refreshed,
    'meta_bytes',pg_column_size(v_meta),'full_bytes',pg_column_size(v_payload),'scope_cache_count',v_scope_count);
exception when others then
  if v_old_claims is not null then
    perform set_config('request.jwt.claims',v_old_claims,true);
  end if;
  raise;
end;
$$;
revoke all on function public.triovist_market_dashboard_refresh_v236357() from public, anon, authenticated;

create or replace function public.triovist_market_dashboard_meta_v236357()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public','auth','pg_catalog'
as $$
declare a record; v_payload jsonb; v_refreshed timestamptz;
begin
  select * into a from public.triovist_content_actor();
  if a.actor_email is null or a.actor_email not in (
    'payushin_ar@resanta.ru','sidarovich_kn@resanta.ru',
    'aleksandrenko_av@resanta.ru','krishtal_na@resanta.ru'
  ) then
    raise exception 'Нет доступа к конкурентам 21vek' using errcode='42501';
  end if;

  select payload,refreshed_at into v_payload,v_refreshed
  from public.triovist_market_dashboard_meta_cache_v236357 where cache_key='main';

  if v_payload is null then
    raise exception 'Лёгкий кэш конкурентного анализа ещё не сформирован' using errcode='55000';
  end if;

  return jsonb_set(v_payload,'{actor_email}',to_jsonb(a.actor_email),true)
    || jsonb_build_object('version','v23.6.357','cache_refreshed_at',v_refreshed,'cache_mode',true,'lazy_rows',true);
end;
$$;
revoke all on function public.triovist_market_dashboard_meta_v236357() from public, anon;
grant execute on function public.triovist_market_dashboard_meta_v236357() to authenticated;

create or replace function public.triovist_market_dashboard_scope_v236357(p_scope_key text)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public','auth','pg_catalog'
as $$
declare a record; v_scope text:=btrim(coalesce(p_scope_key,'')); v_payload jsonb; v_refreshed timestamptz;
begin
  select * into a from public.triovist_content_actor();
  if a.actor_email is null or a.actor_email not in (
    'payushin_ar@resanta.ru','sidarovich_kn@resanta.ru',
    'aleksandrenko_av@resanta.ru','krishtal_na@resanta.ru'
  ) then
    raise exception 'Нет доступа к конкурентам 21vek' using errcode='42501';
  end if;
  if v_scope='' then raise exception 'Не выбрана подгруппа' using errcode='22023'; end if;
  if not exists(select 1 from public.triovist_market_scopes_v1 where scope_key=v_scope and enabled) then
    raise exception 'Подгруппа не найдена или отключена' using errcode='22023';
  end if;

  select payload,refreshed_at into v_payload,v_refreshed
  from public.triovist_market_dashboard_scope_cache_v236357 where scope_key=v_scope;

  return coalesce(v_payload,jsonb_build_object('version','v23.6.357','scope_key',v_scope,'rows','[]'::jsonb))
    || jsonb_build_object('cache_refreshed_at',v_refreshed,'cache_mode',true);
end;
$$;
revoke all on function public.triovist_market_dashboard_scope_v236357(text) from public, anon;
grant execute on function public.triovist_market_dashboard_scope_v236357(text) to authenticated;

create or replace function public.triovist_market_own_listing_scope_v236357(p_scope_key text,p_days integer default 7)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public','auth','pg_catalog'
as $$
declare
  a record; v_scope text:=btrim(coalesce(p_scope_key,'')); d integer;
  today_minsk date := (now() at time zone 'Europe/Minsk')::date; result jsonb;
begin
  select * into a from public.triovist_content_actor();
  if a.actor_email is null or a.actor_email not in (
    'payushin_ar@resanta.ru','sidarovich_kn@resanta.ru',
    'aleksandrenko_av@resanta.ru','krishtal_na@resanta.ru'
  ) then
    raise exception 'Нет доступа к позициям 21vek' using errcode='42501';
  end if;
  if v_scope='' then return jsonb_build_object('version','v23.6.357','period_days',7,'rows','[]'::jsonb,'summary','[]'::jsonb); end if;
  d:=case when p_days in (1,3,7,14,30) then p_days else 7 end;

  with cur as (
    select c.* from public.triovist_market_own_positions_current_v1 c
    join public.triovist_market_scopes_v1 s on s.scope_key=c.scope_key
    where s.enabled and c.scope_key=v_scope
  ),
  joined as (
    select c.*,p.position past_position,p.listing_state past_state,p.observed_date past_date,
      case
        when c.listing_state='no_card' then 'no_card'
        when c.listing_state='outside_top120' then 'outside'
        when p.sku is null then 'no_history'
        when p.listing_state in ('outside_top120','no_card') and c.listing_state='top120' then 'new'
        when p.position is null then 'no_history'
        when p.position>c.position then 'up'
        when p.position<c.position then 'down'
        else 'stable'
      end trend,
      case when c.listing_state='top120' and p.listing_state='top120'
                 and c.position is not null and p.position is not null
           then p.position-c.position else null end position_delta
    from cur c
    left join public.triovist_market_own_position_snapshots_v1 p
      on p.scope_key=c.scope_key and p.sku=c.sku and p.observed_date=today_minsk-d
  ),
  hist as (
    select h.scope_key,h.sku,
      jsonb_agg(jsonb_build_object('date',h.observed_date,'position',h.position,'state',h.listing_state,'in_top120',h.in_top120)
                order by h.observed_date desc) history
    from public.triovist_market_own_position_snapshots_v1 h
    where h.scope_key=v_scope and h.observed_date>=today_minsk-30
    group by h.scope_key,h.sku
  ),
  rows_j as (
    select jsonb_agg(jsonb_build_object(
      'scope_key',j.scope_key,'sku',j.sku,'product_name',j.product_name,'product_url',j.product_url,
      'brand',j.brand,'position',j.position,'page_no',j.page_no,'listing_state',j.listing_state,
      'in_top120',j.in_top120,'current_price',j.current_price,'in_stock',j.in_stock,'observed_at',j.observed_at,
      'past_position',j.past_position,'past_state',j.past_state,'past_date',j.past_date,'trend',j.trend,
      'position_delta',j.position_delta,'history',coalesce(h.history,'[]'::jsonb)
    ) order by j.position nulls last,j.sku) j
    from joined j left join hist h on h.scope_key=j.scope_key and h.sku=j.sku
  ),
  summary_j as (
    select jsonb_agg(jsonb_build_object(
      'scope_key',x.scope_key,'total_sku',x.total_sku,'top10',x.top10,'top30',x.top30,'top60',x.top60,
      'top120',x.top120,'outside_top120',x.outside_top120,'no_card',x.no_card
    )) j
    from (
      select scope_key,count(*) total_sku,
        count(*) filter(where position between 1 and 10) top10,
        count(*) filter(where position between 1 and 30) top30,
        count(*) filter(where position between 1 and 60) top60,
        count(*) filter(where listing_state='top120') top120,
        count(*) filter(where listing_state='outside_top120') outside_top120,
        count(*) filter(where listing_state='no_card') no_card
      from cur group by scope_key
    ) x
  )
  select jsonb_build_object('version','v23.6.357','scope_key',v_scope,'period_days',d,'as_of_date',today_minsk,
    'rows',coalesce((select j from rows_j),'[]'::jsonb),'summary',coalesce((select j from summary_j),'[]'::jsonb))
  into result;
  return result;
end;
$$;
revoke all on function public.triovist_market_own_listing_scope_v236357(text,integer) from public, anon;
grant execute on function public.triovist_market_own_listing_scope_v236357(text,integer) to authenticated;

create or replace function public.triovist_market_competitor_history_scope_v236357(p_scope_key text,p_days integer default 7)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public','auth','pg_catalog'
as $$
declare a record; v_scope text:=btrim(coalesce(p_scope_key,'')); v_days integer; result jsonb;
begin
  select * into a from public.triovist_content_actor();
  if a.actor_email is null or a.actor_email not in (
    'payushin_ar@resanta.ru','sidarovich_kn@resanta.ru',
    'aleksandrenko_av@resanta.ru','krishtal_na@resanta.ru'
  ) then
    raise exception 'Нет доступа к конкурентам 21vek' using errcode='42501';
  end if;
  if v_scope='' then return jsonb_build_object('version','v23.6.357','days',7,'rows','[]'::jsonb); end if;
  v_days:=case when p_days in (3,7,10,14,20,30) then p_days else 7 end;

  with price_hist as (
    select distinct on (x.product_key) x.product_key,x.current_price past_price
    from public.triovist_market_product_snapshots_v1 x
    where x.scope_key=v_scope and x.observed_at<=now()-make_interval(days=>v_days)
      and x.error_text is null and x.current_price is not null and x.current_price>0
    order by x.product_key,x.observed_at desc
  ),
  pos7 as (
    select distinct on (x.product_key) x.product_key,x.position position_7d
    from public.triovist_market_product_snapshots_v1 x
    where x.scope_key=v_scope and x.observed_at<=now()-interval '7 days' and x.error_text is null
    order by x.product_key,x.observed_at desc
  ),
  pos30 as (
    select distinct on (x.product_key) x.product_key,x.position position_30d
    from public.triovist_market_product_snapshots_v1 x
    where x.scope_key=v_scope and x.observed_at<=now()-interval '30 days' and x.error_text is null
    order by x.product_key,x.observed_at desc
  ),
  current_products as (
    select p.product_key
    from public.triovist_market_products_current_v1 p
    join public.triovist_market_scopes_v1 s on s.scope_key=p.scope_key
    where p.scope_key=v_scope and p.error_text is null and s.enabled
  )
  select jsonb_build_object('version','v23.6.357','scope_key',v_scope,'days',v_days,
    'rows',coalesce(jsonb_agg(jsonb_build_object(
      'scope_key',v_scope,'product_key',c.product_key,'past_price',ph.past_price,
      'position_7d',p7.position_7d,'position_30d',p30.position_30d
    )),'[]'::jsonb))
  into result
  from current_products c
  left join price_hist ph using(product_key)
  left join pos7 p7 using(product_key)
  left join pos30 p30 using(product_key);
  return result;
end;
$$;
revoke all on function public.triovist_market_competitor_history_scope_v236357(text,integer) from public, anon;
grant execute on function public.triovist_market_competitor_history_scope_v236357(text,integer) to authenticated;

insert into public.triovist_market_dashboard_meta_cache_v236357(cache_key,payload,refreshed_at)
select cache_key,(payload-'rows')||jsonb_build_object('lazy_rows',true,'row_loading','by_scope'),refreshed_at
from public.triovist_market_dashboard_cache_v1 where cache_key='main'
on conflict(cache_key) do update set payload=excluded.payload,refreshed_at=excluded.refreshed_at;

delete from public.triovist_market_dashboard_scope_cache_v236357;
with base as (
  select payload,refreshed_at from public.triovist_market_dashboard_cache_v1 where cache_key='main'
),
row_groups as (
  select r->>'scope_key' scope_key,
         jsonb_agg(r order by nullif(r->>'position','')::int nulls last,r->>'product_key') rows
  from base cross join lateral jsonb_array_elements(coalesce(payload->'rows','[]'::jsonb)) r
  group by r->>'scope_key'
)
insert into public.triovist_market_dashboard_scope_cache_v236357(scope_key,payload,refreshed_at)
select s->>'scope_key',
       jsonb_build_object('version','v23.6.357','scope_key',s->>'scope_key','rows',coalesce(g.rows,'[]'::jsonb)),
       b.refreshed_at
from base b
cross join lateral jsonb_array_elements(coalesce(b.payload->'scopes','[]'::jsonb)) s
left join row_groups g on g.scope_key=s->>'scope_key';
