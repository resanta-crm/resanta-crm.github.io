import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=(name)=>readFileSync(name,'utf8');
const pilot=source('assets/134-resanta-voice-ai360-pilot-v1.js');
const lazy=source('assets/137-resanta-ai360-lazy-launch-v1.js');
const voiceNames=[
 'assets/134-resanta-voice-ai360-pilot-v1.js',
 'assets/135-resanta-voice-capture-fix-v2.js',
 'assets/136-resanta-voice-quality-v3.js',
 'assets/138-resanta-ai360-sales-bridge-v1.js',
 'assets/142-resanta-ai360-director-proactive-brief-v1.js',
 'assets/143-resanta-ai360-unified-dialog-v1.js'
];
test('Deployed warehouse module version matches lazy loader contract',()=>{
 const loader=source('assets/66-performance-root-v23657.js');
 const actual=source('assets/95-warehouse-orders-v1.js').match(/const V='([^']+)'/);
 const expected=loader.match(/RESANTA_WAREHOUSE_ORDERS_V1:'([^']+)'/);
 assert.ok(actual&&expected);
 assert.equal(expected[1],actual[1],'A false version mismatch retries the same module after login');
});
test('Director voice on native Android requires tap; Android browsers and staff are excluded',()=>{
 for(const f of voiceNames){
  const js=source(f);
  assert.ok(js.includes('__resantaAI360AndroidDirectorOptIn'),f+' must require explicit opt-in');
  assert.ok(js.includes("getPlatform?.()"),f+' must check actual native Android');
 }
 assert.ok(lazy.includes("544fb1e2-ef70-44de-bc62-e0e1596a4bfc"),'only exact director UUID gets Android launcher');
 assert.ok(lazy.includes('button.addEventListener(\'click\',activate)'));
 assert.ok(lazy.includes('window.__resantaAI360AndroidDirectorOptIn=true;'));
 assert.ok(!source('assets/140-resanta-ai360-task-drafts-preview-v1.js').includes('__resantaAI360AndroidDirectorOptIn'),
  'Write-capable approval drafts must remain unavailable on Android');
});
function boot(androidNative,uid){
 let button=null;
 const scriptLoads=[];
 const root={
  Capacitor: androidNative===null?undefined:{isNativePlatform:()=>androidNative,getPlatform:()=>androidNative?'android':'web'},
  setInterval(){},__resantaAI360AndroidDirectorOptIn:false
 };
 const top={insertBefore(b){button=b;},querySelector(){return null;}};
 const document={
  querySelector(s){return s==='#app .topbar'?top:null;},
  getElementById(id){return id==='app'?{style:{display:'block'}}:null;},
  createElement(){return {hidden:true,disabled:false,style:{},addEventListener(k,cb){if(k==='click')this.click=cb;}};},
  body:{appendChild(s){if(s.src){scriptLoads.push(s.src);queueMicrotask(()=>s.onload?.());}}}
 };
 const context={window:root,document,navigator:{userAgent:'Mozilla/5.0 Android'},currentUser:{id:uid},
 currentProfile:{role:'boss',name:'Александр Паюшин'},console,Promise};
 vm.runInNewContext(lazy,context);
 return {root,button,scriptLoads};
}
test('No mic or AI module loads at login; owner alone may activate it',()=>{
 const director=boot(true,'544fb1e2-ef70-44de-bc62-e0e1596a4bfc');
 assert.ok(director.button);
 assert.equal(director.button.hidden,false);
 assert.equal(director.root.__resantaAI360AndroidDirectorOptIn,false,'no voice on login');
 director.button.click();
 assert.equal(director.root.__resantaAI360AndroidDirectorOptIn,true,'only owner tap turns on voice');
 const other=boot(true,'different-user');
 assert.equal(other.button.hidden,true);
 other.button.click();
 assert.equal(other.root.__resantaAI360AndroidDirectorOptIn,false,'other boss cannot enable owner voice');
 const mobileBrowser=boot(false,'544fb1e2-ef70-44de-bc62-e0e1596a4bfc');
 assert.equal(mobileBrowser.button,null,'Android browser must be excluded');
});
test('Spoken navigation uses existing authorized sections and never writes data',()=>{
 const from=pilot.indexOf('  function navigateByVoice(query) {');
 const to=pilot.indexOf('  function handleCommand(raw) {',from);
 assert.ok(from>0&&to>from);
 const part=pilot.slice(from,to);
 assert.ok(part.includes('openPage(id,title)'));
 assert.ok(!/\.insert\(|\.update\(|\.delete\(/.test(part));
 const calls=[],answers=[];
 const navigate=new Function('openPage','answer',part+';return navigateByVoice;')(
  (id,title)=>{calls.push([id,title]);return id!=='warehouse-control';},
  t=>answers.push(t)
 );
 for(const [query,id] of [
  ['Лера открой продажи','sales'],
  ['перейди в раздел менеджеры','managers'],
  ['открой Триовист','triovist'],
  ['вернись на сводку','dashboard'],
  ['открой задачи','tasks'],
  ['открой клиенты','clients'],
  ['открой маршруты','routes-boss'],
  ['открой остатки','warehouse-control']
 ]){
  const before=calls.length;
  assert.equal(navigate(query),true,query);
  assert.equal(calls[before][0],id,query);
 }
 assert.match(answers.at(-1),/недоступен/,'missing/unauthorized page cannot be reported opened');
 assert.equal(navigate('Согласуй поручение Рудневу'),false);
 assert.equal(navigate('Какие продажи в ноябре'),false);
 assert.equal(navigate('Открой произвольный скрытый экран'),false);
 assert.ok(pilot.includes('navigateByVoice(query)'),
  'desktop voice routing remains unchanged');
});

test('AIR3: first director tap loads text/navigational AI only, not mic/TTS or task-write code',async()=>{
 const director=boot(true,'544fb1e2-ef70-44de-bc62-e0e1596a4bfc');
 director.button.click();
 await new Promise(resolve=>setTimeout(resolve,20));
 assert.ok(director.scriptLoads.some(x=>x.includes('134-resanta-voice-ai360-pilot-v1.js')));
 assert.ok(director.scriptLoads.some(x=>x.includes('143-resanta-ai360-unified-dialog-v1.js')));
 assert.ok(!director.scriptLoads.some(x=>/(135-resanta-voice-capture|136-resanta-voice-quality|140-resanta-ai360-task-drafts)/.test(x)),
    'Android panel may not auto-load microphone, TTS or drafts');
 assert.equal(director.root.__resantaAI360AndroidVoiceArmed,false,'voice cannot start before explicit opt-in');
 assert.ok(lazy.includes('nativeAndroid ? nativeTextScripts : scripts'));
 assert.ok(lazy.includes('installNativeAudioGate();'));
 assert.ok(lazy.includes('typeof navigator.mediaDevices?.getUserMedia'));
 assert.ok(lazy.includes('typeof window.MediaRecorder'));
 assert.ok(lazy.includes('window.__resantaAI360AndroidVoiceArmed=true'));
 assert.ok(lazy.includes('control.disabled=true'));
 assert.ok(lazy.includes('control.disabled=false'));
});
test('AIR3: welcome message cannot auto-initialize native speech before opt-in',()=>{
 assert.match(pilot,/function speak\(message,options=\{\}\)[\s\S]*?window\.__resantaAI360AndroidVoiceArmed!==true/);
 assert.ok(pilot.includes("typeof Recognition.available === 'function'"));
 assert.ok(pilot.includes("window.Capacitor?.getPlatform?.()==='android'"));
});

test('AIR3: opening text panel cannot auto-call director briefing on Android',()=>{
 const brief=source('assets/142-resanta-ai360-director-proactive-brief-v1.js');
 const guarded=brief.slice(brief.indexOf('window.crmAI360DirectorProactiveOpenV2=function(ui){'),
                        brief.indexOf('window.crmAI360DirectorBriefHandleV1='));
 assert.match(guarded,/__resantaAI360AndroidDirectorOptIn===true/);
 assert.match(guarded,/getPlatform\?\.\(\)==='android'\)return false;/);
 assert.ok(brief.includes('window.crmAI360DirectorBriefHandleV1=function(text,ui)'),
           'manual director briefing remains available');
});
