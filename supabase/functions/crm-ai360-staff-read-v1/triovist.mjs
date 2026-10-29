// Read-only, assigned-category 21vek content for Triovist managers.
// NEVER trust frontend manager_email/category or LLM proposal as authorization.
// Live assignments are read from CRM for every request. No shared competitor, MRC,
// budget, revenue or cross-category sources in this handler.
import {norm,safeOffset} from './permissions.mjs';
export const TRIOVIST_DOMAINS=Object.freeze({
 triovist_cards:{table:'triovist_21vek_registry_v236214',groupColumn:'category',
  fields:['sku','product_name','category','subgroup','registry_snapshot_date','price',
   'listing_position','photo_count','video_count','description_present','warranty_present',
   'in_stock','unanswered_negative_reviews','unanswered_questions'],
  order:'registry_snapshot_date'},
 triovist_positions:{table:'triovist_21vek_position_metrics_v236351',groupColumn:'category',
  fields:['sku','product_name','category','subgroup','keyword','current_position',
   'previous_position','position_delta','movement','current_top60','current_observed_at',
   'current_error','price_21vek'],order:'current_observed_at'},
 triovist_tasks:{table:'triovist_ai_tasks',groupColumn:'group_name',
  fields:['group_name','title','status','priority_score','due_date','manager_comment','updated_at'],
  order:'updated_at'},
 triovist_issues:{table:'triovist_content_issues',groupColumn:null,
  fields:['card_key','issue_title','issue_type','severity','status','last_seen_at'],
  order:'last_seen_at'},
 triovist_infographics:{table:'triovist_infographic_factory_items_v5',groupColumn:'group_name',
  fields:['sku','group_name','product_name','status','stage','completed_slides',
   'slide_count','error_message','updated_at'],order:'updated_at'}
});
const pageSize=6;
const limited=(data,offset)=>({
 items:data.slice(0,pageSize),returned:Math.min(pageSize,data.length),
 offset,has_more:data.length>pageSize,partial:data.length>pageSize,
 next_offset:data.length>pageSize?offset+pageSize:null,total_count_known:false
});
const error=(message)=>{throw new Error(message);};
export async function readTriovist(svc,permission,userEmail,profileEmail,domain,body){
 if(!permission||permission.tier!=='triovist_category')return error('triovist_access_denied');
 const email=String(userEmail||'').trim().toLowerCase();
 if(!email||email!==String(profileEmail||'').trim().toLowerCase()||
    !/^[^@\s]+@[^@\s]+$/.test(email))return error('triovist_email_mismatch');
 const assignment=await svc.from('triovist_group_assignments')
  .select('group_name,manager_name,manager_email')
  .eq('manager_email',email).eq('active',true)
  .eq('manager_name',permission.name).order('priority',{ascending:true}).limit(60);
 if(assignment.error)return error('triovist_assignments_unavailable');
 const groups=(assignment.data||[])
  .filter(a=>norm(a.manager_name)===norm(permission.name)&&
     String(a.manager_email).trim().toLowerCase()===email)
  .map(a=>String(a.group_name||'').trim()).filter(Boolean);
 if(!groups.length)return error('triovist_no_active_groups');
 if(domain==='triovist_groups')return {
  source:'triovist_group_assignments',scope:'assigned_categories',
  manager_name:permission.name,group_count:groups.length,group_names:groups,
  items:groups.map(group_name=>({group_name})),
  has_more:false,partial:false,total_count_known:true
 };
 const def=TRIOVIST_DOMAINS[domain];
 if(!def)return error('triovist_domain_denied');
 const requested=typeof body.group==='string'?body.group.trim().slice(0,120):'';
 if(requested&&!groups.some(x=>norm(x)===norm(requested)))return error('triovist_group_outside_scope');
 const exactGroup=groups.find(x=>norm(x)===norm(requested))||null;
 const offset=safeOffset(body.offset);
 const cols=def.fields.join(',');
 let query=svc.from(def.table).select(cols)
  .eq('manager_email',email).order(def.order,{ascending:false});
 if(def.groupColumn)query=query.in(def.groupColumn,exactGroup?[exactGroup]:groups);
 query=query.range(offset,offset+pageSize);
 const result=await query;
 if(result.error)return error('triovist_source_unavailable');
 const raw=Array.isArray(result.data)?result.data:[];
 let items=raw;
 if(domain==='triovist_issues'&&raw.length){
  // Issue rows have no group column. Confirm their card keys against current
  // registry rows AND the live assigned categories before showing any item.
  const keys=[...new Set(raw.map(x=>x.card_key).filter(Boolean))];
  if(!keys.length)items=[];
  else{
   const owned=await svc.from('triovist_21vek_registry_v236214')
    .select('card_key,category').eq('manager_email',email)
    .in('category',exactGroup?[exactGroup]:groups).in('card_key',keys).limit(keys.length);
   if(owned.error)return error('triovist_issue_scope_unavailable');
   const allowed=new Set((owned.data||[]).map(x=>x.card_key));
   items=raw.filter(x=>allowed.has(x.card_key));
  }
 }
 const page=limited(items,offset);
 // For issues the sentinel is based on raw rows, not post-filtered visible rows:
 // we never report a nonexistent full-list total and continuation remains safe.
 if(domain==='triovist_issues'){
  page.has_more=raw.length>pageSize;
  page.partial=page.has_more;
  page.next_offset=page.has_more?offset+pageSize:null;
 }
 return {source:def.table,scope:'assigned_categories',manager_name:permission.name,
  group_names:groups,requested_group:exactGroup,group_count:groups.length,
  ...page,warning:page.has_more?'Это только часть записей; можно запросить продолжение.':
   'Выборка охватывает только личные категории в указанном источнике; не всю сеть.'};
}
