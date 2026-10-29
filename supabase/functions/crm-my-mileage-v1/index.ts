// Read-only personal GPS mileage for field managers; original director fuel RPC untouched.
// No full GPS samples, coordinates, other users' routes or vehicle settings editable here.
import {createClient} from 'npm:@supabase/supabase-js@2.56.0';
const SVC=createClient(Deno.env.get('SUPABASE_URL')||'',
 Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'',{auth:{persistSession:false,autoRefreshToken:false}});
const ORIGINS=new Set(['https://resanta-crm.by','https://www.resanta-crm.by']);
const h=req=>({'Content-Type':'application/json','Cache-Control':'no-store',
 'Access-Control-Allow-Origin':ORIGINS.has(req.headers.get('origin'))?req.headers.get('origin'):'https://resanta-crm.by',
 'Access-Control-Allow-Headers':'authorization,apikey,x-client-info,content-type',
 'Access-Control-Allow-Methods':'POST,OPTIONS','Vary':'Origin'});
const reply=(req,o,status=200)=>new Response(JSON.stringify(o),{status,headers:h(req)});
const date=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Minsk',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const round=(x,d=1)=>Math.round((Number(x)||0)*10**d)/10**d;
Deno.serve(async(req)=>{
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers:h(req)});
 if(req.method!=='POST')return reply(req,{error:'method_not_allowed'},405);
 if(req.headers.get('origin')&&!ORIGINS.has(req.headers.get('origin')))return reply(req,{error:'forbidden_origin'},403);
 try{
  const token=String(req.headers.get('authorization')||'').replace(/^Bearer /i,'');
  if(!token||token.length>6000)return reply(req,{error:'not_authorized'},401);
  const auth=await SVC.auth.getUser(token);
  if(auth.error||!auth.data.user?.id)return reply(req,{error:'not_authorized'},403);
  const uid=auth.data.user.id;
  const {data:u,error:pe}=await SVC.from('users').select('id,name,role,region').eq('id',uid).maybeSingle();
  if(pe||!u||u.role!=='manager'||u.region!=='Витебск'||
   !['Руднев','Ачинович','Шкуран'].includes(u.name))return reply(req,{error:'not_authorized'},403);
  const body=await req.json().catch(()=>({}));
  const today=date(),month=typeof body.month==='string'?body.month:today.slice(0,7);
  if(!/^20\d{2}-(0[1-9]|1[0-2])$/.test(month)||month>today.slice(0,7)||
   month< String(Number(today.slice(0,4))-2)+'-01')
   return reply(req,{error:'invalid_month'},400);
  const next=new Date(month+'-01T12:00:00Z');next.setUTCMonth(next.getUTCMonth()+1);
  const nextMonth=next.toISOString().slice(0,10);
  const [work,setting,price]=await Promise.all([
   SVC.from('gps_workdays')
    .select('id,user_id,manager_name,work_date,status,started_at,ended_at,total_distance_m,raw_points,valid_points')
    .eq('manager_name',u.name).or('user_id.eq.'+uid+',user_id.is.null')
    .gte('work_date',month+'-01').lt('work_date',nextMonth).neq('status','cancelled')
    .order('work_date',{ascending:false}).limit(150),
   SVC.from('gps_fuel_vehicle_settings')
    .select('vehicle_name,plate_no,fuel_type,consumption_l_per_100km')
    .eq('manager_name',u.name).eq('active',true).limit(1),
   SVC.from('gps_fuel_prices').select('fuel_type,price_byn_l')
    .eq('month',month+'-01')
  ]);
  if([work,setting,price].some(x=>x.error))return reply(req,{error:'gps_report_unavailable'},503);
  const rate=setting.data?.[0]||null,priceRow=price.data?.find(x=>x.fuel_type===rate?.fuel_type)||null;
  const aggregate=new Map();
  for(const w of work.data||[]){
   const d=w.work_date;
   const g=aggregate.get(d)||{date:d,sessions:0,distance_m:0,raw_points:0,valid_points:0,
     active:false,first_start:null,last_end:null};
   g.sessions++;g.distance_m+=Math.max(0,Number(w.total_distance_m)||0);
   g.raw_points+=Number(w.raw_points)||0;g.valid_points+=Number(w.valid_points)||0;
   if(w.status==='active')g.active=true;
   if(!g.first_start||w.started_at<g.first_start)g.first_start=w.started_at;
   if(w.ended_at&&(!g.last_end||w.ended_at>g.last_end))g.last_end=w.ended_at;
   aggregate.set(d,g);
  }
  const days=[...aggregate.values()].sort((a,b)=>b.date.localeCompare(a.date)).map(g=>{
   const distance_km=round(g.distance_m/1000);
   const validity=g.raw_points>0?round(g.valid_points*100/g.raw_points):null;
   const review=g.active||g.distance_m>=500000||(g.raw_points>=20&&validity<40);
   const status=g.active?'incomplete':review?'review':'ok';
   return {date:g.date,sessions:g.sessions,distance_km,
    status,raw_points:g.raw_points,valid_points:g.valid_points,valid_pct:validity,
    fuel_l:rate?.consumption_l_per_100km!=null?
      round(distance_km*Number(rate.consumption_l_per_100km)/100,2):null,
    started_at:g.first_start,ended_at:g.last_end};
  });
  const distance_km=round(days.reduce((sum,d)=>sum+d.distance_km,0));
  const fuel_l=rate?.consumption_l_per_100km!=null?
    round(distance_km*Number(rate.consumption_l_per_100km)/100,2):null;
  const todayKm=round(days.find(d=>d.date===today)?.distance_km||0);
  return reply(req,{mode:'my_gps_mileage_v1',manager_name:u.name,month,today,
   today_km:month===today.slice(0,7)?todayKm:null,month_km:distance_km,
   month_fuel_l:fuel_l,month_fuel_cost_byn:fuel_l!==null&&priceRow?.price_byn_l!=null?
    round(fuel_l*Number(priceRow.price_byn_l),2):null,
   vehicle:rate?.vehicle_name||null,fuel_type:rate?.fuel_type||null,
   consumption_l_per_100km:rate?.consumption_l_per_100km??null,
   warning:'Пробег GPS, не утверждённая сумма компенсации. Незавершённые и сомнительные дни проверяются отдельно.',
   days});
 }catch{return reply(req,{error:'service_unavailable'},503);}
});
