/* Company viewer 360: dedicated read-only director-of-company shell */
(function(){
'use strict';if(window.crmCompanyViewer360)return;
const el=id=>document.getElementById(id);
const esc=x=>String(x??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const money=x=>Number(x||0).toLocaleString("ru-RU",{maximumFractionDigits:2})+" BYN";
let year=new Date().getFullYear();
function prepare(){
 if(!el("cv360-styles")){const s=document.createElement("style");s.id="cv360-styles";s.textContent="body.crm-executive-viewer #app .sidebar,body.crm-executive-viewer #app .bottom-nav{display:none!important}body.crm-executive-viewer #app #main-content>.page:not(#page-company-viewer){display:none!important}body.crm-executive-viewer #app #main-content{width:100%;max-width:100%;padding:18px}body.crm-executive-viewer #page-company-viewer{display:block!important}#page-company-viewer{max-width:1350px;margin:auto}.cv360-kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}.cv360-kpi,.cv360-panel{border:1px solid #e3e8ef;border-radius:14px;padding:15px;background:white;margin:12px 0}.cv360-kpi small{display:block;color:#6b7280;font-size:11px}.cv360-kpi b{display:block;font-size:24px;margin:6px 0}.cv360-cols{display:grid;grid-template-columns:1fr 1fr;gap:12px}.cv360-table{width:100%;border-collapse:collapse}.cv360-table td,.cv360-table th{padding:10px;text-align:left;border-bottom:1px solid #e4e7ec;font-size:12px}.cv360-graph{display:flex;gap:6px;align-items:end;height:135px;margin:14px 0}.cv360-bar{flex:1;min-width:12px;background:linear-gradient(#d31b2d,#f1a3ac);border-radius:4px 4px 0 0}.cv360-note{font-size:12px;color:#667085;line-height:1.6}.cv360-select{border:1px solid #cbd5e1;background:white;border-radius:9px;padding:10px}.cv360-title{display:flex;justify-content:space-between;align-items:center;gap:12px}@media(max-width:750px){.cv360-kpis{grid-template-columns:1fr 1fr}.cv360-cols{grid-template-columns:1fr}.cv360-kpi b{font-size:19px}.cv360-title h2{font-size:21px}}";document.head.appendChild(s)}
 let page=el("page-company-viewer");
 if(!page){page=document.createElement("div");page.id="page-company-viewer";page.className="page";
  el("main-content")?.append(page)}return page;
}
async function render(){
 const host=prepare();host.innerHTML='<div class="cv360-panel">Получаю сводку филиальной сети…</div>';
 try{
  const {data,error}=await db.rpc("crm_company_viewer_summary_v1",{p_year:year});
  if(error)throw error;
  const d=data||{},regions=Array.isArray(d.sales_by_region)?d.sales_by_region:[],months=Array.isArray(d.sales_by_month)?d.sales_by_month:[];
  const max=Math.max(1,...months.map(x=>Number(x.revenue||0)));
  host.innerHTML='<div class="cv360-title"><div><h2>📊 РЕСАНТА · Руководство компании</h2>'+
   '<p class="cv360-note">Сводные показатели филиальной сети · только просмотр</p></div>'+
   '<select id="cv360-year" class="cv360-select" aria-label="Год">'+
   [2026,2025,2024,2023].map(y=>'<option value="'+y+'" '+(y===year?"selected":"")+'>'+y+' год</option>').join("")+'</select></div>'+
   '<div class="cv360-kpis">'+[
    ["Отгрузки клиентам · "+year,money(d.sales_total)],
    ["Клиенты",Number(d.clients||0).toLocaleString("ru-RU")],
    ["Наши стенды",Number(d.stands||0).toLocaleString("ru-RU")],
    ["Просроченная задолженность",money(d.debt_total)]
   ].map(v=>'<div class="cv360-kpi"><small>'+v[0]+'</small><b>'+v[1]+'</b></div>').join("")+'</div>'+
   '<div class="cv360-cols"><div class="cv360-panel"><h3>Динамика отгрузок по месяцам</h3>'+
   '<div class="cv360-graph">'+months.map(x=>'<div class="cv360-bar" title="'+esc(x.month)+' · '+esc(money(x.revenue))+'" style="height:'+Math.max(3,Math.round(Number(x.revenue)/max*100))+'%"></div>').join("")+'</div>'+
   '<p class="cv360-note">Период: '+year+'. Источник — импортированные отгрузки 1С.</p></div>'+
   '<div class="cv360-panel"><h3>Филиалы · отгрузки</h3><table class="cv360-table"><thead><tr><th>Филиал</th><th>BYN</th></tr></thead><tbody>'+
   regions.map(x=>'<tr><td>'+esc(x.region)+'</td><td>'+esc(money(x.revenue))+'</td></tr>').join("")+
   '</tbody></table></div></div>'+
   '<div class="cv360-panel"><h3>Контроль достоверности данных</h3><p class="cv360-note">'+
   'Показаны агрегированные отгрузки клиентам, а не розничные продажи или прибыль. Распределение выполнено по региону привязанного клиента. '+
   'Задолженность — по последнему отчёту '+esc(d.debt_report_date||"дата неизвестна")+
   '. Изменение финансовых документов, планов, ролей и других данных недоступно.</p></div>';
  el("cv360-year")?.addEventListener("change",e=>{year=Number(e.target.value);render()});
 }catch(e){host.innerHTML='<div class="cv360-panel"><h3>Данные пока не открылись</h3><p class="cv360-note">'+esc(e.message||e)+'</p>'+
  '<button onclick="window.crmCompanyViewer360.render()">Повторить</button></div>'}
}
async function start(profile){
 document.body.classList.remove("crm-auditor-mode");
 document.body.classList.add("crm-executive-viewer");
 el("login-wrap").style.display="none";el("app").style.display="flex";
 const name=el("user-name");if(name)name.textContent=profile?.name||"Руководство компании";
 const title=el("topbar-title");if(title)title.textContent="Руководство компании";
 const host=prepare();document.querySelectorAll("#main-content>.page").forEach(x=>x.classList.remove("active"));host.classList.add("active");
 if(el("app"))el("app").dataset.activePage="company-viewer";
 await render();
}
window.crmCompanyViewer360={start,render};
})();
