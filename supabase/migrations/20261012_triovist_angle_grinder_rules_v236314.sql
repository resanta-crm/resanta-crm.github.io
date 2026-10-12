-- Triovist competitor parser: approved angle grinder rules v23.6.314
insert into public.triovist_market_rules_v1
(profile_key,spec_key,label,weight,direction,unit,aliases,critical,updated_at)
values
('angle_grinder','power_source','Источник питания',0.00,'categorical',null,
 '["Источник питания","Питание","Тип питания","Электропитание"]'::jsonb,true,now()),
('angle_grinder','motor_type','Тип двигателя',0.20,'neutral',null,
 '["Тип двигателя","Тип электродвигателя","Двигатель","Тип мотора","Мотор"]'::jsonb,true,now()),
('angle_grinder','battery_capacity_ah','Емкость АКБ',0.25,'higher','А·ч',
 '["Емкость аккумулятора","Ёмкость аккумулятора","Емкость АКБ","Ёмкость АКБ","Емкость батареи","Ёмкость батареи"]'::jsonb,true,now()),
('angle_grinder','input_power_w','Мощность',0.25,'higher','Вт',
 '["Мощность","Потребляемая мощность","Номинальная мощность","Входная мощность","Мощность двигателя"]'::jsonb,true,now()),
('angle_grinder','soft_start_present','Плавный пуск',0.15,'categorical',null,
 '["Плавный пуск","Плавный старт","Мягкий пуск","Soft start"]'::jsonb,true,now()),
('angle_grinder','speed_adjustment_present','Регулировка оборотов',0.15,'categorical',null,
 '["Регулировка оборотов","Регулировка числа оборотов","Регулировка скорости","Регулировка частоты вращения","Регулятор оборотов","Электронная регулировка оборотов"]'::jsonb,true,now()),
('angle_grinder','grinder_disc_diameter_mm','Диаметр диска',0.25,'categorical','мм',
 '["Диаметр диска","Диаметр шлифовального диска","Максимальный диаметр диска","Макс. диаметр диска","Диаметр круга","Диаметр отрезного диска"]'::jsonb,true,now())
on conflict (profile_key,spec_key) do update set
 label=excluded.label,weight=excluded.weight,direction=excluded.direction,unit=excluded.unit,
 aliases=excluded.aliases,critical=excluded.critical,updated_at=excluded.updated_at;
