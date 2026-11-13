/* Shared OpenAI STT + Yandex SpeechKit premium voice for authorized Vitebsk branch pilot.
   No login mic, no browser robotic speech. Uses exactly the owner's provider endpoints.
   Backend checks exact account and existing daily/monthly atomic budget claims.
 */
(function(root){
'use strict';
// Android/WebView is blocked unless a signed-in employee explicitly activates the opt-in launcher.
if((/Android/i.test(navigator.userAgent||'')&&!root.__resantaAI360AndroidStaffOptIn)||root.crmAI360BranchPremiumVoiceV1)return;
const SID='ba55dfe5-7e48-4f1f-b40e-674c7752fe1a';
const WAKE=/^(?:(?:привет[\s,!.—-]+(?:лера|ресанта|резанта|рясанта|рисанта))|лера)[\s,!.—-]*/i;
const FOLLOWUP_WINDOW_MS=120000; // One natural conversation, not a new wake per question.
let clipEpoch=0,playEpoch=0,stream=null,recorder=null,player=null,mediaUrl='',wakeOn=false,loops=0,oneShot=false;
let speaking=false,conversationUntil=0;
let onQuestion=null,onInfo=null,allowedNow=null,isBusy=()=>false,voice='lera',muted=false,activePanel=null;
function allowed(){
 const identity=root.crmAI360StaffIdentityV1?.();
 return !!identity&&['branch_director','field_manager','triovist_category'].includes(identity.tier)&&
  !document.hidden&&activePanel&&!activePanel.hidden&&allowedNow?.();
}
const WAKE_PREF='resanta-lera-wake-foregound-v1:';
function prefKey(){const id=root.crmAI360StaffIdentityV1?.()?.id;return id?WAKE_PREF+id:'';}
function wakePref(){try{const key=prefKey();return !!key&&root.localStorage?.getItem(key)==='yes';}catch{return false;}}
function saveWakePref(value){try{const key=prefKey();if(!key)return; if(value)root.localStorage?.setItem(key,'yes');else root.localStorage?.removeItem(key);}catch{}}
function info(s){if(allowed())onInfo?.(String(s||'').slice(0,150));}
function stopSpeech(){
 ++playEpoch;speaking=false;
 try{player?.pause();}catch{}
 player=null;
 if(mediaUrl){try{URL.revokeObjectURL(mediaUrl);}catch{}mediaUrl='';}
}
function stop(){
 ++clipEpoch;wakeOn=false;oneShot=false;conversationUntil=0;
 try{recorder?.state==='recording'&&recorder.stop();}catch{}
 recorder=null;
 try{stream?.getTracks().forEach(x=>x.stop());}catch{}
 stream=null;stopSpeech();
}
async function speak(msg){
 if(!allowed()||muted||!msg)return;
 stopSpeech();const run=playEpoch;speaking=true;
 const original=String(msg).replace(/\bBYN\b/g,'белорусских рублей')
  .replace(/\s+/g,' ').trim().slice(0,1200);
 const segments=[];let remaining=original;
 while(remaining&&segments.length<6){
  if(remaining.length<=220){segments.push(remaining);break;}
  let cut=remaining.lastIndexOf(' ',220);
  if(cut<90)cut=220;
  segments.push(remaining.slice(0,cut).trim());
  remaining=remaining.slice(cut).trim();
 }
 for(const segment of segments){
  if(run!==playEpoch||!allowed())return;
  try{
   const session=await root.crmEnsureFreshSessionV236166?.(false);
   if(!session?.access_token)throw Error('session_required');
   info('Лера озвучивает ответ через Яндекс…');
   const res=await db.functions.invoke('crm-voice-yandex-tts-v1',{body:{voice,text:root.crmAI360ApplySpeechAccentsV1?.(segment)||segment}});
   if(run!==playEpoch||!allowed())return;
   if(res.error){
    let status='';
    try{status=String((await res.error.context?.json?.())?.error||'');}catch{}
    throw Error(status||'yandex_unavailable');
   }
   if(!(res.data instanceof Blob)||res.data.size<300)throw Error('bad_audio');
   const header=new Uint8Array(await res.data.slice(0,12).arrayBuffer());
   if(String.fromCharCode(...header.slice(0,4))!=='RIFF'||
      String.fromCharCode(...header.slice(8,12))!=='WAVE')throw Error('invalid_yandex_wav');
   mediaUrl=URL.createObjectURL(new Blob([res.data],{type:'audio/wav'}));
   player=new Audio(mediaUrl);
   await new Promise((resolve,reject)=>{
    player.onended=resolve;player.onerror=()=>reject(Error('audio_playback_failed'));
    Promise.resolve(player.play()).catch(reject);
   });
   if(mediaUrl){URL.revokeObjectURL(mediaUrl);mediaUrl='';}
  }catch(e){
   if(run===playEpoch&&allowed())info('Озвучка Яндекса недоступна: '+String(e?.message||e).slice(0,85)+'. Текст ответа сохранён.');
   break;
  }
 }
 if(run===playEpoch){speaking=false;info('Готова к следующему вопросу');}
}
async function getStream(){
 if(stream?.active)return stream;
 if(!navigator.mediaDevices?.getUserMedia||typeof MediaRecorder==='undefined')throw Error('Запись недоступна в этом браузере');
 stream=await navigator.mediaDevices.getUserMedia({
  audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true},video:false
 });
 return stream;
}
async function capture(run){
 const media=await getStream();
 if(run!==clipEpoch||!allowed())return null;
 const formats=['audio/webm;codecs=opus','audio/webm','audio/mp4'];
 const mime=formats.find(x=>MediaRecorder.isTypeSupported(x))||'';
 const parts=[];const started=Date.now();
 const r=new MediaRecorder(media,mime?{mimeType:mime}:undefined);recorder=r;
 return new Promise((resolve,reject)=>{
  let ended=false,clock=0,poll=0,audioContext=null,analyser=null,source=null;
  let lastLoud=0,heard=false;
  function release(){
   clearTimeout(clock);clearInterval(poll);
   try{source?.disconnect();}catch{}
   try{analyser?.disconnect();}catch{}
   if(audioContext)Promise.resolve(audioContext.close()).catch(()=>{});
  }
  function finish(){if(ended)return;ended=true;release();if(r.state==='recording')r.stop();}
  r.ondataavailable=e=>{if(e.data?.size)parts.push(e.data);};
  r.onerror=()=>{release();reject(Error('Ошибка записи'));};
  r.onstop=()=>{
   release();if(recorder===r)recorder=null;
   resolve({blob:new Blob(parts,{type:r.mimeType||'audio/webm'}),duration:Math.min(16.4,(Date.now()-started)/1000),loud:!analyser||heard});
  };
  r.start(250);clock=setTimeout(finish,12000);
  // The owner's assistant also stops after a natural silence; do not force the
  // user to wait 12s for every question. Failure of this meter is nonfatal.
  try{
   const AudioContextClass=root.AudioContext||root.webkitAudioContext;
   if(AudioContextClass){
    audioContext=new AudioContextClass();
    source=audioContext.createMediaStreamSource(media);
    analyser=audioContext.createAnalyser();analyser.fftSize=1024;
    source.connect(analyser);const buffer=new Uint8Array(analyser.fftSize);
    poll=setInterval(()=>{
     if(ended)return;
     analyser.getByteTimeDomainData(buffer);
     let rms=0;
     for(const v of buffer){const x=(v-128)/128;rms+=x*x;}
     rms=Math.sqrt(rms/buffer.length);
     if(rms>.003){heard=true;lastLoud=Date.now();}
     if(heard&&Date.now()-started>1200&&Date.now()-lastLoud>(root.crmAI360TurnTakingV1?.pauseMs||3300))finish();
    },120);
   }
  }catch{release();poll=0;}

 });
}
async function transcribe(record,run){
 if(!record||!allowed()||run!==clipEpoch)return null;
 if(record.blob.size<900)return '';
 if(record.blob.size>500000)throw Error('Фраза слишком длинная');
 const session=await root.crmEnsureFreshSessionV236166?.(false);
 if(!session?.access_token)throw Error('Сессия CRM недоступна');
 const mime=record.blob.type||'audio/webm';
 const data=new FormData();
 data.append('audio',new File([record.blob],'branch-question.'+(mime.includes('mp4')?'mp4':'webm'),{type:mime}));
 data.append('duration',String(Math.max(.5,record.duration)));
 info('Распознаю через OpenAI…');
 const result=await db.functions.invoke('crm-voice-transcribe-v1',{body:data});
 if(!allowed()||run!==clipEpoch)return null;
 if(result.error){
  let reason='Распознавание недоступно';
  try{reason=String((await result.error.context?.json?.())?.error||reason);}catch{}
  throw Error(reason);
 }
 return String(result.data?.text||'').trim().slice(0,1200);
}
// Semantic sentence continuation after the recorder's safety cutoff.
// Avoid sending «у меня встреча... хочу...» to the model as two unrelated asks.
async function completeTurn(first,run,startedDuration){
 const policy=root.crmAI360TurnTakingV1;if(!policy)return first;
 let text=String(first||'').trim(),duration=Number(startedDuration)||0;
 for(let part=1;part<policy.maxSegments;part++){
  if(run!==clipEpoch||!allowed())return null;
  const state=policy.detect(text);
  if(state==='cancel'||state==='done')return '';
  if(state!=='more'&&duration<11.4)break;
  info('Слушаю продолжение вопроса. Не перебиваю…');
  const nextClip=await capture(run);
  if(run!==clipEpoch||!allowed())return null;
  if(!nextClip?.blob||nextClip.loud===false)break;
  if(++loops>50)throw Error('Лимит речевых фрагментов в сеансе');
  const next=await transcribe(nextClip,run);
  if(next===null)return null;
  const command=policy.detect(next);
  if(command==='cancel')return '';
  if(command==='done')break;
  if(command==='more'&&/^(?:подожди|я\s+ещ[её]\s+не\s+закончил|слушай\s+дальше)/i.test(next)){duration=12;continue;}
  text=policy.merge(text,next);
  duration=nextClip.duration||0;
 }
 return text;
}
async function single(){
 if(!allowed())return;
 const run=++clipEpoch;
 oneShot=true;stopSpeech();
 try{
  info('Слушаю. Скажи вопрос…');
  const rec=await capture(run);
  if(run!==clipEpoch||!allowed())return;
  let phrase=await transcribe(rec,run);
  if(run!==clipEpoch||!allowed())return;
  if(phrase)phrase=await completeTurn(phrase,run,rec?.duration);
  if(run!==clipEpoch||!allowed())return;
  if(phrase)onQuestion?.(phrase.replace(WAKE,'').trim()||phrase);
  else info('Фраза не распознана. Попробуй ещё раз.');
 }catch(e){if(allowed())info('Микрофон: '+String(e?.message||e).slice(0,100));}
 finally{
  oneShot=false;
  if(run===clipEpoch&&!wakeOn){try{stream?.getTracks().forEach(x=>x.stop());}catch{}stream=null;}
 }
}
async function waitForReply(run){
 // The text request and Yandex TTS have separate asynchronous lifetimes.
 // Keep the foreground mic off until BOTH have finished, never record Lera's own voice.
 const deadline=Date.now()+120000;
 const started=Date.now();
 let observedBusy=false;
 await Promise.resolve();
 while(run===clipEpoch&&wakeOn&&allowed()&&Date.now()<deadline){
  let pending=false;
  try{pending=isBusy?.()===true;}catch{}
  const activeAudio=speaking||(player&&!player.paused&&!player.ended);
  if(pending||activeAudio){observedBusy=true;await new Promise(r=>setTimeout(r,140));continue;}
  if(observedBusy||Date.now()-started>=650)break;
  await new Promise(r=>setTimeout(r,100));
 }
}
async function hotLoop(run){
 try{
  const active=()=>run===clipEpoch&&wakeOn&&allowed()&&loops<50;
  while(active()){
   if(speaking||isBusy?.())await waitForReply(run);
   if(!active())break;
   info(conversationUntil>Date.now()?'Слушаю следующий вопрос…':'Жду «Привет, Лера» или «Привет, Ресанта»…');
   const clip=await capture(run);
   if(!active())break;
   // Do not spend a paid STT call on an actually silent local segment.
   if(!clip?.blob||clip.blob.size<900||clip.loud===false)continue;
   loops++;
   const heard=await transcribe(clip,run);
   if(!active())break;
   if(!heard)continue;
   const hit=WAKE.exec(heard) || (root.crmAI360TurnTakingV1?.isolatedWake(heard)&&/^(?:али|алё|алло)/i.test(heard)?[heard]:null);
   if(!hit&&conversationUntil<=Date.now()){
    info('Жду «Привет, Лера», «Лера» или «Привет, Ресанта»');
    continue;
   }
   let question=hit?heard.slice(hit[0].length).trim():heard.trim();
   if(!question){
    conversationUntil=Date.now()+FOLLOWUP_WINDOW_MS;
    onQuestion?.('Лера'); // Verified first-name wake greeting; no LLM request.
    await waitForReply(run);
    if(!active())break;
    info('Лера слушает твой вопрос…');
    const next=await capture(run);
    if(!active())break;
    if(!next?.blob||next.blob.size<900||next.loud===false)continue;
    question=String(await transcribe(next,run)||'').replace(WAKE,'').trim();
    if(!active())break;
    question=await completeTurn(question,run,next?.duration);
   }
   if(question&&root.crmAI360TurnTakingV1&&!!hit&&heard.slice(hit[0].length).trim())question=await completeTurn(question,run,clip?.duration);
   if(question&&root.crmAI360TurnTakingV1&&!hit)question=await completeTurn(question,run,clip?.duration);
   if(!active())break;
   if(!question)continue;
   conversationUntil=Date.now()+FOLLOWUP_WINDOW_MS;
   onQuestion?.(question);
   await waitForReply(run);
   if(active())conversationUntil=Date.now()+FOLLOWUP_WINDOW_MS;
  }
  if(run===clipEpoch&&loops>=50)info('Пауза голосового сеанса: 50 фрагментов. Включи Леру снова.');
 }catch(e){if(allowed())info('Микрофон: '+String(e?.message||e).slice(0,100));}
 finally{
  if(run===clipEpoch){
   wakeOn=false;conversationUntil=0;try{stream?.getTracks().forEach(x=>x.stop());}catch{}stream=null;
   info('Фраза активации выключена');
  }
 }
}
function bind({panel,authorized,onTranscript,onStatus,onBusy}){
 activePanel=panel;allowedNow=authorized;onQuestion=onTranscript;onInfo=onStatus;isBusy=typeof onBusy==='function'?onBusy:()=>false;
}
function listen(){
 if(!allowed()||oneShot||wakeOn)return;
 void single();
}
function toggleWake(){
 if(wakeOn){saveWakePref(false);stop();info('Ожидание фразы выключено');return false;}
 if(!allowed())return false;
 stopSpeech();wakeOn=true;loops=0;saveWakePref(true);
 const run=++clipEpoch;void hotLoop(run);return true;
}
function resumeWakeIfApproved(){
 // After one explicit activation, the already-authorized employee can reopen
 // Lera without another microphone button. Never start at login or in background.
 if(!allowed()||!wakePref()||wakeOn||oneShot)return false;
 wakeOn=true;loops=0;
 const run=++clipEpoch;void hotLoop(run);return true;
}
function setVoice(next){
 if(next!=='lera'&&next!=='dasha')return false;
 voice=next;stopSpeech();return true;
}
function setMuted(next){muted=Boolean(next);if(muted)stopSpeech();}
root.crmAI360BranchPremiumVoiceV1={bind,listen,toggleWake,resumeWakeIfApproved,speak,stop,setVoice,setMuted,
 get wakeOn(){return wakeOn;}};
root.addEventListener('pagehide',stop);
document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();else resumeWakeIfApproved();});
})(window);
