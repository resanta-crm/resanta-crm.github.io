-- Triovist competitor parser: approved leaf blower class formulas v23.6.272
insert into public.triovist_market_rules_v1
(profile_key,spec_key,label,weight,direction,unit,aliases,critical,updated_at)
values
('leaf_blower','device_type','Тип',0.05,'categorical',null,'["Тип","Тип устройства","Вид устройства","Тип воздуходувки"]'::jsonb,true,now()),
('leaf_blower','construction','Конструкция',0.09,'categorical',null,'["Конструкция","Исполнение","Тип конструкции","Способ ношения"]'::jsonb,false,now()),
('leaf_blower','air_speed_ms','Скорость воздушного потока',0.13,'neutral','м/с','["Скорость воздушного потока","Скорость воздуха","Максимальная скорость воздушного потока","Макс. скорость воздушного потока"]'::jsonb,false,now()),
('leaf_blower','engine_type','Тип двигателя',0.05,'categorical',null,'["Тип двигателя","Двигатель","Тип электродвигателя","Тип бензинового двигателя"]'::jsonb,false,now()),
('leaf_blower','power_source','Тип питания',0.10,'categorical',null,'["Тип питания","Источник питания","Питание"]'::jsonb,true,now()),
('leaf_blower','battery_type','Тип аккумулятора',0.03,'categorical',null,'["Тип аккумулятора","Тип батареи","Аккумулятор"]'::jsonb,false,now()),
('leaf_blower','battery_capacity_ah','Емкость аккумулятора',0.04,'neutral','А·ч','["Емкость аккумулятора","Ёмкость аккумулятора","Емкость батареи","Ёмкость батареи"]'::jsonb,false,now()),
('leaf_blower','battery_voltage_v','Напряжение аккумулятора',0.06,'neutral','В','["Напряжение аккумулятора","Напряжение батареи","Напряжение АКБ"]'::jsonb,false,now()),
('leaf_blower','rpm','Обороты двигателя',0.04,'neutral','об/мин','["Обороты двигателя","Частота вращения","Максимальные обороты","Макс. обороты","Обороты"]'::jsonb,false,now()),
('leaf_blower','functions','Функции',0.07,'categorical',null,'["Функции","Режимы работы","Режимы","Возможности"]'::jsonb,false,now()),
('leaf_blower','airflow_m3h','Расход воздуха',0.13,'neutral','м³/ч','["Расход воздуха","Максимальный расход воздуха","Макс. расход воздуха","Производительность по воздуху","Воздушный поток"]'::jsonb,false,now()),
('leaf_blower','noise_db','Уровень шума',0.03,'neutral','дБ','["Уровень шума","Шум","Уровень звукового давления","Звуковое давление"]'::jsonb,false,now()),
('leaf_blower','motor_power_w','Номинальная мощность двигателя',0.05,'neutral','Вт','["Номинальная мощность двигателя","Мощность электродвигателя","Потребляемая мощность","Номинальная мощность"]'::jsonb,false,now()),
('leaf_blower','fuel_power_w','Мощность топливного двигателя',0.05,'neutral','Вт','["Мощность топливного двигателя","Мощность двигателя на топливе","Мощность бензинового двигателя","Мощность двигателя"]'::jsonb,false,now()),
('leaf_blower','engine_cc','Рабочий объем двигателя',0.05,'neutral','см³','["Рабочий объем двигателя","Рабочий объём двигателя","Объем двигателя","Объём двигателя"]'::jsonb,false,now()),
('leaf_blower','fuel_tank_l','Емкость топливного бака',0.03,'neutral','л','["Емкость топливного бака","Ёмкость топливного бака","Объем топливного бака","Объём топливного бака"]'::jsonb,false,now())
on conflict (profile_key,spec_key) do update set
 label=excluded.label,weight=excluded.weight,direction=excluded.direction,unit=excluded.unit,
 aliases=excluded.aliases,critical=excluded.critical,updated_at=excluded.updated_at;
