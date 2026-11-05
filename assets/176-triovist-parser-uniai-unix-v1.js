/* Triovist · parser 21vek: combined Uni AI / Uni X, additive view only.
 * No changes to Cards 21vek, production TOP, RLS or existing parser controls.
 */
(function(){
'use strict';
if(window.RESANTA_TRIOVIST_OWN_HOURLY_V1)return;
const VERSION='parser-uniai-unix-20261105';
const E=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const A=v=>Array.isArray(v)?v:[];
const N=v=>v===null||v===undefined||v===''?null:(Number.isFinite(Number(v))?Number(v):null);
const dt=v=>{if(!v)return'—';const d=new Date(v);return Number.isNaN(d.getTime())?'—':d.toLocaleString('ru-RU',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})};
const pos=v=>N(v)===null?'>120':'№'+N(v);
const money=v=>N(v)===null?'неизвестна':N(v).toLocaleString('ru-RU',{maximumFractionDigits:2})+' BYN';
const active=()=>!!document.getElementById('page-triovist')?.classList.contains('active')&&
 !!document.querySelector('#tr14-shell [data-tr14="parser"].on');
const leader=()=>{let p=null;try{p=(typeof currentProfile!=='undefined'&&currentProfile)||window.currentProfile}catch(_){p=window.currentProfile}return String(p?.role||'')==='boss'};
let state={manager:'',move:'',search:'',data:null,history:null,detail:null,busy:false,historyBusy:false,seq:0,lastRead:0};
let observed=null,observer=null,searchTimer=null;
async function rpc(name,args){
 const call=()=>db.rpc(name,args);
 const r=typeof window.crmAuthRetryV236166==='function'?await window.crmAuthRetryV236166(call):await call();
 if(r?.error)throw r.error;
 return r?.data||{};
}
function css(){
 if(document.getElementById('p176-style'))return;
 const s=document.createElement('style');s.id='p176-style';s.textContent=[
 '#p176{font-family:inherit;margin:0 0 16px;color:#233d59}',
 '#p176 *{box-sizing:border-box}',
 '#p176 .p176-hero{display:flex;align-items:start;justify-content:space-between;gap:10px;flex-wrap:wrap}',
 '#p176 h2{font-size:20px;line-height:1.3;color:#154a7a;margin:0}',
 '#p176 h3{font-size:15px;color:#174a79;margin:0 0 9px}',
 '#p176 .p176-note{font-size:11px;color:#6a8199;line-height:1.5;margin:6px 0}',
 '#p176 .p176-btn{border:1px solid #b9d0e6;background:white;color:#14588d;border-radius:9px;padding:8px 11px;cursor:pointer;font-weight:750;font-size:12px}',
 '#p176 .p176-btn:disabled{opacity:.5;cursor:default}',
 '#p176 .p176-badge{border-radius:99px;background:#e8f4ff;color:#16609a;font-size:10px;padding:5px 10px;font-weight:800}',
 '#p176 .p176-kpis{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:9px;margin:12px 0}',
 '#p176 .p176-kpi{border:1px solid #dde6f1;border-radius:11px;background:white;padding:12px;min-width:0}',
 '#p176 .p176-kpi span{display:block;color:#7589a0;font-size:10px}',
 '#p176 .p176-kpi b{display:block;font-size:25px;line-height:1.2;margin:5px 0;color:#185784}',
 '#p176 .p176-kpi.bad b{color:#bc3b49}#p176 .p176-kpi.good b{color:#16724e}',
 '#p176 .p176-grid{display:grid;grid-template-columns:1.15fr .85fr;gap:12px;margin:12px 0}',
 '#p176 .p176-panel{border-radius:12px;border:1px solid #dce6f2;padding:14px;background:white;min-width:0}',
 '#p176 .p176-brief{background:linear-gradient(130deg,#edf5ff,#fff)}',
 '#p176 .p176-alert{border:1px solid #ecd4d6;background:#fff8f8;border-radius:10px;padding:10px;margin:8px 0}',
 '#p176 .p176-alert b{color:#ad3040;font-size:12px}',
 '#p176 .p176-alert p{font-size:11px;color:#4a6482;line-height:1.55;margin:5px 0}',
 '#p176 .p176-evidence{font-size:11px;color:#1e6b52;margin:5px 0}',
 '#p176 .p176-filters{display:flex;align-items:center;gap:7px;flex-wrap:wrap;margin:10px 0}',
 '#p176 .p176-filters select,#p176 .p176-filters input{border:1px solid #cfdcea;border-radius:9px;padding:9px;background:#fff;font:inherit;font-size:12px;min-height:40px}',
 '#p176 .p176-filters input{flex:1;min-width:150px}',
 '#p176 .p176-detail{border:1px solid #dfe8f2;border-radius:10px;background:#f8fbff;padding:11px;margin-top:12px}',
 '#p176 .p176-plot{width:100%;max-height:185px;display:block}',
 '#p176 .p176-tblwrap{overflow:auto;margin:8px 0}',
 '#p176 table{width:100%;border-collapse:collapse;min-width:740px}',
 '#p176 th,#p176 td{padding:9px 8px;border-bottom:1px solid #e7edf4;text-align:left;font-size:11px;vertical-align:top}',
 '#p176 th{color:#677d94;background:#f5f9fd}',
 '#p176 .p176-sku{border:0;background:none;color:#1a629b;text-decoration:underline;font-weight:800;cursor:pointer;padding:0;text-align:left}',
 '#p176 details{border:1px solid #dce6f1;background:#fff;border-radius:10px;padding:11px;margin-top:9px}',
 '#p176 summary{cursor:pointer;color:#19578c;font-size:12px;font-weight:800}',
 '#p176 .p176-down{color:#bc3b49;font-weight:850}#p176 .p176-up{color:#15744f;font-weight:850}',
 '#p176 .p176-empty{font-size:12px;color:#647991;padding:15px;border-radius:8px;background:#f7faff}',
 '@media(max-width:1000px){#p176 .p176-grid{grid-template-columns:1fr}#p176 .p176-kpis{grid-template-columns:repeat(3,1fr)}}',
 '@media(max-width:650px){#p176 .p176-kpis{grid-template-columns:repeat(2,1fr)}#p176 .p176-filters select,#p176 .p176-filters input{min-width:100%;font-size:16px}}'
 ].join('\n');document.head.appendChild(s);
}
function changeText(r){
 if(r.movement==='down')return '↓ '+Math.abs(N(r.position_delta)||0)+' мест';
 if(r.movement==='up')return '↑ '+Math.abs(N(r.position_delta)||0)+' мест';
 if(r.movement==='exited')return '↓ вне первых 120';
 if(r.movement==='entered')return '↑ вошёл в 120';
 if(r.movement==='same')return 'без изменений';
 return 'первый / вне 120';
}
function facts(r){
 const items=[];
 const old=N(r.previous_observed_price),now=N(r.observed_price);
 if(r.previous_observed_stock===true&&r.observed_stock===false)
  items.push('Наличие в поиске сменилось с «есть» на «нет»');
 if(old!==null&&now!==null&&now>old*1.03)
  items.push('Цена в поиске выросла с '+money(old)+' до '+money(now));
 return items;
}
function suggestion(r){
 if(r.observed_stock===false)return 'Проверить фактический остаток на 21vek, доступность доставки и размещение товара.';
 if(facts(r).some(t=>t.includes('Цена')))return 'Сверить изменение цены с МРЦ, ценой конкурентов и согласованными условиями.';
 return 'Сопоставить наличие, цену конкурентов и качество поискового запроса; проверить историю карточки.';
}
function kpi(label,value,cls){
 return '<div class="p176-kpi '+(cls||'')+'"><span>'+E(label)+'</span><b>'+E(value??0)+'</b></div>';
}
function brief(rows){
 const hot=rows.filter(r=>r.movement==='down'||r.movement==='exited').slice(0,4);
 if(!hot.length)return '<div class="p176-empty">Среди уже проверенных SKU падение пока не обнаружено или нет двух сопоставимых снимков. Это не означает, что проверены все товары.</div>';
 return hot.map(r=>{
  const evidence=facts(r);
  const title=E(r.sku||r.card_key)+' · '+E(pos(r.previous_position))+' → '+E(pos(r.position));
  return '<article class="p176-alert"><b>↓ '+title+'</b><p>'+E(changeText(r))+'; запрос «'+E(r.keyword)+'». '+E(dt(r.observed_at))+'</p>'+
   '<p class="p176-evidence">'+(evidence.length?'Данные поиска: '+E(evidence.join('; ')):'Подтверждённого фактора падения пока нет.')+'</p>'+
   '<p><strong>Действие:</strong> '+E(suggestion(r))+' Причинно-следственная связь требует проверки.</p></article>';
 }).join('');
}
function chart(history){
 const rows=A(history).filter(x=>x.observed_at);
 if(!rows.length)return '<div class="p176-empty">Почасовая история появится после первых успешных проверок.</div>';
 const w=700,h=180,px=27,py=16;
 const value=r=>N(r.position)===null?125:N(r.position);
 const x=i=>px+(w-2*px)*i/Math.max(1,rows.length-1);
 const y=v=>py+(h-2*py)*(v-1)/125;
 const path=rows.map((r,i)=>(i?'L':'M')+x(i).toFixed(1)+' '+y(value(r)).toFixed(1)).join(' ');
 return '<svg class="p176-plot" viewBox="0 0 '+w+' '+h+'" preserveAspectRatio="none" role="img" aria-label="История точных мест в поиске 21vek, верх графика — лучшая позиция">'+
  '<line x1="'+px+'" y1="'+y(120)+'" x2="'+(w-px)+'" y2="'+y(120)+'" stroke="#d9a441" stroke-dasharray="6 4"/>'+
  '<path d="'+path+'" fill="none" stroke="#247eb9" stroke-width="3"/>'+
  rows.map((r,i)=>'<circle cx="'+x(i).toFixed(1)+'" cy="'+y(value(r)).toFixed(1)+'" r="4" fill="'+(N(r.position)===null?'#b76b27':'#247eb9')+'"/>').join('')+
  '</svg><div class="p176-note">Выше = лучше. Линия №120 — граница просмотра. «&gt;120» означает, что товар не найден на первых двух страницах.</div>'+
  '<div class="p176-note">'+rows.slice(-8).reverse().map(r=>E(dt(r.observed_at))+' · '+E(pos(r.position))).join('  |  ')+'</div>';
}
function render(){
 const host=document.getElementById('p176');if(!host)return;
 const expanded=host.querySelector('[data-p176-list]')?.open||false;
 const d=state.data||{},s=d.summary||{},run=d.run||{},rows=A(d.rows);
 const last=dt(s.last_checked);
 const hits=Number(s.observed_cards||0);
 const status=state.busy?'Загружаю…':d.error?'Ошибка загрузки':'Почасовые наблюдения';
 const leaderSelect=leader()?'<select data-p176-manager aria-label="Менеджер">'+
   '<option value="" '+(!state.manager?'selected':'')+'>Оба менеджера</option>'+
   '<option value="aleksandrenko_av@resanta.ru" '+(state.manager==='aleksandrenko_av@resanta.ru'?'selected':'')+'>Александренко</option>'+
   '<option value="krishtal_na@resanta.ru" '+(state.manager==='krishtal_na@resanta.ru'?'selected':'')+'>Кришталь</option></select>':'';
 host.innerHTML=
  '<div class="p176-hero"><div><span class="p176-badge">Uni AI + Uni X</span><h2>🌐 Парсер 21vek · Листинг 1–120</h2>'+
  '<p class="p176-note">Проверяем точное место каждого SKU по его поисковой фразе. Часовой мониторинг — выборочный; ежедневный парсер продолжает работать отдельно.</p></div>'+
  '<button type="button" class="p176-btn" data-p176-reload '+(state.busy?'disabled':'')+'>↻ Обновить брифинг</button></div>'+
  '<div class="p176-note">Источник: собственный парсер 21vek · Последняя проверка SKU: '+E(last)+' · '+E(status)+
  ' · Запросов в последней порции: '+E(run.keywords_checked??'—')+' из '+E(run.keywords_total??'—')+'</div>'+
  '<div class="p176-kpis">'+
    kpi('SKU с проверкой до №120',hits)+
    kpi('↓ Падение',s.down,'bad')+
    kpi('↑ Рост',s.up,'good')+
    kpi('Вышли из TOP-120',s.exited,'bad')+
    kpi('Падение ≥10 мест',s.drop_10_plus,'bad')+
  '</div>'+
  '<div class="p176-filters">'+leaderSelect+
   '<select data-p176-move aria-label="Движение"><option value="">Все изменения</option>'+
   [['down','↓ Упали'],['exited','Вышли из 120'],['up','↑ Выросли'],['entered','Вошли в 120'],['same','Без изменений'],['new','Новые'],['outside','Вне TOP-120']].map(x=>
     '<option value="'+x[0]+'" '+(state.move===x[0]?'selected':'')+'>'+x[1]+'</option>').join('')+
   '</select><input data-p176-search placeholder="Артикул, товар или запрос" value="'+E(state.search)+'"></div>'+
  (d.error?'<div class="p176-alert">Не удалось прочитать мониторинг: '+E(d.error)+'</div>':'')+
  '<div class="p176-grid">'+
   '<section class="p176-panel p176-brief"><h3>✨ Uni AI · Почему упали и что делать</h3>'+
     '<p class="p176-note">Только проверенные движения. Факторы и рекомендации не выдаются за доказанные причины.</p>'+brief(rows)+'</section>'+
   '<section class="p176-panel"><h3>📈 Uni X · Динамика и причины</h3>'+
     '<p class="p176-note">Последний успешный срез: '+E(last)+'. У каждого SKU своё время наблюдения; устаревших SKU: '+E(s.stale_cards??0)+'.</p>'+
     '<p class="p176-note">↓ '+E(s.down??0)+' · ↑ '+E(s.up??0)+' · вне TOP-120 '+E(s.outside_120??0)+'</p>'+
     (state.detail?'<div class="p176-detail"><b>'+E(state.detail.sku||state.detail.card_key)+' · '+E(state.detail.keyword)+'</b>'+
       (state.historyBusy?'<div class="p176-note">Загружаю историю…</div>':chart(state.history?.rows))+
       '<button type="button" class="p176-btn" data-p176-close>Закрыть историю</button></div>':
       '<div class="p176-empty">Нажми SKU в списке ниже, чтобы открыть историю точных позиций до №120.</div>')+
   '</section></div>'+
  '<details data-p176-list '+(expanded?'open':'')+'><summary>Uni X · Показать листинг с точными позициями ('+E(rows.length)+' SKU)</summary>'+
   '<div class="p176-tblwrap"><table><thead><tr><th>Менеджер / SKU</th><th>Запрос</th><th>Сейчас</th><th>Было</th><th>Движение</th><th>Проверено</th></tr></thead><tbody>'+
   (rows.length?rows.map(r=>'<tr><td>'+E(r.manager_name||r.manager_email||'')+'<div><button type="button" class="p176-sku" data-p176-detail="'+E(r.card_key)+'" data-p176-manager-id="'+E(r.manager_email)+'">'+E(r.sku||r.card_key)+'</button></div><span class="p176-note">'+E(r.product_name||'')+'</span></td>'+
     '<td>'+E(r.keyword)+'</td><td><strong>'+E(pos(r.position))+'</strong></td><td>'+E(r.previous_observed_at?pos(r.previous_position):'—')+'</td>'+
     '<td class="'+(r.movement==='down'||r.movement==='exited'?'p176-down':r.movement==='up'?'p176-up':'')+'">'+E(changeText(r))+'</td><td>'+E(dt(r.observed_at))+'</td></tr>').join(''):'<tr><td colspan="6">Нет проверенных SKU для выбранного фильтра.</td></tr>')+
   '</tbody></table></div></details>'+
  '<p class="p176-note">Важно: позиции известны только по успешным проверкам. Если запрос вернул ошибку, предыдущие значения не подменяются. Места №61–№120 появляются по мере поэтапного охвата второй страницы выдачи.</p>';
}
async function refresh(){
 if(!active()||state.busy)return;
 state.busy=true;const seq=++state.seq;render();
 try{
  const data=await rpc('triovist_own_hourly_dashboard_v1',{p_manager_email:state.manager||null,p_movement:state.move||null,p_search:state.search||null,p_limit:100});
  if(seq!==state.seq)return;
  state.data=data;state.lastRead=Date.now();
 }catch(e){if(seq===state.seq)state.data={error:e?.message||String(e),rows:[],summary:{}}}
 finally{state.busy=false;if(seq===state.seq)render()}
}
async function openHistory(manager,key){
 const row=A(state.data?.rows).find(r=>r.manager_email===manager&&r.card_key===key);
 if(!row)return;
 state.detail=row;state.history=null;state.historyBusy=true;render();
 try{
  const d=await rpc('triovist_own_hourly_history_v1',{p_manager_email:manager,p_card_key:key,p_days:30});
  if(state.detail?.card_key===key&&state.detail?.manager_email===manager)state.history=d;
 }catch(e){if(state.detail?.card_key===key)state.history={rows:[],error:e?.message||String(e)}}
 finally{state.historyBusy=false;render()}
}
function mount(){
 if(!active())return;
 css();
 const root=document.getElementById('tri21-control-v236107');
 if(!root)return;
 if(observed!==root&&typeof MutationObserver==='function'){
  observer?.disconnect();observed=root;
  observer=new MutationObserver(()=>{if(active()&&!document.getElementById('p176'))mount()});
  observer.observe(root,{childList:true});
 }
 let el=document.getElementById('p176');
 if(!el){el=document.createElement('section');el.id='p176';el.setAttribute('aria-label','Парсер 21vek · Uni AI и Uni X');root.insertBefore(el,root.firstChild);render();}
 if(!state.lastRead||Date.now()-state.lastRead>5*60*1000)refresh();
}
document.addEventListener('click',e=>{
 if(e.target.closest?.('#tr14-shell [data-tr14="parser"]')){[150,550,1500].forEach(ms=>setTimeout(mount,ms));return;}
 if(!active())return;
 if(e.target.closest?.('[data-p176-reload]')){state.lastRead=0;refresh();return;}
 if(e.target.closest?.('[data-p176-close]')){state.detail=null;state.history=null;render();return;}
 const b=e.target.closest?.('[data-p176-detail]');
 if(b)openHistory(b.dataset.p176ManagerId,b.dataset.p176Detail);
},true);
document.addEventListener('change',e=>{
 if(!active())return;
 const x=e.target.closest?.('[data-p176-manager],[data-p176-move]');
 if(!x)return;
 if(x.hasAttribute('data-p176-manager'))state.manager=x.value;
 if(x.hasAttribute('data-p176-move'))state.move=x.value;
 state.detail=null;refresh();
},true);
document.addEventListener('input',e=>{
 if(!active()||!e.target.matches?.('[data-p176-search]'))return;
 state.search=e.target.value||'';
 if(searchTimer)clearTimeout(searchTimer);
 searchTimer=setTimeout(()=>{state.detail=null;refresh()},450);
},true);
[300,1100,2600].forEach(ms=>setTimeout(mount,ms));
setInterval(()=>{if(active())mount()},60*1000);
window.RESANTA_TRIOVIST_OWN_HOURLY_V1=Object.freeze({version:VERSION,sync:mount,refresh,readOnly:true,neverPromotes:true,depth:120});
})();