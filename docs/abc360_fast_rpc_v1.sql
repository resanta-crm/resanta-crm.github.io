-- Recovery copy of separately applied Supabase migration abc360_fast_rpc_v20261109.
-- In Supabase migration history: abc360_fast_rpc_v20261109. This file is documentation-only.
-- ABC360: optimized, independent RPC. Existing v236342 remains unchanged.
-- Preserves 1C sales; avoids to_char() index defeat and quadratic first-SKU join.
CREATE OR REPLACE FUNCTION public.crm_abc_slice_v20261109(p_scope text, p_manager text, p_client_id uuid, p_current_months text[], p_previous_months text[])
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_catalog'
AS $function$
with params as (
  select
    case when lower(coalesce(p_scope,'')) in ('branch','manager','client') then lower(p_scope) else 'branch' end scope,
    nullif(trim(coalesce(p_manager,'')),'') manager_name,
    p_client_id client_id,
    coalesce(p_current_months,array[]::text[]) current_months,
    coalesce(p_previous_months,array[]::text[]) previous_months,
    ARRAY(SELECT to_date(v,'YYYY-MM') FROM unnest(coalesce(p_current_months,array[]::text[]) || coalesce(p_previous_months,array[]::text[])) AS v) all_month_dates
),
keys as materialized (
  select public.crm_client_key(c.name) k,c.id,c.name,c.manager_name
  from public.clients c
  where public.crm_client_key(c.name)<>''
  union all
  select public.crm_client_key(a.alias_name),c.id,c.name,c.manager_name
  from public.client_aliases a
  join public.clients c on c.id=a.client_id
  where public.crm_client_key(a.alias_name)<>''
),
key_map as materialized (
  select k,min(id::text)::uuid client_id,min(name) client_name,min(manager_name) manager_name
  from keys
  group by k
  having count(distinct id)=1
),
base as materialized (
  select
    coalesce(c.id,km.client_id) resolved_client_id,
    coalesce(c.name,km.client_name,ph.client_name) resolved_client_name,
    coalesce(c.manager_name,km.manager_name,ph.manager_name) resolved_manager,
    ph.category,ph.subgroup,ph.product,ph.sku,
    ph.month::date sale_month,
    coalesce(ph.revenue,0)::numeric revenue,
    coalesce(ph.qty,0)::numeric qty
  from public.purchase_history ph
  left join public.clients c on c.id=ph.client_id
  left join key_map km on c.id is null and km.k=public.crm_client_key(ph.client_name)
  cross join params p
  where ph.month = any(p.all_month_dates)
),
scope_base as materialized (
  select b.*
  from base b
  cross join params p
  where
    p.scope='branch'
    or (p.scope='manager' and b.resolved_manager=p.manager_name)
    or (p.scope='client' and b.resolved_client_id=p.client_id)
),
scope_agg as materialized (
  select
    case when p.scope='branch' then null::uuid else b.resolved_client_id end client_id,
    case when p.scope='branch' then null::text else max(b.resolved_client_name) end client_name,
    b.category,b.subgroup,b.product,b.sku,
    round(sum(b.revenue) filter(where to_char(b.sale_month,'YYYY-MM')=any(p.current_months)),2) current_revenue,
    round(sum(b.qty) filter(where to_char(b.sale_month,'YYYY-MM')=any(p.current_months)),3) current_qty,
    max(to_char(b.sale_month,'YYYY-MM')) filter(where to_char(b.sale_month,'YYYY-MM')=any(p.current_months) and b.revenue<>0) last_current_month,
    round(sum(b.revenue) filter(where to_char(b.sale_month,'YYYY-MM')=any(p.previous_months)),2) previous_revenue,
    round(sum(b.qty) filter(where to_char(b.sale_month,'YYYY-MM')=any(p.previous_months)),3) previous_qty,
    max(to_char(b.sale_month,'YYYY-MM')) filter(where to_char(b.sale_month,'YYYY-MM')=any(p.previous_months) and b.revenue<>0) last_previous_month
  from scope_base b
  cross join params p
  group by
    p.scope,
    case when p.scope='branch' then null::uuid else b.resolved_client_id end,
    b.category,b.subgroup,b.product,b.sku,
    p.current_months,p.previous_months
  having
    coalesce(sum(b.revenue) filter(where to_char(b.sale_month,'YYYY-MM')=any(p.current_months)),0)<>0
    or coalesce(sum(b.qty) filter(where to_char(b.sale_month,'YYYY-MM')=any(p.current_months)),0)<>0
    or coalesce(sum(b.revenue) filter(where to_char(b.sale_month,'YYYY-MM')=any(p.previous_months)),0)<>0
    or coalesce(sum(b.qty) filter(where to_char(b.sale_month,'YYYY-MM')=any(p.previous_months)),0)<>0
),
branch_other as materialized (
  select
    null::uuid client_id,
    '__branch__'::text client_name,
    b.category,b.subgroup,b.product,b.sku,
    round(sum(b.revenue),2) current_revenue,
    round(sum(b.qty),3) current_qty,
    max(to_char(b.sale_month,'YYYY-MM')) filter(where b.revenue<>0) last_current_month,
    0::numeric previous_revenue,
    0::numeric previous_qty,
    null::text last_previous_month
  from base b
  cross join params p
  where p.scope='client'
    and to_char(b.sale_month,'YYYY-MM')=any(p.current_months)
    and (b.resolved_client_id is distinct from p.client_id)
  group by b.category,b.subgroup,b.product,b.sku
  having coalesce(sum(b.revenue),0)<>0 or coalesce(sum(b.qty),0)<>0
),
combined as materialized (
  select * from scope_agg
  union all
  select * from branch_other
),
item_keys as materialized (
  select distinct
    coalesce(nullif(trim(category),''),'') category,
    case
      when nullif(trim(coalesce(sku,'')),'') is not null then 's:'||lower(trim(sku))
      else 'p:'||public.crm_client_key(product)
    end item_key
  from combined
),
firsts as materialized (
  select
    coalesce(nullif(trim(ph.category),''),'') category,
    case
      when nullif(trim(coalesce(ph.sku,'')),'') is not null then 's:'||lower(trim(ph.sku))
      else 'p:'||public.crm_client_key(ph.product)
    end item_key,
    min(to_char(ph.month,'YYYY-MM')) first_month
  from public.purchase_history ph
  group by 1,2
)
select jsonb_build_object(
  'ok',true,
  'scope',(select scope from params),
  'source_rows',(select count(*) from scope_base),
  'rows',coalesce(jsonb_agg(
    jsonb_build_object(
      'client_id',c.client_id,
      'client_name',c.client_name,
      'category',c.category,
      'subgroup',c.subgroup,
      'product',c.product,
      'sku',c.sku,
      'current_revenue',coalesce(c.current_revenue,0),
      'current_qty',coalesce(c.current_qty,0),
      'last_current_month',c.last_current_month,
      'previous_revenue',coalesce(c.previous_revenue,0),
      'previous_qty',coalesce(c.previous_qty,0),
      'last_previous_month',c.last_previous_month,
      'first_month',f.first_month
    )
    order by c.client_name nulls first,c.category,c.product,c.sku
  ),'[]'::jsonb)
)
from combined c
left join firsts f
  on f.category=coalesce(nullif(trim(c.category),''),'')
 and f.item_key=case
    when nullif(trim(coalesce(c.sku,'')),'') is not null then 's:'||lower(trim(c.sku))
    else 'p:'||public.crm_client_key(c.product)
  end;
$function$;
REVOKE ALL ON FUNCTION public.crm_abc_slice_v20261109(text,text,uuid,text[],text[]) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.crm_abc_slice_v20261109(text,text,uuid,text[],text[]) TO authenticated,service_role;
