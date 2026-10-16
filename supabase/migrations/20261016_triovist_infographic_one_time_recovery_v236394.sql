-- User-confirmed recovery exclusively for one paid image lost to former PNG MIME block.
ALTER TABLE public.triovist_infographic_v2_pilots ADD COLUMN IF NOT EXISTS recovery_approved boolean NOT NULL DEFAULT false;
ALTER TABLE public.triovist_infographic_v2_pilots ADD COLUMN IF NOT EXISTS recovery_reason text;
ALTER TABLE public.triovist_infographic_v2_pilots DROP CONSTRAINT IF EXISTS triovist_infographic_v2_pilots_max_paid_images_check;
ALTER TABLE public.triovist_infographic_v2_pilots DROP CONSTRAINT IF EXISTS triovist_infographic_v2_pilots_paid_images_started_check;
ALTER TABLE public.triovist_infographic_v2_pilots
 ADD CONSTRAINT triovist_infographic_v2_pilots_max_paid_images_check
 CHECK(max_paid_images BETWEEN 1 AND 8 OR(max_paid_images=9 AND recovery_approved=true AND recovery_reason='storage_png_mime_repair'));
ALTER TABLE public.triovist_infographic_v2_pilots
 ADD CONSTRAINT triovist_infographic_v2_pilots_paid_images_started_check CHECK(paid_images_started BETWEEN 0 AND 9);
CREATE OR REPLACE FUNCTION public.triovist_infographic_v2_recover_png_upload(p_pilot_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v public.triovist_infographic_v2_pilots%ROWTYPE;
DECLARE broken integer;
BEGIN
 SELECT * INTO v FROM public.triovist_infographic_v2_pilots WHERE id=p_pilot_id FOR UPDATE;
 IF NOT FOUND OR v.status<>'failed' OR v.max_paid_images<>8 OR v.paid_images_started<>1
 OR v.recovery_approved OR v.completed_slides<>0
 OR COALESCE(v.error_message,'') NOT LIKE '%mime type image/png is not supported%' THEN RETURN false; END IF;
 SELECT count(*) INTO broken FROM public.triovist_infographic_v2_slides
 WHERE pilot_id=p_pilot_id AND slide_no=1 AND status='failed'
 AND COALESCE(error_message,'') LIKE '%mime type image/png is not supported%';
 IF broken<>1 THEN RETURN false; END IF;
 UPDATE public.triovist_infographic_v2_slides SET status='queued',error_message=NULL,updated_at=now()
 WHERE pilot_id=p_pilot_id AND slide_no=1 AND status='failed';
 UPDATE public.triovist_infographic_v2_pilots
 SET recovery_approved=true,recovery_reason='storage_png_mime_repair',max_paid_images=9,
 status='queued',stage='Повтор после исправления PNG (с согласия директора)',
 error_message=NULL,finished_at=NULL,updated_at=now() WHERE id=p_pilot_id AND status='failed';
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.triovist_infographic_v2_recover_png_upload(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.triovist_infographic_v2_recover_png_upload(uuid) TO service_role;
