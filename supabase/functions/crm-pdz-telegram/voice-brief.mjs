/* A short, read-only personal PDZ voice summary; never expands the recipient's CRM scope. */
import {amount,greeting,statusCounts,keyOf,contactStatus,dateRU} from './lera-message.mjs';
export const MAX_VOICE_CHARS=240;
export function pdzVoiceText({user,binding,rows,previousRows,reportDate,today,evidence}){
 const data=Array.isArray(rows)?rows:[];
 const isLeader=String(user?.role||'')==='boss';
 const personalName=String(greeting(user,data,binding)).replace(/&amp;/g,' и ').replace(/&[^;]{1,10};/g,' ').replace(/[<>]/g,'').trim().slice(0,25)||'коллега';
 const date=String(dateRU(reportDate)).replace(/\./g,' ');
 const sum=Math.round(amount(data)).toLocaleString('ru-RU');
 const opening=`Привет, ${personalName}. Это Лера. ПДЗ на ${date}. Должников: ${data.length}. Просрочка ${sum} белорусских рублей.`;
 const sentences=[opening];
 if(Array.isArray(previousRows)){
  const delta=Math.round(amount(data)-amount(previousRows));
  if(delta!==0)sentences.push(`По сравнению с предыдущим отчётом долг ${delta<0?'снизился':'вырос'} на ${Math.abs(delta).toLocaleString('ru-RU')} рублей. Это не подтверждение оплаты.`);
 }
 const counts=statusCounts(data,evidence||new Map(),today);
 if(counts.promise_overdue)sentences.push(`Просрочено обещаний: ${counts.promise_overdue}. Проверь поступления.`);
 else if(counts.no_record)sentences.push(`Нет записи о контакте по ${counts.no_record} клиентам. Запланируй звонки.`);
 else if(data.length)sentences.push(isLeader?'Проверь сроки оплаты и действия менеджеров.':'Уточни даты оплаты и зафиксируй результат в CRM.');
 else sentences.push('Просроченных долгов по твоему списку нет.');
 const critical=[...data].sort((a,b)=>{
  const aStatus=contactStatus((evidence||new Map()).get(keyOf(a)),today);
  const bStatus=contactStatus((evidence||new Map()).get(keyOf(b)),today);
  const rank=s=>(s==='promise_overdue'?3:s==='no_record'?2:1);
  return rank(bStatus)-rank(aStatus)||Number(b.debt_overdue||0)-Number(a.debt_overdue||0);
 })[0];
 if(critical?.client_name){
  const name=String(critical.client_name).trim().replace(/\s+/g,' ').slice(0,45);
  if(name)sentences.push(`Первый приоритет: ${name}.`);
 }
 let output='';
 for(const sentence of sentences){
  if((output?(output+' '+sentence):sentence).length>MAX_VOICE_CHARS)continue;
  output+=(output?' ':'')+sentence;
 }
 return output;
}
// API v3 REST may deliver one JSON object or newline-delimited response chunks.
export function yandexAudioBytes(body,format='OGG_OPUS'){
 if(typeof body!=='string'||!body.length||body.length>5000000)throw new Error('TTS_BAD_RESPONSE');
 const payloads=[];
 try{const obj=JSON.parse(body);payloads.push(...(Array.isArray(obj)?obj:[obj]));}
 catch {for(const part of body.split(/\r?\n/)){if(part.trim()){try{payloads.push(JSON.parse(part));}catch{throw new Error('TTS_BAD_JSON');}}}}
 const parts=[];
 for(const p of payloads){
  const chunk=p?.result?.audioChunk?.data??p?.audioChunk?.data;
  if(typeof chunk==='string'&&chunk.length){
   let raw;try{raw=atob(chunk);}catch{throw new Error('TTS_BAD_BASE64');}
   const bytes=new Uint8Array(raw.length);
   for(let i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);
   parts.push(bytes);
  }
 }
 const size=parts.reduce((n,p)=>n+p.length,0);
 if(size<80||size>1800000)throw new Error('TTS_AUDIO_SIZE');
 const bytes=new Uint8Array(size);let offset=0;
 for(const p of parts){bytes.set(p,offset);offset+=p.length;}
 if(format==='MP3'){
  const id3=new TextDecoder().decode(bytes.slice(0,3))==='ID3';
  const frame=bytes[0]===255&&(bytes[1]&224)===224;
  if(!id3&&!frame)throw new Error('TTS_NOT_MP3');
 }else if(new TextDecoder().decode(bytes.slice(0,4))!=='OggS'||!new TextDecoder().decode(bytes.slice(0,100)).includes('OpusHead')){
  throw new Error('TTS_NOT_OGG_OPUS');
 }
 return bytes;
}
