'use strict';
const fs=require('node:fs');
const assert=require('node:assert/strict');
const src=fs.readFileSync('assets/136-resanta-voice-quality-v3.js','utf8');
class Element {
 constructor(tag='div'){this.tag=tag;this.textContent='';this.children=[];this.hidden=false;this.style={};this.dataset={};this.attrs={};this.events={};this.classList={contains:x=>x==='rva-settings-body'};this.parentElement=null;}
 append(...els){for(const el of els)this.appendChild(el);}
 appendChild(el){this.children.push(el);el.parentElement=this;return el;}
 after(...els){return els.length;}
 insertBefore(el){return this.appendChild(el);}
 setAttribute(k,v){this.attrs[k]=v;}
 addEventListener(type,fn){this.events[type]=fn;}
 click(){return this.events.click?.();}
 querySelector(){return null;}
}
class FakeBlob {
 constructor(parts=[],options={}){this.type=options.type||'';const bytes=[];for(const p of parts){if(p instanceof FakeBlob)bytes.push(...p.bytes);else if(p instanceof Uint8Array)bytes.push(...p);else if(typeof p==='string')bytes.push(...[...p].map(c=>c.charCodeAt(0)));}this.bytes=Uint8Array.from(bytes);this.size=this.bytes.byteLength;}
 slice(a=0,b=this.size){return new FakeBlob([this.bytes.slice(a,b)],{type:this.type});}
 async arrayBuffer(){return this.bytes.slice().buffer;}
}
class MockAudio {
 constructor(url){this.url=url;this.events={};}
 addEventListener(type,fn){this.events[type]=fn;}
 play(){setTimeout(()=>this.events.ended?.(),1);return Promise.resolve();}
 pause(){}
 set currentTime(v){}
}
function harness({accept=true,fail=false}={}){
 const nodes={},create=tag=>{const el=new Element(tag);created.push(el);return el;},created=[];
 for(const key of ['.rva-settings-body','.rva-mute','.rva-stop-audio','.rva-status','.rva-close','.rva-pause-audio','.rva-mini-playback'])
  nodes[key]=new Element();
 const actions=new Element(),panel=new Element();
 nodes['.rva-stop-audio'].parentElement=actions;
 panel.querySelector=q=>nodes[q]||null;
 const doc={querySelector:q=>q==='.rva-window'?panel:null,createElement:create,
   getElementById:q=>q==='app'?{style:{display:'block'}}:null};
 let confirmation=0,tts=0,status=0;
 const storage=new Map();
 const win={
  setInterval:()=>0,addEventListener:()=>{},confirm:()=>{confirmation++;return accept;},
  speechSynthesis:{cancel(){}},localStorage:{
   getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)
  },
  crmEnsureFreshSessionV236166:async()=>({access_token:'synthetic'}),
 };
 const db={functions:{invoke:async(name,params)=>{
  if(name!=='crm-voice-yandex-tts-v1')throw Error('unexpected endpoint '+name);
  if(params?.body?.kind==='status'){status++;return {data:{budget:{reserved_rub:0,limit_rub:5000}}};}
  tts++;
  if(fail)return {error:{message:'synthetic_tts_error'}};
  const header=new Uint8Array([82,73,70,70,16,0,0,0,87,65,86,69]);
  const wav=new FakeBlob([header,new Uint8Array(330)],{type:'application/octet-stream'});
  return {data:wav};
 }}};
 new Function('window','navigator','document','currentUser','currentProfile','db','Blob','Audio','URL',
  'speechSynthesis','setTimeout','clearTimeout','Intl','Date','Uint8Array',src)(
  win,{userAgent:'Mozilla/5.0 (Macintosh; Intel Mac OS X) Chrome/150 YaBrowser'},
  doc,{id:'boss'},{role:'boss',name:'Александр Паюшин'},db,FakeBlob,MockAudio,
  {createObjectURL:()=> 'blob:mock',revokeObjectURL:()=>{}},win.speechSynthesis,setTimeout,clearTimeout,Intl,Date,Uint8Array
 );
 const btn=created.find(x=>x.textContent==='🔊 Проверить звук Леры');
 const feedback=created.find(x=>x.attrs.role==='status');
 assert(btn&&feedback,'visible sound button and persistent status label');
 return {btn,feedback,win,get confirmation(){return confirmation;},get tts(){return tts;},get status(){return status;}};
}
(async()=>{
 const a=harness({accept:true});
 assert.equal(a.tts,0,'no audio generation on page load');
 a.btn.click();
 await new Promise(done=>setTimeout(done,80));
 assert.equal(a.confirmation,1,'test asks explicit consent on fresh Mac');
 assert.equal(a.tts,1,'test sends exactly one Yandex synthesis call');
 assert(a.feedback.textContent.includes('✅'),'success visible in persistent label');
 const b=harness({accept:false});
 b.btn.click();await new Promise(done=>setTimeout(done,30));
 assert.equal(b.tts,0,'denied consent never generates paid audio');
 assert(b.feedback.textContent.includes('не разрешена'));
 const c=harness({fail:true});
 c.btn.click();await new Promise(done=>setTimeout(done,70));
 assert.equal(c.tts,1);
 assert(c.feedback.textContent.includes('⚠️'),'error visible even if main status later changes');
 assert(src.includes("if(!actions||!mute){panel=null;return false;}"),'mount does not lock out retries on missing controls');
 assert(src.includes('crmResantaVoiceSpeakV3'),'existing voice API kept');
 console.log('AI360 Mac Yandex voice: no autostart, explicit consent, audio request, refusal and visible TTS errors PASS');
})().catch(e=>{console.error(e);process.exitCode=1;});
