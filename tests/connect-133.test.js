'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const get=p=>fs.readFileSync(path.join(root,p),'utf8');
const html=get('index.html'),chat=get('assets/151-resanta-connect-v1.js');
const video=get('assets/154-resanta-connect-video-v1.js'),css=get('assets/154-resanta-connect-video-v1.css');
let passed=0,failed=0;
async function test(name,fn){try{await fn();passed++;console.log('PASS',name);}catch(e){failed++;console.error('FAIL',name,e?.stack||e);}}
class FakeNode{
 constructor(tag,store){this.tag=tag;this.store=store;this.children=[];this.hidden=false;this.disabled=false;
  this.dataset={};this.textContent='';this.className='';this.events={};
  this.classList={toggle:()=>{},add:()=>{},remove:()=>{}};}
 set id(v){this._id=v;this.store.set(v,this);}
 get id(){return this._id;}
 set innerHTML(s){
  this._html=s;
  for(const m of String(s).matchAll(/id="([^"]+)"/g)){
   const child=new FakeNode('button',this.store);child.id=m[1];
  }
 }
 get innerHTML(){return this._html;}
 append(...xs){this.children.push(...xs);}
 appendChild(x){this.append(x);}
 replaceChildren(...xs){this.children=xs;}
 querySelector(q){if(q==='.c131-tracks')return this.children[0]||null;return null;}
 setAttribute(name,value){this[name]=String(value);}
 addEventListener(kind,fn){this.events[kind]=fn;}
 click(){this.events.click?.();}
}
function fakeCrm(){
 const store=new Map(),app=new FakeNode('main',store),page=new FakeNode('section',store),head=new FakeNode('header',store);
 app.id='app';app.dataset.activePage='connect';page.id='page-connect';page.querySelector=q=>q==='.c126-head'?head:null;
 const document={
  getElementById:id=>store.get(id)||null,
  createElement:tag=>new FakeNode(tag,store),
 };
 let nav='connect',signed=true,connected=0,disconnected=0,shared=false;
 class MockRoom{
  constructor(){this.remoteParticipants=new Map();
   this.localParticipant={isMicrophoneEnabled:false,isCameraEnabled:false,isScreenShareEnabled:false,
    setMicrophoneEnabled:async flag=>{this.localParticipant.isMicrophoneEnabled=flag;},
    setCameraEnabled:async flag=>{this.localParticipant.isCameraEnabled=flag;},
    setScreenShareEnabled:async flag=>{this.localParticipant.isScreenShareEnabled=flag;shared=flag;},
   };
  }
  on(){}async connect(){connected++;}
  async disconnect(){disconnected++;}
  async startAudio(){}
 }
 let observer=null;
 class MutationObserver{constructor(fn){observer=fn;}observe(){}}
 const window={
  isSecureContext:true,
  LivekitClient:{Room:MockRoom,RoomEvent:{ParticipantConnected:'pc',ParticipantDisconnected:'pd',
   TrackSubscribed:'ts',TrackUnsubscribed:'tu',LocalTrackPublished:'lp',LocalTrackUnpublished:'lu',Disconnected:'dc'}}
 };
 vm.runInNewContext(video,{window,document,MutationObserver,
  setInterval:()=>777,clearInterval:()=>{},setTimeout,clearTimeout,console});
 window.crmConnectVideo131.init({
  actor:()=>signed?'employee-123':null,
  actorName:()=> 'Тестовый сотрудник',
  client:()=>({functions:{invoke:async()=>({data:{ok:true,url:'wss://demo.livekit.cloud',token:'mock'}})}}),
  isOpen:()=>nav==='connect',
  roomId:()=> 'chat-a',
  isSignedIn:id=>signed&&id==='employee-123',
  notify:()=>{},
 });
 return {store,window,setNav:v=>{nav=v;app.dataset.activePage=v;observer?.();},signOut:()=>{signed=false;observer?.();},
  state:()=>({connected,disconnected,shared}),flush:()=>new Promise(r=>setTimeout(r,15))};
}
(async()=>{
 await test('Native CRM entrypoint reuses one chat and cache-busts video',()=>{
  assert.match(html,/assets\/154-resanta-connect-video-v1\.js\?v=5/);
  assert.match(html,/assets\/154-resanta-connect-video-v1\.css\?v=2/);
  assert.match(chat,/isSignedIn:expectedId/);
  assert.doesNotMatch(video,/signInWithPassword|createClient\(/);
 });
 await test('Overlay and floating panel live under app, not hidden chat page',()=>{
  assert.match(video,/\$\('app'\)\.append\(overlay\)/);
  assert.match(video,/\$\('app'\)\.append\(minibar\)/);
  assert.match(css,/#app #c131-mini\[hidden\]/);
  assert.match(css,/#app \.c131-mini/);
 });
 await test('Joining, minimizing, navigating, presenting, restoring and logout are safe',async()=>{
  const t=fakeCrm(),get=id=>t.store.get(id);
  assert(get('c131-mini').hidden);
  get('c131-start').click();
  await t.flush();
  assert.equal(t.state().connected,1,'LiveKit connected exactly once');
  assert.equal(get('c131-overlay').hidden,false);
  get('c131-minimize').click();
  assert.equal(get('c131-overlay').hidden,true);
  assert.equal(get('c131-mini').hidden,false);
  t.setNav('sales');
  assert.equal(t.state().disconnected,0,'navigating CRM must not hang up');
  get('c131-mini-screen').click();
  await t.flush();
  assert.equal(t.state().shared,true,'presenter continues screen-sharing in other CRM section');
  assert.equal(t.state().disconnected,0,'screen-sharing must not hang up');
  get('c131-mini-restore').click();
  assert.equal(get('c131-overlay').hidden,false,'call can be restored');
  // Current page remains outside CONNECT. The old interval used to close it again.
  t.setNav('sales');
  await t.flush();
  assert.equal(get('c131-overlay').hidden,false,'manual restore must stay open in other CRM section');
  get('c131-screen').click();await t.flush();
  assert.equal(t.state().shared,false,'screen share must stop while call remains open');
  assert.equal(get('c131-mini-screen').textContent,'🖥 Показать экран','button reflects stopped share');
  assert.equal(t.state().disconnected,0);
  get('c131-minimize').click();
  t.signOut();
  await t.flush();
  assert.equal(t.state().disconnected,1,'logout must disconnect media');
  assert.equal(get('c131-mini').hidden,true,'logout must hide floating controls');
 });
 await test('Manual restore survives automatic navigation watchdog while screen stops safely',async()=>{
  const t=fakeCrm(),get=id=>t.store.get(id);
  get('c131-start').click();await t.flush();
  get('c131-screen').click();await t.flush();
  assert.equal(t.state().shared,true);
  get('c131-mini-screen').click();await t.flush();
  assert.equal(t.state().shared,false);
  assert.equal(get('c131-mini-screen').disabled,false);
  get('c131-mini-restore').click();
  assert.equal(get('c131-overlay').hidden,false);
  t.setNav('clients');await t.flush();
  assert.equal(get('c131-overlay').hidden,true,'navigation to new section may minimize once');
  get('c131-mini-restore').click();
  t.setNav('clients');await t.flush();
  assert.equal(get('c131-overlay').hidden,false,'manual restore persists on same page');
  get('c131-leave').click();await t.flush();
  assert.equal(t.state().disconnected,1);
 });
 await test('Presenting successfully automatically minimizes call while media stays connected',async()=>{
  const t=fakeCrm(),get=id=>t.store.get(id);
  get('c131-start').click();
  await t.flush();
  get('c131-screen').click();
  await t.flush();
  assert.equal(get('c131-overlay').hidden,true,'successful share should free up CRM workspace');
  assert.equal(get('c131-mini').hidden,false);
  assert.equal(t.state().shared,true);
  assert.equal(t.state().disconnected,0);
  get('c131-mini-leave').click();await t.flush();
  assert.equal(t.state().disconnected,1);
 });
 console.log('CONNECT #133 regression: '+passed+' passed, '+failed+' failed');
 if(failed)process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1;});
