-- Triovist competitor parser: approved oil radiator analog formula v23.6.258
-- Technical match only. Price is compared only after analog selection.

delete from public.triovist_market_rules_v1
where profile_key='oil_radiator';

insert into public.triovist_market_rules_v1
(profile_key,spec_key,label,weight,direction,unit,aliases,critical,updated_at)
values
('oil_radiator','device_type','Тип устройства',0.1500,'categorical',null,
 '["Тип устройства","Вид устройства","Тип обогревателя","Тип радиатора"]'::jsonb,true,now()),
('oil_radiator','sections_count','Количество секций',0.2500,'neutral','шт.',
 '["Количество секций","Кол-во секций","Число секций","Секции"]'::jsonb,false,now()),
('oil_radiator','power_w','Мощность обогрева',0.2500,'neutral','Вт',
 '["Мощность обогрева","Мощность","Максимальная мощность","Номинальная мощность","Потребляемая мощность"]'::jsonb,false,now()),
('oil_radiator','power_adjustment','Регулировка мощности',0.1000,'boolean',null,
 '["Регулировка мощности","Регулятор мощности","Выбор мощности"]'::jsonb,false,now()),
('oil_radiator','temperature_adjustment','Регулировка температуры',0.0700,'boolean',null,
 '["Регулировка температуры","Регулятор температуры","Настройка температуры","Установка температуры"]'::jsonb,false,now()),
('oil_radiator','control_type','Управление',0.0700,'categorical',null,
 '["Управление","Тип управления"]'::jsonb,false,now()),
('oil_radiator','wheels_present','Колеса для перемещения',0.0400,'boolean',null,
 '["Колеса для перемещения","Колёса для перемещения","Колеса","Колёса","Транспортировочные колеса","Транспортировочные колёса"]'::jsonb,false,now()),
('oil_radiator','thermostat_type','Термостат',0.0700,'categorical',null,
 '["Термостат","Тип термостата"]'::jsonb,false,now());
