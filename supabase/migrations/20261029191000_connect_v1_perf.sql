-- RESANTA CONNECT #126: advisory-driven performance followup.
-- Only touches CONNECT-owned indexes and one CONNECT INSERT policy.
create index if not exists connect_messages_sender_v1 on public.connect_messages_v1(sender_id);
create index if not exists connect_rooms_creator_v1 on public.connect_rooms_v1(created_by);
alter policy connect_messages_write_v1 on public.connect_messages_v1
with check (
  sender_id=(select auth.uid())
  and public.connect_is_member_v1(room_id)
  and (select public.connect_active_staff_v1(auth.uid()))
);
