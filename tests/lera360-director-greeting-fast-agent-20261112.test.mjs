import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const file=x=>readFileSync(x,'utf8');
const helper=file('assets/215-lera360-personal-greeting-v1.js');
const detector=file('assets/216-lera360-silence-gate-v1.js');
function greeting(profile,user){
 const ctx={currentProfile:profile,currentUser:user,
  window:{},document:{getElementById:()=>({style:{display:'block'}})}};
 vm.runInNewContext(helper,ctx);return ctx.window.crmAI360GreetingV1();
}
const roster=[
 ['544fb1e2-ef70-44de-bc62-e0e1596a4bfc','Александр Паюшин','boss','Витебск','Александр'],
 ['ba55dfe5-7e48-4f1f-b40e-674c7752fe1a','Сидарович К.Н.','boss','Витебск','Кирилл'],
 ['19dd9943-99ae-47c4-a39c-4f82a11059a6','Руднев','manager','Витебск','Александр'],
 ['3d935a76-c6fe-44b6-b248-fcbe58c6bf1c','Ачинович','manager','Витебск','Екатерина'],
 ['4fd79fa0-232d-4768-8099-25f47923cc4f','Шкуран','manager','Витебск','Татьяна'],
 ['6efa656e-45c6-473b-a853-89eccb9ee43a','Александренко','manager','Триовист / 21vek.by','Александр'],
 ['9076ccde-a8cc-47e3-b71e-c31170b693ff','Кришталь','manager','Триовист / 21vek.by','Наталья'],
 ['a24954b8-2fe1-4852-b629-d8f351e1bd36','Руководство компании','boss','Все филиалы','Виталий']
];
test('eight exact approved personal greetings, without modifying rights',()=>{
 for(const [id,name,role,region,address]of roster){
  const profile={id,name,role,region,email:'petrovichev@resanta.ru',access_scope:'standard'};
  assert.equal(greeting(profile,{id,email:'petrovichev@resanta.ru'})?.greeting,
   'Привет, '+address+', чем помочь?');
  assert.equal(greeting({...profile,name:'Другой'}, {id,email:'petrovichev@resanta.ru'}),null);
 }
 assert.doesNotMatch(helper,/Саника/);
 const peer=roster.at(-1);
 const profile={id:peer[0],name:peer[1],role:'boss',region:'Все филиалы',
  email:'petrovichev@resanta.ru',access_scope:'standard'};
 assert.equal(greeting(profile,{id:peer[0],email:'other@example.org'}),null);
});
test('one short greeting only, no unwanted opening briefing',()=>{
 const s=file('assets/134-resanta-voice-ai360-pilot-v1.js');
 assert.match(s,/if\(hello\)answer\(hello\.greeting\)/);
 assert.doesNotMatch(s,/crmAI360DirectorProactiveOpenV2\?\./);
 assert.match(file('assets/143-resanta-ai360-unified-dialog-v1.js'),
  /const ENDPOINT='crm-ai360-agent-v1'/);
 assert.match(file('assets/137-resanta-ai360-lazy-launch-v1.js'),
  /if\(nativeAndroid\)return exactOwner/);
});
test('two-second pause stops after speech without waiting for 12s',()=>{
 const ctx={window:{}};vm.runInNewContext(detector,ctx);
 const gate=ctx.window.crmAI360CreateSilenceGateV1({pauseMs:1900});
 let state;
 for(let t=0;t<500;t+=100)state=gate.observe(0.004,t);
 for(let t=500;t<=1000;t+=100)state=gate.observe(0.05,t);
 for(let t=1100;t<4000;t+=100){
  state=gate.observe(0.004,t);
  if(state.stop)break;
 }
 assert.equal(state.stop,true);assert.equal(state.reason,'end_of_speech');
 const noise=ctx.window.crmAI360CreateSilenceGateV1();
 for(let t=0;t<=4500;t+=100){
  state=noise.observe(0.0035,t);if(state.stop)break;
 }
 assert.equal(state.reason,'no_speech');assert.equal(state.heard,false);
});
test('no repeat mic consent and speed is only audio playback',()=>{
 const mic=file('assets/135-resanta-voice-capture-fix-v2.js');
 const audio=file('assets/136-resanta-voice-quality-v3.js');
 assert.match(mic,/MIC_CONSENT_KEY/);
 assert.match(mic,/silence\.observe\(rms,Date\.now\(\)-start\)/);
 assert.match(mic,/window\.localStorage\?\.setItem\(MIC_CONSENT_KEY,'yes'\)/);
 assert.match(audio,/output\.playbackRate=1\.12/);
 assert.match(audio,/source\.playbackRate\.value=1\.12/);
});
test('real agent gateway request uses the deployed action and question contract',()=>{
 const bridge=file('assets/143-resanta-ai360-unified-dialog-v1.js');
 // The Agent360 Edge contract (already deployed separately) requires:
 // {action:'ask',question,history,memory} and re-maps question => message server-side.
 assert.match(bridge,/const payload=\{action:'ask',question,history:history\.slice\(-12\),memory\}/);
 assert.doesNotMatch(bridge,/const payload=\{message:question/);
});
test('script wiring loads harmless helpers before lazy UI, not mic on login',()=>{
 const html=file('index.html');
 assert.match(html,/215-lera360-personal-greeting-v1\.js\?v=20261113-formal/);
 assert.match(html,/216-lera360-silence-gate-v1\.js\?v=2/);
 assert.match(html,/137-resanta-ai360-lazy-launch-v1\.js\?v=40/);
 assert.doesNotMatch(helper,/getUserMedia|functions\.invoke|MediaRecorder/);
 assert.doesNotMatch(detector,/getUserMedia|functions\.invoke|MediaRecorder/);
});
