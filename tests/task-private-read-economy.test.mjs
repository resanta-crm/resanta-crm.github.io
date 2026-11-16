import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import {stripTypeScriptTypes} from 'node:module';

// Run the actual Edge handler and imports without a network/model call.
// The in-memory DB enforces the production cache's unique-key behaviour.
async function harness(){
 const rows=new Map(),settlements=[],bodies=[];
 const state={user:'11111111-1111-4111-8111-111111111111',fact:'Позвонил клиенту',access:true,claims:0,release:null,hold:null,now:Date.parse('2026-11-20T11:59:00Z'),cutoff:'2026-11-20T12:00:00Z',product:'Шуруповёрт'};
 const svc={from(){let key,patch,remove=false;const q={select(){return q},eq(_,value){key=value;return q},maybeSingle:async()=>({data:rows.get(key)||null}),insert:async row=>{if(rows.has(row.key))return {error:{code:'23505'}};rows.set(row.key,{...row});return {};},update(value){patch=value;return q},delete(){remove=true;return q},then(resolve,reject){if(remove)rows.delete(key);else if(patch)Object.assign(rows.get(key),patch);return Promise.resolve({}).then(resolve,reject)}};return q;},async rpc(name,args){if(name==='crm_ai360_core_claim_v2'){state.claims++;return {data:{allowed:true,claim_id:'claim-'+state.claims}};}settlements.push(args);return {};}};
 const caller={auth:{getUser:async()=>({data:{user:{id:state.user}}})},rpc:async()=>({data:state.access}),from(table){let single=false;const q={select(){return q},eq(){return q},limit(){return q},order(){return q},maybeSingle(){single=true;return q},in(){return q},then(resolve,reject){const data=table==='clients'?{id:'22222222-2222-4222-8222-222222222222',name:'Клиент'}:table==='tasks'?[{id:'33333333-3333-4333-8333-333333333333',fact_result:state.fact,done:false}]:table==='crm_task_contracts_v4'?[{task_id:'33333333-3333-4333-8333-333333333333',control_at:state.cutoff}]:table==='price_list'?[{sku:'75/6/1',product:state.product}]:[];return Promise.resolve({data:single?data:data,error:null}).then(resolve,reject)}};return q;}};
 class Clock extends Date{constructor(...args){super(...(args.length?args:[state.now]));}static now(){return state.now;}}
 let handler;const context=vm.createContext({Deno:{env:{get:name=>name==='SUPABASE_ANON_KEY'?'anon':name==='SUPABASE_URL'?'https://test.invalid':'server-key'},serve:value=>handler=value},console,crypto,TextEncoder,TextDecoder,Request,Response,AbortSignal,Date:Clock,Intl,fetch:async(_,options)=>{bodies.push(JSON.parse(options.body));if(state.hold)await state.hold;const parsed=bodies.at(-1).instructions.startsWith('Извлеки')?{items:[{sku:'75/6/1',shelf_qty:2,reserve_qty:null}]}:{answer:'Следующий шаг по проверенным данным'};return new Response(JSON.stringify({usage:{input_tokens:20000,output_tokens:500,input_tokens_details:{cached_tokens:10000}},output:[{content:[{type:'output_text',text:JSON.stringify(parsed)}]}]}),{status:200});}});
 const modules=new Map();async function load(file){if(modules.has(file))return modules.get(file);const text=await fs.readFile(file,'utf8');const module=new vm.SourceTextModule(file.endsWith('.ts')?stripTypeScriptTypes(text):text,{context,identifier:file});modules.set(file,module);await module.link(async(spec,parent)=>{if(spec.startsWith('npm:')){const synthetic=new vm.SyntheticModule(['createClient'],function(){this.setExport('createClient',(_,key)=>key==='anon'?caller:svc)},{context});return synthetic;}return load(path.resolve(path.dirname(parent.identifier),spec));});return module;}
 const entry=path.resolve('supabase/functions/crm-tasks-assistant-v4/index.ts');const module=await load(entry);await module.evaluate();
 async function invoke(change={}){const response=await handler(new Request('https://edge.invalid',{method:'POST',headers:{Authorization:'Bearer test','Content-Type':'application/json'},body:JSON.stringify({action:'question',client_id:'22222222-2222-4222-8222-222222222222',task_id:'33333333-3333-4333-8333-333333333333',transcript:'Оцени результат',...change})}));return {status:response.status,body:await response.json()};}
 return {state,rows,settlements,bodies,invoke};
}

test('unchanged private answer reuses the model result and reserves/settles only once',async()=>{
 const h=await harness();const first=await h.invoke(),repeat=await h.invoke();assert.equal(first.status,200);assert.deepEqual(repeat,first);assert.equal(h.bodies.length,1);assert.equal(h.state.claims,1);assert.equal(h.settlements.length,1);
 // Actual $0.0105 is not silently capped at the one-ruble reservation.
 assert(Math.abs(h.settlements[0].p_actual_rub-1.05)<1e-10);
 assert.equal(h.bodies[0].model,'gpt-5.4-mini');
});
test('fresh result, question, selected task and actor each require their own answer',async()=>{
 const h=await harness();await h.invoke();h.state.fact='Получен отказ';await h.invoke();await h.invoke({transcript:'Как отработать отказ?'});await h.invoke({task_id:'44444444-4444-4444-8444-444444444444'});h.state.user='55555555-5555-4555-8555-555555555555';await h.invoke();assert.equal(h.bodies.length,5);
});
test('a private cache hit never bypasses current access checks',async()=>{
 const h=await harness();await h.invoke();h.state.access=false;assert.equal((await h.invoke()).status,403);assert.equal(h.bodies.length,1);
});
test('concurrent identical private answers cannot pay twice',async()=>{
 const h=await harness();h.state.hold=new Promise(resolve=>h.state.release=resolve);const first=h.invoke();for(let n=0;n<100&&!h.bodies.length;n++)await new Promise(resolve=>setTimeout(resolve,1));assert.equal(h.bodies.length,1);const second=await h.invoke();assert.equal(second.status,422);assert.match(second.body.error,/PREPARATION_RUNNING/);h.state.release();assert.equal((await first).status,200);assert.equal((await h.invoke()).status,200);assert.equal(h.state.claims,1);assert.equal(h.bodies.length,1);
});
test('shelf extraction reuses parsing but still resolves canonical catalog names each time',async()=>{
 const h=await harness();const first=await h.invoke({action:'parse_shelf',transcript:'75 дробь 6 дробь 1 две штуки'});const second=await h.invoke({action:'parse_shelf',transcript:'75 дробь 6 дробь 1 две штуки'});assert.equal(first.status,200);assert.deepEqual(second,first);assert.equal(first.body.items[0].product,'Шуруповёрт');assert.equal(h.bodies.length,1);
 h.state.product='Актуальное наименование';const fresh=await h.invoke({action:'parse_shelf',transcript:'75 дробь 6 дробь 1 две штуки'});assert.equal(fresh.body.items[0].product,'Актуальное наименование');assert.equal(h.bodies.length,1);
});
test('local midnight and the exact control deadline invalidate a previously paid answer',async()=>{
 const h=await harness();await h.invoke();h.state.now=Date.parse('2026-11-20T11:59:59Z');await h.invoke();assert.equal(h.bodies.length,1);
 h.state.now=Date.parse('2026-11-20T12:00:00Z');await h.invoke();assert.equal(h.bodies.length,2);
 h.state.now=Date.parse('2026-11-20T21:00:00Z');await h.invoke();assert.equal(h.bodies.length,3);
});
test('countdowns receive current time and cannot reuse a relative answer from a previous minute',async()=>{
 const h=await harness(),query={transcript:'Сколько минут осталось до срока?'};await h.invoke(query);await h.invoke(query);assert.equal(h.bodies.length,1);
 h.state.now=Date.parse('2026-11-20T11:59:59Z');await h.invoke(query);assert.equal(h.bodies.length,1);
 h.state.now=Date.parse('2026-11-20T12:01:00Z');await h.invoke(query);assert.equal(h.bodies.length,2);
 const sent=JSON.parse(h.bodies[1].input.split('\n')[1]);assert.equal(sent.clock.current_minute,'2026-11-20T12:01:00.000Z');assert.equal(sent.clock.today,'2026-11-20');
});
