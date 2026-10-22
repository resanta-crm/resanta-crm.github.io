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
let current='yandex:lera',epoch=0,prevVisible=true;
const VOICE_KEY='resanta-ai360-yandex-voice-v4';
const CONSENT_KEY='resanta-ai360-yandex-consent-v4';
try {
 const saved=window.localStorage?.getItem(VOICE_KEY);
 if(saved==='yandex:lera'||saved==='yandex:dasha')current=saved;
 approvedYandex=window.localStorage?.getItem(CONSENT_KEY)==='yes';
} catch (_) { /* private browsing may deny storage; consent then stays in memory */ }
function remember(key,value){try{window.localStorage?.setItem(key,value);}catch(_){}}
function approveYandex(){
 if(approvedYandex)return true;
 const ok=window.confirm('Включить озвучку ответов РЕСАНТА AI голосами Яндекс Лера и Даша? Полный текст будет безопасно разбиваться на короткие фразы и отправляться через сервер CRM в Yandex SpeechKit. Услуга платная: до 40 фраз и 5000 символов за день для твоей учётной записи. Разрешить?');
 if(!ok)return false;
 approvedYandex=true;
 remember(CONSENT_KEY,'yes');
 return true;
}
const allowed=()=>{try{return typeof currentUser!=='undefined'&&!!currentUser?.id&&typeof currentProfile!=='undefined'&&currentProfile?.role==='boss'&&String(currentProfile?.name||'').trim().replace(/\s+/g,' ').toLowerCase()==='александр паюшин'&&document.getElementById('app')?.style.display!=='none';}catch{return false;}};
function cleanSpeech(t){
 return String(t||'')
  .replace(/\*\*([^*]+)\*\*/g,'$1')
  .replace(/__([^_]+)__/g,'$1')
  .replace(/(^|\n)\s*(?:\d+[.)]\s*|[•-]\s+)/g,'$1')
  .replace(/[*_`#]/g,'')
  .replace(/\r?\n/g,'. ')
  .replace(/\s+/g,' ').replace(/\.{2,}/g,'.').trim();
}
// SpeechKit v3: a standard utterance must stay within 250 characters and 24 seconds.
// 205 characters also leaves a duration margin for slower Russian narration.
function speechChunks(t,max=205){
 const remaining=cleanSpeech(t), result=[];
 let rest=remaining;
 while(rest.length>max){
  const candidate=rest.slice(0,max);
  let cut=0;
  for(const match of candidate.matchAll(/[.!?;:]\s+/g)){
    const pos=match.index+match[0].length;
    if(pos>=Math.floor(max*0.52))cut=pos;
  }
  if(!cut)for(const match of candidate.matchAll(/,\s+/g)){
    const pos=match.index+match[0].length;
    if(pos>=Math.floor(max*0.65))cut=pos;
  }
  if(!cut){const pos=candidate.lastIndexOf(' ');cut=pos>Math.floor(max*0.5)?pos:max;}
  const piece=rest.slice(0,cut).trim();
  if(piece)result.push(piece);
  rest=rest.slice(cut).trim();
 }
 if(rest)result.push(rest);
 return result;
}
window.crmAI360SpeechChunksV4=speechChunks;
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
 const voiceText=msg;
 if(isYandex && msg.length>240)throw new Error('voice_chunk_too_long');
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
 // Release the previous completed part, preserving the newest playback.
 if(output){try{output.pause();}catch(_){}output=null;}
 if(outputUrl){URL.revokeObjectURL(outputUrl);outputUrl='';}
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
 const msg=cleanSpeech(message);
 if(!msg||!allowed())return;
 stopSpeech(); // A new reply cancels every older audio clip and queue.
 const run=epoch;
 window.__resantaVoiceOutputBusy=true;
 try{
   if(!current.startsWith('yandex:')||!approvedYandex){
     setStatus('Выбрана Лера. Нажми «▶ Проверить», чтобы разрешить озвучку через Яндекс.');
     return;
   }
   const chunks=speechChunks(msg);
   let completed=0;
   for(let i=0;i<chunks.length;i++){
     if(run!==epoch||!allowed()||panel?.hidden||document.hidden)break;
     const name=current.endsWith('dasha')?'Даша':'Лера';
     setStatus('🔊 '+name+' озвучивает ответ: фраза '+(i+1)+' из '+chunks.length);
     try{
       await cloudSpeak(chunks[i],current.slice(7),run,'yandex');
       if(run===epoch)completed++;
     }catch(e){
       if(run!==epoch)break;
       const why=String(e?.message||e);
       console.warn('AI360 Yandex narration stopped at segment '+(i+1)+':',why);
       setStatus(why.includes('tts_daily_limit')
          ?'Дневной лимит Яндекс исчерпан: озвучено '+completed+' из '+chunks.length+' частей. Полный ответ доступен текстом.'
          :'Яндекс прервал озвучку на части '+(i+1)+' из '+chunks.length+' ('+why+'). Полный ответ доступен текстом.');
       break; // Do not silently replace the selected voice with Microsoft voices.
     }
   }
   if(run===epoch && completed===chunks.length)setStatus('✅ '+(current.endsWith('dasha')?'Даша':'Лера')+' озвучила ответ полностью ('+completed+' '+(completed===1?'фраза':'фраз')+').');
 }finally{
   if(run===epoch){
     if(output){try{output.pause();}catch(_){}output=null;}
     if(outputUrl){URL.revokeObjectURL(outputUrl);outputUrl='';}
     await new Promise(r=>setTimeout(r,250));
     if(run===epoch)window.__resantaVoiceOutputBusy=false;
   }
 }
};

function fillVoices(){
 if(!select)return;
 select.textContent='';
 for(const [value,title] of [
  ['yandex:lera','🇷🇺 Яндекс · Лера (friendly)'],
  ['yandex:dasha','🇷🇺 Яндекс · Даша (friendly)']
 ]){
  const option=document.createElement('option');option.value=value;option.textContent=title;select.appendChild(option);
 }
 if(current!=='yandex:lera'&&current!=='yandex:dasha')current='yandex:lera';
 select.value=current;
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
 caption.textContent='Только Лера и Даша · Яндекс SpeechKit. Длинный ответ автоматически произносится целиком несколькими фразами после согласия. Ограничение расходов: до 40 фраз и 5000 символов за день. При ошибке полный текст ответа остаётся на экране.';
 caption.style.cssText='color:#b6c7db;font-size:10px;line-height:1.45';
 wrap.after(caption);
 fillVoices();
 if(!approvedYandex)setStatus('Основной голос — Лера. Нажми «▶ Проверить» и разреши Яндекс SpeechKit один раз.');
 select.addEventListener('change',()=>{
   const chosen=select.value;
   if(chosen!=='yandex:lera'&&chosen!=='yandex:dasha'){select.value=current;return;}
   if(!approveYandex()){select.value=current;return;}
   stopSpeech();
   current=chosen;
   remember(VOICE_KEY,current);
   setStatus('Голос '+(chosen.endsWith('lera')?'Лера':'Даша')+' закреплён. Можно задавать вопросы.');
 });
 testBtn.addEventListener('click',()=>{
   if(!allowed())return;
   if(!approveYandex()){setStatus('Разрешение на озвучку через Яндекс пока не дано.');return;}
   remember(VOICE_KEY,current);
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