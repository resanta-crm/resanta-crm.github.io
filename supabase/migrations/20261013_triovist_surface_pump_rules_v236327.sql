-- RESANTA CRM v23.6.327 · approved surface pump competitor rules
insert into public.triovist_market_rules_v1
(profile_key,spec_key,label,weight,direction,unit,aliases,critical,updated_at)
values
('surface_pump','flow_rate_lmin','Пропускная способность',0.20,'higher','л/мин',
 '["Пропускная способность","Производительность","Максимальная производительность","Макс. производительность","Максимальная подача","Макс. подача","Подача","Расход воды","Расход жидкости"]'::jsonb,true,now()),
('surface_pump','input_power_w','Мощность',0.20,'higher','Вт',
 '["Мощность","Потребляемая мощность","Номинальная мощность","Мощность двигателя","Максимальная мощность"]'::jsonb,true,now()),
('surface_pump','max_head_m','Максимальный напор воды',0.20,'higher','м',
 '["Максимальный напор воды","Макс. напор воды","Максимальный напор","Макс. напор","Напор","Максимальная высота подъема","Максимальная высота подъёма","Высота подъема","Высота подъёма"]'::jsonb,true,now()),
('surface_pump','max_suction_depth_m','Глубина откачки',0.20,'higher','м',
 '["Глубина откачки","Максимальная глубина откачки","Макс. глубина откачки","Глубина всасывания","Максимальная глубина всасывания","Макс. глубина всасывания","Высота всасывания","Максимальная высота всасывания","Глубина забора воды","Максимальная глубина забора воды"]'::jsonb,true,now()),
('surface_pump','water_type','Тип воды',0.20,'categorical',null,
 '["Тип воды","Вид воды","Качество воды","Перекачиваемая вода","Тип перекачиваемой воды","Тип перекачиваемой жидкости","Перекачиваемая жидкость","Назначение по воде"]'::jsonb,true,now())
on conflict (profile_key,spec_key) do update set
 label=excluded.label,weight=excluded.weight,direction=excluded.direction,unit=excluded.unit,
 aliases=excluded.aliases,critical=excluded.critical,updated_at=excluded.updated_at;
