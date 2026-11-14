/* Shared director AI360 OpenAI reasoning for Sidarovich.
   All evidence is reauthorized by staff gateway with caller JWT. No direct DB access.
   Read-only: real task creation still requires separate signed approval endpoint.
 */
(function(root){
'use strict';
// Android/WebView is blocked unless a signed-in employee explicitly activates the opt-in launcher.
if((/Android/i.test(navigator.userAgent||'')&&!root.__resantaAI360AndroidStaffOptIn)||root.crmAI360BranchUnifiedHandleV1)return;
const SID='ba55dfe5-7e48-4f1f-b40e-674c7752fe1a';
const ENDPOINT='crm-ai360-agent-v1';
let history=[],memory={},pending=false,epoch=0,lastMode='',activeActor='';
// Approved role identities use the same semantic dialogue; server rechecks access.
const allowed=()=>{
 const p=root.crmAI360StaffIdentityV1?.();
 return !!p&&['branch_director','field_manager','triovist_category'].includes(p.tier);
};
root.__resantaLeraDialogueV2=allowed();
function localMonth(q){
 const iso=String(q||'').match(/\b(20\d{2})-(0[1-9]|1[0-2])\b/);
 if(iso)return iso[1]+'-'+iso[2];
 const names=['январ','феврал','март','апрел','мая','июн','июл','август','сентябр','октябр','ноябр','декабр'];
 const norm=String(q||'').toLocaleLowerCase('ru-RU');
 const idx=names.findIndex(n=>norm.includes(n));
 if(idx<0)return null;
 const year=/\b20\d{2}\b/.exec(q);
 return (year?year[0]:new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Minsk',year:'numeric'}).format(new Date()))+'-'+String(idx+1).padStart(2,'0');
}
root.crmAI360BranchUnifiedHandleV1=function(q,ui){
 if(!allowed()||!ui?.authorized?.())return false;
 const currentActor=root.crmAI360StaffIdentityV1?.()?.id;
 if(activeActor&&activeActor!==currentActor)root.crmAI360BranchUnifiedResetV1?.();
 activeActor=currentActor;root.__resantaLeraDialogueV2=true;
 const question=String(q||'').trim().slice(0,2400);
 if(!question)return false;
 // Keep cheap, exact, server-paginated continuation in the local read-only path.
 if(root.__resantaLeraDialogueV2!==true&&memory?.domain&&/^(?:дальше|остальные|ещё|еще|продолж)/i.test(question))return false;
 if(pending){ui.show('Лера ещё отвечает на предыдущий вопрос.');return true;}
 pending=true;const run=++epoch,actor=root.crmAI360StaffIdentityV1?.()?.id;
 ui.setStatus?.('Лера обдумывает вопрос…');
 void (async()=>{
  try{
   const session=typeof root.crmEnsureFreshSessionV236166==='function'?
    await root.crmEnsureFreshSessionV236166(false):
    await db.auth.getSession().then(x=>x.data?.session);
   if(!session?.access_token)throw Error('not_authorized');
   const month=localMonth(question)||memory.month||null;
   const payload={action:'ask',question,history:history.slice(-12),memory:{...memory,month}};
   const screen=(root.RESANTA_CLIENTS_UNIFIED_V1?.active?.()?root.RESANTA_CLIENTS_UNIFIED_V1:root.RESANTA_CONTROL_CENTER_V1)?.prepareAgentRequest?.(question,memory);
   if(screen){payload.question=screen.question;payload.memory={...screen.memory,month:localMonth(question)||screen.memory.month||null};}
   if(root.__resantaLeraDialogueV2===true)payload.protocol='lera_dialogue_v2';
   let result=await db.functions.invoke(ENDPOINT,{body:payload});
   if(Number(result.error?.context?.status)===401&&typeof db.auth?.refreshSession==='function'){
     const actor=typeof currentUser!=='undefined'?currentUser?.id:null;
     const fresh=await db.auth.refreshSession();
     if(fresh.data?.session?.access_token&&actor&&currentUser?.id===actor&&allowed()&&ui.authorized())
       result=await db.functions.invoke(ENDPOINT,{body:payload});
   }
   if(result.error){
    let code='';
    try{code=String((await result.error.context?.json?.())?.error||'');}catch{}
    throw Error(code||result.error.message||'dialog_unavailable');
   }
   if(!allowed()||!ui.authorized()||run!==epoch||actor!==root.crmAI360StaffIdentityV1?.()?.id)return;
   const data=result.data;
   if(data?.protocol!=='lera_dialogue_v2')throw Error('agent_protocol_unavailable');
   const userRole=root.crmAI360StaffIdentityV1?.();
   if(data?.mode==='agent360_action_request_v2'){
    if(data.protocol!=='lera_dialogue_v2'||data.route_tier!==userRole?.tier||data.requires_confirmation!==true||data.created!==0||data.read_only!==true||
      !root.crmAI360ActionPrepareV2?.(data.action_question,ui))throw Error('action_prepare_unavailable');
    history.push({role:'user',content:question},{role:'assistant',content:'Подготовка предложения; действие ещё не выполнено.'});
    history=history.slice(-12);return;
   }
   if(data?.mode==='agent360_free_conversation_v1'){
    if(data.answer_verified!==false||data.read_only!==true||
       data.intent!=='free_conversation'||data.route_tier!==userRole?.tier||
       !Array.isArray(data.domains_used)||data.domains_used.length!==0||
       typeof data.answer!=='string'||!data.answer.trim())
      throw Error('unverified_chat_response');
    
    lastMode='chat';
    history.push({role:'user',content:question},{role:'assistant',content:data.answer.slice(0,800)});
    history=history.slice(-12);
    ui.setStatus?.('Лера · свободный разговор');
    ui.show(data.answer);
    return;
   }
   if(data?.mode!=='staff_ai360_shared_core_v1'||(data?.protocol!=='lera_dialogue_v2'&&data?.answer_verified!==true)||
    data?.read_only!==true||data?.scope!==(root.crmAI360StaffIdentityV1?.()?.tier==='triovist_category'?'Триовист / 21vek.by':'Витебск')||data?.role!==root.crmAI360StaffIdentityV1?.()?.tier||typeof data?.answer!=='string'||
    !Array.isArray(data?.domains_used))
    throw Error('unverified_branch_dialog');
   if(['field_manager','triovist_category'].includes(root.crmAI360StaffIdentityV1?.()?.tier)&&data?.subject_manager!==root.crmAI360StaffIdentityV1?.()?.name)throw Error('foreign_manager_reply');
   
   lastMode='crm';
   memory=data.memory||{};
   history.push({role:'user',content:question},{role:'assistant',content:data.answer.slice(0,800)});
   history=history.slice(-12);
   ui.setStatus?.('Проверено через CRM · '+String(data.as_of||'')+' · филиал Витебск');
   ui.show(data.answer,{speechSummary:data.speech_summary});
  }catch(e){
   if(allowed()&&ui.authorized()&&run===epoch&&actor===root.crmAI360StaffIdentityV1?.()?.id){
    ui.setStatus?.('Защищённая аналитика временно недоступна');
    ui.show('Не удалось получить проверенный ответ через общее ядро Леры ('+
      String(e?.message||'ошибка').slice(0,90)+'). Данные не придумываю.',{speak:false});
   }
  }finally{if(run===epoch)pending=false;}
 })();
 return true;
};
root.crmAI360BranchUnifiedIsPendingV1=()=>pending;
root.crmAI360BranchUnifiedResetV1=()=>{epoch++;pending=false;history=[];memory={};lastMode='';};
root.addEventListener('pagehide',()=>root.crmAI360BranchUnifiedResetV1?.());
})(window);
