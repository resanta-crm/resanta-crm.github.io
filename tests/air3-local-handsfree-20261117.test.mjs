import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const lazy=fs.readFileSync('assets/137-resanta-ai360-lazy-launch-v1.js','utf8');
const controller=lazy.slice(lazy.indexOf('// AIR3_OFFLINE_HANDSFREE_BEGIN'),lazy.indexOf('// AIR3_OFFLINE_HANDSFREE_END'));
const captureSource=fs.readFileSync('assets/135-resanta-voice-capture-fix-v2.js','utf8');
const taking=fs.readFileSync('assets/220-lera360-turn-taking-v1.js','utf8');
const OWNER='544fb1e2-ef70-44de-bc62-e0e1596a4bfc',OTHER='a24954b8-2fe1-4852-b629-d8f351e1bd36';
const KEY='resanta-air3-local-wake-consent-v1:'+OWNER;
const LEASE='00000000-0000-4000-8000-000000000001',EVENT='00000000-0000-4000-8000-000000000002';
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
const flush=async()=>{for(let i=0;i<100;i++)await Promise.resolve();};
function timerHost(){let seq=0;const timers=new Map(),intervals=[];return {timers,intervals,setTimeout:(fn,ms)=>{const id=++seq;timers.set(id,{fn,ms});return id;},clearTimeout:id=>timers.delete(id),setInterval:(fn,ms)=>{intervals.push({fn,ms});return ++seq;},clearInterval(){}};}
function handsfree(options={}){
 const clock=timerHost(),calls=[],storage=options.storage||new Map(),events={},listeners=[];let activeListener=null,confirms=0;
 if(options.saved)storage.set(KEY,'yes');
 const panel={hidden:false,classList:{contains:()=>false}},app={style:{display:'flex'}};
 const ctx={...clock,Map,Set,Promise,Date,String,Array,Object,Number,Error,Math,AbortController,
  nativeAndroid:options.native!==false,androidAudioReady:false,nativeAudioScripts:['./assets/136-resanta-voice-quality-v3.js','./assets/135-resanta-voice-capture-fix-v2.js'],
  currentUser:{id:OWNER},currentProfile:{id:OWNER,name:'Александр Паюшин',role:'boss',region:'Витебск'},
  document:{hidden:false,getElementById:()=>app,querySelector:s=>s==='.rva-window'?panel:null,addEventListener:(name,fn)=>(events['doc:'+name]??=[]).push(fn)},
  localStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)},
  crypto:{randomUUID:()=>options.uuid?.()||LEASE},console:{warn(){}},confirm:()=>{confirms++;return options.confirm!==false;},
  addEventListener:(name,fn)=>(events[name]??=[]).push(fn),primeAndroidOutput:()=>calls.push({kind:'prime'}),
  owner:()=>ctx.nativeAndroid&&ctx.currentUser?.id===OWNER&&ctx.currentProfile?.name==='Александр Паюшин',
  activate:async opts=>{calls.push({kind:'activate',greet:opts.greet});return opts.isCurrent();},
  load:async src=>{calls.push({kind:'load',src,suppressed:ctx.__resantaAIR3DisablePaidWakeAutoV1});
   ctx.crmResantaVoiceSpeakV3=async()=>{calls.push({kind:'paid-tts'});};ctx.crmResantaVoiceSuspendV2=()=>calls.push({kind:'legacy-stop'});},
  crmFastBootstrapV22733:async()=>{calls.push({kind:'core'});return options.core?.promise||true;},
  crmAI360OpenPanelV1:opts=>{calls.push({kind:'open',greet:opts.greet});panel.hidden=false;return true;},
  crmResantaVoiceHasConsentV3:()=>options.voiceConsent!==false,crmResantaVoiceAuthorizeV3:()=>options.voiceConsent!==false,
  crmResantaNativeQuestionV2:data=>{calls.push({kind:'question',data});return options.question?.promise||Promise.resolve({ok:true,submitted:true});},
  crmResantaNativeQuestionCancelV2:()=>calls.push({kind:'question-cancel'}),crmResantaNativeOutputCancelV3:()=>calls.push({kind:'output-cancel'}),
  crmAI360UnifiedDialogResetV1:()=>calls.push({kind:'reset'}),
  crmLocalSignOutV236258:async()=>{calls.push({kind:'logout'});ctx.currentUser=null;ctx.currentProfile=null;},
  crmShowSignedOutUiV236258:()=>{ctx.currentUser=null;ctx.currentProfile=null;},
  db:{auth:{getSession:async()=>({data:{session:{user:{id:ctx.currentUser?.id},access_token:'fixture-session'}}})}},
 };
 const plugin={
  capabilities:async()=>{calls.push({kind:'caps'});return {supported:options.target!==false,modelBundled:options.model!==false,offline:true,wakeWord:'лера'};},
  checkPermissions:async()=>({microphone:options.permission||'granted'}),
  requestPermissions:async()=>{calls.push({kind:'permission-request'});return {microphone:'granted'};},
  addListener:async(name,fn)=>{assert.equal(name,'wakeEvent');activeListener=fn;listeners.push(fn);return {remove:async()=>{if(activeListener===fn)activeListener=null;calls.push({kind:'remove-listener'});}};},
  start:async args=>{calls.push({kind:'start',args});return options.start?.promise||{state:'listening'};},
  pause:async args=>{calls.push({kind:'pause',args});return {state:'paused'};},
  rearm:async args=>{calls.push({kind:'rearm',args});return {state:'listening'};},
  stop:async args=>{calls.push({kind:'stop',args});return options.stop?.promise||{state:'stopped'};}
 };
 ctx.Capacitor={Plugins:{Air3Wake:plugin,Air3Voice:{capabilities:async()=>({bootstrapCore:options.target!==false})}}};
 if(options.noPlugin)delete ctx.Capacitor.Plugins.Air3Wake;
 ctx.window=ctx;vm.runInNewContext(controller+'\nwindow.__hfTest={identifyAir3,ensureNativeAudio};',ctx);
 const tick=async()=>{for(const timer of clock.intervals.filter(x=>x.ms===250))timer.fn();await flush();};
 const emit=async(event,old=false)=>{(old?listeners[0]:activeListener)?.({leaseId:LEASE,...event});await flush();};
 return {ctx,calls,storage,events,panel,app,clock,tick,emit,confirms:()=>confirms};
}
test('old saved cloud-wake settings cannot authorize the new local handsfree mode',async()=>{
 const h=handsfree({storage:new Map([['resanta-ai360-wake-window-optin-v1','yes'],['resanta-ai360-continuous-dialog-optin-v1','yes']])});
 await h.tick();assert.equal(h.calls.length,0);assert.equal(h.ctx.crmAIR3HandsfreeV1.status().active,false);
 await h.ctx.__hfTest.ensureNativeAudio();
 assert.ok(h.calls.filter(x=>x.kind==='load').every(x=>x.suppressed===true));
 assert.equal(h.calls.filter(x=>x.kind==='start'||x.kind==='question'||x.kind==='paid-tts').length,0);
});
test('one actor-scoped consent enables one local microphone after core/session readiness without a greeting',async()=>{
 const core=deferred(),h=handsfree({core,permission:'prompt'}),starting=h.ctx.crmAIR3HandsfreeV1.enable();await flush();
 assert.equal(h.calls.filter(x=>x.kind==='start').length,0);assert.equal(h.confirms(),1);
 core.resolve(true);assert.equal(await starting,true);assert.equal(h.storage.get(KEY),'yes');
 assert.equal(h.calls.filter(x=>x.kind==='start').length,1);assert.equal(h.calls.filter(x=>x.kind==='permission-request').length,1);
 assert.ok(h.calls.filter(x=>x.kind==='open'||x.kind==='activate').every(x=>x.greet===false));
 assert.equal(h.calls.filter(x=>x.kind==='question'||x.kind==='paid-tts').length,0);
});
test('later AIR3 startup resumes only the same consenting actor and buys nothing while waiting',async()=>{
 const h=handsfree({saved:true});await h.tick();await h.tick();
 assert.equal(h.ctx.crmAIR3HandsfreeV1.status().active,true);assert.equal(h.confirms(),0);
 assert.equal(h.calls.filter(x=>x.kind==='start').length,1);assert.equal(h.calls.filter(x=>x.kind==='permission-request').length,0);
 for(let i=0;i<15;i++)await h.tick();
 assert.equal(h.calls.filter(x=>x.kind==='question'||x.kind==='paid-tts'||x.kind==='rearm').length,0);
 const other=handsfree({saved:true});other.ctx.currentUser={id:OTHER};other.ctx.currentProfile={id:OTHER,name:'Руководство компании',role:'boss',region:'Все филиалы'};await other.tick();assert.equal(other.calls.length,0);
});
test('missing model, unsupported glasses, denied consent and missing permission never fall back to paid wake',async()=>{
 for(const options of [{model:false},{target:false},{confirm:false},{noPlugin:true}]){
  const h=handsfree(options);assert.equal(await h.ctx.crmAIR3HandsfreeV1.enable(),false);await h.tick();
  assert.equal(h.calls.filter(x=>['start','question','paid-tts','load'].includes(x.kind)).length,0);
 }
 const auto=handsfree({saved:true,permission:'prompt'});await auto.tick();assert.equal(auto.calls.filter(x=>x.kind==='permission-request'||x.kind==='start').length,0);
 const phone=handsfree({target:false});await phone.ctx.__hfTest.ensureNativeAudio();assert.notEqual(phone.ctx.__resantaAIR3DisablePaidWakeAutoV1,true);
});
test('each native wake/question identity is consumed once and empty wake speech never reaches STT',async()=>{
 const h=handsfree();await h.ctx.crmAIR3HandsfreeV1.enable();
 await h.emit({type:'wake',eventId:EVENT});await h.emit({type:'question',eventId:EVENT,loud:true});await h.tick();
 await h.emit({type:'wake',eventId:EVENT});await h.emit({type:'question',eventId:EVENT,loud:true});
 assert.equal(h.calls.filter(x=>x.kind==='question').length,1);assert.equal(h.calls.filter(x=>x.kind==='rearm').length,1);
 const empty='00000000-0000-4000-8000-000000000003';await h.emit({type:'wake',eventId:empty});await h.emit({type:'question',eventId:empty,loud:false});await h.tick();
 assert.equal(h.calls.filter(x=>x.kind==='question').length,1);
});
test('capture, agent and TTS ownership prevents a second mic and rearm waits for actual completion',async()=>{
 const question=deferred(),h=handsfree({question});await h.ctx.crmAIR3HandsfreeV1.enable();
 await h.emit({type:'wake',eventId:EVENT});await h.tick();assert.equal(h.calls.filter(x=>x.kind==='rearm').length,0);
 await h.emit({type:'question',eventId:EVENT,loud:true});h.ctx.__resantaVoiceOutputBusy=true;h.ctx.crmAIR3HandsfreeV1.outputBusy(true);await h.tick();
 question.resolve({ok:true});await flush();await h.tick();assert.equal(h.calls.filter(x=>x.kind==='rearm').length,0);
 h.ctx.__resantaVoiceOutputBusy=false;await h.tick();assert.equal(h.calls.filter(x=>x.kind==='rearm').length,1);
 h.ctx.__resantaAI360PendingV1=true;await h.tick();assert.equal(h.calls.filter(x=>x.kind==='pause').length,1);
 await h.emit({type:'wake',eventId:'00000000-0000-4000-8000-000000000004'});assert.equal(h.calls.filter(x=>x.kind==='question').length,1);
});
test('native bridge base64 is released immediately while only the one question operation stays pending',async()=>{
 const question=deferred(),h=handsfree({question});await h.ctx.crmAIR3HandsfreeV1.enable();
 await h.emit({type:'wake',eventId:EVENT});await h.emit({type:'question',eventId:EVENT,loud:true,wavBase64:'one bounded native WAV'});
 const delivered=h.calls.find(x=>x.kind==='question');assert.ok(delivered);assert.equal(delivered.data.wavBase64,'');
 assert.equal(h.calls.filter(x=>x.kind==='question').length,1);assert.equal(h.calls.filter(x=>x.kind==='rearm').length,0);
 question.resolve({ok:true});await flush();
});
test('logout, account changes, hiding and page navigation stop only the current lease and reject late events',async()=>{
 for(const kind of ['logout','account','hidden','pagehide']){
  const h=handsfree();await h.ctx.crmAIR3HandsfreeV1.enable();
  if(kind==='logout')await h.ctx.crmLocalSignOutV236258();
  if(kind==='account'){h.ctx.currentUser={id:OTHER};h.ctx.currentProfile={id:OTHER};await h.tick();}
  if(kind==='hidden'){h.ctx.document.hidden=true;for(const fn of h.events['doc:visibilitychange'])fn();}
  if(kind==='pagehide')for(const fn of h.events.pagehide)fn();
  await h.emit({type:'wake',eventId:EVENT},true);await h.emit({type:'question',eventId:EVENT,loud:true},true);
  assert.equal(h.ctx.crmAIR3HandsfreeV1.status().active,false,kind);assert.equal(h.calls.filter(x=>x.kind==='question').length,0,kind);
  assert.ok(h.calls.filter(x=>x.kind==='stop').every(x=>x.args.leaseId===LEASE));
 }
});
test('a late native start cannot arm a new actor, and explicit off removes only that actor consent',async()=>{
 const start=deferred(),h=handsfree({start}),loading=h.ctx.crmAIR3HandsfreeV1.enable();await flush();await h.ctx.crmLocalSignOutV236258();start.resolve({state:'listening'});assert.equal(await loading,false);assert.equal(h.ctx.crmAIR3HandsfreeV1.status().active,false);
 const own=handsfree({storage:new Map([['resanta-air3-local-wake-consent-v1:'+OTHER,'yes']])});await own.ctx.crmAIR3HandsfreeV1.enable();own.ctx.crmAIR3HandsfreeV1.disable();
 assert.equal(own.storage.has(KEY),false);assert.equal(own.storage.get('resanta-air3-local-wake-consent-v1:'+OTHER),'yes');
});
test('rapid hide/show waits for native microphone and model teardown before starting a new lease',async()=>{
 const stop=deferred();let uuid=0;
 const h=handsfree({stop,uuid:()=>++uuid===1?LEASE:'00000000-0000-4000-8000-000000000003'});
 await h.ctx.crmAIR3HandsfreeV1.enable();assert.equal(h.calls.filter(x=>x.kind==='start').length,1);
 h.ctx.document.hidden=true;for(const fn of h.events['doc:visibilitychange'])fn();
 h.ctx.document.hidden=false;await h.tick();
 assert.equal(h.calls.filter(x=>x.kind==='start').length,1,'the second start cannot overtake native stop');
 stop.resolve({state:'stopped'});await flush();
 assert.equal(h.calls.filter(x=>x.kind==='start').length,2);assert.equal(h.ctx.crmAIR3HandsfreeV1.status().active,true);
 assert.notEqual(h.calls.filter(x=>x.kind==='start')[0].args.leaseId,h.calls.filter(x=>x.kind==='start')[1].args.leaseId);
});
function wavBase64(seconds=1){
 const buffer=Buffer.alloc(44+seconds*32000);buffer.write('RIFF',0);buffer.writeUInt32LE(buffer.length-8,4);buffer.write('WAVEfmt ',8);buffer.writeUInt32LE(16,16);buffer.writeUInt16LE(1,20);buffer.writeUInt16LE(1,22);buffer.writeUInt32LE(16000,24);buffer.writeUInt32LE(32000,28);buffer.writeUInt16LE(2,32);buffer.writeUInt16LE(16,34);buffer.write('data',36);buffer.writeUInt32LE(buffer.length-44,40);return buffer.toString('base64');
}
function questionAdapter(options={}){
 const clock=timerHost(),calls=[],questions=[],listeners={},storage=new Map([['resanta-ai360-wake-window-optin-v1','yes'],['resanta-ai360-continuous-dialog-optin-v1','yes'],['resanta-ai360-microphone-optin-v1','yes']]);let enabled=true;
 const fields={};for(const key of ['.rva-mic','.rva-wake','.rva-status','.rva-input','.rva-send','.rva-note','.rva-close'])fields[key]={value:'',textContent:'',style:{},addEventListener(){},setAttribute(){}};
 fields['.rva-send'].click=()=>{questions.push(fields['.rva-input'].value);};
 const panel={dataset:{},hidden:false,isConnected:true,classList:{contains:()=>false},querySelector:key=>fields[key]||null};
 const ctx={...clock,Blob,Uint8Array,DataView,Map,Set,Promise,Date,Math,Number,String,Array,Object,JSON,Error,AbortController,atob,FormData,
  navigator:{userAgent:'Android',mediaDevices:{getUserMedia(){calls.push({kind:'getUserMedia'});throw Error('No second microphone is allowed');}}},
  currentUser:{id:OWNER},currentProfile:{id:OWNER,name:'Александр Паюшин',role:'boss',region:'Витебск'},
  Capacitor:{isNativePlatform:()=>true,getPlatform:()=> 'android'},__resantaAI360AndroidDirectorOptIn:true,__resantaAIR3DisablePaidWakeAutoV1:true,
  document:{hidden:false,querySelector:()=>panel,getElementById:()=>({style:{display:'flex'}}),addEventListener:(name,fn)=>(listeners[name]??=[]).push(fn),createElement:()=>({style:{},setAttribute(){}})},
  localStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)},
  console:{warn(){},info(){}},addEventListener(){},confirm:()=>true,speechSynthesis:{speaking:false,cancel(){}},
  crmAI360GreetingV1:()=>({id:ctx.currentUser?.id}),crmResantaVoiceHasConsentV3:()=>true,
  crmAIR3HandsfreeV1:{isCurrent:(lease,actor)=>enabled&&lease===LEASE&&ctx.currentUser?.id===actor},
  crmEnsureFreshSessionV236166:async()=>options.session?.promise||{access_token:'fixture-session',user:{id:ctx.currentUser?.id}},
  crmVoiceRequestV1:(fn,request)=>fn(request.signal),crmAir3VoiceAvailableV1:()=>true,
  crmAir3VoiceEncodeV1:async blob=>options.encode?.promise||Buffer.from(await blob.arrayBuffer()).toString('base64'),
  crmAir3VoiceTransportV1:async(kind,session,data,signal)=>{calls.push({kind,session,data,signal});return options.transcribe?.promise||{data:{text:options.texts?.shift()||'Лера, открой клиентов'}};},
 };
 ctx.window=ctx;vm.runInNewContext(taking,ctx);vm.runInNewContext(captureSource,ctx);
 const data={actor:OWNER,leaseId:LEASE,eventId:EVENT,wavBase64:wavBase64(),contentType:'audio/wav',durationMs:1000,loud:true};
 return {ctx,calls,questions,clock,data,expireLease:()=>{enabled=false;},disable:()=>{enabled=false;ctx.crmResantaNativeQuestionCancelV2();},tick:async()=>{for(const t of clock.intervals.filter(x=>x.ms===650))t.fn();await flush();}};
}
test('migrated AIR3 saved cloud preferences never start a microphone on initialization or later interval ticks',async()=>{
 const h=questionAdapter();await h.tick();await h.tick();assert.equal(h.calls.length,0);assert.equal(h.questions.length,0);
});
test('one captured PCM WAV uses exactly the existing authenticated STT and normal command dispatch',async()=>{
 const h=questionAdapter();const result=await h.ctx.crmResantaNativeQuestionV2(h.data);
 assert.equal(result.ok,true);assert.equal(result.submitted,true);assert.deepEqual(h.questions,['открой клиентов']);assert.equal(h.calls.length,1);
 assert.equal(h.calls[0].kind,'stt');assert.equal(h.calls[0].data.mime,'audio/wav');assert.equal(h.calls[0].session.user.id,OWNER);
 assert.equal(h.calls[0].data.audioBase64,h.data.wavBase64);assert.equal(h.calls[0].data.duration,1);
 await h.ctx.crmResantaNativeQuestionV2(h.data);assert.equal(h.calls.length,1);
});
test('silence, malformed WAV and duplicate wake questions cannot buy another transcription',async()=>{
 for(const overrides of [{loud:false},{wavBase64:'AAAA'},{wavBase64:wavBase64(16)},{contentType:'audio/webm'}]){
  const h=questionAdapter();await h.ctx.crmResantaNativeQuestionV2({...h.data,...overrides});assert.equal(h.calls.length,0);assert.equal(h.questions.length,0);
 }
 const pending=deferred(),h=questionAdapter({transcribe:pending});const one=h.ctx.crmResantaNativeQuestionV2(h.data),two=h.ctx.crmResantaNativeQuestionV2(h.data);await flush();assert.equal(h.calls.length,1);
 pending.resolve({data:{text:'Открой задачи'}});await Promise.all([one,two]);assert.deepEqual(h.questions,['Открой задачи']);
});
test('session/actor cancellation before STT and late STT completion never dispatch an old question',async()=>{
 const session=deferred(),before=questionAdapter({session}),first=before.ctx.crmResantaNativeQuestionV2(before.data);await flush();before.ctx.currentUser={id:OTHER};before.disable();session.resolve({access_token:'new-session',user:{id:OTHER}});await first;assert.equal(before.calls.length,0);assert.equal(before.questions.length,0);
 const speech=deferred(),after=questionAdapter({transcribe:speech}),old=after.ctx.crmResantaNativeQuestionV2(after.data);await flush();after.ctx.currentUser={id:OTHER};after.disable();speech.resolve({data:{text:'Подготовь секретные данные'}});await old;assert.equal(after.calls.length,1);assert.equal(after.questions.length,0);
});
test('an actor, profile or native lease change during encoding blocks STT before a periodic cancellation arrives',async()=>{
 for(const change of ['actor','lease']){
  const encode=deferred(),h=questionAdapter({encode}),question=h.ctx.crmResantaNativeQuestionV2(h.data);await flush();
  assert.equal(h.calls.length,0);
  if(change==='actor')h.ctx.currentUser={id:OTHER};else h.expireLease();
  encode.resolve(h.data.wavBase64);const result=await question;
  assert.equal(result.ok,false,change);assert.equal(h.calls.length,0,change);assert.equal(h.questions.length,0,change);
 }
});
test('a capped or unfinished question is held locally and merged with the next explicitly awakened continuation',async()=>{
 const h=questionAdapter({texts:['Лера, подготовь встречу с','НилСтрой на завтра']});
 const first=await h.ctx.crmResantaNativeQuestionV2({...h.data,limitReached:true});assert.equal(first.continued,true);assert.equal(h.questions.length,0);
 const next=await h.ctx.crmResantaNativeQuestionV2({...h.data,eventId:'00000000-0000-4000-8000-000000000003'});
 assert.equal(next.submitted,true);assert.deepEqual(h.questions,['подготовь встречу с НилСтрой на завтра']);assert.equal(h.calls.length,2);
});
test('cancelled continuation cannot leak into a later actor or a new native lease',async()=>{
 const h=questionAdapter({texts:['Лера, подготовь встречу с','Открой задачи']});await h.ctx.crmResantaNativeQuestionV2({...h.data,limitReached:true});h.ctx.crmResantaNativeQuestionCancelV2();
 await h.ctx.crmResantaNativeQuestionV2({...h.data,eventId:'00000000-0000-4000-8000-000000000003'});assert.deepEqual(h.questions,['Открой задачи']);
});
test('continuation length overflow fails before truncation or dispatch of an incomplete command',async()=>{
 const h=questionAdapter({texts:['А'.repeat(1000),'Б'.repeat(1000),'В'.repeat(500)]});
 await h.ctx.crmResantaNativeQuestionV2({...h.data,limitReached:true});
 await h.ctx.crmResantaNativeQuestionV2({...h.data,eventId:'00000000-0000-4000-8000-000000000003',limitReached:true});
 const result=await h.ctx.crmResantaNativeQuestionV2({...h.data,eventId:'00000000-0000-4000-8000-000000000004'});
 assert.equal(result.ok,false);assert.equal(result.reason,'native_question_too_long');assert.equal(h.questions.length,0);
});
test('actor or authenticated user changes during TTS auth cannot send old answer text to a paid provider',async()=>{
 const quality=fs.readFileSync('assets/136-resanta-voice-quality-v3.js','utf8');
 const code=quality.slice(quality.indexOf('async function cloudSpeak('),quality.indexOf('window.crmResantaVoiceSpeakV3='));
 for(const change of ['actor','session']){
  const auth=deferred(),calls=[];
  const ctx={epoch:1,speechRequest:null,AbortController,Error,String,actor:OWNER,
   crmAI360GreetingV1:()=>({id:ctx.actor}),crmEnsureFreshSessionV236166:()=>auth.promise,
   crmVoiceRequestV1:(fn,request)=>fn(request.signal),crmAir3VoiceAvailableV1:()=>true,
   crmAir3VoiceTransportV1:async()=>{calls.push('tts');},nativeAndroidDirector:()=>true,setStatus(){}};
  ctx.window=ctx;vm.runInNewContext(code+';window.speakTest=cloudSpeak;',ctx);
  const speaking=ctx.speakTest('Private answer for the previous actor','lera',1,'yandex');await flush();
  if(change==='actor')ctx.actor=OTHER;
  auth.resolve({access_token:'new-session',user:{id:OTHER}});
  await assert.rejects(speaking,/voice_request_cancelled/);assert.equal(calls.length,0,change);
 }
});
test('an actor change during the first audio chunk cancels the entire old narration queue',async()=>{
 const original=fs.readFileSync('assets/136-resanta-voice-quality-v3.js','utf8');
 const source=original.replace(/mount\(\);\s*\}\)\(\);\s*$/,"window.__outputTest={setPanel:value=>panel=value};\n})();");
 const first=deferred(),clock=timerHost(),calls=[];
 const ctx={...clock,Blob,Uint8Array,DataView,Promise,Date,Math,Number,String,Array,Object,JSON,Error,AbortController,
  actor:OWNER,navigator:{userAgent:'Android'},Capacitor:{isNativePlatform:()=>true,getPlatform:()=> 'android'},__resantaAI360AndroidDirectorOptIn:true,
  document:{querySelector:()=>null,getElementById:()=>({style:{display:'flex'}}),addEventListener(){},createElement:()=>({style:{},setAttribute(){}})},
  localStorage:{getItem:()=> 'yes',setItem(){}},console:{warn(){},info(){}},addEventListener(){},speechSynthesis:{speaking:false,cancel(){}},
  crmAI360GreetingV1:()=>({id:ctx.actor}),crmEnsureFreshSessionV236166:async()=>({access_token:'session-'+ctx.actor,user:{id:ctx.actor}}),
  crmVoiceRequestV1:(fn,request)=>fn(request.signal),crmAir3VoiceAvailableV1:()=>true,
  crmAir3VoiceTransportV1:async(kind,session,body)=>{calls.push({kind,actor:session.user.id,text:body.text});return first.promise;}
 };
 ctx.window=ctx;vm.runInNewContext(source,ctx);ctx.__outputTest.setPanel({hidden:false,querySelector:()=>null});
 const speaking=ctx.crmResantaVoiceSpeakV3('Подробный коммерческий ответ прежней учётной записи. '.repeat(12));await flush();
 assert.equal(calls.length,1);ctx.actor=OTHER;first.resolve({data:new Blob([Buffer.from(wavBase64(),'base64')],{type:'application/octet-stream'})});await flush();
 for(const [id,timer] of clock.timers){if(timer.ms===250){clock.timers.delete(id);timer.fn();}}await flush();
 const result=await speaking;assert.equal(result.ok,false);assert.ok(result.total>1);assert.equal(calls.length,1);assert.equal(calls[0].actor,OWNER);
});

test('a current actor switch clears old visible conversation and invalidates bound asynchronous UI callbacks',()=>{
 const pilot=fs.readFileSync('assets/134-resanta-voice-ai360-pilot-v1.js','utf8');
 const from=pilot.indexOf("  let conversationActor=''") ,to=pilot.indexOf('  function lastUserQuestion()',from);
 assert.ok(from>0&&to>from);
 const feedback={hidden:false},history={textContent:'old customer and old answer'},field={value:'old question'},answers=[],resets=[];
 const ctx={String,clearTimeout(){},state:{manualSequence:0,manualRestart:0},historyEl:history,field,root:{querySelector:()=>feedback},lastDetailedResponse:'old detail',lastSubstantialAnswer:'old total',feedbackTarget:{old:true},setWake(){},answer:(...args)=>answers.push(args),textStatus(){},actor:OWNER};
 ctx.window=ctx;ctx.crmAI360GreetingV1=()=>ctx.actor?{id:ctx.actor}:null;ctx.crmAI360UnifiedDialogResetV1=()=>resets.push(ctx.actor);
 vm.runInNewContext(pilot.slice(from,to),ctx);
 const oldUi=ctx.crmAI360BoundActorUiV1();ctx.crmAI360PanelActorReconcileV1();
 assert.equal(history.textContent,'old customer and old answer','same actor reopen/refresh keeps conversation');assert.equal(resets.length,0);
 ctx.actor=OTHER;ctx.crmAI360PanelActorReconcileV1();assert.equal(history.textContent,'');assert.equal(field.value,'');assert.equal(feedback.hidden,true);assert.equal(resets.length,1);
 oldUi.answer('late secret from old actor');assert.equal(answers.length,0);
 ctx.crmAI360BoundActorUiV1().answer('new authorized answer');assert.equal(answers.length,1);
});
