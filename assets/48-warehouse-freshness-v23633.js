/* RESANTA CRM v23.6.33 · WAREHOUSE FRESHNESS GUARD
 * Root fix for misleading Refresh button:
 * - automatic sources are checked explicitly: cost 1C, Vitebsk physical stock, sales;
 * - Chekhov is marked as MANUAL and never pretends to auto-refresh;
 * - stale automatic sources are shown in red and order export is blocked;
 * - no polling / no MutationObserver / no background heavy RPC.
 */
(function(){
'use strict';
if(window.RESANTA_WAREHOUSE_FRESHNESS_V23633)return;
const VERSION='v23.6.33';
const $=id=>document.getElementById(id);
let lastFreshness=null,busy=false;
function dbx(){try{return typeof db!=='undefined'?db:window.db}catch(_){return window.db}}
async function rpc(name,args={}){const d=dbx();if(!d)throw new Error('База ещё не готова');const {data,error}=await d.rpc(name,args);if(error)throw error;return data}
function dmy(v){if(!v)return'—';const s=String(v).slice(0,10).split('-');return s.length===3?`${s[2]}.${s[1]}.${s[0]}`:String(v)}
function pill(label,date,ok,manual=false){
 const bg=manual?'#EFF6FF':ok?'#ECFDF5':'#FEF2F2';
 const bd=manual?'#BFDBFE':ok?'#A7F3D0':'#FECACA';
 const fg=manual?'#1E40AF':ok?'#166534':'#991B1B';
 const icon=manual?'📦':ok?'✅':'⚠️';
 return `<div style="padding:8px 10px;border:1px solid ${bd};background:${bg};border-radius:9px;color:${fg};font-size:11px;line-height:1.35"><b>${icon} ${label}</b><br>${dmy(date)}${manual?' · ручная загрузка':''}</div>`;
}
function ensureBox(){
 const root=$('wc-v23620');if(!root)return null;
 let box=$('wc-freshness-v23633');
 if(!box){box=document.createElement('div');box.id='wc-freshness-v23633';const head=root.querySelector('.wc-head');(head?.parentNode||root).insertBefore(box,head?.nextSibling||root.firstChild)}
 return box;
}
function decorate(f){
 if(!f)return;
 lastFreshness=f;
 const box=ensureBox();if(!box)return;
 const ok=!!f.auto_sources_fresh;
 box.style.cssText=`margin:0 0 12px;padding:12px;border:1px solid ${ok?'#A7F3D0':'#FECACA'};background:${ok?'#F0FDF4':'#FFF7F7'};border-radius:11px`;
 box.innerHTML=`<div style="display:flex;justify-content:space-between;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:9px"><div><b style="font-size:13px">${ok?'✅ Данные для расчёта свежие':'⚠️ Не все автоматические данные свежие'}</b><div style="font-size:10px;color:var(--sub);margin-top:2px">Заказ разрешён только когда себестоимость, Витебск и продажи загружены за сегодня. Чехов обновляется вами вручную.</div></div><div style="font-size:10px;color:var(--sub)">Сегодня: ${dmy(f.today)}</div></div><div style="display:grid;grid-template-columns:repeat(4,minmax(145px,1fr));gap:7px">${pill('Себестоимость 1С',f.cost_date,!!f.cost_fresh)}${pill('Остаток Витебск',f.vitebsk_stock_date,!!f.vitebsk_stock_fresh)}${pill('Продажи',f.sales_date,!!f.sales_fresh)}${pill('Чехов',f.chekhov_date,true,true)}</div>`;
 const refresh=$('wc-refresh');
 if(refresh){refresh.textContent='↻ Обновить расчёт';refresh.title='Перечитать уже загруженные данные и проверить свежесть источников';}
 applyOrderGuard();
}
function applyOrderGuard(){
 const ex=$('wc-export');if(!ex)return;
 const ok=!!lastFreshness?.auto_sources_fresh;
 if(ok){ex.disabled=false;ex.style.opacity='';ex.title='';return;}
 ex.disabled=true;ex.style.opacity='.45';ex.title='Сначала дождитесь свежих автоматических данных 1С и Витебска за сегодня';
}
async function checkFreshness(){
 try{const f=await rpc('warehouse_control_get_freshness_v1',{});decorate(f);return f}catch(e){console.warn('Warehouse freshness '+VERSION,e);return null}
}
async function manualRefresh(){
 if(busy)return;busy=true;
 const btn=$('wc-refresh');if(btn){btn.disabled=true;btn.textContent='⏳ Обновляю расчёт…'}
 try{
   const api=window.crmWarehouseControlV1;
   if(api&&typeof api.__freshnessOriginalOpen==='function')await api.__freshnessOriginalOpen(true);
   else if(api&&typeof api.open==='function'&&!api.open.__freshnessWrapped)await api.open(true);
   await checkFreshness();
 }catch(e){alert('Не удалось обновить расчёт: '+(e?.message||e))}
 finally{busy=false;const b=$('wc-refresh');if(b){b.disabled=false;b.textContent='↻ Обновить расчёт';bindRefresh()}}
}
function bindRefresh(){const b=$('wc-refresh');if(b&&!b.dataset.freshnessV23633){b.dataset.freshnessV23633='1';b.onclick=manualRefresh}}
function hook(){
 const api=window.crmWarehouseControlV1;if(!api)return false;
 if(!api.__freshnessV23633){
   const origOpen=typeof api.open==='function'?api.open.bind(api):null;
   const origSwitch=typeof api.switchMode==='function'?api.switchMode.bind(api):null;
   if(origOpen){api.__freshnessOriginalOpen=origOpen;const w=async function(...args){const r=await origOpen(...args);bindRefresh();setTimeout(checkFreshness,30);return r};w.__freshnessWrapped=true;api.open=w;}
   if(origSwitch){api.switchMode=async function(...args){const r=await origSwitch(...args);setTimeout(()=>{bindRefresh();applyOrderGuard()},20);return r};}
   api.__freshnessV23633=true;
 }
 bindRefresh();
 if($('page-warehouse-control')?.classList.contains('active'))setTimeout(checkFreshness,60);
 return true;
}
function install(){hook()}
install();[250,700,1400,2600,5000].forEach(ms=>setTimeout(install,ms));
window.RESANTA_WAREHOUSE_FRESHNESS_V23633=Object.freeze({version:VERSION,noPolling:true,noMutationObserver:true,chekhovManual:true,blocksStaleOrder:true});
console.info('RESANTA warehouse freshness '+VERSION+' installed');
})();
