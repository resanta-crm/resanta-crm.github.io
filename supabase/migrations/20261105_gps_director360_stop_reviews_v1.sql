-- Separate append-only director review log for physical stops. Raw GPS, visits and plans unchanged.
CREATE TABLE IF NOT EXISTS public.gps_director360_stop_reviews_v1 (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 workday_id uuid NOT NULL REFERENCES public.gps_workdays(id),
 stop_seq integer NOT NULL CHECK(stop_seq>=1),
 action text NOT NULL CHECK(action IN (
   'investigate','technical_verified','work_related','home_related','no_issue'
 )),
 comment text NOT NULL CHECK(length(trim(comment)) BETWEEN 8 AND 1500),
 due_date date,
 actor_id uuid NOT NULL,
 actor_email text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS gps_dir360_stop_review_latest_v1
 ON public.gps_director360_stop_reviews_v1(workday_id,stop_seq,created_at DESC,id DESC);
ALTER TABLE public.gps_director360_stop_reviews_v1 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.gps_director360_stop_reviews_v1 FROM PUBLIC,anon,authenticated;
-- No direct Data API table grants/policies. Reviewed solely via auth-guarded RPC.

CREATE OR REPLACE FUNCTION public.gps_director360_stop_decide_v20261105(
 p_workday_id uuid,p_stop_seq integer,p_action text,p_comment text,
 p_due_date date DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO 'public','auth','pg_catalog'
AS $function$
DECLARE
 v_workday public.gps_workdays%rowtype;
 v_stop jsonb;
 v_comment text:=trim(coalesce(p_comment,''));
 v_id uuid;
 v_email text;
BEGIN
 IF auth.uid() IS NULL OR NOT public.gps_has_control_access() THEN
   RAISE EXCEPTION 'Решения GPS доступны только руководителю' USING ERRCODE='42501';
 END IF;
 IF p_workday_id IS NULL OR p_stop_seq IS NULL OR p_stop_seq<1
  OR p_action NOT IN ('investigate','technical_verified','work_related','home_related','no_issue')
  OR length(v_comment) NOT BETWEEN 8 AND 1500
  OR (p_due_date IS NOT NULL AND (p_due_date<current_date OR p_due_date>current_date+interval '90 days'))
 THEN RAISE EXCEPTION 'Нужно указать тип решения, комментарий и корректный срок'
    USING ERRCODE='22023';
 END IF;
 SELECT * INTO v_workday FROM public.gps_workdays WHERE id=p_workday_id;
 IF NOT FOUND OR v_workday.work_date<current_date-interval '365 days' THEN
  RAISE EXCEPTION 'GPS-день для решения не найден или устарел'
   USING ERRCODE='22023';
 END IF;
 SELECT x INTO v_stop FROM jsonb_array_elements(
   public.gps_classify_workday_stops_v236421(p_workday_id)
 ) x WHERE coalesce(nullif(x->>'seq','')::integer,0)=p_stop_seq LIMIT 1;
 IF v_stop IS NULL OR v_stop->>'classification'<>'technical' THEN
  RAISE EXCEPTION 'Эта остановка сопоставлена с ТТ/домом или не существует: нельзя менять её классификацию'
   USING ERRCODE='22023';
 END IF;
 SELECT lower(email) INTO v_email FROM auth.users WHERE id=auth.uid();
 INSERT INTO public.gps_director360_stop_reviews_v1(
   workday_id,stop_seq,action,comment,due_date,actor_id,actor_email
 ) VALUES (
   p_workday_id,p_stop_seq,p_action,v_comment,p_due_date,auth.uid(),coalesce(v_email,'')
 ) RETURNING id INTO v_id;
 RETURN jsonb_build_object(
  'ok',true,'id',v_id,'action',p_action,
  'review','Принято решение руководителя. GPS-треки, визиты и маршруты не менялись.'
 );
END;
$function$;
REVOKE ALL ON FUNCTION public.gps_director360_stop_decide_v20261105(uuid,integer,text,text,date) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.gps_director360_stop_decide_v20261105(uuid,integer,text,text,date) TO authenticated,service_role;
