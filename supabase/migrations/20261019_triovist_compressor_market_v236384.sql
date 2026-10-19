-- RESANTA CRM v23.6.384
-- Triovist / 21vek competitor parser: compressors.
-- Approved characteristics:
-- compressor type, receiver volume, engine type, performance, maximum pressure.
-- Missing characteristics are never treated as zero or as an automatic loss.

insert into public.triovist_market_rules_v1
  (profile_key,spec_key,label,weight,direction,unit,aliases,critical,updated_at)
values
  (
    'compressor','compressor_type','Тип компрессора',0.25,'categorical',null,
    '["Тип компрессора","Вид компрессора","Конструкция компрессора","Принцип работы компрессора","Тип компрессорной головки"]'::jsonb,
    true,now()
  ),
  (
    'compressor','receiver_capacity_l','Объём ресивера',0.25,'higher','л',
    '["Объём ресивера","Объем ресивера","Обьем ресивера","Емкость ресивера","Ёмкость ресивера","Объём воздушного ресивера","Объем воздушного ресивера","Ресивер"]'::jsonb,
    true,now()
  ),
  (
    'compressor','compressor_engine_type','Тип двигателя',0.15,'categorical',null,
    '["Тип двигателя","Двигатель","Вид двигателя","Привод компрессора","Тип привода"]'::jsonb,
    true,now()
  ),
  (
    'compressor','flow_rate_lmin','Производительность',0.25,'higher','л/мин',
    '["Производительность","Максимальная производительность","Производительность на входе","Производительность на выходе","Подача","Расход воздуха","Воздушный поток"]'::jsonb,
    true,now()
  ),
  (
    'compressor','pressure_bar','Максимальное давление',0.10,'higher','бар',
    '["Максимальное давление","Макс. давление","Макс давление","Рабочее давление","Давление"]'::jsonb,
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
