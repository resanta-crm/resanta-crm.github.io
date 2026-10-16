-- Atomic spend reservation: at most eight image requests in a V2 pilot, no blind retries.
CREATE OR REPLACE FUNCTION public.triovist_infographic_v2_reserve_image(p_pilot uuid,p_slide integer)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE n integer;
BEGIN
  IF p_slide<1 OR p_slide>8 THEN RETURN false;END IF;
  PERFORM 1 FROM public.triovist_infographic_v2_pilots
   WHERE id=p_pilot AND status='processing' FOR UPDATE;
  IF NOT FOUND THEN RETURN false;END IF;
  UPDATE public.triovist_infographic_v2_slides SET status='generating',updated_at=now()
    WHERE pilot_id=p_pilot AND slide_no=p_slide AND status='queued';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n<>1 THEN RETURN false;END IF;
  UPDATE public.triovist_infographic_v2_pilots SET paid_images_started=paid_images_started+1,
   updated_at=now(),stage='Генерация рекламных изображений'
   WHERE id=p_pilot AND status='processing' AND paid_images_started<max_paid_images;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n<>1 THEN
    UPDATE public.triovist_infographic_v2_slides SET status='queued'
      WHERE pilot_id=p_pilot AND slide_no=p_slide AND status='generating';
    RETURN false;
  END IF;
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.triovist_infographic_v2_reserve_image(uuid,integer) FROM public,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.triovist_infographic_v2_reserve_image(uuid,integer) TO service_role;
CREATE OR REPLACE FUNCTION public.triovist_infographic_v2_no_reactivation()
RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF OLD.status='cancelled' THEN
   NEW.status:='cancelled';
   NEW.finished_at:=COALESCE(OLD.finished_at,NEW.finished_at,now());
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_triovist_infographic_v2_no_reactivation ON public.triovist_infographic_v2_pilots;
CREATE TRIGGER trg_triovist_infographic_v2_no_reactivation
 BEFORE UPDATE ON public.triovist_infographic_v2_pilots FOR EACH ROW
 EXECUTE FUNCTION public.triovist_infographic_v2_no_reactivation();