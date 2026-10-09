-- Triovist competitor parser: approved battery pruner rules v23.6.282
insert into public.triovist_market_rules_v1
(profile_key,spec_key,label,weight,direction,unit,aliases,critical,updated_at)
values
('battery_pruner','device_type','Тип',0.08,'categorical',null,'["Тип","Тип устройства","Вид","Вид устройства"]'::jsonb,true,now()),
('battery_pruner','tool_type','Тип инструмента',0.14,'categorical',null,'["Тип инструмента","Инструмент","Вид инструмента","Назначение инструмента"]'::jsonb,true,now()),
('battery_pruner','voltage_v','Напряжение',0.15,'neutral','В','["Напряжение","Рабочее напряжение","Напряжение аккумулятора","Напряжение питания"]'::jsonb,true,now()),
('battery_pruner','power_source','Тип питания',0.14,'categorical',null,'["Тип питания","Источник питания","Питание"]'::jsonb,true,now()),
('battery_pruner','battery_type','Тип аккумулятора',0.07,'neutral',null,'["Тип аккумулятора","Тип АКБ","Аккумулятор","Технология аккумулятора"]'::jsonb,false,now()),
('battery_pruner','battery_capacity_ah','Емкость аккумулятора',0.09,'higher','А·ч','["Емкость аккумулятора","Ёмкость аккумулятора","Емкость АКБ","Ёмкость АКБ","Емкость батареи","Ёмкость батареи"]'::jsonb,false,now()),
('battery_pruner','knife_type','Тип ножа',0.07,'neutral',null,'["Тип ножа","Нож","Тип режущего ножа","Режущий нож"]'::jsonb,false,now()),
('battery_pruner','blade_type','Тип лезвия',0.07,'neutral',null,'["Тип лезвия","Лезвие","Тип режущего лезвия","Режущее лезвие"]'::jsonb,false,now()),
('battery_pruner','max_cut_diameter_mm','Максимальная толщина среза',0.19,'higher','мм','["Максимальная толщина среза","Макс. толщина среза","Максимальный диаметр среза","Макс. диаметр среза","Максимальный диаметр веток","Макс. диаметр веток","Толщина среза","Диаметр среза"]'::jsonb,true,now())
on conflict (profile_key,spec_key) do update set
 label=excluded.label,weight=excluded.weight,direction=excluded.direction,unit=excluded.unit,
 aliases=excluded.aliases,critical=excluded.critical,updated_at=excluded.updated_at;
