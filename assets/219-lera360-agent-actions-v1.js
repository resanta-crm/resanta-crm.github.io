/* Lera AI Agent 360: existing voice/text panels -> human-confirmed CRM actions.
   No microphone, no polling, no network on login, no new assistant window.
   The server verifies identity, signs every draft, and revalidates on commit. */
(function(root,document){
'use strict';
if(root.crmAI360ActionHandleV1)return;
const ENDPOINT='crm-ai360-actions-v1';
const ACTION=/(?:поставь|создай|назначь|добавь|оформи|сделай|организуй|запланируй|запиши)(?:[\s,.:–—]+[а-яёa-z0-9\s,.!?:–—-]{0,210})?(?:задач|поручен|чат|бесед|групп|встреч|визит|совещан)|(?:задач|поручен|чат|бесед|групп|встреч|визит|совещан)[а-яё\s,.:–—-]{0,140}(?:поставь|создай|назначь|оформи|запланируй)/i;
const YES=/^(?:да|давай|подтверждаю|подтверждаю создание|согласен|согласна|согласовано|утверждаю|создавай|создай|выполняй|выполни|да подтверждаю|да создавай|да создай|да давай создай|давай создавай|да создай пожалуйста|да конечно создай)$/i;
const NO=/^(?:нет|отмена|отменить|не надо|не создавай|стоп|отбой|отмени|нет не нужно|нет спасибо)$/i;
const FIX=/^(?:исправь|измени|поменяй|переделай|лучше|не так|добавь|замени|на\s)/i;
let proposal=null,missing=null,working=false,seq=0,buttonBox=null,ownerId='',reminders=[];
function currentId(){try{return String(currentUser?.id||'');}catch{return '';}}
function panel(){return document.querySelector('.rva-window:not([hidden]):not(.rva-mini), .rsa-branch-panel:not([hidden])');}
function allowed(){return !!currentId()&&!document.hidden&&
 document.getElementById('app')?.style.display!=='none'&&!!panel();}
function reset(){
 seq++;proposal=null;missing=null;working=false;ownerId='';reminders=[];
 root.__resantaAI360ActionBusyV1=false;
 if(buttonBox){buttonBox.remove();buttonBox=null;}
}
function normalize(x){return String(x||'').trim().toLocaleLowerCase('ru-RU').replace(/ё/g,'е').replace(/[.!?,;:]+/g,' ').replace(/\s+/g,' ').trim();}
function status(ui,s){
 if(typeof ui?.textStatus==='function')ui.textStatus(s);
 else ui?.setStatus?.(s);
}
function say(ui,s,spoken=true){
 const line=String(s||'');
 if(typeof ui?.answer==='function')ui.answer(line,spoken?{}:{noVoice:true});
 else ui?.show?.(line,{speak:spoken});
}
function clearProposal(){proposal=null;missing=null;if(buttonBox){buttonBox.remove();buttonBox=null;}}
async function failure(error){
 try{const payload=await error?.context?.json?.();return String(payload?.error||error?.message||'action_unavailable').slice(0,100);}
 catch{return String(error?.message||'action_unavailable').slice(0,100);}
}
function makeButtons(ui,proposalCopy){
 if(buttonBox){buttonBox.remove();buttonBox=null;}
 const pane=panel();
 if(!pane)return;
 const host=pane.querySelector('.rsa-branch-log')||pane.querySelector('.rva-control')||pane;
 const row=document.createElement('div');
 row.className='rva-agent-action-confirm';
 row.style.cssText='display:flex;align-items:center;flex-wrap:wrap;gap:8px;padding:8px;border:1px solid #9ab7d5;background:#edf5fc;border-radius:9px;margin:6px 0;font-size:12px';
 const lead=document.createElement('strong');lead.textContent='Проверенное предложение Леры · действие не выполнено';
 lead.style.cssText='flex:1 1 100%;font-size:12px;color:#24527f';
 const yes=document.createElement('button');yes.type='button';yes.textContent=['cancel_reminder','cancel_meeting'].includes(proposalCopy.draft?.action)?'✓ Подтвердить отмену':proposalCopy.draft?.action==='reschedule_meeting'?'✓ Подтвердить перенос':/^save_meeting_/.test(proposalCopy.draft?.action||'')?'✓ Подтвердить и сохранить':'✓ Подтвердить и создать';
 const cancel=document.createElement('button');cancel.type='button';cancel.textContent='Отмена';
 yes.style.cssText='padding:8px;border-radius:8px;background:#1768a9;color:white;border:0;';
 cancel.style.cssText='padding:8px;border-radius:8px;background:white;border:1px solid #a9b8c9;';
 yes.addEventListener('click',()=>{if(proposal===proposalCopy)void commit(ui);});
 cancel.addEventListener('click',()=>{if(proposal===proposalCopy){clearProposal();status(ui,'Действие отменено');say(ui,'Хорошо, ничего не создаю.',false);}});
 row.append(lead,yes,cancel);host.appendChild(row);buttonBox=row;
 if(pane.classList.contains('rsa-branch-panel'))host.scrollTop=host.scrollHeight;
}
function setBusy(v){
 working=v;root.__resantaAI360ActionBusyV1=v;
}
async function invoke(kind,payload){
 const session=typeof root.crmEnsureFreshSessionV236166==='function'?
   await root.crmEnsureFreshSessionV236166(false):
   await db.auth.getSession().then(x=>x.data?.session);
 if(!session?.access_token)throw Error('not_authorized');
 const r=await db.functions.invoke(ENDPOINT,{body:{kind,...payload}});
 if(r.error)throw Error(await failure(r.error));
 if(r.data?.error)throw Error(String(r.data.error));
 return r.data||{};
}
async function prepare(text,ui){
 if(!allowed()||working)return;
 const user=currentId(),run=++seq;
 clearProposal();setBusy(true);ownerId=user;
 status(ui,'Лера готовит безопасное действие…');
 try{
  const calendar=root.crmMeetingPlannerPilotV1?.prepareAgentRequest?.(text,{});
  const routeRequest=/(?:задач|поручен)/iu.test(text)?root.RESANTA_TASKS_ROUTE_V4?.prepareAgentTask?.(text):null;
  const data=await (routeRequest||invoke('prepare',{question:text.slice(0,2400),calendar_capabilities_v2:true,calendar_capabilities_v3:true,meeting_context:calendar?.meeting_context||null}));
  if(run!==seq||user!==currentId()||!allowed())return;
  if(data.mode==='needs_details'){
   missing=text;
   status(ui,'Нужно уточнение');
   say(ui,String(data.question||'Уточни параметры действия.'));
   return;
  }
  if(data.mode==='not_an_action'){
   say(ui,'Поняла вопрос как обсуждение, а не поручение. Уточни, что именно нужно создать.');
   return;
  }
  if(data.mode!=='prepared'||data.requires_confirmation!==true||
     !data.draft||typeof data.approval_token!=='string')throw Error('invalid_action_proposal');
  proposal={draft:data.draft,approval_token:data.approval_token,
    expires_at:data.expires_at,owner:user};
  status(ui,'Ничего не создано · требуется подтверждение');
  say(ui,'Проверила. '+String(data.summary||'')+(['reschedule_meeting','cancel_meeting','save_meeting_agenda','save_meeting_minutes'].includes(data.draft.action)?' Подтвердить изменение?':' Создать?'));
  makeButtons(ui,proposal);
 }catch(e){
  if(run===seq&&user===currentId()&&allowed()){
   status(ui,'Действие не выполнено');
   say(ui,'Не удалось подготовить действие. '+String(e?.message||'Ошибка').slice(0,70)+'. Ничего не создано.',false);
  }
 }finally{if(run===seq)setBusy(false);}
}
async function commit(ui){
 if(!proposal||working||!allowed()||proposal.owner!==currentId())return;
 const item=proposal,run=++seq,user=currentId();
 if(!item.expires_at||Date.parse(item.expires_at)<=Date.now()){
   clearProposal();say(ui,'Время подтверждения истекло. Повтори поручение.',false);return;
 }
 setBusy(true);status(ui,'Выполняю подтверждённое действие…');
 try{
  const payload={draft:item.draft,approval_token:item.approval_token,confirmation:'подтверждаю'};
  const data=item.draft.action==='route_task_v4'?await root.RESANTA_TASKS_ROUTE_V4.commitAgentTask(payload):await invoke('commit',payload);
  if(run!==seq||user!==currentId()||!allowed())return;
  clearProposal();
  if(['rescheduled_meeting','cancelled_meeting','saved_meeting_agenda','saved_meeting_minutes'].includes(data.mode)&&data.updated===1){
   void root.crmMeetingPlannerPilotV1?.refresh?.();
   say(ui,data.mode==='rescheduled_meeting'?'Встреча «'+data.title+'» перенесена на '+data.due_date+' в '+data.due_time+' по Минску.':data.mode==='cancelled_meeting'?'Встреча «'+data.title+'» отменена.':data.mode==='saved_meeting_agenda'?'Повестка встречи «'+data.title+'» сохранена в CRM.':'Итоги встречи «'+data.title+'» сохранены в CRM.');
  }else if(data.mode==='created_meeting'&&data.created===1){
   void root.crmMeetingPlannerPilotV1?.refresh?.();
   say(ui,'Встреча «'+String(data.title||'')+'» сохранена на '+String(data.due_date||'')+' в '+String(data.due_time||'')+'. '+String(data.note||''));
  }else if(data.mode==='created_visit'&&data.created===1){
   say(ui,String(data.note||'Плановый визит создан.')+' '+String(data.client_name||''));
  }else if(data.mode==='conflict_meeting'){
   say(ui,(item.draft.action==='reschedule_meeting'?'Встречу не перенесла: ':'Встречу не создала: ')+String(data.note||'найдено пересечение в календаре.'));
  }else if(data.mode==='created_task'&&data.created===1){
   say(ui,'Поручение действительно создано в CRM для '+String(data.assigned_to||'сотрудника')+
      '. '+String(data.note||''));
  }else if(data.mode==='created_chat'&&data.created===1){
   say(ui,'Чат CONNECT создан и проверен. Открой раздел «Чаты», чтобы начать разговор.');
  }else if(data.mode==='created_reminder'&&data.created===1){
   say(ui,String(data.note||'Личное напоминание сохранено.')+' '+String(data.due_date||'')+' в '+String(data.due_time||'')+'.');
  }else if(data.mode==='cancelled_reminder'&&data.cancelled===1){
   reminders=[];say(ui,'Напоминание отменено.');
  }else if(data.mode==='already_exists'){
   say(ui,String(data.note||'Такая запись уже существует. Повторно создавать не стала.'));
  }else throw Error('server_did_not_confirm_write');
  status(ui,'Сервер подтвердил результат');
 }catch(e){
  if(run===seq&&user===currentId()&&allowed()){
   clearProposal();
   status(ui,'Создание не подтверждено');
   say(ui,'Не получила подтверждения операции. '+(/meeting/.test(item.draft.action)?'Проверь календарь перед повтором. ':'Проверь задачи или CONNECT перед повтором. ')+String(e?.message||'').slice(0,60),false);
  }
 }finally{if(run===seq)setBusy(false);}
}
const AGENDA=/(?:какие|покажи|назови|список|расписание|что\s+у\s+меня).{0,110}(?:встреч|совещан|календар|расписани)|^(?:мой|мои)\s+(?:встречи|календарь|расписание)$/i;
const REMINDER=/^(?:напомни|напоминай|напоминание)(?=$|[\s,.!?])/i;
function calendarRange(question){
 const q=String(question).toLowerCase(),day=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Minsk',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 const move=(d,n)=>new Date(Date.parse(d+'T12:00:00Z')+n*86400000).toISOString().slice(0,10);
 if(/(?:^|\s)завтра(?=\s|[?.!,]|$)/u.test(q))return {period:'tomorrow'};
 if(/(?:^|\s)сегодня(?=\s|[?.!,]|$)/u.test(q))return {period:'today'};
 const explicit=[...q.matchAll(/(20\d\d)-(\d\d)-(\d\d)|(\d{1,2})[.](\d{1,2})[.](20\d\d)/g)].map(x=>x[1]?x[1]+'-'+x[2]+'-'+x[3]:x[6]+'-'+x[5].padStart(2,'0')+'-'+x[4].padStart(2,'0'));
 if(explicit.some(d=>!Number.isFinite(Date.parse(d+'T12:00Z'))||new Date(d+'T12:00Z').toISOString().slice(0,10)!==d))return {error:'Проверьте дату: используйте ДД.ММ.ГГГГ.'};
 if(explicit.length)return {period:'range',from:explicit[0],to:move(explicit[1]||explicit[0],1)};
 if(/недел/.test(q)){const dow=(new Date(day+'T12:00Z').getUTCDay()+6)%7,from=move(day,-dow+(/следующ/.test(q)?7:0));return {period:'range',from,to:move(from,7)};}
 const focus=root.crmMeetingPlannerPilotV1?.prepareAgentRequest?.('расписание',{})?.meeting_context?.focus;
 return focus?{period:'range',from:focus,to:move(focus,1)}:{period:'next7'};
}
async function agenda(ui,period,range={}){
 if(working||!allowed())return;
 const run=++seq,user=currentId();setBusy(true);
 status(ui,'Проверяю мой календарь CRM…');
 try{
  let result=await invoke('agenda',{period,...range,calendar_capabilities_v3:true});
  let items=[...(result.items||[])],pages=0;
  while(result.has_more&&pages++<39){const next=await invoke('agenda',{period,...range,offset:result.next_offset,calendar_capabilities_v3:true});items.push(...(next.items||[]));result=next;}
  result={...result,items};
  if(run!==seq||user!==currentId()||!allowed())return;
  if(result.mode!=='agenda'||!Array.isArray(result.items))throw Error('agenda_response_invalid');
  if(!result.items.length){say(ui,'На выбранный период в личном календаре CRM нет запланированных встреч.');return;}
  const list=result.items.map(x=>x.when+' — '+x.title+
   (x.client_name?' · '+x.client_name:'')).join('\n');
  say(ui,'Запланированные встречи:\n'+list+(result.has_more?'\nСписок ограничен; уточните период.':''));
  status(ui,'Проверено через личный календарь CRM');
 }catch(e){
  if(run===seq&&user===currentId()&&allowed())say(ui,'Не удалось прочитать календарь CRM. '+String(e?.message||'').slice(0,65),false);
 }finally{if(run===seq)setBusy(false);}
}
async function reminderCommand(ui,index){
 if(working||!allowed())return;
 const run=++seq,user=currentId();ownerId=user;setBusy(true);
 try{
  const data=index===null?await invoke('reminders',{}):await invoke('prepare_cancel_reminder',{reminder_id:reminders[index]?.id});
  if(run!==seq||user!==currentId()||!allowed())return;
  if(index===null){
   if(data.mode!=='reminders'||!Array.isArray(data.items))throw Error('invalid_reminders');
   reminders=data.items;
   const labels={pending:'запланировано',sending:'отправляется',sent:'отправлено',failed:'ошибка доставки',delivery_unknown:'доставка не подтверждена'};
   say(ui,reminders.length?'Личные напоминания:\n'+reminders.map((x,i)=>(i+1)+'. '+x.when+' — '+x.title+' · '+(labels[x.status]||'статус не установлен')).join('\n')+(data.has_more?'\nПоказаны последние 20 записей.':''):'Личных напоминаний нет.');
  }else{
   if(data.mode!=='prepared'||data.requires_confirmation!==true||!data.draft||typeof data.approval_token!=='string')throw Error('invalid_proposal');
   proposal={draft:data.draft,approval_token:data.approval_token,expires_at:data.expires_at,owner:user};
   say(ui,data.summary+' Подтвердить отмену?');makeButtons(ui,proposal);
  }
 }catch{if(run===seq&&user===currentId()&&allowed())say(ui,'Не удалось проверить напоминания. Операция не подтверждена.',false);}
 finally{if(run===seq)setBusy(false);}
}
function handle(q,ui){
 if(!allowed())return false;
 const actor=currentId();
 if(ownerId&&ownerId!==actor)reset();
 const text=String(q||'').trim().slice(0,2400),n=normalize(text);
 if(!n)return false;
 if(working){say(ui,'Я ещё проверяю предыдущую команду.');return true;}
 if(proposal){
  if(NO.test(n)){clearProposal();say(ui,'Хорошо, ничего не создаю.');return true;}
  if(YES.test(n)){void commit(ui);return true;}
  if(FIX.test(n)){
    const act=proposal.draft?.action;
    const original=act==='reschedule_meeting'?'Перенести встречу: ':act==='cancel_meeting'?'Отменить встречу: ':act==='save_meeting_agenda'?'Сохранить повестку встречи: ':act==='save_meeting_minutes'?'Сохранить итоги встречи: ':act==='task'?'Создать задачу: ':act==='chat'?'Создать чат: ':act==='visit'?'Запланировать визит: ':'Назначить встречу: ';
    const context=['reschedule_meeting','cancel_meeting','save_meeting_agenda','save_meeting_minutes'].includes(act)?[proposal.draft.title,proposal.draft.due_date,proposal.draft.due_time].filter(Boolean).join('; '):act==='task'?
      [proposal.draft.assignee_name,proposal.draft.title,proposal.draft.details,proposal.draft.due_date,proposal.draft.due_time].join('; '):
      act==='chat'?[proposal.draft.participant_names?.join(', '),proposal.draft.room_title].join('; '):
      [proposal.draft.client_name,proposal.draft.title,proposal.draft.details,proposal.draft.due_date,proposal.draft.due_time,proposal.draft.location].join('; ');
    void prepare(original+context+'. Исправление пользователя: '+text,ui);return true;
   }
  // A different question cancels the draft, avoiding accidental future "yes".
  clearProposal();
  if(!ACTION.test(n))return false;
 }
 if(missing){
  const old=missing;missing=null;
  if(NO.test(n)){say(ui,'Хорошо, отменяю создание.');return true;}
  if(!ACTION.test(n)){void prepare(old+'. Уточнение пользователя: '+text,ui);return true;}
 }
 if(/^(?:покажи|какие|список|мои).{0,45}напоминан/.test(n)||/^мои напоминания$/.test(n)){void reminderCommand(ui,null);return true;}
 const cancelReminder=/^(?:отмени|удали)\s+напоминание(?:\s+(?:номер\s+)?(\d+))?$/.exec(n);
 if(cancelReminder){
  const index=Number(cancelReminder[1]||1)-1;
  if(!reminders[index])say(ui,'Сначала попроси показать напоминания, затем назови номер для отмены.');
  else void reminderCommand(ui,index);
  return true;
 }
 if(root.crmMeetingPlannerPilotV1?.prepareAgentRequest?.(text,{})&&/^(?:(?:лера|пожалуйста|можешь|можно|давай|прошу)\s+){0,3}(?:перенеси|перенести|отмени|отменить|сохрани|сохранить|запиши).{0,180}(?:встреч|совещан|повестк|итог)/iu.test(text)){void prepare(text,ui);return true;}
 if(!ACTION.test(n)){
  if(REMINDER.test(n)){void prepare(text,ui);return true;}
  if(AGENDA.test(n)){
   const range=calendarRange(text);
   if(range.error){say(ui,range.error);return true;}
   void agenda(ui,range.period,range.period==='range'?{from:range.from,to:range.to}:{});return true;
  }
  return false;
 }
 // New requests retain full dialogue context in the semantic gateway. Pending
 // signed drafts and their explicit confirmations above remain local.
 if(root.__resantaLeraDialogueV2===true)return false;
 void prepare(text,ui);return true;
}
root.crmAI360ActionHandleV1=handle;
// Semantic dialogue can propose the same prepare flow without depending on a
// command regex. prepare() still checks the visible panel, actor and session;
// commit() remains a separate, explicit human confirmation of a signed draft.
root.crmAI360ActionPrepareV2=(question,ui)=>{
 if(!allowed()||working||typeof question!=='string'||question.length>2400)return false;
 void prepare(question,ui);return true;
};
root.crmAI360ActionBusyV1=()=>working;
root.crmAI360ActionResetV1=reset;
document.addEventListener('visibilitychange',()=>{if(document.hidden)reset();});
root.addEventListener('pagehide',reset);
})(window,document);
