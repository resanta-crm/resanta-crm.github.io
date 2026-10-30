// CONNECT #138 — Firebase HTTP v1 sender, invoked only by the CRM message author.
// Sender identity and recipients are resolved from authenticated CRM and Postgres.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.95.0";
import { SignJWT, importPKCS8 } from "npm:jose@6.1.0";

const origins=new Set(["https://resanta-crm.by","https://www.resanta-crm.by"]);
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const cors=(req:Request)=>({
 "Access-Control-Allow-Origin":origins.has(req.headers.get("origin")||"")?(req.headers.get("origin")||""):"https://resanta-crm.by",
 "Access-Control-Allow-Methods":"POST, OPTIONS",
 "Access-Control-Allow-Headers":"authorization, apikey, x-client-info, content-type",
 "Cache-Control":"no-store","Vary":"Origin",
});
const reply=(req:Request,status:number,data:Record<string,unknown>)=>
 new Response(JSON.stringify(data),{status,headers:{...cors(req),"Content-Type":"application/json"}});
async function getFCM(){
 const raw=Deno.env.get("FIREBASE_SERVICE_ACCOUNT_JSON");
 if(!raw)throw Error("Firebase credentials missing");
 const account=JSON.parse(raw);
 if(account.type!=="service_account"||!account.client_email||!account.private_key||
    !/^[a-z0-9][a-z0-9-]{3,60}$/i.test(account.project_id||""))throw Error("Firebase credentials invalid");
 const key=await importPKCS8(account.private_key,"RS256");
 const jwt=await new SignJWT({scope:"https://www.googleapis.com/auth/firebase.messaging"})
  .setProtectedHeader({alg:"RS256",typ:"JWT"})
  .setIssuer(account.client_email).setAudience("https://oauth2.googleapis.com/token")
  .setIssuedAt().setExpirationTime("1h").sign(key);
 const r=await fetch("https://oauth2.googleapis.com/token",{method:"POST",
  headers:{"Content-Type":"application/x-www-form-urlencoded"},
  body:new URLSearchParams({grant_type:"urn:ietf:params:oauth:grant-type:jwt-bearer",assertion:jwt}),
  signal:AbortSignal.timeout(10000)});
 if(!r.ok)throw Error("Google auth error");
 const data=await r.json();
 if(!data.access_token)throw Error("Missing Google auth token");
 return {token:String(data.access_token),project:String(account.project_id)};
}
Deno.serve(async req=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:cors(req)});
 if(req.method!=="POST")return reply(req,405,{ok:false,error:"POST required"});
 if(req.headers.get("origin")&&!origins.has(req.headers.get("origin")||""))
  return reply(req,403,{ok:false,error:"Origin denied"});
 const authorization=req.headers.get("authorization")||"";
 const jwt=authorization.replace(/^Bearer\s+/i,"").trim();
 if(!jwt||jwt===authorization)return reply(req,401,{ok:false,error:"CRM login required"});
 let id:string;
 try{id=String((await req.json())?.message_id||"").trim().toLowerCase();}
 catch(_){return reply(req,400,{ok:false,error:"Invalid JSON"});}
 if(!uuid.test(id))return reply(req,400,{ok:false,error:"Bad message ID"});
 const url=Deno.env.get("SUPABASE_URL"),anon=Deno.env.get("SUPABASE_ANON_KEY"),
  service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
 if(!url||!anon||!service)return reply(req,503,{ok:false,error:"Sender unconfigured"});
 try{
  const userClient=createClient(url,anon,{global:{headers:{Authorization:authorization}},
   auth:{persistSession:false,autoRefreshToken:false}});
  const auth=await userClient.auth.getUser(jwt);
  const userId=auth.data?.user?.id;
  if(auth.error||!userId)return reply(req,401,{ok:false,error:"Session expired"});
  const staff=await userClient.rpc("connect_active_staff_v1",{p_user_id:userId});
  if(staff.error||staff.data!==true)return reply(req,403,{ok:false,error:"CONNECT access denied"});
  const db=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});
  const msg=await db.from("connect_messages_v1").select("id,room_id,sender_id,body,created_at")
   .eq("id",id).maybeSingle();
  if(msg.error||!msg.data)return reply(req,404,{ok:false,error:"Message not found"});
  if(msg.data.sender_id!==userId)return reply(req,403,{ok:false,error:"Not message author"});
  if(Date.now()-Date.parse(msg.data.created_at)>300000)return reply(req,410,{ok:false,error:"Old message"});
  const self=await db.from("connect_room_members_v1").select("user_id")
   .eq("room_id",msg.data.room_id).eq("user_id",userId).maybeSingle();
  if(self.error||!self.data)return reply(req,403,{ok:false,error:"Not in room"});
  const members=await db.from("connect_room_members_v1").select("user_id").eq("room_id",msg.data.room_id);
  if(members.error)throw Error("Member read error");
  const others=(members.data||[]).map(x=>x.user_id).filter(x=>x!==userId).slice(0,100);
  if(!others.length)return reply(req,200,{ok:true,dispatched:0});
  const isVideo=String(msg.data.body||"").startsWith("📹 Начался видеозвонок");
  const rights=await db.from("connect_permissions_v1").select("user_id,chat_enabled,video_enabled").in("user_id",others);
  if(rights.error)throw Error("Permission read error");
  const permitted=(rights.data||[]).filter(x=>x.chat_enabled&&(!isVideo||x.video_enabled)).map(x=>x.user_id);
  if(!permitted.length)return reply(req,200,{ok:true,dispatched:0});
  const devices=await db.from("connect_push_devices_v1").select("user_id,fcm_token")
   .in("user_id",permitted).limit(150);
  if(devices.error)throw Error("Device read error");
  if(!devices.data?.length)return reply(req,200,{ok:true,dispatched:0});
  const fcm=await getFCM();
  let delivered=0;
  for(const dev of devices.data){
   // Mark each FCM token exactly once per CRM message. No user text in push payload.
   const hash=await crypto.subtle.digest("SHA-256",
    new TextEncoder().encode(id+"|"+dev.user_id+"|"+dev.fcm_token));
   const key=Array.from(new Uint8Array(hash),x=>x.toString(16).padStart(2,"0")).join("");
   const claim=await db.from("connect_push_delivery_v1")
    .insert({delivery_id:key,message_id:id,recipient_id:dev.user_id});
   if(claim.error){
    if(claim.error.code==="23505")continue;
    throw Error("Dispatch log not available");
   }
   try{
    const r=await fetch("https://fcm.googleapis.com/v1/projects/"+fcm.project+"/messages:send",{
     method:"POST",headers:{"Authorization":"Bearer "+fcm.token,"Content-Type":"application/json"},
     body:JSON.stringify({message:{token:dev.fcm_token,
      notification:{title:isVideo?"📹 РЕСАНТА CONNECT — видеозвонок":"💬 РЕСАНТА CONNECT — сообщение",
       body:isVideo?"Вас приглашают на видеозвонок":"Новое сообщение в корпоративном чате"},
      data:{room_id:msg.data.room_id,kind:isVideo?"video_call":"message"},
      android:{priority:"HIGH",notification:{channel_id:"resanta_connect"}}}}),
     signal:AbortSignal.timeout(10000)});
    if(r.ok){delivered++;await db.from("connect_push_delivery_v1")
      .update({sent_at:new Date().toISOString()}).eq("delivery_id",key);}
    else{
     if([404,410].includes(r.status))await db.from("connect_push_devices_v1")
      .delete().eq("fcm_token",dev.fcm_token);
     await db.from("connect_push_delivery_v1").delete().eq("delivery_id",key);
    }
   }catch(_){await db.from("connect_push_delivery_v1").delete().eq("delivery_id",key);}
  }
  return reply(req,200,{ok:true,dispatched:delivered});
 }catch(_){
  // Do not expose secrets, staff names, message bodies or device tokens.
  return reply(req,503,{ok:false,error:"Push delivery unavailable"});
 }
});
