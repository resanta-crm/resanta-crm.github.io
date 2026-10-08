-- Triovist competitor parser: approved fan heater analog formula v23.6.260
delete from public.triovist_market_rules_v1 where profile_key='fan_heater';
insert into public.triovist_market_rules_v1
(profile_key,spec_key,label,weight,direction,unit,aliases,critical,updated_at)
values
('fan_heater','device_type','Тип устройства',0.1200,'categorical',null,'["Тип устройства","Вид устройства","Тип обогревателя"]'::jsonb,true,now()),
('fan_heater','heater_type','Нагревательный элемент',0.1800,'categorical',null,'["Нагревательный элемент","Тип нагревательного элемента"]'::jsonb,false,now()),
('fan_heater','power_w','Мощность обогрева',0.2200,'neutral','Вт','["Мощность обогрева","Мощность","Максимальная мощность","Номинальная мощность","Потребляемая мощность"]'::jsonb,false,now()),
('fan_heater','power_adjustment','Регулировка мощности',0.1000,'boolean',null,'["Регулировка мощности","Регулятор мощности","Выбор мощности"]'::jsonb,false,now()),
('fan_heater','thermostat_type','Термостат',0.0800,'categorical',null,'["Термостат","Тип термостата"]'::jsonb,false,now()),
('fan_heater','control_type','Управление',0.0700,'categorical',null,'["Управление","Тип управления"]'::jsonb,false,now()),
('fan_heater','remote_control','Пульт ДУ',0.0500,'boolean',null,'["Пульт ДУ","Пульт дистанционного управления","Дистанционное управление","Пульт управления"]'::jsonb,false,now()),
('fan_heater','fan_present','Встроенный вентилятор',0.0400,'boolean',null,'["Встроенный вентилятор","Вентилятор","Наличие вентилятора"]'::jsonb,false,now()),
('fan_heater','fan_only_mode','Обдув без нагрева',0.0500,'boolean',null,'["Обдув без нагрева","Вентиляция без нагрева","Режим вентиляции","Холодный обдув","Режим вентилятора без нагрева"]'::jsonb,false,now()),
('fan_heater','indicator_light','Световой индикатор',0.0300,'boolean',null,'["Световой индикатор","Индикатор работы","Световая индикация","Индикация включения"]'::jsonb,false,now()),
('fan_heater','display_present','Дисплей',0.0600,'boolean',null,'["Дисплей","Наличие дисплея","Экран","Цифровой дисплей","Информационный дисплей"]'::jsonb,false,now());
