// Immutable server-side authorizations for staff AI360 pilot.
// NO arbitrary role names/manager IDs from a browser, LLM or user_metadata.
export const STAFF_USERS=Object.freeze({
 'ba55dfe5-7e48-4f1f-b40e-674c7752fe1a':{name:'Сидарович К.Н.',role:'boss',region:'Витебск',tier:'branch_director'},
 '19dd9943-99ae-47c4-a39c-4f82a11059a6':{name:'Руднев',role:'manager',region:'Витебск',tier:'field_manager'},
 '3d935a76-c6fe-44b6-b248-fcbe58c6bf1c':{name:'Ачинович',role:'manager',region:'Витебск',tier:'field_manager'},
 '4fd79fa0-232d-4768-8099-25f47923cc4f':{name:'Шкуран',role:'manager',region:'Витебск',tier:'field_manager'},
 '6efa656e-45c6-473b-a853-89eccb9ee43a':{name:'Александренко',role:'manager',region:'Триовист / 21vek.by',tier:'triovist_category'},
 '9076ccde-a8cc-47e3-b71e-c31170b693ff':{name:'Кришталь',role:'manager',region:'Триовист / 21vek.by',tier:'triovist_category'}
});
export const BRANCH_MANAGERS=Object.freeze(['Руднев','Ачинович','Шкуран']);
export const STAFF_DOMAINS=Object.freeze({
 branch_director:['sales','debt','clients','tasks','routes','visits','gps','stock','client_detail'],
 field_manager:['sales','debt','clients','tasks','routes','visits','client_detail'],
 // Category ownership of 21vek SKUs is not yet stored as enforceable row access.
 // Never return the cross-category card/competitor/MRC catalog to these roles.
 triovist_category:['triovist_tasks']
});
export const norm=x=>String(x||'').trim().replace(/\s+/g,' ').toLocaleLowerCase('ru-RU').replaceAll('ё','е');
export function staffPermission(userId,profile){
 const x=STAFF_USERS[userId];
 if(!x||!profile||profile.id!==userId)return null;
 if(norm(profile.name)!==norm(x.name)||profile.role!==x.role||profile.region!==x.region)return null;
 return Object.freeze({...x,user_id:userId,domains:STAFF_DOMAINS[x.tier]});
}
export function targetManagers(permission,domain,requestedManager){
 if(!permission||!permission.domains.includes(domain))return null;
 if(permission.tier==='triovist_category')return domain==='triovist_tasks'?[permission.name]:null;
 if(permission.tier==='field_manager'){
  if(requestedManager&&norm(requestedManager)!==norm(permission.name))return null;
  return [permission.name];
 }
 if(permission.tier==='branch_director'){
  if(!requestedManager)return [...BRANCH_MANAGERS];
  const chosen=BRANCH_MANAGERS.find(n=>norm(n)===norm(requestedManager));
  return chosen?[chosen]:null;
 }
 return null;
}
export function safeMonth(v,day){
 const current=String(day||'').slice(0,7);
 return typeof v==='string'&&/^\d{4}-(0[1-9]|1[0-2])$/.test(v)&&v>='2025-01'&&v<=current?v:current;
}
export function safeOffset(v){
 return Number.isSafeInteger(v)&&v>=0&&v<=200?v:0;
}
export function narrowKpi(snapshot,managers){
 if(!snapshot||!Array.isArray(snapshot.managers))return null;
 const permitted=new Set(managers.map(norm));
 const selected=snapshot.managers.filter(row=>permitted.has(norm(row.manager_name)))
   .map(x=>({manager_name:x.manager_name,region:x.region,plan:x.plan,
     actual:x.actual,plan_pct:x.plan_pct,to_plan:x.to_plan,clients_current:x.clients_current}));
 return {source:'crm_ai360_sales_kpi_snapshot_v1',scope:'authorized_managers',
  month:snapshot.month,managers:selected,
  // Network revenue, bonus categories and other managers are deliberately absent.
  freshness:snapshot.freshness?.last_success_at||null,
  methodology:'KPI positive shipments, not all-branch turnover; not individual daily sales.'};
}
export function narrowDebt(snapshots,managers){
 if(snapshots.length!==managers.length||snapshots.some(x=>!x||x.source!=='crm_ai360_debt_snapshot_v1'))return null;
 const overdue_debtors=[],per_manager=[];
 for(let i=0;i<snapshots.length;i++){
  const s=snapshots[i],name=managers[i];
  if(norm(s.scope)!==norm(name))return null;
  const debts=(s.overdue_debtors||[]).filter(x=>norm(String(x.manager_name||'').split(' ')[0])===norm(name));
  overdue_debtors.push(...debts.map(x=>({
   client_name:x.client_name,debt_overdue:x.debt_overdue,debt_overdue_days:x.debt_overdue_days,report_date:x.report_date,
   manager_name:name
  })));
  per_manager.push({manager_name:name,amount:s.debt_summary?.amount||0,
    debtor_rows:s.debt_summary?.debtor_rows||0,report_date:s.debt_summary?.report_date||null});
 }
 return {source:'crm_ai360_debt_snapshot_v1',scope:'authorized_managers',
  manager_totals:per_manager,overdue_debtors:overdue_debtors.sort((a,b)=>Number(b.debt_overdue)-Number(a.debt_overdue)).slice(0,8),
  partial:true,warning:'Only 8 largest overdue rows in the allowed managers, current imported report only.'};
}
