import { createClient } from 'npm:@supabase/supabase-js@2';
import { chooseRecipientRows, managerBrief, leaderBrief, keyOf, surname } from './lera-message.mjs';
import {shouldSendPdzSnapshot,correctionPrefix} from './snapshot-revision.mjs';
import {pdzVoiceText,yandexAudioBytes} from './voice-brief.mjs';

const SUPABASE_URL=Deno.env.get('SUPABASE_URL')||'';
const SERVICE_ROLE=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'';
const BOT_TOKEN=Deno.env.get('TELEGRAM_BOT_TOKEN')||'';
const db=createClient(SUPABASE_URL,SERVICE_ROLE,{auth:{persistSession:false}});
const json=(x:unknown,status=200)=>new Response(JSON.stringify(x),{status,headers:{'content-type':'application/json; charset=utf-8'}});
const esc=(s:unknown)=>String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const money=(n:unknown)=>Number(n||0).toLocaleString('ru-RU',{minimumFractionDigits:2,maximumFractionDigits:2});
const norm=(s:unknown)=>String(s??'').toLowerCase().replace(/ё/g,'е').replace(/[^a-zа-я0-9]+/g,' ').trim();

async function tg(text:string,chatId:string|number){
 if(!BOT_TOKEN)throw new Error('TELEGRAM_BOT_TOKEN_NOT_SET');
 const r=await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`,{
  method:'POST',headers:{'content-type':'application/json'},
  body:JSON.stringify({chat_id:chatId,text,parse_mode:'HTML',disable_web_page_preview:true})
 });
 const j=await r.json().catch(()=>({}));
 if(!r.ok||!j?.ok)throw new Error('TELEGRAM_SEND_FAILED');
}

async function synthesizePdzVoice(text:string,userId:string){
 const apiKey=Deno.env.get('YANDEX_SPEECHKIT_API_KEY')||'';
 if(!apiKey)throw new Error('PDZ_TTS_NOT_CONFIGURED');
 // Reuse the existing per-user Yandex monthly quota; no new unmanaged budget.
 const claim=await db.rpc('crm_ai360_yandex_monthly_claim_v1',{p_user_id:userId,p_characters:text.length});
 if(claim.error)throw new Error('PDZ_TTS_BUDGET_ERROR');
 if(!claim.data?.allowed)throw new Error('PDZ_TTS_BUDGET_EXHAUSTED');
 const headers:Record<string,string>={'Authorization':'Api-Key '+apiKey,'Content-Type':'application/json'};
 const folderId=Deno.env.get('YANDEX_CLOUD_FOLDER_ID')||'';
 if(folderId)headers['x-folder-id']=folderId;
 const result=await fetch('https://tts.api.cloud.yandex.net/tts/v3/utteranceSynthesis',{
  method:'POST',headers,signal:AbortSignal.timeout(26000),
  body:JSON.stringify({text,model:'general',hints:[{voice:'lera'},{role:'friendly'}],
   outputAudioSpec:{containerAudio:{containerAudioType:'OGG_OPUS'}}})
 });
 if(!result.ok)throw new Error('PDZ_TTS_PROVIDER_'+result.status);
 return yandexAudioBytes(await result.text());
}
async function tgVoice(chatId:string|number,audio:Uint8Array,reportDate:string){
 if(!BOT_TOKEN)throw new Error('TELEGRAM_BOT_TOKEN_NOT_SET');
 const form=new FormData();
 form.append('chat_id',String(chatId));
 form.append('caption','🎧 Лера · голосовой брифинг ПДЗ за '+ruDate(reportDate));
 const blobBytes=new Uint8Array(new ArrayBuffer(audio.length));blobBytes.set(audio);
 form.append('voice',new Blob([blobBytes],{type:'audio/ogg'}),'lera-pdz.ogg');
 const res=await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendVoice`,{
  method:'POST',body:form,signal:AbortSignal.timeout(25000)
 });
 const data=await res.json().catch(()=>({}));
 if(!res.ok||!data?.ok||!data?.result?.voice)throw new Error('TELEGRAM_VOICE_SEND_FAILED');
 return data.result.message_id;
}

async function runtimeGet(key:string){
 const {data}=await db.from('crm_telegram_runtime').select('value').eq('key',key).maybeSingle();
 return data?.value||null;
}
async function runtimeSet(key:string,value:unknown){
 const {error}=await db.from('crm_telegram_runtime').upsert({key,value,updated_at:new Date().toISOString()},{onConflict:'key'});
 if(error)throw error;
}
function chunks(lines:string[],header:string,max=3600){
 const out:string[]=[];let cur=header;
 for(const line of lines){
  if((cur+'\n'+line).length>max){out.push(cur);cur=header+'\n'+line}else cur+='\n'+line;
 }
 if(cur!==header)out.push(cur);
 return out;
}
function belongs(manager:string,userName:string){
 const m=norm(manager),u=norm(userName);
 if(!m||!u)return false;
 const first=u.split(' ')[0];
 return first.length>=3&&m.includes(first);
}
function localDate(){
 return new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Minsk',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
}
function ruDate(s:string){
 const [y,m,d]=s.split('-');return d&&m&&y?`${d}.${m}.${y}`:s;
}
function fmtTime(s:unknown){
 if(!s)return '';
 try{
  return new Intl.DateTimeFormat('ru-RU',{timeZone:'Europe/Minsk',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(String(s)));
 }catch(_){return String(s)}
}

type DebtRow={client_name:string;manager_name:string;debt_overdue:number;debt_overdue_pct:number|null;debt_overdue_days:number;report_date:string};
type LegalRow={client_key:string;action_type:string;action_at:string;comment:string|null;author_name:string};

function legalKey(client:string,type:string){return norm(client)+'|'+type}
function actionText(d:DebtRow,legalMap:Map<string,LegalRow>){
 const days=Number(d.debt_overdue_days||0);
 const claim=legalMap.get(legalKey(d.client_name,'claim_sent'));
 const court=legalMap.get(legalKey(d.client_name,'court_submitted'));
 if(days>=60){
  if(court)return '✅ <b>В суд передано</b> '+esc(fmtTime(court.action_at))+' · '+esc(court.author_name||'');
  return '⚖ <b>В СУД</b>';
 }
 if(days>=30){
  if(claim)return '✅ <b>Претензия отправлена</b> '+esc(fmtTime(claim.action_at))+' · '+esc(claim.author_name||'');
  return '✉ <b>ПРЕТЕНЗИЯ + ПОЧТА</b>';
 }
 return '';
}
function linesFor(rows:DebtRow[],showManager:boolean,legalMap:Map<string,LegalRow>){
 return rows.map((d,i)=>{
  const action=actionText(d,legalMap);
  const mgr=showManager?' · 👤 '+esc(d.manager_name||'—'):'';
  return (i+1)+'. <b>'+esc(d.client_name||'—')+'</b> — <b>'+money(d.debt_overdue)+' BYN</b> · '+Number(d.debt_overdue_days||0)+' дн.'+mgr+(action?' · '+action:'');
 });
}
function summaryHeader(rows:DebtRow[],reportDate:string,title:string,legalMap:Map<string,LegalRow>){
 const total=rows.reduce((s,d)=>s+Number(d.debt_overdue||0),0);
 const claimRows=rows.filter(d=>Number(d.debt_overdue_days||0)>=30&&Number(d.debt_overdue_days||0)<60);
 const courtRows=rows.filter(d=>Number(d.debt_overdue_days||0)>=60);
 const pendingClaims=claimRows.filter(d=>!legalMap.get(legalKey(d.client_name,'claim_sent'))).length;
 const pendingCourts=courtRows.filter(d=>!legalMap.get(legalKey(d.client_name,'court_submitted'))).length;
 return '💰 <b>Resanta CRM · ПДЗ на '+esc(ruDate(reportDate))+'</b>\n'
   +title+'\n'
   +'Должников: <b>'+rows.length+'</b> · сумма: <b>'+money(total)+' BYN</b>\n'
   +'✉ 30–59: <b>'+claimRows.length+'</b> (не отправлено: <b>'+pendingClaims+'</b>) · '
   +'⚖ 60+: <b>'+courtRows.length+'</b> (не передано: <b>'+pendingCourts+'</b>)\n';
}

// Unique exact CRM client AND manager matches only. Never link an ambiguous
// trading point to another legal entity's contact or payment promise.
async function verifiedComments(debts:DebtRow[]){
 const evidence=new Map<string,any>();
 const names=[...new Set(debts.map(x=>x.client_name).filter(Boolean))];
 if(!names.length)return evidence;
 const {data:clientRows,error:ce}=await db.from('clients')
  .select('id,name,manager_name,is_archived').in('name',names).limit(1000);
 if(ce){console.warn('PDZ Lera: client linkage not available');return evidence;}
 const matched=new Map<string,string>(),ambiguous=new Set<string>();
 for(const c of clientRows||[]){
  if(c.is_archived)continue;
  const key=norm(c.name)+'|'+surname(c.manager_name);
  if(!debts.some(d=>keyOf(d)===key))continue;
  if(matched.has(key)&&matched.get(key)!==c.id)ambiguous.add(key);
  else matched.set(key,c.id);
 }
 for(const key of ambiguous)matched.delete(key);
 if(!matched.size)return evidence;
 const ids=[...new Set(matched.values())];
 const {data:comments,error:de}=await db.from('debt_comments')
  .select('client_id,comment,promised_date,amount,created_at')
  .in('client_id',ids).order('created_at',{ascending:false}).limit(1500);
 if(de){console.warn('PDZ Lera: comment verification unavailable');return evidence;}
 const byId=new Map<string,any>();
 for(const row of comments||[])if(!byId.has(row.client_id))byId.set(row.client_id,row);
 for(const [key,id] of matched){const rec=byId.get(id);if(rec)evidence.set(key,rec);}
 return evidence;
}
// Historical comparison is informational. Reducing debt never proves that
// a payment was received; that requires payment-register reconciliation.
async function previousDebts(reportDate:string){
 const {data:dayRows,error:e1}=await db.from('client_debt_history_v1')
  .select('report_date').lt('report_date',reportDate)
  .order('report_date',{ascending:false}).limit(1);
 if(e1||!dayRows?.length)return null;
 const previous=String(dayRows[0].report_date);
 const {data:rows,error:e2}=await db.from('client_debt_history_v1')
  .select('client_name,manager_name,debt_overdue,debt_overdue_days,report_date')
  .eq('report_date',previous).gt('debt_overdue',0).limit(2000);
 if(e2)return null;
 return (rows||[]) as DebtRow[];
}
Deno.serve(async(req)=>{
 try{
  const stored=await runtimeGet('dispatch_secret');
  const expected=stored?.secret||'';
  const got=req.headers.get('x-crm-dispatch-secret')||'';
  if(!expected||got!==expected)return json({ok:false,error:'FORBIDDEN'},403);

  const payload=await req.json().catch(()=>({}));
  const voicePilot=payload?.mode==='pdz_voice_pilot_owner';
  if(payload?.mode&&!voicePilot)return json({ok:false,error:'UNSUPPORTED_MODE'},400);
  const today=localDate();
  const {data:latestRows,error:le}=await db.from('client_debt').select('report_date,imported_at').order('report_date',{ascending:false}).order('imported_at',{ascending:false}).limit(1);
  if(le)throw le;
  const reportDate=String(latestRows?.[0]?.report_date||'');
  const sourceImportedAt=String(latestRows?.[0]?.imported_at||'');
  if(!reportDate)return json({ok:true,reason:'NO_PDZ'});

  const {data:debtsRaw,error:de}=await db.from('client_debt')
   .select('client_name,manager_name,debt_overdue,debt_overdue_pct,debt_overdue_days,report_date')
   .eq('report_date',reportDate)
   .gt('debt_overdue',0)
   .order('debt_overdue_days',{ascending:false})
   .order('debt_overdue',{ascending:false});
  if(de)throw de;
  const debts=(debtsRaw||[]) as DebtRow[];

  const {data:legalRaw,error:lae}=await db.from('pdz_legal_actions')
    .select('client_key,action_type,action_at,comment,author_name')
    .order('action_at',{ascending:false}).limit(3000);
  if(lae)throw lae;
  const legalMap=new Map<string,LegalRow>();
  for(const x of (legalRaw||[]) as LegalRow[]){
    const k=String(x.client_key||'')+'|'+String(x.action_type||'');
    if(!legalMap.has(k))legalMap.set(k,x);
  }

  const evidence=await verifiedComments(debts);
  const previousRows=await previousDebts(reportDate);
  const {data:managerProfilesRaw,error:mpError}=await db.from('users')
   .select('id,name,email,role,region,access_scope').eq('role','manager').limit(500);
  if(mpError)throw mpError;
  const managerProfiles=(managerProfilesRaw||[]) as any[];
  const group=await runtimeGet('pdz_group_chat');
  const groupChatId=group?.active&&group?.chat_id?group.chat_id:null;
  let groupSent=false;
  let sentMessages=0;
  const errors:any[]=[];

  if(!voicePilot && groupChatId && debts.length){
   const groupKey=`pdz_daily_group_sent:${today}:${groupChatId}`;
   const lastGroup=await runtimeGet(groupKey);
   if(shouldSendPdzSnapshot(lastGroup,reportDate,sourceImportedAt)){
    try{
      const actionRows=debts.filter(d=>Number(d.debt_overdue_days||0)>=30);
      const under30=debts.filter(d=>Number(d.debt_overdue_days||0)<30);
      const under30Total=under30.reduce((s,d)=>s+Number(d.debt_overdue||0),0);
      const header=correctionPrefix(lastGroup)+summaryHeader(debts,reportDate,'Контроль: <b>Паюшин + Сидарович</b>',legalMap)
        +(under30.length?'🟡 До 30 дней: <b>'+under30.length+'</b> клиентов · <b>'+money(under30Total)+' BYN</b>\n':'');
      const actionLines=actionRows.length
        ? linesFor(actionRows,true,legalMap)
        : ['✅ Клиентов 30+ дней, требующих претензии или суда, сейчас нет.'];
      for(const part of chunks(actionLines,header)){await tg(part,groupChatId);sentMessages++;}
      await runtimeSet(groupKey,{sent_at:new Date().toISOString(),report_date:reportDate,source_imported_at:sourceImportedAt,rows:debts.length,total:debts.reduce((s,d)=>s+Number(d.debt_overdue||0),0)});
      groupSent=true;
    }catch(e){
      errors.push({group:group?.title||groupChatId,error:e instanceof Error?e.message:String(e)});
    }
   }
  }

  const {data:bindings,error:be}=await db.from('crm_telegram_bindings')
   .select('user_id,chat_id,active,telegram_first_name').eq('active',true);
  if(be)throw be;
  const pilotOwnerId='544fb1e2-ef70-44de-bc62-e0e1596a4bfc';
  const ids=[...new Set((bindings||[]).map((x:any)=>String(x.user_id)))].filter(id=>!voicePilot||id===pilotOwnerId);
  if(voicePilot&&!ids.length)return json({ok:false,error:'PDZ_VOICE_PILOT_OWNER_NOT_BOUND'},409);
  const voiceConfig=await runtimeGet('pdz_voice_config');
  if(!ids.length)return json({ok:errors.length===0,reason:'NO_BINDINGS',group_sent:groupSent,errors});

  const {data:users,error:ue}=await db.from('users').select('id,name,email,role,region,access_scope').in('id',ids);
  if(ue)throw ue;
  const userMap=new Map((users||[]).map((x:any)=>[String(x.id),x]));
  const bindMap=new Map((bindings||[]).map((x:any)=>[String(x.user_id),x]));

  let sentUsers=0,leadersSent=0,voiceSentUsers=0;
  const voiceErrors:any[]=[];
  for(const uid of ids){
   const u:any=userMap.get(uid),b:any=bindMap.get(uid);if(!u||!b)continue;
   if(!['boss','manager'].includes(String(u.role||'')))continue;
   // Unknown directors cannot receive a network-wide view by default.
   if(u.role==='boss'&&String(u.email||'').toLowerCase()!=='payushin_ar@resanta.ru'&&!u.region)continue;
   // Scope is defined by CRM role and region, never Telegram screen names.
   const rows=chooseRecipientRows(u,debts,managerProfiles);
   const prior=previousRows===null?null:chooseRecipientRows(u,previousRows,managerProfiles);
   const sentKey='pdz_daily_sent:'+today+':'+uid;
   const lastSent=await runtimeGet(sentKey);
   const needsText=!voicePilot&&shouldSendPdzSnapshot(lastSent,reportDate,sourceImportedAt);
   const voiceKey='pdz_daily_voice_sent:'+today+':'+uid;
   const voiceAllowed=voicePilot||voiceConfig?.enabled===true;
   const lastVoice=voiceAllowed?await runtimeGet(voiceKey):null;
   const needsVoice=voiceAllowed&&shouldSendPdzSnapshot(lastVoice,reportDate,sourceImportedAt);
   if(!needsText&&!needsVoice)continue;
   const digest=needsText?(u.role==='boss'?
    leaderBrief({user:u,rows,previousRows:prior,reportDate,today,evidence,managerUsers:managerProfiles}):
    managerBrief({user:u,binding:b,rows,previousRows:prior,reportDate,today,
      evidence,legalAction:(row:DebtRow)=>actionText(row,legalMap)})):null;
   if(needsText&&digest){
    try{
     for(const part of chunks(digest.lines,correctionPrefix(lastSent)+digest.header)){await tg(part,b.chat_id);sentMessages++;}
     await runtimeSet(sentKey,{
       sent_at:new Date().toISOString(),report_date:reportDate,source_imported_at:sourceImportedAt,rows:rows.length,total:digest.total,
       format:'lera-pdz-personal-v1',role:u.role,contacts_missing:digest.counts.no_record,
       promises_overdue:digest.counts.promise_overdue
     });
     sentUsers++;
     if(u.role==='boss')leadersSent++;
    }catch(e){
     errors.push({user:u.name,error:e instanceof Error?e.message:String(e)});
     continue; // Don't send audio if the textual detail wasn't safely sent.
    }
   }
   if(needsVoice){
    try{
     const speech=pdzVoiceText({user:u,binding:b,rows,previousRows:prior,reportDate,today,evidence});
     const audio=await synthesizePdzVoice(speech,uid);
     const messageId=await tgVoice(b.chat_id,audio,reportDate);
     await runtimeSet(voiceKey,{sent_at:new Date().toISOString(),report_date:reportDate,source_imported_at:sourceImportedAt,
      format:'lera-pdz-ogg-opus-v1',chars:speech.length,telegram_message_id:messageId});
     voiceSentUsers++;
    }catch(e){
     // Leave the voice revision unsent to retry at the next scheduled check.
     // A failed voice never causes duplicate text or overwrites source 1C debt.
     voiceErrors.push({user:u.name,error:e instanceof Error?e.message:String(e)});
    }
   }
  }

  return json({
    ok:errors.length===0,report_date:reportDate,group_configured:!!groupChatId,group_sent:groupSent,
    sent_users:sentUsers,leaders_sent:leadersSent,sent_messages:sentMessages,
    voice_sent_users:voiceSentUsers,voice_enabled:voiceConfig?.enabled===true,voice_pilot:voicePilot,
    errors,voice_errors:voiceErrors
  });
 }catch(e){
  console.error(e);
  return json({ok:false,error:e instanceof Error?e.message:String(e)},500);
 }
});