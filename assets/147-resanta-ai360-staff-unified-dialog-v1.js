/* Shared director AI360 OpenAI reasoning for Sidarovich.
   All evidence is reauthorized by staff gateway with caller JWT. No direct DB access.
   Read-only: real task creation still requires separate signed approval endpoint.
 */
(function(root){
'use strict';
// Android/WebView is blocked unless a signed-in employee explicitly activates the opt-in launcher.
if((/Android/i.test(navigator.userAgent||'')&&!root.__resantaAI360AndroidStaffOptIn)||root.crmAI360BranchUnifiedHandleV1)return;
const SID='ba55dfe5-7e48-4f1f-b40e-674c7752fe1a';
const ENDPOINT='crm-ai360-staff-dialog-v1';
let history=[],memory={},pending=false,epoch=0;
const allowed=()=>{
 const p=root.crmAI360StaffIdentityV1?.();
 return !!p&&['branch_director','field_manager','triovist_category'].includes(p.tier);
};
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
 const question=String(q||'').trim().slice(0,350);
 if(!question)return false;
 // Keep cheap, exact, server-paginated continuation in the local read-only path.
 if(/^(?:дальше|остальные|ещё|еще|продолж)/i.test(question))return false;
 if(pending){ui.show('Лера ещё проверяет предыдущий вопрос в CRM.');return true;}
 pending=true;const run=++epoch;
 ui.setStatus?.('Лера сопоставляет подтверждённые данные филиала через OpenAI…');
 void (async()=>{
  try{
   const session=typeof root.crmEnsureFreshSessionV236166==='function'?
    await root.crmEnsureFreshSessionV236166(false):
    await db.auth.getSession().then(x=>x.data?.session);
   if(!session?.access_token)throw Error('not_authorized');
   const month=localMonth(question)||memory.month||null;
   const result=await db.functions.invoke(ENDPOINT,{
    body:{question,month,history:history.slice(-6),memory}
   });
   if(result.error){
    let code='';
    try{code=String((await result.error.context?.json?.())?.error||'');}catch{}
    throw Error(code||result.error.message||'dialog_unavailable');
   }
   if(!allowed()||!ui.authorized()||run!==epoch)return;
   const data=result.data;
   if(data?.mode!=='staff_ai360_shared_core_v1'||data?.answer_verified!==true||
    data?.read_only!==true||data?.scope!==(root.crmAI360StaffIdentityV1?.()?.tier==='triovist_category'?'Триовист / 21vek.by':'Витебск')||data?.role!==root.crmAI360StaffIdentityV1?.()?.tier||typeof data?.answer!=='string'||
    !Array.isArray(data?.domains_used))
    throw Error('unverified_branch_dialog');
   if(['field_manager','triovist_category'].includes(root.crmAI360StaffIdentityV1?.()?.tier)&&data?.subject_manager!==root.crmAI360StaffIdentityV1?.()?.name)throw Error('foreign_manager_reply');
   memory=data.memory||{};
   history.push({role:'user',content:question},{role:'assistant',content:data.answer.slice(0,320)});
   history=history.slice(-6);
   ui.setStatus?.('Проверено через CRM · '+String(data.as_of||'')+' · филиал Витебск');
   ui.show(data.answer);
  }catch(e){
   if(allowed()&&ui.authorized()&&run===epoch){
    ui.setStatus?.('Защищённая аналитика временно недоступна');
    ui.show('Не удалось получить проверенный ответ через общее ядро Леры ('+
      String(e?.message||'ошибка').slice(0,90)+'). Данные не придумываю.',{speak:false});
   }
  }finally{if(run===epoch)pending=false;}
 })();
 return true;
};
root.crmAI360BranchUnifiedResetV1=()=>{epoch++;pending=false;history=[];memory={};};
root.addEventListener('pagehide',()=>root.crmAI360BranchUnifiedResetV1?.());
})(window);
