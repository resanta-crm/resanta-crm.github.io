/* PDZ360 2026-11-10: day-over-day dashboard, no fabricated October comparison.
   Isolated presentation; legacy filters, 1C importer, comments and legal actions remain intact. */
(function(w){
'use strict';
if(w.RESANTA_PDZ360_V1)return;
const ID='pdz360-root',VERSION='pdz360.daily.1',TTL=120000;
const state={data:null,manager:'all',managerOptions:[],days:14,view:'amount',age:'all',query:'',selected:'',loading:false,error:'',loadedAt:0,legacy:false,requestId:0,debtorScroll:0};
const E=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const n=v=>Number.isFinite(Number(v))?Number(v):0;
const money=v=>n(v).toLocaleString('ru-RU',{minimumFractionDigits:2,maximumFractionDigits:2})+' BYN';
const compact=v=>Math.round(n(v)).toLocaleString('ru-RU')+' BYN';
const signed=v=>(n(v)>0?'+':'')+money(v);
const day=v=>{const x=String(v||'');return /^\d{4}-\d\d-\d\d$/.test(x)?x.slice(8)+'.'+x.slice(5,7):x};
const date=v=>{const x=String(v||'');return /^\d{4}-\d\d-\d\d$/.test(x)?x.slice(8)+'.'+x.slice(5,7)+'.'+x.slice(0,4):x||'—'};
const logged=()=>{try{return typeof currentUser!=='undefined'&&currentUser?.id&&typeof currentProfile!=='undefined'&&['boss','manager'].includes(currentProfile?.role)}catch{return false}};
const boss=()=>{try{return currentProfile?.role==='boss'}catch{return false}};
const active=()=>!!w.document.getElementById('page-debt')?.classList.contains('active')||w.document.getElementById('app')?.dataset?.activePage==='debt';
const dbc=()=>{try{return typeof db!=='undefined'?db:w.db}catch{return w.db}};
const arr=v=>Array.isArray(v)?v:[];
const safe=()=>logged()&&active();
const riskLabel=x=>x==='critical'?'Критично':x==='high'?'Высокий риск':x==='warning'?'Просрочка 30+':'Контроль';
const riskColor=x=>x==='critical'||x==='high'?'danger':x==='warning'?'warn':'neutral';
const best=rows=>rows.slice().sort((a,b)=>{const rank=x=>x==='critical'?0:x==='high'?1:x==='warning'?2:3;return rank(a.risk)-rank(b.risk)||n(b.overdue)-n(a.overdue)});
function rows(){
 const d=arr(state.data?.rows),q=state.query.toLocaleLowerCase('ru-RU');
 return best(d.filter(x=>(state.age==='all'||(
  state.age==='0_7'?n(x.days_overdue)<8:
  state.age==='8_30'?n(x.days_overdue)>=8&&n(x.days_overdue)<=30:
  state.age==='31_60'?n(x.days_overdue)>=31&&n(x.days_overdue)<=60:
  n(x.days_overdue)>60))&&(!q||(x.client_name+' '+x.manager_name).toLocaleLowerCase('ru-RU').includes(q))));
}
function mount(){
 const page=w.document.getElementById('page-debt');if(!page)return null;
 let root=w.document.getElementById(ID);
 if(!root){
  root=w.document.createElement('div');root.id=ID;
  const title=page.querySelector('.page-title');
  if(title)title.insertAdjacentElement('afterend',root);else page.prepend(root);
  root.addEventListener('click',onClick);root.addEventListener('change',onChange);root.addEventListener('input',onInput);root.addEventListener('keydown',onKeyDown);
 }
 page.classList.toggle('pdz360-installed',!state.legacy);
 return root;
}
function css(){
 if(w.document.getElementById('pdz360-style'))return;
 const x=w.document.createElement('style');x.id='pdz360-style';
 x.textContent=[
 '#page-debt.pdz360-installed>#debt-freshness,#page-debt.pdz360-installed>#debt-summary,#page-debt.pdz360-installed>#debt-list,#page-debt.pdz360-installed>#debt-period-filter-v236198,#page-debt.pdz360-installed>#pdz-control-v236275{display:none!important}',
 '#page-debt.pdz360-installed>.page-title{display:none!important}',
 '#pdz360-root{--p:#2563eb;--muted:#64748b;--stroke:#dce4ee;color:var(--text,#172438);font:inherit;display:grid;gap:12px}',
 '#pdz360-root .p-card{border:1px solid var(--border,#dce4ee);border-radius:14px;padding:16px;background:var(--card,#fff);min-width:0}',
 '#pdz360-root .p-header{display:flex;gap:12px;align-items:center;justify-content:space-between;flex-wrap:wrap}',
 '#pdz360-root h2{font-size:23px;margin:0;font-weight:760}#pdz360-root h3{font-size:16px;margin:0;font-weight:740}',
 '#pdz360-root .p-muted{font-size:12px;color:var(--sub,#64748b);line-height:1.45}',
 '#pdz360-root .p-controls{display:flex;flex-wrap:wrap;gap:8px;align-items:end}',
 '#pdz360-root .p-field{display:grid;gap:4px;min-width:125px}#pdz360-root .p-field label{font-size:11px;color:var(--sub,#64748b)}',
 '#pdz360-root input,#pdz360-root select{border:1px solid var(--border,#dce4ee);background:var(--card,#fff);color:var(--text,#172438);padding:10px;border-radius:9px;font:inherit;min-width:0}',
 '#pdz360-root button{cursor:pointer;font:inherit}#pdz360-root .p-btn{padding:9px 12px;border-radius:9px;border:1px solid var(--border,#dce4ee);background:var(--card,#fff);color:var(--text,#172438);font-size:12px;font-weight:700}',
 '#pdz360-root .p-btn.p-active,#pdz360-root .p-btn.p-primary{background:#1e64bb;color:#fff;border-color:#1e64bb}',
 '#pdz360-root .p-kpis{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:9px}',
 '#pdz360-root .p-kpi{padding:14px;border:1px solid var(--border,#dce4ee);border-radius:12px;background:var(--card,#fff);min-width:0;display:grid;align-content:start;gap:7px}',
 '#pdz360-root .p-kpi small{color:var(--sub,#64748b);font-size:11px}#pdz360-root .p-kpi strong{font-size:23px;line-height:1.15;overflow-wrap:anywhere}',
 '#pdz360-root .p-top{display:grid;grid-template-columns:1.4fr 1fr 1.05fr;gap:10px}',
 '#pdz360-root .p-chart{width:100%;height:auto;min-width:360px;display:block}#pdz360-root .p-chart-wrap{overflow-x:auto}',
 '#pdz360-root .p-donut{width:126px;aspect-ratio:1;border-radius:50%;display:grid;place-items:center;flex:none}',
 '#pdz360-root .p-donut>span{width:86px;height:86px;border-radius:50%;background:var(--card,#fff);display:grid;place-items:center;text-align:center;font-size:12px;font-weight:800}',
 '#pdz360-root .p-ages{display:flex;gap:15px;align-items:center;flex-wrap:wrap;margin-top:13px}',
 '#pdz360-root .p-band{display:flex;align-items:center;justify-content:space-between;gap:8px;margin:7px 0;font-size:11px}',
 '#pdz360-root .p-indicator{width:9px;height:9px;border-radius:50%;display:inline-block;margin-right:5px}',
 '#pdz360-root .p-brief{display:grid;gap:8px;margin-top:13px}#pdz360-root .p-brief-btn{display:flex;justify-content:space-between;text-align:left;gap:8px;align-items:center;width:100%;border:1px solid var(--border,#dce4ee);border-radius:10px;background:var(--bg,#f5f8fd);padding:10px;color:inherit}',
 '#pdz360-root .p-split{display:grid;grid-template-columns:minmax(280px,1fr) minmax(330px,1.1fr);gap:10px}',
 '#pdz360-root .p-debtors{max-height:570px;overflow-y:auto;display:grid;gap:5px;margin-top:12px}',
 '#pdz360-root .p-item{display:grid;grid-template-columns:minmax(145px,1fr) 122px;gap:7px;padding:10px;border-radius:9px;text-align:left;background:var(--card,#fff);border:1px solid var(--border,#dce4ee);color:inherit;width:100%}',
 '#pdz360-root .p-item[aria-current=true]{background:#eaf2ff;border-color:#1e64bb}#pdz360-root .p-item b{font-size:12px}#pdz360-root .p-item small{display:block;font-size:10px;color:var(--sub,#64748b);margin-top:3px}',
 '#pdz360-root .p-amount{font-size:13px;font-weight:800;text-align:right}#pdz360-root .p-delta{font-size:11px;font-weight:750}#pdz360-root .p-danger{color:#c52842}#pdz360-root .p-good{color:#12804a}#pdz360-root .p-warn{color:#b76b14}',
 '#pdz360-root .p-tabs{display:flex;gap:5px;flex-wrap:wrap}#pdz360-root .p-detail{display:grid;gap:13px;align-content:start;min-width:0}',
 '#pdz360-root .p-detail-metrics{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}',
 '#pdz360-root .p-detail-metrics>div{border:1px solid var(--border,#dce4ee);padding:10px;border-radius:9px;min-width:0}',
 '#pdz360-root .p-detail-metrics b{display:block;font-size:17px}#pdz360-root .p-action{padding:12px;background:#ecf4ff;border-radius:10px;font-size:12px;display:grid;gap:9px}',
 '#pdz360-root .p-empty{padding:22px;text-align:center;color:var(--sub,#64748b);font-size:13px}',
 '@media(max-width:1180px){#pdz360-root .p-top{grid-template-columns:1fr 1fr}#pdz360-root .p-top>.p-card:last-child{grid-column:1/-1}}',
 '@media(max-width:900px){#pdz360-root .p-kpis{grid-template-columns:repeat(2,1fr)}#pdz360-root .p-split{grid-template-columns:1fr}#pdz360-root .p-debtors{max-height:310px}}',
 '@media(max-width:600px){#pdz360-root .p-top{grid-template-columns:1fr}#pdz360-root .p-top>.p-card:last-child{grid-column:auto}#pdz360-root .p-detail-metrics{grid-template-columns:1fr 1fr}#pdz360-root h2{font-size:20px}}'
 ].join('\n');w.document.head.appendChild(x);
}
function card(name,value,meta,cls=''){
 return '<div class="p-kpi"><small>'+E(name)+'</small><strong class="'+E(cls)+'">'+E(value)+'</strong><div class="p-muted">'+meta+'</div></div>';
}
function lineSeries(series,sel){
 const src=arr(series).slice(-state.days);
 if(src.length<2)return '<div class="p-empty">Недостаточно подтверждённых ежедневных срезов для графика.</div>';
 const vals=src.map(x=>state.view==='debtors'?n(x.debtors):n(x.total)),mx=Math.max(1,...vals),mn=Math.max(0,Math.min(...vals)*.9),
 W=760,H=235,l=60,t=23,pw=675,ph=165,delta=Math.max(1,mx-mn);
 const px=i=>l+i*pw/(vals.length-1),py=v=>t+(mx-v)/delta*ph;
 const path=vals.map((v,i)=>(i?'L':'M')+px(i).toFixed(1)+' '+py(v).toFixed(1)).join(' ');
 let out='<svg class="p-chart" viewBox="0 0 '+W+' '+H+'" aria-label="Ежедневная динамика задолженности по подтверждённым датам 1С" role="img">';
 for(let i=0;i<=3;i++){const value=mn+(mx-mn)*i/3,y=py(value).toFixed(1);
  out+='<path d="M'+l+' '+y+'H735" stroke="#dce4ee" stroke-dasharray="4 6"/><text x="51" y="'+(Number(y)+4)+'" font-size="11" text-anchor="end" fill="currentColor">'+E(state.view==='debtors'?Math.round(value):Math.round(value/1000)+' тыс.')+'</text>';
 }
 out+='<path d="'+path+'" stroke="#2563eb" fill="none" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>';
 src.forEach((x,i)=>{const cx=px(i).toFixed(1),cy=py(vals[i]).toFixed(1);out+='<circle cx="'+cx+'" cy="'+cy+'" r="'+(i===src.length-1?5:3)+'" fill="#2563eb"><title>'+E(date(x.report_date)+' · '+(state.view==='debtors'?Math.round(vals[i])+' должников':money(vals[i])))+'</title></circle>';
  if(i===0||i===src.length-1||i%Math.ceil(src.length/5)===0)out+='<text x="'+cx+'" y="218" font-size="11" text-anchor="middle" fill="currentColor">'+E(day(x.report_date))+'</text>';
 });
 out+='</svg>';
 return '<div class="p-chart-wrap">'+out+'</div>';
}
function aging(m){
 const fields=[['band_0_7','До 7 дней','#20a862'],['band_8_30','8–30 дней','#fbbf24'],['band_31_60','31–60 дней','#fb923c'],['band_61_plus','Более 60 дней','#f43f5e']];
 const total=Math.max(.01,n(m.amount));let pos=0,stops=[],text='';
 fields.forEach(([key,name,color])=>{const value=n(m[key]),share=Math.max(0,Math.min(100,value/total*100));stops.push(color+' '+pos+'% '+(pos+share)+'%');pos+=share;
  text+='<div class="p-band"><span><i class="p-indicator" style="background:'+color+'"></i>'+E(name)+'</span><b>'+E(compact(value))+'</b></div>';
 });
 return '<div class="p-ages"><div class="p-donut" style="background:conic-gradient('+stops.join(',')+')"><span>'+E(compact(m.amount).replace(' BYN',''))+'<small>BYN</small></span></div><div style="flex:1;min-width:170px">'+text+'</div></div>';
}
function briefing(d){
 const m=d.metrics||{},r=best(arr(d.rows));const top=r.slice(0,3);
 let msg=top.map(x=>{const amount=n(x.overdue),delta=n(x.day_change);
  const next=x.promised_date?'Проверить обещанную оплату '+date(x.promised_date):
   n(x.days_overdue)>=60?'Уточнить статус претензии и согласовать дальнейшие действия':
   'Связаться с клиентом, подтвердить дату и сумму оплаты';
  return '<button class="p-brief-btn" data-pdz-focus="'+E(x.client_name)+'"><span><b>'+E(x.client_name)+'</b><span class="p-muted" style="display:block">'+E(x.manager_name)+' · '+E(next)+'</span></span><span style="text-align:right;white-space:nowrap"><b>'+E(compact(amount))+'</b><small class="'+(delta>0?'p-danger':delta<0?'p-good':'')+'" style="display:block">'+E(signed(delta))+' за день</small></span></button>';
 }).join('');
 if(!msg)msg='<div class="p-empty">Подтверждённых долгов в выбранной выборке нет.</div>';
 return '<div class="p-card"><div class="p-header"><h3>✦ Лера · Что требует решения</h3><span class="p-muted">Факты отдельно от рекомендаций</span></div>'+
 '<div class="p-brief">'+msg+'</div><p class="p-muted">Приоритет — сумма долга, срок просрочки и изменение за день. Снижение ПДЗ не подтверждает оплату само по себе; менеджер должен проверить документы и контакт.</p></div>';
}
function renderRight(){
 const target=w.document.getElementById('pdz360-detail');if(!target)return;
 const d=state.data||{},list=rows(),r=list.find(x=>x.client_name===state.selected)||list[0];
 if(!r){target.innerHTML='<div class="p-empty">Выберите клиента из списка, чтобы посмотреть ежедневную динамику и следующий шаг.</div>';return;}
 state.selected=r.client_name;
 const old=n(r.previous_amount),val=n(r.overdue),change=n(r.day_change);
 const s=arr(d.series).slice(-state.days);
 const last='Последний контакт: '+(r.last_contact_at?date(String(r.last_contact_at).slice(0,10)):'не зафиксирован');
 const promise=r.promised_date?'Обещанная оплата до '+date(r.promised_date)+(r.promise_amount?' · '+money(r.promise_amount):''):
  'Подтверждённой даты обещанной оплаты нет';
 const next=r.promised_date?'Проверить обещанную оплату и сопоставить с реестром поступлений':
  n(r.days_overdue)>=60?'Проверить претензию/юридический статус и зафиксировать следующий контакт':
  'Связаться с клиентом и зафиксировать дату и сумму ожидаемой оплаты';
 target.innerHTML='<div class="p-header"><div><h3>'+E(r.client_name)+'</h3><div class="p-muted">'+E(r.manager_name)+' · '+E(riskLabel(r.risk))+'</div></div>'+
 '<button type="button" class="p-btn" data-pdz-close>✕</button></div>'+
 '<div class="p-detail-metrics"><div><small class="p-muted">ПДЗ на '+E(date(d.report_date))+'</small><b>'+E(compact(val))+'</b></div>'+
 '<div><small class="p-muted">Дней просрочки</small><b>'+E(r.days_overdue)+'</b></div>'+
 '<div><small class="p-muted">День к дню</small><b class="'+(change>0?'p-danger':'p-good')+'">'+E(signed(change))+'</b></div></div>'+
 '<div class="p-muted">На '+E(date(d.previous_report_date))+': '+E(money(old))+'. Разница не обязательно связана с оплатой.</div>'+
 '<div class="p-card" style="padding:10px"><h3 style="font-size:13px">Контроль контактов и оплат</h3>'+
 '<p class="p-muted">'+E(last)+'</p><p style="font-size:12px">'+E(r.last_comment||'Комментариев по этому клиенту пока нет')+'</p>'+
 '<p class="p-muted">'+E(promise)+'</p>'+
 (r.legal_action?'<div class="p-muted">Последнее юридическое действие: '+E(r.legal_action)+'</div>':'')+'</div>'+
 '<div class="p-action"><b>Следующее рекомендуемое действие</b><span>'+E(next)+'</span>'+
 (r.client_id?'<div class="p-controls"><button class="p-btn p-primary" data-pdz-comment="'+E(r.client_id)+'">Добавить комментарий / обещание оплаты</button>'+
 '<button class="p-btn" data-pdz-card="'+E(r.client_id)+'">Открыть карточку CRM</button></div>':
 '<div class="p-muted">Точная карточка клиента в CRM не подтверждена; комментарии не привязываем автоматически к возможному дублю.</div>')+'</div>';
 const activeBtn=w.document.querySelector('#pdz360-root .p-item[aria-current=true]');
 if(activeBtn)activeBtn.setAttribute('aria-current','false');
 w.document.querySelectorAll('#pdz360-root .p-item').forEach(el=>el.setAttribute('aria-current',String(el.dataset.pdzFocus===state.selected)));
}
function render(){
 const root=mount();if(!root)return;css();
 if(state.legacy){root.innerHTML='<div class="p-card p-header"><h3>Исходный раздел ПДЗ</h3><button class="p-btn p-primary" data-pdz-legacy>Вернуться к ПДЗ 360°</button></div>';return;}
 const d=state.data,m=d?.metrics||{},list=rows(),den=n(m.amount),delta=n(d?.day_change),changeLabel=d?.previous_report_date?'к '+date(d.previous_report_date):'нет предыдущего подтверждённого дня';
 const changePct=d?.previous_report_date&&n(d.previous_amount)>0?' · '+(delta>=0?'+':'')+(delta/n(d.previous_amount)*100).toFixed(1).replace('.',',')+'%':'';
 const managers=boss()?(state.managerOptions.length?state.managerOptions:arr(d?.managers)):[];
 const filters='<div class="p-card p-controls">'+
 (boss()?'<div class="p-field"><label>Менеджер</label><select data-pdz-manager><option value="all">Все менеджеры</option>'+managers.map(x=>'<option value="'+E(x.manager_name)+'"'+(state.manager===x.manager_name?' selected':'')+'>'+E(x.manager_name)+'</option>').join('')+'</select></div>':'')+
 '<div class="p-field"><label>Срок ПДЗ</label><select data-pdz-age>'+
 [['all','Все сроки'],['0_7','До 7 дней'],['8_30','8–30 дней'],['31_60','31–60 дней'],['61','61+ дней']].map(([v,t])=>'<option value="'+v+'"'+(state.age===v?' selected':'')+'>'+t+'</option>').join('')+'</select></div>'+
 '<div class="p-field"><label>Динамика</label><div class="p-tabs">'+[7,14,30].map(v=>'<button class="p-btn'+(state.days===v?' p-active':'')+'" data-pdz-days="'+v+'">'+v+' дн.</button>').join('')+'</div></div>'+
 '<button type="button" class="p-btn" data-pdz-refresh>↻ Обновить</button><button type="button" class="p-btn" data-pdz-legacy>Исходный отчёт</button></div>';
 if(!d){root.innerHTML='<div class="p-header"><div><h2>Задолженность 360°</h2><div class="p-muted">ПДЗ · динамика день к дню · контроль возврата</div></div></div>'+
 '<div class="p-card p-empty" role="status">'+(state.error?'Не удалось прочитать подтверждённую ПДЗ: '+E(state.error):'Загружаю ежедневную историю ПДЗ из 1С…')+
 ' <button class="p-btn" data-pdz-refresh>Повторить</button></div>';return;}
 const top='<div class="p-header"><div><h2>Задолженность 360°</h2><div class="p-muted">Последний отчёт 1С: '+E(date(d.report_date))+' · прошлый срез: '+E(date(d.previous_report_date))+' · по календарным датам, не по дате загрузки</div></div>'+
 '<div class="p-muted">'+(boss()?'Директор · все менеджеры':'Менеджер · только закреплённые клиенты')+'</div></div>';
 const kpi='<div class="p-kpis">'+
 card('Просрочено · всего',money(m.amount),'<span class="'+(delta>0?'p-danger':'p-good')+'">'+E(signed(delta))+E(changePct)+'</span> · '+E(changeLabel),'')+
 card('Должников',String(n(m.debtors)),E('За отчёт '+date(d.report_date)))+
 card('Высокий риск',String(n(m.high_risk)),E(compact(m.high_amount))+' · 60+ дней и ≥1 000 BYN','')+
 card('Просрочка 30+ дней',money(m.over_30),'Включая более 60 дней')+
 card('Обещано на 7 дней',money(m.promised_amount),n(m.promised_clients)?n(m.promised_clients)+' подтверждённых договорённостей':'В комментариях пока не зафиксировано')+'</div>';
 const chart='<div class="p-card"><div class="p-header"><h3>Динамика ПДЗ · день к дню</h3><div class="p-tabs"><button class="p-btn'+(state.view==='amount'?' p-active':'')+'" data-pdz-view="amount">Сумма</button><button class="p-btn'+(state.view==='debtors'?' p-active':'')+'" data-pdz-view="debtors">Должники</button></div></div>'+lineSeries(d.series)+
 '<div class="p-muted">Показаны только подтверждённые даты отчётов 1С. Падение задолженности не означает подтверждённое поступление денег.</div></div>';
 const stage='<div class="p-card"><h3>Структура ПДЗ по срокам</h3>'+aging(m)+'</div>';
 const clients='<div class="p-card"><div class="p-header"><h3>Клиенты с задолженностью · '+list.length+'</h3><span class="p-muted">Фильтры по сроку и поиску</span></div>'+
 '<div class="p-controls" style="margin-top:10px"><input id="pdz360-search" data-pdz-search placeholder="Поиск клиента" value="'+E(state.query)+'" style="flex:1;min-width:160px">'+
 '<button class="p-btn p-primary" data-pdz-find>Найти</button></div>'+
 '<div class="p-debtors" id="pdz360-list">'+list.map(r=>'<button class="p-item" aria-current="'+String(r.client_name===state.selected)+'" data-pdz-focus="'+E(r.client_name)+'">'+
 '<span><b>'+E(r.client_name)+'</b><small>'+E(r.manager_name)+' · '+E(r.days_overdue)+' дн. · '+E(riskLabel(r.risk))+'</small></span>'+
 '<span class="p-amount">'+E(compact(r.overdue))+'<small class="p-delta '+(n(r.day_change)>0?'p-danger':n(r.day_change)<0?'p-good':'')+'">'+E(signed(r.day_change))+'</small></span></button>').join('')+
 (list.length?'':'<div class="p-empty">В текущей выборке должников нет.</div>')+'</div></div>';
 root.innerHTML=top+filters+kpi+'<div class="p-top">'+chart+stage+briefing(d)+'</div>'+
 '<div class="p-split">'+clients+'<div class="p-card p-detail" id="pdz360-detail"></div></div>';
 const container=w.document.getElementById('pdz360-list');if(container)container.scrollTop=state.debtorScroll;
 renderRight();
}
async function load(force=false){
 if(!safe())return;
 if(state.loading&&!force)return;
 const id=++state.requestId;
 if(!force&&state.data&&Date.now()-state.loadedAt<TTL){render();return}
 state.loading=true;state.error='';if(!state.data)render();
 try{
  const client=dbc();if(!client?.rpc)throw Error('Supabase недоступен');
  const {data,error}=await client.rpc('crm_pdz360_daily_v1',{p_manager:boss()&&state.manager!=='all'?state.manager:null,p_days:30});
  if(error)throw error;
  if(id!==state.requestId||!safe())return;
  if(data?.version!==VERSION||!Array.isArray(data?.rows)||!Array.isArray(data?.series))throw Error('Неполный ответ ежедневной истории ПДЗ');
  state.data=data;if(boss()&&state.manager==='all')state.managerOptions=arr(data.managers);state.loadedAt=Date.now();state.selected=rows().some(x=>x.client_name===state.selected)?state.selected:data.rows[0]?.client_name||'';
 }catch(e){if(id===state.requestId){state.error=String(e?.message||e);console.warn('PDZ360 snapshot',e);}}
 finally{if(id===state.requestId){state.loading=false;render();}}
}
function onClick(e){
 const b=e.target.closest?.('button');if(!b)return;
 const a=b.dataset;
 if(a.pdzRefresh!==undefined){state.loadedAt=0;load(true);return;}
 if(a.pdzLegacy!==undefined){state.legacy=!state.legacy;render();if(state.legacy)w.renderDebt?.();return;}
 if(a.pdzDays!==undefined){state.days=Math.max(7,Math.min(30,Number(a.pdzDays)||14));render();return;}
 if(a.pdzView!==undefined){state.view=a.pdzView==='debtors'?'debtors':'amount';render();return;}
 if(a.pdzFind!==undefined){state.query=String(w.document.getElementById('pdz360-search')?.value||'').trim().slice(0,120);state.selected='';render();return;}
 if(a.pdzFocus!==undefined){
  state.debtorScroll=w.document.getElementById('pdz360-list')?.scrollTop||0;
  state.selected=a.pdzFocus;renderRight();
  const target=w.document.getElementById('pdz360-detail');
  if((w.innerWidth||0)<900)target?.scrollIntoView?.({behavior:'smooth',block:'start'});
  return;
 }
 if(a.pdzClose!==undefined){state.selected='';renderRight();return;}
 if(a.pdzComment!==undefined&&typeof w.openDebtComment==='function'){
  const r=rows().find(x=>x.client_name===state.selected);
  if(r?.client_id===a.pdzComment){
   w.openDebtComment(r.client_id,r.client_name);
   state.loadedAt=0;
  }return;
 }
 if(a.pdzCard!==undefined&&typeof w.openClient==='function'){w.openClient(a.pdzCard);return;}
}
function onChange(e){
 if(e.target.matches?.('[data-pdz-manager]')){
  if(!boss())return;state.manager=e.target.value;state.data=null;state.selected='';state.age='all';load(true);return;
 }
 if(e.target.matches?.('[data-pdz-age]')){state.age=e.target.value;state.selected='';render();}
}
function onInput(e){if(e.target.matches?.('[data-pdz-search]'))state.query=String(e.target.value||'').slice(0,120);}
function onKeyDown(e){if(e.key==='Enter'&&e.target.matches?.('[data-pdz-search]')){e.preventDefault();state.selected='';render();}}
function install(){
 css();mount();
 const base=w.renderDebt;
 if(typeof base==='function'&&!base.__pdz360Wrapped){
  const wrapper=function(){const out=base.apply(this,arguments);if(safe())void load(false);return out;};
  wrapper.__pdz360Wrapped=true;wrapper.__base=base;
  w.renderDebt=wrapper;
  try{renderDebt=wrapper}catch(_){}
 }
 w.document.addEventListener('click',e=>{const nav=e.target.closest?.('#nav-debt,#bn-debt,[data-page="debt"]');if(nav)w.setTimeout(()=>{if(safe())load(false);},70);},true);
 if(safe())void load();
}
w.RESANTA_PDZ360_V1=Object.freeze({version:'20261110.1',rpc:'crm_pdz360_daily_v1',readOnly:true,install,refresh:()=>load(true)});
if(w.document.readyState==='loading')w.document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})(window);
