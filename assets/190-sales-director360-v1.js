/* RESANTA CRM · Sales 360 director, v1.
 * Isolated read-only UX. Server: crm_sales360_annual_v1.
 * Native sales, manager YoY, client detail, imports and approvals are unchanged.
 */
(function(w,d){
'use strict';
if(w.RESANTA_SALES360_V1)return;
const ID='sales360-root',CSS='sales360-css',PAGE='page-sales';
const $=id=>d.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num=v=>Number.isFinite(Number(v))?Number(v):0;
const fmt=v=>num(v).toLocaleString('ru-RU',{maximumFractionDigits:2});
const money=v=>fmt(v)+' BYN';
const short=v=>Math.abs(num(v))>=1e6?(num(v)/1e6).toFixed(2).replace('.',',')+' млн':Math.abs(num(v))>=1000?(num(v)/1000).toFixed(1).replace('.',',')+' тыс.':fmt(v);
const MONTHS=['Янв','Фев','Мар','Апр','Май','Июн','Июл','Авг','Сен','Окт','Ноя','Дек'];
const arr=v=>Array.isArray(v)?v:[];
const boss=()=>{try{return currentProfile?.role==='boss'}catch(_){return false}};
const managerMe=()=>{try{return String(currentProfile?.name||'').trim()}catch(_){return''}};
const viewer=()=>{try{return String(currentProfile?.id||currentProfile?.email||managerMe())}catch(_){return managerMe()}};
const active=()=>{try{return typeof crmActivePage==='function'?crmActivePage():$('app')?.dataset?.activePage}catch(_){return''}};
const dbx=()=>{try{return typeof db!=='undefined'?db:w.db}catch(_){return w.db}};
const currentYear=()=>{try{return Number(String(TODAY||'').slice(0,4))||new Date().getFullYear()}catch(_){return new Date().getFullYear()}};
const state={year:currentYear(),manager:boss()?'all':managerMe(),view:'months',category:'all',detail:'clients',expanded:false,legacy:false,loading:false,error:'',data:null,selectedMonth:'',draft:false};
let mounted=false,wrapped=false,requestVersion=0,sourceRender=null;
const cache=new Map(),pending=new Map(),TTL=180000;
function monthKpi(d){
 const k=arr(d?.kpi).filter(x=>num(x.plan)>0);
 return {plan:k.reduce((s,x)=>s+num(x.plan),0),actual:k.reduce((s,x)=>s+num(x.actual),0),count:k.length};
}
function closedRows(d){
 return arr(d?.months).filter(x=>x.closed&&x.has_current);
}
function ytd(d){
 const months=closedRows(d);
 const comparable=months.filter(x=>x.has_previous);
 const current=months.reduce((s,x)=>s+num(x.current),0);
 const prev=comparable.reduce((s,x)=>s+num(x.previous),0);
 const like=comparable.reduce((s,x)=>s+num(x.current),0);
 return {current,prev,like,months:months.length,comparable:comparable.length,delta:prev>0?(like-prev)/prev*100:null};
}
function chartData(d,view){
 const months=arr(d?.months);
 if(view==='quarters'){
  return Array.from({length:4},(_,q)=>{
   const a=months.slice(q*3,q*3+3);
   const actual=a.filter(x=>x.has_current);
   const prev=a.filter(x=>x.has_previous);
   return{label:'Q'+(q+1)+(a.some(x=>x.partial)||actual.length>0&&actual.length<3?'*':''),key:'Q'+(q+1),
    current:actual.reduce((s,x)=>s+num(x.current),0),previous:prev.reduce((s,x)=>s+num(x.previous),0),
    hasCurrent:actual.length>0,hasPrevious:prev.length>0,partial:a.some(x=>x.partial)||actual.length>0&&actual.length<3};
  });
 }
 return months.map((x,i)=>({label:MONTHS[i]+(x.partial?'*':''),key:x.month,
   current:num(x.current),previous:num(x.previous),hasCurrent:!!x.has_current,hasPrevious:!!x.has_previous,partial:!!x.partial}));
}
function categoryMatrix(d,category){
 return arr(d?.matrix).filter(x=>x.category===category).sort((a,b)=>num(b.revenue)-num(a.revenue));
}
function managerGaps(d){
 const field=arr(d?.managers).map(x=>x.name).filter(x=>x&&x!=='Не распределено');
 const matrix=arr(d?.matrix);
 const cats=arr(d?.categories).filter(x=>num(x.current_revenue)>0);
 let proposals=[];
 for(const c of cats){
  const by=categoryMatrix(d,c.category);
  const peers=by.filter(x=>field.includes(x.manager_name)&&num(x.revenue)>0);
  if(peers.length<1)continue;
  for(const name of field){
   if(state.manager!=='all'&&name!==state.manager)continue;
   const item=by.find(x=>x.manager_name===name);
   const revenue=num(item?.revenue);
   const other=peers.filter(x=>x.manager_name!==name);
   if(revenue===0&&other.length&&other.reduce((s,x)=>s+num(x.revenue),0)>=3000){
    proposals.push({manager:name,category:c.category,peerRevenue:other.reduce((s,x)=>s+num(x.revenue),0)});
   }
  }
 }
 return proposals.sort((a,b)=>b.peerRevenue-a.peerRevenue).slice(0,5);
}
function styles(){
 const scope='#'+ID;
 return [
 scope+'{color:var(--text);display:grid;gap:13px;margin:0 0 16px;font-size:13px}',
 scope+' *{box-sizing:border-box}',
 '#page-sales.s360-installed>:not(#'+ID+'){display:none!important}',
 scope+' .s360-head, '+scope+' .s360-head-actions{display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px}',
 scope+' h2{font-size:23px;line-height:1.25;font-weight:840;letter-spacing:-.5px;margin:0}',
 scope+' h3{font-size:14px;font-weight:760;margin:0 0 10px}',
 scope+' .s360-muted{font-size:11px;color:var(--sub);line-height:1.5}',
 scope+' .s360-field{display:grid;gap:4px;min-width:135px}',
 scope+' .s360-field label{font-size:10px;color:var(--sub);font-weight:600}',
 scope+' .s360-field select{background:var(--card);color:var(--text);border:1px solid var(--border);border-radius:8px;padding:9px 11px;font:inherit;font-size:12px}',
 scope+' .s360-filters{display:flex;flex-wrap:wrap;gap:9px;align-items:end}',
 scope+' .s360-kpis{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:9px}',
 scope+' .s360-tile,'+scope+' .s360-panel{background:var(--card);border:1px solid var(--border);border-radius:12px;padding:14px;min-width:0}',
 scope+' .s360-tile small{display:block;font-size:11px;color:var(--sub)}',
 scope+' .s360-tile strong{display:block;font-size:23px;letter-spacing:-.6px;overflow-wrap:anywhere;margin:6px 0}',
 scope+' .s360-tile em{display:block;color:var(--sub);font-style:normal;font-size:10px}',
 scope+' .s360-grid{display:grid;grid-template-columns:1.05fr 1fr;gap:12px}',
 scope+' .s360-note{border-top:1px solid var(--border);padding:10px 0;font-size:12px;line-height:1.5}',
 scope+' .s360-note b{display:block;margin-bottom:4px}',
 scope+' .s360-note small{display:block;font-size:10px;color:var(--sub);margin-top:4px}',
 scope+' .s360-badge{border:1px solid var(--border);border-radius:100px;padding:5px 9px;color:var(--sub);font-size:10px}',
 scope+' .s360-warn{background:#fff7ed;color:#9a3412;border:1px solid #fed7aa;border-radius:9px;padding:10px;font-size:11px}',
 scope+' .s360-tabs{display:flex;gap:6px;flex-wrap:wrap}',
 scope+' .s360-btn{cursor:pointer;background:var(--card);color:var(--text);border:1px solid var(--border);padding:8px 11px;border-radius:8px;font-weight:650;font-size:11px}',
 scope+' .s360-btn.active{background:var(--ab);color:var(--at);border-color:var(--a)}',
 scope+' .s360-btn.primary{background:var(--a);border-color:var(--a);color:#fff}',
 scope+' button:focus-visible, '+scope+' select:focus-visible{outline:3px solid #93c5fd;outline-offset:2px}',
 scope+' .s360-chart{width:100%;height:auto;max-height:245px;display:block}',
 scope+' .s360-legend{display:flex;gap:15px;align-items:center;font-size:11px;color:var(--sub);flex-wrap:wrap}',
 scope+' .s360-legend i{display:inline-block;width:11px;height:11px;border-radius:2px;margin-right:5px}',
 scope+' .s360-minirows{display:grid;gap:9px}',
 scope+' .s360-manager{display:grid;grid-template-columns:95px minmax(60px,1fr) 85px;gap:8px;align-items:center}',
 scope+' .s360-manager .s360-track{background:var(--bg);height:10px;overflow:hidden;border-radius:5px}',
 scope+' .s360-manager .s360-track i{display:block;height:100%;background:var(--a);border-radius:5px}',
 scope+' .s360-manager button{background:none;border:0;padding:0;text-align:left;color:var(--text);font-weight:680;font-size:11px;cursor:pointer;overflow-wrap:anywhere}',
 scope+' .s360-manager b{font-size:11px;text-align:right}',
 scope+' .s360-row{display:grid;grid-template-columns:minmax(120px,1fr) 100px 100px 70px;gap:8px;align-items:center;padding:10px 2px;border-top:1px solid var(--border)}',
 scope+' .s360-row button{font:inherit;color:var(--text);text-align:left;border:0;background:none;cursor:pointer;padding:0}',
 scope+' .s360-row b{font-size:11px;text-align:right}',
 scope+' .s360-row span{font-size:10px;color:var(--sub)}',
 scope+' .s360-tablewrap{overflow-x:auto}',
 scope+' table{border-collapse:collapse;width:100%;min-width:430px;font-size:11px}',
 scope+' th{font-size:10px;color:var(--sub);font-weight:700;text-align:right;border-bottom:1px solid var(--border);padding:9px 7px;white-space:nowrap}',
 scope+' th:first-child{text-align:left}',
 scope+' td{padding:9px 7px;border-bottom:1px solid var(--border);text-align:right}',
 scope+' td:first-child{text-align:left;min-width:110px}',
 scope+' td button{background:none;border:0;color:var(--text);font:inherit;cursor:pointer;text-align:left}',
 scope+' .s360-zero{color:var(--sub);font-style:italic}',
 scope+' .s360-positive{color:var(--g)}',
 scope+' .s360-negative{color:var(--r)}',
 scope+' .s360-detail{padding:12px;border-radius:9px;background:var(--bg);display:grid;gap:9px;margin-top:10px}',
 scope+' .s360-copy{width:100%;min-height:92px;padding:10px;background:var(--card);border:1px solid var(--border);border-radius:8px;color:var(--text);font:inherit;font-size:11px;resize:vertical}',
 scope+' .s360-foot{display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:center}',
 scope+' .s360-loading{padding:35px 15px;border:1px solid var(--border);border-radius:12px;text-align:center;color:var(--sub)}',
 '@media(max-width:1050px){'+scope+' .s360-kpis{grid-template-columns:repeat(3,minmax(0,1fr))}'+scope+' .s360-grid{grid-template-columns:1fr}}',
 '@media(max-width:640px){'+scope+' .s360-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}'+scope+' h2{font-size:19px}'+scope+' .s360-tile strong{font-size:19px}'+scope+' .s360-row{grid-template-columns:1fr 85px 85px}'+scope+' .s360-row span:last-child{grid-column:2 / 4;text-align:right}}'
 ].join('\n');
}
function mount(){
 const page=$(PAGE);if(!page)return null;
 let root=$(ID);
 if(!root){
  const st=d.createElement('style');st.id=CSS;st.textContent=styles();d.head.appendChild(st);
  root=d.createElement('section');root.id=ID;root.setAttribute('aria-label','Продажи 360° · директорский контроль');
  page.insertAdjacentElement('afterbegin',root);
  root.addEventListener('click',onClick);
  root.addEventListener('change',onChange);
  mounted=true;
 }
 page.classList.toggle('s360-installed',!state.legacy);
 return root;
}
function trendSvg(items){
 const shown=items.filter(x=>x.hasCurrent||x.hasPrevious);
 if(!shown.length)return'<div class="s360-muted">За выбранный период нет подтверждённых данных.</div>';
 const max=Math.max(1,...shown.flatMap(x=>[x.hasCurrent?x.current:0,x.hasPrevious?x.previous:0]));
 const w=660,h=210,l=34,t=16,plotW=610,plotH=151;
 const x=i=>l+(items.length===1?plotW/2:i*plotW/(items.length-1));
 const y=v=>t+plotH-Math.max(0,num(v))/max*plotH;
 let lines='';
 for(const [key,color] of [['previous','#aab4c5'],['current','#2563eb']]){
  let seg=[];
  items.forEach((a,i)=>{
   const exists=key==='current'?a.hasCurrent:a.hasPrevious;
   if(!exists){if(seg.length){lines+='<polyline points="'+seg.join(' ')+'" fill="none" stroke="'+color+'" stroke-width="2.5" stroke-linejoin="round"/>';seg=[];}return;}
   seg.push(x(i).toFixed(1)+','+y(a[key]).toFixed(1));
  });
  if(seg.length)lines+='<polyline points="'+seg.join(' ')+'" fill="none" stroke="'+color+'" stroke-width="2.5" stroke-linejoin="round"/>';
  items.forEach((a,i)=>{
   const exists=key==='current'?a.hasCurrent:a.hasPrevious;
   if(!exists)return;
   const title=a.label+' · '+(key==='current'?'текущий год':'прошлый год')+': '+money(a[key])+(a.partial?' · неполный период':'');
   lines+='<circle cx="'+x(i).toFixed(1)+'" cy="'+y(a[key]).toFixed(1)+'" r="3.6" fill="'+color+'"><title>'+esc(title)+'</title></circle>';
  });
 }
 const marks=items.map((a,i)=>'<text x="'+x(i).toFixed(1)+'" y="194" text-anchor="middle" fill="currentColor" font-size="10">'+esc(a.label)+'</text>').join('');
 return '<svg class="s360-chart" viewBox="0 0 '+w+' '+h+'" role="img" aria-label="Годовая динамика продаж двух лет" preserveAspectRatio="xMidYMid meet">'+
  '<path d="M'+l+' '+(t+plotH)+'H'+(l+plotW)+'" stroke="#b5bec9" stroke-width="1"/>'+
  [0,0.5,1].map(k=>'<path d="M'+l+' '+y(k*max).toFixed(1)+'H'+(l+plotW)+'" stroke="#cbd5e1" opacity=".4" stroke-dasharray="3 5"/>').join('')+
  lines+marks+'</svg>';
}
function showSelectorOptions(d){
 const available=arr(d?.managers).map(x=>x.name).filter(x=>x&&x!=='Не распределено');
 const allowed=['Руднев','Ачинович','Шкуран'];
 const names=[...new Set([...allowed,...available])];
 if(!boss())return'<div class="s360-field"><label>Менеджер</label><strong>'+esc(managerMe())+'</strong></div>';
 return'<div class="s360-field"><label for="s360-manager">Менеджер</label><select id="s360-manager" data-s360-select="manager"><option value="all"'+(state.manager==='all'?' selected':'')+'>Все менеджеры</option>'+
 names.map(x=>'<option value="'+esc(x)+'"'+(state.manager===x?' selected':'')+'>'+esc(x)+'</option>').join('')+'</select></div>';
}
function kpiCard(label,value,desc,color=''){
 return'<div class="s360-tile"><small>'+esc(label)+'</small><strong'+(color?' class="'+color+'"':'')+'>'+esc(value)+'</strong><em>'+esc(desc)+'</em></div>';
}
function getKpi(d){
 const k=monthKpi(d);
 const actual=k.actual,plan=k.plan;
 return{k,display:plan>0?(actual/plan*100).toFixed(1).replace('.',',')+'%':'—',description:plan>0?'Факт '+short(actual)+' / план '+short(plan)+' BYN · '+(d.kpi_month||''):'План не подтверждён в KPI 360°'};
}
function brief(d){
 const y=ytd(d),categories=arr(d.categories),gaps=managerGaps(d);
 const declines=categories.filter(x=>num(x.current_revenue)<num(x.previous_revenue)).sort((a,b)=>(num(a.current_revenue)-num(a.previous_revenue))-(num(b.current_revenue)-num(b.previous_revenue)));
 const lead=declines[0],month=arr(d.months).find(x=>x.partial);
 const compare=y.delta===null?'прошлогоднего сравнения нет':(y.delta>=0?'+':'')+y.delta.toFixed(1).replace('.',',')+'% к сопоставимому прошлому году';
 let texts=[
  ['Продажи и темп','За '+y.months+' закрытых месяцев — '+short(y.current)+' BYN; '+compare+'.','Проверить план/факт в KPI 360° и группы, давшие снижение.','categories'],
  ['Ассортимент',lead?'По группе «'+lead.category+'» отгрузки ниже прошлого года на '+short(num(lead.previous_revenue)-num(lead.current_revenue))+' BYN.':'Среди подтверждённых групп не найдено явного снижения к сопоставимому периоду.',
    'Открыть динамику группы; проверить спрос, наличие и клиентскую базу.','categories'],
  ['Проверка возможностей',gaps.length?'У '+gaps[0].manager+' нет продаж группы «'+gaps[0].category+'» за закрытые месяцы, хотя другие менеджеры её продавали.':'Явных нулевых товарных групп при подтверждённом спросе коллег не обнаружено.',
    'Отсутствие продаж не доказывает нехватку знаний. Сначала проверить спрос, склад, клиентов и коммерческие предложения.','matrix']
 ];
 return '<div class="s360-panel"><h3>✦ ИИ · Утренний брифинг продаж</h3>'+
 texts.map((t,i)=>'<div class="s360-note"><b>'+(i+1)+'. '+esc(t[0])+'</b>'+esc(t[1])+'<small>'+esc(t[2])+'</small><button type="button" data-s360-jump="'+t[3]+'" class="s360-btn" style="margin-top:7px">Открыть детали</button></div>').join('')+
 (month?'<div class="s360-warn">Ноябрь или другой текущий месяц ещё не закрыт: его фактические отгрузки показаны на графике, но не включены в годовой процент роста/падения.</div>':'')+
 '<div class="s360-muted" style="margin-top:9px">Правила на подтверждённых данных 1С · Причины и знания сотрудников не определяются автоматически.</div></div>';
}
function managerBars(d){
 const rows=arr(d.managers).filter(x=>x.name&&x.name!=='Не распределено');
 if(!rows.length)return'<div class="s360-muted">Данные менеджеров за период не найдены.</div>';
 const max=Math.max(1,...rows.map(x=>Math.max(0,num(x.current_revenue))));
 return'<div class="s360-minirows">'+rows.map(x=>
  '<div class="s360-manager"><button type="button" data-s360-mgr="'+esc(x.name)+'">'+esc(x.name)+'</button><span class="s360-track"><i style="width:'+Math.max(0,num(x.current_revenue))/max*100+'%"></i></span><b>'+esc(short(x.current_revenue))+'</b></div>'
 ).join('')+'</div>';
}
function categoryTable(d){
 const cats=arr(d.categories).sort((a,b)=>num(b.current_revenue)-num(a.current_revenue));
 if(!cats.length)return'<div class="s360-muted">Категории продаж не найдены.</div>';
 const shown=state.expanded?cats:cats.slice(0,7);
 const max=Math.max(1,...cats.map(x=>num(x.current_revenue)));
 return shown.map(x=>
  '<div class="s360-manager"><button type="button" data-s360-category="'+esc(x.category)+'">'+esc(x.category)+'</button>'+
  '<span class="s360-track"><i style="width:'+Math.max(0,num(x.current_revenue))/max*100+'%"></i></span><b>'+esc(short(x.current_revenue))+'</b></div>'
 ).join('')+(shown.length<cats.length?'<button type="button" class="s360-btn" data-s360-expand>Все группы ('+cats.length+')</button>':'');
}
function matrix(d){
 const categories=arr(d.categories).map(x=>x.category);
 if(!categories.length)return'<div class="s360-muted">Матрица не заполнена.</div>';
 if(!categories.includes(state.category))state.category=categories[0];
 const rows=categoryMatrix(d,state.category).filter(x=>x.manager_name!=='Не распределено');
 const managers=arr(d.managers).map(x=>x.name).filter(x=>x&&x!=='Не распределено');
 const peersTotal=rows.reduce((s,x)=>s+Math.max(0,num(x.revenue)),0);
 const gaps=managerGaps(d);
 const gap=gaps.find(x=>x.category===state.category);
 return '<div id="s360-matrix" class="s360-panel"><div class="s360-head-actions"><h3>Товарные группы · Потенциал менеджеров</h3><span class="s360-badge">С января по закрытый месяц</span></div>'+
  '<div class="s360-field" style="max-width:330px;margin-bottom:10px"><label for="s360-category">Группа товара</label><select id="s360-category" data-s360-select="category">'+categories.map(x=>'<option value="'+esc(x)+'"'+(state.category===x?' selected':'')+'>'+esc(x)+'</option>').join('')+'</select></div>'+
  '<div class="s360-tablewrap"><table><thead><tr><th>Менеджер</th><th>Продажи</th><th>Год назад</th><th>Клиенты</th></tr></thead><tbody>'+
  managers.map(name=>{
   const x=rows.find(r=>r.manager_name===name);
   const cur=num(x?.revenue),prev=num(x?.previous_revenue);
   const no=cur<=0&&peersTotal>0;
   return'<tr><td><button type="button" data-s360-mgr="'+esc(name)+'">'+esc(name)+'</button></td>'+
    '<td'+(no?' class="s360-zero"':'')+'>'+esc(cur>0?money(cur):'Нет продаж')+'</td>'+
    '<td>'+esc(prev?money(prev):'—')+'</td><td>'+num(x?.clients)+'</td></tr>';
  }).join('')+
  '</tbody></table></div><div class="s360-detail"><b>ИИ · Что проверить</b>'+
  '<span>'+(gap?'У '+esc(gap.manager)+' нет продаж выбранной группы, при этом коллеги продали её на '+esc(short(gap.peerRevenue))+' BYN.':'Сопоставьте ассортимент, сезонность и продажи с прошлым годом. Нулевая выручка сама по себе не означает отсутствие знаний.')+'</span>'+
  '<span class="s360-muted">Проверить: потребность клиентов → наличие Витебска → предложения и визиты → при необходимости обучение и тест по продукту.</span>'+
  (boss()?'<div class="s360-tabs"><button type="button" class="s360-btn" data-s360-draft>Подготовить поручение на проверку</button><button type="button" class="s360-btn" data-s360-tasks>Открыть задачи</button></div>':'')+
  (state.draft?draft(d):'')+'</div></div>';
}
function draft(d){
 const focus=state.manager==='all'?'Выбранный менеджер':state.manager;
 const content='Проверить возможность роста продаж группы «'+state.category+'». Ответственный: '+focus+'. Проверить спрос клиентов, наличие на складе Витебск, историю предложений и визитов. При выявленном пробеле знаний: согласовать обучение, затем тест на 10 вопросов (порог 80%) по утверждённым материалам производителя. Представить подтверждённые действия и факт отгрузок из 1С. Задача создаётся только после согласования руководителем.';
 return'<label class="s360-muted" for="s360-draft-text">Черновик поручения · автоматически не создаётся</label><textarea class="s360-copy" id="s360-draft-text">'+esc(content)+'</textarea><button type="button" class="s360-btn" data-s360-copy>Копировать черновик</button>';
}
function topClients(d){
 const rows=arr(d.top_clients).slice(0,state.expanded?15:7);
 return'<div class="s360-panel" id="s360-clients"><div class="s360-head-actions"><h3>Клиенты · Отгрузки за закрытые месяцы</h3><span class="s360-badge">Источник 1С</span></div>'+
 (rows.length?rows.map(x=>'<div class="s360-row"><button type="button" '+(x.client_id?'data-s360-client="'+esc(x.client_id)+'"':'disabled')+'><b>'+esc(x.client_name||'—')+'</b>'+(x.is_unallocated?'<span class="s360-muted"> · без точной ТТ</span>':'')+'</button><b>'+esc(short(x.revenue))+'</b><span>'+esc(x.manager_name||'—')+'</span><span>'+(x.client_id?'Карточка CRM':'1С')+'</span></div>').join(''):'<div class="s360-muted">Нет данных о клиентах.</div>')+
 '<div class="s360-tabs" style="margin-top:10px">'+
 (!state.expanded&&arr(d.top_clients).length>rows.length?'<button type="button" class="s360-btn" data-s360-expand>Показать ТОП-15</button>':'')+
 '<button type="button" class="s360-btn primary" data-s360-all-clients>Все клиенты · Поиск и детализация</button></div>'+
 '<div class="s360-muted" style="margin-top:9px">Полный поиск, сравнение кварталов и переходы к клиентам открываются в существующем отчёте «Менеджеры · год к году».</div></div>';
}
function render(){
 const root=mount();if(!root)return;
 if(!state.data){
  root.innerHTML='<div class="s360-head"><h2>Продажи 360°</h2><span class="s360-badge">Директорский контроль</span></div><div class="s360-loading">'+
  (state.error?'Не удалось получить годовую аналитику: '+esc(state.error):'Загружаю аналитику продаж 1С…')+
  (state.error?'<div style="margin-top:10px"><button type="button" class="s360-btn" data-s360-refresh>Повторить загрузку</button><button type="button" class="s360-btn" data-s360-legacy>Открыть исходный отчёт</button></div>':'')+'</div>';
  return;
 }
 const d=state.data,y=ytd(d),kpi=getKpi(d);
 const periods=chartData(d,state.view);
 const comparison=y.delta===null?'—':(y.delta>=0?'+':'')+y.delta.toFixed(1).replace('.',',')+'%';
 const colors=y.delta===null?'':y.delta<0?'s360-negative':'s360-positive';
 const years=[currentYear(),currentYear()-1,currentYear()-2,currentYear()-3].filter(x=>x>=2023);
 const freshest=d.freshness?.last_success_at||d.freshness?.report_date;
 root.innerHTML=
 '<div class="s360-head"><div><h2>Продажи 360° · Управление ростом</h2><div class="s360-muted">Годовая аналитика · менеджеры · товарные группы · клиенты · данные 1С с НДС</div></div><div class="s360-muted">Обновление 1С: '+esc(freshest?String(freshest).replace('T',' ').slice(0,16):'дата не подтверждена')+'</div></div>'+
 '<div class="s360-filters">'+
 '<div class="s360-field"><label for="s360-year">Год</label><select id="s360-year" data-s360-select="year">'+years.map(x=>'<option value="'+x+'"'+(state.year===x?' selected':'')+'>'+x+' / '+(x-1)+'</option>').join('')+'</select></div>'+
 showSelectorOptions(d)+
 '<div class="s360-field"><label for="s360-view">Периодичность</label><select id="s360-view" data-s360-select="view"><option value="months"'+(state.view==='months'?' selected':'')+'>Месяцы</option><option value="quarters"'+(state.view==='quarters'?' selected':'')+'>Кварталы</option></select></div>'+
 '<button type="button" class="s360-btn" data-s360-refresh>↻ Обновить</button></div>'+
 '<div class="s360-kpis">'+
 kpiCard('Отгрузки с января',short(y.current)+' BYN',y.months+' закрытых месяцев, нетто 1С')+
 kpiCard('К прошлому году',comparison,'Сопоставимые закрытые месяцы',colors)+
 kpiCard('Покупателей',fmt(d.active_clients_ytd),'Уникальных с продажами по 1С')+
 kpiCard('План/факт месяца',kpi.display,kpi.description)+
 kpiCard('Без точной ТТ',short(d.unallocated_client_revenue)+' BYN','Включено в общий оборот')+'</div>'+
 '<div class="s360-grid">'+brief(d)+
 '<div class="s360-panel"><div class="s360-head-actions"><h3>Динамика с января · '+d.year+' / '+d.previous_year+'</h3><span class="s360-badge">BYN · фактическая выручка</span></div>'+trendSvg(periods)+
 '<div class="s360-legend"><span><i style="background:#2563eb"></i>'+d.year+'</span><span><i style="background:#aab4c5"></i>'+d.previous_year+'</span></div>'+
 '<div class="s360-muted" style="margin-top:10px">* Текущий месяц или незакрытый квартал. Неполные периоды исключены из процента роста с начала года. Нажмите «Открыть месяц», чтобы посмотреть подробности в исходном отчёте.</div>'+
 '<div class="s360-tabs" style="margin-top:10px">'+arr(d.months).filter(x=>x.has_current).slice(-4).map(x=>'<button type="button" class="s360-btn" data-s360-month="'+esc(x.month)+'">'+MONTHS[Number(x.month.slice(5,7))-1]+'</button>').join('')+'</div></div></div>'+
 '<div class="s360-grid"><div class="s360-panel" id="s360-managers"><h3>Менеджеры · Отгрузки с января</h3>'+managerBars(d)+
 '<p class="s360-muted" style="margin-top:12px">График использует текущее закрепление клиентской базы. Не распределённый по менеджеру оборот не приписывается сотруднику.</p></div>'+
 '<div class="s360-panel" id="s360-categories"><h3>Товарные группы · Рейтинг продаж</h3><div class="s360-minirows">'+categoryTable(d)+'</div></div></div>'+
 matrix(d)+topClients(d)+
 '<div class="s360-foot"><span class="s360-muted">ИИ-сигналы — гипотезы для проверки. Нельзя считать нулевые продажи доказательством незнания товара. Никакие задачи и экзамены автоматически не создаются.</span>'+
 '<button type="button" class="s360-btn" data-s360-legacy aria-expanded="'+String(state.legacy)+'">'+(state.legacy?'Скрыть прежние отчёты':'Раскрыть исходные отчёты и все фильтры')+'</button></div>';
}
function onChange(e){
 const t=e.target.closest?.('[data-s360-select]');if(!t)return;
 const v=t.value,k=t.dataset.s360Select;
 if(k==='year'){const y=Number(v);if(y>=2023&&y<=currentYear()){state.year=y;state.category='all';state.expanded=false;state.draft=false;load(false)}}
 if(k==='manager'){
  if(!boss())return;
  state.manager=v;state.category='all';state.expanded=false;state.draft=false;
  if(typeof w.salesMgr374==='function')w.salesMgr374(v);
  load(false);
 }
 if(k==='view'&&['months','quarters'].includes(v)){state.view=v;render()}
 if(k==='category'){state.category=v;state.draft=false;render()}
}
function jump(section){$(ID)?.querySelector?.('#s360-'+section)?.scrollIntoView?.({behavior:'smooth',block:'nearest'})}
function originalReports(openCompare){
 state.legacy=true;mount();render();
 if(openCompare&&typeof w.msyOpen374==='function')w.msyOpen374();
 setTimeout(()=>$('manager-sales-yoy-v23634')?.scrollIntoView?.({behavior:'smooth',block:'start'}),70);
}
function onClick(e){
 const t=e.target.closest?.('button');if(!t)return;
 const a=t.dataset;
 if(a.s360Refresh!==undefined){load(true);return}
 if(a.s360Mgr!==undefined&&boss()){state.manager=a.s360Mgr;state.category='all';state.draft=false;if(typeof w.salesMgr374==='function')w.salesMgr374(state.manager);load(false);return}
 if(a.s360Category!==undefined){state.category=a.s360Category;state.draft=false;jump('matrix');render();return}
 if(a.s360Jump!==undefined){jump(a.s360Jump);return}
 if(a.s360Expand!==undefined){state.expanded=true;render();return}
 if(a.s360Month!==undefined){if(typeof w.salesMonth374==='function')w.salesMonth374(a.s360Month);originalReports(false);return}
 if(a.s360Client!==undefined){if(typeof w.openClient==='function')w.openClient(a.s360Client);return}
 if(a.s360AllClients!==undefined){originalReports(true);return}
 if(a.s360Legacy!==undefined){state.legacy=!state.legacy;mount();render();return}
 if(a.s360Draft!==undefined&&boss()){state.draft=!state.draft;render();return}
 if(a.s360Copy!==undefined&&boss()){
  const value=$('s360-draft-text')?.value||'';
  if(!value)return;
  const clipboard=w.navigator?.clipboard;
  if(clipboard?.writeText){clipboard.writeText(value).then(()=>{t.textContent='Скопировано';},()=>{t.textContent='Скопируйте текст вручную';});}
  else{t.textContent='Выделите и скопируйте текст';$('s360-draft-text')?.select?.();}
  return;
 }
 if(a.s360Tasks!==undefined&&boss()&&typeof w.goPage==='function')w.goPage('tasks','Задачи ИИ');
}
async function load(force=false){
 const root=mount();if(!root||active()!=='sales')return;
 const serial=++requestVersion;
 const key=[viewer(),state.year,boss()?state.manager:managerMe()].join('|');
 const hit=cache.get(key);
 if(!force&&hit&&Date.now()-hit.at<TTL){state.data=hit.data;state.error='';render();return}
 state.data=null;state.error='';state.loading=true;render();
 try{
  let work=pending.get(key);
  if(!work||force){
   const database=dbx();if(!database?.rpc)throw Error('Источник Supabase недоступен');
   work=Promise.resolve().then(()=>database.rpc('crm_sales360_annual_v1',{
    p_year:state.year,p_manager:boss()&&state.manager!=='all'?state.manager:null
   })).then(({data,error})=>{if(error)throw error;return data;});
   pending.set(key,work);
   work.finally(()=>{if(pending.get(key)===work)pending.delete(key)}).catch(()=>{});
  }
  const result=await work;
  if(serial!==requestVersion||active()!=='sales')return;
  if(!result||!Array.isArray(result.months))throw Error('Сервер вернул неполную годовую аналитику');
  state.data=result;state.error='';cache.set(key,{at:Date.now(),data:result});
  while(cache.size>16)cache.delete(cache.keys().next().value);
 }catch(err){
  if(serial===requestVersion){state.error=String(err?.message||err);state.data=null;console.warn('Sales360 annual read-only request',err)}
 }finally{if(serial===requestVersion){state.loading=false;render()}}
}
function install(){
 if(wrapped)return;
 const original=w.renderSales;
 if(typeof original!=='function')return;
 sourceRender=original;
 w.renderSales=function(){
  const out=sourceRender.apply(this,arguments);
  if(active()==='sales'){if(!mounted)mount();load(false);}
  return out;
 };
 wrapped=true;
 if(active()==='sales')load(false);
}
w.RESANTA_SALES360_V1=Object.freeze({version:'20261110.1',readOnly:true,annualRpc:'crm_sales360_annual_v1',ytd,chartData,categoryMatrix,managerGaps,monthKpi});
if(d.readyState==='loading')d.addEventListener('DOMContentLoaded',install,{once:true});
else install();
})(window,document);
