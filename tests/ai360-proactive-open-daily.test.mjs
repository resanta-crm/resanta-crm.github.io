import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const briefJs=readFileSync('assets/142-resanta-ai360-director-proactive-brief-v1.js','utf8');
const voiceJs=readFileSync('assets/134-resanta-voice-ai360-pilot-v1.js','utf8');
const loaderJs=readFileSync('assets/137-resanta-ai360-lazy-launch-v1.js','utf8');
function setup(){
 const values=new Map(), requests=[],answers=[],controls=[];
 const card=(id,level,attention)=>({id,level,attention,title:'Проверить '+id,
  fact:'В CRM обнаружен подтверждённый сигнал по '+id+'.',
  action:'Проверить причину отклонения.',source:'CRM verified snapshot',as_of:'2026-10-29'});
 const day=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Minsk',day:'2-digit',month:'2-digit',year:'numeric'})
  .formatToParts(new Date());
 const get=x=>day.find(p=>p.type===x)?.value;
 const asOf=[get('year'),get('month'),get('day')].join('-');
 const payload={mode:'readonly',kind:'director_daily_brief',as_of:asOf,items_count:5,
  cards:[card('sales','high',true),card('debt','high',true),
    card('tasks','medium',true),card('routes','medium',true),card('triovist','info',false)],
  warnings:[]};
 function element(){
  const x={style:{},listeners:{},setAttribute(){},append(){},
   after(){},addEventListener(name,cb){this.listeners[name]=cb;},
   click(){this.listeners.click?.();}};
  controls.push(x);return x;
 }
 const input={value:''};
 const send={click(){}};
 const actions={after(){}};
 const panel={hidden:true,classList:{contains:()=>false},querySelector(sel){
   if(sel==='.rva-actions')return actions;
   if(sel==='.rva-input')return input;
   if(sel==='.rva-send')return send;
   return null;
 }};
 const app={style:{display:'block'}};
 const localStorage={getItem:key=>values.get(key)||null,setItem:(key,v)=>values.set(key,String(v))};
 const w={localStorage,setInterval:()=>1,clearInterval:()=>{},__resantaAI360PendingV1:false};
 const ctx={
  navigator:{userAgent:'Macintosh'},window:w,
  currentUser:{id:'director'},currentProfile:{role:'boss',name:'Александр Паюшин'},
  document:{hidden:false,querySelector:s=>s==='.rva-window'?panel:null,
   getElementById:s=>s==='app'?app:null,createElement:()=>element()},
  db:{auth:{getSession:async()=>({data:{session:{access_token:'valid-session'}}})},
   functions:{invoke:async(name,{body})=>{
    requests.push({name,body});return {data:payload};}}},
  Intl,Date,Promise,console,setTimeout
 };
 vm.runInNewContext(briefJs,ctx);
 const ui={answer:(text,options)=>answers.push({text,options}),textStatus:()=>{}};
 const tick=()=>new Promise(r=>setTimeout(r,20));
 return {w,ctx,ui,panel,values,requests,answers,controls,payload,asOf,tick};
}
test('No automatic CRM requests on login or when panel is closed',async()=>{
 const x=setup();await x.tick();
 assert.equal(x.requests.length,0);
 assert.equal(x.w.crmAI360DirectorProactiveOpenV2(x.ui),false);
 assert.equal(x.requests.length,0);
});
test('Opening Lera gets verified five priorities once per Minsk day',async()=>{
 const x=setup();x.panel.hidden=false;
 assert.equal(x.w.crmAI360DirectorProactiveOpenV2(x.ui),true);
 await x.tick();
 assert.equal(x.requests.length,1);
 assert.equal(x.requests[0].name,'crm-ai360-director-briefing-v1');
 assert.equal(x.requests[0].body.kind,'director_brief');
 assert.equal(x.answers.length,1);
 assert.match(x.answers[0].text,/БРИФИНГ ДИРЕКТОРА/);
 assert.match(x.answers[0].text,/Проверить sales/);
 assert.match(x.answers[0].text,/Проверить triovist/);
 assert.ok(x.answers[0].options.speechSummary.length<=230);
 assert.equal(x.values.get('resanta-ai360-brief-seen-daily-v2'),x.asOf);
 assert.equal(x.w.crmAI360DirectorProactiveOpenV2(x.ui),false);
 await x.tick();assert.equal(x.requests.length,1);
 assert.equal(x.w.__resantaAI360PendingV1,false);
});
test('Director can turn proactivity off without disabling manual briefing',async()=>{
 const x=setup();x.panel.hidden=false;
 const toggle=x.controls.find(c=>c.className==='rva-btn rva-proactive-toggle');
 assert.ok(toggle);
 toggle.click();
 assert.equal(x.values.get('resanta-ai360-brief-enabled-v2'),'off');
 assert.equal(x.w.crmAI360DirectorProactiveOpenV2(x.ui),false);
 await x.tick();assert.equal(x.requests.length,0);
 assert.equal(x.w.crmAI360DirectorBriefHandleV1('Лера, брифинг директора',x.ui),true);
 await x.tick();assert.equal(x.requests.length,1);
 assert.ok(x.answers[0].options.briefingVoiceText);
});
test('AI360 proactivity remains exclusively director read-only',()=>{
 assert.match(briefJs,/currentProfile\?\.role==='boss'/);
 assert.match(briefJs,/crmAI360DirectorProactiveOpenV2/);
 assert.match(briefJs,/requestBrief\(ui,\{auto:true\}\)/);
 assert.doesNotMatch(briefJs,/\.from\(['"]tasks['"]\)\.insert|commit_real/);
 assert.ok(voiceJs.includes('window.crmAI360DirectorProactiveOpenV2?.({answer,textStatus})'));
 assert.ok(voiceJs.indexOf('if(root.hidden)closePanel()')<
   voiceJs.indexOf('window.crmAI360DirectorProactiveOpenV2?.({answer,textStatus})'));
 assert.ok(loaderJs.includes('142-resanta-ai360-director-proactive-brief-v1.js?v=3'));
 assert.ok(loaderJs.includes('134-resanta-voice-ai360-pilot-v1.js?v=18'));
});
