/* RESANTA CRM v23.6.37 · WAREHOUSE COMPACT TABLE + DAYS COVER
 * UI-only fix: restores days_cover already returned by warehouse RPC,
 * removes unnecessary horizontal scrolling, sticky header + SKU column.
 * No polling, no MutationObserver, no calculation changes.
 */
(function(){
'use strict';
if(window.RESANTA_WAREHOUSE_COMPACT_V23637)return;
const V='v23.6.37';
let mode='overview',offset=0,limit=100,search='';
const $=id=>document.getElementById(id);
const n=v=>Number(v)||0;
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const qty=v=>n(v).toLocaleString('ru-RU',{maximumFractionDigits:2});
const money=(v,cur='BYN')=>n(v).toLocaleString('ru-RU',{minimumFractionDigits:2,maximumFractionDigits:2})+' '+cur;
function dbx(){try{return typeof db!=='undefined'?db:window.db}catch(_){return window.db}}
async function rpc(name,args={}){const d=dbx();if(!d)throw new Error('База ещё не готова');const {data,error}=await d.rpc(name,args);if(error)throw error;return data}
function ensureCss(){if($('warehouse-compact-v23637-css'))return;const s=document.createElement('style');s.id='warehouse-compact-v23637-css';s.textContent=`
#wc-v23620 .wc-table-wrap{overflow:auto;max-width:100%}
#wc-v23620 .wc-compact{width:100%;min-width:0!important;table-layout:fixed;border-collapse:separate;border-spacing:0}
#wc-v23620 .wc-compact th,#wc-v23620 .wc-compact td{padding:9px 8px;font-size:11px;overflow:hidden;text-overflow:ellipsis}
#wc-v23620 .wc-compact th{position:sticky;top:0;z-index:5;background:#F8FAFC}
#wc-v23620 .wc-compact th:first-child,#wc-v23620 .wc-compact td:first-child{position:sticky;left:0;z-index:4;background:#fff;box-shadow:1px 0 0 var(--border)}
#wc-v23620 .wc-compact th:first-child{z-index:7;background:#F8FAFC}
#wc-v23620 .wc-sku{white-space:normal;line-height:1.3}.wc-sku b{display:block;font-size:12px}.wc-sku div{margin-top:2px}
#wc-v23620 .wc-days{font-weight:800;white-space:nowrap}.wc-days.bad{color:#B91C1C}.wc-days.warn{color:#B45309}.wc-days.good{color:#166534}
#wc-v23620 .wc-mini{font-size:9px;color:var(--sub);margin-top:3px;line-height:1.3;white-space:normal}
#wc-v23620 .wc-compact .c-sku{width:41%}.wc-compact .c-vb{width:7%}.wc-compact .c-days{width:7%}.wc-compact .c-need{width:9%}.wc-compact .c-ch{width:8%}.wc-compact .c-box{width:6%}.wc-compact .c-order{width:9%}.wc-compact .c-cost{width:13%}
@media(max-width:1050px){#wc-v23620 .wc-compact{min-width:860px!important}#wc-v23620 .wc-compact .c-sku{width:330px}}
`;document.head.appendChild(s)}
function daysCell(r){const d=r.days_cover;if(d===null||d===undefined||!Number.isFinite(Number(d)))return '<span class="wc-days">—</span>';const x=Math.max(0,Number(d));const cls=x<=3?'bad':x<=7?'warn':'good';return `<span class="wc-days ${cls}">${x.toLocaleString('ru-RU',{maximumFractionDigits:1})} дн.</span>`}
function title(){return mode==='excess'?'Перелимит и кандидаты на возврат':mode==='stockout'?'Нет товара / критический дефицит':mode==='order'?'Автозаказ на Чехов':'Все SKU'}
async function load(){const root=$('wc-body');if(!root||mode==='overview')return;root.innerHTML='<div class="card">Загрузка списка…</div>';try{const data=await rpc('warehouse_control_get_items_v1',{p_mode:mode,p_search:search,p_limit:limit,p_offset:offset});render(data)}catch(e){root.innerHTML='<div class="wc-alert red"><b>Не удалось загрузить список.</b><br>'+esc(e?.message||e)+'</div>'}}
function render(data){const root=$('wc-body');if(!root)return;const rows=Array.isArray(data?.rows)?data.rows:[],total=Number(data?.total)||0;let head='',body='';
 if(mode==='order'||mode==='stockout'){
  head='<th class="c-sku">SKU / товар</th><th class="c-vb">Витебск</th><th class="c-days">Дней</th><th class="c-need">Нужно</th><th class="c-ch">Чехов</th><th class="c-box">Упак.</th><th class="c-order">Автозаказ</th><th class="c-cost">Стоимость</th>';
  body=rows.map(r=>`<tr><td class="wc-sku"><b>${esc(r.sku)}</b><div>${esc(r.product||'')}</div></td><td class="${n(r.vitebsk_avail)<=0?'wc-bad':''}">${qty(r.vitebsk_avail??r.closing_qty)}</td><td>${daysCell(r)}</td><td class="wc-warn"><b>${qty(r.need_qty)}</b><div class="wc-mini">прогноз ${qty(r.forecast_qty)} · цель ${qty(r.target_qty)}</div></td><td>${qty(r.chekhov_qty)}</td><td>${qty(r.box_qty)}</td><td class="wc-good">${qty(r.recommended_order_qty)}</td><td>${money(r.estimated_order_cost_byn)}<div class="wc-mini">${money(r.estimated_order_cost_rub,'RUB')}</div></td></tr>`).join('');
 }else if(mode==='excess'){
  head='<th class="c-sku">SKU / товар</th><th>Витебск</th><th>Дней</th><th>Излишек</th><th>Излишек BYN</th><th>Решение</th>';
  body=rows.map(r=>{const ret=r.return_allowed?'<span class="wc-warn">Остановить заказ / рассмотреть возврат</span>':'<span class="wc-bad">Группа 900 — возврат запрещён</span>';return `<tr><td class="wc-sku"><b>${esc(r.sku)}</b><div>${esc(r.product||'')}</div></td><td>${qty(r.vitebsk_avail??r.closing_qty)}</td><td>${daysCell(r)}<div class="wc-mini">прогноз ${qty(r.forecast_qty)} · норма ${qty(r.norm_target_qty)}</div></td><td class="wc-bad">${qty(r.excess_qty)}</td><td class="wc-bad">${money(r.excess_cost_byn)}<div class="wc-mini">${money(r.excess_cost_rub,'RUB')}</div></td><td>${ret}</td></tr>`}).join('');
 }else{
  head='<th class="c-sku">SKU / товар</th><th>Витебск</th><th>Дней</th><th>Расход мес.</th><th>Прогноз</th><th>Цель</th><th>Нужно</th><th>Излишек</th><th>Чехов</th>';
  body=rows.map(r=>`<tr><td class="wc-sku"><b>${esc(r.sku)}</b><div>${esc(r.product||'')}</div></td><td>${qty(r.vitebsk_avail??r.closing_qty)}</td><td>${daysCell(r)}</td><td>${qty(r.expense_qty)}</td><td>${qty(r.forecast_qty)}</td><td>${qty(r.target_qty)}</td><td>${qty(r.need_qty)}</td><td>${qty(r.excess_qty)}</td><td>${qty(r.chekhov_qty)}</td></tr>`).join('');
 }
 if(!body)body='<tr><td colspan="9" style="text-align:center;color:var(--sub);padding:20px">По выбранному фильтру товаров нет.</td></tr>';
 root.innerHTML=`<div class="wc-tools"><b style="font-size:14px">${esc(title())}</b><input id="wc-search" placeholder="Артикул или товар" value="${esc(search)}"><button id="wc-find">Найти</button>${mode==='order'?'<button class="primary" id="wc-export">⬇ Скачать автозаказ Чехов</button>':''}</div><div class="wc-table-wrap"><table class="wc-compact"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div><div class="wc-page"><span class="wc-muted">Показано ${rows.length} из ${total}</span><div><button id="wc-prev" ${offset<=0?'disabled':''}>← Назад</button> <button id="wc-next" ${offset+limit>=total?'disabled':''}>Вперёд →</button></div></div>`;
 $('wc-find').onclick=()=>{search=$('wc-search').value.trim();offset=0;load()};$('wc-search').onkeydown=e=>{if(e.key==='Enter')$('wc-find').click()};$('wc-prev').onclick=()=>{offset=Math.max(0,offset-limit);load()};$('wc-next').onclick=()=>{offset+=limit;load()};if($('wc-export'))$('wc-export').onclick=exportOrder;
}
async function allOrderRows(){let out=[],off=0;for(let i=0;i<20;i++){const d=await rpc('warehouse_control_get_items_v1',{p_mode:'order',p_search:'',p_limit:500,p_offset:off});const rows=Array.isArray(d?.rows)?d.rows:[];out.push(...rows);off+=rows.length;if(rows.length<500||off>=Number(d?.total||0))break}return out.filter(r=>n(r.recommended_order_qty)>0)}
function csv(v){return '"'+String(v??'').replace(/"/g,'""')+'"'}
async function exportOrder(){try{const fresh=await rpc('warehouse_control_get_freshness_v1',{});if(!fresh?.auto_sources_fresh){alert('Автозаказ нельзя скачать: сначала дождитесь свежих данных 1С, Витебска и продаж за сегодня.');return}const rows=await allOrderRows();if(!rows.length){alert('Сейчас нет позиций для заказа из Чехова.');return}const total=rows.reduce((s,r)=>s+n(r.estimated_order_cost_byn),0);const lines=[['Артикул','Товар','Остаток Витебск','Дней запаса','Прогноз месяца','Целевой остаток','Нужно','Остаток Чехов','Мин. упаковка','Заказать','Оценка BYN'].map(csv).join(';'),...rows.map(r=>[r.sku,r.product,r.vitebsk_avail,r.days_cover,r.forecast_qty,r.target_qty,r.need_qty,r.chekhov_qty,r.box_qty,r.recommended_order_qty,n(r.estimated_order_cost_byn).toFixed(2)].map(csv).join(';'))];lines.push(['','','','','','','','','','ИТОГО',total.toFixed(2)].map(csv).join(';'));const blob=new Blob(['\ufeff'+lines.join('\r\n')],{type:'text/csv;charset=utf-8'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='Автозаказ_Чехов_'+new Date().toISOString().slice(0,10)+'.csv';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}catch(e){alert('Не удалось сформировать автозаказ: '+(e?.message||e))}}
function install(){ensureCss();const page=$('page-warehouse-control');if(!page||page.dataset.compactV23637)return;page.dataset.compactV23637='1';page.addEventListener('click',async e=>{const tab=e.target.closest('#wc-v23620 .wc-tab');if(tab){const m=tab.dataset.mode;if(!m||m==='overview')return; e.preventDefault();e.stopImmediatePropagation();mode=m;offset=0;document.querySelectorAll('#wc-v23620 .wc-tab').forEach(b=>b.classList.toggle('active',b===tab));await load();return}const refresh=e.target.closest('#wc-refresh');if(refresh&&mode!=='overview'){e.preventDefault();e.stopImmediatePropagation();refresh.disabled=true;try{const api=window.crmWarehouseControlV1;if(api?.__freshnessOriginalOpen)await api.__freshnessOriginalOpen(true);else if(api?.open)await api.open(true);document.querySelectorAll('#wc-v23620 .wc-tab').forEach(b=>b.classList.toggle('active',b.dataset.mode===mode));await load()}finally{const b=$('wc-refresh');if(b)b.disabled=false}}
 },true)}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();[400,1000,2200,4500].forEach(ms=>setTimeout(install,ms));
window.RESANTA_WAREHOUSE_COMPACT_V23637=Object.freeze({version:V,daysCover:true,stickyHeader:true,stickySku:true,noPolling:true,noMutationObserver:true,calculationChanged:false});
})();
