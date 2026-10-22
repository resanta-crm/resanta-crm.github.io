/* RESANTA AI 360 voice capture rescue v2, 2026-10-22.
 * Browser SpeechRecognition isn't dependable (seen in the video on Yandex Browser).
 * Explicit opt-in: getUserMedia + MediaRecorder -> authenticated Supabase STT.
 * Standalone override of voice UI buttons; existing CRM AI and data remain intact.
 */
(function(){
 'use strict';
 // v23.7.14: 21 Oct Android incident; avoid optional voice APIs on all Android browsers and WebViews.
 if (/Android/i.test(navigator.userAgent || '')) return;

 if(window.__resantaVoiceCaptureV2)return;
 window.__resantaVoiceCaptureV2=true;
 const ENDPOINT='crm-voice-transcribe-v1';
 let panel,mic,wake,status,field,send,meter;
 let mode='',stream=null,context=null,analyser=null,src=null,clock=0,segment=0,starting=false,busy=false;
 let wakeHeard=false,wakeStart=0,clipCount=0,activeRecorder=null,userOptIn=false,listenEpoch=0;
 const WAIT_RE=/(?:^|[^а-яё])привет[\s,!.?—-]+(?:ресанта|резанта|рясанта|рисанта)(?=$|[^а-яё])/i;
 const isOwner=()=>{try{return typeof currentUser!=='undefined'&&!!currentUser?.id&&typeof currentProfile!=='undefined'&&currentProfile?.role==='boss'&&String(currentProfile?.name||'').trim().replace(/\s+/g,' ').toLowerCase()==='александр паюшин'&&document.getElementById('app')?.style.display!=='none';}catch{return false;}};
 function info(t){if(status)status.textContent=t;}
 function controls(){
   if(wake)wake.textContent=mode==='wake'?'■ Отключить фразу':'◉ Включить «Привет, Ресанта»';
   if(mic)mic.textContent=mode==='manual'?'■ Остановить запись':'🎤 Спросить голосом';
 }
 function reason(e){
   const code=String(e?.name||e?.code||'');
   const msg={
     NotAllowedError:'Доступ к микрофону запрещён. Разреши его для resanta-crm.by в настройках браузера.',
     PermissionDeniedError:'Нет разрешения на микрофон. Проверь значок разрешений рядом с адресом сайта.',
     NotFoundError:'Не обнаружен микрофон. Проверь устройство ввода в Windows.',
     NotReadableError:'Микрофон занят или недоступен. Закрой другие приложения, использующие его.',
     OverconstrainedError:'Микрофон не подходит под выбранные параметры.',
     SecurityError:'Браузер заблокировал микрофон: проверь настройки безопасности.',
     AbortError:'Подключение микрофона прервалось.',
   };
   return msg[code]||('Не удалось включить микрофон: '+code+'. '+String(e?.message||'').slice(0,100));
 }
 async function stopAll(message){
   mode='';listenEpoch++;clearInterval(clock);clock=0;clearTimeout(segment);segment=0;
   try{activeRecorder&&activeRecorder.state==='recording'&&activeRecorder.stop();}catch{}
   activeRecorder=null;
   try{src?.disconnect();}catch{}src=null;
   try{analyser?.disconnect();}catch{}analyser=null;
   try{await context?.close();}catch{}context=null;
   try{stream?.getTracks().forEach(t=>t.stop());}catch{}stream=null;
   if(meter){meter.value=0;meter.hidden=true;}
   busy=false;starting=false;wakeHeard=false;controls();
   if(message)info(message);
 }
 function audioRms(){
   if(!analyser)return -1;
   const buffer=new Uint8Array(analyser.fftSize);
   analyser.getByteTimeDomainData(buffer);
   let sum=0;for(const b of buffer){const x=(b-128)/128;sum+=x*x;}
   return Math.sqrt(sum/buffer.length);
 }
 function addMeter(){
   if(meter)return;
   meter=document.createElement('progress');meter.className='rva-mic-meter';meter.max=100;meter.value=0;meter.hidden=true;
   meter.setAttribute('aria-label','Уровень звука с микрофона');
   meter.style.cssText='width:100%;height:9px;accent-color:#64b5f6;display:block;';
   meter.hidden=true;status?.after(meter);
 }
 async function permission(){
   if(stream?.active)return;
   if(!navigator.mediaDevices?.getUserMedia){throw Object.assign(new Error('getUserMedia not supported'),{name:'UnsupportedBrowser'});}
   info('Запрашиваю доступ к микрофону…');
   stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true},video:false});
   if(!window.MediaRecorder){throw Object.assign(new Error('MediaRecorder unavailable'),{name:'UnsupportedRecorder'});}
   try{
     const Audio=window.AudioContext||window.webkitAudioContext;
     if(Audio){context=new Audio();src=context.createMediaStreamSource(stream);analyser=context.createAnalyser();analyser.fftSize=1024;src.connect(analyser);await context.resume();}
   }catch(e){console.warn('Voice mic meter unavailable',e);analyser=null;}
   addMeter();if(meter)meter.hidden=!analyser;
   info('Микрофон подключён. Скажи команду.');
 }
 function codec(){
   const candidates=['audio/webm;codecs=opus','audio/webm','audio/mp4'];
   return candidates.find(x=>MediaRecorder.isTypeSupported(x))||'';
 }
 function capture(sec,epoch){
   return new Promise((resolve,reject)=>{
     if(!stream?.active||epoch!==listenEpoch){resolve(null);return;}
     let rec,parts=[],timer=0,poll=0,lastLoud=0,loud=false,peak=0,start=Date.now(),stopped=false;
     try{const m=codec();rec=new MediaRecorder(stream,m?{mimeType:m}:undefined);activeRecorder=rec;}
     catch(e){reject(e);return;}
     const end=()=>{if(stopped)return;stopped=true;clearTimeout(timer);clearInterval(poll);try{rec.state==='recording'&&rec.stop();}catch(e){reject(e);}};
     rec.ondataavailable=e=>{if(e.data?.size)parts.push(e.data);};
     rec.onerror=e=>{clearTimeout(timer);clearInterval(poll);reject(e.error||new Error('Ошибка записи'));};
     rec.onstop=()=>{
       clearTimeout(timer);clearInterval(poll);
       if(activeRecorder===rec)activeRecorder=null;
       const duration=(Date.now()-start)/1000;
       const mime=rec.mimeType||'audio/webm';
       resolve({blob:new Blob(parts,{type:mime}),duration,loud,peak});
     };
     try{rec.start(250);}catch(e){reject(e);return;}
     poll=window.setInterval(()=>{
       const rms=audioRms();
       if(rms>=0){peak=Math.max(peak,rms);if(meter)meter.value=Math.min(100,Math.round(rms*3000));}
       if(rms>.0035){loud=true;lastLoud=Date.now();}
       if(loud && Date.now()-start>1250 && Date.now()-lastLoud>(mode==='wake'?950:1200))end();
       if(epoch!==listenEpoch || !mode)end();
     },110);
     timer=window.setTimeout(end,sec*1000);
   });
 }
 function cloudError(error){
   const code=String(error?.code||error?.context?.error||error?.message||'');
   if(/voice_daily_limit|429|daily_limit/.test(code))return 'Лимит распознавания на сегодня исчерпан (60 фраз).';
   if(/speech_provider_unconfigured|503/.test(code))return 'Сервис речи ещё не настроен на сервере CRM.';
   if(/audio_(size|duration)/.test(code))return 'Фраза слишком длинная. Повтори короче.';
   if(/not_authorized|401|403/.test(code))return 'Доступ к серверу речи не подтверждён. Перезайди в CRM.';
   if(/quota_unavailable/.test(code))return 'Сервис лимитов речи временно недоступен.';
   return 'Не удалось распознать речь через сервер. Ошибка: '+code.slice(0,120);
 }
 async function transcribe(clip,epoch){
   if(!clip||epoch!==listenEpoch || !mode)return null;
   if(!clip.blob?.size || clip.blob.size<900)return '';
   if(clip.blob.size>500000){info('Запись слишком большая. Скажи короче.');return '';}
   let session=null;
   try{session=await window.crmEnsureFreshSessionV236166?.(false);}
   catch(e){info('CRM потеряла авторизацию. Обнови страницу и войди заново.');return null;}
   if(!session?.access_token){info('Не удалось подтвердить сессию CRM.');return null;}
   const form=new FormData(),type=clip.blob.type||'audio/webm';
   form.append('audio',new File([clip.blob], 'question.'+(type.includes('mp4')?'mp4':'webm'),{type}));
   form.append('duration',String(Math.min(16.4,clip.duration)));
   busy=true;info('Распознаю фразу…');
   try{
     const resp=await db.functions.invoke(ENDPOINT,{body:form});
     if(epoch!==listenEpoch||!mode)return null;
     if(resp.error){let detail=null;try{detail=await resp.error.context?.json?.();}catch{}info(cloudError({message:resp.error.message,code:detail?.error||''}));return null;}
     return String(resp.data?.text||'').trim();
   }catch(e){if(epoch===listenEpoch)info(cloudError(e));return null;}
   finally{busy=false;}
 }
 function submit(command){
   const text=String(command||'').trim();if(!text)return;
   field.value=text;send.click();
 }
 function greetingOnly(text){
   const match=WAIT_RE.exec(String(text||'').trim());
   if(!match)return false;
   return !String(text).slice(match.index+match[0].length).replace(/[\s,.!?]+/g,'');
 }
 async function waitForAssistant(epoch,expectedMode){
   // UI dispatch queues the neural voice on the next microtask.
   await new Promise(r=>setTimeout(r,260));
   const until=Date.now()+32000;
   while(epoch===listenEpoch && mode===expectedMode && isOwner() && panel && !panel.hidden && !document.hidden &&
         Date.now()<until && (window.__resantaVoiceOutputBusy || window.__resantaAI360PendingV1 ||
                              window.speechSynthesis?.speaking)){
     await new Promise(r=>setTimeout(r,230));
   }
 }
 async function manualLoop(epoch){
   try{
     const clip=await capture(10,epoch);
     if(epoch!==listenEpoch || mode!=='manual')return;
     if(clip && !clip.loud)info('Уровень микрофона низкий. Всё равно пробую распознать записанную фразу…');
     const phrase=await transcribe(clip,epoch);
     if(epoch!==listenEpoch||mode!=='manual')return;
     if(phrase && greetingOnly(phrase)){
       // Manual mode: after 'Привет, Ресанта' reply, listen for exactly ONE follow-up
       // without converting an explicit manual session into persistent hot-mic mode.
       submit('Привет, Ресанта');
       await waitForAssistant(epoch,'manual');
       if(epoch!==listenEpoch||mode!=='manual')return;
       info('Слушаю вопрос после приветствия…');
       const second=await capture(10,epoch);
       if(epoch!==listenEpoch||mode!=='manual')return;
       const question=await transcribe(second,epoch);
       if(epoch!==listenEpoch||mode!=='manual')return;
       await stopAll();
       if(question)submit(question);
       else info('Вопрос не расслышала. Нажми микрофон ещё раз.');
     }else if(phrase){await stopAll();submit(phrase);}
     else {await stopAll();info('Речь не распознана. Попробуй говорить ближе к микрофону.');}
   }catch(e){await stopAll(reason(e));}
 }
 async function wakeLoop(epoch){
   try{
     while(mode==='wake' && epoch===listenEpoch && isOwner() && panel && !panel.hidden && !document.hidden){
       if(Date.now()-wakeStart > 5*60*1000){await stopAll('Для экономии отключил микрофон через 5 минут. Включи фразу снова, когда нужно.');break;}
       if(clipCount>=50){await stopAll('Завершил сеанс для ограничения расходов на распознавание.');break;}
       if(window.speechSynthesis?.speaking || window.__resantaVoiceOutputBusy || window.__resantaAI360PendingV1){await new Promise(r=>setTimeout(r,350));continue;}
       const clip=await capture(5,epoch);
       if(epoch!==listenEpoch||mode!=='wake')break;
       if(!clip?.loud){info(wakeHeard?'Жду вопрос после приветствия…':'Микрофон включён: ожидаю «Привет, Ресанта»');continue;}
       clipCount++;
       const phrase=await transcribe(clip,epoch);
       if(epoch!==listenEpoch||mode!=='wake')break;
       if(phrase===null){await stopAll('Сервер распознавания недоступен. Проверь подключение и попробуй ещё раз.');break;}
       if(!phrase){info('Фраза не распознана. Повтори ближе к микрофону.');continue;}
       if(wakeHeard){
         submit(phrase);
         await waitForAssistant(epoch,'wake');
         if(epoch===listenEpoch&&mode==='wake')info('Слушаю следующий вопрос…');
       }else{
         const match=WAIT_RE.exec(phrase);
         if(!match){info('Слышу речь, но жду «Привет, Ресанта». Распознано: '+phrase.slice(0,65));continue;}
         const rest=phrase.slice(match.index+match[0].length).trim().replace(/^[\s,.!?]+/,'');
         wakeHeard=true; // Activation lasts at most five minutes in explicitly enabled wake mode.
         if(rest){
           submit(rest);
           await waitForAssistant(epoch,'wake');
           if(epoch===listenEpoch&&mode==='wake')info('Слушаю следующий вопрос…');
         }else{
           submit('Привет, Ресанта'); // local greeting, not a paid LLM request
           await waitForAssistant(epoch,'wake');
           if(epoch===listenEpoch&&mode==='wake')info('Слушаю твой вопрос…');
         }
       }
     }
   }catch(e){if(epoch===listenEpoch)await stopAll(reason(e));}
 }
 async function start(newMode){
   if(starting)return;
   if(mode===newMode){await stopAll('Микрофон выключен');return;}
   if(!isOwner())return;
   if(!userOptIn){
     const yes=window.confirm('РЕСАНТА AI: для надёжного распознавания русского голоса короткие аудиофрагменты будут отправляться через защищённый сервер CRM в облачный сервис распознавания. Запись не сохраняется в CRM. Стоимость около $0.003 за минуту аудио, общий лимит 60 фраз за день. Режим «Привет, Ресанта» автоматически выключается через 5 минут. Разрешить?');
     if(!yes)return;
     userOptIn=true;
   }
   starting=true;
   await stopAll();
   starting=true;
   mode=newMode;listenEpoch++;const epoch=listenEpoch;wakeStart=Date.now();clipCount=0;controls();
   window.speechSynthesis?.cancel();
   try{await permission();if(epoch!==listenEpoch)return;starting=false;
     if(newMode==='manual'){info('Слушаю команду. Максимум 10 секунд.');manualLoop(epoch);}
     else{info('Микрофон включён: ожидаю «Привет, Ресанта»');wakeLoop(epoch);}
   }catch(e){await stopAll(reason(e));}
 }
 function init(){
   panel=document.querySelector('.rva-window');
   if(!panel||panel.dataset.voiceCaptureV2)return false;
   panel.dataset.voiceCaptureV2='1';
   mic=panel.querySelector('.rva-mic');
   wake=panel.querySelector('.rva-wake');
   status=panel.querySelector('.rva-status');
   field=panel.querySelector('.rva-input');
   send=panel.querySelector('.rva-send');
   if(!mic||!wake||!status||!field||!send)return false;
   const note=panel.querySelector('.rva-note');
   if(note)note.textContent='Скажи «Привет, Ресанта» — помощник ответит и выслушает вопрос. В ручном режиме один вопрос записывается после приветствия, в режиме активации можно продолжить разговор до 5 минут. Распознавание — через сервер CRM после разрешения, максимум 60 фраз в сутки. При закрытии окна микрофон выключается.';
   mic.addEventListener('click',e=>{e.stopImmediatePropagation();e.preventDefault();void start('manual');},true);
   wake.addEventListener('click',e=>{e.stopImmediatePropagation();e.preventDefault();void start('wake');},true);
   panel.querySelector('.rva-close')?.addEventListener('click',()=>{void stopAll();},true);
   controls();return true;
 }
 document.addEventListener('visibilitychange',()=>{if(document.hidden && mode)void stopAll('Микрофон выключен: CRM свёрнута.');});
 window.addEventListener('pagehide',()=>{void stopAll();});
 window.setInterval(()=>{if(!panel)init();else if(mode && (!isOwner()||panel.hidden||!panel.isConnected))void stopAll();},650);
 init();
})();