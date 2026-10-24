'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const code=fs.readFileSync('assets/135-resanta-voice-capture-fix-v2.js','utf8');
const voiceUI=fs.readFileSync('assets/136-resanta-voice-quality-v3.js','utf8');
function node(){
 const callbacks={};
 const classes=new Set();
 return {
   classList:{contains:n=>classes.has(n),add:n=>classes.add(n),remove:n=>classes.delete(n),toggle:n=>{if(classes.has(n)){classes.delete(n);return false;}classes.add(n);return true;}},
   dataset:{},style:{},hidden:false,isConnected:true,textContent:'',
   listeners:callbacks,after(){},setAttribute(k,v){this[k]=v;},
   addEventListener(type,fn){(callbacks[type]??=[]).push(fn);},
   click(){for(const fn of callbacks.click||[])fn({stopImmediatePropagation(){},preventDefault(){}});}
 };
}
function harness(saved=false,yandex=true){
 const local=new Map(saved?[['resanta-ai360-wake-window-optin-v1','yes']]:[]);
 const counts={microphone:0,stopped:0,consent:0,recorded:0};
 const panel=node(),mic=node(),wake=node(),status=node(),field=node(),send=node(),note=node(),close=node();
 panel.hidden=true;
 const el={'.rva-mic':mic,'.rva-wake':wake,'.rva-status':status,'.rva-input':field,
  '.rva-send':send,'.rva-note':note,'.rva-close':close};
 panel.querySelector=(selector)=>el[selector]||null;
 const document={hidden:false,
   createElement:()=>node(),
   getElementById:()=>({style:{display:'block'}}),
   querySelector:()=>panel,
   listeners:{},
   addEventListener(type,fn){(this.listeners[type]??=[]).push(fn);}
 };
 const intervals=[];
 const stream=()=>({active:true,getTracks(){return [{stop(){counts.stopped++;}}]}});
 class MediaRecorder{
   constructor(){this.state='inactive';this.mimeType='audio/webm';}
   static isTypeSupported(){return true;}
   start(){this.state='recording';counts.recorded++;}
   stop(){this.state='inactive';this.onstop?.();}
 }
 const window={
   __resantaVoiceOutputBusy:false,__resantaAI360PendingV1:false,
   localStorage:{getItem:k=>local.get(k)||null,setItem:(k,v)=>local.set(k,v),removeItem:k=>local.delete(k)},
   confirm:()=>{counts.consent++;return true;},
   crmResantaVoiceAuthorizeV3:()=>{counts.consent++;return true;},
   crmResantaVoiceHasConsentV3:()=>yandex,
   speechSynthesis:{cancel(){},speaking:false},
   MediaRecorder,
   setInterval(fn,ms){intervals.push({fn,ms});return intervals.length;},
   clearInterval(){},setTimeout(){return 100;},clearTimeout(){},
   addEventListener(){},
   crmEnsureFreshSessionV236166:async()=>({access_token:'approved'})
 };
 const navigator={userAgent:'Windows NT 10',mediaDevices:{
   getUserMedia:async()=>{counts.microphone++;return stream();}
 }};
 const globals={window,document,navigator,MediaRecorder,console,
   currentUser:{id:'director'},
   currentProfile:{role:'boss',name:'Александр Паюшин'},
   setTimeout,clearTimeout,clearInterval(){},Blob,Uint8Array,FormData};
 vm.runInNewContext(code,globals,{filename:'voice-capture.js'});
 async function settle(){for(let i=0;i<10;i++)await Promise.resolve();}
 async function tick(){for(const t of intervals.filter(x=>x.ms===650))t.fn();await settle();}
 return {panel,mic,wake,status,close,document,window,counts,local,settle,tick};
}
(async()=>{
 {
  const h=harness();
  await h.tick();
  assert.equal(h.counts.microphone,0,'mic must never start on login or while panel hidden');
  h.panel.hidden=false;
  await h.tick();
  assert.equal(h.counts.microphone,0,'first launch requires one explicit consent');
  h.wake.click(); await h.settle();
  assert.equal(h.counts.microphone,1,'one user gesture starts session');
  assert.equal(h.local.get('resanta-ai360-wake-window-optin-v1'),'yes');
  assert.equal(h.wake['aria-pressed'],'true');
  h.panel.hidden=true;await h.tick();
  assert.equal(h.counts.stopped,1,'closing assistant releases mic');
  h.panel.hidden=false;await h.tick();
  assert.equal(h.counts.microphone,2,'opening assistant auto-starts after saved consent');
  h.document.hidden=true;
  for(const fn of h.document.listeners.visibilitychange||[])fn();
  await h.settle();
  assert.equal(h.counts.stopped,2,'hidden browser tab releases mic');
  h.document.hidden=false;
  for(const fn of h.document.listeners.visibilitychange||[])fn();
  await h.tick();
  assert.equal(h.counts.microphone,3,'return to foreground reconnects once');
  h.wake.click(); await h.settle();
  assert.equal(h.local.get('resanta-ai360-wake-window-optin-v1'),undefined,'off button revokes saved activation');
  assert.equal(h.counts.stopped,3);
  h.panel.hidden=true;await h.tick();
  h.panel.hidden=false;await h.tick();
  assert.equal(h.counts.microphone,3,'off must never auto-restart');
 }
 {
  const h=harness(true,false);
  h.panel.hidden=false;await h.tick();
  assert.equal(h.counts.microphone,0,'autostart requires existing Yandex consent');
  assert(h.status.textContent.includes('разреши Яндекс'),'visible instructions when consent missing');
  h.wake.click();await h.settle();
  assert.equal(h.counts.microphone,1,'user click can recover without background confirmation prompt');
 }
 {
  const h=harness(true,true);
  h.panel.hidden=false;await h.tick();
  assert.equal(h.counts.microphone,1,'saved consent connects when panel opens');
  h.panel.classList.add('rva-mini');
  h.window.crmResantaVoiceSuspendV2();
  await h.settle();await h.tick();
  assert.equal(h.counts.stopped,1,'minimizing releases microphone');
  assert.equal(h.counts.microphone,1,'mini player never reconnects mic');
  h.panel.classList.remove('rva-mini');
  await h.tick();
  assert.equal(h.counts.microphone,2,'restoring panel reconnects after remembered consent');
 }
 assert(code.includes("resumeConversationUntil")&&code.includes("RESUME_WINDOW_MS=3*60*1000"),
   'tab return keeps only three-minute ephemeral conversation state');
 assert(code.includes("wakeHeard=!!continueConversation"),
   'automatic foreground restart recovers already accepted wake phrase');
 assert(code.includes("mode==='wake'&&wakeHeard&&autoWakeWanted&&isOwner()"),
   'only previously activated director dialogue can continue');
 assert(code.includes("if(document.hidden){")&&code.includes("if(mode)void stopAll('Микрофон выключен: вкладка скрыта."),
   'hidden tab stops mic even when conversation remains active');
 assert(code.includes("resumeConversationUntil=0;void stopAll();"),
   'page navigation and explicit close must revoke continuation');
 assert(code.includes("noiseOnly(phrase)"),'lone filler such as А must not be sent to AI');
 assert(code.includes("if(noiseOnly(phrase))"),'wake mode must skip filler fragments');
 assert(voiceUI.includes("window.crmResantaVoiceAuthorizeV3=approveYandex"));
 assert(voiceUI.includes("Проверка звучания (необязательно)"));
 assert(voiceUI.includes("testBtn.textContent='▶ Послушать пример голоса'"));
 assert(code.includes("if(clipCount>=50)"),'wake mode must keep transcription cap');
 assert(code.includes("document.hidden")&&code.includes("panel.hidden"),'wake must stop on hidden tab or closed panel');
 assert(code.includes("getUserMedia"),'native mic permission still required');
 console.log('AI360 remembered foreground voice activation, opt-in, no login mic, session stop and optional preview: OK');
})().catch(e=>{console.error(e);process.exit(1);});
