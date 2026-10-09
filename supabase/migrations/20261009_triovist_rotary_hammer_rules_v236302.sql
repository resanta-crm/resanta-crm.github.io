-- Triovist competitor parser: approved rotary hammer rules v23.6.302
insert into public.triovist_market_rules_v1
(profile_key,spec_key,label,weight,direction,unit,aliases,critical,updated_at)
values
('rotary_hammer','chuck_type','Тип патрона',0.00,'categorical',null,'["Тип патрона","Патрон","Система патрона","Система крепления","Крепление оснастки","Тип крепления","Тип крепления бура","Тип хвостовика","Система крепления бура"]'::jsonb,true,now()),
('rotary_hammer','input_power_w','Мощность',0.35,'higher','Вт','["Мощность","Потребляемая мощность","Номинальная мощность","Входная мощность","Мощность двигателя"]'::jsonb,true,now()),
('rotary_hammer','impact_energy_j','Энергия удара',0.40,'higher','Дж','["Энергия удара","Максимальная энергия удара","Макс. энергия удара","Энергия единичного удара","Сила удара"]'::jsonb,true,now()),
('rotary_hammer','max_rpm','Максимальная скорость вращения',0.25,'neutral','об/мин','["Максимальная скорость вращения","Макс. скорость вращения","Максимальное число оборотов","Макс. число оборотов","Максимальные обороты","Макс. обороты","Частота вращения","Максимальная частота вращения","Обороты холостого хода","Максимальные обороты холостого хода","Частота вращения шпинделя"]'::jsonb,true,now())
on conflict (profile_key,spec_key) do update set
 label=excluded.label,weight=excluded.weight,direction=excluded.direction,unit=excluded.unit,
 aliases=excluded.aliases,critical=excluded.critical,updated_at=excluded.updated_at;
