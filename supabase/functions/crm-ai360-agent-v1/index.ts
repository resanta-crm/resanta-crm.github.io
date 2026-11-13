// RESANTA AI Agent 360 - isolated unified entry point, phase 1.
// Authentication and data scope are checked HERE and AGAIN in the existing
// independently reviewed director/staff dialog gateways.
// No service-role CRM reads, direct SQL, generic LLM tools, or write actions.
import {createClient} from 'npm:@supabase/supabase-js@2.56.0';
import {agentPrincipal,agentCapabilities,normalizeAgentRequest,agentGreeting} from './contract.mjs';
import {classifyAgentQuestion,runFreeConversation} from './conversation.mjs';
import {historyAction,historyEnabled,saveHistoryTurn,recentFreeMemory} from './history.mjs';

const ORIGINS=new Set(['https://resanta-crm.by','https://www.resanta-crm.by']);
const headers=origin=>({
 'Access-Control-Allow-Origin':ORIGINS.has(origin||'')?origin:'https://resanta-crm.by',
 'Access-Control-Allow-Headers':'authorization,apikey,x-client-info,content-type',
 'Access-Control-Allow-Methods':'POST,OPTIONS',
 'Vary':'Origin',
 'Content-Type':'application/json; charset=utf-8',
 'Cache-Control':'no-store'
});
const reply=(req,result,status=200)=>new Response(JSON.stringify(result),{
 status,headers:headers(req.headers.get('Origin'))
});
const fault=(req,error,status)=>reply(req,{error,read_only:true,answer_verified:false},status);

Deno.serve(async req=>{
 const origin=req.headers.get('Origin');
 if(origin&&!ORIGINS.has(origin))return fault(req,'origin_not_allowed',403);
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers:headers(origin)});
 if(req.method!=='POST')return fault(req,'method_not_allowed',405);
 const auth=String(req.headers.get('Authorization')||'');
 if(!/^Bearer \S+$/.test(auth))return fault(req,'not_authorized',401);
 const token=auth.slice(7);
 if(token.length<15||token.length>6000)return fault(req,'not_authorized',401);
 const url=Deno.env.get('SUPABASE_URL')||'';
 const svcKey=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'';
 const anon=Deno.env.get('SUPABASE_ANON_KEY')||'';
 if(!url||!svcKey||!anon)return fault(req,'service_unavailable',503);
 const svc=createClient(url,svcKey,{auth:{persistSession:false,autoRefreshToken:false}});
 const session=await svc.auth.getUser(token).catch(()=>null);
 const user=session?.data?.user;
 if(!user?.id)return fault(req,'not_authorized',401);
 // Immutable roles must match this authenticated user. Never use user_metadata.
 // PostgrestBuilder is PromiseLike (thenable), NOT a Promise: it has no .catch().
 // Await the query first, then handle actual transport failures explicitly.
 let profile;
 try{
  profile=await svc.from('users').select('id,name,role,region,access_scope,email')
   .eq('id',user.id).maybeSingle();
 }catch{return fault(req,'profile_unavailable',503);}
 if(!profile||profile.error)return fault(req,'profile_unavailable',503);
 const principal=agentPrincipal(user.id,profile.data,user);
 if(!principal)return fault(req,'agent_access_not_enabled',403);
 let input;
 try{
  const body=await req.text();
  if(body.length>24000)return fault(req,'request_too_large',413);
  input=JSON.parse(body);
 }catch{return fault(req,'invalid_request',400);}
 // All history actions are scoped exclusively to this authenticated user.
 // Other staff, including directors, cannot query a different user's journal.
 if(typeof input?.action==='string'&&input.action.startsWith('history:')){
  const h=await historyAction(svc,user.id,input.action,input);
  if(h.error)return fault(req,h.error,h.status||400);
  return reply(req,h);
 }
 // Server-side rollout cannot silently depend on an old browser bundle or URL.
 if(input?.action!=='capabilities')
  input={...input,protocol:'lera_dialogue_v2'};
 const parsed=normalizeAgentRequest(input,principal);
 if(parsed.error)return fault(req,parsed.error,parsed.error==='not_authorized'?403:400);
 if(parsed.action==='capabilities'){
  const h=await historyEnabled(svc,user.id);
  return reply(req,{...agentCapabilities(principal),history_enabled:h.enabled===true,
   history_retention_days:30,history_audio_saved:false,dialogue_protocol:'lera_dialogue_v2'});
 }
 // Ordinary conversation is explicitly isolated from CRM reads. Every caller is
 // still authenticated, identity-scoped and metered before contacting OpenAI.
 if(input.protocol!=='lera_dialogue_v2'&&classifyAgentQuestion(input.question,{history:parsed.payload.history,
     memory:parsed.payload.memory})==='chat'){
  // Persisted history is read for the SAME user only, and chat-mode turns
  // cannot carry previous CRM client figures into general conversation.
  const memory=await recentFreeMemory(svc,user.id);
  const conversation=await runFreeConversation({
   svc,userId:user.id,question:input.question,
   history:memory.history.length?memory.history:parsed.payload.history,
   feedback:memory.feedback,
   apiKey:Deno.env.get('OPENAI_API_KEY')||''
  });
  if(conversation.error)return fault(req,conversation.error,conversation.status||503);
  const stored=await saveHistoryTurn(svc,user.id,{mode:'chat',
   question:input.question,answer:conversation.answer,answerVerified:false});
  return reply(req,{
   ...conversation,agent:'resanta_ai_agent360_v1',
   route_tier:principal.tier,greeting:agentGreeting(principal),writes_enabled:false,
   history_saved:stored.saved,history_enabled:stored.enabled===true,
   history_turn_id:stored.turn_id||null
  });
 }

 // The existing gateways own their rate limits, cost claims, query guards, and
 // policy enforcement. Never call them with service-role credentials.
 let upstream;
 try{
  upstream=await fetch(url+'/functions/v1/'+parsed.endpoint,{
   method:'POST',
   headers:{
    'Authorization':'Bearer '+token,
    'apikey':anon,
    'Content-Type':'application/json'
   },
   body:JSON.stringify(parsed.payload),
   signal:AbortSignal.timeout(26000)
  });
 }catch{return fault(req,'agent_upstream_timeout',503);}
 let result;
 try{result=await upstream.json();}catch{return fault(req,'agent_invalid_upstream',503);}
 if(!result||typeof result!=='object'||Array.isArray(result))
  return fault(req,'agent_invalid_upstream',503);
 // Keep the upstream's exact answer_verified/read_only semantics. Do not
 // upgrade an LLM-generated answer to a verified factual answer.
 if(!upstream.ok)return fault(req,typeof result.error==='string'?result.error.slice(0,90):
  'agent_upstream_unavailable',upstream.status>=400&&upstream.status<600?upstream.status:503);
 const stored=await saveHistoryTurn(svc,user.id,{mode:'crm',
  question:input.question,answer:String(result.answer||result.brief||''),
  answerVerified:result.answer_verified===true});
 return reply(req,{
  ...result,
  ...(input.protocol==='lera_dialogue_v2'?{protocol:'lera_dialogue_v2'}:{}),
  agent:'resanta_ai_agent360_v1',
  route_tier:principal.tier,
  read_only:true,
  greeting:agentGreeting(principal),
  writes_enabled:false,
  history_saved:stored.saved,history_enabled:stored.enabled===true,
  history_turn_id:stored.turn_id||null
 });
});
