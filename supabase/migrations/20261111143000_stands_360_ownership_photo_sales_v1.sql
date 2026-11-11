
-- STANDS 360 | Ownership efficiency, verified photo provenance, CRM-only authorisation
-- additive schema; never mutates original asset registry, 1C imports or historical vision checks.
create table if not exists public.stand_360_photo_sources_v1(
 id uuid primary key default gen_random_uuid(),
 placement_id uuid not null references public.stand_placements_v236346(id),
 photo_id uuid not null unique references public.stand_photos_v236346(id),
 origin text not null check (origin in ('manager','seller')),
 source_note text,
 submitted_by uuid not null references auth.users(id),
 submitted_at timestamptz not null default now()
);
create index if not exists stand_360_photo_sources_placement_idx on public.stand_360_photo_sources_v1(placement_id,submitted_at desc);
alter table public.stand_360_photo_sources_v1 enable row level security;
revoke all on public.stand_360_photo_sources_v1 from public,anon,authenticated;
grant select on public.stand_360_photo_sources_v1 to authenticated;
create policy "stand360_provenance_read" on public.stand_360_photo_sources_v1 for select to authenticated
using (exists(select 1 from public.stand_placements_v236346 p where p.id=placement_id
 and (private.crm_stands_role_v236346() in ('dfs','df') or
     (private.crm_stands_role_v236346()='manager' and p.manager_name=private.crm_stands_user_name_v236346()))));

create table if not exists public.stand_360_photo_requests_v1(
 id uuid primary key default gen_random_uuid(),
 placement_id uuid not null references public.stand_placements_v236346(id),
 request_to text not null check(request_to in ('seller','manager')),
 status text not null default 'open' check(status in ('open','fulfilled','closed')),
 due_date date not null default (current_date+14),
 note text,
 requested_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(),
 fulfilled_at timestamptz,
 photo_id uuid references public.stand_photos_v236346(id)
);
create unique index if not exists stand_360_photo_one_open_idx on public.stand_360_photo_requests_v1(placement_id) where status='open';
alter table public.stand_360_photo_requests_v1 enable row level security;
revoke all on public.stand_360_photo_requests_v1 from public,anon,authenticated;
grant select on public.stand_360_photo_requests_v1 to authenticated;
create policy "stand360_requests_read" on public.stand_360_photo_requests_v1 for select to authenticated
using (exists(select 1 from public.stand_placements_v236346 p where p.id=placement_id
 and (private.crm_stands_role_v236346() in ('dfs','df') or
     (private.crm_stands_role_v236346()='manager' and p.manager_name=private.crm_stands_user_name_v236346()))));

create or replace function public.crm_stands_photo_request_v1(p_placement_id uuid,p_request_to text default 'seller',p_note text default null)
returns jsonb language plpgsql security definer set search_path to '' as $func$
declare p public.stand_placements_v236346%rowtype; existing uuid; made uuid;
v_role text:=private.crm_stands_role_v236346();v_name text:=private.crm_stands_user_name_v236346();
begin
 if (select auth.uid()) is null or v_role not in ('dfs','df','manager') then raise exception 'Нет доступа к контролю стенда';end if;
 select * into p from public.stand_placements_v236346 where id=p_placement_id;
 if p.id is null or p.status not in ('active','legacy_unreconciled','return_requested')
 or (v_role='manager' and p.manager_name<>v_name) then raise exception 'Стенд недоступен';end if;
 if p_request_to not in ('seller','manager') then raise exception 'Неверный получатель запроса';end if;
 select id into existing from public.stand_360_photo_requests_v1 where placement_id=p.id and status='open';
 if existing is not null then return jsonb_build_object('ok',true,'id',existing,'already_open',true);end if;
 insert into public.stand_360_photo_requests_v1(placement_id,request_to,note,requested_by)
 values(p.id,p_request_to,left(nullif(btrim(coalesce(p_note,'')),''),300),(select auth.uid())) returning id into made;
 return jsonb_build_object('ok',true,'id',made,'already_open',false);
end
$func$;
revoke all on function public.crm_stands_photo_request_v1(uuid,text,text) from public,anon;
grant execute on function public.crm_stands_photo_request_v1(uuid,text,text) to authenticated;

create or replace function public.crm_stands_photo_control_v1(p_placement_id uuid,p_photo_path text,p_origin text default 'manager',p_source_note text default null)
returns jsonb language plpgsql security definer set search_path to '' as $func$
declare p public.stand_placements_v236346%rowtype;ph uuid;
v_role text:=private.crm_stands_role_v236346();v_name text:=private.crm_stands_user_name_v236346();
begin
 if (select auth.uid()) is null or v_role not in ('dfs','df','manager') then raise exception 'Нет доступа к контролю стенда';end if;
 select * into p from public.stand_placements_v236346 where id=p_placement_id for update;
 if p.id is null or p.status not in ('active','legacy_unreconciled','return_requested')
 or (v_role='manager' and p.manager_name<>v_name) then raise exception 'Стенд недоступен';end if;
 if p_origin not in ('manager','seller') then raise exception 'Неверный источник фотографии';end if;
 if p_origin='seller' and length(btrim(coalesce(p_source_note,'')))<5 then raise exception 'Укажите, от кого получено фото';end if;
 if p_photo_path is null or left(p_photo_path,length('control/'||p.id::text||'/'))<>'control/'||p.id::text||'/'
 or length(p_photo_path)>400 then raise exception 'Фото должно принадлежать этому стенду';end if;
 if not exists(select 1 from storage.objects where bucket_id='stand-files' and name=p_photo_path)
 then raise exception 'Сначала загрузите фотографию';end if;
 if exists(select 1 from public.stand_photos_v236346 where placement_id=p.id and storage_path=p_photo_path)
 then raise exception 'Эта фотография уже привязана к стенду';end if;
 insert into public.stand_photos_v236346(placement_id,stage,storage_path,comment,created_by)
 values(p.id,'control',p_photo_path,'Стенды 360° · '||case when p_origin='seller' then 'фото от продавца' else 'фото от МПП' end||
  case when nullif(btrim(coalesce(p_source_note,'')),'') is not null then ' · '||left(p_source_note,300) else '' end,(select auth.uid()))
 returning id into ph;
 insert into public.stand_360_photo_sources_v1(placement_id,photo_id,origin,source_note,submitted_by)
 values(p.id,ph,p_origin,left(nullif(btrim(coalesce(p_source_note,'')),''),300),(select auth.uid()));
 update public.stand_placements_v236346
 set last_control_at=now(),last_control_photo_path=p_photo_path,
     vision_status=null,vision_summary='Фото обновлено — ожидается проверка Vision.'
 where id=p.id;
 update public.stand_360_photo_requests_v1
 set status='fulfilled',fulfilled_at=now(),photo_id=ph
 where placement_id=p.id and status='open';
 return jsonb_build_object('ok',true,'photo_id',ph,'origin',p_origin,'sku_preserved',true,'vision_required',true);
end
$func$;
revoke all on function public.crm_stands_photo_control_v1(uuid,text,text,text) from public,anon;
grant execute on function public.crm_stands_photo_control_v1(uuid,text,text,text) to authenticated;

create or replace function public.crm_stands_360_v1(p_limit integer default 150)
returns jsonb language plpgsql stable security definer set search_path to '' as $func$
declare r text:=private.crm_stands_role_v236346();n text:=private.crm_stands_user_name_v236346();
 result jsonb;lim integer:=least(greatest(coalesce(p_limit,150),1),250);
begin
 if (select auth.uid()) is null or r not in ('dfs','df','manager') then raise exception 'Нет доступа к разделу Стенды';end if;
 with s as(
 select p.id,p.client_id,c.code as client_code,p.client_name,p.manager_name,p.address,p.asset_id,
 a.asset_code,coalesce(t.brand,t.name) as stand_brand,t.name as stand_type,p.installed_at,p.status,
 p.vision_status,p.vision_checked_at,p.vision_summary,p.vision_fill_pct,p.vision_own_brand_pct,
 p.last_control_photo_path,p.installation_photo_path,p.last_control_at,
 v.stand_present,v.photo_quality_score,v.issues as vision_issues,
 (current_date-coalesce(p.last_control_at::date,p.installed_at)) as photo_days,
 coalesce(pr.origin,'unknown') as photo_origin,
 (select count(*) from public.stand_360_photo_requests_v1 rq where rq.placement_id=p.id and rq.status='open')>0 as photo_requested,
 coalesce(agg.sku_count,0) as sku_count,
 coalesce(agg.ship_3m,0) as ship_3m,
 coalesce(agg.ship_6m,0) as ship_6m,
 coalesce(agg.ship_prev6m,0) as ship_prev6m,
 agg.last_ship_month,
 case when agg.ship_prev6m>0 then round((agg.ship_6m/agg.ship_prev6m-1)*100,1) else null end as change_pct,
 case when points.cnt=1 then points.only_point_id else null end as physical_point_id,
 coalesce(points.cnt,0) as physical_point_links,
 (select min(rp.visit_date) from public.route_plans rp
   where rp.visit_date>=current_date and rp.client_id=p.client_id
   and rp.manager_name=p.manager_name and rp.removed is distinct from true
   and (rp.approved=true or rp.review_status='approved' or rp.published_at is not null)) as next_route_date
 from public.stand_placements_v236346 p
 left join public.clients c on c.id=p.client_id
 left join public.stand_assets_v236346 a on a.id=p.asset_id
 left join public.stand_asset_types_v236346 t on t.id=p.asset_type_id
 left join lateral(
   select count(distinct i.sku)::int sku_count,
    coalesce(sum(h.revenue) filter(where h.month>=date_trunc('month',current_date)::date-interval '2 months'),0)::numeric ship_3m,
    coalesce(sum(h.revenue) filter(where h.month>=date_trunc('month',current_date)::date-interval '5 months'),0)::numeric ship_6m,
    coalesce(sum(h.revenue) filter(where h.month>=date_trunc('month',current_date)::date-interval '11 months'
      and h.month<date_trunc('month',current_date)::date-interval '5 months'),0)::numeric ship_prev6m,
    max(h.month) last_ship_month
   from public.stand_placement_items_v236346 i
   left join public.purchase_history h on h.client_id=p.client_id and btrim(h.sku)=btrim(i.sku)
     and h.month>=date_trunc('month',current_date)::date-interval '11 months'
   where i.placement_id=p.id
 )agg on true
 left join lateral(
   select vp.* from public.stand_vision_checks_v236347 vp
    where vp.placement_id=p.id and vp.status='completed'
    order by vp.created_at desc limit 1
 )v on true
 left join lateral(
   select ss.origin from public.stand_360_photo_sources_v1 ss
   join public.stand_photos_v236346 ps on ps.id=ss.photo_id
   where ss.placement_id=p.id and ps.storage_path=coalesce(p.last_control_photo_path,p.installation_photo_path)
   order by ss.submitted_at desc limit 1
 )pr on true
 left join lateral(
   select count(distinct pc.point_id)::int cnt,min(pc.point_id) only_point_id
   from public.route_physical_point_clients pc where pc.client_id=p.client_id
 )points on true
 where p.status in ('active','legacy_unreconciled','return_requested')
 and (r in ('dfs','df') or p.manager_name=n)
 order by p.installed_at desc,p.id
 limit lim
 ), labeled as(
  select s.*,
  case
   when asset_id is null then 'reconcile_asset'
   when last_control_photo_path is null and installation_photo_path is null then 'photo_required'
   when photo_days>45 then 'photo_stale'
   when vision_status is null or vision_checked_at is null or
     vision_checked_at<coalesce(last_control_at,'epoch'::timestamptz) then 'vision_pending'
   when stand_present is false then 'stand_missing_review'
   when sku_count=0 then 'sku_unconfirmed'
   when ship_6m<=0 then 'sales_attention'
   when change_pct is not null and change_pct<=-25 then 'sales_attention'
   else 'maintain' end as recommendation_code
  from s
 )
 select jsonb_build_object('version','stands360-v1','sales_granularity','monthly_customer_shipments_by_registered_sku',
   'gps_required',false,'total',count(*),
   'needs_photo',count(*) filter(where recommendation_code in ('photo_required','photo_stale')),
   'assets_unreconciled',count(*) filter(where asset_id is null),
   'needs_action',count(*) filter(where recommendation_code<>'maintain'),
   'stands',coalesce(jsonb_agg(to_jsonb(labeled) order by case recommendation_code when 'stand_missing_review' then 0 when 'reconcile_asset' then 1 when 'photo_required' then 2 when 'photo_stale' then 3 when 'sales_attention' then 4 else 5 end,client_name),'[]'::jsonb))
 into result from labeled;
 return result;
end
$func$;
revoke all on function public.crm_stands_360_v1(integer) from public,anon;
grant execute on function public.crm_stands_360_v1(integer) to authenticated;


create or replace function public.crm_stands_360_skus_v1(p_placement_id uuid)
returns jsonb language plpgsql stable security definer set search_path to '' as $func$
declare p public.stand_placements_v236346%rowtype;
r text:=private.crm_stands_role_v236346();n text:=private.crm_stands_user_name_v236346();out_json jsonb;
begin
 if (select auth.uid()) is null or r not in ('dfs','df','manager') then raise exception 'Нет доступа';end if;
 select * into p from public.stand_placements_v236346 where id=p_placement_id;
 if p.id is null or (r='manager' and p.manager_name<>n) then raise exception 'Стенд недоступен';end if;
 select coalesce(jsonb_agg(jsonb_build_object(
   'sku',x.sku,'product',x.product_name,'last_ship_month',x.last_ship_month,
   'ship_3m',x.ship_3m,'ship_6m',x.ship_6m,'ship_prev6m',x.ship_prev6m
 ) order by x.ship_6m desc,x.sku),'[]'::jsonb) into out_json
 from (
  select i.sku,i.product_name,
   max(h.month) as last_ship_month,
   round(coalesce(sum(h.revenue) filter(where h.month>=date_trunc('month',current_date)::date-interval '2 months'),0),2) as ship_3m,
   round(coalesce(sum(h.revenue) filter(where h.month>=date_trunc('month',current_date)::date-interval '5 months'),0),2) as ship_6m,
   round(coalesce(sum(h.revenue) filter(where h.month>=date_trunc('month',current_date)::date-interval '11 months'
     and h.month<date_trunc('month',current_date)::date-interval '5 months'),0),2) as ship_prev6m
  from public.stand_placement_items_v236346 i
  left join public.purchase_history h on h.client_id=p.client_id and btrim(h.sku)=btrim(i.sku)
    and h.month>=date_trunc('month',current_date)::date-interval '11 months'
  where i.placement_id=p.id group by i.sku,i.product_name
  order by sum(h.revenue) filter(where h.month>=date_trunc('month',current_date)::date-interval '5 months') desc nulls last
  limit 200
 ) x;
 return jsonb_build_object('placement_id',p.id,'client_id',p.client_id,
    'data_granularity','month','origin','1C purchase_history shipments to client',
    'rows',out_json);
end
$func$;
revoke all on function public.crm_stands_360_skus_v1(uuid) from public,anon;
grant execute on function public.crm_stands_360_skus_v1(uuid) to authenticated;
