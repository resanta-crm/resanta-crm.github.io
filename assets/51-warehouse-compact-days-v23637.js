/* RESANTA CRM v23.6.39 · WAREHOUSE STABLE FORECAST + EXCESS ACTIONS
 * Server is the source of truth for demand/overlimit/order calculations.
 * UI keeps a fixed 14-day replenishment horizon visible in every warehouse tab.
 * Excess becomes an actionable sell-through list with Excel export.
 * No polling, no MutationObserver.
 */
(function(){
'use strict';
if(window.RESANTA_WAREHOUSE_COMPACT_V23637)return;
const V='v23.6.39';
const FIXED_HORIZON=14;
let mode='overview',offset=0,limit=100,search='';
const $=id=>document.getElementById(id);
const n=v=>Number(v)||0;
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const qty=v=>n(v).toLocaleString('ru-RU',{maximumFractionDigits:2});
const money=(v,cur='BYN')=>n(v).toLocaleString('ru-RU',{minimumFractionDigits:2,maximumFractionDigits:2})+' '+cur;
function dbx(){try{return typeof db!=='undefined'?db:window.db}catch(_){return window.db}}
async function rpc(name,args={}){const d=dbx();if(!d)throw new Error('База ещё не готова');const {data,error}=await d.rpc(name,args);if(error)throw error;return data}
function ensureCss(){
 if($('warehouse-compact-v23637-css'))return;
 const s=document.createElement('style');s.id='warehouse-compact-v23637-css';s.textContent=`
#wc-v23620 .wc-fixed-horizon{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;padding:12px 16px;margin:0 0 12px;background:#F8FAFC;border:1px solid var(--border);border-radius:12px}
#wc-v23620 .wc-fixed-horizon b{font-size:14px}#wc-v23620 .wc-fixed-horizon .wc-lock{padding:6px 10px;border-radius:999px;background:#EFF6FF;border:1px solid #BFDBFE;color:#1E40AF;font-size:11px;font-weight:800;white-space:nowrap}
#wc-v23620 .wc-table-wrap{overflow:auto;max-width:100%}
#wc-v23620 .wc-compact{width:100%;min-width:0!important;table-layout:fixed;border-collapse:separate;border-spacing:0}
#wc-v23620 .wc-compact th,#wc-v23620 .wc-compact td{padding:9px 8px;font-size:11px;overflow:hidden;text-overflow:ellipsis;vertical-align:top}
#wc-v23620 .wc-compact th{position:sticky;top:0;z-index:5;background:#F8FAFC}
#wc-v23620 .wc-compact th:first-child,#wc-v23620 .wc-compact td:first-child{position:sticky;left:0;z-index:4;background:#fff;box-shadow:1px 0 0 var(--border)}
#wc-v23620 .wc-compact th:first-child{z-index:7;background:#F8FAFC}
#wc-v23620 .wc-sku{white-space:normal;line-height:1.3}.wc-sku b{display:block;font-size:12px}.wc-sku div{margin-top:2px}
#wc-v23620 .wc-days{font-weight:800;white-space:nowrap}.wc-days.bad{color:#B91C1C}.wc-days.warn{color:#B45309}.wc-days.good{color:#166534}
#wc-v23620 .wc-mini{font-size:9px;color:var(--sub);margin-top:3px;line-height:1.35;white-space:normal}
#wc-v23620 .wc-horizon{display:inline-flex;align-items:center;padding:4px 8px;border-radius:999px;background:#EFF6FF;border:1px solid #BFDBFE;color:#1E40AF;font-size:10px;font-weight:800;white-space:nowrap}
#wc-v23620 .wc-sev{display:inline-flex;padding:3px 7px;border-radius:999px;font-size:9px;font-weight:800;margin-bottom:4px}.wc-sev.critical{background:#FEE2E2;color:#991B1B}.wc-sev.high{background:#FFEDD5;color:#9A3412}.wc-sev.medium{background:#FEF3C7;color:#92400E}
#wc-v23620 .wc-action{white-space:normal;line-height:1.35;font-weight:650;color:#9A3412}
#wc-v23620 .wc-compact .c-sku{width:37%}.wc-compact .c-vb{width:7%}.wc-compact .c-days{width:9%}.wc-compact .c-need{width:9%}.wc-compact .c-ch{width:8%}.wc-compact .c-box{width:6%}.wc-compact .c-order{width:9%}.wc-compact .c-cost{width:15%}
#wc-v23620 .wc-excess .c-sku{width:29%}.wc-excess .c-stock{width:7%}.wc-excess .c-days{width:10%}.wc-excess .c-excess{width:8%}.wc-excess .c-value{width:13%}.wc-excess .c-demand{width:13%}.wc-excess .c-action{width:20%}
@media(max-width:1050px){#wc-v23620 .wc-compact{min-width:900px!important}#wc-v23620 .wc-compact .c-sku{width:320px}#wc-v23620 .wc-excess{min-width:1050px!important}}
`;document.head.appendChild(s)
}
function ensureFixedHorizon(){
 const host=$('wc-v23620');if(!host)return;
 let bar=$('wc-fixed-horizon-v23639');if(bar)return;
 bar=document.createElement('div');bar.id='wc-fixed-horizon-v23639';bar.className='wc-fixed-horizon';
 bar.innerHTML='<div><b>Горизонт автозаказа</b><div class="wc-mini" style="font-size:10px;margin-top:3px">Пополнение считается до следующей машины. Перелимит считается отдельно по месячной норме склада.</div></div><span class="wc-lock">🔒 14 дней · закреплено</span>';
 const body=$('wc-body');const tabs=host.querySelector('.wc-tabs,[role="tablist"]');
 if(tabs)host.insertBefore(bar,tabs);else if(body)host.insertBefore(bar,body);else host.prepend(bar);
}
function horizonOf(r,data){const x=Number(r?.order_cycle_days??data?.order_cycle_days??FIXED_HORIZON);return Number.isFinite(x)&&x>0?x:FIXED_HORIZON}
function daysCell(r,data,kind='order'){
 const d=r.days_cover;const target=kind==='excess'?Number(r.norm_days||0):horizonOf(r,data);
 const label=kind==='excess'?(target>0?'норма склада '+qty(target)+' дн.':'месячная норма'):'цель '+target+' дн.';
 if(d===null||d===undefined||!Number.isFinite(Number(d)))return `<span class="wc-days">—</span><div class="wc-mini">${label}</div>`;
 const x=Math.max(0,Number(d));const cls=kind==='excess'?(target&&x>target*1.5?'bad':target&&x>target?'warn':'good'):(x<=3?'bad':x<=7?'warn':'good');
 return `<span class="wc-days ${cls}">${x.toLocaleString('ru-RU',{maximumFractionDigits:1})} дн.</span><div class="wc-mini">${label}</div>`
}
function title(){return mode==='excess'?'Перелимит · товары на слив':mode==='stockout'?'Нет товара / критический дефицит':mode==='order'?'Автозаказ на Чехов':'Все SKU'}
async function load(){
 ensureFixedHorizon();const root=$('wc-body');if(!root||mode==='overview')return;
 root.innerHTML='<div class="card">Загрузка списка…</div>';
 try{const data=await rpc('warehouse_control_get_items_v1',{p_mode:mode,p_search:search,p_limit:limit,p_offset:offset});render(data)}
 catch(e){const live=$('wc-body');if(live)live.innerHTML='<div class="wc-alert red"><b>Не удалось загрузить список.</b><br>'+esc(e?.message||e)+'</div>'}
}
function demandMini(r){return `<div class="wc-mini">прогноз ${qty(r.forecast_qty)} · 3 мес. ${qty(r.avg3_qty)} · прошлый год ${qty(r.ly_qty)}</div><div class="wc-mini">${esc(r.forecast_source||'')}</div>`}
function render(data){
 ensureFixedHorizon();const root=$('wc-body');if(!root)return;
 const rows=Array.isArray(data?.rows)?data.rows:[],total=Number(data?.total)||0,horizon=Number(data?.order_cycle_days)||FIXED_HORIZON;
 let head='',body='',tableClass='wc-compact';
 if(mode==='order'||mode==='stockout'){
  head='<th class="c-sku">SKU / товар</th><th class="c-vb">Витебск</th><th class="c-days">Дней</th><th class="c-need">Нужно</th><th class="c-ch">Чехов</th><th class="c-box">Упак.</th><th class="c-order">Автозаказ</th><th class="c-cost">Стоимость</th>';
  body=rows.map(r=>`<tr><td class="wc-sku"><b>${esc(r.sku)}</b><div>${esc(r.product||'')}</div></td><td class="${n(r.vitebsk_avail)<=0?'wc-bad':''}">${qty(r.vitebsk_avail??r.closing_qty)}</td><td>${daysCell(r,data,'order')}</td><td class="wc-warn"><b>${qty(r.need_qty)}</b>${demandMini(r)}<div class="wc-mini">цель 14 дней: ${qty(r.target_qty)} шт.</div></td><td>${qty(r.chekhov_qty)}</td><td>${qty(r.box_qty)}</td><td class="wc-good"><b>${qty(r.recommended_order_qty)}</b></td><td>${money(r.estimated_order_cost_byn)}<div class="wc-mini">${money(r.estimated_order_cost_rub,'RUB')}</div></td></tr>`).join('')
 }else if(mode==='excess'){
  tableClass='wc-compact wc-excess';
  head='<th class="c-sku">SKU / товар</th><th class="c-stock">Остаток</th><th class="c-days">Дней / норма</th><th class="c-excess">Лишних</th><th class="c-value">Лишних BYN</th><th class="c-demand">Спрос</th><th class="c-action">Что делать</th>';
  body=rows.map(r=>{const sev=String(r.excess_severity||'medium');const sl=sev==='critical'?'🔴 Сильный перелимит':sev==='high'?'🟠 Высокий перелимит':'🟡 Перелимит';return `<tr><td class="wc-sku"><b>${esc(r.sku)}</b><div>${esc(r.product||'')}</div></td><td><b>${qty(r.vitebsk_avail??r.closing_qty)}</b></td><td>${daysCell(r,data,'excess')}<div class="wc-mini">нормальный остаток ${qty(r.norm_target_qty)} шт.</div></td><td class="wc-bad"><b>${qty(r.excess_qty)}</b></td><td class="wc-bad"><b>${money(r.excess_cost_byn)}</b><div class="wc-mini">${money(r.excess_cost_rub,'RUB')}</div></td><td><b>${qty(r.forecast_qty)} шт./мес.</b>${demandMini(r)}</td><td><span class="wc-sev ${esc(sev)}">${sl}</span><div class="wc-action">${esc(r.excess_action||'Остановить пополнение и рассмотреть акцию на слив')}</div>${r.group900?'<div class="wc-mini">Группа 900: отдельная политика.</div>':'<div class="wc-mini">Размер скидки — только после проверки маржи.</div>'}</td></tr>`}).join('')
 }else{
  head='<th class="c-sku">SKU / товар</th><th>Витебск</th><th>Дней</th><th>Расход мес.</th><th>Прогноз</th><th>Цель 14 дн.</th><th>Нужно</th><th>Излишек</th><th>Чехов</th>';
  body=rows.map(r=>`<tr><td class="wc-sku"><b>${esc(r.sku)}</b><div>${esc(r.product||'')}</div></td><td>${qty(r.vitebsk_avail??r.closing_qty)}</td><td>${daysCell(r,data,'order')}</td><td>${qty(r.expense_qty)}</td><td>${qty(r.forecast_qty)}${demandMini(r)}</td><td>${qty(r.target_qty)}</td><td>${qty(r.need_qty)}</td><td>${qty(r.excess_qty)}</td><td>${qty(r.chekhov_qty)}</td></tr>`).join('')
 }
 if(!body)body='<tr><td colspan="9" style="text-align:center;color:var(--sub);padding:20px">По выбранному фильтру товаров нет.</td></tr>';
 const exportBtn=mode==='order'?'<button class="primary" id="wc-export">⬇ Excel автозаказ</button>':mode==='excess'?'<button class="primary" id="wc-export-excess">⬇ Excel перелимит</button>':'';
 root.innerHTML=`<div class="wc-tools"><b style="font-size:14px">${esc(title())}</b>${(mode==='order'||mode==='stockout')?`<span class="wc-horizon">Цель автозаказа: ${horizon} дней</span>`:''}${mode==='excess'?'<span class="wc-horizon">Перелимит = выше месячной нормы склада</span>':''}<input id="wc-search" placeholder="Артикул или товар" value="${esc(search)}"><button id="wc-find">Найти</button>${exportBtn}</div><div class="wc-table-wrap"><table class="${tableClass}"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div><div class="wc-page"><span class="wc-muted">Показано ${rows.length} из ${total}</span><div><button id="wc-prev" ${offset<=0?'disabled':''}>← Назад</button> <button id="wc-next" ${offset+limit>=total?'disabled':''}>Вперёд →</button></div></div>`;
 const find=$('wc-find'),inp=$('wc-search'),prev=$('wc-prev'),next=$('wc-next');
 if(find)find.onclick=()=>{search=inp?.value.trim()||'';offset=0;load()};if(inp)inp.onkeydown=e=>{if(e.key==='Enter')find?.click()};if(prev)prev.onclick=()=>{offset=Math.max(0,offset-limit);load()};if(next)next.onclick=()=>{offset+=limit;load()};if($('wc-export'))$('wc-export').onclick=exportOrder;if($('wc-export-excess'))$('wc-export-excess').onclick=exportExcess
}
async function allRowsFor(m){let out=[],off=0;for(let i=0;i<30;i++){const d=await rpc('warehouse_control_get_items_v1',{p_mode:m,p_search:'',p_limit:500,p_offset:off});const rows=Array.isArray(d?.rows)?d.rows:[];out.push(...rows);off+=rows.length;if(rows.length<500||off>=Number(d?.total||0))break}return out}
async function ensureXlsx(){if(window.XLSX)return true;try{if(typeof _loadSheetJS==='function'){await _loadSheetJS();return !!window.XLSX}}catch(_){}return false}
function csv(v){return '"'+String(v??'').replace(/"/g,'""')+'"'}
function fallbackCsv(rows,headers,mapper,name){const lines=[headers.map(csv).join(';'),...rows.map(r=>mapper(r).map(csv).join(';'))];const blob=new Blob(['\ufeff'+lines.join('\r\n')],{type:'text/csv;charset=utf-8'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name+'.csv';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}
async function writeExcel(rows,headers,mapper,name){if(await ensureXlsx()){const aoa=[headers,...rows.map(mapper)];const ws=XLSX.utils.aoa_to_sheet(aoa);ws['!freeze']={xSplit:0,ySplit:1};const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,'Отчёт');XLSX.writeFile(wb,name+'.xlsx');return}fallbackCsv(rows,headers,mapper,name)}
async function exportOrder(){try{const fresh=await rpc('warehouse_control_get_freshness_v1',{});if(!fresh?.auto_sources_fresh){alert('Автозаказ нельзя скачать: сначала дождитесь свежих данных 1С, Витебска и продаж за сегодня.');return}const rows=(await allRowsFor('order')).filter(r=>n(r.recommended_order_qty)>0);if(!rows.length){alert('Сейчас нет позиций для заказа из Чехова.');return}const total=rows.reduce((s,r)=>s+n(r.estimated_order_cost_byn),0);const headers=['Артикул','Товар','Остаток Витебск','Дней запаса','Цель дней','Прогноз месяца','Среднее 3 мес.','Прошлый год','Источник прогноза','Целевой остаток 14 дней','Нужно','Остаток Чехов','Мин. упаковка','Заказать','Оценка BYN'];const mapper=r=>[r.sku,r.product,n(r.vitebsk_avail),r.days_cover,FIXED_HORIZON,n(r.forecast_qty),n(r.avg3_qty),n(r.ly_qty),r.forecast_source,n(r.target_qty),n(r.need_qty),n(r.chekhov_qty),n(r.box_qty),n(r.recommended_order_qty),n(r.estimated_order_cost_byn)];rows.push({sku:'',product:'ИТОГО',estimated_order_cost_byn:total});await writeExcel(rows,headers,mapper,'Автозаказ_Чехов_'+new Date().toISOString().slice(0,10))}catch(e){alert('Не удалось сформировать автозаказ: '+(e?.message||e))}}
async function exportExcess(){try{const rows=await allRowsFor('excess');if(!rows.length){alert('Сейчас нет позиций в перелимите.');return}const headers=['Артикул','Товар','Остаток Витебск','Дней запаса','Норма склада, дней','Нормальный остаток, шт.','Лишних, шт.','Излишек BYN','Излишек RUB','Прогноз продаж/мес.','Среднее 3 мес.','Прошлый год','Источник прогноза','Уровень перелимита','Рекомендация','Группа 900'];const mapper=r=>[r.sku,r.product,n(r.vitebsk_avail),r.days_cover,n(r.norm_days),n(r.norm_target_qty),n(r.excess_qty),n(r.excess_cost_byn),n(r.excess_cost_rub),n(r.forecast_qty),n(r.avg3_qty),n(r.ly_qty),r.forecast_source,r.excess_severity,r.excess_action,r.group900?'Да':'Нет'];await writeExcel(rows,headers,mapper,'Перелимит_акция_на_слив_'+new Date().toISOString().slice(0,10))}catch(e){alert('Не удалось выгрузить перелимит: '+(e?.message||e))}}
function install(){ensureCss();ensureFixedHorizon();const page=$('page-warehouse-control');if(!page||page.dataset.compactV23639)return;page.dataset.compactV23639='1';page.addEventListener('click',async e=>{const tab=e.target.closest('#wc-v23620 .wc-tab');if(tab){const m=tab.dataset.mode;if(!m)return;if(m==='overview'){mode='overview';setTimeout(ensureFixedHorizon,0);return}e.preventDefault();e.stopImmediatePropagation();mode=m;offset=0;document.querySelectorAll('#wc-v23620 .wc-tab').forEach(b=>b.classList.toggle('active',b===tab));await load();return}const refresh=e.target.closest('#wc-refresh');if(refresh){setTimeout(ensureFixedHorizon,0);if(mode==='overview')return;e.preventDefault();e.stopImmediatePropagation();refresh.disabled=true;try{const api=window.crmWarehouseControlV1;if(api?.__freshnessOriginalOpen)await api.__freshnessOriginalOpen(true);else if(api?.open)await api.open(true);ensureFixedHorizon();document.querySelectorAll('#wc-v23620 .wc-tab').forEach(b=>b.classList.toggle('active',b.dataset.mode===mode));await load()}finally{const b=$('wc-refresh');if(b)b.disabled=false}}},true)}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();[400,1000,2200,4500].forEach(ms=>setTimeout(()=>{install();ensureFixedHorizon()},ms));
window.RESANTA_WAREHOUSE_COMPACT_V23637=Object.freeze({version:V,stableForecast:true,fixedOrderHorizonDays:FIXED_HORIZON,persistentHorizon:true,excessSellThrough:true,excelExports:true,stickyHeader:true,stickySku:true,noPolling:true,noMutationObserver:true});
})();
