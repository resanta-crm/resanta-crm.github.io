import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { requestContext,effectiveManager,guardVoicePair,localeSpeech,namedManager } from '../supabase/functions/crm-ai360-dialog-v4/context.mjs';
const managers=['Руднев','Шкуран','Ачинович','Александренко','Кришталь'];
test('manager identity is generic, not hardcoded to Rudnev',()=>{
 for(const name of managers) assert.equal(namedManager('Как дела у '+name+'?',managers),name);
 assert.equal(namedManager('Что у Руднева с задачами?',managers),'Руднев');
 assert.equal(namedManager('А у Шкурана?',managers),'Шкуран');
});
test('Triovist question clears inherited manager',()=>{
 const s=requestContext('Сколько продал Триовист?',{manager:'Руднев'},managers);
 assert.equal(s.subject,'client');assert.equal(s.manager,null);assert.equal(s.resetManager,true);
 assert.deepEqual(effectiveManager('triovist',s),{manager:null,scope:'client_all'});
});
test('client follow-up inherits client topic without prior employee',()=>{
 const s=requestContext('А какой план?',{subject:'client',manager:''},managers);
 assert.equal(s.client,true);assert.equal(s.manager,null);
});
test('new employee replaces prior employee',()=>{
 const s=requestContext('А у Ачинович?',{manager:'Руднев',subject:'manager'},managers);
 assert.equal(s.manager,'Ачинович');
 assert.equal(effectiveManager('sales',s).manager,'Ачинович');
});
test('Triovist with explicit employee refuses nonexistent person breakdown',()=>{
 const s=requestContext('Продажи Руднева по Триовисту?',{},managers);
 assert.equal(s.explicitManager,'Руднев');
 assert.equal(effectiveManager('triovist',s).error,'triovist_personal_attribution_unavailable');
});
test('network-wide question clears manager',()=>{
 const s=requestContext('Продажи по всей сети?',{manager:'Руднев'},managers);
 assert.equal(s.manager,null);
 assert.equal(effectiveManager('sales',s).scope,'network');
});
test('server defends actual Triovist fact against wrong owner and currency',()=>{
 const pair={brief:'У Руднева Триовист 784421 ₽',detail:'Руднев выполнил план 681000 RUB',offer:'Подробнее?'};
 const r=guardVoicePair(pair,{managers,period:'2026-10',evidence:[{domain:'triovist',scope:'client_all',currency:'BYN',month:'2026-10',revenue:784421.67,plan:681000}]});
 assert.equal(r.corrected,true);assert.match(r.brief,/Триовист/);
 assert.match(r.brief,/784[ \u00a0]421,67/);
 assert.doesNotMatch(r.brief,/Руднев|₽|RUB/);
 assert.match(r.brief,/белорусских рублей/);
});
test('normal text preserved with simple speech-friendly corrections',()=>{
 const r=guardVoicePair({brief:'В сэмпле 5 строк',detail:'Детали по BYN',offer:'Продолжить?'},{evidence:[],managers});
 assert.equal(r.corrected,false);assert.match(r.brief,/неполной выборке/);
 assert.match(r.detail,/белорусских рублей/);
 assert.equal(localeSpeech('SKU'),'артикулов');
});
test('server source contracts include scope and full analytics RPCs',()=>{
 const server=fs.readFileSync('supabase/functions/crm-ai360-dialog-v4/index.ts','utf8');
 const model=fs.readFileSync('supabase/functions/crm-ai360-dialog-v4/core.mjs','utf8');
 const client=fs.readFileSync('assets/143-resanta-ai360-unified-dialog-v1.js','utf8');
 assert.match(server,/scope:'client_all'/);
 assert.match(server,/crm_ai360_client_risk_v41/);
 assert.match(server,/crm_ai360_stock_snapshot_v41/);
 assert.match(server,/guardVoicePair/);
 assert.match(server,/requestContext/);
 assert.match(model,/Триовист/);
 assert.match(model,/BYN/);
 assert.match(client,/history=\[\];awaitingDetail=null;/);
});
