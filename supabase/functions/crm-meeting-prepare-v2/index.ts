import {createClient} from 'npm:@supabase/supabase-js@2.56.0';
import {meetingAccess,meetingContext} from '../_shared/meeting-access.mjs';
import {prepareMeeting} from '../_shared/meeting-prepare.mjs';
const origins=new Set(['https://resanta-crm.by','https://www.resanta-crm.by']);
Deno.serve(async req=>{
 const origin=req.headers.get('Origin');
 const headers={'Access-Control-Allow-Origin':origins.has(origin||'')?origin:'https://resanta-crm.by','Access-Control-Allow-Headers':'authorization,apikey,x-client-info,content-type','Access-Control-Allow-Methods':'POST,OPTIONS','Content-Type':'application/json','Cache-Control':'no-store','Vary':'Origin'};
 const reply=(body,status=200)=>new Response(JSON.stringify(body),{status,headers});
 if(origin&&!origins.has(origin))return reply({error:'origin_not_allowed'},403);
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
 if(req.method!=='POST')return reply({error:'method_not_allowed'},405);
 const token=(req.headers.get('Authorization')||'').replace(/^Bearer /,'');
 if(token.length<15||token.length>6000)return reply({error:'not_authorized'},401);
 const svc=createClient(Deno.env.get('SUPABASE_URL')||'',Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'',{auth:{persistSession:false,autoRefreshToken:false}});
 const auth=await svc.auth.getUser(token).catch(()=>null);
 if(!auth?.data?.user)return reply({error:'not_authorized'},401);
 const profile=await svc.from('users').select('id,name,role,region').eq('id',auth.data.user.id).maybeSingle();
 const access=profile.error?null:meetingAccess(auth.data.user,profile.data);
 if(!access)return reply({error:'calendar_not_allowed'},403);
 let body,context;
 const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Minsk',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 try{const text=await req.text();if(text.length>4000)throw Error('request_too_large');body=JSON.parse(text);if(body.kind!=='meeting_prepare')throw Error('invalid_request');context=meetingContext(body.context,today);}catch(e){return reply({error:e.message||'invalid_request'},400);}
 if(context.meeting_id){
  const m=await svc.from('crm_ai360_meetings_v1').select('id').eq('id',context.meeting_id).eq('owner_id',auth.data.user.id).maybeSingle();
  if(m.error||!m.data)return reply({error:'meeting_not_allowed'},403);
 }
 try{const result=await prepareMeeting(svc,access,context,today);
 const saved=await svc.from('crm_meeting_preparations_v2').insert({owner_id:auth.data.user.id,context,briefing:result.briefing,coverage:result.coverage}).select('id').single();
 if(saved.error)return reply({error:'preparation_save_failed'},503);
 return reply({...result,preparation_id:saved.data.id});}catch(e){return reply({error:e.message==='manager_not_allowed'?'manager_not_allowed':'preparation_unavailable'},e.message==='manager_not_allowed'?403:503);}
});
