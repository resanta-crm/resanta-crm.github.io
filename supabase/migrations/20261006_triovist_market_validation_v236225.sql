-- RESANTA CRM v23.6.225 · market validation aliases
update public.triovist_market_rules_v1
set aliases = aliases || '["Мощность обогрева"]'::jsonb, updated_at=now()
where profile_key='convector' and spec_key='power_w'
  and not aliases @> '["Мощность обогрева"]'::jsonb;

update public.triovist_market_rules_v1
set aliases = aliases || '["Рекомендуемая площадь обогрева"]'::jsonb, updated_at=now()
where profile_key='convector' and spec_key='area_m2'
  and not aliases @> '["Рекомендуемая площадь обогрева"]'::jsonb;

update public.triovist_market_rules_v1
set aliases = aliases || '["Регулировка мощности"]'::jsonb, updated_at=now()
where profile_key='convector' and spec_key='power_modes'
  and not aliases @> '["Регулировка мощности"]'::jsonb;

update public.triovist_market_rules_v1
set aliases = aliases || '["Влагостойкий корпус"]'::jsonb, updated_at=now()
where profile_key='convector' and spec_key='ip_rating'
  and not aliases @> '["Влагостойкий корпус"]'::jsonb;

update public.triovist_market_rules_v1
set aliases = aliases || '["Способ установки"]'::jsonb, updated_at=now()
where profile_key='convector' and spec_key='installation_type'
  and not aliases @> '["Способ установки"]'::jsonb;
