/* Director-only AI360 unified natural-language bridge. No CRM writes. */
(function(){
'use strict';
if((/Android/i.test(navigator.userAgent||'')&&!(window.__resantaAI360AndroidDirectorOptIn===true&&window.Capacitor?.isNativePlatform?.()===true&&window.Capacitor?.getPlatform?.()==='android'))||window.crmAI360UnifiedDialogHandleV1)return;
const ENDPOINT='crm-ai360-agent-v1';
let history=[],memory={},pending=false,awaitingDetail=null,lastMode='',epoch=0,activeActor='';
const pilotRequested=/(?:^|[?&])leraPilot=dialogue2(?:&|$)/.test(window.location?.search||'');
window.__resantaLeraDialogueV2=pilotRequested&&window.crmAI360GreetingV1?.()?.id==='544fb1e2-ef70-44de-bc62-e0e1596a4bfc';
function allowed(){
 try{
  const p=window.crmAI360GreetingV1?.();
  return !!p&&['544fb1e2-ef70-44de-bc62-e0e1596a4bfc',
   'a24954b8-2fe1-4852-b629-d8f351e1bd36'].includes(p.id)&&
   document.getElementById('app')?.style.display!=='none';
 }catch{return false;}
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
  daily_dialog_limit:'Лимит AI-диалогов на сегодня — 300. Завтра он обновится. Распознавание голоса учитывается отдельно.',
  monthly_budget_exhausted:'Месячный бюджет AI 360° — 5 000 российских рублей — исчерпан. Данные CRM не изменены.',
  budget_limit_reached:'Достигнуто ограничение бюджета AI 360°. Новые запросы остановлены, чтобы избежать лишних расходов.',
  budget_meter_unavailable:'Сервис контроля расходов временно недоступен. Запрос остановлен безопасно — ничего не списано.',
  budget_settlement_unavailable:'Ответ получен, но не удалось подтвердить учёт расходов. Данные CRM не изменены. Попробуй позднее.',
  openai_provider_rate_limit:'OpenAI временно ограничил запросы на своей стороне. Наш дневной лимит здесь ни при чём.',
  openai_provider_timeout:'OpenAI не ответил вовремя. Попробуй повторить короткий вопрос.',
  analysis_unavailable:'Ядро AI 360° не смогло подтвердить результат. Данные CRM не изменены. Попробуй уточнить вопрос.',
  ai_quota_exhausted:'Достигнуто ограничение обращений к OpenAI. Это не лимит микрофона.',
  new_core_unavailable:'Единое ядро Леры временно недоступно. На старую аналитику не переключаюсь, чтобы не перепутать данные клиента.'
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
 history=history.slice(-12);
 return true;
};
window.crmAI360UnifiedDialogHandleV1=function(text,ui){
 if(!allowed())return false;
 const currentActor=window.crmAI360GreetingV1?.()?.id;
 if(activeActor&&activeActor!==currentActor)window.crmAI360UnifiedDialogResetV1?.();
 activeActor=currentActor;
 window.__resantaLeraDialogueV2=pilotRequested&&currentActor==='544fb1e2-ef70-44de-bc62-e0e1596a4bfc';
 const question=String(text||'').trim().slice(0,2400);
 if(!question)return false;
 if(window.crmAI360UnifiedDialogFollowupV3?.(question,ui))return true;
 // Navigation remains a local, explicit CRM UI operation.
 if(/^(?:открой|перейди|вернись|покажи раздел)(?:\s|$)/i.test(question)){
   // Explicit navigation is a subject boundary. Don't carry Rudnev into Triovist.
   const name=question.toLocaleLowerCase('ru-RU').replace(/ё/g,'е');
   const client=/триовист|тривист|21\s*век|21vek/.test(name);
   history=[];awaitingDetail=null;
   memory={manager:'',subject:client?'client':'network',
     domain:client?'triovist':''};
   return false;
 }
 if(pending){ui.answer('Лера ещё отвечает на предыдущий вопрос.');return true;}
 pending=true;const run=++epoch,actor=window.crmAI360GreetingV1?.()?.id;window.__resantaAI360PendingV1=true;
 ui.textStatus('Лера обдумывает вопрос…');
 (async()=>{
  try{
   const session=typeof window.crmEnsureFreshSessionV236166==='function'
    ?await window.crmEnsureFreshSessionV236166(false)
    :await db.auth.getSession().then(x=>x?.data?.session);
   if(!session?.access_token)throw new Error('not_authorized');
   awaitingDetail=null;
   const payload={action:'ask',question,history:history.slice(-12),memory};
   if(window.__resantaLeraDialogueV2===true)payload.protocol='lera_dialogue_v2';
   // One verified backend only. Never silently downgrade to an older AI engine.
   let result=await db.functions.invoke(ENDPOINT,{body:payload});
   // A stale browser JWT must not strand an otherwise valid conversation.
   // Retry only an explicit 401, only once, after Supabase refreshes this user's session.
   if(Number(result.error?.context?.status)===401&&typeof db.auth?.refreshSession==='function'){
     const actor=typeof currentUser!=='undefined'?currentUser?.id:null;
     const fresh=await db.auth.refreshSession();
     if(fresh.data?.session?.access_token&&actor&&currentUser?.id===actor&&allowed())
       result=await db.functions.invoke(ENDPOINT,{body:payload});
   }
   if(Number(result.error?.context?.status)===404)
     throw new Error('new_core_unavailable');
   if(result.error)throw new Error(await errorCode(result.error));
   if(result.data?.error)throw new Error(String(result.data.error));
   if(!allowed()||run!==epoch||actor!==window.crmAI360GreetingV1?.()?.id)return;
   const data=result.data||{};
   if(data.mode==='agent360_action_request_v2'){
    if(data.protocol!=='lera_dialogue_v2'||data.requires_confirmation!==true||data.created!==0||data.read_only!==true||
       !window.crmAI360ActionPrepareV2?.(data.action_question,ui))throw Error('action_prepare_unavailable');
    history.push({role:'user',content:question},{role:'assistant',content:'Подготовка предложения; действие ещё не выполнено.'});
    history=history.slice(-12);return;
   }
   const isChat=data.mode==='agent360_free_conversation_v1';
   if(isChat&&(data.answer_verified!==false||data.read_only!==true||
       data.intent!=='free_conversation'||!Array.isArray(data.domains_used)||
       data.domains_used.length>0))throw new Error('unverified_chat_response');
   const answerMode=isChat?'chat':'crm';
   // Avoid accidentally carrying a previous customer's CRM scope into
   // casual talk, or treating casual claims as verified CRM evidence.
   // One in-tab conversation spans casual talk and CRM. Only tool results are evidence.
   lastMode=answerMode;
   if(isChat){awaitingDetail=null;
     ui.textStatus('Лера · свободный разговор');}
   else ui.textStatus('Лера · ответы по разрешённым данным CRM');
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
   history=history.slice(-12);
   // Prefer one short verified voice segment for the common quick questions.
   // Full answer and offer remain readable in the CRM dialogue panel.
   const shortVoice=withOffer.length<=205?withOffer:(brief.length<=205?brief:'');
   ui.answer(withOffer,shortVoice?{speechSummary:shortVoice}:{fullVoice:true});
  }catch(e){if(allowed()&&run===epoch&&actor===window.crmAI360GreetingV1?.()?.id)ui.answer(pretty(String(e?.message||e)));}
  finally{if(run===epoch){pending=false;window.__resantaAI360PendingV1=false;}}
 })();
 return true;
};
window.crmAI360UnifiedDialogResetV1=function(){epoch++;pending=false;window.__resantaAI360PendingV1=false;history=[];memory={};awaitingDetail=null;lastMode='';};
document.addEventListener('visibilitychange',()=>{
 if(document.hidden) { /* Keep only in-tab conversational state; no persistent storage. */ }
});
window.addEventListener('pagehide',()=>window.crmAI360UnifiedDialogResetV1?.());
})();