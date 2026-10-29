import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {staffPermission,targetManagers} from '../supabase/functions/crm-ai360-staff-read-v1/permissions.mjs';
import {readTriovist,TRIOVIST_DOMAINS} from '../supabase/functions/crm-ai360-staff-read-v1/triovist.mjs';
const root='supabase/functions/';
const web=fs.readFileSync('index.html','utf8');
const read=fs.readFileSync(root+'crm-ai360-staff-read-v1/index.ts','utf8');
const dialog=fs.readFileSync(root+'crm-ai360-staff-dialog-v1/index.ts','utf8');
const ownerPolicy=fs.readFileSync(root+'crm-ai360-staff-read-v1/permissions.mjs','utf8');
const modelPolicy=fs.readFileSync(root+'crm-ai360-staff-dialog-v1/permissions.mjs','utf8');
const identity=fs.readFileSync('assets/148-resanta-ai360-staff-identity-v1.js','utf8');
const voice=fs.readFileSync('assets/144-resanta-ai360-branch-voice-v1.js','utf8');
const tts=fs.readFileSync(root+'crm-voice-yandex-tts-v1/index.ts','utf8');
const stt=fs.readFileSync(root+'crm-voice-transcribe-v1/index.ts','utf8');
const OWNERS={
 'Александренко':{id:'6efa656e-45c6-473b-a853-89eccb9ee43a',email:'aleksandrenko_av@resanta.ru'},
 'Кришталь':{id:'9076ccde-a8cc-47e3-b71e-c31170b693ff',email:'krishtal_na@resanta.ru'}
};
const getPerm=name=>staffPermission(OWNERS[name].id,{
 id:OWNERS[name].id,name,role:'manager',region:'Триовист / 21vek.by'});
function db(){
 const calls=[],catalog=[
 {group_name:'Инструмент',manager_email:OWNERS.Александренко.email,manager_name:'Александренко',active:true,priority:1},
 {group_name:'Оборудование',manager_email:OWNERS.Александренко.email,manager_name:'Александренко',active:true,priority:2},
 {group_name:'Садовая техника',manager_email:OWNERS.Кришталь.email,manager_name:'Кришталь',active:true,priority:1}
 ];
 const records={
  triovist_group_assignments:catalog,
  triovist_21vek_registry_v236214:[
   {manager_email:OWNERS.Александренко.email,category:'Инструмент',sku:'111',product_name:'Дрель',registry_snapshot_date:'2026-10-28'},
   {manager_email:OWNERS.Кришталь.email,category:'Садовая техника',sku:'222',product_name:'Бензопила',registry_snapshot_date:'2026-10-28'},
   {manager_email:OWNERS.Александренко.email,category:'Садовая техника',sku:'333',product_name:'Ошибочно отнесено',registry_snapshot_date:'2026-10-28'}
  ]
 };
 const svc={from(table){
  calls.push(['from',table]);
  let rows=records[table]||[],start=0,end=10000,columns='';
  const q={
   select(v){columns=v;return this;},
   eq(k,v){calls.push(['eq',table,k,v]);rows=rows.filter(r=>r[k]===v);return this;},
   in(k,values){calls.push(['in',table,k,values]);rows=rows.filter(r=>values.includes(r[k]));return this;},
   order(){return this;},
   limit(n){rows=rows.slice(0,n);return this;},
   range(a,b){start=a;end=b+1;return this;},
   then(resolve,reject){return Promise.resolve({data:rows.slice(start,end),error:null}).then(resolve,reject);}
  };return q;
 }};
 return {svc,calls};
}
test('Both real CRM users have exact role/region and only assigned Triovist domains',()=>{
 const domains=['triovist_tasks','triovist_groups','triovist_cards','triovist_issues','triovist_positions','triovist_infographics'];
 for(const name of Object.keys(OWNERS)){
  const p=getPerm(name);
  assert.deepEqual(p.domains,domains);
  for(const domain of domains)assert.deepEqual(targetManagers(p,domain,null),[name]);
  assert.equal(targetManagers(p,'triovist_cards',name==='Александренко'?'Кришталь':'Александренко'),null);
  for(const other of ['sales','client_detail','payments','competitors','triovist_mrc','triovist_stock','cash','triovist']){
   assert.equal(targetManagers(p,other,null),null,other);
  }
 }
 assert.equal(Object.keys(TRIOVIST_DOMAINS).length,5);
});
test('21vek records use live group assignments AND authorized email as row-level filters',async()=>{
 const {svc,calls}=db();
 const p=getPerm('Александренко'),e=OWNERS.Александренко.email;
 const r=await readTriovist(svc,p,e,e,'triovist_cards',{offset:0});
 assert.equal(r.scope,'assigned_categories');
 assert.deepEqual(r.group_names,['Инструмент','Оборудование']);
 assert.deepEqual(r.items.map(i=>i.sku),['111']);
 assert.ok(calls.some(x=>x[0]==='eq'&&x[1]==='triovist_21vek_registry_v236214'&&x[2]==='manager_email'&&x[3]===e));
 assert.ok(calls.some(x=>x[0]==='in'&&x[1]==='triovist_21vek_registry_v236214'&&x[2]==='category'&&x[3].length===2));
});
test('One category manager cannot request the colleague categories, credentials or tasks',async()=>{
 const {svc}=db();
 const p=getPerm('Александренко'),email=OWNERS.Александренко.email;
 await assert.rejects(readTriovist(svc,p,email,email,'triovist_cards',{group:'Садовая техника'}),/triovist_group_outside_scope/);
 await assert.rejects(readTriovist(svc,p,email,OWNERS.Кришталь.email,'triovist_cards',{}),/triovist_email_mismatch/);
 await assert.rejects(readTriovist(svc,p,email,email,'triovist_market',{}),/triovist_domain_denied/);
 const q=await readTriovist(svc,p,email,email,'triovist_groups',{});
 assert.equal(q.total_count_known,true);
 assert.equal(q.group_count,2);
});
test('The same server-authoritative category policy is embedded in both gateways',()=>{
 assert.equal(ownerPolicy,modelPolicy);
 assert.match(read,/readTriovist\(svc,permission,userEmail,profileEmail,domain,body\)/);
 assert.match(read,/select\('id,name,role,region,email'\)/);
 assert.match(read,/user.email,profileRes.data\?\.email/);
 assert.match(dialog,/staffPermission\(userId,prof\.data\)/);
 assert.match(dialog,/permission\.tier==='triovist_category'/);
 assert.match(dialog,/manager:permission\.tier!=='branch_director'\?permission.name/);
 assert.match(dialog,/evidence\.scope\.managers\.some\(x=>!permitted\.includes\(x\)\)/);
 assert.match(read,/real_task_creation_enabled:permission\.tier==='branch_director'/);
});
test('Triovist sessions use same paid OpenAI and Yandex voice, without field/branch privileges',()=>{
 for(const name of Object.keys(OWNERS)){
  const u=OWNERS[name];
  for(const code of [stt,tts]){
   assert.ok(code.includes(u.id));
   assert.match(code,/isTriovist/);
   assert.match(code,/region==='Триовист \/ 21vek.by'/);
   assert.match(code,/!isOwner&&!isBranch&&!isField&&!isTriovist/);
  }
 }
 assert.match(web,/148-resanta-ai360-staff-identity-v1\.js\?v=2/);
 assert.match(web,/144-resanta-ai360-branch-voice-v1\.js\?v=8/);
 assert.match(web,/146-resanta-ai360-branch-premium-voice-v1\.js\?v=3/);
 assert.match(web,/147-resanta-ai360-staff-unified-dialog-v1\.js\?v=3/);
 assert.match(voice,/triovist_category/);
});
test('Shared launcher recognizes the two Triovist logins without network on page load',()=>{
 for(const name of Object.keys(OWNERS)){
  const user=OWNERS[name];
  const elements=[];
  const element=tag=>{const x={tag,style:{display:''},hidden:false,textContent:'',className:'',children:[],
   addEventListener(){},setAttribute(){},querySelector(){return null},
   append(...args){this.children.push(...args);},appendChild(v){this.children.push(v);return v;},
   insertBefore(v){this.children.push(v);return v;}};elements.push(x);return x;};
  const top=element('topbar'),app=element('app');
  const doc={hidden:false,head:element('head'),body:element('body'),createElement:element,
   getElementById:()=>app,querySelector:()=>top,addEventListener(){}};
  let fetched=0;
  const w={setInterval(){},addEventListener(){}};
  const ctx={window:w,document:doc,navigator:{userAgent:'Macintosh'},
   currentUser:{id:user.id},currentProfile:{name,role:'manager',region:'Триовист / 21vek.by'},
   db:{functions:{invoke(){fetched++;}}},console,Intl,Date,Promise};
  vm.runInNewContext(identity,ctx);vm.runInNewContext(voice,ctx);
  assert.equal(w.crmAI360StaffIdentityV1().tier,'triovist_category');
  assert.equal(w.crmAI360StaffIdentityV1().can_create_tasks,false);
  assert.equal(w.crmAI360BranchVoicePilotV1.allowed(),true);
  assert.match(elements.find(x=>x.className==='rsa-branch-launch')?.textContent||'',/Триовист/);
  assert.equal(fetched,0);
 }
});
