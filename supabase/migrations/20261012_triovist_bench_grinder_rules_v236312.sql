-- Triovist competitor parser: approved bench grinder rules v23.6.312
insert into public.triovist_market_rules_v1
(profile_key,spec_key,label,weight,direction,unit,aliases,critical,updated_at)
values
('bench_grinder','motor_type','Тип двигателя',0.20,'neutral',null,
 '["Тип двигателя","Тип электродвигателя","Двигатель","Тип мотора","Мотор"]'::jsonb,true,now()),
('bench_grinder','input_power_w','Мощность',0.30,'higher','Вт',
 '["Мощность","Потребляемая мощность","Номинальная мощность","Входная мощность","Мощность двигателя"]'::jsonb,true,now()),
('bench_grinder','max_rpm','Скорость вращения',0.20,'neutral','об/мин',
 '["Скорость вращения","Максимальная скорость вращения","Макс. скорость вращения","Максимальное число оборотов","Макс. число оборотов","Обороты холостого хода","Частота вращения","Максимальные обороты","Частота вращения шпинделя"]'::jsonb,true,now()),
('bench_grinder','grinding_wheel_diameter_mm','Диаметр круга',0.30,'categorical','мм',
 '["Диаметр круга","Диаметр шлифовального круга","Диаметр точильного круга","Диаметр диска","Диаметр шлифовального диска","Наружный диаметр круга","Размер круга"]'::jsonb,true,now())
on conflict (profile_key,spec_key) do update set
 label=excluded.label,weight=excluded.weight,direction=excluded.direction,unit=excluded.unit,
 aliases=excluded.aliases,critical=excluded.critical,updated_at=excluded.updated_at;
