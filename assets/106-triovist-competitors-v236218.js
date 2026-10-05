/* RESANTA CRM v23.6.221 · TRIOVIST / 21VEK COMPETITORS PILOT
 * Read-only analytical UI. Data is collected server-side by the daily competitor workflow.
 * Pilot: cordless drill-drivers. No writes to sales/tasks/stock/price-list.
 */
(function(){
'use strict';
if(window.RESANTA_TRIOVIST_COMPETITORS_V236218)return;
const V='v23.6.221';
let flight=null,last=null;
const E=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const N=v=>Number.isFinite(Number(v))?Number(v):null;
const money=v=>N(v)==null?'—':N(v).toLocaleString('ru-RU',{minimumFractionDigits:2,maximumFractionDigits:2})+' BYN';
const pct=v=>N(v)==null?'—':(N(v)>0?'+':'')+N(v).toFixed(1).replace('.',',')+'%';
const dt=v=>{if(!v)return'—';try{return new Date(v).toLocaleString('ru-RU',{timeZone:'Europe/Minsk',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})}catch(_){return String(v)}};
function dbx(){try{return typeof db!=='undefined'?db:window.db}catch(_){return window.db}}
async function load(force=false){
  if(last&&!force)return last;
  if(flight)return flight;
  flight=(async()=>{
    const d=dbx();if(!d?.rpc)throw Error('Соединение с базой ещё не готово');
    const call=()=>d.rpc('triovist_competitor_dashboard_v1',{});
    const r=typeof window.crmAuthRetryV236166==='function'
      ? await window.crmAuthRetryV236166(call)
      : await call();
    if(r?.error)throw r.error;
    last=r?.data||{};return last;
  })().finally(()=>flight=null);
  return flight;
}
function statusLabel(s){
  if(s==='ours_stronger')return['🟢 Мы сильнее','good'];
  if(s==='competitor_stronger')return['🔴 Конкурент сильнее','bad'];
  return['🟡 Паритет','warn'];
}
function mrcLabel(s,d){
  if(s==='critical')return['🔴 Ниже МРЦ '+pct(d),'bad'];
  if(s==='warning')return['🟠 Ниже МРЦ '+pct(d),'warn'];
  if(s==='slight')return['🟡 Ниже МРЦ '+pct(d),'warn'];
  if(s==='ok')return['🟢 МРЦ соблюдена','good'];
  return['МРЦ нет',''];
}
function specLine(k,v){
 const names={voltage_v:'Напряжение',torque_nm:'Момент',motor_type:'Двигатель',battery_capacity_ah:'АКБ',battery_count:'АКБ в комплекте',max_rpm:'Обороты',wood_mm:'Дерево',steel_mm:'Сталь',chuck_mm:'Патрон',weight_kg:'Вес',warranty_years:'Гарантия'};
 const units={voltage_v:' В',torque_nm:' Н·м',battery_capacity_ah:' А·ч',battery_count:' шт.',max_rpm:' об/мин',wood_mm:' мм',steel_mm:' мм',chuck_mm:' мм',weight_kg:' кг',warranty_years:' лет'};
 if(v==null)return'';
 let x=v;if(k==='motor_type')x=v==='brushless'?'бесщёточный':v==='brushed'?'щёточный':v;
 return '<span><b>'+E(names[k]||k)+':</b> '+E(x)+E(units[k]||'')+'</span>';
}
function details(r){
 const keys=['voltage_v','torque_nm','motor_type','battery_capacity_ah','battery_count','max_rpm','wood_mm','steel_mm','chuck_mm','weight_kg','warranty_years'];
 const a=r.our_specs||{},b=r.competitor_specs||{};
 return '<details class="tc218-details"><summary>Характеристики и аргументы</summary><div class="tc218-compare"><div><b>Наш товар</b>'+keys.map(k=>specLine(k,a[k])).filter(Boolean).join('')+'</div><div><b>Конкурент</b>'+keys.map(k=>specLine(k,b[k])).filter(Boolean).join('')+'</div></div>'
  +'<div class="tc218-ab"><div><b>Наши преимущества</b>'+((r.advantages||[]).length?'<ul>'+(r.advantages||[]).map(x=>'<li>'+E(x)+'</li>').join('')+'</ul>':'<span>—</span>')+'</div>'
  +'<div><b>Где конкурент сильнее</b>'+((r.disadvantages||[]).length?'<ul>'+(r.disadvantages||[]).map(x=>'<li>'+E(x)+'</li>').join('')+'</ul>':'<span>—</span>')+'</div></div>'
  +'<div class="tc218-rec"><b>Что делать:</b> '+E(r.recommendation||'—')+'</div>'
  +((r.sales_pitch||[]).length?'<div class="tc218-pitch"><b>Аргументы менеджеру:</b> '+(r.sales_pitch||[]).map(x=>'• '+E(x)).join(' &nbsp; ')+'</div>':'')+'</details>';
}
function rowHtml(r){
 const [sl,sc]=statusLabel(r.status),[ml,mc]=mrcLabel(r.mrc_status,r.mrc_delta_pct);
 const compLink=r.competitor_url?'<a class="tc218-link" target="_blank" rel="noopener" href="'+E(r.competitor_url)+'">21vek ↗</a>':'';
 const ourLink=r.our_product_url?'<a class="tc218-link" target="_blank" rel="noopener" href="'+E(r.our_product_url)+'">наша карточка ↗</a>':'';
 return '<div class="tc218-row"><div class="tc218-main">'
  +'<div><small>Цена конкурента</small><b>'+money(r.competitor_price)+'</b><div>'+compLink+'</div></div>'
  +'<div><small>Наш SKU</small><b>'+E(r.our_sku||'—')+'</b><span>'+E(r.our_product_name||'')+'</span><div>'+ourLink+'</div></div>'
  +'<div><small>Наша цена</small><b>'+money(r.our_price)+'</b><span>к конкуренту '+pct(r.price_delta_pct)+'</span></div>'
  +'<div><small>МРЦ</small><b>'+money(r.mrc_byn)+'</b><span class="'+mc+'">'+ml+'</span></div>'
  +'<div><small>Сопоставимость</small><b>'+pct(r.similarity_score).replace('+','')+'</b><span>оценка '+pct(r.competitiveness_score).replace('+','')+'</span></div>'
  +'<div><small>Итог</small><b class="'+sc+'">'+sl+'</b></div></div>'+details(r)+'</div>';
}
function css(){
 if(document.getElementById('tc218-css'))return;
 const s=document.createElement('style');s.id='tc218-css';s.textContent=`
 .tc218-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;flex-wrap:wrap}.tc218-note{font-size:11px;color:#64748b;line-height:1.45;margin-top:3px}.tc218-kpi{display:grid;grid-template-columns:repeat(6,minmax(110px,1fr));gap:8px;margin:12px 0}.tc218-kpi>div{background:#f8fafc;border:1px solid #e5e7eb;border-radius:10px;padding:10px}.tc218-kpi span{font-size:9px;color:#64748b;text-transform:uppercase;display:block}.tc218-kpi b{font-size:18px;display:block;margin-top:3px}.tc218-row{border:1px solid #e5e7eb;border-radius:12px;margin:10px 0;background:#fff;overflow:hidden}.tc218-main{display:grid;grid-template-columns:120px minmax(260px,2fr) 120px 130px 140px 150px;gap:10px;padding:12px;align-items:start}.tc218-main small{display:block;color:#64748b;font-size:9px;text-transform:uppercase;margin-bottom:4px}.tc218-main b{display:block;font-size:12px}.tc218-main span{display:block;font-size:10px;color:#64748b;margin-top:3px}.tc218-brand{font-size:10px;color:#0c447c;font-weight:800;text-transform:uppercase;margin-bottom:3px}.tc218-link{font-size:10px;color:#185fa5;text-decoration:none}.tc218-details{border-top:1px solid #e5e7eb;background:#fbfdff;padding:8px 12px}.tc218-details summary{cursor:pointer;font-size:11px;font-weight:800;color:#0c447c}.tc218-compare,.tc218-ab{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:9px}.tc218-compare>div,.tc218-ab>div{border:1px solid #e5e7eb;background:#fff;border-radius:9px;padding:9px}.tc218-compare span{display:block;font-size:10px;margin:3px 0}.tc218-ab{font-size:11px}.tc218-ab ul{margin:6px 0 0 17px}.tc218-rec,.tc218-pitch{margin-top:8px;padding:9px;border-radius:8px;font-size:11px}.tc218-rec{background:#eff6ff;border:1px solid #bfdbfe}.tc218-pitch{background:#f0fdf4;border:1px solid #bbf7d0}.good{color:#166534!important}.warn{color:#92400e!important}.bad{color:#b91c1c!important}.tc218-empty{padding:20px;border:1px dashed #cbd5e1;border-radius:10px;color:#64748b;text-align:center}.tc218-meta{font-size:10px;color:#64748b;margin-top:8px}.tc218-group{margin:14px 0 18px}.tc218-group-head{display:grid;grid-template-columns:120px minmax(260px,1fr) auto;gap:10px;align-items:center;margin-bottom:7px;padding:10px 12px;background:#f8fafc;border:1px solid #e5e7eb;border-radius:10px}.tc218-group-head>b{font-size:13px;color:#0c447c}.tc218-group-head span{font-size:12px;color:#111827;font-weight:700}.tc218-group-head em{font-style:normal;font-size:10px;color:#64748b;text-align:right}
 @media(max-width:1200px){.tc218-main{grid-template-columns:repeat(3,minmax(0,1fr))}.tc218-group-head{grid-template-columns:1fr}.tc218-group-head em{text-align:left}.tc218-kpi{grid-template-columns:repeat(3,minmax(0,1fr))}}
 @media(max-width:650px){.tc218-main,.tc218-compare,.tc218-ab,.tc218-kpi{grid-template-columns:1fr}.tc218-row{overflow:visible}}
 `;document.head.appendChild(s);
}
function render(panel,d){
 css();
 const s=d?.summary||{},rows=Array.isArray(d?.rows)?d.rows:[],run=d?.last_run||{},users=Array.isArray(d?.allowed_users)?d.allowed_users:[];
 const grouped=new Map();
 for(const r of rows){const k=String(r.target_id||r.competitor_brand||'');if(!grouped.has(k))grouped.set(k,[]);grouped.get(k).push(r)}
 const cards=[...grouped.values()].map(list=>{
   const first=list[0]||{};
   return '<section class="tc218-group"><div class="tc218-group-head"><b>'+E(first.competitor_brand||'Конкурент')+'</b><span>'+E(first.competitor_name||first.competitor_query||'')+'</span><em>Показано '+list.length+' ближайших наших SKU</em></div>'+list.map(rowHtml).join('')+'</section>';
 }).join('');
 panel.innerHTML='<div class="tc218-head"><div><h3 style="margin:0">⚔️ Конкуренты 21vek</h3><div class="tc218-note">Пилот: аккумуляторные дрели-шуруповёрты. Сравнение по реальным характеристикам, цене 21vek и МРЦ РБ. Ниже показаны до 5 ближайших наших SKU по каждому конкуренту — можно открыть обе карточки и проверить всё вручную. Отсутствующая характеристика не считается нулём.</div></div><button type="button" class="tr14-refresh" data-tc218-refresh>↻ Обновить экран</button></div>'
  +'<div class="tc218-kpi"><div><span>Конкурентов в пилоте</span><b>'+E(s.targets??0)+'</b></div><div><span>Данные получены</span><b>'+E(s.with_data??0)+'</b></div><div><span>Мы сильнее</span><b class="good">'+E(s.ours_stronger??0)+'</b></div><div><span>Паритет</span><b class="warn">'+E(s.parity??0)+'</b></div><div><span>Конкурент сильнее</span><b class="bad">'+E(s.competitor_stronger??0)+'</b></div><div><span>Наши ниже МРЦ</span><b class="'+((s.below_mrc||0)>0?'bad':'good')+'">'+E(s.below_mrc??0)+'</b></div></div>'
  +(cards||'<div class="tc218-empty">Сбор конкурентов уже подключён. Первый снимок ещё формируется — после успешного запуска здесь появятся реальные сравнения.</div>')
  +'<div class="tc218-meta">Последний сбор: <b>'+E(run.status||'ещё не запускался')+'</b> · '+dt(run.finished_at||run.started_at)+' · успешно '+E(run.success_count??0)+' / ошибок '+E(run.error_count??0)+'. История цен хранится в отдельных снимках и не перезаписывается. Доступ: '+E(users.length?users.join(', '):'Паюшин, Сидарович, Александренко, Кришталь')+'.</div>';
 panel.querySelector('[data-tc218-refresh]')?.addEventListener('click',async()=>{last=null;await open(panel,null,true)});
}
async function open(panel,ctx,force=false){
 if(!panel)return;
 panel.style.setProperty('display','block','important');
 panel.innerHTML='<div class="tr14-info">Загружаю конкурентный анализ 21vek…</div>';
 try{render(panel,await load(force))}catch(e){panel.innerHTML='<div class="tr14-warn"><b>Конкурентный анализ пока недоступен.</b><br>'+E(e?.message||e)+'</div>'}
}
window.RESANTA_TRIOVIST_COMPETITORS_V236218=Object.freeze({version:V,open,refresh:()=>{last=null;return load(true)},readOnly:true,pilot:'cordless_drill_drivers'});
})();