-- Triovist competitor parser: approved impact wrench rules v23.6.286
insert into public.triovist_market_rules_v1
(profile_key,spec_key,label,weight,direction,unit,aliases,critical,updated_at)
values
('impact_wrench','device_type','Тип',0.07,'categorical',null,'["Тип","Тип устройства","Вид","Вид инструмента","Тип инструмента"]'::jsonb,true,now()),
('impact_wrench','wrench_type','Тип гайковерта',0.09,'categorical',null,'["Тип гайковерта","Тип гайковёрта","Ударный механизм","Тип работы","Вид гайковерта","Вид гайковёрта"]'::jsonb,true,now()),
('impact_wrench','power_source','Тип питания',0.10,'categorical',null,'["Тип питания","Источник питания","Питание","Источник энергии"]'::jsonb,true,now()),
('impact_wrench','motor_type','Тип электродвигателя',0.05,'neutral',null,'["Тип электродвигателя","Тип двигателя","Двигатель","Тип мотора","Мотор"]'::jsonb,false,now()),
('impact_wrench','input_power_w','Потребляемая мощность',0.05,'neutral','Вт','["Потребляемая мощность","Входная мощность","Номинальная потребляемая мощность","Мощность"]'::jsonb,false,now()),
('impact_wrench','reverse_present','Реверс',0.04,'boolean',null,'["Реверс","Наличие реверса","Обратное вращение"]'::jsonb,false,now()),
('impact_wrench','operating_modes','Режимы',0.05,'neutral',null,'["Режимы","Количество режимов","Число режимов","Режимы работы","Количество скоростей","Скорости"]'::jsonb,false,now()),
('impact_wrench','chuck_type','Тип патрона',0.05,'neutral',null,'["Тип патрона","Патрон","Тип посадки","Тип хвостовика"]'::jsonb,false,now()),
('impact_wrench','drive_size_in','Посадочный квадрат/шестигранник',0.12,'neutral','дюйм','["Посадочный квадрат/шестигранник","Посадочный квадрат","Размер посадочного квадрата","Квадрат","Размер квадрата","Размер шестигранника","Посадочный шестигранник","Размер патрона"]'::jsonb,true,now()),
('impact_wrench','rotation_adjustment','Регулировка вращения',0.04,'boolean',null,'["Регулировка вращения","Регулировка скорости вращения","Регулировка оборотов","Электронная регулировка оборотов","Регулировка скорости"]'::jsonb,false,now()),
('impact_wrench','max_rpm','Макс. скорость вращения',0.07,'neutral','об/мин','["Макс. скорость вращения","Максимальная скорость вращения","Макс. число оборотов","Максимальное число оборотов","Частота вращения","Обороты холостого хода","Максимальные обороты"]'::jsonb,false,now()),
('impact_wrench','max_torque_nm','Макс. крутящий момент',0.17,'higher','Н·м','["Макс. крутящий момент","Максимальный крутящий момент","Крутящий момент","Макс. момент","Максимальный момент"]'::jsonb,true,now()),
('impact_wrench','battery_type','Тип аккумулятора',0.03,'neutral',null,'["Тип аккумулятора","Тип АКБ","Технология аккумулятора","Химический тип аккумулятора"]'::jsonb,false,now()),
('impact_wrench','battery_voltage_v','Напряжение аккумулятора',0.04,'neutral','В','["Напряжение аккумулятора","Напряжение АКБ","Напряжение батареи","Рабочее напряжение аккумулятора"]'::jsonb,false,now()),
('impact_wrench','battery_capacity_ah','Емкость аккумулятора',0.02,'higher','А·ч','["Емкость аккумулятора","Ёмкость аккумулятора","Емкость АКБ","Ёмкость АКБ","Емкость батареи","Ёмкость батареи"]'::jsonb,false,now()),
('impact_wrench','charging_time_min','Время зарядки',0.01,'lower','мин','["Время зарядки","Время зарядки аккумулятора","Время полного заряда","Продолжительность зарядки"]'::jsonb,false,now())
on conflict (profile_key,spec_key) do update set
 label=excluded.label,weight=excluded.weight,direction=excluded.direction,unit=excluded.unit,
 aliases=excluded.aliases,critical=excluded.critical,updated_at=excluded.updated_at;
