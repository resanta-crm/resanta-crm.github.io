/* Director-only AI360 unified natural-language bridge. No CRM writes. */
(function(){
'use strict';
if(/Android/i.test(navigator.userAgent||'')||window.crmAI360UnifiedDialogHandleV1)return;
const ENDPOINT='crm-ai360-dialog-v1';
let history=[],memory={},pending=false;
function allowed(){
 try{return typeof currentUser!=='undefined'&&!!currentUser?.id&&
  typeof currentProfile!=='undefined'&&currentProfile?.role==='boss'&&
  String(currentProfile?.name||'').trim().replace(/\s+/g,' ').toLocaleLowerCase('ru-RU')==='александр паюшин'&&
  document.getElementById('app')?.style.display!=='none';}
 catch{return false;}
}
async function errorCode(e){
 if(e?.context?.json){try{return String((await e.context.json())?.error||'request_failed');}catch{}}
 return String(e?.message||'request_failed');
}
function pretty(code){
 const messages={
  not_authorized:'Доступ не подтверждён. Проверь директорскую учётную запись.',
  staff_directory_unavailable:'Справочник менеджеров сейчас не отвечает.',
  manager_not_unique:'Не удалось однозначно определить менеджера. Назови фамилию ещё раз.',
  question_invalid:'Повтори вопрос, пожалуйста.',
  server_configuration_missing:'Сервер аналитики временно недоступен.'
 };
 return messages[code]||'Не получилось получить проверенные данные CRM. Повтори вопрос позднее. Ничего не изменено.';
}
window.crmAI360UnifiedDialogHandleV1=function(text,ui){
 if(!allowed())return false;
 const question=String(text||'').trim().slice(0,400);
 if(!question)return false;
 // Navigation remains a local, explicit CRM UI operation.
 if(/^(?:открой|перейди|вернись|покажи раздел)\b/i.test(question))return false;
 if(pending){ui.answer('Ещё проверяю предыдущий вопрос в CRM.');return true;}
 pending=true;window.__resantaAI360PendingV1=true;
 ui.textStatus('Подбираю проверенные источники CRM…');
 (async()=>{
  try{
   const session=typeof window.crmEnsureFreshSessionV236166==='function'
    ?await window.crmEnsureFreshSessionV236166(false)
    :await db.auth.getSession().then(x=>x?.data?.session);
   if(!session?.access_token)throw new Error('not_authorized');
   const result=await db.functions.invoke(ENDPOINT,{body:{
    message:question,history:history.slice(-10),memory
   }});
   if(result.error)throw new Error(await errorCode(result.error));
   if(!allowed())return;
   const data=result.data||{};
   const answer=String(data.answer||'').trim();
   if(!answer)throw new Error('empty_answer');
   if(data.memory&&typeof data.memory==='object')memory=data.memory;
   history.push({role:'user',content:question},{role:'assistant',content:answer});
   history=history.slice(-10);
   ui.answer(answer);
  }catch(e){if(allowed())ui.answer(pretty(String(e?.message||e)));}
  finally{pending=false;window.__resantaAI360PendingV1=false;}
 })();
 return true;
};
window.crmAI360UnifiedDialogResetV1=function(){history=[];memory={};};
document.addEventListener('visibilitychange',()=>{
 if(document.hidden) { /* Keep only in-tab conversational state; no persistent storage. */ }
});
window.addEventListener('pagehide',()=>window.crmAI360UnifiedDialogResetV1?.());
})();