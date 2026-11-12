/* Single-use, user-approved invite for corporate leadership.
 * No general account provisioning API; redeploy disabled after verification.
 */
import {createClient} from "npm:@supabase/supabase-js@2.56.0";
const EMAIL="petrovichev@resanta.ru";
const OWNER="544fb1e2-ef70-44de-bc62-e0e1596a4bfc";
const reply=(status:number,body:Record<string,unknown>)=>new Response(JSON.stringify(body),
 {status,headers:{"content-type":"application/json","cache-control":"no-store"}});
Deno.serve(async(req:Request)=>{
 if(req.method!=="POST")return reply(405,{ok:false,error:"METHOD_NOT_ALLOWED"});
 try{
  const url=Deno.env.get("SUPABASE_URL"),key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if(!url||!key)return reply(500,{ok:false,error:"CONFIG_MISSING"});
  const admin=createClient(url,key,{auth:{autoRefreshToken:false,persistSession:false,detectSessionInUrl:false}});
  const {data:secretRow,error:sr}=await admin.from("crm_telegram_runtime")
    .select("value").eq("key","dispatch_secret").maybeSingle();
  if(sr||!secretRow?.value?.secret||
      req.headers.get("x-crm-dispatch-secret")!==secretRow.value.secret)
   return reply(403,{ok:false,error:"FORBIDDEN"});
  const body=await req.json().catch(()=>({}));
  if(body?.mode!=="invite_chief_once")return reply(400,{ok:false,error:"UNKNOWN_MODE"});
  const {data:record,error:re}=await admin.from("crm_access_invites_v1")
    .select("*").eq("email",EMAIL).maybeSingle();
  if(re||!record||record.status!=="prepared"||record.invited_by!==OWNER||
     record.requested_role!=="executive_viewer"||record.region!=="Все филиалы"||
     Date.parse(record.expires_at)<Date.now())
   return reply(409,{ok:false,error:"NO_APPROVED_PENDING_INVITE"});
  const {data:before,error:be}=await admin.auth.admin.listUsers({page:1,perPage:1000});
  if(be)throw new Error("AUTH_CHECK_FAILED");
  if(before.users.some(x=>String(x.email||"").toLowerCase()===EMAIL))
   return reply(409,{ok:false,error:"AUTH_ALREADY_EXISTS"});
  const invitation=await admin.auth.admin.inviteUserByEmail(EMAIL,{
   data:{name:"Руководство компании"},redirectTo:"https://resanta-crm.by/"
  });
  if(invitation.error||!invitation.data.user?.id){
   const message=String(invitation.error?.message||"INVITE_FAILED").slice(0,130);
   await admin.from("crm_access_invites_v1").update({status:"failed",updated_at:new Date().toISOString()}).eq("email",EMAIL).eq("status","prepared");
   return reply(502,{ok:false,error:"AUTH_INVITE_REJECTED",detail:message});
  }
  const id=invitation.data.user.id;
  const {data:profile,error:pe}=await admin.from("users")
    .update({name:"Руководство компании",role:"executive_viewer",
      region:"Все филиалы",access_scope:"executive_readonly",access_key:null})
    .eq("id",id).eq("email",EMAIL).eq("role","pending")
    .select("id,role,region").maybeSingle();
  if(pe||profile?.role!=="executive_viewer")
   return reply(503,{ok:false,email_invited:true,profile_activated:false,error:"PROFILE_PENDING_AFTER_INVITE"});
  const final=await admin.from("crm_access_invites_v1")
    .update({status:"active",auth_user_id:id,updated_at:new Date().toISOString()})
    .eq("email",EMAIL).eq("status","auth_created").select("email,status").maybeSingle();
  if(final.error||final.data?.status!=="active")
   return reply(503,{ok:false,email_invited:true,profile_activated:true,error:"AUDIT_INVITE_STATUS_INCOMPLETE"});
  const aud=await admin.from("crm_access_audit_v1").insert({
   actor_id:OWNER,target_id:id,target_email:EMAIL,
   action:"one_time_user_approved_invitation",
   old_role:null,new_role:"executive_viewer",
   changes:{source:"chat_approval",region:"Все филиалы",scope:"executive_readonly"}
  });
  if(aud.error)throw new Error("AUDIT_FAILED");
  return reply(200,{ok:true,email:EMAIL,invitation_accepted:true,role:"executive_viewer",
   region:"Все филиалы",profile_activated:true});
 }catch(e){
  console.error("ONE_TIME_INVITE",e instanceof Error?e.message:"unknown");
  return reply(500,{ok:false,error:e instanceof Error?e.message:"unknown"});
 }
});
