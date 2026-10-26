'use strict';
// Test-only hooks are injected into an isolated VM; they are NOT deployed.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync('assets/135-resanta-voice-capture-fix-v2.js','utf8');
const loader=fs.readFileSync('assets/137-resanta-ai360-lazy-launch-v1.js','utf8');
const anchor='\n init();\n})();';
assert(source.includes(anchor),'voice code structure unexpectedly changed');
const exposed=source.replace(anchor,
  '\n window.__ai360Test={wakeCommand,greetingOnly,state:()=>({mode,wakeHeard,resumeConversationUntil,acceptedWakeUntil}),accept:()=>{wakeHeard=true;acceptedWakeUntil=Date.now()+RESUME_WINDOW_MS;}};\n init();\n})();');
let now=1792990800000;
class Clock extends Date{static now(){return now;}}
function node(){
 const handlers={},classes=new Set();
 return {hidden:false,isConnected:true,dataset:{},style:{},value:'',textContent:'',
   classList:{contains:k=>classes.has(k),add:k=>classes.add(k),remove:k=>classes.delete(k)},
   setAttribute(k,v){this[k]=v;},after(){},
   addEventListener(k,fn){(handlers[k]??=[]).push(fn);},
   click(){for(const fn of handlers.click||[])fn({stopImmediatePropagation(){},preventDefault(){}});}
 };
}
function harness(){
 const panel=node(),mic=node(),wake=node(),status=node(),field=node(),send=node(),note=node(),close=node();
 panel.hidden=true;
 const els={'.rva-mic':mic,'.rva-wake':wake,'.rva-status':status,'.rva-input':field,
  '.rva-send':send,'.rva-note':note,'.rva-close':close};
 panel.querySelector=k=>els[k]||null;
 const listeners={},intervals=[],counts={mic:0,stopped:0};
 const doc={hidden:false,createElement:()=>node(),querySelector:()=>panel,
  getElementById:()=>({style:{display:'block'}}),
  addEventListener:(n,fn)=>(listeners[n]??=[]).push(fn)};
 class Recorder{
  constructor(){this.state='inactive';this.mimeType='audio/webm';}
  static isTypeSupported(){return true;}
  start(){this.state='recording';}
  stop(){this.state='inactive';this.onstop?.();}
 }
 const key='resanta-ai360-wake-window-optin-v1';
 const local=new Map([[key,'yes']]);
 const win={
  localStorage:{getItem:k=>local.get(k)||null,setItem:(k,v)=>local.set(k,v),removeItem:k=>local.delete(k)},
  speechSynthesis:{speaking:false,cancel(){}},MediaRecorder:Recorder,
  crmResantaVoiceHasConsentV3:()=>true,crmResantaVoiceAuthorizeV3:()=>true,
  crmEnsureFreshSessionV236166:async()=>({access_token:'mock'}),
  confirm:()=>true,setTimeout:()=>1,clearTimeout(){},
  setInterval:(fn,ms)=>{intervals.push({fn,ms});return intervals.length;},
  clearInterval(){},addEventListener(){}
 };
 const nav={userAgent:'Windows',mediaDevices:{getUserMedia:async()=>{
  counts.mic++;return {active:true,getTracks:()=>[{stop(){counts.stopped++;}}]};
 }}};
 vm.runInNewContext(exposed,{
  window:win,navigator:nav,document:doc,console,
  currentUser:{id:'director'},currentProfile:{role:'boss',name:'Александр Паюшин'},
  MediaRecorder:Recorder,setTimeout,clearTimeout,clearInterval(){},Date:Clock,Blob,Uint8Array,FormData
 },{filename:'voice-video-regression.js'});
 async function settle(){for(let i=0;i<24;i++)await Promise.resolve();}
 async function tick(){for(const i of intervals.filter(i=>i.ms===650))i.fn();await settle();}
 function visibility(hidden){doc.hidden=hidden;for(const fn of listeners.visibilitychange||[])fn();}
 return {panel,win,counts,tick,settle,visibility,close};
}
(async()=>{
 assert(loader.includes('135-resanta-voice-capture-fix-v2.js?v=12'),'new capture must be cache busted');
 const h=harness(),test=h.win.__ai360Test;
 await h.tick();
 assert.equal(h.counts.mic,0,'no microphone before panel opened');
 h.panel.hidden=false;
 await h.tick();
 assert.equal(h.counts.mic,1,'only open director panel captures');
 assert.equal(test.wakeCommand('Лера, предложи три поручения для Руднева',0),
   'предложи три поручения для Руднева');
 assert.equal(test.wakeCommand('Привет, Ресанта, предложи поручения',0),'предложи поручения');
 assert.equal(test.wakeCommand('Лера',0),'');
 assert.equal(test.wakeCommand('Ресанта',now-500),'');
 assert.equal(test.wakeCommand('Ресанта',0),null);
 assert.equal(test.wakeCommand('Позвони дилеру',0),null,'not a false wake');
 assert.equal(test.greetingOnly('Лера!'),true);
 test.accept();
 h.visibility(true);await h.settle();
 assert.equal(test.state().mode,'','background stops mic');
 assert(h.counts.stopped>=1,'tracks really stopped');
 assert(test.state().resumeConversationUntil>now,'3-minute recovery window');
 now+=60*1000;
 h.visibility(false);await h.tick();
 assert.equal(test.state().wakeHeard,true,'no repeat greeting after tab return');
 assert.equal(h.counts.mic,2,'reconnect microphone in foreground');
 now+=10*60*1000;
 h.visibility(true);await h.settle();
 assert(test.state().resumeConversationUntil>now,'new tab switch renews grace window');
 now+=3*60*1000+1;
 h.visibility(false);await h.tick();
 assert.equal(test.state().wakeHeard,false,'expired window requires new wake');
 test.accept();h.close.click();await h.settle();
 assert.equal(test.state().acceptedWakeUntil,0,'close revokes lease');
 assert.equal(test.state().resumeConversationUntil,0,'close revokes recovery');
 assert(source.includes('capture(9,epoch)'),'9s voice limit');
 assert(source.includes("mode==='wake'?1700:1450"),'natural speech pause');
 assert(source.includes('if (/Android/i.test(navigator.userAgent'),'Android remains excluded');
 console.log('AI360 video regression: Lera wake, tab recovery, expiry, close and 9s capture PASS');
})().catch(e=>{console.error(e);process.exitCode=1;});
