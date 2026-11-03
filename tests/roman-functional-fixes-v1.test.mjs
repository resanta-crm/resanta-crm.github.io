import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {isPersonalPlanQuestion,concisePlan} from '../supabase/functions/crm-ai360-staff-dialog-v1/short-plan.mjs';
const f=p=>fs.readFileSync(path.join(import.meta.dirname,'..',p),'utf8');
const client=f('assets/158-client360-legal-stores-v1.js');
const routes=f('assets/166-route-director-360-v1.js');
const field=f('assets/03-triovist-routes.js');
const migration=f('supabase/migrations/20261103_client360_roman_fixes_v2.sql');
const staff=f('supabase/functions/crm-ai360-staff-dialog-v1/index.ts');
const index=f('index.html');

test('Lera detects only direct personal plan questions, not broad diagnostics',()=>{
 for(const question of ['какой план у меня на ноябрь месяц','Какой план по продажам на ноябрь?','Скажи мой план на ноябрь'])
  assert.equal(isPersonalPlanQuestion(question),true,question);
 for(const question of ['Почему я не выполняю план?','Какой план у Ачиновича?','Покажи план и факт по клиентам','Расскажи подробнее о маршрутах'])
  assert.equal(isPersonalPlanQuestion(question),false,question);
});
test('Lera returns only verified own plan, rejects mismatched scope and never invents the number',()=>{
 const evidence={answer_verified:true,read_only:true,domain:'sales',
 scope:{role:'field_manager',managers:['Шкуран']},
 data:{source:'crm_ai360_sales_kpi_snapshot_v1',month:'2026-11',managers:[{manager_name:'Шкуран',plan:153000}]}};
 const out=concisePlan(evidence,'Шкуран','2026-11');
 assert.match(out,/153/);assert.match(out,/белорусских рублей/);
 assert.doesNotMatch(out,/клиенты|факт|отставание|динамика|план выполнен/i);
 assert.equal(concisePlan(evidence,'Руднев','2026-11'),null);
 assert.equal(concisePlan(evidence,'Шкуран','2026-10'),null);
 assert.equal(concisePlan({...evidence,answer_verified:false},'Шкуран','2026-11'),null);
 assert.match(concisePlan({...evidence,data:{...evidence.data,managers:[]}},'Шкуран','2026-11'),/нет подтверждённого плана/);
});
test('Lera direct answer retrieves fresh JWT-scoped data and never uses unverified AI content',()=>{
 assert.match(staff,/isPersonalPlanQuestion\(question\)/);
 assert.match(staff,/crm-ai360-staff-read-v1/);
 assert.match(staff,/concisePlan\(verified,permission\.name,month\)/);
 assert.match(staff,/verified\.scope\?\.role!=='field_manager'/);
 assert.match(staff,/subject_manager:permission\.name/);
});
test('Client360 legal name is not prepopulated from first search result',()=>{
 assert.doesNotMatch(client,/if\(legal&&!legal\.value&&first\)legal\.value/);
 assert.match(client,/client360_manage_entity_v2/);
 assert.match(client,/client360_update_store_v2/);
 assert.match(client,/data-c360-unlink/);
 assert.match(client,/data-c360-edit-point/);
 assert.match(client,/resanta-client360-updated/);
});
test('new-store submit is present in active manager add-route modal and requires actual server receipt',()=>{
 assert.match(field,/function ensureStoreRequestUi2270/);
 assert.match(field,/ensureStoreRequestUi2270\(\);/);
 assert.match(field,/client360_request_store_v1/);
 assert.match(field,/!data\.request_id/);
 assert.match(field,/client360_my_store_requests_v2/);
 assert.match(field,/Заявка НЕ отправлена/);
});
test('director routes group repeated physical-stop rows without rewriting route plans',()=>{
 assert.match(routes,/const groups=new Map\(\)/);
 assert.match(routes,/pointKey\(p\)/);
 assert.match(routes,/client360_route_labels_v2/);
 assert.match(routes,/data\.rows\|\|\[\]/);
 assert.doesNotMatch(routes,/db\.from\('route_plans'\)\.update/);
});
test('SQL mutations are limited to legal links and physical address, preserving 1C/GPS/visits',()=>{
 assert.match(migration,/auth\.uid\(\)/);
 assert.match(migration,/a\.email_confirmed_at IS NOT NULL/);
 assert.match(migration,/payushin_ar@resanta\.ru/);
 assert.match(migration,/sidarovich_kn@resanta\.ru/);
 assert.match(migration,/GRANT EXECUTE ON FUNCTION public\.client360_manage_entity_v2/);
 assert.match(migration,/GRANT EXECUTE ON FUNCTION public\.client360_update_store_v2/);
 assert.doesNotMatch(migration,/DELETE FROM public\.clients|UPDATE public\.route_plans|DELETE FROM public\.visits|UPDATE public\.gps/i);
});
test('cache-bust reloads only the 3 touched existing UI modules',()=>{
 for(const src of ['03-triovist-routes.js?v=23.7.11-roman-tt2','158-client360-legal-stores-v1.js?v=roman-v2','166-route-director-360-v1.js?v=20261103-legal2'])
  assert.ok(index.includes(src),src);
});
