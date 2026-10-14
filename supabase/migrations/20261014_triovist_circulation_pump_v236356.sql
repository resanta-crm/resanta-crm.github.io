-- RESANTA CRM v23.6.356
-- Competitor parser profile: circulation pumps.

insert into public.triovist_market_rules_v1(profile_key,spec_key,label,weight,direction,unit,aliases,critical)
values
('circulation_pump','max_head_m','Максимальный напор',0.30,'higher','м',
 '["Максимальный напор","Макс. напор","Напор","Максимальный напор воды","Макс. напор воды","Максимальная высота подъема","Максимальная высота подъёма","Высота подъема","Высота подъёма"]'::jsonb,true),
('circulation_pump','flow_rate_m3h','Пропускная способность',0.25,'higher','м³/ч',
 '["Пропускная способность","Производительность","Максимальная производительность","Макс. производительность","Максимальная подача","Макс. подача","Подача","Расход воды","Расход жидкости"]'::jsonb,true),
('circulation_pump','pressure_bar','Максимальное давление',0.20,'higher','бар',
 '["Максимальное давление","Макс. давление","Рабочее давление","Давление","Максимальное рабочее давление","Допустимое давление"]'::jsonb,true),
('circulation_pump','input_power_w','Мощность',0.15,'lower','Вт',
 '["Мощность","Потребляемая мощность","Номинальная мощность","Максимальная мощность","Макс. мощность","Энергопотребление"]'::jsonb,true),
('circulation_pump','filter_particle_mm','Размер фильтруемых частиц',0.10,'higher','мм',
 '["Размер фильтруемых частиц","Размер фильтрующих частиц","Макс. размер частиц","Максимальный размер частиц","Максимальный пропуск частиц","Макс. пропуск частиц","Диаметр пропускаемых частиц","Размер загрязнений","Допустимый размер частиц"]'::jsonb,false)
on conflict(profile_key,spec_key) do update set
 label=excluded.label,weight=excluded.weight,direction=excluded.direction,unit=excluded.unit,
 aliases=excluded.aliases,critical=excluded.critical,updated_at=now();

insert into public.triovist_market_scopes_v1(
 scope_key,source_category,source_subgroup,source_prefix,search_query,profile_key,
 enabled,own_sku_count,derived_from_price_at,updated_at
)
values(
 'circulation_pump-76a06ec1','Насосы','Циркуляционные насосы',null,'циркуляционный насос','circulation_pump',
 true,20,now(),now()
)
on conflict(scope_key) do update set
 source_category=excluded.source_category,
 source_subgroup=excluded.source_subgroup,
 source_prefix=excluded.source_prefix,
 search_query=excluded.search_query,
 profile_key=excluded.profile_key,
 enabled=true,
 own_sku_count=20,
 derived_from_price_at=excluded.derived_from_price_at,
 updated_at=excluded.updated_at;
