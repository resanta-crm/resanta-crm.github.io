import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync('assets/00-native-auth-deadline-v1.js','utf8');
const endpoint='https://baqchjtvtmcfzwjjluhs.supabase.co/auth/v1/token?grant_type=password';
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
const flush=async()=>{for(let i=0;i<80;i++)await Promise.resolve();};
function fixture(options={}){
 const calls=[],timers=[];let timerId=0;
 const original=function(input,init){calls.push({input,init,receiver:this});return options.fetch?options.fetch(input,init):Promise.resolve(new Response('{}'));};
 const ctx={URL,Request,Response,AbortController,Promise,Error,Object,location:{href:'https://resanta-crm.by/'},fetch:original,
  setTimeout:(fn,ms)=>{const timer={id:++timerId,fn,ms,active:true};timers.push(timer);return timer.id;},
  clearTimeout:id=>{const timer=timers.find(t=>t.id===id);if(timer)timer.active=false;}};
 ctx.window=ctx;
 if(options.native!==false)ctx.Capacitor={isNativePlatform:()=>true,getPlatform:()=> 'android'};
 vm.runInNewContext(source,ctx);
 const expire=async()=>{const timer=timers.find(t=>t.active);assert.ok(timer,'active authentication deadline');assert.equal(timer.ms,15000);timer.active=false;timer.fn();await flush();};
 return {ctx,calls,timers,original,expire};
}

test('auth guard loads before SDK/core and never reads credentials, storage or auth APIs',()=>{
 const index=fs.readFileSync('index.html','utf8'),asset=index.indexOf('<script defer src="./assets/00-native-auth-deadline-v1.js?');
 assert.ok(asset>=0&&asset<index.indexOf('<script defer src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2'));
 assert.ok(asset<index.indexOf('<script defer src="./assets/01-crm-core.js?'));
 assert.doesNotMatch(source,/localStorage|sessionStorage|\.auth\.|access_token|refresh_token|Authorization|setInterval/);
 const h=fixture();assert.equal(h.calls.length,0);assert.equal(h.timers.length,0);
});

test('desktop fetch stays identical; native non-auth and lookalike origins pass through unchanged',async()=>{
 const desktop=fixture({native:false});assert.equal(desktop.ctx.fetch,desktop.original);
 const h=fixture(),options={method:'POST',body:'unchanged'};
 for(const url of ['https://resanta-crm.by/auth/v1/token','https://baqchjtvtmcfzwjjluhs.supabase.co/rest/v1/users','https://baqchjtvtmcfzwjjluhs.supabase.co/functions/v1/crm-voice-yandex-tts-v1','https://baqchjtvtmcfzwjjluhs.supabase.co.evil.invalid/auth/v1/token']){
  await h.ctx.fetch(url,options);assert.equal(h.calls.at(-1).input,url);assert.equal(h.calls.at(-1).init,options);
 }
 assert.equal(h.timers.length,0);
});

test('completed auth body returns the original response and preserves request options and HTTP errors',async()=>{
 for(const status of [200,401,204]){
  const response=new Response(status===204?null:'{"original":true}',{status,headers:{'content-type':'application/json'}});
  Object.defineProperty(response,'url',{value:endpoint});Object.defineProperty(response,'type',{value:'cors'});
  const h=fixture({fetch:async()=>response}),options={method:'POST',headers:{'x-test':'unchanged'},body:'local-test-body'};
  const result=await h.ctx.fetch(endpoint,options);
  assert.equal(result,response);assert.equal(result.url,endpoint);assert.equal(result.type,'cors');assert.equal(result.status,status);
  assert.equal(result.bodyUsed,false);assert.equal(h.calls[0].init.method,options.method);assert.equal(h.calls[0].init.headers,options.headers);assert.equal(h.calls[0].init.body,options.body);
  assert.equal(Object.getPrototypeOf(h.calls[0].init),options);assert.equal(h.calls[0].init.signal.aborted,false);
  assert.equal(h.calls.length,1);assert.equal(h.timers.some(t=>t.active),false);
  if(status!==204)assert.deepEqual(await result.json(),{original:true});
 }
});

test('headers timeout really aborts transport and never delivers a late response to the SDK',async()=>{
 const pending=deferred();let clones=0;
 const response={clone(){clones++;return {arrayBuffer:async()=>new ArrayBuffer(0)};}};
 const h=fixture({fetch:()=>pending.promise}),loading=h.ctx.fetch(endpoint);
 const failed=assert.rejects(loading,e=>e.name==='TimeoutError'&&e.message==='auth_network_timeout');
 await h.expire();await failed;assert.equal(h.calls[0].init.signal.aborted,true);assert.equal(h.calls.length,1);
 pending.resolve(response);await flush();assert.equal(clones,0);assert.equal(h.calls.length,1);
});

test('body timeout cancels the clone reader after headers instead of leaving SDK json pending',async()=>{
 const pending=deferred();let cancelled=0,released=0;
 const reader={read:()=>pending.promise,cancel(){cancelled++;pending.resolve({done:true});return Promise.resolve();},releaseLock(){released++;}};
 const response={clone:()=>({body:{getReader:()=>reader}})},h=fixture({fetch:async()=>response});
 const loading=h.ctx.fetch(endpoint);await flush();
 const failed=assert.rejects(loading,e=>e.name==='TimeoutError');await h.expire();await failed;
 assert.equal(h.calls[0].init.signal.aborted,true);assert.equal(cancelled,1);assert.equal(released,1);assert.equal(h.calls.length,1);
});

test('Request.signal cancellation is preserved and aborts the real pending request',async()=>{
 const parent=new AbortController(),pending=deferred(),h=fixture({fetch:()=>pending.promise});
 const input=new Request(endpoint,{method:'POST',signal:parent.signal}),loading=h.ctx.fetch(input);
 const cause=new Error('user stopped authentication'),failed=assert.rejects(loading,e=>e===cause);
 parent.abort(cause);await failed;assert.equal(h.calls[0].input,input);assert.equal(h.calls[0].init.signal.aborted,true);
 assert.equal(h.timers.some(t=>t.active),false);pending.resolve(new Response('{}'));await flush();
});

test('init signal overrides Request.signal, while already cancelled requests dispatch nothing',async()=>{
 const first=new AbortController(),second=new AbortController(),pending=deferred(),h=fixture({fetch:()=>pending.promise});
 const input=new Request(endpoint,{signal:first.signal}),loading=h.ctx.fetch(input,{signal:second.signal});
 first.abort();await flush();assert.equal(h.calls[0].init.signal.aborted,false);
 const cause=new Error('current caller stopped'),failed=assert.rejects(loading,e=>e===cause);second.abort(cause);await failed;
 assert.equal(h.calls[0].init.signal.aborted,true);assert.equal(h.calls.length,1);pending.resolve(new Response('{}'));await flush();
 const stopped=new AbortController();stopped.abort(cause);const fresh=fixture();
 await assert.rejects(fresh.ctx.fetch(endpoint,{signal:stopped.signal}),e=>e===cause);assert.equal(fresh.calls.length,0);assert.equal(fresh.timers.some(t=>t.active),false);
});

test('guard installs once and does not create a second deadline or network request',async()=>{
 const h=fixture(),first=h.ctx.fetch;vm.runInNewContext(source,h.ctx);assert.equal(h.ctx.fetch,first);
 await h.ctx.fetch(endpoint);assert.equal(h.calls.length,1);assert.equal(h.timers.length,1);
});
