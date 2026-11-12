/* Lera history v1: per-user opt-in, text-only 30-day TTL, no audio or CRM mutations.
 * Only the already JWT-authenticated agent gateway may invoke these helpers.
 * All database filters bind to the authenticated userId, never a client-supplied ID.
 */
const SETTINGS='crm_ai360_lera_history_settings_v1';
const TURNS='crm_ai360_lera_history_v1';
const MODES=new Set(['chat','crm']);
const FEEDBACK=new Set(['Неверные данные','Не поняла вопрос','Ошибка озвучки','Неудобный интерфейс','Другое']);
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const trim=(x,max)=>String(x||'').trim().slice(0,max);
const unavailable=()=>({error:'history_unavailable',status:503});
export async function historyEnabled(svc,userId){
 try{
  const q=await svc.from(SETTINGS).select('enabled').eq('user_id',userId).maybeSingle();
  if(q.error)return {enabled:false,error:'history_unavailable'};
  return {enabled:q.data?.enabled===true};
 }catch{return {enabled:false,error:'history_unavailable'};}
}
export async function historyAction(svc,userId,action,payload={}){
 if(!userId||!svc)return {error:'not_authorized',status:401};
 try{
  if(action==='history:status'){
   const status=await historyEnabled(svc,userId);
   return status.error?unavailable():{history_enabled:status.enabled,retention_days:30,
     audio_saved:false,individual_only:true};
  }
  if(action==='history:enable'){
   if(typeof payload.enabled!=='boolean')return {error:'invalid_history_setting',status:400};
   // A user who opts out has their existing text history erased.
   if(!payload.enabled){
    const deleted=await svc.from(TURNS).delete().eq('user_id',userId);
    if(deleted.error)return unavailable();
   }
   const r=await svc.from(SETTINGS).upsert({
    user_id:userId,enabled:payload.enabled,updated_at:new Date().toISOString()
   },{onConflict:'user_id'});
   return r.error?unavailable():{history_enabled:payload.enabled,retention_days:30,audio_saved:false};
  }
  if(action==='history:list'){
   const status=await historyEnabled(svc,userId);
   if(status.error)return unavailable();
   if(!status.enabled)return {history_enabled:false,turns:[],retention_days:30};
   const lim=Math.max(1,Math.min(60,Math.floor(Number(payload.limit)||30)));
   const r=await svc.from(TURNS)
    .select('id,mode,question,answer,answer_verified,created_at,feedback_type,feedback_note,feedback_at')
    .eq('user_id',userId).gt('expires_at',new Date().toISOString())
    .order('created_at',{ascending:false}).limit(lim);
   return r.error?unavailable():{history_enabled:true,turns:r.data||[],retention_days:30};
  }
  if(action==='history:clear'){
   const r=await svc.from(TURNS).delete().eq('user_id',userId);
   return r.error?unavailable():{cleared:true,history_enabled:(await historyEnabled(svc,userId)).enabled};
  }
  if(action==='history:feedback'){
   const status=await historyEnabled(svc,userId);
   if(status.error)return unavailable();
   if(!status.enabled)return {error:'history_optin_required',status:409};
   if(!uuid.test(String(payload.turn_id||'')))return {error:'invalid_history_turn',status:400};
   const kind=trim(payload.feedback_type,60),note=trim(payload.feedback_note,500);
   if(!FEEDBACK.has(kind))return {error:'invalid_feedback_type',status:400};
   const r=await svc.from(TURNS).update({feedback_type:kind,feedback_note:note,
    feedback_at:new Date().toISOString()})
    .eq('user_id',userId).eq('id',payload.turn_id)
    .gt('expires_at',new Date().toISOString()).select('id').maybeSingle();
   if(r.error)return unavailable();
   if(!r.data)return {error:'history_turn_not_found',status:404};
   return {feedback_saved:true,user_suggestion_only:true,crm_data_unchanged:true};
  }
  return {error:'history_action_unknown',status:400};
 }catch{return unavailable();}
}
export async function saveHistoryTurn(svc,userId,{mode,question,answer,answerVerified}={}){
 if(!MODES.has(mode))return {saved:false};
 const status=await historyEnabled(svc,userId);
 if(status.error||!status.enabled)return {saved:false,enabled:false};
 const q=trim(question,400),a=trim(answer,3200);
 if(!q||!a)return {saved:false,enabled:true};
 try{
  const r=await svc.from(TURNS).insert({
   user_id:userId,mode,question:q,answer:a,answer_verified:answerVerified===true
  }).select('id').single();
  return r.error?{saved:false,enabled:true}:{saved:true,enabled:true,turn_id:r.data?.id||null};
 }catch{return {saved:false,enabled:true};}
}
export async function recentFreeMemory(svc,userId){
 const status=await historyEnabled(svc,userId);
 if(status.error||!status.enabled)return {history:[],feedback:[]};
 try{
  const r=await svc.from(TURNS)
   .select('question,answer,feedback_type,feedback_note,created_at')
   .eq('user_id',userId).eq('mode','chat')
   .gt('expires_at',new Date().toISOString())
   .order('created_at',{ascending:false}).limit(6);
  if(r.error)return {history:[],feedback:[]};
  const items=(r.data||[]).reverse();
  return {
   history:items.flatMap(t=>[
    {role:'user',content:trim(t.question,240)},
    {role:'assistant',content:trim(t.answer,240)}
   ]).filter(x=>x.content),
   // User corrections are user suggestions, not verified company facts.
   feedback:items.filter(t=>t.feedback_note&&t.feedback_type)
    .slice(-3).map(t=>({kind:trim(t.feedback_type,60),note:trim(t.feedback_note,220)}))
  };
 }catch{return {history:[],feedback:[]};}
}
