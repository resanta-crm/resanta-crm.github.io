-- Preserve role semantics; qualify dependencies so task guards with an empty search_path can evaluate RLS.
create or replace function public.is_boss() returns boolean language sql stable set search_path='' as $$ select coalesce((select role from public.users where email=public.current_user_email() limit 1)='boss',false) $$;
