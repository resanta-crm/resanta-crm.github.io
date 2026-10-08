-- Triovist competitor parser: approved heat-gun class split v23.6.261
delete from public.triovist_market_rules_v1 where profile_key='heat_gun';

insert into public.triovist_market_rules_v1
(profile_key,spec_key,label,weight,direction,unit,aliases,critical,updated_at)
values
('heat_gun','fuel_type','Тип',0.1167,'categorical',null,'["Тип","Тип топлива","Вид топлива","Источник энергии","Тип нагрева"]'::jsonb,true,now()),
('heat_gun','power_w','Тепловая мощность',0.2633,'neutral','Вт','["Тепловая мощность","Мощность","Максимальная мощность","Номинальная мощность","Мощность обогрева"]'::jsonb,false,now()),
('heat_gun','airflow_m3h','Производительность',0.1667,'neutral','м³/ч','["Производительность","Воздушный поток","Расход воздуха","Производительность по воздуху"]'::jsonb,false,now()),
('heat_gun','voltage_v','Напряжение',0.0667,'neutral','В','["Напряжение","Напряжение питания","Рабочее напряжение","Электропитание"]'::jsonb,false,now()),
('heat_gun','heater_type','Тип нагревательного элемента',0.0333,'categorical',null,'["Тип нагревательного элемента","Нагревательный элемент"]'::jsonb,false,now()),
('heat_gun','control_type','Управление',0.0433,'categorical',null,'["Управление","Тип управления"]'::jsonb,false,now()),
('heat_gun','thermostat_type','Термостат',0.0433,'categorical',null,'["Термостат","Тип термостата"]'::jsonb,false,now()),
('heat_gun','overheat_protection','Защита от перегрева',0.0400,'boolean',null,'["Защита от перегрева","Защита от перегрева корпуса"]'::jsonb,false,now()),
('heat_gun','power_adjustment','Регулировка мощности',0.0400,'boolean',null,'["Регулировка мощности","Регулятор мощности","Выбор мощности","Ступени мощности"]'::jsonb,false,now()),
('heat_gun','temperature_adjustment','Регулировка температуры',0.0233,'boolean',null,'["Регулировка температуры","Регулятор температуры","Настройка температуры","Установка температуры"]'::jsonb,false,now()),
('heat_gun','fan_only_mode','Режим вентиляции',0.0200,'boolean',null,'["Режим вентиляции","Вентиляция без нагрева","Обдув без нагрева","Холодный обдув","Режим вентилятора"]'::jsonb,false,now()),
('heat_gun','fuel_consumption_kgh','Расход топлива',0.0667,'neutral','кг/ч','["Расход топлива","Расход газа","Расход дизельного топлива"]'::jsonb,false,now()),
('heat_gun','tank_l','Емкость бака',0.0267,'neutral','л','["Емкость бака","Ёмкость бака","Объем топливного бака","Объём топливного бака","Объем бака","Объём бака"]'::jsonb,false,now()),
('heat_gun','heating_mode','Нагрев',0.0500,'categorical',null,'["Нагрев","Тип нагрева","Способ нагрева","Прямой нагрев","Непрямой нагрев"]'::jsonb,false,now());
