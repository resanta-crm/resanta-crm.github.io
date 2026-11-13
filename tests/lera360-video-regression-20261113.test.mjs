import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const read=p=>fs.readFileSync(p,'utf8');
const turn=read('assets/220-lera360-turn-taking-v1.js');
const voice=read('assets/135-resanta-voice-capture-fix-v2.js');
const gate=read('assets/216-lera360-silence-gate-v1.js');
const staff=read('assets/146-resanta-ai360-branch-premium-voice-v1.js');
const nav=read('assets/221-lera360-voice-navigation-v1.js');
const owner=read('assets/215-lera360-personal-greeting-v1.js');
const branch=read('assets/144-resanta-ai360-branch-voice-v1.js');
const actions=read('assets/219-lera360-agent-actions-v1.js');
const server=read('supabase/functions/crm-ai360-actions-v1/index.ts');
const stt=read('supabase/functions/crm-voice-transcribe-v1/index.ts');
const page=read('index.html');
test('long interrupted meeting request waits for continuation, then composes all speech',()=>{
 const c={window:{}};vm.runInNewContext(turn,c);const t=c.window.crmAI360TurnTakingV1;
 assert.equal(t.pauseMs>=3000,true);
 assert.ok(t.maxSegments>=8,'long voice utterances need more than three clips');
 assert.equal(t.merge('а'.repeat(700),'б'.repeat(700)).length,1401,'joining long speech must not truncate at 900 characters');
 for(const question of ['Лера, у меня завтра встреча с','Я хотел рассказать, что','Посмотри продажи, и','Подожди','Я ещё не закончил']){
  assert.equal(t.detect(question),'more',question);
 }
 assert.equal(t.detect('Назначь встречу на завтра в десять.'),'ready');
 assert.equal(t.detect('Всё, теперь отвечай'),'done');
 assert.equal(t.detect('Отмена'),'cancel');
 assert.equal(t.merge('Завтра встреча с клиентом,','хочу обсудить продажи'),'Завтра встреча с клиентом, хочу обсудить продажи');
 assert.ok(t.isolatedWake('Али'));
 assert.equal(t.isolatedWake('Али, мы с ним говорили'),false);
});
test('speech silence gate respects the requested 3300ms instead of clipping at 2600ms',()=>{
 const context={window:{}};
 vm.runInNewContext(gate,context);
 const detector=context.window.crmAI360CreateSilenceGateV1({pauseMs:3300,noSpeechMs:5400});
 detector.observe(.008,400);
 assert.equal(detector.observe(.0001,2800).stop,false);
 assert.equal(detector.observe(.0001,3450).stop,false);
 assert.equal(detector.observe(.0001,3890).stop,true);
 assert.ok(page.includes('216-lera360-silence-gate-v1.js?v=2&lera=20261113-turntaking'));
});
test('Mac and staff now listen longer and join not-final fragments',()=>{
 assert.match(voice,/pauseMs=window\.crmAI360TurnTakingV1\?\.pauseMs\|\|3300/);
 assert.match(voice,/async function completeTurn\(/);
 assert.match(voice,/const full=await completeTurn\(rest,epoch,'wake'/);
 assert.match(voice,/const full=await completeTurn\(phrase,epoch,'manual'/);
 assert.match(staff,/lastLoud>\(root\.crmAI360TurnTakingV1\?\.pauseMs\|\|3300\)/);
 assert.match(staff,/async function completeTurn\(/);
 assert.match(staff,/await completeTurn\(question,run/);
 assert.match(staff,/onQuestion\?\.\('Лера'\)/);
 assert.ok(!voice.includes('после примерно двух секунд тишины'));
});
test('approved personal greetings, verified per account',()=>{
 const ids=[
 ['544fb1e2-ef70-44de-bc62-e0e1596a4bfc','Александр Паюшин','boss','Витебск','Александр'],
 ['ba55dfe5-7e48-4f1f-b40e-674c7752fe1a','Сидарович К.Н.','boss','Витебск','Кирилл'],
 ['19dd9943-99ae-47c4-a39c-4f82a11059a6','Руднев','manager','Витебск','Александр'],
 ['3d935a76-c6fe-44b6-b248-fcbe58c6bf1c','Ачинович','manager','Витебск','Екатерина'],
 ['4fd79fa0-232d-4768-8099-25f47923cc4f','Шкуран','manager','Витебск','Татьяна'],
 ['6efa656e-45c6-473b-a853-89eccb9ee43a','Александренко','manager','Триовист / 21vek.by','Александр'],
 ['9076ccde-a8cc-47e3-b71e-c31170b693ff','Кришталь','manager','Триовист / 21vek.by','Наталья'],
 ['a24954b8-2fe1-4852-b629-d8f351e1bd36','Руководство компании','boss','Все филиалы','Виталий']
 ];
 for(const [id,name,role,region,expected] of ids){
  const window={};
  const globals={window,currentUser:{id,email:id==='a24954b8-2fe1-4852-b629-d8f351e1bd36'?'petrovichev@resanta.ru':'x@resanta.by',
   email_confirmed_at:new Date().toISOString()},
   currentProfile:{name,role,region,email:id==='a24954b8-2fe1-4852-b629-d8f351e1bd36'?'petrovichev@resanta.ru':'x@resanta.by',access_scope:'standard'},
   document:{getElementById:()=>({style:{display:'block'}})}};
  vm.runInNewContext(owner,globals);
  const g=window.crmAI360GreetingV1();
  assert.equal(g?.address,expected,name);
  assert.equal(g?.greeting,'Привет, '+expected+', чем помочь?');
 }
 for(const approved of ['Александр','Кирилл','Александр','Екатерина','Татьяна','Александр','Наталья','Виталий']){
  assert.ok(owner.includes("address:'"+approved+"'"),approved);
 }
});
test('real protected CRM page opens on Mac without Android gate',()=>{
 let current='';const pageNode={classList:{contains:x=>x==='active'&&current==='markdown'},style:{}};
 const navNode={style:{display:'block'}};
 const doc={getElementById:id=>id==='page-markdown'?pageNode:id==='nav-markdown'?navNode:null};
 const root={crmAI360GreetingV1:()=>({id:'user-one'}),goPage:id=>{current=id}};
 const context={window:root,document:doc,currentUser:{id:'user-one'},getComputedStyle:()=>({display:'block'})};
 vm.runInNewContext(nav,context);
 const out=[];
 assert.equal(root.crmAI360NavigateV1('Открой Уценку',{answer:s=>out.push(s)}),true);
 assert.equal(current,'markdown');
 assert.match(out[0],/Открыла раздел/);
 assert.equal(root.crmAI360NavigateV1('Нет, не оценки, а уценки',{answer:s=>out.push(s)}),true);
 assert.equal(current,'markdown');
 assert.equal(root.crmAI360NavigateV1('Покажи аналитику по падению оборота',{answer:s=>out.push(s)}),false);
});
test('confirmed actions are not free-form writes or fake meeting status',()=>{
 assert.match(actions,/да создай/);
 assert.match(actions,/created_meeting/);
 assert.match(actions,/created_visit/);
 assert.match(actions,/created_chat/);
 assert.match(actions,/conflict_meeting/);
 assert.match(actions,/requires_confirmation/);
 assert.match(server,/await verifyToken\(secret,actor\.id,draft,token\)/);
 assert.match(server,/client360_create_route_v1/);
 assert.match(server,/crm_ai360_meetings_v1/);
 assert.match(server,/explicit_confirmation_required/);
 assert.match(server,/caller\.from\('crm_ai360_meetings_v1'\)\.insert/);
 assert.match(server,/const FIELD_MANAGERS=/);
 assert.doesNotMatch(server,/\.from\('visits'\)\.insert/);
 assert.doesNotMatch(server,/gps_status:'verified'/);
 assert.match(stt,/keywords\[\]','Лера'/);
 assert.ok(page.indexOf('220-lera360-turn-taking-v1.js')<page.indexOf('137-resanta-ai360-lazy-launch-v1.js'));
 assert.ok(page.indexOf('221-lera360-voice-navigation-v1.js')<page.indexOf('144-resanta-ai360-branch-voice-v1.js'));
});
