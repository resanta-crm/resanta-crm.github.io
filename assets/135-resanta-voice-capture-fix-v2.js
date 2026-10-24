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
 // Short-term conversation context stays only in memory; no transcript storage.
 let resumeConversationUntil=0;
 const RESUME_WINDOW_MS=3*60*1000;
 const WAIT_RE=/(?:^|[^а-яё])привет[\s,!.?—-]+(?:ресанта|резанта|рясанта|рисанта)(?=$|[^а-яё])/i;
 // Persist only explicit consent. Never auto-open the voice panel, never
 // start a microphone on the CRM login screen or when the tab is hidden.
 const AUTO_WAKE_KEY='resanta-ai360-wake-window-optin-v1';
 let autoWakeWanted=false,autoAttemptedThisOpen=false,lastOpen=false,autoWakeBlocked=false;
 try{autoWakeWanted=window.localStorage?.getItem(AUTO_WAKE_KEY)==='yes';}catch(_){}
 if(autoWakeWanted)userOptIn=true;
 function saveAutoWake(v){
   autoWakeWanted=!!v;
   try{
     if(v)window.localStorage?.setItem(AUTO_WAKE_KEY,'yes');
     else window.localStorage?.removeItem(AUTO_WAKE_KEY);
   }catch(_){}
 }
 function visiblePanel(){return isOwner()&&panel&&!panel.hidden&&!panel.classList?.contains('rva-mini')&&panel.isConnected&&!document.hidden;}
 function noiseOnly(t){return /^(?:а|э|эм|мм|м|ну|ээ|эээ|угу)[.!?,\s]*$/i.test(String(t||'').trim());}

 const isOwner=()=>{try{return typeof currentUser!=='undefined'&&!!currentUser?.id&&typeof currentProfile!=='undefined'&&currentProfile?.role==='boss'&&String(currentProfile?.name||'').trim().replace(/\s+/g,' ').toLowerCase()==='александр паюшин'&&document.getElementById('app')?.style.display!=='none';}catch{return false;}};
 function info(t){if(window.__resantaVoiceOutputBusy && /(?:слушаю|жду вопрос|микрофон включен|ожидаю)/i.test(String(t||'')))return; if(status){status.textContent=t;status.title=String(t||'');}}
 function controls(){
   if(wake){
     wake.textContent=mode==='wake'?'■ Выключить «Привет, Ресанта»':
       autoWakeWanted?'◉ Включить постоянный режим':'◉ Включить «Привет, Ресанта»';
     wake.setAttribute('aria-pressed',String(mode==='wake'));
     wake.title=autoWakeWanted?'Автоматически включать при открытии окна помощника (можно выключить)':
       'После разрешения запомнить режим на этом компьютере';
   }
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
   meter.style.cssText='width:calc(100% - 32px);height:5px;accent-color:#64b5f6;display:block;margin:0 16px;flex:0 0 5px;';
   meter.hidden=true;status?.parentElement?.after(meter);
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
   // Long, explicitly requested full playback may exceed 32 seconds.
   // Keep the microphone inactive until speech actually ends or is stopped.
   const until=Date.now()+120000;
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
     }else if(phrase && !noiseOnly(phrase)){await stopAll();submit(phrase);}
     else {await stopAll();info('Речь не распознана. Попробуй говорить ближе к микрофону.');}
   }catch(e){await stopAll(reason(e));}
 }
 async function wakeLoop(epoch){
   let partialHelloAt=0;
   try{
     while(mode==='wake' && epoch===listenEpoch && isOwner() && panel && !panel.hidden && !panel.classList?.contains('rva-mini') && !document.hidden){
       // No five-minute cutoff for explicitly enabled foreground dialogue.
       // Safety: closing the window, hiding the tab, leaving the account,
       // losing the mic, or hitting the existing recognition quota stops it.
       if(!autoWakeWanted && Date.now()-wakeStart > 5*60*1000){
         await stopAll('Сеанс записи завершён. Включи фразу снова.');break;
       }
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
       if(noiseOnly(phrase)){info('Фрагмент речи слишком короткий. Продолжаю слушать вопрос.');continue;}
       if(wakeHeard){
         submit(phrase);
         await waitForAssistant(epoch,'wake');
         if(epoch===listenEpoch&&mode==='wake')info('Слушаю следующий вопрос…');
       }else{
         // SpeechKit can split "Привет, Ресанта" into two short clips.
         // Both words are still required; a lone "Привет" never activates AI.
         if(/^привет[\s,.!?]*$/i.test(phrase)){
           partialHelloAt=Date.now();
           info('Услышала «Привет». Скажи «Ресанта», чтобы активировать помощника.');
           continue;
         }
         const match=WAIT_RE.exec(phrase);
         const separate=partialHelloAt>0&&Date.now()-partialHelloAt<=15000?
           /^(?:ресанта|резанта|рясанта|рисанта)(?=$|[\s,.!?—-])/i.exec(phrase):null;
         partialHelloAt=0;
         if(!match&&!separate){
           info('Слышу речь, но жду «Привет, Ресанта». Распознано: '+phrase.slice(0,65));
           continue;
         }
         const prefix=match||separate;
         const rest=phrase.slice(prefix.index+prefix[0].length).trim().replace(/^[\s,.!?]+/,'');
         wakeHeard=true;
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
 async function start(newMode,automatic=false){
   if(starting)return;
   if(automatic && (!autoWakeWanted || autoWakeBlocked || !visiblePanel()))return;
   if(mode===newMode){
     if(newMode==='wake'&&!automatic){saveAutoWake(false);resumeConversationUntil=0;}
     await stopAll('Микрофон выключен. Постоянная активация отключена.');
     return;
   }
   if(!isOwner())return;
   if(!userOptIn){
     if(automatic)return;
     const yes=window.confirm('РЕСАНТА AI: включить режим «Привет, Ресанта» и запомнить разрешение на этом компьютере? Микрофон будет работать ТОЛЬКО в открытом окне помощника и активной вкладке CRM. Звуковые фразы отправляются для распознавания через защищённый сервер CRM (до 60 фраз в сутки); записи в CRM не сохраняются. Режим выключается при закрытии окна или скрытии вкладки, и его можно отключить вручную. Разрешить?');
     if(!yes)return;
     userOptIn=true;
   }
   if(newMode==='wake'){
     // No background consent dialogs on auto-reopen; if saved neural consent
     // is missing, require a visible user click instead of listening silently.
     if(automatic && window.crmResantaVoiceHasConsentV3?.()!==true){
       autoWakeBlocked=true;
       info('Чтобы Лера отвечала голосом, один раз нажми «Привет, Ресанта» и разреши Яндекс.');
       return;
     }
     if(!automatic){
       const authorize=window.crmResantaVoiceAuthorizeV3;
       const authorized=typeof authorize==='function'&&authorize();
       if(!authorized){
         info('Разреши Яндекс Леру или Дашу для озвучки, затем включи фразу снова.');
         return;
       }
     }
   }
   const continueConversation=automatic&&newMode==='wake'&&resumeConversationUntil>Date.now();
   starting=true;
   await stopAll();
   starting=true;
   mode=newMode;listenEpoch++;const epoch=listenEpoch;wakeStart=Date.now();clipCount=0;
   wakeHeard=!!continueConversation;controls();
   if(newMode==='wake'&&!automatic)saveAutoWake(true);
   window.speechSynthesis?.cancel();
   try{await permission();if(epoch!==listenEpoch)return;starting=false;
     if(newMode==='manual'){info('Слушаю команду. Максимум 10 секунд.');manualLoop(epoch);}
     else{
       if(continueConversation){resumeConversationUntil=0;info('Продолжаем разговор. Можешь задать вопрос без нового приветствия.');}
       else info('Микрофон включён: ожидаю «Привет, Ресанта»');
       wakeLoop(epoch);
     }
   }catch(e){
     await stopAll(reason(e));
     if(automatic)autoWakeBlocked=true; // No permission or device retry loop.
   }
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
   if(note)note.textContent='«Привет, Ресанта» можно включить один раз: настройка запомнится для этого компьютера. При открытии окна помощника в активной вкладке микрофон подключится автоматически (если разрешает браузер). Закрой окно или выключи фразу — микрофон остановится. До 60 распознаваний в день; запись в CRM не сохраняется.';
   mic.addEventListener('click',e=>{e.stopImmediatePropagation();e.preventDefault();void start('manual');},true);
   wake.addEventListener('click',e=>{
     e.stopImmediatePropagation();e.preventDefault();
     autoWakeBlocked=false;
     void start('wake');
   },true);
   panel.querySelector('.rva-close')?.addEventListener('click',()=>{resumeConversationUntil=0;void stopAll();},true);
   controls();return true;
 }
 // Mini-player is output-only: never keep a hot microphone while collapsed.
 window.crmResantaVoiceSuspendV2=()=>{
   resumeConversationUntil=0;
   if(mode)void stopAll('Микрофон остановлен: помощник свёрнут.');
   autoAttemptedThisOpen=false;
 };
 document.addEventListener('visibilitychange',()=>{
   if(document.hidden){
     // Resume dialogue only if the wake phrase had already been accepted.
     // Capturing stops immediately while CRM is not in the foreground.
     resumeConversationUntil=(mode==='wake'&&wakeHeard&&autoWakeWanted&&isOwner()&&
       panel&&!panel.hidden&&!panel.classList?.contains('rva-mini'))?
       Date.now()+RESUME_WINDOW_MS:0;
     if(mode)void stopAll('Микрофон выключен: вкладка скрыта.');
   }else{autoAttemptedThisOpen=false;autoWakeBlocked=false;}
 });
 window.addEventListener('pagehide',()=>{resumeConversationUntil=0;void stopAll();});
 window.setInterval(()=>{
   if(!panel)init();
   if(!panel)return;
   const open=!!visiblePanel();
   if(!open){
     if(lastOpen)autoAttemptedThisOpen=false;
     if(panel.hidden||panel.classList?.contains('rva-mini')||!isOwner())resumeConversationUntil=0;
     if(mode)void stopAll();
   }else if(autoWakeWanted && !autoAttemptedThisOpen && mode!=='wake' && !starting && !autoWakeBlocked){
     autoAttemptedThisOpen=true; // At most one automatic getUserMedia request per open.
     void start('wake',true);
   }
   lastOpen=open;
 },650);
 init();
})();