/* RESANTA CONNECT #127: private attachments and voice clips in existing CRM chats.
   Opt-in microphone use; no background recording or new login/account.
   Production CRM core and text chat remain unaffected if media cannot load.
*/
(function(){
 'use strict';
 if(window.crmConnectMedia127)return;
 const $=id=>document.getElementById(id);
 const BUCKET='crm-connect-media-v1';
 const MAX_BYTES=10*1024*1024;
 const MAX_VOICE_MS=90000;
 const ALLOWED={
   'image/jpeg':'jpg','image/png':'png','image/webp':'webp',
   'application/pdf':'pdf','text/plain':'txt','application/msword':'doc',
   'application/vnd.openxmlformats-officedocument.wordprocessingml.document':'docx',
   'application/vnd.ms-excel':'xls',
   'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':'xlsx',
   'audio/webm':'webm','audio/mp4':'mp4','audio/mpeg':'mp3','audio/ogg':'ogg'
 };
 const OPTIONS={};
 let ready=false, sending=false, recorder=null, recStream=null, recParts=[],recTimer=null,recWatch=null,recRoom=null;
 let attachmentCache=new Map();
 function say(s,error){OPTIONS.notify?.(s,!!error);}
 function client(){return OPTIONS.client?.();}
 function room(){return OPTIONS.roomId?.();}
 function actor(){return OPTIONS.actor?.();}
 function active(){return !!OPTIONS.isOpen?.();}
 function el(tag,cls,txt){
  const n=document.createElement(tag);if(cls)n.className=cls;
  if(txt!==undefined)n.textContent=String(txt);return n;
 }
 function errorMsg(e){return String(e?.message||e||'Неизвестная ошибка');}
 function verifiedFile(file,voice){
  if(!file)throw Error('Файл не выбран.');
  const mime=String(file.type||'').split(';')[0].trim().toLowerCase();
  if(!ALLOWED[mime])throw Error('Этот формат пока не поддерживается. Разрешены фото, PDF, документы и голосовые записи.');
  if(file.size<1||file.size>MAX_BYTES)throw Error('Максимальный размер одного вложения — 10 МБ.');
  if(voice&&!mime.startsWith('audio/'))throw Error('Неподдерживаемый формат голосовой записи.');
  return mime;
 }
 function safeName(file,voice){
  if(voice)return 'Голосовое сообщение';
  return String(file.name||'Документ').replace(/[\u0000-\u001f\u007f]/g,'').trim().slice(0,180)||'Документ';
 }
 async function sendFile(file,voice){
  if(sending){say('Дождитесь завершения загрузки.',true);return;}
  if(!active()||!room()||!actor()){say('Сначала откройте чат.',true);return;}
  let mime;
  try{mime=verifiedFile(file,voice);}catch(e){say(errorMsg(e),true);return;}
  sending=true;
  const targetRoom=room(),targetActor=actor();
  const attach=$('c127-attach'), mic=$('c127-mic');
  if(attach)attach.disabled=true;if(mic)mic.disabled=true;
  let filePath=null, published=false;
  try{
   if(!window.crypto?.randomUUID)throw Error('Необходим безопасный HTTPS-доступ к CRM.');
   const id=crypto.randomUUID();
   filePath=targetRoom+'/'+targetActor+'/'+id+'.'+ALLOWED[mime];
   say(voice?'Отправляем голосовое сообщение…':'Загружаем вложение…');
   const up=await client().storage.from(BUCKET).upload(filePath,file,{contentType:mime,cacheControl:'3600',upsert:false});
   if(up.error)throw up.error;
   // No message is left behind if attachment metadata fails.
   const res=await client().rpc('connect_send_media_v1',{
    p_room_id:targetRoom,p_path:filePath,p_name:safeName(file,voice),p_mime:mime,
    p_size:file.size,p_kind:voice?'voice':mime.startsWith('image/')?'image':'file'
   });
   if(res.error)throw res.error;
   published=true;
   if(active()&&room()===targetRoom){
    OPTIONS.onMessage?.(res.data);
    await syncOne(res.data.id,targetRoom);
   }
   say(voice?'Голосовое сообщение отправлено.':'Вложение отправлено.');
  }catch(e){
   say('Не удалось отправить вложение: '+errorMsg(e),true);
  }finally{
   if(filePath&&!published){
    try{await client().storage.from(BUCKET).remove([filePath]);}catch(_){}
   }
   sending=false;
   if(attach)attach.disabled=false;if(mic)mic.disabled=false;
  }
 }
 function mediaType(row){
  return row.kind==='voice'?'🎙 Голосовое':row.kind==='image'?'🖼 Фото':'📎 Файл';
 }
 function attachToMessage(row){
  const host=$('c126-messages');
  if(!host||room()!==row.room_id)return;
  const bubble=host.querySelector('[data-message="'+row.message_id+'"]');
  if(!bubble||bubble.querySelector('.c127-media'))return;
  const wrap=el('div','c127-media');
  const size=(Number(row.size_bytes||0)/1024/1024).toFixed(1)+' МБ';
  const b=el('button','',mediaType(row)+' · '+row.file_name+' · '+size);
  b.type='button';
  b.title='Открыть вложение';
  b.addEventListener('click',async()=>{
   if(!active()||room()!==row.room_id)return;
   b.disabled=true;
   try{
    const signed=await client().storage.from(BUCKET).createSignedUrl(row.file_path,120);
    if(signed.error||!signed.data?.signedUrl)throw signed.error||Error('Нет доступа к файлу.');
    const url=signed.data.signedUrl;
    if(row.kind==='voice'){
     let audio=wrap.querySelector('audio');
     if(!audio){audio=el('audio','c127-audio');audio.controls=true;wrap.append(audio);}
     audio.src=url;
     try{await audio.play();}catch(_){/* Audio controls remain usable. */}
    }else{
     // Open only on direct user gesture; signed URL expires after 120 seconds.
     const anchor=el('a');
     anchor.href=url;anchor.target='_blank';anchor.rel='noopener noreferrer';
     anchor.download=row.file_name;
     anchor.click();
    }
   }catch(e){say('Не удалось открыть файл: '+errorMsg(e),true);}
   finally{b.disabled=false;}
  });
  wrap.append(b);bubble.append(wrap);
 }
 async function sync(roomId,ids){
  if(!client()||!ids?.length||room()!==roomId)return;
  const uniq=[...new Set(ids)].slice(0,100);
  const res=await client().from('connect_attachments_v1')
   .select('message_id,room_id,file_path,file_name,mime_type,size_bytes,kind')
   .eq('room_id',roomId).in('message_id',uniq);
  if(res.error){say('Вложения временно недоступны: '+errorMsg(res.error),true);return;}
  if(room()!==roomId)return;
  for(const row of res.data||[]){attachmentCache.set(row.message_id,row);attachToMessage(row);}
 }
 async function syncOne(id,roomId){
  if(!id||!roomId||room()!==roomId)return;
  if(attachmentCache.has(id)){attachToMessage(attachmentCache.get(id));return;}
  await sync(roomId,[id]);
 }
 function clearRecording(){
  if(recTimer){clearTimeout(recTimer);recTimer=null;}
  if(recWatch){clearInterval(recWatch);recWatch=null;}
  for(const track of recStream?.getTracks?.()||[])try{track.stop();}catch(_){}
  recStream=null;recorder=null;recParts=[];recRoom=null;
  const mic=$('c127-mic');if(mic){mic.textContent='🎙';mic.classList.remove('c127-recording');mic.title='Записать голосовое сообщение';}
 }
 async function stopRecording(discard=false){
  if(!recorder)return;
  recorder.__discard=!!discard;
  try{
   if(recorder.state!=='inactive')recorder.stop();
   else clearRecording();
  }catch(e){clearRecording();say(errorMsg(e),true);}
 }
 async function toggleRecording(){
  if(recorder){stopRecording(false);return;}
  if(!active()||!room())return;
  if(!window.MediaRecorder||!navigator.mediaDevices?.getUserMedia){
   say('Запись микрофона недоступна в этом браузере. Попробуйте открыть CRM в Chrome или Safari.',true);return;
  }
  const chosen=['audio/webm;codecs=opus','audio/mp4','audio/ogg;codecs=opus','audio/webm'].find(t=>MediaRecorder.isTypeSupported(t));
  if(!chosen){say('Браузер не поддерживает запись голосовых сообщений.',true);return;}
  try{
   const stream=await navigator.mediaDevices.getUserMedia({audio:true});
   if(!active()||!room()){stream.getTracks().forEach(t=>t.stop());return;}
   recStream=stream;recRoom=room();recParts=[];
   recorder=new MediaRecorder(stream,{mimeType:chosen});
   const current=recorder;
   current.addEventListener('dataavailable',e=>{if(e.data?.size)recParts.push(e.data);});
   current.addEventListener('error',()=>{clearRecording();say('Ошибка микрофона. Проверьте разрешения.',true);});
   current.addEventListener('stop',()=>{
    const discarded=!!current.__discard||!active()||room()!==recRoom;
    const mime=current.mimeType?.split(';')[0]||chosen.split(';')[0];
    const parts=recParts.slice();
    clearRecording();
    if(!discarded&&parts.length){
     const blob=new Blob(parts,{type:mime});
     sendFile(blob,true);
    }
   });
   current.start(250);
   const mic=$('c127-mic');
   if(mic){mic.textContent='⏹';mic.classList.add('c127-recording');mic.title='Остановить и отправить запись';}
   say('Идёт запись. Нажмите ⏹, чтобы остановить и отправить (до 90 секунд).');
   recTimer=setTimeout(()=>stopRecording(false),MAX_VOICE_MS);
   recWatch=setInterval(()=>discardIfNeeded(),400);
  }catch(e){clearRecording();say('Доступ к микрофону не получен: '+errorMsg(e),true);}
 }
 function discardIfNeeded(){if(recorder&&(!active()||room()!==recRoom))stopRecording(true);}
 function init(hooks){
  Object.assign(OPTIONS,hooks);
  if(ready)return;ready=true;
  const attach=$('c127-attach'),input=$('c127-file-input'),mic=$('c127-mic');
  if(!attach||!input||!mic)return;
  attach.addEventListener('click',()=>{if(active()&&room())input.click();});
  input.addEventListener('change',()=>{
   const file=input.files?.[0];input.value='';
   if(file)sendFile(file,false);
  });
  mic.addEventListener('click',toggleRecording);
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&recorder)stopRecording(true);});
 }
 window.crmConnectMedia127={init,sync,syncOne,discardIfNeeded};
})();
