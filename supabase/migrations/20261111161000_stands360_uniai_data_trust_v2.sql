-- STANDS 360 V2 | truthful 1C linkage, verified SKU mapping, ownership decisions.
-- Adds mappings and read-only reports. Original rows, photos and contracts remain untouched.
create table if not exists public.stand_360_sku_links_v2 (
 placement_id uuid not null references public.stand_placements_v236346(id) on delete restrict,
 raw_sku text not null,
 catalog_sku text not null,
 catalog_product text,
 verified_by uuid not null references auth.users(id),
 verified_at timestamptz not null default now(),
 primary key(placement_id,raw_sku)
);
create table if not exists public.stand_360_sku_link_audit_v2 (
 id bigint generated always as identity primary key,
 placement_id uuid not null references public.stand_placements_v236346(id),
 raw_sku text not null,
 previous_sku text,
 new_sku text not null,
 verified_by uuid not null references auth.users(id),
 recorded_at timestamptz not null default now()
);
create index if not exists stand360_sku_audit_placement_idx on public.stand_360_sku_link_audit_v2(placement_id,recorded_at desc);
alter table public.stand_360_sku_links_v2 enable row level security;
alter table public.stand_360_sku_link_audit_v2 enable row level security;
revoke all on public.stand_360_sku_links_v2,public.stand_360_sku_link_audit_v2 from public,anon,authenticated;
grant select on public.stand_360_sku_links_v2,public.stand_360_sku_link_audit_v2 to authenticated;
drop policy if exists "stand360_sku_links_read_v2" on public.stand_360_sku_links_v2;
create policy "stand360_sku_links_read_v2" on public.stand_360_sku_links_v2
for select to authenticated using (
 (select auth.uid()) is not null and exists(
 select 1 from public.stand_placements_v236346 p where p.id=placement_id
 and (private.crm_stands_role_v236346() in ('dfs','df') or
      (private.crm_stands_role_v236346()='manager' and p.manager_name=private.crm_stands_user_name_v236346()))
 ));
drop policy if exists "stand360_sku_audit_read_v2" on public.stand_360_sku_link_audit_v2;
create policy "stand360_sku_audit_read_v2" on public.stand_360_sku_link_audit_v2
for select to authenticated using (
 (select auth.uid()) is not null and exists(
 select 1 from public.stand_placements_v236346 p where p.id=placement_id
 and (private.crm_stands_role_v236346() in ('dfs','df') or
      (private.crm_stands_role_v236346()='manager' and p.manager_name=private.crm_stands_user_name_v236346()))
 ));

create or replace function public.crm_stands_sku_link_v2(
 p_placement_id uuid,p_raw_sku text,p_catalog_sku text
) returns jsonb language plpgsql security definer set search_path to '' as $fn$
declare p public.stand_placements_v236346%rowtype;
r text:=private.crm_stands_role_v236346();
n text:=private.crm_stands_user_name_v236346();
v_product text;v_sku text;previous_sku text;
begin
 if (select auth.uid()) is null or r not in ('dfs','df','manager') then raise exception 'Доступ запрещён';end if;
 select * into p from public.stand_placements_v236346 where id=p_placement_id;
 if p.id is null or p.status not in ('active','legacy_unreconciled','return_requested')
 or (r='manager' and p.manager_name is distinct from n) then raise exception 'Стенд недоступен';end if;
 if length(btrim(coalesce(p_raw_sku,'')))<2 or length(p_raw_sku)>200 then raise exception 'Неверное описание товара';end if;
 if not exists(select 1 from public.stand_placement_items_v236346 i
    where i.placement_id=p.id and i.sku=p_raw_sku) then raise exception 'Исходная запись не найдена';end if;
 -- Descriptions such as "Ручной инструмент 22 скю" are multiple products, not a single SKU.
 if p_raw_sku ~* '[2-9][0-9]*[[:space:]]*скю' then
  raise exception 'Это список нескольких SKU: внесите точные артикулы поштучно через каталог';
 end if;
 select c.sku,c.product_name into v_sku,v_product from public.crm_promotion_catalog_v236215 c
 where upper(btrim(c.sku))=upper(btrim(p_catalog_sku)) and c.in_full_catalog is true
 order by c.catalog_uploaded_at desc nulls last limit 1;
 if v_sku is null then raise exception 'Артикул не найден в подтверждённом каталоге';end if;
 select catalog_sku into previous_sku from public.stand_360_sku_links_v2
 where placement_id=p.id and raw_sku=p_raw_sku;
 insert into public.stand_360_sku_links_v2(placement_id,raw_sku,catalog_sku,catalog_product,verified_by)
 values (p.id,p_raw_sku,v_sku,v_product,(select auth.uid()))
 on conflict(placement_id,raw_sku) do update set
  catalog_sku=excluded.catalog_sku,catalog_product=excluded.catalog_product,
  verified_by=excluded.verified_by,verified_at=now();
 insert into public.stand_360_sku_link_audit_v2(placement_id,raw_sku,previous_sku,new_sku,verified_by)
 values(p.id,p_raw_sku,previous_sku,v_sku,(select auth.uid()));
 return jsonb_build_object('ok',true,'raw_sku',p_raw_sku,'catalog_sku',v_sku,
  'catalog_product',v_product,'original_row_preserved',true);
end
$fn$;
revoke all on function public.crm_stands_sku_link_v2(uuid,text,text) from public,anon;
grant execute on function public.crm_stands_sku_link_v2(uuid,text,text) to authenticated;

-- Full-screen server aggregation: distinguish "zero shipped" from "not matched".
create or replace function public.crm_stands_360_v2(p_limit integer default 150)
returns jsonb language plpgsql stable security definer set search_path to '' as $fn$
declare
 r text:=private.crm_stands_role_v236346();
 n text:=private.crm_stands_user_name_v236346();
 result jsonb;
begin
 if (select auth.uid()) is null or r not in ('dfs','df','manager') then raise exception 'Доступ запрещён';end if;
 with base as (
 select p.id,p.client_id,p.client_name,coalesce(nullif(c.code,''),p.client_id::text) client_code,
  p.manager_name,p.address,p.installed_at,p.asset_id,a.asset_code,
  t.name stand_type,t.brand stand_brand,p.status,p.last_control_at,
  p.last_control_photo_path,p.installation_photo_path,p.vision_checked_at,p.vision_status,
  p.vision_summary,p.vision_fill_pct,p.vision_own_brand_pct,p.ai_score,p.ai_status,
  p.ai_checked_at,
  case when p.last_control_at is not null then current_date-p.last_control_at::date
       when p.installed_at is not null then current_date-p.installed_at
       else null end photo_days,
  coalesce(ps.origin,'unknown') photo_origin,
  coalesce(pq.requested,false) photo_requested,
  coalesce(e.registered,0)::int registered_skus,coalesce(e.valid,0)::int validated_skus,
  coalesce(e.missing,0)::int unresolved_skus,
  coalesce(e.unique_skus,0)::int unique_skus,
  coalesce(sh.ship_3m,0)::numeric ship_3m,coalesce(sh.ship_6m,0)::numeric ship_6m,
  coalesce(sh.ship_prev_6m,0)::numeric ship_prev_6m,sh.last_ship_month,
  coalesce(ch.rows_history,0)::int client_history_rows,coalesce(ch.client_ship_6m,0)::numeric client_ship_6m,
  (select count(distinct pc.point_id) from public.route_physical_point_clients pc where pc.client_id=p.client_id) physical_point_links
 from public.stand_placements_v236346 p
 left join public.clients c on c.id=p.client_id
 left join public.stand_assets_v236346 a on a.id=p.asset_id
 left join public.stand_asset_types_v236346 t on t.id=p.asset_type_id
 left join lateral(
  select count(*) registered,
   count(*) filter(where coalesce(ln.catalog_sku,cat.sku) is not null) valid,
   count(*) filter(where coalesce(ln.catalog_sku,cat.sku) is null) missing,
   count(distinct coalesce(ln.catalog_sku,cat.sku)) unique_skus
  from public.stand_placement_items_v236346 i
  left join public.stand_360_sku_links_v2 ln on ln.placement_id=i.placement_id and ln.raw_sku=i.sku
  left join lateral(
   select c.sku from public.crm_promotion_catalog_v236215 c
   where c.in_full_catalog is true and upper(btrim(c.sku))=upper(btrim(i.sku)) limit 1
  )cat on true
  where i.placement_id=p.id
 )e on true
 left join lateral(
  select coalesce(sum(h.revenue) filter(where h.month>=date_trunc('month',current_date)::date-interval '2 months'),0) ship_3m,
   coalesce(sum(h.revenue) filter(where h.month>=date_trunc('month',current_date)::date-interval '5 months'),0) ship_6m,
   coalesce(sum(h.revenue) filter(where h.month>=date_trunc('month',current_date)::date-interval '11 months'
     and h.month<date_trunc('month',current_date)::date-interval '5 months'),0) ship_prev_6m,
   max(h.month) last_ship_month
  from (
   select distinct coalesce(ln.catalog_sku,cat.sku) sku
   from public.stand_placement_items_v236346 i
   left join public.stand_360_sku_links_v2 ln on ln.placement_id=i.placement_id and ln.raw_sku=i.sku
   left join lateral(
    select c.sku from public.crm_promotion_catalog_v236215 c
    where c.in_full_catalog is true and upper(btrim(c.sku))=upper(btrim(i.sku)) limit 1
   )cat on true
   where i.placement_id=p.id and coalesce(ln.catalog_sku,cat.sku) is not null
  ) sku_list
  join public.purchase_history h on h.client_id=p.client_id and upper(btrim(h.sku))=upper(btrim(sku_list.sku))
    and h.month>=date_trunc('month',current_date)::date-interval '11 months'
 )sh on true
 left join lateral(
  select count(*) rows_history,
   sum(h.revenue) filter(where h.month>=date_trunc('month',current_date)::date-interval '5 months') client_ship_6m
  from public.purchase_history h where h.client_id=p.client_id
 )ch on true
 left join lateral(
  select src.origin from public.stand_360_photo_sources_v1 src
  join public.stand_photos_v236346 img on img.id=src.photo_id
  where src.placement_id=p.id and img.storage_path=coalesce(p.last_control_photo_path,p.installation_photo_path)
  order by src.submitted_at desc limit 1
 )ps on true
 left join lateral(
  select true as requested from public.stand_360_photo_requests_v1 req
  where req.placement_id=p.id and req.status='open' limit 1
 )pq on true
 where p.status in ('active','legacy_unreconciled','return_requested')
 and (r in ('dfs','df') or p.manager_name=n)
 order by p.installed_at desc,p.id
 limit least(greatest(coalesce(p_limit,150),1),250)
 ), evaluated as (
 select b.*,
 case when b.asset_id is null then 'asset_check'
      when b.last_control_photo_path is null and b.installation_photo_path is null then 'photo_missing'
      when b.client_history_rows=0 then 'client_id_check'
      when b.unresolved_skus>0 or b.registered_skus=0 then 'sku_check'
      when b.photo_days>45 then 'photo_stale'
      when b.vision_status is null or b.vision_checked_at is null or
        b.vision_checked_at < coalesce(b.last_control_at,'epoch'::timestamptz) then 'vision_pending'
      when b.vision_own_brand_pct is not null and b.vision_own_brand_pct<35 then 'use_check'
      when b.ship_6m=0 and b.unique_skus>0 then 'shipments_check'
      when b.ship_prev_6m>0 and b.ship_6m< b.ship_prev_6m*.75 then 'shipments_check'
      else 'maintain' end priority_code,
 case when b.client_history_rows=0 then 'client_id_unlinked'
      when b.unresolved_skus>0 or b.registered_skus=0 then 'sku_unverified'
      else 'verified_monthly_client_shipments' end sales_confidence
 from base b
 )
 select jsonb_build_object(
  'version','stands360-uni-v2','actor_role',r,'data_precision','monthly shipments to client ID, not end-consumer stand sales',
  'total',count(*),
  'asset_issues',count(*) filter(where asset_id is null),
  'photo_issues',count(*) filter(where last_control_photo_path is null and installation_photo_path is null),
  'data_issues',count(*) filter(where sales_confidence<>'verified_monthly_client_shipments'),
  'attention',count(*) filter(where priority_code<>'maintain'),
  'stands',coalesce(jsonb_agg(to_jsonb(evaluated) order by
    case priority_code when 'asset_check' then 1 when 'client_id_check' then 2 when 'sku_check' then 3 when 'photo_missing' then 4 when 'use_check' then 5 when 'photo_stale' then 6 when 'shipments_check' then 7 else 8 end,client_name),'[]'::jsonb))
 into result from evaluated;
 return result;
end
$fn$;
revoke all on function public.crm_stands_360_v2(integer) from public,anon;
grant execute on function public.crm_stands_360_v2(integer) to authenticated;

create or replace function public.crm_stands_360_skus_v2(p_placement_id uuid)
returns jsonb language plpgsql stable security definer set search_path to '' as $fn$
declare p public.stand_placements_v236346%rowtype;
r text:=private.crm_stands_role_v236346();n text:=private.crm_stands_user_name_v236346();
result jsonb;
begin
 if (select auth.uid()) is null or r not in ('dfs','df','manager') then raise exception 'Доступ запрещён';end if;
 select * into p from public.stand_placements_v236346 where id=p_placement_id;
 if p.id is null or (r='manager' and p.manager_name is distinct from n) then raise exception 'Стенд недоступен';end if;
 with item as(
  select i.sku raw_sku,i.product_name,
  ln.catalog_sku mapped_sku,ln.verified_at,
  coalesce(ln.catalog_sku,cat.sku) effective_sku,
  case when ln.catalog_sku is not null then 'verified_mapping'
       when cat.sku is not null then 'exact_catalog'
       else 'unresolved' end sku_state
  from public.stand_placement_items_v236346 i
  left join public.stand_360_sku_links_v2 ln on ln.placement_id=i.placement_id and ln.raw_sku=i.sku
  left join lateral(
   select c.sku from public.crm_promotion_catalog_v236215 c
   where c.in_full_catalog is true and upper(btrim(c.sku))=upper(btrim(i.sku)) limit 1
  )cat on true
  where i.placement_id=p.id
 ), result_rows as (
 select item.*,
  (select max(h.month) from public.purchase_history h where h.client_id=p.client_id
   and upper(btrim(h.sku))=upper(btrim(item.effective_sku))) last_ship_month,
  (select coalesce(sum(h.revenue),0) from public.purchase_history h where h.client_id=p.client_id
   and upper(btrim(h.sku))=upper(btrim(item.effective_sku))
   and h.month>=date_trunc('month',current_date)::date-interval '5 months') ship_6m
 from item
 )
 select coalesce(jsonb_agg(to_jsonb(result_rows) order by
   case sku_state when 'unresolved' then 0 else 1 end,raw_sku),'[]'::jsonb)
 into result from result_rows;
 return jsonb_build_object('placement_id',p.id,'client_id',p.client_id,
 'data_precision','month','rows',result);
end
$fn$;
revoke all on function public.crm_stands_360_skus_v2(uuid) from public,anon;
grant execute on function public.crm_stands_360_skus_v2(uuid) to authenticated;
