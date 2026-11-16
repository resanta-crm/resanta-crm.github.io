import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync('assets/01-crm-core.js','utf8');
const index=fs.readFileSync('index.html','utf8');
const gate=index.match(/<script id="crm-native-bootstrap-ready-gate-v1">([\s\S]*?)<\/script>/)?.[1];
assert.ok(gate,'early native bootstrap gate');
const start=source.slice(source.indexOf('async function startApp()'),source.indexOf('// Кнопка "Повторить загрузку"'));
const showError=source.slice(source.indexOf('function showLoadError('),source.indexOf('// Полный сброс на стороне устройства'));
const retry=source.slice(source.indexOf('async function retryLoad('),source.indexOf('function crmInviteScopeChangedGomelV1('));
const flush=async()=>{for(let i=0;i<20;i++)await Promise.resolve();};

function fixture({native=true,fast,ready=false}={}){
  const calls=[],nodes=new Map(),timers=new Map();let nextTimer=0;
  const getNode=id=>{if(!nodes.has(id))nodes.set(id,{style:{},value:'',textContent:''});return nodes.get(id);};
  const ctx={console:{error(){},warn(){}},String,Promise,Error,currentUser:{id:'owner'},currentProfile:{id:'owner',name:'Owner',role:'manager'},TODAY:'2026-11-16',
    document:{body:{classList:{remove(){}}},getElementById:getNode},clearRestoredMainSearches(){},addLocalDays:()=> '2026-11-23',
    setTimeout:(fn,ms)=>{const id=++nextTimer;timers.set(id,{fn,ms});return id;},clearTimeout:id=>timers.delete(id),
    loadData:async()=>{calls.push({kind:'legacy'});},buildDashboard:()=>calls.push({kind:'dashboard'}),
    crmWarmDashboardV22733:()=>calls.push({kind:'warm'})};
  ctx.window=ctx;
  if(native)ctx.Capacitor={isNativePlatform:()=>true,getPlatform:()=> 'android'};
  if(fast)ctx.crmFastBootstrapV22733=fast;
  if(ready)ctx.RESANTA_CRM_ULTRA_FAST_FINAL={fastShell:true};
  vm.runInNewContext([gate,start,showError,retry].join('\n'),ctx);
  const earlyBootstrap=ctx.crmFastBootstrapV22733;
  const expire=async ms=>{
    const found=[...timers].find(([,timer])=>timer.ms===ms);assert.ok(found,'active timer '+ms);
    timers.delete(found[0]);found[1].fn();await flush();
  };
  const install=()=>{ctx.crmFastBootstrapV22733=async(...args)=>calls.push({kind:'fast',args});ctx.RESANTA_CRM_ULTRA_FAST_FINAL={fastShell:true};};
  return {ctx,calls,nodes,timers,expire,install,earlyBootstrap};
}

test('inline gate precedes original deferred core and leaves its loader branches intact',()=>{
  assert.ok(index.indexOf('<script id="crm-native-bootstrap-ready-gate-v1">')<index.indexOf('<script defer src="./assets/01-crm-core.js'));
  assert.match(start,/if\(typeof window\.crmFastBootstrapV22733==='function'\)await window\.crmFastBootstrapV22733\(\);\s*else await loadData\(\);/);
  assert.match(retry,/if\(typeof window\.crmFastBootstrapV22733==='function'\)await window\.crmFastBootstrapV22733\(true\);\s*else await loadData\(\);/);
  assert.doesNotMatch(gate,/\.auth\.|onAuthStateChange|createElement|loadData/);
});

test('native start waits for deferred 05 and invokes only its bounded bootstrap',async()=>{
  const h=fixture(),loading=h.ctx.startApp();await flush();
  assert.equal(h.calls.length,0);assert.equal(h.nodes.get('loading-overlay').style.display,'flex');
  h.install();await h.expire(50);await loading;
  assert.deepEqual(h.calls.map(call=>call.kind),['fast','dashboard','warm']);
  assert.deepEqual(h.calls[0].args,[]);
  assert.equal(h.nodes.get('loading-overlay').style.display,'none');
  assert.equal([...h.timers.values()].some(timer=>timer.ms===50||timer.ms===10000),false);
});

test('native retry also waits for complete 05 initialization and preserves force flag',async()=>{
  const h=fixture({fast:async()=>{h.calls.push({kind:'premature-fast'});}}),loading=h.ctx.retryLoad();await flush();
  assert.equal(h.calls.length,0);
  h.install();await h.expire(50);await loading;
  assert.equal(h.calls[0].kind,'fast');assert.deepEqual(h.calls[0].args,[true]);
  assert.equal(h.calls.some(call=>call.kind==='legacy'||call.kind==='premature-fast'),false);
});

test('missing native data module ends with a visible retry error and never starts legacy loading',async()=>{
  const h=fixture(),loading=h.ctx.startApp();await flush();await h.expire(10000);await loading;
  assert.equal(h.calls.length,0);
  assert.equal(h.nodes.get('loading-spinner').style.display,'none');
  assert.equal(h.nodes.get('loading-error').style.display,'block');
  assert.match(h.nodes.get('loading-error-detail').textContent,/10 секунд.*Повторить загрузку/);
  assert.equal([...h.timers.values()].some(timer=>timer.ms===50||timer.ms===10000),false);
  h.install();await flush();assert.equal(h.calls.length,0);
});

test('session changes during the module wait cannot launch the old startup',async()=>{
  for(const nextActor of [null,{id:'manager'}]){
    const h=fixture(),loading=h.earlyBootstrap();await flush();
    h.ctx.currentUser=nextActor;h.ctx.currentProfile=nextActor;h.install();
    const rejected=assert.rejects(loading,/Сессия CRM изменилась/);
    await h.expire(50);await rejected;assert.equal(h.calls.length,0);assert.equal(h.timers.size,0);
  }
});

test('desktop retains immediate fast-or-legacy startup without waiting for module metadata',async()=>{
  const legacy=fixture({native:false});await legacy.ctx.startApp();
  assert.deepEqual(legacy.calls.map(call=>call.kind),['legacy','dashboard','warm']);
  const fast=fixture({native:false});fast.ctx.crmFastBootstrapV22733=async(...args)=>fast.calls.push({kind:'fast',args});
  await fast.ctx.retryLoad();assert.deepEqual(fast.calls[0],{kind:'fast',args:[true]});
  assert.equal([...legacy.timers.values(),...fast.timers.values()].some(timer=>timer.ms===50||timer.ms===10000),false);
});
