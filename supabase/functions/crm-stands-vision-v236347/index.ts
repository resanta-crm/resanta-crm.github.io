import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const ORIGINS = new Set(["https://resanta-crm.by","https://www.resanta-crm.by"]);
const cors=(req:Request)=>({
  "Access-Control-Allow-Origin":ORIGINS.has(req.headers.get("origin")||"")?(req.headers.get("origin")||""):"https://resanta-crm.by",
  "Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods":"POST, OPTIONS",
  "Vary":"Origin"
});
const reply=(req:Request,status:number,body:any)=>new Response(JSON.stringify(body),{status,headers:{...cors(req),"Content-Type":"application/json; charset=utf-8"}});
const s=(v:any)=>String(v??"").trim();
const sku=(v:any)=>s(v).replace(/\s+/g,"");
const clamp=(v:any)=>{const n=Number(v);return Number.isFinite(n)?Math.max(0,Math.min(100,Math.round(n))):0};
const list=(v:any)=>Array.isArray(v)?[...new Set(v.map(s).filter(Boolean))]:[];

function b64(bytes:Uint8Array){
  let out=""; const n=0x8000;
  for(let i=0;i<bytes.length;i+=n) out+=String.fromCharCode(...bytes.subarray(i,i+n));
  return btoa(out);
}
function balancedObject(x:string){
  const start=x.indexOf("{");if(start<0)return "";
  let depth=0,inString=false,escaped=false;
  for(let i=start;i<x.length;i++){
    const ch=x[i];
    if(inString){
      if(escaped){escaped=false;continue}
      if(ch==="\\"){escaped=true;continue}
      if(ch==='"')inString=false;
      continue;
    }
    if(ch==='"'){inString=true;continue}
    if(ch==="{")depth++;
    else if(ch==="}"){
      depth--;
      if(depth===0)return x.slice(start,i+1);
    }
  }
  return "";
}
function cleanJsonCandidate(v:string){
  return s(v)
    .replace(/^\uFEFF/,"")
    .replace(/\u200B/g,"")
    .replace(/^\x60\x60\x60(?:json)?\s*/i,"")
    .replace(/\s*\x60\x60\x60$/i,"")
    .replace(/,\s*([}\]])/g,"$1")
    .trim();
}
function jsonText(v:string){
  const x=s(v),candidates:string[]=[];
  const push=(z:string)=>{const q=cleanJsonCandidate(z);if(q&&!candidates.includes(q))candidates.push(q)};
  push(x);
  for(const m of x.matchAll(/\x60\x60\x60(?:json)?\s*([\s\S]*?)\x60\x60\x60/gi))push(m[1]||"");
  push(balancedObject(x));
  for(const candidate of candidates){
    try{return JSON.parse(candidate)}catch(_){}
  }
  throw new Error("VISION_JSON_INVALID");
}
async function fetchWithTimeout(url:string,init:RequestInit,ms=55000){
  const ctl=new AbortController();
  const timer=setTimeout(()=>ctl.abort(),ms);
  try{return await fetch(url,{...init,signal:ctl.signal})}
  finally{clearTimeout(timer)}
}
const VISION_SCHEMA={
  type:"object",
  additionalProperties:false,
  properties:{
    stand_present:{type:"boolean"},
    stand_brand_detected:{type:"string"},
    photo_quality_score:{type:"integer",minimum:0,maximum:100},
    quality_issues:{type:"array",items:{type:"string"},maxItems:20},
    fill_pct:{type:"integer",minimum:0,maximum:100},
    own_brand_share_pct:{type:"integer",minimum:0,maximum:100},
    foreign_brand_share_pct:{type:"integer",minimum:0,maximum:100},
    visible_product_count_estimate:{type:"integer",minimum:0,maximum:500},
    recognized_text:{type:"array",items:{type:"string"},maxItems:30},
    matched_products:{
      type:"array",maxItems:30,
      items:{
        type:"object",additionalProperties:false,
        properties:{sku:{type:"string"},product:{type:"string"},confidence:{type:"number",minimum:0,maximum:1},evidence:{type:"string"}},
        required:["sku","product","confidence","evidence"]
      }
    },
    manager_sku_findings:{
      type:"array",maxItems:100,
      items:{
        type:"object",additionalProperties:false,
        properties:{sku:{type:"string"},status:{type:"string",enum:["seen","not_seen","uncertain"]},confidence:{type:"number",minimum:0,maximum:1},evidence:{type:"string"}},
        required:["sku","status","confidence","evidence"]
      }
    },
    issues:{type:"array",items:{type:"string"},maxItems:30},
    summary:{type:"string"}
  },
  required:["stand_present","stand_brand_detected","photo_quality_score","quality_issues","fill_pct","own_brand_share_pct","foreign_brand_share_pct","visible_product_count_estimate","recognized_text","matched_products","manager_sku_findings","issues","summary"]
};
function month12(){
  const d=new Date(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth()-11);
  return d.toISOString().slice(0,10);
}

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS") return new Response("ok",{headers:cors(req)});
  if(req.method!=="POST") return reply(req,405,{ok:false,error:"METHOD_NOT_ALLOWED"});
  const started=Date.now();

  try{
    const url=Deno.env.get("SUPABASE_URL");
    const serviceKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const anthropicKey=Deno.env.get("ANTHROPIC_API_KEY");
    const openaiKey=Deno.env.get("OPENAI_API_KEY");
    if(!url||!serviceKey) return reply(req,500,{ok:false,error:"SUPABASE_SERVER_CONFIG_MISSING"});
    if(!anthropicKey&&!openaiKey){
      console.error("STAND_VISION_NOT_CONFIGURED","No ANTHROPIC_API_KEY or OPENAI_API_KEY");
      return reply(req,503,{ok:false,error:"VISION_NOT_CONFIGURED",message:"Vision временно не настроен на сервере: отсутствует AI-ключ."});
    }

    const token=(req.headers.get("authorization")||"").replace(/^Bearer\s+/i,"").trim();
    if(!token) return reply(req,401,{ok:false,error:"AUTH_REQUIRED"});

    const admin=createClient(url,serviceKey,{auth:{autoRefreshToken:false,persistSession:false}});
    const {data:authData,error:authError}=await admin.auth.getUser(token);
    if(authError||!authData?.user?.id) return reply(req,401,{ok:false,error:"AUTH_INVALID"});

    const payload=await req.json().catch(()=>({}));
    const placementId=s(payload?.placement_id), force=payload?.force===true;
    if(!placementId) return reply(req,400,{ok:false,error:"PLACEMENT_REQUIRED"});

    const uid=authData.user.id;
    const [{data:u,error:ue},{data:rr,error:re}]=await Promise.all([
      admin.from("users").select("id,name,email,role").eq("id",uid).maybeSingle(),
      admin.from("stand_roles_v236346").select("stand_role").eq("user_id",uid).maybeSingle()
    ]);
    if(ue)throw ue;if(re)throw re;if(!u)return reply(req,403,{ok:false,error:"CRM_PROFILE_MISSING"});
    const standRole=s(rr?.stand_role)||(u.role==="manager"?"manager":"other");

    const {data:p,error:pe}=await admin.from("stand_placements_v236346")
      .select("id,asset_type_id,request_id,client_id,client_name,manager_name,address,installation_photo_path,last_control_photo_path")
      .eq("id",placementId).maybeSingle();
    if(pe)throw pe;if(!p)return reply(req,404,{ok:false,error:"PLACEMENT_NOT_FOUND"});
    const own=s(p.manager_name).toLowerCase()===s(u.name).toLowerCase();
    if(!(standRole==="df"||standRole==="dfs"||(standRole==="manager"&&own)))return reply(req,403,{ok:false,error:"ACCESS_DENIED"});

    const [{data:t,error:te},{data:r,error:rqe},{data:items,error:ie},{data:photo,error:phe}]=await Promise.all([
      admin.from("stand_asset_types_v236346").select("id,name,brand,target_categories").eq("id",p.asset_type_id).maybeSingle(),
      p.request_id?admin.from("stand_requests_v236346").select("id,selected_categories").eq("id",p.request_id).maybeSingle():Promise.resolve({data:null,error:null} as any),
      admin.from("stand_placement_items_v236346").select("sku,product_name").eq("placement_id",placementId),
      admin.from("stand_photos_v236346").select("id,storage_path,stage,captured_at").eq("placement_id",placementId)
        .in("stage",["install","control"]).order("captured_at",{ascending:false}).limit(1).maybeSingle()
    ]);
    if(te)throw te;if(rqe)throw rqe;if(ie)throw ie;if(phe)throw phe;if(!t)return reply(req,400,{ok:false,error:"ASSET_TYPE_MISSING"});

    const path=s(photo?.storage_path||p.last_control_photo_path||p.installation_photo_path);
    const stage=photo?.stage==="control"?"control":"install";
    if(!path)return reply(req,400,{ok:false,error:"PHOTO_REQUIRED",message:"Для Vision нужен реальный снимок из CRM."});

    if(!force){
      const {data:cached,error:ce}=await admin.from("stand_vision_checks_v236347").select("*")
        .eq("placement_id",placementId).eq("storage_path",path).eq("status","completed")
        .order("created_at",{ascending:false}).limit(1).maybeSingle();
      if(ce)throw ce;if(cached)return reply(req,200,{ok:true,cached:true,result:cached});
    }

    const managerSkus=list((items||[]).map((x:any)=>x.sku)).map(sku);
    const categories=list(Array.isArray(r?.selected_categories)&&r.selected_categories.length?r.selected_categories:t.target_categories);
    const brand=s(t.brand);

    let hq=admin.from("purchase_history").select("sku,product,revenue,qty,month,category,subgroup")
      .eq("client_id",p.client_id).gte("month",month12()).limit(1500);
    if(brand)hq=hq.ilike("product","%"+brand+"%");
    if(categories.length)hq=hq.in("category",categories);
    const {data:hist,error:he}=await hq;if(he)throw he;

    const ag=new Map<string,any>();
    for(const row of hist||[]){
      const k=sku((row as any).sku);if(!k)continue;
      const z=ag.get(k)||{sku:k,product:s((row as any).product),revenue:0,qty:0};
      z.revenue+=Number((row as any).revenue||0);z.qty+=Number((row as any).qty||0);ag.set(k,z);
    }
    for(const x of items||[]){
      const k=sku((x as any).sku);if(k&&!ag.has(k))ag.set(k,{sku:k,product:s((x as any).product_name),revenue:0,qty:0});
    }
    const candidates=[...ag.values()].sort((a,b)=>b.revenue-a.revenue).slice(0,100);
    const managerCatalog=managerSkus.map(k=>({sku:k,product:ag.get(k)?.product||""}));

    let dl=await admin.storage.from("stand-files").download(path,{transform:{width:1600,quality:78,resize:"contain"}} as any,{cache:"no-store"} as any);
    if(dl.error||!dl.data)dl=await admin.storage.from("stand-files").download(path,{}, {cache:"no-store"} as any);
    if(dl.error||!dl.data)throw dl.error||new Error("PHOTO_DOWNLOAD_FAILED");
    const bytes=new Uint8Array(await dl.data.arrayBuffer());
    if(bytes.byteLength>5500000)return reply(req,413,{ok:false,error:"PHOTO_TOO_LARGE_FOR_VISION",message:"Фото слишком большое. Загрузите JPEG/PNG меньшего размера."});

    let media=s(dl.data.type).toLowerCase();
    if(!["image/jpeg","image/png","image/webp","image/gif"].includes(media)){
      const q=path.toLowerCase();
      media=/\.jpe?g$/.test(q)?"image/jpeg":/\.png$/.test(q)?"image/png":/\.webp$/.test(q)?"image/webp":/\.gif$/.test(q)?"image/gif":"";
    }
    if(!media)return reply(req,415,{ok:false,error:"PHOTO_FORMAT_UNSUPPORTED",message:"Vision принимает JPEG, PNG, WEBP или GIF. HEIC лучше переснять/загрузить как JPEG."});

    const prompt=[
      "Ты контролёр торгового оборудования ГК Ресанта. Анализируй только то, что реально видно на фото.",
      "Не выдумывай SKU. Точный SKU разрешено выбирать только из candidate_catalog и только при достаточном визуальном подтверждении.",
      "Если товар закрыт, размыт или надпись не читается — uncertain. not_seen ставь только когда зона хорошо видна и товар явно отсутствует.",
      "Оцени заполненность полезной площади стенда, долю целевого бренда, долю чужих брендов, качество фото и видимые надписи.",
      "Сверь manager_skus с фотографией.",
      "matched_products: максимум 30 наиболее уверенных позиций. recognized_text и issues: только полезные наблюдения без повторов.",
      "Ответ должен строго соответствовать указанной JSON-схеме. Никакого markdown, пояснений до/после JSON и незавершённых полей.",
      "target_stand: "+JSON.stringify({type:t.name,brand,categories}),
      "client: "+JSON.stringify({name:p.client_name,address:p.address}),
      "manager_skus: "+JSON.stringify(managerCatalog),
      "candidate_catalog: "+JSON.stringify(candidates),
      "schema: "+JSON.stringify({
        stand_present:true,stand_brand_detected:"",photo_quality_score:0,quality_issues:[""],
        fill_pct:0,own_brand_share_pct:0,foreign_brand_share_pct:0,visible_product_count_estimate:0,
        recognized_text:[""],matched_products:[{sku:"",product:"",confidence:0,evidence:""}],
        manager_sku_findings:[{sku:"",status:"seen|not_seen|uncertain",confidence:0,evidence:""}],
        issues:[""],summary:""
      })
    ].join("\n");

    let raw:any;
    let provider="anthropic";
    let providerModel="claude-sonnet-4-6";
    let providerUsage:any=null;

    if(anthropicKey){
      const ar=await fetchWithTimeout("https://api.anthropic.com/v1/messages",{
        method:"POST",
        headers:{"Content-Type":"application/json","x-api-key":anthropicKey,"anthropic-version":"2023-06-01"},
        body:JSON.stringify({
          model:"claude-sonnet-4-6",max_tokens:2600,temperature:0,
          system:"Ты точный аудитор торговой выкладки. При сомнении не угадывай.",
          messages:[{role:"user",content:[
            {type:"image",source:{type:"base64",media_type:media,data:b64(bytes)}},
            {type:"text",text:prompt}
          ]}]
        })
      });
      const ad=await ar.json().catch(()=>({}));
      if(!ar.ok){
        console.error("STAND_VISION_PROVIDER","anthropic",ar.status,JSON.stringify(ad).slice(0,1000));
        return reply(req,502,{ok:false,error:"VISION_PROVIDER_ERROR",message:s((ad as any)?.error?.message)||("Anthropic HTTP "+ar.status)});
      }
      const txt=Array.isArray((ad as any)?.content)?(ad as any).content.filter((x:any)=>x?.type==="text").map((x:any)=>s(x.text)).join("\n"):"";
      try{raw=jsonText(txt)}
      catch(_){
        console.error("STAND_VISION_JSON_INVALID","provider=anthropic","model="+providerModel,"chars="+txt.length,"stop_reason="+s((ad as any)?.stop_reason));
        return reply(req,502,{ok:false,error:"VISION_JSON_INVALID",message:"Vision получил неполный или некорректный ответ модели. Повторите анализ — фото уже сохранено."});
      }
      providerUsage=(ad as any)?.usage||null;
    }else{
      provider="openai";
      providerModel="gpt-5.6";
      const or=await fetchWithTimeout("https://api.openai.com/v1/responses",{
        method:"POST",
        headers:{"Content-Type":"application/json","Authorization":"Bearer "+openaiKey},
        body:JSON.stringify({
          model:providerModel,
          instructions:"Ты точный аудитор торговой выкладки. При сомнении не угадывай. Ответ только JSON без markdown.",
          max_output_tokens:2600,
          reasoning:{effort:"low"},
          store:false,
          text:{format:{type:"json_schema",name:"stand_vision_audit",strict:true,schema:VISION_SCHEMA}},
          input:[{role:"user",content:[
            {type:"input_text",text:prompt},
            {type:"input_image",image_url:"data:"+media+";base64,"+b64(bytes),detail:"high"}
          ]}]
        })
      });
      const od=await or.json().catch(()=>({}));
      if(!or.ok){
        console.error("STAND_VISION_PROVIDER","openai",or.status,JSON.stringify(od).slice(0,1000));
        return reply(req,502,{ok:false,error:"VISION_PROVIDER_ERROR",message:s((od as any)?.error?.message)||("OpenAI HTTP "+or.status)});
      }
      const txt=Array.isArray((od as any)?.output)
        ?(od as any).output.flatMap((x:any)=>Array.isArray(x?.content)?x.content:[]).filter((x:any)=>x?.type==="output_text").map((x:any)=>s(x.text)).join("\n")
        :s((od as any)?.output_text);
      try{raw=jsonText(txt)}
      catch(_){
        console.error("STAND_VISION_JSON_INVALID","provider=openai","model="+providerModel,"chars="+txt.length,"status="+s((od as any)?.status),"incomplete="+JSON.stringify((od as any)?.incomplete_details||null));
        return reply(req,502,{ok:false,error:"VISION_JSON_INVALID",message:"Vision получил неполный или некорректный ответ модели. Повторите анализ — фото уже сохранено."});
      }
      providerUsage=(od as any)?.usage||null;
    }

    const quality=clamp(raw?.photo_quality_score),fill=clamp(raw?.fill_pct),ownBrand=clamp(raw?.own_brand_share_pct),foreignBrand=clamp(raw?.foreign_brand_share_pct);
    const standPresent=raw?.stand_present===true;
    const candidateSet=new Set(candidates.map((x:any)=>sku(x.sku)));
    const managerSet=new Set(managerSkus);
    const products=(Array.isArray(raw?.matched_products)?raw.matched_products:[]).map((x:any)=>{
      const k=sku(x?.sku),conf=Math.max(0,Math.min(1,Number(x?.confidence||0)));
      return {sku:candidateSet.has(k)&&conf>=0.65?k:"",product:s(x?.product).slice(0,220),confidence:Math.round(conf*100)/100,evidence:s(x?.evidence).slice(0,400)};
    }).filter((x:any)=>x.sku||x.product).slice(0,80);

    const fm=new Map<string,any>();
    for(const k of managerSkus)fm.set(k,{sku:k,status:"uncertain",confidence:0,evidence:"Недостаточно данных Vision."});
    for(const x of Array.isArray(raw?.manager_sku_findings)?raw.manager_sku_findings:[]){
      const k=sku((x as any)?.sku);if(!managerSet.has(k))continue;
      const conf=Math.max(0,Math.min(1,Number((x as any)?.confidence||0)));
      const st=["seen","not_seen","uncertain"].includes(s((x as any)?.status))?s((x as any)?.status):"uncertain";
      fm.set(k,{sku:k,status:conf>=0.55?st:"uncertain",confidence:Math.round(conf*100)/100,evidence:s((x as any)?.evidence).slice(0,400)});
    }
    const findings=[...fm.values()];
    const seen=findings.filter((x:any)=>x.status==="seen"&&x.confidence>=0.6).map((x:any)=>x.sku);
    const productMatches=products.filter((x:any)=>x.sku&&x.confidence>=0.7).map((x:any)=>x.sku);
    const matched=[...new Set([...seen,...productMatches])];
    const notSeen=findings.filter((x:any)=>x.status==="not_seen"&&x.confidence>=0.65).map((x:any)=>x.sku);
    const extra=matched.filter(k=>!managerSet.has(k));
    const matchPct=managerSkus.length?Math.round(seen.length/managerSkus.length*100):null;

    let vstatus="ok";
    if(quality<45)vstatus="bad_photo";
    else if(!standPresent||!managerSkus.length||fill<60||ownBrand<65||foreignBrand>25||(matchPct!==null&&matchPct<50))vstatus="review";

    const issues=[...new Set([...list(raw?.issues),...list(raw?.quality_issues)])].slice(0,30);
    const summary=[
      s(raw?.summary),
      "Заполнение ≈ "+fill+"%.",
      brand?(brand+" ≈ "+ownBrand+"% видимой выкладки."):"",
      foreignBrand?("Чужие бренды ≈ "+foreignBrand+"%."):"",
      matchPct!==null?("Vision подтвердил "+matchPct+"% SKU из списка менеджера."):"Список SKU менеджера пуст — сверка невозможна.",
      notSeen.length?("Не подтверждены на хорошо видимой зоне: "+notSeen.join(", ")+"."):"",
      extra.length?("На фото найдены кандидаты вне списка менеджера: "+extra.join(", ")+"."):""
    ].filter(Boolean).join(" ").slice(0,1800);

    const row={
      placement_id:placementId,photo_id:photo?.id||null,storage_path:path,stage,model:providerModel,status:"completed",
      stand_present:standPresent,stand_brand_detected:s(raw?.stand_brand_detected).slice(0,120)||null,
      photo_quality_score:quality,fill_pct:fill,own_brand_share_pct:ownBrand,foreign_brand_share_pct:foreignBrand,
      visible_product_count_estimate:Math.max(0,Math.min(500,Math.round(Number(raw?.visible_product_count_estimate||0)))),
      recognized_text:list(raw?.recognized_text).slice(0,40),matched_products:products,manager_skus:managerSkus,matched_skus:matched,
      manager_only_skus:notSeen,vision_only_skus:extra,match_pct:matchPct,issues,summary,
      latency_ms:Date.now()-started,input_bytes:bytes.byteLength,created_by:u.id,created_by_name:u.name
    };
    const {data:check,error:inse}=await admin.from("stand_vision_checks_v236347").insert(row).select("*").single();
    if(inse)throw inse;

    const {error:upe}=await admin.from("stand_placements_v236346").update({
      vision_status:vstatus,vision_fill_pct:fill,vision_own_brand_pct:ownBrand,vision_quality_score:quality,
      vision_match_pct:matchPct,vision_summary:summary,vision_checked_at:new Date().toISOString(),vision_photo_path:path
    }).eq("id",placementId);
    if(upe)throw upe;

    let taskInfo:any=null;
    const {data:taskData,error:taskError}=await admin.rpc("crm_stands_vision_task_apply_v236367",{
      p_placement_id:placementId,
      p_vision_check_id:check.id
    });
    if(taskError)console.warn("STAND_VISION_TASK_WARNING",taskError.message);
    else taskInfo=taskData;

    const internal={
      version:"v23.6.367",provider,model:providerModel,placement_id:placementId,photo_id:photo?.id||null,
      stand_type:t.name,target_brand:brand,target_categories:categories,manager_skus:managerSkus,candidate_catalog_count:candidates.length,
      parsed_result:raw,normalized:{vision_status:vstatus,quality,fill,own_brand_pct:ownBrand,foreign_brand_pct:foreignBrand,matched_skus:matched,manager_not_seen_skus:notSeen,vision_only_skus:extra,match_pct:matchPct},
      usage:providerUsage,latency_ms:Date.now()-started,
      rule:"Exact SKU accepted only from server candidate catalog with visual confidence; uncertainty is preserved."
    };
    const {error:ae}=await admin.from("stand_ai_internal_v236346").insert({entity_type:"vision",entity_id:placementId,engine_version:"v23.6.347",internal_logic:internal});
    if(ae)console.warn("STAND_VISION_AUDIT_WARNING",ae.message);

    return reply(req,200,{ok:true,cached:false,vision_status:vstatus,result:check,manager_findings:findings,task:taskInfo});
  }catch(e){
    const msg=e instanceof Error?e.message:String(e);
    const timedOut=(e as any)?.name==="AbortError"||msg.toLowerCase().includes("aborted");
    console.error(timedOut?"STAND_VISION_TIMEOUT":"STAND_VISION_FAILED",msg);
    return reply(req,timedOut?504:500,{
      ok:false,
      error:timedOut?"VISION_TIMEOUT":"VISION_FAILED",
      message:timedOut?"Vision не успел завершить анализ за 55 секунд. Фото сохранено — можно повторить анализ.":msg
    });
  }
});