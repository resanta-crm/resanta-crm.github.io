import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync('assets/66-performance-root-v23657.js','utf8');
const index=fs.readFileSync('index.html','utf8');
const release=JSON.parse(fs.readFileSync('data/app-version.json','utf8')).version.replace(/^v/,'');
const declarations=source.slice(source.indexOf('const FRONTEND_VERSION='),source.indexOf('function activePage()'));
const check=source.slice(source.indexOf('let lastFrontendVersionCheck='),source.indexOf('function boot(){'));
const actualScript=index.match(/src="([^"\n]*66-performance-root[^"\n]*)"/)[1].replaceAll('&amp;','&');
function fixture({remote=release,script=actualScript,store=new Map(),ok=true,failure=false}={}){
 const timers=[],calls=[],events={};let reloads=0;
 const ctx={URL,Map,Date,APP_VERSION:'2026-11-13-unrelated-rollout-label',
  document:{currentScript:{src:new URL(script,'https://resanta-crm.by/').href},hidden:false,getElementById:()=>null,addEventListener:(name,fn)=>events[name]=fn},
  location:{href:'https://resanta-crm.by/',reload(){reloads++;}},
  sessionStorage:{getItem:key=>store.get(key)||null,setItem:(key,val)=>store.set(key,val),removeItem:key=>store.delete(key)},
  fetch:async(url,options)=>{calls.push({url,options});if(failure)throw Error('offline');return {ok,json:async()=>({version:remote})};},
  setTimeout:(fn,ms)=>{timers.push({fn,ms});},addEventListener:(name,fn)=>events[name]=fn,console:{warn(){}}};
 ctx.window=ctx;vm.runInNewContext(declarations+check,ctx);
 return {ctx,timers,calls,store,events,reloads:()=>reloads};
}
test('canonical frontend release matches the deployment marker rather than the asset cache token',async()=>{
 assert.equal(source.match(/const FRONTEND_VERSION='([^']+)'/)[1],release);
 const h=fixture({store:new Map([['crm_frontend_reload_target_v236119',release]])});
 assert.notEqual(new URL(actualScript,'https://resanta-crm.by/').searchParams.get('v'),release);
 await h.ctx.crmCheckFrontendVersionV236103(true);
 assert.equal(h.calls.length,1);assert.equal(h.calls[0].options.cache,'no-store');assert.equal(h.timers.length,0);assert.equal(h.reloads(),0);
 assert.equal(h.store.has('crm_frontend_reload_target_v236119'),false);
});
test('a genuine new canonical release retains the existing single-reload guard',async()=>{
 const remote='23.7.13',store=new Map(),first=fixture({remote,store});
 await first.ctx.crmCheckFrontendVersionV236103(true);
 assert.equal(first.timers.length,1);assert.equal(first.timers[0].ms,250);first.timers[0].fn();assert.equal(first.reloads(),1);
 assert.equal(store.get('crm_frontend_reload_target_v236119'),remote);
 const reloaded=fixture({remote,store});await reloaded.ctx.crmCheckFrontendVersionV236103(true);
 assert.equal(reloaded.timers.length,0);assert.equal(reloaded.reloads(),0);
});
test('changing a date-shaped cache token cannot reload an otherwise current CRM',async()=>{
 for(const token of ['20261106-manager-feedback','20261117-air3-startup-fixed','99']){
  const h=fixture({script:'./assets/66-performance-root-v23657.js?v='+token});
  await h.ctx.crmCheckFrontendVersionV236103(true);assert.equal(h.timers.length,0);assert.equal(h.reloads(),0);
 }
});
test('an unavailable or empty version source never interrupts startup',async()=>{
 for(const options of [{failure:true},{ok:false},{remote:''}]){
  const h=fixture(options);await h.ctx.crmCheckFrontendVersionV236103(true);assert.equal(h.timers.length,0);assert.equal(h.reloads(),0);
 }
});
