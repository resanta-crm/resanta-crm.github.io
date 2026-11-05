-- Triovist own parser: isolated hourly depth-120 search watcher.
-- Never changes the production pointer, cards, daily TOP, or competitors.
create table if not exists public.triovist_own_hourly_runs_v1 (
 id uuid primary key default gen_random_uuid(),
 status text not null default 'running' check (status in ('running','complete','partial','failed')),
 keywords_total integer not null default 0,
 keywords_checked integer not null default 0,
 cards_checked integer not null default 0,
 request_count integer not null default 0,
 error_count integer not null default 0,
 started_at timestamptz not null default now(),
 finished_at timestamptz,
 note text
);
create table if not exists public.triovist_own_hourly_observations_v1 (
 id bigint generated always as identity primary key,
 run_id uuid not null references public.triovist_own_hourly_runs_v1(id),
 manager_email text not null,
 card_key text not null,
 sku text,
 product_name text,
 keyword text not null,
 position integer check(position between 1 and 120),
 search_total integer,
 observed_price numeric,
 observed_stock boolean,
 observed_at timestamptz not null,
 unique(run_id,manager_email,card_key)
);
create index if not exists tri_own_hourly_obs_card_time_v1
  on public.triovist_own_hourly_observations_v1 (manager_email,card_key,observed_at desc);
create index if not exists tri_own_hourly_obs_latest_v1
  on public.triovist_own_hourly_observations_v1 (observed_at desc);
create index if not exists tri_own_hourly_runs_recent_v1
  on public.triovist_own_hourly_runs_v1 (started_at desc);

alter table public.triovist_own_hourly_runs_v1 enable row level security;
alter table public.triovist_own_hourly_observations_v1 enable row level security;
revoke all on public.triovist_own_hourly_runs_v1 from public,anon,authenticated;
revoke all on public.triovist_own_hourly_observations_v1 from public,anon,authenticated;
grant select,insert,update on public.triovist_own_hourly_runs_v1 to service_role;
grant select,insert,update,delete on public.triovist_own_hourly_observations_v1 to service_role;
grant usage,select on sequence public.triovist_own_hourly_observations_v1_id_seq to service_role;

create or replace function public.triovist_own_hourly_dashboard_v1(
 p_manager_email text default null,
 p_movement text default null,
 p_search text default null,
 p_limit integer default 80
) returns jsonb
language plpgsql stable security definer
set search_path to 'public','auth','pg_catalog'
as $body$
declare
 a record;
 v_manager text := lower(btrim(coalesce(p_manager_email,'')));
 v_move text := lower(btrim(coalesce(p_movement,'')));
 v_search text := lower(btrim(coalesce(p_search,'')));
 v_limit int := least(greatest(coalesce(p_limit,80),1),150);
 v_rows jsonb := '[]'::jsonb;
 v_summary jsonb := '{}'::jsonb;
 v_run jsonb := '{}'::jsonb;
begin
 select * into a from public.triovist_content_actor();
 if a.actor_email is null then raise exception 'Нет доступа' using errcode='42501'; end if;
 if a.actor_role='boss' and a.actor_email in ('payushin_ar@resanta.ru','sidarovich_kn@resanta.ru') then
   if v_manager not in ('','aleksandrenko_av@resanta.ru','krishtal_na@resanta.ru') then
     raise exception 'Некорректный менеджер' using errcode='22023';
   end if;
 elsif a.actor_scope='triovist' and a.actor_email in ('aleksandrenko_av@resanta.ru','krishtal_na@resanta.ru') then
   v_manager := a.actor_email;
 else
   raise exception 'Нет доступа к листингу' using errcode='42501';
 end if;
 if v_move not in ('','down','up','same','entered','exited','outside','new') then
   raise exception 'Некорректный фильтр' using errcode='22023';
 end if;
 select coalesce(to_jsonb(r),'{}'::jsonb) into v_run
 from (select status,keywords_total,keywords_checked,cards_checked,request_count,error_count,started_at,finished_at
       from public.triovist_own_hourly_runs_v1 order by started_at desc limit 1) r;
 with latest as materialized (
   select distinct on (o.manager_email,o.card_key) o.*
   from public.triovist_own_hourly_observations_v1 o
   where o.observed_at >= now()-interval '45 days'
   order by o.manager_email,o.card_key,o.observed_at desc
 ),
 joined as materialized (
   select l.manager_email,l.card_key,l.sku,l.product_name,l.keyword,l.position,
          case when l.position is null then '>120' else '№'||l.position::text end position_label,
          l.search_total,l.observed_price,l.observed_stock,l.observed_at,
          prior.position as previous_position, prior.observed_at as previous_observed_at,
          case when prior.observed_at is null then 'new'
               when l.position is null and prior.position is null then 'outside'
               when l.position is null then 'exited'
               when prior.position is null then 'entered'
               when l.position<prior.position then 'up'
               when l.position>prior.position then 'down'
               else 'same' end as movement,
          case when l.position is not null and prior.position is not null
               then prior.position-l.position else null end as position_delta,
          m.manager_name,m.category,m.subgroup,m.price_21vek,m.mrc_byn,m.in_stock,
          m.current_observed_at as published_top_at
   from latest l
   left join lateral (
     select p.position,p.observed_at from public.triovist_own_hourly_observations_v1 p
     where p.manager_email=l.manager_email and p.card_key=l.card_key
       and p.keyword=l.keyword and p.observed_at<l.observed_at
     order by p.observed_at desc limit 1
   ) prior on true
   left join public.triovist_21vek_position_metrics_v236351 m
     on m.manager_email=l.manager_email and m.card_key=l.card_key
   where (v_manager='' or l.manager_email=v_manager)
     and (v_search='' or lower(coalesce(l.sku,'')) like '%'||v_search||'%'
          or lower(coalesce(l.product_name,'')) like '%'||v_search||'%'
          or lower(coalesce(l.keyword,'')) like '%'||v_search||'%')
 ),
 filtered as (select * from joined where v_move='' or movement=v_move)
 select jsonb_build_object(
    'observed_cards',count(*),
    'in_top120',count(*) filter(where position is not null),
    'outside_120',count(*) filter(where position is null),
    'down',count(*) filter(where movement='down'),
    'up',count(*) filter(where movement='up'),
    'exited',count(*) filter(where movement='exited'),
    'entered',count(*) filter(where movement='entered'),
    'drop_10_plus',count(*) filter(where movement='down' and position_delta<=-10),
    'last_checked',max(observed_at),
    'stale_cards',count(*) filter(where observed_at < now()-interval '6 hours')
 ) into v_summary from joined;
 with latest as materialized (
   select distinct on (o.manager_email,o.card_key) o.*
   from public.triovist_own_hourly_observations_v1 o
   where o.observed_at >= now()-interval '45 days'
   order by o.manager_email,o.card_key,o.observed_at desc
 ), rows0 as (
   select l.manager_email,l.card_key,l.sku,l.product_name,l.keyword,l.position,
          case when l.position is null then '>120' else '№'||l.position::text end position_label,
          l.observed_at,l.search_total,l.observed_price,l.observed_stock,
          prior.position previous_position,prior.observed_at previous_observed_at,
          case when prior.observed_at is null then 'new'
               when l.position is null and prior.position is null then 'outside'
               when l.position is null then 'exited'
               when prior.position is null then 'entered'
               when l.position<prior.position then 'up'
               when l.position>prior.position then 'down' else 'same' end movement,
          case when l.position is not null and prior.position is not null
               then prior.position-l.position else null end position_delta,
          m.manager_name,m.price_21vek,m.mrc_byn,m.in_stock,
          m.category,m.subgroup,m.current_observed_at as published_top_at
   from latest l
   left join lateral (
     select p.position,p.observed_at from public.triovist_own_hourly_observations_v1 p
     where p.manager_email=l.manager_email and p.card_key=l.card_key
       and p.keyword=l.keyword and p.observed_at<l.observed_at
     order by p.observed_at desc limit 1
   ) prior on true
   left join public.triovist_21vek_position_metrics_v236351 m
     on m.manager_email=l.manager_email and m.card_key=l.card_key
   where (v_manager='' or l.manager_email=v_manager)
     and (v_search='' or lower(coalesce(l.sku,'')) like '%'||v_search||'%'
          or lower(coalesce(l.product_name,'')) like '%'||v_search||'%'
          or lower(coalesce(l.keyword,'')) like '%'||v_search||'%')
 ), filt as (select * from rows0 where v_move='' or movement=v_move)
 select coalesce(jsonb_agg(to_jsonb(filt) order by
       case when movement='exited' then 0 when movement='down' then 1 when movement='up' then 2 else 3 end,
       abs(coalesce(position_delta,0)) desc,observed_at desc),'[]'::jsonb)
 into v_rows
 from (select * from filt order by
       case when movement='exited' then 0 when movement='down' then 1 when movement='up' then 2 else 3 end,
       abs(coalesce(position_delta,0)) desc,observed_at desc
       limit v_limit) filt;
 return jsonb_build_object(
    'version','parser-hourly-1','position_depth',120,
    'requested_manager',nullif(v_manager,''),'generated_at',now(),
    'summary',coalesce(v_summary,'{}'::jsonb),'run',v_run,
    'rows',coalesce(v_rows,'[]'::jsonb),
    'freshness_note','Часовой мониторинг охватывает порцию запросов; у каждого SKU своё время проверки.',
    'cause_note','Изменение места не доказывает причину. Цена и наличие из поиска могут отсутствовать; данные опубликованного полного сбора отдельны.'
 );
end;
$body$;
revoke all on function public.triovist_own_hourly_dashboard_v1(text,text,text,integer) from public,anon;
grant execute on function public.triovist_own_hourly_dashboard_v1(text,text,text,integer) to authenticated;

create or replace function public.triovist_own_hourly_history_v1(
 p_manager_email text,p_card_key text,p_days integer default 30
) returns jsonb language plpgsql stable security definer
set search_path to 'public','auth','pg_catalog'
as $body$
declare
 a record;
 v_manager text := lower(btrim(coalesce(p_manager_email,'')));
 v_key text := btrim(coalesce(p_card_key,''));
 v_days int := least(greatest(coalesce(p_days,30),1),30);
 v_rows jsonb := '[]'::jsonb;
begin
 select * into a from public.triovist_content_actor();
 if a.actor_email is null then raise exception 'Нет доступа' using errcode='42501'; end if;
 if a.actor_role='boss' and a.actor_email in ('payushin_ar@resanta.ru','sidarovich_kn@resanta.ru') then
   if v_manager not in ('aleksandrenko_av@resanta.ru','krishtal_na@resanta.ru') then
     raise exception 'Некорректный менеджер' using errcode='22023'; end if;
 elsif a.actor_scope='triovist' and a.actor_email in ('aleksandrenko_av@resanta.ru','krishtal_na@resanta.ru') then
   if v_manager<>a.actor_email then raise exception 'Нет доступа к чужим SKU' using errcode='42501'; end if;
 else
   raise exception 'Нет доступа к истории листинга' using errcode='42501';
 end if;
 if v_key='' then raise exception 'Не указан SKU' using errcode='22023'; end if;
 with last_keyword as (
   select keyword from public.triovist_own_hourly_observations_v1
   where manager_email=v_manager and card_key=v_key
   order by observed_at desc limit 1
 ), rows0 as (
   select observed_at,position,case when position is null then '>120' else '№'||position::text end position_label,
          observed_price,observed_stock,search_total
   from public.triovist_own_hourly_observations_v1
   where manager_email=v_manager and card_key=v_key
     and keyword=(select keyword from last_keyword)
     and observed_at>=now()-make_interval(days=>v_days)
   order by observed_at desc limit 200
 )
 select coalesce(jsonb_agg(to_jsonb(x) order by x.observed_at),'[]'::jsonb)
 into v_rows from rows0 x;
 return jsonb_build_object('version','parser-hourly-1','days',v_days,'rows',v_rows,
   'change_semantics','Изменение впервые обнаружено во время одного из успешных проверочных запусков.');
end;
$body$;
revoke all on function public.triovist_own_hourly_history_v1(text,text,integer) from public,anon;
grant execute on function public.triovist_own_hourly_history_v1(text,text,integer) to authenticated;
