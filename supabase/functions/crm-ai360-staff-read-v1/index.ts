// Separate AI360 staff read-only gateway. Never import director v4 or its service-key source reads.
// Promotion to staff voice requires independent STT/TTS grants and end-to-end validation.
import {createClient} from 'npm:@supabase/supabase-js@2.56.0';
import {staffPermission,targetManagers,safeMonth,safeOffset,narrowKpi,narrowDebt} from './permissions.mjs';
const ORIGINS=new Set(['https://resanta-crm.by','https://www.resanta-crm.by']);
const headers=origin=>({
 'Access-Control-Allow-Origin':ORIGINS.has(origin||'')?origin:'https://resanta-crm.by',
 'Access-Control-Allow-Headers':'authorization,apikey,x-client-info,content-type',
 'Access-Control-Allow-Methods':'POST,OPTIONS','Vary':'Origin',
 'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'
});
const reply=(req,body,status=200)=>new Response(JSON.stringify(body),{status,headers:headers(req.headers.get('Origin'))});
const error=(req,code,status=403)=>reply(req,{error:code,answer_verified:false},status);
const today=()=>{
 const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Minsk',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
 const p=x=>parts.find(z=>z.type===x)?.value||'';
 return p('year')+'-'+p('month')+'-'+p('day');
};
const pageSize=6;
const sanitizeRows=(rows,columns)=>rows.map(r=>Object.fromEntries(columns.map(k=>[k,r[k]??null])));
const clampString=(s,n)=>typeof s==='string'&&s.length<=n?s.trim():'';
async function scopedTable(svc,table,columns,sort,managers,{offset=0,filter=null,ascending=false}={}){
 let q=svc.from(table).select(columns.join(',')).in('manager_name',managers);
 if(filter==='active')q=q.or('done.eq.false,done.is.null');
 if(filter==='not_archived')q=q.or('is_archived.eq.false,is_archived.is.null');
 q=q.order(sort,{ascending}).range(offset,offset+pageSize);
 const {data,error:sourceError}=await q;
 if(sourceError)throw new Error('scoped_read_unavailable');
 const items=sanitizeRows((data||[]).slice(0,pageSize),columns);
 const has_more=(data||[]).length>pageSize;
 return {items,partial:has_more,has_more,next_offset:has_more?offset+items.length:null,offset,
   count_known:false,source:table,scope:'authorized_managers'};
}
async function readStaff(svc,permission,managers,domain,body,day){
 const offset=safeOffset(body.offset);
 const month=safeMonth(body.month,day);
 if(domain==='sales'){
  const r=await svc.rpc('crm_ai360_sales_kpi_snapshot_v1',{p_month:month+'-01'});
  if(r.error||!r.data)throw new Error('sales_unavailable');
  const clean=narrowKpi(r.data,managers);
  if(!clean)throw new Error('sales_scope_unverifiable');
  return clean;
 }
 if(domain==='debt'){
  const records=await Promise.all(managers.map(name=>svc.rpc('crm_ai360_debt_snapshot_v1',{p_manager:name})));
  if(records.some(x=>x.error||!x.data))throw new Error('debt_unavailable');
  const result=narrowDebt(records.map(x=>x.data),managers);
  if(!result)throw new Error('debt_scope_unverifiable');
  return result;
 }
 if(domain==='client_detail'){
  const name=clampString(body.client_name,160);
  if(name.length<2)throw new Error('client_name_required');
  const verify=await svc.from('clients').select('id,name,manager_name')
    .eq('name',name).in('manager_name',managers).or('is_archived.eq.false,is_archived.is.null').limit(2);
  if(verify.error)throw new Error('client_verification_unavailable');
  if((verify.data||[]).length!==1)throw new Error('client_not_in_authorized_portfolio');
  const client=verify.data[0];
  const level=['groups','subgroups','sku'].includes(body.level)?body.level:'groups';
  const group=clampString(body.group,120)||null,subgroup=clampString(body.subgroup,120)||null;
  if(level!=='groups'&&!group)throw new Error('group_required');
  if(level==='sku'&&!subgroup)throw new Error('subgroup_required');
  const r=await svc.rpc('crm_ai360_client_drilldown_v43',{
   p_client_id:client.id,p_level:level,p_group:group,p_subgroup:subgroup,
   p_month:month+'-01',p_limit:level==='sku'?6:12,p_offset:offset
  });
  if(r.error||!r.data||r.data.error)throw new Error('client_detail_unavailable');
  const x=r.data;
  return {source:'crm_ai360_client_drilldown_v43',scope:'verified_client',
   client_name:client.name,manager_name:client.manager_name,month,
   level,group,subgroup,previous_period:x.previous_period,current_period:x.current_period,
   previous_byn:x.previous_byn,current_byn:x.current_byn,delta_byn:x.delta_byn,
   has_more:!!x.has_more,partial:!!x.has_more,next_offset:x.has_more?offset+(x.items||[]).length:null,
   total_items:x.total_items,offset,
   items:(x.items||[]).slice(0,level==='sku'?6:12).map(it=>({
    category:it.category,subgroup:it.subgroup,sku:it.sku,product:it.product,
    delta_byn:it.delta_byn,previous_byn:it.previous_byn,current_byn:it.current_byn
   }))};
 }
 if(domain==='clients')return scopedTable(svc,'clients',['name','manager_name','client_status','sku_count'],'created_at',managers,{offset,filter:'not_archived'});
 if(domain==='tasks')return scopedTable(svc,'tasks',['title','manager_name','priority','due_date','review_status'],'due_date',managers,{offset,filter:'active',ascending:true});
 if(domain==='routes')return scopedTable(svc,'route_plans',['client_name','manager_name','visit_date','status','approved','visited'],'visit_date',managers,{offset});
 if(domain==='visits')return scopedTable(svc,'visits',['manager_name','date','goal','result','goal_achieved'],'date',managers,{offset});
 if(domain==='gps')return scopedTable(svc,'gps_workday_aggregates',['manager_name','work_date','physical_stops','planned_count','visited_count','missed_count','aggregation_status'],'work_date',managers,{offset});
 if(domain==='triovist_tasks')return scopedTable(svc,'triovist_ai_tasks',['manager_name','title','status','priority_score','due_date'],'updated_at',managers,{offset});
 if(domain==='stock'){
  const q=await svc.from('stock_balances').select('sku,product,warehouse,qty_avail,report_date')
    .eq('warehouse','Витебск').order('updated_at',{ascending:false}).range(offset,offset+pageSize);
  if(q.error)throw new Error('stock_unavailable');
  const arr=q.data||[],has_more=arr.length>pageSize;
  return {source:'stock_balances',scope:'Витебск',items:arr.slice(0,pageSize),
   offset,has_more,partial:has_more,next_offset:has_more?offset+pageSize:null,count_known:false};
 }
 throw new Error('unknown_or_forbidden_domain');
}
Deno.serve(async req=>{
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers:headers(req.headers.get('Origin'))});
 if(req.method!=='POST')return error(req,'method_not_allowed',405);
 const origin=req.headers.get('Origin');
 if(origin&&!ORIGINS.has(origin))return error(req,'origin_not_allowed');
 const authorization=req.headers.get('Authorization')||'';
 if(!authorization.startsWith('Bearer '))return error(req,'not_authorized',401);
 const token=authorization.slice(7);
 if(token.length<15||token.length>6000)return error(req,'not_authorized',401);
 const url=Deno.env.get('SUPABASE_URL'),secret=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
 if(!url||!secret)return error(req,'service_unavailable',503);
 const svc=createClient(url,secret,{auth:{autoRefreshToken:false,persistSession:false}});
 const auth=await svc.auth.getUser(token).catch(()=>null);
 const user=auth?.data?.user;
 if(!user?.id)return error(req,'not_authorized',401);
 const profileRes=await svc.from('users').select('id,name,role,region').eq('id',user.id).maybeSingle();
 if(profileRes.error)return error(req,'profile_unavailable',503);
 const permission=staffPermission(user.id,profileRes.data);
 if(!permission)return error(req,'staff_access_not_enabled');
 let body;try{body=await req.json();}catch{return error(req,'bad_json',400);}
 if(body?.kind==='capabilities')return reply(req,{
  ready:true,mode:'staff_scoped_readonly_pilot_v1',role:permission.tier,
  domains:permission.domains,own_name:permission.name,source_permissions:'server_immutable_allowlist',
  voice_enabled:false,real_task_creation_enabled:false
 });
 if(body?.kind!=='read')return error(req,'invalid_kind',400);
 const domain=clampString(body.domain,40);
 const managers=targetManagers(permission,domain,clampString(body.manager,90)||null);
 if(!managers)return error(req,'domain_or_manager_outside_scope');
 const day=today();
 try{
  const result=await readStaff(svc,permission,managers,domain,body,day);
  return reply(req,{
   mode:'staff_scoped_readonly_pilot_v1',answer_verified:true,domain,as_of:day,
   scope:{role:permission.tier,managers},
   data:result,read_only:true,voice_enabled:false
  });
 }catch(e){
  const msg=String(e?.message||'read_unavailable');
  const known=['client_name_required','client_not_in_authorized_portfolio','group_required','subgroup_required'];
  return error(req,known.includes(msg)?msg:'source_unavailable',known.includes(msg)?403:503);
 }
});
