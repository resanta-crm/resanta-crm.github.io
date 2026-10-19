-- Factory 5.0 atomic queue claim.
-- Prevent duplicate paid work when multiple GitHub shards poll the same queued SKU.

create or replace function public.triovist_infographic_factory_claim_v5(p_lease_minutes integer default 35)
returns setof public.triovist_infographic_factory_items_v5
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with candidate as (
    select i.id
    from public.triovist_infographic_factory_items_v5 i
    join public.triovist_infographic_factory_batches_v5 b on b.id=i.batch_id
    where b.status in ('queued','researching','processing')
      and i.status in ('queued','planning','generating','qa','remaking')
      and (i.next_attempt_at is null or i.next_attempt_at <= now())
      and (i.locked_until is null or i.locked_until <= now())
    order by i.is_reference desc, b.created_at asc, i.updated_at asc, i.sku asc
    for update of i skip locked
    limit 1
  )
  update public.triovist_infographic_factory_items_v5 i
  set lock_token=gen_random_uuid()::text,
      locked_until=now()+make_interval(mins=>greatest(5,least(coalesce(p_lease_minutes,35),60))),
      started_at=coalesce(i.started_at,now()),
      updated_at=now()
  from candidate c
  where i.id=c.id
  returning i.*;
end;
$$;

revoke all on function public.triovist_infographic_factory_claim_v5(integer) from public,anon,authenticated;
grant execute on function public.triovist_infographic_factory_claim_v5(integer) to service_role;

comment on function public.triovist_infographic_factory_claim_v5(integer) is
'Atomically claims one due Factory 5 item using FOR UPDATE SKIP LOCKED so parallel workers cannot duplicate paid work.';
