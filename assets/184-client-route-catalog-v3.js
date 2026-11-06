/* Confirmed legal links + exact store address. Read-only selection; history is never merged. */
(function(root){
'use strict';
const norm=s=>String(s||'').toLocaleLowerCase('ru-RU').replace(/ё/g,'е').replace(/\s+/g,' ').trim();
const address=s=>norm(s).replace(/[.,]/g,'').replace(/\s+/g,' ');
const active=c=>c&&!c.is_archived&&!c.to_delete&&['рабочий','потенциальный'].includes(norm(c.client_status));
function distance(a,b){
 if([a.lat,a.lng,b.lat,b.lng].some(v=>v==null||!Number.isFinite(Number(v))))return 0;
 const rad=x=>Number(x)*Math.PI/180,dl=rad(b.lat-a.lat),dn=rad(b.lng-a.lng);
 return 12742000*Math.asin(Math.min(1,Math.sqrt(Math.sin(dl/2)**2+Math.cos(rad(a.lat))*Math.cos(rad(b.lat))*Math.sin(dn/2)**2)));
}
function buildPlans(records){
 const groups=new Map();
 for(const rec of [...records].sort((a,b)=>String(a.client.id).localeCompare(String(b.client.id)))){
  const c=rec.client;if(!active(c))continue;
  const points=(rec.points||[]).filter(p=>p.active!==false);
  for(const p of points.length?points:[{city:c.city,region:c.region,address:c.address,lat:null,lng:null}]){
   const city=String(p.city||c.city||'').trim(),addr=String(p.address||c.address||'').trim();
   const explicit=rec.entity_id&&city&&addr.length>=5;
   let key=explicit?'entity:'+rec.entity_id+'|'+norm(c.manager_name)+'|'+address(city)+'|'+address(addr):
    'point:'+(p.id||c.id)+'|'+norm(c.manager_name);
   let group=groups.get(key);
   // Conflicting coordinates must be reviewed, even if textual addresses match.
   if(group&&group.source_points.some(x=>distance(x,p)>75)){key+='|conflict:'+(p.id||c.id);group=groups.get(key);}
   if(!group){
    group={route_selection_key:String(p.id||c.id),route_client_id:String(c.id),route_city:city,route_address:addr,
     assigned_manager:c.manager_name,primary:c,eligible:[],linked:[],names:[],label:rec.entity_name||c.name,
     category:c.role_type||'',visits:/^(AAA|ААА|A|А)$/.test(c.role_type)?4:/^(B|В|Передан на 3%)$/.test(c.role_type)?2:1,point:{...p,city,address:addr},
     physical_point_id:p.id||null,physical_point_key:p.point_key||null,source_point_ids:[],source_points:[]};
    groups.set(key,group);
   }
   if(!group.linked.some(x=>x.client.id===c.id)){group.linked.push({client:c});group.eligible.push({client:c});group.names.push(c.name);}
   if(p.id&&!group.source_point_ids.includes(p.id)){group.source_point_ids.push(p.id);group.source_points.push(p);}
   if(norm(c.name)===norm(rec.entity_name)){group.primary=c;group.route_client_id=String(c.id);}
  }
 }
 return [...groups.values()].sort((a,b)=>a.route_city.localeCompare(b.route_city,'ru')||a.label.localeCompare(b.label,'ru')||a.route_selection_key.localeCompare(b.route_selection_key));
}
function rowKeys(row,plans){
 if(!row||row.is_network_point||row.is_office_day)return [];
 const scope=plans.filter(p=>norm(p.assigned_manager)===norm(row.manager_name));
 if(row.physical_point_id){const found=scope.filter(p=>p.source_point_ids.includes(String(row.physical_point_id)));if(found.length)return found.map(p=>p.route_selection_key);}
 let ids=row.linked_client_ids||[];if(typeof ids==='string'){try{ids=JSON.parse(ids)}catch(_){ids=[]}}
 ids=new Set([row.client_id,...(Array.isArray(ids)?ids:[])].filter(Boolean).map(String));
 const candidates=scope.filter(p=>p.linked.some(x=>ids.has(String(x.client.id)))||(!ids.size&&p.names.some(n=>norm(n)===norm(row.client_name))));
 const exact=candidates.filter(p=>address(p.route_city)===address(row.city)&&address(p.route_address)===address(row.address));
 if(exact.length)return exact.map(p=>p.route_selection_key);
 return !row.address&&candidates.length===1?[candidates[0].route_selection_key]:[];
}
function uniqueDisplayRows(rows,plans,isVisited=()=>false){
 const seen=new Set();
 return rows.filter(row=>{
  if(isVisited(row))return true;
  const keys=rowKeys(row,plans);
  if(keys.length!==1)return true;
  const key=[row.manager_name,row.visit_date,keys[0]].join('|');
  if(seen.has(key))return false;
  seen.add(key);return true;
 });
}
const api={buildPlans,rowKeysForPlans:rowKeys,uniqueDisplayRowsForPlans:uniqueDisplayRows};
if(typeof module!=='undefined'&&module.exports)module.exports=api;
if(!root?.document)return;
let plans=null,flight=null,actor='',generation=0;
const identity=()=>{try{return String(currentProfile?.id||currentUser?.id||'')}catch(_){return ''}};
function invalidate(){generation++;plans=null;actor='';}
async function load(force=false){
 const who=identity();if(!who)throw Error('Войдите в CRM');
 if(!force&&plans&&who===actor)return plans;
 if(flight)return flight;
 const epoch=generation;
 flight=(async()=>{
  const {data,error}=await db.rpc('client360_route_catalog_v3');
  if(error||!data?.ok||!Array.isArray(data.clients))throw error||Error('Не удалось загрузить торговые точки');
  if(who!==identity()||epoch!==generation)throw Error('Данные изменились. Повторите открытие списка.');
  plans=buildPlans(data.clients);actor=who;return plans;
 })().finally(()=>flight=null);
 return flight;
}
root.addEventListener('resanta-client360-updated',invalidate);
root.crmRouteCatalogV3={...api,load,invalidate,plans:()=>actor===identity()?plans:null,
 rowKeys:r=>rowKeys(r,actor===identity()?plans||[]:[]),
 uniqueDisplayRows:(rows,visited)=>uniqueDisplayRows(rows,actor===identity()?plans||[]:[],visited),
 find:key=>(actor===identity()?plans||[]:[]).find(p=>p.route_selection_key===String(key))};
})(typeof window==='undefined'?null:window);
