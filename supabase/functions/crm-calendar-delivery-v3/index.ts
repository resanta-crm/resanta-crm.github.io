import {createClient} from 'npm:@supabase/supabase-js@2.95.0';
import webpush from 'npm:web-push@3.6.7';
import {SignJWT,importPKCS8} from 'npm:jose@6.1.0';
import {calendarMessage,summarizeDelivery} from './delivery.mjs';
const reply=(x:unknown,status=200)=>new Response(JSON.stringify(x),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
const check=(r:any)=>{if(r.error)throw Error('database_error');return r.data;};
async function googleToken(){
 const a=JSON.parse(Deno.env.get('FIREBASE_SERVICE_ACCOUNT_JSON')||'{}');if(!a.private_key||!a.client_email||!a.project_id)throw Error('fcm_unconfigured');
 const jwt=await new SignJWT({scope:'https://www.googleapis.com/auth/firebase.messaging'}).setProtectedHeader({alg:'RS256'}).setIssuer(a.client_email).setAudience('https://oauth2.googleapis.com/token').setIssuedAt().setExpirationTime('1h').sign(await importPKCS8(a.private_key,'RS256'));
 const r=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion:jwt}),signal:AbortSignal.timeout(8000)});const j=await r.json();if(!r.ok||!j.access_token)throw Error('fcm_auth');return {token:j.access_token,project:a.project_id};
}
Deno.serve(async req=>{
 if(req.method!=='POST')return reply({error:'method_not_allowed'},405);
 const supplied=req.headers.get('x-crm-dispatch-secret')||'';if(supplied.length<24||supplied.length>256)return reply({error:'not_authorized'},403);
 const db=createClient(Deno.env.get('SUPABASE_URL')||'',Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'',{auth:{persistSession:false}});
 const secret=await db.from('crm_telegram_runtime').select('value').eq('key','dispatch_secret').maybeSingle();
 if(secret.error||supplied!==String(secret.data?.value?.secret||''))return reply({error:'not_authorized'},403);
 try{
  const tasks=check(await db.rpc('crm_calendar_events_claim_v3'))||[];let google:any;const counts:any={claimed:tasks.length,sent:0,partial:0,failed:0,unknown:0,no_channel:0,cancelled:0};
  for(const e of tasks){
   const results:any[]=[];
   try{
    const m=check(await db.from('crm_ai360_meetings_v1').select('id,owner_id,title,purpose,starts_at,duration_minutes,status').eq('id',e.meeting_id).maybeSingle());
    const recipient=check(await db.from('users').select('id,role').eq('id',e.recipient_id).maybeSingle());
    const invitation=check(await db.from('crm_calendar_invites_v3').select('state').eq('meeting_id',e.meeting_id).eq('recipient_id',e.recipient_id).maybeSingle());
    if(!m||!recipient||recipient.role==='auditor_pending'||recipient.id==='bcc330b8-9100-4c60-b87f-22a36988fc97'||(e.kind!=='cancelled'&&(m.status!=='scheduled'||Date.parse(m.starts_at)+m.duration_minutes*60000<=Date.now()||Date.parse(m.starts_at)!==Date.parse(e.starts_at)||(m.owner_id!==recipient.id&&!['invited','accepted'].includes(invitation?.state))))){check(await db.from('crm_calendar_events_v3').update({status:'cancelled'}).eq('id',e.id).eq('status','sending'));counts.cancelled++;continue;}
    const organizer=check(await db.from('users').select('name').eq('id',m.owner_id).maybeSingle());
    const message=calendarMessage(e,m,organizer?.name||'Организатор');
    const payload={kind:'calendar',calendar_event:e.kind,meeting_id:e.meeting_id,calendar_day:new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Minsk',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(m.starts_at)),account_id:e.recipient_id,delivery_id:e.id,title:message.title,body:message.body,expires_at:new Date(Date.now()+86400000).toISOString()};
    const binding=check(await db.from('crm_telegram_bindings').select('chat_id').eq('user_id',e.recipient_id).eq('active',true).maybeSingle());
    if(binding?.chat_id>0){
     const token=Deno.env.get('TELEGRAM_BOT_TOKEN');
     if(!token)results.push({channel:'telegram',status:'failed',error:'not_configured'});
     else try{const r=await fetch('https://api.telegram.org/bot'+token+'/sendMessage',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({chat_id:binding.chat_id,text:message.text,disable_web_page_preview:true}),signal:AbortSignal.timeout(8000)});const j=await r.json();results.push({channel:'telegram',status:r.ok&&j.ok===true?'sent':'failed',message_id:j.ok===true?j.result?.message_id:null});}catch{results.push({channel:'telegram',status:'unknown'});}
    }
    const devices=check(await db.from('connect_web_devices_v2').select('subscription').eq('user_id',e.recipient_id))||[];
    const vapid=devices.length?check(await db.from('connect_runtime_v2').select('value').eq('key','vapid').maybeSingle())?.value:null;
    for(const d of devices){
     if(!vapid?.privateKey){results.push({channel:'web',status:'failed',error:'not_configured'});continue;}
     try{await webpush.sendNotification(d.subscription,JSON.stringify(payload),{TTL:86400,urgency:'high',timeout:8000,vapidDetails:{subject:'https://resanta-crm.by',publicKey:vapid.publicKey,privateKey:vapid.privateKey}});results.push({channel:'web',status:'sent'});}catch(err:any){results.push({channel:'web',status:err.statusCode?'failed':'unknown'});}
    }
    const natives=check(await db.from('connect_push_devices_v1').select('fcm_token').eq('user_id',e.recipient_id))||[];
    for(const d of natives){try{
     google=google||await googleToken();
     const r=await fetch('https://fcm.googleapis.com/v1/projects/'+google.project+'/messages:send',{method:'POST',headers:{Authorization:'Bearer '+google.token,'Content-Type':'application/json'},body:JSON.stringify({message:{token:d.fcm_token,notification:{title:message.title,body:message.body},data:Object.fromEntries(Object.entries(payload).map(([k,v])=>[k,String(v)])),android:{priority:'HIGH',ttl:'86400s',notification:{channel_id:'resanta_connect',tag:'calendar-'+e.id}}}}),signal:AbortSignal.timeout(8000)});results.push({channel:'apk',status:r.ok?'sent':'failed'});
    }catch{results.push({channel:'apk',status:'unknown'});}}
    const status=summarizeDelivery(results);check(await db.from('crm_calendar_events_v3').update({status,results}).eq('id',e.id).eq('status','sending'));counts[status]++;
   }catch{await db.from('crm_calendar_events_v3').update({status:'unknown',results}).eq('id',e.id).eq('status','sending');counts.unknown++;}
  }
  return reply({ok:true,...counts});
 }catch{return reply({error:'calendar_delivery_unavailable'},503);}
});
