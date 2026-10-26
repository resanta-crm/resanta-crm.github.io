/* RESANTA AI360 drafts preview v1. STAGED / READ-ONLY.
 * No writes. No task approval/creation. Never auto-load; desktop boss only.
 * The server re-verifies client ownership, region and existing tasks/routes.
 */
(function(root){
'use strict';
if(/Android/i.test(navigator.userAgent||'')||root.crmAI360TaskDraftsHandleV1)return;
const ENDPOINT='crm-ai360-task-drafts-v1';
const REQUEST=/(?:предлож|подготов|сформир|состав|созда[йт]|покажи)[а-яё]*\s+.{0,55}(?:поручен|задач)|(?:какие|дай)\s+поручен/i;
const CHOOSE=/(?:согласова|выбер|выбра|остав|утверд|одобр|подтвержда)/i;
const CANCEL=/(?:отмен|убер|убра|удал|сброс|очист)/i;
const CHANGE=/(?:измени|поменяй|перенеси|поставь)\s+(?:срок|дату)/i;
const months={'января':1,'февраля':2,'марта':3,'апреля':4,'мая':5,'июня':6,
 'июля':7,'августа':8,'сентября':9,'октября':10,'ноября':11,'декабря':12};
let pending=false,items=[],asOf='',chosen=new Set(),requestEpoch=0;
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
 '\nСоздание задач и финальное согласование пока ОТКЛЮЧЕНЫ.';
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
   items=raw.map(x=>({...x}));chosen.clear();
   ui.textStatus('Черновики проверены за '+((Date.now()-started)/1000).toFixed(1)+' с · запись отключена');
   ui.answer(summary(),{speechSummary:items.length?
     'Нашла '+items.length+' предложения для '+manager+'. Все они пока черновики. Скажи, что изменить или убрать.':
     'По выбранному менеджеру нет новых безопасных предложений. Возможно, уже есть открытые поручения или маршруты.'});
 }catch(e){
   if(epoch===requestEpoch&&allowed())ui.answer('Не удалось подготовить достоверные черновики: '+safe(e?.message)+'. Никакие задачи не созданы.');
 }finally{
   if(epoch===requestEpoch){pending=false;root.__resantaAI360PendingV1=false;}
 }
}
root.crmAI360TaskDraftsHandleV1=function(query,ui){
 if(!allowed())return false;
 const q=String(query||'').trim().slice(0,300);
 if(!q)return false;
 if(REQUEST.test(q)){
   if(pending){ui.answer('Предыдущая проверка ещё выполняется.');return true;}
   if(root.__resantaAI360PendingV1){
     ui.answer('Дождись окончания предыдущего анализа Леры. Черновики пока не запрашиваю.');
     return true;
   }
   items=[];chosen.clear();asOf='';void requestDrafts(q,ui);return true;
 }
 if(!items.length)return false;
 if(CANCEL.test(q)){
   const ns=numbers(q);
   if(!ns.length||/все|целиком|полностью/.test(q)){
     items=[];chosen.clear();requestEpoch++;
     ui.answer('Черновики отменены. Никакие задачи не были созданы.');
   }else{
     for(const n of ns.slice().reverse())items.splice(n-1,1);
     chosen.clear();ui.answer('Убрала выбранные черновики. '+summary());
   }
   return true;
 }
 if(CHANGE.test(q)){
   const ns=numbers(q);
   const date=newDueDate(q);
   if(ns.length!==1||!date){ui.answer('Назови один номер и конкретную будущую дату не дальше 90 дней. Например: «Измени срок первого на 29 октября».');return true;}
   items[ns[0]-1].due_date=date;
   chosen.clear();
   ui.answer('Срок черновика №'+ns[0]+' изменён на '+date+'. Никакие задачи не созданы.\n'+summary());
   return true;
 }
 if(CHOOSE.test(q)){
   const ns=numbers(q);
   if(!ns.length){ui.answer('Назови номера черновиков для выбора. Функция создания пока отключена.');return true;}
   chosen=new Set(ns);
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
