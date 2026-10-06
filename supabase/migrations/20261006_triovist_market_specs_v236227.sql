-- RESANTA CRM v23.6.227 · validated comparison fields
update public.triovist_market_rules_v1
set aliases = aliases || '["Емкость топливного бака","Ёмкость топливного бака"]'::jsonb,
    updated_at=now()
where profile_key='chainsaw_gas' and spec_key='fuel_tank_l'
  and not aliases @> '["Емкость топливного бака"]'::jsonb;

insert into public.triovist_market_rules_v1(profile_key,spec_key,label,weight,direction,unit,aliases,critical)
values
('chainsaw_gas','equipment','Комплектация',0.03,'neutral',null,'["Дополнительная комплектация","Комплектация"]'::jsonb,false),
('chainsaw_electric','equipment','Комплектация',0.03,'neutral',null,'["Дополнительная комплектация","Комплектация"]'::jsonb,false),
('convector','width_mm','Ширина',0.02,'neutral','мм','["Ширина"]'::jsonb,false),
('convector','height_mm','Высота',0.02,'neutral','мм','["Высота"]'::jsonb,false),
('convector','depth_mm','Глубина',0.02,'neutral','мм','["Глубина"]'::jsonb,false)
on conflict(profile_key,spec_key) do update set
 label=excluded.label,weight=excluded.weight,direction=excluded.direction,unit=excluded.unit,
 aliases=excluded.aliases,critical=excluded.critical,updated_at=now();
