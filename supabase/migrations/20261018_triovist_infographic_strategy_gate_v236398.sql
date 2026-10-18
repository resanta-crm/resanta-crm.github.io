-- RESANTA CRM v23.6.398
-- Professional 21vek infographic strategy gate.
-- Text/market analysis and concept review are completed before any paid image generation.

alter table public.triovist_infographic_v2_pilots
  add column if not exists strict_facts boolean not null default true,
  add column if not exists generation_approved boolean not null default false,
  add column if not exists strategy_pack jsonb not null default '{}'::jsonb,
  add column if not exists selected_concept text,
  add column if not exists quality_report jsonb not null default '{}'::jsonb,
  add column if not exists director_note text,
  add column if not exists concept_reviewed_at timestamptz,
  add column if not exists generation_approved_at timestamptz,
  add column if not exists planning_version text not null default '2.3-strategy';

update public.triovist_infographic_v2_pilots
set generation_approved=true,
    planning_version=coalesce(nullif(planning_version,''),'2.1-legacy')
where status in ('queued','processing')
  and coalesce(strategy_pack,'{}'::jsonb)='{}'::jsonb;

alter table public.triovist_infographic_v2_pilots
  drop constraint if exists triovist_infographic_v2_pilots_status_check;
alter table public.triovist_infographic_v2_pilots
  add constraint triovist_infographic_v2_pilots_status_check
  check (status in ('queued','processing','concept_review','needs_review','approved','cancelled','failed'));

alter table public.triovist_infographic_v2_pilots
  drop constraint if exists triovist_infographic_v2_strict_facts_check;
alter table public.triovist_infographic_v2_pilots
  add constraint triovist_infographic_v2_strict_facts_check check (strict_facts=true);

drop index if exists public.triovist_infographic_v2_active_sku_idx;
create unique index triovist_infographic_v2_active_sku_idx
on public.triovist_infographic_v2_pilots(owner_user_id,sku)
where status in ('queued','processing','concept_review');

comment on column public.triovist_infographic_v2_pilots.strategy_pack is
'2.3 analysis/audience/market strategy plus three fact-bound concepts generated before paid images.';
comment on column public.triovist_infographic_v2_pilots.quality_report is
'Automatic factual/editorial QA; visual director review remains mandatory.';
comment on column public.triovist_infographic_v2_pilots.generation_approved is
'Hard gate: false means no Image API reservation is permitted.';
