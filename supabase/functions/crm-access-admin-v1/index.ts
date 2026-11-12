import {createClient} from "npm:@supabase/supabase-js@2.56.0";

const OWNER_ID="544fb1e2-ef70-44de-bc62-e0e1596a4bfc";
const ORIGINS=new Set(["https://resanta-crm.by","https://www.resanta-crm.by"]);
const ROLES=new Set(["executive_viewer","manager","office_manager","service_manager","auditor"]);
const REGIONS=new Set(["Все филиалы","Витебск","Могилёв","Гомель","ЦО","Триовист / 21vek.by"]);
function cors(req:Request){const origin=req.headers.get("origin")||"";
 return {"Access-Control-Allow-Origin":ORIGINS.has(origin)?origin:"https://resanta-crm.by",
 "Access-Control-Allow-Headers":"authorization,apikey,content-type,x-client-info",
 "Access-Control-Allow-Methods":"POST,OPTIONS","Vary":"Origin"}}
function result(req:Request,status:number,payload:Record<string,unknown>){
 return new Response(JSON.stringify(payload),{status,headers:{"content-type":"application/json;charset=utf-8",
 "cache-control":"no-store",...cors(req)}})}
function normal(email:unknown){return String(email||"").trim().toLowerCase()}
function validateEmail(email:string){return /^[a-z0-9._%+-]+@resanta\.ru$/.test(email)}
function safeError(e:unknown){return e instanceof Error?e.message:String(e)}
function makeAdmin(){
 const url=Deno.env.get("SUPABASE_URL"),key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
 if(!url||!key)throw new Error("SERVER_CONFIG_MISSING");
 return createClient(url,key,{auth:{autoRefreshToken:false,persistSession:false,detectSessionInUrl:false}});
}
async function actor(req:Request,admin:ReturnType<typeof makeAdmin>){
 const bearer=(req.headers.get("authorization")||"").replace(/^Bearer\s+/i,"").trim();
 if(!bearer)throw new Error("UNAUTHENTICATED");
 const {data,error}=await admin.auth.getUser(bearer);
 if(error||!data.user?.email)throw new Error("UNAUTHENTICATED");
 const u=data.user;
 if(u.id!==OWNER_ID||normal(u.email)!=="payushin_ar@resanta.ru")throw new Error("FORBIDDEN");
 const prof=await admin.from("users").select("id,email,role").eq("id",u.id).maybeSingle();
 if(prof.error||prof.data?.role!=="boss"||normal(prof.data.email)!==normal(u.email))throw new Error("FORBIDDEN");
 return u;
}
async function audit(admin:ReturnType<typeof makeAdmin>,a:{
 actor_id:string; target_id?:string|null;target_email:string;action:string;old_role?:string|null;new_role?:string|null;changes?:Record<string,unknown>
}){
 const {error}=await admin.from("crm_access_audit_v1").insert(a);if(error)throw new Error("ACCESS_AUDIT_FAILED");
}
async function listUsers(admin:ReturnType<typeof makeAdmin>){
 const [users,invites,history]=await Promise.all([
  admin.from("users").select("id,email,name,role,region,access_scope").order("name"),
  admin.from("crm_access_invites_v1").select("email,display_name,requested_role,region,status,created_at,updated_at").order("created_at",{ascending:false}).limit(30),
  admin.from("crm_access_audit_v1").select("target_email,action,old_role,new_role,created_at").order("created_at",{ascending:false}).limit(20)
 ]);
 if(users.error||invites.error||history.error)throw new Error("ACCESS_LIST_FAILED");
 return {people:users.data,invites:invites.data,history:history.data};
}
async function findAuth(admin:ReturnType<typeof makeAdmin>,email:string){
 for(let page=1;page<=10;page++){
  const {data,error}=await admin.auth.admin.listUsers({page,perPage:1000});
  if(error)throw error;
  const u=data.users.find(x=>normal(x.email)===email);if(u)return u;
  if(data.users.length<1000)break;
 }
 return null;
}
Deno.serve(async(req:Request)=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:cors(req)});
 if(req.method!=="POST")return result(req,405,{ok:false,error:"METHOD_NOT_ALLOWED"});
 try{
  const admin=makeAdmin();const caller=await actor(req,admin);
  const body=await req.json().catch(()=>({}));
  const action=String(body.action||"");
  if(action==="list"){
   return result(req,200,{ok:true,...await listUsers(admin),owner_id:OWNER_ID});
  }
  const email=normal(body.email);
  if(!validateEmail(email))return result(req,400,{ok:false,error:"Требуется корпоративная почта @resanta.ru"});
  if(email===normal(caller.email))return result(req,403,{ok:false,error:"Самому себе права менять нельзя"});
  if(action==="invite"){
   const name=String(body.name||"").trim().slice(0,100)||email.split("@")[0];
   const role=String(body.role||"");
   const region=String(body.region||"Витебск");
   const scope=role==="executive_viewer"?"executive_readonly":
    region==="Триовист / 21vek.by"?"triovist":"standard";
   if(!ROLES.has(role)||!REGIONS.has(region))return result(req,400,{ok:false,error:"Недопустимая роль или филиал"});
   if(role==="executive_viewer"&&region!=="Все филиалы")
    return result(req,400,{ok:false,error:"Руководство компании должно видеть все филиалы"});
   if(await findAuth(admin,email))return result(req,409,{ok:false,error:"Такой логин уже существует"});
   const {data:old}=await admin.from("crm_access_invites_v1").select("status").eq("email",email).maybeSingle();
   if(old?.status==="active")return result(req,409,{ok:false,error:"Пользователь уже активирован"});
   // The BEFORE INSERT Auth guard permits creation only with a staged, owner-approved invite.
   const staged=await admin.from("crm_access_invites_v1").upsert({
    email,display_name:name,requested_role:role,region,access_scope:scope,
    invited_by:caller.id,status:"prepared",auth_user_id:null,
    expires_at:new Date(Date.now()+48*60*60*1000).toISOString(),updated_at:new Date().toISOString()
   },{onConflict:"email"});
   if(staged.error)throw new Error("INVITE_STAGING_FAILED");
   const invite=await admin.auth.admin.inviteUserByEmail(email,{
    data:{name},redirectTo:"https://resanta-crm.by/"
   });
   if(invite.error||!invite.data.user?.id){
    await admin.from("crm_access_invites_v1").update({status:"failed",updated_at:new Date().toISOString()}).eq("email",email).eq("status","prepared");
    return result(req,502,{ok:false,error:"Сервис почты не подтвердил приглашение. Проверьте SMTP и настройки Supabase Auth."});
   }
   const id=invite.data.user.id;
   const profile=await admin.from("users").update({
    name,role,region,access_scope:scope,access_key:scope==="triovist"?email:null
   }).eq("id",id).eq("email",email).eq("role","pending").select("id,role,region").maybeSingle();
   if(profile.error||profile.data?.role!==role){
    return result(req,503,{ok:false,email,invited:true,activated:false,
      error:"Письмо отправлено, но роль не подтверждена; вход останется заблокирован до проверки."});
   }
   const st=await admin.from("crm_access_invites_v1").update({
    status:"active",auth_user_id:id,updated_at:new Date().toISOString()
   }).eq("email",email).eq("status","auth_created");
   if(st.error)throw new Error("INVITE_STATUS_FAILED");
   await audit(admin,{actor_id:caller.id,target_id:id,target_email:email,
    action:"invite",old_role:null,new_role:role,changes:{region,scope}});
   return result(req,200,{ok:true,invited:true,email,role,region,auth_user_id:id});
  }
  const old=await admin.from("users").select("id,email,role,region,access_scope,name").eq("email",email).maybeSingle();
  if(old.error||!old.data)return result(req,404,{ok:false,error:"Учётная запись не найдена"});
  const target=old.data;
  if(target.id===OWNER_ID||target.role==="boss")return result(req,403,{ok:false,error:"Административные учётные записи защищены"});
  if(action==="update"){
   const role=String(body.role||"");
   const region=String(body.region||"");
   if(!ROLES.has(role)||!REGIONS.has(region))return result(req,400,{ok:false,error:"Недопустимая роль или филиал"});
   if(role==="executive_viewer"&&region!=="Все филиалы")return result(req,400,{ok:false,error:"Выберите все филиалы"});
   if(target.role==="disabled")return result(req,403,{ok:false,error:"Восстановление заблокированного доступа выполняется отдельной процедурой"});
   const scope=role==="executive_viewer"?"executive_readonly":region==="Триовист / 21vek.by"?"triovist":"standard";
   const change=await admin.from("users").update({role,region,access_scope:scope,access_key:scope==="triovist"?email:null})
    .eq("id",target.id).eq("email",email).eq("role",target.role).select("id,role").maybeSingle();
   if(change.error||change.data?.role!==role)throw new Error("ROLE_UPDATE_FAILED");
   await audit(admin,{actor_id:caller.id,target_id:target.id,target_email:email,action:"update",
    old_role:target.role,new_role:role,changes:{from_region:target.region,region,scope}});
   return result(req,200,{ok:true,email,role,region});
  }
  if(action==="disable"){
   const res=await admin.from("users").update({role:"disabled",access_scope:"blocked",access_key:null})
    .eq("id",target.id).eq("email",email).eq("role",target.role).select("id,role").maybeSingle();
   if(res.error||res.data?.role!=="disabled")throw new Error("DISABLE_FAILED");
   // Ban future sign-in/refresh. Existing JWTs remain valid until expiration;
   // every data write is checked again by the database guard.
   const ban=await admin.auth.admin.updateUserById(target.id,{ban_duration:"876000h"});
   if(ban.error)throw new Error("AUTH_BAN_FAILED");
   await audit(admin,{actor_id:caller.id,target_id:target.id,target_email:email,
    action:"disable",old_role:target.role,new_role:"disabled"});
   return result(req,200,{ok:true,email,disabled:true});
  }
  return result(req,400,{ok:false,error:"UNKNOWN_ACTION"});
 }catch(e){
  console.error("CRM_ACCESS_ADMIN_V1",safeError(e));
  const message=safeError(e);
  if(message==="UNAUTHENTICATED")return result(req,401,{ok:false,error:"Войдите в CRM заново"});
  if(message==="FORBIDDEN")return result(req,403,{ok:false,error:"Недостаточно прав"});
  return result(req,500,{ok:false,error:"Операция не выполнена. Проверьте журнал функции управления доступами."});
 }
});
