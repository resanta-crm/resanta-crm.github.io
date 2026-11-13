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
 const q=String(input?.question||''),at=q.lastIndexOf(marker);
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
