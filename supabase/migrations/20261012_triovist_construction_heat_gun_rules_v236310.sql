-- Triovist competitor parser: construction heat gun / hot-air gun rules v23.6.310
insert into public.triovist_market_rules_v1
(profile_key,spec_key,label,weight,direction,unit,aliases,critical,updated_at)
values
('construction_heat_gun','airflow_lmin','Производительность',0.40,'higher','л/мин',
 '["Производительность","Воздушный поток","Поток воздуха","Расход воздуха","Максимальный поток воздуха","Макс. поток воздуха","Производительность по воздуху"]'::jsonb,true,now()),
('construction_heat_gun','heating_time_sec','Время нагрева',0.25,'lower','с',
 '["Время нагрева","Время разогрева","Время выхода на рабочую температуру","Скорость нагрева"]'::jsonb,true,now()),
('construction_heat_gun','input_power_w','Мощность',0.35,'higher','Вт',
 '["Мощность","Потребляемая мощность","Номинальная мощность","Входная мощность","Мощность двигателя"]'::jsonb,true,now())
on conflict (profile_key,spec_key) do update set
 label=excluded.label,weight=excluded.weight,direction=excluded.direction,unit=excluded.unit,
 aliases=excluded.aliases,critical=excluded.critical,updated_at=excluded.updated_at;
