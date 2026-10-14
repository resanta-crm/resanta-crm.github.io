-- RESANTA CRM v23.6.355
-- Competitor parser profile: fecal pumps.

insert into public.triovist_market_rules_v1(profile_key,spec_key,label,weight,direction,unit,aliases,critical)
values
('fecal_pump','pump_body_material','Материал корпуса',0.1429,'neutral',null,
 '["Материал корпуса","Корпус","Материал корпуса насоса","Материал насоса"]'::jsonb,true),
('fecal_pump','flow_rate_lmin','Пропускная способность',0.1429,'higher','л/мин',
 '["Пропускная способность","Производительность","Максимальная производительность","Макс. производительность","Максимальная подача","Макс. подача","Подача","Расход воды","Расход жидкости"]'::jsonb,true),
('fecal_pump','max_head_m','Максимальный напор',0.1429,'higher','м',
 '["Максимальный напор","Макс. напор","Напор","Максимальный напор воды","Макс. напор воды","Максимальная высота подъема","Максимальная высота подъёма","Высота подъема","Высота подъёма"]'::jsonb,true),
('fecal_pump','connection_diameter_in','Диаметр разъема соединения',0.1429,'neutral','дюйм',
 '["Диаметр разъема соединения","Диаметр разъёма соединения","Диаметр соединения","Диаметр подключения","Диаметр присоединения","Размер присоединения","Диаметр патрубка","Диаметр выходного патрубка","Выходной диаметр","Диаметр выходного отверстия"]'::jsonb,true),
('fecal_pump','filter_particle_mm','Размер фильтруемых частиц',0.1429,'higher','мм',
 '["Размер фильтруемых частиц","Размер фильтрующих частиц","Макс. размер частиц","Максимальный размер частиц","Максимальный пропуск частиц","Макс. пропуск частиц","Диаметр пропускаемых частиц","Размер загрязнений","Максимальный диаметр твердых частиц","Максимальный диаметр твёрдых частиц","Допустимый размер частиц"]'::jsonb,true),
('fecal_pump','grinder_present','Измельчитель',0.1429,'boolean',null,
 '["Измельчитель","Наличие измельчителя","Режущий механизм","Режущая система","Режущий нож","Нож-измельчитель","Нож измельчитель"]'::jsonb,true),
('fecal_pump','water_type','Тип воды',0.1429,'categorical',null,
 '["Тип воды","Вид воды","Качество воды","Перекачиваемая вода","Тип перекачиваемой воды","Тип перекачиваемой жидкости","Перекачиваемая жидкость","Назначение по воде"]'::jsonb,true)
on conflict(profile_key,spec_key) do update set
 label=excluded.label,weight=excluded.weight,direction=excluded.direction,unit=excluded.unit,
 aliases=excluded.aliases,critical=excluded.critical;

insert into public.triovist_market_scopes_v1(
 scope_key,source_category,source_subgroup,source_prefix,search_query,profile_key,
 enabled,own_sku_count,derived_from_price_at,updated_at
)
values(
 'fecal_pump-efb24d54','Насосы','Фекальные насосы',null,'фекальный насос','fecal_pump',
 true,15,now(),now()
)
on conflict(scope_key) do update set
 source_category=excluded.source_category,
 source_subgroup=excluded.source_subgroup,
 source_prefix=excluded.source_prefix,
 search_query=excluded.search_query,
 profile_key=excluded.profile_key,
 enabled=true,
 own_sku_count=15,
 derived_from_price_at=excluded.derived_from_price_at,
 updated_at=excluded.updated_at;
