-- Only Payushin may approve/edit any Triovist AI task; other task actions remain unchanged.
CREATE OR REPLACE FUNCTION public.triovist_tasks_action(p_task_id uuid, p_action text, p_payload jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  a record;
  t public.triovist_ai_tasks%rowtype;
  v_action text:=lower(trim(coalesce(p_action,'')));
  v_old text;
  v_new text;
  v_comment text:=nullif(left(trim(coalesce(p_payload->>'comment','')),3000),'');
  v_is_leader boolean:=false;
  v_is_owner boolean:=false;
  v_due date;
  v_target numeric;
begin
  select * into a from public.triovist_content_actor();
  if a.actor_email is null then raise exception 'Пользователь не найден'; end if;

  select * into t from public.triovist_ai_tasks where id=p_task_id for update;
  if not found then raise exception 'Задача не найдена'; end if;

  v_is_leader:=a.actor_role='boss' and a.actor_email in ('payushin_ar@resanta.ru','sidarovich_kn@resanta.ru');
  v_is_owner:=a.actor_scope='triovist' and a.actor_email=t.manager_email;
  if not v_is_leader and not v_is_owner then raise exception 'Нет доступа к задаче'; end if;

  v_old:=t.status;
  v_new:=t.status;

  if v_action='approve' then
    if not v_is_leader or a.actor_email<>'payushin_ar@resanta.ru' then raise exception 'Согласование задач ИИ доступно только Паюшину'; end if;
    if t.status<>'pending_approval' then raise exception 'Задача уже согласована или закрыта'; end if;
    v_new:='new';
  elsif v_action='cancel' then
    if not v_is_leader then raise exception 'Отмена доступна руководителю'; end if;
    v_new:='cancelled';
  elsif v_action='not_relevant' then
    if not v_is_leader then raise exception 'Статус доступен руководителю'; end if;
    v_new:='not_relevant';
  elsif v_action='accept' then
    if not v_is_owner then raise exception 'Принять задачу может ответственный менеджер'; end if;
    if t.status<>'new' then raise exception 'Задача ещё не согласована или уже принята'; end if;
    v_new:='accepted';
  elsif v_action='start' or v_action='continue' then
    if not v_is_owner and not v_is_leader then raise exception 'Нет права начать задачу'; end if;
    if v_action='start' and t.status not in ('accepted','new') then raise exception 'Сначала примите задачу'; end if;
    if v_action='continue' and t.status not in ('partial','overdue','awaiting_check','waiting_21vek','in_progress') then raise exception 'Эту задачу нельзя продолжить из текущего статуса'; end if;
    v_new:='in_progress';
  elsif v_action='waiting_21vek' then
    if not v_is_owner then raise exception 'Статус доступен ответственному менеджеру'; end if;
    if t.status not in ('in_progress','partial','overdue') then raise exception 'Сначала начните работу по задаче'; end if;
    v_new:='waiting_21vek';
  elsif v_action='submit_check' then
    if not v_is_owner then raise exception 'Отправить на проверку может ответственный менеджер'; end if;
    if t.status not in ('in_progress','waiting_21vek','partial','overdue') then raise exception 'Задача ещё не находится в работе'; end if;
    v_new:='awaiting_check';
  elsif v_action='comment' then
    null;
  elsif v_action='edit' then
    if not v_is_leader or a.actor_email<>'payushin_ar@resanta.ru' then raise exception 'Редактирование задач ИИ доступно только Паюшину'; end if;
    if t.status<>'pending_approval' then
      raise exception 'Цифровой план можно менять только до согласования задачи';
    end if;
    if nullif(trim(coalesce(p_payload->>'target_revenue','')),'') is not null then
      begin
        v_target:=replace(replace(trim(p_payload->>'target_revenue'),' ',''),',','.')::numeric;
      exception when others then
        raise exception 'Некорректная сумма плана';
      end;
      if v_target<=0 then raise exception 'План должен быть больше 0'; end if;
      if v_target>100000000 then raise exception 'Слишком большая сумма плана'; end if;
    else
      v_target:=t.target_revenue;
    end if;
  else
    raise exception 'Неизвестное действие';
  end if;

  if nullif(p_payload->>'due_date','') is not null then
    begin v_due:=(p_payload->>'due_date')::date;
    exception when others then raise exception 'Некорректная дата'; end;
  else
    v_due:=t.due_date;
  end if;

  update public.triovist_ai_tasks
  set status=v_new,
      title=case when v_action='edit' then coalesce(nullif(left(trim(p_payload->>'title'),500),''),title) else title end,
      task_text=case when v_action='edit' then coalesce(nullif(left(trim(p_payload->>'task_text'),4000),''),task_text) else task_text end,
      expected_result=case
        when v_action='edit' and nullif(trim(coalesce(p_payload->>'target_revenue','')),'') is not null then
          'Получить согласованный руководителем план не менее '||to_char(v_target,'FM999999990D00')||
          ' BYN по '||
          case when coalesce(commercial_context->>'task_scope','')='group' then 'группе' else 'подгруппе' end||
          ' до конца месяца. Остаток 21vek не является целевым объёмом продаж.'||
          case when coalesce((commercial_context->>'listing_problem_count')::int,0)>0 then
            ' Листинг: выполнить целевые действия по TOP-60/TOP-30, зафиксированные в задаче.'
          else '' end
        when v_action='edit' then coalesce(nullif(left(trim(p_payload->>'expected_result'),2000),''),expected_result)
        else expected_result
      end,
      criteria=case when v_action='edit' then coalesce(nullif(left(trim(p_payload->>'criteria'),2000),''),criteria) else criteria end,
      target_revenue=case when v_action='edit' then coalesce(v_target,target_revenue) else target_revenue end,
      commercial_context=case
        when v_action='edit' and nullif(trim(coalesce(p_payload->>'target_revenue','')),'') is not null then
          jsonb_set(
            jsonb_set(coalesce(commercial_context,'{}'::jsonb),'{target_revenue}',to_jsonb(v_target),true),
            '{target_source}',to_jsonb('leader_manual'::text),true
          ) || jsonb_build_object('manual_target_revenue',v_target,'manual_target_updated_at',now(),'manual_target_updated_by',a.actor_email)
        else commercial_context
      end,
      due_date=case when v_action='edit' then v_due else due_date end,
      manager_comment=case when v_is_owner and v_comment is not null then v_comment else manager_comment end,
      leader_comment=case when v_is_leader and v_comment is not null then v_comment else leader_comment end,
      proof_url=case when v_is_owner and nullif(trim(coalesce(p_payload->>'proof_url','')),'') is not null
                     then left(trim(p_payload->>'proof_url'),2000) else proof_url end,
      accepted_at=case when v_action='accept' then now() else accepted_at end,
      started_at=case when v_action in ('start','continue') then coalesce(started_at,now()) else started_at end,
      submitted_at=case when v_action='submit_check' then now() else submitted_at end,
      closed_at=case when v_new in ('cancelled','not_relevant') then now() else closed_at end,
      updated_at=now()
  where id=t.id;

  insert into public.triovist_ai_task_events(task_id,event_type,old_status,new_status,comment,payload,actor_email,actor_name)
  values(t.id,v_action,v_old,v_new,v_comment,coalesce(p_payload,'{}'::jsonb),a.actor_email,a.actor_name);

  return (select to_jsonb(x) from public.triovist_ai_tasks x where x.id=t.id);
end;
$function$
;

-- Leader-approved subgroup tasks: one action explicitly approved by Payushin.
-- Uses live brainstorm preview for server-side evidence; NEVER auto-generates tasks.
-- No change to archived tasks, monthly budgets or existing parser.
CREATE OR REPLACE FUNCTION public.triovist_ai_brainstorm_approve_v20261105(
 p_month date,
 p_manager_email text,
 p_group text,
 p_subgroup text,
 p_target_revenue numeric,
 p_listing_text text,
 p_task_note text DEFAULT NULL,
 p_title text DEFAULT NULL,
 p_due_date date DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO 'public','auth','pg_catalog','pg_temp'
AS $fun$
DECLARE
 a record;
 v_month date:=date_trunc('month',coalesce(p_month,current_date))::date;
 v_manager text:=lower(trim(coalesce(p_manager_email,'')));
 v_group text:=trim(coalesce(p_group,''));
 v_subgroup text:=trim(coalesce(p_subgroup,''));
 v_listing text:=trim(coalesce(p_listing_text,''));
 v_note text:=trim(coalesce(p_task_note,''));
 v_title text:=trim(coalesce(p_title,''));
 v_due date:=coalesce(p_due_date,(date_trunc('month',current_date)+interval '1 month - 1 day')::date);
 v_preview jsonb;v_candidate jsonb;v_id uuid;v_key text;
 v_existing integer;v_context jsonb;v_actions jsonb;v_task jsonb;
BEGIN
 SELECT * INTO a FROM public.triovist_content_actor();
 IF auth.uid() IS NULL OR a.actor_email IS DISTINCT FROM 'payushin_ar@resanta.ru'
    OR a.actor_role IS DISTINCT FROM 'boss' THEN
  RAISE EXCEPTION 'Утверждение задач ИИ доступно исключительно Паюшину'
   USING ERRCODE='42501';
 END IF;
 IF p_month IS NULL OR p_month<>v_month OR v_month<>date_trunc('month',current_date)::date THEN
  RAISE EXCEPTION 'Задачи мозгового штурма создаются только в текущем месяце'
   USING ERRCODE='22007';
 END IF;
 IF v_manager NOT IN ('aleksandrenko_av@resanta.ru','krishtal_na@resanta.ru')
  OR length(v_group) NOT BETWEEN 2 AND 150 OR length(v_subgroup) NOT BETWEEN 2 AND 200
  OR v_group ~ '^[0-9]*900(/|$)' OR v_subgroup ~ '^[0-9]*900(/|$)' THEN
  RAISE EXCEPTION 'Недопустимая товарная группа или менеджер'
   USING ERRCODE='22023';
 END IF;
 IF p_target_revenue IS NULL OR p_target_revenue<=0 OR p_target_revenue>100000000
    OR length(v_listing) NOT BETWEEN 15 AND 1800 OR length(v_note)>2000
    OR length(v_title)>350 OR v_due<current_date
    OR v_due>(v_month+interval '1 month - 1 day')::date THEN
  RAISE EXCEPTION 'Проверьте сумму, текст листинга и срок задачи'
   USING ERRCODE='22023';
 END IF;
 -- Advisory lock protects both capacity and subgroup uniqueness under concurrent clicks.
 PERFORM pg_advisory_xact_lock(hashtext('brainstorm-v2|all|'||v_manager||'|'||to_char(v_month,'YYYY-MM')));
 SELECT count(*) INTO v_existing
 FROM public.triovist_ai_tasks
 WHERE manager_email=v_manager AND period_month=v_month
   AND status NOT IN ('cancelled','not_relevant');
 IF v_existing>=30 THEN
  RAISE EXCEPTION 'Лимит 30 действующих задач на менеджера в месяц достигнут'
   USING ERRCODE='22023';
 END IF;
 SELECT public.triovist_ai_brainstorm_preview_v20261105(v_month,v_manager)
 INTO v_preview;
 IF coalesce((v_preview->'quality'->>'complete')::boolean,false) IS NOT TRUE THEN
  RAISE EXCEPTION 'Сравнимые месяцы продаж не загружены, нельзя утверждать цель'
   USING ERRCODE='22023';
 END IF;
 IF (v_preview->'quality'->>'partner_date')::date<current_date-interval '10 days'
   OR (v_preview->'quality'->>'vitebsk_date')::date<current_date-interval '10 days' THEN
  RAISE EXCEPTION 'Остатки 21vek или Витебска устарели, обновите выгрузки'
   USING ERRCODE='22023';
 END IF;
 SELECT value INTO v_candidate
 FROM jsonb_array_elements(v_preview->'proposals') value
 WHERE lower(value->>'manager_email')=v_manager
   AND public.triovist_norm(value->>'group')=public.triovist_norm(v_group)
   AND public.triovist_norm(value->>'subgroup')=public.triovist_norm(v_subgroup)
 LIMIT 1;
 IF v_candidate IS NULL OR coalesce((v_candidate->>'loss')::numeric,0)<=0 THEN
  RAISE EXCEPTION 'Подгруппа не подтверждена как падающая в текущем анализе'
   USING ERRCODE='22023';
 END IF;
 IF EXISTS(
  SELECT 1 FROM public.triovist_ai_tasks t
  WHERE t.manager_email=v_manager AND t.period_month=v_month
    AND t.status NOT IN ('cancelled','not_relevant')
    AND public.triovist_norm(t.group_name)=public.triovist_norm(v_group)
    AND public.triovist_norm(t.commercial_context->>'subgroup')=public.triovist_norm(v_subgroup)
 ) THEN
  RAISE EXCEPTION 'Задача на эту подгруппу уже существует'
   USING ERRCODE='23505';
 END IF;
 v_key:='brainstorm-v2|'||to_char(v_month,'YYYY-MM')||'|'||v_manager||'|'||
   md5(public.triovist_norm(v_group)||'|'||public.triovist_norm(v_subgroup));
 IF EXISTS(SELECT 1 FROM public.triovist_ai_tasks WHERE task_key=v_key) THEN
  RAISE EXCEPTION 'Это предложение уже было утверждено в данном месяце'
   USING ERRCODE='23505';
 END IF;
 IF v_title='' THEN v_title:=to_char(v_month,'MM.YYYY')||' · '||v_subgroup||' · восстановление объёма и листинга';END IF;
 v_actions:=coalesce((
  SELECT jsonb_agg(jsonb_build_object('sku',x->>'sku',
   'current_position',x->'position',
   'action_code','review_listing',
   'action_label',CASE WHEN x->'position'='null'::jsonb
     THEN 'Проверить текущую позицию, не считать выпадением из TOP-60'
     WHEN (x->>'position')::numeric>60
     THEN 'Проверить, почему ниже TOP-60, и подготовить корректирующие действия'
     ELSE 'Проверить динамику позиции и качество карточки' END,
   'mandatory_for_subgroup_close',false))
  FROM jsonb_array_elements(coalesce(v_candidate->'listing_skus','[]'::jsonb)) x
 ),'[]'::jsonb);
 v_context:=jsonb_build_object(
  'logic_version','uni-brainstorm-subgroup-v2',
  'task_scope','subgroup','parent_group',v_group,'subgroup',v_subgroup,
  'manager_email',v_manager,'period',to_char(v_month,'YYYY-MM'),
  'sales_period',v_preview->'timeframe',
  'sales_last_year_ytd',v_candidate->'sales_previous_year',
  'sales_current_ytd',v_candidate->'sales_current_year',
  'sales_change_pct',v_candidate->'change_pct',
  'sales_loss',v_candidate->'loss',
  'sales_analog_last_year',v_candidate->'analogous_month_last_year',
  'recommended_target',v_candidate->'suggested_target',
  'target_revenue',p_target_revenue,
  'target_source',CASE WHEN p_target_revenue=coalesce((v_candidate->>'suggested_target')::numeric,-1)
   THEN 'same_month_last_year_plus_15pct' ELSE 'leader_manual' END,
  'partner_free',v_candidate->'partner_free',
  'vitebsk_qty',v_candidate->'vitebsk_qty',
  'chekhov_reference',v_candidate->'chekhov_reference',
  'listing_problem_count',coalesce((v_candidate->>'outside_top60')::integer,0)
   +coalesce((v_candidate->>'rank_unknown')::integer,0)
   +coalesce((v_candidate->>'card_issues')::integer,0),
  'listing_verified_count',v_candidate->'positions_known',
  'listing_outside_top60',v_candidate->'outside_top60',
  'listing_unknown',v_candidate->'rank_unknown',
  'listing_actions',v_actions,
  'listing_text',v_listing,'listing_review_required',true,
  'listing_samples',v_candidate->'listing_skus',
  'revenue_goal_is_leader_approved',true,
  'rank_not_guaranteed',true,
  'auto_created',false,
  'leader_actor',a.actor_email
 );
 INSERT INTO public.triovist_ai_tasks(
  manager_email,manager_name,task_key,task_type,group_name,title,task_text,
  basis,expected_result,criteria,next_step,base_priority,priority_score,
  priority_label,status,approval_required,ai_generated,ai_state,due_date,
  created_by,commercial_context,candidate_key,generator_version,reason_code,
  period_month,baseline_revenue,target_revenue,task_snapshot
 ) VALUES (
  v_manager,v_candidate->>'manager_name',v_key,'listing',
  v_group,v_title,
  '1. Объём: восстановить продажи подгруппы '||v_subgroup||' до утверждённой цели '||
  to_char(p_target_revenue,'FM999999990D00')||' BYN за '||to_char(v_month,'MM.YYYY')||
  '. 2. Листинг: '||v_listing||
  CASE WHEN v_note<>'' THEN ' Дополнительное указание: '||v_note ELSE '' END,
  'Сравнимый период год к году: '||coalesce(v_candidate->>'sales_previous_year','—')||
  ' → '||coalesce(v_candidate->>'sales_current_year','—')||' BYN, изменение '||
  coalesce(v_candidate->>'change_pct','—')||
  '%. Аналогичный месяц 2025: '||coalesce(v_candidate->>'analogous_month_last_year','—')||
  ' BYN. Октябрь автоматически в ноябрь не переносится.',
  'Достичь утверждённого объёма и документировать проверку листинга. Место в выдаче не гарантируется.',
  'Объём по подгруппе ≥ '||to_char(p_target_revenue,'FM999999990D00')||
  ' BYN; листинг: зафиксировать фактические позиции, карточки, наличие и действия. '||
  'Неизвестная позиция не считается подтверждённым выпадением из TOP-60.',
  'Менеджер принимает задачу после утверждения руководителем, представляет результат и подтверждения.',
  80,80,'высокий','pending_approval',true,true,'generated',
  v_due,a.actor_email,v_context,v_key,'uni-brainstorm-subgroup-v2',
  'year_over_year_subgroup_decline',v_month,
  coalesce((v_candidate->>'analogous_month_last_year')::numeric,0),
  p_target_revenue,
  jsonb_build_object('version','uni-brainstorm-subgroup-v2','month',v_month,
    'group',v_group,'subgroup',v_subgroup,
    'manager_email',v_manager,'baseline',v_candidate->'sales_previous_year',
    'current',v_candidate->'sales_current_year',
    'listing',v_candidate->'listing_skus')
 ) RETURNING id INTO v_id;
 -- One explicit leader approval and audit event, atomic with task insertion.
 SELECT public.triovist_tasks_action(v_id,'approve','{}'::jsonb) INTO v_task;
 IF v_task IS NULL OR v_task->>'status'<>'new' THEN
  RAISE EXCEPTION 'Утверждение задачи не завершилось'
   USING ERRCODE='P0001';
 END IF;
 RETURN jsonb_build_object('ok',true,'approved',true,'task_id',v_id,
   'status','new','manager_email',v_manager,'subgroup',v_subgroup,
   'target_revenue',p_target_revenue);
END;
$fun$;
REVOKE ALL ON FUNCTION public.triovist_ai_brainstorm_approve_v20261105(date,text,text,text,numeric,text,text,text,date) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.triovist_ai_brainstorm_approve_v20261105(date,text,text,text,numeric,text,text,text,date) TO authenticated,service_role;
-- The superseded SKU-level draft endpoint must not create new tasks from old cached clients.
REVOKE EXECUTE ON FUNCTION public.triovist_ai_task_draft_v20261105(date,text,text,text) FROM PUBLIC,anon,authenticated;
