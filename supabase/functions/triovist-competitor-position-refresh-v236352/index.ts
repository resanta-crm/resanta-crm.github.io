import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const ALLOWED = new Set([
  "payushin_ar@resanta.ru",
  "sidarovich_kn@resanta.ru",
  "aleksandrenko_av@resanta.ru",
  "krishtal_na@resanta.ru"
]);
const ORIGINS=new Set(["https://resanta-crm.by","https://www.resanta-crm.by"]);
const HEADERS={
  "User-Agent":"ResantaCRM-21vekPositionWatch/1.0 (+https://resanta-crm.by)",
  "Accept":"application/json, text/plain, */*",
  "Content-Type":"application/json",
  "Origin":"https://www.21vek.by",
  "Referer":"https://www.21vek.by/"
};
const OWN=["resanta","ресанта","huter","вихрь","vikhr","eurolux"];
const s=(v:any)=>String(v??"").trim();
const cors=(req:Request)=>({
  "Access-Control-Allow-Origin":ORIGINS.has(req.headers.get("origin")||"")?(req.headers.get("origin")||""):"https://resanta-crm.by",
  "Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods":"POST, OPTIONS",
  "Vary":"Origin"
});
const reply=(req:Request,status:number,body:any)=>new Response(JSON.stringify(body),{status,headers:{...cors(req),"Content-Type":"application/json; charset=utf-8"}});
const norm=(v:any)=>s(v).toLowerCase().replace(/ё/g,"е").replace(/[^0-9a-zа-я./]+/g," ").replace(/\s+/g," ").trim();
const flatten=(obj:any,prefix=""):Array<[string,any]>=>{
  const out:Array<[string,any]>=[]; if(!obj)return out;
  if(Array.isArray(obj)){obj.forEach((v,i)=>out.push(...flatten(v,prefix+"["+i+"]")));return out}
  if(typeof obj==="object"){for(const [k,v] of Object.entries(obj)){const p=prefix?prefix+"."+k:k;if(v&&typeof v==="object")out.push(...flatten(v,p));else out.push([p,v])}return out}
  return out;
};
const itemName=(item:any)=>{
  for(const k of ["name","title","productName","fullName"])if(item?.[k])return s(item[k]);
  for(const [p,v] of flatten(item))if(typeof v==="string"&&(/\.(name|title)$/i.test(p))&&v.length>8)return v;
  return "";
};
const itemUrl=(item:any)=>{
  for(const [p,v] of flatten(item)){
    if(typeof v!=="string"||!/url|href|link/i.test(p)||!v.includes(".html"))continue;
    try{return new URL(v,"https://www.21vek.by/").toString()}catch(_){}
  }
  return "";
};
const searchNumber=(item:any,keys:string[])=>{
  const out:Array<[string,number]>=[];for(const [p,v] of flatten(item)){if(!keys.some(k=>p.toLowerCase().includes(k)))continue;const n=Number(String(v).replace(",","."));if(Number.isFinite(n))out.push([p,n])}
  out.sort((a,b)=>{const aa=/saleprice|currentprice|finalprice/i.test(a[0])?0:1,bb=/saleprice|currentprice|finalprice/i.test(b[0])?0:1;return aa-bb||a[0].length-b[0].length});
  return out[0]?.[1]??null;
};
const searchText=(item:any,keys:string[])=>{for(const [p,v] of flatten(item))if(typeof v==="string"&&keys.some(k=>p.toLowerCase().includes(k))&&v.trim())return v.trim();return ""};
const searchMeta=(item:any)=>{
  const brand=searchText(item,["producer.name","brand.name",".brand",".producer"]);
  const price=searchNumber(item,["saleprice","currentprice","finalprice",".price"]);
  const status=norm(searchText(item,[".status","availability","available"]));
  let stock:null|boolean=null;if(["in","available","true","в наличии"].includes(status))stock=true;else if(["out","false","нет в наличии","unavailable"].includes(status))stock=false;
  return {brand,price:price&&price>0?price:null,in_stock:stock,external_id:item?.id!=null?String(item.id):null};
};
const escRe=(v:string)=>v.replace(/[.*+?^$()|[\]\\]/g,"\\$&");
const isOwn=(item:any,name:string)=>{const blob=norm(name+" "+JSON.stringify(item));return OWN.some(b=>new RegExp("(^|\\s)"+escRe(b)+"(\\s|$)").test(blob))};
const sha1=async(v:string)=>{const b=new TextEncoder().encode(v),h=new Uint8Array(await crypto.subtle.digest("SHA-1",b));return [...h].map(x=>x.toString(16).padStart(2,"0")).join("")};
async function page(query:string,pageNo:number,searchId=""){
  const r=await fetch("https://gate.21vek.by/search-composer/api/v3/products",{method:"POST",headers:HEADERS,body:JSON.stringify({query,order:"default",page:pageNo,limit:60,mode:"desktop",searchId,filters:[]})});
  if(!r.ok)throw new Error("21vek HTTP "+r.status+": "+(await r.text()).slice(0,240));
  const d=await r.json();if(!Array.isArray(d?.products))throw new Error("21vek search response has no products");return d;
}
async function ranked(query:string){
  const d1=await page(query,1,""),sid=s(d1?.searchId),d2=await page(query,2,sid),found=new Map<string,any>();
  for(const pair of [[1,d1],[2,d2]] as any[]){
    const pageNo=pair[0],data=pair[1];
    for(let i=0;i<data.products.length;i++){
      const item=data.products[i],name=itemName(item),meta=searchMeta(item),url=itemUrl(item);
      const key=meta.external_id||await sha1(url||(query+"|"+name+"|"+pageNo+"|"+i));
      if(isOwn(item,name)||found.has(key))continue;
      found.set(key,{product_key:key,search_query:query,external_id:meta.external_id,brand:meta.brand,model:name,product_url:url,position:(pageNo-1)*60+i+1,page_no:pageNo,current_price:meta.price,in_stock:meta.in_stock});
    }
  } return found;
}
function move(old:any,state:string,pos:number|null,observed:string){
  if(!old)return{movement:"new",delta:null,changed_at:observed};
  const os=s(old.listing_state),op=old.position==null?null:Number(old.position);
  const same=os===state&&(state==="outside_top120"||(state==="top120"&&op===pos));
  if(same)return{movement:state==="top120"?"same":"outside",delta:state==="top120"?0:null,changed_at:old.changed_at||observed};
  if(os==="outside_top120"&&state==="top120")return{movement:"entered",delta:null,changed_at:observed};
  if(os==="top120"&&state==="outside_top120")return{movement:"exited",delta:null,changed_at:observed};
  if(os==="top120"&&state==="top120"&&op!=null&&pos!=null){const d=op-pos;return{movement:d>0?"up":d<0?"down":"same",delta:d,changed_at:d?observed:(old.changed_at||observed)}}
  return{movement:"outside",delta:null,changed_at:old.changed_at||observed};
}

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:cors(req)});
  if(req.method!=="POST")return reply(req,405,{ok:false,error:"METHOD_NOT_ALLOWED"});
  try{
    const url=Deno.env.get("SUPABASE_URL"),key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if(!url||!key)return reply(req,500,{ok:false,error:"SERVER_CONFIG_MISSING"});
    const token=(req.headers.get("authorization")||"").replace(/^Bearer\s+/i,"").trim();
    if(!token)return reply(req,401,{ok:false,error:"AUTH_REQUIRED"});
    const admin=createClient(url,key,{auth:{autoRefreshToken:false,persistSession:false}});
    const {data:au,error:ae}=await admin.auth.getUser(token);if(ae||!au?.user)return reply(req,401,{ok:false,error:"AUTH_INVALID"});
    const email=s(au.user.email).toLowerCase();if(!ALLOWED.has(email))return reply(req,403,{ok:false,error:"ACCESS_DENIED"});
    const body=await req.json().catch(()=>({})),scope=s(body?.scope_key);if(!scope)return reply(req,400,{ok:false,error:"SCOPE_REQUIRED"});

    const {data:recent}=await admin.from("triovist_market_comp_position_current_v236352").select("last_attempt_at").eq("scope_key",scope).order("last_attempt_at",{ascending:false}).limit(1).maybeSingle();
    if(recent?.last_attempt_at&&Date.now()-new Date(recent.last_attempt_at).getTime()<120000&&!body?.force){
      return reply(req,200,{ok:true,skipped:true,message:"Эта категория уже проверялась менее 2 минут назад.",last_attempt_at:recent.last_attempt_at});
    }

    const [{data:sc,error:se},{data:tracked,error:te},{data:current,error:ce}]=await Promise.all([
      admin.from("triovist_market_scopes_v1").select("scope_key,search_query,source_subgroup,enabled").eq("scope_key",scope).eq("enabled",true).maybeSingle(),
      admin.from("triovist_market_products_current_v1").select("scope_key,product_key,search_query,external_id,brand,model,product_url,current_price,in_stock").eq("scope_key",scope),
      admin.from("triovist_market_comp_position_current_v236352").select("*").eq("scope_key",scope)
    ]);
    if(se)throw se;if(te)throw te;if(ce)throw ce;if(!sc)return reply(req,404,{ok:false,error:"SCOPE_NOT_FOUND"});
    if(!tracked?.length)return reply(req,400,{ok:false,error:"NO_TRACKED_COMPETITORS"});

    const {data:run,error:re}=await admin.from("triovist_market_position_watch_runs_v236352").insert({source:"manual",status:"running",scope_count:1,tracked_count:tracked.length,notes:{version:"edge-v23.6.352",scope_key:scope,user:email}}).select("id").single();
    if(re)throw re;
    const runId=run.id,oldMap=new Map((current||[]).map((x:any)=>[s(x.product_key),x])),groups=new Map<string,any[]>();
    for(const x of tracked){const q=s(x.search_query)||s(sc.search_query);if(!groups.has(q))groups.set(q,[]);groups.get(q)!.push(x)}
    let success=0,errors=0,queries=0;const notes:any[]=[];
    for(const [query,items] of groups){
      queries++;const observed=new Date().toISOString();
      try{
        const found=await ranked(query),cur:any[]=[],snaps:any[]=[];
        for(const tr of items){
          const pk=s(tr.product_key),hit=found.get(pk),old=oldMap.get(pk),state=hit?"top120":"outside_top120",pos=hit?Number(hit.position):null,mv=move(old,state,pos,observed);
          const row={scope_key:scope,product_key:pk,search_query:query,brand:hit?.brand||tr.brand||old?.brand||null,model:hit?.model||tr.model||old?.model||null,product_url:hit?.product_url||tr.product_url||old?.product_url||null,external_id:hit?.external_id||tr.external_id||old?.external_id||null,position:pos,page_no:hit?.page_no||null,listing_state:state,current_price:hit?.current_price??null,in_stock:hit?.in_stock??null,observed_at:observed,previous_position:old?.position??null,previous_state:old?.listing_state??null,previous_observed_at:old?.observed_at??null,position_delta:mv.delta,movement:mv.movement,changed_at:mv.changed_at,last_attempt_at:observed,last_attempt_status:"success",last_error:null,run_id:runId,updated_at:observed};
          cur.push(row);oldMap.set(pk,row);snaps.push({run_id:runId,scope_key:scope,product_key:pk,search_query:query,brand:row.brand,model:row.model,product_url:row.product_url,external_id:row.external_id,position:pos,page_no:row.page_no,listing_state:state,current_price:row.current_price,in_stock:row.in_stock,observed_at:observed,attempt_status:"success",error_text:null,source:"manual"});
        }
        const {error:ue}=await admin.from("triovist_market_comp_position_current_v236352").upsert(cur,{onConflict:"scope_key,product_key"});if(ue)throw ue;
        const {error:ie}=await admin.from("triovist_market_comp_position_snapshots_v236352").insert(snaps);if(ie)throw ie;
        success+=snaps.length;notes.push({query,tracked:items.length,found:items.filter((x:any)=>found.has(s(x.product_key))).length,status:"ok"});
      }catch(e){
        const msg=e instanceof Error?e.message:String(e),cur:any[]=[],snaps:any[]=[];
        for(const tr of items){const pk=s(tr.product_key),old=oldMap.get(pk);if(old)cur.push({...old,last_attempt_at:observed,last_attempt_status:"error",last_error:msg.slice(0,1200),updated_at:observed});snaps.push({run_id:runId,scope_key:scope,product_key:pk,search_query:query,brand:tr.brand,model:tr.model,product_url:tr.product_url,external_id:tr.external_id,position:null,page_no:null,listing_state:null,current_price:null,in_stock:null,observed_at:observed,attempt_status:"error",error_text:msg.slice(0,1200),source:"manual"})}
        if(cur.length){const {error:ue}=await admin.from("triovist_market_comp_position_current_v236352").upsert(cur,{onConflict:"scope_key,product_key"});if(ue)console.error("current error state",ue)}
        const {error:ie}=await admin.from("triovist_market_comp_position_snapshots_v236352").insert(snaps);if(ie)console.error("snapshot error state",ie);
        errors+=snaps.length;notes.push({query,tracked:items.length,status:"error",error:msg.slice(0,300)});
      }
    }
    const status=errors===0?"complete":success?"partial":"failed";
    await admin.from("triovist_market_position_watch_runs_v236352").update({status,query_count:queries,success_count:success,error_count:errors,finished_at:new Date().toISOString(),notes:{version:"edge-v23.6.352",scope_key:scope,user:email,queries:notes,fresh_requests_only:true}}).eq("id",runId);
    return reply(req,status==="failed"?502:200,{ok:status!=="failed",status,scope_key:scope,success_count:success,error_count:errors,queries:notes});
  }catch(e){
    console.error("COMPETITOR_POSITION_REFRESH_FAILED",e instanceof Error?e.message:String(e));
    return reply(req,500,{ok:false,error:"POSITION_REFRESH_FAILED",message:e instanceof Error?e.message:String(e)});
  }
});