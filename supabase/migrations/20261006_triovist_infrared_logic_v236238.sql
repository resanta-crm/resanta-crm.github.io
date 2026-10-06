-- RESANTA CRM v23.6.238 · approved infrared-heater comparison contract
-- Separate gas/electric class first; area and weight are reference-only.

update public.triovist_market_rules_v1
set weight=0, critical=false, updated_at=now()
where profile_key='infrared_heater';

insert into public.triovist_market_rules_v1
  (profile_key,spec_key,label,weight,direction,unit,aliases,critical)
values
  ('infrared_heater','energy_type','Тип устройства / источник энергии',0.00,'categorical',null,
    '["Тип устройства","Тип обогревателя","Источник энергии","Тип топлива","Вид топлива"]'::jsonb,true),
  ('infrared_heater','heater_type','Нагревательный элемент',0.20,'categorical',null,
    '["Нагревательный элемент","Тип нагревательного элемента"]'::jsonb,false),
  ('infrared_heater','power_w','Мощность обогрева',0.25,'higher','Вт',
    '["Мощность","Максимальная мощность","Мощность обогрева","Мощность нагрева","Номинальная мощность"]'::jsonb,false),
  ('infrared_heater','installation_type','Способ установки / монтаж',0.15,'categorical',null,
    '["Установка","Монтаж","Способ установки","Способ монтажа","Тип установки","Размещение"]'::jsonb,false),
  ('infrared_heater','power_adjustment','Регулировка мощности',0.08,'boolean',null,
    '["Регулировка мощности","Ступени мощности","Регулятор мощности"]'::jsonb,false),
  ('infrared_heater','thermostat_type','Термостат',0.08,'categorical',null,
    '["Термостат","Тип термостата"]'::jsonb,false),
  ('infrared_heater','temperature_adjustment','Регулировка температуры',0.07,'boolean',null,
    '["Регулировка температуры","Регулятор температуры","Настройка температуры","Установка температуры"]'::jsonb,false),
  ('infrared_heater','control_type','Управление',0.07,'categorical',null,
    '["Управление","Тип управления","Управление прибором"]'::jsonb,false),
  ('infrared_heater','display_present','Дисплей',0.05,'boolean',null,
    '["Дисплей","Наличие дисплея","Экран","Цифровой дисплей","Информационный дисплей"]'::jsonb,false),
  ('infrared_heater','voltage_v','Напряжение',0.05,'neutral','В',
    '["Напряжение","Напряжение питания","Сетевое напряжение","Питание"]'::jsonb,false),
  ('infrared_heater','area_m2','Площадь обогрева',0.00,'neutral','м²',
    '["Площадь обогрева","Рекомендуемая площадь помещения","Максимальная площадь обогрева","Рекомендуемая площадь обогрева"]'::jsonb,false),
  ('infrared_heater','weight_kg','Вес',0.00,'neutral','кг',
    '["Вес","Масса"]'::jsonb,false),
  ('infrared_heater','fuel_type','Тип топлива',0.00,'categorical',null,
    '["Топливо","Тип топлива","Вид топлива","Газ"]'::jsonb,false),
  ('infrared_heater','overheat_protection','Защита от перегрева',0.00,'boolean',null,
    '["Защита от перегрева"]'::jsonb,false)
on conflict(profile_key,spec_key) do update set
  label=excluded.label,
  weight=excluded.weight,
  direction=excluded.direction,
  unit=excluded.unit,
  aliases=excluded.aliases,
  critical=excluded.critical,
  updated_at=now();
