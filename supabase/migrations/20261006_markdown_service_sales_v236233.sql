-- RESANTA CRM v23.6.233 · Уценка: МСЦ оформляет выбытия без писем
-- Existing sale-control data is preserved. New service explanation fields are additive.

alter table public.markdown_sale_events
  add column if not exists service_reason text,
  add column if not exists service_counterparty text,
  add column if not exists service_sale_qty numeric,
  add column if not exists service_sale_price numeric,
  add column if not exists service_sale_date date,
  add column if not exists service_document_no text,
  add column if not exists service_comment text,
  add column if not exists service_explained_by text,
  add column if not exists service_explained_by_email text,
  add column if not exists service_explained_at timestamptz,
  add column if not exists service_review_status text,
  add column if not exists service_review_comment text,
  add column if not exists service_reviewed_by text,
  add column if not exists service_reviewed_by_email text,
  add column if not exists service_reviewed_at timestamptz,
  add column if not exists service_confirmed_import_run_id uuid references public.markdown_import_runs(id) on delete set null,
  add column if not exists service_confirmed_at timestamptz;

do $$
begin
  if not exists(select 1 from pg_constraint where conrelid='public.markdown_sale_events'::regclass and conname='markdown_sale_events_service_reason_check') then
    alter table public.markdown_sale_events add constraint markdown_sale_events_service_reason_check
      check(service_reason is null or service_reason in ('sold_local','issued_client','transfer','return_writeoff','accounting_error','other'));
  end if;
  if not exists(select 1 from pg_constraint where conrelid='public.markdown_sale_events'::regclass and conname='markdown_sale_events_service_review_status_check') then
    alter table public.markdown_sale_events add constraint markdown_sale_events_service_review_status_check
      check(service_review_status is null or service_review_status in ('submitted','returned','verified'));
  end if;
end $$;

create index if not exists markdown_sale_events_service_review_idx_v236233
  on public.markdown_sale_events(status,service_review_status,service_explained_at desc)
  where event_type in ('unreported_reduction','unreported_exit');

CREATE OR REPLACE FUNCTION public.markdown_reconcile_group_units_v236165(p_group_key text, p_new_qty integer, p_import_run_id uuid, p_source_message_at timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
declare
  v_old_stock integer:=0;
  v_delta integer:=0;
  v_remaining integer:=0;
  v_claim record;
  v_manual record;
  v_unit record;
  v_old_status text;
  v_reason text;
  v_confirmed integer:=0;
  v_discrepancies integer:=0;
  v_unreported integer:=0;
  v_event_id uuid;
  v_event_type text;
begin
  if coalesce(trim(p_group_key),'')='' then
    raise exception 'Пустой ключ группы уценки';
  end if;
  if p_new_qty<0 then
    raise exception 'Количество 1С не может быть отрицательным';
  end if;

  select count(*)::integer
    into v_old_stock
  from public.markdown_items i
  where i.source_group_key=p_group_key
    and i.quantity=1
    and i.status in ('active','sale_pending');

  -- v23.6.233: explanations from the service center are confirmed only
  -- by a later full 1C report. This runs before detecting a new delta.
  perform public.markdown_service_reconcile_v236233(
    p_group_key,p_new_qty,p_import_run_id
  );

  v_delta:=greatest(v_old_stock-p_new_qty,0);
  v_remaining:=v_delta;

  -- Сначала подтверждаем именно те физические экземпляры, которые менеджеры выбрали в CRM.
  for v_claim in
    select e.*,i.instance_code,i.article,i.nomenclature
    from public.markdown_sale_events e
    join public.markdown_items i on i.id=e.item_id
    where i.source_group_key=p_group_key
      and i.status='sale_pending'
      and i.quantity=1
      and e.event_type='sale_claim'
      and e.status in ('pending','discrepancy')
      and (p_source_message_at is null or e.reported_at<p_source_message_at)
    order by e.reported_at,e.id
    for update of e,i
  loop
    v_old_status:=v_claim.status;
    if v_remaining>0 then
      update public.markdown_sale_events
      set status='confirmed',
          confirmed_qty=1,
          observed_qty_before=v_old_stock,
          observed_qty_after=p_new_qty,
          confirmed_at=now(),
          confirmation_source='1c',
          confirmed_import_run_id=p_import_run_id,
          last_checked_import_run_id=p_import_run_id,
          last_checked_at=now(),
          discrepancy_reason=null,
          updated_at=now()
      where id=v_claim.id;

      update public.markdown_items
      set quantity=0,
          status='sold',
          is_active=false,
          sold_at=coalesce(sold_at,now()),
          sold_by='Подтверждено 1С',
          sold_comment='Продажа конкретного экземпляра '||instance_code||' подтверждена уменьшением остатка 1С',
          last_import_run_id=p_import_run_id,
          updated_at=now()
      where id=v_claim.item_id;

      insert into public.markdown_sale_audit(
        event_id,action,old_status,new_status,actor,details
      ) values(
        v_claim.id,'confirmed_unit_by_1c',v_old_status,'confirmed','1С',
        jsonb_build_object(
          'group_key',p_group_key,'instance_code',v_claim.instance_code,
          'old_group_qty',v_old_stock,'new_group_qty',p_new_qty,
          'confirmed_qty',1,'import_run_id',p_import_run_id
        )
      );

      perform public.markdown_finalize_assignment_from_sales_v23691(v_claim.assignment_id);
      v_remaining:=v_remaining-1;
      v_confirmed:=v_confirmed+1;
    else
      v_reason:='Следующий отчёт 1С не подтвердил уменьшение остатка по выбранному экземпляру '||
                coalesce(v_claim.instance_code,'');
      update public.markdown_sale_events
      set status='discrepancy',
          observed_qty_before=v_old_stock,
          observed_qty_after=p_new_qty,
          last_checked_import_run_id=p_import_run_id,
          last_checked_at=now(),
          discrepancy_reason=v_reason,
          updated_at=now()
      where id=v_claim.id;

      if v_old_status<>'discrepancy' or coalesce(v_claim.discrepancy_reason,'')<>v_reason then
        insert into public.markdown_sale_audit(
          event_id,action,old_status,new_status,actor,details
        ) values(
          v_claim.id,'unit_discrepancy_by_1c',v_old_status,'discrepancy','1С',
          jsonb_build_object(
            'group_key',p_group_key,'instance_code',v_claim.instance_code,
            'old_group_qty',v_old_stock,'new_group_qty',p_new_qty,
            'reason',v_reason,'import_run_id',p_import_run_id
          )
        );
      end if;
      v_discrepancies:=v_discrepancies+1;
    end if;
  end loop;

  -- Ручное подтверждение руководителя резервирует конкретную карточку до факта 1С.
  -- Когда общий остаток всё-таки уменьшился, закрываем именно этот экземпляр.
  if v_remaining>0 then
    for v_manual in
      select i.id as item_id,i.instance_code,e.id as event_id
      from public.markdown_items i
      join public.markdown_sale_events e on e.item_id=i.id
      where i.source_group_key=p_group_key
        and i.status='sale_pending'
        and i.quantity=1
        and e.event_type='sale_claim'
        and e.status='confirmed'
        and e.confirmation_source='manual'
      order by e.confirmed_at nulls last,e.reported_at
      for update of i,e
    loop
      exit when v_remaining<=0;
      update public.markdown_items
      set quantity=0,status='sold',is_active=false,
          sold_at=coalesce(sold_at,now()),
          sold_by=coalesce(sold_by,'Подтверждено вручную'),
          sold_comment=coalesce(sold_comment,'Продажа подтверждена вручную')||
                       ' · выбытие затем подтверждено 1С',
          last_import_run_id=p_import_run_id,updated_at=now()
      where id=v_manual.item_id;

      insert into public.markdown_sale_audit(
        event_id,action,old_status,new_status,actor,details
      ) values(
        v_manual.event_id,'manual_unit_matched_by_1c','confirmed','confirmed','1С',
        jsonb_build_object(
          'group_key',p_group_key,'instance_code',v_manual.instance_code,
          'old_group_qty',v_old_stock,'new_group_qty',p_new_qty,
          'import_run_id',p_import_run_id
        )
      );
      v_remaining:=v_remaining-1;
    end loop;
  end if;

  -- Остаток уменьшился без заявки: закрываем один конкретный незаявленный экземпляр
  -- и поднимаем сигнал руководителю. Сначала берём наименее подготовленные карточки,
  -- чтобы не потерять карточку с фото/назначением без явной продажи.
  while v_remaining>0 loop
    select
      i.id,i.instance_code,i.final_price,
      coalesce((select count(*) from public.markdown_photos p where p.item_id=i.id),0) as photos,
      exists(select 1 from public.markdown_assignments a
             where a.item_id=i.id and a.status in ('assigned','in_work')) as has_assignment
    into v_unit
    from public.markdown_items i
    where i.source_group_key=p_group_key
      and i.status='active'
      and i.is_active
      and i.quantity=1
      and not exists(
        select 1 from public.markdown_sale_events e
        where e.item_id=i.id and e.event_type='sale_claim'
          and e.status in ('pending','discrepancy')
      )
    order by
      exists(select 1 from public.markdown_assignments a
             where a.item_id=i.id and a.status in ('assigned','in_work')) asc,
      case i.review_status when 'collecting' then 0 when 'ready_for_pricing' then 1 else 2 end,
      (select count(*) from public.markdown_photos p where p.item_id=i.id) asc,
      i.instance_no desc
    limit 1
    for update of i;

    if not found then
      exit;
    end if;

    v_event_type:=case when p_new_qty=0 then 'unreported_exit' else 'unreported_reduction' end;

    insert into public.markdown_sale_events(
      item_id,event_type,status,reported_qty,confirmed_qty,
      approved_unit_price,stock_qty_at_report,observed_qty_before,observed_qty_after,
      sale_channel,comment,reported_by,reported_by_email,reported_at,
      confirmed_import_run_id,last_checked_import_run_id,last_checked_at,
      discrepancy_reason
    ) values(
      v_unit.id,v_event_type,'open',1,0,
      v_unit.final_price,v_old_stock,v_old_stock,p_new_qty,
      'system_1c',
      'Конкретный экземпляр исчез из остатка 1С без заявки продажи',
      '1С',null,now(),
      p_import_run_id,p_import_run_id,now(),
      'Экземпляр '||v_unit.instance_code||' выбыл из 1С без заявки менеджера'
    )
    on conflict do nothing
    returning id into v_event_id;

    update public.markdown_items
    set quantity=0,is_active=false,status='archived',
        last_import_run_id=p_import_run_id,
        updated_at=now()
    where id=v_unit.id;

    if v_event_id is not null then
      insert into public.markdown_sale_audit(
        event_id,action,new_status,actor,details
      ) values(
        v_event_id,'unreported_unit_change_detected','open','1С',
        jsonb_build_object(
          'group_key',p_group_key,'instance_code',v_unit.instance_code,
          'old_group_qty',v_old_stock,'new_group_qty',p_new_qty,
          'import_run_id',p_import_run_id
        )
      );
    end if;

    v_unreported:=v_unreported+1;
    v_remaining:=v_remaining-1;
  end loop;

  return jsonb_build_object(
    'old_group_qty',v_old_stock,
    'new_group_qty',p_new_qty,
    'delta',v_delta,
    'confirmed_claim_qty',v_confirmed,
    'discrepancies',v_discrepancies,
    'unreported_qty',v_unreported,
    'unmatched_delta',v_remaining
  );
end
$function$


CREATE OR REPLACE FUNCTION public.markdown_sales_control_v1(p_filter text DEFAULT 'alerts'::text, p_limit integer DEFAULT 100, p_offset integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_catalog'
AS $function$
declare
  v_email text:=lower(coalesce(auth.jwt()->>'email',''));
  v_is_payushin boolean:=v_email='payushin_ar@resanta.ru';
  v_is_service boolean:=v_email='service_vitebsk@resanta.ru';
  v_limit integer:=least(greatest(coalesce(p_limit,100),1),200);
  v_offset integer:=greatest(coalesce(p_offset,0),0);
  v_filter text:=lower(trim(coalesce(p_filter,'alerts')));
  v_rows jsonb;
  v_stats jsonb;
begin
  if not (v_is_payushin or v_is_service) then
    raise exception 'Нет доступа к контролю продаж уценки' using errcode='42501';
  end if;

  with base as (
    select
      e.id,e.event_type,e.status,e.reported_qty,e.confirmed_qty,
      e.approved_unit_price,e.reported_revenue,e.stock_qty_at_report,
      e.observed_qty_before,e.observed_qty_after,
      e.client_id,e.client_name,e.sale_channel,e.comment,
      e.reported_by,e.reported_by_email,e.reported_at,
      e.confirmed_at,e.confirmation_source,e.discrepancy_reason,
      e.resolved_by,e.resolved_at,e.resolution_comment,
      e.service_reason,e.service_counterparty,e.service_sale_qty,e.service_sale_price,
      e.service_sale_date,e.service_document_no,e.service_comment,
      e.service_explained_by,e.service_explained_by_email,e.service_explained_at,
      e.service_review_status,e.service_review_comment,e.service_reviewed_by,
      e.service_reviewed_at,e.service_confirmed_at,
      i.article,i.nomenclature,i.instance_code,
      coalesce((
        select count(*)::numeric
        from public.markdown_items gi
        where gi.source_group_key=i.source_group_key
          and gi.quantity=1
          and gi.status in ('active','sale_pending')
      ),0) as current_1c_qty,
      i.final_price as current_price,i.review_status,
      a.manager_name,a.target_qty,a.due_date,
      r.report_date as confirmation_report_date,
      r.subject as confirmation_subject
    from public.markdown_sale_events e
    join public.markdown_items i on i.id=e.item_id
    left join public.markdown_assignments a on a.id=e.assignment_id
    left join public.markdown_import_runs r on r.id=coalesce(e.service_confirmed_import_run_id,e.confirmed_import_run_id)
    where
      (v_is_payushin or e.event_type in ('unreported_reduction','unreported_exit'))
      and (
        v_filter='all'
        or (v_filter='alerts' and (
              (e.event_type='sale_claim' and e.status='discrepancy')
              or (e.event_type<>'sale_claim' and e.status='open'
                  and coalesce(e.service_review_status,'')<>'submitted')
            ))
        or (v_filter='service_needed' and e.event_type<>'sale_claim' and e.status='open'
            and coalesce(e.service_review_status,'')<>'submitted')
        or (v_filter='service_waiting' and e.event_type<>'sale_claim' and e.status='open'
            and e.service_review_status='submitted')
        or (v_filter='service_closed' and e.event_type<>'sale_claim' and e.status='resolved'
            and e.service_explained_at is not null)
        or (v_filter='pending' and e.event_type='sale_claim' and e.status='pending')
        or (v_filter='discrepancy' and e.event_type='sale_claim' and e.status='discrepancy')
        or (v_filter='confirmed' and e.event_type='sale_claim' and e.status='confirmed')
        or (v_filter='unreported' and e.event_type<>'sale_claim' and e.status='open')
        or (v_filter='resolved' and e.status in ('resolved','cancelled'))
      )
  )
  select coalesce(jsonb_agg(to_jsonb(x) order by
    case
      when x.status='discrepancy' then 0
      when x.status='open' and coalesce(x.service_review_status,'')<>'submitted' then 1
      when x.status='open' and x.service_review_status='submitted' then 2
      when x.status='pending' then 3
      else 4
    end,
    x.reported_at desc
  ),'[]'::jsonb)
  into v_rows
  from (
    select * from base
    limit v_limit offset v_offset
  ) x;

  select jsonb_build_object(
    'pending',count(*) filter(where event_type='sale_claim' and status='pending'),
    'discrepancy',count(*) filter(where event_type='sale_claim' and status='discrepancy'),
    'confirmed',count(*) filter(where event_type='sale_claim' and status='confirmed'),
    'unreported',count(*) filter(where event_type<>'sale_claim' and status='open'),
    'service_needed',count(*) filter(where event_type<>'sale_claim' and status='open'
      and coalesce(service_review_status,'')<>'submitted'),
    'service_waiting',count(*) filter(where event_type<>'sale_claim' and status='open'
      and service_review_status='submitted'),
    'service_closed',count(*) filter(where event_type<>'sale_claim' and status='resolved'
      and service_explained_at is not null),
    'alerts',count(*) filter(where
      (event_type='sale_claim' and status='discrepancy')
      or (event_type<>'sale_claim' and status='open' and coalesce(service_review_status,'')<>'submitted')
    )
  )
  into v_stats
  from public.markdown_sale_events
  where v_is_payushin or event_type in ('unreported_reduction','unreported_exit');

  return jsonb_build_object(
    'ok',true,'allowed',true,'is_payushin',v_is_payushin,'is_service_manager',v_is_service,
    'rows',v_rows,'stats',v_stats
  );
end
$function$


CREATE OR REPLACE FUNCTION public.markdown_sales_summary_v1()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_catalog'
AS $function$
declare
  v_email text:=lower(coalesce(auth.jwt()->>'email',''));
  v_is_payushin boolean:=v_email='payushin_ar@resanta.ru';
  v_is_service boolean:=v_email='service_vitebsk@resanta.ru';
begin
  if not (v_is_payushin or v_is_service) then
    return jsonb_build_object('allowed',false);
  end if;

  return (
    select jsonb_build_object(
      'allowed',true,'is_payushin',v_is_payushin,'is_service_manager',v_is_service,
      'pending',count(*) filter(where event_type='sale_claim' and status='pending'),
      'discrepancy',count(*) filter(where event_type='sale_claim' and status='discrepancy'),
      'confirmed',count(*) filter(where event_type='sale_claim' and status='confirmed'),
      'unreported',count(*) filter(where event_type<>'sale_claim' and status='open'),
      'service_needed',count(*) filter(where event_type<>'sale_claim' and status='open'
        and coalesce(service_review_status,'')<>'submitted'),
      'service_waiting',count(*) filter(where event_type<>'sale_claim' and status='open'
        and service_review_status='submitted'),
      'service_closed',count(*) filter(where event_type<>'sale_claim' and status='resolved'
        and service_explained_at is not null),
      'alerts',count(*) filter(where
        (event_type='sale_claim' and status='discrepancy')
        or (event_type<>'sale_claim' and status='open' and coalesce(service_review_status,'')<>'submitted')
      )
    )
    from public.markdown_sale_events
    where v_is_payushin or event_type in ('unreported_reduction','unreported_exit')
  );
end
$function$


CREATE OR REPLACE FUNCTION public.markdown_service_explain_sale_v236233(p_event_id uuid, p_reason text, p_counterparty text DEFAULT NULL::text, p_qty numeric DEFAULT NULL::numeric, p_unit_price numeric DEFAULT NULL::numeric, p_sale_date date DEFAULT NULL::date, p_document_no text DEFAULT NULL::text, p_comment text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_catalog'
AS $function$
declare
  v_email text:=lower(coalesce(auth.jwt()->>'email',''));
  v_event public.markdown_sale_events%rowtype;
  v_item public.markdown_items%rowtype;
  v_reason text:=lower(trim(coalesce(p_reason,'')));
  v_qty numeric;
  v_price numeric;
  v_actor text;
  v_old jsonb;
begin
  if v_email not in ('service_vitebsk@resanta.ru','payushin_ar@resanta.ru') then
    raise exception 'Пояснение доступно МСЦ Витебск и руководителю' using errcode='42501';
  end if;

  if v_reason not in ('sold_local','issued_client','transfer','return_writeoff','accounting_error','other') then
    raise exception 'Выберите причину выбытия';
  end if;
  if coalesce(trim(p_comment),'')='' then
    raise exception 'Комментарий обязателен';
  end if;

  select * into v_event
  from public.markdown_sale_events
  where id=p_event_id
  for update;
  if not found then raise exception 'Событие контроля не найдено'; end if;

  if v_event.event_type not in ('unreported_reduction','unreported_exit') or v_event.status<>'open' then
    raise exception 'Пояснение можно дать только по открытому выбытию без заявки';
  end if;
  if v_event.service_review_status='submitted' then
    raise exception 'Пояснение уже отправлено и ждёт проверки 1С';
  end if;
  if v_event.service_review_status='verified' then
    raise exception 'Событие уже подтверждено и закрыто';
  end if;

  select * into v_item from public.markdown_items where id=v_event.item_id;
  if not found then raise exception 'Карточка уценки не найдена'; end if;

  v_qty:=coalesce(p_qty,v_event.reported_qty,1);
  v_price:=coalesce(p_unit_price,v_event.approved_unit_price,v_item.final_price);

  if v_reason='sold_local' then
    if coalesce(trim(p_counterparty),'')='' then
      raise exception 'Для продажи укажите кому / где продано';
    end if;
    if v_qty<=0 or v_qty>v_event.reported_qty then
      raise exception 'Количество продажи должно быть больше 0 и не больше количества выбытия';
    end if;
    if v_price is null or v_price<=0 then
      raise exception 'Укажите фактическую цену продажи';
    end if;
    if p_sale_date is null then
      raise exception 'Укажите дату продажи';
    end if;
  end if;

  v_actor:=case when v_email='service_vitebsk@resanta.ru' then 'Сервис Витебск' else 'Александр Паюшин' end;
  v_old:=jsonb_build_object(
    'service_reason',v_event.service_reason,
    'service_counterparty',v_event.service_counterparty,
    'service_sale_qty',v_event.service_sale_qty,
    'service_sale_price',v_event.service_sale_price,
    'service_sale_date',v_event.service_sale_date,
    'service_document_no',v_event.service_document_no,
    'service_comment',v_event.service_comment,
    'service_review_status',v_event.service_review_status,
    'service_explained_at',v_event.service_explained_at
  );

  update public.markdown_sale_events
  set service_reason=v_reason,
      service_counterparty=nullif(trim(p_counterparty),''),
      service_sale_qty=case when v_reason='sold_local' then v_qty else null end,
      service_sale_price=case when v_reason='sold_local' then v_price else null end,
      service_sale_date=case when v_reason='sold_local' then p_sale_date else null end,
      service_document_no=nullif(trim(p_document_no),''),
      service_comment=trim(p_comment),
      service_explained_by=v_actor,
      service_explained_by_email=v_email,
      service_explained_at=now(),
      service_review_status='submitted',
      service_review_comment=null,
      service_reviewed_by=null,
      service_reviewed_by_email=null,
      service_reviewed_at=null,
      reported_revenue=case when v_reason='sold_local' then round(v_qty*v_price,2) else reported_revenue end,
      client_name=case when v_reason='sold_local' then nullif(trim(p_counterparty),'') else client_name end,
      sale_channel=case when v_reason='sold_local' then 'retail_other' else sale_channel end,
      updated_at=now()
  where id=p_event_id;

  insert into public.markdown_sale_audit(
    event_id,action,old_status,new_status,actor,actor_email,details
  )
  values(
    p_event_id,
    case when v_event.service_review_status='returned' then 'service_explanation_resubmitted' else 'service_explanation_submitted' end,
    v_event.status,v_event.status,v_actor,v_email,
    jsonb_build_object(
      'old_explanation',v_old,
      'reason',v_reason,
      'counterparty',nullif(trim(p_counterparty),''),
      'qty',case when v_reason='sold_local' then v_qty else null end,
      'unit_price',case when v_reason='sold_local' then v_price else null end,
      'sale_date',case when v_reason='sold_local' then p_sale_date else null end,
      'document_no',nullif(trim(p_document_no),''),
      'comment',trim(p_comment),
      'item_id',v_event.item_id,
      'instance_code',v_item.instance_code
    )
  );

  return jsonb_build_object(
    'ok',true,'event_id',p_event_id,'status','open',
    'service_review_status','submitted',
    'message','Пояснение МСЦ сохранено. Ждём следующий полный отчёт 1С.'
  );
end
$function$


CREATE OR REPLACE FUNCTION public.markdown_service_reconcile_v236233(p_group_key text, p_new_qty integer, p_import_run_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
declare
  v_report_ts timestamptz;
  v_event record;
  v_count integer:=0;
begin
  select coalesce(source_message_at,created_at,now())
    into v_report_ts
  from public.markdown_import_runs
  where id=p_import_run_id;

  if v_report_ts is null then v_report_ts:=now(); end if;

  for v_event in
    select e.*,i.instance_code,i.source_group_key
    from public.markdown_sale_events e
    join public.markdown_items i on i.id=e.item_id
    where i.source_group_key=p_group_key
      and e.event_type in ('unreported_reduction','unreported_exit')
      and e.status='open'
      and e.service_review_status='submitted'
      and e.service_explained_at is not null
      and e.service_explained_at < v_report_ts
      and e.last_checked_import_run_id is distinct from p_import_run_id
    order by e.service_explained_at,e.id
    for update of e,i
  loop
    if p_new_qty<=coalesce(v_event.observed_qty_after,p_new_qty) then
      update public.markdown_sale_events
      set status='resolved',
          confirmed_qty=coalesce(service_sale_qty,reported_qty),
          confirmed_at=now(),
          confirmation_source='1c',
          confirmed_import_run_id=p_import_run_id,
          last_checked_import_run_id=p_import_run_id,
          last_checked_at=now(),
          service_review_status='verified',
          service_review_comment='Следующий полный отчёт 1С подтвердил уменьшенный остаток',
          service_reviewed_by='1С',
          service_reviewed_at=now(),
          service_confirmed_import_run_id=p_import_run_id,
          service_confirmed_at=now(),
          resolved_by='1С после пояснения МСЦ',
          resolved_at=now(),
          resolution_comment='Пояснение МСЦ подтверждено следующим полным отчётом 1С',
          discrepancy_reason=null,
          updated_at=now()
      where id=v_event.id;

      if v_event.service_reason='sold_local' then
        update public.markdown_items
        set status='sold',is_active=false,quantity=0,
            sold_at=coalesce(v_event.service_sale_date::timestamptz,now()),
            sold_by=coalesce(v_event.service_explained_by,'Сервис Витебск'),
            sold_comment=left(
              'Продажа оформлена МСЦ: '||coalesce(v_event.service_counterparty,'—')||
              case when coalesce(v_event.service_comment,'')<>'' then ' · '||v_event.service_comment else '' end,
              1000
            ),
            updated_at=now()
        where id=v_event.item_id;
      end if;

      insert into public.markdown_sale_audit(event_id,action,old_status,new_status,actor,details)
      values(
        v_event.id,'service_explanation_confirmed_by_1c','open','resolved','1С',
        jsonb_build_object(
          'group_key',p_group_key,
          'instance_code',v_event.instance_code,
          'new_group_qty',p_new_qty,
          'previous_observed_qty',v_event.observed_qty_after,
          'import_run_id',p_import_run_id,
          'service_reason',v_event.service_reason,
          'service_comment',v_event.service_comment
        )
      );
      v_count:=v_count+1;
    else
      update public.markdown_sale_events
      set last_checked_import_run_id=p_import_run_id,
          last_checked_at=now(),
          discrepancy_reason='Пояснение МСЦ получено, но следующий отчёт 1С показал увеличение/возврат остатка. Требуется проверка.',
          updated_at=now()
      where id=v_event.id;

      insert into public.markdown_sale_audit(event_id,action,old_status,new_status,actor,details)
      values(
        v_event.id,'service_explanation_not_confirmed_by_1c','open','open','1С',
        jsonb_build_object(
          'group_key',p_group_key,
          'instance_code',v_event.instance_code,
          'new_group_qty',p_new_qty,
          'previous_observed_qty',v_event.observed_qty_after,
          'import_run_id',p_import_run_id
        )
      );
    end if;
  end loop;

  return jsonb_build_object('confirmed',v_count);
end
$function$


CREATE OR REPLACE FUNCTION public.markdown_service_review_v236233(p_event_id uuid, p_action text, p_comment text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_catalog'
AS $function$
declare
  v_email text:=lower(coalesce(auth.jwt()->>'email',''));
  v_action text:=lower(trim(coalesce(p_action,'')));
  v_event public.markdown_sale_events%rowtype;
  v_item public.markdown_items%rowtype;
begin
  if v_email<>'payushin_ar@resanta.ru' then
    raise exception 'Решение доступно только Александру Паюшину' using errcode='42501';
  end if;
  if coalesce(trim(p_comment),'')='' then raise exception 'Комментарий обязателен'; end if;

  select * into v_event from public.markdown_sale_events where id=p_event_id for update;
  if not found then raise exception 'Событие не найдено'; end if;
  select * into v_item from public.markdown_items where id=v_event.item_id;

  if v_event.event_type not in ('unreported_reduction','unreported_exit')
     or v_event.status<>'open'
     or v_event.service_review_status<>'submitted' then
    raise exception 'Нет пояснения МСЦ, ожидающего решения';
  end if;

  if v_action='return' then
    update public.markdown_sale_events
    set service_review_status='returned',
        service_review_comment=trim(p_comment),
        service_reviewed_by='Александр Паюшин',
        service_reviewed_by_email=v_email,
        service_reviewed_at=now(),
        updated_at=now()
    where id=p_event_id;

    insert into public.markdown_sale_audit(event_id,action,old_status,new_status,actor,actor_email,details)
    values(
      p_event_id,'service_explanation_returned','open','open','Александр Паюшин',v_email,
      jsonb_build_object(
        'comment',trim(p_comment),
        'service_reason',v_event.service_reason,
        'service_comment',v_event.service_comment,
        'instance_code',v_item.instance_code
      )
    );

    return jsonb_build_object('ok',true,'event_id',p_event_id,'service_review_status','returned');
  elsif v_action='close' then
    update public.markdown_sale_events
    set status='resolved',
        service_review_status='verified',
        service_review_comment=trim(p_comment),
        service_reviewed_by='Александр Паюшин',
        service_reviewed_by_email=v_email,
        service_reviewed_at=now(),
        resolved_by='Александр Паюшин',
        resolved_at=now(),
        resolution_comment=trim(p_comment),
        updated_at=now()
    where id=p_event_id;

    if v_event.service_reason='sold_local' then
      update public.markdown_items
      set status='sold',is_active=false,quantity=0,
          sold_at=coalesce(v_event.service_sale_date::timestamptz,now()),
          sold_by=coalesce(v_event.service_explained_by,'Сервис Витебск'),
          sold_comment=left(
            'Продажа оформлена МСЦ: '||coalesce(v_event.service_counterparty,'—')||
            case when coalesce(v_event.service_comment,'')<>'' then ' · '||v_event.service_comment else '' end,
            1000
          ),
          updated_at=now()
      where id=v_event.item_id;
    end if;

    insert into public.markdown_sale_audit(event_id,action,old_status,new_status,actor,actor_email,details)
    values(
      p_event_id,'service_explanation_closed_manual','open','resolved','Александр Паюшин',v_email,
      jsonb_build_object(
        'comment',trim(p_comment),
        'service_reason',v_event.service_reason,
        'service_comment',v_event.service_comment,
        'instance_code',v_item.instance_code
      )
    );

    return jsonb_build_object('ok',true,'event_id',p_event_id,'status','resolved','service_review_status','verified');
  else
    raise exception 'Неизвестное действие';
  end if;
end
$function$



grant execute on function public.markdown_service_explain_sale_v236233(uuid,text,text,numeric,numeric,date,text,text) to authenticated;
grant execute on function public.markdown_service_review_v236233(uuid,text,text) to authenticated;
