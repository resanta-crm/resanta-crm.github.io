-- Triovist competitor parser: approved garden shredder rules v23.6.281
insert into public.triovist_market_rules_v1
(profile_key,spec_key,label,weight,direction,unit,aliases,critical,updated_at)
values
('garden_shredder','device_type','Тип',0.07,'categorical',null,'["Тип","Тип измельчителя","Вид","Вид устройства","Тип устройства"]'::jsonb,true,now()),
('garden_shredder','processed_material','Перерабатываемый материал измельчителем',0.08,'categorical',null,'["Перерабатываемый материал измельчителем","Перерабатываемый материал","Измельчаемый материал","Материал для измельчения","Тип отходов"]'::jsonb,false,now()),
('garden_shredder','body_material','Материал корпуса',0.03,'neutral',null,'["Материал корпуса","Корпус"]'::jsonb,false,now()),
('garden_shredder','cutting_mechanism','Режущий механизм',0.15,'neutral',null,'["Режущий механизм","Механизм измельчения","Система измельчения","Режущая система","Тип режущего механизма"]'::jsonb,true,now()),
('garden_shredder','input_power_w','Входная мощность',0.14,'higher','Вт','["Входная мощность","Потребляемая мощность","Мощность","Номинальная мощность","Мощность двигателя"]'::jsonb,true,now()),
('garden_shredder','voltage_v','Напряжение',0.07,'neutral','В','["Напряжение","Рабочее напряжение","Напряжение питания","Напряжение сети"]'::jsonb,false,now()),
('garden_shredder','noise_db','Уровень шума',0.04,'lower','дБ','["Уровень шума","Шум","Уровень звукового давления","Уровень звуковой мощности"]'::jsonb,false,now()),
('garden_shredder','cutting_speed_rpm','Скорость резания',0.05,'neutral','об/мин','["Скорость резания","Скорость вращения","Частота вращения","Обороты режущего механизма","Скорость вращения режущего механизма"]'::jsonb,false,now()),
('garden_shredder','max_branch_diameter_mm','Максимальный диаметр веток',0.17,'higher','мм','["Максимальный диаметр веток","Макс. диаметр веток","Максимальный диаметр ветвей","Макс. диаметр ветвей","Максимальная толщина веток","Макс. толщина веток","Диаметр веток"]'::jsonb,true,now()),
('garden_shredder','engine_type','Тип двигателя',0.10,'categorical',null,'["Тип двигателя","Двигатель","Тип мотора","Тип электродвигателя"]'::jsonb,true,now()),
('garden_shredder','collector_capacity_l','Емкость бункера/травосборника',0.04,'higher','л','["Емкость бункера/травосборника","Ёмкость бункера/травосборника","Емкость бункера","Ёмкость бункера","Объем бункера","Объём бункера","Емкость травосборника","Ёмкость травосборника","Объем травосборника","Объём травосборника","Объем контейнера","Объём контейнера"]'::jsonb,false,now()),
('garden_shredder','feed_openings_count','Кол-во загрузочных отверстий',0.02,'higher','шт.','["Кол-во загрузочных отверстий","Количество загрузочных отверстий","Число загрузочных отверстий","Количество воронок","Загрузочные отверстия"]'::jsonb,false,now()),
('garden_shredder','collector_present','Бункер/травосборник',0.02,'boolean',null,'["Бункер/травосборник","Бункер","Травосборник","Наличие бункера","Наличие травосборника","Контейнер для отходов"]'::jsonb,false,now()),
('garden_shredder','collector_type','Тип бункера/травосборника',0.02,'neutral',null,'["Тип бункера/травосборника","Тип бункера","Тип травосборника","Тип контейнера","Вид травосборника"]'::jsonb,false,now())
on conflict (profile_key,spec_key) do update set
 label=excluded.label,weight=excluded.weight,direction=excluded.direction,unit=excluded.unit,
 aliases=excluded.aliases,critical=excluded.critical,updated_at=excluded.updated_at;
