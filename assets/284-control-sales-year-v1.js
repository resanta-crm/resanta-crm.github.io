/* Annual sales: small authenticated monthly aggregates, no new model calls. */
(function(w,d){
'use strict';if(w.RESANTA_YEAR_SALES_V1)return;
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const finite=x=>x!==null&&x!==undefined&&Number.isFinite(Number(x));
const money=x=>finite(x)?Number(x).toLocaleString('ru-RU',{maximumFractionDigits:2})+' BYN':'Нет данных';
const num=x=>Number(x).toLocaleString('ru-RU',{maximumFractionDigits:1});
const yearChange=(current,previous)=>finite(current)&&finite(previous)&&Number(previous)>0?(Number(current)/Number(previous)-1)*100:null;
const changeLabel=(current,previous)=>{const p=yearChange(current,previous);return p===null?'Нет сравнения':(p<0?'−':p>0?'+':'')+num(Math.abs(p))+'%';};
const label=m=>new Date(m+'-01T12:00:00').toLocaleDateString('ru-RU',{month:'short'});
const monthLabel=m=>new Date(m+'-01T12:00:00').toLocaleDateString('ru-RU',{month:'long',year:'numeric'});
const identity=()=>{try{return [currentUser?.id,currentProfile?.id,currentProfile?.role,currentProfile?.name,currentProfile?.email,currentProfile?.access_scope,currentProfile?.region].join('|')}catch(_){return ''}};
let state={actor:'',year:0,data:null,error:'',loading:false,at:0,run:0,month:0,from:1,to:12,scope:'all'},mountRoot=null,modal=null;
function summarize(data,scope='all',from=1,to=12){
 const rows=(data?.months||[]).slice(from-1,to).map(m=>{
  const members=(m.managers||[]).filter(x=>scope==='all'||x.name===scope);
  const shop=data.include_triovist&&(scope==='all'||scope==='Триовист');
  const values=scope==='Триовист'?[]:members;
  const sum=key=>{const a=values.map(x=>x[key]);if(shop)a.push(m[key==='current'?'tri_current':'tri_previous']);return a.length&&a.every(finite)?a.reduce((s,x)=>s+Number(x),0):null;};
  return {...m,current:sum('current'),previous:sum('previous')};
 });
 const current=rows.filter(x=>!x.future),closed=current.filter(x=>!x.partial);
 const sum=(a,key)=>a.length&&a.every(x=>finite(x[key]))?a.reduce((s,x)=>s+Number(x[key]),0):null;
 const now=sum(closed,'current'),before=sum(closed,'previous');
 return {rows,ytd:sum(current,'current'),closedCurrent:now,closedPrevious:before,
  delta:finite(now)&&finite(before)?now-before:null,percent:finite(now)&&before>0?(now/before-1)*100:null,closedMonths:closed.length};
}
function graph(rows){
 const max=Math.max(1,...rows.flatMap(x=>[x.current,x.previous]).filter(finite).map(Number));
 const bar=(value,kind)=>'<span class="ys-column ys-'+kind+'" style="height:'+(finite(value)?Math.max(0,Math.min(100,Number(value)/max*100)):0)+'%" aria-hidden="true"></span>';
 return '<div class="ys-bars" aria-label="Сравнение продаж по завершённым месяцам">'+rows.map(r=>{
  const delta=finite(r.current)&&finite(r.previous)?money(Number(r.current)-Number(r.previous)):'Нет данных';
  const full=label(r.month)+': '+r.month.slice(0,4)+' — '+money(r.current)+'; '+(r.previous_month?.slice(0,4)||String(Number(r.month.slice(0,4))-1))+' — '+money(r.previous)+'; разница — '+delta;
  return '<button type="button" class="ys-month-row" data-ys-month="'+Number(r.month.slice(5))+'" title="'+esc(full)+'" aria-label="'+esc(full+'; к прошлому году '+changeLabel(r.current,r.previous))+'"><strong class="ys-month-change">'+esc(changeLabel(r.current,r.previous))+'</strong><span class="ys-column-pair">'+bar(r.current,'current')+bar(r.previous,'previous')+'</span><strong class="ys-month-name">'+esc(label(r.month))+'</strong></button>';
 }).join('')+'</div>';
}
function html(expanded=false){
 const data=state.data;
 if(!data)return '<p class="cc-muted">'+esc(state.error||'Загружаю годовую динамику…')+'</p>'+(state.error?'<button type="button" class="cc-btn" data-ys-retry>Повторить</button>':'');
 const s=summarize(data,state.scope,state.from,state.to),allMonths=summarize(data,state.scope,1,12).rows,m=allMonths.find(x=>Number(x.month.slice(5))===state.month)||allMonths.at(-1);
 const names=data.months[0]?.managers?.map(x=>x.name)||[];
 const actualMonths=s.rows.filter(x=>!x.future),closedMonths=actualMonths.filter(x=>!x.partial);
 const period=rows=>rows.length?label(rows[0].month)+' – '+label(rows.at(-1).month):'нет месяцев';
 const details=m?'<div class="ys-selected"><div class="ys-selected-head"><strong>'+esc(monthLabel(m.month))+'</strong>'+(m.partial?'<span>Текущий месяц</span>':m.future?'<span>Период ещё не наступил</span>':'')+'</div><div class="ys-selected-cards"><div><span>'+data.year+'</span><strong>'+esc(money(m.current))+'</strong></div><div><span>'+data.previous_year+'</span><strong>'+esc(money(m.previous))+'</strong></div><div><span>К '+data.previous_year+'</span><strong>'+esc(changeLabel(m.current,m.previous))+'</strong></div></div></div>':'';
 const cells=x=>'<td>'+esc(money(x.current))+'</td><td>'+esc(money(x.previous))+'</td><td>'+esc(changeLabel(x.current,x.previous))+'</td>';
 const breakdown=m?'<div class="cc-table-wrap"><table class="cc-table"><thead><tr><th>Продажи</th><th>'+data.year+', BYN</th><th>'+data.previous_year+', BYN</th><th>К '+data.previous_year+'</th></tr></thead><tbody>'+(m.managers||[]).filter(x=>state.scope==='all'||x.name===state.scope).map(x=>'<tr><td>'+esc(x.name)+'</td>'+cells(x)+'</tr>').join('')+(data.include_triovist&&(state.scope==='all'||state.scope==='Триовист')?'<tr><td>Триовист</td>'+cells({current:m.tri_current,previous:m.tri_previous})+'</tr>':'')+'</tbody></table></div>':'';
 return '<div class="ys-top"><div><span class="ys-kpi-label">'+esc(period(closedMonths))+' · '+data.year+'</span><strong>'+esc(money(s.closedCurrent))+'</strong></div><div><span class="ys-kpi-label">'+esc(period(closedMonths))+' · '+data.previous_year+'</span><strong>'+esc(money(s.closedPrevious))+'</strong></div><div><span class="ys-kpi-label">К '+data.previous_year+'</span><strong>'+esc(changeLabel(s.closedCurrent,s.closedPrevious))+'</strong></div></div>'+
 '<div class="ys-legend"><span><i></i>'+data.year+'</span><span><i class="ys-old"></i>'+data.previous_year+'</span></div>'+graph(closedMonths)+
 '<label class="ys-month-pick">Месяц для подробностей<select data-ys-month-select>'+allMonths.map(x=>'<option value="'+Number(x.month.slice(5))+'"'+(x===m?' selected':'')+'>'+esc(monthLabel(x.month))+'</option>').join('')+'</select></label>'+details+
 '<details class="ys-extra"><summary>Фильтры и подробная таблица</summary><div class="ys-controls"><label>Показатели<select class="cc-btn" data-ys-scope><option value="all">'+esc(data.scope)+'</option>'+names.concat(data.include_triovist?['Триовист']:[]).map(n=>'<option'+(state.scope===n?' selected':'')+'>'+esc(n)+'</option>').join('')+'</select></label>'+
 '<label>С месяца<select data-ys-from>'+Array.from({length:12},(_,i)=>'<option value="'+(i+1)+'"'+(state.from===i+1?' selected':'')+'>'+label(state.year+'-'+String(i+1).padStart(2,'0'))+'</option>').join('')+'</select></label><label>По месяц<select data-ys-to>'+Array.from({length:12},(_,i)=>'<option value="'+(i+1)+'"'+(state.to===i+1?' selected':'')+'>'+label(state.year+'-'+String(i+1).padStart(2,'0'))+'</option>').join('')+'</select></label>'+(expanded?'':'<button type="button" class="cc-btn" data-ys-expand>Открыть крупно</button>')+'</div>'+breakdown+'</details>'+
 (state.error?'<p class="cc-muted">Показан предыдущий результат. '+esc(state.error)+'</p><button class="cc-btn" data-ys-retry>Повторить</button>':'');
}
function paint(){if(mountRoot)mountRoot.innerHTML=html();if(modal){modal.querySelector('.ys-body').innerHTML=html(true);modal.querySelector('h3').textContent='Продажи '+state.year+' / '+(state.year-1);}}
async function load(force=false){
 if(state.loading||!force&&state.data&&Date.now()-state.at<180000)return;
 const run=++state.run,actor=identity(),year=state.year;state.loading=true;state.error='';paint();let timer;
 try{const client=typeof db!=='undefined'?db:w.db;let q=client.rpc('crm_control_sales_year_v1',{p_year:year});const abort=new AbortController();if(q.abortSignal)q=q.abortSignal(abort.signal);
  const r=await Promise.race([q,new Promise((_,reject)=>timer=w.setTimeout(()=>{abort.abort();reject(Error('Истекло время ожидания'))},12000))]);
  if(actor!==identity()||run!==state.run||year!==state.year)return;if(r.error)throw r.error;
  if(r.data?.version!=='control.sales.year.1'||r.data.year!==year||r.data.months?.length!==12)throw Error('Неподтверждённый ответ');
  state.data=r.data;state.at=Date.now();state.month=Number(r.data.today.slice(5,7));
 }catch(_){if(actor===identity()&&run===state.run)state.error='Не удалось обновить продажи. Повторите загрузку.';}
 finally{w.clearTimeout(timer);if(actor===identity()&&run===state.run){state.loading=false;paint();}}
}
function click(e){const b=e.target.closest?.('button');if(!b)return;if(b.hasAttribute('data-ys-retry'))void load(true);if(b.hasAttribute('data-ys-expand'))expand();if(b.hasAttribute('data-ys-close'))close();if(b.dataset.ysMonth){state.month=Number(b.dataset.ysMonth);paint();}}
function change(e){if(e.target.matches('[data-ys-scope]'))state.scope=e.target.value;if(e.target.matches('[data-ys-from]'))state.from=Number(e.target.value);if(e.target.matches('[data-ys-to]'))state.to=Number(e.target.value);if(e.target.matches('[data-ys-month-select]'))state.month=Number(e.target.value);if(state.from>state.to)state.to=state.from;paint();}
function close(){modal?.remove();modal=null;}
function expand(){if(!state.data)return;close();modal=d.createElement('div');modal.id='year-sales-dialog';modal.setAttribute('role','dialog');modal.setAttribute('aria-modal','true');modal.setAttribute('aria-label','Годовая динамика продаж');modal.innerHTML='<div class="ys-dialog"><header><h3></h3><button type="button" class="cc-btn" data-ys-close>Закрыть</button></header><div class="ys-body"></div></div>';modal.addEventListener('click',click);modal.addEventListener('change',change);modal.addEventListener('keydown',e=>{if(e.key==='Escape')close();if(e.key==='Tab'){const a=Array.from(modal.querySelectorAll('button,select')).filter(x=>!x.disabled),first=a[0],last=a.at(-1);if(e.shiftKey&&d.activeElement===first){e.preventDefault();last?.focus()}else if(!e.shiftKey&&d.activeElement===last){e.preventDefault();first?.focus()}}});d.body.appendChild(modal);paint();modal.querySelector('[data-ys-close]').focus();}
function mount(el,year){if(!el)return;const actor=identity();if(state.actor!==actor||state.year!==year){close();state={actor,year,data:null,error:'',loading:false,at:0,run:state.run+1,month:0,from:1,to:12,scope:'all'};}
 mountRoot=el;if(!el.__yearBound){el.addEventListener('click',click);el.addEventListener('change',change);el.__yearBound=true;}paint();void load();}
w.RESANTA_YEAR_SALES_V1=Object.freeze({mount,summarize,graph,close,version:'20261114.1'});
const existing=d.getElementById('cc-year-chart');if(existing)mount(existing,Number(existing.dataset.year));
d.addEventListener('visibilitychange',()=>{if(d.hidden)close()});
})(window,document);
