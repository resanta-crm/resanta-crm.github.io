'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const code=fs.readFileSync('assets/136-resanta-voice-quality-v3.js','utf8');
const speechTest='Отставание менеджеров связано с несколькими возможными факторами. '+('У Шкурана и Ачинович необходимо проверить клиентскую базу, сравнить заказы и динамику. ').repeat(15)+'В конце обязательно проверьте дату отчёта и реальное выполнение плана.';
const bytes=new Uint8Array(1100);
bytes.set(Buffer.from('RIFF'),0);bytes.set(Buffer.from('WAVE'),8);
function context(voice){
 const invoked=[];
 const consents=new Map([['resanta-ai360-yandex-consent-v4','yes'],['resanta-ai360-yandex-voice-v4',voice]]);
 const storage={getItem:key=>consents.get(key)||null,setItem:(key,v)=>consents.set(key,v)};
 class FakeAudio{
   addEventListener(type,fn){this[type]=fn;}
   play(){queueMicrotask(()=>this.ended?.());return Promise.resolve();}
   pause(){}
 }
 const synthesis={cancel:()=>{},getVoices:()=>[]};
 const document={hidden:false,querySelector:()=>null,addEventListener:()=>{}};
 const window={localStorage:storage,speechSynthesis:synthesis,setInterval:()=>1,setTimeout:setTimeout,
  addEventListener:()=>{},crmEnsureFreshSessionV236166:async()=>({access_token:'test'})};
 const sandbox={
  window,document,navigator:{userAgent:'Mozilla/5.0 (Windows NT 10.0)'},
  currentUser:{id:'test'},currentProfile:{role:'boss',name:'Александр Паюшин'},
  URL:{createObjectURL:()=> 'blob:test',revokeObjectURL:()=>{}},
  db:{functions:{invoke:async(name,{body})=>{
    assert.equal(name,'crm-voice-yandex-tts-v1');
    assert(body.text.length<=205,'fragment too long '+body.text.length);
    invoked.push({...body});
    return {data:new Blob([bytes])};
  }}},
  Audio:FakeAudio,Blob,Uint8Array,console,setTimeout,clearTimeout,
  speechSynthesis:synthesis
 };
 vm.runInNewContext(code,sandbox,{filename:'voice-quality-v3.js'});
 assert(typeof window.crmAI360SpeechChunksV4==='function');
 return {window,invoked,consents};
}
(async()=>{
 for(const voice of ['yandex:lera','yandex:dasha']){
  const c=context(voice);
  const chunks=c.window.crmAI360SpeechChunksV4(speechTest);
  assert(chunks.length>=5,'expected many fragments');
  assert(chunks.every(x=>x.length>0 && x.length<=205));
  assert.equal(chunks.join(' '),speechTest.trim());
  await c.window.crmResantaVoiceSpeakV3(speechTest);
  assert.equal(c.invoked.length,chunks.length,'each chunk must be transmitted and played');
  assert.equal(c.invoked.map(x=>x.text).join(' '),speechTest,'nothing omitted');
  assert(c.invoked.every(x=>x.voice===voice.split(':')[1]));
  assert.equal(c.window.__resantaVoiceOutputBusy,false);
 }
 const styled=context('yandex:lera');
 const speech='**Шкуран**: 43,9%. **Ачинович**: 52,1%. \n1. Проверить клиентов. \n2. Уточнить планы. Конец ответа.';
 const pieces=styled.window.crmAI360SpeechChunksV4(speech);
 assert(pieces.join(' ').includes('Шкуран: 43,9%'));
 assert(pieces.join(' ').endsWith('Конец ответа.'));
 assert(!pieces.join(' ').includes('**'));
 console.log('AI360 sequential full-answer Lera/Dasha and Markdown cleanup: OK');
})().catch(e=>{console.error(e);process.exit(1);});
