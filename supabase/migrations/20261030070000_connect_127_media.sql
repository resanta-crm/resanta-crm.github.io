-- RESANTA CONNECT 360 / media and voice stage.
-- Additive only: private Storage bucket plus chat-owned attachment metadata.
-- No changes to CRM customers, GPS, 21vek, Lera, or existing chat messages.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values (
 'crm-connect-media-v1', 'crm-connect-media-v1', false, 10485760,
 array[
  'image/jpeg','image/png','image/webp',
  'application/pdf','text/plain',
  'application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'audio/webm','audio/mp4','audio/mpeg','audio/ogg'
 ]::text[]
)
on conflict (id) do nothing;

create table if not exists public.connect_attachments_v1 (
 id uuid primary key default gen_random_uuid(),
 message_id uuid not null unique references public.connect_messages_v1(id) on delete cascade,
 room_id uuid not null references public.connect_rooms_v1(id) on delete cascade,
 sender_id uuid not null references auth.users(id),
 file_path text not null unique,
 file_name text not null check(char_length(file_name) between 1 and 180),
 mime_type text not null check(char_length(mime_type) between 3 and 150),
 size_bytes bigint not null check(size_bytes between 1 and 10485760),
 kind text not null check(kind in ('image','file','voice')),
 created_at timestamptz not null default now(),
 constraint connect_attachment_path_v1 check (
   file_path like room_id::text || '/' || sender_id::text || '/%'
   and length(file_path) between 75 and 220
 )
);
create index if not exists connect_attachments_room_v1
 on public.connect_attachments_v1(room_id,created_at desc);

alter table public.connect_attachments_v1 enable row level security;
revoke all on public.connect_attachments_v1 from anon,authenticated;
grant select,insert on public.connect_attachments_v1 to authenticated;

create policy connect_attachment_read_v1 on public.connect_attachments_v1
 for select to authenticated using (public.connect_is_member_v1(room_id));

create policy connect_attachment_insert_v1 on public.connect_attachments_v1
 for insert to authenticated with check (
 sender_id=(select auth.uid())
 and public.connect_is_member_v1(room_id)
 and exists (
   select 1 from public.connect_messages_v1 m
   where m.id=message_id and m.room_id=room_id and m.sender_id=(select auth.uid())
 )
 and exists (
   select 1 from storage.objects so
   where so.bucket_id='crm-connect-media-v1' and so.name=file_path
 )
);

-- Storage path format: room_uuid/sender_uuid/file_uuid.extension
-- Existing room members can view the file. Only the authenticated sender uploads
-- to their own folder in a room they belong to. No PUBLIC bucket or upsert.
create policy connect_media_read_v1 on storage.objects
 for select to authenticated
 using (
  bucket_id='crm-connect-media-v1'
  and (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
  and public.connect_is_member_v1(((storage.foldername(name))[1])::uuid)
 );

create policy connect_media_upload_v1 on storage.objects
 for insert to authenticated
 with check (
  bucket_id='crm-connect-media-v1'
  and (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
  and (storage.foldername(name))[2]=(select auth.uid())::text
  and (storage.filename(name)) ~ '^[0-9a-f-]{36}\.(jpg|png|webp|pdf|txt|doc|docx|xls|xlsx|webm|mp4|mp3|ogg)$'
  and public.connect_is_member_v1(((storage.foldername(name))[1])::uuid)
 );

-- Only the original uploader can remove an orphaned upload after an error.
create policy connect_media_owner_delete_v1 on storage.objects
 for delete to authenticated using (
  bucket_id='crm-connect-media-v1'
  and (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
  and (storage.foldername(name))[2]=(select auth.uid())::text
  and public.connect_is_member_v1(((storage.foldername(name))[1])::uuid)
 );

-- No update/upsert policy. Files are immutable once uploaded.
