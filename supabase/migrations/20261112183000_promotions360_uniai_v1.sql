-- Promotions 360 / Uni AI director screen and responsible AI task workflow.
-- Additive. Existing promotions, sales history, photos, PDZ, stands, GPS and approvals unchanged.
CREATE TABLE IF NOT EXISTS public.crm_promotion360_settings_v1(
 id text primary key check(id='main'),
 enabled boolean not null default false,
 auto_tasks_enabled boolean not null default false,
 telegram_enabled boolean not null default false,
 updated_at timestamptz not null default now()
);
INSERT INTO public.crm_promotion360_settings_v1(id) VALUES('main')
 ON CONFLICT(id) DO NOTHING;
CREATE TABLE IF NOT EXISTS public.crm_promotion360_actions_v1(
 id uuid primary key default gen_random_uuid(),
 promotion_id uuid not null references public.promotions(id) on delete restrict,
 manager_id uuid not null references public.users(id) on delete restrict,
 milestone smallint not null check(milestone in (7,14)),
 status text not null default 'open' check(status in ('open','working','review','closed','escalated')),
 reason text,
 action_plan text,
 manager_comment text,
 due_at timestamptz not null,
 next_check_at timestamptz,
 reviewed_by uuid,
 reviewed_at timestamptz,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(promotion_id,milestone)
);
CREATE INDEX IF NOT EXISTS crm_promo360_action_mgr_v1 ON public.crm_promotion360_actions_v1(manager_id,status,due_at);
CREATE TABLE IF NOT EXISTS public.crm_promotion360_action_history_v1(
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 action_id uuid not null references public.crm_promotion360_actions_v1(id) on delete restrict,
 actor_id uuid,
 event text not null,
 before_state jsonb,
 after_state jsonb,
 created_at timestamptz not null default now()
);
ALTER TABLE public.crm_promotion360_settings_v1 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_promotion360_actions_v1 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_promotion360_action_history_v1 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.crm_promotion360_settings_v1,public.crm_promotion360_actions_v1,public.crm_promotion360_action_history_v1
 FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.crm_promotion360_settings_v1,public.crm_promotion360_actions_v1,public.crm_promotion360_action_history_v1 TO service_role;
GRANT USAGE,SELECT ON SEQUENCE public.crm_promotion360_action_history_v1_id_seq TO service_role;

CREATE OR REPLACE FUNCTION public.crm_promotions360_overview_v1(p_mode text DEFAULT 'active')
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE actor public.users%rowtype; result jsonb;
BEGIN
 SELECT * INTO actor FROM public.users WHERE id=(SELECT auth.uid());
 IF actor.id IS NULL OR actor.role NOT IN ('boss','manager')
 THEN RAISE EXCEPTION 'Доступ к акциям запрещён' USING errcode='42501'; END IF;
 IF p_mode NOT IN ('active','all','pending','completed','planned')
 THEN RAISE EXCEPTION 'Неверный фильтр акций' USING errcode='22023'; END IF;
 WITH
 source AS MATERIALIZED (
  SELECT value e FROM jsonb_array_elements(public.crm_promotions_effectiveness_v236203()) value
 ),
 allowed AS MATERIALIZED(
  SELECT p.*,s.e AS evidence
  FROM public.promotions p JOIN source s ON (s.e->>'promotion_id')=p.id::text
  WHERE (actor.role='boss' OR p.manager_name=actor.name)
 ),
 filtered AS MATERIALIZED(
  SELECT p.* FROM allowed p
  WHERE p_mode='all' OR
   (p_mode='active' AND p.status IN ('in_work','approved')
       AND current_date BETWEEN p.start_date AND p.end_date) OR
   (p_mode='pending' AND p.status IN ('draft_manager','pending_df','pending_dfs','waiting_manager')) OR
   (p_mode='completed' AND (p.status='completed' OR (p.end_date<current_date AND p.status='in_work'))) OR
   (p_mode='planned' AND p.start_date>current_date AND p.status NOT IN ('rejected','completed'))
 ),
 base AS(
  SELECT p.id,p.client_id,p.client_name,p.manager_name,p.title,p.goal,p.mechanics,
    p.status,p.start_date,p.end_date,
    coalesce(p.sales_plan,0) AS sales_plan,
    coalesce(p.requested_budget,0) AS requested_budget,
    p.budget_reserved,p.actual_spend,
    p.confirmed_sales,
    p.evidence->>'scope_mode' AS sku_scope,
    coalesce((p.evidence->>'item_count')::int,0) AS sku_count,
    p.evidence->>'data_quality' AS data_quality,
    p.evidence->>'sales_label' AS sales_label,
    p.evidence->>'client_match_mode' AS client_match_mode,
    coalesce((p.evidence->>'sales_exact')::boolean,false) AS source_exact,
    coalesce((p.evidence->>'manual_conflict')::boolean,false) AS manual_conflict,
    p.evidence->'calendar_month_breakdown' AS months,
    p.evidence->'items' AS items,
    p.evidence->>'sales_source' AS sales_source,
    p.evidence->>'financial_note' AS finance_note,
    p.evidence->>'baseline_comparable' AS comparable_text,
    p.evidence->'incremental_sales' AS incremental_sales,
    p.evidence->>'baseline_sales' AS baseline_sales,
    p.evidence->>'current_sales_1c' AS source_sales,
    (SELECT max(s.source_message_at) FROM public.promotion_sales_snapshots s WHERE s.promotion_id=p.id) AS source_at,
    (SELECT count(*)::int FROM public.promotion_photos ph WHERE ph.promotion_id=p.id) AS photo_count,
    (SELECT count(*)::int FROM public.promotion_photos ph WHERE ph.promotion_id=p.id AND ph.approved IS NOT false) AS approved_photo_count,
    (SELECT count(*)::int FROM public.crm_promotion360_actions_v1 a WHERE a.promotion_id=p.id AND a.status<>'closed') AS open_actions,
    greatest(0,current_date-p.start_date) AS elapsed_days,
    greatest(0,p.end_date-current_date) AS remaining_days
  FROM filtered p
 ),
 classified AS(
  SELECT base.*,
    (sku_scope='exact_sku' AND sku_count>0 AND client_match_mode='client_id'
     AND source_exact AND NOT manual_conflict AND source_sales IS NOT NULL
     AND source_at >= now()-interval '72 hours'
     AND data_quality NOT IN ('future','client_match_ambiguous')) AS confirmed_1c,
    CASE WHEN sku_scope<>'exact_sku' OR sku_count=0 THEN 'sku_missing'
         WHEN client_match_mode<>'client_id' THEN 'client_id_check'
         WHEN NOT source_exact OR manual_conflict THEN 'period_unverified'
         WHEN source_at IS NULL OR source_at<now()-interval '72 hours' THEN 'import_stale'
         ELSE 'confirmed' END AS verification,
    CASE WHEN current_date>end_date THEN 'expired'
         WHEN current_date<start_date THEN 'planned'
         WHEN status='in_work' THEN 'active'
         ELSE 'administrative' END AS time_status
  FROM base
 ),
 summarized AS(
  SELECT classified.*,
  CASE WHEN confirmed_1c THEN (source_sales)::numeric ELSE NULL END AS verified_sales,
  CASE WHEN confirmed_1c AND sales_plan>0 THEN round((source_sales)::numeric/sales_plan*100,1) ELSE NULL END AS completion_pct,
  CASE WHEN NOT confirmed_1c THEN 'Сверить 1С'
       WHEN (source_sales)::numeric=0 AND elapsed_days>=14 THEN 'День 14 · выяснить причину отсутствия отгрузок'
       WHEN (source_sales)::numeric=0 AND elapsed_days>=7 THEN 'День 7 · проверить запуск акции'
       WHEN remaining_days<=7 THEN 'Проверить прогноз перед завершением'
       ELSE 'Контроль по плану' END AS lera_action,
  -- Date-boundary snapshots and a comparable baseline are required.
  CASE WHEN confirmed_1c AND comparable_text='true' AND
    incremental_sales IS NOT NULL THEN (incremental_sales)::numeric ELSE NULL END AS incremental_verified
  FROM classified
 )
 SELECT jsonb_build_object(
  'version','promotions360-uniai-v1',
  'enabled',coalesce((SELECT enabled FROM public.crm_promotion360_settings_v1 WHERE id='main'),false),
  'mode',p_mode,'as_of',current_date,'calculated_at',now(),
  'data_source','1C customer shipments by confirmed client_id and SKU; not retail sell-through',
  'total',count(*),
  'active',count(*) FILTER(WHERE time_status='active'),
  'plan_total',coalesce(sum(sales_plan),0),
  'requested_budget_total',coalesce(sum(requested_budget),0),
  'verified_sales_total',coalesce(sum(verified_sales),0),
  'verified_count',count(*) FILTER(WHERE confirmed_1c),
  'unverified_count',count(*) FILTER(WHERE NOT confirmed_1c),
  'action_count',coalesce(sum(open_actions),0),
  'rows',coalesce(jsonb_agg(
    to_jsonb(summarized) - 'confirmed_sales' - 'source_sales' - 'baseline_sales' - 'incremental_sales'
     || jsonb_build_object('historical_baseline',baseline_sales,'incremental_verified',incremental_verified,
      'financial_roi',null,'financial_roi_available',false)
    ORDER BY start_date DESC,title),'[]'::jsonb)
 ) INTO result FROM summarized;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.crm_promotions360_overview_v1(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.crm_promotions360_overview_v1(text) TO authenticated;

-- A manager can report a concrete action; cannot self-approve its commercial impact.
CREATE OR REPLACE FUNCTION public.crm_promotion360_action_update_v1(
 p_action_id uuid,p_reason text,p_plan text,p_comment text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor public.users%rowtype; task public.crm_promotion360_actions_v1%rowtype; promotion public.promotions%rowtype;
BEGIN
 SELECT * INTO actor FROM public.users WHERE id=(SELECT auth.uid());
 SELECT * INTO task FROM public.crm_promotion360_actions_v1 WHERE id=p_action_id FOR UPDATE;
 SELECT * INTO promotion FROM public.promotions WHERE id=task.promotion_id;
 IF actor.id IS NULL OR task.id IS NULL OR actor.role<>'manager' OR actor.id<>task.manager_id
  OR promotion.manager_name<>actor.name OR task.status IN ('closed','escalated')
 THEN RAISE EXCEPTION 'Нет доступа к поручению' USING errcode='42501'; END IF;
 IF length(btrim(coalesce(p_reason,'')))<5 OR length(btrim(coalesce(p_plan,'')))<8
 THEN RAISE EXCEPTION 'Укажите конкретную причину и действие' USING errcode='22023'; END IF;
 INSERT INTO public.crm_promotion360_action_history_v1(action_id,actor_id,event,before_state)
 VALUES(task.id,actor.id,'manager_action',to_jsonb(task));
 UPDATE public.crm_promotion360_actions_v1
 SET reason=left(btrim(p_reason),700),action_plan=left(btrim(p_plan),1200),
     manager_comment=left(btrim(coalesce(p_comment,'')),1200),
     status='working',next_check_at=now()+interval '48 hours',updated_at=now()
 WHERE id=task.id;
 RETURN jsonb_build_object('ok',true,'status','working','next_check_at',now()+interval '48 hours');
END $$;
REVOKE ALL ON FUNCTION public.crm_promotion360_action_update_v1(uuid,text,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.crm_promotion360_action_update_v1(uuid,text,text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.crm_promotion360_actions_v1(p_promotion_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE actor public.users%rowtype; out jsonb;
BEGIN
 SELECT * INTO actor FROM public.users WHERE id=(SELECT auth.uid());
 IF actor.id IS NULL OR actor.role NOT IN ('boss','manager')
 THEN RAISE EXCEPTION 'Нет доступа' USING errcode='42501'; END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object(
   'id',a.id,'promotion_id',a.promotion_id,'milestone',a.milestone,'status',a.status,
   'reason',a.reason,'action_plan',a.action_plan,'manager_comment',a.manager_comment,
   'due_at',a.due_at,'next_check_at',a.next_check_at,'created_at',a.created_at
 ) ORDER BY a.created_at DESC),'[]'::jsonb) INTO out
 FROM public.crm_promotion360_actions_v1 a
 JOIN public.promotions p ON p.id=a.promotion_id
 WHERE (p_promotion_id IS NULL OR a.promotion_id=p_promotion_id)
 AND (actor.role='boss' OR (a.manager_id=actor.id AND p.manager_name=actor.name));
 RETURN out;
END $$;
REVOKE ALL ON FUNCTION public.crm_promotion360_actions_v1(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.crm_promotion360_actions_v1(uuid) TO authenticated;
