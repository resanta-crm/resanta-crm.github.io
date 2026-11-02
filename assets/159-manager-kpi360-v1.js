/* KPI 360: month-guarded manager overview. Existing KPI plans and sales are read-only. */
(function(w){
'use strict';
if(w.crmKpi360)return;
const id='manager-kpi360-v1',names=['Руднев','Ачинович','Шкуран'];
let sequence=0,auto=false,touched=false,cache=new Map(),last=null,selected='';
const n=x=>Number(x)||0,f=x=>n(x).toLocaleString('ru-RU',{maximumFractionDigits:0});
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const k=x=>String(x||'').trim().toLowerCase().replace(/ё/g,'е');
const month=()=>String(document.getElementById('manager-kpi-month')?.value||'').slice(0,7);
const role=()=>w.currentProfile?.role,active=()=>document.getElementById('page-managers')?.classList.contains('active');
const fmtMonth=m=>(['','Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'][Number(m?.slice(5,7))]||'—')+' '+String(m||'').slice(0,4);
const pct=(x,y)=>n(y)>0?Math.round(n(x)/n(y)*100)+'%':'—';
const delta=(x,y,ok)=>!ok?'—':!n(y)?'без базы':(n(x)>=n(y)?'+':'')+((n(x)-n(y))/Math.abs(n(y))*100).toFixed(1).replace('.',',')+'%';
function sum(rows,prev){
 const add=(a,p)=>a.reduce((s,x)=>s+n(x[p]),0);
 return {shipment:add(rows,'shipment'),shipment_plan:add(rows,'shipment_plan'),akb:add(rows,'akb'),akb_plan:add(rows,'akb_plan'),
 new_clients:add(rows,'new_clients'),new_clients_plan:add(rows,'new_clients_plan'),sales_2025:add(prev,'sales_2025'),akb_2025:add(prev,'akb_2025'),new_2025:add(prev,'new_2025')};
}
function list(rows){return (rows||[]).filter(x=>names.some(y=>k(y)===k(x.manager_name))).filter(x=>role()==='boss'||k(x.manager_name)===k(w.currentProfile?.name))}
function root(){
 const page=document.getElementById('page-managers');if(!page)return null;
 const old=document.getElementById('managers-table')?.closest('.card');if(old)old.style.display='none';
 const medal=document.getElementById('manager-kpi-leaderboard-v2263');if(medal)medal.style.display='none';
 const detailed=document.getElementById('manager-new-clients-v236135');if(detailed)detailed.style.display='none';
 let box=document.getElementById(id);if(!box){box=document.createElement('section');box.id=id;
 (old||page).insertAdjacentElement(old?'beforebegin':'beforeend',box)}
 return box;
}
function style(){
 if(document.getElementById(id+'-css'))return;
 const s=document.createElement('style');s.id=id+'-css';
 s.textContent='#manager-kpi-leaderboard-v2263,#manager-new-clients-v236135{display:none!important}'+
 '#manager-kpi360-v1 .k-cards{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin:12px 0}'+
 '#manager-kpi360-v1 .k-card,#manager-kpi360-v1 .k-list{background:#fff;border:1px solid var(--border);border-radius:11px;padding:13px}'+
 '#manager-kpi360-v1 .k-value{font-size:23px;font-weight:800;margin:6px 0}'+
 '#manager-kpi360-v1 .k-small{font-size:11px;color:var(--sub);line-height:1.7}'+
 '#manager-kpi360-v1 .k-line{display:grid;grid-template-columns:120px repeat(3,minmax(0,1fr));gap:10px;padding:12px 0;border-top:1px solid var(--border)}'+
 '#manager-kpi360-v1 .k-total{background:#edf4fb;font-weight:800;padding:10px}'+
 '#manager-kpi360-v1 .k-alert{border:1px solid #dfabab;padding:12px;color:#a33;border-radius:9px;margin:10px 0}'+
 '@media(max-width:700px){#manager-kpi360-v1 .k-cards{grid-template-columns:1fr}#manager-kpi360-v1 .k-line{grid-template-columns:1fr 1fr}#manager-kpi360-v1 .k-line strong{grid-column:1/-1}}';
 document.head.appendChild(s);
}
async function rpc(fn,args){
 const conn=typeof db!=='undefined'?db:w.db;if(!conn)throw Error('CRM недоступна');
 for(let attempt=0;attempt<2;attempt++)try{const {data,error}=await conn.rpc(fn,args);if(error)throw error;return data}
 catch(e){if(attempt||!/fetch|network|timeout/i.test(String(e?.message||e)))throw e;await new Promise(ok=>setTimeout(ok,400))}
}
function metric(title,value,plan,prev,ok){
 return '<div class="k-card"><div class="k-small">'+title+'</div><div class="k-value">'+f(value)+'</div>'+
 '<div class="k-small">План '+f(plan)+' · выполнение '+pct(value,plan)+'</div>'+
 '<b>К 2025: '+delta(value,prev,ok)+'</b><div class="k-small">2025: '+(ok?f(prev):'нет данных')+'</div></div>';
}
function line(r,prev,ok,isTotal){
 const cell=(x,p,y)=>'<div><b>'+f(x)+'</b><div class="k-small">план '+f(p)+' · '+pct(x,p)+'</div>'+
 '<div class="k-small">2025: '+(ok?f(y):'—')+' · '+delta(x,y,ok)+'</div></div>';
 return '<div class="k-line'+(isTotal?' k-total':'')+'"><strong>'+esc(isTotal?'ИТОГО':r.manager_name)+
 (isTotal?'':'<div><button class="btn-secondary" data-detail="'+esc(r.manager_name)+'">Клиенты</button></div>')+'</strong>'+
 cell(r.shipment,r.shipment_plan,prev.sales_2025)+cell(r.akb,r.akb_plan,prev.akb_2025)+
 cell(r.new_clients,r.new_clients_plan,prev.new_2025)+'</div>';
}
async function showClients(name,at){
 const target=document.getElementById(id+'-detail');if(!target)return;
 selected=name;target.innerHTML='<div class="k-card">Загружаю клиентов '+esc(name)+'…</div>';
 try{
 const data=await rpc('crm_manager_new_clients_detail_v236135',{p_month:at,p_manager:name});
 if(!active()||month()!==at||selected!==name)return;
 const rows=(data?.rows||[]).filter(x=>k(x.manager_name)===k(name));
 target.innerHTML='<div class="k-card"><b>'+esc(name)+' · новые и вернувшиеся</b> '+
 '<button class="btn-secondary" data-close>Закрыть</button>'+
 (rows.length?rows.map(x=>'<div style="padding:8px 0;border-top:1px solid var(--border)">'+esc(x.client_name)+' · '+f(x.current_revenue)+' бел. руб. · '+(x.type==='reactivated'?'вернувшийся':'новый')+'</div>').join(''):'Нет таких клиентов')+'</div>';
 target.querySelector('[data-close]').onclick=()=>{selected='';target.innerHTML=''};
 }catch(e){if(active()&&month()===at)target.innerHTML='<div class="k-alert">Ошибка детализации: '+esc(e?.message||e)+'</div>'}
}
function display(v){
 if(!active()||month()!==v.month)return;const box=root(),rows=list(v.primary),prev=list(v.baseline?.rows);
 const map=new Map(prev.map(x=>[k(x.manager_name),x])),all=sum(rows,prev),ok=!!v.baseline?.previous_available;
 const latest=v.baseline?.latest_sales_month||'';
 let html='<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap">'+
 '<div><b style="font-size:18px">KPI 360° · '+esc(fmtMonth(v.month))+'</b><div class="k-small">Факт 2025 — по текущему закреплению клиентов</div></div>'+
 '<button class="btn-secondary" data-refresh>↻ Обновить</button></div>';
 if(v.month>latest&&latest)html+='<div class="k-card">Данных 1С за этот месяц пока нет. Последний месяц: '+esc(fmtMonth(latest))+'. Нули в показатели не подставляются.</div>';
 else{
 html+='<div class="k-small">Импорт продаж 1С: '+esc(v.baseline?.last_sales_import||'дата не указана')+
 ' · закрытие месяца не подтверждено</div>';
 if(v.error)html+='<div class="k-alert">'+esc(v.error)+'</div>';
 html+='<div class="k-cards">'+metric('Продажи, бел. руб.',all.shipment,all.shipment_plan,all.sales_2025,ok)+
 metric('АКБ',all.akb,all.akb_plan,all.akb_2025,ok)+metric('Новые / вернувшиеся',all.new_clients,all.new_clients_plan,all.new_2025,ok)+'</div>'+
 '<div class="k-list"><div class="k-small">Менеджер · Продажи · АКБ · Новые клиенты (факт / план / 2025)</div>'+
 rows.map(r=>line(r,map.get(k(r.manager_name))||{},ok,false)).join('')+line(all,all,ok,true)+'</div>'+
 '<div class="k-small">Итог — сумма МПП. Строки 2025 без однозначной связи с текущим клиентом исключены из сравнения. Методика факта KPI сохранена, отдельные возвраты не показываются.</div>'+
 '<div id="'+id+'-detail"></div><div class="k-card" style="margin-top:12px"><b>Задачи на сегодня</b> · открыто '+
 f(rows.reduce((s,r)=>s+n(r.tasks_open),0))+' · просрочено '+f(rows.reduce((s,r)=>s+n(r.overdue),0))+'</div>';
 }
 box.innerHTML=html;box.querySelector('[data-refresh]')?.addEventListener('click',()=>load(true));
 box.querySelectorAll('[data-detail]').forEach(b=>b.addEventListener('click',()=>showClients(b.dataset.detail,v.month)));
}
async function load(force=false){
 const box=root();if(!box||!active()||!['boss','manager'].includes(role()))return;
 const at=month(),user=String(w.currentUser?.id||w.currentProfile?.name||''),key=user+'|'+at,idRequest=++sequence;
 const c=cache.get(key);if(!force&&c&&Date.now()-c.when<30000){display(c.data);return}
 box.innerHTML='<div class="k-card">Загружаю показатели '+esc(fmtMonth(at))+'…</div>';
 const results=await Promise.allSettled([rpc('crm_manager_kpi_leaderboard',{p_month:at}),rpc('crm_manager_kpi360_yoy_v1',{p_month:at})]);
 if(idRequest!==sequence||!active()||month()!==at)return;
 const baseline=results[1].status==='fulfilled'?results[1].value:null;
 const actual=results[0].status==='fulfilled'?results[0].value:[];
 const last=baseline?.latest_sales_month;
 if(!auto&&!touched&&last&&at>last){auto=true;document.getElementById('manager-kpi-month').value=last;void load(true);return}
 auto=true;
 const error=results.filter(x=>x.status==='rejected').map(x=>String(x.reason?.message||x.reason)).join('; ');
 const value={month:at,primary:actual,baseline,error};if(!error)cache.set(key,{data:value,when:Date.now()});
 last=value;display(value);
}
function boot(){
 if(!document.getElementById('page-managers'))return;style();
 const input=document.getElementById('manager-kpi-month');
 if(input&&!input.dataset.kpi360){input.dataset.kpi360='1';input.addEventListener('change',()=>{touched=true;selected='';void load(true)})}
 w.renderManagers=()=>load(false);try{renderManagers=w.renderManagers}catch(_){}
 if(active())void load(false);
}
w.crmKpi360={load:()=>load(true),sum,version:'1.0'};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})(window);
