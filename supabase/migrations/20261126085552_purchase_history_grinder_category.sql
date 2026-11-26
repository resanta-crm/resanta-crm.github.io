-- The 1C hierarchy in older files placed this Eurolux grinder under petrol trimmers.
-- The same article is filed under power tools in the October and November data.
create function public.crm_purchase_grinder_category_v1()
returns trigger
language plpgsql
set search_path=''
as $$
begin
  new.category:='ИНСТРУМЕНТ';
  new.subgroup:='Углошлифовальные машины';
  return new;
end;
$$;

revoke all on function public.crm_purchase_grinder_category_v1() from public,anon,authenticated;

create trigger crm_purchase_grinder_category_v1
before insert or update of sku,category,subgroup on public.purchase_history
for each row
when (
  new.sku='72/12/49'
  and new.category='САДОВАЯ ТЕХНИКА'
  and new.subgroup='Бензиновые триммеры'
)
execute function public.crm_purchase_grinder_category_v1();

update public.purchase_history
set category='ИНСТРУМЕНТ', subgroup='Углошлифовальные машины'
where sku='72/12/49' and category='САДОВАЯ ТЕХНИКА' and subgroup='Бензиновые триммеры';
