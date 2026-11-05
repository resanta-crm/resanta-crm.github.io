-- Manual target override: optional note, automatic trace, Payushin-only approval
CREATE OR REPLACE FUNCTION public.triovist_ai_brainstorm_approve_v20261105(p_month date, p_manager_email text, p_group text, p_subgroup text, p_target_revenue numeric, p_listing_text text, p_task_note text DEFAULT NULL::text, p_title text DEFAULT NULL::text, p_due_date date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_catalog', 'pg_temp'
AS $function$
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
 -- The director can explicitly approve a new target without typing a second note.
 -- Preserve an automatic audit explanation if the optional note is blank.
 IF (
     (v_candidate->>'suggested_target') IS NULL
     OR (v_candidate->>'suggested_target')::numeric<=0
     OR p_target_revenue>(v_candidate->>'suggested_target')::numeric*1.5
   ) AND v_note='' THEN
   v_note:='Ручная цель руководителя: рекомендация ИИ '||
     coalesce(v_candidate->>'suggested_target','не рассчитана')||
     ' BYN, лично утверждено '||to_char(p_target_revenue,'FM999999990D00')||
     ' BYN. Дополнительное пояснение не указано.';
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
$function$
;
