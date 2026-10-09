-- Triovist competitor parser: approved cordless screwdriver rules v23.6.294
insert into public.triovist_market_rules_v1
(profile_key,spec_key,label,weight,direction,unit,aliases,critical,updated_at)
values
('cordless_screwdriver','device_type','Тип',0.00,'categorical',null,'["Тип","Тип инструмента","Вид инструмента","Вид устройства"]'::jsonb,false,now()),
('cordless_screwdriver','battery_capacity_ah','Емкость АКБ',0.25,'higher','А·ч','["Емкость АКБ","Ёмкость АКБ","Емкость аккумулятора","Ёмкость аккумулятора","Емкость батареи","Ёмкость батареи"]'::jsonb,true,now()),
('cordless_screwdriver','motor_type','Щеточный/бесщеточный',0.12,'neutral',null,'["Тип электродвигателя","Тип двигателя","Двигатель","Тип мотора","Мотор"]'::jsonb,false,now()),
('cordless_screwdriver','max_torque_nm','Крутящий момент',0.35,'higher','Н·м','["Крутящий момент","Макс. крутящий момент","Максимальный крутящий момент","Макс. момент","Максимальный момент"]'::jsonb,true,now()),
('cordless_screwdriver','impact_present','Наличие удара',0.10,'boolean',null,'["Наличие удара","Удар","Ударный режим","Функция удара","Режим удара","Сверление с ударом","Режимы"]'::jsonb,false,now()),
('cordless_screwdriver','battery_count','Количество АКБ в комплекте',0.10,'higher','шт.','["Количество АКБ в комплекте","Количество аккумуляторов в комплекте","Аккумуляторов в комплекте","Аккумуляторы в комплекте","Количество батарей в комплекте"]'::jsonb,false,now()),
('cordless_screwdriver','case_present','Наличие кейса',0.08,'boolean',null,'["Наличие кейса","Кейс","Кейс в комплекте","Чемодан","Чемодан в комплекте","Футляр","Футляр в комплекте"]'::jsonb,false,now())
on conflict (profile_key,spec_key) do update set
 label=excluded.label,weight=excluded.weight,direction=excluded.direction,unit=excluded.unit,
 aliases=excluded.aliases,critical=excluded.critical,updated_at=excluded.updated_at;
