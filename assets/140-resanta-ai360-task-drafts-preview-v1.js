/* RESANTA AI360 drafts preview v1 with separately confirmed director approval.
 * No direct database writes: only an authenticated dedicated approval endpoint; desktop boss only.
 * The server re-verifies client ownership, region and existing tasks/routes.
 */
(function(root){
'use strict';
if(/Android/i.test(navigator.userAgent||'')||root.crmAI360TaskDraftsHandleV1)return;
const ENDPOINT='crm-ai360-task-drafts-v1';
const APPROVAL_ENDPOINT='crm-ai360-task-approval-v1';
const REQUEST=/(?:предлож|подготов|сформир|состав|созда[йт]|покажи)[а-яё]*\s+.{0,55}(?:поручен|задач)|(?:какие|дай)\s+поручен/i;
const CHOOSE=/(?:согласова|выбер|выбра|остав|утверд|одобр|подтвержда)/i;
const CANCEL=/(?:отмен|убер|убра|удал|сброс|очист)/i;
const CHANGE=/(?:измени|поменяй|перенеси|поставь)\s+(?:срок|дату)/i;
const CHANGE_TEXT=/(?:измени|поменяй)\s+(?:текст|содержание)\s+(?:первого|второго|третьего|[1-3])\s+(?:на|:)\s+(.+)/i;
const PREPARE=/(?:согласова|утверд|одобр)/i;
const FINAL_CONFIRM=/^подтверждаю создание поручений[.!?]*$/i;
const FINAL_REJECT=/^(?:не подтверждаю|отказываюсь|отмена создания|не создавать)[.!?]*$/i;
const months={'января':1,'февраля':2,'марта':3,'апреля':4,'мая':5,'июня':6,
 'июля':7,'августа':8,'сентября':9,'октября':10,'ноября':11,'декабря':12};
let pending=false,items=[],asOf='',chosen=new Set(),requestEpoch=0,approvalBusy=false,approval=null;
function allowed(){
 try{return typeof currentUser!=='undefined'&&!!currentUser?.id &&
  typeof currentProfile!=='undefined'&&currentProfile?.role==='boss' &&
  String(currentProfile?.name||'').trim().replace(/\s+/g,' ').toLocaleLowerCase('ru-RU')==='александр паюшин' &&
  document.getElementById('app')?.style.display!=='none'&&!document.hidden;}
 catch(_){return false;}
}
function safe(x,limit=200){return String(x||'').replace(/[\u0000-\u001f]+/g,' ').trim().slice(0,limit);}
function pad(n){return String(n).padStart(2,'0');}
function validDay(day,month,year){
 const date=new Date(Date.UTC(year,month-1,day));
 return date.getUTCFullYear()===year&&date.getUTCMonth()+1===month&&date.getUTCDate()===day
  ?year+'-'+pad(month)+'-'+pad(day):null;
}
function newDueDate(text){
 const q=String(text||'').toLocaleLowerCase('ru-RU').replace(/ё/g,'е');
 let found=q.match(/(?:\bна\s+)?(\d{1,2})[\s./-]+(\d{1,2})[\s./-]+(\d{4})(?:\b|$)/);
 let result=null;
 if(found)result=validDay(Number(found[1]),Number(found[2]),Number(found[3]));
 else{
   found=q.match(/(?:\bна\s+)?(\d{1,2})\s+(января|февраля|марта|апреля|мая|июня|июля|августа|сентября|октября|ноября|декабря)(?:\s+(\d{4}))?/);
   if(found) {
     const currentYear=Number(asOf.slice(0,4))||new Date().getUTCFullYear();
     result=validDay(Number(found[1]),months[found[2]],Number(found[3]||currentYear));
   }
 }
 if(!result||!asOf||result<=asOf)return null;
 const delta=(Date.parse(result+'T00:00:00Z')-Date.parse(asOf+'T00:00:00Z'))/86400000;
 return delta<=90?result:null;
}
function numbers(text){
 const q=String(text||'').toLocaleLowerCase('ru-RU');
 const words={'перв':1,'втор':2,'трет':3};
 const nums=new Set();
 for(const [stem,n] of Object.entries(words))if(new RegExp(stem+'[а-я]*').test(q))nums.add(n);
 for(const m of q.matchAll(/(?:^|\s)([1-3])(?:\s|$)/g))nums.add(Number(m[1]));
 return [...nums].filter(n=>n>=1&&n<=items.length).sort();
}
function summary(){
 if(!items.length)return 'Активных черновиков нет. Попроси предложить поручения для конкретного менеджера.';
 return 'Подготовлены черновики (НИЧЕГО НЕ СОХРАНЕНО):\n'+items.map((x,i)=>
  '**'+(i+1)+'. '+safe(x.title,90)+'**'+
  '\nИсполнитель: '+safe(x.manager_name,90)+'; клиент: '+safe(x.client_name,100)+
  '; срок: '+safe(x.due_date,12)+
  '\nПоручение: '+safe(x.text,250)+
  '\nОснование: '+safe(x.basis,240)+
  '\nРезультат: '+safe(x.expected_result,220)+
  '\nКритерий: '+safe(x.criteria,190)+
  '\nИсточник: '+safe(x.source,130)
 ).join('\n\n')+
 '\n\nСкажи «изменить срок первого на 29 октября», «убрать второе» или «выбрать первое и третье».'+
 '\nПока только черновики. Для подготовки записи скажи «Согласовать первое». Создание требует отдельного точного подтверждения.';
}
async function responseError(error){
 try{if(error?.context?.json)return safe((await error.context.json())?.error||error.message);}catch(_){}
 return safe(error?.message||'server_unavailable');
}
async function requestDrafts(question,ui){
 pending=true;requestEpoch++;
 const epoch=requestEpoch;
 root.__resantaAI360PendingV1=true;
 ui.textStatus('Проверяю клиентов и существующие задачи…');
 try{
   const started=Date.now();
   const session=typeof root.crmEnsureFreshSessionV236166==='function'
    ?await root.crmEnsureFreshSessionV236166(false)
    :await db.auth.getSession().then(x=>x?.data?.session);
   if(!session?.access_token)throw new Error('not_authorized');
   // The endpoint resolves the spoken surname AGAINST the authenticated CRM
   // directory on the server. One network roundtrip, no untrusted local mapping.
   const result=await db.functions.invoke(ENDPOINT,{body:{kind:'preview_query',message:question}});
   if(result.error){
     const code=await responseError(result.error);
     if(code==='manager_not_found_or_ambiguous'){
       ui.answer('Не уверена, какого менеджера ты назвал. Уточни фамилию Витебского филиала: Руднев, Ачинович или Шкуран. Черновики не созданы.');
       return;
     }
     throw new Error(code);
   }
   const manager=String(result.data?.manager||'').trim();
   if(!manager||manager.length>80)throw new Error('invalid_server_response');
   if(epoch!==requestEpoch||!allowed())return;
   if(result.data?.mode!=='readonly'||!Array.isArray(result.data.items)||result.data.items.length>3)
     throw new Error('invalid_server_response');
   const raw=result.data.items;
   // Reject incomplete or unrelated results; do not infer or fabricate clients.
   if(raw.some(x=>!x.client_id||!x.client_name||x.manager_name!==manager||
      !x.due_date||!x.text||!x.basis||!x.expected_result||!x.criteria))
     throw new Error('invalid_server_response');
   asOf=safe(result.data.as_of,10);
   items=raw.map(x=>({...x}));chosen.clear();approval=null;
   ui.textStatus('Черновики проверены за '+((Date.now()-started)/1000).toFixed(1)+' с · ещё не созданы');
   ui.answer(summary(),{speechSummary:items.length?
     'Нашла '+items.length+' предложения для '+manager+'. Все они пока черновики. Скажи, что изменить или убрать.':
     'По выбранному менеджеру нет новых безопасных предложений. Возможно, уже есть открытые поручения или маршруты.'});
 }catch(e){
   if(epoch===requestEpoch&&allowed())ui.answer('Не удалось подготовить достоверные черновики: '+safe(e?.message)+'. Никакие задачи не созданы.');
 }finally{
   if(epoch===requestEpoch){pending=false;root.__resantaAI360PendingV1=false;}
 }
}
// Preparation verifies real CRM ownership and duplicates, but cannot create tasks.
// The user must separately say the exact explicit final command.
function payloadFor(indices){
 return indices.map(n=>{
   const x=items[n-1];
   return {client_id:x.client_id,client_name:x.client_name,manager_name:x.manager_name,
     title:x.title,text:x.text,due_date:x.due_date,
     expected_result:x.expected_result,criteria:x.criteria};
 });
}
async function approvalRequest(kind,ui){
 if(approvalBusy)return;
 if(kind==='validate'&&!items.length)return;
 const chosenIndices=[...chosen].sort((a,b)=>a-b);
 if(kind==='validate'&&!chosenIndices.length){
   ui.answer('Назови номера поручений для согласования: например «Согласовать первое и третье».');
   return;
 }
 if(kind==='commit'&&!approval){
   ui.answer('Нет поручений, подготовленных к созданию. Сначала скажи «Согласовать первое».');
   return;
 }
 approvalBusy=true;root.__resantaAI360PendingV1=true;
 ui.textStatus(kind==='validate'?'Проверяю выбранные поручения перед созданием…':
  'Создаю подтверждённые поручения…');
 try{
   const id=kind==='validate'?root.crypto?.randomUUID?.():approval.id;
   if(!id)throw new Error('secure_random_unavailable');
   const entries=kind==='validate'?payloadFor(chosenIndices):approval.items;
   const body={kind,approval_id:id,items:entries};
   if(kind==='commit')body.confirmation='подтверждаю создание поручений';
   const response=await db.functions.invoke(APPROVAL_ENDPOINT,{body});
   if(response.error)throw new Error(await responseError(response.error));
   if(!allowed())return;
   if(kind==='validate'){
     if(response.data?.mode!=='ready'||!Array.isArray(response.data.items)||
       response.data.items.length!==entries.length)throw new Error('invalid_validation');
     const confirmed=response.data.items;
     if(confirmed.some((r,i)=>r.client_id!==entries[i].client_id||
       r.manager_name!==entries[i].manager_name||r.due_date!==entries[i].due_date))
       throw new Error('mismatched_validation');
     approval={id,items:confirmed};
     const lines=confirmed.map((r,i)=>(i+1)+'. '+safe(r.client_name,100)+
       '; '+safe(r.manager_name,100)+'; срок '+safe(r.due_date,12)+
       '; '+safe(r.title,120)+'; '+safe(r.text,190)).join('\n');
     ui.answer('К СОЗДАНИЮ ПОДГОТОВЛЕНО '+confirmed.length+
       ' ПОРУЧЕНИЙ. Пока ничего НЕ СОЗДАНО.\n'+lines+
       '\n\nДля записи в CRM произнеси ТОЧНО «Подтверждаю создание поручений». '+
       'Или скажи «Отмена создания».',{speechSummary:
       'Поручения проверены, но ещё не созданы. Для записи скажи: Подтверждаю создание поручений.'});
   }else{
     if(response.data?.mode==='created'||response.data?.mode==='already_created'){
       const created=response.data.mode==='created';
       ui.answer(created?
         'Подтверждено: '+Number(response.data.created)+' поручений созданы в CRM.':
         'Эти поручения уже были созданы ранее. Повторных задач нет.');
       approval=null;items=[];chosen.clear();
     }else throw new Error('invalid_commit_result');
   }
 }catch(e){
   if(allowed())ui.answer('Операция не подтверждена: '+safe(e?.message,150)+
     '. Проверь состояние задач в CRM перед повтором. Автоматически запрос не повторяю.');
   // Retain approval ID for an idempotent manual retry in case of network error.
 }finally{
   approvalBusy=false;root.__resantaAI360PendingV1=false;
 }
}

root.crmAI360TaskDraftsHandleV1=function(query,ui){
 if(!allowed())return false;
 const q=String(query||'').trim().replace(/^лера[,.!?]?\s*/i,'').slice(0,500);
 if(!q)return false;
 if(approvalBusy){ui.answer('Предыдущее согласование ещё проверяется.');return true;}
 if(approval&&FINAL_REJECT.test(q)){
   approval=null;ui.answer('Подтверждение отменено. Никакие задачи не созданы.');return true;
 }
 if(FINAL_CONFIRM.test(q)){
   if(!approval){ui.answer('Нет подготовленных к созданию поручений. Сначала согласуй номера.');return true;}
   void approvalRequest('commit',ui);return true;
 }
 if(approval&&/(?:подтвержд|создавай|давай созда|сохрани)/i.test(q)){
   ui.answer('Чтобы избежать случайной записи, скажи точно «Подтверждаю создание поручений», или «Отмена создания».');return true;
 }
 if(REQUEST.test(q)){
   if(pending){ui.answer('Предыдущая проверка ещё выполняется.');return true;}
   if(root.__resantaAI360PendingV1){
     ui.answer('Дождись окончания предыдущего анализа Леры. Черновики пока не запрашиваю.');
     return true;
   }
   items=[];chosen.clear();asOf='';approval=null;void requestDrafts(q,ui);return true;
 }
 if(!items.length)return false;
 if(CANCEL.test(q)){
   const ns=numbers(q);
   if(!ns.length||/все|целиком|полностью/.test(q)){
     items=[];chosen.clear();approval=null;requestEpoch++;
     ui.answer('Черновики отменены. Никакие задачи не были созданы.');
   }else{
     for(const n of ns.slice().reverse())items.splice(n-1,1);
     chosen.clear();approval=null;ui.answer('Убрала выбранные черновики. '+summary());
   }
   return true;
 }
 if(CHANGE_TEXT.test(q)){
   const ns=numbers(q),match=CHANGE_TEXT.exec(q);
   const value=match?.[1]?.trim();
   if(ns.length!==1||!value||value.length<8||value.length>500){
     ui.answer('Назови номер и новый текст от 8 до 500 символов.');return true;
   }
   items[ns[0]-1].text=value;chosen.clear();approval=null;
   ui.answer('Текст черновика '+ns[0]+' изменён. Перед созданием понадобится новое подтверждение.
'+summary());
   return true;
 }
 if(CHANGE.test(q)){
   const ns=numbers(q);
   const date=newDueDate(q);
   if(ns.length!==1||!date){ui.answer('Назови один номер и конкретную будущую дату не дальше 90 дней. Например: «Измени срок первого на 29 октября».');return true;}
   items[ns[0]-1].due_date=date;
   chosen.clear();approval=null;
   ui.answer('Срок черновика №'+ns[0]+' изменён на '+date+'. Никакие задачи не созданы.\n'+summary());
   return true;
 }
 if(PREPARE.test(q)){
   if(!items.length){ui.answer('Сначала попроси Леру предложить поручения.');return true;}
   const ns=numbers(q);
   if(!ns.length){ui.answer('Назови номера поручений: «Согласовать первое и третье».');return true;}
   chosen=new Set(ns);approval=null;void approvalRequest('validate',ui);return true;
 }
 if(CHOOSE.test(q)){
   const ns=numbers(q);
   if(!ns.length){ui.answer('Назови номера черновиков для выбора. Функция создания пока отключена.');return true;}
   chosen=new Set(ns);approval=null;
   ui.answer('Отмечены для дальнейшей проверки черновики: '+ns.join(', ')+
     '. Это НЕ согласование и НЕ создание задач. Сохранение в CRM пока выключено.');
   return true;
 }
 if(/^(?:покажи|прочитай|перечисли)\s+(?:черновик|поручен)/i.test(q)){
   ui.answer(summary());return true;
 }
 return false;
};
root.crmAI360TaskDraftsPreviewInternalsV1={validDay,numbers,newDueDate};
})(window);
