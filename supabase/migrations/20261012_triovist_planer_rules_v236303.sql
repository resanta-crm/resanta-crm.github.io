-- Triovist competitor parser: approved electric planer rules v23.6.303
insert into public.triovist_market_rules_v1
(profile_key,spec_key,label,weight,direction,unit,aliases,critical,updated_at)
values
('planer','motor_type','Тип двигателя',0.15,'neutral',null,'["Тип двигателя","Тип электродвигателя","Двигатель","Тип мотора","Мотор"]'::jsonb,true,now()),
('planer','max_rpm','Максимальные обороты',0.20,'neutral','об/мин','["Максимальные обороты","Макс. обороты","Максимальное число оборотов","Макс. число оборотов","Максимальная скорость вращения","Макс. скорость вращения","Частота вращения","Максимальная частота вращения","Обороты холостого хода","Максимальные обороты холостого хода","Частота вращения барабана"]'::jsonb,true,now()),
('planer','planing_depth_mm','Глубина строгания',0.35,'higher','мм','["Глубина строгания","Максимальная глубина строгания","Макс. глубина строгания","Глубина выборки","Максимальная глубина выборки","Глубина съема","Глубина снятия стружки"]'::jsonb,true,now()),
('planer','planing_width_mm','Ширина строгания',0.30,'neutral','мм','["Ширина строгания","Максимальная ширина строгания","Макс. ширина строгания","Ширина обработки","Рабочая ширина","Ширина ножа","Ширина ножей"]'::jsonb,true,now())
on conflict (profile_key,spec_key) do update set
 label=excluded.label,weight=excluded.weight,direction=excluded.direction,unit=excluded.unit,
 aliases=excluded.aliases,critical=excluded.critical,updated_at=excluded.updated_at;
