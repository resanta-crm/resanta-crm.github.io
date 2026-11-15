// Personal calendar changes only. The existing signed prepare/commit envelope owns confirmation.
export const MEETING_CHANGES=new Set(['reschedule_meeting','cancel_meeting','save_meeting_agenda','save_meeting_minutes']);
const ordered=x=>Array.isArray(x)?x.map(ordered):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,ordered(x[k])])):x;
const uuid=x=>/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(String(x||''));
export async function prepareMeetingChange({caller,actor,model,context,proof,moment}){
 let q=caller.from('crm_ai360_meetings_v1').select('id,owner_id,title,starts_at,duration_minutes,status,updated_at').eq('owner_id',actor.id).eq('status','scheduled');
 if(uuid(context?.meeting_id))q=q.eq('id',context.meeting_id);
 else{
  const ref=String(model.meeting_ref||'').trim().replace(/[«»"]/g,'').slice(0,160);
  if(ref.length<3)return {mode:'needs_details',question:'Выбери встречу в календаре или назови её точное название.',created:0};
  q=q.ilike('title',ref.replace(/[%_\\]/g,'\\$&'));
 }
 const r=await q.order('starts_at',{ascending:true}).limit(2);
 if(r.error)return {error:'meeting_read_unavailable',status:503};
 if(r.data?.length!==1)return {mode:'needs_details',question:r.data?.length?'Найдено несколько встреч. Выбери нужную в календаре.':'Не нашла такую запланированную личную встречу. Уточни название или выбери её в календаре.',created:0};
 const m=r.data[0];
 const draft={action:model.action,owner_id:actor.id,meeting_id:m.id,title:m.title,expected_updated_at:m.updated_at,original_starts_at:m.starts_at,source:'lera_agent360_confirmed_v1'};
 let summary='';
 if(model.action==='reschedule_meeting'){
  const starts=moment(model.due_date,model.due_time);
  if(!starts)return {mode:'needs_details',question:'На какую будущую дату и время по Минску перенести встречу?',created:0};
  Object.assign(draft,{starts_at:starts,due_date:model.due_date,due_time:model.due_time});
  summary='Перенести личную встречу «'+m.title+'» на '+model.due_date+' в '+model.due_time+' (Минск). Продолжительность останется '+m.duration_minutes+' минут.';
 }else if(model.action==='cancel_meeting')summary='Отменить личную встречу «'+m.title+'». Запись сохранится со статусом отмены; приглашения не отправляются.';
 else if(model.action==='save_meeting_minutes'){
  draft.minutes=String(model.details||'').trim().slice(0,800);
  if(draft.minutes.length<3)return {mode:'needs_details',question:'Какие решения или итоги сохранить? Продиктуй текст.',created:0};
  summary='Сохранить итоги встречи «'+m.title+'»: '+draft.minutes;
 }else if(model.action==='save_meeting_agenda'){
  if(!uuid(context?.preparation_id))return {mode:'needs_details',question:'Сначала подготовь совещание и отметь темы повестки в календаре.',created:0};
  const prepared=await caller.from('crm_meeting_preparations_v2').select('id,owner_id,context,briefing,coverage,created_at').eq('id',context.preparation_id).eq('owner_id',actor.id).maybeSingle();
  const p=prepared.data;
  if(prepared.error||!p||p.context.meeting_id!==m.id||p.context.month!==context.month||p.context.focus!==context.focus)return {error:'preparation_context_changed',status:409};
  const ids=new Set(Array.isArray(context.topic_ids)?context.topic_ids:[]);
  const cards=[...(p.briefing.cards||[]),...(p.coverage.signals||[])];
  const topics=cards.filter(x=>ids.has(x.id));
  if(!topics.length)return {mode:'needs_details',question:'Отметь хотя бы одну тему для повестки.',created:0};
  draft.agenda={version:2,context:p.context,prepared_at:p.created_at,topics,coverage:(p.coverage.entries||[]).map(({id,status,as_of})=>({id,status,as_of}))};
  summary='Сохранить '+topics.length+' тем в повестку встречи «'+m.title+'»: '+topics.map(x=>x.title).join('; ')+'.';
 }
 const signed=await proof(draft);
 return {mode:'prepared',draft,summary,approval_token:signed.token,expires_at:signed.expires_at,requires_confirmation:true,created:0};
}
export async function commitMeetingChange({caller,actor,draft,moment}){
 if(draft.owner_id!==actor.id||!uuid(draft.meeting_id)||!draft.expected_updated_at)return {error:'meeting_parameters_invalid',status:400};
 const r=await caller.from('crm_ai360_meetings_v1').select('id,owner_id,title,starts_at,status,updated_at').eq('id',draft.meeting_id).eq('owner_id',actor.id).maybeSingle();
 if(r.error||!r.data)return {error:'meeting_not_allowed',status:403};
 const m=r.data;let patch;
 if(draft.action==='cancel_meeting'){
  if(m.status==='cancelled')return {mode:'already_exists',created:0,note:'Встреча уже отменена.'};
  patch={status:'cancelled'};
 }else{
  if(m.status!=='scheduled')return {error:'meeting_already_cancelled',status:409};
  if(draft.action==='reschedule_meeting'){
   if(moment(draft.due_date,draft.due_time)!==draft.starts_at)return {error:'meeting_parameters_invalid',status:400};
   if(Date.parse(m.starts_at)===Date.parse(draft.starts_at))return {mode:'already_exists',created:0,note:'Встреча уже назначена на это время.'};
   patch={starts_at:draft.starts_at};
  }else if(draft.action==='save_meeting_agenda'){
   if(!draft.agenda||!Array.isArray(draft.agenda.topics)||!draft.agenda.topics.length||JSON.stringify(draft.agenda).length>60000)return {error:'meeting_parameters_invalid',status:400};
   patch={agenda:draft.agenda};
  }else if(draft.action==='save_meeting_minutes'){
   if(typeof draft.minutes!=='string'||draft.minutes.length<3||draft.minutes.length>800)return {error:'meeting_parameters_invalid',status:400};
   patch={minutes:draft.minutes};
  }else return {error:'meeting_action_unavailable',status:400};
 }
 const changed=await caller.rpc('crm_calendar_update_v2',{p_id:m.id,p_expected:draft.expected_updated_at,p_patch:patch});
 if(changed.error){
  if(String(changed.error.message||'').includes('calendar_conflict'))return {mode:'conflict_meeting',created:0,note:'Новое время пересекается с другой личной встречей. Уточни расписание.'};
  return {error:'meeting_changed_refresh',status:409};
 }
 const row=changed.data;
 if(!row||row.id!==m.id||row.owner_id!==actor.id||Object.entries(patch).some(([key,value])=>key==='starts_at'?Date.parse(row[key])!==Date.parse(value):JSON.stringify(ordered(row[key]))!==JSON.stringify(ordered(value))))return {error:'meeting_update_unverified',status:503};
 const modes={reschedule_meeting:'rescheduled_meeting',cancel_meeting:'cancelled_meeting',save_meeting_agenda:'saved_meeting_agenda',save_meeting_minutes:'saved_meeting_minutes'};
 return {mode:modes[draft.action],updated:1,meeting_id:row.id,title:row.title,due_date:draft.due_date||null,due_time:draft.due_time||null,note:'Изменение личной встречи подтверждено сервером. Приглашения не отправлялись.'};
}
