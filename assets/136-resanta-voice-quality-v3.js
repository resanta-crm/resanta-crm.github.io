/* RESANTA AI 360 — voice quality selector v3.
 * Uses native Russian voices by default; neural voice only after explicit opt-in.
 * Secure server controls speech generation. No API keys in frontend.
 */
(function(){
'use strict';
 // v23.7.14: 21 Oct Android incident; avoid optional voice APIs on all Android browsers and WebViews.
 if (/Android/i.test(navigator.userAgent || '')) return;

if(window.__resantaVoiceQualityV3)return;
window.__resantaVoiceQualityV3=true;
let panel,select,testBtn,output=null,outputUrl='',browserDone=null,audioDone=null,approvedCloud=false,approvedYandex=false;
let current='auto',epoch=0,prevVisible=true;
const SUPPORTED=['shimmer','onyx'];
const allowed=()=>{try{return typeof currentUser!=='undefined'&&!!currentUser?.id&&typeof currentProfile!=='undefined'&&currentProfile?.role==='boss'&&String(currentProfile?.name||'').trim().replace(/\s+/g,' ').toLowerCase()==='александр паюшин'&&document.getElementById('app')?.style.display!=='none';}catch{return false;}};
const short=(t)=>String(t||'').trim().slice(0,350);
const setStatus=(txt)=>{const el=panel?.querySelector('.rva-status');if(el)el.textContent=txt;};
function stopSpeech(){
 epoch++;
 window.__resantaVoiceOutputBusy=false;
 if(output){try{output.pause();output.currentTime=0;}catch{}output=null;}
 if(audioDone){const resolve=audioDone;audioDone=null;resolve();}
 if(outputUrl){URL.revokeObjectURL(outputUrl);outputUrl='';}
 try{speechSynthesis.cancel();}catch{}
 if(browserDone){const resolve=browserDone;browserDone=null;resolve();}
}
function pickBrowserVoice(){
 const voices=window.speechSynthesis?.getVoices?.()||[];
 const ru=voices.filter(v=>/^ru([_-]|$)/i.test(v.lang||''));
 if(current.startsWith('native:'))return ru.find(v=>v.voiceURI===current.slice(7))||ru[0]||null;
 const ranked=[...ru].sort((a,b)=>{
   const score=v=>(/natural|нейрон|online/i.test(v.name)?50:0)+(/irina|ирина|daria|дарья|svetlana|светлана|tatyana|татьяна/i.test(v.name)?20:0)+(v.localService?0:5);
   return score(b)-score(a);
 });
 return ranked[0]||null;
}
function localSpeak(msg,run){
 return new Promise(resolve=>{
   if(run!==epoch||!window.speechSynthesis||!window.SpeechSynthesisUtterance){resolve();return;}
   const utter=new SpeechSynthesisUtterance(msg);
   utter.lang='ru-RU';utter.rate=0.95;utter.pitch=1;utter.volume=0.9;
   const voice=pickBrowserVoice();if(voice)utter.voice=voice;
   let finished=false;
   const finish=()=>{if(finished)return;finished=true;clearTimeout(timeout);if(browserDone===finish)browserDone=null;resolve();};
   const timeout=window.setTimeout(finish,25000);
   browserDone=finish;utter.onend=utter.onerror=finish;
   try{window.speechSynthesis.cancel();window.speechSynthesis.speak(utter);}catch{finish();}
 });
}
async function cloudSpeak(msg,voice,run,provider='openai'){
 const isYandex=provider==='yandex';
 const voiceText=isYandex?(msg.length>240?msg.slice(0,238).replace(/\s+\S*$/,'')+'…':msg):msg;
 const session=await window.crmEnsureFreshSessionV236166?.(false).catch(()=>null);
 if(!session?.access_token)throw new Error('no_session');
 setStatus(isYandex?'Яндекс готовит русский голос…':'Готовлю естественный голос…');
 const result=await db.functions.invoke(isYandex?'crm-voice-yandex-tts-v1':'crm-voice-tts-v1',{body:{text:voiceText,voice}});
 if(run!==epoch)return;
 if(result.error){let detail='';try{const d=await result.error.context?.json?.();detail=d?.error||'';}catch{}
  throw new Error(detail||result.error.message||'voice_failed');}
 // Supabase FunctionsClient returns Blob only for application/octet-stream.
 // Wrap decoded bytes with an explicit WAV MIME so browsers play SpeechKit audio reliably.
 const rawBlob=result.data instanceof Blob?result.data:null;
 if(!rawBlob||rawBlob.size<300)throw new Error('empty_audio_response');
 const header=new Uint8Array(await rawBlob.slice(0,12).arrayBuffer());
 const riff=String.fromCharCode(...header.slice(0,4));
 const wave=String.fromCharCode(...header.slice(8,12));
 if(isYandex && (riff!=='RIFF'||wave!=='WAVE'))throw new Error('yandex_invalid_wav');
 const blob=isYandex?new Blob([rawBlob],{type:'audio/wav'}):rawBlob;
 outputUrl=URL.createObjectURL(blob);
 output=new Audio(outputUrl);output.preload='auto';
 await new Promise((resolve,reject)=>{
  let settled=false;
  const done=()=>{if(settled)return;settled=true;if(audioDone===done)audioDone=null;resolve();};
  audioDone=done;
  output.addEventListener('ended',done,{once:true});
  output.addEventListener('error',()=>{if(!settled){settled=true;audioDone=null;reject(new Error('audio_device_error'));}},{once:true});
  Promise.resolve(output.play()).catch(()=>reject(new Error('autoplay_denied')));
 });
}
window.crmResantaVoiceSpeakV3=async function(message){
 const msg=short(message);
 if(!msg||!allowed())return;
 const run=++epoch;
 window.__resantaVoiceOutputBusy=true;
 try{
   if(current.startsWith('yandex:')&&approvedYandex){
     try{await cloudSpeak(msg,current.slice(7),run,'yandex');}
     catch(e){if(run===epoch){console.warn('Resanta Yandex voice unavailable',String(e));
       const cause=String(e.message||'ошибка');
       setStatus(cause.includes('yandex_credentials_required')?'Yandex Cloud ещё не подключён: нужен API-ключ SpeechKit в настройках Supabase. Озвучиваю системным голосом.':
         'Русский голос Яндекса пока недоступен ('+cause+'). Озвучиваю системным голосом.');
       await localSpeak(msg,run);
     }}
   }else if(current.startsWith('cloud:')&&approvedCloud){
     try{await cloudSpeak(msg,current.slice(6),run);}
     catch(e){if(run===epoch){console.warn('Resanta cloud voice unavailable',String(e));setStatus('Живой голос недоступен ('+String(e.message||'ошибка')+'). Переключился на системный.');await localSpeak(msg,run);}}
   }else await localSpeak(msg,run);
 }finally{
   if(run===epoch){
     if(output){try{output.pause();}catch{}output=null;}
     if(outputUrl){URL.revokeObjectURL(outputUrl);outputUrl='';}
     await new Promise(r=>setTimeout(r,350));
     if(run===epoch)window.__resantaVoiceOutputBusy=false;
   }
 }
};
function fillVoices(){
 if(!select)return;
 const value=current;
 select.textContent='';
 const opt=(v,t)=>{const o=document.createElement('option');o.value=v;o.textContent=t;select.appendChild(o);};
 opt('yandex:lera','🇷🇺 Яндекс · Лера (friendly)');
 opt('yandex:dasha','🇷🇺 Яндекс · Даша (friendly)');
 opt('auto','Русский голос браузера');
 const ru=(window.speechSynthesis?.getVoices?.()||[]).filter(v=>/^ru([_-]|$)/i.test(v.lang||''));
 ru.forEach(v=>opt('native:'+v.voiceURI,'В Windows: '+v.name));
 // Former OpenAI TTS voices hidden: pilot uses Russian SpeechKit voices.
 select.value=[...select.options].some(o=>o.value===value)?value:'auto';
}
function mount(){
 panel=document.querySelector('.rva-window');
 if(!panel||panel.dataset.voiceQualityV3)return false;
 panel.dataset.voiceQualityV3='1';
 const actions=panel.querySelector('.rva-control');
 const mute=panel.querySelector('.rva-mute');
 if(!actions||!mute)return false;
 const wrap=document.createElement('div');
 wrap.style.cssText='display:flex;flex-wrap:wrap;gap:6px;align-items:center';
 const title=document.createElement('label');
 title.textContent='Голос помощника:';title.style.cssText='font-size:12px;white-space:nowrap';
 select=document.createElement('select');select.setAttribute('aria-label','Голос помощника');
 select.style.cssText='background:#fff;color:#11203d;border-radius:7px;padding:7px;max-width:100%;min-width:175px;flex:1;font-size:12px;border:1px solid #6a82a2';
 testBtn=document.createElement('button');
 testBtn.type='button';testBtn.className='rva-btn';testBtn.textContent='▶ Проверить';testBtn.style.padding='7px';
 wrap.append(title,select,testBtn);
 actions.insertBefore(wrap,mute.parentElement);
 const caption=document.createElement('div');
 caption.textContent='Лера и Даша — готовые русские голоса Yandex SpeechKit, не фирменный голос Алисы. При выборе Яндекса текст короткого ответа (до 240 символов) отправляется в SpeechKit после согласия. Лимит 20 ответов и 5000 символов в день. Голос браузера бесплатный.';
 caption.style.cssText='color:#b6c7db;font-size:10px;line-height:1.45';
 wrap.after(caption);
 fillVoices();
 window.speechSynthesis?.addEventListener?.('voiceschanged',fillVoices);
 select.addEventListener('change',()=>{
   const chosen=select.value;stopSpeech();
   if(chosen.startsWith('yandex:')&&!approvedYandex){
      const yes=confirm('Включить русский голос Yandex SpeechKit (Лера или Даша)? Для озвучивания текст ответа (до 240 символов) будет отправляться через защищённый сервер CRM в Yandex Cloud. Сервис тарифицируется по запросам; лимит 20 ответов в день. Это не оригинальный голос Алисы. Разрешить?');
      if(!yes){select.value=current;return;}
      approvedYandex=true;
   }
   if(chosen.startsWith('cloud:')&&!approvedCloud){
      const yes=confirm('Использовать нейросетевую озвучку OpenAI? Текст ответа (максимум 350 символов) отправляется через защищённый сервер CRM в облачный сервис. Это платная API-услуга; установлен лимит 20 озвучиваний и 5000 символов на день. Голос сгенерирован ИИ и не является голосом Алисы. Разрешить?');
      if(!yes){select.value=current;return;}
      approvedCloud=true;
   }
   current=chosen;
   if(chosen.startsWith('yandex:')){
     setStatus('Проверяю подключение Yandex SpeechKit…');
     Promise.resolve(db.functions.invoke('crm-voice-yandex-tts-v1',{body:{kind:'status'}})).then(resp=>{
       if(current!==chosen)return;
       if(resp.error) {setStatus('Не удалось проверить подключение Яндекса. Перезайди в CRM или попробуй позднее.');return;}
       setStatus(resp.data?.configured?'Голос '+(chosen.endsWith('lera')?'Лера':'Даша')+' выбран. API-ключ найден на сервере. Нажми «Проверить» для настоящего теста.':'Голоса Лера и Даша добавлены, но Yandex Cloud пока не подключён: нужен API-ключ SpeechKit в секретах Supabase.');
     }).catch(()=>{if(current===chosen)setStatus('Проверка подключения Яндекса временно недоступна.');});
   }else setStatus('Голос выбран. Нажми «Проверить» для прослушивания.');
 });
 testBtn.addEventListener('click',()=>{
   if(!allowed())return;
   stopSpeech();
   void window.crmResantaVoiceSpeakV3('Здравствуйте! Я голосовой помощник Ресанта. Могу помочь открыть разделы CRM и проверить задачи.');
 });
 mute.addEventListener('click',stopSpeech,true);
 panel.querySelector('.rva-close')?.addEventListener('click',stopSpeech,true);
 prevVisible=!panel.hidden;
 return true;
}
window.setInterval(()=>{
 if(!panel)mount();
 else{
   const isVisible=!panel.hidden&&allowed()&&!document.hidden;
   if(!isVisible&&prevVisible)stopSpeech();
   prevVisible=isVisible;
 }
},800);
window.addEventListener('pagehide',stopSpeech);
document.addEventListener('visibilitychange',()=>{if(document.hidden)stopSpeech();});
mount();
})();