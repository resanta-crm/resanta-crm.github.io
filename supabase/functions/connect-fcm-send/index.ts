import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {createClient} from "npm:@supabase/supabase-js@2.95.0";
const origins=new Set(['https://resanta-crm.by','https://www.resanta-crm.by','http://localhost','https://localhost','capacitor://localhost']);
Deno.serve(async req=>{
 const h={'Content-Type':'application/json','Cache-Control':'no-store','Vary':'Origin','Access-Control-Allow-Origin':origins.has(req.headers.get('origin')||'')?req.headers.get('origin')!:'https://resanta-crm.by','Access-Control-Allow-Headers':'authorization,apikey,x-client-info,content-type','Access-Control-Allow-Methods':'POST,OPTIONS'};
 const reply=(status:number,data:unknown)=>new Response(JSON.stringify(data),{status,headers:h});
 if(req.method==='OPTIONS')return new Response('ok',{headers:h});if(req.method!=='POST')return reply(405,{ok:false});
 if(req.headers.has('origin')&&!origins.has(req.headers.get('origin')!))return reply(403,{ok:false});
 try{
  const token=(req.headers.get('authorization')||'').replace(/^Bearer\s+/i,'');const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_ANON_KEY')!,{global:{headers:{Authorization:'Bearer '+token}},auth:{persistSession:false,autoRefreshToken:false}});
  const a=await db.auth.getUser(token);if(a.error||!a.data?.user)return reply(401,{ok:false});
  const b=await req.json();const m=await db.from('connect_messages_v1').select('sender_id,created_at').eq('id',b.message_id).maybeSingle();
  if(m.error||!m.data||m.data.sender_id!==a.data.user.id)return reply(403,{ok:false});
  if(Date.now()-Date.parse(m.data.created_at)>300000)return reply(410,{ok:false});
  // Enqueued atomically by connect_message_queue_v2. No second FCM send here.
  return reply(200,{ok:true,queued:true,dispatched:0});
 }catch(_){return reply(503,{ok:false,error:'Push delivery unavailable'});}
});
