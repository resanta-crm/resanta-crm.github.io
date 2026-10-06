-- RESANTA CRM v23.6.224 · automatic 21vek market analysis
-- Separate contour. Existing own 21vek parser and pilot tables are untouched.

create table if not exists public.triovist_market_categories_v2 (
  id uuid primary key default gen_random_uuid(),
  matrix_group text not null,
  matrix_subgroup text not null unique,
  search_query text not null,
  category_slug text,
  category_url text,
  product_match_regex text,
  enabled boolean not null default true,
  manual_check boolean not null default false,
  source_mode text not null default 'search_top2',
  sort_mode text not null default 'default_popularity',
  pages integer not null default 2 check(pages between 1 and 5),
  page_size integer not null default 30 check(page_size between 10 and 60),
  updated_at timestamptz not null default now()
);

create table if not exists public.triovist_market_runs_v2 (
  id uuid primary key default gen_random_uuid(),
  parser_version text not null,
  status text not null default 'running',
  categories_total integer not null default 0,
  categories_ok integer not null default 0,
  products_seen integer not null default 0,
  products_competitors integer not null default 0,
  matches_count integer not null default 0,
  gaps_count integer not null default 0,
  errors_count integer not null default 0,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  notes jsonb not null default '{}'::jsonb
);

create table if not exists public.triovist_market_products_v2 (
  category_id uuid not null references public.triovist_market_categories_v2(id) on delete cascade,
  product_key text not null,
  external_id text,
  brand text,
  model text,
  product_name text not null,
  product_url text not null,
  page_no integer not null,
  position_no integer not null,
  current_price numeric(14,2),
  base_price numeric(14,2),
  in_stock boolean,
  product_rating numeric,
  review_count integer,
  specs_raw jsonb not null default '[]'::jsonb,
  specs_normalized jsonb not null default '{}'::jsonb,
  parser_payload jsonb not null default '{}'::jsonb,
  observed_at timestamptz not null,
  last_success_at timestamptz,
  error_text text,
  primary key(category_id,product_key)
);
create index if not exists triovist_market_products_category_position_idx
  on public.triovist_market_products_v2(category_id,position_no);
create index if not exists triovist_market_products_brand_idx
  on public.triovist_market_products_v2(category_id,brand);

create table if not exists public.triovist_market_product_history_v2 (
  id bigint generated always as identity primary key,
  run_id uuid references public.triovist_market_runs_v2(id) on delete cascade,
  category_id uuid not null references public.triovist_market_categories_v2(id) on delete cascade,
  product_key text not null,
  observed_at timestamptz not null,
  page_no integer not null,
  position_no integer not null,
  current_price numeric(14,2),
  base_price numeric(14,2),
  in_stock boolean,
  product_rating numeric,
  review_count integer,
  unique(run_id,category_id,product_key)
);
create index if not exists triovist_market_history_product_time_idx
  on public.triovist_market_product_history_v2(category_id,product_key,observed_at desc);

create table if not exists public.triovist_market_our_specs_v2 (
  sku text primary key,
  matrix_group text not null,
  matrix_subgroup text not null,
  product_name text not null,
  brand text,
  product_url text,
  current_price numeric(14,2),
  mrc_byn numeric(14,2),
  specs_raw jsonb not null default '[]'::jsonb,
  specs_normalized jsonb not null default '{}'::jsonb,
  source_signature text,
  fetched_at timestamptz,
  error_text text,
  updated_at timestamptz not null default now()
);
create index if not exists triovist_market_our_specs_subgroup_idx
  on public.triovist_market_our_specs_v2(matrix_subgroup);

create table if not exists public.triovist_market_matches_v2 (
  category_id uuid not null references public.triovist_market_categories_v2(id) on delete cascade,
  product_key text not null,
  our_sku text not null,
  similarity_score numeric(6,2) not null,
  match_class text not null,
  our_price numeric(14,2),
  mrc_byn numeric(14,2),
  mrc_delta_byn numeric(14,2),
  mrc_delta_pct numeric(10,2),
  competitor_price numeric(14,2),
  price_delta_byn numeric(14,2),
  price_delta_pct numeric(10,2),
  competitiveness_score numeric(6,2),
  status text,
  advantages jsonb not null default '[]'::jsonb,
  disadvantages jsonb not null default '[]'::jsonb,
  recommendation text,
  computed_at timestamptz not null default now(),
  primary key(category_id,product_key,our_sku),
  foreign key(our_sku) references public.triovist_market_our_specs_v2(sku) on delete cascade
);
create index if not exists triovist_market_matches_category_score_idx
  on public.triovist_market_matches_v2(category_id,similarity_score desc);

create table if not exists public.triovist_market_gaps_v2 (
  category_id uuid not null references public.triovist_market_categories_v2(id) on delete cascade,
  product_key text not null,
  best_similarity numeric(6,2),
  best_our_sku text,
  reason text not null,
  computed_at timestamptz not null default now(),
  primary key(category_id,product_key)
);

create table if not exists public.triovist_market_spec_rules_v2 (
  matrix_subgroup text not null,
  spec_key text not null,
  label text not null,
  weight numeric(8,4) not null check(weight>=0),
  direction text not null check(direction in ('higher','lower','categorical','neutral','boolean')),
  value_type text not null check(value_type in ('number','text','boolean')),
  unit text,
  aliases jsonb not null default '[]'::jsonb,
  critical boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key(matrix_subgroup,spec_key)
);

-- Current seasonal matrix is derived from the active company price list.
-- We intentionally infer real product families from product names because legacy
-- subgroup fields contain historical misclassification (e.g. climate items under Pumps).
create or replace view public.triovist_market_matrix_v2 as
with p as (
  select distinct on (trim(sku))
    trim(sku) sku,product,category,subgroup,uploaded_at,
    case
      when lower(product) like '%конвектор%' and lower(product) not like '%конвекторы' then 'Конвекторы'
      when lower(product) like '%маслян%радиатор%' and lower(product) not like '%радиаторы' then 'Масляные радиаторы'
      when lower(product) like '%тепловентилятор%' and lower(product) not like '%тепловентиляторы' then 'Тепловентиляторы'
      when lower(product) like '%теплов%пушк%' and lower(product) not like '%тепловые пушки' then 'Тепловые пушки'
      when lower(product) like '%инфракрас%обогревател%' and lower(product) not like '%обогреватели' then 'Инфракрасные обогреватели'
      when lower(product) like '%тепловая завеса%' then 'Тепловые завесы'
      when lower(product) like '%увлажнител%воздуха%' and lower(product) not like '%увлажнители воздуха' then 'Увлажнители воздуха'
      when lower(product) like '%бензопил%' and lower(product) not like '%бензопилы' then 'Бензопилы'
      when lower(product) like '%электропил%' and lower(product) not like '%электропилы' then 'Электропилы'
      else null
    end matrix_subgroup
  from public.price_list
  where nullif(trim(sku),'') is not null
    and product is not null
    and (
      lower(coalesce(category,''))='климатическое оборудование'
      or lower(product) like '%бензопил%'
      or lower(product) like '%электропил%'
    )
  order by trim(sku),uploaded_at desc
),
cards as (
  select distinct on (trim(c.sku))
    trim(c.sku) sku,c.product_name,c.product_url,c.price,c.in_stock,c.created_at
  from public.triovist_content_imports i
  join public.triovist_content_cards c on c.import_id=i.id
  where i.is_current and i.status='complete' and nullif(trim(c.sku),'') is not null
  order by trim(c.sku),c.created_at desc
)
select
  p.sku,
  case when p.matrix_subgroup in ('Бензопилы','Электропилы') then 'Садовая техника' else 'Климатическое оборудование' end matrix_group,
  p.matrix_subgroup,
  p.product product_name,
  case
    when lower(p.product) like '%huter%' then 'Huter'
    when lower(p.product) like '%eurolux%' then 'Eurolux'
    when lower(p.product) like '%вихр%' then 'Вихрь'
    when lower(p.product) like '%ресант%' then 'Ресанта'
    else null
  end brand,
  c.product_url,
  c.price current_price,
  c.in_stock,
  m.mrc_byn
from p
left join cards c on c.sku=p.sku
left join public.triovist_mrc_current m on trim(m.sku)=p.sku
where p.matrix_subgroup is not null;

-- Seed auto-discovery hints. These are category hints, NOT competitor lists.
insert into public.triovist_market_categories_v2(
  matrix_group,matrix_subgroup,search_query,category_slug,category_url,product_match_regex,manual_check
) values
('Климатическое оборудование','Конвекторы','конвектор','heaters','https://www.21vek.by/heaters/','конвектор',true),
('Климатическое оборудование','Масляные радиаторы','масляный радиатор','heaters','https://www.21vek.by/heaters/','маслян.*радиатор',false),
('Климатическое оборудование','Тепловентиляторы','тепловентилятор','heaters','https://www.21vek.by/heaters/','тепловентилятор',false),
('Климатическое оборудование','Тепловые пушки','тепловая пушка','forced_air_heaters','https://www.21vek.by/forced_air_heaters/','теплов.*пушк',false),
('Климатическое оборудование','Инфракрасные обогреватели','инфракрасный обогреватель','heaters','https://www.21vek.by/heaters/','инфракрас.*обогревател',false),
('Климатическое оборудование','Тепловые завесы','тепловая завеса',null,null,'теплов.*завес',false),
('Климатическое оборудование','Увлажнители воздуха','увлажнитель воздуха',null,null,'увлажнител.*воздуха',false),
('Садовая техника','Бензопилы','бензопила','chainsaws','https://www.21vek.by/chainsaws/','бензопил',true),
('Садовая техника','Электропилы','электропила','chainsaws','https://www.21vek.by/chainsaws/','электропил',false)
on conflict(matrix_subgroup) do update set
  matrix_group=excluded.matrix_group,
  search_query=excluded.search_query,
  category_slug=coalesce(excluded.category_slug,public.triovist_market_categories_v2.category_slug),
  category_url=coalesce(excluded.category_url,public.triovist_market_categories_v2.category_url),
  product_match_regex=excluded.product_match_regex,
  updated_at=now();

-- Rules: Convectors.
insert into public.triovist_market_spec_rules_v2(matrix_subgroup,spec_key,label,weight,direction,value_type,unit,aliases,critical) values
('Конвекторы','power_w','Мощность',0.24,'higher','number','Вт','["Мощность","Максимальная мощность","Потребляемая мощность","Номинальная мощность"]',true),
('Конвекторы','area_m2','Площадь обогрева',0.18,'higher','number','м²','["Площадь обогрева","Рекомендуемая площадь помещения","Максимальная площадь обогрева","Площадь помещения"]',true),
('Конвекторы','heater_type','Нагревательный элемент',0.12,'categorical','text',null,'["Нагревательный элемент","Тип нагревательного элемента"]',false),
('Конвекторы','thermostat_type','Термостат',0.10,'categorical','text',null,'["Термостат","Тип термостата"]',false),
('Конвекторы','power_modes','Режимы мощности',0.06,'higher','number','шт.','["Количество режимов мощности","Режимы мощности","Количество режимов нагрева"]',false),
('Конвекторы','control_type','Управление',0.08,'categorical','text',null,'["Управление","Тип управления"]',false),
('Конвекторы','overheat_protection','Защита от перегрева',0.06,'boolean','boolean',null,'["Защита от перегрева"]',false),
('Конвекторы','ip_rating','Влагозащита',0.05,'categorical','text',null,'["Степень защиты","Класс пылевлагозащиты","Влагозащита"]',false),
('Конвекторы','install_type','Установка',0.05,'categorical','text',null,'["Установка","Варианты установки","Монтаж"]',false),
('Конвекторы','weight_kg','Вес',0.06,'lower','number','кг','["Вес","Масса"]',false)
on conflict(matrix_subgroup,spec_key) do update set label=excluded.label,weight=excluded.weight,direction=excluded.direction,value_type=excluded.value_type,unit=excluded.unit,aliases=excluded.aliases,critical=excluded.critical,updated_at=now();

-- Rules: chain saws.
insert into public.triovist_market_spec_rules_v2(matrix_subgroup,spec_key,label,weight,direction,value_type,unit,aliases,critical) values
('Бензопилы','power_kw','Мощность',0.20,'higher','number','кВт','["Мощность","Мощность двигателя","Номинальная мощность"]',true),
('Бензопилы','engine_cc','Объём двигателя',0.18,'higher','number','см³','["Объем двигателя","Объём двигателя","Рабочий объем двигателя","Рабочий объём двигателя"]',true),
('Бензопилы','bar_cm','Длина шины',0.18,'higher','number','см','["Длина шины","Длина пильной шины"]',true),
('Бензопилы','chain_pitch','Шаг цепи',0.12,'categorical','text',null,'["Шаг цепи"]',true),
('Бензопилы','links_count','Звенья цепи',0.08,'neutral','number','шт.','["Количество звеньев","Число звеньев цепи"]',false),
('Бензопилы','fuel_tank_l','Топливный бак',0.06,'higher','number','л','["Объем топливного бака","Объём топливного бака","Топливный бак"]',false),
('Бензопилы','chain_speed_ms','Скорость цепи',0.10,'higher','number','м/с','["Скорость цепи","Скорость движения цепи"]',false),
('Бензопилы','weight_kg','Вес',0.08,'lower','number','кг','["Вес","Масса"]',false),
('Электропилы','power_w','Мощность',0.24,'higher','number','Вт','["Мощность","Потребляемая мощность","Номинальная мощность"]',true),
('Электропилы','bar_cm','Длина шины',0.20,'higher','number','см','["Длина шины","Длина пильной шины"]',true),
('Электропилы','chain_speed_ms','Скорость цепи',0.16,'higher','number','м/с','["Скорость цепи","Скорость движения цепи"]',false),
('Электропилы','chain_pitch','Шаг цепи',0.12,'categorical','text',null,'["Шаг цепи"]',true),
('Электропилы','motor_position','Расположение двигателя',0.08,'categorical','text',null,'["Расположение двигателя"]',false),
('Электропилы','tool_less_tension','Бесключевое натяжение',0.08,'boolean','boolean',null,'["Бесключевая регулировка натяжения цепи","Бесключевое натяжение цепи","Натяжение цепи без инструмента"]',false),
('Электропилы','weight_kg','Вес',0.08,'lower','number','кг','["Вес","Масса"]',false),
('Электропилы','voltage_v','Напряжение',0.04,'neutral','number','В','["Напряжение аккумулятора","Напряжение"]',false)
on conflict(matrix_subgroup,spec_key) do update set label=excluded.label,weight=excluded.weight,direction=excluded.direction,value_type=excluded.value_type,unit=excluded.unit,aliases=excluded.aliases,critical=excluded.critical,updated_at=now();

-- Generic climate rules copied across current seasonal subgroups; each remains editable.
insert into public.triovist_market_spec_rules_v2(matrix_subgroup,spec_key,label,weight,direction,value_type,unit,aliases,critical)
select s.subgroup,r.spec_key,r.label,r.weight,r.direction,r.value_type,r.unit,r.aliases,r.critical
from (values
 ('Масляные радиаторы'),('Тепловентиляторы'),('Тепловые пушки'),('Инфракрасные обогреватели'),('Тепловые завесы')
) s(subgroup)
cross join (values
 ('power_w','Мощность',0.32::numeric,'higher','number','Вт','["Мощность","Максимальная мощность","Потребляемая мощность","Номинальная мощность"]'::jsonb,true),
 ('area_m2','Площадь',0.18::numeric,'higher','number','м²','["Площадь обогрева","Рекомендуемая площадь помещения","Площадь помещения"]'::jsonb,false),
 ('control_type','Управление',0.10::numeric,'categorical','text',null,'["Управление","Тип управления"]'::jsonb,false),
 ('thermostat_type','Термостат',0.10::numeric,'categorical','text',null,'["Термостат","Тип термостата"]'::jsonb,false),
 ('overheat_protection','Защита от перегрева',0.08::numeric,'boolean','boolean',null,'["Защита от перегрева"]'::jsonb,false),
 ('airflow_m3h','Воздушный поток',0.10::numeric,'higher','number','м³/ч','["Воздушный поток","Производительность по воздуху","Расход воздуха"]'::jsonb,false),
 ('weight_kg','Вес',0.07::numeric,'lower','number','кг','["Вес","Масса"]'::jsonb,false),
 ('voltage_v','Напряжение',0.05::numeric,'neutral','number','В','["Напряжение","Напряжение питания"]'::jsonb,false)
) r(spec_key,label,weight,direction,value_type,unit,aliases,critical)
on conflict(matrix_subgroup,spec_key) do nothing;

insert into public.triovist_market_spec_rules_v2(matrix_subgroup,spec_key,label,weight,direction,value_type,unit,aliases,critical) values
('Увлажнители воздуха','tank_l','Бак для воды',0.18,'higher','number','л','["Объем резервуара для воды","Объём резервуара для воды","Объем бака для воды"]',true),
('Увлажнители воздуха','humidification_ml_h','Производительность',0.22,'higher','number','мл/ч','["Производительность увлажнения","Расход воды","Интенсивность испарения"]',true),
('Увлажнители воздуха','area_m2','Площадь',0.20,'higher','number','м²','["Рекомендуемая площадь помещения","Обслуживаемая площадь","Площадь помещения"]',true),
('Увлажнители воздуха','control_type','Управление',0.10,'categorical','text',null,'["Управление","Тип управления"]',false),
('Увлажнители воздуха','noise_db','Шум',0.10,'lower','number','дБ','["Уровень шума"]',false),
('Увлажнители воздуха','runtime_h','Время работы',0.10,'higher','number','ч','["Время непрерывной работы","Время работы"]',false),
('Увлажнители воздуха','auto_shutdown','Автоотключение',0.10,'boolean','boolean',null,'["Автоматическое отключение","Автоотключение"]',false)
on conflict(matrix_subgroup,spec_key) do update set label=excluded.label,weight=excluded.weight,direction=excluded.direction,value_type=excluded.value_type,unit=excluded.unit,aliases=excluded.aliases,critical=excluded.critical,updated_at=now();

alter table public.triovist_market_categories_v2 enable row level security;
alter table public.triovist_market_runs_v2 enable row level security;
alter table public.triovist_market_products_v2 enable row level security;
alter table public.triovist_market_product_history_v2 enable row level security;
alter table public.triovist_market_our_specs_v2 enable row level security;
alter table public.triovist_market_matches_v2 enable row level security;
alter table public.triovist_market_gaps_v2 enable row level security;
alter table public.triovist_market_spec_rules_v2 enable row level security;

do $$ begin create policy triovist_market_categories_read on public.triovist_market_categories_v2 for select to authenticated using(true); exception when duplicate_object then null; end $$;
do $$ begin create policy triovist_market_runs_read on public.triovist_market_runs_v2 for select to authenticated using(true); exception when duplicate_object then null; end $$;
do $$ begin create policy triovist_market_products_read on public.triovist_market_products_v2 for select to authenticated using(true); exception when duplicate_object then null; end $$;
do $$ begin create policy triovist_market_history_read on public.triovist_market_product_history_v2 for select to authenticated using(true); exception when duplicate_object then null; end $$;
do $$ begin create policy triovist_market_our_specs_read on public.triovist_market_our_specs_v2 for select to authenticated using(true); exception when duplicate_object then null; end $$;
do $$ begin create policy triovist_market_matches_read on public.triovist_market_matches_v2 for select to authenticated using(true); exception when duplicate_object then null; end $$;
do $$ begin create policy triovist_market_gaps_read on public.triovist_market_gaps_v2 for select to authenticated using(true); exception when duplicate_object then null; end $$;
do $$ begin create policy triovist_market_rules_read on public.triovist_market_spec_rules_v2 for select to authenticated using(true); exception when duplicate_object then null; end $$;
grant select on public.triovist_market_categories_v2,public.triovist_market_runs_v2,public.triovist_market_products_v2,
 public.triovist_market_product_history_v2,public.triovist_market_our_specs_v2,public.triovist_market_matches_v2,
 public.triovist_market_gaps_v2,public.triovist_market_spec_rules_v2 to authenticated;
grant select on public.triovist_market_matrix_v2 to authenticated;

create or replace function public.triovist_market_actor_allowed_v2()
returns boolean
language sql stable security definer
set search_path=public,auth,pg_catalog
as $$
  select lower(coalesce((select email from auth.users where id=auth.uid()),'')) in (
    'payushin_ar@resanta.ru','sidarovich_kn@resanta.ru',
    'aleksandrenko_av@resanta.ru','krishtal_na@resanta.ru'
  );
$$;
grant execute on function public.triovist_market_actor_allowed_v2() to authenticated;

create or replace function public.triovist_market_dashboard_v2()
returns jsonb
language plpgsql stable security definer
set search_path=public,auth,pg_catalog
as $$
declare v jsonb;
begin
  if not public.triovist_market_actor_allowed_v2() then
    raise exception 'Нет доступа к конкурентному анализу 21vek' using errcode='42501';
  end if;

  with best as (
    select distinct on (m.category_id,m.product_key)
      m.*
    from public.triovist_market_matches_v2 m
    order by m.category_id,m.product_key,m.similarity_score desc
  ),
  prod as (
    select p.*,c.matrix_group,c.matrix_subgroup
    from public.triovist_market_products_v2 p
    join public.triovist_market_categories_v2 c on c.id=p.category_id
    where c.enabled and p.error_text is null
  ),
  brand_map as (
    select category_id,matrix_subgroup,brand,count(*) models,min(position_no) best_position,
           round(avg(position_no)::numeric,1) avg_position
    from prod
    group by category_id,matrix_subgroup,brand
  ),
  cat_counts as (
    select category_id,count(*) total from prod group by category_id
  ),
  market as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'category_id',b.category_id,'subgroup',b.matrix_subgroup,'brand',coalesce(b.brand,'Не определён'),
      'models',b.models,'best_position',b.best_position,'avg_position',b.avg_position,
      'share_pct',round(b.models::numeric/nullif(cc.total,0)*100,1)
    ) order by b.matrix_subgroup,b.models desc,b.best_position),'[]'::jsonb) j
    from brand_map b join cat_counts cc using(category_id)
  ),
  rows as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'category_id',p.category_id,'group',p.matrix_group,'subgroup',p.matrix_subgroup,
      'product_key',p.product_key,'competitor_brand',p.brand,'competitor_name',p.product_name,
      'competitor_url',p.product_url,'page_no',p.page_no,'position_no',p.position_no,
      'competitor_price',p.current_price,'base_price',p.base_price,'in_stock',p.in_stock,
      'rating',p.product_rating,'review_count',p.review_count,'competitor_specs',p.specs_normalized,
      'our_sku',b.our_sku,'similarity_score',b.similarity_score,'match_class',b.match_class,
      'our_price',b.our_price,'mrc_byn',b.mrc_byn,'mrc_delta_pct',b.mrc_delta_pct,
      'price_delta_pct',b.price_delta_pct,'competitiveness_score',b.competitiveness_score,
      'status',b.status,'advantages',b.advantages,'disadvantages',b.disadvantages,
      'recommendation',b.recommendation,
      'our_name',o.product_name,'our_url',o.product_url,'our_specs',o.specs_normalized,
      'is_gap',(g.product_key is not null)
    ) order by p.matrix_subgroup,p.position_no),'[]'::jsonb) j
    from prod p
    left join best b on b.category_id=p.category_id and b.product_key=p.product_key
    left join public.triovist_market_our_specs_v2 o on o.sku=b.our_sku
    left join public.triovist_market_gaps_v2 g on g.category_id=p.category_id and g.product_key=p.product_key
  ),
  last_run as (
    select to_jsonb(r) j from public.triovist_market_runs_v2 r order by r.started_at desc limit 1
  )
  select jsonb_build_object(
    'version','v23.6.224',
    'last_run',(select j from last_run),
    'summary',jsonb_build_object(
      'categories',(select count(*) from public.triovist_market_categories_v2 where enabled),
      'products',(select count(*) from prod),
      'brands',(select count(distinct lower(coalesce(brand,''))) from prod where nullif(brand,'') is not null),
      'ours_stronger',(select count(*) from best where status='ours_stronger'),
      'competitor_stronger',(select count(*) from best where status='competitor_stronger'),
      'parity',(select count(*) from best where status='parity'),
      'gaps',(select count(*) from public.triovist_market_gaps_v2),
      'below_mrc',(select count(*) from best where coalesce(mrc_delta_pct,0)<0)
    ),
    'market',(select j from market),
    'rows',(select j from rows),
    'allowed_users',jsonb_build_array('Паюшин','Сидарович','Александренко','Кришталь')
  ) into v;
  return v;
end;
$$;
grant execute on function public.triovist_market_dashboard_v2() to authenticated;

create or replace function public.triovist_market_export_v2(
  p_kind text default 'comparison',
  p_offset integer default 0,
  p_limit integer default 500
)
returns jsonb
language plpgsql stable security definer
set search_path=public,auth,pg_catalog
as $$
declare
  v_rows jsonb:='[]'::jsonb;
  v_total integer:=0;
  v_off integer:=greatest(coalesce(p_offset,0),0);
  v_lim integer:=least(greatest(coalesce(p_limit,500),1),500);
begin
  if not public.triovist_market_actor_allowed_v2() then
    raise exception 'Нет доступа к конкурентному анализу 21vek' using errcode='42501';
  end if;

  if p_kind='raw' then
    select count(*) into v_total from public.triovist_market_products_v2 p
      join public.triovist_market_categories_v2 c on c.id=p.category_id where c.enabled;
    select coalesce(jsonb_agg(x),'[]'::jsonb) into v_rows from (
      select jsonb_build_object(
        'group',c.matrix_group,'subgroup',c.matrix_subgroup,'brand',p.brand,'model',p.model,'name',p.product_name,
        'page',p.page_no,'position',p.position_no,'price',p.current_price,'base_price',p.base_price,'in_stock',p.in_stock,
        'rating',p.product_rating,'reviews',p.review_count,'url',p.product_url,'observed_at',p.observed_at,
        'specs',p.specs_normalized,'error',p.error_text
      ) x
      from public.triovist_market_products_v2 p join public.triovist_market_categories_v2 c on c.id=p.category_id
      where c.enabled order by c.matrix_group,c.matrix_subgroup,p.position_no
      limit v_lim offset v_off
    ) q;
  elsif p_kind='gaps' then
    select count(*) into v_total from public.triovist_market_gaps_v2;
    select coalesce(jsonb_agg(x),'[]'::jsonb) into v_rows from (
      select jsonb_build_object(
        'group',c.matrix_group,'subgroup',c.matrix_subgroup,'brand',p.brand,'name',p.product_name,
        'position',p.position_no,'price',p.current_price,'url',p.product_url,
        'best_similarity',g.best_similarity,'best_our_sku',g.best_our_sku,'reason',g.reason
      ) x
      from public.triovist_market_gaps_v2 g
      join public.triovist_market_products_v2 p on p.category_id=g.category_id and p.product_key=g.product_key
      join public.triovist_market_categories_v2 c on c.id=g.category_id
      order by c.matrix_group,c.matrix_subgroup,p.position_no
      limit v_lim offset v_off
    ) q;
  elsif p_kind='errors' then
    select count(*) into v_total from public.triovist_market_products_v2 p
      join public.triovist_market_categories_v2 c on c.id=p.category_id
      where c.enabled and p.error_text is not null;
    select coalesce(jsonb_agg(x),'[]'::jsonb) into v_rows from (
      select jsonb_build_object(
        'group',c.matrix_group,'subgroup',c.matrix_subgroup,'brand',p.brand,'name',p.product_name,
        'position',p.position_no,'url',p.product_url,'error',p.error_text,'observed_at',p.observed_at
      ) x
      from public.triovist_market_products_v2 p join public.triovist_market_categories_v2 c on c.id=p.category_id
      where c.enabled and p.error_text is not null
      order by c.matrix_group,c.matrix_subgroup,p.position_no
      limit v_lim offset v_off
    ) q;
  else
    with best as (
      select distinct on (m.category_id,m.product_key) m.*
      from public.triovist_market_matches_v2 m
      order by m.category_id,m.product_key,m.similarity_score desc
    )
    select count(*) into v_total
    from public.triovist_market_products_v2 p
    join public.triovist_market_categories_v2 c on c.id=p.category_id
    left join best b on b.category_id=p.category_id and b.product_key=p.product_key
    where c.enabled;
    with best as (
      select distinct on (m.category_id,m.product_key) m.*
      from public.triovist_market_matches_v2 m
      order by m.category_id,m.product_key,m.similarity_score desc
    )
    select coalesce(jsonb_agg(x),'[]'::jsonb) into v_rows from (
      select jsonb_build_object(
        'group',c.matrix_group,'subgroup',c.matrix_subgroup,'our_sku',b.our_sku,'our_name',o.product_name,
        'mrc',b.mrc_byn,'our_price',b.our_price,'mrc_delta_pct',b.mrc_delta_pct,
        'competitor_brand',p.brand,'competitor_name',p.product_name,'position',p.position_no,'page',p.page_no,
        'competitor_price',p.current_price,'price_delta_pct',b.price_delta_pct,
        'similarity',b.similarity_score,'match_class',b.match_class,'advantages',b.advantages,
        'disadvantages',b.disadvantages,'status',b.status,'recommendation',b.recommendation,
        'our_url',o.product_url,'competitor_url',p.product_url
      ) x
      from public.triovist_market_products_v2 p
      join public.triovist_market_categories_v2 c on c.id=p.category_id
      left join best b on b.category_id=p.category_id and b.product_key=p.product_key
      left join public.triovist_market_our_specs_v2 o on o.sku=b.our_sku
      where c.enabled
      order by c.matrix_group,c.matrix_subgroup,p.position_no
      limit v_lim offset v_off
    ) q;
  end if;

  return jsonb_build_object(
    'rows',v_rows,'total',v_total,'offset',v_off,'limit',v_lim,
    'has_more',(v_off+jsonb_array_length(v_rows)<v_total)
  );
end;
$$;
grant execute on function public.triovist_market_export_v2(text,integer,integer) to authenticated;
