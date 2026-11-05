-- Uni AI V2: user-triggered, leader-only, idempotent SKU task drafts.
-- Never calls the retired automatic generator, never overwrites prior-month tasks.
CREATE OR REPLACE FUNCTION public.triovist_ai_task_draft_v20261105(
 p_month date, p_manager_email text, p_sku text, p_action text
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path='public','auth','pg_catalog','pg_temp'
AS $func$
DECLARE
 v_actor text:=lower(coalesce(auth.jwt()->>'email',''));
 v_mgr text:=lower(trim(coalesce(p_manager_email,'')));
 v_sku text:=trim(coalesce(p_sku,''));
 v_month date:=date_trunc('month',p_month)::date;
 v_group text; v_name text; v_product text;
 v_partner numeric:=0; v_own numeric:=0; v_ck numeric:=0; v_sales90 numeric:=0;
 v_partner_date date; v_own_date date;
 v_key text; v_id uuid; v_title text;v_text text;v_criteria text;v_type text;
BEGIN
 IF auth.uid() IS NULL OR NOT public.triovist_is_boss() THEN
  RAISE EXCEPTION 'Только руководитель Триовиста может создавать черновики ИИ' USING ERRCODE='42501';
 END IF;
 IF p_month IS NULL OR v_month<date_trunc('month',current_date)::date
    OR v_month>(date_trunc('month',current_date)::date+interval '2 months')::date
    OR p_month<>v_month THEN
  RAISE EXCEPTION 'Черновики разрешены только для текущего и двух следующих месяцев' USING ERRCODE='22007';
 END IF;
 IF v_mgr NOT IN ('aleksandrenko_av@resanta.ru','krishtal_na@resanta.ru')
    OR v_sku !~ '^[0-9]+(/[0-9]+){1,6}$' OR v_sku ~ '^900(/|$)'
    OR p_action NOT IN ('listing_review','replenishment_review') THEN
  RAISE EXCEPTION 'Недопустимый менеджер, SKU или тип поручения' USING ERRCODE='22023';
 END IF;
 SELECT a.group_name,a.manager_name INTO v_group,v_name
 FROM (SELECT DISTINCT ON (s.sku) s.sku,s.assigned_group
       FROM public.triovist_sales_resolved_cache s
       WHERE s.sku=v_sku AND s.assigned_group IS NOT NULL
       ORDER BY s.sku,s.month DESC) recent
 JOIN public.triovist_group_assignments a ON a.active
   AND public.triovist_norm(a.group_name)=public.triovist_norm(recent.assigned_group)
 WHERE lower(a.manager_email)=v_mgr LIMIT 1;
 IF v_group IS NULL THEN
   RAISE EXCEPTION 'SKU не закреплён за выбранным менеджером' USING ERRCODE='42501';
 END IF;
 SELECT max(product),round(coalesce(sum(greatest(coalesce(qty_free,0),0)),0),3),max(snapshot_date)
  INTO v_product,v_partner,v_partner_date
 FROM public.triovist_partner_stock WHERE sku=v_sku AND NOT coalesce(excluded,false);
 SELECT round(coalesce(sum(greatest(coalesce(qty_avail,0),0)),0),3),max(report_date)
  INTO v_own,v_own_date FROM public.stock_balances WHERE sku=v_sku AND warehouse='Витебск';
 SELECT round(coalesce(sum(greatest(coalesce(qty_total,0),0)),0),3) INTO v_ck
 FROM public.triovist_chekhov_stock WHERE sku=v_sku;
 SELECT round(coalesce(sum(greatest(qty,0)),0),3) INTO v_sales90
 FROM public.triovist_sales_resolved_cache
 WHERE sku=v_sku AND month BETWEEN (v_month-interval '3 months')::date AND (v_month-interval '1 month')::date;
 IF v_partner_date IS NULL OR v_partner_date<current_date-interval '10 days'
    OR v_own_date IS NULL OR v_own_date<current_date-interval '10 days' THEN
  RAISE EXCEPTION 'Остатки недостаточно свежие, перепроверьте выгрузки 21vek и Витебска' USING ERRCODE='22023';
 END IF;
 IF coalesce(v_sales90,0)<=0 THEN
  RAISE EXCEPTION 'Нет подтверждённого спроса на SKU за три завершённых месяца' USING ERRCODE='22023';
 END IF;
 IF p_action='replenishment_review' AND NOT(v_partner<1 AND v_own>0) THEN
  RAISE EXCEPTION 'Пополнение не подтверждено: нужны отсутствие доступного 21vek и остаток Витебска' USING ERRCODE='22023';
 END IF;
 IF p_action='listing_review' AND NOT(v_partner>0) THEN
  RAISE EXCEPTION 'Для аудита продаж отсутствует доступный остаток 21vek' USING ERRCODE='22023';
 END IF;
 v_type:=CASE WHEN p_action='replenishment_review' THEN 'availability' ELSE 'listing' END;
 v_title:=CASE WHEN p_action='replenishment_review'
  THEN 'Проверить пополнение 21vek · '||v_sku
  ELSE 'Проверить карточку и выдачу 21vek · '||v_sku END;
 v_text:=CASE WHEN p_action='replenishment_review'
  THEN 'Подтвердить возможность, количество и срок пополнения 21vek из Витебска; не обещать продажи до подтверждения поставки.'
  ELSE 'Проверить позицию, цену, наличие и содержание карточки товара на 21vek, зафиксировать вывод и предложить измеримое действие. Без обязательного TOP-60.' END;
 v_criteria:='Отчёт по SKU '||v_sku||': текущий факт 21vek, дата снимка, выявленная причина, предложенное действие и подтверждение руководителем.';
 v_key:='uni20261105|'||v_mgr||'|'||to_char(v_month,'YYYY-MM')||'|'||v_sku||'|'||p_action;
 -- One task per manager/SKU/action/month even under two simultaneous clicks.
 PERFORM pg_advisory_xact_lock(hashtext(v_key));
 SELECT id INTO v_id FROM public.triovist_ai_tasks WHERE task_key=v_key ORDER BY created_at DESC LIMIT 1;
 IF v_id IS NOT NULL THEN
  RETURN jsonb_build_object('ok',true,'created',false,'id',v_id,'status','already_exists');
 END IF;
 INSERT INTO public.triovist_ai_tasks(
  manager_email,manager_name,task_key,task_type,group_name,title,task_text,basis,
  expected_result,criteria,next_step,base_priority,priority_score,priority_label,
  status,approval_required,ai_generated,ai_state,due_date,created_by,
  commercial_context,candidate_key,generator_version,reason_code,period_month
 ) VALUES(
  v_mgr,v_name,v_key,v_type,v_group,v_title,v_text,
  'Продажи предыдущих 3 месяцев: '||v_sales90||' шт.; 21vek: '||v_partner||
  ' шт.; Витебск: '||v_own||' шт.; Чехов справочно: '||v_ck||' шт.',
  'Документированная проверка и согласованное действие, а не гарантированное изменение позиции.',
  v_criteria,'Проверить фактические данные и представить руководителю.',65,65,'средний',
  'pending_approval',true,true,'generated',(v_month+interval '1 month - 1 day')::date,v_actor,
  jsonb_build_object('version','uni-demand-20261105-v1','task_scope','sku','sku',v_sku,'product',v_product,
   'group',v_group,'action',p_action,'partner_qty_free_including_transit_if_reported',v_partner,
   'vitebsk_qty',v_own,'chekhov_reference_qty',v_ck,'sales_90_days_qty',v_sales90,
   'partner_snapshot_date',v_partner_date,'vitebsk_snapshot_date',v_own_date,
   'no_fixed_listing_rank',true,'approved_only_after_leader_action',true),
  v_key,'uni-demand-20261105-v1','sku_evidence_review',v_month
 ) RETURNING id INTO v_id;
 RETURN jsonb_build_object('ok',true,'created',true,'id',v_id,'status','pending_approval');
END;
$func$;
REVOKE ALL ON FUNCTION public.triovist_ai_task_draft_v20261105(date,text,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.triovist_ai_task_draft_v20261105(date,text,text,text) TO authenticated,service_role;
