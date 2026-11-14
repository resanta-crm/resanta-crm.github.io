begin;
do $test$
declare p uuid;first_claim uuid;second_claim uuid;row public.crm_lpr_birthday_delivery_v1%rowtype;bad boolean;begin
 insert into public.crm_lpr_contacts_v1(organization_key,responsible_user_id,full_name,position_title,birth_month,birth_day,created_by,updated_by)
 values('triovist','9076ccde-a8cc-47e3-b71e-c31170b693ff','Проверка доставки '||gen_random_uuid(),'Тест',11,15,'544fb1e2-ef70-44de-bc62-e0e1596a4bfc','544fb1e2-ef70-44de-bc62-e0e1596a4bfc') returning id into p;
 first_claim:=public.crm_lpr_delivery_claim_v2(p,'544fb1e2-ef70-44de-bc62-e0e1596a4bfc','2026-11-15','1_day',true);
 second_claim:=public.crm_lpr_delivery_claim_v2(p,'544fb1e2-ef70-44de-bc62-e0e1596a4bfc','2026-11-15','1_day',true);
 if first_claim is null or second_claim is not null then raise exception 'duplicate_claim';end if;
 select * into row from public.crm_lpr_birthday_delivery_v1 where id=first_claim;if row.attempts<>1 or row.status<>'sending' then raise exception 'claim_state';end if;
 update public.crm_lpr_birthday_delivery_v1 set status='failed',next_attempt_at=now()-interval '1 minute' where id=first_claim;
 second_claim:=public.crm_lpr_delivery_claim_v2(p,'544fb1e2-ef70-44de-bc62-e0e1596a4bfc','2026-11-15','1_day',true);
 if second_claim is distinct from first_claim or (select attempts from public.crm_lpr_birthday_delivery_v1 where id=first_claim)<>2 then raise exception 'safe_retry_failed';end if;
 update public.crm_lpr_birthday_delivery_v1 set lease_at=now()-interval '5 minutes' where id=first_claim;
 perform public.crm_lpr_delivery_recover_v2();
 if public.crm_lpr_delivery_claim_v2(p,'544fb1e2-ef70-44de-bc62-e0e1596a4bfc','2026-11-15','1_day',true) is not null then raise exception 'unknown_was_resent';end if;
 if public.crm_lpr_delivery_claim_v2(p,'ba55dfe5-7e48-4f1f-b40e-674c7752fe1a','2026-11-15','1_day',false) is not null then raise exception 'missing_binding_sent';end if;
 select * into row from public.crm_lpr_birthday_delivery_v1 where lpr_id=p and recipient_user_id='ba55dfe5-7e48-4f1f-b40e-674c7752fe1a';
 if row.status<>'no_binding' or row.attempts<>0 then raise exception 'binding_status';end if;
 if public.crm_lpr_delivery_claim_v2(p,'ba55dfe5-7e48-4f1f-b40e-674c7752fe1a','2026-11-15','1_day',true) is null then raise exception 'new_binding_not_retried';end if;
 bad:=false;begin insert into public.crm_lpr_contacts_v1(organization_key,full_name,birth_month,birth_day,created_by,updated_by) values('triovist','Нельзя без ответственного',1,1,'544fb1e2-ef70-44de-bc62-e0e1596a4bfc','544fb1e2-ef70-44de-bc62-e0e1596a4bfc');exception when check_violation then bad:=true;end;if not bad then raise exception 'orphan_allowed';end if;
end $test$;
rollback;
