/* Branch director approved CRM tasks. A user opens a draft by click or voice,
   checks exact details, validates on the server and explicitly confirms creation.
   No automatic task generation, no hidden writes, no direct table access. */
(function(root){
'use strict';
if(/Android/i.test(navigator.userAgent||'')||root.crmAI360BranchTaskHandleV1)return;
const SID='ba55dfe5-7e48-4f1f-b40e-674c7752fe1a';
const ENDPOINT='crm-ai360-branch-task-approval-v1';
const managers=['Руднев','Ачинович','Шкуран'];
const CONFIRM='подтверждаю создание поручения';
const trim=x=>String(x??'').trim();
const normalize=x=>trim(x).toLocaleLowerCase('ru-RU').replace(/ё/g,'е').replace(/\s+/g,' ');
const line=x=>trim(x).slice(0,180);
let panel=null,form=null,preview=null,managerEl=null,clientEl=null,titleEl=null,textEl=null,dueEl=null,resultEl=null;
let approveButton=null,commitButton=null,busy=false,proof=null,draft=null,seq=0;
function allowed(){
 try{return typeof currentUser!=='undefined'&&currentUser?.id===SID&&
  typeof currentProfile!=='undefined'&&currentProfile?.role==='boss'&&
  normalize(currentProfile?.name)==='сидарович к.н.'&&currentProfile?.region==='Витебск'&&
  document.getElementById('app')?.style.display!=='none';}catch{return false;}
}
function active(){return allowed()&&panel&&!panel.hidden&&!document.hidden;}
function msg(s){
 if(!active())return;
 const log=panel.querySelector('.rsa-branch-log');if(!log)return;
 const p=document.createElement('div');p.className='rsa-branch-task-notice';
 p.style.cssText='padding:9px 12px;border:1px solid #d4deee;border-radius:8px;margin-top:8px;white-space:pre-wrap;font-size:12px';
 p.textContent=line(s).length<180?String(s).slice(0,1200):line(s);
 log.appendChild(p);log.scrollTop=log.scrollHeight;
}
function status(s){const el=panel?.querySelector('[data-rsa-task-status]');if(el)el.textContent=line(s);}
function clearProof(){proof=null;draft=null;if(commitButton)commitButton.disabled=true;if(preview)preview.textContent='';}
function showForm(){
 if(!active())return;
 if(!form)root.crmAI360BranchTaskMountV1?.(panel);
 if(form){form.style.display='flex';managerEl?.focus();}
}
function closeForm(){
 clearProof();if(form)form.style.display='none';
}
function today(){
 const items=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Minsk',year:'numeric',month:'2-digit',day:'2-digit'})
  .formatToParts(new Date());
 const get=k=>items.find(p=>p.type===k)?.value||'';
 return get('year')+'-'+get('month')+'-'+get('day');
}
function value(){
 return {manager_name:trim(managerEl?.value),client_name:trim(clientEl?.value),
  title:trim(titleEl?.value),text:trim(textEl?.value),due_date:trim(dueEl?.value),
  expected_result:trim(resultEl?.value),criteria:''};
}
function prepareText(query){
 const q=normalize(query);
 const names=managers.filter(m=>q.includes(normalize(m).slice(0,5)));
 if(names.length===1)managerEl.value=names[0];
 const match=String(query).match(/[:：]\s*(.+)/s);
 if(match&&match[1]){
  const task=match[1].trim().slice(0,480);
  if(task.length>9){textEl.value=task;titleEl.value=task.slice(0,100);}
 }
 clearProof();
}
function protectedInvoke(kind,body){
 return db.functions.invoke(ENDPOINT,{body:{kind,...body}});
}
function toggleBusy(on){
 busy=on;
 if(approveButton)approveButton.disabled=on;
 if(commitButton)commitButton.disabled=on||!proof;
}
async function validate(){
 if(!active()||busy)return;
 clearProof();
 const task=value();
 if(!managers.includes(task.manager_name)||task.title.length<8||task.text.length<12||
  !/^\d{4}-\d{2}-\d{2}$/.test(task.due_date)){
  msg('Укажи менеджера, название, текст поручения и срок в формате ГГГГ-ММ-ДД.');return;
 }
 if(!root.crypto?.randomUUID){
  msg('Не могу безопасно подготовить подтверждение в этом браузере.');return;
 }
 const approval_id=root.crypto.randomUUID();
 toggleBusy(true);const n=++seq;status('Проверяю менеджера, клиента и похожие поручения…');
 try{
  const sess=typeof root.crmEnsureFreshSessionV236166==='function'?
   await root.crmEnsureFreshSessionV236166(false):await db.auth.getSession().then(x=>x?.data?.session);
  if(!sess?.access_token)throw Error('not_authorized');
  const res=await protectedInvoke('validate',{...task,approval_id});
  if(res.error){
   let code='validation_failed';
   try{code=(await res.error.context?.json?.())?.error||res.error.message||code;}catch{}
   throw Error(String(code));
  }
  if(!active()||n!==seq)return;
  if(res.data?.mode==='already_exists'){
   status('Такое поручение уже было создано. Повторную задачу не создаю.');
   msg('Такое поручение уже существует в CRM. Повтор не нужен.');return;
  }
  if(res.data?.mode!=='ready_branch'||!res.data?.approval_token||
   res.data?.created!==0||res.data?.proposal?.manager_name!==task.manager_name)
   throw Error('invalid_approval_preview');
  const p=res.data.proposal;
  draft={...task,approval_id};
  proof=res.data.approval_token;
  preview.textContent='СОГЛАСОВАНИЕ ПОРУЧЕНИЯ\nИсполнитель: '+p.manager_name+
   '\nКлиент: '+(p.client_name||'без привязки к клиенту')+
   '\nНазвание: '+p.title+'\nТекст: '+p.text+
   '\nСрок: '+p.due_date+'\nРезультат: '+p.expected_result+
   '\n\nНичего ещё не создано. Подтверди отдельной кнопкой или точной фразой: «Подтверждаю создание поручения».';
  commitButton.disabled=false;
  status('Черновик проверен · подтверждение действительно 10 минут');
 }catch(e){
  if(active()&&n===seq){msg('Создание не разрешено: '+line(e?.message||e)+'. Поручение не создано.');status('Требуется проверка данных');}
 }finally{if(n===seq)toggleBusy(false);}
}
async function commit(){
 if(!active()||busy)return;
 if(!proof||!draft){msg('Сначала проверь черновик. Ничего не создано.');return;}
 const item={...draft},token=proof;
 toggleBusy(true);const n=++seq;status('Создаю подтверждённое поручение…');
 try{
  const sess=typeof root.crmEnsureFreshSessionV236166==='function'?
   await root.crmEnsureFreshSessionV236166(false):await db.auth.getSession().then(x=>x?.data?.session);
  if(!sess?.access_token)throw Error('not_authorized');
  const res=await protectedInvoke('commit',{
   ...item,approval_token:token,confirmation:CONFIRM
  });
  if(res.error){
   let code='commit_failed';
   try{code=(await res.error.context?.json?.())?.error||res.error.message||code;}catch{}
   throw Error(String(code));
  }
  if(!active()||n!==seq)return;
  if(res.data?.mode==='already_exists'){
   msg('Поручение уже создано ранее. Дублировать не буду.');
  }else if(res.data?.mode==='created_branch'&&res.data?.created===1&&
   res.data?.assigned_to===item.manager_name){
   msg('Поручение создано в CRM и назначено менеджеру '+item.manager_name+'. Проверь его в разделе «Задачи».');
  }else throw Error('unverified_write_response');
  status('Готово · повторное создание заблокировано');
  closeForm();
 }catch(e){
  if(active()&&n===seq){msg('Не удалось подтвердить создание ('+line(e?.message||e)+'). Проверь CRM перед повторной попыткой.');status('Создание не подтверждено');}
 }finally{if(n===seq)toggleBusy(false);}
}
function makeInput(label,tag='input'){
 const row=document.createElement('label');row.style.cssText='display:flex;flex-direction:column;gap:3px;font-size:12px;';
 const cap=document.createElement('span');cap.textContent=label;
 const input=document.createElement(tag);
 input.style.cssText='width:100%;box-sizing:border-box;padding:7px;border:1px solid #b8ccdf;border-radius:7px;font-size:12px;';
 row.append(cap,input);
 form.appendChild(row);input.addEventListener('input',clearProof);input.addEventListener('change',clearProof);
 return input;
}
root.crmAI360BranchTaskMountV1=function(current){
 if(!allowed()||!current||form)return;
 panel=current;
 const launch=document.createElement('button');launch.type='button';
 launch.textContent='✍️ Новое поручение';
 launch.className='rsa-task-new';
 launch.addEventListener('click',showForm);
 const actions=panel.querySelector('.rsa-branch-task-actions')||
  panel.querySelector('.rsa-branch-log')?.nextElementSibling;
 if(actions)actions.appendChild(launch);
 else panel.appendChild(launch);
 form=document.createElement('section');form.className='rsa-branch-task-form';
 form.style.cssText='display:none;flex-direction:column;gap:7px;max-height:54vh;overflow:auto;padding:10px;border:1px solid #accbe8;border-radius:10px;background:#f8fbff';
 const heading=document.createElement('strong');heading.textContent='Поручение руководителя филиала';form.appendChild(heading);
 managerEl=makeInput('Исполнитель','select');
 for(const name of managers){
  const op=document.createElement('option');op.value=name;op.textContent=name;managerEl.appendChild(op);
 }
 clientEl=makeInput('Клиент (необязательно, точное название CRM)');
 titleEl=makeInput('Заголовок поручения (8–110 символов)');titleEl.maxLength=110;
 textEl=makeInput('Что должен сделать менеджер (12–500 символов)','textarea');textEl.maxLength=500;
 dueEl=makeInput('Срок');dueEl.type='date';dueEl.min=today();
 resultEl=makeInput('Ожидаемый результат (необязательно)');resultEl.maxLength=250;
 const controls=document.createElement('div');controls.style.cssText='display:flex;gap:6px;flex-wrap:wrap;';
 approveButton=document.createElement('button');approveButton.type='button';approveButton.textContent='1. Проверить';
 approveButton.addEventListener('click',()=>void validate());
 commitButton=document.createElement('button');commitButton.type='button';commitButton.disabled=true;
 commitButton.textContent='2. Подтверждаю создание поручения';
 commitButton.addEventListener('click',()=>void commit());
 const cancel=document.createElement('button');cancel.type='button';cancel.textContent='Отмена';cancel.addEventListener('click',closeForm);
 controls.append(approveButton,commitButton,cancel);form.appendChild(controls);
 preview=document.createElement('div');preview.className='rsa-branch-task-preview';
 preview.style.cssText='white-space:pre-wrap;font-size:12px;line-height:1.5;color:#294260';
 form.appendChild(preview);
 const stat=document.createElement('div');stat.setAttribute('data-rsa-task-status','');
 stat.style.cssText='font-size:11px;color:#52708b';stat.textContent='Сначала проверь проект поручения';
 form.appendChild(stat);
 const log=panel.querySelector('.rsa-branch-log');
 if(log&&log.parentNode)log.parentNode.insertBefore(form,log.nextSibling);
 else panel.appendChild(form);
};
root.crmAI360BranchTaskHandleV1=function(question){
 if(!active())return false;
 const s=normalize(question);
 if(s===CONFIRM||s===CONFIRM+'.'||s===CONFIRM+'!'){
  void commit();return true;
 }
 if(/^(?:лера[,. ]+)?(?:создай|создать|поставь|подготовь|новое|оформи)\s+(?:новое\s+)?(?:поручение|задачу|задача)/.test(s)){
  showForm();prepareText(question);msg('Подготовила форму поручения. Проверь исполнителя, текст, срок и нажми «Проверить». Никаких задач пока не создала.');
  return true;
 }
 return false;
};
root.crmAI360BranchTaskResetV1=function(){
 seq++;busy=false;clearProof();if(form)form.style.display='none';
};
})(window);
