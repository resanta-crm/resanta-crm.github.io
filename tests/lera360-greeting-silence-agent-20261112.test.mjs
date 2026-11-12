import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const read=p=>readFileSync(p,'utf8');
const greetSource=read('assets/215-lera360-personal-greeting-v1.js');
const vadSource=read('assets/216-lera360-silence-gate-v1.js');
function greeting(profile,user){
 const ctx={currentProfile:profile,currentUser:user,
  document:{getElementById:()=>({style:{display:'block'}})},window:{}};
 vm.runInNewContext(greetSource,ctx);
 return ctx.window.crmAI360GreetingV1();
}
const roster=[
 ['544fb1e2-ef70-44de-bc62-e0e1596a4bfc','Александр Паюшин','boss','Витебск','родной'],
 ['ba55dfe5-7e48-4f1f-b40e-674c7752fe1a','Сидарович К.Н.','boss','Витебск','Кирюшка'],
 ['19dd9943-99ae-47c4-a39c-4f82a11059a6','Руднев','manager','Витебск','Санька'],
 ['3d935a76-c6fe-44b6-b248-fcbe58c6bf1c','Ачинович','manager','Витебск','Катюшка'],
 ['4fd79fa0-232d-4768-8099-25f47923cc4f','Шкуран','manager','Витебск','Танюшка'],
 ['6efa656e-45c6-473b-a853-89eccb9ee43a','Александренко','manager','Триовист / 21vek.by','мой господин'],
 ['9076ccde-a8cc-47e3-b71e-c31170b693ff','Кришталь','manager','Триовист / 21vek.by','моя госпожа'],
 ['a24954b8-2fe1-4852-b629-d8f351e1bd36','Руководство компании','boss','Все филиалы','мой слуга']
];
test('eight account-bound greetings, including exact Санька, with no guessing',()=>{
 for(const [id,name,role,region,address]of roster){
  const p={id,name,role,region,email:'petrovichev@resanta.ru',access_scope:'standard'};
  const u={id,email:'petrovichev@resanta.ru'};
  assert.equal(greeting(p,u)?.greeting,'Привет, '+address+'! Чем помочь?');
 }
 assert.doesNotMatch(greetSource,/Саника/);
});
test('greeting never leaks to a mismatched account, name or region',()=>{
 for(const [id,name,role,region] of roster){
  const p={id,name,role,region,email:'petrovichev@resanta.ru',access_scope:'standard'};
  assert.equal(greeting(p,{id:'incorrect',email:'petrovichev@resanta.ru'}),null);
  assert.equal(greeting({...p,name:'Другой человек'},{id,email:'petrovichev@resanta.ru'}),null);
  assert.equal(greeting({...p,role:'service_manager'},{id,email:'petrovichev@resanta.ru'}),null);
 }
 const peer=roster.at(-1);
 const p={id:peer[0],name:peer[1],role:peer[2],region:peer[3],
  email:'petrovichev@resanta.ru',access_scope:'standard'};
 assert.equal(greeting(p,{id:peer[0],email:'someone@example.org'}),null);
 assert.equal(greeting({...p,access_scope:'other'},{id:peer[0],email:p.email}),null);
});
test('director and staff windows speak only the short personal hello at opening',()=>{
 const director=read('assets/134-resanta-voice-ai360-pilot-v1.js');
 const staff=read('assets/144-resanta-ai360-branch-voice-v1.js');
 assert.match(director,/if\(hello\)answer\(hello\.greeting\)/);
 assert.doesNotMatch(director,/crmAI360DirectorProactiveOpenV2\?\./);
 assert.doesNotMatch(director,/Я РЕСАНТА AI 360°\. Могу проверить продажи/);
 assert.match(staff,/show\(personal\.greeting\)/);
 assert.doesNotMatch(staff,/Здравствуйте! Я Лера, помощник Витебского филиала/);
 assert.match(read('assets/143-resanta-ai360-unified-dialog-v1.js'),
  /const ENDPOINT='crm-ai360-agent-v1'/);
});
function gate(options={}){
 const ctx={window:{}};
 vm.runInNewContext(vadSource,ctx);
 return ctx.window.crmAI360CreateSilenceGateV1(options);
}
test('a short spoken question ends within ~2 seconds of silence, not 12 seconds',()=>{
 const g=gate({pauseMs:1900,noSpeechMs:4200});let out;
 for(let t=0;t<=500;t+=100)out=g.observe(0.004,t);
 for(let t=600;t<=1200;t+=100)out=g.observe(0.05,t);
 for(let t=1300;t<=3400;t+=100){
  out=g.observe(0.004,t);
  if(out.stop)break;
 }
 assert.equal(out.heard,true);
 assert.equal(out.reason,'end_of_speech');
 assert.ok(out.stop);
});
test('a quiet room stops without a paid transcription attempt',()=>{
 const g=gate();let out;
 for(let t=0;t<=5000;t+=100){
  out=g.observe(0.0035,t);
  if(out.stop)break;
 }
 assert.equal(out.reason,'no_speech');
 assert.equal(out.heard,false);
});
test('long continuously spoken questions are never chopped at the 2-second mark',()=>{
 const g=gate();let out;
 for(let t=0;t<=6500;t+=100){
  out=g.observe(t<500?0.004:0.04,t);
  assert.equal(out.stop,false,'continuous speech at '+t);
 }
});
test('both microphone paths consume the shared silence detector and retain hard safety caps',()=>{
 for(const file of ['assets/135-resanta-voice-capture-fix-v2.js',
  'assets/146-resanta-ai360-branch-premium-voice-v1.js']){
  const s=read(file);
  assert.match(s,/crmAI360CreateSilenceGateV1\?\./);
  assert.match(s,/silence\.observe\(rms,Date\.now\(\)-/);
  assert.match(s,/pauseMs:1900/);
  assert.match(s,/setTimeout\((?:end|finish),/);
 }
});
test('Petrovichev audio is restricted to his exact existing executive account',()=>{
 for(const file of ['supabase/functions/crm-voice-yandex-tts-v1/index.ts',
  'supabase/functions/crm-voice-transcribe-v1/index.ts']){
  const s=read(file);
  assert.match(s,/a24954b8-2fe1-4852-b629-d8f351e1bd36/);
  assert.match(s,/petrovichev@resanta\.ru/);
  assert.match(s,/email_confirmed_at/);
  assert.match(s,/access_scope==='standard'/);
  assert.match(s,/region==='Все филиалы'/);
  assert.match(s,/\(!isOwner&&!isPeer&&!isBranch&&!isField&&!isTriovist\)/);
 }
});
test('fresh script versions avoid old assistant after opening the CRM',()=>{
 const html=read('index.html');
 const launcher=read('assets/137-resanta-ai360-lazy-launch-v1.js');
 assert.match(html,/215-lera360-personal-greeting-v1\.js\?v=1/);
 assert.match(html,/216-lera360-silence-gate-v1\.js\?v=1/);
 assert.match(html,/137-resanta-ai360-lazy-launch-v1\.js\?v=37/);
 assert.match(launcher,/143-resanta-ai360-unified-dialog-v1\.js\?v=9/);
});
