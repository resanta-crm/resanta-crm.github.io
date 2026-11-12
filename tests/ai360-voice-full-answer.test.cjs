'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const code=fs.readFileSync('assets/136-resanta-voice-quality-v3.js','utf8');
const speechTest='Отставание менеджеров связано с несколькими возможными факторами. '+('У Шкурана и Ачинович необходимо проверить клиентскую базу, сравнить заказы и динамику. ').repeat(15)+'В конце обязательно проверьте дату отчёта и реальное выполнение плана.';
const bytes=new Uint8Array(1100);
bytes.set(Buffer.from('RIFF'),0);bytes.set(Buffer.from('WAVE'),8);
function context(voice,options={}){
 const invoked=[];
 const consents=new Map([['resanta-ai360-yandex-consent-monthly-v5','yes'],['resanta-ai360-yandex-voice-v4',voice]]);
 const storage={getItem:key=>consents.get(key)||null,setItem:(key,v)=>consents.set(key,v)};
 class FakeAudio{
   addEventListener(type,fn){this[type]=fn;}
   play(){queueMicrotask(()=>this.ended?.());return Promise.resolve();}
   pause(){}
 }
 const synthesis={cancel:()=>{},getVoices:()=>[]};
 const document={hidden:false,querySelector:()=>null,getElementById:()=>({style:{display:'block'}}),addEventListener:()=>{}};
 const window={localStorage:storage,speechSynthesis:synthesis,setInterval:()=>1,setTimeout:setTimeout,
  addEventListener:()=>{},crmEnsureFreshSessionV236166:async()=>({access_token:'test'})};
 const sandbox={
  window,document,navigator:{userAgent:'Mozilla/5.0 (Windows NT 10.0)'},
  currentUser:{id:'544fb1e2-ef70-44de-bc62-e0e1596a4bfc'},
  currentProfile:{id:'544fb1e2-ef70-44de-bc62-e0e1596a4bfc',role:'boss',name:'Александр Паюшин',region:'Витебск'},
  URL:{createObjectURL:()=> 'blob:test',revokeObjectURL:()=>{}},
  db:{functions:{invoke:async(name,{body})=>{
    assert.equal(name,'crm-voice-yandex-tts-v1');
    if(body.kind==='status')return {data:{budget:{month:'2026-10',reserved_rub:5.36,limit_rub:5000}}};
    assert(body.text.length<=205,'fragment too long '+body.text.length);
    invoked.push({...body});
    if(options.hideAfterFirst && invoked.length===1)document.hidden=true;
    return {data:new Blob([bytes])};
  }}},
  Audio:FakeAudio,Blob,Uint8Array,console,setTimeout,clearTimeout,
  speechSynthesis:synthesis
 };
 // Use the real UI identity resolver rather than bypassing the production
 // account guard. Previously this test used a fake director ID, so it falsely
 // failed after correct role-bound voice authorization was introduced.
 vm.runInNewContext(fs.readFileSync('assets/215-lera360-personal-greeting-v1.js','utf8'),
   sandbox,{filename:'personal-greeting-v1.js'});
 assert.equal(window.crmAI360GreetingV1()?.greeting,'Привет, родной! Чем помочь?');
 vm.runInNewContext(code,sandbox,{filename:'voice-quality-v3.js'});
 assert(typeof window.crmAI360SpeechChunksV4==='function');
 return {window,document,invoked,consents};
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
 const background=context('yandex:lera',{hideAfterFirst:true});
 await background.window.crmResantaVoiceSpeakV3(speechTest);
 assert.equal(background.document.hidden,true,'simulated switch to ChatGPT');
 assert.equal(background.invoked.length,background.window.crmAI360SpeechChunksV4(speechTest).length,
   'Yandex narration must finish ALL clips even after CRM tab goes to background');
 assert.equal(background.window.__resantaVoiceOutputBusy,false);
 const styled=context('yandex:lera');
 const speech='**Шкуран**: 43,9%. **Ачинович**: 52,1%. \n1. Проверить клиентов. \n2. Уточнить планы. Конец ответа.';
 const pieces=styled.window.crmAI360SpeechChunksV4(speech);
 assert(pieces.join(' ').includes('Шкуран: 43,9%'));
 assert(pieces.join(' ').endsWith('Конец ответа.'));
 assert(!pieces.join(' ').includes('**'));
 // Speech intentionally rounds BYN to whole rubles, unlike the source CRM figures
 // displayed on screen. Group separators may be spaces or narrow NBSP in ICU.
 const compactMoney=s=>String(s).replace(/[\\s\\u00a0\\u202f]/g,'');
 const byn=styled.window.crmAI360SpeechChunksV4('Выручка 159000 BYN, недобор 35440.52 BYN.');
 const bynSpeech=byn.join(' ');
 assert.equal(bynSpeech.includes('BYN'),false,'BYN must not be read as letters');
 assert(compactMoney(bynSpeech).includes('159000белорусскихрублей'));
 assert(compactMoney(bynSpeech).includes('35441белорусскийрубль')||
        compactMoney(bynSpeech).includes('35441белорусскихрублей'),
        'Yandex voice must speak the rounded BYN amount');
 assert(!bynSpeech.includes('копеек'),'spoken whole-ruble policy');
 const ruble=styled.window.crmAI360SpeechChunksV4('Долг 1 BYN, задолженность 2 BYN, возврат 21 BYN. Остаток 0.06 BYN.').join(' ');
 assert(ruble.includes('1 белорусский рубль'));
 assert(ruble.includes('2 белорусских рубля'));
 assert(ruble.includes('21 белорусский рубль'));
 assert(ruble.includes('0 белорусских рублей'));
 assert(!ruble.includes('копеек'));
 const rubleFormatted=styled.window.crmAI360SpeechChunksV4('Факт 46 965,42 BYN, план 153 000,00 BYN.').join(' ');
 assert(compactMoney(rubleFormatted).includes('46965белорусскихрублей'));
 assert(compactMoney(rubleFormatted).includes('153000белорусскихрублей'));
 assert(!rubleFormatted.includes('BYN'));

 const dates=styled.window.crmAI360SpeechChunksV4(
  'Продажи менеджера Шкуран за 10.2026. Последняя загрузка 23.10.2026. Визит 2026-10-27. Данные за 2026-09.'
 ).join(' ');
 assert(dates.includes('октябрь две тысячи двадцать шестого года'),'Russian month/year should be spoken naturally');
 assert(dates.includes('двадцать третьего октября две тысячи двадцать шестого года'),'full date must be an ordinal');
 assert(dates.includes('двадцать седьмого октября'),'ISO CRM visit date must speak naturally');
 assert(dates.includes('сентябрь две тысячи двадцать шестого года'),'ISO month should be localized');
 assert(!dates.includes('10.2026')&&!dates.includes('23.10.2026')&&!dates.includes('2026-10-27'));
 const decimals=styled.window.crmAI360SpeechChunksV4('Выполнение 30,7%, рост 12.5%, артикул 63/6/39.').join(' ');
 assert(decimals.includes('30,7%')&&decimals.includes('12.5%')&&
        decimals.includes('63 дробь 6 дробь 39'),
   'percentage decimals and spoken SKU must not be mistaken for calendar dates');
 assert(code.includes('options?.shortSummary'),'TTS must label a brief answer as a brief answer');
 console.log('AI360 full Lera/Dasha answers, Russian month/full dates, concise voice status and BYN formatting: OK');
})().catch(e=>{console.error(e);process.exit(1);});
