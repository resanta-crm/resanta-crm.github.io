import test from 'node:test';
import assert from 'node:assert/strict';
import {workspaceAction,validatePlan} from '../supabase/functions/crm-tasks-assistant-v4/workspace-v5.mjs';
import {verifyRoute} from '../supabase/functions/crm-tasks-assistant-v4/route-action.mjs';
import {acquireRouteDraft,completeRouteDraft,failRouteDraft} from '../supabase/functions/crm-tasks-assistant-v4/route-drafts.mjs';
import {draftStore,fixtureScope} from './helpers/task-route-draft-store.mjs';

const plan={title:'Отгрузить согласованный товар',basis:'Повторная закупка по истории клиента',expected_result:'Отгрузить две штуки',stage:'shipment',items:[{sku:'75/6/1',qty:2,reason:'Подтверждённая повторная закупка'}]};
const input={action:'prepare_plan_v5',client_id:'c',route_id:'r',transcript:'Подготовь задачу по маршруту'};
function harness(svc=draftStore()){
 const h={svc,user:{id:'boss'},secret:'test-only',calls:[],modelCalls:[],existing:null};
 h.rows={clients:{id:'c',name:'Клиент',client_status:'Рабочий',manager_name:'Руднев'},users:{role:'boss',region:'Витебск'},route_plans:{id:'r',client_id:'c',linked_client_ids:[],manager_name:'Руднев',approved:true,visit_date:'2026-11-18'},visits:[],tasks:[],crm_shelf_scans_v4:[],purchase_history:[{sku:'75/6/1',product:'Шуруповёрт',qty:3,revenue:300,month:'2026-10'}],stock_balances:[{report_date:new Date().toISOString().slice(0,10),sku:'75/6/1',qty_avail:5}],price_list:[{sku:'75/6/1',product:'Шуруповёрт Ресанта',subgroup:'Инструмент'}]};
 h.caller={from(table){const q={select(){return q},eq(){return q},single(){return q},order(){return q},limit(){return q},gt(){return q},range(){return q},then(resolve){return Promise.resolve({data:h.rows[table]||[],error:null}).then(resolve)}};return q},async rpc(name,args){
  if(name==='crm_task_route_existing_v1')return {data:{scope:{...fixtureScope(h.rows.route_plans,h.rows.clients),...(h.scope||{})},existing:h.existing,draft_ref:h.draftRef||null}};
  h.calls.push({name,args});return {data:{task:{id:'created-task'}}};
 }};
 h.model=async(instructions,facts)=>{h.modelCalls.push({instructions,facts});return facts.candidates?structuredClone(plan):{subgroups:['Инструмент']};};
 return h;
}

test('refresh plus changed purchases/tasks/stock report reuses the paid proposal with zero model calls',async()=>{
 const h=harness(),first=await workspaceAction({...h,input});assert.equal(first.mode,'prepared');assert.equal(h.modelCalls.length,2);
 h.rows.purchase_history.push({sku:'other',month:'2026-11',qty:10,revenue:1000});h.rows.tasks.push({id:'new-task',title:'Другой результат'});
 h.rows.stock_balances[0].report_date=new Date(Date.now()+3600000).toISOString();
 h.model=async()=>{throw Error('must not call paid model')};
 const repeated=await workspaceAction({...h,input:{...input,transcript:'Изменённый текст без явной пересборки'}});
 assert.equal(repeated.mode,'prepared');assert.equal(repeated.persistence.reused,true);assert.equal(repeated.persistence.revision,first.persistence.revision);
 assert.equal(await verifyRoute(h.secret,h.user.id,repeated.draft,repeated.approval_token),true);assert.deepEqual(h.calls,[]);
});

test('changed live stock keeps the saved proposal editable and unsigned, with a free manual fix',async()=>{
 const h=harness(),first=await workspaceAction({...h,input});h.rows.stock_balances[0].qty_avail=1;
 h.model=async()=>{throw Error('must not call paid model')};
 const restored=await workspaceAction({...h,input});assert.equal(restored.mode,'editable');assert.equal(restored.draft.items[0].qty,2);assert.equal(restored.approval_token,undefined);assert.match(restored.validation_error,/доступно 1/);
 const fixed=await workspaceAction({...h,input:{...input,action:'validate_plan_v5',expected_draft_revision:first.persistence.revision,plan:{...restored.draft,items:[{sku:'75/6/1',qty:1}]}}});
 assert.equal(fixed.mode,'prepared');assert.equal(fixed.draft.items[0].qty,1);assert.equal(fixed.persistence.revision,2);assert.deepEqual(h.calls,[]);
});

test('a failed paid preparation is persisted and never automatically replayed',async()=>{
 const h=harness();let n=0;h.model=async()=>{n++;throw Error('model_unavailable')};
 const first=await workspaceAction({...h,input});assert.equal(first.mode,'editable');assert.equal(first.persistence.state,'failed');assert.equal(n,1);
 const second=await workspaceAction({...h,input});assert.equal(second.persistence.state,'failed');assert.equal(n,1);assert.equal(second.approval_token,undefined);
});

test('concurrent opens of one route/client have exactly one model owner',async()=>{
 const h=harness();let ready,release;const started=new Promise(resolve=>ready=resolve),waiting=new Promise(resolve=>release=resolve);let n=0;
 h.model=async(_,facts)=>{n++;if(!facts.candidates){ready();await waiting;return {subgroups:['Инструмент']};}return structuredClone(plan);};
 const first=workspaceAction({...h,input});await started;
 const second=await workspaceAction({...h,input});assert.equal(second.mode,'pending');assert.equal(n,1);
 release();assert.equal((await first).mode,'prepared');assert.equal(n,2);
});

test('two distinct future visits of one legal entity/week share one anchored paid proposal',async()=>{
 const svc=draftStore(),a=harness(svc),b=harness(svc);a.scope=b.scope={legal_key:'entity:shared'};
 b.rows.route_plans.id='other-route';b.rows.route_plans.visit_date='2026-11-20';
 const results=await Promise.all([workspaceAction({...a,input}),workspaceAction({...b,input:{...input,route_id:'other-route'}})]);
 assert.equal(results.filter(result=>result.mode==='prepared').length,1);assert.equal(results.filter(result=>result.mode==='existing_draft').length,1);
 assert.equal(a.modelCalls.length+b.modelCalls.length,2);assert.equal(svc.rows.size,1);
 const reference=results.find(result=>result.mode==='existing_draft');assert.notEqual(reference.draft_ref.route_id,reference===results[0]?'r':'other-route');
});

test('explicit changed regeneration uses revision and one reusable request ID; retry cannot repay',async()=>{
 const h=harness(),first=await workspaceAction({...h,input}),request_id=crypto.randomUUID();
 const replan={...input,regenerate:true,transcript:'Предложи больше конвекторов по подтверждённому профилю',expected_draft_revision:first.persistence.revision,request_id};
 const rebuilt=await workspaceAction({...h,input:replan});assert.equal(h.modelCalls.length,4);assert.equal(rebuilt.persistence.revision,2);
 await workspaceAction({...h,input:replan});assert.equal(h.modelCalls.length,4);
 await workspaceAction({...h,input:{...replan,request_id:crypto.randomUUID(),expected_draft_revision:2}});assert.equal(h.modelCalls.length,4);
 await assert.rejects(workspaceAction({...h,input:{...replan,transcript:'Другое поручение с тем же request ID'}}),/REQUEST_CONFLICT/);
 await assert.rejects(workspaceAction({...h,input:{...replan,request_id:crypto.randomUUID(),transcript:'Ещё один изменённый запрос',expected_draft_revision:1}}),/DRAFT_CHANGED/);assert.equal(h.modelCalls.length,4);
});

test('already assigned route and legal/week coverage are skipped before the model or service cache',async()=>{
 for(const reason of ['route_assignment','legal_week']){const h=harness();h.existing={reason,task_id:'already-created',route_id:'original-route',client_id:'original-client',route_day:'2026-11-20'};
 const result=await workspaceAction({...h,input});assert.equal(result.mode,'existing');assert.equal(result.task_id,'already-created');assert.deepEqual(h.modelCalls,[]);assert.deepEqual(h.svc.calls,[]);assert.deepEqual(h.calls,[]);}
});

test('current role and exact route membership are checked before any private draft access',async()=>{
 const manager=harness();manager.rows.users.role='manager';await assert.rejects(workspaceAction({...manager,input}),/CREATE_FORBIDDEN/);assert.deepEqual(manager.svc.calls,[]);assert.deepEqual(manager.modelCalls,[]);
 const wrongRoute=harness();wrongRoute.rows.route_plans.client_id='unrelated';await assert.rejects(workspaceAction({...wrongRoute,input}),/ROUTE_REQUIRED/);assert.deepEqual(wrongRoute.svc.calls,[]);assert.deepEqual(wrongRoute.modelCalls,[]);
});

test('moving the same route ID reuses the proposal, updates scope for free and signs the current date',async()=>{
 const h=harness(),first=await workspaceAction({...h,input});h.rows.route_plans.visit_date='2026-11-25';h.model=async()=>{throw Error('must not call paid model')};
 const moved=await workspaceAction({...h,input});assert.equal(moved.mode,'prepared');assert.equal(moved.draft.route_id,first.draft.route_id);assert.equal(moved.draft.route_day,'2026-11-25');assert.equal(moved.persistence.scope_changed,true);assert.equal(moved.persistence.revision,2);
 assert.equal([...h.svc.rows.values()][0].week_start,'2026-11-23');assert.equal(await verifyRoute(h.secret,h.user.id,moved.draft,moved.approval_token),true);
 await assert.rejects(workspaceAction({...h,input:{...input,action:'commit_workspace_v5',draft:first.draft,approval_token:first.approval_token,confirmation:'подтверждаю'}}),/ROUTE_CHANGED/);assert.deepEqual(h.calls,[]);
});

test('an older signed version cannot be approved after another free edit',async()=>{
 const h=harness(),first=await workspaceAction({...h,input});
 await workspaceAction({...h,input:{...input,action:'validate_plan_v5',expected_draft_revision:first.persistence.revision,plan:{...first.draft,items:[{sku:'75/6/1',qty:3}]}}});
 await assert.rejects(workspaceAction({...h,input:{...input,action:'commit_workspace_v5',draft:first.draft,approval_token:first.approval_token,confirmation:'подтверждаю'}}),/DRAFT_CHANGED/);assert.deepEqual(h.calls,[]);
});

test('manual invalid edits persist across refresh and never acquire an approval signature',async()=>{
 const h=harness(),first=await workspaceAction({...h,input});
 const invalid=await workspaceAction({...h,input:{...input,action:'validate_plan_v5',expected_draft_revision:first.persistence.revision,plan:{...first.draft,items:[{sku:'75/6/1',qty:50}]}}});
 assert.equal(invalid.mode,'editable');assert.equal(invalid.approval_token,undefined);
 const restored=await workspaceAction({...h,input});assert.equal(restored.draft.items[0].qty,50);assert.equal(restored.mode,'editable');assert.equal(h.modelCalls.length,2);
});

test('restoring an AI proposal cannot silently promote an originally ineligible SKU into a signed plan',async()=>{
 const h=harness();h.rows.price_list.push({sku:'99/1/1',product:'Посторонний товар',subgroup:'Неподходящее направление'});h.rows.stock_balances.push({sku:'99/1/1',qty_avail:5});
 h.model=async(_,facts)=>{h.modelCalls.push(facts);return facts.candidates?{...plan,items:[{sku:'99/1/1',qty:1}]}:{subgroups:['Инструмент']};};
 const first=await workspaceAction({...h,input});assert.equal(first.mode,'editable');assert.equal(first.approval_token,undefined);
 const restored=await workspaceAction({...h,input});assert.equal(restored.mode,'editable');assert.equal(restored.approval_token,undefined);assert.match(restored.validation_error,/отобранному ассортименту/);assert.equal(h.modelCalls.length,2);
});

test('manual season exception survives refresh and can be explicitly cleared without a paid call',async()=>{
 const h=harness();h.rows.price_list[0].product='Мойка Huter';
 const first=await workspaceAction({...h,input:{...input,season_exception:'Клиент подтвердил заказ для автомойки'}});assert.equal(first.mode,'prepared');
 const restored=await workspaceAction({...h,input});assert.equal(restored.mode,'prepared');assert.equal(h.modelCalls.length,2);
 const cleared=await workspaceAction({...h,input:{...input,action:'validate_plan_v5',expected_draft_revision:restored.persistence.revision,season_exception:'',plan:restored.draft}});assert.equal(cleared.mode,'editable');assert.match(cleared.validation_error,/SEASON_REASON/);assert.equal(cleared.approval_token,undefined);
 assert.equal((await workspaceAction({...h,input})).mode,'editable');assert.equal(h.modelCalls.length,2);
});

test('potential mandatory result text is idempotent on free revalidation',()=>{
 const p={...plan,stage:'profile',items:[]},client={client_status:'Потенциальный'};
 const first=validatePlan(p,client,[],[]),second=validatePlan(first,client,[],[]);assert.equal(first.expected_result,second.expected_result);
});

test('failed same-request retry remains blocked after a paid attempt; distinct regenerated requests keep audit versions',async()=>{
 const svc=draftStore(),scope={kind:'work',legal_key:'client:c',week_start:'2026-11-16',route_day:'2026-11-18',manager_name:'Руднев'},request_id=crypto.randomUUID();
 const initial=await acquireRouteDraft(svc,'boss','r','c',{...input,request_id},scope);await failRouteDraft(svc,initial,Error('timeout'));
 const repeat=await acquireRouteDraft(svc,'boss','r','c',{...input,regenerate:true,request_id,expected_draft_revision:1},scope);assert.equal(repeat.owner,false);assert.equal(repeat.row.state,'failed');
 const rebuilt=await acquireRouteDraft(svc,'boss','r','c',{...input,regenerate:true,transcript:'Добавить подтверждённый сезонный ассортимент',request_id:crypto.randomUUID(),expected_draft_revision:1},scope);assert.equal(rebuilt.owner,true);await completeRouteDraft(svc,rebuilt,plan);assert.equal(rebuilt.row.versions.length,1);assert.equal(rebuilt.row.versions[0].last_error,'timeout');
 const oldRetry=await acquireRouteDraft(svc,'boss','r','c',{...input,regenerate:true,request_id,expected_draft_revision:1},scope);assert.equal(oldRetry.owner,false);assert.equal(oldRetry.row.revision,2);
});
