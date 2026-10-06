-- RESANTA CRM v23.6.236 · approved gasoline chainsaw matching contract
-- Technical similarity uses ONLY engine displacement (50%) + power (50%).

update public.triovist_market_rules_v1
set weight=0, critical=false, updated_at=now()
where profile_key='chainsaw_gas';

insert into public.triovist_market_rules_v1
  (profile_key,spec_key,label,weight,direction,unit,aliases,critical)
values
  ('chainsaw_gas','engine_cc','Объём двигателя',0.50,'neutral','см³',
    '["Объем двигателя","Объём двигателя","Рабочий объем двигателя","Рабочий объём двигателя","Рабочий объем","Рабочий объём","Объем цилиндра","Объём цилиндра"]'::jsonb,true),
  ('chainsaw_gas','power_w','Мощность',0.50,'higher','Вт',
    '["Мощность","Мощность двигателя","Максимальная мощность"]'::jsonb,true)
on conflict(profile_key,spec_key) do update set
  label=excluded.label,
  weight=excluded.weight,
  direction=excluded.direction,
  unit=excluded.unit,
  aliases=excluded.aliases,
  critical=excluded.critical,
  updated_at=now();
