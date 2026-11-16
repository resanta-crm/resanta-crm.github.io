import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const root='assets/';
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
const flush=async()=>{for(let i=0;i<80;i++)await Promise.resolve();};
function fixture(file,options={}){
 const timers=[],intervals=[],logs=[],sources=[],players=[];let timerId=0,paidCalls=0,micCalls=0,recorders=0,resumes=0;
 const status={textContent:''},panel={hidden:false,isConnected:true,classList:{contains:()=>false},querySelector:selector=>selector==='.rva-status'?status:null};
 const audioContext={state:options.state||'running',destination:{},
  resume(){resumes++;if(options.resume)return options.resume(audioContext);audioContext.state='running';return Promise.resolve();},
  suspend(){audioContext.state='suspended';return Promise.resolve();},
  close(){audioContext.state='closed';return Promise.resolve();},
  decodeAudioData:()=>options.decode?options.decode():Promise.resolve({duration:1}),
  createMediaStreamSource:()=>({connect(){},disconnect(){}}),
  createAnalyser:()=>({fftSize:1024,disconnect(){},getByteTimeDomainData:buffer=>buffer.fill(128)}),
  createBufferSource(){const source={playbackRate:{},connect(){},disconnect(){},start(){source.started=true;if(options.autoEnd!==false)queueMicrotask(()=>source.onended?.());},stop(){source.stopped=true;queueMicrotask(()=>source.onended?.());}};sources.push(source);return source;},
 };
 class AudioPlayer{
  constructor(url){this.url=url;this.listeners={};players.push(this);}
  addEventListener(name,fn){this.listeners[name]=fn;}
  play(){this.started=true;queueMicrotask(()=>{this.listeners.playing?.();if(options.htmlAutoEnd!==false)this.listeners.ended?.();});return Promise.resolve();}
  pause(){this.paused=true;}
 }
 class Recorder{
  static isTypeSupported(){return true;}
  constructor(){recorders++;this.state='inactive';this.mimeType='audio/webm';}
  start(){this.state='recording';}
  stop(){this.state='inactive';queueMicrotask(()=>this.onstop?.());}
 }
 const storage={getItem:()=> 'yes',setItem(){},removeItem(){}};
 const ctx={Blob,Uint8Array,Promise,AbortController,Error,Date,Math,Number,String,Array,Object,JSON,Map,Set,
  console:{info:(...args)=>logs.push(args),warn:(...args)=>logs.push(args)},
  navigator:{userAgent:options.desktop?'Macintosh':'Android',mediaDevices:{getUserMedia(){micCalls++;return options.getUserMedia?.()||Promise.reject(Error('unused microphone'));}}},
  localStorage:storage,MediaRecorder:Recorder,AudioContext:function(){return audioContext;},Audio:AudioPlayer,
  URL:{createObjectURL:()=> 'blob:test',revokeObjectURL(){}},
  speechSynthesis:{speaking:false,cancel(){}},
  document:{hidden:false,getElementById:()=>({style:{display:''}}),querySelector:()=>null,addEventListener(){},createElement:()=>({setAttribute(){},style:{}})},
  setTimeout:(fn,ms)=>{const t={id:++timerId,fn,ms,active:true};timers.push(t);return t.id;},
  clearTimeout:id=>{const t=timers.find(t=>t.id===id);if(t)t.active=false;},
  setInterval:(fn,ms)=>{const t={id:++timerId,fn,ms,active:true};intervals.push(t);return t.id;},
  clearInterval:id=>{const t=intervals.find(t=>t.id===id);if(t)t.active=false;},
  addEventListener(){},confirm:()=>true,
  Capacitor:{isNativePlatform:()=>!options.desktop,getPlatform:()=>options.desktop?'web':'android'},
  __resantaAI360AndroidDirectorOptIn:!options.desktop,
  __resantaAI360AndroidOutputContextV1:audioContext,
  crmAI360GreetingV1:()=>({id:'544fb1e2-ef70-44de-bc62-e0e1596a4bfc'}),
  crmEnsureFreshSessionV236166:async()=>({access_token:'test-session'}),
  crmVoiceRequestV1:(fn,request)=>fn(request.signal),
  crmAir3VoiceAvailableV1:()=>!options.desktop,
  crmResantaVoiceAuthorizeV3:()=>true,crmResantaVoiceHasConsentV3:()=>true,
 };
 const wav=new Blob([new Uint8Array([82,73,70,70,0,0,0,0,87,65,86,69]),new Uint8Array(400)],{type:'application/octet-stream'});
 const paid=async()=>{paidCalls++;return {data:wav};};
 ctx.crmAir3VoiceTransportV1=paid;
 ctx.db={functions:{invoke:paid}};
 ctx.window=ctx;
 let source=fs.readFileSync(root+file,'utf8');
 if(file.startsWith('136'))source=source.replace(/mount\(\);\s*\}\)\(\);\s*$/,
  `window.__voiceTest={playAndroidWav,playAndroidAudio,cloudSpeak,stopSpeech,setPanel:value=>panel=value,state:()=>({epoch,paused,busy:window.__resantaVoiceOutputBusy,request:androidPlaybackRequest})};\n})();`);
 else source=source.replace(/init\(\);\s*\}\)\(\);\s*$/,
  `window.__voiceTest={start,stopAll,permission,capture,setPanel:value=>panel=value,setMode:value=>mode=value,state:()=>({epoch:listenEpoch,mode,stream,context,starting,autoWakeBlocked})};\n})();`);
 vm.runInNewContext(source,ctx);
 ctx.__voiceTest.setPanel(panel);
 const expire=async ms=>{const t=timers.find(t=>t.active&&t.ms===ms);assert.ok(t,'active deadline '+ms);t.active=false;t.fn();await flush();};
 return {ctx,api:ctx.__voiceTest,audioContext,sources,players,timers,intervals,logs,status,wav,expire,
  counts:()=>({paidCalls,micCalls,recorders,resumes})};
}
const voice=options=>fixture('136-resanta-voice-quality-v3.js',options);
const mic=options=>fixture('135-resanta-voice-capture-fix-v2.js',options);

test('idle modules never request microphone, generate audio or resume output',()=>{
 const a=voice(),b=mic();a.api.stopSpeech();
 assert.deepEqual(a.counts(),{paidCalls:0,micCalls:0,recorders:0,resumes:0});
 assert.deepEqual(b.counts(),{paidCalls:0,micCalls:0,recorders:0,resumes:0});
});
test('stalled decode reuses the one received WAV in HTML, then discards a late decode',async()=>{
 const decode=deferred(),h=voice({decode:()=>decode.promise});
 const result=h.ctx.crmResantaVoiceSpeakV3('Проверка звука.');await flush();
 await h.expire(5000);await h.expire(250);assert.equal((await result).ok,true);
 assert.equal(h.counts().paidCalls,1);assert.equal(h.players.length,1);assert.equal(h.sources.length,0);assert.equal(h.api.state().busy,false);
 decode.resolve({duration:1});await flush();assert.equal(h.sources.length,0);assert.equal(h.counts().paidCalls,1);
});
test('stalled resume is bounded and uses received audio without another TTS request',async()=>{
 const resume=deferred(),h=voice({state:'suspended',resume:()=>resume.promise});
 const result=h.ctx.crmResantaVoiceSpeakV3('Проверка звука.');await flush();
 await h.expire(3000);await h.expire(250);assert.equal((await result).ok,true);
 assert.equal(h.counts().paidCalls,1);assert.equal(h.players.length,1);assert.equal(h.sources.length,0);
 resume.resolve();await flush();assert.equal(h.sources.length,0);
});
test('stop during decoding settles immediately and cannot replay late audio',async()=>{
 const decode=deferred(),h=voice({decode:()=>decode.promise});
 const result=h.ctx.crmResantaVoiceSpeakV3('Проверка отмены.');await flush();h.api.stopSpeech();await flush();
 assert.equal((await result).ok,false);assert.equal(h.api.state().busy,false);
 decode.resolve({duration:1});await flush();
 assert.equal(h.sources.length,0);assert.equal(h.players.length,0);assert.equal(h.counts().paidCalls,1);
 assert.equal(h.timers.filter(t=>t.active&&t.ms===5000).length,0);
});
test('pause then stop restores output context for a new explicit answer',async()=>{
 const h=voice({autoEnd:false});
 const old=h.ctx.crmResantaVoiceSpeakV3('Первый ответ.');await flush();assert.equal(h.sources.length,1);
 assert.equal(h.ctx.crmResantaVoiceTogglePauseV3(),true);await flush();assert.equal(h.audioContext.state,'suspended');
 h.ctx.crmResantaVoiceStopV3();await flush();assert.equal((await old).ok,false);assert.equal(h.audioContext.state,'running');assert.equal(h.sources[0].stopped,true);
 const next=h.ctx.crmResantaVoiceSpeakV3('Новый ответ.');await flush();assert.equal(h.sources.length,2);
 h.sources[1].onended();await flush();await h.expire(250);assert.equal((await next).ok,true);
 assert.equal(h.players.length,0);assert.equal(h.counts().paidCalls,2);
});
test('suspension during decoding is rechecked before starting the buffer',async()=>{
 const decode=deferred(),h=voice({decode:()=>decode.promise});
 const result=h.ctx.crmResantaVoiceSpeakV3('Проверка состояния.');await flush();h.audioContext.state='suspended';decode.resolve({duration:1});await flush();
 await h.expire(250);assert.equal((await result).ok,true);assert.equal(h.counts().resumes,1);assert.equal(h.sources.length,1);assert.equal(h.players.length,0);assert.equal(h.counts().paidCalls,1);
});
test('timeout after actual playback starts stops the buffer and never replays it in HTML',async()=>{
 const h=voice({autoEnd:false});const result=h.ctx.crmResantaVoiceSpeakV3('Ответ без повтора.');await flush();
 await h.expire(8000);await h.expire(250);const outcome=await result;
 assert.equal(outcome.ok,false);assert.equal(outcome.reason,'android_audio_timeout');assert.equal(h.sources[0].stopped,true);assert.equal(h.players.length,0);assert.equal(h.counts().paidCalls,1);assert.equal(h.api.state().busy,false);
});
test('stop during HTML fallback cancels the player without requesting another audio',async()=>{
 const h=voice({decode:async()=>{throw Error('unsupported WAV');},htmlAutoEnd:false});
 const result=h.ctx.crmResantaVoiceSpeakV3('Отмена стандартного плеера.');await flush();assert.equal(h.players.length,1);
 h.ctx.crmResantaVoiceStopV3();await flush();assert.equal((await result).ok,false);assert.equal(h.players[0].paused,true);assert.equal(h.counts().paidCalls,1);assert.equal(h.api.state().busy,false);
});
test('desktop keeps its existing HTML playback path',async()=>{
 const h=voice({desktop:true});const result=h.ctx.crmResantaVoiceSpeakV3('Обычный браузер.');await flush();await h.expire(250);
 assert.equal((await result).ok,true);assert.equal(h.players.length,1);assert.equal(h.sources.length,0);assert.equal(h.counts().resumes,0);assert.equal(h.counts().paidCalls,1);
});
test('microphone permission timeout stops a late grant and disables automatic retries',async()=>{
 const grant=deferred(),track={stops:0,stop(){this.stops++;}},h=mic({getUserMedia:()=>grant.promise});
 const start=h.api.start('wake',false,true);await flush();await h.expire(12000);await start;
 assert.equal(h.api.state().mode,'');assert.equal(h.api.state().starting,false);assert.equal(h.api.state().autoWakeBlocked,true);
 grant.resolve({active:true,getTracks:()=>[track]});await flush();assert.equal(track.stops,1);assert.equal(h.api.state().stream,null);assert.equal(h.counts().recorders,0);assert.equal(h.counts().paidCalls,0);
});
test('explicit stop while permission is pending disposes a later stream and sends nothing',async()=>{
 const grant=deferred(),track={stops:0,stop(){this.stops++;}},h=mic({getUserMedia:()=>grant.promise});
 const start=h.api.start('wake',false,true);await flush();await h.api.stopAll();await start;
 grant.resolve({active:true,getTracks:()=>[track]});await flush();assert.equal(track.stops,1);assert.equal(h.api.state().mode,'');assert.equal(h.counts().paidCalls,0);assert.equal(h.counts().recorders,0);
});
test('microphone resume timeout releases its granted tracks before recording',async()=>{
 const resume=deferred(),track={stops:0,stop(){this.stops++;}},h=mic({state:'suspended',resume:()=>resume.promise,getUserMedia:async()=>({active:true,getTracks:()=>[track]})});
 const start=h.api.start('wake',false,true);await flush();await h.expire(3000);await start;
 assert.equal(track.stops,1);assert.equal(h.api.state().stream,null);assert.equal(h.api.state().context,null);assert.equal(h.counts().recorders,0);assert.equal(h.api.state().autoWakeBlocked,true);
 resume.resolve();await flush();assert.equal(h.counts().recorders,0);assert.equal(h.counts().paidCalls,0);
});
test('suspended microphone analyser stops capture instead of silently waiting forever',async()=>{
 const track={stop(){}},h=mic({getUserMedia:async()=>({active:true,getTracks:()=>[track]})});h.api.setMode('wake');
 await h.api.permission();const recording=h.api.capture(12,h.api.state().epoch);h.audioContext.state='suspended';
 h.intervals.find(t=>t.active&&t.ms===110).fn();await assert.rejects(recording,/android_mic_context_suspended/);
 await h.api.stopAll();assert.equal(h.counts().paidCalls,0);
});
test('stop during old context cleanup cannot restart the microphone',async()=>{
 const closing=deferred(),track={stop(){}},h=mic({getUserMedia:async()=>({active:true,getTracks:()=>[track]})});
 h.api.setMode('manual');await h.api.permission();h.audioContext.close=()=>closing.promise;
 const starting=h.api.start('wake',false,true);await flush();await h.api.stopAll();closing.resolve();await starting;await flush();
 assert.equal(h.api.state().mode,'');assert.equal(h.api.state().starting,false);assert.equal(h.counts().micCalls,1);assert.equal(h.counts().paidCalls,0);
});
test('an old cleanup cannot overwrite a newer microphone start in progress',async()=>{
 const closing=deferred(),nextGrant=deferred(),track={stop(){}},nextTrack={stops:0,stop(){this.stops++;}};let grants=0;
 const h=mic({getUserMedia:()=>++grants===1?Promise.resolve({active:true,getTracks:()=>[track]}):nextGrant.promise});
 h.api.setMode('manual');await h.api.permission();h.audioContext.close=()=>closing.promise;
 const old=h.api.start('wake',false,true);await flush();await h.api.stopAll();
 const next=h.api.start('wake',false,true);await flush();assert.equal(h.api.state().starting,true);
 closing.resolve();await old;await flush();
 assert.equal(h.api.state().mode,'wake');assert.equal(h.api.state().starting,true);assert.equal(h.counts().micCalls,2);
 await h.api.stopAll();await next;nextGrant.resolve({active:true,getTracks:()=>[nextTrack]});await flush();
 assert.equal(nextTrack.stops,1);assert.equal(h.api.state().mode,'');assert.equal(h.counts().paidCalls,0);
});
test('a hidden panel or changed actor during cleanup cannot start a late microphone',async()=>{
 for(const hidden of [true,false]){
  const closing=deferred(),track={stop(){}},h=mic({getUserMedia:async()=>({active:true,getTracks:()=>[track]})});
  h.api.setMode('manual');await h.api.permission();h.audioContext.close=()=>closing.promise;
  const starting=h.api.start('wake',false,true);await flush();
  if(hidden)h.ctx.document.hidden=true;else h.ctx.crmAI360GreetingV1=()=>({id:'another-actor'});
  closing.resolve();await starting;await flush();
  assert.equal(h.api.state().mode,'');assert.equal(h.counts().micCalls,1);assert.equal(h.counts().paidCalls,0);
 }
});
