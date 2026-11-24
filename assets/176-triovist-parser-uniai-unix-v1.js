/* Triovist · parser 21vek: combined Uni AI / Uni X, additive view only.
 * No changes to Cards 21vek, production TOP, RLS or existing parser controls.
 */
(function(){
'use strict';
if(window.RESANTA_TRIOVIST_OWN_HOURLY_V1)return;
const VERSION='parser-order-20261123';
const E=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const A=v=>Array.isArray(v)?v:[];
const N=v=>v===null||v===undefined||v===''?null:(Number.isFinite(Number(v))?Number(v):null);
const dt=v=>{if(!v)return'—';const d=new Date(v);return Number.isNaN(d.getTime())?'—':d.toLocaleString('ru-RU',{timeZone:'Europe/Minsk',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})};
const pos=v=>N(v)===null?'Вне TOP-120':'№'+N(v);
const count=v=>N(v)===null?'—':N(v).toLocaleString('ru-RU');
const FRESH_MS=6*60*60*1000;
const money=v=>N(v)===null?'неизвестна':N(v).toLocaleString('ru-RU',{maximumFractionDigits:2})+' BYN';
const active=()=>!!document.getElementById('page-triovist')?.classList.contains('active')&&
 !!document.querySelector('#tr14-shell [data-tr14="parser"].on');
const leader=()=>{let p=null;try{p=(typeof currentProfile!=='undefined'&&currentProfile)||window.currentProfile}catch(_){p=window.currentProfile}return String(p?.role||'')==='boss'};
let state={manager:'',move:'',search:'',data:null,dataKey:'',history:null,detail:null,busy:false,queued:false,historyBusy:false,seq:0,lastRead:0};
let observed=null,observer=null,searchTimer=null,historySeq=0;
async function rpc(name,args){
 const call=()=>db.rpc(name,args);
 const r=typeof window.crmAuthRetryV236166==='function'?await window.crmAuthRetryV236166(call):await call();
 if(r?.error)throw r.error;
 return r?.data||{};
}
function css(){
 if(document.getElementById('p176-style'))return;
 const s=document.createElement('style');s.id='p176-style';s.textContent=[
 '#p176{display:grid;gap:14px;margin:16px 0 0;color:var(--text)}',
 '#tri21-control-v236107:has(> #p176) > .tx7,#tri21-control-v236107:has(> #p176) #tri21-positions-v236351{display:none!important}',
 '#p176 *{box-sizing:border-box}',
 '#p176 .p176-hero,#p176 .p176-panel-head{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}',
 '#p176 h3.p176-heading{font-size:20px;line-height:1.25}',
 '#p176 h3{font-size:16px;font-weight:650;margin:0}',
 '#p176 .p176-note{font-size:14px;color:var(--sub);line-height:1.5;margin:5px 0}',
 '#p176 .p176-btn{min-height:44px;border:1px solid var(--border);background:var(--card);color:var(--text);border-radius:8px;padding:8px 12px;cursor:pointer;font:inherit;font-size:14px;font-weight:550}',
 '#p176 .p176-btn:not(:disabled):hover{background:var(--bg)}',
 '#p176 .p176-btn:disabled{opacity:.55;cursor:wait}',
 '#p176 :is(button,input,select,summary):focus-visible{outline:2px solid var(--a);outline-offset:2px}',
 '#p176 .p176-kpis{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}',
 '#p176 .p176-kpi{display:grid;gap:5px;align-content:start;border:1px solid var(--border);border-radius:12px;background:var(--card);padding:13px 14px;min-width:0;text-align:left;font:inherit}',
 '#p176 button.p176-kpi{cursor:pointer}',
 '#p176 button.p176-kpi:is(:hover,[aria-pressed=true]){border-color:var(--a);background:var(--ab)}',
 '#p176 .p176-kpi span{font-size:14px;color:var(--sub)}',
 '#p176 .p176-kpi b{font-size:clamp(20px,2vw,28px);color:var(--text);font-variant-numeric:tabular-nums}',
 '#p176 .p176-panel,#p176 details{border-radius:12px;border:1px solid var(--border);padding:14px;background:var(--card);min-width:0}',
 '#p176 .p176-priority{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:10px;padding:11px 0;border-top:1px solid var(--border);font-size:14px}',
 '#p176 .p176-priority:first-of-type{margin-top:8px}',
 '#p176 .p176-priority p{margin:0;overflow-wrap:anywhere}',
 '#p176 .p176-sku{border:0;background:none;color:var(--a);text-decoration:underline;font:inherit;font-weight:650;cursor:pointer;padding:0;text-align:left;overflow-wrap:anywhere}',
 '#p176 .p176-filters{display:flex;align-items:center;gap:8px;flex-wrap:wrap}',
 '#p176 .p176-filters :is(select,input){border:1px solid var(--border);border-radius:8px;padding:8px 10px;background:var(--card);color:var(--text);font:inherit;font-size:14px;min-height:44px}',
 '#p176 .p176-filters input{flex:1;min-width:180px}',
 '#p176 .p176-history{scroll-margin-top:70px}',
 '#p176 .p176-plot{width:100%;max-height:185px;display:block}',
 '#p176 .p176-tblwrap{overflow:auto;margin:8px 0}',
 '#p176 table{width:100%;border-collapse:collapse;min-width:700px}',
 '#p176 th,#p176 td{padding:9px 8px;border-bottom:1px solid var(--border);text-align:left;font-size:14px;vertical-align:top}',
 '#p176 th{color:var(--sub);background:var(--bg);font-weight:550}',
 '#p176 summary{cursor:pointer;color:var(--a);font-size:15px;font-weight:650;padding:6px 46px 6px 0}',
 '#p176 .p176-list-panel{position:relative;min-width:0}',
 '#p176 .p176-list-help{position:absolute;top:12px;right:14px}',
 '#p176 .p176-list-help .tri21-tip{left:auto;right:0}',
 '#p176 .p176-down{color:var(--r);font-weight:700}#p176 .p176-up{color:var(--g);font-weight:700}',
 '#p176 .p176-warning{background:var(--amb);color:var(--am);padding:9px 12px;border-radius:8px;font-size:14px}',
 '@media(max-width:680px){#p176 .p176-priority{grid-template-columns:1fr;gap:5px}#p176 .p176-filters :is(select,input){min-width:100%;font-size:16px}#p176 .p176-kpi{padding:10px}}'
 ].join('\n');document.head.appendChild(s);
}
function changeText(r){
 if(r.movement==='down')return '↓ '+Math.abs(N(r.position_delta)||0)+' мест';
 if(r.movement==='up')return '↑ '+Math.abs(N(r.position_delta)||0)+' мест';
 if(r.movement==='exited')return '↓ вне первых 120';
 if(r.movement==='entered')return '↑ вошёл в 120';
 if(r.movement==='same')return 'без изменений';
 return r.movement==='new'?'Первая проверка':'Вне TOP-120';
}
function isFresh(row,now){
 const observed=Date.parse(row.observed_at||'');
 return Number.isFinite(observed)&&observed>=now-FRESH_MS;
}
function checkAction(row){
 const old=N(row.previous_observed_price),price=N(row.observed_price);
 if(row.observed_stock===false){
  const change=row.previous_observed_stock===true?'Наличие в выдаче сменилось на «нет». ':'';
  return change+'Сверить остаток и доступность доставки.';
 }
 if(old!==null&&price!==null&&price>old*1.03)
  return 'Цена в выдаче выросла с '+money(old)+' до '+money(price)+'. Сверить цену с МРЦ.';
 return 'Сверить наличие, цену и поисковый запрос.';
}
function historyButton(row,label){
 return '<button type="button" class="p176-sku" data-p176-detail="'+E(row.card_key)+'" data-p176-manager-id="'+E(row.manager_email)+'" title="Открыть историю позиции">'+E(label)+'</button>';
}
function kpi(label,value,filter){
 const content='<span>'+E(label)+'</span><b>'+E(count(value))+'</b>';
 return filter?'<button type="button" class="p176-kpi" data-p176-quick="'+filter+'" aria-pressed="'+(state.move===filter)+'">'+content+'</button>':
  '<div class="p176-kpi">'+content+'</div>';
}
function priority(rows,now){
 const hot=rows.filter(r=>isFresh(r,now)&&(r.movement==='exited'||(r.movement==='down'&&N(r.position_delta)<=-10))).slice(0,3);
 return hot.map(r=>'<div class="p176-priority"><div>'+historyButton(r,[r.product_name,r.sku||r.card_key].filter(Boolean).join(' · '))+
  '<p class="p176-note">«'+E(r.keyword)+'» · '+E(dt(r.observed_at))+'</p></div>'+
  '<div><p class="p176-down">'+E(pos(r.previous_position))+' → '+E(pos(r.position))+'</p><p>'+E(checkAction(r))+'</p></div></div>').join('');
}
const MOVES=[['','Все изменения'],['down','Упали'],['drop10','Потеряли 10 мест и больше'],['exited','Вышли из TOP-120'],
 ['up','Выросли'],['entered','Вошли в TOP-120'],['same','Без изменений'],['new','Первая проверка'],['outside','Вне TOP-120']];
const filterKey=()=>JSON.stringify([state.manager,state.move,state.search]);
function listingRows(data){
 const rows=A(data.rows);
 return state.move==='drop10'?rows.filter(r=>N(r.position_delta)<=-10):rows;
}
function tableTotal(s){
 const fields={'':'observed_cards',down:'down',drop10:'drop_10_plus',up:'up',entered:'entered',exited:'exited'};
 return N(s[fields[state.move]]);
}
function hint(id,label,lines){
 return '<span class="tri21-help"><button type="button" aria-label="'+E(label)+'" aria-describedby="'+id+'">*</button>'+
  '<span class="tri21-tip" role="tooltip" id="'+id+'">'+lines.filter(Boolean).map(line=>'<span>'+E(line)+'</span>').join('')+'</span></span>';
}
function help(run,s){
 const freshness='Последняя проверка SKU: '+dt(s.last_checked)+
  (N(s.stale_cards)>0?' · старше 6 часов: '+count(s.stale_cards)+' SKU':'');
 const batch=N(run.keywords_checked)!==null&&N(run.keywords_total)!==null?
  'Последняя порция: '+count(run.keywords_checked)+' из '+count(run.keywords_total)+' запросов.':'';
 return hint('p176-method','Свежесть и методика почасового поиска',[
  freshness,batch,
  'У каждого товара своё время проверки. Через 6 часов наблюдение считается устаревшим. Позиции сравниваются по одной поисковой фразе. Движение позиции само по себе не объясняет причину.',
  '«Вне TOP-120» означает, что товар не найден среди первых 120 результатов проверенного запроса. Если проверка завершилась ошибкой, действует прежнее наблюдение.',
  N(s.up)!==null?'Выросли: '+count(s.up)+'. Упали в пределах TOP-120: '+count(s.down)+'. Сейчас вне TOP-120: '+count(s.outside_120)+'.':''
 ]);
}
function chart(history){
 const rows=A(history).filter(x=>x.observed_at);
 if(!rows.length)return '<p class="p176-note">За последние 30 дней успешных наблюдений нет.</p>';
 const w=700,h=180,px=27,py=16;
 const x=i=>px+(w-2*px)*i/Math.max(1,rows.length-1);
 const y=v=>py+(h-2*py)*(v-1)/127;
 const path=rows.map((r,i)=>N(r.position)===null?'':(i&&N(rows[i-1].position)!==null?'L':'M')+x(i).toFixed(1)+' '+y(N(r.position)).toFixed(1)).join(' ');
 return '<svg class="p176-plot" viewBox="0 0 '+w+' '+h+'" preserveAspectRatio="none" role="img" aria-label="История точных мест в поиске 21vek, верх графика — лучшая позиция">'+
  '<line x1="'+px+'" y1="'+y(120)+'" x2="'+(w-px)+'" y2="'+y(120)+'" stroke="#d9a441" stroke-dasharray="6 4"/>'+
  '<path d="'+path+'" fill="none" stroke="var(--a)" stroke-width="3"/>'+
  rows.map((r,i)=>'<circle cx="'+x(i).toFixed(1)+'" cy="'+(N(r.position)===null?y(120)+7:y(N(r.position))).toFixed(1)+'" r="4" fill="'+(N(r.position)===null?'var(--am)':'var(--a)')+'"><title>'+
   E(dt(r.observed_at))+' · '+E(pos(r.position))+'</title></circle>').join('')+
  '</svg><div class="p176-note">Выше — лучше. Точки под линией №120 показывают проверки, когда товар был вне TOP-120.</div>'+
  '<div class="p176-note">'+rows.slice(-8).reverse().map(r=>E(dt(r.observed_at))+' · '+E(pos(r.position))).join('  |  ')+'</div>';
}
function render(){
 const host=document.getElementById('p176');if(!host)return;
 const previousInput=host.querySelector('[data-p176-search]');
 const focused=previousInput&&document.activeElement===previousInput;
 const selection=focused?[previousInput.selectionStart,previousInput.selectionEnd]:null;
 const expanded=host.querySelector('[data-p176-list]')?.open||false;
 const data=(state.dataKey===filterKey()?state.data:null)||{},summary=data.summary||{},rows=listingRows(data);
 const now=Date.parse(data.generated_at||'')||Date.now();
 const total=tableTotal(summary),priorities=priority(rows,now);
 const listingInfo=state.busy&&!data.summary?'Загружаю позиции…':data.error?'Данные недоступны.':
  'Показано '+count(rows.length)+(total!==null?' из '+count(total):'')+'. Нажмите артикул, чтобы открыть историю.';
 const leaderSelect=leader()?'<select data-p176-manager aria-label="Менеджер">'+
   '<option value="" '+(!state.manager?'selected':'')+'>Оба менеджера</option>'+
   '<option value="aleksandrenko_av@resanta.ru" '+(state.manager==='aleksandrenko_av@resanta.ru'?'selected':'')+'>Александренко</option>'+
   '<option value="krishtal_na@resanta.ru" '+(state.manager==='krishtal_na@resanta.ru'?'selected':'')+'>Кришталь</option></select>':'';
 host.innerHTML=
  '<header class="p176-hero"><div class="tri21-title"><h3 class="p176-heading">Почасовой поиск</h3>'+help(data.run||{},summary)+'</div>'+
  '<button type="button" class="p176-btn" data-p176-reload '+(state.busy?'disabled':'')+'>'+(state.busy?'Обновляю…':'Обновить наблюдения')+'</button></header>'+
  (data.error?'<div class="p176-warning" role="alert">Не удалось загрузить почасовые наблюдения. '+E(data.error)+'</div>':'')+
  '<div class="p176-kpis">'+kpi('SKU в наблюдении',summary.observed_cards)+
   kpi('Вышли из TOP-120',summary.exited,'exited')+kpi('Потеряли 10 мест и больше',summary.drop_10_plus,'drop10')+'</div>'+
  '<div class="p176-filters">'+leaderSelect+
   '<select data-p176-move aria-label="Изменение позиции">'+MOVES.map(([value,label])=>
    '<option value="'+value+'" '+(state.move===value?'selected':'')+'>'+label+'</option>').join('')+
   '</select><input data-p176-search aria-label="Поиск по листингу" placeholder="Артикул, товар или запрос" value="'+E(state.search)+'"></div>'+
  (priorities?'<section class="p176-panel"><h3>Проверить в первую очередь</h3>'+priorities+'</section>':'')+
  (state.detail?'<section class="p176-panel p176-history" data-p176-history tabindex="-1"><div class="p176-panel-head"><h3>История · '+
   E(state.detail.sku||state.detail.card_key)+' · «'+E(state.detail.keyword)+'»</h3>'+
   '<button type="button" class="p176-btn" data-p176-close>Закрыть историю</button></div>'+
   (state.historyBusy?'<p class="p176-note" role="status">Загружаю историю…</p>':state.history?.error?
    '<p class="p176-warning" role="alert">Не удалось загрузить историю.</p>':chart(state.history?.rows))+'</section>':'')+
  '<section class="p176-list-panel"><div class="p176-list-help">'+hint('p176-list-tip','Справка по списку и истории SKU',[
   listingInfo,'Список показывает до 100 строк по выбранным фильтрам. Поиск проходит по всем доступным наблюдениям. История содержит до 200 проверок за последние 30 дней.'
  ])+'</div><details data-p176-list '+(expanded?'open':'')+'><summary>Позиции и история SKU</summary>'+
   '<div class="p176-tblwrap"><table><thead><tr><th>Артикул / товар</th><th>Запрос</th><th>Было</th><th>Последнее место</th><th>Изменение</th><th>Проверено</th></tr></thead><tbody>'+
   (rows.length?rows.map(r=>'<tr><td>'+historyButton(r,r.sku||r.card_key)+'<div>'+E(r.product_name||'')+'</div><div class="p176-note">'+E(r.manager_name||'')+'</div></td>'+
    '<td>'+E(r.keyword)+'</td><td>'+E(r.previous_observed_at?pos(r.previous_position):'—')+'</td><td><strong>'+E(pos(r.position))+'</strong></td>'+
    '<td class="'+(r.movement==='down'||r.movement==='exited'?'p176-down':r.movement==='up'?'p176-up':'')+'">'+E(changeText(r))+'</td>'+
    '<td>'+E(dt(r.observed_at))+(isFresh(r,now)?'':'<div class="p176-note">Старше 6 часов</div>')+'</td></tr>').join(''):
    '<tr><td colspan="6">'+(state.busy?'Загружаю…':data.error?'Данные недоступны.':'По этим фильтрам позиций нет.')+'</td></tr>')+
   '</tbody></table></div></details></section>';
 if(focused){
  const input=host.querySelector('[data-p176-search]');
  input.focus({preventScroll:true});
  if(selection.every(Number.isInteger))input.setSelectionRange(...selection);
 }
}
function openList(){
 const list=document.querySelector('#p176 [data-p176-list]');
 if(list)list.open=true;
}
function clearHistory(){
 historySeq++;state.detail=null;state.history=null;state.historyBusy=false;
}
async function refresh(){
 if(!active())return;
 if(state.busy){state.queued=true;return;}
 state.busy=true;
 const seq=++state.seq,key=filterKey();
 const args={p_manager_email:state.manager||null,p_movement:(state.move==='drop10'?'down':state.move)||null,p_search:state.search||null,p_limit:100};
 render();
 try{
  const data=await rpc('triovist_own_hourly_dashboard_v1',args);
  if(seq!==state.seq||key!==filterKey())return;
  state.data=data;state.dataKey=key;state.lastRead=Date.now();
 }catch(e){
  if(seq===state.seq&&key===filterKey()){state.data={error:e?.message||String(e)};state.dataKey=key;}
 }finally{
  state.busy=false;
  if(seq===state.seq)render();
  if(state.queued){state.queued=false;refresh()}
 }
}
async function openHistory(manager,key){
 const row=A(state.data?.rows).find(r=>r.manager_email===manager&&r.card_key===key);
 if(!row||state.dataKey!==filterKey())return;
 const seq=++historySeq;
 state.detail=row;state.history=null;state.historyBusy=true;render();
 document.querySelector('#p176 [data-p176-history]')?.scrollIntoView?.({block:'nearest',behavior:'smooth'});
 try{
  const data=await rpc('triovist_own_hourly_history_v1',{p_manager_email:manager,p_card_key:key,p_days:30});
  if(seq===historySeq)state.history=data;
 }catch(e){if(seq===historySeq)state.history={error:e?.message||String(e)}}
 finally{if(seq===historySeq){state.historyBusy=false;render()}}
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
 if(!el){el=document.createElement('section');el.id='p176';el.setAttribute('aria-label','Парсер 21vek · Почасовой мониторинг');root.appendChild(el);render();}
 if(!state.lastRead||Date.now()-state.lastRead>5*60*1000)refresh();
}
document.addEventListener('click',e=>{
 if(e.target.closest?.('#tr14-shell [data-tr14="parser"]')){[150,550,1500].forEach(ms=>setTimeout(mount,ms));return;}
 if(!active())return;
 if(e.target.closest?.('[data-p176-reload]')){state.lastRead=0;refresh();return;}
 if(e.target.closest?.('[data-p176-close]')){clearHistory();render();return;}
 const quick=e.target.closest?.('[data-p176-quick]');
 if(quick){state.move=state.move===quick.dataset.p176Quick?'':quick.dataset.p176Quick;clearHistory();openList();refresh();return;}
 const b=e.target.closest?.('[data-p176-detail]');
 if(b)openHistory(b.dataset.p176ManagerId,b.dataset.p176Detail);
},true);
document.addEventListener('change',e=>{
 if(!active())return;
 const x=e.target.closest?.('[data-p176-manager],[data-p176-move]');
 if(!x)return;
 if(x.hasAttribute('data-p176-manager'))state.manager=x.value;
 if(x.hasAttribute('data-p176-move'))state.move=x.value;
 clearHistory();openList();refresh();
},true);
document.addEventListener('input',e=>{
 if(!active()||!e.target.matches?.('[data-p176-search]'))return;
 state.search=e.target.value||'';
 if(searchTimer)clearTimeout(searchTimer);
 searchTimer=setTimeout(()=>{clearHistory();openList();refresh()},450);
},true);
[300,1100,2600].forEach(ms=>setTimeout(mount,ms));
setInterval(()=>{if(active())mount()},60*1000);
window.RESANTA_TRIOVIST_OWN_HOURLY_V1=Object.freeze({version:VERSION,sync:mount,refresh,readOnly:true,neverPromotes:true,depth:120});
})();
