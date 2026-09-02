/* RESANTA CRM v23.6.41 · WAREHOUSE STOCK TRUTH BANNER
 * Shows exact Vitebsk stock snapshot time and how many cost SKUs are absent from it.
 * Missing SKU never means zero: such rows are excluded server-side from auto-order/deficit/excess.
 * No polling, no MutationObserver.
 */
(function(){
'use strict';
if(window.RESANTA_WAREHOUSE_STOCK_TRUTH_V23641)return;
const V='v23.6.41',$=id=>document.getElementById(id);
function dbx(){try{return typeof db!=='undefined'?db:window.db}catch(_){return window.db}}
function fmtTs(v){if(!v)return'—';try{return new Date(v).toLocaleString('ru-RU',{timeZone:'Europe/Minsk',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'})}catch(_){return String(v)}}
async function load(){const host=$('wc-v23620');if(!host)return;let box=$('wc-stock-truth-v23641');if(!box){box=document.createElement('div');box.id='wc-stock-truth-v23641';box.style.cssText='margin:0 0 12px;padding:10px 12px;border:1px solid #BFDBFE;background:#EFF6FF;border-radius:10px;font-size:11px;line-height:1.45';const body=$('wc-body');(body?.parentNode||host).insertBefore(box,body||host.firstChild)}box.innerHTML='Проверяю фактический остаток Витебска…';try{const d=dbx();const [fresh,meta]=await Promise.all([d.rpc('warehouse_control_get_freshness_v1',{}),d.rpc('warehouse_control_stock_truth_v23641',{})]);if(fresh.error)throw fresh.error;if(meta.error)throw meta.error;const f=fresh.data||{},m=meta.data||{};const miss=Number(m.missing_sku)||0;box.innerHTML=`<b>📦 Остаток Витебск:</b> ${fmtTs(f.vitebsk_stock_loaded_at)} · файл на ${String(f.vitebsk_stock_date||'—')}<br><span style="color:${miss?'#92400E':'#166534'}">${miss?`⚠️ ${miss} SKU отсутствуют в последнем файле остатков — они считаются «нет данных» и исключены из автозаказа, дефицита и перелимита.`:'✅ Все SKU расчёта найдены в файле остатков.'}</span>`}catch(e){box.innerHTML='<b>⚠️ Не удалось проверить источник остатка Витебска.</b>'}}
function install(){const host=$('wc-v23620');if(!host)return false;if(host.dataset.stockTruthV23641)return true;host.dataset.stockTruthV23641='1';load();const r=$('wc-refresh');if(r&&!r.dataset.stockTruthHook){r.dataset.stockTruthHook='1';r.addEventListener('click',()=>setTimeout(load,1200));}return true}
install();[300,900,1800,3500].forEach(ms=>setTimeout(install,ms));
window.RESANTA_WAREHOUSE_STOCK_TRUTH_V23641=Object.freeze({version:V,noPolling:true,missingIsUnknown:true,autoOrderGuard:true});
})();
