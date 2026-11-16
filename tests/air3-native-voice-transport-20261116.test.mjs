import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const core=fs.readFileSync('assets/01-crm-core.js','utf8');
const code=core.slice(core.indexOf('window.crmAir3VoiceAvailableV1='),core.indexOf('// v23.6.166:'));
function boot(request){
 const sent=[],cancelled=[];
 const window={__resantaAI360AndroidDirectorOptIn:true,Capacitor:{isNativePlatform:()=>true,getPlatform:()=> 'android',isPluginAvailable:()=>true,Plugins:{Air3Voice:{
 request:args=>{sent.push(args);return request(args);},cancel:async args=>{cancelled.push(args);}
 }}}};
 vm.runInNewContext(code,{window,Uint8Array,Blob,btoa,atob,Date,Math,Error,Promise});return {window,sent,cancelled};
}
test('native audio uses one request, unchanged binary result, and no fallback',async()=>{
 const expected=new Uint8Array(204646);expected[0]=82;
 const app=boot(async()=>({audioBase64:Buffer.from(expected).toString('base64')}));
 const result=await app.window.crmAir3VoiceTransportV1('tts',{access_token:'test-token'},{voice:'lera',text:'Тест'},new AbortController().signal);
 assert.equal(app.sent.length,1);assert.equal(app.sent[0].accessToken,'test-token');
 assert.deepEqual(new Uint8Array(await result.data.arrayBuffer()),expected);
});
test('stop cancels native request and ignores late audio',async()=>{
 let release;const app=boot(()=>new Promise(done=>{release=done}));const controller=new AbortController();
 const waiting=app.window.crmAir3VoiceTransportV1('tts',{access_token:'test'},{},controller.signal);
 controller.abort(new Error('voice_request_cancelled'));await assert.rejects(waiting,/voice_request_cancelled/);
 release({audioBase64:'AA=='});await Promise.resolve();
 assert.equal(app.sent.length,1);assert.equal(app.cancelled.length,1);assert.equal(app.cancelled[0].requestId,app.sent[0].requestId);
});
test('already stopped operation dispatches nothing; failed native call never retries',async()=>{
 const app=boot(async()=>{throw Error('voice_native_network_failed')});const c=new AbortController();c.abort();
 await assert.rejects(app.window.crmAir3VoiceTransportV1('tts',{}, {},c.signal));assert.equal(app.sent.length,0);
 await assert.rejects(app.window.crmAir3VoiceTransportV1('tts',{}, {},new AbortController().signal),/voice_native_network_failed/);assert.equal(app.sent.length,1);
});
test('microphone clip is encoded without stack overflow or byte changes',async()=>{
 const app=boot(async()=>({result:{text:'Открой задачи'}}));const data=new Uint8Array(500000);data[499999]=255;
 const encoded=await app.window.crmAir3VoiceEncodeV1(new Blob([data]),new AbortController().signal);
 assert.deepEqual(Buffer.from(encoded,'base64'),Buffer.from(data));
 const result=await app.window.crmAir3VoiceTransportV1('stt',{}, {},new AbortController().signal);assert.equal(result.data.text,'Открой задачи');
});
