/* RESANTA CRM v23.6.31 · DFS OVER-BUDGET CONFIRMATION
 * Restores the intended director flow: Alexander Payushin may explicitly approve
 * a promotion above the client's currently free budget after a clear confirmation.
 * Budget arithmetic remains server-authoritative and client-specific.
 */
(function(){
'use strict';
if(window.RESANTA_PROMOTIONS_BUDGET_DFS_OVERRIDE_V23631)return;
const VERSION='v23.6.31';
const num=v=>{const n=Number(v);return Number.isFinite(n)?n:0;};
const money=v=>num(v).toLocaleString('ru-RU',{minimumFractionDigits:0,maximumFractionDigits:2})+' BYN';
function rows(){try{return Array.isArray(allPromotions)?allPromotions:[]}catch(_){return[]}}
function findPromotion(id){return rows().find(x=>String(x.id)===String(id))||null;}
async function snap(id){
  const {data,error}=await db.rpc('crm_promotion_budget_snapshot_v23630',{p_promotion_id:String(id)});
  if(error)throw error;
  return data&&typeof data==='object'?data:null;
}
async function refreshLocal(id){
  const {data,error}=await db.from('promotions').select('*').eq('id',id).single();
  if(error)throw error;
  try{allPromotions=allPromotions.map(x=>String(x.id)===String(id)?data:x);}catch(_){}
  return data;
}
function lock(id,on){
  [...document.querySelectorAll('button')].forEach(b=>{
    const d=String(b.dataset?.v2368Id||'');
    const oc=String(b.getAttribute('onclick')||'');
    const hit=(d===String(id)&&b.dataset?.v2368Action==='approve_dfs')||(oc.includes(String(id))&&oc.includes('approve_dfs'));
    if(!hit)return;
    if(on){b.dataset.v23631Text=b.textContent;b.disabled=true;b.textContent='⏳ Проверяю бюджет…';}
    else{b.disabled=false;if(b.dataset.v23631Text)b.textContent=b.dataset.v23631Text;delete b.dataset.v23631Text;}
  });
}
function install(){
  const base=window.quickPromotionDecision;
  if(typeof base!=='function')return false;
  if(base.__promoBudgetDfsOverrideV23631)return true;
  const wrapped=async function(id,action){
    if(action!=='approve_dfs')return base.apply(this,arguments);
    const p=findPromotion(id);if(!p)return;
    try{if(typeof promoCanFinalApprove==='function'&&!promoCanFinalApprove(p)){alert('Финальное согласование может выполнить только ДФС Александр Паюшин после согласования ДФ.');return;}}catch(_){}
    lock(id,true);
    try{
      const s=await snap(id);
      if(!s?.has_budget){alert('У клиента '+(p.client_name||'—')+' бюджет не заведён. Согласовать за счёт другого клиента нельзя.');return;}
      const shortage=num(s.shortage);
      let allowOver=false;
      if(shortage>0){
        allowOver=confirm(
          'Бюджет клиента '+(p.client_name||'—')+' сейчас превышен.\n\n'
          +'Свободно: '+money(s.free)+'\n'
          +'Для акции требуется: '+money(s.requested)+'\n'
          +'Превышение: '+money(shortage)+'\n\n'
          +'Всё равно финально согласовать?\nПосле согласования свободный бюджет станет '+money(s.after_approval)+'.'
        );
        if(!allowOver)return;
      }
      const comment=prompt('Комментарий ДФС к финальному согласованию (можно оставить пустым):')||'';
      const {data,error}=await db.rpc('crm_promotion_final_approve_v23631',{
        p_promotion_id:String(id),
        p_comment:comment,
        p_allow_over_budget:allowOver
      });
      if(error)throw error;
      await refreshLocal(id);
      try{if(typeof renderPromotions==='function')renderPromotions();}catch(_){}
      try{if(typeof openPromotionDetail==='function')openPromotionDetail(id);}catch(_){}
      return data;
    }catch(e){alert(e?.message||String(e));}
    finally{lock(id,false);}
  };
  wrapped.__promoBudgetDfsOverrideV23631=true;
  wrapped.__base=base;
  window.quickPromotionDecision=wrapped;
  try{quickPromotionDecision=wrapped;}catch(_){}
  window.RESANTA_PROMOTIONS_BUDGET_DFS_OVERRIDE_V23631=Object.freeze({version:VERSION,dfsExplicitOverBudget:true,serverAtomic:true,clientBudgetOnly:true});
  console.info('RESANTA promotions budget DFS override '+VERSION+' installed');
  return true;
}
if(!install()){let tries=0;const t=setInterval(()=>{tries++;if(install()||tries>=40)clearInterval(t);},250);}
})();
