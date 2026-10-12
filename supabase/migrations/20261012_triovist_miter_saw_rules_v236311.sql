-- Triovist competitor parser: approved miter saw rules v23.6.311
insert into public.triovist_market_rules_v1
(profile_key,spec_key,label,weight,direction,unit,aliases,critical,updated_at)
values
('miter_saw','input_power_w','Мощность',0.18,'higher','Вт',
 '["Мощность","Потребляемая мощность","Номинальная мощность","Входная мощность","Мощность двигателя"]'::jsonb,true,now()),
('miter_saw','blade_diameter_mm','Диаметр диска',0.20,'categorical','мм',
 '["Диаметр диска","Диаметр пильного диска","Наружный диаметр диска","Максимальный диаметр диска","Макс. диаметр диска"]'::jsonb,true,now()),
('miter_saw','sliding_present','Наличие протяжки',0.18,'categorical',null,
 '["Наличие протяжки","Протяжка","Функция протяжки","Протяжной механизм","Горизонтальное перемещение пильной головы","Скольжение"]'::jsonb,true,now()),
('miter_saw','cut_depth_90_mm','Глубина реза под 90°',0.18,'higher','мм',
 '["Глубина реза под 90°","Глубина реза 90°","Глубина пропила под 90°","Глубина пропила 90°","Максимальная глубина реза под углом 90°","Максимальная глубина пропила под углом 90°","Макс. глубина пропила 90°"]'::jsonb,true,now()),
('miter_saw','cut_depth_45_mm','Глубина реза под 45°',0.14,'higher','мм',
 '["Глубина реза под 45°","Глубина реза 45°","Глубина пропила под 45°","Глубина пропила 45°","Максимальная глубина реза под углом 45°","Максимальная глубина пропила под углом 45°","Макс. глубина пропила 45°"]'::jsonb,true,now()),
('miter_saw','max_rpm','Скорость вращения',0.12,'neutral','об/мин',
 '["Скорость вращения","Максимальная скорость вращения","Макс. скорость вращения","Максимальное число оборотов","Макс. число оборотов","Обороты холостого хода","Частота вращения","Максимальные обороты"]'::jsonb,true,now())
on conflict (profile_key,spec_key) do update set
 label=excluded.label,weight=excluded.weight,direction=excluded.direction,unit=excluded.unit,
 aliases=excluded.aliases,critical=excluded.critical,updated_at=excluded.updated_at;
