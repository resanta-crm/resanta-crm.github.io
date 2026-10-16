-- Resanta CRM v23.6.376 · Payment registry expense analytics

create or replace function public.payment_registry_expense_label_v2(p_expense_type text)
returns text
language sql
immutable
parallel safe
set search_path to 'pg_catalog'
as $$
  select case lower(coalesce(p_expense_type,''))
    when 'transport' then 'Транспортные расходы'
    when 'loading' then 'Погрузочно-разгрузочные'
    when 'rent' then 'Аренда'
    when 'utilities' then 'Коммунальные расходы'
    when 'advertising' then 'Реклама / маркетинг'
    when 'office' then 'Офис / канцелярия'
    when 'packaging' then 'Упаковка / расходные материалы'
    when 'service' then 'Сервис / ремонт'
    when 'equipment' then 'Оборудование / оснащение'
    else 'Прочее'
  end;
$$;

create or replace function public.payment_registry_infer_expense_type_v2(
  p_category text,
  p_comment text,
  p_description text
)
returns text
language plpgsql
immutable
parallel safe
set search_path to 'pg_catalog'
as $function$
declare
  t text:=lower(trim(coalesce(p_comment,'')||' '||coalesce(p_description,'')));
  c text:=lower(trim(coalesce(p_category,'')));
begin
  if t ~ '(погруз|разгруз)' then return 'loading'; end if;
  if c='drivers' or t ~ '(транспорт|логист|доставк|грузоперев|перевоз)' then return 'transport'; end if;
  if t ~ 'аренд' then return 'rent'; end if;
  if t ~ 'коммун' then return 'utilities'; end if;
  if t ~ '(реклам|баннер)' then return 'advertising'; end if;
  if t ~ '(канцел|картридж|вода)' then return 'office'; end if;
  if t ~ '(короб|пленк|лента|упаков|пряжк|уголк)' then return 'packaging'; end if;
  if t ~ '(ремонт|переработ)' then return 'service'; end if;
  if t ~ '(ноутбук|огнетуш|пожар|оборудован)' then return 'equipment'; end if;
  return 'other';
end;
$function$;

alter table public.payment_registry
  add column if not exists expense_type text;

update public.payment_registry
set expense_type=public.payment_registry_infer_expense_type_v2(category,creator_comment,description)
where expense_type is null
   or trim(expense_type)=''
   or expense_type not in ('transport','loading','rent','utilities','advertising','office','packaging','service','equipment','other');

alter table public.payment_registry
  alter column expense_type set default 'other',
  alter column expense_type set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname='payment_registry_expense_type_v2_chk'
      and conrelid='public.payment_registry'::regclass
  ) then
    alter table public.payment_registry
      add constraint payment_registry_expense_type_v2_chk
      check (expense_type in ('transport','loading','rent','utilities','advertising','office','packaging','service','equipment','other'));
  end if;
end $$;

create index if not exists payment_registry_month_expense_type_v2_idx
  on public.payment_registry(month,expense_type,status);

create or replace function public.payment_registry_set_expense_type_v2()
returns trigger
language plpgsql
set search_path to 'public','pg_catalog'
as $function$
begin
  if new.expense_type is null
     or trim(new.expense_type)=''
     or new.expense_type not in ('transport','loading','rent','utilities','advertising','office','packaging','service','equipment','other')
     or new.expense_type='other' then
    new.expense_type:=public.payment_registry_infer_expense_type_v2(new.category,new.creator_comment,new.description);
  end if;
  return new;
end;
$function$;

drop trigger if exists payment_registry_expense_type_v2_trg on public.payment_registry;
create trigger payment_registry_expense_type_v2_trg
before insert or update of category,creator_comment,description,expense_type
on public.payment_registry
for each row execute function public.payment_registry_set_expense_type_v2();

revoke execute on function public.payment_registry_set_expense_type_v2() from public,anon,authenticated;
grant execute on function public.payment_registry_set_expense_type_v2() to service_role;

create or replace function public.payment_registry_create_v2(
  p_category text,
  p_expense_type text,
  p_description text,
  p_amount numeric,
  p_currency text default 'BYN',
  p_document_date date default null,
  p_due_date date default null,
  p_comment text default null,
  p_month date default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public','auth','pg_catalog','pg_temp'
as $function$
declare
  e text:=public.payment_actor_email();
  idv uuid;
  m date;
  et text:=lower(trim(coalesce(p_expense_type,'')));
begin
  if not public.payment_registry_can_create() then raise exception 'Нет доступа' using errcode='42501'; end if;
  if trim(coalesce(p_description,''))='' then raise exception 'Укажите назначение платежа'; end if;
  if coalesce(p_amount,0)<=0 then raise exception 'Сумма должна быть больше нуля'; end if;
  if et not in ('transport','loading','rent','utilities','advertising','office','packaging','service','equipment','other') then
    raise exception 'Выберите статью расходов';
  end if;
  m:=date_trunc('month',coalesce(p_month,p_document_date,current_date))::date;
  insert into public.payment_registry(
    month,category,expense_type,description,amount,currency,document_date,due_date,
    creator_comment,created_by_email,status,source_type
  )
  values(
    m,
    case when p_category in ('drivers','other') then p_category else 'other' end,
    et,
    trim(p_description),
    p_amount,
    coalesce(nullif(trim(p_currency),''),'BYN'),
    p_document_date,p_due_date,p_comment,e,'draft','manual'
  )
  returning id into idv;
  return jsonb_build_object('ok',true,'id',idv,'expense_type',et,'expense_label',public.payment_registry_expense_label_v2(et));
end;
$function$;

revoke execute on function public.payment_registry_create_v2(text,text,text,numeric,text,date,date,text,date) from public,anon;
grant execute on function public.payment_registry_create_v2(text,text,text,numeric,text,date,date,text,date) to authenticated,service_role;

create or replace function public.payment_registry_dashboard_v2(
  p_month date default date_trunc('month',current_date)::date,
  p_expense_type text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public','auth','pg_catalog','pg_temp'
as $function$
declare
  m date:=date_trunc('month',coalesce(p_month,current_date))::date;
  prev_m date:=(date_trunc('month',coalesce(p_month,current_date))-interval '1 month')::date;
  et text:=nullif(lower(trim(coalesce(p_expense_type,''))),'');
  j jsonb;
begin
  if not public.payment_registry_can_view() then
    raise exception 'Нет доступа' using errcode='42501';
  end if;
  if et is not null and et not in ('transport','loading','rent','utilities','advertising','office','packaging','service','equipment','other') then
    raise exception 'Некорректная статья расходов';
  end if;

  with scoped_all as materialized (
    select p.*,
      (p.status='approved' and p.month=prev_m) as is_carryover,
      (p.status='paid' and p.month=prev_m and date_trunc('month',p.paid_at)::date=m) as paid_from_previous
    from public.payment_registry p
    where p.month=m
       or (p.status='approved' and p.month=prev_m)
       or (p.status='paid' and p.month=prev_m and date_trunc('month',p.paid_at)::date=m)
  ),
  scoped as materialized (
    select * from scoped_all p
    where et is null or p.expense_type=et
  ),
  articles as (
    select
      expense_type,
      public.payment_registry_expense_label_v2(expense_type) expense_label,
      count(*)::int total_count,
      coalesce(sum(amount),0)::numeric total_amount,
      count(*) filter(where status='submitted' and month=m)::int submitted_count,
      coalesce(sum(amount) filter(where status='submitted' and month=m),0)::numeric submitted_amount,
      count(*) filter(where status='approved')::int approved_count,
      coalesce(sum(amount) filter(where status='approved'),0)::numeric approved_amount,
      count(*) filter(where status='paid' and (month=m or paid_from_previous))::int paid_count,
      coalesce(sum(amount) filter(where status='paid' and (month=m or paid_from_previous)),0)::numeric paid_amount,
      count(*) filter(where status='rejected' and month=m)::int rejected_count,
      coalesce(sum(amount) filter(where status='rejected' and month=m),0)::numeric rejected_amount,
      count(*) filter(where status='draft' and month=m)::int draft_count,
      coalesce(sum(amount) filter(where status='draft' and month=m),0)::numeric draft_amount
    from scoped_all
    group by expense_type
  ),
  recipients as (
    select
      description recipient,
      count(*)::int total_count,
      coalesce(sum(amount),0)::numeric total_amount,
      coalesce(sum(amount) filter(where status='paid' and (month=m or paid_from_previous)),0)::numeric paid_amount,
      coalesce(sum(amount) filter(where status in ('submitted','approved')),0)::numeric pending_amount
    from scoped
    group by description
    order by sum(amount) desc,description
    limit 20
  )
  select jsonb_build_object(
    'month',m,
    'expense_type',et,
    'expense_label',case when et is null then 'Все расходы' else public.payment_registry_expense_label_v2(et) end,
    'total_count',count(*),
    'total_amount',coalesce(sum(amount),0),
    'submitted_count',count(*) filter(where status='submitted' and month=m),
    'submitted_amount',coalesce(sum(amount) filter(where status='submitted' and month=m),0),
    'approved_count',count(*) filter(where status='approved'),
    'approved_amount',coalesce(sum(amount) filter(where status='approved'),0),
    'carryover_approved_count',count(*) filter(where is_carryover),
    'carryover_approved_amount',coalesce(sum(amount) filter(where is_carryover),0),
    'paid_count',count(*) filter(where status='paid' and (month=m or paid_from_previous)),
    'paid_amount',coalesce(sum(amount) filter(where status='paid' and (month=m or paid_from_previous)),0),
    'paid_from_previous_count',count(*) filter(where paid_from_previous),
    'paid_from_previous_amount',coalesce(sum(amount) filter(where paid_from_previous),0),
    'rejected_count',count(*) filter(where status='rejected' and month=m),
    'rejected_amount',coalesce(sum(amount) filter(where status='rejected' and month=m),0),
    'imported_count',count(*) filter(where status='imported' and month=m),
    'imported_amount',coalesce(sum(amount) filter(where status='imported' and month=m),0),
    'draft_count',count(*) filter(where status='draft' and month=m),
    'draft_amount',coalesce(sum(amount) filter(where status='draft' and month=m),0),
    'article_summary',coalesce((select jsonb_agg(to_jsonb(a) order by a.total_amount desc,a.expense_label) from articles a),'[]'::jsonb),
    'recipients',coalesce((select jsonb_agg(to_jsonb(r) order by r.total_amount desc,r.recipient) from recipients r),'[]'::jsonb)
  )
  into j
  from scoped;

  return j;
end;
$function$;

revoke execute on function public.payment_registry_dashboard_v2(date,text) from public,anon;
grant execute on function public.payment_registry_dashboard_v2(date,text) to authenticated,service_role;

create or replace function public.payment_registry_list_v2(
  p_month date default date_trunc('month',current_date)::date,
  p_status text default null,
  p_search text default '',
  p_expense_type text default null,
  p_limit integer default 200,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public','auth','pg_catalog','pg_temp'
as $function$
declare
  m date:=date_trunc('month',coalesce(p_month,current_date))::date;
  prev_m date:=(date_trunc('month',coalesce(p_month,current_date))-interval '1 month')::date;
  q text:=lower(trim(coalesce(p_search,'')));
  et text:=nullif(lower(trim(coalesce(p_expense_type,''))),'');
  lim integer:=least(greatest(coalesce(p_limit,200),1),500);
  off integer:=greatest(coalesce(p_offset,0),0);
  total bigint;
  rows jsonb;
begin
  if not public.payment_registry_can_view() then
    raise exception 'Нет доступа' using errcode='42501';
  end if;
  if et is not null and et not in ('transport','loading','rent','utilities','advertising','office','packaging','service','equipment','other') then
    raise exception 'Некорректная статья расходов';
  end if;

  with scoped as (
    select p.*,
      public.payment_registry_expense_label_v2(p.expense_type) expense_label,
      (p.status='approved' and p.month=prev_m) as is_carryover,
      case
        when p.status='approved' and p.month=prev_m then 'approved_carryover'
        when p.status='paid' and p.month=prev_m and date_trunc('month',p.paid_at)::date=m then 'paid_from_previous'
        else 'origin_month'
      end as operational_reason
    from public.payment_registry p
    where (p.month=m
       or (p.status='approved' and p.month=prev_m)
       or (p.status='paid' and p.month=prev_m and date_trunc('month',p.paid_at)::date=m))
      and (et is null or p.expense_type=et)
  )
  select count(*) into total
  from scoped p
  where (p_status is null or p_status='' or p.status=p_status)
    and (
      q='' or lower(p.description) like '%'||q||'%'
      or lower(coalesce(p.creator_comment,'')) like '%'||q||'%'
      or lower(coalesce(p.expense_label,'')) like '%'||q||'%'
      or lower(coalesce(p.created_by_email,'')) like '%'||q||'%'
      or lower(coalesce(p.approved_by_email,'')) like '%'||q||'%'
      or lower(coalesce(p.paid_by_email,'')) like '%'||q||'%'
    );

  with scoped as (
    select p.*,
      public.payment_registry_expense_label_v2(p.expense_type) expense_label,
      (p.status='approved' and p.month=prev_m) as is_carryover,
      case
        when p.status='approved' and p.month=prev_m then 'approved_carryover'
        when p.status='paid' and p.month=prev_m and date_trunc('month',p.paid_at)::date=m then 'paid_from_previous'
        else 'origin_month'
      end as operational_reason
    from public.payment_registry p
    where (p.month=m
       or (p.status='approved' and p.month=prev_m)
       or (p.status='paid' and p.month=prev_m and date_trunc('month',p.paid_at)::date=m))
      and (et is null or p.expense_type=et)
  )
  select coalesce(jsonb_agg(to_jsonb(x) order by x.sort_rank,x.created_at desc),'[]'::jsonb)
  into rows
  from (
    select p.*,
      case p.status
        when 'submitted' then 0 when 'approved' then 1 when 'paid' then 2
        when 'draft' then 3 when 'rejected' then 4 else 5
      end as sort_rank,
      coalesce((
        select jsonb_agg(jsonb_build_object(
          'id',f.id,'storage_path',f.storage_path,'original_name',f.original_name,
          'mime_type',f.mime_type,'size_bytes',f.size_bytes,'created_at',f.created_at
        ) order by f.created_at)
        from public.payment_registry_files f where f.payment_id=p.id
      ),'[]'::jsonb) files
    from scoped p
    where (p_status is null or p_status='' or p.status=p_status)
      and (
        q='' or lower(p.description) like '%'||q||'%'
        or lower(coalesce(p.creator_comment,'')) like '%'||q||'%'
        or lower(coalesce(p.expense_label,'')) like '%'||q||'%'
        or lower(coalesce(p.created_by_email,'')) like '%'||q||'%'
        or lower(coalesce(p.approved_by_email,'')) like '%'||q||'%'
        or lower(coalesce(p.paid_by_email,'')) like '%'||q||'%'
      )
    order by
      case p.status when 'submitted' then 0 when 'approved' then 1 when 'paid' then 2
        when 'draft' then 3 when 'rejected' then 4 else 5 end,
      p.created_at desc
    limit lim offset off
  ) x;

  return jsonb_build_object(
    'month',m,'expense_type',et,'total',total,'rows',rows,'limit',lim,'offset',off
  );
end;
$function$;

revoke execute on function public.payment_registry_list_v2(date,text,text,text,integer,integer) from public,anon;
grant execute on function public.payment_registry_list_v2(date,text,text,text,integer,integer) to authenticated,service_role;
