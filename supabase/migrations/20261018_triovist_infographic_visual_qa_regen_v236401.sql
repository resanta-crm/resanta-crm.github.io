-- RESANTA CRM v23.6.401
-- Independent visual QA may request targeted regeneration of a weak slide.
-- Base generation remains capped at 8; each extra paid image requires explicit director confirmation in the Edge Function.

alter table public.triovist_infographic_v2_pilots
  drop constraint if exists triovist_infographic_v2_pilots_max_paid_images_check;
alter table public.triovist_infographic_v2_pilots
  add constraint triovist_infographic_v2_pilots_max_paid_images_check
  check (max_paid_images between 1 and 16);

alter table public.triovist_infographic_v2_pilots
  drop constraint if exists triovist_infographic_v2_pilots_paid_images_started_check;
alter table public.triovist_infographic_v2_pilots
  add constraint triovist_infographic_v2_pilots_paid_images_started_check
  check (paid_images_started between 0 and 16);

comment on column public.triovist_infographic_v2_pilots.max_paid_images is
'Starts at 8. May increase one-by-one only after explicit director confirmation for targeted visual-QA regeneration; hard cap 16.';
