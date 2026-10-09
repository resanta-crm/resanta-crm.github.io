-- Triovist competitor parser: approved jigsaw rules v23.6.298
insert into public.triovist_market_rules_v1
(profile_key,spec_key,label,weight,direction,unit,aliases,critical,updated_at)
values
('jigsaw','device_type','Тип',0.00,'categorical',null,'["Тип","Тип устройства","Тип инструмента","Вид инструмента","Вид"]'::jsonb,false,now()),
('jigsaw','power_source','Тип питания',0.00,'categorical',null,'["Тип питания","Источник питания","Питание","Источник энергии"]'::jsonb,false,now()),
('jigsaw','input_power_w','Мощность',0.25,'higher','Вт','["Мощность","Потребляемая мощность","Номинальная мощность","Входная мощность","Мощность двигателя"]'::jsonb,false,now()),
('jigsaw','cut_depth_wood_mm','Максимальная глубина пропила',0.35,'higher','мм','["Максимальная глубина пропила в дереве","Макс. глубина пропила в дереве","Глубина пропила в дереве","Максимальная глубина реза в дереве","Макс. глубина реза в дереве","Глубина реза в дереве","Максимальная толщина пропила в дереве","Дерево"]'::jsonb,true,now()),
('jigsaw','strokes_per_min','Количество ходов в минуту',0.25,'neutral','ход/мин','["Количество ходов в минуту","Число ходов в минуту","Частота ходов","Частота движения пилки","Частота хода пилки","Максимальная частота ходов","Макс. частота ходов","Число ходов"]'::jsonb,true,now()),
('jigsaw','motor_type','Щеточный/бесщеточный',0.15,'neutral',null,'["Тип электродвигателя","Тип двигателя","Двигатель","Тип мотора","Мотор"]'::jsonb,false,now())
on conflict (profile_key,spec_key) do update set
 label=excluded.label,weight=excluded.weight,direction=excluded.direction,unit=excluded.unit,
 aliases=excluded.aliases,critical=excluded.critical,updated_at=excluded.updated_at;
