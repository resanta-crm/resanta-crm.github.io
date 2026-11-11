import { createClient } from "npm:@supabase/supabase-js@2.56.0";

/* 21vek investigation service; isolated from the market parser.
 * JWT + current database role, service-only audit tables, shared AI budget.
 * All active scopes are read dynamically; no list of manually enabled categories.
 */
const ORIGINS=new Set(["https://resanta-crm.by","https://www.resanta-crm.by"]);
const LEADERS=new Set(["payushin_ar@resanta.ru","sidarovich_kn@resanta.ru"]);
const MANAGERS=new Set(["aleksandrenko_av@resanta.ru","krishtal_na@resanta.ru"]);
const ALL=new Set([...LEADERS,...MANAGERS]);
const U="triovist_market_ai_investigations_v1";
const R="triovist_market_ai_daily_runs_v1";
const MAX_DAILY_AI=24,MAX_CRON_AI=6;
const S=x=>String(x??"").trim();
const clip=(x,n=400)=>S(x).slice(0,n);
const num=x=>x===null||x===undefined||x===""?null:(Number.isFinite(Number(x))?Number(x):null);
const validScope=x=>/^[a-z0-9][a-z0-9_-]{2,140}$/i.test(x);
const day=()=>{const parts=new Intl.DateTimeFormat("en-CA",{timeZone:"Europe/Minsk",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date());const get=k=>parts.find(p=>p.type===k)?.value||"";return get("year")+"-"+get("month")+"-"+get("day");};
const hd=req=>({ "Access-Control-Allow-Origin":ORIGINS.has(req.headers.get("Origin"))?req.headers.get("Origin"):"https://resanta-crm.by","Access-Control-Allow-Headers":"authorization,apikey,content-type,x-client-info","Access-Control-Allow-Methods":"POST,OPTIONS","Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store","Vary":"Origin"});
const output=(req,data,status=200)=>new Response(JSON.stringify(data),{status,headers:hd(req)});
const fail=(code,status=400)=>Object.assign(new Error(code),{status});
function check(result,name){if(result.error)throw fail(name+"_unavailable",503);return result.data}
async function meta(svc){
 const row=check(await svc.from("triovist_market_dashboard_meta_cache_v236357").select("payload,refreshed_at").eq("cache_key","main").maybeSingle(),"market_meta");
 if(!row?.payload||!Array.isArray(row.payload.scopes))throw fail("market_snapshot_missing",503);
 return {scopes:row.payload.scopes.filter(x=>x?.scope_key),stamp:row.refreshed_at};
}
async function authorized(req,svc,body,key){
 const origin=req.headers.get("Origin");
 if(origin&&!ORIGINS.has(origin))throw fail("origin_denied",403);
 const token=S(req.headers.get("Authorization")).replace(/^Bearer\s+/i,"");
 if(!token||token.length>6000)throw fail("not_authorized",401);
 if(body.action==="daily" && key && token===key && !origin)return {email:"scheduler",leader:true,cron:true,id:null};
 const a=await svc.auth.getUser(token).catch(()=>null);
 const u=a?.data?.user;
 if(!u?.id||!ALL.has(S(u.email).toLowerCase()))throw fail("invalid_session",403);
 const email=S(u.email).toLowerCase();
 const prof=check(await svc.from("users").select("id,email,role,access_scope").eq("id",u.id).maybeSingle(),"profile");
 if(!prof||S(prof.email).toLowerCase()!==email)throw fail("profile_mismatch",403);
 const leader=LEADERS.has(email)&&prof.role==="boss";
 const manager=MANAGERS.has(email)&&prof.role==="manager"&&prof.access_scope==="triovist";
 if(!leader&&!manager)throw fail("wrong_role",403);
 return {id:u.id,email,leader,manager,cron:false};
}
async function page(svc,table,fields,mod,limit=5000){
 let all=[];
 for(let offset=0;offset<limit;offset+=1000){
  let q=svc.from(table).select(fields).range(offset,offset+999);
  q=mod(q);
  const rows=check(await q,table);
  all=all.concat(rows||[]);
  if((rows||[]).length<1000)break;
 }
 return all;
}
function signal(s){
 const p=num(s.position),from=num(s.previous_position);
 // A listing "entered/exited" label is not a verified numerical move.
 // Only two comparable, non-null rank observations can trigger a cause analysis.
 if(from===null||p===null||from===p)return null;
 const magnitude=Math.abs(from-p);
 const drop=s.movement==="down"||s.movement==="exited";
 const rise=s.movement==="up"||s.movement==="entered";
 if((!drop&&!rise)||(drop&&p<=from)||(rise&&p>=from))return null;
 if(magnitude<(s.kind==="own"?7:12))return null;
 return {...s,delta:from!==null&&p!==null?from-p:null,priority:Math.round(magnitude*(s.kind==="own"?1.8:1)+(drop&&s.kind==="own"?25:0)+(rise&&s.kind==="competitor"?14:0)+(p!==null&&p<=25?8:0))};
}
async function feed(svc){
 const m=await meta(svc);
 const [metrics,ownPositions,market]=await Promise.all([
  page(svc,"triovist_21vek_position_metrics_v236351","manager_email,sku,product_name,movement,current_position,previous_position,price_21vek,in_stock,current_observed_at,current_error",
    q=>q.in("movement",["down","up","exited","entered"]),2500),
  page(svc,"triovist_market_own_positions_current_v1","scope_key,sku,position,current_price,observed_at",
    q=>q.order("scope_key").order("sku"),1500),
  page(svc,"triovist_market_comp_position_current_v236352","scope_key,product_key,brand,model,movement,position,previous_position,position_delta,current_price,observed_at",
    q=>q.in("movement",["up","down","exited","entered"]).gte("observed_at",new Date(Date.now()-3*864e5).toISOString()).order("scope_key").order("product_key"),5000)
 ]);
 const known=new Set(m.scopes.map(x=>S(x.scope_key)));
 const owned=new Map();
 for(const r of ownPositions){if(known.has(r.scope_key))owned.set(S(r.sku),r)}
 const signals=[],fresh=new Date(Date.now()-5*864e5);
 for(const r of metrics){
  const own=owned.get(S(r.sku));
  if(!own||!r.current_observed_at||new Date(r.current_observed_at)<fresh||r.current_error)continue;
  const s=signal({kind:"own",scope_key:own.scope_key,entity_key:r.sku,title:clip(r.product_name,110),manager_email:S(r.manager_email).toLowerCase(),
    movement:r.movement,position:num(r.current_position),previous_position:num(r.previous_position),
    current_price:num(r.price_21vek),in_stock:r.in_stock,observed_at:r.current_observed_at});
  if(s)signals.push(s);
 }
 for(const r of market){
  if(!known.has(r.scope_key))continue;
  const s=signal({kind:"competitor",scope_key:r.scope_key,entity_key:r.product_key,
    title:clip([r.brand,r.model].filter(Boolean).join(" "),110),manager_email:null,movement:r.movement,
    position:num(r.position),previous_position:num(r.previous_position),current_price:num(r.current_price),
    in_stock:null,observed_at:r.observed_at});
  if(s)signals.push(s);
 }
 const by=new Map(),groups=m.scopes.map(x=>({scope_key:x.scope_key,category:x.category,subgroup:x.subgroup,signals:0}));
 for(const s of signals){by.set(s.scope_key,(by.get(s.scope_key)||[]).concat(s))}
 const picked=[];
 for(const g of groups){
  const a=(by.get(g.scope_key)||[]).sort((x,y)=>y.priority-x.priority);
  g.signals=a.length;
  picked.push(...a.slice(0,3));
 }
 picked.sort((a,b)=>b.priority-a.priority);
 return {groups,cases:picked.slice(0,100),signals_total:signals.length,scopes_total:groups.length,
  scopes_with_signals:groups.filter(x=>x.signals).length,source_at:m.stamp,limits:{deep_ai_per_day:MAX_DAILY_AI,daily_auto_ai:MAX_CRON_AI},
  note:"Все действующие подгруппы проверяются; AI глубоко анализирует приоритетные изменения. Позиция не доказывает причину."};
}
async function itemEvidence(svc,scope,kind,key){
 const isOwn=kind==="own";
 const current=check(await svc.from(isOwn?"triovist_market_own_positions_current_v1":"triovist_market_comp_position_current_v236352")
  .select(isOwn?"scope_key,sku,product_name,position,current_price,in_stock,observed_at":"scope_key,product_key,brand,model,position,previous_position,movement,current_price,in_stock,observed_at")
  .eq("scope_key",scope).eq(isOwn?"sku":"product_key",key).maybeSingle(),"current_position");
 if(!current)throw fail("product_missing",404);
 const h=check(await svc.from(isOwn?"triovist_market_own_position_snapshots_v1":"triovist_market_comp_position_snapshots_v236352")
   .select("observed_at,position,current_price,in_stock,listing_state")
   .eq("scope_key",scope).eq(isOwn?"sku":"product_key",key).order("observed_at",{ascending:false}).limit(9),"rank_history")||[];
 const peers=check(await svc.from("triovist_market_comp_position_current_v236352")
   .select("brand,model,position,previous_position,movement,current_price,observed_at")
   .eq("scope_key",scope).in("movement",["up","entered"]).not("position","is",null)
   .order("position",{ascending:true}).limit(8),"competitor_context")||[];
 let card=null,assignee=null;
 if(isOwn){
  const c=check(await svc.from("triovist_content_cards").select(
   "manager_email,product_name,price,in_stock,product_rating,review_count,photo_count,video_count,description_present,warranty_present,created_at")
   .eq("sku",key).order("created_at",{ascending:false}).limit(1),"own_card");
  card=c?.[0]||null;
  const a=S(card?.manager_email).toLowerCase();
  assignee=MANAGERS.has(a)?a:null;
 }
 const title=clip(isOwn?current.product_name:[current.brand,current.model].filter(Boolean).join(" "),160);
 const prev=num(h[1]?.position)??(isOwn?null:num(current.previous_position));
 return {title,manager_email:assignee,position_before:prev,
   position_at_start:num(current.position),observed_at:current.observed_at,
   evidence:{scope_key:scope,kind,entity_key:key,source:"Supabase: current + dated ranking snapshots + cards",
    current:{position:num(current.position),price:num(current.current_price),in_stock:current.in_stock??null,observed_at:current.observed_at},
    previous_position:prev,history:h.map(x=>({date:x.observed_at,position:num(x.position),price:num(x.current_price),in_stock:x.in_stock??null,listing_state:x.listing_state})),
    card:card?{as_of:card.created_at,price:num(card.price),available:card.in_stock,rating:num(card.product_rating),
     reviews:card.review_count,photos:card.photo_count,videos:card.video_count,description:card.description_present,warranty:card.warranty_present}:null,
    competitors_rising:peers.map(x=>({brand:clip(x.brand,60),model:clip(x.model,90),position:x.position,previous_position:x.previous_position,
      price:num(x.current_price),observed_at:x.observed_at})),
    limitations:["Поисковая позиция зависит от запроса и момента проверки","Изменение позиции само по себе не доказывает причину",
    "Данные о рекламных ставках и промобюджетах конкурента недоступны; не утверждать рекламу без фактов"]}};
}
async function llm(svc,userId,evidence){
 const key=Deno.env.get("OPENAI_API_KEY")||"";
 if(!key)return {error:"ai_provider_not_configured"};
 const today=day();
 const {count,error:ce}=await svc.from(U).select("id",{count:"exact",head:true}).eq("snapshot_day",today).eq("ai_status","ready");
 if(ce)return {error:"ai_daily_meter_unavailable"};
 if((count||0)>=MAX_DAILY_AI)return {error:"ai_daily_limit"};
 const claim=await svc.rpc("crm_ai360_core_claim_v2",{p_user_id:userId,p_reserve_rub:4});
 if(claim.error)return {error:"ai_budget_meter_unavailable"};
 if(claim.data?.allowed!==true)return {error:claim.data?.reason||"ai_budget_limit"};
 const claimId=S(claim.data.claim_id);
 let result=null,usage={},error=null;
 try{
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),16000);
  let response;
  try{
   response=await fetch("https://api.openai.com/v1/chat/completions",{method:"POST",signal:controller.signal,
    headers:{"Authorization":"Bearer "+key,"Content-Type":"application/json"},
    body:JSON.stringify({model:"gpt-4o-mini",temperature:0.1,max_tokens:650,response_format:{type:"json_object"},
     messages:[
      {role:"system",content:"Ты аналитик 21vek в Беларуси. Верни ТОЛЬКО JSON: {\"finding\":\"факт изменений\", \"hypotheses\":[{\"cause\":\"вероятный фактор\",\"evidence\":\"какие конкретно факты за/против\",\"confidence\":\"низкая|средняя\"}],\"manager_question\":\"один конкретный вопрос менеджеру с запросом источника\",\"action\":\"одно проверяемое действие с измеримым результатом\",\"limits\":\"что НЕ доказано\"}. Никаких выдуманных цифр, скидок, рекламы, истории или источников. Причинность НЕ следует из корреляции. При отсутствии данных пиши неизвестно. Объясняй кратко, по-русски."},
      {role:"user",content:JSON.stringify(evidence).slice(0,12000)}]})});
  }finally{clearTimeout(timeout)}
  if(!response.ok)throw Error("openai_unavailable");
  const json=await response.json();usage=json.usage||{};
  const v=JSON.parse(json.choices?.[0]?.message?.content||"{}");
  if(!S(v.finding)||!S(v.manager_question)||!S(v.action))throw Error("ai_incomplete");
  result={finding:clip(v.finding,650),hypotheses:(Array.isArray(v.hypotheses)?v.hypotheses:[]).slice(0,3).map(x=>({
     cause:clip(x?.cause,220),evidence:clip(x?.evidence,420),confidence:["низкая","средняя"].includes(x?.confidence)?x.confidence:"низкая"})),
    manager_question:clip(v.manager_question,500),action:clip(v.action,650),limits:clip(v.limits,700),
    model:"gpt-4o-mini",kind:"hypotheses_not_causal_proof"};
 }catch(e){error=e?.name==="AbortError"?"ai_timeout":"ai_unavailable"}
 const tokensIn=Math.max(0,Number(usage.prompt_tokens)||0),tokensOut=Math.max(0,Number(usage.completion_tokens)||0);
 const estimated=Math.min(4,Math.max(0,error?0:((tokensIn*0.15+tokensOut*0.6)/1e6)*100));
 const fin=await svc.rpc("crm_ai360_core_finish_v2",{p_claim_id:claimId,p_actual_rub:estimated,
   p_input_tokens:tokensIn,p_output_tokens:tokensOut,p_rounds:1,p_status:error?"failed":"ok"});
 if(fin.error||fin.data?.ok!==true)return {error:"budget_settlement_unverified"};
 return error?{error}:{result};
}
async function investigate(svc,actor,body){
 const scope=S(body.scope_key),kind=S(body.kind),key=clip(body.entity_key,140);
 if(!validScope(scope)||!["own","competitor"].includes(kind)||!key||key.length>140)throw fail("invalid_target");
 const m=await meta(svc);
 if(!m.scopes.some(x=>x.scope_key===scope))throw fail("unknown_scope",404);
 const evidence=await itemEvidence(svc,scope,kind,key);
 // Revalidate against immutable dated snapshots before ANY AI request or insert.
 const before=num(evidence.position_before),after=num(evidence.position_at_start);
 if(before===null||after===null||Math.abs(before-after)<(kind==="own"?7:12))
   throw fail("insufficient_rank_evidence",422);
 const observations=evidence.evidence?.history||[];
 if(observations.length<2||num(observations[0]?.position)!==after||
    num(observations[1]?.position)!==before||
    Date.parse(observations[0]?.date)<=Date.parse(observations[1]?.date))
   throw fail("rank_history_not_comparable",422);
 const today=day();
 const record={snapshot_day:today,scope_key:scope,kind,entity_key:key,title:evidence.title,
   manager_email:evidence.manager_email,created_by:actor.email,observed_at:evidence.observed_at,
   position_before:evidence.position_before,position_at_start:evidence.position_at_start,
   evidence:evidence.evidence,ai_status:"pending"};
 const row=await svc.from(U).upsert(record,{onConflict:"snapshot_day,scope_key,kind,entity_key",ignoreDuplicates:true})
   .select("id").maybeSingle();
 if(row.error)throw fail("case_store_unavailable",503);
 const existing=check(await svc.from(U).select("*").eq("snapshot_day",today).eq("scope_key",scope)
   .eq("kind",kind).eq("entity_key",key).maybeSingle(),"case_read");
 if(!existing)throw fail("case_not_saved",503);
 if(existing.ai_status==="ready")return {case:existing,reused:true};
 if(!row.data?.id)return {case:existing,reused:true,pending:existing.ai_status==="pending"};
 const ai=await llm(svc,actor.id||"544fb1e2-ef70-44de-bc62-e0e1596a4bfc",evidence.evidence);
 const upd=check(await svc.from(U).update({ai_status:ai.result?"ready":"unavailable",
   ai_result:ai.result||{error:ai.error||"ai_unavailable"},updated_at:new Date().toISOString()})
   .eq("id",existing.id).select("*").maybeSingle(),"case_update");
 return {case:upd,ai_available:!!ai.result,ai_error:ai.error||null};
}
async function listCases(svc,actor){
 let q=svc.from(U).select("*").order("created_at",{ascending:false}).limit(40);
 if(!actor.leader)q=q.eq("manager_email",actor.email);
 const rows=check(await q,"case_list")||[];
 return {cases:rows};
}
async function changeCase(svc,actor,body){
 const id=S(body.case_id);
 if(!/^[0-9a-f-]{36}$/i.test(id))throw fail("invalid_case_id");
 const item=check(await svc.from(U).select("*").eq("id",id).maybeSingle(),"case_read");
 if(!item)throw fail("case_missing",404);
 if(body.action==="answer"){
  if(!actor.leader&&item.manager_email!==actor.email)throw fail("not_assigned",403);
  const answer=clip(body.answer,1600),source=clip(body.source,350);
  if(answer.length<12||source.length<4)throw fail("answer_and_source_required");
  const res=check(await svc.from(U).update({manager_answer:answer,manager_source:source,
     manager_answer_at:new Date().toISOString(),status:"manager_answered",updated_at:new Date().toISOString()})
     .eq("id",id).select("*").maybeSingle(),"answer_save");
  return {case:res};
 }
 if(!actor.leader)throw fail("director_only",403);
 if(body.action==="assign"){
  const assignee=S(body.manager_email).toLowerCase();
  if(!MANAGERS.has(assignee))throw fail("invalid_assignee");
  const res=check(await svc.from(U).update({manager_email:assignee,updated_at:new Date().toISOString()})
   .eq("id",id).select("*").maybeSingle(),"assign");
  return {case:res};
 }
 if(body.action==="review"){
  if(!["approved","need_evidence","rejected"].includes(body.status))throw fail("invalid_decision");
  const note=clip(body.note,950);
  if(note.length<8)throw fail("director_note_required");
  const res=check(await svc.from(U).update({status:body.status,director_note:note,
    director_reviewed_at:new Date().toISOString(),updated_at:new Date().toISOString()})
    .eq("id",id).select("*").maybeSingle(),"decision_save");
  return {case:res};
 }
 throw fail("invalid_action");
}
async function updateFollowups(svc){
 const cutoff=new Date(Date.now()-3*864e5).toISOString().slice(0,10);
 const cases=check(await svc.from(U).select("id,scope_key,kind,entity_key,created_at,checked_3d_at,checked_7d_at")
   .lte("snapshot_day",cutoff).order("created_at",{ascending:false}).limit(35),"followup_read")||[];
 let updates=0;
 for(const row of cases){
  const elapsed=(Date.now()-new Date(row.created_at).getTime())/864e5;
  if(row.checked_3d_at&&(elapsed<7||row.checked_7d_at))continue;
  if(elapsed<3)continue;
  const t=row.kind==="own"?"triovist_market_own_positions_current_v1":"triovist_market_comp_position_current_v236352";
  const k=row.kind==="own"?"sku":"product_key";
  const cur=await svc.from(t).select("position,observed_at").eq("scope_key",row.scope_key)
    .eq(k,row.entity_key).maybeSingle();
  if(cur.error||!cur.data||num(cur.data.position)===null)continue;
  if(Date.parse(cur.data.observed_at)<Date.parse(row.created_at)+3*864e5)continue;
  const field=elapsed>=7&&!row.checked_7d_at?"7d":!row.checked_3d_at?"3d":null;
  if(!field||field==="7d"&&Date.parse(cur.data.observed_at)<Date.parse(row.created_at)+7*864e5)continue;
  const data=field==="3d"?{checked_3d_position:cur.data.position,checked_3d_at:cur.data.observed_at}:
    {checked_7d_position:cur.data.position,checked_7d_at:cur.data.observed_at};
  const up=await svc.from(U).update(data).eq("id",row.id);
  if(!up.error)updates++;
 }
 return updates;
}
async function daily(svc){
 const today=day();
 const insert=await svc.from(R).insert({run_day:today}).select("run_day").maybeSingle();
 if(insert.error){
  if(insert.error.code==="23505")return {already_ran:true};
  throw fail("daily_run_store_unavailable",503);
 }
 try{
  const data=await feed(svc);
  const seen=new Set(),selection=[];
  for(const candidate of data.cases.filter(x=>x.kind==="own"&&x.movement==="down"||
     x.kind==="competitor"&&x.movement==="up").sort((a,b)=>b.priority-a.priority)){
   if(selection.length>=MAX_CRON_AI)break;
   if(seen.has(candidate.scope_key))continue;
   seen.add(candidate.scope_key);
   selection.push(candidate);
  }
  let generated=0;
  for(const c of selection){
   try{
    const out=await investigate(svc,{id:"544fb1e2-ef70-44de-bc62-e0e1596a4bfc",email:"scheduler",leader:true},c);
    if(out.ai_available)generated++;
   }catch(e){console.warn("AI investigation skipped",clip(e?.message,80))}
  }
  const followups=await updateFollowups(svc);
  await svc.from(R).update({status:"completed",finished_at:new Date().toISOString(),
   scopes_seen:data.scopes_total,candidates_seen:data.signals_total,ai_calls:generated})
   .eq("run_day",today);
  return {ok:true,scopes:data.scopes_total,signals:data.signals_total,ai_generated:generated,followups};
 }catch(e){
  await svc.from(R).update({status:"failed",finished_at:new Date().toISOString(),
    error_code:clip(e?.message,120)}).eq("run_day",today);
  throw e;
 }
}
Deno.serve(async req=>{
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers:hd(req)});
 if(req.method!=="POST")return output(req,{error:"method_not_allowed"},405);
 try{
  const url=Deno.env.get("SUPABASE_URL")||"",key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
  if(!url||!key)throw fail("service_configuration_unavailable",503);
  const svc=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
  const body=await req.json().catch(()=>null);
  if(!body||typeof body!=="object")throw fail("invalid_json");
  const actor=await authorized(req,svc,body,key);
  if(actor.cron&&body.action!=="daily")throw fail("cron_action_only",403);
  let result;
  switch(body.action){
   case "feed":result=await feed(svc);break;
   case "investigate":result=await investigate(svc,actor,body);break;
   case "list":result=await listCases(svc,actor);break;
   case "answer":case "assign":case "review":result=await changeCase(svc,actor,body);break;
   case "daily":if(!actor.cron)throw fail("cron_only",403);result=await daily(svc);break;
   default:throw fail("invalid_action");
  }
  return output(req,result);
 }catch(e){
  console.error("market_ai_v1",clip(e?.message,110));
  return output(req,{error:clip(e?.message,90)||"internal_error"},e?.status||500);
 }
});
