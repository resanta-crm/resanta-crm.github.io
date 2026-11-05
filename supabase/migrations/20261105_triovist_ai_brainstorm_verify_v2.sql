-- Independent evidence-based completion for NEW subgroup-brainstorm tasks only.
-- Existing historical KPI/reconcile functions are unchanged.
CREATE OR REPLACE FUNCTION public.triovist_ai_brainstorm_verify_v20261105(
 p_task_id uuid, p_comment text
)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO 'public','auth','pg_catalog'
AS $fun$
DECLARE
 a record;t public.triovist_ai_tasks%rowtype;
 v_comment text:=trim(coalesce(p_comment,''));v_actual numeric;v_ratio numeric;
 v_old text;v_new text;v_event jsonb;v_after_end boolean;
BEGIN
 SELECT * INTO a FROM public.triovist_content_actor();
 IF auth.uid() IS NULL OR a.actor_email IS DISTINCT FROM 'payushin_ar@resanta.ru'
   OR a.actor_role IS DISTINCT FROM 'boss' THEN
   RAISE EXCEPTION 'Проверка результатов ИИ доступна только Паюшину'
    USING ERRCODE='42501';
 END IF;
 IF length(v_comment) NOT BETWEEN 15 AND 1800 THEN
   RAISE EXCEPTION 'Укажите содержательный итог проверки листинга'
    USING ERRCODE='22023';
 END IF;
 SELECT * INTO t FROM public.triovist_ai_tasks WHERE id=p_task_id FOR UPDATE;
 IF NOT FOUND OR t.generator_version<>'uni-brainstorm-subgroup-v2' THEN
  RAISE EXCEPTION 'Задача мозгового штурма не найдена' USING ERRCODE='22023';
 END IF;
 IF t.status NOT IN ('awaiting_check','in_progress','partial','not_achieved')
    OR t.submitted_at IS NULL
    OR length(trim(coalesce(t.manager_comment,'')))<10 THEN
  RAISE EXCEPTION 'Сначала менеджер должен направить отчёт по листингу на проверку'
   USING ERRCODE='22023';
 END IF;
 SELECT round(coalesce(sum(s.revenue),0),2) INTO v_actual
 FROM public.triovist_sales_resolved_cache s
 WHERE s.month=t.period_month
   AND public.triovist_norm(s.assigned_group)=public.triovist_norm(t.group_name)
   AND public.triovist_norm(s.subgroup)=public.triovist_norm(t.commercial_context->>'subgroup')
   AND trim(s.sku) !~ '^900(/|$)';
 IF t.target_revenue IS NULL OR t.target_revenue<=0 THEN
  RAISE EXCEPTION 'У задачи отсутствует утверждённая денежная цель' USING ERRCODE='22023';
 END IF;
 v_ratio:=round(greatest(0,least(100,v_actual/t.target_revenue*100)),2);
 v_old:=t.status;v_after_end:=current_date>t.due_date;
 v_new:=CASE
  WHEN v_actual>=t.target_revenue THEN 'verified'
  WHEN v_after_end THEN 'partial'
  ELSE 'in_progress' END;
 UPDATE public.triovist_ai_tasks
 SET status=v_new,result_revenue=v_actual,result_ratio=v_ratio,
  result_checked_at=now(),result_source='Продажи 21vek по подгруппе + ручная проверка листинга руководителем',
  result_summary='Объём: факт '||to_char(v_actual,'FM999999990D00')||
   ' BYN при цели '||to_char(t.target_revenue,'FM999999990D00')||
   ' BYN. Листинг: проверено Паюшиным. '||v_comment,
  commercial_context=coalesce(commercial_context,'{}'::jsonb)||jsonb_build_object(
   'listing_verified_by',a.actor_email,
   'listing_verified_at',now(),
   'listing_review_comment',v_comment,
   'sales_progress_pct',v_ratio,
   'sales_last_verified',now(),
   'listing_evidence_checked',true,
   'full_completion_requires_volume_and_listing',true),
  leader_comment=v_comment,
  verified_at=CASE WHEN v_new='verified' THEN now() ELSE NULL END,
  closed_at=CASE WHEN v_after_end AND v_new IN ('verified','partial','not_achieved')
   THEN now() ELSE NULL END,updated_at=now()
 WHERE id=t.id;
 v_event:=jsonb_build_object('actual',v_actual,'target',t.target_revenue,
    'listing_approved_by',a.actor_email,'submitted_at',t.submitted_at,
    'completion_rule','volume + leader-verified listing');
 INSERT INTO public.triovist_ai_task_events(
  task_id,event_type,old_status,new_status,comment,payload,actor_email,actor_name
 ) VALUES(t.id,'brainstorm_listing_result_verified',v_old,v_new,v_comment,v_event,
   a.actor_email,a.actor_name);
 RETURN jsonb_build_object('ok',true,'status',v_new,'actual',v_actual,
  'target',t.target_revenue,'listing_verified',true,'sales_pct',v_ratio,
  'fully_completed',v_new='verified');
END;
$fun$;
REVOKE ALL ON FUNCTION public.triovist_ai_brainstorm_verify_v20261105(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.triovist_ai_brainstorm_verify_v20261105(uuid,text) TO authenticated,service_role;
