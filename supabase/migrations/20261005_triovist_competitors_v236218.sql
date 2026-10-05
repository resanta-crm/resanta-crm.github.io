-- RESANTA CRM v23.6.218 · Triovist / 21vek competitor pilot
-- Safe separate contour: no writes to sales/tasks/stock/current 21vek production tables.
create table if not exists public.triovist_mrc_current (
 sku text primary key, product_name text not null, mrc_byn numeric(14,2) not null check(mrc_byn>=0),
 effective_date date not null, source_file text, imported_at timestamptz not null default now()
);
create table if not exists public.triovist_mrc_history (
 id bigint generated always as identity primary key, sku text not null, product_name text not null,
 mrc_byn numeric(14,2) not null check(mrc_byn>=0), effective_date date not null, source_file text,
 imported_at timestamptz not null default now(), unique(sku,effective_date,source_file)
);
create table if not exists public.triovist_competitor_targets (
 id uuid primary key default gen_random_uuid(), source_row integer, subgroup text not null, competitor_brand text not null,
 product_query text not null, external_code text, product_url text, collect_enabled boolean not null default false,
 source_file text, match_notes text, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(subgroup,competitor_brand,product_query)
);
create table if not exists public.triovist_competitor_runs (
 id uuid primary key default gen_random_uuid(), parser_version text not null, status text not null default 'running',
 target_count integer not null default 0, success_count integer not null default 0, error_count integer not null default 0,
 started_at timestamptz not null default now(), finished_at timestamptz, notes jsonb not null default '{}'::jsonb
);
create table if not exists public.triovist_competitor_snapshots (
 id bigint generated always as identity primary key, run_id uuid references public.triovist_competitor_runs(id) on delete cascade,
 target_id uuid not null references public.triovist_competitor_targets(id) on delete cascade, observed_at timestamptz not null default now(),
 external_code text, product_url text, product_name text, current_price numeric(14,2), base_price numeric(14,2), in_stock boolean,
 product_rating numeric, review_count integer, specs_raw jsonb not null default '[]'::jsonb,
 specs_normalized jsonb not null default '{}'::jsonb, parser_payload jsonb not null default '{}'::jsonb, error_text text
);
create table if not exists public.triovist_competitor_current (
 target_id uuid primary key references public.triovist_competitor_targets(id) on delete cascade,
 run_id uuid references public.triovist_competitor_runs(id) on delete set null, observed_at timestamptz not null,
 external_code text, product_url text, product_name text, current_price numeric(14,2), base_price numeric(14,2),
 in_stock boolean, product_rating numeric, review_count integer, specs_raw jsonb not null default '[]'::jsonb,
 specs_normalized jsonb not null default '{}'::jsonb, parser_payload jsonb not null default '{}'::jsonb,
 error_text text, updated_at timestamptz not null default now()
);
create table if not exists public.triovist_competitor_analysis_current (
 target_id uuid not null references public.triovist_competitor_targets(id) on delete cascade, our_sku text not null,
 our_product_name text, our_product_url text, our_price numeric(14,2), mrc_byn numeric(14,2),
 mrc_delta_byn numeric(14,2), mrc_delta_pct numeric(10,2), competitor_price numeric(14,2),
 price_delta_byn numeric(14,2), price_delta_pct numeric(10,2), similarity_score numeric(6,2),
 competitiveness_score numeric(6,2), status text, mrc_status text, our_specs jsonb not null default '{}'::jsonb,
 competitor_specs jsonb not null default '{}'::jsonb, advantages jsonb not null default '[]'::jsonb,
 disadvantages jsonb not null default '[]'::jsonb, recommendation text, sales_pitch jsonb not null default '[]'::jsonb,
 computed_at timestamptz not null default now(), primary key(target_id,our_sku)
);
create table if not exists public.triovist_competitor_rules (
 subgroup text not null, spec_key text not null, weight numeric(8,4) not null check(weight>=0),
 direction text not null check(direction in ('higher','lower','categorical','neutral')), unit text,
 aliases jsonb not null default '[]'::jsonb, critical boolean not null default false,
 updated_at timestamptz not null default now(), primary key(subgroup,spec_key)
);
alter table public.triovist_mrc_current enable row level security;
alter table public.triovist_mrc_history enable row level security;
alter table public.triovist_competitor_targets enable row level security;
alter table public.triovist_competitor_runs enable row level security;
alter table public.triovist_competitor_snapshots enable row level security;
alter table public.triovist_competitor_current enable row level security;
alter table public.triovist_competitor_analysis_current enable row level security;
alter table public.triovist_competitor_rules enable row level security;
do $$ begin create policy triovist_mrc_current_read on public.triovist_mrc_current for select to authenticated using(true); exception when duplicate_object then null; end $$;
do $$ begin create policy triovist_mrc_history_read on public.triovist_mrc_history for select to authenticated using(true); exception when duplicate_object then null; end $$;
do $$ begin create policy triovist_competitor_targets_read on public.triovist_competitor_targets for select to authenticated using(true); exception when duplicate_object then null; end $$;
do $$ begin create policy triovist_competitor_runs_read on public.triovist_competitor_runs for select to authenticated using(true); exception when duplicate_object then null; end $$;
do $$ begin create policy triovist_competitor_snapshots_read on public.triovist_competitor_snapshots for select to authenticated using(true); exception when duplicate_object then null; end $$;
do $$ begin create policy triovist_competitor_current_read on public.triovist_competitor_current for select to authenticated using(true); exception when duplicate_object then null; end $$;
do $$ begin create policy triovist_competitor_analysis_read on public.triovist_competitor_analysis_current for select to authenticated using(true); exception when duplicate_object then null; end $$;
do $$ begin create policy triovist_competitor_rules_read on public.triovist_competitor_rules for select to authenticated using(true); exception when duplicate_object then null; end $$;
grant select on public.triovist_mrc_current,public.triovist_mrc_history,public.triovist_competitor_targets,public.triovist_competitor_runs,public.triovist_competitor_snapshots,public.triovist_competitor_current,public.triovist_competitor_analysis_current,public.triovist_competitor_rules to authenticated;

insert into public.triovist_mrc_current(sku,product_name,mrc_byn,effective_date,source_file) values
('72/14/11','АКЦИЯ! Дрель-шуруповерт аккумуляторная ДА-12-1 (2,0 А/ч) Вихрь,',71,date '2026-10-01','РБ МРЦ 06.10.2026.xlsx'),
('72/14/26','АКЦИЯ! Дрель-шуруповерт аккумуляторная ДА-12Л-2КА Вихрь,',92,date '2026-10-01','РБ МРЦ 06.10.2026.xlsx'),
('72/14/20','АКЦИЯ! Дрель-шуруповерт аккумуляторная ДА-14Л-2KА Вихрь,',126,date '2026-10-01','РБ МРЦ 06.10.2026.xlsx'),
('72/14/49','АКЦИЯ! Дрель-шуруповерт аккумуляторная ДА-16Л-2КА с набором оснастки 65 предметов Вихрь,',143,date '2026-10-01','РБ МРЦ 06.10.2026.xlsx'),
('72/14/25','АКЦИЯ! Дрель-шуруповерт аккумуляторная ДА-18Л-2КА ЕА+ Вихрь,',145,date '2026-10-01','РБ МРЦ 06.10.2026.xlsx'),
('72/14/14','Дрель-шуруповерт аккумуляторная ДА-12Л-2 (2,0 А/ч) Вихрь,',87,date '2026-10-01','РБ МРЦ 06.10.2026.xlsx'),
('72/14/7','Дрель-шуруповерт аккумуляторная ДА-12Л-2К (2,0 А/ч) Вихрь,',114,date '2026-10-01','РБ МРЦ 06.10.2026.xlsx'),
('72/14/78','Дрель-шуруповерт аккумуляторная ДА-12Л-2К/Б (бесщеточный двигатель) Вихрь,',158,date '2026-10-01','РБ МРЦ 06.10.2026.xlsx'),
('72/14/33','Дрель-шуруповерт аккумуляторная ДА-12Л-2КC (2,0 А/ч) (съёмный патрон) Вихрь,',138,date '2026-10-01','РБ МРЦ 06.10.2026.xlsx'),
('72/14/35','Дрель-шуруповерт аккумуляторная ДА-12Л-2КН с набором инструментов Вихрь,',183,date '2026-10-01','РБ МРЦ 06.10.2026.xlsx'),
('72/14/15','Дрель-шуруповерт аккумуляторная ДА-14,4Л-2 (2,0 А/ч) Вихрь,',102,date '2026-10-01','РБ МРЦ 06.10.2026.xlsx'),
('72/14/8','Дрель-шуруповерт аккумуляторная ДА-14,4Л-2К (2,0 А/ч) Вихрь,',159,date '2026-10-01','РБ МРЦ 06.10.2026.xlsx'),
('72/14/32','Дрель-шуруповерт аккумуляторная ДА-16Л-2К (2,0 А/ч) Вихрь,',161,date '2026-10-01','РБ МРЦ 06.10.2026.xlsx'),
('72/14/16','Дрель-шуруповерт аккумуляторная ДА-18Л-2 (2,0 А/ч) ЕА+ Вихрь,',109,date '2026-10-01','РБ МРЦ 06.10.2026.xlsx'),
('72/14/9','Дрель-шуруповерт аккумуляторная ДА-18Л-2К (2,0 А/ч) ЕА+ Вихрь,',177,date '2026-10-01','РБ МРЦ 06.10.2026.xlsx'),
('72/14/22','Дрель-шуруповерт аккумуляторная ДА-18Л-2К/Б (2,0 А/ч) (бесщеточный двигатель) ЕА+ Вихрь,',216,date '2026-10-01','РБ МРЦ 06.10.2026.xlsx'),
('72/14/34','Дрель-шуруповерт аккумуляторная ДА-18Л-2КC (2,0 А/ч) (съёмный патрон) ЕА+ Вихрь,',196,date '2026-10-01','РБ МРЦ 06.10.2026.xlsx'),
('72/14/23','Дрель-шуруповерт аккумуляторная ДА-18Л-2КУ/Б (2,0 А/ч) (бесщеточный двигатель, ударный) ЕА+ Вихрь,',274,date '2026-10-01','РБ МРЦ 06.10.2026.xlsx'),
('72/14/21','Дрель-шуруповерт аккумуляторная ДА-20Л-2К (2,0 А/ч) ЕА+ Вихрь,',192,date '2026-10-01','РБ МРЦ 06.10.2026.xlsx'),
('72/14/67','Дрель-шуруповерт аккумуляторная ДА-20Л-2К/БП (2,0 А/ч) (бесщеточный двигатель, 70Нм) ЕА+ Вихрь,',365,date '2026-10-01','РБ МРЦ 06.10.2026.xlsx'),
('72/14/79','Дрель-шуруповерт аккумуляторная ДА-20Л-2К/ЛБ (для ледобура, бесщеточный двигатель) Вихрь,',387,date '2026-10-01','РБ МРЦ 06.10.2026.xlsx'),
('72/14/36','Дрель-шуруповерт аккумуляторная ДА-20Л-2КА с набором оснастки 65 предм., ЕА+ Вихрь,',196,date '2026-10-01','РБ МРЦ 06.10.2026.xlsx'),
('72/14/18','Дрель-шуруповерт аккумуляторная ДА-24Л-2к (2,0 А/ч) Вихрь,',242,date '2026-10-01','РБ МРЦ 06.10.2026.xlsx'),
('72/14/24','Дрель-шуруповерт аккумуляторная ДА-24Л-2К/Б (2,0 А/ч) (бесщеточный двигатель) Вихрь,',331,date '2026-10-01','РБ МРЦ 06.10.2026.xlsx'),
('72/14/17','Дрель-шуруповерт аккумуляторная ударная ДА-18Л-2кУ (2,0 А/ч) (ударный) ЕА+ Вихрь,',199,date '2026-10-01','РБ МРЦ 06.10.2026.xlsx'),
('72/14/19','Дрель-шуруповерт аккумуляторная ударная ДА-24Л-2кУ (2,0 А/ч) (ударный) Вихрь,',270,date '2026-10-01','РБ МРЦ 06.10.2026.xlsx'),
('75/14/1','Дрель-шуруповерт аккумуляторная ДА-12-2Л Ресанта,',120,date '2026-10-01','РБ МРЦ 06.10.2026.xlsx'),
('75/14/2','Дрель-шуруповерт аккумуляторная ДА-12-2ЛК Ресанта,',166,date '2026-10-01','РБ МРЦ 06.10.2026.xlsx'),
('75/14/24','Дрель-шуруповерт аккумуляторная ДА-12-2ЛК-Б (бесщеточный двигатель) Ресанта,',212,date '2026-10-01','РБ МРЦ 06.10.2026.xlsx'),
('75/14/3','Дрель-шуруповерт аккумуляторная ДА-14-2Л Ресанта,',145,date '2026-10-01','РБ МРЦ 06.10.2026.xlsx'),
('75/14/4','Дрель-шуруповерт аккумуляторная ДА-14-2ЛК Ресанта,',214,date '2026-10-01','РБ МРЦ 06.10.2026.xlsx'),
('75/14/5','Дрель-шуруповерт аккумуляторная ДА-18-2ЛК ЕА+ Ресанта,',230,date '2026-10-01','РБ МРЦ 06.10.2026.xlsx'),
('75/14/6','Дрель-шуруповерт аккумуляторная ДА-18-2ЛК-У ЕА+ Ресанта,',297,date '2026-10-01','РБ МРЦ 06.10.2026.xlsx'),
('75/14/11','Дрель-шуруповерт аккумуляторная ДА-20-2ЛК ЕА+ Ресанта,',256,date '2026-10-01','РБ МРЦ 06.10.2026.xlsx'),
('75/14/10','Дрель-шуруповерт аккумуляторная ДА-20-2ЛК-Б (бесщеточный двигатель) ЕА+ Ресанта,',323,date '2026-10-01','РБ МРЦ 06.10.2026.xlsx'),
('75/14/15','Дрель-шуруповерт аккумуляторная ДА-20-2ЛК-БП (2,0 А/ч) (бесщеточный двигатель, 70Нм) ЕА+ Ресанта,',418,date '2026-10-01','РБ МРЦ 06.10.2026.xlsx'),
('75/14/7','Дрель-шуруповерт аккумуляторная ДА-24-2ЛК Ресанта,',299,date '2026-10-01','РБ МРЦ 06.10.2026.xlsx'),
('75/14/8','Дрель-шуруповерт аккумуляторная ДА-24-2ЛК-У (ударный) Ресанта,',338,date '2026-10-01','РБ МРЦ 06.10.2026.xlsx'),
('75/14/9','Дрель-шуруповерт аккумуляторная ДА-50Л2-18А Ресанта,',230,date '2026-10-01','РБ МРЦ 06.10.2026.xlsx')
on conflict(sku) do update set product_name=excluded.product_name,mrc_byn=excluded.mrc_byn,effective_date=excluded.effective_date,source_file=excluded.source_file,imported_at=now();
insert into public.triovist_mrc_history(sku,product_name,mrc_byn,effective_date,source_file)
select sku,product_name,mrc_byn,effective_date,source_file from public.triovist_mrc_current
where source_file='РБ МРЦ 06.10.2026.xlsx' on conflict(sku,effective_date,source_file) do nothing;
insert into public.triovist_competitor_targets(source_row,subgroup,competitor_brand,product_query,external_code,collect_enabled,source_file) values
(2,'Масляные радиаторы','Engy','Масляный радиатор Engy EN-2609 Cube',null,false,'конкуренты.xlsx'),
(2,'Масляные радиаторы','Ballu','Масляный радиатор Ballu BOH/CM-11WDN',null,false,'конкуренты.xlsx'),
(3,'Конвекторы','Sundays','Конвектор Sundays Home JR-15',null,false,'конкуренты.xlsx'),
(3,'Конвекторы','Ballu','Конвектор Ballu Enzo BEC/EZMR-1000',null,false,'конкуренты.xlsx'),
(4,'Тепловые пушки','Denzel','Тепловая пушка электрическая Denzel DHC 3-150',null,false,'конкуренты.xlsx'),
(4,'Тепловые пушки','Ballu','Тепловая пушка электрическая Ballu BKR-3',null,false,'конкуренты.xlsx'),
(5,'Тепловентиляторы','Engy','Тепловентилятор Engy EN-509',null,false,'конкуренты.xlsx'),
(5,'Тепловентиляторы','Sundays','Тепловентилятор Sundays Home TBD0604356401A',null,false,'конкуренты.xlsx'),
(6,'перфораторы','Wortex','Перфоратор Wortex RH 2829',null,false,'конкуренты.xlsx'),
(6,'перфораторы','Katana','Перфоратор Katana HD6100F',null,false,'конкуренты.xlsx'),
(7,'Дрели-шуруповерты аккумуляторные','Wortex','Аккумуляторная дрель-шуруповерт Wortex BD 2025 DLi ALL1','1329837',true,'конкуренты.xlsx'),
(7,'Дрели-шуруповерты аккумуляторные','Интерскол','Аккумуляторная дрель-шуруповерт Интерскол ДА-10/18В','709.2.2.70',true,'конкуренты.xlsx'),
(8,'Лобзики электрические','Katana','Электролобзик Katana LZ5500',null,false,'конкуренты.xlsx'),
(8,'Лобзики электрические','Wortex','Электролобзик Wortex LX JS 6507 E / 1334588',null,false,'конкуренты.xlsx'),
(9,'Дисковые пилы','Wortex','Дисковая пила Wortex CS 2175 / 1318506',null,false,'конкуренты.xlsx'),
(9,'Дисковые пилы','Интерскол','Дисковая пила Интерскол ДП-185/1400М (785.1.0.70)',null,false,'конкуренты.xlsx'),
(10,'Бетономешалки','SBK','Бетономешалка SBK SX-155 / SSX155.00',null,false,'конкуренты.xlsx'),
(10,'Бетономешалки','Garvill','Бетономешалка Garvill БСЭ-180',null,false,'конкуренты.xlsx'),
(11,'Умывальники','ЭлБЭТ','Умывальник для дачи ЭлБЭТ ЭВБО-17/1.25',null,false,'конкуренты.xlsx'),
(11,'Умывальники','ТермМикс','Умывальник для дачи ТермМикс Тандем СВ-341348',null,false,'конкуренты.xlsx'),
(12,'Компрессоры','Garvill','Воздушный компрессор Garvill CE550F',null,false,'конкуренты.xlsx'),
(12,'Компрессоры','DGM','Воздушный компрессор DGM AC-2101',null,false,'конкуренты.xlsx'),
(13,'СВАРОЧНЫЕ АППАРАТЫ','Solaris','Инвертор сварочный Solaris MMA-200D',null,false,'конкуренты.xlsx'),
(13,'СВАРОЧНЫЕ АППАРАТЫ','AURORA','Инвертор сварочный AURORA Система 200 AC/DC Пульс 32249',null,false,'конкуренты.xlsx'),
(14,'ЭЛЕКТРОГЕНЕРАТОРЫ','SBK','Бензиновый генератор SBK BG4100',null,false,'конкуренты.xlsx'),
(14,'ЭЛЕКТРОГЕНЕРАТОРЫ','Eco','Инверторный генератор Eco PE-7000RSI / EC1563-9',null,false,'конкуренты.xlsx'),
(15,'НАСОСЫ','Olsa','Вибрационный насос Olsa Ручеек-техноприбор-1 25С.01.1956 верх',null,false,'конкуренты.xlsx'),
(15,'НАСОСЫ','Skiper','Дренажно-фекальный насос Skiper WQ10-21',null,false,'конкуренты.xlsx'),
(16,'РУЧНОЙ ИНСТРУМЕНТ','Startul','Топор Startul X10 / ST2030-10',null,false,'конкуренты.xlsx'),
(16,'РУЧНОЙ ИНСТРУМЕНТ','Forsage','Топор Forsage F-A7018',null,false,'конкуренты.xlsx')
on conflict(subgroup,competitor_brand,product_query) do update set source_row=excluded.source_row,
 external_code=coalesce(excluded.external_code,public.triovist_competitor_targets.external_code),
 collect_enabled=excluded.collect_enabled,source_file=excluded.source_file,updated_at=now();

insert into public.triovist_competitor_rules(subgroup,spec_key,weight,direction,unit,aliases,critical) values
('Дрели-шуруповерты аккумуляторные','voltage_v',0.18,'neutral','В','["Напряжение аккумулятора","Номинальное напряжение","Напряжение"]'::jsonb,true),
('Дрели-шуруповерты аккумуляторные','torque_nm',0.24,'higher','Н·м','["Макс. крутящий момент","Максимальный крутящий момент","Max крутящий момент, Нм","Крутящий момент"]'::jsonb,true),
('Дрели-шуруповерты аккумуляторные','motor_type',0.12,'categorical',null,'["Тип электродвигателя","Тип двигателя"]'::jsonb,false),
('Дрели-шуруповерты аккумуляторные','battery_capacity_ah',0.10,'higher','А·ч','["Емкость аккумулятора","Ёмкость аккумулятора","Емкость АКБ","Ёмкость АКБ"]'::jsonb,false),
('Дрели-шуруповерты аккумуляторные','battery_count',0.10,'higher','шт.','["Аккумулятор в комплекте","Аккумуляторов в комплекте"]'::jsonb,false),
('Дрели-шуруповерты аккумуляторные','max_rpm',0.08,'higher','об/мин','["Макс. скорость вращения","Максимальная скорость вращения","Max число оборотов, об/мин","Частота вращения"]'::jsonb,false),
('Дрели-шуруповерты аккумуляторные','wood_mm',0.06,'higher','мм','["Диам. сверления дерева","Макс. диаметр сверления в древесине","Максимальный диаметр сверления древесины"]'::jsonb,false),
('Дрели-шуруповерты аккумуляторные','steel_mm',0.05,'higher','мм','["Диам. сверления стали","Макс. диаметр сверления в стали","Максимальный диаметр сверления металла"]'::jsonb,false),
('Дрели-шуруповерты аккумуляторные','chuck_mm',0.03,'higher','мм','["Диаметр зажима патрона","Диаметр патрона, макс."]'::jsonb,false),
('Дрели-шуруповерты аккумуляторные','weight_kg',0.04,'lower','кг','["Вес","Масса, согласно процедуре ЕРТА","Масса, согласно процедуре EPTA","Масса, кг"]'::jsonb,false),
('Дрели-шуруповерты аккумуляторные','case_included',0.00,'categorical',null,'["Дополнительная комплектация","Упаковка","Кейс"]'::jsonb,false)
on conflict(subgroup,spec_key) do update set weight=excluded.weight,direction=excluded.direction,unit=excluded.unit,aliases=excluded.aliases,critical=excluded.critical,updated_at=now();

create or replace function public.triovist_competitor_dashboard_v1()
returns jsonb language sql stable security definer set search_path=public as $$
with ranked as (
 select a.*,row_number() over(partition by a.target_id order by a.similarity_score desc nulls last,a.competitiveness_score desc nulls last) rn
 from public.triovist_competitor_analysis_current a
),best as(select * from ranked where rn=1),
rows as(
 select jsonb_agg(jsonb_build_object(
  'target_id',t.id,'subgroup',t.subgroup,'competitor_brand',t.competitor_brand,'competitor_query',t.product_query,
  'competitor_code',c.external_code,'competitor_name',c.product_name,'competitor_url',c.product_url,'competitor_price',c.current_price,
  'competitor_in_stock',c.in_stock,'observed_at',c.observed_at,'our_sku',a.our_sku,'our_product_name',a.our_product_name,
  'our_product_url',a.our_product_url,'our_price',a.our_price,'mrc_byn',a.mrc_byn,'mrc_delta_byn',a.mrc_delta_byn,
  'mrc_delta_pct',a.mrc_delta_pct,'mrc_status',a.mrc_status,'price_delta_byn',a.price_delta_byn,'price_delta_pct',a.price_delta_pct,
  'similarity_score',a.similarity_score,'competitiveness_score',a.competitiveness_score,'status',a.status,
  'advantages',a.advantages,'disadvantages',a.disadvantages,'recommendation',a.recommendation,'sales_pitch',a.sales_pitch,
  'our_specs',a.our_specs,'competitor_specs',a.competitor_specs
 ) order by t.competitor_brand,a.similarity_score desc)
 from ranked a join public.triovist_competitor_targets t on t.id=a.target_id
 left join public.triovist_competitor_current c on c.target_id=t.id where t.collect_enabled and a.rn<=5
),last_run as(select to_jsonb(r) j from public.triovist_competitor_runs r order by r.started_at desc limit 1)
select jsonb_build_object(
 'pilot_subgroup','Дрели-шуруповерты аккумуляторные',
 'summary',jsonb_build_object(
  'targets',(select count(*) from public.triovist_competitor_targets where collect_enabled),
  'with_data',(select count(*) from public.triovist_competitor_current c join public.triovist_competitor_targets t on t.id=c.target_id where t.collect_enabled and c.error_text is null),
  'ours_stronger',(select count(*) from best where status='ours_stronger'),
  'parity',(select count(*) from best where status='parity'),
  'competitor_stronger',(select count(*) from best where status='competitor_stronger'),
  'below_mrc',(select count(*) from best where coalesce(mrc_delta_pct,0)<0),
  'strong_mrc_violation',(select count(*) from best where coalesce(mrc_delta_pct,0)<-5)
 ),'last_run',(select j from last_run),'rows',coalesce((select * from rows),'[]'::jsonb)
);
$$;
grant execute on function public.triovist_competitor_dashboard_v1() to authenticated;
