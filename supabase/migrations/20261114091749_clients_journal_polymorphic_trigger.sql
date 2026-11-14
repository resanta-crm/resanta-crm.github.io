-- Trigger is shared by records with different fields; use JSON for the optional address fields.
create or replace function crm_private.client_audit_v1() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_table_name='route_physical_points' and tg_op='UPDATE' then
  if to_jsonb(old)->>'city' is not distinct from to_jsonb(new)->>'city' and to_jsonb(old)->>'address' is not distinct from to_jsonb(new)->>'address' then return new;end if;
 end if;
 insert into public.crm_client360_audit_v1(table_name,operation,actor_id,old_row,new_row)
 values(tg_table_name,tg_op,auth.uid(),case when tg_op<>'INSERT' then to_jsonb(old) end,case when tg_op<>'DELETE' then to_jsonb(new) end);
 return coalesce(new,old);
end $$;
