/* Director-only AI360 unified natural-language bridge. No CRM writes. */
(function(){
'use strict';
if(/Android/i.test(navigator.userAgent||'')||window.crmAI360UnifiedDialogHandleV1)return;
const ENDPOINT='crm-ai360-dialog-v4';
let history=[],memory={},pending=false,awaitingDetail=null,pilotFallback=false;
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
  server_configuration_missing:'Сервер аналитики временно недоступен.',
  pilot_fallback:'Новое ядро временно недоступно. Переключилась на стабильную Леру. Повтори вопрос, пожалуйста.'
 };
 return messages[code]||'Не получилось получить проверенные данные CRM. Повтори вопрос позднее. Ничего не изменено.';
}
function followupKind(input){
 const q=String(input||'').toLocaleLowerCase('ru-RU').replace(/ё/g,'е').replace(/[.,!?;:]/g,' ').replace(/\s+/g,' ').trim();
 if(/^(да|давай|да давай|да хочу|конечно|конечно расскажи|да конечно|хорошо|угу|ага|расскажи|расскажи подробнее|подробнее|поподробнее|да расскажи|давай подробнее|давай подробно|прочитай полностью|полностью|читай полностью|озвучь|озвучь подробнее|продолжай|хочу подробнее)$/.test(q))return 'yes';
 if(/^(нет|не надо|не нужно|не сейчас|спасибо не надо|пока не надо|достаточно|это все|это все спасибо)$/.test(q))return 'no';
 if(/^(покажи на экране|покажи подробнее на экране|хочу на экране|полный отчет на экране|покажи весь отчет|на экран)$/.test(q))return 'screen';
 return '';
}
window.crmAI360UnifiedDialogFollowupV3=function(input,ui){
 if(!allowed()||pending||!awaitingDetail)return false;
 if(Date.now()-awaitingDetail.at>240000){awaitingDetail=null;return false;}
 const kind=followupKind(input);
 if(!kind)return false;
 const item=awaitingDetail;awaitingDetail=null;
 if(kind==='no'){ui.answer('Хорошо. Что ещё проверить в CRM?');return true;}
 if(kind==='screen')ui.answer(item.detail,{noVoice:true});
 else ui.answer(item.detail,{fullVoice:true});
 history.push({role:'user',content:String(input).slice(0,100)},
  {role:'assistant',content:item.detail.slice(0,350)});
 history=history.slice(-10);
 return true;
};
window.crmAI360UnifiedDialogHandleV1=function(text,ui){
 if(!allowed())return false;
 const question=String(text||'').trim().slice(0,400);
 if(!question)return false;
 if(window.crmAI360UnifiedDialogFollowupV3?.(question,ui))return true;
 // Navigation remains a local, explicit CRM UI operation.
 if(/^(?:открой|перейди|вернись|покажи раздел)(?:\s|$)/i.test(question))return false;
 if(pending){ui.answer('Ещё проверяю предыдущий вопрос в CRM.');return true;}
 pending=true;window.__resantaAI360PendingV1=true;
 ui.textStatus('Подбираю проверенные источники CRM…');
 (async()=>{
  try{
   const session=typeof window.crmEnsureFreshSessionV236166==='function'
    ?await window.crmEnsureFreshSessionV236166(false)
    :await db.auth.getSession().then(x=>x?.data?.session);
   if(!session?.access_token)throw new Error('not_authorized');
   awaitingDetail=null;
   const payload={message:question,history:history.slice(-10),memory};
   const usingPilot=!pilotFallback;
   let result=await db.functions.invoke(usingPilot?ENDPOINT:'crm-ai360-dialog-v3',{body:payload});
   // Only unknown endpoint is retried with stable v1; never double a failed
   // database request during a service slowdown or authentication error.
   if(result.error && Number(result.error?.context?.status)===404)
     result=await db.functions.invoke('crm-ai360-dialog-v3',{body:payload});
   if(usingPilot&&(result.error||result.data?.error)){
     const issue=result.error?await errorCode(result.error):String(result.data.error);
     if(!/not_authorized|ai_quota_exhausted|question_invalid/.test(issue)&&
        ![400,401,403,429].includes(Number(result.error?.context?.status))){
       pilotFallback=true;
       throw new Error('pilot_fallback');
     }
   }
   if(result.error)throw new Error(await errorCode(result.error));
   if(result.data?.error)throw new Error(String(result.data.error));
   if(!allowed())return;
   const data=result.data||{};
   const brief=String(data.brief||data.answer||'').trim();
   const detail=String(data.detail||'').trim();
   const offer=String(data.followup_question||'').trim();
   if(!brief)throw new Error('empty_answer');
   const withOffer=detail && detail!==brief && offer &&
      !/хочешь|хотите|рассказать подробнее|разберём подробнее/i.test(brief.slice(-180))
       ?brief+' '+offer:brief;
   if(detail&&detail!==brief)awaitingDetail={detail,at:Date.now()};
   if(data.memory&&typeof data.memory==='object')memory=data.memory;
   history.push({role:'user',content:question},{role:'assistant',content:withOffer});
   history=history.slice(-10);
   ui.answer(withOffer,{fullVoice:true});
  }catch(e){if(allowed())ui.answer(pretty(String(e?.message||e)));}
  finally{pending=false;window.__resantaAI360PendingV1=false;}
 })();
 return true;
};
window.crmAI360UnifiedDialogResetV1=function(){history=[];memory={};awaitingDetail=null;};
document.addEventListener('visibilitychange',()=>{
 if(document.hidden) { /* Keep only in-tab conversational state; no persistent storage. */ }
});
window.addEventListener('pagehide',()=>window.crmAI360UnifiedDialogResetV1?.());
})();