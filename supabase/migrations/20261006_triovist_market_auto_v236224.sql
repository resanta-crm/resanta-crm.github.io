
-- RESANTA CRM v23.6.224 · automatic 21vek market analysis (separate contour)

create table if not exists public.triovist_market_scopes_v1 (
  scope_key text primary key,
  source_category text not null,
  source_subgroup text not null,
  source_prefix text,
  search_query text not null,
  profile_key text not null,
  enabled boolean not null default true,
  own_sku_count integer not null default 0,
  derived_from_price_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.triovist_market_runs_v1 (
  id uuid primary key default gen_random_uuid(),
  parser_version text not null,
  status text not null default 'running',
  scope_count integer not null default 0,
  discovered_count integer not null default 0,
  competitor_count integer not null default 0,
  comparison_count integer not null default 0,
  gap_count integer not null default 0,
  error_count integer not null default 0,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  notes jsonb not null default '{}'::jsonb
);

create table if not exists public.triovist_market_products_current_v1 (
  scope_key text not null references public.triovist_market_scopes_v1(scope_key) on delete cascade,
  product_key text not null,
  run_id uuid references public.triovist_market_runs_v1(id) on delete set null,
  search_query text not null,
  page_no integer,
  position integer,
  external_id text,
  brand text,
  model text,
  product_url text,
  current_price numeric(14,2),
  base_price numeric(14,2),
  in_stock boolean,
  product_rating numeric,
  review_count integer,
  specs_raw jsonb not null default '[]'::jsonb,
  specs_normalized jsonb not null default '{}'::jsonb,
  specs_signature text,
  specs_fetched_at timestamptz,
  observed_at timestamptz not null default now(),
  error_text text,
  primary key(scope_key,product_key)
);

create table if not exists public.triovist_market_product_snapshots_v1 (
  id bigint generated always as identity primary key,
  run_id uuid references public.triovist_market_runs_v1(id) on delete cascade,
  scope_key text not null,
  product_key text not null,
  search_query text not null,
  page_no integer,
  position integer,
  external_id text,
  brand text,
  model text,
  product_url text,
  current_price numeric(14,2),
  base_price numeric(14,2),
  in_stock boolean,
  product_rating numeric,
  review_count integer,
  observed_at timestamptz not null default now(),
  error_text text
);
create index if not exists triovist_market_snap_history_idx_v1
  on public.triovist_market_product_snapshots_v1(scope_key,product_key,observed_at desc);
create index if not exists triovist_market_snap_run_idx_v1
  on public.triovist_market_product_snapshots_v1(run_id,scope_key,position);

create table if not exists public.triovist_market_own_specs_current_v1 (
  sku text primary key,
  scope_key text not null references public.triovist_market_scopes_v1(scope_key) on delete cascade,
  product_name text not null,
  product_url text,
  current_price numeric(14,2),
  mrc_byn numeric(14,2),
  specs_raw jsonb not null default '[]'::jsonb,
  specs_normalized jsonb not null default '{}'::jsonb,
  specs_signature text,
  specs_fetched_at timestamptz,
  observed_at timestamptz not null default now(),
  error_text text
);
create index if not exists triovist_market_own_scope_idx_v1
  on public.triovist_market_own_specs_current_v1(scope_key);

create table if not exists public.triovist_market_analysis_current_v1 (
  scope_key text not null,
  product_key text not null,
  our_sku text not null,
  similarity_score numeric(6,2) not null,
  analog_grade text not null,
  is_primary boolean not null default false,
  competitiveness_score numeric(6,2),
  status text,
  our_price numeric(14,2),
  mrc_byn numeric(14,2),
  mrc_delta_byn numeric(14,2),
  mrc_delta_pct numeric(10,2),
  competitor_price numeric(14,2),
  price_delta_byn numeric(14,2),
  price_delta_pct numeric(10,2),
  our_specs jsonb not null default '{}'::jsonb,
  competitor_specs jsonb not null default '{}'::jsonb,
  advantages jsonb not null default '[]'::jsonb,
  disadvantages jsonb not null default '[]'::jsonb,
  recommendation text,
  computed_at timestamptz not null default now(),
  primary key(scope_key,product_key,our_sku),
  foreign key(scope_key,product_key) references public.triovist_market_products_current_v1(scope_key,product_key) on delete cascade
);
create index if not exists triovist_market_analysis_primary_idx_v1
  on public.triovist_market_analysis_current_v1(scope_key,is_primary,similarity_score desc);

create table if not exists public.triovist_market_gaps_current_v1 (
  scope_key text not null,
  product_key text not null,
  best_similarity numeric(6,2),
  reason text not null,
  computed_at timestamptz not null default now(),
  primary key(scope_key,product_key),
  foreign key(scope_key,product_key) references public.triovist_market_products_current_v1(scope_key,product_key) on delete cascade
);

create table if not exists public.triovist_market_rules_v1 (
  profile_key text not null,
  spec_key text not null,
  label text not null,
  weight numeric(8,4) not null check(weight>=0),
  direction text not null check(direction in ('higher','lower','categorical','boolean','neutral')),
  unit text,
  aliases jsonb not null default '[]'::jsonb,
  critical boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key(profile_key,spec_key)
);

alter table public.triovist_market_scopes_v1 enable row level security;
alter table public.triovist_market_runs_v1 enable row level security;
alter table public.triovist_market_products_current_v1 enable row level security;
alter table public.triovist_market_product_snapshots_v1 enable row level security;
alter table public.triovist_market_own_specs_current_v1 enable row level security;
alter table public.triovist_market_analysis_current_v1 enable row level security;
alter table public.triovist_market_gaps_current_v1 enable row level security;
alter table public.triovist_market_rules_v1 enable row level security;

do $$ begin create policy triovist_market_scopes_read_v1 on public.triovist_market_scopes_v1 for select to authenticated using(true); exception when duplicate_object then null; end $$;
do $$ begin create policy triovist_market_runs_read_v1 on public.triovist_market_runs_v1 for select to authenticated using(true); exception when duplicate_object then null; end $$;
do $$ begin create policy triovist_market_products_read_v1 on public.triovist_market_products_current_v1 for select to authenticated using(true); exception when duplicate_object then null; end $$;
do $$ begin create policy triovist_market_snapshots_read_v1 on public.triovist_market_product_snapshots_v1 for select to authenticated using(true); exception when duplicate_object then null; end $$;
do $$ begin create policy triovist_market_own_read_v1 on public.triovist_market_own_specs_current_v1 for select to authenticated using(true); exception when duplicate_object then null; end $$;
do $$ begin create policy triovist_market_analysis_read_v1 on public.triovist_market_analysis_current_v1 for select to authenticated using(true); exception when duplicate_object then null; end $$;
do $$ begin create policy triovist_market_gaps_read_v1 on public.triovist_market_gaps_current_v1 for select to authenticated using(true); exception when duplicate_object then null; end $$;
do $$ begin create policy triovist_market_rules_read_v1 on public.triovist_market_rules_v1 for select to authenticated using(true); exception when duplicate_object then null; end $$;

grant select on public.triovist_market_scopes_v1,public.triovist_market_runs_v1,
  public.triovist_market_products_current_v1,public.triovist_market_product_snapshots_v1,
  public.triovist_market_own_specs_current_v1,public.triovist_market_analysis_current_v1,
  public.triovist_market_gaps_current_v1,public.triovist_market_rules_v1 to authenticated;

-- Configurable characteristic profiles. Unknown/missing specs are never treated as zero.
insert into public.triovist_market_rules_v1(profile_key,spec_key,label,weight,direction,unit,aliases,critical) values
('convector','power_w','Мощность',0.24,'higher','Вт','["Мощность","Максимальная мощность","Потребляемая мощность","Номинальная мощность"]',true),
('convector','area_m2','Площадь обогрева',0.20,'higher','м²','["Площадь обогрева","Рекомендуемая площадь помещения","Максимальная площадь обогрева"]',true),
('convector','heater_type','Нагревательный элемент',0.14,'categorical',null,'["Нагревательный элемент","Тип нагревательного элемента"]',false),
('convector','thermostat_type','Термостат',0.10,'categorical',null,'["Термостат","Тип термостата"]',false),
('convector','control_type','Управление',0.08,'categorical',null,'["Управление","Тип управления"]',false),
('convector','power_modes','Режимы мощности',0.06,'higher','шт.','["Количество режимов мощности","Количество режимов нагрева","Режимы мощности"]',false),
('convector','overheat_protection','Защита от перегрева',0.05,'boolean',null,'["Защита от перегрева"]',false),
('convector','ip_rating','Влагозащита',0.05,'categorical',null,'["Степень защиты","Класс пылевлагозащиты","Влагозащита"]',false),
('convector','installation_type','Установка',0.05,'categorical',null,'["Установка","Варианты установки","Монтаж"]',false),
('convector','weight_kg','Вес',0.03,'lower','кг','["Вес","Масса"]',false),

('oil_radiator','power_w','Мощность',0.28,'higher','Вт','["Мощность","Максимальная мощность","Номинальная мощность"]',true),
('oil_radiator','area_m2','Площадь обогрева',0.18,'higher','м²','["Площадь обогрева","Рекомендуемая площадь помещения"]',true),
('oil_radiator','sections_count','Количество секций',0.18,'higher','шт.','["Количество секций","Число секций"]',true),
('oil_radiator','thermostat_type','Термостат',0.10,'categorical',null,'["Термостат","Тип термостата"]',false),
('oil_radiator','power_modes','Режимы мощности',0.08,'higher','шт.','["Количество режимов мощности","Количество режимов нагрева"]',false),
('oil_radiator','overheat_protection','Защита от перегрева',0.08,'boolean',null,'["Защита от перегрева"]',false),
('oil_radiator','weight_kg','Вес',0.10,'lower','кг','["Вес","Масса"]',false),

('fan_heater','power_w','Мощность',0.30,'higher','Вт','["Мощность","Максимальная мощность","Номинальная мощность"]',true),
('fan_heater','area_m2','Площадь обогрева',0.20,'higher','м²','["Площадь обогрева","Рекомендуемая площадь помещения"]',true),
('fan_heater','heater_type','Нагревательный элемент',0.18,'categorical',null,'["Нагревательный элемент","Тип нагревательного элемента"]',false),
('fan_heater','power_modes','Режимы',0.10,'higher','шт.','["Количество режимов","Количество режимов мощности","Количество режимов нагрева"]',false),
('fan_heater','thermostat_type','Термостат',0.08,'categorical',null,'["Термостат","Тип термостата"]',false),
('fan_heater','overheat_protection','Защита от перегрева',0.08,'boolean',null,'["Защита от перегрева"]',false),
('fan_heater','weight_kg','Вес',0.06,'lower','кг','["Вес","Масса"]',false),

('heat_gun','fuel_type','Тип нагрева',0.24,'categorical',null,'["Тип топлива","Вид топлива","Тип нагрева","Источник энергии"]',true),
('heat_gun','power_w','Мощность',0.25,'higher','Вт','["Тепловая мощность","Мощность","Максимальная мощность"]',true),
('heat_gun','airflow_m3h','Воздушный поток',0.15,'higher','м³/ч','["Производительность","Воздушный поток","Расход воздуха"]',false),
('heat_gun','fuel_consumption_kgh','Расход топлива',0.08,'lower','кг/ч','["Расход топлива"]',false),
('heat_gun','tank_l','Объём бака',0.08,'higher','л','["Объем топливного бака","Объём топливного бака","Объем бака","Объём бака"]',false),
('heat_gun','voltage_v','Напряжение',0.06,'neutral','В','["Напряжение","Напряжение питания"]',false),
('heat_gun','heater_type','Нагревательный элемент',0.08,'categorical',null,'["Нагревательный элемент","Тип нагревательного элемента"]',false),
('heat_gun','weight_kg','Вес',0.06,'lower','кг','["Вес","Масса"]',false),

('heat_curtain','power_w','Мощность',0.28,'higher','Вт','["Мощность","Тепловая мощность","Максимальная мощность"]',true),
('heat_curtain','airflow_m3h','Воздушный поток',0.24,'higher','м³/ч','["Производительность","Воздушный поток","Расход воздуха"]',true),
('heat_curtain','width_mm','Ширина',0.18,'neutral','мм','["Ширина","Длина завесы","Длина"]',true),
('heat_curtain','control_type','Управление',0.10,'categorical',null,'["Управление","Тип управления"]',false),
('heat_curtain','installation_type','Установка',0.10,'categorical',null,'["Установка","Монтаж","Способ установки"]',false),
('heat_curtain','weight_kg','Вес',0.10,'lower','кг','["Вес","Масса"]',false),

('infrared_heater','power_w','Мощность',0.30,'higher','Вт','["Мощность","Максимальная мощность"]',true),
('infrared_heater','area_m2','Площадь обогрева',0.22,'higher','м²','["Площадь обогрева","Рекомендуемая площадь помещения"]',true),
('infrared_heater','heater_type','Нагревательный элемент',0.16,'categorical',null,'["Нагревательный элемент","Тип нагревательного элемента"]',false),
('infrared_heater','installation_type','Установка',0.12,'categorical',null,'["Установка","Монтаж","Способ установки"]',false),
('infrared_heater','thermostat_type','Термостат',0.10,'categorical',null,'["Термостат","Тип термостата"]',false),
('infrared_heater','weight_kg','Вес',0.10,'lower','кг','["Вес","Масса"]',false),

('humidifier','tank_l','Объём резервуара',0.24,'higher','л','["Объем резервуара для воды","Объём резервуара для воды","Объем бака","Объём бака"]',true),
('humidifier','area_m2','Площадь помещения',0.22,'higher','м²','["Обслуживаемая площадь","Рекомендуемая площадь помещения","Площадь помещения"]',true),
('humidifier','output_mlh','Производительность',0.22,'higher','мл/ч','["Производительность","Расход воды","Интенсивность увлажнения"]',true),
('humidifier','power_w','Мощность',0.08,'lower','Вт','["Мощность","Потребляемая мощность"]',false),
('humidifier','humidistat','Гигростат',0.10,'boolean',null,'["Гигростат","Поддержание влажности"]',false),
('humidifier','noise_db','Уровень шума',0.08,'lower','дБ','["Уровень шума"]',false),
('humidifier','control_type','Управление',0.06,'categorical',null,'["Управление","Тип управления"]',false),

('led_lamp','power_w','Мощность',0.20,'neutral','Вт','["Мощность","Потребляемая мощность"]',true),
('led_lamp','base_type','Цоколь',0.20,'categorical',null,'["Цоколь","Тип цоколя"]',true),
('led_lamp','color_temp_k','Цветовая температура',0.18,'neutral','K','["Цветовая температура"]',true),
('led_lamp','luminous_flux_lm','Световой поток',0.18,'higher','лм','["Световой поток"]',true),
('led_lamp','bulb_shape','Форма колбы',0.12,'categorical',null,'["Форма колбы","Форма лампы"]',false),
('led_lamp','voltage_v','Напряжение',0.06,'neutral','В','["Напряжение","Рабочее напряжение"]',false),
('led_lamp','weight_kg','Вес',0.06,'lower','кг','["Вес","Масса"]',false),

('chainsaw_gas','power_w','Мощность',0.20,'higher','Вт','["Мощность","Мощность двигателя","Максимальная мощность"]',true),
('chainsaw_gas','engine_cc','Объём двигателя',0.18,'neutral','см³','["Объем двигателя","Объём двигателя","Рабочий объем двигателя","Рабочий объём двигателя"]',true),
('chainsaw_gas','bar_length_cm','Длина шины',0.18,'neutral','см','["Длина шины","Длина пильной шины"]',true),
('chainsaw_gas','chain_pitch_in','Шаг цепи',0.14,'neutral','дюйм','["Шаг цепи"]',true),
('chainsaw_gas','drive_links','Звенья',0.08,'neutral','шт.','["Количество звеньев","Число звеньев"]',false),
('chainsaw_gas','fuel_tank_l','Топливный бак',0.06,'higher','л','["Объем топливного бака","Объём топливного бака"]',false),
('chainsaw_gas','chain_speed_ms','Скорость цепи',0.08,'higher','м/с','["Скорость цепи","Максимальная скорость цепи"]',false),
('chainsaw_gas','weight_kg','Вес',0.08,'lower','кг','["Вес","Масса"]',false),

('chainsaw_electric','power_w','Мощность',0.24,'higher','Вт','["Мощность","Мощность двигателя","Потребляемая мощность"]',true),
('chainsaw_electric','bar_length_cm','Длина шины',0.20,'neutral','см','["Длина шины","Длина пильной шины"]',true),
('chainsaw_electric','chain_speed_ms','Скорость цепи',0.16,'higher','м/с','["Скорость цепи","Максимальная скорость цепи"]',true),
('chainsaw_electric','chain_pitch_in','Шаг цепи',0.12,'neutral','дюйм','["Шаг цепи"]',true),
('chainsaw_electric','motor_position','Расположение двигателя',0.08,'categorical',null,'["Расположение двигателя"]',false),
('chainsaw_electric','tool_free_tension','Бесключевое натяжение',0.06,'boolean',null,'["Бесключевое натяжение цепи","Регулировка натяжения цепи без инструмента"]',false),
('chainsaw_electric','voltage_v','Напряжение АКБ',0.06,'neutral','В','["Напряжение аккумулятора","Напряжение"]',false),
('chainsaw_electric','weight_kg','Вес',0.08,'lower','кг','["Вес","Масса"]',false)
on conflict(profile_key,spec_key) do update set
  label=excluded.label,weight=excluded.weight,direction=excluded.direction,unit=excluded.unit,
  aliases=excluded.aliases,critical=excluded.critical,updated_at=now();

create or replace function public.triovist_market_dashboard_v236224()
returns jsonb
language plpgsql
stable
security definer
set search_path=public,auth,pg_catalog
as $$
declare
  a record;
  result jsonb;
begin
  select * into a from public.triovist_content_actor();
  if a.actor_email is null or a.actor_email not in (
    'payushin_ar@resanta.ru','sidarovich_kn@resanta.ru',
    'aleksandrenko_av@resanta.ru','krishtal_na@resanta.ru'
  ) then
    raise exception 'Нет доступа к конкурентам 21vek' using errcode='42501';
  end if;

  with primary_cmp as (
    select a.*
    from public.triovist_market_analysis_current_v1 a
    where a.is_primary
  ),
  brand_map as (
    select p.scope_key,
      jsonb_agg(jsonb_build_object(
        'brand',p.brand,'models',p.models,'best_position',p.best_position,
        'avg_position',p.avg_position,'share_pct',p.share_pct
      ) order by p.models desc,p.best_position) brands
    from (
      select scope_key,coalesce(nullif(brand,''),'Не определён') brand,
        count(*) models,min(position) best_position,
        round(avg(position)::numeric,1) avg_position,
        round(count(*)*100.0/sum(count(*)) over(partition by scope_key),1) share_pct
      from public.triovist_market_products_current_v1
      where error_text is null
      group by scope_key,coalesce(nullif(brand,''),'Не определён')
    ) p
    group by p.scope_key
  ),
  scopes as (
    select jsonb_agg(jsonb_build_object(
      'scope_key',s.scope_key,'category',s.source_category,'subgroup',s.source_subgroup,
      'search_query',s.search_query,'profile_key',s.profile_key,'own_sku_count',s.own_sku_count,
      'competitors',(select count(*) from public.triovist_market_products_current_v1 p where p.scope_key=s.scope_key and p.error_text is null),
      'brands',coalesce(b.brands,'[]'::jsonb),
      'gaps',(select count(*) from public.triovist_market_gaps_current_v1 g where g.scope_key=s.scope_key)
    ) order by s.source_category,s.source_subgroup) j
    from public.triovist_market_scopes_v1 s
    left join brand_map b on b.scope_key=s.scope_key
    where s.enabled
  ),
  rows as (
    select jsonb_agg(jsonb_build_object(
      'scope_key',p.scope_key,'subgroup',s.source_subgroup,'profile_key',s.profile_key,
      'product_key',p.product_key,'brand',p.brand,'model',p.model,'product_url',p.product_url,
      'external_id',p.external_id,'page_no',p.page_no,'position',p.position,
      'competitor_price',p.current_price,'base_price',p.base_price,'in_stock',p.in_stock,
      'rating',p.product_rating,'review_count',p.review_count,
      'our_sku',a.our_sku,'our_product_name',o.product_name,'our_product_url',o.product_url,
      'our_price',a.our_price,'mrc_byn',a.mrc_byn,'mrc_delta_byn',a.mrc_delta_byn,'mrc_delta_pct',a.mrc_delta_pct,
      'price_delta_byn',a.price_delta_byn,'price_delta_pct',a.price_delta_pct,
      'similarity_score',a.similarity_score,'analog_grade',a.analog_grade,
      'competitiveness_score',a.competitiveness_score,'status',a.status,
      'advantages',a.advantages,'disadvantages',a.disadvantages,'recommendation',a.recommendation,
      'our_specs',a.our_specs,'competitor_specs',a.competitor_specs,
      'is_gap',(g.product_key is not null),'gap_reason',g.reason,'best_similarity',g.best_similarity,
      'price_7d',(select x.current_price from public.triovist_market_product_snapshots_v1 x
                  where x.scope_key=p.scope_key and x.product_key=p.product_key
                    and x.observed_at<=now()-interval '7 days' and x.error_text is null
                  order by x.observed_at desc limit 1),
      'position_7d',(select x.position from public.triovist_market_product_snapshots_v1 x
                  where x.scope_key=p.scope_key and x.product_key=p.product_key
                    and x.observed_at<=now()-interval '7 days' and x.error_text is null
                  order by x.observed_at desc limit 1),
      'price_30d',(select x.current_price from public.triovist_market_product_snapshots_v1 x
                  where x.scope_key=p.scope_key and x.product_key=p.product_key
                    and x.observed_at<=now()-interval '30 days' and x.error_text is null
                  order by x.observed_at desc limit 1),
      'position_30d',(select x.position from public.triovist_market_product_snapshots_v1 x
                  where x.scope_key=p.scope_key and x.product_key=p.product_key
                    and x.observed_at<=now()-interval '30 days' and x.error_text is null
                  order by x.observed_at desc limit 1)
    ) order by p.scope_key,p.position)
    j
    from public.triovist_market_products_current_v1 p
    join public.triovist_market_scopes_v1 s on s.scope_key=p.scope_key
    left join primary_cmp a on a.scope_key=p.scope_key and a.product_key=p.product_key
    left join public.triovist_market_own_specs_current_v1 o on o.sku=a.our_sku
    left join public.triovist_market_gaps_current_v1 g on g.scope_key=p.scope_key and g.product_key=p.product_key
    where p.error_text is null and s.enabled
  ),
  lr as (
    select to_jsonb(r) j from public.triovist_market_runs_v1 r order by r.started_at desc limit 1
  )
  select jsonb_build_object(
    'version','v23.6.224',
    'allowed_users',jsonb_build_array('Паюшин','Сидарович','Александренко','Кришталь'),
    'summary',jsonb_build_object(
      'scopes',(select count(*) from public.triovist_market_scopes_v1 where enabled),
      'products',(select count(*) from public.triovist_market_products_current_v1 where error_text is null),
      'brands',(select count(distinct lower(brand)) from public.triovist_market_products_current_v1 where error_text is null and nullif(brand,'') is not null),
      'ours_stronger',(select count(*) from primary_cmp where status='ours_stronger'),
      'parity',(select count(*) from primary_cmp where status='parity'),
      'competitor_stronger',(select count(*) from primary_cmp where status='competitor_stronger'),
      'gaps',(select count(*) from public.triovist_market_gaps_current_v1),
      'below_mrc',(select count(*) from primary_cmp where coalesce(mrc_delta_pct,0)<0)
    ),
    'last_run',(select j from lr),
    'scopes',coalesce((select j from scopes),'[]'::jsonb),
    'rows',coalesce((select j from rows),'[]'::jsonb)
  ) into result;
  return result;
end;
$$;
grant execute on function public.triovist_market_dashboard_v236224() to authenticated;

create or replace function public.triovist_market_export_v236224(
  p_kind text,
  p_offset integer default 0,
  p_limit integer default 500
)
returns jsonb
language plpgsql
stable
security definer
set search_path=public,auth,pg_catalog
as $$
declare
  a record;
  k text:=lower(trim(coalesce(p_kind,'')));
  off int:=greatest(coalesce(p_offset,0),0);
  lim int:=least(greatest(coalesce(p_limit,500),1),500);
  rowsj jsonb:='[]'::jsonb;
  totaln int:=0;
begin
  select * into a from public.triovist_content_actor();
  if a.actor_email is null or a.actor_email not in (
    'payushin_ar@resanta.ru','sidarovich_kn@resanta.ru',
    'aleksandrenko_av@resanta.ru','krishtal_na@resanta.ru'
  ) then raise exception 'Нет доступа к выгрузке конкурентов 21vek' using errcode='42501'; end if;

  if k='comparison' then
    with q as (
      select s.source_category as "Группа",s.source_subgroup as "Подгруппа",
        a.our_sku as "Наш SKU",o.product_name as "Наш товар",a.mrc_byn as "МРЦ",
        a.our_price as "Наша цена",a.mrc_delta_pct as "Отклонение МРЦ %",
        p.brand as "Бренд конкурента",p.model as "Модель конкурента",p.position as "Позиция",
        p.page_no as "Страница",p.current_price as "Цена конкурента",
        a.price_delta_pct as "Разница цены %",a.similarity_score as "Сопоставимость %",
        a.analog_grade as "Класс аналога",a.advantages as "Наши преимущества",
        a.disadvantages as "Преимущества конкурента",a.status as "Итог",
        a.recommendation as "Рекомендация",o.product_url as "Ссылка наша",
        p.product_url as "Ссылка конкурента"
      from public.triovist_market_analysis_current_v1 a
      join public.triovist_market_products_current_v1 p on p.scope_key=a.scope_key and p.product_key=a.product_key
      join public.triovist_market_scopes_v1 s on s.scope_key=a.scope_key
      left join public.triovist_market_own_specs_current_v1 o on o.sku=a.our_sku
      where a.is_primary
      order by s.source_category,s.source_subgroup,p.position
    )
    select count(*),coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) into totaln,rowsj
    from (select * from q offset off limit lim) x;
    select count(*) into totaln from public.triovist_market_analysis_current_v1 where is_primary;

  elsif k='raw' then
    select count(*) into totaln from public.triovist_market_products_current_v1;
    select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) into rowsj
    from (
      select s.source_category as "Группа",s.source_subgroup as "Подгруппа",p.search_query as "Запрос 21vek",
        p.position as "Позиция",p.page_no as "Страница",p.brand as "Бренд",p.model as "Модель",
        p.external_id as "ID 21vek",p.current_price as "Цена",p.base_price as "Старая цена",
        p.in_stock as "В наличии",p.product_rating as "Рейтинг",p.review_count as "Отзывы",
        p.specs_normalized as "Характеристики",p.observed_at as "Проверено",p.product_url as "Ссылка",
        p.error_text as "Ошибка"
      from public.triovist_market_products_current_v1 p
      join public.triovist_market_scopes_v1 s on s.scope_key=p.scope_key
      order by s.source_category,s.source_subgroup,p.position
      offset off limit lim
    ) x;

  elsif k='gaps' then
    select count(*) into totaln from public.triovist_market_gaps_current_v1;
    select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) into rowsj
    from (
      select s.source_category as "Группа",s.source_subgroup as "Подгруппа",p.brand as "Бренд",
        p.model as "Модель",p.position as "Позиция",p.current_price as "Цена конкурента",
        g.best_similarity as "Лучшее совпадение %",g.reason as "Причина",p.product_url as "Ссылка конкурента"
      from public.triovist_market_gaps_current_v1 g
      join public.triovist_market_products_current_v1 p on p.scope_key=g.scope_key and p.product_key=g.product_key
      join public.triovist_market_scopes_v1 s on s.scope_key=g.scope_key
      order by s.source_category,s.source_subgroup,p.position
      offset off limit lim
    ) x;

  elsif k='errors' then
    select count(*) into totaln from public.triovist_market_products_current_v1 where error_text is not null;
    select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) into rowsj
    from (
      select s.source_category as "Группа",s.source_subgroup as "Подгруппа",p.position as "Позиция",
        p.brand as "Бренд",p.model as "Модель",p.product_url as "Ссылка",p.error_text as "Ошибка",
        p.observed_at as "Проверено"
      from public.triovist_market_products_current_v1 p
      join public.triovist_market_scopes_v1 s on s.scope_key=p.scope_key
      where p.error_text is not null
      order by s.source_category,s.source_subgroup,p.position
      offset off limit lim
    ) x;

  elsif k='summary' then
    with brands as (
      select scope_key,string_agg(brand||' — '||cnt,', ' order by cnt desc,brand) brands
      from (
        select scope_key,coalesce(nullif(brand,''),'Не определён') brand,count(*) cnt
        from public.triovist_market_products_current_v1 where error_text is null
        group by scope_key,coalesce(nullif(brand,''),'Не определён')
      ) b group by scope_key
    )
    select count(*) into totaln from public.triovist_market_scopes_v1 where enabled;
    select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) into rowsj
    from (
      select s.source_category as "Группа",s.source_subgroup as "Подгруппа",s.own_sku_count as "Наших SKU",
        (select count(*) from public.triovist_market_products_current_v1 p where p.scope_key=s.scope_key and p.error_text is null) as "Конкурентов",
        coalesce(b.brands,'') as "Бренды TOP-2",
        (select count(*) from public.triovist_market_analysis_current_v1 a where a.scope_key=s.scope_key and a.is_primary and a.status='ours_stronger') as "Мы сильнее",
        (select count(*) from public.triovist_market_analysis_current_v1 a where a.scope_key=s.scope_key and a.is_primary and a.status='parity') as "Паритет",
        (select count(*) from public.triovist_market_analysis_current_v1 a where a.scope_key=s.scope_key and a.is_primary and a.status='competitor_stronger') as "Конкурент сильнее",
        (select count(*) from public.triovist_market_gaps_current_v1 g where g.scope_key=s.scope_key) as "Пробелы ассортимента",
        (select count(*) from public.triovist_market_analysis_current_v1 a where a.scope_key=s.scope_key and a.is_primary and coalesce(a.mrc_delta_pct,0)<0) as "Ниже МРЦ"
      from public.triovist_market_scopes_v1 s
      left join brands b on b.scope_key=s.scope_key
      where s.enabled
      order by s.source_category,s.source_subgroup
      offset off limit lim
    ) x;
  else
    raise exception 'Unknown export kind' using errcode='22023';
  end if;

  return jsonb_build_object('kind',k,'rows',rowsj,'total',totaln,'offset',off,'limit',lim,
    'has_more',(off+jsonb_array_length(rowsj)<totaln));
end;
$$;
grant execute on function public.triovist_market_export_v236224(text,integer,integer) to authenticated;
