-- Triovist competitor parser: approved electric chainsaw analog formula v23.6.266
delete from public.triovist_market_rules_v1 where profile_key='chainsaw_electric';

insert into public.triovist_market_rules_v1
(profile_key,spec_key,label,weight,direction,unit,aliases,critical,updated_at)
values
('chainsaw_electric','device_type','Тип',0.1000,'categorical',null,'["Тип","Тип устройства","Вид инструмента","Тип пилы"]'::jsonb,true,now()),
('chainsaw_electric','purpose','Назначение',0.1000,'categorical',null,'["Назначение","Назначение пилы","Класс","Область применения"]'::jsonb,false,now()),
('chainsaw_electric','power_supply','Тип питания электропилы',0.2000,'categorical',null,'["Тип питания","Питание","Источник питания","Тип питания электропилы"]'::jsonb,true,now()),
('chainsaw_electric','bar_length_cm','Длина шины',0.2000,'neutral','см','["Длина шины","Длина пильной шины","Размер шины"]'::jsonb,false,now()),
('chainsaw_electric','power_w','Мощность',0.1800,'neutral','Вт','["Мощность","Мощность двигателя","Потребляемая мощность","Номинальная мощность"]'::jsonb,false,now()),
('chainsaw_electric','chain_brake','Тормоз цепи',0.0700,'boolean',null,'["Тормоз цепи","Инерционный тормоз цепи","Цепной тормоз","Автоматический тормоз цепи"]'::jsonb,false,now()),
('chainsaw_electric','tool_free_tension','Быстрое натяжение цепи',0.0500,'boolean',null,'["Быстрое натяжение цепи","Бесключевое натяжение цепи","Регулировка натяжения цепи без инструмента","Натяжение цепи без инструмента"]'::jsonb,false,now()),
('chainsaw_electric','auto_chain_lubrication','Автоматическая смазка цепи',0.0500,'boolean',null,'["Автоматическая смазка цепи","Автосмазка цепи","Автоматическая подача масла","Система автоматической смазки цепи"]'::jsonb,false,now()),
('chainsaw_electric','motor_position','Расположение двигателя',0.0500,'categorical',null,'["Расположение двигателя","Положение двигателя"]'::jsonb,false,now());
