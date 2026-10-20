import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL=Deno.env.get('SUPABASE_URL')||'';
const SERVICE_ROLE=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'';
const BOT_TOKEN=Deno.env.get('TELEGRAM_BOT_TOKEN')||'';
const db=createClient(SUPABASE_URL,SERVICE_ROLE,{auth:{persistSession:false}});

const json=(x:unknown,status=200)=>new Response(JSON.stringify(x),{
  status,headers:{'content-type':'application/json; charset=utf-8'}
});
const esc=(s:unknown)=>String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

async function runtimeGet(key:string){
  const {data,error}=await db.from('crm_telegram_runtime').select('value').eq('key',key).maybeSingle();
  if(error)throw error;
  return data?.value||null;
}
async function tg(text:string,chatId:string|number){
  if(!BOT_TOKEN)throw new Error('TELEGRAM_BOT_TOKEN_NOT_SET');
  const r=await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`,{
    method:'POST',headers:{'content-type':'application/json'},
    body:JSON.stringify({chat_id:chatId,text,parse_mode:'HTML',disable_web_page_preview:true})
  });
  const j=await r.json().catch(()=>({}));
  if(!r.ok||!j?.ok)throw new Error('TELEGRAM_SEND_FAILED');
}
function minskTime(v:unknown){
  if(!v)return '—';
  try{return new Intl.DateTimeFormat('ru-RU',{timeZone:'Europe/Minsk',hour:'2-digit',minute:'2-digit'}).format(new Date(String(v)));}
  catch(_){return String(v)}
}
function minskDate(){
  return new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Minsk',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
}

Deno.serve(async(req)=>{
  try{
    const stored=await runtimeGet('dispatch_secret');
    const expected=String(stored?.secret||'');
    const got=req.headers.get('x-crm-dispatch-secret')||'';
    if(!expected||got!==expected)return json({ok:false,error:'FORBIDDEN'},403);

    const body=await req.json().catch(()=>({}));
    const phase=String(body?.phase||'');
    if(!['18:10','20:00'].includes(phase))return json({ok:false,error:'INVALID_PHASE'},400);

    const {data:days,error:de}=await db.from('gps_workdays')
      .select('id,user_id,manager_name,work_date,started_at,last_point_at,native_tracking,status')
      .eq('status','active')
      .not('user_id','is',null);
    if(de)throw de;
    if(!(days||[]).length)return json({ok:true,phase,active:0,sent:0});

    const userIds=[...new Set((days||[]).map((x:any)=>String(x.user_id)).filter(Boolean))];
    const {data:bindings,error:be}=await db.from('crm_telegram_bindings')
      .select('user_id,chat_id,active').in('user_id',userIds).eq('active',true);
    if(be)throw be;
    const bindMap=new Map((bindings||[]).map((x:any)=>[String(x.user_id),x]));

    let sent=0,skipped=0,noBinding=0,failed=0;
    const errors:any[]=[];
    const reminderDate=minskDate();

    for(const w of (days||[]) as any[]){
      const workdayId=String(w.id),uid=String(w.user_id),manager=String(w.manager_name||'Менеджер');
      const binding:any=bindMap.get(uid);
      const {data:existing,error:ee}=await db.from('gps_workday_reminder_log_v236417')
        .select('status').eq('workday_id',workdayId).eq('reminder_kind',phase).eq('reminder_date',reminderDate).maybeSingle();
      if(ee)throw ee;
      if(existing?.status==='sent'||existing?.status==='pending'){skipped++;continue;}

      if(!binding?.chat_id){
        await db.from('gps_workday_reminder_log_v236417').upsert({
          workday_id:workdayId,reminder_kind:phase,user_id:uid,manager_name:manager,
          work_date:w.work_date,reminder_date:reminderDate,status:'no_binding',error_text:'NO_ACTIVE_TELEGRAM_BINDING'
        },{onConflict:'workday_id,reminder_kind,reminder_date'});
        noBinding++;continue;
      }

      await db.from('gps_workday_reminder_log_v236417').upsert({
        workday_id:workdayId,reminder_kind:phase,user_id:uid,manager_name:manager,
        work_date:w.work_date,reminder_date:reminderDate,status:'pending',telegram_chat_id:binding.chat_id,error_text:null
      },{onConflict:'workday_id,reminder_kind,reminder_date'});

      const started=minskTime(w.started_at);
      const text=phase==='18:10'
        ? '🚗 <b>GPS рабочего дня всё ещё включён.</b>\nРабочий день начат в <b>'+esc(started)+'</b>.\n\nЕсли работу закончили — завершите рабочий день в Ресанта CRM. Если продолжаете работать — ничего делать не нужно.'
        : '⏰ <b>Повторное напоминание: GPS всё ещё включён.</b>\nРабочий день идёт с <b>'+esc(started)+'</b>.\n\nЕсли работа уже закончена — пожалуйста, завершите рабочий день, чтобы GPS не записывался ночью. Если вы ещё в работе — оставьте GPS включённым.';

      try{
        await tg(text,binding.chat_id);
        const {error:ue}=await db.from('gps_workday_reminder_log_v236417').update({
          status:'sent',sent_at:new Date().toISOString(),error_text:null
        }).eq('workday_id',workdayId).eq('reminder_kind',phase).eq('reminder_date',reminderDate);
        if(ue)throw ue;
        sent++;
      }catch(e){
        const msg=e instanceof Error?e.message:String(e);
        await db.from('gps_workday_reminder_log_v236417').update({
          status:'failed',error_text:msg
        }).eq('workday_id',workdayId).eq('reminder_kind',phase).eq('reminder_date',reminderDate);
        failed++;errors.push({manager,error:msg});
      }
    }
    return json({ok:failed===0,phase,active:(days||[]).length,sent,skipped,no_binding:noBinding,failed,errors});
  }catch(e){
    console.error(e);
    return json({ok:false,error:e instanceof Error?e.message:String(e)},500);
  }
});