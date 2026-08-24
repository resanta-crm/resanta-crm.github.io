/* RESANTA CRM v23.6.22 · warehouse weekly-order presentation, event-driven only.
 * IMPORTANT: no MutationObserver and no polling. Heavy warehouse RPC runs only
 * when the warehouse page is explicitly opened/refreshed or cycle is changed.
 */
(function(){
'use strict';
if(window.RESANTA_WAREHOUSE_WEEKLY_V23622)return;
const $=id=>document.getElementById(id), n=v=>Number(v)||0;
function dbx(){try{return typeof db!=='undefined'?db:window.db}catch(_){return window.db}}
async function rpc(name,args={}){const d=dbx();if(!d)throw new Error('База ещё не готова');const {data,error}=await d.rpc(name,args);if(error)throw error;return data}
function money(v){return n(v).toLocaleString('ru-RU',{minimumFractionDigits:2,maximumFractionDigits:2})+' BYN'}
let busy=false,lastRun=0;
async function enhance(force=false){
 const page=$('page-warehouse-control'),root=$('wc-v23620');
 if(!page||!root||!page.classList.contains('active')||busy)return;
 const now=Date.now(); if(!force&&now-lastRun<1500)return; lastRun=now; busy=true;
 try{
   const d=await rpc('warehouse_control_get_dashboard_v1',{}); if(!d?.has_data)return;
   const cycle=n(d.order_cycle_days)||7, skip=d.truck_decision==='SKIP';
   let box=$('wc-weekly-v23621');
   if(!box){box=document.createElement('div');box.id='wc-weekly-v23621';const head=root.querySelector('.wc-head');(head?.parentNode||root).insertBefore(box,head?.nextSibling||root.firstChild)}
   box.className='wc-alert '+(skip?'green':'amber');
   box.innerHTML=skip
     ?`<b>🚚 Следующую машину можно пропустить.</b> На горизонте ${cycle} дней нет позиций для заказа.`
     :`<b>🚚 Автозаказ считается только до следующей машины — ${cycle} дней.</b> Сейчас: <b>${d.orderable_sku||0} SKU · ${n(d.recommended_order_units).toLocaleString('ru-RU')} шт. · ${money(d.recommended_order_byn)}</b>. ${n(d.current_overlimit_byn)>0?'Из-за перелимита полную машину ассортиментом не добиваем.':''}<br><span style="font-size:11px">Физический остаток — только свежий отчёт Витебска. SKU, отсутствующий в полном снимке, считается 0.</span>`;
   let ctl=$('wc-cycle-v23621');
   if(!ctl){ctl=document.createElement('div');ctl.id='wc-cycle-v23621';ctl.className='wc-card';ctl.style.marginBottom='14px';const tabs=root.querySelector('.wc-tabs');(tabs?.parentNode||root).insertBefore(ctl,tabs||null)}
   ctl.innerHTML=`<div style="display:flex;gap:10px;align-items:end;flex-wrap:wrap"><div><b>Горизонт автозаказа</b><div style="font-size:11px;color:var(--sub);margin-top:3px">Машина обычно раз в неделю. Перелимит считается отдельно по месячной норме.</div></div><div style="margin-left:auto"><label style="font-size:10px;color:var(--sub);font-weight:700">ДНЕЙ ДО СЛЕДУЮЩЕЙ МАШИНЫ</label><div style="display:flex;gap:7px;margin-top:4px"><select id="wc-cycle-select-v23621" style="padding:8px 10px;border:1px solid var(--border);border-radius:8px;background:#fff"><option value="7" ${cycle===7?'selected':''}>7</option><option value="10" ${cycle===10?'selected':''}>10</option><option value="14" ${cycle===14?'selected':''}>14</option><option value="21" ${cycle===21?'selected':''}>21</option></select><button id="wc-cycle-save-v23621" class="btn-secondary">Сохранить</button></div></div></div>`;
   $('wc-cycle-save-v23621').onclick=async()=>{const days=parseInt($('wc-cycle-select-v23621').value,10)||7;try{await rpc('warehouse_control_set_order_cycle_v1',{p_days:days});await window.crmWarehouseControlV1?.open?.(true);setTimeout(()=>enhance(true),120)}catch(e){alert('Не удалось сохранить горизонт: '+(e?.message||e))}};
   const active=root.querySelector('.wc-tab.active')?.dataset?.mode;
   if(active==='order'||active==='stockout'){const th=[...root.querySelectorAll('#wc-body th')];if(th[2])th[2].textContent=`Прогноз мес. / цель ${cycle} дн.`;const ex=$('wc-export');if(ex)ex.textContent=`⬇ Скачать автозаказ на ${cycle} дней`}
 }catch(e){console.warn('Warehouse v23.6.22 presentation:',e)}finally{busy=false}
}
function hook(){
 const api=window.crmWarehouseControlV1;if(!api||api.__weekly23622)return false;
 const orig=api.open?.bind(api);if(typeof orig!=='function')return false;
 api.open=async function(...args){const r=await orig(...args);setTimeout(()=>enhance(true),120);return r};
 api.__weekly23622=true;return true;
}
function install(){hook();const page=$('page-warehouse-control');if(page?.classList.contains('active'))setTimeout(()=>enhance(false),150)}
[300,800,1500,3000].forEach(ms=>setTimeout(install,ms));
window.addEventListener('focus',()=>{if($('page-warehouse-control')?.classList.contains('active'))enhance(false)});
window.RESANTA_WAREHOUSE_WEEKLY_V23622=Object.freeze({version:'v23.6.22',eventDriven:true,noPolling:true,noMutationObserver:true,physicalStockOnly:true,defaultOrderCycleDays:7});
})();