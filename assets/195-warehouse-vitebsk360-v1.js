/* Витебск 360 v1: director-only read-only physical evidence and 14-day order explain.
 * No mutations to 1C balances, stock snapshots, inventory or orders.
 */
(function(){
'use strict';
if(window.RESANTA_WAREHOUSE_VITEBSK360_V1)return;
const ID='wc-vitebsk360-v1',CSS='wc-vitebsk360-style-v1';
const state={data:null,loading:false,last:0,mode:'unmatched',search:'',offset:0,limit:50,error:'',approval:null,detailsOpen:false};
const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num=v=>v==null?null:Number(v);
const qty=v=>v==null?'Не определено':Number(v).toLocaleString('ru-RU',{maximumFractionDigits:2});
const money=v=>v==null?'Не определено':Number(v).toLocaleString('ru-RU',{minimumFractionDigits:2,maximumFractionDigits:2})+' BYN';
const day=v=>v?String(v).slice(0,10).split('-').reverse().join('.'):'—';
function isBoss(){try{const p=typeof currentProfile!=='undefined'?currentProfile:window.currentProfile;return String(p?.role||'').toLowerCase()==='boss'}catch(_){return false}}
function dbx(){try{return typeof db!=='undefined'?db:window.db}catch(_){return window.db}}
function rpc(name,args){
 const d=dbx();if(!d?.rpc)throw Error('Нет соединения с CRM');
 const fn=()=>d.rpc(name,args);
 return (typeof window.crmAuthRetryV236166==='function'?window.crmAuthRetryV236166(fn):fn())
   .then(r=>{if(r.error)throw r.error;return r.data});
}
function css(){
 if($(CSS))return;
 const style=document.createElement('style');style.id=CSS;
 style.textContent=[
 '#'+ID+'{border:1px solid #d4e2f0;background:#fff;border-radius:14px;padding:15px;margin:12px 0;color:#142639}',
 '#'+ID+' .vb360-head{display:flex;gap:10px;justify-content:space-between;align-items:start;flex-wrap:wrap}',
 '#'+ID+' h3{font-size:17px;margin:0 0 4px}#'+ID+' .vb360-sub{font-size:11px;color:#637489;line-height:1.5}',
 '#'+ID+' .vb360-kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:9px;margin:12px 0}',
 '#'+ID+' .vb360-kpi{border:1px solid #dfe7f0;background:#f6f9fd;padding:12px;border-radius:10px;min-width:0}',
 '#'+ID+' .vb360-kpi b{font-size:23px;display:block;margin:4px 0}#'+ID+' .vb360-kpi span{font-size:10px;color:#61758a}',
 '#'+ID+' .vb360-line{display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;border-top:1px solid #e3eaf2;padding:9px 0;font-size:12px}',
 '#'+ID+' .vb360-info{padding:11px;border-radius:9px;background:#eef6ff;border:1px solid #d0e2f5;line-height:1.55;font-size:12px;margin:10px 0}',
 '#'+ID+' .vb360-warn{padding:11px;border-radius:9px;background:#fff6e7;border:1px solid #f1d399;line-height:1.5;font-size:12px;margin:9px 0}',
 '#'+ID+' .vb360-formula{font-weight:700;font-size:13px;margin:6px 0;overflow-wrap:anywhere}',
 '#'+ID+' .vb360-controls{display:flex;gap:7px;flex-wrap:wrap;margin:10px 0}',
 '#'+ID+' button{font-size:12px;border:1px solid #a7c6e5;border-radius:8px;padding:7px 11px;background:#fff;color:#195b91;cursor:pointer}',
 '#'+ID+' button:disabled{opacity:.5}#'+ID+' button.vb360-active{background:#185fa5;color:#fff}',
 '#'+ID+' input{border:1px solid #c9d6e3;padding:9px;min-width:120px;border-radius:8px;flex:1;font-size:12px}',
 '#'+ID+' .vb360-row{display:grid;grid-template-columns:minmax(125px,1.6fr) 90px 90px minmax(105px,1fr);gap:10px;align-items:center;border-top:1px solid #e5edf5;padding:8px 0;font-size:12px}',
 '#'+ID+' .vb360-row small{display:block;color:#697a8c;font-size:10px}',
 '#'+ID+' .vb360-list{max-height:265px;overflow:auto}',
 '.vb360-why{border:1px solid #bdd7ec;border-radius:6px;padding:4px 7px;margin-top:5px;font-size:10px;background:#f5fbff;color:#195b91;cursor:pointer}',
 '.vb360-expanded-row td{background:#f4f8fd!important;padding:12px!important;color:#16354f!important;white-space:normal!important}',
 '.vb360-exp-card{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px;font-size:12px}',
 '.vb360-exp-card div{border:1px solid #d8e8f8;background:white;border-radius:8px;padding:9px}',
 '.vb360-exp-card span{font-size:10px;color:#62778e;display:block;line-height:1.45}',
 '.vb360-exp-note{font-size:11px;line-height:1.5;margin-top:9px;color:#44617d}',
 '@media(max-width:750px){#'+ID+' .vb360-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}#'+ID+' .vb360-row{grid-template-columns:1fr 1fr}.vb360-exp-card{grid-template-columns:1fr 1fr}}'
 ].join('');
 document.head.appendChild(style);
}
function kpi(title,val,note){return '<div class="vb360-kpi"><span>'+esc(title)+'</span><b>'+esc(val)+'</b><span>'+esc(note||'')+'</span></div>'}
function rowTitle(x){return x.source_state==='not_in_physical_snapshot'?'Нет в физическом файле 1С':x.source_state==='not_in_cost_report'?'Нет в файле себестоимости':'Оба источника найдены'}
function render(){
 const root=$(ID);if(!root)return;
 const d=state.data;
 if(root.querySelector('details')?.open)state.detailsOpen=true;
 if(!d){root.innerHTML='<div class="vb360-sub">'+esc(state.error||'Сверяю физический склад Витебск с отдельным отчётом себестоимости…')+'</div>';return}
 const fac=num(d.norm_factor)||0,exp=num(d.expense_cost_byn),opening=num(d.opening_cost_byn);
 const formula='MAX(0; '+money(opening)+' − '+money(exp)+' × '+qty(fac)+') = '+money(d.sn_overlimit_byn);
 const inv=d.active_inventory||null;
 const paged=(d.rows||[]).map(x=>'<div class="vb360-row"><div><b>'+esc(x.sku)+'</b><small>'+esc(x.product||'')+'</small></div>'+
 '<div><b>'+(x.physical_onhand==null?'Нет данных':esc(qty(x.physical_onhand)))+'</b><small>Физический</small></div>'+
 '<div>'+esc(qty(x.cost_report_closing_qty))+'<small>Отчёт себес.</small></div>'+
 '<div><b>'+esc(rowTitle(x))+'</b><small>'+esc(x.unit_cost_byn==null?'Стоимость неизвестна':money(x.unit_cost_byn)+' /шт.')+'</small></div></div>').join('');
 root.innerHTML='<div class="vb360-head"><div><h3>Склад Витебск 360°</h3><div class="vb360-sub">Только физический склад «Витебск» · снимок '+esc(day(d.stock_date))+' · данные 1С</div></div><button data-vb360-refresh>↻ Проверить источники</button></div>'+
 '<div class="vb360-kpis">'+kpi('На руках',qty(d.onhand_qty)+' шт.','Физический остаток')+
 kpi('Свободно',qty(d.free_qty)+' шт.','Доступно к отгрузке')+
 kpi('Резерв',qty(d.reserve_qty)+' шт.','Отдельно от свободного')+
 kpi('Другие ограничения',qty(d.other_unavailable_qty)+' шт.','Не приписываем к резерву')+'</div>'+
 '<div class="vb360-info"><b>Месячная норма · '+esc(day(d.cost_month))+'</b>'+
 '<div class="vb360-formula">'+esc(formula)+'</div>'+
 '<div class="vb360-sub">Начальный остаток и расход взяты из отчёта 1С по себестоимости за '+esc(day(d.cost_date))+
 '. Коэффициент месяца: ×'+esc(qty(fac))+'. Остаток по себестоимости: '+esc(money(d.closing_cost_byn))+
 '. Эти деньги не складываются с физическим количеством SKU и не считаются текущей рыночной стоимостью.</div></div>'+
 '<div class="vb360-warn"><b>Сверка двух источников: '+esc(d.unmatched_sku)+' SKU без однозначного соответствия</b>'+
 ' · из них '+esc(d.cost_skus_not_in_physical_positive)+' имеют положительное количество в отчёте себестоимости.'+
 ' Их физическое количество неизвестно — не подставляем ноль и не включаем в автозаказ.'+
 '<div class="vb360-sub">Складской файл: '+esc(d.stock_rows)+' SKU · файл себестоимости: '+esc(d.cost_rows)+' SKU. Чехов (справочно): '+esc(day(d.chekhov_date_reference_only))+'.</div></div>'+
 (inv?'<div class="vb360-info"><b>Открытая инвентаризация</b> · '+esc(day(inv.started_at))+
 ' · исходный остаток '+esc(day(inv.stock_report_date))+' · '+esc(inv.sku_count)+' SKU, '+esc(qty(inv.stock_onhand))+
 ' шт. <div class="vb360-sub">Физическая база инвентаризации зафиксирована на дату старта. Новый снимок от '+esc(day(d.stock_date))+' не заменяет её.</div></div>':'')+
 '<details '+(state.detailsOpen?'open':'')+'><summary><b>Сопоставление SKU · '+esc(d.unmatched_sku)+' расхождений</b></summary>'+
 '<div class="vb360-controls"><button data-vb360-mode="unmatched" class="'+(state.mode==='unmatched'?'vb360-active':'')+'">Только расхождения</button>'+
 '<button data-vb360-mode="all" class="'+(state.mode==='all'?'vb360-active':'')+'">Все SKU</button>'+
 '<input data-vb360-search placeholder="Артикул или товар" value="'+esc(state.search)+'"><button data-vb360-find>Найти</button></div>'+
 '<div class="vb360-list">'+(paged||'<div class="vb360-sub">Нет товаров по фильтру.</div>')+'</div>'+
 '<div class="vb360-controls"><span class="vb360-sub">Показано '+(d.rows||[]).length+' из '+esc(d.total)+
 ' · неизвестный остаток ≠ 0</span><button data-vb360-prev '+(state.offset<=0?'disabled':'')+'>←</button>'+
 '<button data-vb360-next '+(state.offset+(d.rows||[]).length>=Number(d.total)?'disabled':'')+'>→</button></div></details>'+
 '<div class="vb360-sub">Автозаказ — только проект для согласования. В 1С и на склад Чехова ничего автоматически не отправляется.</div>'+
 (state.approval?.approval_id?'<div class="vb360-info"><b>Последний согласованный автозаказ</b> · '+esc(day(state.approval.approved_at))+
 ' · '+esc(state.approval.sku_count)+' SKU · '+esc(qty(state.approval.units))+' шт. · '+esc(money(state.approval.cost_byn))+
 '. Снимок Витебска: '+esc(day(state.approval.stock_report_date))+
 (state.approval.stock_report_date!==d.stock_date?' · <b>Снимок изменился, необходимо новое согласование.</b>':' · совпадает с текущим')+
 '. Отправка в 1С: <b>не выполнялась автоматически</b>.</div>':
 '<div class="vb360-info">Согласованного проекта автозаказа пока нет. CRM не отправляет товар в 1С и Чехов без отдельного действия руководителя.</div>');
 root.querySelector('details')?.addEventListener('toggle',e=>{state.detailsOpen=e.currentTarget.open});
 root.querySelector('[data-vb360-refresh]')?.addEventListener('click',()=>load(true));
 root.querySelectorAll('[data-vb360-mode]').forEach(b=>b.addEventListener('click',()=>{state.mode=b.dataset.vb360Mode;state.offset=0;load(true)}));
 root.querySelector('[data-vb360-find]')?.addEventListener('click',()=>{state.search=root.querySelector('[data-vb360-search]')?.value.trim()||'';state.offset=0;load(true)});
 root.querySelector('[data-vb360-search]')?.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();root.querySelector('[data-vb360-find]')?.click()}});
 root.querySelector('[data-vb360-prev]')?.addEventListener('click',()=>{state.offset=Math.max(0,state.offset-state.limit);load(true)});
 root.querySelector('[data-vb360-next]')?.addEventListener('click',()=>{state.offset+=state.limit;load(true)});
}
async function load(force=false){
 if(!isBoss())return;
 if(state.loading)return;
 if(!force&&state.data&&Date.now()-state.last<90000){render();return}
 state.loading=true;
 try{
  const [data,approval]=await Promise.all([
   rpc('warehouse_vitebsk360_truth_v1',{
    p_mode:state.mode,p_search:state.search,p_limit:state.limit,p_offset:state.offset
   }),rpc('warehouse_vitebsk360_last_approval_v1',{}).catch(e=>({error:String(e?.message||e)}))
  ]);
  state.data=data;state.approval=approval;state.last=Date.now();state.error='';
 }catch(e){state.error='Источник склада Витебск временно недоступен: '+(e?.message||e)}
 finally{state.loading=false;render()}
}
function mount(){
 if(!isBoss())return;
 const host=$('wc-v23620'),tabs=host?.querySelector('.wc-tabs');if(!host||!tabs)return;
 let root=$(ID);
 if(!root){css();root=document.createElement('section');root.id=ID;tabs.before(root);state.data=null;state.last=0;load(true)}
 else if(state.data&&!root.querySelector('.vb360-kpis'))render();
}
function explanation(r,data,kind){
 if(kind==='excess'){
  const info=[
   ['Прогноз месяца',qty(r.forecast_qty)+' шт.'],
   ['Норма запаса',qty(r.norm_target_qty)+' шт.'],
   ['Дней нормативного запаса',qty(r.norm_days)+' дн.'],
   ['Свободно Витебск',qty(r.vitebsk_avail)+' шт.'],
   ['Излишек',qty(r.excess_qty)+' шт.'],
   ['Стоимость излишка',money(r.excess_cost_byn)]
  ];
  return '<div class="vb360-exp-card">'+info.map(x=>'<div><span>'+esc(x[0])+'</span><b>'+esc(x[1])+'</b></div>').join('')+
   '</div><div class="vb360-exp-note">Нормативный запас = месячный прогноз × коэффициент склада '+esc(qty(data?.norm_factor??1.25))+
   '. Излишек SKU = MAX(0; свободный Витебск − нормативный запас). Это не денежная формула SN.'+
   '<br>Источники: Витебск '+esc(day(data?.vitebsk_stock_date))+' · отчёт себестоимости '+esc(day(data?.report_date))+'.</div>';
 }

 const known=r.vitebsk_avail!==null&&r.vitebsk_avail!==undefined;
 const days=Number(data?.order_cycle_days||14),demand=num(r.monthly_forecast_qty);
 const t=known?qty(r.order_target_qty):'Нет данных';
 const forecast=r.forecast_source||'Нет данных';
 const parts=[
 ['Спрос за месяц',qty(demand)+' шт.'],['Среднее за 3 мес.',qty(r.avg3_qty)+' шт.'],
 ['Аналогичный месяц год назад',qty(r.ly_qty)+' шт.'],['Расход текущего месяца',qty(r.current_positive_qty??r.expense_qty)+' шт.'],
 ['Цель на '+days+' дней',t+' шт.'],['Витебск · свободно',known?qty(r.vitebsk_avail)+' шт.':'НЕИЗВЕСТНО'],
 ['Дефицит',known?qty(r.need_qty)+' шт.':'НЕИЗВЕСТНО'],['Чехов · доступный остаток',qty(r.chekhov_qty)+' шт.'],
 ['Кратность коробки',qty(r.box_qty)+' шт.'],['Рекомендовано',known?qty(r.recommended_order_qty)+' шт.':'НЕ ОПРЕДЕЛЕНО'],
 ['Сумма по себестоимости',known?money(r.estimated_order_cost_byn):'Не определено']
 ];
 return '<div class="vb360-exp-card">'+parts.map(x=>'<div><span>'+esc(x[0])+'</span><b>'+esc(x[1])+'</b></div>').join('')+'</div>'+
 '<div class="vb360-exp-note"><b>Как считается:</b> прогноз на месяц / дней в месяце × '+days+
 ' дней, округление вверх до целых единиц; затем вычитается свободный остаток Витебска.'+
 ' Заказ округляется по коробкам и ограничивается наличием Чехова.'+
 '<br><b>Откуда прогноз:</b> '+esc(forecast)+'. Позиция не включается в заказ, если физический остаток неизвестен.'+
 '<br><b>Даты:</b> физический Витебск '+esc(day(data?.vitebsk_stock_date))+
 '; Чехов '+esc(day(data?.chekhov_stock_date))+'; себестоимость '+esc(day(data?.report_date))+
 '. Если источники устарели, цифры требуют перепроверки.'+
 '<br>Это рекомендация для руководителя. Отгрузки и заявки в 1С не создаются.</div>';
}
function attachOrderRows(rows,data,mode,tableHost){
 if(!isBoss()||!Array.isArray(rows)||!tableHost||!['order','stockout','all','excess'].includes(mode))return;
 const trs=tableHost.querySelectorAll('tbody tr');
 if(trs.length!==rows.length)return;
 trs.forEach((tr,i)=>{
  const r=rows[i];
  if(tr.querySelector('.vb360-why'))return;
  const titleCell=tr.querySelector('td');
  if(!titleCell)return;
  const button=document.createElement('button');
  button.type='button';button.className='vb360-why';
  button.textContent=mode==='excess'?'Почему перелимит?':'Почему столько?';
  button.setAttribute('aria-expanded','false');
  button.addEventListener('click',()=>{
    const already=button.getAttribute('aria-expanded')==='true';
    const other=tableHost.querySelector('.vb360-expanded-row');
    if(other){other.previousElementSibling?.querySelector('.vb360-why')?.setAttribute('aria-expanded','false');other.remove()}
    if(already)return;
    const detail=document.createElement('tr');detail.className='vb360-expanded-row';
    const cell=document.createElement('td');cell.colSpan=tr.children.length;cell.innerHTML=explanation(r,data,mode);
    detail.appendChild(cell);tr.after(detail);button.setAttribute('aria-expanded','true');
  });
  titleCell.appendChild(button);
 });
 if(mode==='order')installApprovalActions(data,tableHost);
}
function safeCsv(v){
 let s=String(v??'');
 if(/^[\s]*[=+@-]/.test(s))s="'"+s;
 return '"'+s.replace(/"/g,'""')+'"';
}
async function exportApproved(id){
 if(!id)return;
 const doc=await rpc('warehouse_vitebsk360_approved_document_v1',{p_approval_id:id});
 const items=doc.items||[];
 if(!items.length)throw Error('Согласованная заявка не содержит товаров');
 const headers=['Артикул','Наименование','Витебск свободно','Прогноз месяц','Цель 14 дней','Дефицит','Чехов','Коробка','Утверждено шт.','Оценка BYN','Источник прогноза'];
 const lines=[
 ['Согласованный проект автозаказа Витебск','№ '+doc.id].map(safeCsv).join(';'),
 ['Утвердил',doc.approved_by_email,'Дата',doc.approved_at].map(safeCsv).join(';'),
 ['Остаток Витебск',doc.stock_report_date,'Себестоимость',doc.cost_report_date,'Чехов',doc.chekhov_snapshot_date].map(safeCsv).join(';'),
 ['Статус передачи','НЕ ОТПРАВЛЕНО В 1С / ЧЕХОВ'].map(safeCsv).join(';'),'',headers.map(safeCsv).join(';'),
 ...items.map(r=>[r.sku,r.product,r.vitebsk_free,r.forecast_qty,r.target_qty,r.need_qty,r.chekhov_qty,r.box_qty,r.approved_qty,r.cost_byn,r.forecast_source].map(safeCsv).join(';'))
 ];
 const blob=new Blob(['\ufeff'+lines.join('\r\n')],{type:'text/csv;charset=utf-8'});
 const url=URL.createObjectURL(blob),a=document.createElement('a');
 a.href=url;a.download='Согласованный_автозаказ_Витебск_'+String(doc.id).slice(0,8)+'.csv';
 document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function installApprovalActions(data,tableHost){
 const toolbar=tableHost.querySelector('.wc-tools');
 if(!toolbar||toolbar.querySelector('[data-vb360-approve]'))return;
 const btn=document.createElement('button');
 btn.type='button';btn.textContent='✓ Согласовать проект автозаказа';
 btn.dataset.vb360Approve='1';btn.className='primary';
 const ack=document.createElement('div');ack.style.cssText='font-size:11px;line-height:1.5;color:#325c80;flex-basis:100%';
 ack.textContent='Руководитель утверждает весь проект из '+Number(data.total||0)+' SKU, не только текущую страницу. Запись в 1С и Чехов не выполняется.';
 btn.addEventListener('click',async()=>{
  if(!data.report_date||!data.vitebsk_stock_date)return alert('Нет подтверждённых дат источников 1С');
  const msg='Согласовать проект автозаказа по всем '+Number(data.total||0)+' SKU?\n'+
    'Витебск: '+day(data.vitebsk_stock_date)+'; себестоимость: '+day(data.report_date)+
    '; Чехов: '+day(data.chekhov_stock_date)+'.\n'+
    'CRM ещё раз пересчитает все позиции на сервере. Ничего не отправится в 1С или Чехов. Продолжить?';
  if(!confirm(msg))return;
  btn.disabled=true;btn.textContent='Проверяю и согласовываю…';
  try{
   const approval=await rpc('warehouse_vitebsk360_approve_order_v1',{
    p_expected_cost_date:data.report_date,p_expected_stock_date:data.vitebsk_stock_date,p_note:'Согласовано руководителем в интерфейсе Витебск 360°'
   });
   ack.textContent='✓ Проект согласован · '+approval.sku_count+' SKU · '+qty(approval.units)+' шт. · '+money(approval.cost_byn)+
    ' · №'+approval.approval_id+'. В 1С и Чехов ничего не отправлено.';
   state.approval=await rpc('warehouse_vitebsk360_last_approval_v1',{}).catch(()=>approval);
   const exp=toolbar.querySelector('[data-vb360-approved-export]');
   if(exp)exp.remove();
   addApprovedExport(toolbar,approval.approval_id,ack);
   btn.textContent='✓ Согласовано';
  }catch(e){
   ack.textContent='Критическая проверка не пройдена: '+String(e?.message||e);
   btn.textContent='✓ Повторить согласование';
  }finally{btn.disabled=false}
 });
 toolbar.appendChild(btn);
 const a=state.approval;
 if(a?.approval_id&&a.stock_report_date===data.vitebsk_stock_date
     &&a.cost_report_date===data.report_date){
  addApprovedExport(toolbar,a.approval_id,ack);
 }
 toolbar.appendChild(ack);
}
function addApprovedExport(toolbar,id,ack){
 const btn=document.createElement('button');
 btn.type='button';btn.dataset.vb360ApprovedExport='1';
 btn.textContent='⬇ Согласованная заявка (CSV)';
 btn.addEventListener('click',async()=>{
  btn.disabled=true;
  try{await exportApproved(id);ack.textContent='Скачан согласованный проект №'+id+'. Отправка в 1С/Чехов не выполнялась.'}
  catch(e){ack.textContent='Ошибка выгрузки согласованной заявки: '+String(e?.message||e)}
  finally{btn.disabled=false}
 });
 toolbar.appendChild(btn);
}
window.crmWarehouseVitebsk360V1=Object.freeze({mount,refresh:()=>load(true),attachOrderRows,readOnly:true,version:'2026-11-09-v1'});
window.RESANTA_WAREHOUSE_VITEBSK360_V1=true;
document.addEventListener('click',e=>{if(e.target?.closest?.('#nav-warehouse-control'))setTimeout(mount,350)},true);
window.addEventListener('focus',()=>{
 if(document.getElementById('page-warehouse-control')?.classList.contains('active'))mount();
},{passive:true});
[500,1600,4000].forEach(ms=>setTimeout(()=>{
 if(document.getElementById('page-warehouse-control')?.classList.contains('active'))mount();
},ms));
})();
