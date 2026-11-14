import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const {parseHTML}=await import(process.env.CRM_DOM_MODULE||'linkedom');
const read=p=>fs.readFileSync(p,'utf8');
const source=read('assets/286-clients-legal-simple-v1.js'),index=read('index.html');
const flush=async()=>{for(let i=0;i<8;i++)await new Promise(r=>setImmediate(r));};
function fixture(options={}){
 const {document}=parseHTML('<html><body><div id="page-clients" class="active"><div id="clients-list">Обычный список</div></div><div id="modal-client" class="modal-bg"><div id="modal-client-content"></div></div></body></html>');
 const cards=Array.from({length:4},(_,i)=>({id:'c'+i,name:'Юрлицо (Адрес '+i+')',code:'1C-'+i,manager_name:'Руднев'}));
 const details={version:'clients.detail.1',month:new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Minsk'}).format(new Date()).slice(0,7),entity:{id:'e1',name:'Юрлицо'},members:cards,points:cards.map((c,i)=>({id:'p'+i,city:'Город',address:'Адрес '+i,clients:[c],visits:i,last_visit:null,next_visit:null})),sales:[],debt:{amount:0},requests:[]};details.sales=[{month:details.month,revenue:13966.55}];
 const calls=[],events={},routes=[],intervals=[];let originalCalls=0,clock=Date.now();class Clock extends Date{static now(){return clock;}}
 const ctx={document,console,Date:Clock,Intl,Map,Set,Promise,AbortController,setTimeout,clearTimeout,setInterval:f=>intervals.push(f),Event:document.defaultView.Event,currentUser:{id:'owner'},currentProfile:{id:'owner',role:'boss',email:'payushin_ar@resanta.ru'},allClients:cards,renderClients:()=>{},addEventListener:(k,f)=>events[k]=f,dispatchEvent:e=>events[e.type]?.(e),addToRoute:id=>routes.push(id),openMergeClient:()=>{},openClient:async id=>{originalCalls++;document.getElementById('modal-client').classList.add('open');document.getElementById('modal-client-content').innerHTML='<div class="modal-head">Исходная карточка '+id+'</div><div id="original-finance">Исходные показатели</div><button onclick="openMergeClient(\''+id+'\')">Объединить</button>';},db:{rpc(name,args){calls.push({name,args});if(options.rpc)return options.rpc(name,args);return Promise.resolve({data:name==='crm_clients_detail_v1'?details:{ok:true}});}}};ctx.window=ctx;vm.createContext(ctx);vm.runInContext(source,ctx);
 const click=selector=>{const el=document.querySelector(selector);assert.ok(el,selector);el.dispatchEvent(new document.defaultView.Event('click',{bubbles:true}));};
 async function open(){await ctx.openClient('c0');const panel=document.getElementById('client-legal-simple');panel.open=true;panel.dispatchEvent(new document.defaultView.Event('toggle'));await flush();}
 return {ctx,document,calls,click,open,details,routes,originalCalls:()=>originalCalls,async tick(){clock+=61000;intervals.forEach(f=>f());await flush();}};
}
test('shipping restores native clients and leaves annual dashboard wired',()=>{
 assert.doesNotMatch(index,/src="[^"\n]*285-clients-unified/);assert.doesNotMatch(index,/href="[^"\n]*285-clients-unified/);assert.match(index,/286-clients-legal-simple-v1.js/);assert.match(index,/284-control-sales-year-v1.js/);assert.match(source,/w.setInterval\(updateVisible,60000\)/);assert.match(source,/active\(\)&&panel\?\.open&&!dialog/);
 assert.doesNotMatch(source,/renderClients\s*=|goPage\s*=|allClients\s*=|db\.from\(/);
});
test('native list/card stay intact, group finance appears once, route uses existing picker',async()=>{
 const f=fixture(),list=f.document.getElementById('clients-list');await f.open();assert.equal(f.originalCalls(),1);assert.equal(f.document.getElementById('clients-list'),list);assert.ok(f.document.getElementById('original-finance'));assert.equal(f.document.querySelectorAll('[data-route]').length,4);assert.match(f.document.getElementById('client-legal-simple').textContent,/13.966,55 BYN/);f.click('[data-route="c2"]');assert.deepEqual(f.routes,['c2']);assert.equal(f.calls.filter(x=>x.name!=='crm_clients_detail_v1').length,0);
});
test('existing TT selection shows full composition and requires explicit submit',async()=>{
 const f=fixture();await f.open();f.click('[data-group]');const root=f.document.getElementById('client-legal-dialog');assert.equal(root.querySelectorAll('[data-remove]').length,4);assert.match(root.textContent,/ID/);assert.equal(f.calls.some(x=>x.name==='client360_group_clients_v1'),false);f.click('[data-remove="c3"]');assert.equal(root.querySelectorAll('[data-remove]').length,3);f.click('[data-close]');assert.equal(f.document.getElementById('client-legal-dialog'),null);
});
test('adding address invokes only physical-store RPC, preserving client/budget records',async()=>{
 const f=fixture();await f.open();f.click('[data-address]');const form=f.document.querySelector('#client-legal-dialog form');Object.defineProperty(form,'elements',{value:{client:{value:'c0'},city:{value:'Город'},address:{value:'Новый адрес 5'}}});await form.onsubmit({preventDefault(){},target:form});assert.deepEqual(JSON.parse(JSON.stringify(f.calls.find(x=>x.name==='crm_client360_add_store_v1').args)),{p_client_id:'c0',p_city:'Город',p_address:'Новый адрес 5'});assert.equal(f.calls.some(x=>/budget|merge|create_client/.test(x.name)),false);
});
test('late client response cannot populate a different actor',async()=>{
 let done;const f=fixture({rpc:()=>new Promise(r=>done=r)});await f.ctx.openClient('c0');await flush();const p=f.document.getElementById('client-legal-simple');p.open=true;p.dispatchEvent(new f.document.defaultView.Event('toggle'));await flush();f.ctx.currentUser={id:'other'};f.ctx.currentProfile={id:'other',role:'manager'};done({data:f.details});await flush();assert.doesNotMatch(p.textContent,/13.966/);
});

test('open client refreshes after a new import; closed client performs no polling',async()=>{const f=fixture();await f.open();const before=f.calls.length;f.details.sales[0].revenue=20000;await f.tick();assert.equal(f.calls.length,before+1);assert.match(f.document.getElementById('client-legal-simple').textContent,/20.000 BYN/);f.document.getElementById('modal-client').classList.remove('open');await f.tick();assert.equal(f.calls.length,before+1);});
