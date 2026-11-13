// Existing actorFor and signed approval flow own authorization and confirmation.
export async function reminderBinding(svc,owner){
 const r=await svc.from('crm_telegram_bindings').select('chat_id').eq('user_id',owner).eq('active',true).maybeSingle();
 return !r.error&&Number(r.data?.chat_id)>0?r.data:null;
}
export async function reminderDraft({svc,actor,model,startsAt,proof}){
 if(!startsAt)return {mode:'needs_details',question:'На какую будущую дату и время по Минску поставить личное напоминание?',created:0};
 if(!(await reminderBinding(svc,actor.id)))return {mode:'needs_details',question:'Для доставки личного напоминания подключи свой Telegram к CRM. Привязка сейчас не подтверждена.',created:0};
 const title=String(model.title||model.details||'').replace(/[\r\n\t]/g,' ').trim().slice(0,160);
 if(title.length<3)return {mode:'needs_details',question:'О чём напомнить?',created:0};
 const draft={action:'reminder',owner_id:actor.id,title,details:String(model.details||'').slice(0,800),
  due_date:model.due_date,due_time:model.due_time,due_at:startsAt,channel:'telegram',source:'lera_agent360_confirmed_v1'};
 const signed=await proof(draft);
 return {mode:'prepared',draft,summary:'Личное напоминание «'+title+'» на '+draft.due_date+' в '+draft.due_time+' по Минску. Доставка в твой Telegram в течение минуты от назначенного времени.',
  approval_token:signed.token,expires_at:signed.expires_at,requires_confirmation:true,created:0};
}
export async function commitReminder({svc,caller,actor,draft,validMoment}){
 if(draft.owner_id!==actor.id||draft.channel!=='telegram'||
  validMoment(draft.due_date,draft.due_time)!==draft.due_at||typeof draft.title!=='string'||draft.title.length<3||draft.title.length>160||
  typeof draft.details!=='string'||draft.details.length>800)return {error:'reminder_parameters_invalid',status:400};
 if(!(await reminderBinding(svc,actor.id)))return {error:'reminder_delivery_not_configured',status:409};
 const r=await caller.from('crm_ai360_reminders_v1').insert({owner_id:actor.id,title:draft.title,details:draft.details,
  due_at:draft.due_at,channel:'telegram',status:'pending',source:'lera_agent360_confirmed_v1'})
  .select('id,owner_id,title,due_at,channel,status').single();
 if(r.error?.code==='23505')return {mode:'already_exists',created:0,note:'Такое личное напоминание уже сохранено.'};
 if(r.error||!r.data?.id||r.data?.owner_id!==actor.id||r.data?.status!=='pending'||r.data?.due_at&&Date.parse(r.data.due_at)!==Date.parse(draft.due_at))return {error:'reminder_create_unverified',status:503};
 return {mode:'created_reminder',created:1,reminder_id:r.data.id,title:draft.title,due_date:draft.due_date,due_time:draft.due_time,
  channel:'telegram',delivery_status:'pending',note:'Напоминание сохранено. Доставка в личный Telegram запланирована; сообщение ещё не отправлено.'};
}
