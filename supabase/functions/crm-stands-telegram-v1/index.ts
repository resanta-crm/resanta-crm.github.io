import {createClient} from 'npm:@supabase/supabase-js@2.56.0';
import {assessStand,recipientStandRows,briefing,monthStart,surname} from './stands-brief.mjs';

const sb=createClient(Deno.env.get('SUPABASE_URL')||'',Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'',{auth:{persistSession:false}});
const token=Deno.env.get('TELEGRAM_BOT_TOKEN')||'';
const esc=x=>String(x??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const reply=(x,status=200)=>new Response(JSON.stringify(x),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Minsk',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
async function setting(key){
 const {data,error}=await sb.from('crm_telegram_runtime').select('value').eq('key',key).maybeSingle();
 if(error)throw new Error('RUNTIME_UNAVAILABLE');return data?.value||null;
}
async function setSetting(key,value){
 const {error}=await sb.from('crm_telegram_runtime').upsert({key,value,updated_at:new Date().toISOString()},{onConflict:'key'});
 if(error)throw new Error('RUNTIME_WRITE_FAILED');
}
async function sendText(chat,text){
 if(!token)throw new Error('BOT_TOKEN_MISSING');
 const r=await fetch('https://api.telegram.org/bot'+token+'/sendMessage',{method:'POST',
  headers:{'content-type':'application/json'},signal:AbortSignal.timeout(22000),
  body:JSON.stringify({chat_id:chat,text,parse_mode:'HTML',disable_web_page_preview:true})});
 const v=await r.json().catch(()=>({}));if(!r.ok||!v.ok)throw new Error('TEXT_SEND_'+r.status);
 return v.result?.message_id;
}
function speechBytes(body,format){
 if(body.length>6000000)throw new Error('SPEECH_RESPONSE_TOO_LARGE');
 const payloads=[];try{const o=JSON.parse(body);payloads.push(...(Array.isArray(o)?o:[o]))}
 catch{for(const s of body.split(/\r?\n/)){if(s.trim()){try{payloads.push(JSON.parse(s))}catch{throw new Error('SPEECH_BAD_RESPONSE')}}}}
 const parts=[];
 for(const p of payloads){const data=p?.result?.audioChunk?.data||p?.audioChunk?.data;if(typeof data!=='string'||!data)continue;
  const s=atob(data),b=new Uint8Array(s.length);for(let i=0;i<s.length;i++)b[i]=s.charCodeAt(i);parts.push(b)}
 const len=parts.reduce((a,b)=>a+b.length,0);if(len<80||len>1800000)throw new Error('SPEECH_SIZE');
 const all=new Uint8Array(len);let i=0;for(const b of parts){all.set(b,i);i+=b.length}
 const head=new TextDecoder().decode(all.slice(0,100));
 if(format==='MP3'&&head.slice(0,3)!=='ID3'&&!(all[0]===255&&(all[1]&224)===224))throw new Error('SPEECH_NOT_MP3');
 if(format==='OGG_OPUS'&&(!head.startsWith('OggS')||!head.includes('OpusHead')))throw new Error('SPEECH_NOT_OGG');
 return all;
}
async function synthesize(text,userId,format){
 const key=Deno.env.get('YANDEX_SPEECHKIT_API_KEY')||'';if(!key)throw new Error('YANDEX_NOT_CONFIGURED');
 const reserve=await sb.rpc('crm_ai360_yandex_monthly_claim_v1',{p_user_id:userId,p_characters:text.length});
 if(reserve.error||!reserve.data?.allowed)throw new Error('YANDEX_MONTHLY_BUDGET_BLOCK');
 const headers={'Authorization':'Api-Key '+key,'Content-Type':'application/json'};
 const folder=Deno.env.get('YANDEX_CLOUD_FOLDER_ID')||'';if(folder)headers['x-folder-id']=folder;
 const res=await fetch('https://tts.api.cloud.yandex.net/tts/v3/utteranceSynthesis',{
  method:'POST',headers,signal:AbortSignal.timeout(26000),
  body:JSON.stringify({text,model:'general',hints:[{voice:'lera'},{role:'friendly'}],outputAudioSpec:{containerAudio:{containerAudioType:format}}})
 });if(!res.ok)throw new Error('YANDEX_'+res.status);
 return speechBytes(await res.text(),format);
}
async function sendSound(chat,audio,format){
 const form=new FormData();
 form.append('chat_id',String(chat));
 const b=new Uint8Array(new ArrayBuffer(audio.length));b.set(audio);
 if(format==='OGG_OPUS'){form.append('voice',new Blob([b],{type:'audio/ogg'}),'lera-stand360.ogg')}
 else {form.append('audio',new Blob([b],{type:'audio/mpeg'}),'lera-stand360.mp3');
       form.append('title','Лера · Стенды 360°');form.append('performer','РЕСАНТА CRM')}
 form.append('caption','🎧 Лера · Контроль наших стендов');
 const method=format==='OGG_OPUS'?'sendVoice':'sendAudio';
 const res=await fetch('https://api.telegram.org/bot'+token+'/'+method,{method:'POST',body:form,signal:AbortSignal.timeout(25000)});
 const data=await res.json().catch(()=>({}));
 if(!res.ok||!data.ok){
  if(String(data.description||'').includes('VOICE_MESSAGES_FORBIDDEN'))throw new Error('VOICE_MESSAGES_FORBIDDEN');
  throw new Error('TELEGRAM_AUDIO_'+res.status);
 }
 if(format==='OGG_OPUS'&&!data.result?.voice)throw new Error('TELEGRAM_VOICE_NOT_CONFIRMED');
 if(format==='MP3'&&!data.result?.audio)throw new Error('TELEGRAM_AUDIO_NOT_CONFIRMED');
 return data.result.message_id;
}
async function voice(chat,userId,speech){
 const k='stand360_delivery_mode:'+userId;
 const pref=await setting(k);
 let format=pref?.mode==='audio'?'MP3':'OGG_OPUS',id;
 if(format==='MP3'){id=await sendSound(chat,await synthesize(speech,userId,'MP3'),'MP3')}
 else{
  const ogg=await synthesize(speech,userId,'OGG_OPUS');
  try{id=await sendSound(chat,ogg,'OGG_OPUS')}
  catch(e){
   if(!(e instanceof Error)||e.message!=='VOICE_MESSAGES_FORBIDDEN')throw e;
   id=await sendSound(chat,await synthesize(speech,userId,'MP3'),'MP3');format='MP3';
   await setSetting(k,{mode:'audio',reason:'Telegram voice privacy'});
  }
 }
 return {id,format};
}
async function loadRows(today){
 const {data:stands,error:se}=await sb.from('stand_placements_v236346')
  .select('id,client_id,client_name,manager_name,asset_id,installed_at,last_control_at,last_control_photo_path,installation_photo_path,vision_status')
  .in('status',['active','legacy_unreconciled','return_requested']).limit(300);
 if(se)throw new Error('STANDS_READ_FAILED');
 if((stands||[]).length>=300)throw new Error('TOO_MANY_STANDS');
 const ids=(stands||[]).map(p=>p.id);
 if(!ids.length)return [];
 const {data:items,error:ie}=await sb.from('stand_placement_items_v236346').select('placement_id,sku').in('placement_id',ids).limit(3000);
 if(ie)throw new Error('SKU_READ_FAILED');
 if((items||[]).length>=3000)throw new Error('SKU_TRUNCATED');
 const clients=[...new Set(stands.map(p=>p.client_id).filter(Boolean))];
 const history=[];
 for(let i=0;i<20;i++){
  const {data,error}=await sb.from('purchase_history').select('client_id,sku,month,revenue')
    .in('client_id',clients).gte('month',monthStart(today,-11)).range(i*1000,i*1000+999);
  if(error)throw new Error('HISTORY_READ_FAILED');
  history.push(...(data||[]));
  if((data||[]).length<1000)break;
  if(i===19)throw new Error('HISTORY_TRUNCATED');
 }
 const {data:routes,error:re}=await sb.from('route_plans')
  .select('client_id,manager_name,approved,review_status,published_at,removed,visit_date')
  .eq('visit_date',today).limit(1000);
 if(re)throw new Error('ROUTES_READ_FAILED');
 if((routes||[]).length>=1000)throw new Error('ROUTES_TRUNCATED');
 return stands.map(p=>{
  const route=(routes||[]).some(r=>r.client_id===p.client_id&&surname(r.manager_name)===surname(p.manager_name)&&
    r.removed!==true&&(r.approved===true||r.review_status==='approved'||r.published_at));
  const dayCount=Math.max(0,Math.floor((Date.parse(today+'T12:00:00Z')-Date.parse(String(p.installed_at||today).slice(0,10)+'T12:00:00Z'))/86400000));
  return assessStand({...p,days_installed:dayCount},(items||[]).filter(x=>x.placement_id===p.id),history,today,route);
 });
}
Deno.serve(async(req)=>{
 try{
  if(req.method!=='POST')return reply({ok:false,error:'METHOD_NOT_ALLOWED'},405);
  const secret=await setting('dispatch_secret');
  if(!secret?.secret||req.headers.get('x-crm-dispatch-secret')!==secret.secret)return reply({ok:false,error:'FORBIDDEN'},403);
  const payload=await req.json().catch(()=>({}));
  const pilot=payload?.mode==='pilot_owner';
  if(payload?.mode&&!pilot)return reply({ok:false,error:'UNKNOWN_MODE'},400);
  const config=await setting('stand360_telegram_config');
  if(!pilot&&config?.enabled!==true)return reply({ok:true,enabled:false,reason:'FEATURE_DISABLED'});
  const now=today(),all=await loadRows(now);
  const {data:bindings,error:be}=await sb.from('crm_telegram_bindings').select('user_id,chat_id,active').eq('active',true);
  if(be)throw new Error('BINDINGS_UNAVAILABLE');
  const uids=(bindings||[]).map(b=>b.user_id);
  const {data:users,error:ue}=await sb.from('users').select('id,name,role,region,email,access_scope').in('id',uids).limit(300);
  if(ue)throw new Error('USERS_UNAVAILABLE');
  const {data:managers,error:me}=await sb.from('users').select('id,name,role,region,email,access_scope').eq('role','manager').limit(300);
  if(me)throw new Error('MANAGERS_UNAVAILABLE');
  let sentText=0,sentVoice=0;const errors=[];
  for(const b of bindings||[]){
   const user=(users||[]).find(u=>u.id===b.user_id);
   if(!user||!['boss','manager'].includes(user.role))continue;
   if(user.role==='boss'&&user.email!=='payushin_ar@resanta.ru'&&!user.region)continue;
   if(pilot&&user.id!=='544fb1e2-ef70-44de-bc62-e0e1596a4bfc')continue;
   const own=recipientStandRows(user,all,managers);
   const digest=briefing(user,own,now);
   if(!digest)continue;
   const textKey='stand360_text_sent:'+now+':'+user.id;
   const audioKey='stand360_audio_sent:'+now+':'+user.id;
   let textSent=await setting(textKey);
   if(!textSent){
    try{
     const body='🧱 <b>Лера · Стенды 360°</b>\n'+'Стендов на контроле: <b>'+own.length+
      '</b> · требуют внимания: <b>'+digest.scope_count+'</b>\n\n'+
      digest.lines.map(x=>esc(x)).join('\n')+
      '\n\n📌 Проверить оборудование, фото и отгрузки по SKU в CRM. Отсутствие отгрузок не подтверждает отсутствие розничных продаж.';
     await sendText(b.chat_id,body.slice(0,3800));
     await setSetting(textKey,{sent_at:new Date().toISOString(),count:digest.scope_count,stand_count:own.length});
     sentText++;textSent=true;
    }catch(e){errors.push({user:user.name,type:'text',error:e instanceof Error?e.message:'unknown'});continue}
   }
   if(!await setting(audioKey)){
    try{
     const result=await voice(b.chat_id,user.id,digest.voice);
     await setSetting(audioKey,{sent_at:new Date().toISOString(),telegram_message_id:result.id,format:result.format});
     sentVoice++;
    }catch(e){errors.push({user:user.name,type:'voice',error:e instanceof Error?e.message:'unknown'})}
   }
  }
  return reply({ok:errors.length===0,enabled:config?.enabled===true,pilot,date:now,stands:all.length,
    text_sent:sentText,voice_sent:sentVoice,errors});
 }catch(e){console.error('STAND360_TELEGRAM_FAILED',e instanceof Error?e.message:'unknown');
  return reply({ok:false,error:e instanceof Error?e.message:'unknown'},500)}
});
