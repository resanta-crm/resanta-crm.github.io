import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const core=readFileSync('assets/01-crm-core.js','utf8');
const source=core.slice(core.indexOf('window.crmVoiceRequestV1='),core.indexOf('// v23.6.166:'));
function setup(){const window={};vm.runInNewContext(source,{window,AbortController,Promise,Error,setTimeout,clearTimeout});return window.crmVoiceRequestV1;}
test('hung transport is aborted and UI promise settles at deadline',async()=>{
 const run=setup(),controller=new AbortController();
 await assert.rejects(run(()=>new Promise(()=>{}),controller,15),/voice_network_timeout/);
 assert.equal(controller.signal.aborted,true);
});
test('stop settles immediately even if transport ignores abort',async()=>{
 const run=setup(),controller=new AbortController();
 const result=run(()=>new Promise(()=>{}),controller,1000);
 controller.abort(new Error('voice_request_cancelled'));
 await assert.rejects(result,/voice_request_cancelled/);
});
test('late auth cannot dispatch a paid request after timeout',async()=>{
 const run=setup();let release,calls=0;
 const auth=new Promise(r=>release=r);
 await assert.rejects(run(async signal=>{await auth;signal.throwIfAborted();calls++;},new AbortController(),15),/voice_network_timeout/);
 release();await new Promise(r=>setTimeout(r,5));assert.equal(calls,0);
});
test('successful request is not aborted later',async()=>{
 const run=setup(),controller=new AbortController();
 assert.equal(await run(()=>42,controller,15),42);
 await new Promise(r=>setTimeout(r,25));assert.equal(controller.signal.aborted,false);
});
test('expired result never replaces the newer request',async()=>{
 const run=setup();let release;
 const old=run(()=>new Promise(r=>release=r),new AbortController(),15);
 await assert.rejects(old,/voice_network_timeout/);
 assert.equal(await run(()=> 'new',new AbortController(),50),'new');
 release('old');await new Promise(r=>setTimeout(r,5));
});
const capture=readFileSync('assets/135-resanta-voice-capture-fix-v2.js','utf8');
const transcribeSource=capture.slice(capture.indexOf(' async function transcribe('),capture.indexOf(' async function recognizeTurn('));
function captureHarness(invoke,auth=async()=>({access_token:'test-session'})){
 const notices=[];const bounded=setup();
 const c={AbortController,Error,Object,Blob,File,FormData,Promise,
  window:{crmVoiceRequestV1:(f,c)=>bounded(f,c,15),crmEnsureFreshSessionV236166:auth},
  db:{functions:{invoke}},ENDPOINT:'speech',listenEpoch:1,mode:'manual',busy:false,
  transcriptRequest:null,transcriptFailure:'',info:m=>notices.push(m),cloudError:e=>e.message};
 vm.createContext(c);vm.runInContext(transcribeSource,c);return {c,notices,clip:{blob:new Blob(['a'.repeat(1000)],{type:'audio/webm'}),duration:1}};
}
test('real transcription releases busy state and reports offline timeout',async()=>{
 const {c,clip}=captureHarness(()=>new Promise(()=>{}));
 assert.equal(await c.transcribe(clip,1),null);assert.equal(c.busy,false);
 assert.equal(c.transcriptFailure,'voice_network_timeout');assert.equal(c.transcriptRequest,null);
});
test('real transcription ignores cancelled turn and permits a later turn',async()=>{
 let release;const {c,clip}=captureHarness(()=>new Promise(r=>release=r));
 const first=c.transcribe(clip,1);await new Promise(r=>setTimeout(r,0));
 c.listenEpoch=2;c.transcriptRequest.abort(new Error('voice_request_cancelled'));
 assert.equal(await first,null);release({data:{text:'old command'}});
 c.db.functions.invoke=async()=>({data:{text:'new command'}});
 assert.equal(await c.transcribe(clip,2),'new command');assert.equal(c.busy,false);
});
