'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const get=p=>fs.readFileSync(path.join(root,p),'utf8');
const video=get('assets/154-resanta-connect-video-v1.js');
const chat=get('assets/151-resanta-connect-v1.js');
const push=get('assets/156-resanta-connect-android-push-v1.js');
const html=get('index.html');
const launcher=get('assets/157-resanta-ai360-android-staff-launch-v1.js');
let passed=0,failed=0;
async function check(name,task){try{await task();passed++;console.log('PASS',name);}catch(e){failed++;console.error('FAIL',name,e.stack||e);}}
class Element{
 constructor(tag,ids){this.tagName=tag;this.ids=ids;this.children=[];this.dataset={};
  this.hidden=false;this.disabled=false;this.textContent='';this.style={display:''};this.events={};
  this.classList={toggle(){},add(){}};}
 set id(v){this._id=v;this.ids.set(v,this);}
 get id(){return this._id;}
 set innerHTML(html){
  this._html=html;
  for(const m of String(html).matchAll(/id="([^"]+)"/g)){
   const element=new Element('button',this.ids);element.id=m[1];
  }
 }
 append(...elements){this.children.push(...elements);}
 replaceChildren(...elements){this.children=elements;}
 querySelector(v){return v==='.c131-tracks'?this.children[0]||null:null;}
 setAttribute(key,value){this[key]=value;}
 addEventListener(name,fn){this.events[name]=fn;}
 click(){this.events.click?.();}
}
function videoRuntime(){
 const ids=new Map(),app=new Element('main',ids),page=new Element('section',ids),head=new Element('div',ids);
 app.id='app';app.dataset.activePage='connect';page.id='page-connect';
 page.querySelector=q=>q==='.c126-head'?head:null;
 const document={getElementById:id=>ids.get(id)||null,
  createElement:tag=>new Element(tag,ids)};
 const calls=[],send=[],history=[];
 let voice=false,actor='sender-uuid',roomId='room-uuid',valid=true;
 class Room{
  constructor(){
   this.handlers={};this.remoteParticipants=new Map();
   this.localParticipant={isMicrophoneEnabled:false,isCameraEnabled:false,isScreenShareEnabled:false,
    setMicrophoneEnabled:async flag=>{this.localParticipant.isMicrophoneEnabled=flag;},
    setCameraEnabled:async flag=>{this.localParticipant.isCameraEnabled=flag;},
    setScreenShareEnabled:async flag=>{this.localParticipant.isScreenShareEnabled=flag;}
   };
  }
  on(evt,cb){this.handlers[evt]=cb;}
  async connect(){calls.push('connected');}
  async disconnect(){calls.push('disconnected');}
  async startAudio(){}
 }
 const window={isSecureContext:true,
  LivekitClient:{Room,RoomEvent:{TrackSubscribed:'ts',TrackUnsubscribed:'tu',
   ParticipantConnected:'pc',ParticipantDisconnected:'pd',LocalTrackPublished:'lp',
   LocalTrackUnpublished:'lu',Disconnected:'dc'}},
  crmConnectPush138:{sendForMessage:async id=>{send.push(id);return {ok:true,dispatched:1};}}};
 const MutationObserver=class{observe(){}};
 vm.runInNewContext(video,{window,document,MutationObserver,
  setTimeout,clearTimeout,setInterval:()=>42,clearInterval:()=>{},console});
 const client=()=>({
  functions:{invoke:async()=>({data:{ok:true,url:'wss://test.livekit.cloud',token:'test'}})},
  from:table=>{assert.equal(table,'connect_messages_v1');return{
   insert:obj=>{history.push(obj);return{
    select:()=>({single:async()=>({data:{...obj,id:'invite-'+history.length,created_at:new Date().toISOString()},error:null})})
   };}}
  }
 });
 window.crmConnectVideo131.init({client,roomId:()=>roomId,actor:()=>actor,
  isOpen:()=>true,isSignedIn:()=>valid,actorName:()=> 'Сотрудник',notify:()=>{},onMessage:()=>{}});
 return {window,ids,calls,send,history,flush:()=>new Promise(r=>setTimeout(r,40))};
}
(async()=>{
 await check('Starting a video meeting automatically saves ONE invitation and requests FCM',async()=>{
  const t=videoRuntime();
  t.ids.get('c131-start').click();await t.flush();
  assert.equal(t.calls.filter(x=>x==='connected').length,1);
  assert.equal(t.history.length,1,'sender should not need to press Invite separately');
  assert.match(t.history[0].body,/^📹 Начался видеозвонок/);
  assert.equal(t.send.length,1,'automatic invite should request push');
  t.ids.get('c131-leave').click();await t.flush();
 });
 await check('Recipient joining an incoming call NEVER sends reverse invite/push',async()=>{
  const t=videoRuntime();
  t.window.crmConnectVideo131.rememberIncoming({
   room_id:'room-uuid',sender_id:'another-user',created_at:new Date().toISOString(),
   body:'📹 Начался видеозвонок. Войдите'
  });
  t.ids.get('c131-start').click();await t.flush();
  assert.equal(t.calls.filter(x=>x==='connected').length,1);
  assert.equal(t.history.length,0);
  assert.equal(t.send.length,0);
 });
 await check('Push open action uses incoming role and chat invite has join button',()=>{
  assert.match(chat,/join\?\.\(\{incoming:true\}\)/);
  assert.match(chat,/button\('📹 Присоединиться к видеозвонку'/);
  assert.match(chat,/myPermissions\?\.video_enabled===true/);
  assert.match(chat,/crmConnectVideo131\?\.rememberIncoming\?\.\(message\)/);
 });
 await check('Security: LiveKit server still verifies membership and video entitlement',()=>{
  const server=get('supabase/functions/connect-livekit-token/index.ts');
  assert.match(server,/connect_active_staff_v1/);
  assert.match(server,/!permissionCheck\.data\?\.video_enabled/);
  assert.match(server,/!memberCheck\.data/);
  assert.doesNotMatch(video,/LIVEKIT_API_SECRET|LIVEKIT_API_KEY/);
 });
 await check('Director desktop AI remains opt-out on Android and unmodified by this patch',()=>{
  const director=get('assets/137-resanta-ai360-lazy-launch-v1.js');
  assert.match(director,/if\(\/Android\/i.test\(navigator.userAgent\|\|''\) \|\| window\.__resantaAI360LazyLaunchV1\)return;/);
  assert.match(launcher,/crmAI360StaffIdentityV1/);
  assert.match(launcher,/Capacitor\?\.isNativePlatform/);
  assert.match(launcher,/roles\.has\(p\.tier\)/);
  assert.doesNotMatch(launcher,/signInWithPassword/);
 });
 await check('Mobile staff voice modules blocked until an explicit employee click',()=>{
  const paths=['assets/144-resanta-ai360-branch-voice-v1.js',
   'assets/146-resanta-ai360-branch-premium-voice-v1.js',
   'assets/147-resanta-ai360-staff-unified-dialog-v1.js'];
  const window={addEventListener(){}},navigator={userAgent:'Mozilla Android'};
  for(const f of paths){
   const src=get(f);
   assert.match(src,/!root\.__resantaAI360AndroidStaffOptIn/);
   vm.runInNewContext(src,{window,navigator,console});
  }
  assert.equal(window.crmAI360BranchVoicePilotV1,undefined);
  assert.equal(window.crmAI360BranchPremiumVoiceV1,undefined);
  assert.equal(window.crmAI360BranchUnifiedHandleV1,undefined);
  assert.match(launcher,/button\.addEventListener\('click',\(\)=>void activate\(\)\)/);
 });
 await check('All role and invitation cache versions are present, modules syntax parse',()=>{
  for(const version of [
   '151-resanta-connect-v1.js?v=8','154-resanta-connect-video-v1.js?v=7',
   '156-resanta-connect-android-push-v1.js?v=2',
   '144-resanta-ai360-branch-voice-v1.js?v=9',
   '146-resanta-ai360-branch-premium-voice-v1.js?v=4',
   '147-resanta-ai360-staff-unified-dialog-v1.js?v=4',
   '157-resanta-ai360-android-staff-launch-v1.js?v=1'])assert.ok(html.includes(version),version);
  for(const p of [
   'assets/151-resanta-connect-v1.js',
   'assets/154-resanta-connect-video-v1.js',
   'assets/156-resanta-connect-android-push-v1.js',
   'assets/144-resanta-ai360-branch-voice-v1.js',
   'assets/146-resanta-ai360-branch-premium-voice-v1.js',
   'assets/147-resanta-ai360-staff-unified-dialog-v1.js',
   'assets/157-resanta-ai360-android-staff-launch-v1.js'])new Function(get(p));
 });
 console.log('CONNECT + AI360 #139:',passed,'passed,',failed,'failed');
 if(failed)process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1;});
