-- STANDS 360 v3: evidence-based review, multi-SKU groups and verified client/asset binding.
-- Additive: never overwrite purchase_history or raw text/photographs/legacy AI decisions.
create table if not exists public.stand_360_multi_sku_v3(
 placement_id uuid not null,
 raw_sku text not null,
 catalog_sku text not null,
 product_name text,
 verified_by uuid not null,
 verified_at timestamptz not null default now(),
 primary key(placement_id,raw_sku,catalog_sku),
 foreign key(placement_id,raw_sku) references public.stand_placement_items_v236346(placement_id,sku) on delete restrict
);
create table if not exists public.stand_360_legal_bindings_v3(
 placement_id uuid primary key references public.stand_placements_v236346(id) on delete restrict,
 legal_client_id uuid not null references public.clients(id) on delete restrict,
 physical_point_id uuid references public.route_physical_points(id) on delete restrict,
 confirmed_by uuid not null,
 confirmed_at timestamptz not null default now()
);
create table if not exists public.stand_360_edit_audit_v3(
 id bigint generated always as identity primary key,
 placement_id uuid not null references public.stand_placements_v236346(id),
 action text not null,
 before_value jsonb,
 after_value jsonb,
 changed_by uuid not null,
 changed_at timestamptz not null default now()
);
create index if not exists stand_360_edit_audit_v3_placement_idx on public.stand_360_edit_audit_v3(placement_id,changed_at desc);
create index if not exists stand_360_multi_sku_v3_key_idx on public.stand_360_multi_sku_v3(placement_id,catalog_sku);
alter table public.stand_360_multi_sku_v3 enable row level security;
alter table public.stand_360_legal_bindings_v3 enable row level security;
alter table public.stand_360_edit_audit_v3 enable row level security;
revoke all on public.stand_360_multi_sku_v3,public.stand_360_legal_bindings_v3,public.stand_360_edit_audit_v3 from public,anon,authenticated;
-- No direct Data API writes. All access is validated in RPCs.

create or replace function private.crm_stands_v3_check(p_id uuid,p_director_only boolean default false)
returns public.stand_placements_v236346
language plpgsql stable security definer set search_path='' as $$
declare p public.stand_placements_v236346%rowtype;
 role_text text:=private.crm_stands_role_v236346();
 person text:=private.crm_stands_user_name_v236346();
begin
 if (select auth.uid()) is null or role_text not in ('dfs','df','manager') or
  (p_director_only and role_text not in ('dfs','df'))
 then raise exception 'Доступ запрещён' using errcode='42501';end if;
 select * into p from public.stand_placements_v236346 where id=p_id;
 if p.id is null or p.status not in ('active','legacy_unreconciled','return_requested') or
  (role_text='manager' and p.manager_name is distinct from person)
 then raise exception 'Стенд недоступен' using errcode='42501';end if;
 return p;
end $$;
revoke all on function private.crm_stands_v3_check(uuid,boolean) from public,anon,authenticated;

create or replace function public.crm_stands_multi_sku_save_v3(
 p_placement_id uuid,p_raw_sku text,p_catalog_skus text[]
) returns jsonb language plpgsql security definer set search_path='' as $$
declare p public.stand_placements_v236346%rowtype;
 selected text[];expected int;found int;before_data jsonb;after_data jsonb;
begin
 p:=private.crm_stands_v3_check(p_placement_id,false);
 if not exists(select 1 from public.stand_placement_items_v236346
  where placement_id=p.id and sku=p_raw_sku) then raise exception 'Исходная запись не найдена';end if;
 if p_catalog_skus is null or cardinality(p_catalog_skus)<1 or cardinality(p_catalog_skus)>100
 then raise exception 'Выберите от 1 до 100 подтверждённых SKU';end if;
 select array_agg(distinct upper(btrim(x)) order by upper(btrim(x)))
 into selected from unnest(p_catalog_skus) x where length(btrim(x)) between 2 and 80;
 if coalesce(cardinality(selected),0)<>cardinality(p_catalog_skus)
 then raise exception 'Пустые или повторяющиеся артикулы не допускаются';end if;
 select count(distinct upper(btrim(c.sku))) into found
 from public.crm_promotion_catalog_v236215 c
 where c.in_full_catalog is true and upper(btrim(c.sku))=any(selected);
 if found<>cardinality(selected) then raise exception 'Не все SKU найдены в подтверждённом каталоге';end if;
 if exists(select 1 from public.stand_360_multi_sku_v3 m where m.placement_id=p.id
   and m.raw_sku<>p_raw_sku and upper(btrim(m.catalog_sku))=any(selected))
 then raise exception 'SKU уже указан в другой группе этого стенда';end if;
 if exists(select 1 from public.stand_360_sku_links_v2 l where l.placement_id=p.id
   and l.raw_sku<>p_raw_sku and upper(btrim(l.catalog_sku))=any(selected))
 then raise exception 'SKU уже связан с другой записью стенда';end if;
 select coalesce(jsonb_agg(catalog_sku order by catalog_sku),'[]'::jsonb) into before_data
 from public.stand_360_multi_sku_v3 where placement_id=p.id and raw_sku=p_raw_sku;
 delete from public.stand_360_multi_sku_v3 where placement_id=p.id and raw_sku=p_raw_sku;
 insert into public.stand_360_multi_sku_v3(placement_id,raw_sku,catalog_sku,product_name,verified_by)
 select p.id,p_raw_sku,c.sku,c.product_name,(select auth.uid())
 from unnest(selected) s
 join lateral(select z.sku,z.product_name from public.crm_promotion_catalog_v236215 z
  where z.in_full_catalog is true and upper(btrim(z.sku))=s
  order by z.catalog_uploaded_at desc nulls last limit 1)c on true;
 select coalesce(jsonb_agg(catalog_sku order by catalog_sku),'[]'::jsonb) into after_data
 from public.stand_360_multi_sku_v3 where placement_id=p.id and raw_sku=p_raw_sku;
 insert into public.stand_360_edit_audit_v3(placement_id,action,before_value,after_value,changed_by)
 values(p.id,'sku_group_reconciled',
  jsonb_build_object('raw',p_raw_sku,'sku',before_data),
  jsonb_build_object('raw',p_raw_sku,'sku',after_data),(select auth.uid()));
 expected:=coalesce(nullif((regexp_match(p_raw_sku,'([0-9]+)[[:space:]]*скю','i'))[1],'')::int,1);
 return jsonb_build_object('ok',true,'raw_preserved',true,'selected',cardinality(selected),
  'expected',expected,'complete',cardinality(selected)>=expected,'catalog_skus',after_data);
end $$;
revoke all on function public.crm_stands_multi_sku_save_v3(uuid,text,text[]) from public,anon;
grant execute on function public.crm_stands_multi_sku_save_v3(uuid,text,text[]) to authenticated;

create or replace function public.crm_stands_client_find_v3(p_placement_id uuid,p_query text default '')
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare p public.stand_placements_v236346%rowtype;q text;role_text text:=private.crm_stands_role_v236346();result jsonb;
begin
 p:=private.crm_stands_v3_check(p_placement_id,false);
 q:=btrim(coalesce(p_query,''));
 if length(q)<3 then return '[]'::jsonb;end if;
 select coalesce(jsonb_agg(to_jsonb(z) order by z.history_rows desc,z.name),'[]'::jsonb)
 into result from(
  select c.id,c.name,c.code,c.region,c.manager_name,
   (select count(*) from public.purchase_history h where h.client_id=c.id) as history_rows
  from public.clients c
  where c.is_archived is not true
   and (c.name ilike '%'||q||'%' or c.code ilike '%'||q||'%')
   and (role_text in ('dfs','df') or c.id=p.client_id or c.manager_name=p.manager_name or
    exists(select 1 from public.route_physical_point_clients x
      where x.client_id=c.id and x.point_id in (
       select point_id from public.route_physical_point_clients where client_id=p.client_id)))
  order by c.name limit 30
 )z;
 return result;
end $$;
revoke all on function public.crm_stands_client_find_v3(uuid,text) from public,anon;
grant execute on function public.crm_stands_client_find_v3(uuid,text) to authenticated;

create or replace function public.crm_stands_points_find_v3(p_placement_id uuid,p_legal_client_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare p public.stand_placements_v236346%rowtype;result jsonb;
begin
 p:=private.crm_stands_v3_check(p_placement_id,false);
 select coalesce(jsonb_agg(to_jsonb(x) order by x.address),'[]'::jsonb) into result
 from (select distinct pt.id,pt.address,pt.city from public.route_physical_points pt
  join public.route_physical_point_clients pc on pc.point_id=pt.id
  where pc.client_id in (p.client_id,p_legal_client_id)
    and pt.active is not false order by pt.address limit 60)x;
 return result;
end $$;
revoke all on function public.crm_stands_points_find_v3(uuid,uuid) from public,anon;
grant execute on function public.crm_stands_points_find_v3(uuid,uuid) to authenticated;

create or replace function public.crm_stands_client_bind_v3(p_placement_id uuid,p_legal_client_id uuid,p_point_id uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare p public.stand_placements_v236346%rowtype;before_data jsonb;
role_text text:=private.crm_stands_role_v236346();
begin
 p:=private.crm_stands_v3_check(p_placement_id,false);
 if not exists(select 1 from public.clients c where c.id=p_legal_client_id and c.is_archived is not true)
 then raise exception 'Выберите юридическое лицо из CRM';end if;
 if role_text='manager' and not exists(select 1 from public.clients c
  where c.id=p_legal_client_id and
   (c.manager_name=p.manager_name or c.id=p.client_id or exists(
     select 1 from public.route_physical_point_clients x where x.client_id=c.id and
       x.point_id in(select y.point_id from public.route_physical_point_clients y where y.client_id=p.client_id))))
 then raise exception 'Юрлицо не закреплено за вами' using errcode='42501';end if;
 if p_point_id is not null and not exists(
  select 1 from public.route_physical_point_clients pc
  where pc.point_id=p_point_id and pc.client_id in (p.client_id,p_legal_client_id))
 then raise exception 'Торговая точка не связана с выбранным клиентом';end if;
 select to_jsonb(l) into before_data from public.stand_360_legal_bindings_v3 l where l.placement_id=p.id;
 insert into public.stand_360_legal_bindings_v3(placement_id,legal_client_id,physical_point_id,confirmed_by)
 values(p.id,p_legal_client_id,p_point_id,(select auth.uid()))
 on conflict(placement_id) do update set legal_client_id=excluded.legal_client_id,
  physical_point_id=excluded.physical_point_id,confirmed_by=excluded.confirmed_by,confirmed_at=now();
 insert into public.stand_360_edit_audit_v3(placement_id,action,before_value,after_value,changed_by)
 values(p.id,'legal_client_confirmed',before_data,
  jsonb_build_object('legal_client_id',p_legal_client_id,'point_id',p_point_id),(select auth.uid()));
 return jsonb_build_object('ok',true,'legal_client_id',p_legal_client_id,
  'physical_point_id',p_point_id,'original_client_id_preserved',true);
end $$;
revoke all on function public.crm_stands_client_bind_v3(uuid,uuid,uuid) from public,anon;
grant execute on function public.crm_stands_client_bind_v3(uuid,uuid,uuid) to authenticated;

create or replace function public.crm_stands_assets_find_v3(p_placement_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare p public.stand_placements_v236346%rowtype;result jsonb;
begin
 p:=private.crm_stands_v3_check(p_placement_id,true);
 select coalesce(jsonb_agg(to_jsonb(z) order by z.asset_code),'[]'::jsonb) into result
 from (select a.id,a.asset_code,a.status,a.current_client_id from public.stand_assets_v236346 a
  where a.asset_type_id=p.asset_type_id and a.status='installed'
   and a.current_client_id=p.client_id and a.current_manager_name=p.manager_name
   and not exists(select 1 from public.stand_placements_v236346 other
     where other.id<>p.id and other.asset_id=a.id and other.status in ('active','legacy_unreconciled','return_requested'))
  order by a.asset_code limit 30)z;
 return result;
end $$;
revoke all on function public.crm_stands_assets_find_v3(uuid) from public,anon;
grant execute on function public.crm_stands_assets_find_v3(uuid) to authenticated;

create or replace function public.crm_stands_asset_confirm_v3(p_placement_id uuid,p_asset_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare p public.stand_placements_v236346%rowtype;asset public.stand_assets_v236346%rowtype;
begin
 p:=private.crm_stands_v3_check(p_placement_id,true);
 select * into asset from public.stand_assets_v236346 where id=p_asset_id for update;
 if asset.id is null or asset.status<>'installed' or asset.asset_type_id<>p.asset_type_id
   or asset.current_client_id<>p.client_id or asset.current_manager_name<>p.manager_name
   or exists(select 1 from public.stand_placements_v236346 other where other.id<>p.id
     and other.asset_id=asset.id and other.status in ('active','legacy_unreconciled','return_requested'))
 then raise exception 'ОС не совпадает с клиентом, типом стенда или уже используется';end if;
 update public.stand_placements_v236346 set asset_id=p_asset_id where id=p.id;
 insert into public.stand_360_edit_audit_v3(placement_id,action,before_value,after_value,changed_by)
 values(p.id,'asset_reconciled',jsonb_build_object('asset_id',p.asset_id),
   jsonb_build_object('asset_id',p_asset_id,'asset_code',asset.asset_code),(select auth.uid()));
 return jsonb_build_object('ok',true,'asset_code',asset.asset_code);
end $$;
revoke all on function public.crm_stands_asset_confirm_v3(uuid,uuid) from public,anon;
grant execute on function public.crm_stands_asset_confirm_v3(uuid,uuid) to authenticated;

-- Detailed SKU evidence, including current multi-SKU selections. Never invent exact SKU.
create or replace function public.crm_stands_360_skus_v3(p_placement_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare p public.stand_placements_v236346%rowtype;legal_id uuid;
result jsonb; total_sku int; verified int;incomplete int;ship6 numeric;shipprev numeric;all6 numeric;clientrows int;
begin
 p:=private.crm_stands_v3_check(p_placement_id,false);
 select coalesce(l.legal_client_id,p.client_id) into legal_id
 from public.stand_placements_v236346 base left join public.stand_360_legal_bindings_v3 l on l.placement_id=base.id
 where base.id=p.id;
 with raw as (
 select i.sku raw_sku,i.product_name,
  greatest(1,coalesce((regexp_match(i.sku,'([0-9]+)[[:space:]]*скю','i'))[1]::int,1)) expected,
  (select array_agg(distinct m.catalog_sku order by m.catalog_sku) from public.stand_360_multi_sku_v3 m
    where m.placement_id=i.placement_id and m.raw_sku=i.sku) multi_skus,
  l.catalog_sku legacy_sku,
  (select c.sku from public.crm_promotion_catalog_v236215 c where c.in_full_catalog is true
    and upper(btrim(c.sku))=upper(btrim(i.sku)) limit 1) exact_sku
 from public.stand_placement_items_v236346 i
 left join public.stand_360_sku_links_v2 l on l.placement_id=i.placement_id and l.raw_sku=i.sku
 where i.placement_id=p.id
 ), grouped as (
 select raw.*,
   coalesce(raw.multi_skus,array[coalesce(raw.legacy_sku,raw.exact_sku)]::text[]) effective_skus,
   case when raw.multi_skus is not null then cardinality(raw.multi_skus)
     when raw.legacy_sku is not null or raw.exact_sku is not null then 1 else 0 end chosen
 from raw
 ), summarized as (
 select g.*,
  case when g.chosen=0 then 'unresolved'
   when g.chosen<g.expected then 'partial'
   when g.multi_skus is not null then 'verified_multi'
   else 'exact_or_verified' end sku_state,
  (select coalesce(sum(h.revenue),0) from public.purchase_history h where h.client_id=legal_id
    and h.month>=date_trunc('month',current_date)::date-interval '5 months'
    and upper(btrim(h.sku))=any(select upper(btrim(u)) from unnest(g.effective_skus) u)) ship_6m
 from grouped g
 )
 select coalesce(jsonb_agg(to_jsonb(summarized) order by
     case sku_state when 'unresolved' then 0 when 'partial' then 1 else 2 end,raw_sku),'[]'::jsonb),
  coalesce(sum(expected),0)::int,coalesce(sum(chosen),0)::int,
  count(*) filter(where chosen<expected)::int
 into result,total_sku,verified,incomplete
 from summarized;
 -- Distinct final SKUs avoid doubling client shipments when raw groups overlap.
 with effective as(
  select distinct upper(btrim(sku)) sku from(
   select unnest(multi_skus) sku from(
    select array_agg(m.catalog_sku) multi_skus from public.stand_360_multi_sku_v3 m
    where m.placement_id=p.id group by m.raw_sku
   )x
   union all
   select coalesce(l.catalog_sku,c.sku) from public.stand_placement_items_v236346 i
    left join public.stand_360_sku_links_v2 l on l.placement_id=i.placement_id and l.raw_sku=i.sku
    left join lateral(select sku from public.crm_promotion_catalog_v236215
     where in_full_catalog is true and upper(btrim(sku))=upper(btrim(i.sku)) limit 1)c on true
    where i.placement_id=p.id and not exists(select 1 from public.stand_360_multi_sku_v3 m
     where m.placement_id=i.placement_id and m.raw_sku=i.sku)
  )z where nullif(btrim(sku),'') is not null
 ), revenue as(
  select h.month,h.revenue from public.purchase_history h join effective e on upper(btrim(h.sku))=e.sku
  where h.client_id=legal_id and h.month>=date_trunc('month',current_date)::date-interval '11 months'
 )
 select coalesce(sum(revenue) filter(where month>=date_trunc('month',current_date)::date-interval '5 months'),0),
 coalesce(sum(revenue) filter(where month<date_trunc('month',current_date)::date-interval '5 months'),0)
 into ship6,shipprev from revenue;
 select count(*),coalesce(sum(revenue) filter(where month>=date_trunc('month',current_date)::date-interval '5 months'),0)
 into clientrows,all6 from public.purchase_history where client_id=legal_id;
 return jsonb_build_object('placement_id',p.id,'client_id',p.client_id,'legal_client_id',legal_id,
  'sku_expected',total_sku,'sku_selected',verified,'unresolved_groups',incomplete,
  'ship_6m',ship6,'ship_prev_6m',shipprev,'client_history_rows',clientrows,'client_ship_6m',all6,
  'rows',result,'data_precision','monthly_customer_shipments_not_retail');
end $$;
revoke all on function public.crm_stands_360_skus_v3(uuid) from public,anon;
grant execute on function public.crm_stands_360_skus_v3(uuid) to authenticated;

create or replace function public.crm_stands_360_v3(p_limit integer default 150)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare baseline jsonb;out_rows jsonb:='[]'::jsonb;
stand jsonb;skus jsonb;legal public.clients%rowtype;last_vision public.stand_vision_checks_v236347%rowtype;
score int;priority text;confidence text;stat int:=0;missing int:=0;pending int:=0;
begin
 baseline:=public.crm_stands_360_v2(p_limit);
 for stand in select value from jsonb_array_elements(baseline->'stands') loop
  skus:=public.crm_stands_360_skus_v3((stand->>'id')::uuid);
  select * into last_vision from public.stand_vision_checks_v236347 where placement_id=(stand->>'id')::uuid order by created_at desc limit 1;
  select * into legal from public.clients where id=(skus->>'legal_client_id')::uuid;
  if (skus->>'client_history_rows')::int=0 then confidence:='client_id_unlinked';
  elsif (skus->>'unresolved_groups')::int>0 or (skus->>'sku_expected')::int=0 then confidence:='sku_unverified';
  else confidence:='verified_monthly_client_shipments';end if;
  priority:=case when stand->>'asset_id' is null then 'asset_check'
   when stand->>'last_control_photo_path' is null and stand->>'installation_photo_path' is null then 'photo_missing'
   when confidence='client_id_unlinked' then 'client_id_check'
   when confidence='sku_unverified' then 'sku_check'
   when (stand->>'photo_days')::int>45 then 'photo_stale'
   when stand->>'vision_checked_at' is null or (stand->>'vision_checked_at')::timestamptz <
     coalesce((stand->>'last_control_at')::timestamptz,'epoch'::timestamptz) then 'vision_pending'
   when coalesce((stand->>'vision_own_brand_pct')::int,100)<35 then 'use_check'
   when (skus->>'ship_6m')::numeric=0 then 'shipments_check'
   when (skus->>'ship_prev_6m')::numeric>0 and (skus->>'ship_6m')::numeric<(skus->>'ship_prev_6m')::numeric*.75 then 'shipments_check'
   else 'maintain' end;
  out_rows:=out_rows||jsonb_build_array(stand||
   jsonb_build_object('sku_expected',(skus->>'sku_expected')::int,
   'sku_selected',(skus->>'sku_selected')::int,
   'registered_skus',(skus->>'sku_expected')::int,
   'validated_skus',(skus->>'sku_selected')::int,
   'unresolved_skus',(skus->>'unresolved_groups')::int,
   'client_history_rows',(skus->>'client_history_rows')::int,
   'client_ship_6m',(skus->>'client_ship_6m')::numeric,
   'ship_6m',(skus->>'ship_6m')::numeric,
   'ship_prev_6m',(skus->>'ship_prev_6m')::numeric,
   'legal_client_id',skus->>'legal_client_id','legal_client_name',legal.name,
   'vision_stand_present',last_vision.stand_present,'vision_photo_quality_score',last_vision.photo_quality_score,
   'vision_photo_evidence_path',last_vision.storage_path,
   'sales_confidence',confidence,'priority_code',priority));
  if confidence<>'verified_monthly_client_shipments' then stat:=stat+1;end if;
  if priority<>'maintain' then pending:=pending+1;end if;
 end loop;
 return (baseline-'stands')||jsonb_build_object('stands',out_rows,
   'version','stands360-v3','data_issues',stat,'attention',pending);
end $$;
revoke all on function public.crm_stands_360_v3(integer) from public,anon;
grant execute on function public.crm_stands_360_v3(integer) to authenticated;
