-- RESANTA CRM v23.6.235 · our 21vek listing positions + daily history

create table if not exists public.triovist_market_own_positions_current_v1 (
  scope_key text not null references public.triovist_market_scopes_v1(scope_key) on delete cascade,
  sku text not null,
  product_name text,
  product_url text,
  external_id text,
  brand text,
  page_no integer,
  position integer,
  listing_state text not null default 'outside_top120'
    check (listing_state in ('top120','outside_top120','no_card')),
  in_top120 boolean not null default false,
  current_price numeric(14,2),
  in_stock boolean,
  observed_at timestamptz not null default now(),
  run_id uuid,
  primary key (scope_key,sku)
);

create index if not exists idx_tm_own_pos_current_scope_position
  on public.triovist_market_own_positions_current_v1(scope_key,position)
  where in_top120;

create table if not exists public.triovist_market_own_position_snapshots_v1 (
  scope_key text not null references public.triovist_market_scopes_v1(scope_key) on delete cascade,
  sku text not null,
  observed_date date not null,
  observed_at timestamptz not null default now(),
  product_name text,
  product_url text,
  external_id text,
  brand text,
  page_no integer,
  position integer,
  listing_state text not null
    check (listing_state in ('top120','outside_top120','no_card')),
  in_top120 boolean not null default false,
  current_price numeric(14,2),
  in_stock boolean,
  run_id uuid,
  primary key (scope_key,sku,observed_date)
);

create index if not exists idx_tm_own_pos_hist_lookup
  on public.triovist_market_own_position_snapshots_v1(scope_key,sku,observed_date desc);

create or replace function public.triovist_market_own_listing_v236235(p_days integer default 7)
returns jsonb
language plpgsql
stable
security definer
set search_path=public,auth,pg_catalog
as $$
declare
  a record;
  d integer;
  today_minsk date := (now() at time zone 'Europe/Minsk')::date;
  result jsonb;
begin
  select * into a from public.triovist_content_actor();
  if a.actor_email is null or a.actor_email not in (
    'payushin_ar@resanta.ru','sidarovich_kn@resanta.ru',
    'aleksandrenko_av@resanta.ru','krishtal_na@resanta.ru'
  ) then
    raise exception 'Нет доступа к позициям 21vek' using errcode='42501';
  end if;

  d := case when p_days in (1,3,7,14,30) then p_days else 7 end;

  with cur as (
    select c.*
    from public.triovist_market_own_positions_current_v1 c
    join public.triovist_market_scopes_v1 s on s.scope_key=c.scope_key
    where s.enabled
  ),
  joined as (
    select c.*,
           p.position as past_position,
           p.listing_state as past_state,
           p.observed_date as past_date,
           case
             when c.listing_state='no_card' then 'no_card'
             when c.listing_state='outside_top120' then 'outside'
             when p.sku is null then 'no_history'
             when p.listing_state='outside_top120' and c.listing_state='top120' then 'new'
             when p.listing_state='no_card' and c.listing_state='top120' then 'new'
             when p.position is null then 'no_history'
             when p.position > c.position then 'up'
             when p.position < c.position then 'down'
             else 'stable'
           end as trend,
           case
             when c.listing_state='top120' and p.listing_state='top120'
               and c.position is not null and p.position is not null
             then p.position-c.position
             else null
           end as position_delta
    from cur c
    left join public.triovist_market_own_position_snapshots_v1 p
      on p.scope_key=c.scope_key
     and p.sku=c.sku
     and p.observed_date=today_minsk-d
  ),
  hist as (
    select h.scope_key,h.sku,
           jsonb_agg(jsonb_build_object(
             'date',h.observed_date,
             'position',h.position,
             'state',h.listing_state,
             'in_top120',h.in_top120
           ) order by h.observed_date desc) as history
    from public.triovist_market_own_position_snapshots_v1 h
    where h.observed_date >= today_minsk-30
    group by h.scope_key,h.sku
  ),
  rows_j as (
    select jsonb_agg(jsonb_build_object(
      'scope_key',j.scope_key,
      'sku',j.sku,
      'product_name',j.product_name,
      'product_url',j.product_url,
      'brand',j.brand,
      'position',j.position,
      'page_no',j.page_no,
      'listing_state',j.listing_state,
      'in_top120',j.in_top120,
      'current_price',j.current_price,
      'in_stock',j.in_stock,
      'observed_at',j.observed_at,
      'past_position',j.past_position,
      'past_state',j.past_state,
      'past_date',j.past_date,
      'trend',j.trend,
      'position_delta',j.position_delta,
      'history',coalesce(h.history,'[]'::jsonb)
    ) order by j.scope_key,j.position nulls last,j.sku) as j
    from joined j
    left join hist h on h.scope_key=j.scope_key and h.sku=j.sku
  ),
  summary_j as (
    select jsonb_agg(jsonb_build_object(
      'scope_key',x.scope_key,
      'total_sku',x.total_sku,
      'top10',x.top10,
      'top30',x.top30,
      'top60',x.top60,
      'top120',x.top120,
      'outside_top120',x.outside_top120,
      'no_card',x.no_card
    ) order by x.scope_key) as j
    from (
      select scope_key,
             count(*) as total_sku,
             count(*) filter(where position between 1 and 10) as top10,
             count(*) filter(where position between 1 and 30) as top30,
             count(*) filter(where position between 1 and 60) as top60,
             count(*) filter(where listing_state='top120') as top120,
             count(*) filter(where listing_state='outside_top120') as outside_top120,
             count(*) filter(where listing_state='no_card') as no_card
      from cur
      group by scope_key
    ) x
  )
  select jsonb_build_object(
    'version','v23.6.235',
    'period_days',d,
    'as_of_date',today_minsk,
    'rows',coalesce((select j from rows_j),'[]'::jsonb),
    'summary',coalesce((select j from summary_j),'[]'::jsonb)
  ) into result;

  return result;
end;
$$;

grant execute on function public.triovist_market_own_listing_v236235(integer) to authenticated;
