-- RESANTA CRM v23.6.234 · approved convector comparison contract
-- Convector-only: area is reference-only; comparison uses 7 approved characteristics.

update public.triovist_market_rules_v1
set weight=0, critical=false, updated_at=now()
where profile_key='convector';

insert into public.triovist_market_rules_v1
  (profile_key,spec_key,label,weight,direction,unit,aliases,critical)
values
  ('convector','power_w','Мощность обогрева',0.30,'higher','Вт',
    '["Мощность","Максимальная мощность","Потребляемая мощность","Номинальная мощность","Мощность обогрева"]'::jsonb,true),
  ('convector','heater_type','Нагревательный элемент',0.20,'categorical',null,
    '["Нагревательный элемент","Тип нагревательного элемента"]'::jsonb,false),
  ('convector','control_type','Управление',0.15,'categorical',null,
    '["Управление","Тип управления"]'::jsonb,false),
  ('convector','display_present','Наличие дисплея',0.10,'boolean',null,
    '["Дисплей","Наличие дисплея","Экран","Цифровой дисплей","Информационный дисплей"]'::jsonb,false),
  ('convector','thermostat_type','Термостат',0.10,'categorical',null,
    '["Термостат","Тип термостата"]'::jsonb,false),
  ('convector','power_adjustment','Регулировка мощности',0.08,'boolean',null,
    '["Регулировка мощности"]'::jsonb,false),
  ('convector','temperature_adjustment','Регулировка температуры',0.07,'boolean',null,
    '["Регулировка температуры","Регулятор температуры","Настройка температуры","Установка температуры"]'::jsonb,false),
  ('convector','area_m2','Площадь обогрева',0.00,'neutral','м²',
    '["Площадь обогрева","Рекомендуемая площадь помещения","Максимальная площадь обогрева","Рекомендуемая площадь обогрева"]'::jsonb,false),
  ('convector','power_modes','Количество режимов мощности',0.00,'neutral','шт.',
    '["Количество режимов мощности","Количество режимов нагрева","Режимы мощности"]'::jsonb,false)
on conflict(profile_key,spec_key) do update set
  label=excluded.label,
  weight=excluded.weight,
  direction=excluded.direction,
  unit=excluded.unit,
  aliases=excluded.aliases,
  critical=excluded.critical,
  updated_at=now();

-- 0 BYN from 21vek is a missing-price sentinel, not a real retail price.
update public.triovist_market_products_current_v1 p
set current_price=null
where p.current_price<=0
  and exists (
    select 1 from public.triovist_market_scopes_v1 s
    where s.scope_key=p.scope_key and s.profile_key='convector'
  );

update public.triovist_market_product_snapshots_v1 p
set current_price=null
where p.current_price<=0
  and exists (
    select 1 from public.triovist_market_scopes_v1 s
    where s.scope_key=p.scope_key and s.profile_key='convector'
  );

update public.triovist_market_analysis_current_v1 a
set competitor_price=null, price_delta_byn=null, price_delta_pct=null
where coalesce(a.competitor_price,0)<=0
  and exists (
    select 1 from public.triovist_market_scopes_v1 s
    where s.scope_key=a.scope_key and s.profile_key='convector'
  );
