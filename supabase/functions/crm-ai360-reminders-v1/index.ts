import {createClient} from 'npm:@supabase/supabase-js@2.56.0';
import {deliverReminder} from './delivery.mjs';
const IDS=new Set(['544fb1e2-ef70-44de-bc62-e0e1596a4bfc','a24954b8-2fe1-4852-b629-d8f351e1bd36','ba55dfe5-7e48-4f1f-b40e-674c7752fe1a','19dd9943-99ae-47c4-a39c-4f82a11059a6','3d935a76-c6fe-44b6-b248-fcbe58c6bf1c','4fd79fa0-232d-4768-8099-25f47923cc4f','6efa656e-45c6-473b-a853-89eccb9ee43a','9076ccde-a8cc-47e3-b71e-c31170b693ff']);
const reply=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
Deno.serve(async req=>{
 if(req.method!=='POST')return reply({error:'method_not_allowed'},405);
 const supplied=String(req.headers.get('x-crm-dispatch-secret')||'');
 if(supplied.length<24||supplied.length>256)return reply({error:'not_authorized'},403);
 const svc=createClient(Deno.env.get('SUPABASE_URL')||'',Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'',{auth:{persistSession:false}});
 const secret=await svc.from('crm_telegram_runtime').select('value').eq('key','dispatch_secret').maybeSingle();
 const expected=String(secret.data?.value?.secret||'');
 if(secret.error||expected.length<24||supplied!==expected)return reply({error:'not_authorized'},403);
 const bot=Deno.env.get('TELEGRAM_BOT_TOKEN')||'';
 if(!bot)return reply({error:'delivery_not_configured'},503);
 // A crashed/unknown previous send is not automatically replayed.
 await svc.from('crm_ai360_reminders_v1').update({status:'delivery_unknown',error_reason:'worker_result_unknown'})
  .eq('status','sending').lt('attempted_at',new Date(Date.now()-10*60000).toISOString());
 const due=await svc.rpc('crm_ai360_reminders_claim_v1',{p_limit:10});
 if(due.error)return reply({error:'reminder_queue_unavailable'},503);
 const counts={sent:0,failed:0,delivery_unknown:0};
 for(const row of due.data||[]){
  const [binding,profile]=await Promise.all([
   svc.from('crm_telegram_bindings').select('chat_id').eq('user_id',row.owner_id).eq('active',true).maybeSingle(),
   svc.from('users').select('role').eq('id',row.owner_id).maybeSingle()
  ]);
  const outcome=await deliverReminder(row,{binding:binding.error?null:binding.data,
   ownerAllowed:!profile.error&&IDS.has(row.owner_id)&&['boss','manager'].includes(profile.data?.role),
   send:async(chat,text)=>{
    const response=await fetch('https://api.telegram.org/bot'+bot+'/sendMessage',{
     method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({chat_id:chat,text,disable_web_page_preview:true}),
     signal:AbortSignal.timeout(5000)});
    const data=await response.json();
    return {ok:response.ok&&data?.ok===true,message_id:data?.result?.message_id};
   },
   save:async(id,values)=>{const r=await svc.from('crm_ai360_reminders_v1').update(values).eq('id',id).eq('status','sending').select('id').maybeSingle();return !r.error&&r.data?.id===id;}
  });
  counts[outcome]++;
 }
 return reply({ok:true,...counts});
});
