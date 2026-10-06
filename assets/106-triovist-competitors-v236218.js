/* RESANTA CRM v23.6.236 · TRIOVIST / 21VEK AUTOMATIC MARKET
 * Automatic market map from the first two 21vek ranking pages.
 * Separate read-only analytical contour; production own-card parser is untouched.
 */
(function(){
'use strict';
if(window.RESANTA_TRIOVIST_COMPETITORS_V236218)return;
const V='v23.6.236',TTL=30000;
let flight=null,last=null,lastAt=0,listingFlight=null,listingCache=new Map(),exportFlight=null,xlsxFlight=null;
const E=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const N=v=>Number.isFinite(Number(v))?Number(v):null;
const money=v=>N(v)==null||N(v)<=0?'нет данных':N(v).toLocaleString('ru-RU',{minimumFractionDigits:2,maximumFractionDigits:2})+' BYN';
const pct=v=>N(v)==null?'—':(N(v)>0?'+':'')+N(v).toFixed(1).replace('.',',')+'%';
const dt=v=>{if(!v)return'—';try{return new Date(v).toLocaleString('ru-RU',{timeZone:'Europe/Minsk',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})}catch(_){return String(v)}};
function dbx(){try{return typeof db!=='undefined'?db:window.db}catch(_){return window.db}}
async function rpc(name,args={}){
 const d=dbx();if(!d?.rpc)throw Error('Соединение с базой ещё не готово');
 const call=()=>d.rpc(name,args);
 const r=typeof window.crmAuthRetryV236166==='function'?await window.crmAuthRetryV236166(call):await call();
 if(r?.error)throw r.error;return r?.data||{};
}
async function load(force=false){
 if(last&&!force&&Date.now()-lastAt<TTL)return last;
 if(flight)return flight;
 flight=rpc('triovist_market_dashboard_v236224',{}).then(d=>{last=d;lastAt=Date.now();return d}).finally(()=>flight=null);
 return flight;
}
async function loadListing(days=7,force=false){
 const d=[1,3,7,14,30].includes(Number(days))?Number(days):7;
 const cached=listingCache.get(d);
 if(cached&&!force&&Date.now()-cached.at<TTL)return cached.data;
 if(listingFlight)return listingFlight;
 listingFlight=rpc('triovist_market_own_listing_v236235',{p_days:d})
  .then(data=>{listingCache.set(d,{data,at:Date.now()});return data})
  .finally(()=>listingFlight=null);
 return listingFlight;
}
function statusLabel(s){
 if(s==='ours_stronger')return['🟢 Мы сильнее','good'];
 if(s==='competitor_stronger')return['🔴 Конкурент сильнее','bad'];
 if(s==='parity')return['🟡 Паритет','warn'];
 return['—',''];
}
function gradeLabel(g){
 return ({direct:'Прямой аналог',close:'Близкий аналог',conditional:'Условный аналог',no_direct:'Не аналог'})[g]||'—';
}
function specLine(k,v){
 if(v==null)return'';
 const names={
  power_w:'Мощность обогрева',area_m2:'Площадь обогрева',heater_type:'Нагревательный элемент',thermostat_type:'Термостат',
  control_type:'Управление',display_present:'Наличие дисплея',power_adjustment:'Регулировка мощности',temperature_adjustment:'Регулировка температуры',power_modes:'Количество режимов мощности',overheat_protection:'Защита от перегрева',
  ip_rating:'Влагозащита',installation_type:'Установка',weight_kg:'Вес',sections_count:'Секции',
  fuel_type:'Тип нагрева',airflow_m3h:'Воздушный поток',fuel_consumption_kgh:'Расход топлива',
  tank_l:'Бак',width_mm:'Ширина',humidistat:'Гигростат',noise_db:'Шум',output_mlh:'Производительность',
  base_type:'Цоколь',color_temp_k:'Цветовая температура',luminous_flux_lm:'Световой поток',bulb_shape:'Форма',
  engine_cc:'Объём двигателя',bar_length_cm:'Шина',chain_pitch_in:'Шаг цепи',drive_links:'Звенья',
  fuel_tank_l:'Топливный бак',chain_speed_ms:'Скорость цепи',motor_position:'Двигатель',
  tool_free_tension:'Натяжение без инструмента',voltage_v:'Напряжение',equipment:'Комплектация',
  width_mm:'Ширина',height_mm:'Высота',depth_mm:'Глубина'
 };
 const units={power_w:' Вт',area_m2:' м²',power_modes:' шт.',weight_kg:' кг',sections_count:' шт.',
  airflow_m3h:' м³/ч',fuel_consumption_kgh:' кг/ч',tank_l:' л',width_mm:' мм',noise_db:' дБ',
  output_mlh:' мл/ч',color_temp_k:' K',luminous_flux_lm:' лм',engine_cc:' см³',bar_length_cm:' см',
  chain_pitch_in:'"',drive_links:' шт.',fuel_tank_l:' л',chain_speed_ms:' м/с',voltage_v:' В',width_mm:' мм',height_mm:' мм',depth_mm:' мм'};
 const x=typeof v==='boolean'?(v?'да':'нет'):v;
 return '<span><b>'+E(names[k]||k)+':</b> '+E(x)+E(units[k]||'')+'</span>';
}
function convectorResult(k,a,b){
 if(a==null||b==null)return 'нет данных';
 if(k==='power_w'){
  const av=N(a),bv=N(b);if(av==null||bv==null)return 'нет данных';
  const d=Math.abs(av-bv)/Math.max(Math.abs(av),Math.abs(bv),1);
  if(d<=.05)return 'полное совпадение';
  if(d<=.10)return 'близкое совпадение';
  if(d<=.20)return 'частичное совпадение';
  return 'существенное отличие';
 }
 if(typeof a==='boolean'||typeof b==='boolean')return Boolean(a)===Boolean(b)?'совпадает':'отличается';
 const na=String(a).trim().toLowerCase(),nb=String(b).trim().toLowerCase();
 return na===nb||na.includes(nb)||nb.includes(na)?'совпадает':'отличается';
}
function convectorValue(k,v){
 if(v==null)return 'нет данных';
 if(typeof v==='boolean')return v?'есть':'нет';
 if(k==='power_w')return E(v)+' Вт';
 return E(v);
}
function chainsawResult(k,a,b){
 if(a==null||b==null)return 'нет данных';
 const av=N(a),bv=N(b);if(av==null||bv==null)return 'нет данных';
 const d=Math.abs(av-bv);
 if(k==='engine_cc'){
  if(d<=3)return 'полное совпадение · разница '+d.toFixed(1).replace('.',',')+' см³';
  if(d<=5)return 'близкое совпадение · разница '+d.toFixed(1).replace('.',',')+' см³';
  if(d<=8)return 'частичное совпадение · разница '+d.toFixed(1).replace('.',',')+' см³';
  return 'существенное отличие · разница '+d.toFixed(1).replace('.',',')+' см³';
 }
 if(k==='power_w'){
  if(d<=200)return 'полное совпадение · разница '+Math.round(d)+' Вт';
  if(d<=350)return 'близкое совпадение · разница '+Math.round(d)+' Вт';
  if(d<=500)return 'частичное совпадение · разница '+Math.round(d)+' Вт';
  return 'существенное отличие · разница '+Math.round(d)+' Вт';
 }
 return '—';
}
function chainsawValue(k,v){
 if(v==null)return 'нет данных';
 if(k==='engine_cc')return E(v)+' см³';
 if(k==='power_w')return E(v)+' Вт';
 return E(v);
}
function listingKey(scope,sku){return String(scope||'')+'|'+String(sku||'')}
function listingRowsMap(listing){
 const m=new Map();for(const x of (listing?.rows||[]))m.set(listingKey(x.scope_key,x.sku),x);return m;
}
function listingSummaryMap(listing){
 const m=new Map();for(const x of (listing?.summary||[]))m.set(String(x.scope_key||''),x);return m;
}
function listingPos(l){
 if(!l)return 'не найдено';
 if(l.listing_state==='no_card')return 'нет карточки';
 if(l.listing_state==='top120'&&N(l.position)!=null)return '#'+N(l.position);
 return '>120';
}
function listingPastPos(l){
 if(!l||!l.past_date)return null;
 if(l.past_state==='top120'&&N(l.past_position)!=null)return '#'+N(l.past_position);
 if(l.past_state==='outside_top120')return '>120';
 if(l.past_state==='no_card')return 'нет карточки';
 return '—';
}
function listingTrendClass(l){
 if(!l)return '';
 if(l.trend==='up'||l.trend==='new')return 'good';
 if(l.trend==='down'||(l.trend==='outside'&&l.past_state==='top120'))return 'bad';
 if(l.trend==='stable')return 'warn';
 return '';
}
function listingTrendText(l,days){
 if(!l)return 'позиция ещё не загружена';
 if(l.listing_state==='no_card')return 'нет карточки 21vek';
 if(l.trend==='new')return '↑ вошёл в TOP-120';
 if(l.listing_state==='outside_top120'){
  if(l.past_state==='top120')return '↓ вышел из TOP-120';
  return 'вне TOP-120';
 }
 if(l.trend==='no_history')return 'история накапливается';
 const d=N(l.position_delta);
 if(l.trend==='up'&&d!=null)return '↑ +'+d+' за '+days+'д';
 if(l.trend==='down'&&d!=null)return '↓ '+d+' за '+days+'д';
 if(l.trend==='stable')return '→ без изменений за '+days+'д';
 return 'история накапливается';
}
function listingInline(l,days){
 const past=listingPastPos(l);
 return '<span class="tm224-own-pos"><b>Листинг 21vek: '+E(listingPos(l))+'</b></span>'
  +'<span class="'+listingTrendClass(l)+'">'+E(listingTrendText(l,days))+(past?' · было '+E(past):'')+'</span>';
}
function listingHistoryBlock(l){
 if(!l)return '';
 const hist=Array.isArray(l.history)?l.history:[];
 const xs=hist.slice(0,12).map(x=>{
  const p=x.state==='top120'&&N(x.position)!=null?'#'+N(x.position):(x.state==='outside_top120'?'>120':'нет карточки');
  return '<span><b>'+E(String(x.date||'').slice(5))+'</b> '+E(p)+'</span>';
 }).join('');
 return '<div class="tm224-listing-history"><b>История нашего листинга 21vek</b>'
  +(xs?'<div>'+xs+'</div>':'<small>История начнёт накапливаться после ежедневных сборов.</small>')+'</div>';
}
function details(r,l){
 const a=r.our_specs||{},b=r.competitor_specs||{};
 if(r.profile_key==='convector'){
  const keys=[
   ['heater_type','Нагревательный элемент'],
   ['power_w','Мощность обогрева'],
   ['power_adjustment','Регулировка мощности'],
   ['temperature_adjustment','Регулировка температуры'],
   ['thermostat_type','Термостат'],
   ['control_type','Управление'],
   ['display_present','Наличие дисплея']
  ];
  const body=keys.map(([k,n])=>'<tr><td><b>'+E(n)+'</b></td><td>'+convectorValue(k,b[k])+'</td><td>'+convectorValue(k,a[k])+'</td><td>'+E(convectorResult(k,a[k],b[k]))+'</td></tr>').join('');
  const area='<div class="tm224-ref"><b>Справочно — площадь обогрева:</b> конкурент '+(b.area_m2==null?'нет данных':E(b.area_m2)+' м²')+' · наш товар '+(a.area_m2==null?'нет данных':E(a.area_m2)+' м²')+'. <b>В сопоставимости не участвует.</b></div>';
  return '<details class="tm224-details"><summary>Характеристики и аргументы</summary>'
   +'<div class="tm224-conv-table"><table><thead><tr><th>Характеристика</th><th>Конкурент</th><th>Наш товар</th><th>Результат</th></tr></thead><tbody>'+body+'</tbody></table></div>'+area
   +listingHistoryBlock(l)
   +'<div class="tm224-ab"><div><b>Наши подтверждённые преимущества</b>'+((r.advantages||[]).length?'<ul>'+(r.advantages||[]).map(x=>'<li>'+E(x)+'</li>').join('')+'</ul>':'<span>—</span>')+'</div>'
   +'<div><b>Где конкурент сильнее</b>'+((r.disadvantages||[]).length?'<ul>'+(r.disadvantages||[]).map(x=>'<li>'+E(x)+'</li>').join('')+'</ul>':'<span>—</span>')+'</div></div>'
   +'<div class="tm224-rec"><b>Что делать:</b> '+E(r.recommendation||r.gap_reason||'—')+'</div></details>';
 }
 if(r.profile_key==='chainsaw_gas'){
  const keys=[['engine_cc','Объём двигателя'],['power_w','Мощность']];
  const body=keys.map(([k,n])=>'<tr><td><b>'+E(n)+'</b></td><td>'+chainsawValue(k,b[k])+'</td><td>'+chainsawValue(k,a[k])+'</td><td>'+E(chainsawResult(k,a[k],b[k]))+'</td></tr>').join('');
  return '<details class="tm224-details"><summary>Характеристики и аргументы</summary>'
   +'<div class="tm224-conv-table"><table><thead><tr><th>Характеристика</th><th>Конкурент</th><th>Наш товар</th><th>Результат</th></tr></thead><tbody>'+body+'</tbody></table></div>'
   +'<div class="tm224-ref"><b>Техническая сопоставимость бензопил:</b> только объём двигателя 50% + мощность 50%. Остальные характеристики на процент не влияют.</div>'
   +listingHistoryBlock(l)
   +'<div class="tm224-ab"><div><b>Наши подтверждённые преимущества</b>'+((r.advantages||[]).length?'<ul>'+(r.advantages||[]).map(x=>'<li>'+E(x)+'</li>').join('')+'</ul>':'<span>—</span>')+'</div>'
   +'<div><b>Где конкурент сильнее</b>'+((r.disadvantages||[]).length?'<ul>'+(r.disadvantages||[]).map(x=>'<li>'+E(x)+'</li>').join('')+'</ul>':'<span>—</span>')+'</div></div>'
   +'<div class="tm224-rec"><b>Что делать:</b> '+E(r.recommendation||r.gap_reason||'—')+'</div></details>';
 }
 const keys=[...new Set([...Object.keys(a),...Object.keys(b)])];
 return '<details class="tm224-details"><summary>Характеристики и аргументы</summary>'
  +'<div class="tm224-compare"><div><b>Наш товар</b>'+keys.map(k=>specLine(k,a[k])).filter(Boolean).join('')+'</div>'
  +'<div><b>Конкурент</b>'+keys.map(k=>specLine(k,b[k])).filter(Boolean).join('')+'</div></div>'
  +listingHistoryBlock(l)
  +'<div class="tm224-ab"><div><b>Наши подтверждённые преимущества</b>'+((r.advantages||[]).length?'<ul>'+(r.advantages||[]).map(x=>'<li>'+E(x)+'</li>').join('')+'</ul>':'<span>—</span>')+'</div>'
  +'<div><b>Где конкурент сильнее</b>'+((r.disadvantages||[]).length?'<ul>'+(r.disadvantages||[]).map(x=>'<li>'+E(x)+'</li>').join('')+'</ul>':'<span>—</span>')+'</div></div>'
  +'<div class="tm224-rec"><b>Что делать:</b> '+E(r.recommendation||r.gap_reason||'—')+'</div></details>';
}
function historyText(r){
 const p7=N(r.price_7d),p30=N(r.price_30d),x7=N(r.position_7d),x30=N(r.position_30d);
 const xs=[];
 if(p7!=null&&p7>0)xs.push('7д: '+money(p7));
 if(p30!=null&&p30>0)xs.push('30д: '+money(p30));
 if(x7!=null)xs.push('позиция 7д: '+x7);
 if(x30!=null)xs.push('30д: '+x30);
 return xs.length?xs.join(' · '):'История накопится после следующих сборов';
}
function rowHtml(r,ownMap,days){
 const gap=!!r.is_gap,[sl,sc]=statusLabel(r.status),pos=N(r.position),cp=N(r.competitor_price),priceMissing=cp==null||cp<=0;
 const lp=gap?null:ownMap.get(listingKey(r.scope_key,r.our_sku));
 return '<div class="tm224-row '+(gap?'gap':'')+'"><div class="tm224-main">'
  +'<div><small>Позиция 21vek</small><b class="'+(pos!=null&&pos<=10?'bad':'')+'">#'+E(pos??'—')+'</b><span>страница '+E(r.page_no??'—')+'</span></div>'
  +'<div><small>Конкурент</small><b>'+E(r.brand||'—')+'</b><span>'+E(r.model||'')+'</span>'+(r.product_url?'<a target="_blank" rel="noopener" href="'+E(r.product_url)+'">21vek ↗</a>':'')+'</div>'
  +'<div><small>Цена конкурента</small><b>'+money(r.competitor_price)+'</b><span>'+E(historyText(r))+'</span></div>'
  +(gap?'<div class="tm224-gapbox"><small>Наша матрица</small><b>⚠ Пробел в ассортименте</b><span>лучшее совпадение '+pct(r.best_similarity).replace('+','')+'</span></div>'
    :'<div><small>Наш SKU</small><b>'+E(r.our_sku||'—')+'</b><span>'+E(r.our_product_name||'')+'</span>'+listingInline(lp,days)+(r.our_product_url?'<a target="_blank" rel="noopener" href="'+E(r.our_product_url)+'">наша карточка ↗</a>':'')+'</div>')
  +(gap?'':('<div><small>Наша цена / МРЦ</small><b>'+money(r.our_price)+' / '+money(r.mrc_byn)+'</b><span class="'+(N(r.mrc_delta_pct)<0?'bad':'good')+'">от МРЦ '+pct(r.mrc_delta_pct)+'</span></div>'
   +'<div><small>Сопоставимость</small><b>'+pct(r.similarity_score).replace('+','')+'</b><span>'+E(gradeLabel(r.analog_grade))+'</span></div>'
   +'<div><small>Итог</small><b class="'+sc+'">'+sl+'</b><span>'+(priceMissing?'сравнение цены невозможно':'цена к конкуренту '+pct(r.price_delta_pct))+'</span></div>'))
  +'</div>'+details(r,lp)+'</div>';
}
function css(){
 if(document.getElementById('tm224-css'))return;
 const s=document.createElement('style');s.id='tm224-css';s.textContent=`
 .tm224-head{display:flex;justify-content:space-between;gap:10px;align-items:flex-start;flex-wrap:wrap}.tm224-note{font-size:11px;color:#64748b;line-height:1.45;max-width:900px}.tm224-actions{display:flex;gap:7px;flex-wrap:wrap}
 .tm224-kpi{display:grid;grid-template-columns:repeat(8,minmax(95px,1fr));gap:7px;margin:12px 0}.tm224-kpi>div{background:#f8fafc;border:1px solid #e5e7eb;border-radius:10px;padding:9px}.tm224-kpi span{font-size:8px;color:#64748b;text-transform:uppercase;display:block}.tm224-kpi b{font-size:16px;display:block;margin-top:3px}
 .tm224-filters{display:grid;grid-template-columns:1.25fr .9fr .9fr .8fr .9fr 1fr;gap:8px;padding:10px;border:1px solid #e5e7eb;border-radius:10px;background:#fff;margin-bottom:10px}.tm224-filters select,.tm224-filters input{min-height:38px;border:1px solid #cbd5e1;border-radius:8px;padding:7px;background:#fff}
 .tm224-toggles{display:flex;gap:12px;flex-wrap:wrap;grid-column:1/-1;font-size:11px}.tm224-toggles label{display:flex;gap:5px;align-items:center}
 .tm224-scope{border:1px solid #dbe4ee;border-radius:12px;padding:10px;margin:10px 0;background:#fbfdff}.tm224-scope-head{display:flex;justify-content:space-between;gap:8px;align-items:center;flex-wrap:wrap}.tm224-brands{display:flex;gap:6px;flex-wrap:wrap;margin-top:7px}.tm224-brand{font-size:10px;padding:5px 7px;border-radius:99px;background:#fff;border:1px solid #dbe4ee}.tm224-brand b{color:#0c447c}
 .tm224-row{border:1px solid #e5e7eb;border-radius:12px;margin:9px 0;background:#fff;overflow:hidden}.tm224-row.gap{border-color:#fbbf24;background:#fffdf5}.tm224-main{display:grid;grid-template-columns:85px minmax(220px,1.8fr) 150px minmax(220px,1.6fr) 165px 130px 145px;gap:9px;padding:11px;align-items:start}.tm224-main small{display:block;color:#64748b;font-size:8px;text-transform:uppercase;margin-bottom:3px}.tm224-main b{display:block;font-size:11px}.tm224-main span{display:block;font-size:9px;color:#64748b;margin-top:3px}.tm224-main a{font-size:10px;color:#185fa5;text-decoration:none;display:inline-block;margin-top:4px}.tm224-gapbox{grid-column:4/8}
 .tm224-details{border-top:1px solid #e5e7eb;background:#fbfdff;padding:7px 11px}.tm224-details summary{cursor:pointer;font-size:10px;font-weight:800;color:#0c447c}.tm224-compare,.tm224-ab{display:grid;grid-template-columns:1fr 1fr;gap:9px;margin-top:8px}.tm224-compare>div,.tm224-ab>div{border:1px solid #e5e7eb;background:#fff;border-radius:8px;padding:8px}.tm224-compare span{display:block;font-size:10px;margin:2px 0}.tm224-ab{font-size:10px}.tm224-ab ul{margin:5px 0 0 16px}.tm224-conv-table{overflow:auto;margin-top:8px}.tm224-conv-table table{width:100%;border-collapse:collapse;background:#fff;font-size:10px}.tm224-conv-table th,.tm224-conv-table td{padding:7px;border:1px solid #e5e7eb;text-align:left;vertical-align:top}.tm224-conv-table th{background:#f8fafc}.tm224-ref{margin-top:7px;padding:7px 8px;border-radius:8px;background:#fff7ed;border:1px solid #fed7aa;font-size:10px}.tm224-own-pos{margin-top:5px!important;color:#0c447c!important}.tm224-listing-history{margin-top:8px;padding:8px;border:1px solid #dbeafe;background:#f8fbff;border-radius:8px;font-size:10px}.tm224-listing-history>div{display:flex;gap:6px;flex-wrap:wrap;margin-top:6px}.tm224-listing-history span{padding:4px 6px;border:1px solid #dbe4ee;border-radius:999px;background:#fff}.tm224-own-summary{font-size:10px;margin-top:6px;color:#334155}.tm224-rec{margin-top:8px;padding:8px;border-radius:8px;background:#eff6ff;border:1px solid #bfdbfe;font-size:10px}.tm224-empty{padding:18px;border:1px dashed #cbd5e1;border-radius:10px;color:#64748b;text-align:center}.tm224-meta{font-size:9px;color:#64748b;margin-top:9px}
 .good{color:#166534!important}.warn{color:#92400e!important}.bad{color:#b91c1c!important}
 @media(max-width:1250px){.tm224-kpi{grid-template-columns:repeat(4,1fr)}.tm224-main{grid-template-columns:repeat(3,minmax(0,1fr))}.tm224-gapbox{grid-column:auto}}
 @media(max-width:760px){.tm224-kpi,.tm224-filters,.tm224-main,.tm224-compare,.tm224-ab{grid-template-columns:1fr}.tm224-toggles{grid-column:auto}}
 `;document.head.appendChild(s);
}
function scopeHtml(s,summaryMap){
 const brands=(s.brands||[]).map(b=>'<span class="tm224-brand"><b>'+E(b.brand)+'</b> · '+E(b.models)+' мод. · лучшая #'+E(b.best_position??'—')+' · средняя '+E(b.avg_position??'—')+' · '+E(b.share_pct??0)+'%</span>').join('');
 const q=summaryMap.get(String(s.scope_key||''))||{};
 const ownSummary='<div class="tm224-own-summary"><b>Наш листинг:</b> TOP-10 — '+E(q.top10??0)+' · TOP-30 — '+E(q.top30??0)+' · TOP-60 — '+E(q.top60??0)+' · TOP-120 — '+E(q.top120??0)+' · вне TOP-120 — '+E(q.outside_top120??0)+(N(q.no_card)>0?' · без карточки — '+E(q.no_card):'')+'</div>';
 return '<div class="tm224-scope" data-scope-card="'+E(s.scope_key)+'"><div class="tm224-scope-head"><div><b>'+E(s.subgroup)+'</b><div class="tm224-note">TOP-2 21vek · запрос «'+E(s.search_query)+'» · наших SKU '+E(s.own_sku_count??0)+' · конкурентов '+E(s.competitors??0)+'</div>'+ownSummary+'</div><b class="'+((s.gaps||0)>0?'warn':'good')+'">пробелы '+E(s.gaps??0)+'</b></div><div class="tm224-brands">'+brands+'</div></div>';
}
function refreshBrandOptions(panel,d){
 const scope=panel.querySelector('[data-f-scope]')?.value||'',sel=panel.querySelector('[data-f-brand]');
 if(!sel)return;
 const prev=sel.value||'';
 const rows=(Array.isArray(d.rows)?d.rows:[]).filter(r=>!scope||r.scope_key===scope);
 const brands=[...new Set(rows.map(r=>String(r.brand||'')).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'ru'));
 sel.innerHTML='<option value="">Все бренды</option>'+brands.map(x=>'<option value="'+E(x)+'">'+E(x)+'</option>').join('');
 sel.value=brands.includes(prev)?prev:'';
}
function applyFilters(panel,d,listing){
 const scope=panel.querySelector('[data-f-scope]')?.value||'',brand=panel.querySelector('[data-f-brand]')?.value||'',status=panel.querySelector('[data-f-status]')?.value||'',sku=(panel.querySelector('[data-f-sku]')?.value||'').trim().toLowerCase();
 const trend=panel.querySelector('[data-f-trend]')?.value||'',days=N(panel.querySelector('[data-f-days]')?.value)||N(listing?.period_days)||7;
 const top10=!!panel.querySelector('[data-f-top10]')?.checked,gaps=!!panel.querySelector('[data-f-gaps]')?.checked,mrc=!!panel.querySelector('[data-f-mrc]')?.checked;
 const all=Array.isArray(d.rows)?d.rows:[],base=all.filter(r=>!scope||r.scope_key===scope),ownMap=listingRowsMap(listing);
 const rows=base.filter(r=>{
  if(brand&&String(r.brand||'')!==brand)return false;
  if(status&&r.status!==status)return false;
  if(sku&&!String(r.our_sku||'').toLowerCase().includes(sku))return false;
  if(top10&&N(r.position)>10)return false;
  if(gaps&&!r.is_gap)return false;
  if(mrc&&!(N(r.mrc_delta_pct)<0))return false;
  if(trend){
   if(r.is_gap||!r.our_sku)return false;
   const l=ownMap.get(listingKey(r.scope_key,r.our_sku));
   if(!l)return false;
   if(trend==='outside'&&l.listing_state!=='outside_top120')return false;
   if(trend!=='outside'&&l.trend!==trend)return false;
  }
  return true;
 });
 panel.querySelectorAll('[data-scope-card]').forEach(x=>{x.style.display=!scope||x.getAttribute('data-scope-card')===scope?'':'none'});
 const holder=panel.querySelector('[data-tm224-rows]');
 holder.innerHTML=rows.length?rows.map(r=>rowHtml(r,ownMap,days)).join(''):'<div class="tm224-empty">По выбранным фильтрам ничего нет.</div>';
 panel.querySelector('[data-tm224-count]').textContent='Показано '+rows.length+' из '+base.length;
}
function loadXlsx(){
 if(window.XLSX)return Promise.resolve(window.XLSX);
 if(xlsxFlight)return xlsxFlight;
 xlsxFlight=new Promise((resolve,reject)=>{const s=document.createElement('script');s.src='https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';s.onload=()=>window.XLSX?resolve(window.XLSX):reject(Error('Excel модуль не загрузился'));s.onerror=()=>reject(Error('Не удалось загрузить Excel модуль'));document.head.appendChild(s)}).finally(()=>xlsxFlight=null);
 return xlsxFlight;
}
async function exportKind(kind){
 const all=[];for(let off=0;;off+=500){const d=await rpc('triovist_market_export_v236224',{p_kind:kind,p_offset:off,p_limit:500});const rows=Array.isArray(d.rows)?d.rows:[];all.push(...rows);if(!d.has_more||!rows.length)break}return all;
}
async function exportExcel(btn){
 if(exportFlight)return exportFlight;
 exportFlight=(async()=>{
  const old=btn?.textContent;if(btn){btn.disabled=true;btn.textContent='⏳ Готовлю Excel…'}
  try{
   const [XLSX,summary,comparison,raw,gaps,errors]=await Promise.all([loadXlsx(),exportKind('summary'),exportKind('comparison'),exportKind('raw'),exportKind('gaps'),exportKind('errors')]);
   const wb=XLSX.utils.book_new();
   for(const [name,rows] of [['Сводка',summary],['Сравнение',comparison],['Конкуренты RAW',raw],['Пробелы ассортимента',gaps],['Ошибки данных',errors]]){
    const ws=XLSX.utils.json_to_sheet(rows);ws['!cols']=Object.keys(rows[0]||{}).map(k=>({wch:Math.min(55,Math.max(12,String(k).length+4))}));if(rows.length)ws['!autofilter']={ref:ws['!ref']};XLSX.utils.book_append_sheet(wb,ws,name);
   }
   XLSX.writeFile(wb,'Triovist_21vek_Конкуренты_'+new Date().toISOString().slice(0,10)+'.xlsx',{compression:true});
  }catch(e){alert('Не удалось выгрузить конкурентный анализ: '+(e?.message||e))}
  finally{if(btn){btn.disabled=false;btn.textContent=old||'📥 Выгрузить конкурентный анализ Excel'}}
 })().finally(()=>exportFlight=null);return exportFlight;
}
function render(panel,d,listing){
 css();
 const s=d.summary||{},scopes=Array.isArray(d.scopes)?d.scopes:[],rows=Array.isArray(d.rows)?d.rows:[],run=d.last_run||{},summaryMap=listingSummaryMap(listing);
 const brands=[...new Set(rows.map(r=>String(r.brand||'')).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'ru'));
 const pd=N(listing?.period_days)||7;
 panel.innerHTML='<div class="tm224-head"><div><h3 style="margin:0">⚔️ Конкуренты 21vek · рынок TOP-2</h3><div class="tm224-note">Позиции конкурентов и наших товаров снимаются из одного и того же листинга 21vek по популярности. История наших SKU сохраняется ежедневно, поэтому можно видеть рост или падение листинга по выбранному периоду.</div></div><div class="tm224-actions"><button class="tr14-refresh" data-tm224-export>📥 Выгрузить конкурентный анализ Excel</button><button class="tr14-refresh" data-tm224-refresh>↻ Обновить</button></div></div>'
  +'<div class="tm224-kpi"><div><span>Категорий</span><b>'+E(s.scopes??0)+'</b></div><div><span>Товаров конкурентов</span><b>'+E(s.products??0)+'</b></div><div><span>Брендов</span><b>'+E(s.brands??0)+'</b></div><div><span>Мы сильнее</span><b class="good">'+E(s.ours_stronger??0)+'</b></div><div><span>Паритет</span><b class="warn">'+E(s.parity??0)+'</b></div><div><span>Конкурент сильнее</span><b class="bad">'+E(s.competitor_stronger??0)+'</b></div><div><span>Пробелы</span><b class="warn">'+E(s.gaps??0)+'</b></div><div><span>Ниже МРЦ</span><b class="'+((s.below_mrc||0)>0?'bad':'good')+'">'+E(s.below_mrc??0)+'</b></div></div>'
  +'<div class="tm224-filters"><select data-f-scope><option value="">Все подгруппы</option>'+scopes.map(x=>'<option value="'+E(x.scope_key)+'">'+E(x.subgroup)+'</option>').join('')+'</select><select data-f-brand><option value="">Все бренды</option>'+brands.map(x=>'<option>'+E(x)+'</option>').join('')+'</select><select data-f-status><option value="">Любой итог</option><option value="ours_stronger">Мы сильнее</option><option value="parity">Паритет</option><option value="competitor_stronger">Конкурент сильнее</option></select><select data-f-days><option value="1">1 день</option><option value="3">3 дня</option><option value="7">7 дней</option><option value="14">14 дней</option><option value="30">30 дней</option></select><select data-f-trend><option value="">Наш листинг: все</option><option value="up">Растём</option><option value="down">Падаем</option><option value="stable">Без изменений</option><option value="outside">Вне TOP-120</option><option value="new">Новый в TOP-120</option></select><input data-f-sku placeholder="Наш SKU"><div class="tm224-toggles"><label><input type="checkbox" data-f-top10> только TOP-10 конкурентов</label><label><input type="checkbox" data-f-gaps> только пробелы</label><label><input type="checkbox" data-f-mrc> только ниже МРЦ</label><b data-tm224-count></b></div></div>'
  +scopes.map(x=>scopeHtml(x,summaryMap)).join('')+'<div data-tm224-rows></div>'
  +'<div class="tm224-meta">Последний сбор: <b>'+E(run.status||'ещё не запускался')+'</b> · '+dt(run.finished_at||run.started_at)+' · конкурентных товаров '+E(run.competitor_count??0)+' · сравнений '+E(run.comparison_count??0)+' · пробелов '+E(run.gap_count??0)+' · ошибок '+E(run.error_count??0)+'. Наш листинг: страница 1 = места 1–60, страница 2 = 61–120; если карточка есть, но товар не найден на двух страницах, показываем >120.</div>';
 const daySel=panel.querySelector('[data-f-days]');if(daySel)daySel.value=String(pd);
 refreshBrandOptions(panel,{...d,rows});
 applyFilters(panel,{...d,rows},listing);
 panel.querySelector('[data-f-scope]')?.addEventListener('change',()=>{refreshBrandOptions(panel,d);applyFilters(panel,d,listing)});
 panel.querySelectorAll('[data-f-brand],[data-f-status],[data-f-sku],[data-f-trend],[data-f-top10],[data-f-gaps],[data-f-mrc]').forEach(x=>x.addEventListener(x.tagName==='INPUT'&&x.type==='text'?'input':'change',()=>applyFilters(panel,d,listing)));
 panel.querySelector('[data-f-days]')?.addEventListener('change',async e=>{
   const days=N(e.currentTarget.value)||7;e.currentTarget.disabled=true;
   try{listing=await loadListing(days,false);applyFilters(panel,d,listing)}
   catch(err){alert('Не удалось загрузить историю нашего листинга: '+(err?.message||err))}
   finally{e.currentTarget.disabled=false}
 });
 panel.querySelector('[data-tm224-refresh]')?.addEventListener('click',async()=>{last=null;lastAt=0;listingCache.clear();await open(panel,null,true)});
 panel.querySelector('[data-tm224-export]')?.addEventListener('click',e=>exportExcel(e.currentTarget));
}
async function open(panel,ctx,force=false){
 if(!panel)return;panel.style.setProperty('display','block','important');panel.innerHTML='<div class="tr14-info">Загружаю автоматический анализ рынка и наш листинг 21vek…</div>';
 try{
  const [dash,listing]=await Promise.all([load(force),loadListing(7,force)]);
  render(panel,dash,listing);
 }catch(e){panel.innerHTML='<div class="tr14-warn"><b>Конкурентный анализ пока недоступен.</b><br>'+E(e?.message||e)+'</div>'}
}
window.RESANTA_TRIOVIST_COMPETITORS_V236218=Object.freeze({version:V,open,refresh:()=>{last=null;lastAt=0;listingCache.clear();return Promise.all([load(true),loadListing(7,true)])},automaticMarket:true,positionHistory:true,ownListingHistory:true,excel:true});
})();