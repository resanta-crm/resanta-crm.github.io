import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync('assets/144-resanta-ai360-branch-voice-v1.js','utf8');
const staffIdentity=fs.readFileSync('assets/148-resanta-ai360-staff-identity-v1.js','utf8');
const html=fs.readFileSync('index.html','utf8');
const SID='ba55dfe5-7e48-4f1f-b40e-674c7752fe1a';
function mock({id=SID,name='Сидарович К.Н.',role='boss',region='Витебск',response=null}={}){
 const calls=[],elements=[];
 function element(tag='div'){
  const e={tag,style:{},hidden:false,disabled:false,textContent:'',value:'',
   listeners:{},children:[],className:'',scrollHeight:0,
   setAttribute(){},append(...xs){this.children.push(...xs)},
   appendChild(x){this.children.push(x);return x},
   insertBefore(x){this.children.push(x)},addEventListener(k,cb){this.listeners[k]=cb},
   click(){this.listeners.click?.()},focus(){},
   getAttribute(){return null},querySelector(){return null}
  };elements.push(e);return e;
 }
 const top=element(),app=element();
 const doc={hidden:false,head:element(),body:element(),createElement:element,
  getElementById:x=>x==='app'?app:null,
  querySelector:x=>x==='#app .topbar'?top:null,
  addEventListener(){}};
 const payload={ready:true,mode:'staff_scoped_readonly_pilot_v1',role:'branch_director',
  own_name:'Сидарович К.Н.',voice_enabled:true,real_task_creation_enabled:true,
  domains:['sales','debt','clients','tasks','routes','visits','gps','stock','client_detail']};
 const w={setInterval:()=>1,addEventListener(){},speechSynthesis:null,
  SpeechRecognition:null,SpeechSynthesisUtterance:null};
 const context={window:w,navigator:{userAgent:'Macintosh'},document:doc,
  currentUser:{id},currentProfile:{name,role,region},console,
  Intl,Date,Promise,
  db:{auth:{getSession:async()=>({data:{session:{access_token:'good_token'}}})},
   functions:{invoke:async(endpoint,{body})=>{
    calls.push({endpoint,body});return {data:body.kind==='capabilities'?payload:
      response||{mode:'staff_scoped_readonly_pilot_v1',answer_verified:true,read_only:true,
       domain:body.domain,as_of:'2026-10-29',
       scope:{role:'branch_director',managers:['Руднев','Ачинович','Шкуран']},
       data:{source:'crm_ai360_sales_kpi_snapshot_v1',month:'2026-10',managers:[
        {manager_name:'Руднев',plan:159000,actual:154245,plan_pct:97,to_plan:4755}]} }};
   }}}
 };
 vm.runInNewContext(staffIdentity,context);
 vm.runInNewContext(source,context);
 return {api:w.crmAI360BranchVoicePilotV1,top,doc,elements,calls,context};
}
test('Shared launcher loads for allowlisted roles but excludes owner or malformed profiles',()=>{
 const x=mock();
 assert.ok(x.api);
 assert.equal(x.api.allowed(),true);
 assert.equal(x.calls.length,0);
 assert.equal(x.top.children.filter(e=>e.className==='rsa-branch-launch').length,1);
 for(const bad of [
  {id:'544fb1e2-ef70-44de-bc62-e0e1596a4bfc',name:'Александр Паюшин'},
  {id:'19dd9943-99ae-47c4-a39c-4f82a11059a6',name:'Руднев',role:'boss'},
  {id:SID,name:'Сидарович'},
  {id:SID,region:'Гомель'}
 ]){
  const y=mock(bad);
  assert.equal(y.api.allowed(),false);
  assert.equal(y.top.children.find(e=>e.className==='rsa-branch-launch').hidden,true);
  assert.equal(y.calls.length,0);
 }
});
test('Routing understands normal manager voice questions and retains source identity',()=>{
 const x=mock(),parse=x.api.parseQuestion;
 const p=parse('Лера, продажи Руднева за сентябрь');
 assert.equal(p.domain,'sales');assert.equal(p.manager,'Руднев');assert.equal(p.month,'2026-09');
 assert.equal(parse('Покажи ПДЗ филиала').domain,'debt');
 assert.equal(parse('GPS контроль Шкурана').domain,'gps');
 assert.equal(parse('Какие маршруты Ачинович').domain,'routes');
 assert.equal(parse('Какие остатки склада').domain,'stock');
 assert.equal(parse('Сколько просроченных задач').domain,'tasks');
 const next=parse('Дальше',{domain:'routes',manager:'Руднев',month:'2026-10',offset:6});
 assert.equal(next.domain,'routes');assert.equal(next.offset,6);assert.equal(next.manager,'Руднев');
 const intro=parse('Лера, проанализируй клиента МИСАС ООО');
 assert.equal(intro.domain,'client_detail');
 assert.equal(intro.client_name,'мисас ооо');
 const scoped={domain:'client_detail',client_name:'мисас ооо',group:'',subgroup:'',
    level:'groups',offset:0,month:'2026-10'};
 const groups=parse('Покажи подгруппы в группе Садовая техника',scoped);
 assert.equal(groups.domain,'client_detail');
 assert.equal(groups.client_name,'мисас ооо');
 assert.equal(groups.level,'subgroups');
 assert.equal(groups.group,'садовая техника');
 const products=parse('Покажи артикулы в подгруппе Мойки высокого давления',
   {...scoped,group:'садовая техника',level:'subgroups'});
 assert.equal(products.domain,'client_detail');
 assert.equal(products.level,'sku');
 assert.equal(products.group,'садовая техника');
 assert.equal(products.subgroup,'мойки высокого давления');
 assert.equal(parse('Какая погода').domain,null);
});
test('Formatting preserves source facts and warns KPI is not network turnover',()=>{
 const x=mock();
 const text=x.api.formatted('sales',{month:'2026-10',managers:[
  {manager_name:'Руднев',plan:159000,actual:154245,plan_pct:97,to_plan:4755}]},
  {managers:['Руднев']});
 assert.match(text,/Руднев/);
 assert.match(text,/97%/);
 assert.match(text,/не рассчитывается/);
 assert.doesNotMatch(text,/Ачинович|Кришталь/);
});
test('Real user click obtains server capabilities before a scoped read',async()=>{
 const x=mock();
 const launcher=x.top.children.find(e=>e.className==='rsa-branch-launch');
 await x.api.open();
 assert.equal(x.calls.length,1);
 assert.equal(x.calls[0].body.kind,'capabilities');
 const input=x.elements.find(e=>e.tag==='input');
 assert.ok(input);
 input.value='Продажи Руднева';
 x.api.submit();
 await new Promise(resolve=>setTimeout(resolve,35));
 assert.equal(x.calls.length,2);
 assert.equal(x.calls[1].endpoint,'crm-ai360-staff-read-v1');
 assert.equal(x.calls[1].body.kind,'read');
 assert.equal(x.calls[1].body.domain,'sales');
 assert.equal(x.calls[1].body.manager,'Руднев');
 const answers=x.elements.filter(e=>e.className==='rsa-staff-answer');
 assert.ok(answers.some(e=>/Руднев/.test(e.textContent)));
 x.api.close();
 assert.equal(x.calls.length,2);
});
test('Server read-only endpoint and no cross-user state in browser',()=>{
 assert.ok(html.includes('144-resanta-ai360-branch-voice-v1.js?v=8'));
 assert.ok(html.includes('137-resanta-ai360-lazy-launch-v1.js?v=35'));
 assert.ok(source.includes("const ENDPOINT='crm-ai360-staff-read-v1'"));
 assert.ok(staffIdentity.includes("'ba55dfe5-7e48-4f1f-b40e-674c7752fe1a'"));
 assert.ok(source.includes("data?.real_task_creation_enabled!==role()?.can_create_tasks"));
 assert.ok(source.includes("payload?.read_only!==true"));
 assert.ok(!source.includes("crm-ai360-dialog-v4"));
 assert.ok(!source.includes("crm-ai360-task-real-approval-v1"));
 assert.ok(!source.includes("localStorage"));
 assert.ok(!source.includes("innerHTML="));
 assert.ok(!source.includes(".from('tasks').insert"));
});
