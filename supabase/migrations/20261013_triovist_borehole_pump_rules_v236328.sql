-- RESANTA CRM v23.6.328 · approved borehole pump competitor rules
insert into public.triovist_market_rules_v1
(profile_key,spec_key,label,weight,direction,unit,aliases,critical,updated_at)
values
('borehole_pump','water_type','Тип воды',0.142857,'categorical',null,
 '["Тип воды","Вид воды","Качество воды","Перекачиваемая вода","Тип перекачиваемой воды","Тип перекачиваемой жидкости","Перекачиваемая жидкость","Назначение по воде"]'::jsonb,true,now()),
('borehole_pump','operating_principle','Принцип действия',0.142857,'categorical',null,
 '["Принцип действия","Принцип работы","Тип механизма","Механизм насоса","Тип насосного механизма"]'::jsonb,true,now()),
('borehole_pump','max_head_m','Максимальный напор',0.142857,'higher','м',
 '["Максимальный напор","Макс. напор","Максимальный напор воды","Макс. напор воды","Напор","Максимальная высота подъема","Максимальная высота подъёма","Высота подъема","Высота подъёма"]'::jsonb,true,now()),
('borehole_pump','max_pumping_depth_m','Глубина откачки',0.142857,'higher','м',
 '["Глубина откачки","Максимальная глубина откачки","Макс. глубина откачки","Глубина забора воды","Максимальная глубина забора воды","Макс. глубина забора воды"]'::jsonb,true,now()),
('borehole_pump','max_immersion_depth_m','Глубина погружения',0.142857,'higher','м',
 '["Глубина погружения","Максимальная глубина погружения","Макс. глубина погружения","Допустимая глубина погружения","Максимальная глубина погружения под воду"]'::jsonb,true,now()),
('borehole_pump','well_diameter_mm','Диаметр скважины',0.142857,'neutral','мм',
 '["Диаметр скважины","Минимальный диаметр скважины","Мин. диаметр скважины","Внутренний диаметр скважины","Диаметр обсадной трубы","Минимальный диаметр обсадной трубы"]'::jsonb,true,now()),
('borehole_pump','flow_rate_lmin','Пропускная способность',0.142857,'higher','л/мин',
 '["Пропускная способность","Производительность","Максимальная производительность","Макс. производительность","Максимальная подача","Макс. подача","Подача","Расход воды","Расход жидкости"]'::jsonb,true,now())
on conflict (profile_key,spec_key) do update set
 label=excluded.label,weight=excluded.weight,direction=excluded.direction,unit=excluded.unit,
 aliases=excluded.aliases,critical=excluded.critical,updated_at=excluded.updated_at;
