/* Shared OpenAI STT + Yandex SpeechKit premium voice for authorized Vitebsk branch pilot.
   No login mic, no browser robotic speech. Uses exactly the owner's provider endpoints.
   Backend checks exact account and existing daily/monthly atomic budget claims.
 */
(function(root){
'use strict';
if(/Android/i.test(navigator.userAgent||'')||root.crmAI360BranchPremiumVoiceV1)return;
const SID='ba55dfe5-7e48-4f1f-b40e-674c7752fe1a';
const WAKE=/^(?:(?:привет[\s,!.—-]+(?:ресанта|резанта))|лера)[\s,!.—-]*/i;
let clipEpoch=0,playEpoch=0,stream=null,recorder=null,player=null,mediaUrl='',wakeOn=false,loops=0,oneShot=false;
let onQuestion=null,onInfo=null,allowedNow=null,voice='lera',muted=false,activePanel=null;
function allowed(){
 try{return typeof currentUser!=='undefined'&&currentUser?.id===SID&&
  typeof currentProfile!=='undefined'&&currentProfile?.role==='boss'&&
  String(currentProfile?.name||'').trim().replace(/\s+/g,' ').toLocaleLowerCase('ru-RU')==='сидарович к.н.'&&
  currentProfile?.region==='Витебск'&&!document.hidden&&activePanel&&!activePanel.hidden&&allowedNow?.();
 }catch{return false;}
}
function info(s){if(allowed())onInfo?.(String(s||'').slice(0,150));}
function stopSpeech(){
 ++playEpoch;
 try{player?.pause();}catch{}
 player=null;
 if(mediaUrl){try{URL.revokeObjectURL(mediaUrl);}catch{}mediaUrl='';}
}
function stop(){
 ++clipEpoch;wakeOn=false;oneShot=false;
 try{recorder?.state==='recording'&&recorder.stop();}catch{}
 recorder=null;
 try{stream?.getTracks().forEach(x=>x.stop());}catch{}
 stream=null;stopSpeech();
}
async function speak(msg){
 if(!allowed()||muted||!msg)return;
 stopSpeech();const run=playEpoch;
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
   const res=await db.functions.invoke('crm-voice-yandex-tts-v1',{body:{voice,text:segment}});
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
 if(run===playEpoch)info('Готова к следующему вопросу');
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
  let ended=false,clock=0;
  function finish(){if(ended)return;ended=true;clearTimeout(clock);if(r.state==='recording')r.stop();}
  r.ondataavailable=e=>{if(e.data?.size)parts.push(e.data);};
  r.onerror=()=>{clearTimeout(clock);reject(Error('Ошибка записи'));};
  r.onstop=()=>{
   clearTimeout(clock);
   if(recorder===r)recorder=null;
   resolve({blob:new Blob(parts,{type:r.mimeType||'audio/webm'}),duration:Math.min(16.4,(Date.now()-started)/1000)});
  };
  r.start(250);clock=setTimeout(finish,12000);
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
 return String(result.data?.text||'').trim().slice(0,350);
}
async function single(){
 if(!allowed())return;
 const run=++clipEpoch;
 oneShot=true;stopSpeech();
 try{
  info('Слушаю. Скажи вопрос…');
  const rec=await capture(run);
  if(run!==clipEpoch||!allowed())return;
  const phrase=await transcribe(rec,run);
  if(run!==clipEpoch||!allowed())return;
  if(phrase)onQuestion?.(phrase.replace(WAKE,'').trim()||phrase);
  else info('Фраза не распознана. Попробуй ещё раз.');
 }catch(e){if(allowed())info('Микрофон: '+String(e?.message||e).slice(0,100));}
 finally{
  oneShot=false;
  if(run===clipEpoch&&!wakeOn){try{stream?.getTracks().forEach(x=>x.stop());}catch{}stream=null;}
 }
}
async function hotLoop(run){
 try{
  const active=()=>run===clipEpoch&&wakeOn&&allowed()&&loops<30;
  while(active()){
   info('Жду «Привет, Ресанта»…');
   const clip=await capture(run);
   if(!active())break;
   if(!clip?.blob||clip.blob.size<900)continue;
   loops++;
   const heard=await transcribe(clip,run);
   if(!active())break;
   if(!heard)continue;
   const hit=WAKE.exec(heard);
   if(!hit){info('Жду фразу «Привет, Ресанта»');continue;}
   const rest=heard.slice(hit[0].length).trim();
   if(rest)onQuestion?.(rest);
   else {
    info('Слушаю вопрос…');
    const next=await capture(run);
    if(!active())break;
    const question=await transcribe(next,run);
    if(question)onQuestion?.(question.replace(WAKE,'').trim());
   }
   // Prevent hearing the TTS response as a new question.
   await new Promise(r=>setTimeout(r,500));
   while(active()&&player&&!player.paused&&!player.ended){
    await new Promise(r=>setTimeout(r,250));
   }
  }
 }catch(e){if(allowed())info('Микрофон: '+String(e?.message||e).slice(0,100));}
 finally{
  if(run===clipEpoch){
   wakeOn=false;try{stream?.getTracks().forEach(x=>x.stop());}catch{}stream=null;
   info('Фраза активации выключена');
  }
 }
}
function bind({panel,authorized,onTranscript,onStatus}){
 activePanel=panel;allowedNow=authorized;onQuestion=onTranscript;onInfo=onStatus;
}
function listen(){
 if(!allowed()||oneShot||wakeOn)return;
 void single();
}
function toggleWake(){
 if(wakeOn){stop();info('Ожидание фразы выключено');return false;}
 if(!allowed())return false;
 stopSpeech();wakeOn=true;loops=0;
 const run=++clipEpoch;void hotLoop(run);return true;
}
function setVoice(next){
 if(next!=='lera'&&next!=='dasha')return false;
 voice=next;stopSpeech();return true;
}
function setMuted(next){muted=Boolean(next);if(muted)stopSpeech();}
root.crmAI360BranchPremiumVoiceV1={bind,listen,toggleWake,speak,stop,setVoice,setMuted,
 get wakeOn(){return wakeOn;}};
root.addEventListener('pagehide',stop);
document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();});
})(window);
