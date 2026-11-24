/* Native Triovist stock director screen. Read-only; existing RPC, imports and Excel stay unchanged. */
(function(w){
'use strict';
if(w.RESANTA_TRIOVIST_STOCK_DIRECTOR_V1)return;
const VERSION='2026.11.23.1',PAGE_SIZE=25;
const COLUMNS=[
 'Менеджер','Группа','Товар / SKU','Продажи за 3 мес.','Остаток 21vek','Заказы 21vek','Дней запаса',
 'Склад Витебск','Склад Чехов','Рекоменд. заказ','Из Витебска','Из Чехова','Не покрыто','Последняя отгрузка'
];
const num=v=>Number.isFinite(Number(v))?Number(v):0;
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const qty=v=>num(v).toLocaleString('ru-RU',{maximumFractionDigits:2});
const low=v=>String(v||'').trim().toLowerCase();
let mgr='all',page=1,expanded=true,riskOnly=false,showAll=false,lastQuery='';
function style(){
 if(document.getElementById('trst174-css'))return;
 const s=document.createElement('style');s.id='trst174-css';
 s.textContent=`
#tri-stock-card.trst-ready{min-width:0;color:var(--text);background:var(--card);border-color:var(--border)}
#tri-stock-card.trst-ready .card-title{display:flex;align-items:center;gap:8px;margin:0 0 12px;font-size:24px;line-height:1.2;letter-spacing:normal;text-transform:none;color:var(--text)}
#tri-stock-card.trst-ready .tri-stock-tools{gap:8px;align-items:end}
#tri-stock-card.trst-ready .tri-stock-tools .form-input,#tri-stock-card .trst-controls select{min-height:38px;padding:7px 10px;border:1px solid var(--border);border-radius:8px;background:var(--card);color:var(--text);font:inherit}
#tri-stock-card.trst-ready .tri-stock-tools button,#tri-stock-card .trst-btn{min-height:38px;padding:7px 11px;border:1px solid var(--border);border-radius:8px;background:var(--card);color:var(--a);font:inherit;font-weight:600;cursor:pointer}
#tri-stock-card.trst-ready :is(button,select,input,summary,.trst-table-wrap):focus-visible{outline:2px solid var(--a);outline-offset:2px}
#tri-stock-card.trst-ready .tri-stock-tools button:hover,#tri-stock-card .trst-btn:not(:disabled):hover{background:var(--ab)}
#tri-stock-card .trst-btn[aria-pressed="true"]{background:var(--ab);color:var(--at);border-color:var(--a)}
#tri-stock-card .trst-btn:disabled{opacity:.5;cursor:default}
#tri-stock-card .trst-controls,#tri-stock-card .trst-page,#tri-stock-card .trst-pages,#tri-stock-card .trst-help-label{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
#tri-stock-card .trst-controls{margin:12px 0;padding:10px;border:1px solid var(--border);border-radius:10px;background:var(--bg)}
#tri-stock-card .trst-controls label{display:flex;align-items:center;flex-wrap:wrap;gap:8px;color:var(--sub);font-size:13px}
#tri-stock-card .trst-controls select{max-width:100%}
#tri-stock-card .trst-info{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-inline-start:auto}
#tri-stock-card .trst-help-label{gap:5px;color:var(--sub);font-size:13px}
#tri-stock-card .trst-help-label.trst-preliminary{color:var(--am)}
#tri-stock-card .trst-help{position:relative;display:inline-flex}
#tri-stock-card .trst-help .trst-btn{width:28px;min-height:28px;padding:0;font-size:17px}
#tri-stock-card .trst-tip{display:none;position:absolute;z-index:9;inset-block-start:100%;inset-inline-end:0;width:min(370px,calc(100vw - 48px));padding:10px 12px;border:1px solid var(--border);border-radius:8px;background:var(--card);box-shadow:0 4px 14px #11182720;color:var(--text);font-size:13px;line-height:1.5;font-weight:400}
#tri-stock-card .trst-help:is(:hover,:focus-within) .trst-tip{display:block}
#tri-stock-card .card-title .trst-tip{inset-inline:0 auto}
#tri-stock-card .trst-tip p{margin:0}
#tri-stock-card .trst-tip p+p{margin-top:6px}
#tri-stock-card.trst-ready:has(.trst-preliminary) #tri-stock-truth-note-v2355.tri-warning{display:none}
#tri-stock-card .trst-message{padding:10px 12px;margin:10px 0;border:1px solid var(--border);border-radius:8px;background:var(--bg);color:var(--sub)}
#tri-stock-card .trst-error{background:var(--rb);color:var(--r)}
#tri-stock-card .trst-details{border:1px solid var(--border);background:var(--card);border-radius:12px;padding:12px;margin:12px 0}
#tri-stock-card .trst-details>summary{cursor:pointer;color:var(--a);font-weight:650;font-size:16px;padding:4px}
#tri-stock-card .trst-page{justify-content:space-between;margin:8px 0;color:var(--sub);font-size:13px}
#tri-stock-card .trst-pages{margin-inline-start:auto}
#tri-stock-card .trst-page-count{color:var(--text);font-variant-numeric:tabular-nums}
#tri-stock-card .trst-table-wrap{max-width:100%;max-height:min(65vh,620px);overflow:auto;border:1px solid var(--border);border-radius:8px;background:var(--card)}
#tri-stock-card .trst-table-wrap table{width:100%;min-width:625px;border-collapse:separate;border-spacing:0;font-size:13px}
#tri-stock-card .trst-table-wrap.trst-full table{min-width:1420px}
#tri-stock-card .trst-table-wrap :is(th,td){padding:9px 10px;vertical-align:top}
#tri-stock-card .trst-table-wrap th{position:sticky;top:0;z-index:2;background:var(--bg);color:var(--sub);text-transform:none;white-space:normal;line-height:1.25;font-size:12px}
#tri-stock-card .trst-table-wrap td{background:var(--card)}
#tri-stock-card .trst-table-wrap tbody tr:hover td{background:var(--bg)}
#tri-stock-card .trst-table-wrap :is(th,td):nth-child(n+4){text-align:right;font-variant-numeric:tabular-nums}
#tri-stock-card .trst-table-wrap :is(th,td):nth-child(3){position:sticky;left:0;min-width:175px;width:31%}
#tri-stock-card .trst-table-wrap.trst-full :is(th,td):nth-child(3){width:220px}
#tri-stock-card .trst-table-wrap th:nth-child(3){z-index:3}
#tri-stock-card .trst-table-wrap td:nth-child(3){z-index:1}
#tri-stock-card .trst-table-wrap .tri-note{font-size:12px;color:var(--sub);overflow-wrap:anywhere}
#tri-stock-card .trst-table-wrap .tri-rec{color:var(--a);font-weight:700}
#tri-stock-card .trst-table-wrap .tri-uncovered{color:var(--r);font-weight:700}
#tri-stock-card .trst-table-wrap .trst-product{display:block;color:var(--text);line-height:1.4}
#tri-stock-card .trst-table-wrap .trst-context{display:block;line-height:1.35;margin-top:4px}
#tri-stock-card .trst-full .trst-context,
#tri-stock-card .trst-compact :is(th,td):is(:nth-child(1),:nth-child(2),:nth-child(4),:nth-child(6),:nth-child(7),:nth-child(8),:nth-child(9),:nth-child(14)){display:none}
@media(max-width:700px){
 #tri-stock-card .trst-info{position:relative;width:100%;margin-inline-start:0}
 #tri-stock-card .trst-info .trst-help{position:static}
 #tri-stock-card .trst-info .trst-tip{inset-inline:0 auto;width:min(370px,100%)}
 #tri-stock-card .card-title .trst-help{position:static}
 #tri-stock-card .card-title{position:relative}
}
`;
 document.head.appendChild(s);
}
function aggregate(rows){
 return rows.reduce((a,r)=>{
  a.ship+=Math.max(0,num(r.ship_own));a.chek+=Math.max(0,num(r.order_chekhov));
  a.open+=Math.max(0,num(r.uncovered));a.recommended+=Math.max(0,num(r.recommended));
  if(num(r.uncovered)>0)a.risk++;
  return a;
 },{ship:0,chek:0,open:0,recommended:0,risk:0});
}
function help(key,label,html){
 const id='trst-'+key+'-tip';
 return '<span class="trst-help"><button type="button" class="trst-btn" aria-label="'+label+'" aria-describedby="'+id+'">*</button>'+
 '<span class="trst-tip" id="'+id+'" role="tooltip">'+html+'</span></span>';
}
function prepareHeading(card){
 const title=card.querySelector('.card-title');
 if(!title||title.dataset.trstHeading)return;
 title.dataset.trstHeading='1';
 const note=title.parentElement?.querySelector('.tri-note');
 if(note)note.hidden=true;
 title.innerHTML='Остатки и заказ'+help('about','О разделе «Остатки и заказ»',
  'Потребность по расчёту CRM, доступность складов и непокрытые позиции. Снимки 21vek и Чехова загружаются вручную. Витебск обновляется из 1С. Отгрузки и заказы оформляются отдельно.');
}
function sources(imports){
 const p=imports?.partner||{},o=imports?.own||{},c=imports?.chekhov||{};
 const one=(title,date,source,file)=>'<span><b>'+title+'</b><br>'+esc(date||'Дата снимка отсутствует')+
  ' · '+source+(file?'<br>'+esc(file):'')+'</span>';
 return [one('21vek · остатки и заказы',p.snapshot_date,'Ручной файл',p.source_file),
  one('Витебск · наш склад',o.report_date,'Автоматически из 1С'),
  one('Чехов · остатки',c.snapshot_date,'Ручной файл',c.source_file)].join('<br><br>');
}
function statusHelp(imports,hasItems){
 const partner=imports?.partner;
 const file=String(partner?.source_file||'');
 if(!hasItems||file.includes('[truth-v23.5.5]'))return '';
 const explanation=file||partner?.snapshot_date?
  'Снимок 21vek загружен старым парсером, который смешивал «Статистика продаж» с «Продажи за 3 мес.» и мог учитывать весь товар в пути.':
  'Формат снимка 21vek не подтверждён.';
 return '<span class="trst-help-label trst-preliminary">Расчёт предварительный'+help('legacy','Почему расчёт предварительный',
  '<b>Рекомендации временно не считать окончательными.</b> '+explanation+
  ' <b>Загрузите файл 21vek заново один раз.</b> После загрузки источник будет отмечен [truth-v23.5.5].')+'</span>';
}
function table(rows){
 // The stock decorators use the existing 14 column positions for forecast and subgroup details.
 const head=COLUMNS.map(label=>'<th scope="col">'+label+'</th>').join('');
 return '<div class="trst-table-wrap '+(showAll?'trst-full':'trst-compact')+'" tabindex="0" role="region" aria-label="Таблица остатков и заказа по SKU">'+
 '<table class="tri-table tri-stock-table"><thead><tr>'+head+'</tr></thead><tbody>'+
 rows.map(x=>'<tr><td>'+esc(x.manager_name||'—')+'</td><td>'+esc(x.assigned_group||'—')+'</td><td><b>'+esc(x.sku||'—')+
  '</b><span class="trst-product">'+esc(x.product||'')+'</span><span class="tri-note trst-context">'+
  [x.assigned_group,x.manager_name].filter(Boolean).map(esc).join(' · ')+'</span></td><td>'+qty(x.sales_90)+'</td><td>'+qty(x.partner_total)+
  '</td><td>'+qty(x.partner_orders)+'</td><td>'+(x.stock_days==null?'—':qty(x.stock_days))+'</td><td>'+qty(x.own_qty)+
  '</td><td>'+qty(x.chekhov_qty)+'</td><td class="tri-rec">'+qty(x.recommended)+'</td><td>'+qty(x.ship_own)+'</td><td>'+
  qty(x.order_chekhov)+'</td><td class="'+(num(x.uncovered)>0?'tri-uncovered':'')+'">'+qty(x.uncovered)+'</td><td>'+
  esc(x.last_shipment_month||'—')+'<div class="tri-note">'+(x.last_shipment_month?'кол-во '+qty(x.last_shipment_qty):'нет отгрузок')+
  '</div></td></tr>').join('')+'</tbody></table></div>';
}
function bind(meta,root){
 if(meta.dataset.trstBound!=='1'){
  meta.dataset.trstBound='1';
  meta.addEventListener('change',e=>{if(e.target?.id==='tri-stock-director-manager'){mgr=e.target.value;page=1;w.renderTriovistStock?.()}});
  meta.addEventListener('click',e=>{
   if(e.target.closest?.('[data-trst-risk]')){riskOnly=!riskOnly;page=1;w.renderTriovistStock?.();return}
   if(e.target.closest?.('[data-trst-retry]'))w.triovistStockReload?.(true);
  });
 }
 if(root.dataset.trstBound!=='1'){
  root.dataset.trstBound='1';
  root.addEventListener('click',e=>{
   const toggle=e.target.closest?.('[data-trst-mode]');
   if(toggle){
    showAll=!showAll;
    const wrap=root.querySelector('.trst-table-wrap');
    if(!wrap)return;
    wrap.classList.toggle('trst-full',showAll);
    wrap.classList.toggle('trst-compact',!showAll);
    wrap.scrollLeft=0;
    toggle.textContent=showAll?'Основные показатели':'Все показатели';
    return;
   }
   const t=e.target.closest?.('[data-trst-page]');
   if(!t)return;
   const direction=num(t.dataset.trstPage)<page?'prev':'next';
   page=Math.max(1,num(t.dataset.trstPage)||1);w.renderTriovistStock?.();
   const next=root.querySelector('[data-trst-nav="'+direction+'"]');
   (next&&!next.disabled?next:root.querySelector('.trst-page-count'))?.focus();
  });
  root.addEventListener('toggle',e=>{if(e.target?.isConnected&&e.target.matches?.('details[data-trst-details]'))expanded=e.target.open},true);
 }
}
function loading(){
 const el=document.querySelector('#tri-stock-card [data-trst-loading]');
 if(el)el.textContent='Обновляю остатки и заказ…';
 else{
  const box=document.getElementById('tri-stock-meta');
  if(box&&!box.textContent.trim())box.innerHTML='<div class="trst-message" role="status">Загружаю остатки…</div>';
 }
}
function render({meta,root,items,imports,error,isBoss,isManager,actorEmail,search}){
 const card=document.getElementById('tri-stock-card');
 if(!card||!meta||!root||!card.contains(meta)||!card.contains(root))return false;
 style();bind(meta,root);card.classList.add('trst-ready');
 prepareHeading(card);
 if(error){
  meta.innerHTML='<div class="trst-message trst-error" role="alert"><b>Не удалось загрузить остатки.</b><p>'+esc(error)+'</p><button type="button" class="trst-btn" data-trst-retry>Повторить загрузку</button></div>';
  root.innerHTML='';return true;
 }
 const safe=(Array.isArray(items)?items:[]).filter(r=>isBoss||isManager&&low(r.manager_email)===low(actorEmail));
 if(!isBoss||isManager)mgr='all';
 const managers=new Map();
 for(const r of safe){const k=low(r.manager_email);if(k&&!managers.has(k))managers.set(k,r.manager_name||k)}
 if(mgr!=='all'&&!managers.has(mgr))mgr='all';
 const query=low(search);
 if(query!==lastQuery){page=1;lastQuery=query}
 const rows=safe.filter(r=>(mgr==='all'||low(r.manager_email)===mgr)&&(!riskOnly||num(r.uncovered)>0)&&
  (!query||low([r.sku,r.product,r.assigned_group,r.brand].join(' ')).includes(query)))
  .sort((a,b)=>num(b.uncovered)-num(a.uncovered)||num(b.recommended)-num(a.recommended)||num(b.sales_90)-num(a.sales_90));
 const options='<option value="all">Все менеджеры</option>'+[...managers].map(([email,name])=>'<option value="'+esc(email)+'"'+(mgr===email?' selected':'')+'>'+esc(name)+'</option>').join('');
 meta.innerHTML='<div class="trst-controls">'+
 (isBoss?'<label>Менеджер<select id="tri-stock-director-manager">'+options+'</select></label>':'')+
 '<button type="button" class="trst-btn" data-trst-risk aria-pressed="'+riskOnly+'">Только дефицит</button><span data-trst-loading aria-live="polite"></span>'+
 '<div class="trst-info"><span class="trst-help-label">Источники'+help('sources','Даты и источники остатков',sources(imports))+'</span>'+
 statusHelp(imports,safe.length>0)+'</div></div>';
 if(!rows.length){root.innerHTML='<div class="trst-message">'+(safe.length?'По выбранным фильтрам нет позиций.':'Нет сопоставленных остатков. Проверьте загрузки 21vek и Чехова.')+'</div>';return true}
 const totalPages=Math.ceil(rows.length/PAGE_SIZE);
 page=Math.max(1,Math.min(totalPages,page));
 const start=(page-1)*PAGE_SIZE;
 root.innerHTML='<details data-trst-details class="trst-details" '+(expanded?'open':'')+'><summary>Детализация по SKU · '+qty(rows.length)+'</summary>'+
 '<div class="trst-page"><span>'+qty(start+1)+'–'+qty(Math.min(rows.length,page*PAGE_SIZE))+' из '+qty(rows.length)+'</span>'+
 '<button type="button" class="trst-btn" data-trst-mode>'+(showAll?'Основные показатели':'Все показатели')+'</button>'+
 (totalPages>1?'<div class="trst-pages"><button type="button" class="trst-btn" data-trst-nav="prev" data-trst-page="'+(page-1)+'" '+(page===1?'disabled':'')+'>Назад</button> '+
 '<b class="trst-page-count" tabindex="-1">'+page+' / '+totalPages+'</b> <button type="button" class="trst-btn" data-trst-nav="next" data-trst-page="'+(page+1)+'" '+(page>=totalPages?'disabled':'')+'>Далее</button></div>':'')+'</div>'+
 table(rows.slice(start,start+PAGE_SIZE))+'</details>';
 return true;
}
w.RESANTA_TRIOVIST_STOCK_DIRECTOR_V1=Object.freeze({version:VERSION,render,loading,aggregate,readOnly:true,noDbWrites:true,noParserRuns:true});
})(window);
