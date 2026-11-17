import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const all=fs.readFileSync('assets/05-performance-core.js','utf8'),source=all.slice(0,all.indexOf('/* ===== ORIGINAL INLINE SCRIPT 56 ===== */'));
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return {promise,resolve,reject};};
const flush=async()=>{for(let i=0;i<30;i++)await Promise.resolve();};
function fixture(options={}){
 const timers=[],calls=[],writes=[],listeners={},cache=new Map();let timerId=0;
 const ctx={console:{debug(){},warn(){}},Map,Set,Promise,Date,Math,Number,String,Array,Object,JSON,Error,AbortController,SUPABASE_KEY:'public-test',currentUser:{id:'owner'},currentProfile:{id:'owner',name:'Owner',role:'boss'},performance:{now:()=>1},clientIsArchived:c=>!!c.archived,document:{getElementById:()=>null,addEventListener(){}},addEventListener:(name,fn)=>listeners[name]=fn,setTimeout:(fn,ms)=>{const t={id:++timerId,fn,ms,active:true};timers.push(t);return t.id;},clearTimeout:id=>{const t=timers.find(x=>x.id===id);if(t)t.active=false;},setInterval(){},clearInterval(){},loadData:async()=>true,crmLocalSignOutV236258:async()=>{},crmShowSignedOutUiV236258(){}};
 for(const m of source.matchAll(/\b(all[A-Z]\w*)\s*=/g))ctx[m[1]]=[];
 ctx.window=ctx;
 const value=()=>({clients:[{id:ctx.currentUser.id+'-client'}],users:[{id:ctx.currentUser.id}]});
 function request(kind,name){const call={kind,name,signal:null};calls.push(call);const req={select(){return req},order(){return req},limit(){return req},abortSignal(signal){call.signal=signal;return req},then(resolve,reject){const next=kind==='rpc'?options.rpc?.(name,call):options.from?.(name,call);return Promise.resolve(next===undefined?{data:kind==='rpc'?(name==='crm_bootstrap_core_v236316'?value():[]):[]}:next).then(resolve,reject)}};return req;}
 ctx.db={rpc:name=>request('rpc',name),from:name=>request('table',name),auth:{getSession:()=>options.auth?options.auth():Promise.resolve({data:{session:{access_token:'session-'+ctx.currentUser.id,user:{id:ctx.currentUser.id}}}})}};
 ctx.indexedDB={open(){const req={};const ready=()=>{req.result={transaction(){const tx={objectStore:()=>({get:key=>{const r={};queueMicrotask(()=>{r.result=cache.get(key);r.onsuccess?.()});return r;},put:(data,key)=>{writes.push({data,key});cache.set(key,data);queueMicrotask(()=>tx.oncomplete?.());}})};return tx;}};req.onsuccess?.();};if(options.cacheGate)options.cacheGate.promise.then(ready);else queueMicrotask(ready);return req;}};
 if(options.native!==false){const plugin={capabilities:()=>options.caps?options.caps():Promise.resolve({bootstrapCore:true}),bootstrapCore:args=>{calls.push({kind:'native',args});return options.nativeCall?options.nativeCall(args):Promise.resolve({result:value()});},cancel:args=>{calls.push({kind:'cancel',args});return Promise.resolve();}};ctx.Capacitor={isNativePlatform:()=>true,getPlatform:()=> 'android',Plugins:{Air3Voice:plugin}};}
 vm.runInNewContext(source,ctx);
 const expire=async ms=>{const t=timers.find(x=>x.active&&x.ms===ms);assert.ok(t,'active deadline '+ms);t.active=false;t.fn();await flush();};
 const switchUser=async()=>{await ctx.crmLocalSignOutV236258();ctx.currentUser={id:'manager'};ctx.currentProfile={id:'manager',name:'Manager',role:'manager'};};
 return {ctx,calls,writes,cache,listeners,timers,expire,switchUser};
}
test('native capability uses one bootstrap without voice opt-in or WebView fallback',async()=>{
 const h=fixture();await Promise.all([h.ctx.crmFastBootstrapV22733(),h.ctx.crmFastBootstrapV22733()]);assert.equal(h.calls.filter(x=>x.kind==='native').length,1);assert.equal(h.calls.filter(x=>x.kind==='rpc'||x.kind==='table').length,0);assert.equal(h.calls.find(x=>x.kind==='native').args.apiKey,'public-test');assert.equal(h.ctx.allClients[0].id,'owner-client');assert.equal(h.ctx.__resantaAI360AndroidDirectorOptIn,undefined);
});
test('explicit paged native capability gets one 90-second operation and applies the complete snapshot atomically',async()=>{
 const response=deferred(),h=fixture({caps:async()=>({bootstrapCore:true,bootstrapCorePaged:true}),nativeCall:()=>response.promise});
 const first=h.ctx.crmFastBootstrapV22733(),same=h.ctx.crmFastBootstrapV22733();await flush();
 assert.equal(h.calls.filter(x=>x.kind==='native').length,1);assert.equal(h.ctx.allClients.length,0);
 assert.equal(h.timers.some(t=>t.active&&t.ms===90000),true);assert.equal(h.timers.some(t=>t.active&&t.ms===25000),false);
 const call=h.calls.find(x=>x.kind==='native');assert.deepEqual(Object.keys(call.args).sort(),['accessToken','apiKey','requestId']);
 assert.equal(call.args.accessToken,'session-owner');assert.equal(call.args.apiKey,'public-test');
 const clients=Array.from({length:1103},(_,i)=>({id:'client-'+i}));response.resolve({result:{clients,users:[{id:'owner'}]}});
 await Promise.all([first,same]);assert.equal(h.ctx.allClients.length,1103);assert.equal(h.ctx.allClients.at(-1).id,'client-1102');
 assert.equal(h.calls.filter(x=>x.kind==='rpc'||x.kind==='table').length,0);assert.equal(h.timers.some(t=>t.active&&t.ms===90000),false);
});
test('paged native deadline cancels once, never falls back and ignores a late snapshot',async()=>{
 const response=deferred(),h=fixture({caps:async()=>({bootstrapCore:true,bootstrapCorePaged:true}),nativeCall:()=>response.promise});
 const loading=h.ctx.crmFastBootstrapV22733();await flush();await h.expire(90000);
 await assert.rejects(loading,e=>e.code==='bootstrap_native_timeout');assert.equal(h.calls.filter(x=>x.kind==='cancel').length,1);
 assert.equal(h.calls.filter(x=>x.kind==='rpc'||x.kind==='table').length,0);assert.equal(h.ctx.allClients.length,0);
 response.resolve({result:{clients:[{id:'late-paged-client'}],users:[{id:'owner'}]}});await flush();
 assert.equal(h.ctx.allClients.length,0);assert.equal(h.calls.filter(x=>x.kind==='native').length,1);
});
test('old APK proxy with an unimplemented capability safely uses bounded WebView RPC',async()=>{
 const h=fixture({caps:async()=>{throw Error('UNIMPLEMENTED')}});await h.ctx.crmFastBootstrapV22733();assert.equal(h.calls.filter(x=>x.kind==='native').length,0);const rpc=h.calls.find(x=>x.kind==='rpc');assert.ok(rpc.signal);assert.equal(rpc.signal.aborted,false);
});
test('native auth and request deadlines stop and require an explicit retry',async()=>{
 const auth=deferred(),h=fixture({auth:()=>auth.promise});const first=h.ctx.crmFastBootstrapV22733();await flush();await h.expire(5000);await assert.rejects(first,e=>e.code==='bootstrap_auth_timeout');assert.equal(h.calls.filter(x=>x.kind==='native').length,0);auth.resolve({data:{session:{access_token:'late',user:{id:'owner'}}}});await flush();assert.equal(h.calls.filter(x=>x.kind==='native').length,0);
 const pending=deferred(),n=fixture({nativeCall:()=>pending.promise});const load=n.ctx.crmFastBootstrapV22733();await flush();await n.expire(25000);await assert.rejects(load,e=>e.code==='bootstrap_native_timeout');assert.equal(n.calls.filter(x=>x.kind==='cancel').length,1);assert.equal(n.calls.filter(x=>x.kind==='rpc'||x.kind==='table').length,0);pending.resolve({result:{clients:[{id:'late'}],users:[]}});await flush();assert.equal(n.ctx.allClients.length,0);
});
test('native failure or malformed data never falls back or overwrites a complete snapshot',async()=>{
 let mode='ok';const h=fixture({nativeCall:async()=>{if(mode==='401')throw Error('core_http_401');if(mode==='bad')return {result:{clients:[{id:'partial'}]}};return {result:{clients:[{id:'complete'}],users:[]}};}});await h.ctx.crmFastBootstrapV22733();mode='bad';await assert.rejects(h.ctx.crmFastBootstrapV22733(true),/неполные основные данные/);assert.equal(h.ctx.allClients[0].id,'complete');mode='401';await assert.rejects(h.ctx.crmFastBootstrapV22733(true),/Выполните вход снова/);assert.equal(h.calls.filter(x=>x.kind==='rpc'||x.kind==='table').length,0);
});
test('WebView bootstrap and table fallback have abortable deadlines and reject partial results',async()=>{
 const rpc=deferred(),h=fixture({native:false,rpc:()=>rpc.promise});const loading=h.ctx.crmFastBootstrapV22733();await flush();await h.expire(15000);assert.equal(await loading,true);assert.equal(h.calls.find(x=>x.kind==='rpc').signal.aborted,true);assert.equal(h.calls.filter(x=>x.kind==='table').length,2);
 const users=deferred(),n=fixture({native:false,rpc:()=>({error:{message:'rpc unavailable'},status:500}),from:table=>table==='users'?users.promise:{data:[{id:'partial-client'}]}});const failed=n.ctx.crmFastBootstrapV22733();await flush();await n.expire(25000);await assert.rejects(failed,e=>e.code==='bootstrap_fallback_timeout');assert.equal(n.ctx.allClients.length,0);assert.ok(n.calls.filter(x=>x.kind==='table').every(x=>x.signal.aborted));
 const denied=fixture({native:false,rpc:()=>({error:{message:'unauthorized'},status:401})});await assert.rejects(denied.ctx.crmFastBootstrapV22733(),/Выполните вход снова/);assert.equal(denied.calls.filter(x=>x.kind==='table').length,0);
});
test('logout clears readiness; a late owner bootstrap cannot replace the manager snapshot',async()=>{
 const owner=deferred(),h=fixture({nativeCall:args=>args.accessToken==='session-owner'?owner.promise:Promise.resolve({result:{clients:[{id:'manager-client'}],users:[{id:'manager'}]}})});const old=h.ctx.crmFastBootstrapV22733();await flush();await h.switchUser();const manager=h.ctx.crmFastBootstrapV22733();await assert.rejects(old,e=>e.code==='bootstrap_session_changed');await manager;owner.resolve({result:{clients:[{id:'owner-secret'}],users:[{id:'owner'}]}});await flush();assert.equal(h.ctx.allClients[0].id,'manager-client');assert.equal(h.calls.filter(x=>x.kind==='cancel').length,1);assert.equal(h.calls.filter(x=>x.kind==='native').length,2);
});
test('late owner resource cannot apply or be persisted under the manager cache key',async()=>{
 const resource=deferred(),h=fixture({rpc:name=>name==='crm_core_tasks_v236341'?resource.promise:undefined});await h.ctx.crmFastBootstrapV22733();const old=h.ctx.crmCoreGetV22733('tasks',true);await flush();await h.switchUser();await h.ctx.crmFastBootstrapV22733();resource.resolve({data:[{id:'owner-secret-task',client_id:null}]});await assert.rejects(old,/bootstrap_session_changed/);await flush();assert.equal(h.ctx.allTasks.length,0);assert.equal(h.writes.length,0);
});
test('pagehide detects actor changes before reading or saving an old snapshot',async()=>{
 const h=fixture();await h.ctx.crmFastBootstrapV22733();h.ctx.allTasks=[{id:'owner-secret-task'}];h.ctx.currentUser={id:'manager'};h.ctx.currentProfile={id:'manager',role:'manager'};h.listeners.pagehide();await flush();assert.equal(h.writes.length,0);assert.equal(h.ctx.allTasks.length,0);assert.equal(h.ctx.allClients.length,0);
});
test('capability timeout stays on the bounded web path and late metadata dispatches no native load',async()=>{
 const caps=deferred(),h=fixture({caps:()=>caps.promise});const loading=h.ctx.crmFastBootstrapV22733();await flush();await h.expire(2000);await loading;caps.resolve({bootstrapCore:true});await flush();assert.equal(h.calls.filter(x=>x.kind==='native').length,0);assert.equal(h.calls.filter(x=>x.kind==='rpc').length,1);
});
test('an owner cache write waiting for IndexedDB cannot enter the manager cache after logout',async()=>{
 const gate=deferred(),h=fixture({cacheGate:gate,rpc:name=>name==='crm_core_tasks_v236341'?{data:[{id:'owner-secret-task',client_id:null}]}:undefined});await h.ctx.crmFastBootstrapV22733();await h.ctx.crmCoreGetV22733('tasks',true);await h.switchUser();await h.ctx.crmFastBootstrapV22733();gate.resolve();await flush();assert.equal(h.writes.length,0);assert.equal(h.ctx.allTasks.length,0);
});
test('one actor in distinct Cyrillic regions cannot collide in persistent cache keys',async()=>{
 const h=fixture();h.ctx.currentProfile.region='Витебск';await h.ctx.crmFastBootstrapV22733();h.ctx.allTasks=[{id:'vitebsk-only'}];h.listeners.pagehide();await flush();
 const first=h.writes.find(x=>x.key.endsWith('|tasks'));assert.ok(first);
 h.ctx.currentProfile.region='Могилев';await h.ctx.crmFastBootstrapV22733();assert.equal(h.ctx.allTasks.length,0);h.ctx.allTasks=[{id:'mogilev-only'}];h.listeners.pagehide();await flush();
 const second=h.writes.filter(x=>x.key.endsWith('|tasks')).at(-1);assert.notEqual(first.key,second.key);assert.match(first.key,/%D0/);assert.equal(first.data.rows[0].id,'vitebsk-only');assert.equal(second.data.rows[0].id,'mogilev-only');
});

test('page navigation aborts only its pending native bootstrap and ignores the abandoned snapshot',async()=>{
 const response=deferred(),h=fixture({nativeCall:()=>response.promise});
 const loading=h.ctx.crmFastBootstrapV22733();await flush();
 const request=h.calls.find(x=>x.kind==='native');assert.ok(request);
 const rejected=assert.rejects(loading,e=>e.code==='bootstrap_page_closed');h.listeners.pagehide();await rejected;
 const cancellations=h.calls.filter(x=>x.kind==='cancel');assert.equal(cancellations.length,1);assert.equal(cancellations[0].args.requestId,request.args.requestId);
 assert.equal(h.calls.filter(x=>x.kind==='native').length,1);assert.equal(h.calls.filter(x=>x.kind==='rpc'||x.kind==='table').length,0);
 response.resolve({result:{clients:[{id:'abandoned-owner-client'}],users:[{id:'owner'}]}});await flush();assert.equal(h.ctx.allClients.length,0);
 assert.equal(h.timers.some(t=>t.active&&t.ms===25000),false);
});
test('pagehide does not cancel a finished native bootstrap or change desktop loading',async()=>{
 const ready=fixture();await ready.ctx.crmFastBootstrapV22733();ready.listeners.pagehide();await flush();assert.equal(ready.calls.filter(x=>x.kind==='cancel').length,0);assert.equal(ready.ctx.allClients[0].id,'owner-client');
 const response=deferred(),desktop=fixture({native:false,rpc:()=>response.promise});
 const loading=desktop.ctx.crmFastBootstrapV22733();await flush();desktop.listeners.pagehide();await flush();assert.equal(desktop.calls[0].signal.aborted,false);
 response.resolve({data:{clients:[{id:'desktop-client'}],users:[{id:'owner'}]}});await loading;assert.equal(desktop.ctx.allClients[0].id,'desktop-client');
});
test('an abandoned owner read cannot overwrite a new actor after pagehide and local logout',async()=>{
 const owner=deferred(),h=fixture({nativeCall:args=>args.accessToken==='session-owner'?owner.promise:Promise.resolve({result:{clients:[{id:'manager-client'}],users:[{id:'manager'}]}})});
 const old=h.ctx.crmFastBootstrapV22733();await flush();const rejected=assert.rejects(old,e=>e.code==='bootstrap_page_closed');h.listeners.pagehide();await rejected;
 await h.switchUser();await h.ctx.crmFastBootstrapV22733();owner.resolve({result:{clients:[{id:'old-owner-secret'}],users:[{id:'owner'}]}});await flush();
 assert.equal(h.ctx.allClients[0].id,'manager-client');assert.equal(h.calls.filter(x=>x.kind==='cancel').length,1);
});
test('native busy rejection remains an explicit retry with no automatic read or paid-voice replay',async()=>{
 const h=fixture({nativeCall:async()=>{throw Error('core_transport_busy')}});
 await assert.rejects(h.ctx.crmFastBootstrapV22733(),e=>e.code==='core_transport_busy');await flush();
 assert.equal(h.calls.filter(x=>x.kind==='native').length,1);assert.equal(h.calls.filter(x=>x.kind==='rpc'||x.kind==='table'||x.kind==='cancel').length,0);
});
