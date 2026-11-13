import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const read=path=>fs.readFileSync(path,'utf8');
const html=read('index.html'),core=read('assets/01-crm-core.js');
const calendar=read('assets/270-calendar-meetings-pilot-v1.js');
const voice=read('assets/221-lera360-voice-navigation-v1.js');
const css=read('assets/271-calendar-meetings-pilot-v1.css');
const OWNER='544fb1e2-ef70-44de-bc62-e0e1596a4bfc';

test('new calendar is a single owner-only page with no extra disciplinary section',()=>{
 assert.match(html,/id="nav-meeting-planner" style="display:none"/);
 assert.match(html,/id="page-meeting-planner"/);
 assert.match(core,/if\(p==='meeting-planner' && !\(currentUser\?\.id==='544fb1e2/);
 assert.match(core,/if\(p==='meeting-planner'\)return window\.crmMeetingPlannerPilotV1\?\.render\(\)/);
 assert.match(core,/calendarPilotNav\.style\.display=\(currentUser\?\.id===/);
 assert.match(calendar,/const OWNER='544fb1e2/);
 assert.match(calendar,/currentProfile\?\.id===OWNER/);
 assert.match(calendar,/currentProfile\?\.role==='boss'/);
 assert.doesNotMatch(html,/id="nav-discipline360"/);
});
test('pilot reuses confirmed owner-RLS meetings and five-source briefing and never writes CRM',()=>{
 assert.match(calendar,/from\('crm_ai360_meetings_v1'\)/);
 assert.match(calendar,/\.eq\('owner_id',OWNER\)/);
 assert.match(calendar,/const ENDPOINT='crm-ai360-director-briefing-v1'/);
 assert.match(calendar,/d\?\.items_count!==5/);
 assert.match(calendar,/Пока не подключён к брифингу/);
 assert.match(calendar,/Не удалось прочитать календарь/);
 assert.match(calendar,/Ничего не создаётся и никому не отправляется автоматически/);
 assert.doesNotMatch(calendar,/\.(insert|update|upsert)\(/);
 assert.doesNotMatch(calendar,/\.from\([^)]*\)\.delete\(/); // Set.delete() only edits local agenda draft
 assert.doesNotMatch(calendar,/setInterval|MediaRecorder|SpeechRecognition|speechSynthesis/);
});
test('only a direct user gesture launches existing Lera or CONNECT',()=>{
 assert.match(calendar,/window\.crmConnectOpen126/);
 assert.match(calendar,/\.rva-launch:not\(\[hidden\]\), \.rva-ai360-safe-launch/);
 assert.match(voice,/\[\/календар\|планировщик\|совещан\/i,'meeting-planner'/);
 assert.ok(html.indexOf('221-lera360-voice-navigation-v1.js')<html.indexOf('270-calendar-meetings-pilot-v1.js'));
 assert.match(html,/271-calendar-meetings-pilot-v1\.css/);
});
test('standalone pilot JS parses, installs no network/microphone effects on import',()=>{
 new vm.Script(calendar,{filename:'270-calendar-meetings-pilot-v1.js'});
 const ev=[];
 const doc={addEventListener:(name,fn)=>ev.push(name)};
 const fakeWindow={};
 vm.runInNewContext(calendar,{window:fakeWindow,document:doc,Intl,Date,Set,Array,String,Object,Number,Promise});
 assert.ok(fakeWindow.crmMeetingPlannerPilotV1);
 assert.deepEqual(ev,['click']);
});
test('evidence dates, roles and agenda drafts are explicit',()=>{
 assert.match(calendar,/timeZone:'Europe\/Minsk'/);
 assert.match(calendar,/draft|черновик|Черновик/);
 assert.match(calendar,/не сохранён в CRM/);
 assert.match(calendar,/приглашения не подтверждены/);
 assert.match(calendar,/Видеозвонок начинается из выбранного чата/);
 assert.match(css,/#page-meeting-planner \.cmp-kpis/);
 assert.match(css,/@media\(max-width:620px\)/);
});

test('an unauthorized boss cannot view the pilot or trigger its data sources',()=>{
 const root={innerHTML:'',textContent:''},app={style:{display:'flex'}}, calls=[];
 const doc={addEventListener(){},getElementById:(id)=>id==='cmp-root'?root:id==='app'?app:null};
 const fakeWindow={db:{auth:{getUser(){calls.push('getUser');return Promise.resolve({})}}}};
 vm.runInNewContext(calendar,{window:fakeWindow,document:doc,Intl,Date,Set,Array,String,Object,Number,Promise,
   currentUser:{id:'another-boss'},currentProfile:{id:'another-boss',role:'boss',email:'someone@resanta.ru'}});
 fakeWindow.crmMeetingPlannerPilotV1.render();
 assert.match(root.textContent,/только в персональном пилоте/);
 assert.deepEqual(calls,[]);
});
test('the verified director renders the calendar and reads only his own meetings',async()=>{
 const root={innerHTML:'',textContent:''},app={style:{display:'flex'}}, calls=[];
 const dbMock={
   auth:{getUser(){calls.push('auth');return Promise.resolve({data:{user:{id:OWNER}},error:null})}},
   from(table){
     calls.push('table:'+table);
     return {select(cols){calls.push('select:'+cols);return this},eq(col,value){
       calls.push('filter:'+col+':'+value);return this},
       gte(){return this},lt(){return this},order(){return this},
       limit(){return Promise.resolve({data:[],error:null})}};
   }
 };
 const doc={
   addEventListener(){},
   getElementById:(id)=>id==='cmp-root'?root:id==='app'?app:null,
   querySelectorAll(){return []}
 };
 const fakeWindow={db:dbMock};
 vm.runInNewContext(calendar,{window:fakeWindow,document:doc,Intl,Date,Set,Array,String,Object,Number,Promise,
   currentUser:{id:OWNER},currentProfile:{id:OWNER,role:'boss',email:'payushin_ar@resanta.ru'}});
 fakeWindow.crmMeetingPlannerPilotV1.render();
 await new Promise(resolve=>setImmediate(resolve));
 assert.match(root.innerHTML,/Календарь и совещания/);
 assert.match(root.innerHTML,/нет запланированных встреч/);
 assert.ok(calls.includes('table:crm_ai360_meetings_v1'));
 assert.ok(calls.includes('filter:owner_id:'+OWNER));
 assert.equal(calls.some(x=>x.includes('insert')||x.includes('delete')),false);
});
