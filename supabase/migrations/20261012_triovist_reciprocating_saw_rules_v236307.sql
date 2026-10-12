-- Triovist competitor parser: approved reciprocating saw rules v23.6.307
insert into public.triovist_market_rules_v1
(profile_key,spec_key,label,weight,direction,unit,aliases,critical,updated_at)
values
('reciprocating_saw','power_source','Источник питания',0.00,'categorical',null,'["Источник питания","Питание","Тип питания","Электропитание"]'::jsonb,true,now()),
('reciprocating_saw','input_power_w','Мощность',0.20,'higher','Вт','["Мощность","Потребляемая мощность","Номинальная мощность","Входная мощность","Мощность двигателя"]'::jsonb,true,now()),
('reciprocating_saw','motor_type','Тип двигателя',0.15,'categorical',null,'["Тип двигателя","Тип электродвигателя","Двигатель","Тип мотора","Мотор"]'::jsonb,true,now()),
('reciprocating_saw','cut_depth_wood_mm','Глубина пропила по дереву',0.25,'higher','мм','["Глубина пропила по дереву","Максимальная глубина пропила по дереву","Макс. глубина пропила по дереву","Глубина реза по дереву","Максимальная глубина реза по дереву","Макс. глубина реза по дереву","Дерево"]'::jsonb,true,now()),
('reciprocating_saw','cut_depth_metal_mm','Глубина пропила по металлу',0.20,'higher','мм','["Глубина пропила по металлу","Максимальная глубина пропила по металлу","Макс. глубина пропила по металлу","Глубина реза по металлу","Максимальная глубина реза по металлу","Макс. глубина реза по металлу","Металл"]'::jsonb,true,now()),
('reciprocating_saw','strokes_per_min','Число ходов в минуту',0.20,'neutral','ход/мин','["Количество ходов в минуту","Число ходов в минуту","Максимальное число ходов","Макс. число ходов","Частота ходов","Ходы в минуту","Частота движения пилки"]'::jsonb,true,now())
on conflict (profile_key,spec_key) do update set
 label=excluded.label,weight=excluded.weight,direction=excluded.direction,unit=excluded.unit,
 aliases=excluded.aliases,critical=excluded.critical,updated_at=excluded.updated_at;
