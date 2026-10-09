-- Triovist competitor parser: approved impact drill rules v23.6.292
insert into public.triovist_market_rules_v1
(profile_key,spec_key,label,weight,direction,unit,aliases,critical,updated_at)
values
('impact_drill','device_type','Тип',0.00,'categorical',null,'["Тип","Тип инструмента","Вид инструмента","Вид устройства"]'::jsonb,false,now()),
('impact_drill','input_power_w','Мощность',0.35,'higher','Вт','["Мощность","Потребляемая мощность","Номинальная мощность","Входная мощность"]'::jsonb,true,now()),
('impact_drill','speed_count','Количество скоростей',0.15,'higher','шт.','["Количество скоростей","Число скоростей","Скорости","Количество механических скоростей","Число механических скоростей","Количество ступеней скорости","Число ступеней скорости","Количество ступеней"]'::jsonb,false,now()),
('impact_drill','max_rpm','Максимальное число оборотов',0.25,'neutral','об/мин','["Максимальное число оборотов","Макс. число оборотов","Максимальные обороты","Макс. обороты","Частота вращения","Максимальная частота вращения","Обороты холостого хода","Максимальные обороты холостого хода","Максимальная скорость вращения","Макс. скорость вращения","Скорость вращения","Частота вращения шпинделя"]'::jsonb,true,now()),
('impact_drill','impact_present','Наличие удара',0.25,'boolean',null,'["Наличие удара","Удар","Ударный режим","Функция удара","Ударный механизм","Режим удара","Ударный режим работы","Сверление с ударом","Режим работы"]'::jsonb,true,now())
on conflict (profile_key,spec_key) do update set
 label=excluded.label,weight=excluded.weight,direction=excluded.direction,unit=excluded.unit,
 aliases=excluded.aliases,critical=excluded.critical,updated_at=excluded.updated_at;
