// @ts-nocheck
// Import interoperability with the established JS-only AI360 v4 core.
import { ADMIN, OWNER, deny, quota, stillAllowed } from './auth.ts';

function unpack(s){
 const candidates=[];
 try{const x=JSON.parse(s);candidates.push(...(Array.isArray(x)?x:[x]));}
 catch{for(const line of s.split(/\r?\n/))try{candidates.push(JSON.parse(line));}catch{}}
 const values=[];
 for(const x of candidates){const value=x?.result?.audioChunk?.data||x?.audioChunk?.data;
  if(typeof value==='string'&&value)values.push(value);}
 return values;
}
export async function transcribe(session,body){
 await quota('air3-v2-stt-'+OWNER,30,60);
 const base64=String(body?.audio_base64||'');
 const duration=Number(body?.duration||0);
 if(base64.length<1000||base64.length>710000||!Number.isFinite(duration)||duration<0.5||duration>12.5)
  deny('invalid_audio',400);
 let bytes;
 try{const raw=atob(base64);bytes=new Uint8Array(raw.length);for(let i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);}
 catch{deny('invalid_audio_encoding',400);}
 if(bytes.length<900||bytes.length>512000)deny('invalid_audio_size',413);
 // MPEG-4 AAC is captured natively on AIR3, never a file path from the client.
 // Check an MP4 ftyp header rather than trusting untrusted MIME metadata.
 if(new TextDecoder().decode(bytes.subarray(4,8))!=='ftyp')deny('invalid_audio_type',415);
 const q=await ADMIN.rpc('crm_voice_claim_v1',{p_user_id:OWNER});
 if(q.error)deny('quota_unavailable',503);
 if(!q.data)deny('voice_daily_limit',429);
 const budget=await ADMIN.rpc('crm_ai360_stt_claim_v2',{
  p_user_id:OWNER,p_duration_seconds:duration
 });
 if(budget.error)deny('speech_budget_meter_unavailable',503);
 if(budget.data?.allowed!==true)deny('speech_monthly_budget_exhausted',429);
 const key=Deno.env.get('OPENAI_API_KEY')||'';
 if(!key)deny('speech_provider_unconfigured',503);
 const form=new FormData();
 form.append('model','gpt-transcribe');
 form.append('languages[]','ru');
 for(const word of ['Ресанта','Триовист','Витебск','Гомель'])
  form.append('keywords[]',word);
 const staff=await ADMIN.from('users').select('name').eq('role','manager').limit(35);
 const names=(staff.error?[]:staff.data||[]).map(x=>String(x.name||'').trim())
  .filter(x=>/^[А-Яа-яЁё\s-]{4,70}$/.test(x)).slice(0,25);
 for(const name of names)form.append('keywords[]',name);
 form.append('prompt','Русская речь в CRM Ресанта, Triovist, Huter и 21vek. Названия сотрудников: '+names.join(', ')+'. Распознай дословно, не выдумывай.');
 form.append('file',new File([bytes],'inmo-air3.m4a',{type:'audio/mp4'}));
 let res;
 try{res=await fetch('https://api.openai.com/v1/audio/transcriptions',{
  method:'POST',headers:{Authorization:'Bearer '+key},body:form,signal:AbortSignal.timeout(28000)
 });}catch{deny('speech_provider_unavailable',502);}
 if(!res.ok)deny(res.status===429?'speech_provider_rate_limit':'speech_provider_failed',res.status===429?429:502);
 const value=await res.json().catch(()=>({}));
 await stillAllowed(session);
 return {text:String(value?.text||'').trim().slice(0,350)};
}
export async function speak(session,body){
 await quota('air3-v2-tts-'+OWNER,50,60);
 const text=String(body?.text||'').replace(/<[^>]*>/g,'').trim();
 const voice='lera';
 if(!text||text.length>220)deny('tts_text_invalid',400);
 const apiKey=Deno.env.get('YANDEX_SPEECHKIT_API_KEY')||'';
 if(!apiKey)deny('yandex_unconfigured',503);
 const claim=await ADMIN.rpc('crm_ai360_yandex_monthly_claim_v1',{
  p_user_id:OWNER,p_characters:text.length
 });
 if(claim.error)deny('tts_budget_unavailable',503);
 if(claim.data?.allowed!==true)deny('tts_budget_exhausted',429);
 const folder=Deno.env.get('YANDEX_CLOUD_FOLDER_ID')||'';
 const headers={'Authorization':'Api-Key '+apiKey,'Content-Type':'application/json'};
 if(folder)headers['x-folder-id']=folder;
 let upstream;
 try{upstream=await fetch('https://tts.api.cloud.yandex.net/tts/v3/utteranceSynthesis',{
  method:'POST',headers,signal:AbortSignal.timeout(26000),
  body:JSON.stringify({text,model:'general',hints:[{voice},{role:'friendly'}]})
 });}catch{deny('yandex_unavailable',502);}
 if(!upstream.ok)deny('yandex_provider_failed',502);
 const raw=await upstream.text();
 if(raw.length>6500000)deny('audio_too_large',502);
 const pieces=unpack(raw);
 if(!pieces.length)deny('audio_invalid',502);
 // PCM WAV chunks are supplied by the existing Yandex SpeechKit TTS adapter.
 const total=pieces.reduce((n,x)=>n+Math.floor(x.length*0.75),0);
 if(total>1800000)deny('audio_too_large',502);
 const bytes=[];
 try{for(const piece of pieces)bytes.push(atob(piece));}
 catch{deny('audio_invalid',502);}
 const bin=bytes.join('');
 if(bin.length<256||bin.length>1800000||bin.slice(0,4)!=='RIFF')deny('audio_invalid',502);
 const wav=btoa(bin);
 await stillAllowed(session);
 return {audio_base64:wav,mime:'audio/wav'};
}
