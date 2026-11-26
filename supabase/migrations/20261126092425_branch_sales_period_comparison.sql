create function public.crm_branch_sales_periods_v1(
  p_from date default null, p_to date default null,
  p_previous_from date default null, p_previous_to date default null,
  p_manager text default null
) returns jsonb
language plpgsql stable security definer set search_path=''
as $$
declare
  actor public.users;
  manager text;
  include_shop boolean;
  today date:=timezone('Europe/Minsk',now())::date;
  sales_period date;
  shop_period date;
  sales_at timestamptz;
  shop_at timestamptz;
  sales_day date;
  shop_day date;
  first_from date:=p_from;
  first_to date:=p_to;
  second_from date:=p_previous_from;
  second_to date:=p_previous_to;
  totals jsonb;
begin
  actor:=crm_private.client_actor_v1();
  manager:=case when actor.role='manager' then actor.name else nullif(btrim(p_manager),'') end;
  if lower(manager)='all' then manager:=null; end if;
  if actor.role='manager' and (manager is null or
    coalesce(nullif(btrim(p_manager),''),actor.name) not in ('all',actor.name)) then
    raise exception 'not_authorized' using errcode='42501';
  end if;
  include_shop:=actor.role='boss' and manager is null and actor.id in (
    '544fb1e2-ef70-44de-bc62-e0e1596a4bfc'::uuid,'ba55dfe5-7e48-4f1f-b40e-674c7752fe1a'::uuid
  );
  select (report_period||'-01')::date,source_message_at into sales_period,sales_at
  from public.crm_import_status where source='sales' and status='ok' and report_period ~ '^\d{4}-\d{2}$';
  if include_shop then
    select (report_period||'-01')::date,source_message_at into shop_period,shop_at
    from public.crm_import_status where source='triovist_sales' and status='ok' and report_period ~ '^\d{4}-\d{2}$';
  end if;
  sales_day:=timezone('Europe/Minsk',sales_at)::date;
  shop_day:=timezone('Europe/Minsk',shop_at)::date;
  if p_from is null and p_to is null and p_previous_from is null and p_previous_to is null then
    first_from:=date_trunc('month',today)::date;
    first_to:=case when sales_period=first_from and sales_day between first_from and today then sales_day else today end;
    second_from:=(first_from-interval '1 year')::date;
    second_to:=(first_to-interval '1 year')::date;
  end if;
  if first_from is null or first_to is null or second_from is null or second_to is null
    or first_from<date '2023-01-01' or second_from<date '2023-01-01'
    or first_from>first_to or second_from>second_to or first_to>today or second_to>today
    or first_to>=first_from+interval '3 years' or second_to>=second_from+interval '3 years' then
    raise exception 'invalid_period' using errcode='22023';
  end if;

  with periods(pos,from_date,to_date) as (
    values(1,first_from,first_to),(2,second_from,second_to)
  ), bins as materialized (
    select p.*,m::date as month,(m+interval '1 month - 1 day')::date month_end,
      greatest(p.from_date,m::date) slice_from,least(p.to_date,(m+interval '1 month - 1 day')::date) slice_to
    from periods p cross join lateral generate_series(
      date_trunc('month',p.from_date),date_trunc('month',p.to_date),interval '1 month'
    ) m
  ), months as materialized (select distinct month from bins),
  active_clients as materialized (
    select c.id,c.name,c.manager_name from public.clients c
    where manager is not null and not coalesce(c.is_archived,false) and not coalesce(c.to_delete,false)
  ), names as materialized (
    select c.id,c.name,c.manager_name from active_clients c
    union all
    select c.id,a.alias_name,c.manager_name from public.client_aliases a join active_clients c on c.id=a.client_id
  ), exact_map as materialized (
    select k,min(manager_name) manager_name from
    (select public.crm_client_key(name) k,id,manager_name from names) s
    where k<>'' group by k having count(distinct id)=1
  ), legal_map as materialized (
    select k,min(manager_name) manager_name from
    (select public.crm_client_legal_key_v236374(name) k,manager_name from names) s
    where k<>'' group by k having count(distinct manager_name)=1
  ), fields as (
    select ph.month,count(*) row_count,coalesce(sum(ph.revenue) filter(where manager is null
      or lower(btrim(coalesce(c.manager_name,e.manager_name,l.manager_name,ph.manager_name,'')))=lower(manager)),0) amount
    from months m join public.purchase_history ph on ph.month=m.month
    left join active_clients c on c.id=ph.client_id
    left join exact_map e on manager is not null and c.id is null and e.k=public.crm_client_key(ph.client_name)
    left join legal_map l on manager is not null and c.id is null and e.k is null and l.k=public.crm_client_legal_key_v236374(ph.client_name)
    where public.crm_client_exact_key_v236204(ph.client_name)<>'итого'
    group by ph.month
  ), available as (
    select b.*,f.amount field_value,t.revenue shop_value,
      f.row_count is not null and b.slice_from=b.month and (
        (b.month_end<today and b.slice_to=b.month_end and (b.month is distinct from sales_period or sales_day>=b.month_end))
        or (b.month=sales_period and b.slice_to=sales_day)
      ) as field_ok,
      (not include_shop or (t.month is not null and b.slice_from=b.month and (
        (b.month_end<today and b.slice_to=b.month_end and (b.month is distinct from shop_period or shop_day>=b.month_end))
        or (b.month=shop_period and b.slice_to=shop_day and shop_at=sales_at)
      ))) as shop_ok
    from bins b left join fields f on f.month=b.month
    left join public.triovist_sales_imports t on include_shop and t.month=b.month
  ), grouped as (
    select pos,from_date,to_date,
      case when bool_and(field_ok) is true then round(sum(field_value),2) end field,
      case when include_shop and bool_and(shop_ok) is true then round(sum(shop_value),2) end triovist,
      bool_and(field_ok and shop_ok) is true complete,
      bool_and(slice_from=month and slice_to=month_end) full_months,
      count(*) months,
      coalesce(jsonb_agg(jsonb_build_object('from',slice_from,'to',slice_to,'field',field_ok is true,'triovist',shop_ok is true) order by month)
        filter(where field_ok is not true or shop_ok is not true),'[]'::jsonb) missing
    from available group by pos,from_date,to_date
  )
  select jsonb_agg(to_jsonb(g)||jsonb_build_object('total',case when g.complete then g.field+coalesce(g.triovist,0) end) order by pos)
  into totals from grouped g;
  return jsonb_build_object('periods',totals,'include_triovist',include_shop,'manager',manager,
    'source_message_at',sales_at,'shop_source_message_at',shop_at,'today',today);
end;
$$;
revoke all on function public.crm_branch_sales_periods_v1(date,date,date,date,text) from public,anon;
grant execute on function public.crm_branch_sales_periods_v1(date,date,date,date,text) to authenticated;
