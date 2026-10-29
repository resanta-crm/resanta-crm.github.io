// Deterministic, read-only manager sales narrative from a single verified CRM RPC.
// Never equate CRM manager KPI, shipment-plan execution, and network turnover.
const MONTHS=['январ','феврал','март','апрел','мая','мае','май','июн','июл','август','сентябр','октябр','ноябр','декабр'];
const MONTH_TO_NUMBER=new Map([['январ',1],['феврал',2],['март',3],['апрел',4],['мая',5],['мае',5],['май',5],['июн',6],['июл',7],['август',8],['сентябр',9],['октябр',10],['ноябр',11],['декабр',12]]);
const fmt=x=>Math.round(Number(x)||0).toLocaleString('ru-RU',{maximumFractionDigits:0});
const num=x=>Number.isFinite(Number(x))?Number(x):null;
const money=x=>fmt(x)+' белорусских рублей';
const n=x=>String(x||'').toLocaleLowerCase('ru-RU').replace(/ё/g,'е');
export function resolveSalesMonth(question,fallback,day){
 const q=n(question),iso=q.match(/20(?:25|26)[-.](0[1-9]|1[0-2])/);
 let month=iso?iso[0].replace('.','-'):null;
 if(!month){
  const part=[...MONTH_TO_NUMBER].find(([s])=>q.includes(s));
  if(part){
   const yr=(q.match(/\b20(?:25|26)\b/)||[])[0]||day.slice(0,4);
   month=yr+'-'+String(part[1]).padStart(2,'0');
  }
 }
 month=month||fallback;
 return /^\d{4}-(0[1-9]|1[0-2])$/.test(month)&&month>= '2025-01'&&month<=day.slice(0,7)?month:fallback;
}
function staffMention(question,managerNames=[]){
 const q=n(question);
 return managerNames.some(name=>{
  const root=n(name).split(' ')[0].slice(0,5);
  return root.length>=4&&q.includes(root);
 });
}
export function isManagerSalesQuestion(question,{managerNames=[],memory={}}={}){
 const q=n(question);
 const questionIsSales=/(продаж|выруч|оборот|отгруз|реализац|план.*продаж|выполнен.*план|факт.*план|план.*факт)/i.test(q);
 const managerNamed=staffMention(q,managerNames);
 const managerScope=/(менеджер|сотрудник|по всем|по остальн|руководител.*продаж)/i.test(q);
 const managerFollowup=memory?.domain==='sales_managers'&&
   /^(а\s|и\s|покажи|сравни|остальн|дальше|продолж|подробнее|что\s+у|какой\s+план|сколько)/i.test(q)&&
   !/(пдз|долг|задолж|остатк|gps|маршрут|акци|триовист|21\s*век|клиент)/i.test(q);
 return (questionIsSales&&(managerNamed||managerScope))||managerFollowup;
}
function selectManager(question,records,managerNames=[]){
 const q=n(question);
 const mentioned=managerNames.filter(name=>q.includes(n(name).slice(0,5)));
 if(mentioned.length===1)return records.find(r=>n(r.manager_name)===n(mentioned[0]))||null;
 return null;
}
export function formatManagerSales({question,data,month,managerNames=[]}){
 if(!data||!Array.isArray(data.managers)||data.month!==month)return {error:'sales_source_invalid'};
 if(data.freshness?.status&&data.freshness.status!=='ok')return {error:'sales_import_not_fresh'};
 const all=data.managers.filter(x=>x&&typeof x.manager_name==='string'&&
  num(x.plan)!==null&&num(x.actual)!==null&&num(x.plan_pct)!==null);
 const selected=selectManager(question,all,managerNames);
 const q=n(question);
 const nameMention=managerNames.filter(name=>q.includes(n(name).slice(0,5)));
 if(nameMention.length>1 && !/(сравн|все|всех|по менеджер)/.test(q)){
  return {error:'sales_manager_ambiguous'};
 }
 if(nameMention.length===1&&!selected){
  return {brief:'В срезе менеджерского KPI за '+month+' для указанного сотрудника нет утверждённого плана продаж.',
    detail:'Не подставляю продажи филиала или другого менеджера. Уточни период или проверим план в разделе «Мотивация».',
    offer:'Проверить следующий период?',verified:true,source:'crm_ai360_sales_kpi_snapshot_v1'};
 }
 if(all.length===0)return {error:'manager_kpi_rows_missing'};
 const rows=selected?[selected]:all;
 const lines=rows.map(r=>r.manager_name+': план '+money(r.plan)+', факт '+money(r.actual)+
  ', выполнено '+Number(r.plan_pct).toLocaleString('ru-RU',{maximumFractionDigits:1})+'%, '+
  (Number(r.to_plan)>0?'до плана '+money(r.to_plan):'план закрыт')+'.');
 const network=num(data.network_revenue),managers=num(data.planned_managers_revenue);
 const mismatch=network!==null&&managers!==null&&Math.abs(managers-network)>=1;
 const limitation='Это выполнение плана ПРОДАЖ, не совокупный KPI мотивации. Год к году по менеджерам не сравниваю: методики несопоставимы.';
 const discrepancy=mismatch?
   'Сумма фактов менеджеров с утверждёнными планами — '+money(managers)+
   ', общий оборот сети — '+money(network)+
   '. Разница '+money(Math.abs(managers-network))+
   '. Методики отличаются: отгрузки KPI против общего импорта, вычитать или складывать эти показатели как одну базу некорректно.':'';
 const periodName=month.slice(0,4)+'-'+month.slice(5,7);
 const freshness=String(data.freshness?.last_success_at||'').slice(0,10);
 const heading='Продажи менеджеров за '+periodName+'. ';
 let brief=heading+rows.map(r=>r.manager_name+': '+fmt(r.actual)+' из '+fmt(r.plan)+
  ' белорусских рублей ('+Number(r.plan_pct).toLocaleString('ru-RU',{maximumFractionDigits:1})+'%)').join('; ')+'.';
 if(brief.length>440)brief=heading+rows.slice(0,4).map(r=>r.manager_name+': '+fmt(r.actual)+' из '+fmt(r.plan)+' ('+r.plan_pct+'%)').join('; ')+'.';
 const detail=(heading+lines.join(' ')+' '+discrepancy+' '+limitation+
   (freshness?' Данные импорта обновлены '+freshness+'.':'')).trim().slice(0,2950);
 return {
  brief:brief.slice(0,450),detail,offer:selected?'Сравнить этого менеджера с остальными?':'Уточнить причины отставания конкретного менеджера?',
  verified:true,source:'crm_ai360_sales_kpi_snapshot_v1',
  scope:selected?'manager':'managers_with_approved_plans',
  manager:selected?.manager_name||null,month,
  warnings:data.warnings||[]
 };
}
