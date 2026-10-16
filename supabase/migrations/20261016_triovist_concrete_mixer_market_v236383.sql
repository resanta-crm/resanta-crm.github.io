-- RESANTA CRM v23.6.383
-- Triovist / 21vek competitor parser: concrete mixers.
-- Approved characteristics: drum volume, crown material, power.

insert into public.triovist_market_rules_v1
  (profile_key,spec_key,label,weight,direction,unit,aliases,critical,updated_at)
values
  (
    'concrete_mixer','drum_capacity_l','Объём барабана',0.45,'neutral','л',
    '["Объём барабана","Объем барабана","Обьем барабана","Емкость барабана","Вместимость барабана","Объём бака","Объем бака","Геометрический объём барабана","Геометрический объем барабана"]'::jsonb,
    true,now()
  ),
  (
    'concrete_mixer','crown_material','Материал венца',0.30,'categorical',null,
    '["Материал венца","Венец","Материал зубчатого венца","Материал зубчатого колеса","Материал зубчатой передачи","Венец барабана"]'::jsonb,
    true,now()
  ),
  (
    'concrete_mixer','input_power_w','Мощность',0.25,'higher','Вт',
    '["Мощность","Потребляемая мощность","Номинальная мощность","Входная мощность","Мощность двигателя","Мощность электродвигателя"]'::jsonb,
    true,now()
  )
on conflict (profile_key,spec_key) do update
set label=excluded.label,
    weight=excluded.weight,
    direction=excluded.direction,
    unit=excluded.unit,
    aliases=excluded.aliases,
    critical=excluded.critical,
    updated_at=excluded.updated_at;
