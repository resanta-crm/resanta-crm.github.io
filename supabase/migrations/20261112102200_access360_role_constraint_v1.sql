-- Access 360: extend rather than replace existing allowed staff roles
alter table public.users drop constraint if exists users_role_check;
alter table public.users add constraint users_role_check check (
 role in ('manager','boss','office_manager','service_manager','payment_executor',
          'auditor','auditor_pending','executive_viewer','pending','disabled')
);
