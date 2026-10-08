-- Allow only CRM boss users to maintain physical-point client links during duplicate merges.
drop policy if exists route_physical_point_clients_write_boss on public.route_physical_point_clients;
create policy route_physical_point_clients_write_boss
on public.route_physical_point_clients
for all
to authenticated
using (
  exists (
    select 1 from public.users u
    where u.id=auth.uid() and u.role='boss'
  )
)
with check (
  exists (
    select 1 from public.users u
    where u.id=auth.uid() and u.role='boss'
  )
);
