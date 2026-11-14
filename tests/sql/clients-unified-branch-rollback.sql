begin;
do $test$
declare bid uuid;cid uuid;n bigint;denied bool;a uuid;original_branch uuid;
begin
 select c.id,bl.branch_id into cid,original_branch from public.clients c join public.crm_client_branch_links_v1 bl on bl.client_id=c.id where c.manager_name='Руднев' and not coalesce(c.is_archived,false) and not coalesce(c.to_delete,false) limit 1;
 insert into public.crm_client_branches_v1(name) values('Временный тест изоляции '||gen_random_uuid()) returning id into bid;
 update public.crm_client_branch_links_v1 set branch_id=bid where client_id=cid;
 foreach a in array array['ba55dfe5-7e48-4f1f-b40e-674c7752fe1a','19dd9943-99ae-47c4-a39c-4f82a11059a6']::uuid[] loop
 perform set_config('request.jwt.claims',jsonb_build_object('sub',a,'role','authenticated')::text,true);
 denied:=false;begin perform public.crm_clients_detail_v1(cid,'2026-11');exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'foreign_branch_leak %',a;end if;
 end loop;
 perform set_config('request.jwt.claims','{"sub":"544fb1e2-ef70-44de-bc62-e0e1596a4bfc","role":"authenticated"}',true);
 perform public.crm_clients_detail_v1(cid,'2026-11');
 update public.crm_client_branch_links_v1 set branch_id=original_branch where client_id=cid;
 perform set_config('request.jwt.claims','{"sub":"19dd9943-99ae-47c4-a39c-4f82a11059a6","role":"authenticated"}',true);
 perform public.crm_clients_detail_v1(cid,'2026-11');
end $test$;
rollback;
