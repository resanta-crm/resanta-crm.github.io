-- Triovist competitor parser: approved sprayer rules v23.6.284
insert into public.triovist_market_rules_v1
(profile_key,spec_key,label,weight,direction,unit,aliases,critical,updated_at)
values
('sprayer','device_type','Тип',0.08,'categorical',null,'["Тип","Тип устройства","Вид","Вид устройства","Тип опрыскивателя"]'::jsonb,true,now()),
('sprayer','application_area','Область применения',0.05,'neutral',null,'["Область применения","Применение","Назначение","Сфера применения"]'::jsonb,false,now()),
('sprayer','carry_type','Вид переноски',0.08,'neutral',null,'["Вид переноски","Способ переноски","Тип переноски","Конструкция","Исполнение"]'::jsonb,false,now()),
('sprayer','voltage_v','Напряжение',0.07,'neutral','В','["Напряжение","Рабочее напряжение","Напряжение аккумулятора","Напряжение питания"]'::jsonb,false,now()),
('sprayer','flow_rate_lmin','Производительность',0.12,'higher','л/мин','["Производительность","Расход жидкости","Подача жидкости","Максимальная производительность","Макс. производительность"]'::jsonb,true,now()),
('sprayer','power_source','Тип питания',0.12,'categorical',null,'["Тип питания","Источник питания","Питание","Принцип работы"]'::jsonb,true,now()),
('sprayer','battery_type','Тип аккумулятора',0.04,'neutral',null,'["Тип аккумулятора","Тип АКБ","Технология аккумулятора","Химический тип аккумулятора"]'::jsonb,false,now()),
('sprayer','battery_capacity_ah','Емкость аккумулятора',0.06,'higher','А·ч','["Емкость аккумулятора","Ёмкость аккумулятора","Емкость АКБ","Ёмкость АКБ","Емкость батареи","Ёмкость батареи"]'::jsonb,false,now()),
('sprayer','tank_capacity_l','Объем емкости',0.12,'higher','л','["Объем емкости","Объём емкости","Объем бака для жидкости","Объём бака для жидкости","Объем бака","Объём бака","Объем резервуара","Объём резервуара","Емкость бака","Ёмкость бака"]'::jsonb,true,now()),
('sprayer','fuel_engine_type','Тип бензинового двигателя',0.06,'neutral',null,'["Тип бензинового двигателя","Тип двигателя","Двигатель","Тактность двигателя","Количество тактов двигателя"]'::jsonb,false,now()),
('sprayer','fuel_power_w','Мощность',0.07,'higher','Вт','["Мощность","Мощность двигателя","Номинальная мощность","Мощность бензинового двигателя"]'::jsonb,false,now()),
('sprayer','engine_cc','Объем двигателя',0.05,'neutral','см³','["Объем двигателя","Объём двигателя","Рабочий объем двигателя","Рабочий объём двигателя","Объем цилиндра","Объём цилиндра"]'::jsonb,false,now()),
('sprayer','fuel_tank_l','Объем топливного бака',0.03,'higher','л','["Объем топливного бака","Объём топливного бака","Емкость топливного бака","Ёмкость топливного бака","Топливный бак"]'::jsonb,false,now()),
('sprayer','spray_radius_m','Радиус опрыскивания',0.05,'higher','м','["Радиус опрыскивания","Максимальный радиус опрыскивания","Макс. радиус опрыскивания","Дальность опрыскивания","Дальность распыления","Радиус распыления"]'::jsonb,false,now())
on conflict (profile_key,spec_key) do update set
 label=excluded.label,weight=excluded.weight,direction=excluded.direction,unit=excluded.unit,
 aliases=excluded.aliases,critical=excluded.critical,updated_at=excluded.updated_at;
