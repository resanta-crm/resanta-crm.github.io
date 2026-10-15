-- RESANTA CRM v23.6.365 · stands administration, integrity and primary control

alter table public.stand_placements_v236346
  drop constraint if exists stand_placements_v236346_status_check;
alter table public.stand_placements_v236346
  add constraint stand_placements_v236346_status_check
  check (status = any(array['active'::text,'return_requested'::text,'returned'::text,'legacy_unreconciled'::text,'archived_manual'::text]));

alter table public.stand_placements_v236346
  drop constraint if exists stand_placements_v236346_check;
alter table public.stand_placements_v236346
  add constraint stand_placements_v236346_check
  check (removed_at is null or return_photo_path is not null or status='archived_manual');

CREATE OR REPLACE FUNCTION public.crm_stands_manual_add_v236365(p_client_id uuid, p_asset_type_id uuid, p_address text, p_installed_at date DEFAULT CURRENT_DATE, p_asset_id uuid DEFAULT NULL::uuid, p_contract_no text DEFAULT NULL::text, p_contract_date date DEFAULT NULL::date, p_valid_to date DEFAULT NULL::date, p_contract_path text DEFAULT NULL::text, p_act_transfer_path text DEFAULT NULL::text, p_install_photo_path text DEFAULT NULL::text, p_skus text[] DEFAULT ARRAY[]::text[], p_note text DEFAULT NULL::text, p_allow_duplicate boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'private', 'auth', 'pg_catalog'
AS $function$
declare
  v_role text:=private.crm_stands_role_v236346();
  v_actor text:=private.crm_stands_user_name_v236346();
  c public.clients%rowtype;
  t public.stand_asset_types_v236346%rowtype;
  a public.stand_assets_v236346%rowtype;
  v_contract_id uuid;
  v_placement_id uuid;
  v_status text;
  v_dup uuid;
  v_sku text;
begin
  if v_role not in ('df','dfs') then raise exception 'Ручное добавление доступно только ДФ/ДФС'; end if;
  select * into c from public.clients where id=p_client_id;
  if c.id is null then raise exception 'Клиент не найден'; end if;
  select * into t from public.stand_asset_types_v236346 where id=p_asset_type_id and active;
  if t.id is null then raise exception 'Тип стенда не найден'; end if;
  if btrim(coalesce(p_address,''))='' then raise exception 'Укажите адрес установки'; end if;

  select p.id into v_dup
  from public.stand_placements_v236346 p
  where p.client_id=c.id
    and p.asset_type_id=t.id
    and p.status in ('active','legacy_unreconciled','return_requested')
    and lower(regexp_replace(btrim(p.address),'\s+','','g'))=
        lower(regexp_replace(btrim(p_address),'\s+','','g'))
  order by p.created_at desc
  limit 1;
  if v_dup is not null and not coalesce(p_allow_duplicate,false) then
    raise exception 'Похожий действующий стенд уже есть у этого клиента по тому же адресу. Проверьте дубль перед сохранением.';
  end if;

  if p_asset_id is not null then
    select * into a from public.stand_assets_v236346 where id=p_asset_id for update;
    if a.id is null then raise exception 'ОС не найден'; end if;
    if a.asset_type_id<>t.id then raise exception 'Выбранный ОС относится к другому типу стенда'; end if;
    if a.status<>'free' then raise exception 'Этот ОС уже не свободен'; end if;
    v_status:='active';
  else
    v_status:='legacy_unreconciled';
  end if;

  if btrim(coalesce(p_contract_no,''))<>'' or btrim(coalesce(p_contract_path,''))<>'' or btrim(coalesce(p_act_transfer_path,''))<>'' then
    insert into public.stand_contracts_v236346(
      client_id,client_name,contract_no,contract_date,valid_to,quantity,
      asset_description,address,contract_path,act_transfer_path,status,source_note
    ) values(
      c.id,c.name,nullif(btrim(coalesce(p_contract_no,'')),''),
      p_contract_date,p_valid_to,1,t.name,btrim(p_address),
      nullif(btrim(coalesce(p_contract_path,'')),''),
      nullif(btrim(coalesce(p_act_transfer_path,'')),''),
      'active','Ручное добавление в разделе «Стенды» · '||coalesce(v_actor,'ДФ/ДФС')
    ) returning id into v_contract_id;
  end if;

  insert into public.stand_placements_v236346(
    asset_id,asset_type_id,request_id,contract_id,client_id,client_name,manager_name,address,
    installed_at,status,installation_photo_path,last_control_at,source,note
  ) values(
    p_asset_id,t.id,null,v_contract_id,c.id,c.name,coalesce(nullif(btrim(c.manager_name),''),coalesce(v_actor,'—')),
    btrim(p_address),coalesce(p_installed_at,current_date),v_status,
    nullif(btrim(coalesce(p_install_photo_path,'')),''),
    case when btrim(coalesce(p_install_photo_path,''))<>'' then now() else null end,
    'crm',
    nullif(btrim(coalesce(p_note,'')),'')
  ) returning id into v_placement_id;

  if p_asset_id is not null then
    update public.stand_assets_v236346
       set status='installed',current_client_id=c.id,current_manager_name=coalesce(nullif(btrim(c.manager_name),''),v_actor),
           current_address=btrim(p_address),installed_at=coalesce(p_installed_at,current_date),updated_at=now()
     where id=p_asset_id;
    insert into public.stand_asset_events_v236346(
      asset_id,placement_id,event_type,from_status,to_status,client_id,manager_name,address,comment,actor_user_id,actor_name
    ) values(
      p_asset_id,v_placement_id,'manual_install','free','installed',c.id,coalesce(nullif(btrim(c.manager_name),''),v_actor),
      btrim(p_address),'Ручное добавление установленного стенда в CRM.',auth.uid(),v_actor
    );
  end if;

  if btrim(coalesce(p_install_photo_path,''))<>'' then
    insert into public.stand_photos_v236346(placement_id,stage,storage_path,comment,created_by)
    values(v_placement_id,'install',btrim(p_install_photo_path),'Фото при ручном добавлении',auth.uid());
  end if;

  foreach v_sku in array coalesce(p_skus,array[]::text[]) loop
    v_sku:=btrim(coalesce(v_sku,''));
    if v_sku<>'' then
      insert into public.stand_placement_items_v236346(
        placement_id,sku,product_name,category,subgroup,price_vat,price_valid_from,price_source,has_current_mo2
      )
      select v_placement_id,v_sku,catalog.product_name,
             upper(btrim(coalesce(catalog.category,'БЕЗ ГРУППЫ'))),
             upper(btrim(coalesce(nullif(catalog.subgroup,''),'БЕЗ ПОДГРУППЫ'))),
             catalog.price_vat,catalog.valid_from,catalog.source_kind,catalog.has_current_mo2
      from public.crm_promotion_catalog_v236215 catalog
      where btrim(catalog.sku)=v_sku
      limit 1
      on conflict do nothing;

      if not found then
        insert into public.stand_placement_items_v236346(placement_id,sku)
        values(v_placement_id,v_sku) on conflict do nothing;
      end if;
    end if;
  end loop;

  perform public.crm_stands_assess_placement_v236346(v_placement_id);

  return jsonb_build_object(
    'ok',true,'placement_id',v_placement_id,'status',v_status,'contract_id',v_contract_id,
    'asset_linked',p_asset_id is not null
  );
end;
$function$
;
CREATE OR REPLACE FUNCTION public.crm_stands_archive_placement_v236365(p_placement_id uuid, p_reason text, p_release_asset boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'private', 'auth', 'pg_catalog'
AS $function$
declare
  p public.stand_placements_v236346%rowtype;
  a public.stand_assets_v236346%rowtype;
  v_role text:=private.crm_stands_role_v236346();
  v_actor text:=private.crm_stands_user_name_v236346();
  v_asset_status text;
begin
  if v_role not in ('df','dfs') then raise exception 'Архивирование доступно только ДФ/ДФС'; end if;
  if btrim(coalesce(p_reason,''))='' then raise exception 'Укажите причину удаления из рабочего списка'; end if;

  select * into p from public.stand_placements_v236346 where id=p_placement_id for update;
  if p.id is null then raise exception 'Стенд не найден'; end if;
  if p.status in ('returned','archived_manual') then raise exception 'Запись уже находится в истории/архиве'; end if;

  update public.stand_placements_v236346
     set status='archived_manual',removed_at=current_date,
         note=concat_ws(E'\n',nullif(btrim(coalesce(note,'')),''),
           '[Архив '||to_char(now(),'DD.MM.YYYY HH24:MI')||' · '||coalesce(v_actor,'ДФ/ДФС')||'] '||btrim(p_reason)),
         updated_at=now()
   where id=p.id;

  if p.asset_id is not null then
    select * into a from public.stand_assets_v236346 where id=p.asset_id for update;
    if coalesce(p_release_asset,false) then
      v_asset_status:='free';
      update public.stand_assets_v236346
         set status='free',current_client_id=null,current_manager_name=null,current_address=null,installed_at=null,updated_at=now()
       where id=p.asset_id;
    else
      v_asset_status:=a.status;
    end if;
    insert into public.stand_asset_events_v236346(
      asset_id,placement_id,event_type,from_status,to_status,client_id,manager_name,address,comment,actor_user_id,actor_name
    ) values(
      p.asset_id,p.id,
      case when p_release_asset then 'manual_archive_release' else 'manual_archive_keep_asset' end,
      a.status,v_asset_status,p.client_id,p.manager_name,p.address,btrim(p_reason),auth.uid(),v_actor
    );
  end if;

  return jsonb_build_object('ok',true,'status','archived_manual','asset_released',coalesce(p_release_asset,false));
end;
$function$
;
CREATE OR REPLACE FUNCTION public.crm_stands_assess_placement_v236346(p_placement_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'private', 'auth', 'pg_catalog'
AS $function$
declare
  p public.stand_placements_v236346%rowtype;
  t public.stand_asset_types_v236346%rowtype;
  r public.stand_requests_v236346%rowtype;
  v_role text:=private.crm_stands_role_v236346();
  v_name text:=private.crm_stands_user_name_v236346();
  v_cats text[]:=array[]::text[];
  v_m0 date:=date_trunc('month',current_date)::date;
  v_recent_start date:=(date_trunc('month',current_date)-interval '2 months')::date;
  v_prevyear_start date:=(date_trunc('month',current_date)-interval '14 months')::date;
  v_prevyear_end date:=(date_trunc('month',current_date)-interval '12 months')::date;
  v_before_end date;
  v_before_start date;
  v_recent numeric:=0;
  v_season numeric:=0;
  v_before numeric:=0;
  v_base numeric:=0;
  v_growth numeric:=null;
  v_age int;
  v_item_count int:=0;
  v_has_photo boolean:=false;
  v_incomplete boolean:=false;
  v_add jsonb:='[]'::jsonb;
  v_remove jsonb:='[]'::jsonb;
  v_calc_score int:=50;
  v_public_score int:=null;
  v_status text;
  v_summary text;
  v_internal jsonb;
begin
  select * into p from public.stand_placements_v236346 where id=p_placement_id;
  if p.id is null then raise exception 'Стенд не найден или недоступен'; end if;
  if not (v_role in ('df','dfs') or (v_role='manager' and p.manager_name=v_name)) then raise exception 'Нет доступа к анализу'; end if;
  if p.status not in ('active','legacy_unreconciled','return_requested') then raise exception 'Анализ доступен только для действующего стенда'; end if;

  select * into t from public.stand_asset_types_v236346 where id=p.asset_type_id;
  if p.request_id is not null then select * into r from public.stand_requests_v236346 where id=p.request_id; end if;
  v_cats:=case when r.id is not null and cardinality(r.selected_categories)>0 then r.selected_categories else t.target_categories end;

  v_before_end:=(date_trunc('month',p.installed_at)-interval '1 month')::date;
  v_before_start:=(date_trunc('month',p.installed_at)-interval '3 months')::date;
  v_age:=greatest(0,current_date-p.installed_at);
  select count(*) into v_item_count from public.stand_placement_items_v236346 i where i.placement_id=p.id;
  v_has_photo:=btrim(coalesce(p.last_control_photo_path,p.installation_photo_path,''))<>'';
  v_incomplete:=v_item_count=0 or not v_has_photo;

  select coalesce(sum(h.revenue),0) into v_recent
  from public.purchase_history h
  where h.client_id=p.client_id and h.month between v_recent_start and v_m0
    and (cardinality(v_cats)=0 or h.category=any(v_cats))
    and (coalesce(btrim(t.brand),'')='' or h.product ilike '%'||t.brand||'%');

  select coalesce(sum(h.revenue),0) into v_season
  from public.purchase_history h
  where h.client_id=p.client_id and h.month between v_prevyear_start and v_prevyear_end
    and (cardinality(v_cats)=0 or h.category=any(v_cats))
    and (coalesce(btrim(t.brand),'')='' or h.product ilike '%'||t.brand||'%');

  select coalesce(sum(h.revenue),0) into v_before
  from public.purchase_history h
  where h.client_id=p.client_id and h.month between v_before_start and v_before_end
    and (cardinality(v_cats)=0 or h.category=any(v_cats))
    and (coalesce(btrim(t.brand),'')='' or h.product ilike '%'||t.brand||'%');

  v_base:=case when v_season>0 then v_season else v_before end;
  if v_base>0 then v_growth:=round((v_recent/v_base-1)*100,1); end if;

  select coalesce(jsonb_agg(jsonb_build_object('sku',q.sku,'product',q.product,'sales_3m',q.sales) order by q.sales desc),'[]'::jsonb)
    into v_add
  from (
    select btrim(h.sku) sku,max(h.product) product,round(sum(h.revenue),2) sales
    from public.purchase_history h
    where h.client_id=p.client_id and h.month between v_recent_start and v_m0
      and btrim(coalesce(h.sku,''))<>''
      and (cardinality(v_cats)=0 or h.category=any(v_cats))
      and (coalesce(btrim(t.brand),'')='' or h.product ilike '%'||t.brand||'%')
      and not exists(select 1 from public.stand_placement_items_v236346 i where i.placement_id=p.id and btrim(i.sku)=btrim(h.sku))
    group by btrim(h.sku)
    having sum(h.revenue)>0
    order by sum(h.revenue) desc
    limit 5
  ) q;

  select coalesce(jsonb_agg(jsonb_build_object('sku',q.sku,'product',q.product,'sales_3m',q.sales) order by q.sales,q.sku),'[]'::jsonb)
    into v_remove
  from (
    select i.sku,i.product_name product,round(coalesce(sum(h.revenue),0),2) sales
    from public.stand_placement_items_v236346 i
    left join public.purchase_history h
      on h.client_id=p.client_id and btrim(h.sku)=btrim(i.sku) and h.month between v_recent_start and v_m0
    where i.placement_id=p.id
    group by i.sku,i.product_name
    having coalesce(sum(h.revenue),0)<100
    order by coalesce(sum(h.revenue),0),i.sku
    limit 5
  ) q;

  v_calc_score:=50
    + case when v_recent>=10000 then 25 when v_recent>=5000 then 20 when v_recent>=2000 then 15 when v_recent>=500 then 5 else -10 end
    + case when v_growth is null then 0 when v_growth>=30 then 20 when v_growth>=10 then 15 when v_growth>=0 then 5 when v_growth>=-20 then -5 else -20 end
    - case when v_item_count=0 then 10 when jsonb_array_length(v_remove)>=3 then 10 when jsonb_array_length(v_remove)>0 then 5 else 0 end;
  v_calc_score:=greatest(0,least(100,v_calc_score));

  if v_incomplete then
    v_public_score:=null;
    v_status:='control';
    v_summary:='Нужен первичный контроль: '
      ||case when not v_has_photo and v_item_count=0 then 'нет актуального фото и списка SKU.'
              when not v_has_photo then 'нет актуального фото стенда.'
              else 'не зафиксирован список фактических SKU на стенде.' end
      ||' Загрузите фото и SKU; до этого ИИ не делает вывод «оставить/забрать».';
  else
    v_public_score:=v_calc_score;
    if v_age<60 then
      v_status:=case when jsonb_array_length(v_add)>0 or jsonb_array_length(v_remove)>0 then 'optimize' else 'control' end;
    elsif v_calc_score>=75 then v_status:='keep';
    elsif v_calc_score>=55 then v_status:='optimize';
    elsif v_calc_score>=35 then v_status:='control';
    else v_status:='return';
    end if;
    v_summary:=case v_status
      when 'keep' then 'Оставить: стенд показывает хорошую эффективность.'
      when 'optimize' then 'Оптимизировать: стенд оставить, но скорректировать ассортимент.'
      when 'control' then 'Под контроль: дать менеджеру срок на улучшение результата.'
      when 'return' then 'Рассмотреть возврат стенда: продажи и динамика слабые.'
      else 'Контроль' end;
  end if;

  v_summary:=v_summary||' Продажи '||coalesce(nullif(t.brand,''),'товарного охвата')||
    ' за последние 3 мес. '||round(v_recent,0)||' BYN'
    ||case when v_growth is null then '' else ', изменение к сезонной/доступной базе '||v_growth||'%' end||'.';

  v_internal:=jsonb_build_object(
    'version','v23.6.365','entity','placement','placement_id',p.id,'age_days',v_age,'stand_brand',t.brand,
    'categories',v_cats,'placed_sku_count',v_item_count,'has_photo',v_has_photo,
    'recent_3m_sales',round(v_recent,2),'same_3m_previous_year',round(v_season,2),
    'pre_install_3m_sales',round(v_before,2),'baseline_used',round(v_base,2),'growth_pct',v_growth,
    'preliminary_score',v_calc_score,'public_score',v_public_score,'status',v_status,
    'add_candidates',v_add,'weak_placed_skus',v_remove,
    'grace_period_applied',v_age<60,'incomplete_primary_control',v_incomplete
  );

  update public.stand_placements_v236346
     set ai_score=v_public_score,ai_status=v_status,ai_public_summary=v_summary,ai_checked_at=now(),updated_at=now()
   where id=p.id;

  insert into public.stand_ai_internal_v236346(entity_type,entity_id,engine_version,internal_logic)
  values('placement',p.id,'v23.6.365',v_internal);

  return jsonb_build_object(
    'score',v_public_score,'preliminary_score',v_calc_score,'status',v_status,'summary',v_summary,
    'add_skus',v_add,'remove_skus',v_remove,'grace_period',v_age<60,
    'incomplete_primary_control',v_incomplete,'has_photo',v_has_photo,'sku_count',v_item_count
  );
end;
$function$
;
CREATE OR REPLACE FUNCTION public.crm_stands_bootstrap_v236346(p_limit integer DEFAULT 100)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'private', 'auth', 'pg_catalog'
AS $function$
declare
  v_role text:=private.crm_stands_role_v236346();
  v_name text:=private.crm_stands_user_name_v236346();
  v_limit int:=least(greatest(coalesce(p_limit,100),20),300);
  v_result jsonb;
begin
  if (select auth.uid()) is null then raise exception 'Требуется вход в CRM'; end if;

  select jsonb_build_object(
    'version','v23.6.365',
    'actor',jsonb_build_object('name',v_name,'stand_role',v_role,'dfs_internal',v_role='dfs'),
    'summary',jsonb_build_object(
      'os_units',(select coalesce(sum(quantity),0) from public.stand_os_lots_v236346),
      'physical_assets',(select count(*) from public.stand_assets_v236346),
      'free',(select count(*) from public.stand_assets_v236346 where status='free'),
      'reserved',(select count(*) from public.stand_assets_v236346 where status='reserved'),
      'installed',(select count(*) from public.stand_assets_v236346 where status='installed'),
      'repair',(select count(*) from public.stand_assets_v236346 where status='repair'),
      'legacy_unreconciled',(select count(*) from public.stand_placements_v236346 where asset_id is null and status in ('active','legacy_unreconciled','return_requested')),
      'pending_df',(select count(*) from public.stand_requests_v236346 where status='pending_df'),
      'no_contract',(select count(*) from public.stand_placements_v236346 p where p.status in ('active','legacy_unreconciled','return_requested') and p.contract_id is null),
      'no_transfer_act',(select count(*) from public.stand_placements_v236346 p join public.stand_contracts_v236346 c on c.id=p.contract_id where p.status in ('active','legacy_unreconciled','return_requested') and c.act_transfer_path is null),
      'stale_photo',(select count(*) from public.stand_placements_v236346 p where p.status in ('active','legacy_unreconciled','return_requested') and coalesce(p.last_control_at,p.installed_at::timestamptz)<now()-interval '31 days'),
      'needs_primary_control',(select count(*) from public.stand_placements_v236346 p where p.status in ('active','legacy_unreconciled','return_requested') and (
          btrim(coalesce(p.last_control_photo_path,p.installation_photo_path,''))=''
          or not exists(select 1 from public.stand_placement_items_v236346 i where i.placement_id=p.id)
      )),
      'history',(select count(*) from public.stand_placements_v236346 where status in ('returned','archived_manual'))
    ),
    'asset_types',coalesce((select jsonb_agg(to_jsonb(x) order by x.name) from (select * from public.stand_asset_types_v236346 where active) x),'[]'::jsonb),
    'os_lots',coalesce((select jsonb_agg(to_jsonb(x) order by x.acquired_on,x.os_name) from (select * from public.stand_os_lots_v236346) x),'[]'::jsonb),
    'assets',coalesce((select jsonb_agg(to_jsonb(x) order by x.asset_code) from (select * from public.stand_assets_v236346 order by asset_code limit v_limit) x),'[]'::jsonb),
    'requests',coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at desc) from (select * from public.stand_requests_v236346 order by created_at desc limit v_limit) x),'[]'::jsonb),
    'request_assets',coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.stand_request_assets_v236346 limit v_limit*4) x),'[]'::jsonb),
    'placements',coalesce((
      select jsonb_agg(to_jsonb(x) order by x.installed_at desc,x.created_at desc)
      from (
        select * from public.stand_placements_v236346
        where status in ('active','legacy_unreconciled','return_requested')
        order by installed_at desc,created_at desc
        limit v_limit
      ) x
    ),'[]'::jsonb),
    'history',coalesce((
      select jsonb_agg(to_jsonb(x) order by x.removed_at desc nulls last,x.updated_at desc)
      from (
        select * from public.stand_placements_v236346
        where status in ('returned','archived_manual')
        order by removed_at desc nulls last,updated_at desc
        limit v_limit
      ) x
    ),'[]'::jsonb),
    'placement_items',coalesce((
      select jsonb_agg(to_jsonb(i) order by i.placement_id,i.added_at,i.sku)
      from public.stand_placement_items_v236346 i
      where i.placement_id in (
        select id from (
          select id from public.stand_placements_v236346
          where status in ('active','legacy_unreconciled','return_requested','returned','archived_manual')
          order by coalesce(removed_at,installed_at) desc nulls last,updated_at desc
          limit v_limit*2
        ) pids
      )
    ),'[]'::jsonb),
    'contracts',coalesce((select jsonb_agg(to_jsonb(x) order by x.contract_date desc nulls last) from (select * from public.stand_contracts_v236346 order by contract_date desc nulls last limit v_limit*2) x),'[]'::jsonb),
    'recommendations',case when v_role in ('df','dfs') then
      coalesce((select jsonb_agg(to_jsonb(x) order by x.score desc nulls last,x.generated_at desc) from (select * from public.stand_recommendations_v236346 order by score desc nulls last,generated_at desc limit v_limit) x),'[]'::jsonb)
      else '[]'::jsonb end
  ) into v_result;

  return v_result;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.crm_stands_return_placement_v236346(p_placement_id uuid, p_return_photo_path text, p_return_condition text, p_comment text DEFAULT NULL::text, p_act_return_path text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'private', 'auth', 'pg_catalog'
AS $function$
declare
  p public.stand_placements_v236346%rowtype;
  a public.stand_assets_v236346%rowtype;
  v_role text:=private.crm_stands_role_v236346();
  v_name text:=private.crm_stands_user_name_v236346();
  v_asset_to text;
begin
  select * into p from public.stand_placements_v236346 where id=p_placement_id for update;
  if p.id is null then raise exception 'Стенд не найден'; end if;
  if not (v_role in ('df','dfs') or (v_role='manager' and p.manager_name=v_name)) then raise exception 'Нет доступа'; end if;
  if p.status<>'return_requested' then raise exception 'Сначала ДФ должен принять решение о возврате стенда'; end if;
  if btrim(coalesce(p_return_photo_path,''))='' then raise exception 'Приложите фото возврата'; end if;
  if p_return_condition not in ('ok','repair','damaged') then raise exception 'Укажите состояние стенда'; end if;

  if p.asset_id is not null then
    select * into a from public.stand_assets_v236346 where id=p.asset_id for update;
    v_asset_to:=case when p_return_condition='ok' then 'free' else 'repair' end;

    update public.stand_assets_v236346
       set status=v_asset_to,current_client_id=null,current_manager_name=null,current_address=null,installed_at=null,
           condition_status=case when p_return_condition='ok' then 'ok' else p_return_condition end,
           updated_at=now()
     where id=p.asset_id;

    insert into public.stand_asset_events_v236346(
      asset_id,placement_id,event_type,from_status,to_status,client_id,manager_name,address,comment,actor_user_id,actor_name
    ) values(
      p.asset_id,p.id,'returned',coalesce(a.status,'installed'),v_asset_to,p.client_id,p.manager_name,p.address,
      nullif(btrim(coalesce(p_comment,'')),''),auth.uid(),v_name
    );
  end if;

  update public.stand_placements_v236346
     set status='returned',removed_at=current_date,return_photo_path=p_return_photo_path,
         return_condition=p_return_condition,
         note=concat_ws(E'\n',nullif(btrim(coalesce(note,'')),''),
              nullif(btrim(coalesce(p_comment,'')),''))
   where id=p.id;

  insert into public.stand_photos_v236346(placement_id,stage,storage_path,comment,created_by)
  values(p.id,'return',p_return_photo_path,nullif(btrim(coalesce(p_comment,'')),''),auth.uid());

  if p.contract_id is not null and btrim(coalesce(p_act_return_path,''))<>'' then
    update public.stand_contracts_v236346 set act_return_path=p_act_return_path,status='closed',updated_at=now() where id=p.contract_id;
  end if;

  return jsonb_build_object('ok',true,'status','returned','asset_status',v_asset_to);
end;
$function$
;
CREATE OR REPLACE FUNCTION public.crm_stands_finalize_install_v236346(p_request_id uuid, p_address text, p_installed_at date, p_contract_no text, p_contract_date date, p_valid_to date, p_asset_description text, p_contract_value_byn numeric, p_contract_path text, p_act_transfer_path text, p_install_photo_path text, p_skus text[] DEFAULT ARRAY[]::text[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'private', 'auth', 'pg_catalog'
AS $function$
declare
  r public.stand_requests_v236346%rowtype;
  c public.stand_contracts_v236346%rowtype;
  ra record;
  p_id uuid;
  v_ids uuid[]:=array[]::uuid[];
  v_role text:=private.crm_stands_role_v236346();
  v_name text:=private.crm_stands_user_name_v236346();
  v_sku text;
begin
  select * into r from public.stand_requests_v236346 where id=p_request_id for update;
  if r.id is null then raise exception 'Заявка не найдена'; end if;
  if not (v_role in ('df','dfs') or (v_role='manager' and r.manager_name=v_name)) then raise exception 'Нет доступа к установке'; end if;
  if r.status<>'approved' then raise exception 'Сначала ДФ должен согласовать заявку'; end if;
  if btrim(coalesce(p_address,''))='' then raise exception 'Укажите фактический адрес установки'; end if;
  if p_contract_no is null or btrim(p_contract_no)='' then raise exception 'Укажите номер договора'; end if;
  if p_contract_path is null or btrim(p_contract_path)='' then raise exception 'Приложите PDF договора'; end if;
  if p_act_transfer_path is null or btrim(p_act_transfer_path)='' then raise exception 'Приложите акт приёма-передачи'; end if;
  if p_install_photo_path is null or btrim(p_install_photo_path)='' then raise exception 'Приложите фото установленного стенда'; end if;

  insert into public.stand_contracts_v236346(
    request_id,client_id,client_name,contract_no,contract_date,valid_to,quantity,
    asset_description,value_byn,address,contract_path,act_transfer_path,status
  ) values(
    r.id,r.client_id,r.client_name,btrim(p_contract_no),p_contract_date,p_valid_to,r.requested_qty,
    nullif(btrim(coalesce(p_asset_description,'')),''),p_contract_value_byn,btrim(p_address),
    p_contract_path,p_act_transfer_path,'active'
  ) returning * into c;

  for ra in
    select x.asset_id,a.asset_type_id,a.status old_status
    from public.stand_request_assets_v236346 x
    join public.stand_assets_v236346 a on a.id=x.asset_id
    where x.request_id=r.id
    order by a.asset_code
    for update of a
  loop
    if ra.old_status<>'reserved' then raise exception 'ОС в заявке уже не находится в резерве'; end if;

    update public.stand_assets_v236346
       set status='installed',current_client_id=r.client_id,current_manager_name=r.manager_name,
           current_address=btrim(p_address),installed_at=coalesce(p_installed_at,current_date),updated_at=now()
     where id=ra.asset_id;

    insert into public.stand_placements_v236346(
      asset_id,asset_type_id,request_id,contract_id,client_id,client_name,manager_name,address,
      installed_at,status,installation_photo_path,last_control_at,source
    ) values(
      ra.asset_id,ra.asset_type_id,r.id,c.id,r.client_id,r.client_name,r.manager_name,btrim(p_address),
      coalesce(p_installed_at,current_date),'active',p_install_photo_path,now(),'crm'
    ) returning id into p_id;
    v_ids:=array_append(v_ids,p_id);

    insert into public.stand_asset_events_v236346(
      asset_id,request_id,placement_id,event_type,from_status,to_status,client_id,manager_name,address,comment,actor_user_id,actor_name
    ) values(
      ra.asset_id,r.id,p_id,'installed','reserved','installed',r.client_id,r.manager_name,btrim(p_address),
      'Установка подтверждена в CRM.',auth.uid(),v_name
    );

    foreach v_sku in array coalesce(p_skus,array[]::text[]) loop
      if btrim(coalesce(v_sku,''))<>'' then
        insert into public.stand_placement_items_v236346(placement_id,sku)
        values(p_id,btrim(v_sku)) on conflict do nothing;
      end if;
    end loop;

    insert into public.stand_photos_v236346(placement_id,stage,storage_path,comment,created_by)
    values(p_id,'install',p_install_photo_path,'Фото при установке',auth.uid());
  end loop;

  if cardinality(v_ids)=0 then raise exception 'В заявке нет зарезервированных ОС'; end if;

  update public.stand_requests_v236346
     set status='installed',updated_at=now()
   where id=r.id;

  return jsonb_build_object('ok',true,'contract_id',c.id,'placement_ids',to_jsonb(v_ids));
end;
$function$
;

revoke all on function public.crm_stands_manual_add_v236365(uuid,uuid,text,date,uuid,text,date,date,text,text,text,text[],text,boolean) from public,anon;
grant execute on function public.crm_stands_manual_add_v236365(uuid,uuid,text,date,uuid,text,date,date,text,text,text,text[],text,boolean) to authenticated,service_role;
revoke all on function public.crm_stands_archive_placement_v236365(uuid,text,boolean) from public,anon;
grant execute on function public.crm_stands_archive_placement_v236365(uuid,text,boolean) to authenticated,service_role;

drop policy if exists stand_placements_insert_v236346 on public.stand_placements_v236346;
create policy stand_placements_insert_v236346
on public.stand_placements_v236346
for insert to authenticated
with check (
  private.crm_stands_role_v236346() in ('df','dfs')
  or (
    private.crm_stands_role_v236346()='manager'
    and manager_name=private.crm_stands_user_name_v236346()
    and request_id is not null
    and asset_id is not null
    and exists (
      select 1 from public.stand_requests_v236346 r
      where r.id=stand_placements_v236346.request_id
        and r.manager_name=private.crm_stands_user_name_v236346()
        and r.status='approved'
    )
    and exists (
      select 1 from public.stand_request_assets_v236346 ra
      where ra.request_id=stand_placements_v236346.request_id
        and ra.asset_id=stand_placements_v236346.asset_id
    )
  )
);

drop policy if exists stand_assets_manager_install_update_v236365 on public.stand_assets_v236346;
create policy stand_assets_manager_install_update_v236365
on public.stand_assets_v236346
for update to authenticated
using (
  private.crm_stands_role_v236346()='manager'
  and status='reserved'
  and current_manager_name=private.crm_stands_user_name_v236346()
  and exists (
    select 1 from public.stand_request_assets_v236346 ra
    join public.stand_requests_v236346 r on r.id=ra.request_id
    where ra.asset_id=stand_assets_v236346.id
      and r.status='approved'
      and r.manager_name=private.crm_stands_user_name_v236346()
  )
)
with check (
  status='installed'
  and current_manager_name=private.crm_stands_user_name_v236346()
  and exists (
    select 1 from public.stand_request_assets_v236346 ra
    join public.stand_requests_v236346 r on r.id=ra.request_id
    where ra.asset_id=stand_assets_v236346.id
      and r.status='approved'
      and r.manager_name=private.crm_stands_user_name_v236346()
      and r.client_id=stand_assets_v236346.current_client_id
  )
);

drop policy if exists stand_assets_manager_return_update_v236365 on public.stand_assets_v236346;
create policy stand_assets_manager_return_update_v236365
on public.stand_assets_v236346
for update to authenticated
using (
  private.crm_stands_role_v236346()='manager'
  and status='installed'
  and current_manager_name=private.crm_stands_user_name_v236346()
  and exists (
    select 1 from public.stand_placements_v236346 p
    where p.asset_id=stand_assets_v236346.id
      and p.status='return_requested'
      and p.manager_name=private.crm_stands_user_name_v236346()
  )
)
with check (
  status in ('free','repair')
  and current_client_id is null
  and current_manager_name is null
  and current_address is null
);

drop policy if exists stand_requests_manager_install_update_v236365 on public.stand_requests_v236346;
create policy stand_requests_manager_install_update_v236365
on public.stand_requests_v236346
for update to authenticated
using (
  private.crm_stands_role_v236346()='manager'
  and manager_name=private.crm_stands_user_name_v236346()
  and status='approved'
)
with check (
  manager_name=private.crm_stands_user_name_v236346()
  and status='installed'
);

create index if not exists stand_assets_os_lot_v236365_idx on public.stand_assets_v236346(os_lot_id);
create index if not exists stand_placements_asset_type_v236365_idx on public.stand_placements_v236346(asset_type_id);
create index if not exists stand_placements_contract_v236365_idx on public.stand_placements_v236346(contract_id);
create index if not exists stand_placements_request_v236365_idx on public.stand_placements_v236346(request_id);
create index if not exists stand_requests_asset_type_v236365_idx on public.stand_requests_v236346(asset_type_id);

update public.stand_placements_v236346 p
set ai_score=null,
    ai_status='control',
    ai_public_summary=
      'Нужен первичный контроль: '
      ||case
          when btrim(coalesce(p.last_control_photo_path,p.installation_photo_path,''))='' and not exists(select 1 from public.stand_placement_items_v236346 i where i.placement_id=p.id)
            then 'нет актуального фото и списка SKU.'
          when btrim(coalesce(p.last_control_photo_path,p.installation_photo_path,''))=''
            then 'нет актуального фото стенда.'
          else 'не зафиксирован список фактических SKU на стенде.'
        end
      ||' Загрузите фото и SKU; до этого ИИ не делает вывод «оставить/забрать».',
    ai_checked_at=now(),
    updated_at=now()
where p.status in ('active','legacy_unreconciled','return_requested')
  and (
    btrim(coalesce(p.last_control_photo_path,p.installation_photo_path,''))=''
    or not exists(select 1 from public.stand_placement_items_v236346 i where i.placement_id=p.id)
  );
