import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL=Deno.env.get('SUPABASE_URL')||'';
const SERVICE_ROLE=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'';
const BOT_TOKEN=Deno.env.get('TELEGRAM_BOT_TOKEN')||'';
const db=createClient(SUPABASE_URL,SERVICE_ROLE,{auth:{persistSession:false}});
const LEADER_EMAILS=new Set(['sidarovich_kn@resanta.ru','payushin_ar@resanta.ru']);
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
function legal(days:number){
 if(days>=60)return '⚖ <b>В СУД</b>';
 if(days>=30)return '✉ <b>ПРЕТЕНЗИЯ + ПОЧТА</b>';
 return '';
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

Deno.serve(async(req)=>{
 try{
  const stored=await runtimeGet('dispatch_secret');
  const expected=stored?.secret||'';
  const got=req.headers.get('x-crm-dispatch-secret')||'';
  if(!expected||got!==expected)return json({ok:false,error:'FORBIDDEN'},403);

  const today=localDate();
  const {data:latestRows,error:le}=await db.from('client_debt').select('report_date').order('report_date',{ascending:false}).limit(1);
  if(le)throw le;
  const reportDate=String(latestRows?.[0]?.report_date||'');
  if(!reportDate)return json({ok:true,reason:'NO_PDZ'});

  const {data:debts,error:de}=await db.from('client_debt')
   .select('client_name,manager_name,debt_overdue,debt_overdue_pct,debt_overdue_days,report_date')
   .eq('report_date',reportDate)
   .gt('debt_overdue',0)
   .order('debt_overdue_days',{ascending:false})
   .order('debt_overdue',{ascending:false});
  if(de)throw de;

  const {data:bindings,error:be}=await db.from('crm_telegram_bindings')
   .select('user_id,chat_id,active').eq('active',true);
  if(be)throw be;
  const ids=[...new Set((bindings||[]).map((x:any)=>String(x.user_id)))];
  if(!ids.length)return json({ok:true,reason:'NO_BINDINGS'});
  const {data:users,error:ue}=await db.from('users').select('id,name,email,role').in('id',ids);
  if(ue)throw ue;
  const userMap=new Map((users||[]).map((x:any)=>[String(x.id),x]));
  const bindMap=new Map((bindings||[]).map((x:any)=>[String(x.user_id),x]));

  let sentUsers=0,sentMessages=0;
  const errors:any[]=[];
  for(const uid of ids){
   const u:any=userMap.get(uid),b:any=bindMap.get(uid);if(!u||!b)continue;
   const isLeader=LEADER_EMAILS.has(String(u.email||'').toLowerCase());
   const rows=(debts||[]).filter((d:any)=>isLeader||belongs(String(d.manager_name||''),String(u.name||'')));
   const sentKey=`pdz_daily_sent:${today}:${uid}`;
   if(await runtimeGet(sentKey))continue;
   if(!rows.length){
    await runtimeSet(sentKey,{sent_at:new Date().toISOString(),report_date:reportDate,rows:0});
    continue;
   }

   const total=rows.reduce((s:number,d:any)=>s+Number(d.debt_overdue||0),0);
   const claims=rows.filter((d:any)=>Number(d.debt_overdue_days||0)>=30&&Number(d.debt_overdue_days||0)<60).length;
   const courts=rows.filter((d:any)=>Number(d.debt_overdue_days||0)>=60).length;
   const header='💰 <b>Resanta CRM · ПДЗ на '+esc(ruDate(reportDate))+'</b>\n'
    +(isLeader?'Все менеджеры':'Менеджер: <b>'+esc(u.name)+'</b>')+'\n'
    +'Должников: <b>'+rows.length+'</b> · сумма: <b>'+money(total)+' BYN</b>'
    +(claims||courts?'\n✉ претензия 30–59: <b>'+claims+'</b> · ⚖ в суд 60+: <b>'+courts+'</b>':'')+'\n';

   const lines=rows.map((d:any,i:number)=>{
    const days=Number(d.debt_overdue_days||0);
    const action=legal(days);
    const mgr=isLeader?' · 👤 '+esc(d.manager_name||'—'):'';
    return (i+1)+'. <b>'+esc(d.client_name||'—')+'</b> — <b>'+money(d.debt_overdue)+' BYN</b> · '+days+' дн.'+mgr+(action?' · '+action:'');
   });
   try{
    for(const part of chunks(lines,header)){await tg(part,b.chat_id);sentMessages++;}
    await runtimeSet(sentKey,{sent_at:new Date().toISOString(),report_date:reportDate,rows:rows.length,total});
    sentUsers++;
   }catch(e){
    errors.push({user:u.name,error:e instanceof Error?e.message:String(e)});
   }
  }
  return json({ok:errors.length===0,report_date:reportDate,sent_users:sentUsers,sent_messages:sentMessages,errors});
 }catch(e){
  console.error(e);
  return json({ok:false,error:e instanceof Error?e.message:String(e)},500);
 }
});