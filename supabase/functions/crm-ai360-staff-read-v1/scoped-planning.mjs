// Read-only planning evidence. Callers authorize the user and manager allowlist first.
const iso=d=>d.toISOString().slice(0,10);
const valid=s=>/^20\d\d-\d\d-\d\d$/.test(s)&&Number.isFinite(Date.parse(s+'T12:00:00Z'))&&iso(new Date(s+'T12:00:00Z'))===s;
const months=['январ','феврал','март','апрел','ма[йяе]','июн','июл','август','сентябр','октябр','ноябр','декабр'];
export function routeWindow(question,today){
 const q=String(question||'').toLowerCase().replace(/ё/g,'е'),base=new Date(today+'T12:00:00Z');
 const shift=n=>iso(new Date(+base+n*86400000));
 const full=q.match(/20\d\d-\d\d-\d\d/);if(full)return valid(full[0])?{from:full[0],to:full[0]}:{error:'invalid_route_date'};
 const ru=q.match(/(?:^|\D)(\d{1,2})\.(\d{1,2})(?:\.(20\d\d))?(?!\d)/);
 if(ru){const day=(ru[3]||today.slice(0,4))+'-'+ru[2].padStart(2,'0')+'-'+ru[1].padStart(2,'0');return valid(day)?{from:day,to:day}:{error:'invalid_route_date'};}
 if(/следующ.{0,4}\s+недел/.test(q)){const n=8-(base.getUTCDay()||7);return {from:shift(n),to:shift(n+6)};}
 if(/(?:этой|текущей|эту)\s+недел/.test(q)){const n=1-(base.getUTCDay()||7);return {from:shift(n),to:shift(n+6)};}
 if(/послезавтра/.test(q))return {from:shift(2),to:shift(2)};
 if(/завтра/.test(q))return {from:shift(1),to:shift(1)};
 if(/вчера/.test(q))return {from:shift(-1),to:shift(-1)};
 const numbered=q.match(/(?:на\s+|^)(\d{1,2})(?:\s*-?\s*(?:го|е))?(?:\s+(?:числ[ао]|январ|феврал|март|апрел|ма[йяе]|июн|июл|август|сентябр|октябр|ноябр|декабр)|(?=\s|[?!.]|$))/);
 const bare=q.match(/(?:^|\D)(\d{1,2})(?:-го)?\s+числ[ао]/);
 const numberedDate=numbered||bare;
 if(numberedDate){const mi=months.findIndex(m=>new RegExp(m).test(q));const year=q.match(/\b20\d\d\b/)?.[0]||today.slice(0,4);const day=year+'-'+(mi<0?today.slice(5,7):String(mi+1).padStart(2,'0'))+'-'+numberedDate[1].padStart(2,'0');return valid(day)?{from:day,to:day}:{error:'invalid_route_date'};}
 return {from:today,to:today};
}
export function branchScope(question,memory={}){
 if(/по\s+(?:всей\s+)?сети|все\s+филиал|всех\s+филиал/i.test(question))return null;
 if(/витебск/i.test(question))return 'Витебск';
 return memory.branch==='Витебск'?'Витебск':null;
}
export async function readRouteWindow(svc,{managers=null,question='',today,offset=0}){
 const w=routeWindow(question,today);if(w.error)return {domain:'routes',error:w.error};
 if(managers&&(!managers.length||managers.some(x=>typeof x!=='string'||!x)))return {domain:'routes',error:'route_scope_unavailable'};
 const bounded=(columns,options)=>{let q=svc.from('route_plans').select(columns,options).gte('visit_date',w.from).lte('visit_date',w.to);return managers?q.in('manager_name',managers):q;};
 const start=Number.isSafeInteger(offset)?Math.max(0,Math.min(200,offset)):0;
 const queries=[bounded('visit_date,manager_name,client_name,status,approved,visited').order('visit_date',{ascending:true}).order('manager_name',{ascending:true}).range(start,start+11),
 bounded('manager_name',{head:true,count:'exact'}),bounded('manager_name',{head:true,count:'exact'}).eq('approved',true)];
 if(managers)for(const manager of managers)queries.push(bounded('manager_name',{head:true,count:'exact'}).eq('manager_name',manager));
 const results=await Promise.all(queries);if(results.some(r=>r.error)||results.slice(1).some(r=>!Number.isSafeInteger(r.count)))return {domain:'routes',error:'route_evidence_unavailable'};
 const total=results[1].count,rows=results[0].data||[];
 return {domain:'routes',source:'route_plans',date_from:w.from,date_to:w.to,timezone:'Europe/Minsk',managers,
 total_count:total,total_count_known:true,approved_count:results[2].count,rows,offset:start,partial:total>rows.length,
 has_more:start+rows.length<total,next_offset:start+rows.length<total?start+rows.length:null,
 manager_counts:managers?managers.map((manager,i)=>({manager,count:results[i+3].count})):[],
 interpretation:'Точные количества посчитаны по ВСЕМ строкам за запрошенные даты; rows — только страница. Плановая запись и согласованная запись различаются. Нулевая страница не означает отсутствие маршрутов.'};
}
export async function readClientRisk(svc,{manager=null,branch=null,month,authorizedManagers=null}){
 let names=null;
 if(!manager&&branch==='Витебск'){
  const directory=authorizedManagers?{data:authorizedManagers.map(name=>({name}))}:await svc.from('users').select('name').eq('role','manager').eq('region',branch).limit(20);
  if(directory.error||!directory.data?.length||directory.data.length>=20)return {domain:'clients',error:'branch_directory_unavailable'};
  names=[...new Set(directory.data.map(x=>x.name).filter(Boolean))];
 }
 const results=await Promise.all((names||[manager]).map(name=>svc.rpc('crm_ai360_client_risk_v41',{p_manager:name,p_month:month+'-01'})));
 if(results.some(r=>r.error||!r.data||!Number.isFinite(Number(r.data.matched_risky_clients))||!Number.isFinite(Number(r.data.total_decline_byn))))return {domain:'clients',error:'client_analytics_unavailable'};
 const data=results.map(r=>r.data),period=data[0].period;
 if(data.some(d=>d.period!==period))return {domain:'clients',error:'client_period_mismatch'};
 const clients=data.flatMap(d=>d.clients||[]).sort((a,b)=>Number(b.loss_byn)-Number(a.loss_byn)||String(a.name).localeCompare(String(b.name))).slice(0,8);
 const total=data.reduce((n,d)=>n+Number(d.matched_risky_clients),0);
 return {domain:'clients',source:'crm_ai360_client_risk_v41',...data[0],scope:manager?'manager':branch?'branch':'network',branch:branch||null,manager,
 managers:names,matched_risky_clients:total,total_decline_byn:Math.round(data.reduce((n,d)=>n+Number(d.total_decline_byn),0)*100)/100,
 clients,partial:total>clients.length,ranking_complete_for_top:8};
}
export function routeEvidenceAnswer(evidence){
 const e=evidence.find(x=>x?.domain==='routes'&&!x.error&&x.total_count_known===true&&x.date_from);if(!e)return null;
 const when=e.date_from===e.date_to?'На '+e.date_from:'За '+e.date_from+' — '+e.date_to;
 const managers=(e.manager_counts||[]).map(x=>x.manager+' — '+x.count).join('; ');
 const brief=when+': '+e.total_count+' плановых посещений, из них согласовано '+e.approved_count+'.'+(managers?' По менеджерам: '+managers+'.':'');
 const detail=brief+'\n'+(e.rows||[]).map(x=>x.visit_date+' · '+x.manager_name+' · '+x.client_name+(x.approved?' · согласовано':' · ожидает согласования')).join('\n')+(e.partial?'\nПоказана часть записей; итоговые количества посчитаны по полному срезу.':'');
 return {brief,detail,offer:e.has_more?'Показать следующие записи?':''};
}
export function riskEvidenceAnswer(evidence){
 const e=evidence.find(x=>x?.domain==='clients'&&!x.error&&x.source==='crm_ai360_client_risk_v41');if(!e)return null;
 const rub=n=>Number(n).toLocaleString('ru-RU',{maximumFractionDigits:2});
 const scope=e.manager?'по менеджеру '+e.manager:e.branch?'по филиалу '+e.branch:'по сети';
 const top=(e.clients||[]).slice(0,3);
 const lead='За '+e.period+' '+scope+': '+e.matched_risky_clients+' падающих клиентов, снижение '+rub(e.total_decline_byn)+' белорусских рублей.';
 const lines=top.map(x=>x.name+' — снижение '+rub(x.loss_byn)+' BYN ('+rub(x.drop_pct)+'%).');
 return {brief:lead+(lines.length?' Топ по сумме снижения: '+lines.join(' '):''),detail:lead+'\nСравнение с '+e.comparison_period+'.\n'+(e.clients||[]).map(x=>x.name+' · '+x.manager_name+': '+rub(x.prior_year_3m)+' → '+rub(x.current_3m)+' BYN; снижение '+rub(x.loss_byn)+' BYN.').join('\n')+'\nПолнота топа и количество всех рискованных клиентов различаются. Учтены продажи с привязкой к client_id и текущее закрепление менеджера; это сигнал риска, причина падения не установлена.',offer:e.partial?'Показать данные по этим клиентам подробнее?':''};
}
