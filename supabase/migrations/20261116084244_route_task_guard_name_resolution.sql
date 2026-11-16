create or replace function public.current_user_name() returns text language sql stable set search_path='' as $$ select name from public.users where email=public.current_user_email() limit 1 $$;
