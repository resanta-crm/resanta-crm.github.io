import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {russianSpokenDates} from '../supabase/functions/crm-ai360-dialog-v4/dates.mjs';
import {localeSpeech,effectiveManager} from '../supabase/functions/crm-ai360-dialog-v4/context.mjs';
import {clientRequestedInQuestion,canonicalClientTerm,resolveClient} from '../supabase/functions/crm-ai360-dialog-v4/client-identity.mjs';
import {readToolDefinition} from '../supabase/functions/crm-ai360-dialog-v4/core.mjs';
test('date without year is read as calendar day and genitive month',()=>{
 assert.equal(russianSpokenDates('По сети в октябре на 28.10'),'По сети в октябре на 28 октября');
 assert.equal(localeSpeech('Данные на 29.10 и 01.11'),'Данные на 29 октября и 1 ноября');
 assert.equal(russianSpokenDates('Отчёт 29.10.2026'),'Отчёт 29 октября 2026 года');
 assert.equal(russianSpokenDates('от 2026-10-29'),'от 29 октября 2026 года');
 assert.equal(russianSpokenDates('за 2026-10'),'за октябрь 2026 года');
 assert.equal(russianSpokenDates('в 2026-11'),'в ноябре 2026 года');
});
test('invalid dates and monetary decimals are not converted',()=>{
 assert.equal(russianSpokenDates('Поставка 31.11'),'Поставка 31.11');
 assert.equal(russianSpokenDates('28.10 руб.'),'28.10 руб.');
 assert.equal(russianSpokenDates('2026-02-30'),'2026-02-30');
});
test('named customer reference comes only from user message or verified memory',()=>{
 assert.equal(canonicalClientTerm('Lehome Garden'),'ЭльХомГарден ООО');
 assert.equal(clientRequestedInQuestion('Lehome Garden','Что просело у Lehome Garden?',null),true);
 assert.equal(clientRequestedInQuestion('ЭльХомГарден ООО','Что просело у Lehome Garden?',null),true);
 assert.equal(clientRequestedInQuestion('Чужая компания','Что просело у Lehome Garden?',null),false);
 assert.equal(clientRequestedInQuestion('ЭльХомГарден ООО','А что завтра?', 'ЭльХомГарден ООО'),true);
});
test('client name must match exactly one database customer',async()=>{
 const rows=[{id:'verified-id',name:'ЭльХомГарден ООО',manager_name:'Ачинович'}];
 const eqCalls=[];
 const svc={from(table){assert.equal(table,'clients');return{
  select(){return this},eq(col,val){eqCalls.push([col,val]);return this},
  async limit(){return {data:rows,error:null}},
 };}};
 const ok=await resolveClient(svc,{client:'Lehome Garden',question:'Какие группы просели у Lehome Garden?'});
 assert.equal(ok.name,'ЭльХомГарден ООО');
 assert.ok(eqCalls.some(x=>x[1]==='ЭльХомГарден ООО'));
 const blocked=await resolveClient(svc,{client:'Другая компания',question:'Что с Lehome Garden?'});
 assert.equal(blocked.error,'client_not_requested');
});
test('client-specific tools always ignore stale manager',()=>{
 assert.equal(effectiveManager('client_groups',{manager:'Руднев'}).manager,null);
 assert.equal(effectiveManager('client_schedule',{manager:'Шкуран'}).scope,'client_all');
});
test('model has strict explicit client slot',()=>{
 const tool=readToolDefinition(['client_groups','client_schedule','sales']);
 assert.ok(tool.parameters.required.includes('client'));
 assert.equal(tool.parameters.properties.client.type[0],'string');
 assert.deepEqual(tool.parameters.properties.domain.enum,['client_groups','client_schedule','sales']);
});
test('core uses verified server RPC instead of unscoped list',()=>{
 const a=fs.readFileSync('supabase/functions/crm-ai360-dialog-v4/index.ts','utf8');
 const b=fs.readFileSync('supabase/functions/crm-ai360-dialog-v4/core.mjs','utf8');
 assert.match(a,/crm_ai360_client_groups_v42/);
 assert.match(a,/crm_ai360_client_schedule_v42/);
 assert.match(a,/resolveClient/);
 assert.match(a,/lastClientName/);
 assert.match(b,/Если пользователь называет клиента/);
});
