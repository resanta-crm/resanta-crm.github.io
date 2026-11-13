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
let proposal=null,missing=null,working=false,seq=0,buttonBox=null,ownerId='';
function currentId(){try{return String(currentUser?.id||'');}catch{return '';}}
function panel(){return document.querySelector('.rva-window:not([hidden]):not(.rva-mini), .rsa-branch-panel:not([hidden])');}
function allowed(){return !!currentId()&&!document.hidden&&
 document.getElementById('app')?.style.display!=='none'&&!!panel();}
function reset(){
 seq++;proposal=null;missing=null;working=false;ownerId='';
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
 const yes=document.createElement('button');yes.type='button';yes.textContent='✓ Подтвердить и создать';
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
  const data=await invoke('prepare',{question:text.slice(0,2400)});
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
  say(ui,'Проверила. '+String(data.summary||'')+' Создать?');
  makeButtons(ui,proposal);
 }catch(e){
  if(run===seq&&user===currentId()&&allowed()){
   status(ui,'Действие не выполнено');
   say(ui,'Не удалось подготовить поручение или чат. '+String(e?.message||'Ошибка').slice(0,70)+'. Ничего не создано.',false);
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
  const data=await invoke('commit',{draft:item.draft,
    approval_token:item.approval_token,confirmation:'подтверждаю'});
  if(run!==seq||user!==currentId()||!allowed())return;
  clearProposal();
  if(data.mode==='created_meeting'&&data.created===1){
   say(ui,'Встреча «'+String(data.title||'')+'» сохранена на '+String(data.due_date||'')+' в '+String(data.due_time||'')+'. '+String(data.note||''));
  }else if(data.mode==='created_visit'&&data.created===1){
   say(ui,String(data.note||'Плановый визит создан.')+' '+String(data.client_name||''));
  }else if(data.mode==='conflict_meeting'){
   say(ui,'Встречу не создала: '+String(data.note||'найдено пересечение в календаре.'));
  }else if(data.mode==='created_task'&&data.created===1){
   say(ui,'Поручение действительно создано в CRM для '+String(data.assigned_to||'сотрудника')+
      '. '+String(data.note||''));
  }else if(data.mode==='created_chat'&&data.created===1){
   say(ui,'Чат CONNECT создан и проверен. Открой раздел «Чаты», чтобы начать разговор.');
  }else if(data.mode==='already_exists'){
   say(ui,'Такое поручение уже существует. Повторно создавать не стала.');
  }else throw Error('server_did_not_confirm_write');
  status(ui,'Сервер подтвердил результат');
 }catch(e){
  if(run===seq&&user===currentId()&&allowed()){
   clearProposal();
   status(ui,'Создание не подтверждено');
   say(ui,'Не получила подтверждения операции. Проверь задачи или CONNECT перед повтором. '+String(e?.message||'').slice(0,60),false);
  }
 }finally{if(run===seq)setBusy(false);}
}
const AGENDA=/(?:какие|покажи|назови|список|расписание|что\s+у\s+меня).{0,110}(?:встреч|совещан|календар|расписани)|^(?:мой|мои)\s+(?:встречи|календарь|расписание)$/i;
const REMINDER=/^(?:напомни|напоминай|напоминание)(?=$|[\s,.!?])/i;
async function agenda(ui,period){
 if(working||!allowed())return;
 const run=++seq,user=currentId();setBusy(true);
 status(ui,'Проверяю мой календарь CRM…');
 try{
  const result=await invoke('agenda',{period});
  if(run!==seq||user!==currentId()||!allowed())return;
  if(result.mode!=='agenda'||!Array.isArray(result.items))throw Error('agenda_response_invalid');
  if(!result.items.length){say(ui,'На выбранный период в личном календаре CRM нет запланированных встреч.');return;}
  const list=result.items.map(x=>x.when+' — '+x.title+
   (x.client_name?' · '+x.client_name:'')).join('\n');
  say(ui,'Запланированные встречи:\n'+list+(result.has_more?'\nПоказаны первые 25 записей.':''));
  status(ui,'Проверено через личный календарь CRM');
 }catch(e){
  if(run===seq&&user===currentId()&&allowed())say(ui,'Не удалось прочитать календарь CRM. '+String(e?.message||'').slice(0,65),false);
 }finally{if(run===seq)setBusy(false);}
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
    const original=act==='task'?'Создать задачу: ':act==='chat'?'Создать чат: ':act==='visit'?'Запланировать визит: ':'Назначить встречу: ';
    const context=act==='task'?
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
 if(!ACTION.test(n)){
  if(REMINDER.test(n)){say(ui,'Автоматические уведомления о встречах пока не настроены. Могу создать встречу в личном календаре CRM или поставить задачу с датой.');return true;}
  if(AGENDA.test(n)){
   void agenda(ui,/\bзавтра\b/.test(n)?'tomorrow':/\bсегодня\b/.test(n)?'today':'next7');return true;
  }
  return false;
 }
 void prepare(text,ui);return true;
}
root.crmAI360ActionHandleV1=handle;
root.crmAI360ActionBusyV1=()=>working;
root.crmAI360ActionResetV1=reset;
document.addEventListener('visibilitychange',()=>{if(document.hidden)reset();});
root.addEventListener('pagehide',reset);
})(window,document);
