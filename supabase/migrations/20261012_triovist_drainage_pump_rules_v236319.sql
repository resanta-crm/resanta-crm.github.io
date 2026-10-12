-- Triovist competitor parser: approved drainage pump rules v23.6.319
insert into public.triovist_market_rules_v1
(profile_key,spec_key,label,weight,direction,unit,aliases,critical,updated_at)
values
('drainage_pump','flow_rate_lmin','Производительность',0.25,'higher','л/мин',
 '["Производительность","Максимальная производительность","Макс. производительность","Пропускная способность","Подача","Максимальная подача","Расход воды"]'::jsonb,true,now()),
('drainage_pump','input_power_w','Мощность',0.20,'higher','Вт',
 '["Мощность","Потребляемая мощность","Номинальная мощность","Мощность двигателя"]'::jsonb,true,now()),
('drainage_pump','max_head_m','Максимальный напор',0.25,'higher','м',
 '["Максимальный напор","Макс. напор","Напор","Высота подъема","Высота подъёма","Максимальная высота подъема","Максимальная высота подъёма"]'::jsonb,true,now()),
('drainage_pump','pump_body_material','Материал корпуса',0.15,'neutral',null,
 '["Материал корпуса","Корпус","Материал корпуса насоса","Материал насоса"]'::jsonb,true,now()),
('drainage_pump','filter_particle_mm','Размер фильтрующих частиц',0.15,'higher','мм',
 '["Размер фильтрующих частиц","Макс. размер частиц","Максимальный размер частиц","Диаметр пропускаемых частиц","Размер загрязнений","Размер загрязнений в воде","Максимальный диаметр твердых частиц","Максимальный диаметр твёрдых частиц","Допустимый размер частиц"]'::jsonb,true,now())
on conflict (profile_key,spec_key) do update set
 label=excluded.label,weight=excluded.weight,direction=excluded.direction,unit=excluded.unit,
 aliases=excluded.aliases,critical=excluded.critical,updated_at=excluded.updated_at;
