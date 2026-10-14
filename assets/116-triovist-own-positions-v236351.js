/* RESANTA CRM v23.6.351 · OWN 21VEK POSITIONAL LISTING
 * Exact position history for our own 21vek parser. No competitor parser changes.
 */
(function(){
'use strict';
if(window.RESANTA_TRIOVIST_OWN_POSITIONS_V236351)return;
const V='v23.6.351';
const E=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const A=v=>Array.isArray(v)?v:[];
const N=v=>{const n=Number(v);return Number.isFinite(n)?n:null};
const active=()=>!!document.getElementById('page-triovist')?.classList.contains('active')||String(document.getElementById('app')?.dataset?.activePage||'')==='triovist';
const dt=v=>{if(!v)return'—';try{return new Date(v).toLocaleString('ru-RU',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})}catch(_){return String(v)}};
const fullDt=v=>{if(!v)return'—';try{return new Date(v).toLocaleString('ru-RU')}catch(_){return String(v)}};
const money=v=>N(v)==null?'—':N(v).toLocaleString('ru-RU',{maximumFractionDigits:2})+' BYN';
let state={manager:'',movement:'',search:'',offset:0,limit:200,data:null,loading:false};
let searchTimer=null,controlSummary=null,controlAt=0,controlFlight=null;

async function rpc(name,args={}){
 const call=()=>db.rpc(name,args);
 const r=typeof window.crmAuthRetryV236166==='function'?await window.crmAuthRetryV236166(call):await call();
 if(r?.error)throw r.error;
 return r?.data||{};
}
function injectCss(){
 if(document.getElementById('tri-pos351-css'))return;
 const s=document.createElement('style');s.id='tri-pos351-css';s.textContent=
 '.tp351-modal{position:fixed;inset:0;background:rgba(15,23,42,.48);z-index:10950;display:none;align-items:center;justify-content:center;padding:14px}.tp351-modal.open{display:flex}.tp351-card{width:min(1500px,98vw);max-height:94dvh;overflow:auto;background:#fff;border-radius:16px;padding:16px;box-shadow:0 24px 80px rgba(0,0,0,.28)}'+
 '.tp351-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;flex-wrap:wrap}.tp351-head h3{margin:0;font-size:19px}.tp351-note{font-size:10px;color:#64748b;line-height:1.45;margin-top:4px}.tp351-x{border:0;background:none;font-size:25px;cursor:pointer;min-width:44px;min-height:44px}'+
 '.tp351-kpis{display:grid;grid-template-columns:repeat(6,minmax(110px,1fr));gap:7px;margin:12px 0}.tp351-kpi{border:1px solid #e2e8f0;border-radius:10px;padding:9px;background:#fff}.tp351-kpi span{display:block;font-size:9px;color:#64748b}.tp351-kpi b{display:block;font-size:20px;margin-top:2px}.tp351-good{color:#166534}.tp351-bad{color:#b91c1c}.tp351-blue{color:#0b63ad}.tp351-amber{color:#92400e}'+
 '.tp351-filters{display:grid;grid-template-columns:190px 190px 1fr auto;gap:7px;margin-bottom:10px}.tp351-filters select,.tp351-filters input{width:100%;box-sizing:border-box;border:1px solid #dbe2ea;border-radius:8px;padding:9px;background:#fff;font:inherit}.tp351-filters button{min-height:40px}'+
 '.tp351-tablewrap{overflow:auto;border:1px solid #e2e8f0;border-radius:11px}.tp351-table{border-collapse:collapse;width:100%;min-width:1420px}.tp351-table th,.tp351-table td{padding:8px;border-bottom:1px solid #edf2f7;font-size:10px;text-align:left;vertical-align:top}.tp351-table th{position:sticky;top:0;background:#f8fafc;color:#475569;z-index:1}.tp351-table tr:hover td{background:#f8fbff}.tp351-sku{font-weight:800;color:#0b63ad;cursor:pointer;text-decoration:underline}.tp351-pos{font-size:14px;font-weight:900;white-space:nowrap}.tp351-delta{font-weight:900;white-space:nowrap}.tp351-delta.up{color:#166534}.tp351-delta.down{color:#b91c1c}.tp351-delta.entered{color:#0b63ad}.tp351-delta.exited{color:#b91c1c}.tp351-delta.same,.tp351-delta.outside{color:#64748b}.tp351-pagination{display:flex;justify-content:space-between;gap:10px;align-items:center;margin-top:10px;flex-wrap:wrap}.tp351-pagination button{min-height:38px}'+
 '.tp351-history{margin-top:10px}.tp351-chart{border:1px solid #e2e8f0;background:#f8fafc;border-radius:10px;padding:8px}.tp351-chart svg{display:block;width:100%;height:180px}.tp351-hrows{margin-top:8px;max-height:280px;overflow:auto;border:1px solid #e2e8f0;border-radius:9px}.tp351-hrow{display:grid;grid-template-columns:145px 80px 110px 1fr;gap:8px;padding:7px 9px;border-bottom:1px solid #edf2f7;font-size:10px}.tp351-hrow:last-child{border-bottom:0}.tp351-context{display:flex;gap:8px;flex-wrap:wrap;margin:8px 0}.tp351-pill{border-radius:999px;padding:4px 8px;background:#eff6ff;color:#0b63ad;font-size:10px;font-weight:700}'+
 '@media(max-width:900px){.tp351-card{width:100%;height:100dvh;max-height:100dvh;border-radius:0}.tp351-kpis{grid-template-columns:repeat(2,1fr)}.tp351-filters{grid-template-columns:1fr}.tp351-filters select,.tp351-filters input{font-size:16px;min-height:44px}.tp351-hrow{grid-template-columns:115px 55px 85px 1fr}}';
 document.head.appendChild(s);
}
function ensureModal(){
 let m=document.getElementById('tri-pos351-modal');if(m)return m;
 m=document.createElement('div');m.id='tri-pos351-modal';m.className='tp351-modal';
 m.innerHTML='<div class="tp351-card"><div class="tp351-head"><div><h3>📈 Позиции нашего листинга 21vek</h3><div class="tp351-note">Точная позиция по поисковой фразе. «>60» означает: товар проверен, но не найден в первых 60 результатах. Время изменения — когда очередной запуск парсера впервые обнаружил новое положение.</div></div><button class="tp351-x" data-tp351-close>×</button></div><div id="tp351-body"></div></div>';
 document.body.appendChild(m);return m;
}
function moveText(r){
 const d=N(r?.position_delta),m=String(r?.movement||'');
 if(m==='up')return '<span class="tp351-delta up">↑ +'+Math.abs(d||0)+'</span>';
 if(m==='down')return '<span class="tp351-delta down">↓ '+Math.abs(d||0)+'</span>';
 if(m==='entered')return '<span class="tp351-delta entered">↥ вошёл ≤60</span>';
 if(m==='exited')return '<span class="tp351-delta exited">↧ вылетел &gt;60</span>';
 if(m==='same')return '<span class="tp351-delta same">→ 0</span>';
 if(m==='outside')return '<span class="tp351-delta outside">→ &gt;60</span>';
 if(m==='new')return '<span class="tp351-delta entered">NEW</span>';
 if(m==='error')return '<span class="tp351-delta down">ошибка</span>';
 return '<span class="tp351-delta same">—</span>';
}
function kpi(label,val,cls=''){return '<div class="tp351-kpi"><span>'+E(label)+'</span><b class="'+cls+'">'+E(val??0)+'</b></div>'}
function managersOptions(){
 return '<option value="">Все менеджеры</option><option value="aleksandrenko_av@resanta.ru" '+(state.manager==='aleksandrenko_av@resanta.ru'?'selected':'')+'>Александренко</option><option value="krishtal_na@resanta.ru" '+(state.manager==='krishtal_na@resanta.ru'?'selected':'')+'>Кришталь</option>';
}
function movementOptions(){
 const a=[['','Все движения'],['down','↓ Упали'],['up','↑ Выросли'],['exited','Вылетели >60'],['entered','Вошли ≤60'],['outside','Остаются >60'],['same','Без изменений'],['new','Новые'],['error','Ошибка']];
 return a.map(x=>'<option value="'+x[0]+'" '+(state.movement===x[0]?'selected':'')+'>'+x[1]+'</option>').join('');
}
function render(){
 const host=document.getElementById('tp351-body');if(!host)return;
 if(state.loading&&!state.data){host.innerHTML='<div class="tp351-note" style="padding:20px">Загружаю позиции…</div>';return}
 const d=state.data||{},s=d.summary||{},rows=A(d.rows),total=Number(d.total||0);
 host.innerHTML=
 '<div class="tp351-kpis">'+
  kpi('↑ выросли',s.up,'tp351-good')+
  kpi('↓ упали',s.down,'tp351-bad')+
  kpi('Вошли ≤60',s.entered,'tp351-blue')+
  kpi('Вылетели >60',s.exited,'tp351-bad')+
  kpi('Падение ≥10',s.drop_10_plus,'tp351-bad')+
  kpi('Сейчас >60',s.outside,'tp351-amber')+
 '</div>'+
 '<div class="tp351-filters"><select id="tp351-manager">'+managersOptions()+'</select><select id="tp351-movement">'+movementOptions()+'</select><input id="tp351-search" value="'+E(state.search)+'" placeholder="SKU, товар или поисковая фраза"><button class="btn-secondary" data-tp351-refresh>↻ Обновить</button></div>'+
 '<div class="tp351-tablewrap"><table class="tp351-table"><thead><tr><th>Менеджер</th><th>SKU / товар</th><th>Запрос</th><th>Сейчас</th><th>Было</th><th>Δ</th><th>1д</th><th>3д</th><th>7д</th><th>14д</th><th>30д</th><th>Лучшая 30д</th><th>Худшая 30д</th><th>Изменение обнаружено</th><th>Проверено</th></tr></thead><tbody>'+
 (rows.length?rows.map(r=>'<tr><td>'+E(r.manager_name||'')+'</td><td><span class="tp351-sku" data-tp351-history="'+E(r.card_key)+'" data-manager="'+E(r.manager_email)+'">'+E(r.sku||r.donor_article||'—')+'</span><div class="tp351-note">'+E(r.product_name||'')+'</div></td><td>'+E(r.keyword||'—')+'</td><td><span class="tp351-pos">'+E(r.current_label||'—')+'</span></td><td>'+E(r.previous_label||'—')+'</td><td>'+moveText(r)+'</td><td>'+E(r.pos_1d||'—')+'</td><td>'+E(r.pos_3d||'—')+'</td><td>'+E(r.pos_7d||'—')+'</td><td>'+E(r.pos_14d||'—')+'</td><td>'+E(r.pos_30d||'—')+'</td><td>'+E(r.best_30d??'—')+'</td><td>'+E(r.worst_30d||'—')+'</td><td>'+dt(r.changed_at)+'</td><td>'+dt(r.current_observed_at)+'</td></tr>').join(''):'<tr><td colspan="15">По выбранным фильтрам ничего нет.</td></tr>')+
 '</tbody></table></div>'+
 '<div class="tp351-pagination"><div class="tp351-note">Показано '+(state.offset+1)+'–'+Math.min(state.offset+rows.length,total)+' из '+total+'. Последний сбор: '+fullDt(s.last_checked)+'</div><div><button class="btn-secondary" data-tp351-prev '+(state.offset<=0?'disabled':'')+'>← Назад</button> <button class="btn-secondary" data-tp351-next '+(!d.has_more?'disabled':'')+'>Дальше →</button></div></div>';
}
async function load(reset=false){
 if(state.loading)return;
 if(reset)state.offset=0;
 state.loading=true;render();
 try{
  state.data=await rpc('triovist_own_listing_positions_v236351',{
    p_manager_email:state.manager||null,p_search:state.search||null,p_movement:state.movement||null,p_offset:state.offset,p_limit:state.limit
  });
  if(state.data?.manager_filter&&state.data.manager_filter!==state.manager&&state.manager){
    state.manager=state.data.manager_filter;
  }
 }catch(e){state.data={rows:[],total:0,summary:{}};const h=document.getElementById('tp351-body');if(h)h.innerHTML='<div style="padding:14px;color:#b91c1c">Не удалось загрузить позиции: '+E(e?.message||e)+'</div>'}
 finally{state.loading=false;render();patchControl()}
}
function open(){
 injectCss();const m=ensureModal();m.classList.add('open');load(true);
}
function close(){document.getElementById('tri-pos351-modal')?.classList.remove('open')}
function pointValue(r){const n=N(r?.position);return n!=null&&n>0?n:(r?.position_label==='>60'?61:null)}
function chart(rows){
 const pts=A(rows).map((r,i)=>({i,v:pointValue(r),label:r.position_label})).filter(x=>x.v!=null);
 if(pts.length<2)return '<div class="tp351-note">Для графика пока недостаточно точек.</div>';
 const w=900,h=180,p=20,max=61,min=1;
 const x=i=>p+(w-2*p)*(i/Math.max(1,A(rows).length-1));
 const y=v=>p+(h-2*p)*((v-min)/(max-min));
 const path=pts.map((q,j)=>(j?'L':'M')+x(q.i).toFixed(1)+' '+y(q.v).toFixed(1)).join(' ');
 return '<div class="tp351-chart"><svg viewBox="0 0 '+w+' '+h+'" preserveAspectRatio="none"><line x1="'+p+'" y1="'+y(60)+'" x2="'+(w-p)+'" y2="'+y(60)+'" stroke="#f59e0b" stroke-dasharray="5 4"/><path d="'+path+'" fill="none" stroke="currentColor" stroke-width="3"/>'+pts.map(q=>'<circle cx="'+x(q.i)+'" cy="'+y(q.v)+'" r="4" fill="currentColor"/>').join('')+'</svg><div class="tp351-note">Верх графика = лучшая позиция. Линия около 60 — граница первых 60 результатов; «>60» отображается ниже неё.</div></div>';
}
async function showHistory(manager,cardKey){
 const m=ensureModal(),host=document.getElementById('tp351-body');
 host.innerHTML='<div class="tp351-note" style="padding:20px">Загружаю историю позиции…</div>';
 try{
  const d=await rpc('triovist_own_listing_history_v236351',{p_manager_email:manager,p_card_key:cardKey,p_days:30});
  const meta=d.meta||{},rows=A(d.rows);
  host.innerHTML='<div><button class="btn-secondary" data-tp351-back>← Все позиции</button></div>'+
   '<div class="tp351-history"><h3 style="margin-bottom:2px">'+E(meta.sku||'')+' · '+E(meta.product_name||'')+'</h3><div class="tp351-note">Поисковая фраза: «'+E(meta.keyword||'')+'» · текущая позиция: <b>'+E(meta.current_label||'—')+'</b> · текущее состояние действует с '+fullDt(meta.changed_at)+'</div>'+
   '<div class="tp351-context"><span class="tp351-pill">Цена 21vek: '+money(meta.price_21vek)+'</span><span class="tp351-pill">МРЦ: '+money(meta.mrc_byn)+'</span><span class="tp351-pill">Наличие: '+(meta.in_stock===true?'да':meta.in_stock===false?'нет':'—')+'</span></div>'+
   chart(rows)+
   '<div class="tp351-hrows">'+rows.slice().reverse().map(r=>'<div class="tp351-hrow"><div>'+fullDt(r.observed_at)+'</div><div><b>'+E(r.position_label||'—')+'</b></div><div>'+moveText(r)+'</div><div>Результатов в поиске: '+E(r.search_total??'—')+'</div></div>').join('')+'</div>'+
   '<div class="tp351-note" style="margin-top:8px">'+E(d.change_semantics||'')+'</div></div>';
 }catch(e){host.innerHTML='<button class="btn-secondary" data-tp351-back>← Все позиции</button><div style="padding:14px;color:#b91c1c">История не загрузилась: '+E(e?.message||e)+'</div>'}
}
async function patchControl(force=false){
 const panel=document.getElementById('tri21-control-v236107');if(!panel)return;
 try{
  if(force||!controlSummary||Date.now()-controlAt>10000){
   if(!controlFlight)controlFlight=rpc('triovist_own_listing_positions_v236351',{p_manager_email:null,p_search:null,p_movement:null,p_offset:0,p_limit:20}).finally(()=>controlFlight=null);
   const d=await controlFlight;controlSummary=d?.summary||{};controlAt=Date.now();
  }
 }catch(_){return}
 const s=controlSummary||{};
 const kpis=[...panel.querySelectorAll('.tri21ctl-kpi')];
 const top30=kpis.find(x=>x.querySelector('span')?.textContent?.trim()==='TOP-30');
 const top60=kpis.find(x=>x.querySelector('span')?.textContent?.trim()==='TOP-60');
 if(top30)top30.innerHTML='<span>↑ Позиция выросла</span><b style="color:#166534">'+E(s.up??0)+'</b>';
 if(top60)top60.innerHTML='<span>↓ Позиция упала</span><b style="color:#b91c1c">'+E(s.down??0)+'</b>';
 const actions=panel.querySelector('.tri21ctl-actions');
 if(actions&&!document.getElementById('tri21-positions-v236351')){
  const b=document.createElement('button');b.id='tri21-positions-v236351';b.type='button';b.className='btn-primary';b.textContent='📈 Позиции листинга';b.onclick=open;actions.insertBefore(b,actions.firstChild||null);
 }
}
document.addEventListener('click',e=>{
 if(e.target.closest?.('[data-tp351-close]'))return close();
 if(e.target.closest?.('[data-tp351-refresh]'))return load(true);
 if(e.target.closest?.('[data-tp351-back]'))return load(false);
 const h=e.target.closest?.('[data-tp351-history]');if(h)return showHistory(h.dataset.manager,h.dataset.tp351History);
 if(e.target.closest?.('[data-tp351-prev]')){state.offset=Math.max(0,state.offset-state.limit);return load(false)}
 if(e.target.closest?.('[data-tp351-next]')){state.offset+=state.limit;return load(false)}
},true);
document.addEventListener('change',e=>{
 if(e.target?.id==='tp351-manager'){state.manager=e.target.value||'';load(true)}
 if(e.target?.id==='tp351-movement'){state.movement=e.target.value||'';load(true)}
},true);
document.addEventListener('input',e=>{
 if(e.target?.id==='tp351-search'){
  state.search=e.target.value||'';
  if(searchTimer)clearTimeout(searchTimer);
  searchTimer=setTimeout(()=>{searchTimer=null;load(true)},350);
 }
},true);
function watch(){
 if(!active())return;
 patchControl();
 const root=document.getElementById('page-triovist');
 if(root&&typeof MutationObserver==='function'){
  const o=new MutationObserver(()=>patchControl());
  o.observe(root,{childList:true,subtree:true});
  setTimeout(()=>o.disconnect(),10000);
 }
}
injectCss();
[50,300,900,1800,3500].forEach(ms=>setTimeout(watch,ms));
window.RESANTA_TRIOVIST_OWN_POSITIONS_V236351=Object.freeze({version:V,open,refresh:()=>load(true),exactPositions:true,historyDays:[1,3,7,14,30],futureReasonContext:true});
})();