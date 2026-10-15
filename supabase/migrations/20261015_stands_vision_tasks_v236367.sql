-- RESANTA CRM v23.6.367 · stand Vision follow-up tasks bound to manager routes
-- Vision never decides return by itself. It creates/updates a manager correction task.
-- Due date is the next approved/published route to the exact client and follows route rescheduling.

CREATE OR REPLACE FUNCTION private.crm_stands_next_route_v236367(p_client_id uuid, p_manager_name text, p_from date DEFAULT CURRENT_DATE, p_strict_after boolean DEFAULT false)
 RETURNS TABLE(route_id uuid, route_date date)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'private', 'auth', 'pg_catalog'
AS $function$
  select r.id,r.visit_date
  from public.route_plans r
  where r.manager_name=p_manager_name
    and coalesce(r.removed,false)=false
    and (coalesce(r.approved,false)=true or r.review_status='approved' or r.published_at is not null)
    and (
      r.client_id=p_client_id
      or p_client_id=any(coalesce(r.linked_client_ids,array[]::uuid[]))
    )
    and (
      (not p_strict_after and r.visit_date>=coalesce(p_from,current_date))
      or (p_strict_after and r.visit_date>coalesce(p_from,current_date))
    )
  order by r.visit_date,r.sort_order nulls last,r.created_at
  limit 1
$function$
;

CREATE OR REPLACE FUNCTION public.crm_stands_vision_task_apply_v236367(p_placement_id uuid, p_vision_check_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'private', 'auth', 'pg_catalog'
AS $function$
declare
  p public.stand_placements_v236346%rowtype;
  v public.stand_vision_checks_v236347%rowtype;
  t public.stand_asset_types_v236346%rowtype;
  task_row public.tasks%rowtype;
  v_manager_id uuid;
  v_route_id uuid;
  v_route_date date;
  v_route_from date:=current_date;
  v_strict boolean:=false;
  v_needs_action boolean:=false;
  v_priority text:='средний';
  v_title text;
  v_text text;
  v_expected text;
  v_criteria text;
  v_next_step text;
  v_issues text:='';
  v_before jsonb;
  v_after jsonb;
  v_ctx jsonb;
begin
  select * into p from public.stand_placements_v236346 where id=p_placement_id;
  if p.id is null then raise exception 'Стенд не найден'; end if;
  select * into v from public.stand_vision_checks_v236347 where id=p_vision_check_id and placement_id=p.id;
  if v.id is null or v.status<>'completed' then raise exception 'Завершённый Vision-анализ не найден'; end if;
  select * into t from public.stand_asset_types_v236346 where id=p.asset_type_id;

  v_needs_action :=
    coalesce(v.stand_present,false)=false
    or coalesce(v.photo_quality_score,0)<45
    or coalesce(v.fill_pct,0)<60
    or coalesce(v.own_brand_share_pct,0)<65
    or coalesce(v.foreign_brand_share_pct,100)>25
    or (v.match_pct is not null and v.match_pct<50);

  select string_agg(x,'; ' order by ord)
  into v_issues
  from (
    select value x,ord
    from jsonb_array_elements_text(coalesce(v.issues,'[]'::jsonb)) with ordinality z(value,ord)
    order by ord
    limit 5
  ) q;
  v_issues:=coalesce(v_issues,'');

  v_before:=jsonb_build_object(
    'vision_id',v.id,
    'checked_at',v.created_at,
    'fill_pct',v.fill_pct,
    'own_brand_pct',v.own_brand_share_pct,
    'foreign_brand_pct',v.foreign_brand_share_pct,
    'match_pct',v.match_pct,
    'quality_score',v.photo_quality_score,
    'summary',v.summary
  );

  select * into task_row
  from public.tasks x
  where x.source='stand_vision'
    and coalesce(x.done,false)=false
    and x.ai_selection_context->>'placement_id'=p.id::text
  order by x.created_at desc
  limit 1;

  if task_row.id is not null and task_row.due_date is not null and task_row.due_date<=current_date then
    v_route_from:=current_date;
    v_strict:=true;
  end if;

  select nr.route_id,nr.route_date into v_route_id,v_route_date
  from private.crm_stands_next_route_v236367(p.client_id,p.manager_name,v_route_from,v_strict) nr;

  if not v_needs_action then
    if task_row.id is null then
      return jsonb_build_object(
        'ok',true,'status','no_task_needed','placement_id',p.id,'vision_id',v.id,
        'message','Vision не выявил замечаний, требующих задачи менеджеру.'
      );
    end if;

    v_after:=v_before;
    v_ctx:=coalesce(task_row.ai_selection_context,'{}'::jsonb)
      || jsonb_build_object(
        'latest_vision_id',v.id,
        'after',v_after,
        'closed_by_vision',true,
        'closed_at',now()
      );

    update public.tasks
    set done=true,
        done_at=now(),
        done_comment='Повторный Vision подтвердил исправление выкладки.',
        fact_result='Повторный контроль выполнен. '||coalesce(v.summary,'Vision без замечаний.'),
        result_achieved='да',
        proof=v.storage_path,
        ai_check='passed',
        ai_check_note='Vision после исправления: заполнение '||coalesce(v.fill_pct,0)||'%, целевой бренд '||coalesce(v.own_brand_share_pct,0)||'%, сверка SKU '||coalesce(v.match_pct,0)||'%.',
        ai_checked_at=now(),
        ai_selection_context=v_ctx
    where id=task_row.id
    returning * into task_row;

    return jsonb_build_object(
      'ok',true,'status','closed','task_id',task_row.id,'due_date',task_row.due_date,
      'placement_id',p.id,'vision_id',v.id,'before',task_row.ai_selection_context->'before','after',v_after
    );
  end if;

  if coalesce(v.photo_quality_score,0)<45 then
    v_title:='Стенд: повторить фото-контроль';
    v_expected:='Загрузить качественное фото всего стенда и актуализировать фактические SKU.';
    v_criteria:='Повторный Vision: качество фото не ниже 45/100; стенд полностью попадает в кадр; SKU можно сверить.';
  else
    v_title:='Стенд: исправить выкладку';
    v_expected:='Привести стенд '||coalesce(t.name,'')||' у клиента '||p.client_name||' в соответствие, актуализировать SKU и загрузить новое фото.';
    v_criteria:='Повторный Vision: стенд присутствует; заполнение не ниже 60%; целевой бренд не ниже 65%; чужие бренды не выше 25%; сверка SKU не ниже 50%.';
  end if;

  if coalesce(v.stand_present,false)=false or coalesce(v.own_brand_share_pct,0)<40 or coalesce(v.foreign_brand_share_pct,100)>50 then
    v_priority:='высокий';
  end if;

  v_text:=
    '🎯 Стенд · '||p.client_name||'. '
    ||coalesce(v.summary,'Vision выявил замечания по выкладке.')
    ||case when v_issues<>'' then ' Замечания: '||v_issues||'.' else '' end
    ||' На следующем маршруте исправить выкладку, сверить фактические SKU и выполнить повторный фото-контроль.';

  v_next_step:=case
    when v_route_date is not null then
      'На маршруте '||to_char(v_route_date,'DD.MM.YYYY')||' исправить замечания и загрузить новое фото через «Контроль / фото / SKU».'
    else
      'Маршрут к клиенту пока не назначен. После появления следующего маршрута срок задачи будет установлен автоматически.'
  end;

  if task_row.id is null then
    select u.id into v_manager_id
    from public.users u
    where lower(btrim(u.name))=lower(btrim(p.manager_name))
    order by (u.role='manager') desc,u.created_at
    limit 1;

    v_ctx:=jsonb_build_object(
      'selection_rule','stand_vision_followup_v236367',
      'placement_id',p.id,
      'asset_type_id',p.asset_type_id,
      'target_brand',t.brand,
      'before_vision_id',v.id,
      'before',v_before,
      'latest_vision_id',v.id,
      'latest',v_before,
      'route_id',v_route_id,
      'route_date',v_route_date,
      'route_missing',v_route_date is null
    );

    insert into public.tasks(
      client_id,manager_id,manager_name,title,text,due_date,done,auto_generated,review_status,
      basis,expected_result,criteria,priority,next_step,source,ai_reason,next_contact_date,ai_selection_context
    ) values(
      p.client_id,v_manager_id,p.manager_name,v_title,v_text,v_route_date,false,true,'approved',
      coalesce(v.summary,'Vision выявил замечания по стенду.'),v_expected,v_criteria,v_priority,v_next_step,
      'stand_vision','Vision по фото стенда выявил отклонения; решение о возврате стенда по одному фото не принимается.',
      v_route_date,v_ctx
    ) returning * into task_row;

    return jsonb_build_object(
      'ok',true,'status','created','task_id',task_row.id,'due_date',task_row.due_date,
      'route_id',v_route_id,'route_date',v_route_date,'route_missing',v_route_date is null,
      'placement_id',p.id,'vision_id',v.id,'priority',v_priority
    );
  end if;

  v_ctx:=coalesce(task_row.ai_selection_context,'{}'::jsonb)
    || jsonb_build_object(
      'latest_vision_id',v.id,
      'latest',v_before,
      'route_id',v_route_id,
      'route_date',v_route_date,
      'route_missing',v_route_date is null,
      'last_recheck_at',now()
    );

  update public.tasks
  set title=v_title,
      text=v_text,
      due_date=v_route_date,
      next_contact_date=v_route_date,
      basis=coalesce(v.summary,'Vision выявил замечания по стенду.'),
      expected_result=v_expected,
      criteria=v_criteria,
      priority=v_priority,
      next_step=v_next_step,
      ai_reason='Повторный Vision всё ещё показывает отклонения. Решение о возврате принимается отдельно по фото + продажам + динамике.',
      ai_selection_context=v_ctx
  where id=task_row.id
  returning * into task_row;

  return jsonb_build_object(
    'ok',true,'status','updated','task_id',task_row.id,'due_date',task_row.due_date,
    'route_id',v_route_id,'route_date',v_route_date,'route_missing',v_route_date is null,
    'placement_id',p.id,'vision_id',v.id,'priority',v_priority
  );
end
$function$
;

revoke all on function public.crm_stands_vision_task_apply_v236367(uuid,uuid) from public,anon,authenticated;
grant execute on function public.crm_stands_vision_task_apply_v236367(uuid,uuid) to service_role;

CREATE OR REPLACE FUNCTION public.crm_stands_route_task_sync_v236367()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'private', 'auth', 'pg_catalog'
AS $function$
declare
  v_managers text[]:=array[]::text[];
  rec record;
  rr record;
  v_next_step text;
begin
  if tg_op<>'DELETE' and btrim(coalesce(new.manager_name,''))<>'' then
    v_managers:=array_append(v_managers,new.manager_name);
  end if;
  if tg_op<>'INSERT' and btrim(coalesce(old.manager_name,''))<>'' and not old.manager_name=any(v_managers) then
    v_managers:=array_append(v_managers,old.manager_name);
  end if;

  for rec in
    select id,client_id,manager_name,ai_selection_context
    from public.tasks
    where source='stand_vision'
      and coalesce(done,false)=false
      and manager_name=any(v_managers)
      and client_id is not null
  loop
    select * into rr
    from private.crm_stands_next_route_v236367(rec.client_id,rec.manager_name,current_date,false);

    v_next_step:=case
      when rr.route_date is not null then
        'На маршруте '||to_char(rr.route_date,'DD.MM.YYYY')||' исправить замечания и загрузить новое фото через «Контроль / фото / SKU».'
      else
        'Маршрут к клиенту пока не назначен. После появления следующего маршрута срок задачи будет установлен автоматически.'
    end;

    update public.tasks
    set due_date=rr.route_date,
        next_contact_date=rr.route_date,
        next_step=v_next_step,
        ai_selection_context=coalesce(ai_selection_context,'{}'::jsonb)
          || jsonb_build_object(
            'route_id',rr.route_id,
            'route_date',rr.route_date,
            'route_missing',rr.route_date is null,
            'route_synced_at',now()
          )
    where id=rec.id;
  end loop;

  return case when tg_op='DELETE' then old else new end;
end
$function$
;

drop trigger if exists trg_stands_route_task_sync_v236367 on public.route_plans;
create trigger trg_stands_route_task_sync_v236367
after insert or delete or update of visit_date,manager_name,client_id,linked_client_ids,removed,approved,review_status,published_at
on public.route_plans
for each row execute function public.crm_stands_route_task_sync_v236367();

create index if not exists tasks_stand_vision_placement_v236367_idx
on public.tasks ((ai_selection_context->>'placement_id'),done,due_date)
where source='stand_vision';

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
    'vision_tasks',coalesce((
      select jsonb_agg(to_jsonb(x) order by x.done,x.due_date nulls last,x.created_at desc)
      from (
        select id,client_id,manager_id,manager_name,title,text,due_date,done,done_at,done_comment,
               priority,review_status,next_step,fact_result,result_achieved,proof,ai_check,ai_check_note,
               ai_selection_context,created_at
        from public.tasks
        where source='stand_vision'
          and coalesce((ai_selection_context->>'placement_id'),'') in (
            select id::text
            from public.stand_placements_v236346
            where status in ('active','legacy_unreconciled','return_requested','returned','archived_manual')
          )
        order by done,due_date nulls last,created_at desc
        limit v_limit*2
      ) x
    ),'[]'::jsonb),
    'recommendations',case when v_role in ('df','dfs') then
      coalesce((select jsonb_agg(to_jsonb(x) order by x.score desc nulls last,x.generated_at desc) from (select * from public.stand_recommendations_v236346 order by score desc nulls last,generated_at desc limit v_limit) x),'[]'::jsonb)
      else '[]'::jsonb end
  ) into v_result;

  return v_result;
end;
$function$
;
