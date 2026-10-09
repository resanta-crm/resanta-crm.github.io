-- Triovist competitor parser: approved paint sprayer rules v23.6.296
insert into public.triovist_market_rules_v1
(profile_key,spec_key,label,weight,direction,unit,aliases,critical,updated_at)
values
('paint_sprayer','device_type','Тип',0.00,'categorical',null,'["Тип","Тип устройства","Тип инструмента","Вид","Вид инструмента"]'::jsonb,false,now()),
('paint_sprayer','input_power_w','Мощность',0.40,'higher','Вт','["Мощность","Потребляемая мощность","Номинальная мощность","Входная мощность","Мощность двигателя"]'::jsonb,true,now()),
('paint_sprayer','tank_position','Расположение бачка',0.20,'neutral',null,'["Расположение бачка","Расположение бачка для краски","Расположение емкости","Расположение ёмкости","Расположение резервуара","Положение бачка","Бачок"]'::jsonb,false,now()),
('paint_sprayer','pressure_bar','Давление',0.40,'higher','бар','["Давление","Рабочее давление","Максимальное давление","Макс. давление","Давление распыления","Давление воздуха"]'::jsonb,true,now())
on conflict (profile_key,spec_key) do update set
 label=excluded.label,weight=excluded.weight,direction=excluded.direction,unit=excluded.unit,
 aliases=excluded.aliases,critical=excluded.critical,updated_at=excluded.updated_at;
