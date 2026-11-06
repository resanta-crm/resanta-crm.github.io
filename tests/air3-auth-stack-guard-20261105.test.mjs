import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const core=readFileSync('assets/01-crm-core.js','utf8');
const index=readFileSync('index.html','utf8');
const source=core.slice(
 core.indexOf('function crmHandleAuthEventV20261105('),
 core.indexOf('// ===== ABC-АНАЛИЗ',core.indexOf('function crmHandleAuthEventV20261105('))
);
function tick(){return new Promise(done=>setTimeout(done,0))}
function boot(androidNative,initial,isRecovery=false){
 const trace=[],listeners=[];
 const window={Capacitor:{
  isNativePlatform:()=>androidNative,
  getPlatform:()=>androidNative?'android':'web'
 }};
 const navigator={userAgent:androidNative?'Mozilla/5.0 Android':'Mozilla/5.0 Mac'};
 const db={auth:{onAuthStateChange:cb=>{trace.push('listen');listeners.push(cb);}}};
 const context={db,window,navigator,console:{info(){},warn(){},log(){}},
  initAuth:()=>{trace.push('init');return initial;},
  withTimeout:p=>p,
  crmIsRecoveryUrlV1:()=>isRecovery,
  setTimeout,
  Date,crmExplicitSignOutV236258:false,
  crmFreshSessionUntilV236258:0,crmFreshSessionV236258:null,
  crmShowSignedOutUiV236258(){},crmRecoverFreshSessionV236258(){},
  loadProfileAndStart(){},currentUser:null,currentProfile:null};
 vm.runInNewContext(source,context);
 return {trace,listeners};
}
test('Android waits for initial session before attaching Supabase auth listener',async()=>{
 let release;const pending=new Promise(resolve=>{release=resolve});
 const app=boot(true,pending);
 assert.deepEqual(app.trace,['init']);
 assert.equal(app.listeners.length,0);
 release();
 await tick();
 assert.deepEqual(app.trace,['init','listen']);
 assert.equal(app.listeners.length,1);
});
test('Android auth listener registers even if initial session recovery throws',async()=>{
 const app=boot(true,Promise.reject(new Error('session recovery failed')));
 await tick();
 assert.deepEqual(app.trace,['init','listen']);
 assert.equal(app.listeners.length,1);
});
test('Android password recovery keeps listener before init to catch recovery event',()=>{
 const app=boot(true,Promise.resolve(),true);
 assert.deepEqual(app.trace,['listen','init']);
 assert.equal(app.listeners.length,1);
});
test('Mac and non-Android clients preserve their old authentication order',()=>{
 const app=boot(false,Promise.resolve());
 assert.deepEqual(app.trace,['listen','init']);
 assert.equal(app.listeners.length,1);
});
test('No async Supabase API calls are awaited in direct auth callbacks',()=>{
 assert.ok(!core.includes('db.auth.onAuthStateChange(async'));
 assert.match(source,/db\.auth\.onAuthStateChange\(crmHandleAuthEventV20261105\)/);
 assert.match(source,/setTimeout\(async\(\)=>\{/,'session recovery deferred outside listener');
 assert.match(core,/if\(crmExplicitSignOutV236258\|\|Date\.now\(\)>crmFreshSessionUntilV236258\)return null/);
});
test('Core script refreshes cache, Supabase library remains unchanged; no APK',()=>{
 assert.match(index,/<script defer src="https:\/\/cdn\.jsdelivr\.net\/npm\/@supabase\/supabase-js@2"><\/script>/);
 assert.ok(index.includes('./assets/01-crm-core.js?v=20261106-gps360-geoonce1&fix=manager-feedback-gps360-safe1'));
 assert.ok(index.includes('<link rel="preload" href="./assets/01-crm-core.js?v=20261106-gps360-geoonce1&fix=manager-feedback-gps360-safe1" as="script">'));
 assert.ok(!index.includes('<script defer src="./assets/01-crm-core.js?v=23.6.339-client360-1"></script>'));
});
