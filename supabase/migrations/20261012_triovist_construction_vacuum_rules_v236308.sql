-- Triovist competitor parser: approved construction vacuum rules v23.6.308
insert into public.triovist_market_rules_v1
(profile_key,spec_key,label,weight,direction,unit,aliases,critical,updated_at)
values
('construction_vacuum','input_power_w','Мощность',0.30,'higher','Вт','["Мощность","Потребляемая мощность","Номинальная мощность","Входная мощность","Мощность двигателя"]'::jsonb,true,now()),
('construction_vacuum','tank_capacity_l','Объем бака',0.25,'higher','л','["Объем бака","Объём бака","Объем контейнера","Объём контейнера","Объем пылесборника","Объём пылесборника","Емкость бака","Ёмкость бака","Емкость контейнера","Ёмкость контейнера"]'::jsonb,true,now()),
('construction_vacuum','vacuum_cleaning_type','Тип уборки',0.25,'categorical',null,'["Тип уборки","Вид уборки","Режим уборки","Уборка","Тип очистки"]'::jsonb,true,now()),
('construction_vacuum','vacuum_body_material','Материал корпуса',0.20,'categorical',null,'["Материал корпуса","Материал бака","Материал контейнера","Материал пылесборника","Корпус"]'::jsonb,true,now())
on conflict (profile_key,spec_key) do update set
 label=excluded.label,weight=excluded.weight,direction=excluded.direction,unit=excluded.unit,
 aliases=excluded.aliases,critical=excluded.critical,updated_at=excluded.updated_at;
