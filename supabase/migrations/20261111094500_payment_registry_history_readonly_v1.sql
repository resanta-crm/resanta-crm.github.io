-- Payment registry 360: read-only verified full timeline for already authorized users.
-- Uses the existing payment_registry_can_view server authorization, no new roles.
create or replace function public.payment_registry_history_v1(p_id uuid)
returns jsonb
language plpgsql stable security definer
set search_path = 'public','auth','pg_catalog','pg_temp'
as $body$
declare
 v_payment public.payment_registry%rowtype;
 v_events jsonb;
 v_files jsonb;
begin
 if auth.uid() is null or not public.payment_registry_can_view() then
  raise exception 'Нет доступа к истории платежей' using errcode='42501';
 end if;
 if p_id is null then
  raise exception 'Не указан платёж' using errcode='22023';
 end if;
 select p.* into v_payment from public.payment_registry p where p.id=p_id;
 if not found then
  raise exception 'Платёж не найден' using errcode='P0002';
 end if;
 select coalesce(jsonb_agg(jsonb_build_object(
    'id',a.id,
    'action',a.action,
    'actor_email',a.actor_email,
    'old_status',a.old_status,
    'new_status',a.new_status,
    'comment',a.comment,
    'created_at',a.created_at
  ) order by a.created_at,a.id),'[]'::jsonb)
 into v_events from public.payment_registry_payment_audit a where a.payment_id=p_id;

 select coalesce(jsonb_agg(jsonb_build_object(
    'id',f.id,
    'original_name',f.original_name,
    'storage_path',f.storage_path,
    'created_at',f.created_at,
    'uploaded_by_email',f.uploaded_by_email
  ) order by f.created_at,f.id),'[]'::jsonb)
 into v_files from public.payment_registry_files f where f.payment_id=p_id;

 return jsonb_build_object(
  'payment',to_jsonb(v_payment),
  'events',v_events,
  'files',v_files
 );
end;
$body$;

revoke all on function public.payment_registry_history_v1(uuid) from public, anon;
grant execute on function public.payment_registry_history_v1(uuid) to authenticated, service_role;
