-- Triovist competitor parser: approved earth auger rules v23.6.274
insert into public.triovist_market_rules_v1
(profile_key,spec_key,label,weight,direction,unit,aliases,critical,updated_at)
values
('earth_auger','device_type','Тип',0.10,'categorical',null,'["Тип","Тип мотобура","Вид","Вид устройства","Тип устройства"]'::jsonb,true,now()),
('earth_auger','engine_type','Тип двигателя',0.12,'categorical',null,'["Тип двигателя","Тип ДВС","Тактность двигателя","Количество тактов","Тактность"]'::jsonb,true,now()),
('earth_auger','fuel_power_w','Мощность топливного двигателя',0.18,'higher','Вт','["Мощность топливного двигателя","Мощность двигателя","Мощность ДВС","Номинальная мощность двигателя"]'::jsonb,true,now()),
('earth_auger','fuel_tank_l','Емкость топливного бака',0.07,'higher','л','["Емкость топливного бака","Ёмкость топливного бака","Объем топливного бака","Объём топливного бака","Топливный бак"]'::jsonb,false,now()),
('earth_auger','rpm','Кол-во оборотов',0.06,'neutral','об/мин','["Кол-во оборотов","Количество оборотов","Обороты","Обороты двигателя","Максимальные обороты","Макс. обороты","Частота вращения"]'::jsonb,false,now()),
('earth_auger','engine_cc','Объем двигателя',0.15,'higher','см³','["Объем двигателя","Объём двигателя","Рабочий объем двигателя","Рабочий объём двигателя","Рабочий объем"]'::jsonb,false,now()),
('earth_auger','max_auger_diameter_mm','Макс. диаметр бура',0.20,'higher','мм','["Макс. диаметр бура","Максимальный диаметр бура","Диаметр бура","Максимальный диаметр шнека","Макс. диаметр шнека","Диаметр шнека"]'::jsonb,true,now()),
('earth_auger','shaft_diameter_mm','Диаметр посадочного отверстия',0.12,'categorical','мм','["Диаметр посадочного отверстия","Посадочный диаметр","Диаметр посадки","Диаметр вала","Посадочное отверстие"]'::jsonb,true,now())
on conflict (profile_key,spec_key) do update set
 label=excluded.label,weight=excluded.weight,direction=excluded.direction,unit=excluded.unit,
 aliases=excluded.aliases,critical=excluded.critical,updated_at=excluded.updated_at;
