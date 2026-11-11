/* Resanta Lera 360 - one shared, opt-in, read-only financial voice route.
   Existing director/branch Lera owns microphone, TTS, history and permissions.
   No polling, timers, observers, synthetic clicks or new voice windows. */
(function(root,doc){
'use strict';
if(root.crmAI360FinanceVoiceHandleV1)return;
const ENDPOINT='crm-ai360-budget-voice-v1';
let userId='',memory={},busy=false,epoch=0;
const norm=value=>String(value||'').toLocaleLowerCase('ru-RU').replace(/ё/g,'е').replace(/\s+/g,' ').trim();
function identity(){
 try{
  const id=String(currentUser?.id||'');
  const role=String(currentProfile?.role||'');
  return id&&['boss','manager'].includes(role)?{id,role}:null;
 }catch(_){return null}
}
function reset(){epoch++;busy=false;memory={};userId=''}
function financeIntent(raw){
 const q=norm(raw);
 if(!q||q.length<4)return false;
 if(/бюджет|резерв|зарезерв|перерасход|начислени.*клиент/.test(q))return true;
 if(/пдз|просроч|задолж|долг|должен/.test(q)&&
    (/клиент|у\s|его|нее|неё|он\s|она\s/.test(q)||Boolean(memory.client_id)))return true;
 if(/акци|согласовани/.test(q)&&
    (/клиент|у\s|него|нее|неё|этого|бензолен/.test(q)||Boolean(memory.client_id)))return true;
 return Boolean(memory.client_id)&&
  /^(а сколько|а какой|а какие|а у него|а у нее|а у неё|у него|у нее|у неё|его|а что с ним)/.test(q);
}
function canReply(id,ui){
 const actor=identity();
 if(!actor||actor.id!==id||doc.hidden)return false;
 if(typeof ui.authorized==='function')return !!ui.authorized();
 return doc.getElementById('app')?.style.display!=='none' &&
  !!doc.querySelector('.rva-window:not([hidden])');
}
function notify(ui,message,error=false){
 if(typeof ui.textStatus==='function')ui.textStatus(message);
 if(typeof ui.setStatus==='function')ui.setStatus(message);
 if(error){
  if(typeof ui.answer==='function')ui.answer(message,{noVoice:true});
  else ui.show?.(message,{speak:false});
 }
}
function say(ui,response){
 const answer=String(response||'');
 if(typeof ui.answer==='function'){
  ui.answer(answer,answer.length>360?{speechSummary:'Проверила данные клиента. Подробности показала в окне Леры.'}:{fullVoice:true});
 }else ui.show?.(answer);
}
root.crmAI360FinanceVoiceHandleV1=function(raw,ui){
 const actor=identity();
 if(!actor||!ui||typeof ui.answer!=='function'&&typeof ui.show!=='function')return false;
 if(userId&&userId!==actor.id)reset();
 if(!financeIntent(raw))return false;
 if(!canReply(actor.id,ui))return false;
 userId=actor.id;
 const question=String(raw||'').trim().slice(0,220);
 if(busy){notify(ui,'Лера ещё проверяет предыдущий вопрос в CRM.',true);return true}
 busy=true;const request=++epoch;
 notify(ui,'Лера проверяет бюджет, акции и последнюю ПДЗ по данным CRM…');
 void (async()=>{
  try{
   const session=typeof root.crmEnsureFreshSessionV236166==='function'
    ?await root.crmEnsureFreshSessionV236166(false)
    :await db.auth.getSession().then(x=>x?.data?.session);
   if(!session?.access_token)throw Error('auth_required');
   if(!canReply(actor.id,ui)||request!==epoch)return;
   const result=await db.functions.invoke(ENDPOINT,{body:{question,memory}});
   if(result.error||result.data?.error)throw Error('finance_unavailable');
   const data=result.data||{};
   if(data.answer_verified!==true||data.read_only!==true||
      data.source!=='promotion_budget_truth_v1'||
      !Array.isArray(data.domains_used)||!data.domains_used.includes('promotion_budgets')||
      !['network_director','branch_director','field_manager'].includes(data.role)||
      (actor.role==='manager'&&data.role!=='field_manager')||
      (actor.role==='boss'&&data.role==='field_manager')||
      typeof data.answer!=='string'||!data.answer.trim())
    throw Error('unverified_finance_data');
   if(!canReply(actor.id,ui)||request!==epoch)return;
   // Server validates client_id afresh on EVERY question, not a browser-side ACL.
   memory={client_id:String(data.memory?.client_id||'').slice(0,36),domain:'promotion_budgets'};
   notify(ui,'Проверено через CRM · только чтение');
   say(ui,data.answer);
  }catch(e){
   if(request===epoch&&canReply(actor.id,ui))
    notify(ui,'Не удалось проверить финансовые данные CRM. Ничего не изменено. Повтори вопрос позднее.',true);
  }finally{if(request===epoch)busy=false}
 })();
 return true;
};
root.crmAI360FinanceVoiceResetV1=reset;
root.addEventListener('pagehide',reset);
root.RESANTA_LERA_FINANCE_VOICE_V1=Object.freeze({version:'20261111.1',endpoint:ENDPOINT,readOnly:true,noPolling:true,noObservers:true});
})(window,document);
