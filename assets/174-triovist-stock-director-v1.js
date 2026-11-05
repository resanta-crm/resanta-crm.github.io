/* Native Triovist stock director screen. Read-only; existing RPC, imports and Excel stay unchanged. */
(function(w){
'use strict';
if(w.RESANTA_TRIOVIST_STOCK_DIRECTOR_V1)return;
const VERSION='2026.11.05.1';
const num=v=>Number.isFinite(Number(v))?Number(v):0;
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const qty=v=>num(v).toLocaleString('ru-RU',{maximumFractionDigits:2});
const low=v=>String(v||'').trim().toLowerCase();
let mgr='all',page=1,expanded=false,riskOnly=false;
function style(){
 if(document.getElementById('trst174-css'))return;
 const s=document.createElement('style');s.id='trst174-css';
 s.textContent=[
 '#tri-stock-card.trst-ready .card-title{font-size:20px;color:#174b7d}',
 '#tri-stock-card .trst-sources{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin:12px 0}',
 '#tri-stock-card .trst-source{border:1px solid #dce6f0;border-radius:10px;background:#fff;padding:11px;min-width:0}',
 '#tri-stock-card .trst-source b{display:block;font-size:11px;color:#2c4563}',
 '#tri-stock-card .trst-source small{display:block;margin-top:5px;font-size:10px;color:#708299;line-height:1.5;overflow-wrap:anywhere}',
 '#tri-stock-card .trst-kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:9px;margin:12px 0}',
 '#tri-stock-card .trst-kpi{border:1px solid #dce6ef;border-radius:11px;padding:12px;background:#fff;min-width:0}',
 '#tri-stock-card .trst-kpi small{display:block;color:#71839b;font-size:10px;min-height:28px;line-height:1.4}',
 '#tri-stock-card .trst-kpi b{display:block;font-size:22px;line-height:1.25;margin:5px 0;overflow-wrap:anywhere}',
 '#tri-stock-card .trst-kpi p{color:#8190a2;font-size:10px;margin:0}',
 '#tri-stock-card .trst-red{color:#bc3540!important}#tri-stock-card .trst-green{color:#148457!important}#tri-stock-card .trst-blue{color:#216ca9!important}',
 '#tri-stock-card .trst-brief{border:1px solid #c8dcf2;background:linear-gradient(120deg,#eef5ff,#fff);border-radius:12px;padding:14px;margin:12px 0}',
 '#tri-stock-card .trst-brief h4,#tri-stock-card .trst-chart h4{color:#174b79;font-size:14px;margin:0 0 8px}',
 '#tri-stock-card .trst-brief p{color:#4b637b;font-size:11px;line-height:1.6;margin:5px 0}',
 '#tri-stock-card .trst-chart{border:1px solid #dce6f0;border-radius:12px;padding:13px;margin:12px 0;background:#fff}',
 '#tri-stock-card .trst-track{display:flex;overflow:hidden;background:#ecf0f5;height:13px;border-radius:10px;margin:10px 0}',
 '#tri-stock-card .trst-track span{display:block;height:100%}',
 '#tri-stock-card .trst-legend{display:flex;gap:12px;flex-wrap:wrap;color:#667991;font-size:10px}',
 '#tri-stock-card .trst-legend i{display:inline-block;width:8px;height:8px;border-radius:3px;margin-right:4px}',
 '#tri-stock-card .trst-managers{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin:11px 0}',
 '#tri-stock-card .trst-manager-card{border:1px solid #dce6ef;background:#fff;border-radius:11px;padding:12px;min-width:0}',
 '#tri-stock-card .trst-manager-card b{font-size:12px;color:#26435f}',
 '#tri-stock-card .trst-manager-card strong{font-size:15px;color:#b52b39;display:block;margin:7px 0}',
 '#tri-stock-card .trst-manager-card p{font-size:11px;color:#657990;line-height:1.45}',
 '#tri-stock-card .trst-controls{display:flex;flex-wrap:wrap;gap:8px;align-items:end;margin:12px 0}',
 '#tri-stock-card .trst-controls label{font-size:10px;color:#78889c;display:block;margin-bottom:4px}',
 '#tri-stock-card .trst-controls select{border:1px solid #d0ddec;border-radius:8px;padding:8px;min-width:155px;max-width:100%;font-size:11px;background:#fff}',
 '#tri-stock-card .trst-btn{border:1px solid #a9c9eb;background:#f5faff;color:#1c5e9d;padding:8px 10px;border-radius:8px;font-size:11px;font-weight:750;cursor:pointer}',
 '#tri-stock-card .trst-btn[aria-pressed=true]{background:#dfefff}',
 '#tri-stock-card .trst-warn{background:#fff8ed;border:1px solid #f1d3a3;color:#905a1c;border-radius:10px;padding:10px;font-size:11px;line-height:1.5;margin:9px 0}',
 '#tri-stock-card .trst-error{background:#fff3f3;border:1px solid #f2b3b3;color:#a02932;border-radius:10px;padding:12px;margin:10px 0}',
 '#tri-stock-card .trst-details{border:1px solid #cfdfef;background:#f1f7ff;border-radius:12px;padding:12px;margin:12px 0}',
 '#tri-stock-card .trst-details summary{cursor:pointer;color:#185c93;font-weight:800;font-size:12px;padding:4px}',
 '#tri-stock-card .trst-page{display:flex;align-items:center;gap:7px;justify-content:space-between;flex-wrap:wrap;margin:9px 0}',
 '#tri-stock-card .trst-note{font-size:10px;line-height:1.5;color:#75859c}',
 '#tri-stock-card .trst-table-wrap{max-width:100%;overflow-x:auto;background:white}',
 '#tri-stock-card .trst-table-wrap table{min-width:1200px}',
 '@media(max-width:900px){#tri-stock-card .trst-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}#tri-stock-card .trst-sources{grid-template-columns:1fr}#tri-stock-card .trst-managers{grid-template-columns:1fr}}',
 '@media(max-width:520px){#tri-stock-card .trst-kpi b{font-size:19px}}'
 ].join('');
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
function sources(imports){
 const p=imports?.partner||{},o=imports?.own||{},c=imports?.chekhov||{};
 const one=(title,date,description,file)=>'<div class="trst-source"><b>'+title+'</b><small>Дата снимка: '+esc(date||'не загружена')+'</small><small>'+description+'</small>'+(file?'<small>'+esc(file)+'</small>':'')+'</div>';
 return '<div class="trst-sources">'+one('21vek · остатки и заказы',p.snapshot_date,'Ручной файл',p.source_file)+one('Витебск · наш склад',o.report_date,'Автоматически из 1С',null)+one('Чехов · остатки',c.snapshot_date,'Ручной файл',c.source_file)+'</div>';
}
function managersHtml(rows,isBoss){
 const map=new Map();
 for(const r of rows){
  const key=low(r.manager_email)||'unknown';
  const v=map.get(key)||{email:key,name:r.manager_name||'Менеджер',open:0,count:0,top:null};
  const open=Math.max(0,num(r.uncovered));if(open>0){v.open+=open;v.count++;if(!v.top||open>num(v.top.uncovered))v.top=r}
  map.set(key,v);
 }
 const managers=[...map.values()].sort((a,b)=>b.open-a.open);
 return managers.length?'<div class="trst-managers">'+managers.slice(0,isBoss?4:1).map(a=>
  '<div class="trst-manager-card"><b>'+esc(a.name)+'</b><strong>'+qty(a.count)+' SKU · '+qty(a.open)+' ед. без покрытия</strong><p>'+(a.top?'Сначала проверить: '+esc(a.top.assigned_group||a.top.product||a.top.sku)+', '+esc(a.top.sku||''):'На текущей выборке непокрытых позиций нет.')+'</p>'+
  (isBoss?'<button type="button" class="trst-btn" data-trst-manager="'+esc(a.email)+'">Показать SKU менеджера</button>':'')+'</div>'
 ).join('')+'</div>':'';
}
function table(rows){
 return '<div class="trst-table-wrap"><table class="tri-table tri-stock-table"><thead><tr><th>Менеджер</th><th>Группа</th><th>Артикул / товар</th><th>Продажи 3 мес.</th><th>21vek всего</th><th>Заказы 21vek</th><th>Дней запаса</th><th>Наш склад</th><th>Чехов</th><th>Рекоменд. заказ</th><th>Отгрузить сейчас</th><th>Заказать Чехов</th><th>Не покрыто</th><th>Последняя отгрузка</th></tr></thead><tbody>'+
 rows.map(x=>'<tr><td>'+esc(x.manager_name||'—')+'</td><td>'+esc(x.assigned_group||'—')+'</td><td><b>'+esc(x.sku||'—')+'</b><div class="tri-note">'+esc(x.product||'')+'</div></td><td>'+qty(x.sales_90)+'</td><td>'+qty(x.partner_total)+'</td><td>'+qty(x.partner_orders)+'</td><td>'+(x.stock_days==null?'—':qty(x.stock_days))+'</td><td>'+qty(x.own_qty)+'</td><td>'+qty(x.chekhov_qty)+'</td><td class="tri-rec">'+qty(x.recommended)+'</td><td>'+qty(x.ship_own)+'</td><td>'+qty(x.order_chekhov)+'</td><td class="'+(num(x.uncovered)>0?'tri-uncovered':'')+'">'+qty(x.uncovered)+'</td><td>'+esc(x.last_shipment_month||'—')+'<div class="tri-note">'+(x.last_shipment_month?'кол-во '+qty(x.last_shipment_qty):'нет отгрузок')+'</div></td></tr>').join('')+'</tbody></table></div>';
}
function bind(meta,root){
 if(meta.dataset.trstBound!=='1'){
  meta.dataset.trstBound='1';
  meta.addEventListener('change',e=>{if(e.target?.id==='tri-stock-director-manager'){mgr=e.target.value;page=1;w.renderTriovistStock?.()}});
  meta.addEventListener('click',e=>{
   const t=e.target.closest?.('[data-trst-manager]');if(t){mgr=t.dataset.trstManager||'all';page=1;w.renderTriovistStock?.();return}
   if(e.target.closest?.('[data-trst-risk]')){riskOnly=!riskOnly;page=1;w.renderTriovistStock?.();return}
   if(e.target.closest?.('[data-trst-retry]'))w.triovistStockReload?.(true);
  });
 }
 if(root.dataset.trstBound!=='1'){
  root.dataset.trstBound='1';
  root.addEventListener('click',e=>{const t=e.target.closest?.('[data-trst-page]');if(!t)return;page=Math.max(1,num(t.dataset.trstPage)||1);w.renderTriovistStock?.()});
  root.addEventListener('toggle',e=>{if(e.target?.matches?.('details[data-trst-details]'))expanded=e.target.open},true);
 }
}
function loading(){
 const el=document.querySelector('#tri-stock-card [data-trst-loading]');
 if(el)el.textContent='Обновляю данные и пересчитываю заказ…';
 else{const box=document.getElementById('tri-stock-meta');if(box&&!box.textContent.trim())box.innerHTML='<div class="trst-brief"><h4>Загружаю остатки…</h4><p>Проверяю 21vek, Витебск и Чехов. Рекомендации появятся после загрузки.</p></div>'}
}
function render({meta,root,items,imports,days,error,isBoss,isManager,actorEmail,search}){
 const card=document.getElementById('tri-stock-card');
 if(!card||!meta||!root||!card.contains(meta)||!card.contains(root))return false;
 style();bind(meta,root);card.classList.add('trst-ready');
 const title=card.querySelector('.card-title');if(title)title.textContent='Остатки и заказ';
 const note=title?.parentElement?.querySelector('.tri-note');
 if(note)note.textContent='Потребность по расчёту CRM, доступность складов и непокрытые позиции. Загрузки 21vek и Чехова остаются ручными.';
 if(error){
  meta.innerHTML='<div class="trst-error"><b>Не удалось загрузить остатки.</b><p>'+esc(error)+'</p><p>Предыдущий расчёт нельзя считать подтверждённым.</p><button type="button" class="trst-btn" data-trst-retry>↻ Повторить загрузку</button></div>';
  root.innerHTML='';return true;
 }
 const safe=(Array.isArray(items)?items:[]).filter(r=>isBoss||isManager&&low(r.manager_email)===low(actorEmail));
 if(!isBoss||isManager)mgr='all';
 const managers=new Map();
 for(const r of safe){const k=low(r.manager_email);if(k&&!managers.has(k))managers.set(k,r.manager_name||k)}
 if(mgr!=='all'&&!managers.has(mgr))mgr='all';
 const query=low(search);
 const selected=safe.filter(r=>(mgr==='all'||low(r.manager_email)===mgr)&&(!query||low([r.sku,r.product,r.assigned_group,r.brand].join(' ')).includes(query)));
 const rows=(riskOnly?selected.filter(r=>num(r.uncovered)>0):selected).sort((a,b)=>num(b.uncovered)-num(a.uncovered)||num(b.recommended)-num(a.recommended)||num(b.sales_90)-num(a.sales_90));
 const a=aggregate(selected),dist=a.ship+a.chek+a.open,needsWarning=Math.abs(a.recommended-dist)>.05;
 const alloc=value=>dist?Math.max(0,Math.min(100,value/dist*100)).toFixed(2)+'%':'0%';
 const kpi=(name,val,description,cls)=>'<div class="trst-kpi"><small>'+name+'</small><b class="'+cls+'">'+val+'</b><p>'+description+'</p></div>';
 const dateMissing=(!imports?.partner?.snapshot_date||!imports?.chekhov?.snapshot_date||!imports?.own?.report_date);
 const options='<option value="all">Оба менеджера</option>'+[...managers].map(([email,name])=>'<option value="'+esc(email)+'"'+(mgr===email?' selected':'')+'>'+esc(name)+'</option>').join('');
 meta.innerHTML=sources(imports)+(dateMissing?'<div class="trst-warn">У одного или нескольких источников отсутствует дата снимка. Перед согласованием проверьте файлы и обновление 1С.</div>':'')+
 '<div class="trst-controls"><div><label for="tri-stock-director-manager">Менеджер</label><select id="tri-stock-director-manager" '+(!isBoss?'disabled':'')+'>'+options+'</select></div><button type="button" class="trst-btn" data-trst-risk aria-pressed="'+(riskOnly?'true':'false')+'">'+(riskOnly?'Все позиции':'Только дефицит')+'</button><span data-trst-loading aria-live="polite"></span></div>'+
 '<div class="trst-kpis">'+kpi('Риск дефицита',qty(a.risk)+' SKU','SKU с непокрытой потребностью','trst-red')+
 kpi('Отгрузить из Витебска',qty(a.ship)+' ед.','По расчёту CRM','trst-green')+
 kpi('Заказать из Чехова',qty(a.chek)+' ед.','По расчёту CRM','trst-blue')+
 kpi('Остаётся не покрыто',qty(a.open)+' ед.','Требует решения','trst-red')+'</div>'+
 '<div class="trst-brief"><h4>✨ Короткий директорский брифинг</h4><p>'+(a.open>0?'Есть '+qty(a.open)+' ед. без покрытия. Приоритет — проверить SKU с максимальным дефицитом.':'По выбранным SKU непокрытой потребности нет.')+' Сверьте свободные остатки, заказы 21vek, даты снимков и доступность поставки. Причина дефицита автоматически не установлена.</p><p>Горизонт: '+qty(days)+' дней. Только рекомендации: отгрузки и заказы автоматически не создаются.</p></div>'+
 (dist?'<div class="trst-chart"><h4>Как покрывается рекомендованная потребность</h4><div class="trst-track"><span style="width:'+alloc(a.ship)+';background:#168957"></span><span style="width:'+alloc(a.chek)+';background:#3183c7"></span><span style="width:'+alloc(a.open)+';background:#db4853"></span></div><div class="trst-legend"><span><i style="background:#168957"></i>Витебск: '+qty(a.ship)+'</span><span><i style="background:#3183c7"></i>Чехов: '+qty(a.chek)+'</span><span><i style="background:#db4853"></i>Не покрыто: '+qty(a.open)+'</span></div>'+(needsWarning?'<p class="trst-warn">Сумма распределения отличается от рекомендованной потребности. Проверьте расчёт по SKU.</p>':'')+'</div>':'')+
 '<div style="margin-top:11px"><b>Приоритеты менеджеров</b>'+managersHtml(selected,isBoss)+'</div>';
 if(!rows.length){root.innerHTML='<div class="trst-warn">'+(safe.length?'По выбранным фильтрам нет позиций.':'Нет сопоставленных остатков. Проверьте загрузки 21vek и Чехова.')+'</div>';return true}
 const totalPages=Math.ceil(rows.length/25);page=Math.max(1,Math.min(totalPages,page));
 root.innerHTML='<details data-trst-details class="trst-details" '+(expanded?'open':'')+'><summary>▤ Показать детализацию по SKU ('+qty(rows.length)+')</summary>'+
 '<div class="trst-page"><span class="trst-note">Показано '+qty((page-1)*25+1)+'–'+qty(Math.min(rows.length,page*25))+' из '+qty(rows.length)+'. Excel выгружает все позиции выбранного фильтра.</span>'+
 '<div><button class="trst-btn" data-trst-page="'+(page-1)+'" '+(page===1?'disabled':'')+'>Назад</button> <b>'+page+' / '+totalPages+'</b> <button class="trst-btn" data-trst-page="'+(page+1)+'" '+(page>=totalPages?'disabled':'')+'>Далее</button></div></div>'+
 table(rows.slice((page-1)*25,page*25))+'<p class="trst-note">Последняя отгрузка известна с точностью до месяца. Каждую строку SKU следует проверить перед фактической отгрузкой.</p></details>';
 return true;
}
w.RESANTA_TRIOVIST_STOCK_DIRECTOR_V1=Object.freeze({version:VERSION,render,loading,aggregate,readOnly:true,noDbWrites:true,noParserRuns:true});
})(window);
