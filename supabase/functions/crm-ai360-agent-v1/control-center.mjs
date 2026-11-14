// Deterministic explanation of the control-center monthly sales card.
// UI context selects the question/month, never permissions or financial values.
import {AGENT360_OWNER_ID} from './contract.mjs';
import {STAFF_USERS,BRANCH_MANAGERS} from './permissions.mjs';
const marker='\nКонтекст интерфейса, не подтверждение цифр: ';
const finite=x=>x!==null&&x!==undefined&&x!==''&&Number.isFinite(Number(x))?Number(x):null;
const money=x=>x.toLocaleString('ru-RU',{minimumFractionDigits:2,maximumFractionDigits:2})+' BYN';
const fail=()=>({error:'control_center_sources_unavailable',status:503});
export function controlCenterPlanRequest(input,principal,profile){
 if(!principal||profile?.id!==principal.user_id||!principal.domains?.includes('sales'))return null;
 const q=String(input?.question||'');
 const scoped=scopedScreenRequest(q,principal,profile);if(scoped)return scoped;
 const at=q.lastIndexOf(marker);
 if(at<0)return null;
 const question=q.slice(0,at).trim();let context;
 try{context=JSON.parse(q.slice(at+marker.length));}catch{return null;}
 if(context?.screen!=='Центр управления'||!/^20\d{2}-(0[1-9]|1[0-2])$/.test(context.sales_month))return null;
 // Only aggregate plan explanations. Other subjects retain existing gateways.
 if(!/план|процент/i.test(question)||!/продаж|выполнени|процент/i.test(question)||
   /Руднев|Ачинович|Шкуран|пдз|задолж|маршрут|задач|поступлен|созда|назнач|удал|измен|отправ|утверд|согласу|открой|перейди|клиент|сравн|прошл|почему\s+(?:упал|снизил)/i.test(question))return null;
 const staff=STAFF_USERS[principal.user_id];
 const field=principal.tier==='field_manager'&&staff?.name===profile.name;
 const boss=profile.role==='boss'&&['network_director','branch_director'].includes(principal.tier);
 if(!field&&!boss)return null;
 const email=String(profile.email||'').trim().toLowerCase();
 const tri=boss&&((principal.user_id===AGENT360_OWNER_ID&&email==='payushin_ar@resanta.ru')||
   (staff?.tier==='branch_director'&&email==='sidarovich_kn@resanta.ru'));
 return {month:context.sales_month,managers:field?[staff.name]:[...BRANCH_MANAGERS],tri,
   field,question};
}
export async function readControlCenterPlan(db,request){
 if(request.kind==='annual'||request.kind==='client')return readScopedScreen(db,request);
 const rpc=async(name,args)=>{
  const r=await db.rpc(name,args).abortSignal(AbortSignal.timeout(10000));
  if(r.error)throw Error('source_unavailable');return r.data;
 };
 try{
  const [kpi,tri]=await Promise.all([
   rpc('crm_manager_kpi360_dashboard_v2',{p_month:request.month}),
   request.tri?rpc('triovist_get_dashboard',{p_end_month:request.month,p_mode:'month',p_start_month:null}):null
  ]);
  if(kpi?.version!=='kpi360-visual-v2'||kpi.month!==request.month||!Array.isArray(kpi.sales)||
     !kpi.latest_sales_month||request.month>kpi.latest_sales_month)return fail();
  const rows=request.managers.map(name=>{
   const found=kpi.sales.filter(x=>x.manager_name===name);if(found.length!==1)throw Error('missing_manager');
   return {actual:finite(found[0].shipment),plan:finite(found[0].shipment_plan)};
  });
  if(rows.some(x=>x.actual===null||!(x.plan>0)))return fail();
  const field={actual:rows.reduce((s,x)=>s+x.actual,0),plan:rows.reduce((s,x)=>s+x.plan,0)};
  let shop=null;
  if(request.tri){
   if(tri?.end_month!==request.month||!tri.available_months?.includes(request.month)||
      !Array.isArray(tri.items)||!Array.isArray(tri.selected_month_plans)||!tri.selected_month_plans.length)return fail();
   if(tri.items.some(x=>finite(x.current_revenue)===null)||tri.selected_month_plans.some(x=>finite(x.plan_amount)===null))return fail();
   shop={actual:tri.items.reduce((s,x)=>s+Number(x.current_revenue),0),plan:tri.selected_month_plans.reduce((s,x)=>s+Number(x.plan_amount),0)};
   if(!(shop.plan>0))return fail();
  }
  const actual=field.actual+(shop?.actual||0),plan=field.plan+(shop?.plan||0);
  const percent=Number((actual/plan*100).toFixed(1));
  const scope=request.field?'по вашим продажам':shop?'по команде Витебска и интернет-магазину Триовист':'по команде Витебска';
  let answer='За '+request.month+' выполнение плана продаж '+scope+' — '+percent.toLocaleString('ru-RU')+'%: факт '+money(actual)+', план '+money(plan)+'.';
  if(shop)answer+=' Команда: '+money(field.actual)+' из '+money(field.plan)+'. Триовист: '+money(shop.actual)+' из '+money(shop.plan)+'. Триовист учтён один раз.';
  answer+=' Расчёт: общий факт делим на общий план и умножаем на 100. Это месячный план продаж.';
  return {answer,brief:answer,speech_summary:answer,detail:'',followup_question:'',answer_verified:true,
   read_only:true,protocol:'lera_dialogue_v2',intent:'control_center_sales_plan',
   domains_used:shop?['sales','triovist']:['sales'],source:'control_center_verified_rpcs_v1',
   month:request.month,totals:{actual,plan,percent},as_of:new Date().toISOString().slice(0,10)};
 }catch{return fail();}
}

// Fixed screen identifiers never authorize a user or supply business facts.
const clientMarker='\nКонтекст карточки клиента, не подтверждение цифр: ';
function scopedScreenRequest(q,principal,profile){
 const staff=STAFF_USERS[principal.user_id];
 const eligible=profile.role==='boss'&&['network_director','branch_director'].includes(principal.tier)||principal.tier==='field_manager'&&staff?.name===profile.name;
 if(!eligible)return null;
 const m=q.includes(clientMarker)?clientMarker:marker,at=q.lastIndexOf(m);if(at<0)return null;
 const question=q.slice(0,at).trim();let c;try{c=JSON.parse(q.slice(at+m.length))}catch{return null;}
 if(/созда|назнач|удал|измен|отправ|утверд|согласу|открой|перейди|напомни/i.test(question))return null;
 if(m===clientMarker&&c.screen==='Клиенты'&&principal.domains.includes('clients')&&/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(c.client_id)&&/^20\d{2}-(0[1-9]|1[0-2])$/.test(c.month)&&/клиент|точк|здесь|этот|этого|сводк|обзор|продаж|пдз|задач|визит/i.test(question)){
 // Specific causes, date ranges and searches retain the existing agent tools.
 if(/телефон|контакт|почт|руководител|почему|причин|найди|сравн|прошл|202[0-9].*202[0-9]|январ|феврал|март|апрел|ма[йя]|июн|июл|август|сентябр|октябр|ноябр|декабр/i.test(question))return null;
 return {kind:'client',client_id:c.client_id,month:c.month,point_id:typeof c.point_id==='string'?c.point_id:null,question};}
 if(c.screen==='Центр управления'&&/^20\d{2}-(0[1-9]|1[0-2])$/.test(c.sales_month)&&/с начала года|годов|динамик|график|202[0-9].*202[0-9]/i.test(question)&&/продаж|выручк|годов|график/i.test(question)&&!/план|почему|клиент/i.test(question)){
 const named=BRANCH_MANAGERS.filter(n=>question.includes(n)),tri=/триовист/i.test(question);
 return {kind:'annual',month:c.sales_month,year:Number(c.sales_month.slice(0,4)),manager:named.length===1?named[0]:null,tri,question};}
 return null;
}
const phrase=x=>{const answer=x;return {answer,brief:answer,speech_summary:answer,detail:'',followup_question:'',answer_verified:true,read_only:true,protocol:'lera_dialogue_v2',as_of:new Date().toISOString().slice(0,10)};};
async function readScopedScreen(db,request){
 try{
 const call=async(name,args)=>{const r=await db.rpc(name,args).abortSignal(AbortSignal.timeout(10000));if(r.error)throw Error('unavailable');return r.data;};
 if(request.kind==='annual'){
  const a=await call('crm_control_sales_year_v1',{p_year:request.year});if(a?.version!=='control.sales.year.1'||a.year!==request.year||a.months?.length!==12)return fail();
  if(request.tri&&!a.include_triovist||request.manager&&!a.months[0].managers.some(x=>x.name===request.manager))return fail();
  const rows=a.months.map(m=>{const list=request.tri?[]:m.managers.filter(x=>!request.manager||x.name===request.manager),shop=a.include_triovist&&!request.manager;const total=k=>{const vs=list.map(x=>finite(x[k]));if(shop)vs.push(finite(m[k==='current'?'tri_current':'tri_previous']));return vs.length&&vs.every(x=>x!==null)?vs.reduce((s,x)=>s+x,0):null;};return {...m,current:total('current'),previous:total('previous')};});
  const current=rows.filter(x=>!x.future),closed=current.filter(x=>!x.partial),sum=(rs,k)=>rs.length&&rs.every(x=>x[k]!==null)?rs.reduce((s,x)=>s+x[k],0):null;
  const ytd=sum(current,'current'),now=sum(closed,'current'),prev=sum(closed,'previous'),scope=request.tri?'Триовист':request.manager||a.scope;
  let answer='Продажи с начала '+a.year+' года, '+scope+': '+(ytd===null?'не все месяцы загружены':money(ytd))+'. Текущий месяц неполный и включён в эту сумму при наличии данных.';
  answer+=' Сравнение за '+closed.length+' завершённых месяцев: '+(now===null?'нет полного текущего периода':money(now))+' за '+a.year+' и '+(prev===null?'нет полной прошлогодней базы':money(prev))+' за '+a.previous_year+'.';
  if(now!==null&&prev>0)answer+=' Изменение: '+((now/prev-1)*100).toLocaleString('ru-RU',{maximumFractionDigits:1})+'%.';
  answer+=' Неполный месяц исключён из сравнения. По дням месячные суммы 1С не распределяются.';
  return {...phrase(answer),intent:'control_center_annual_sales',domains_used:a.include_triovist?['sales','triovist']:['sales'],source:'control_sales_year_verified_rpc_v1',month:request.month,totals:{ytd,closed_current:now,closed_previous:prev}};
 }
 const a=await call('crm_clients_detail_v1',{p_client_id:request.client_id,p_month:request.month});if(a?.version!=='clients.detail.1'||a.month!==request.month||!a.members?.some(x=>x.id===request.client_id))return fail();
 const point=request.point_id?a.points.find(x=>x.id===request.point_id):null;if(request.point_id&&!point)return fail();
 const sales=finite(a.sales?.find(x=>x.month===request.month)?.revenue),debt=finite(a.debt?.amount),open=(a.tasks||[]).filter(x=>!x.done&&!['draft','pending','pending_boss','rejected'].includes(x.review_status)).length;
 let answer=(a.entity?.name||a.members[0].name)+': '+a.members.length+' доступных карточек 1С, '+a.points.length+' физических торговых точек. Продажи за '+request.month+': '+(sales===null?'месяц не загружен':money(sales))+'. ПДЗ: '+(debt===null?'отчёт не загружен':money(debt))+(a.debt?.report_date?' на '+a.debt.report_date:'')+'.';
 if(point)answer+=' Выбранная ТТ: '+[point.city,point.address].filter(Boolean).join(', ')+'. Визитов за '+request.month+': '+point.visits+'. Последний визит: '+(point.last_visit||'не подтверждён')+'. Финансовые суммы относятся ко всему доступному клиенту, разбивки по ТТ нет.';
 answer+=' Открытых подтверждённых задач в показанном списке: '+open+(a.task_total>100?' (показано до 100 из '+a.task_total+')':'')+'.';
 if(/точк|адрес/i.test(request.question))answer+=' Адреса: '+a.points.slice(0,8).map(x=>[x.city,x.address].filter(Boolean).join(', ')).join('; ')+(a.points.length>8?'; остальные — в карточке.':'.');
 answer+=' Выручка по адресам отдельно не распределяется.'+(a.partial_scope?' Показана только доступная вам часть группы.':'');
 return {...phrase(answer),intent:'client_card_summary',domains_used:['clients','sales','debt','tasks'],source:'clients_detail_verified_rpc_v1',month:request.month};
 }catch{return fail();}
}
