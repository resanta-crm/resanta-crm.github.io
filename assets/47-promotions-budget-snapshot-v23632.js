/* RESANTA CRM v23.6.32 · PROMOTION BUDGET FACTUAL BALANCE CHECKPOINT
 * A manually saved factual budget is a CURRENT BALANCE at that moment, not a gross lifetime pool.
 * Historical movements already included in that balance must never be subtracted again.
 * No polling / no observers: patches the existing calculation and rerenders once.
 */
(function(){
'use strict';
if(window.RESANTA_PROMOTIONS_BUDGET_SNAPSHOT_V23632)return;
const VERSION='v23.6.32';
const num=v=>{const n=Number(v);return Number.isFinite(n)?n:0;};
const ts=v=>{const n=Date.parse(String(v||''));return Number.isFinite(n)?n:0;};
function list(name){try{return Array.isArray(window[name])?window[name]:(typeof eval(name)!=='undefined'&&Array.isArray(eval(name))?eval(name):[]);}catch(_){return[]}}
function auditSnapshot(b){
  const rows=list('allPromotionBudgetAudit').filter(x=>String(x.budget_id)===String(b?.id)&&['insert','update'].includes(String(x.action||'')));
  const latest=rows.sort((a,z)=>ts(z.changed_at)-ts(a.changed_at))[0];
  return ts(b?.balance_snapshot_at)||ts(latest?.changed_at)||ts(b?.updated_at)||ts(b?.created_at)||0;
}
function movementRows(b){return list('allPromotionBudgetMovements').filter(x=>String(x.budget_id)===String(b?.id));}
function promotionRows(b,excludePromotionId){return list('allPromotions').filter(p=>String(p.budget_id)===String(b?.id)&&String(p.id)!==String(excludePromotionId||''));}
function linkedExpenseAllTime(p){return list('allPromotionBudgetMovements').filter(x=>x.movement_type==='expense'&&String(x.promotion_id||'')===String(p?.id)).reduce((s,x)=>s+num(x.amount),0);}
function patchedSummary(b,excludePromotionId){
  if(!b)return{opening:0,accrued:0,adjustments:0,total:0,spent:0,reserved:0,free:0,movements:[]};
  const snap=auditSnapshot(b);
  const moves=movementRows(b);
  const post=moves.filter(x=>ts(x.created_at)>snap);
  const accrued=post.filter(x=>x.movement_type==='accrual').reduce((s,x)=>s+num(x.amount),0);
  const adjustments=post.filter(x=>x.movement_type==='adjustment').reduce((s,x)=>s+num(x.amount),0);
  const movementSpent=post.filter(x=>x.movement_type==='expense').reduce((s,x)=>s+num(x.amount),0);
  const promos=promotionRows(b,excludePromotionId);
  const legacySpent=promos.reduce((s,p)=>{
    const unlinked=Math.max(0,num(p.actual_spend)-linkedExpenseAllTime(p));
    if(!unlinked)return s;
    const changed=ts(p.updated_at)||ts(p.created_at);
    return changed>snap?s+unlinked:s;
  },0);
  const spent=movementSpent+legacySpent;
  const reserved=promos.filter(p=>['approved','in_work'].includes(String(p.status||''))).reduce((s,p)=>{
    const reservedAt=ts(p.approved_at)||ts(p.created_at);
    if(reservedAt<=snap)return s;
    return s+Math.max(0,num(p.budget_reserved)-num(p.actual_spend));
  },0);
  let opening=0;
  try{opening=typeof promoBudgetOpening==='function'?num(promoBudgetOpening(b)):num(b.opening_balance??b.budget_total);}catch(_){opening=num(b.opening_balance??b.budget_total);}
  const total=opening+accrued+adjustments;
  const free=total-spent-reserved;
  return{opening,accrued,adjustments,total,spent,reserved,free,movements:moves,snapshotAt:snap,historicalMovements:moves.filter(x=>ts(x.created_at)<=snap)};
}
function installSummary(){
  if(typeof window.promoBudgetSummary!=='function')return false;
  if(window.promoBudgetSummary.__snapshotV23632)return true;
  patchedSummary.__snapshotV23632=true;
  patchedSummary.__base=window.promoBudgetSummary;
  window.promoBudgetSummary=patchedSummary;
  try{promoBudgetSummary=patchedSummary;}catch(_){}
  return true;
}
function clarifyDetail(){
  const host=document.getElementById('promo-v2368-decision');if(!host)return;
  const box=[...host.querySelectorAll('.promo-v2368-box')].find(x=>/БЮДЖЕТ ИМЕННО ЭТОГО КЛИЕНТА/i.test(String(x.textContent||'')));
  if(!box)return;
  const cells=[...box.querySelectorAll('.promo-v2368-budget-grid>div')];
  const labels=['Фактический остаток','Расход после фиксации','Резерв после фиксации','Эта заявка','После согласования'];
  cells.forEach((c,i)=>{const span=c.querySelector('span');if(span&&labels[i])span.textContent=labels[i];});
  let note=box.querySelector('[data-budget-snapshot-note-v23632]');
  if(!note){note=document.createElement('div');note.dataset.budgetSnapshotNoteV23632='1';note.className='promo-v2368-note';note.style.marginTop='7px';box.appendChild(note);}
  note.textContent='Фактический бюджет — это остаток на дату фиксации. Старые расходы, уже учтённые в этом остатке, повторно не вычитаются.';
}
function rerender(){
  try{if(typeof renderPromotions==='function')renderPromotions();}catch(e){console.warn(VERSION+' render promotions',e);}
  try{if(typeof renderBudgetsPage==='function')renderBudgetsPage();}catch(e){console.warn(VERSION+' render budgets',e);}
  setTimeout(clarifyDetail,80);setTimeout(clarifyDetail,260);
}
function install(){
  if(!installSummary())return false;
  // v23.6.69: no autonomous full-page repaint here. The Promotions module
  // contract performs exactly one final render after the complete stack is ready.
  window.RESANTA_PROMOTIONS_BUDGET_SNAPSHOT_V23632=Object.freeze({version:VERSION,factualBalanceCheckpoint:true,noHistoricalDoubleSubtract:true,noPolling:true,noObserver:true,contractManagedRender:true});
  console.info('RESANTA promotions factual budget '+VERSION+' installed');
  return true;
}
if(!install()){let tries=0;const t=setInterval(()=>{tries++;if(install()||tries>=40)clearInterval(t);},250);}
document.addEventListener('click',e=>{if(e.target?.closest?.('[data-v2368-open],.promo-card button'))setTimeout(clarifyDetail,300);},true);
})();
