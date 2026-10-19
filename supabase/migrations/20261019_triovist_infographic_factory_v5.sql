-- Triovist Infographic Factory 5.0
-- Isolated background factory. No writes to sales/price/stock/parser source tables.

create table if not exists public.triovist_infographic_group_dna_v5 (
  group_name text primary key,
  source_key text not null default '21vek+wb+ozon',
  status text not null default 'missing' check (status in ('missing','researching','ready','error')),
  source_summary jsonb not null default '{}'::jsonb,
  visual_dna jsonb not null default '{}'::jsonb,
  contact_sheet_path text,
  refreshed_at timestamptz,
  expires_at timestamptz,
  approved_for_bulk boolean not null default false,
  approved_by uuid references auth.users(id),
  approved_at timestamptz,
  reference_sku text,
  error_message text,
  lock_token text,
  locked_until timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.triovist_infographic_factory_batches_v5 (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id),
  owner_email text not null,
  groups text[] not null,
  marketplaces text[] not null default array['21vek','wb','ozon']::text[],
  mode text not null default 'auto' check (mode in ('auto','pilot','bulk')),
  qa_threshold integer not null default 90 check (qa_threshold between 80 and 100),
  min_slides integer not null default 5 check (min_slides between 4 and 9),
  max_slides integer not null default 9 check (max_slides between 5 and 10),
  max_regenerations integer not null default 2 check (max_regenerations between 0 and 4),
  requested_total_items integer not null default 0 check (requested_total_items between 0 and 500),
  selection_snapshot jsonb not null default '[]'::jsonb,
  total_items integer not null default 0 check (total_items between 0 and 500),
  completed_items integer not null default 0,
  attention_items integer not null default 0,
  failed_items integer not null default 0,
  remake_items integer not null default 0,
  status text not null default 'queued'
    check (status in ('queued','researching','pilot_review','processing','completed','completed_with_attention','cancelled','failed')),
  stage text,
  archive_manifest jsonb not null default '[]'::jsonb,
  error_summary text,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.triovist_infographic_factory_items_v5 (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.triovist_infographic_factory_batches_v5(id) on delete cascade,
  sku text not null,
  group_name text not null,
  manager_email text not null,
  product_name text not null,
  product_url text not null,
  is_reference boolean not null default false,
  status text not null default 'queued'
    check (status in ('queued','waiting_group_dna','planning','generating','qa','remaking','completed','attention','error','cancelled')),
  stage text,
  slide_count integer not null default 0 check (slide_count between 0 and 10),
  completed_slides integer not null default 0,
  remake_slides integer not null default 0,
  facts jsonb not null default '[]'::jsonb,
  storyboard jsonb not null default '[]'::jsonb,
  source_photo_url text,
  source_photo_path text,
  item_zip_path text,
  quality_score integer,
  retry_count integer not null default 0,
  next_attempt_at timestamptz,
  lock_token text,
  locked_until timestamptz,
  error_message text,
  started_at timestamptz,
  finished_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint triovist_infographic_factory_item_unique unique(batch_id,sku)
);

create table if not exists public.triovist_infographic_factory_slides_v5 (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.triovist_infographic_factory_items_v5(id) on delete cascade,
  slide_no integer not null check (slide_no between 1 and 10),
  role text not null,
  title text not null,
  subtitle text,
  fact_ids jsonb not null default '[]'::jsonb,
  art_brief text not null,
  layout_key text,
  status text not null default 'queued'
    check (status in ('queued','generating','qa','completed','attention','error')),
  attempt_count integer not null default 0 check (attempt_count between 0 and 6),
  scene_path text,
  final_path text,
  qa_score integer,
  qa_report jsonb not null default '{}'::jsonb,
  error_message text,
  updated_at timestamptz not null default now(),
  constraint triovist_infographic_factory_slide_unique unique(item_id,slide_no)
);

create index if not exists triovist_factory_batches_owner_idx
  on public.triovist_infographic_factory_batches_v5(owner_user_id,created_at desc);
create index if not exists triovist_factory_batches_status_idx
  on public.triovist_infographic_factory_batches_v5(status,created_at);
create index if not exists triovist_factory_items_queue_idx
  on public.triovist_infographic_factory_items_v5(status,next_attempt_at,batch_id,group_name,sku);
create index if not exists triovist_factory_items_batch_idx
  on public.triovist_infographic_factory_items_v5(batch_id,status,group_name,sku);
create index if not exists triovist_factory_slides_queue_idx
  on public.triovist_infographic_factory_slides_v5(item_id,status,slide_no);

alter table public.triovist_infographic_group_dna_v5 enable row level security;
alter table public.triovist_infographic_factory_batches_v5 enable row level security;
alter table public.triovist_infographic_factory_items_v5 enable row level security;
alter table public.triovist_infographic_factory_slides_v5 enable row level security;

revoke all on public.triovist_infographic_group_dna_v5 from anon,authenticated;
revoke all on public.triovist_infographic_factory_batches_v5 from anon,authenticated;
revoke all on public.triovist_infographic_factory_items_v5 from anon,authenticated;
revoke all on public.triovist_infographic_factory_slides_v5 from anon,authenticated;

create or replace function public.triovist_infographic_factory_catalog_v5(p_manager text default null)
returns jsonb language sql stable security invoker set search_path='public'
as $$
with latest as (
 select distinct on (c.sku)
   c.sku,c.subgroup,c.product_name,c.manager_email
 from public.triovist_content_cards c
 where c.sku is not null and c.sku <> ''
   and c.product_url like 'https://www.21vek.by/%'
   and (p_manager is null or lower(c.manager_email)=lower(p_manager))
 order by c.sku,c.created_at desc
), typed as (
 select sku,
   case when product_name ~* 'фекальн.{0,40}насос|насос.{0,40}фекальн'
        then 'Фекальные насосы'
        else coalesce(nullif(btrim(subgroup),''),'Без подгруппы') end as group_name
 from latest
), counts as (
 select group_name,count(*)::int sku_count from typed group by group_name
)
select coalesce(jsonb_agg(jsonb_build_object(
  'name',c.group_name,
  'sku_count',c.sku_count,
  'dna_status',coalesce(d.status,'missing'),
  'bulk_approved',coalesce(d.approved_for_bulk,false),
  'reference_sku',d.reference_sku,
  'dna_refreshed_at',d.refreshed_at
) order by c.group_name),'[]'::jsonb)
from counts c
left join public.triovist_infographic_group_dna_v5 d on d.group_name=c.group_name;
$$;

revoke all on function public.triovist_infographic_factory_catalog_v5(text) from public,anon,authenticated;
grant execute on function public.triovist_infographic_factory_catalog_v5(text) to service_role;

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values (
  'triovist-infographic-factory-v5',
  'triovist-infographic-factory-v5',
  false,
  52428800,
  array['image/png','image/jpeg','image/webp','application/zip','application/json']::text[]
)
on conflict (id) do update set
 public=false,
 file_size_limit=excluded.file_size_limit,
 allowed_mime_types=excluded.allowed_mime_types;

comment on table public.triovist_infographic_factory_batches_v5 is
'Factory 5.0 background jobs. Isolated from CRM business data; source tables are read-only.';
comment on table public.triovist_infographic_group_dna_v5 is
'Cached category-level visual DNA distilled from 21vek/WB/Ozon public visual research; never stores competitor claims as our SKU facts.';
