import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {createClient} from "npm:@supabase/supabase-js@2.95.0";
import webpush from "npm:web-push@3.6.7";
import {SignJWT,importPKCS8} from "npm:jose@6.1.0";
import {validSubscription,resultFor,messagePreview} from './rules.mjs';
const origins=new Set(['https://resanta-crm.by','https://www.resanta-crm.by','http://localhost','https://localhost','capacitor://localhost']);
const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}});
const idPattern=/^[0-9a-f]{8}-[0-9a-f-]{27}$/i;
const headers=(r:Request)=>({'Content-Type':'application/json','Cache-Control':'no-store','Access-Control-Allow-Origin':origins.has(r.headers.get('origin')||'')?r.headers.get('origin')!:'https://resanta-crm.by','Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info','Access-Control-Allow-Methods':'POST,OPTIONS','Vary':'Origin'});
const reply=(r:Request,s:number,d:unknown)=>new Response(JSON.stringify(d),{status:s,headers:headers(r)});
function check(r:any){if(r.error)throw Error('DATABASE_ERROR');return r.data;}
async function runtime(key:string){return check(await db.from('connect_runtime_v2').select('value').eq('key',key).maybeSingle())?.value;}
async function same(a:string,b:string){const e=new TextEncoder();const [x,y]=await Promise.all([a,b].map(v=>crypto.subtle.digest('SHA-256',e.encode(v))));return new Uint8Array(x).every((n,i)=>n===new Uint8Array(y)[i]);}
async function googleToken(){
 const a=JSON.parse(Deno.env.get('FIREBASE_SERVICE_ACCOUNT_JSON')||'{}');if(!a.private_key||!a.client_email||!a.project_id)throw Error('FCM_UNCONFIGURED');
 const jwt=await new SignJWT({scope:'https://www.googleapis.com/auth/firebase.messaging'}).setProtectedHeader({alg:'RS256'}).setIssuer(a.client_email).setAudience('https://oauth2.googleapis.com/token').setIssuedAt().setExpirationTime('1h').sign(await importPKCS8(a.private_key,'RS256'));
 const r=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion:jwt}),signal:AbortSignal.timeout(10000)});
 if(!r.ok)throw Error('FCM_AUTH');const j=await r.json();if(!j.access_token)throw Error('FCM_AUTH');return {token:j.access_token,project:a.project_id};
}
async function dispatch(){
 const tasks=check(await db.rpc('connect_delivery_claim_v2',{p_limit:12}))||[];let sent=0,failed=0,unknown=0;let google:any=null;const vapid=await runtime('vapid');
 await Promise.all(tasks.map(async(task:any)=>{
  let outcome:any={status:'cancelled',error_code:'DEVICE_CHANGED'};
  try{
   const title=task.kind==='video_call'?'Входящий звонок · РЕСАНТА CONNECT':task.kind==='test'?'Проверка уведомлений · РЕСАНТА':'Сообщение · РЕСАНТА CONNECT';
   let caller='Коллега';if(task.call_id){const c=check(await db.from('connect_calls_v2').select('caller_id').eq('id',task.call_id).maybeSingle());if(c){const u=check(await db.from('users').select('name').eq('id',c.caller_id).maybeSingle());caller=u?.name||caller;}}
   const payload={title,body:task.kind==='video_call'?caller+' приглашает на видеозвонок':task.kind==='test'?'Контрольное уведомление на этом устройстве':'Новое сообщение в корпоративном чате',room_id:task.room_id,call_id:task.call_id,message_id:task.message_id,kind:task.kind,delivery_id:task.id,account_id:task.recipient_id,expires_at:task.expires_at};
   if(task.channel==='web'){
    const d=check(await db.from('connect_web_devices_v2').select('subscription').eq('id',task.device_ref).eq('user_id',task.recipient_id).maybeSingle());
    if(d){if(!vapid?.privateKey){outcome={status:'failed',error_code:'WEB_UNCONFIGURED'};}else{
     try{await webpush.sendNotification(d.subscription,JSON.stringify(payload),{TTL:task.kind==='video_call'?90:86400,urgency:task.kind==='video_call'?'high':'normal',timeout:10000,vapidDetails:{subject:'https://resanta-crm.by',publicKey:vapid.publicKey,privateKey:vapid.privateKey}});outcome={status:'sent',error_code:null};}
     catch(e:any){outcome=resultFor(e.statusCode);if([404,410].includes(e.statusCode))check(await db.from('connect_web_devices_v2').delete().eq('id',task.device_ref).eq('user_id',task.recipient_id));}
    }}
   }else if(task.channel==='fcm'){
    const ds=check(await db.from('connect_push_devices_v1').select('fcm_token').eq('user_id',task.recipient_id))||[];
    let device:any=null;for(const d of ds){const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(d.fcm_token))),x=>x.toString(16).padStart(2,'0')).join('');if(hash===task.device_ref){device=d;break;}}
    if(device){
     try{
      const notification={title,body:payload.body};
      if(task.kind==='message'){
       // Only resolve content for a claimed, currently authorized delivery and a verified device.
       if(!task.message_id||!task.room_id)throw Error('MESSAGE_UNAVAILABLE');
       const message=await db.from('connect_messages_v1').select('body').eq('id',task.message_id).eq('room_id',task.room_id).maybeSingle();
       if(message.error)throw Error('MESSAGE_LOOKUP_FAILED');
       if(!message.data)throw Error('MESSAGE_UNAVAILABLE');
       notification.title='Сообщение · ГК Ресанта';
       notification.body=messagePreview(message.data.body)||payload.body;
      }
      google=google||googleToken();const f=await google;
      const data=Object.fromEntries(Object.entries({...payload,title:notification.title}).map(([k,v])=>[k,String(v??'')]));
      const r=await fetch('https://fcm.googleapis.com/v1/projects/'+f.project+'/messages:send',{method:'POST',headers:{Authorization:'Bearer '+f.token,'Content-Type':'application/json'},body:JSON.stringify({message:{token:device.fcm_token,notification,data,android:{priority:'HIGH',ttl:task.kind==='video_call'?'90s':'86400s',notification:{channel_id:'resanta_connect',tag:'connect-'+(task.message_id||task.id)}}}}),signal:AbortSignal.timeout(10000)});
      outcome=r.ok?{status:'sent',error_code:null}:resultFor(r.status);
      if([404,410].includes(r.status))check(await db.from('connect_push_devices_v1').delete().eq('fcm_token',device.fcm_token).eq('user_id',task.recipient_id));
     }catch(e:any){
      if(e.message==='MESSAGE_UNAVAILABLE')outcome={status:'cancelled',error_code:e.message};
      else if(['FCM_UNCONFIGURED','FCM_AUTH','MESSAGE_LOOKUP_FAILED'].includes(e.message))outcome={status:'failed',error_code:e.message};
      else outcome=resultFor(null);
     }
    }
   }
  }catch(_){outcome={status:'unknown',error_code:'TRANSPORT_UNCERTAIN'};}
  const result=await db.from('connect_delivery_v2').update({...outcome,sent_at:outcome.status==='sent'?new Date().toISOString():null,next_attempt_at:new Date(Date.now()+Math.min(600,30*2**task.attempts)*1000).toISOString()}).eq('id',task.id).eq('status','sending');
  if(result.error)unknown++;else if(outcome.status==='sent')sent++;else if(outcome.status==='unknown')unknown++;else failed++;
 }));
 return {claimed:tasks.length,sent,failed,unknown};
}
Deno.serve(async r=>{
 if(r.method==='OPTIONS')return new Response('ok',{headers:headers(r)});
 if(r.method!=='POST')return reply(r,405,{ok:false});
 if(r.headers.has('origin')&&!origins.has(r.headers.get('origin')!))return reply(r,403,{ok:false,error:'ORIGIN_DENIED'});
 let b:any;try{if(Number(r.headers.get('content-length'))>12000)throw Error();const raw=await r.text();if(raw.length>12000)throw Error();b=JSON.parse(raw);if(!b||typeof b!=='object'||Array.isArray(b))throw Error();}catch(_){return reply(r,400,{ok:false,error:'BAD_JSON'});}
 try{
  if(['bootstrap','dispatch'].includes(b.action)){
   const secret=await runtime('dispatch');if(!secret?.secret||!await same(r.headers.get('x-connect-secret')||'',secret.secret))return reply(r,403,{ok:false,error:'DISPATCH_AUTH'});
   if(b.action==='bootstrap'){let v=await runtime('vapid');if(!v){v=webpush.generateVAPIDKeys();check(await db.from('connect_runtime_v2').insert({key:'vapid',value:v}));}return reply(r,200,{ok:true,configured:!!v.publicKey});}
   if(b.dry_run===true){const q=await db.from('connect_delivery_v2').select('id',{count:'exact',head:true}).eq('status','pending');check(q);return reply(r,200,{ok:true,dry_run:true,web_configured:!!(await runtime('vapid'))?.publicKey,fcm_configured:!!Deno.env.get('FIREBASE_SERVICE_ACCOUNT_JSON'),pending:q.count||0});}
   return reply(r,200,{ok:true,...await dispatch()});
  }
  const bearer=(r.headers.get('authorization')||'').replace(/^Bearer\s+/i,'');const auth=await db.auth.getUser(bearer);const user=auth.data?.user;
  if(auth.error||!user)return reply(r,401,{ok:false,error:'LOGIN_REQUIRED'});
  if(check(await db.rpc('connect_active_staff_v1',{p_user_id:user.id}))!==true)return reply(r,403,{ok:false,error:'CONNECT_ACCESS'});
  if(b.action==='config')return reply(r,200,{ok:true,public_key:(await runtime('vapid'))?.publicKey||null});
  if(b.action==='register'){
   if(!validSubscription(b.subscription))return reply(r,400,{ok:false,error:'INVALID_SUBSCRIPTION'});
   const data=check(await db.from('connect_web_devices_v2').upsert({user_id:user.id,endpoint:b.subscription.endpoint,subscription:{endpoint:b.subscription.endpoint,expirationTime:b.subscription.expirationTime||null,keys:{p256dh:b.subscription.keys.p256dh,auth:b.subscription.keys.auth}},label:String(b.label||'Браузер').slice(0,100),last_seen_at:new Date().toISOString()},{onConflict:'endpoint'}).select('id').single());
   return reply(r,200,{ok:true,device_id:data.id});
  }
  if(b.action==='unregister'){
   if(!idPattern.test(b.device_id||''))return reply(r,400,{ok:false});
   check(await db.from('connect_web_devices_v2').delete().eq('id',b.device_id).eq('user_id',user.id));return reply(r,200,{ok:true});
  }
  if(b.action==='status'){
   const ds=check(await db.from('connect_web_devices_v2').select('id,label,last_seen_at').eq('user_id',user.id));
   const logs=check(await db.from('connect_delivery_v2').select('id,kind,channel,status,error_code,created_at,sent_at,confirmed_at').eq('recipient_id',user.id).order('created_at',{ascending:false}).limit(20));
   const native=await db.from('connect_push_devices_v1').select('user_id',{count:'exact',head:true}).eq('user_id',user.id);
   return reply(r,200,{ok:true,devices:ds,native_devices:native.count||0,deliveries:logs});
  }
  if(b.action==='confirm'){
   if(!idPattern.test(b.delivery_id||''))return reply(r,400,{ok:false});
   check(await db.from('connect_delivery_v2').update({confirmed_at:new Date().toISOString()}).eq('id',b.delivery_id).eq('recipient_id',user.id).eq('kind','test'));return reply(r,200,{ok:true});
  }
  if(b.action==='test'){
   if(!idPattern.test(b.device_id||''))return reply(r,400,{ok:false});
   const device=check(await db.from('connect_web_devices_v2').select('id').eq('id',b.device_id).eq('user_id',user.id).maybeSingle());if(!device)return reply(r,404,{ok:false});
   const recent=await db.from('connect_delivery_v2').select('id',{count:'exact',head:true}).eq('recipient_id',user.id).eq('kind','test').gt('created_at',new Date(Date.now()-60000).toISOString());if((recent.count||0)>1)return reply(r,429,{ok:false,error:'WAIT_ONE_MINUTE'});
   const id=crypto.randomUUID();check(await db.from('connect_delivery_v2').insert({id,event_key:'test:'+id,recipient_id:user.id,channel:'web',device_ref:device.id,kind:'test',expires_at:new Date(Date.now()+120000).toISOString()}));
   // SQL dispatcher has service-only execute and never returns the shared secret.
   check(await db.rpc('connect_dispatch_v2'));return reply(r,200,{ok:true,delivery_id:id,queued:true});
  }
  return reply(r,400,{ok:false,error:'UNKNOWN_ACTION'});
 }catch(_){return reply(r,503,{ok:false,error:'CONNECT_TEMPORARILY_UNAVAILABLE'});}
});
