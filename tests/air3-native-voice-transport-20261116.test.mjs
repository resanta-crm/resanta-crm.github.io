import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const core=fs.readFileSync('assets/01-crm-core.js','utf8');
const httpSource=fs.readFileSync('assets/00-air3-control-http-v1.js','utf8');
function httpBoot(post, native=true){
 const calls=[],fallback=[];
 const window={location:{href:'https://resanta-crm.by/'},fetch:async(...args)=>{fallback.push(args);return 'original'},Capacitor:{isNativePlatform:()=>native,getPlatform:()=> 'android',isPluginAvailable:()=>true,Plugins:{CapacitorHttp:{post:async args=>{calls.push(args);return post(args)}}}}};
 vm.runInNewContext(httpSource,{window,URL,Headers,Response,Set,Promise,JSON,Object,String,Error});
 return {window,calls,fallback};
}
test('AIR3 control read retains JSON, authentication headers and response status',async()=>{
 const f=httpBoot(async()=>({status:200,data:{month:'2026-11',sales:[]},headers:{'content-type':'application/json'}}));
 const result=await f.window.fetch('https://baqchjtvtmcfzwjjluhs.supabase.co/rest/v1/rpc/crm_control_sales_summary_v1',{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer test'},body:'{"p_month":"2026-11"}'});
 assert.equal(f.calls.length,1);assert.equal(f.calls[0].headers.authorization,'Bearer test');assert.equal(f.calls[0].data.p_month,'2026-11');assert.equal(f.calls[0].disableRedirects,true);
 assert.equal(result.status,200);assert.equal((await result.json()).month,'2026-11');assert.equal(f.fallback.length,0);
});
test('AIR3 read routing leaves browser, auth, paid AI and mutations unchanged',async()=>{
 const f=httpBoot(async()=>{throw Error('unexpected')});
 for(const path of ['/auth/v1/token','/functions/v1/crm-ai360-dialog-v4','/rest/v1/tasks','/rest/v1/rpc/crm_route_day_v1'])await f.window.fetch('https://baqchjtvtmcfzwjjluhs.supabase.co'+path,{method:'POST',headers:{'content-type':'application/json'},body:'{}'});
 assert.equal(f.calls.length,0);assert.equal(f.fallback.length,4);
 const browser=httpBoot(()=>{},false);assert.equal(browser.window.RESANTA_AIR3_CONTROL_HTTP_V1,undefined);
});
test('stopped AIR3 control reads never dispatch or accept a delayed result',async()=>{
 let release;const f=httpBoot(()=>new Promise(r=>{release=r}));const c=new AbortController();c.abort(new Error('stopped'));
 const url='https://baqchjtvtmcfzwjjluhs.supabase.co/rest/v1/rpc/triovist_get_dashboard';
 const options={method:'POST',headers:{'content-type':'application/json'},body:'{}'};
 await assert.rejects(f.window.fetch(url,{...options,signal:c.signal}),/stopped/);assert.equal(f.calls.length,0);
 const active=new AbortController(),pending=f.window.fetch(url,{...options,signal:active.signal});await Promise.resolve();active.abort(new Error('stopped'));
 await assert.rejects(pending,/stopped/);release({status:200,data:{stale:true}});await Promise.resolve();assert.equal(f.calls.length,1);assert.equal(f.fallback.length,0);
});
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
