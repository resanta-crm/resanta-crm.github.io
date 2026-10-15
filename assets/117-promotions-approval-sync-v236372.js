/* RESANTA CRM v23.6.372 · PROMOTIONS APPROVAL SYNC
 * Reliable manager -> DF submit + lightweight cross-session approval refresh.
 * No polling: refreshes only on Promotions entry, approval-tab click, focus/visibility and decisions.
 */
(function(){
'use strict';
if(window.RESANTA_PROMOTIONS_APPROVAL_SYNC_V236372)return;
const V='v23.6.372';
let flight=null,lastAt=0,bound=false;

const safe=v=>String(v??'');
function dbc(){try{return typeof db!=='undefined'?db:window.db}catch(_){return window.db}}
function active(){return !!document.getElementById('page-promotions')?.classList.contains('active')}
function promos(){try{return Array.isArray(allPromotions)?allPromotions:(window.allPromotions||[])}catch(_){return window.allPromotions||[]}}
function putPromos(rows){
 try{allPromotions=rows}catch(_){window.allPromotions=rows}
}
function mergeRows(rows){
 const m=new Map(promos().map(x=>[safe(x?.id),x]));
 (rows||[]).forEach(x=>{if(x?.id)m.set(safe(x.id),x)});
 let a=[...m.values()];
 try{if(typeof dedupePromotionRows==='function')a=dedupePromotionRows(a)}catch(_){}
 a.sort((x,y)=>safe(y?.start_date).localeCompare(safe(x?.start_date)));
 putPromos(a);
 return a;
}
function repaint(){
 if(!active())return;
 try{renderPromotions()}catch(e){console.warn(V+' render',e)}
 try{window.RESANTA_PROMOTIONS_CONTROL_CENTER_V236203?.repaint?.()}catch(_){}
}
async function refresh(force=false){
 const d=dbc();if(!d)return false;
 if(!force&&!active())return false;
 if(flight)return flight;
 if(!force&&Date.now()-lastAt<3000)return true;
 flight=(async()=>{
   const {data,error}=await d.from('promotions').select('*').order('updated_at',{ascending:false}).limit(500);
   if(error)throw error;
   mergeRows(data||[]);
   lastAt=Date.now();
   repaint();
   return true;
 })().catch(e=>{console.warn(V+' refresh',e);return false}).finally(()=>{flight=null});
 return flight;
}
function localPromotion(id){return promos().find(x=>safe(x?.id)===safe(id))||null}
async function submitManager(id){
 const d=dbc();if(!d)throw Error('Нет подключения к базе');
 const p=localPromotion(id);if(!p)throw Error('Акция не найдена');
 try{
   if(typeof promoCanSubmitManager==='function'&&!promoCanSubmitManager(p)){
     alert('Подтвердить заявку может только назначенный менеджер.');
     return null;
   }
 }catch(_){}
 const now=new Date().toISOString();
 const patch={
   status:'pending_df',
   manager_submitted_by:(typeof currentProfile!=='undefined'&&currentProfile?.name)||p.manager_name||null,
   manager_submitted_at:now,
   budget_reserved:0,
   df_approved_by:null,df_approved_at:null,df_comment:null,
   dfs_approved_by:null,dfs_approved_at:null,dfs_comment:null,
   approved_by:null,approved_at:null,
   rejected_by:null,rejected_at:null
 };
 const {data,error}=await d.from('promotions').update(patch).eq('id',id).select('*').single();
 if(error)throw error;
 if(!data||safe(data.status)!=='pending_df'||!data.manager_submitted_at){
   throw Error('CRM не подтвердила передачу акции ДФ');
 }
 try{
   await d.from('promotion_approval_audit').insert({
     promotion_id:id,
     stage:'manager_submit',
     action:'submit_manager',
     actor:patch.manager_submitted_by,
     comment:'Передано ДФ с подтверждением записи v23.6.372'
   });
 }catch(e){console.warn(V+' audit',e)}
 mergeRows([data]);
 await refresh(true);
 try{openPromotionDetail(id)}catch(_){}
 repaint();
 return data;
}
function patchDecision(){
 const f=window.quickPromotionDecision;
 if(typeof f!=='function'||f.__approvalSyncV236372)return false;
 const base=f;
 const wrapped=async function(id,action){
   if(action==='submit_manager'){
     try{return await submitManager(id)}
     catch(e){console.error(V+' submit',e);alert('Не удалось передать акцию Сидаровичу: '+safe(e?.message||e));return null}
   }
   const r=await base.apply(this,arguments);
   if(['approve_df','approve_dfs','reject','accept'].includes(action))await refresh(true);
   return r;
 };
 wrapped.__approvalSyncV236372=true;
 wrapped.__base=base;
 window.quickPromotionDecision=wrapped;
 try{quickPromotionDecision=wrapped}catch(_){}
 return true;
}
function bind(){
 if(bound)return;bound=true;
 document.addEventListener('click',e=>{
   const v=e.target?.closest?.('[data-pcc203-view]')?.dataset?.pcc203View;
   if(v==='decision'||v==='pending')setTimeout(()=>refresh(true),0);
   const legacy=e.target?.closest?.('[data-v2368-open-action]');
   if(legacy)setTimeout(()=>refresh(true),0);
   const nav=e.target?.closest?.('.nav-item,.bn-item,[data-page]');
   if(nav){
     const page=safe(nav.dataset?.page||nav.getAttribute?.('data-page')||nav.getAttribute?.('onclick'));
     if(page.includes('promotions'))setTimeout(()=>refresh(true),180);
   }
 },true);
 window.addEventListener('focus',()=>{if(active())refresh(false)});
 document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&active())refresh(false)});
 window.addEventListener('resanta:promotions-approval-refresh',()=>refresh(true));
}
function install(){
 patchDecision();bind();
 if(active())refresh(true);
}
install();
[150,500,1200].forEach(ms=>setTimeout(install,ms));
window.RESANTA_PROMOTIONS_APPROVAL_SYNC_V236372=Object.freeze({
 version:V,refresh,submitManager,noPolling:true,verifiedSubmit:true,crossSessionRefresh:true
});
})();