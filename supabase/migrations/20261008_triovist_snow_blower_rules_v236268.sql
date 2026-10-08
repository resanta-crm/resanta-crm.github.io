-- Triovist competitor parser: approved snow blower class formulas v23.6.268
delete from public.triovist_market_rules_v1 where profile_key='snow_blower';

insert into public.triovist_market_rules_v1
(profile_key,spec_key,label,weight,direction,unit,aliases,critical,updated_at)
values
('snow_blower','device_type','Тип',0.0500,'categorical',null,'["Тип","Тип устройства","Вид устройства"]'::jsonb,true,now()),
('snow_blower','snow_blower_type','Тип снегоуборщика',0.0700,'categorical',null,'["Тип снегоуборщика","Вид снегоуборщика","Система очистки","Тип системы очистки","Самоходность"]'::jsonb,false,now()),
('snow_blower','power_source','Источник питания',0.1000,'categorical',null,'["Источник питания","Тип питания","Тип двигателя"]'::jsonb,true,now()),
('snow_blower','battery_capacity_ah','Емкость аккумулятора',0.0500,'neutral','А·ч','["Емкость аккумулятора","Ёмкость аккумулятора","Емкость батареи","Ёмкость батареи"]'::jsonb,false,now()),
('snow_blower','battery_voltage_v','Напряжение аккумулятора',0.0600,'neutral','В','["Напряжение аккумулятора","Напряжение батареи","Напряжение АКБ"]'::jsonb,false,now()),
('snow_blower','clearing_width_cm','Ширина обработки',0.1000,'neutral','см','["Ширина обработки","Ширина захвата","Рабочая ширина","Ширина ковша"]'::jsonb,false,now()),
('snow_blower','intake_height_cm','Высота обработки',0.0800,'neutral','см','["Высота обработки","Высота захвата","Рабочая высота","Высота ковша"]'::jsonb,false,now()),
('snow_blower','throw_distance_m','Максимальная дальность выброса',0.0800,'neutral','м','["Максимальная дальность выброса","Макс. дальность выброса","Дальность выброса снега","Дальность выброса"]'::jsonb,false,now()),
('snow_blower','drive_type','Движитель',0.0700,'categorical',null,'["Движитель","Тип движителя","Ходовая часть","Тип перемещения"]'::jsonb,false,now()),
('snow_blower','operator_panel_control','Управление с панели оператора',0.0300,'boolean',null,'["Управление с панели оператора","Управление желобом с панели оператора","Регулировка направления выброса с панели оператора"]'::jsonb,false,now()),
('snow_blower','motor_power_w','Мощность двигателя',0.0800,'neutral','Вт','["Мощность электродвигателя","Мощность двигателя на топливе","Мощность двигателя","Мощность ДВС","Мощность бензинового двигателя"]'::jsonb,false,now()),
('snow_blower','gears','Количество передач',0.0400,'categorical',null,'["Количество передач","Число передач","Передачи"]'::jsonb,false,now()),
('snow_blower','headlight','Фара',0.0200,'boolean',null,'["Фара","Наличие фары","Фары","Светодиодная фара"]'::jsonb,false,now()),
('snow_blower','engine_cc','Рабочий объем двигателя',0.0500,'neutral','см³','["Рабочий объем двигателя","Рабочий объём двигателя","Объем двигателя","Объём двигателя"]'::jsonb,false,now()),
('snow_blower','tank_l','Емкость бака',0.0300,'neutral','л','["Емкость бака","Ёмкость бака","Объем топливного бака","Объём топливного бака","Объем бака","Объём бака"]'::jsonb,false,now()),
('snow_blower','engine_start_type','Пуск двигателя',0.0300,'categorical',null,'["Пуск двигателя","Запуск двигателя","Система запуска","Тип запуска","Электростартер"]'::jsonb,false,now()),
('snow_blower','heated_handles','Подогрев ручек',0.0200,'boolean',null,'["Подогрев ручек","Обогрев ручек","Ручки с подогревом"]'::jsonb,false,now()),
('snow_blower','clutch_type','Сцепление',0.0200,'categorical',null,'["Сцепление","Тип сцепления"]'::jsonb,false,now()),
('snow_blower','skid_height_adjustment','Регулировка высоты полозьев',0.0200,'boolean',null,'["Регулировка высоты полозьев","Регулировка полозьев","Регулируемые полозья"]'::jsonb,false,now());
