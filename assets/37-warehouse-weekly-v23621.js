/* RESANTA CRM v23.6.21 · warehouse weekly-order presentation fix.
 * Business truth lives in warehouse_control_* RPCs v3/v2.
 * This layer only explains and controls the 7-day order horizon on the existing warehouse page.
 */
(function(){
'use strict';
if(window.RESANTA_WAREHOUSE_WEEKLY_V23621)return;
const $=id=>document.getElementById(id), n=v=>Number(v)||0;
function dbx(){try{return typeof db!=='undefined'?db:window.db}catch(_){return window.db}}
async function rpc(name,args={}){const d=dbx();if(!d)throw new Error('База ещё не готова');const {data,error}=await d.rpc(name,args);if(error)throw error;return data}
function money(v){return n(v).toLocaleString('ru-RU',{minimumFractionDigits:2,maximumFractionDigits:2})+' BYN'}
let busy=false,timer=null;
async function enhance(){
 const root=$('wc-v23620'); if(!root||busy)return; busy=true;
 try{
   const d=await rpc('warehouse_control_get_dashboard_v1',{}); if(!d?.has_data)return;
   const cycle=n(d.order_cycle_days)||7;
   let box=$('wc-weekly-v23621');
   if(!box){box=document.createElement('div');box.id='wc-weekly-v23621';const head=root.querySelector('.wc-head');(head?.parentNode||root).insertBefore(box,head?.nextSibling||root.firstChild)}
   const skip=d.truck_decision==='SKIP';
   box.className='wc-alert '+(skip?'green':'amber');
   box.innerHTML=skip
     ?`<b>🚚 Следующую машину можно пропустить.</b> На горизонте ${cycle} дней нет позиций для заказа.`
     :`<b>🚚 Автозаказ считается только до следующей машины — ${cycle} дней.</b> Сейчас: <b>${d.orderable_sku||0} SKU · ${n(d.recommended_order_units).toLocaleString('ru-RU')} шт. · ${money(d.recommended_order_byn)}</b>. ${n(d.current_overlimit_byn)>0?'Из-за перелимита полную машину ассортиментом не добиваем.':''}<br><span style="font-size:11px">Физический остаток — только свежий отчёт Витебска. SKU, отсутствующий в полном снимке, считается 0. Исправлено ложных подстановок из себестоимости: ${d.false_cost_fallback_fixed_sku||0} SKU.</span>`;
   let ctl=$('wc-cycle-v23621');
   if(!ctl){
     ctl=document.createElement('div');ctl.id='wc-cycle-v23621';ctl.className='wc-card';ctl.style.marginBottom='14px';
     const tabs=root.querySelector('.wc-tabs');(tabs?.parentNode||root).insertBefore(ctl,tabs||null);
   }
   ctl.innerHTML=`<div style="display:flex;gap:10px;align-items:end;flex-wrap:wrap"><div><b>Горизонт автозаказа</b><div style="font-size:11px;color:var(--sub);margin-top:3px">Машина обычно раз в неделю. Перелимит считается отдельно по месячной норме.</div></div><div style="margin-left:auto"><label style="font-size:10px;color:var(--sub);font-weight:700">ДНЕЙ ДО СЛЕДУЮЩЕЙ МАШИНЫ</label><div style="display:flex;gap:7px;margin-top:4px"><select id="wc-cycle-select-v23621" style="padding:8px 10px;border:1px solid var(--border);border-radius:8px;background:#fff"><option value="7" ${cycle===7?'selected':''}>7</option><option value="10" ${cycle===10?'selected':''}>10</option><option value="14" ${cycle===14?'selected':''}>14</option><option value="21" ${cycle===21?'selected':''}>21</option></select><button id="wc-cycle-save-v23621" class="btn-secondary">Сохранить</button></div></div></div>`;
   $('wc-cycle-save-v23621').onclick=async()=>{const days=parseInt($('wc-cycle-select-v23621').value,10)||7;try{await rpc('warehouse_control_set_order_cycle_v1',{p_days:days});window.crmWarehouseControlV1?.open?.(true)}catch(e){alert('Не удалось сохранить горизонт: '+(e?.message||e))}};
   const active=root.querySelector('.wc-tab.active')?.dataset?.mode;
   if(active==='order'||active==='stockout'){
     const th=[...root.querySelectorAll('#wc-body th')];
     if(th[2])th[2].textContent=`Прогноз мес. / цель ${cycle} дн.`;
     const ex=$('wc-export');if(ex)ex.textContent=`⬇ Скачать автозаказ на ${cycle} дней`;
   }
 }catch(e){console.warn('Warehouse v23.6.21 presentation:',e)}finally{busy=false}
}
function schedule(){clearTimeout(timer);timer=setTimeout(enhance,80)}
function install(){
 const page=$('page-warehouse-control');if(!page)return;
 schedule();
 if(!page.__wc23621obs){const o=new MutationObserver(schedule);o.observe(page,{childList:true,subtree:true});page.__wc23621obs=o}
}
[300,800,1500,3000,6000].forEach(ms=>setTimeout(install,ms));
window.addEventListener('focus',install);
window.RESANTA_WAREHOUSE_WEEKLY_V23621=Object.freeze({version:'v23.6.21',physicalStockOnly:true,absentSkuMeansZero:true,defaultOrderCycleDays:7,overlimitSeparateFromOrder:true});
})();
