import test from 'node:test';import assert from 'node:assert/strict';
import {inverterWelder,seasonalProduct,purchaseAnalysis} from '../supabase/functions/crm-tasks-assistant-v4/assortment.mjs';
import {validatePlan} from '../supabase/functions/crm-tasks-assistant-v4/workspace-v5.mjs';
import {prepareRouteRequest,spokenRouteDate} from '../supabase/functions/crm-ai360-agent-v1/route-tasks.mjs';
import {selectedTaskQuestion} from '../supabase/functions/crm-ai360-agent-v1/task-context.mjs';
test('all agreed winter directions, year-round tools, and welding distinction',()=>{
 for(const product of ['Конвектор','Снегоуборщик','Бензопила','Дровокол','Циркуляционный насос','Увлажнитель','Сварочный полуавтомат САИПА-160'])assert.equal(seasonalProduct({product}),true,product);
 assert.equal(seasonalProduct({product:'Шуруповёрт'}),false);
 for(const name of ['Сварочный аппарат инверторный','Сварочный аппарат САИ-190'])assert.equal(inverterWelder(name),true);
 for(const name of ['Сварочный полуавтомат САИПА-160','Сварочная маска','Инверторный генератор'])assert.equal(inverterWelder(name),false);
});
test('canonical inverter name blocks manual plan despite spoofed supplied name',()=>{
 const plan={title:'Отгрузить товар',basis:'Покупал ранее',expected_result:'Отгрузить',items:[{sku:'x',product:'Конвектор',qty:1}]};
 assert.throws(()=>validatePlan(plan,{client_status:'Рабочий'},[{sku:'x',product:'Сварочный аппарат инверторный САИ-190'}],[{sku:'x',qty_avail:99}]),/TASK_FIELD_INVERTER_FORBIDDEN/);
 assert.equal(validatePlan(plan,{client_status:'Рабочий'},[{sku:'x',product:'Сварочный полуавтомат САИПА-160'}],[{sku:'x',qty_avail:99}]).items.length,1);
});
test('ABC aggregates repeat purchases and separately compares previous Oct-Nov-Dec without future leakage',()=>{
 const a=purchaseAnalysis([{sku:'drill',month:'2026-10-01',qty:3,revenue:800},{sku:'heater',month:'2026-10-01',qty:1,revenue:150},{sku:'saw',month:'2026-11-01',qty:1,revenue:50},{sku:'drill',month:'2025-10-01',qty:4,revenue:400},{sku:'drill',month:'2025-11-01',qty:5,revenue:500},{sku:'drill',month:'2025-12-01',qty:6,revenue:600},{sku:'future',month:'2026-12-01',qty:50,revenue:10000}], '2026-11-17');
 const drill=a.items.find(x=>x.sku==='drill');assert.deepEqual(drill.previous_autumn,{october:4,november:5,december:6});assert.equal(drill.abc,'A');assert.equal(a.items.some(x=>x.sku==='future'),false);assert.equal(a.previous_season_year,2025);
});
function caller(routes=[]){return {from(table){const rows=table==='users'?[{name:'Руднев'},{name:'Ачинович'},{name:'Шкуран'}]:routes;const q={select(){return q},eq(){return q},limit(){return q},then(f){return Promise.resolve({data:rows}).then(f)}};return q;}};}
const boss={role:'boss',region:'Все филиалы'},today='2026-11-16';
test('video command bypasses selected historical client and preserves Rudnev November 17',async()=>{
 const input={question:'Ты можешь поставить задачу на эту неделю, на 17 число по менеджеру Рудневу?',task_context:{client_id:'11111111-1111-4111-8111-111111111111'}};
 assert.equal(selectedTaskQuestion(input),null);
 const r=await prepareRouteRequest(caller([{id:'route',client_id:'client',approved:true}]),input,boss,today);
 assert.equal(r.mode,'route_task_prepare_v5');assert.equal(r.manager,'Руднев');assert.equal(r.date,'2026-11-17');assert.equal(r.created,0);assert.equal(r.protocol,'lera_dialogue_v2');
});
test('missing identity/date clarify, network-only/past route does not prepare, manager forbidden',async()=>{
 const input={question:'Сформируй задачи из маршрута'};let r=await prepareRouteRequest(caller(),input,boss,today);assert.match(r.answer,/какого менеджера/);
 r=await prepareRouteRequest(caller(),{question:'Руднев',memory:r.memory},boss,today);assert.match(r.answer,/какую дату/);
 r=await prepareRouteRequest(caller([{id:'network',client_id:'c',approved:true,is_network_point:true}]),{question:'на 17 ноября',memory:r.memory},boss,today);assert.equal(r.mode,'route_task_clarify_v5');assert.match(r.answer,/нет утверждённого/);
 r=await prepareRouteRequest(caller(),{question:'Поставь задачи Рудневу на 10 ноября'},boss,today);assert.match(r.answer,/прошедшая/);
 r=await prepareRouteRequest(caller(),input,{role:'manager',region:'Витебск'},today);assert.match(r.answer,/руководитель/);
});
test('spoken dates resolve from today, never a selected old week; invalid dates rejected',()=>{
 for(const q of ['на 17 число','на семнадцатое ноября','на 17.11.2026','на 2026-11-17','на завтра'])assert.equal(spokenRouteDate(q,today),'2026-11-17',q);
 assert.equal(spokenRouteDate('на 31 ноября',today),null);
});
test('selected task question passes exact task and route identifiers',()=>{const c={client_id:'11111111-1111-4111-8111-111111111111',task_id:'old',route_id:'r'};const p=selectedTaskQuestion({task_context:c,question:'Что сделать по этой задаче?'});assert.equal(p.task_id,'old');assert.equal(p.route_id,'r');});

test('microphone transcript Rudnevo resolves only the uniquely matched manager',async()=>{
 const r=await prepareRouteRequest(caller([{id:'r',client_id:'c',approved:true}]),{question:'подготовь задачи из маршрута Руднево на 17 ноября'},boss,today);
 assert.equal(r.mode,'route_task_prepare_v5');assert.equal(r.manager,'Руднев');assert.equal(r.date,'2026-11-17');
 const ambiguous=await prepareRouteRequest(caller(),{question:'Подготовь задачи Руднево и Шкурана на 17 ноября'},boss,today);assert.equal(ambiguous.mode,'route_task_clarify_v5');
});
