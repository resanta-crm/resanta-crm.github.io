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
let panel,select,testBtn,budgetLabel,output=null,outputUrl='',browserDone=null,audioDone=null,approvedCloud=false,approvedYandex=false;
let current='yandex:lera',epoch=0,prevVisible=true,paused=false;
const VOICE_KEY='resanta-ai360-yandex-voice-v4';
const CONSENT_KEY='resanta-ai360-yandex-consent-monthly-v5';
try {
 const saved=window.localStorage?.getItem(VOICE_KEY);
 if(saved==='yandex:lera'||saved==='yandex:dasha')current=saved;
 approvedYandex=window.localStorage?.getItem(CONSENT_KEY)==='yes';
} catch (_) { /* private browsing may deny storage; consent then stays in memory */ }
function remember(key,value){try{window.localStorage?.setItem(key,value);}catch(_){}}
function approveYandex(){
 if(approvedYandex)return true;
 const ok=window.confirm('Включить озвучку ответов РЕСАНТА AI голосами Яндекс Лера и Даша? Полный текст будет безопасно разбиваться на короткие фразы и отправляться через сервер CRM в Yandex SpeechKit. Услуга платная, расчётный лимит: до 5 000 российских рублей за календарный месяц для Яндекс SpeechKit v3 general. Этот лимит не включает OpenAI и другие расходы. Разрешить?');
 if(!ok)return false;
 approvedYandex=true;
 remember(CONSENT_KEY,'yes');
 return true;
}
// A deliberate first wake activation also requests permission for the neural voice.
window.crmResantaVoiceAuthorizeV3=approveYandex;
window.crmResantaVoiceHasConsentV3=()=>approvedYandex;
const allowed=()=>{try{return typeof currentUser!=='undefined'&&!!currentUser?.id&&typeof currentProfile!=='undefined'&&currentProfile?.role==='boss'&&String(currentProfile?.name||'').trim().replace(/\s+/g,' ').toLowerCase()==='александр паюшин'&&document.getElementById('app')?.style.display!=='none';}catch{return false;}};
// Only speech text is normalized. Screen figures, source dates and CRM data stay unchanged.
const MONTH_GEN=['','января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'];
const MONTH_NOM=['','январь','февраль','март','апрель','май','июнь','июль','август','сентябрь','октябрь','ноябрь','декабрь'];
const DAY_ORD=['','первого','второго','третьего','четвёртого','пятого','шестого','седьмого','восьмого','девятого','десятого','одиннадцатого','двенадцатого','тринадцатого','четырнадцатого','пятнадцатого','шестнадцатого','семнадцатого','восемнадцатого','девятнадцатого','двадцатого'];
function speechYear(year){
 const n=Number(year);
 if(n>=2021&&n<=2029)return 'две тысячи двадцать '+DAY_ORD[n-2020]+' года';
 if(n===2020)return 'две тысячи двадцатого года';
 return String(year)+' года';
}
function speechDay(day){
 const n=Number(day);
 if(n>=1&&n<=20)return DAY_ORD[n];
 if(n>=21&&n<=29)return 'двадцать '+DAY_ORD[n-20];
 if(n===30)return 'тридцатого';
 if(n===31)return 'тридцать первого';
 return String(day);
}
function pronounceDates(value){
 return String(value||'')
  .replace(/\b(20\d{2})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])\b/g,
   (_,y,m,d)=>speechDay(d)+' '+MONTH_GEN[Number(m)]+' '+speechYear(y))
  .replace(/\b(0?[1-9]|[12]\d|3[01])\.(0?[1-9]|1[0-2])\.(20\d{2})\b/g,
   (full,d,m,y)=>Number(d)<=31&&Number(m)<=12?
    speechDay(d)+' '+MONTH_GEN[Number(m)]+' '+speechYear(y):full)
  .replace(/\b(20\d{2})-(0[1-9]|1[0-2])\b/g,
   (_,y,m)=>MONTH_NOM[Number(m)]+' '+speechYear(y))
  .replace(/\b(0?[1-9]|1[0-2])\.(20\d{2})\b/g,
   (_,m,y)=>MONTH_NOM[Number(m)]+' '+speechYear(y));
}
function rubleWord(n){
 const a=Math.abs(Number(n))%100,unit=a%10;
 if(a>=11&&a<=14)return 'белорусских рублей';
 if(unit===1)return 'белорусский рубль';
 if(unit>=2&&unit<=4)return 'белорусских рубля';
 return 'белорусских рублей';
}
function kopeckWord(n){
 const a=Math.abs(Number(n))%100,unit=a%10;
 if(a>=11&&a<=14)return 'копеек';
 if(unit===1)return 'копейка';
 if(unit>=2&&unit<=4)return 'копейки';
 return 'копеек';
}
function pronounceBYN(value){
 return String(value||'').replace(
  /(^|[^\d])(\d{1,3}(?:[ \u00a0\u202f]\d{3})+|\d+)(?:[,.](\d{1,2}))?\s+BYN\b/giu,
  (full,prefix,units,coins)=>{
   const value=Number(units.replace(/[ \u00a0\u202f]/g,''));
   if(!Number.isSafeInteger(value))return full;
   const whole=units+' '+rubleWord(value);
   return prefix+whole+(coins && Number(coins)>0?
     ' '+Number(coins)+' '+kopeckWord(Number(coins)):'');
  });
}
function cleanSpeech(t){
 return String(t||'')
  .replace(/\*\*([^*]+)\*\*/g,'$1')
  .replace(/__([^_]+)__/g,'$1')
  .replace(/(^|\n)\s*(?:\d+[.)]\s*|[•-]\s+)/g,'$1')
  .replace(/[*_`#]/g,'')
  .replace(/\r?\n/g,'. ')
  .replace(/.+/s,phrase=>pronounceBYN(phrase))
  .replace(/\bBYN\b/gi,'белорусских рублей')
  .replace(/.+/s,phrase=>pronounceDates(phrase))
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
async function refreshMonthlyBudget(){
 if(!allowed()||!budgetLabel)return;
 try{
  const auth=await window.crmEnsureFreshSessionV236166?.(false);
  if(!auth?.access_token)return;
  const r=await db.functions.invoke('crm-voice-yandex-tts-v1',{body:{kind:'status'}});
  const b=r.data?.budget;
  if(r.error||!b||typeof b.reserved_rub!=='number'&&typeof b.reserved_rub!=='string')return;
  const total=Number(b.reserved_rub);
  const max=Number(b.limit_rub)||5000;
  budgetLabel.textContent='Озвучка Яндекс за '+String(b.month||'этот месяц')+': ~'+total.toLocaleString('ru-RU',{minimumFractionDigits:2,maximumFractionDigits:2})+' ₽ из '+max.toLocaleString('ru-RU')+' ₽ (расчётный расход, не счёт Яндекса).';
 }catch(e){console.warn('AI360 monthly voice budget status unavailable',String(e?.message||'error').slice(0,80));}
}
const setStatus=(txt)=>{const el=panel?.querySelector('.rva-status');if(el)el.textContent=txt;};
function stopSpeech(){
 paused=false;
 epoch++;
 updatePlaybackControls();
 window.__resantaVoiceOutputBusy=false;
 if(output){try{output.pause();output.currentTime=0;}catch{}output=null;}
 if(audioDone){const resolve=audioDone;audioDone=null;resolve();}
 if(outputUrl){URL.revokeObjectURL(outputUrl);outputUrl='';}
 try{speechSynthesis.cancel();}catch{}
 if(browserDone){const resolve=browserDone;browserDone=null;resolve();}
}
// Playback is independent of the foreground microphone capture.
function updatePlaybackControls(){
 const btn=panel?.querySelector('.rva-pause-audio');
 if(btn){btn.textContent=paused?'▶ Продолжить':'⏸ Пауза';btn.setAttribute('aria-pressed',String(paused));}
}
window.crmResantaVoiceTogglePauseV3=()=>{
 if(!allowed()||!panel||panel.hidden||!window.__resantaVoiceOutputBusy)return false;
 paused=!paused;
 if(output){
  try{if(paused)output.pause();else Promise.resolve(output.play()).catch(e=>setStatus('Не удалось продолжить воспроизведение: '+String(e?.message||e).slice(0,100)));}catch(e){console.warn('Voice pause/resume',e);}
 }
 updatePlaybackControls();
 setStatus(paused?'⏸ Озвучка на паузе.':'🔊 Озвучка продолжается.');
 return paused;
};
// The visible stop button can interrupt SpeechKit without revoking mic permission.
window.crmResantaVoiceStopV3=()=>{
 if(!allowed()||!panel||panel.hidden)return false;
 stopSpeech();
 setStatus('■ Озвучка остановлена. Полный текст ответа остался на экране.');
 return true;
};
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
 if(!isYandex)setStatus('Готовлю естественный голос…'); // keep per-part progress visible for Lera/Dasha
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
window.crmResantaVoiceSpeakV3=async function(message,options={}){
 const msg=cleanSpeech(message);
 if(!msg||!allowed())return;
 stopSpeech(); // A new reply cancels every older audio clip and queue.
 const run=epoch;
 window.__resantaVoiceOutputBusy=true;
 try{
   if(!current.startsWith('yandex:')||!approvedYandex){
     setStatus('Голос Яндекса ещё не разрешён. Включи «Привет, Ресанта» и подтверди озвучку. Кнопка проверки необязательна.');
     return;
   }
   const chunks=speechChunks(msg);
   updatePlaybackControls();
   let completed=0;
   for(let i=0;i<chunks.length;i++){
     if(run!==epoch||!allowed()||panel?.hidden)break;
     while(paused&&run===epoch&&allowed()&&!panel?.hidden)
       await new Promise(r=>setTimeout(r,180));
     if(run!==epoch||!allowed()||panel?.hidden)break;
     const name=current.endsWith('dasha')?'Даша':'Лера';
     setStatus('🔊 '+name+' озвучивает ответ: фраза '+(i+1)+' из '+chunks.length);
     try{
       await cloudSpeak(chunks[i],current.slice(7),run,'yandex');
       if(run===epoch)completed++;
     }catch(e){
       if(run!==epoch)break;
       const why=String(e?.message||e);
       console.warn('AI360 Yandex narration stopped at segment '+(i+1)+':',why);
       let explanation;
       if(why.includes('tts_monthly_budget_exhausted')){
         explanation='Месячный бюджет Яндекс-озвучки 5 000 российских рублей исчерпан.';
       }else if(why.includes('tts_monthly_budget_unavailable')){
         explanation='Сервер временно не смог проверить месячный бюджет озвучки. Расход не подтверждён.';
       }else if(why.includes('tts_quota_check_unavailable')||why.includes('quota_unavailable')){
         explanation='Сервер пока не смог проверить лимит озвучки. Можно повторить попытку.';
       }else{
         explanation='Яндекс не смог озвучить эту часть ('+why+').';
       }
       setStatus(explanation+' Озвучено '+completed+' из '+chunks.length+' фрагментов. Полный ответ остался текстом.');
       break; // Do not silently replace the selected voice with Microsoft voices.
     }
   }
   if(run===epoch && completed===chunks.length)setStatus(options?.shortSummary?
     '✅ Озвучен краткий итог ('+completed+' '+(completed===1?'фраза':'фраз')+'). Полный анализ остался на экране. Скажи «расскажи подробнее» для полной озвучки.':
     '✅ '+(current.endsWith('dasha')?'Даша':'Лера')+' озвучила ответ полностью ('+completed+' '+(completed===1?'фраза':'фраз')+').');
   if(run===epoch)void refreshMonthlyBudget();
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
 const actions=panel.querySelector('.rva-settings-body')||panel.querySelector('.rva-control');
 const mute=panel.querySelector('.rva-mute');
 if(!actions||!mute)return false;
 const wrap=document.createElement('div');
 wrap.style.cssText='display:flex;flex-wrap:wrap;gap:6px;align-items:center';
 const title=document.createElement('label');
 title.textContent='Голос помощника:';title.style.cssText='font-size:12px;white-space:nowrap';
 select=document.createElement('select');select.setAttribute('aria-label','Голос помощника');
 select.style.cssText='background:#fff;color:#11203d;border-radius:7px;padding:7px;max-width:100%;min-width:175px;flex:1;font-size:12px;border:1px solid #6a82a2';
 testBtn=document.createElement('button');
 testBtn.type='button';testBtn.className='rva-btn';testBtn.textContent='▶ Послушать пример голоса';testBtn.style.padding='7px';
 wrap.append(title,select);
 if(actions.classList?.contains('rva-settings-body'))actions.appendChild(wrap);
 else actions.insertBefore(wrap,mute.parentElement);
 const caption=document.createElement('div');
 caption.textContent='Только Лера и Даша · Яндекс SpeechKit v3. Длинный ответ произносится по частям. Месячный расчётный бюджет Яндекс-озвучки — 5 000 ₽ (РФ, с НДС). Распознавание и интеллект OpenAI отдельно. При ошибке полный ответ остаётся на экране.';
 caption.style.cssText='color:#b6c7db;font-size:10px;line-height:1.45';
 wrap.after(caption);
 const optionalPreview=document.createElement('details');
 optionalPreview.style.cssText='font-size:11px;color:#b6c7db';
 const summary=document.createElement('summary');
 summary.textContent='Проверка звучания (необязательно)';
 summary.style.cssText='cursor:pointer';
 optionalPreview.append(summary,testBtn);
 caption.after(optionalPreview);
 budgetLabel=document.createElement('div');
 budgetLabel.setAttribute('aria-live','polite');
 budgetLabel.style.cssText='color:#e0eaff;font-size:11px;line-height:1.4;margin-top:1px';
 budgetLabel.textContent='Расход Яндекс-озвучки: проверяю месячный бюджет…';
 optionalPreview.after(budgetLabel);
 void refreshMonthlyBudget();
 fillVoices();
 if(!approvedYandex)setStatus('Основной голос — Лера. Разрешение озвучки появится при первом включении «Привет, Ресанта». Проверка голоса необязательна.');
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
 panel.querySelector('.rva-pause-audio')?.addEventListener('click',()=>window.crmResantaVoiceTogglePauseV3());
 updatePlaybackControls();
 prevVisible=!panel.hidden;
 return true;
}
window.setInterval(()=>{
 if(!panel)mount();
 else{
   const isVisible=!panel.hidden&&allowed();
   if(!isVisible&&prevVisible)stopSpeech();
   prevVisible=isVisible;
 }
},800);
window.addEventListener('pagehide',stopSpeech);
// Tab switching to ChatGPT pauses mic capture in 135, not SpeechKit playback.
mount();
})();