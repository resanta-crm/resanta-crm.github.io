-- Triovist competitor parser: approved humidifier analog formula v23.6.262
delete from public.triovist_market_rules_v1 where profile_key='humidifier';

insert into public.triovist_market_rules_v1
(profile_key,spec_key,label,weight,direction,unit,aliases,critical,updated_at)
values
('humidifier','device_type','Тип',0.1000,'categorical',null,'["Тип","Тип устройства","Вид устройства","Тип прибора"]'::jsonb,true,now()),
('humidifier','technologies','Технологии',0.2000,'categorical',null,'["Технологии","Технология увлажнения","Тип увлажнения","Принцип увлажнения","Способ увлажнения"]'::jsonb,false,now()),
('humidifier','output_mlh','Макс. расход воды',0.2000,'neutral','мл/ч','["Макс. расход воды","Максимальный расход воды","Расход воды","Производительность","Интенсивность увлажнения","Максимальная производительность"]'::jsonb,false,now()),
('humidifier','area_m2','Макс. обслуживаемая площадь',0.1500,'neutral','м²','["Макс. обслуживаемая площадь","Максимальная обслуживаемая площадь","Обслуживаемая площадь","Рекомендуемая площадь помещения","Площадь помещения"]'::jsonb,false,now()),
('humidifier','tank_l','Емкость резервуара для воды',0.1500,'neutral','л','["Емкость резервуара для воды","Ёмкость резервуара для воды","Объем резервуара для воды","Объём резервуара для воды","Емкость бака","Ёмкость бака","Объем бака","Объём бака"]'::jsonb,false,now()),
('humidifier','power_w','Потребляемая мощность',0.0700,'neutral','Вт','["Потребляемая мощность","Мощность","Максимальная потребляемая мощность"]'::jsonb,false,now()),
('humidifier','power_supply','Питание',0.0500,'categorical',null,'["Питание","Источник питания","Электропитание","Тип питания"]'::jsonb,false,now()),
('humidifier','control_type','Управление',0.0500,'categorical',null,'["Управление","Тип управления"]'::jsonb,false,now()),
('humidifier','remote_control','Дистанционное управление',0.0300,'boolean',null,'["Дистанционное управление","Пульт ДУ","Пульт дистанционного управления","Управление со смартфона","Wi-Fi управление","WiFi управление"]'::jsonb,false,now());
