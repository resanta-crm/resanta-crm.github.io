import { createClient } from 'npm:@supabase/supabase-js@2';

// The existing CRM Telegram bot credentials are server-side only.
// This function is a separate authenticated sender, not a new bot/webhook.
const BASE=Deno.env.get('SUPABASE_URL')||'';
const SERVICE=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'';
const ANON=Deno.env.get('ANON_KEY')||Deno.env.get('SUPABASE_ANON_KEY')||'';
const TOKEN=Deno.env.get('TELEGRAM_BOT_TOKEN')||'';
const cors={
 'Access-Control-Allow-Origin':'*',
 'Access-Control-Allow-Headers':'authorization,apikey,x-client-info,content-type,x-supabase-api-version',
 'Access-Control-Allow-Methods':'POST,OPTIONS',
 'Content-Type':'application/json; charset=utf-8'
};
const reply=(x:Record<string,unknown>,code=200)=>new Response(JSON.stringify(x),{status:code,headers:cors});
const esc=(x:unknown)=>String(x??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const srv=createClient(BASE,SERVICE,{auth:{persistSession:false}});
const pattern=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async(req:Request)=>{
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
 if(req.method!=='POST')return reply({ok:false,error:'POST_REQUIRED'},405);
 try{
  const auth=req.headers.get('authorization')||'';
  const jwt=auth.startsWith('Bearer ')?auth.slice(7):'';
  if(!jwt||!BASE||!SERVICE||!ANON)return reply({ok:false,error:'AUTH_OR_ENV_MISSING'},403);
  const userClient=createClient(BASE,ANON,{auth:{persistSession:false},global:{headers:{Authorization:'Bearer '+jwt}}});
  const {data:session,error:userErr}=await userClient.auth.getUser(jwt);
  const user=session?.user;
  if(userErr||!user?.id||!user.email)return reply({ok:false,error:'NOT_AUTHENTICATED'},403);
  const email=String(user.email).trim().toLowerCase();
  const {data:profile,error:profileErr}=await srv.from('users').select('id,email,role').eq('id',user.id).maybeSingle();
  if(profileErr||!profile||String(profile.email||'').trim().toLowerCase()!==email)return reply({ok:false,error:'CRM_ACCOUNT_REQUIRED'},403);
  const {data:access,error:accessErr}=await srv.from('warehouse_pick_access_v1').select('role,active').eq('email',email).maybeSingle();
  if(accessErr||!access?.active||!['office','supervisor'].includes(access.role))
    return reply({ok:false,error:'NOT_ALLOWED_TO_SEND_ORDER_NOTIFICATIONS'},403);
  if(access.role==='office'&&(email!=='vitebsk@resanta.ru'||profile.role!=='office_manager'))
    return reply({ok:false,error:'OFFICE_ROLE_MISMATCH'},403);
  if(access.role==='supervisor'&&(email!=='payushin_ar@resanta.ru'||profile.role!=='boss'))
    return reply({ok:false,error:'SUPERVISOR_ROLE_MISMATCH'},403);

  const input=await req.json().catch(()=>null);
  const id=String(input?.order_id||'');
  if(!pattern.test(id))return reply({ok:false,error:'INVALID_ORDER_ID'},400);

  const {data:order,error:orderErr}=await srv.from('warehouse_pick_orders_v1')
    .select('id,document_no,document_date,customer_display,status,line_count,total_qty,assignee_email')
    .eq('id',id).maybeSingle();
  if(orderErr||!order||order.status!=='waiting_pick'||!order.assignee_email)
    return reply({ok:false,error:'ORDER_NOT_WAITING_PICK'},409);
  const {data:queue,error:qErr}=await srv.from('warehouse_pick_outbox_v1')
    .select('id,recipient_email,status,attempts')
    .eq('order_id',id).eq('event_type','new_pick').eq('recipient_email',order.assignee_email).maybeSingle();
  if(qErr||!queue)return reply({ok:false,error:'NOTIFICATION_NOT_QUEUED'},409);
  if(queue.status==='sent')return reply({ok:true,notification_status:'sent',already_sent:true});
  if(queue.status==='failed')return reply({ok:false,notification_status:'failed',error:'RETRIES_EXHAUSTED'});
  const {data:employee}=await srv.from('users').select('id,email').eq('email',queue.recipient_email).maybeSingle();
  if(!employee)return reply({ok:false,notification_status:'pending',error:'EMPLOYEE_NOT_FOUND'});
  const {data:binding}=await srv.from('crm_telegram_bindings')
    .select('chat_id,active').eq('user_id',employee.id).eq('active',true).maybeSingle();
  if(!binding?.chat_id)return reply({ok:false,notification_status:'pending',error:'WAREHOUSE_TELEGRAM_NOT_CONNECTED'});
  if(!TOKEN)return reply({ok:false,notification_status:'pending',error:'TELEGRAM_BOT_NOT_CONFIGURED'});
  const {data:claim,error:claimErr}=await srv.rpc('warehouse_pick_claim_notification_v1',{p_order_id:id});
  if(claimErr)throw claimErr;
  if(!claim?.claimed)return reply({ok:false,notification_status:'claimed',error:'ALREADY_PROCESSING_OR_RATE_LIMITED'});

  const message='📦 <b>Новый заказ на сборку</b>\n'
     +'Счёт: <b>№'+esc(order.document_no)+'</b> от '+esc(order.document_date)+'\n'
     +'Клиент: '+esc(order.customer_display)+'\n'
     +'Позиций: '+esc(order.line_count)+' · Количество: '+esc(order.total_qty)+' шт.\n'
     +'Статус: ожидает сборки.\n\n'
     +'Откройте Resanta CRM → Склад → Заказы. Финансовые данные в уведомлении отсутствуют.';
  let err:string|null=null;
  try{
    const response=await fetch('https://api.telegram.org/bot'+TOKEN+'/sendMessage',{
      method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({chat_id:binding.chat_id,text:message,parse_mode:'HTML',disable_web_page_preview:true}),
      signal:AbortSignal.timeout(12000)
    });
    const body=await response.json().catch(()=>({}));
    if(!response.ok||!body?.ok)err='TELEGRAM_SEND_FAILED';
  }catch(_){err='TELEGRAM_SEND_TIMEOUT_OR_NETWORK';}
  const {data:finished,error:finishErr}=await srv.rpc('warehouse_pick_finish_notification_v1',{
    p_id:claim.id,p_success:!err,p_error:err
  });
  if(finishErr)throw finishErr;
  if(err)return reply({ok:false,notification_status:finished?.status||'pending',error:err});
  return reply({ok:true,notification_status:'sent'});
 }catch(e){
  console.error('WAREHOUSE_PICK_NOTIFICATION_ERROR',e instanceof Error?e.message:String(e));
  return reply({ok:false,error:'DELIVERY_SERVER_ERROR'},500);
 }
});
