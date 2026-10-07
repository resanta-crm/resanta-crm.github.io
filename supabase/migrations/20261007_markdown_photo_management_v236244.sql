-- RESANTA CRM v23.6.244
-- Markdown photos: uploader may delete/replace own photo; Payushin may manage any photo.
-- Required photo of a priced item may be removed only after a same-type replacement exists.

create or replace function public.markdown_delete_photo_v1(p_photo_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public','auth','pg_catalog'
as $function$
declare
  v_email text:=lower(coalesce(auth.jwt()->>'email',''));
  v_name text;
  v_path text;
  v_uploaded text;
  v_type text;
  v_item_id uuid;
  v_stage text;
  v_qty numeric;
  v_unit_no integer;
  v_same_type_left integer:=0;
begin
  select u.name into v_name
  from public.users u
  where lower(u.email)=v_email
  limit 1;

  if v_name is null then
    raise exception 'Нет доступа' using errcode='42501';
  end if;

  select p.storage_path,p.uploaded_by,p.photo_type,p.item_id,i.review_status,i.quantity,p.unit_no
  into v_path,v_uploaded,v_type,v_item_id,v_stage,v_qty,v_unit_no
  from public.markdown_photos p
  join public.markdown_items i on i.id=p.item_id
  where p.id=p_photo_id
  for update of p,i;

  if v_path is null then
    raise exception 'Фото не найдено';
  end if;

  if v_email<>'payushin_ar@resanta.ru'
     and lower(coalesce(v_uploaded,''))<>lower(v_name) then
    raise exception 'Удалить или заменить фото может автор или Александр Паюшин'
      using errcode='42501';
  end if;

  if v_stage='priced' and v_type in ('overall','defect','label') then
    select count(*) into v_same_type_left
    from public.markdown_photos p
    where p.item_id=v_item_id
      and p.id<>p_photo_id
      and p.unit_no=coalesce(v_unit_no,1)
      and p.photo_type=v_type;

    if v_same_type_left=0 then
      raise exception 'Это обязательное фото товара в продаже. Сначала нажмите «Заменить», чтобы загрузить новое фото этого типа.';
    end if;
  end if;

  delete from public.markdown_photos where id=p_photo_id;

  if v_stage='ready_for_pricing'
     and v_type in ('overall','defect','label')
     and not public.markdown_photos_complete_v2(v_item_id,v_qty) then
    update public.markdown_items
    set review_status='collecting',
        submitted_for_pricing_at=null,
        submitted_for_pricing_by=null,
        updated_at=now()
    where id=v_item_id;
  else
    update public.markdown_items set updated_at=now() where id=v_item_id;
  end if;

  return jsonb_build_object(
    'ok',true,
    'storage_path',v_path,
    'item_id',v_item_id,
    'photo_type',v_type,
    'unit_no',v_unit_no
  );
end;
$function$;

revoke all on function public.markdown_delete_photo_v1(uuid) from public,anon;
grant execute on function public.markdown_delete_photo_v1(uuid) to authenticated;

drop policy if exists "markdown photos payushin delete" on storage.objects;
drop policy if exists "markdown photos owner or payushin delete" on storage.objects;

create policy "markdown photos owner or payushin delete"
on storage.objects
for delete
to authenticated
using (
  bucket_id='markdown-photos'
  and (
    owner_id=(select auth.uid()::text)
    or lower(coalesce((select auth.jwt()->>'email'),''))='payushin_ar@resanta.ru'
  )
);
