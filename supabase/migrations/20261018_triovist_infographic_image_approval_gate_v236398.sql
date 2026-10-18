-- RESANTA CRM v23.6.398
-- Defense in depth: database itself refuses Image API reservation before concept approval.

create or replace function public.triovist_infographic_v2_reserve_image(p_pilot uuid,p_slide integer)
returns boolean
language plpgsql security definer set search_path=public as $$
declare n integer;
begin
  if p_slide<1 or p_slide>8 then return false; end if;

  perform 1
  from public.triovist_infographic_v2_pilots
  where id=p_pilot
    and status='processing'
    and generation_approved=true
    and strict_facts=true
  for update;
  if not found then return false; end if;

  update public.triovist_infographic_v2_slides
  set status='generating',updated_at=now()
  where pilot_id=p_pilot and slide_no=p_slide and status='queued';
  get diagnostics n = row_count;
  if n<>1 then return false; end if;

  update public.triovist_infographic_v2_pilots
  set paid_images_started=paid_images_started+1,
      updated_at=now(),
      stage='Генерация рекламных изображений'
  where id=p_pilot
    and status='processing'
    and generation_approved=true
    and strict_facts=true
    and paid_images_started<max_paid_images;
  get diagnostics n = row_count;

  if n<>1 then
    update public.triovist_infographic_v2_slides
    set status='queued'
    where pilot_id=p_pilot and slide_no=p_slide and status='generating';
    return false;
  end if;

  return true;
end $$;

revoke all on function public.triovist_infographic_v2_reserve_image(uuid,integer) from public,anon,authenticated;
grant execute on function public.triovist_infographic_v2_reserve_image(uuid,integer) to service_role;
