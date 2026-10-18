/* Resanta Triovist premium infographic V2 PILOT.
 * Never modifies legacy batches. One explicitly launched SKU; hard cap eight image API calls.
 */
import {createClient} from "npm:@supabase/supabase-js@2.57.4";
const allow=new Set(["https://resanta-crm.by","https://www.resanta-crm.by"]);
const leadership=new Set(["payushin_ar@resanta.ru","sidarovich_kn@resanta.ru"]);
const managers=new Set(["aleksandrenko_av@resanta.ru","krishtal_na@resanta.ru"]);
const arr=(x:any):any[]=>Array.isArray(x)?x:[];
const str=(x:any,n=150)=>String(x??"").trim().slice(0,n);
const low=(x:any)=>str(x).toLowerCase();
const uuid=(s:any)=>/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(str(s,80));
const make=(req:Request,status:number,body:any)=>new Response(JSON.stringify(body),{status,headers:{
"content-type":"application/json; charset=utf-8",
"access-control-allow-origin":allow.has(req.headers.get("origin")||"")?req.headers.get("origin")!:"https://resanta-crm.by",
"access-control-allow-headers":"authorization, apikey, content-type, x-client-info",
"access-control-allow-methods":"POST, OPTIONS","vary":"Origin"}});
const model="gpt-image-2.5-sunburst";
const keys=["hero","main_benefit","second_benefit","ergonomics","construction","functions","kit","use_cases"];
const templates=[
 {name:"Обложка",scene:"Hero photography: full product dominates, dramatic focused studio lighting and visual depth, strong negative space in upper left for typography, category-themed environmental styling.",position:"right"},
 {name:"Главное преимущество",scene:"Distinct action-oriented product demonstration showing the key verified capability in a realistic context. The original exact product remains identifiable; spacious top margin for a massive numeric headline.",position:"lower-right"},
 {name:"Важная функция",scene:"A different editorial macro/feature composition focusing on the verified second advantage, with tasteful illustrated environmental cues, dark-to-light contrast, no recycled hero layout.",position:"center"},
 {name:"Удобство работы",scene:"Wide functional lifestyle photography emphasizing confirmed ergonomics or handling; leave a balanced text panel on right, avoid repeating previous product placement.",position:"left"},
 {name:"Конструкция",scene:"Technical product studio close-up of an external, VISIBLY VERIFIED part of this exact product. Never invent cutaway, internal mechanisms, material or exploded view if no source image exists.",position:"center"},
 {name:"Возможности",scene:"Functional split-scene editorial poster illustrating one safely verified operating mode or application. Fresh composition and lighting, no exaggerated features.",position:"left"},
 {name:"Комплектация",scene:"Clean premium flat-lay catalog arrangement of ONLY physically verified components from reference images. If components are not verified, instead show whole actual product from another angle, without invented accessories.",position:"center"},
 {name:"Где использовать",scene:"Cinematic realistic product-in-context final scene based only on verified intended purpose; use an inviting but truthful real world context. Large product with reserved text area.",position:"right"}
];
const factMap:Record<string,string>={power_w:"Мощность",input_power_w:"Потребляемая мощность",power_kw:"Мощность",tank_l:"Объём бака",drum_l:"Объём барабана",drum_volume_l:"Объём барабана",
flow_lmin:"Производительность",max_head_m:"Максимальный напор",voltage_v:"Напряжение",crown_material:"Материал венца",
battery_ah:"Ёмкость АКБ",torque_nm:"Крутящий момент",area_m2:"Площадь",disc_diameter_mm:"Диаметр диска"};
const normalizedWords:Record<string,string>={cast_iron:"чугун",polyamide:"полиамид",steel:"сталь",metal:"металл",plastic:"пластик",aluminium:"алюминий",aluminum:"алюминий",stainless_steel:"нержавеющая сталь"};
const suffix:Record<string,string>={power_w:" Вт",input_power_w:" Вт",power_kw:" кВт",tank_l:" л",drum_l:" л",drum_volume_l:" л",flow_lmin:" л/мин",max_head_m:" м",voltage_v:" В",battery_ah:" А·ч",torque_nm:" Н·м",area_m2:" м²",disc_diameter_mm:" мм"};
const sourceFacts=(spec:any,live:any[])=>{
 const facts:any[]=[];
 const raw=spec?.specs_normalized||{};
 if(raw&&typeof raw==="object"&&!Array.isArray(raw)){
 for(const [key,val] of Object.entries(raw)){
   if(facts.length>=25)break;
   if(val===null||val===false||val===""||Array.isArray(val)||typeof val==="object")continue;
   if(typeof val==="number"&&(!Number.isFinite(val)||val<=0))continue;
   const label=factMap[key]||key.replace(/_/g," ");
   const value=val===true?"есть":(normalizedWords[String(val).toLowerCase()]||String(val)+(typeof val==="number"?(suffix[key]||""):""));
   facts.push({id:"F"+(facts.length+1),key,label:str(label,72),value:str(value,72),source:"21vek exact SKU specifications",observed_at:spec?.specs_fetched_at||null});
 }}
 // Live facts from matched exact public 21vek product get precedence only when specification absent.
 for(const f of arr(live).slice(0,24)){
  const label=str(f?.label,70),value=str(f?.value,90);
  if(label&&value&&!facts.some(x=>low(x.label)===low(label))&&facts.length<30)
   facts.push({id:"F"+(facts.length+1),key:"live",label,value,source:"Verified live 21vek product attributes",observed_at:new Date().toISOString()});
 }
 return facts;
};
function parseJson(s:string){s=str(s,55000).replace(/^`{3}(?:json)?\s*/i,"").replace(/\s*`{3}$/i,"");try{return JSON.parse(s)}catch(_){const a=s.indexOf("{"),b=s.lastIndexOf("}");if(a>=0&&b>a)return JSON.parse(s.slice(a,b+1));throw Error("INVALID_AI_JSON")}}

/** 2.1: category-specific, deterministic fact ranking. No paid image calls. */
function heroFactRank(f:any,product:any):number{
 const k=low(f.key),label=low(f.label).replace(/ё/g,"е");
 const n=low(product.product_name);
 const concrete=/бетономеш|бетоносмес/.test(n),washer=/мойк|давлени/.test(n);
 const snow=/снегоуб/.test(n),pump=/насос/.test(n);
 const saw=/бензопил|цепн.*пил/.test(n);
 const patterns:RegExp[]=concrete?
 [/объем барабан|объём барабан|drum_volume_l|drum_l/i,/готовой смеси|готов.*смес/i,/input_power_w|power_w|мощность/i,/crown_material|материал венца/i,/частота вращения|об\/мин/i,/напряжение/i,/диаметр отверстия/i]:
 washer?[/давлени|бар\b/i,/производительность|л\/ч|л\/мин/i,/длина шланг/i,/мощность/i,/насадк|пеногенератор/i]:
 snow?[/ширина захват|ширина обработ/i,/высота захват|высота обработ/i,/дальность выброса/i,/мощность/i,/тип запуск|стартер/i]:
 pump?[/производительн|flow/i,/напор|head/i,/размер частиц|частиц/i,/мощность/i,/материал корпуса/i]:
 saw?[/мощность|л\.с\./i,/длина шины/i,/объем двигателя/i,/шаг цепи/i,/смазка цепи/i]:
 [/мощность/i,/производительн|расход/i,/объем|объём|емкост|ёмкост/i,/напряжени/i,/материал/i,/частот|скорость/i];
 const text=k+" "+label;
 let idx=patterns.findIndex(r=>r.test(text));
 // IDs do not establish truth; matched original verified facts do.
 if(idx<0)idx=90;
 if(concrete&&/input_power_w/.test(k))idx=2;
 if(concrete&&/power_w|мощност/.test(text)&&!/input_power_w/.test(k))idx=Math.max(2,idx);
 return idx;
}
function dedupHero(facts:any[],product:any):any[]{
 const seen=new Set<string>(),chosen:any[]=[];
 const ordered=[...facts].sort((a,b)=>heroFactRank(a,product)-heroFactRank(b,product));
 for(const f of ordered){
  const n=low(f.label).replace(/ё/g,"е"),k=low(f.key);
  // Never duplicate power as "power_w" and scraped "Мощность" for the same value.
  const group=/(input_power_w|power_w|мощност)/.test(k+" "+n)?"power":
    /готовой смеси/.test(n)?"ready_mix":
    /объем барабан|объём барабан|drum_volume_l/.test(k+" "+n)?"drum":
    /crown_material|материал венца/.test(k+" "+n)?"crown":
    /напряжен|voltage/.test(k+" "+n)?"voltage":
    /частота вращения|об\/мин/.test(n)?"rotation":
    k==="live"?n:k;
  if(seen.has(group))continue;
  seen.add(group);chosen.push(f);
  if(chosen.length===5)break;
 }
 return chosen;
}
function checkedCaption(t:any,max:number):string{
 const x=str(t,max).replace(/[\r\n\t]+/g," ").replace(/\s{2,}/g," ").trim();
 if(/[{}<>]|https?:|@[a-z0-9]/i.test(x))return "";
 if(/самый|лучш|абсолютн|идеальн|гарантир|100\s*%|навсегда|бесконечн|любой толщин|без ограничени/i.test(x))return "";
 return x.replace(/объем/gi,"объём").replace(/емкость/gi,"ёмкость");
}
function canonicalFactHeading(f:any):string{
 const key=low(f.key),label=low(f.label).replace(/ё/g,"е"),v=checkedCaption(f.value,60);
 if(!v)return "ХАРАКТЕРИСТИКИ";
 if(/готовой смеси/.test(label))return v+" ГОТОВОЙ СМЕСИ";
 if(/input_power_w|power_w/.test(key)||/мощность/.test(label))return "МОЩНОСТЬ "+v;
 if(/crown_material|материал венца/.test(key))return "ВЕНЕЦ — "+v;
 if(/частота вращения/.test(label))return "ВРАЩЕНИЕ — "+v;
 if(/напряжение/.test(label))return "ПИТАНИЕ — "+v;
 return checkedCaption(f.label,48)+" — "+v;
}
/** 2.2 - eight self-contained proof-first marketplace posters. Never trust free-form AI selling copy.
 * Use the LLM for art directions only; printed technical claims are sourced, not hallucinated.
 */
const creativeVersion="2.2-proof-first";
const posterRoles=[
 {role:"hero",purpose:"Exact product + 4–5 top verified specs",layout:"hero-right"},
 {role:"power",purpose:"Key performance and what the specification means",layout:"macro-right"},
 {role:"construction",purpose:"Visible working detail or authentic verified close-up",layout:"detail-right"},
 {role:"capacity",purpose:"Verified volume, dimensions or real constraints",layout:"product-left"},
 {role:"materials",purpose:"External build and verified materials; no durability guarantees",layout:"detail-right"},
 {role:"ergonomics",purpose:"Controls/handling/safety only if confirmed",layout:"product-left"},
 {role:"applications",purpose:"Real category-relevant use, no fabricated results",layout:"action-right"},
 {role:"final",purpose:"Verified package contents if known, else technical recap",layout:"product-left"}
];
function proofFacts(facts:any[],product:any,slideNo:number,proposed:any[]):any[]{
 const eligible=facts.filter(f=>checkedCaption(f.label,80)&&checkedCaption(f.value,80)&&
    !/^(?:null|undefined|неизвестно|n\/a|—)$/i.test(str(f.value,80)));
 const scored=(f:any)=>{
  const t=(low(f.key)+" "+low(f.label)).replace(/ё/g,"е");
  const role=slideNo;
  const patterns:Record<number,RegExp>={
   2:/мощност|производител|скорост|об\/мин|крутящ|напор|давлен|расход|обороты/i,
   3:/венец|механизм|барабан|нож|цепь|шина|редуктор|крыльчат|двигател|внутрен|рабоч/i,
   4:/объем|объём|емкост|ёмкост|вес|габарит|длина|ширина|высота|диаметр/i,
   5:/материал|металл|чугун|сталь|корпус|венец|защит/i,
   6:/управлен|запуск|рукоят|колес|колёс|перемещ|ручн|регулиров|защита|питани|напряж/i,
   7:/назначени|применен|использ|обрабатыва|рабоч|тип|глубин|производител/i,
   8:/комплект|упаков|принадлеж|инструкц|количеств|поставк/i
  };
  return patterns[role]?.test(t)?0:1;
 };
 const preferred=arr(proposed).map(x=>str(x,12)).filter(Boolean);
 const hero=dedupHero(eligible,product),uniq=[...eligible].sort((a,b)=>{
  const v=scored(a)-scored(b);if(v)return v;
  const ai=preferred.indexOf(a.id),bi=preferred.indexOf(b.id);
  if(ai>=0&&bi<0)return -1;if(bi>=0&&ai<0)return 1;
  return heroFactRank(a,product)-heroFactRank(b,product);
 });
 if(slideNo===1)return hero;
 // Rotate the supporting facts across 7 independent pages; prevent a "single spec" poster.
 const set:any[]=[];const seen=new Set<string>();
 const add=(f:any)=>{if(!f||seen.has(f.id))return;seen.add(f.id);set.push(f)};
 for(const f of uniq.filter(x=>scored(x)===0).slice(0,2))add(f);
 for(let k=0;k<eligible.length&&set.length<4;k++)add(eligible[(k+slideNo*2)%eligible.length]);
 for(const f of uniq){if(set.length>=4)break;add(f)}
 if(set.length<3)throw Error("NOT_ENOUGH_VERIFIED_SLIDE_FACTS");
 return set;
}
function posterTakeaway(product:any,facts:any[],n:number):string{
 const name=low(product.product_name);
 const one=facts[0],caption=one?checkedCaption(one.label,75):"";
 // No technical benefit may be introduced without supporting data.
 if(n===1)return "ХАРАКТЕРИСТИКИ ИМЕННО ЭТОЙ МОДЕЛИ";
 if(/бетономеш|бетоносмес/.test(name)){
  if(n===2)return "ПАРАМЕТРЫ РАБОТЫ СТРОИТЕЛЬНОГО СМЕСИТЕЛЯ";
  if(n===3||n===5)return "КОНСТРУКЦИЯ В ДЕТАЛЯХ";
  if(n===4)return "ВАЖНЫЕ РАЗМЕРЫ И ОБЪЁМЫ";
  if(n===7)return "ДЛЯ ПРИГОТОВЛЕНИЯ СТРОИТЕЛЬНЫХ СМЕСЕЙ";
 }
 return caption?"ПОДРОБНЕЕ: "+caption.toLocaleUpperCase("ru"):"ОСОБЕННОСТИ ЭТОЙ МОДЕЛИ";
}
function validateStoryboard(raw:any,facts:any[],product:any){
 const ids=new Set(facts.map(f=>f.id)),plan=arr(raw?.slides);
 const hero=dedupHero(facts,product);
 if(hero.length<3)throw Error("NOT_ENOUGH_VERIFIED_HERO_FACTS");
 let previous=new Set<string>();
 const storyboard=templates.map((tmpl,i)=>{
  const num=i+1,proposal=plan[i]||{};
  const linked=proofFacts(facts,product,num,arr(proposal.fact_ids));
  if(num>1){
   if(linked.length<3||linked.length>4)throw Error("PROOF_COVERAGE_SLIDE_"+num);
   const same=linked.every(f=>previous.has(f.id));
   if(same&&facts.length>4){
    const other=facts.find(f=>!linked.some(p=>p.id===f.id)&&!previous.has(f.id));
    if(other)linked[linked.length-1]=other;
   }
  }
  previous=new Set(linked.map(f=>f.id));
  const first=linked[0];
  const h=num===1?checkedCaption(product.product_name,95):canonicalFactHeading(first);
  if(!h||h.toLowerCase()==="обложка")throw Error("BAD_EDITORIAL_TITLE_"+num);
  const artNote=checkedCaption(proposal.composition_note,240);
  // marketing_note never prints to the PNG: unsupported AI prose would be unsafe.
  return {
   number:num,key:keys[i],role:posterRoles[i].role,layout:posterRoles[i].layout,
   title:h,subtitle:num===1?"ГЛАВНЫЕ ХАРАКТЕРИСТИКИ":checkedCaption(first.label,80),
   takeaway:posterTakeaway(product,linked,num),
   fact_ids:linked.map(f=>f.id),
   proof_count:linked.length,
   scene:tmpl.scene,placement:tmpl.position,
   composition_note:artNote||tmpl.scene,
   // Exact-role visual proof is checked against the reference photo, not invented.
   technical_visual_rule:"show verified visible exterior close-up; NO invented cutaways, mechanisms or invisible internals",
   qa_version:creativeVersion
  };
 });
 if(storyboard.length!==8||storyboard.some((x,i)=>x.number!==i+1||x.proof_count<(i===0?3:3)))
   throw Error("EDITORIAL_GATE_FAILED");
 return storyboard;
}
function categoryBrief(product:any){
 const s=low(product?.product_name);
 if(/бетономеш|бетоносмес/.test(s))return "Category-specific creative structure: drum capacity, crown material, power, frame, loading angle, transport and construction sites; ONLY if proven by facts.";
 if(/насос|дренаж|фекал/.test(s))return "Category-specific structure: exact pump type, flow, head, allowable solids, body material and intended liquid; only proven parameters.";
 if(/снегоуб/.test(s))return "Snow equipment category: working width, clearing height, throwing distance, drive and startup, ONLY when supported.";
 if(/мойк|высокого давления/.test(s))return "Pressure washer: verified max pressure, flow rate, hose, foam accessories, external pump details, application scenes; no fake accessories.";
 if(/дрел|шурупов|пил|перфорат|гайков/.test(s))return "Power tool: verified power, bits/chuck, battery count, torque, ergonomics and correct tasks only.";
 if(/зернодроб/.test(s))return "Grain crusher: confirmed throughput, motor power, hopper capacity, cleaning, casing and intended grains only.";
 return "Select category-relevant features only from the supplied verified facts. Avoid unsupported accessories, modes or outcomes.";
}
async function buildStoryboard(facts:any[],product:any){
 const key=Deno.env.get("ANTHROPIC_API_KEY"),openai=Deno.env.get("OPENAI_API_KEY");
 if(!key&&!openai)throw Error("TEXT_AI_NOT_CONFIGURED");
 const prompt=[
  "SYSTEM: You are creative director of premium commercial marketplace infographics for Resanta, Huter, Vikhr and Eurolux. Create eight EQUAL-quality self-contained persuasive poster concepts.",
  "The FIRST and EACH of the seven remaining slides MUST have one strong proposition, one useful explanatory phrase, THREE OR FOUR confirmed supporting facts, distinctive visual evidence and a bottom takeaway. Do not produce one-spec posters.",
  "Slide sequence: 1 product hero with 4-5 verified facts; 2 power/performance; 3 key proven visible part or accurate annotated macro; 4 size/capacity; 5 materials/construction; 6 handling/safety; 7 verified usage; 8 verified contents ONLY or honest recap when kit unconfirmed.",
  "Eight visibly different layouts and photo angles. Premium readable hierarchy, dramatic lighting, visual proof and product prominence. Do not reproduce a generic hero product standing on a construction site for every slide.",
  "For technically demonstrable subjects, suggest a macro or annotated photograph of a VERIFIED visible component. Cutaway, x-ray or exploded views only if the exact component is documented with reliable product imagery. Otherwise use a labeled exterior close-up and never invent a mechanism.",
  "Marketing copy and images MUST NOT add unsupported specifications, claimed resource, lifetime, warranties, dimensions, accessories, safety features or idealized outcomes. AI text suggestions are art direction ONLY; final typography is generated deterministically from exact-SKU verified facts.",
  "You MUST assign 3-4 existing facts[].id to EACH supporting slide, rather than only one. Every fact must relate to the exact SKU; claims from competitors are never product claims.",
  categoryBrief(product),
  "Variation types: hero / action / exterior technical macro / capacity visual / materials / ergonomics / category usage / verified kit or technical summary. Do not generate fabricated diagrams or internal engine parts.",
  "Creative quality gate: each poster must communicate product advantage, why it matters, and proof in three seconds; avoid spelling errors and repetitive staging.",
  "Return strict JSON {slides:[{fact_ids:[existing fact IDs],composition_note:string}]} exactly eight ordered slides. No extra keys needed.",
  JSON.stringify({product,facts,poster_roles:posterRoles})
 ].join("\n");
 let answer="";
 if(key){
  const resp=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"content-type":"application/json","x-api-key":key,"anthropic-version":"2023-06-01"},
  body:JSON.stringify({model:"claude-sonnet-4-6",max_tokens:3600,temperature:0,system:"Output strict JSON. Facts only.",messages:[{role:"user",content:prompt}]})});
  const raw=await resp.json();if(!resp.ok)throw Error("STORYBOARD_PROVIDER_HTTP_"+resp.status);
  answer=arr(raw.content).filter(x=>x.type==="text").map(x=>x.text).join("\n");
 }else{
  const resp=await fetch("https://api.openai.com/v1/responses",{method:"POST",headers:{"content-type":"application/json","authorization":"Bearer "+openai},body:JSON.stringify({model:"gpt-5.6",input:prompt,store:false,max_output_tokens:4300})});
  const raw=await resp.json();if(!resp.ok)throw Error("STORYBOARD_PROVIDER_HTTP_"+resp.status);
  answer=arr(raw.output).flatMap(x=>arr(x.content)).filter(x=>x.type==="output_text").map(x=>x.text).join("\n");
 }
 return validateStoryboard(parseJson(answer),facts,product);
}
function artPrompt(product:any,facts:any[],slide:any){
 const nSlide=Number(slide.number||0);
 const layout=str(slide.layout,40);
 const n=low(product?.product_name);
 const technical=/венец|двигател|нож|цепь|редуктор|крыльчат|барабан|механизм/.test(n+" "+JSON.stringify(arr(slide.fact_ids).map(id=>facts.find(f=>f.id===id)?.label||"")));
 const space=layout==="product-left"?"Frame the exact product in the LEFT 52%; keep RIGHT 46% smoothly dark/empty for heading and 3-4 independently verified fact cards. Keep lower 14% free for takeaway.":
   "Frame the exact SKU in the RIGHT 52%; keep LEFT 46% smoothly dark/empty for heading and 3-4 independently verified fact cards. Keep lower 14% free for takeaway.";
 const emptySpace=nSlide===1?
   "STRICT HERO: authentic full exact-SKU product prominent on RIGHT 55%; LEFT 45% dark empty for 4-5 fact cards and high-contrast Cyrillic typography. Lower 12% reserved.":
   space+" Poster must be an enriched independent commercial scene, not a simple product photo.";
 const detail=technical&&[3,5,6].includes(nSlide)?"Premium close-up of ONLY physically visible, source-confirmed technical exterior components, with real material detail, lighting and safe annotation space. NEVER synthesize unseen internal parts, exploded diagrams or transparent housings.":"";
 const selected=arr(slide.fact_ids).map(x=>facts.find(f=>f.id===x)).filter(Boolean);
 const n=low(product?.product_name),brand=n.includes("huter")?"Huter yellow/black":n.includes("вихр")?"Vikhr orange/black":n.includes("eurolux")?"Eurolux verified brand accents":"Resanta red/black";
 return [
  "High-end PHOTOREALISTIC commercial product scene for an e-commerce marketing poster, vertical 2:3 portrait, visually rich and cinematic, polished physical lighting and intentional negative space. Do not generate any NEW writings, NEW logos, artificial letters, numbers or icons in the scene: correct brand typography will be added separately. Any labels genuinely visible on the supplied exact product must remain unaltered.",
  "The UPLOADED IMAGE depicts the EXACT product SKU. Preserve its brand colors, silhouette, physical geometry, design, visible controls, labeling and proportions. Do not replace the product with a similar model; DO NOT invent handles, accessories, internal parts or product features.",
  "Product identity (for grounding only): "+str(product?.product_name,180)+". SKU "+str(product?.sku,80),
  "Brand-adjacent premium visual palette: "+brand+".",
  "Dedicated composition: "+emptySpace,
  "Scene design: "+slide.scene,
  "Specific safe photographic direction: "+slide.composition_note,
  "Story role and requirement: "+str(slide.role,40)+"; visual proof: "+detail,
  "CRITICAL negative space for 3-4 facts: "+emptySpace,
  "Grounded visual context facts: "+JSON.stringify(selected.map(x=>x.label+" "+x.value)),
  "Render impressive cinematic advertising photography. Preserve exact actual SKU and all visible proportions. Follow the dedicated composition above, including protected text-free areas.",
  "No fabricated packaging, accessories, exploded views, motor cross sections, imaginary internal components, unverified test outcomes, safety features or documents. All technical close-ups MUST faithfully show the exact source model. Do not create any letters, numbers or word art.",
  "If the requested conceptual scene would alter the product, choose a professional studio background instead. Do not draw typography."
 ].join("\n");
}
Deno.serve(async(req:Request)=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:{"access-control-allow-origin":allow.has(req.headers.get("origin")||"")?req.headers.get("origin")!:"https://resanta-crm.by","access-control-allow-headers":"authorization,apikey,content-type,x-client-info","access-control-allow-methods":"POST, OPTIONS"}});
 if(req.method!=="POST")return make(req,405,{ok:false,error:"METHOD"});
 const input=await req.json().catch(()=>({}));
 const action=str(input.action,30),worker=action.startsWith("worker-");
 if(!worker&&!allow.has(req.headers.get("origin")||""))return make(req,403,{ok:false,error:"ORIGIN"});
 const url=Deno.env.get("SUPABASE_URL")||"",serviceKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
 if(!url||!serviceKey)return make(req,503,{ok:false,error:"BACKEND"});
 const db=createClient(url,serviceKey,{auth:{autoRefreshToken:false,persistSession:false}});
 const jwt=str(req.headers.get("authorization")||"",8192).replace(/^Bearer\s+/i,"");
 try{
 if(worker){
   if(jwt!==serviceKey)return make(req,403,{ok:false,error:"WORKER_FORBIDDEN"});
   if(!uuid(input.pilot_id))return make(req,400,{ok:false,error:"BAD_PILOT_ID"});
   const {data:pilot}=await db.from("triovist_infographic_v2_pilots").select("*").eq("id",input.pilot_id).maybeSingle();
   if(!pilot||!["queued","processing"].includes(pilot.status))return make(req,409,{ok:false,error:"PILOT_NOT_ACTIVE"});
   if(action==="worker-plan"){
     if(pilot.storyboard?.length===8)return make(req,200,{ok:true,storyboard:pilot.storyboard,facts:pilot.facts,product:{sku:pilot.sku,product_name:pilot.product_name,product_url:pilot.product_url}});
     const {data:specs}=await db.from("triovist_market_own_specs_current_v1").select("specs_normalized,specs_fetched_at").eq("sku",pilot.sku).order("specs_fetched_at",{ascending:false}).limit(1);
     const row=arr(specs)[0];
     const isFresh=row?.specs_fetched_at&&Date.now()-Date.parse(row.specs_fetched_at)<=10*86400000;
     const facts=sourceFacts(isFresh?row:null,arr(input.live_facts));
     if(dedupHero(facts,{product_name:pilot.product_name}).length<3)throw Error("NOT_ENOUGH_VERIFIED_HERO_FACTS");
     const product={sku:pilot.sku,product_name:pilot.product_name,product_url:pilot.product_url};
     const storyboard=await buildStoryboard(facts,product);
   if(storyboard.length!==8||storyboard.some((x:any,i:number)=>x.number!==i+1||x.proof_count<3))
     throw Error("STORYBOARD_QA_REJECTED");
     const {error:ue}=await db.from("triovist_infographic_v2_pilots").update({facts,storyboard,source_image_url:str(input.photo_url,700),status:"processing",stage:"AI storyboard",updated_at:new Date().toISOString()}).eq("id",pilot.id).in("status",["queued","processing"]);
     if(ue)throw ue;
     const {data:existing}=await db.from("triovist_infographic_v2_slides").select("slide_no").eq("pilot_id",pilot.id);
     if(!existing?.length){const {error:se}=await db.from("triovist_infographic_v2_slides").insert(storyboard.map((x:any)=>({pilot_id:pilot.id,slide_no:x.number,factual_ids:x.fact_ids,prompt:x.scene+" "+x.composition_note})));if(se)throw se;}
     return make(req,200,{ok:true,facts,storyboard,product});
   }
   if(action==="worker-image"){
     if(pilot.status!=="processing")return make(req,409,{ok:false,error:"PILOT_NOT_PROCESSING"});
     const slideNo=Number(input.slide_no);
     if(!Number.isInteger(slideNo)||slideNo<1||slideNo>8)return make(req,400,{ok:false,error:"SLIDE"});
     const photoB64=str(input.photo_base64,9000000);
     if(!/^[a-zA-Z0-9+/=\r\n]+$/.test(photoB64)||photoB64.length<4000||photoB64.length>6500000)return make(req,400,{ok:false,error:"SOURCE_IMAGE"});
     const openai=Deno.env.get("OPENAI_API_KEY");if(!openai)return make(req,503,{ok:false,error:"IMAGE_PROVIDER_NOT_CONFIGURED"});
     const scene=arr(pilot.storyboard)[slideNo-1];if(!scene||!arr(pilot.facts).length)return make(req,409,{ok:false,error:"NO_STORYBOARD"});
     const {data:reserved,error:reserveError}=await db.rpc("triovist_infographic_v2_reserve_image",{p_pilot:pilot.id,p_slide:slideNo});
     if(reserveError||!reserved)return make(req,409,{ok:false,error:"IMAGE_BUDGET_OR_DUPLICATE"});
     // Exact-SKU photo bytes originate from server worker, not public URL or user-controlled fetch.
     const bytes=Uint8Array.from(atob(photoB64.replace(/\s/g,"")),c=>c.charCodeAt(0));
     const form=new FormData();form.set("model",model);form.set("image",new File([bytes],"source.jpg",{type:"image/jpeg"}));
     form.set("prompt",artPrompt({sku:pilot.sku,product_name:pilot.product_name},pilot.facts,scene));
     form.set("size","1024x1536");form.set("quality","high");form.set("output_format","jpeg");form.set("output_compression","88");
     const ctrl=new AbortController(),timeout=setTimeout(()=>ctrl.abort(),165000);
     try{
       const response=await fetch("https://api.openai.com/v1/images/edits",{method:"POST",headers:{"authorization":"Bearer "+openai},body:form,signal:ctrl.signal});
       const data=await response.json().catch(()=>({}));
       if(!response.ok)throw Error("IMAGE_PROVIDER_HTTP_"+response.status+":"+str(data.error?.message,150));
       const image=str(arr(data.data)[0]?.b64_json,9000000);
       if(image.length<15000)throw Error("IMAGE_EMPTY");
       return make(req,200,{ok:true,image_base64:image,model,slide_no:slideNo});
     }finally{clearTimeout(timeout)}
   }
   return make(req,400,{ok:false,error:"UNKNOWN_WORKER_ACTION"});
 }
 if(!jwt)return make(req,401,{ok:false,error:"AUTH_REQUIRED"});
 const {data:auth}=await db.auth.getUser(jwt);if(!auth?.user?.id)return make(req,401,{ok:false,error:"AUTH_INVALID"});
 const {data:profile}=await db.from("users").select("email,role,access_scope").eq("id",auth.user.id).maybeSingle();
 if(!profile)return make(req,403,{ok:false,error:"NO_CRM_PROFILE"});
 const email=low(profile.email),leader=profile.role==="boss"&&leadership.has(email);
 const manager=profile.role==="manager"&&profile.access_scope==="triovist"&&managers.has(email);
 if(!leader&&!manager)return make(req,403,{ok:false,error:"FORBIDDEN"});
 if(action==="config")return make(req,200,{ok:true,version:"2.0-pilot",max_skus:1,slides:8,
  image_provider_ready:!!Deno.env.get("OPENAI_API_KEY"),
  text_provider_ready:!!(Deno.env.get("ANTHROPIC_API_KEY")||Deno.env.get("OPENAI_API_KEY")),
  premium_model:model,bulk_release:false,requires_approval:true,can_start:leader,editorial_version:"2.1",requires_visual_review:true});
 if(action==="list"){
  let q=db.from("triovist_infographic_v2_pilots").select("id,sku,product_name,group_name,owner_email,status,stage,completed_slides,total_slides,paid_images_started,created_at,updated_at,error_message")
   .order("created_at",{ascending:false}).limit(20);
  if(!leader)q=q.eq("owner_user_id",auth.user.id);
  const {data:rows,error}=await q;if(error)throw error;return make(req,200,{ok:true,pilots:rows||[]});
 }
 if(action==="start"){
  if(!leader)return make(req,403,{ok:false,error:"PILOT_LEADER_ONLY"});
  if(!Deno.env.get("OPENAI_API_KEY"))return make(req,503,{ok:false,error:"IMAGE_PROVIDER_NOT_CONFIGURED",message:"Требуется серверный ключ OpenAI Image API."});
  if(!Deno.env.get("ANTHROPIC_API_KEY")&&!Deno.env.get("OPENAI_API_KEY"))return make(req,503,{ok:false,error:"TEXT_PROVIDER_NOT_CONFIGURED"});
  const sku=str(input.sku,80);if(!/^[\p{L}\p{N}/._ -]{1,80}$/u.test(sku))return make(req,400,{ok:false,error:"BAD_SKU"});
  const {data:cards,error:ce}=await db.from("triovist_content_cards")
   .select("sku,product_name,product_url,subgroup,manager_email").eq("sku",sku).order("created_at",{ascending:false}).limit(20);
  if(ce||!cards?.length)return make(req,404,{ok:false,error:"SKU_NOT_FOUND"});
  const card=cards.find(x=>x.product_url&&/^https:\/\/(?:www\.)?21vek\.by\//i.test(x.product_url));
  if(!card)return make(req,400,{ok:false,error:"NO_VERIFIED_PRODUCT_URL"});
  if(!managers.has(low(card.manager_email)))return make(req,403,{ok:false,error:"UNASSIGNED_PRODUCT"});
  const {data:active}=await db.from("triovist_infographic_v2_pilots").select("id").eq("owner_user_id",auth.user.id).in("status",["queued","processing"]).limit(1);
  if(active?.length)return make(req,409,{ok:false,error:"PILOT_ALREADY_RUNNING"});
  const {data:pilot,error:ie}=await db.from("triovist_infographic_v2_pilots").insert({
   owner_user_id:auth.user.id,owner_email:email,sku,product_name:card.product_name,
   product_url:card.product_url,group_name:card.subgroup||"",manager_email:card.manager_email,
   model,max_paid_images:8
  }).select("id,sku,status,product_name").single();
  if(ie)throw ie;return make(req,200,{ok:true,pilot});
 }
 if(["status","cancel","approve","preview","recover","save-copy"].includes(action)){
  const id=str(input.pilot_id,50);if(!uuid(id))return make(req,400,{ok:false,error:"BAD_ID"});
  // Use an explicit singleton array instead of .maybeSingle(): this gives us
  // separate and actionable responses for PostgREST failures versus truly missing projects.
  const {data:pilotRows,error:pe}=await db.from("triovist_infographic_v2_pilots")
    .select("*").eq("id",id).limit(1);
  if(pe){
    console.error("TRIOVIST_V2_PILOT_READ",str(pe.code,36),str(pe.message,160));
    return make(req,503,{ok:false,error:"PROJECT_READ_FAILED",message:"Не удалось прочитать проект из базы. Повторите проверку статуса. Код: "+str(pe.code||"UNKNOWN",30)});
  }
  const pilot=arr(pilotRows)[0];
  if(!pilot)return make(req,404,{ok:false,error:"PILOT_ID_NOT_FOUND",message:"Запрошенный идентификатор теста не найден. Обновите список проектов, повторный запуск не нужен."});
  if(!leader&&pilot.owner_user_id!==auth.user.id)return make(req,403,{ok:false,error:"NOT_OWNER"});
  if(action==="cancel"){
    if(!leader&&pilot.owner_user_id!==auth.user.id)return make(req,403,{ok:false,error:"NOT_OWNER"});
    if(["queued","processing"].includes(pilot.status)){
      const {error:e}=await db.from("triovist_infographic_v2_pilots").update({status:"cancelled",stage:"Остановлено пользователем",finished_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq("id",id).in("status",["queued","processing"]);if(e)throw e;
    }
    return make(req,200,{ok:true,status:"cancelled"});
  }
  if(action==="recover"){
    if(!leader)return make(req,403,{ok:false,error:"DIRECTOR_ONLY"});
    // Explicit confirmation is mandatory. A failed PNG upload consumed one paid request.
    // Recovery may consume ONE additional image request (9 total for 8 finished slides).
    if(input.confirm_extra_paid_image!==true)return make(req,409,{ok:false,error:"EXTRA_IMAGE_CONSENT_REQUIRED",
      message:"Первый запрос уже оплачен, но PNG не сохранился. Для полного комплекта из 8 слайдов потребуется до 9 платных запросов. Подтвердите дополнительный запрос."});
    const {data:ok,error:err}=await db.rpc("triovist_infographic_v2_recover_png_upload",{p_pilot_id:id});
    if(err){console.error("TRIOVIST_V2_RECOVER",str(err.code),str(err.message));return make(req,503,{ok:false,error:"RECOVERY_DB_FAILURE",message:"Не удалось подготовить безопасный повтор"});}
    if(!ok)return make(req,409,{ok:false,error:"RECOVERY_NOT_ALLOWED",
      message:"Восстановление разрешено только один раз после подтверждённой ошибки MIME PNG. Проверьте статус проекта."});
    const {data:updated,error:readErr}=await db.from("triovist_infographic_v2_pilots").select("*").eq("id",id).limit(1);
    if(readErr||!arr(updated)[0])return make(req,503,{ok:false,error:"RECOVERY_STATUS_ERROR"});
    return make(req,200,{ok:true,pilot:arr(updated)[0],retry_paid_image_limit:9,
      message:"Тот же тест возвращён в очередь. Повторная генерация не запустится до фонового запуска обработчика."});
  }
  if(action==="save-copy"){
    if(!leader)return make(req,403,{ok:false,error:"DIRECTOR_ONLY"});
    const audit=pilot.audit||{};
    if(pilot.status!=="needs_review"||pilot.completed_slides!==8||
       audit.editorial_version!=="2.1"||!audit.scene_layers_preserved)
      return make(req,409,{ok:false,error:"COPY_ONLY_UNAVAILABLE",
        message:"Для редактирования без оплаты нужны исходные сцены нового генератора 2.1. Старые PNG остаются без изменений."});
    const num=Number(input.slide_no);
    if(!Number.isInteger(num)||num<2||num>8)return make(req,400,{ok:false,error:"BAD_SLIDE",message:"Главная обложка формируется строго из подтверждённого названия модели и приоритетных характеристик."});
    const title=checkedCaption(input.title,95),subtitle=checkedCaption(input.subtitle,120);
    if(!title||title.length<4||/^\s*(?:обложка|преимущества|характеристики)\s*$/i.test(title))
      return make(req,400,{ok:false,error:"BAD_TITLE",message:"Укажи конкретный заголовок без общих слов и рекламных обещаний."});
    const story=arr(pilot.storyboard);
    if(story.length!==8)return make(req,409,{ok:false,error:"STORYBOARD_NOT_FOUND"});
    const {data:slideRows,error:qe}=await db.from("triovist_infographic_v2_slides")
      .select("scene_path,status").eq("pilot_id",id).eq("slide_no",num).limit(1);
    if(qe||arr(slideRows)[0]?.status!=="completed"||!arr(slideRows)[0]?.scene_path)
      return make(req,409,{ok:false,error:"RAW_SCENE_NOT_AVAILABLE"});
    const factIds=arr(story[num-1].fact_ids);
    const linked=arr(pilot.facts).filter((f:any)=>factIds.includes(f.id));
    const digits=new Set(
      [...linked.map((f:any)=>String(f.value)),String(pilot.product_name),String(pilot.sku)]
      .flatMap(v=>v.match(/\d+(?:[.,]\d+)?/g)||[]).map(v=>v.replace(",",".")));
    if([...title.matchAll(/\d+(?:[.,]\d+)?/g),...subtitle.matchAll(/\d+(?:[.,]\d+)?/g)]
       .some(x=>!digits.has(x[0].replace(",","."))))
      return make(req,400,{ok:false,error:"UNVERIFIED_NUMBER",
        message:"В тексте обнаружена цифра, не подтверждённая для этого слайда. Проверь привязанные характеристики."});
    const pending=[...new Set([...arr(audit.pending_recompose),num])];
    const revised=story.map((x:any,i:number)=>i===num-1?{...x,title,subtitle}:x);
    const {error:ue}=await db.from("triovist_infographic_v2_pilots")
      .update({storyboard:revised,
        audit:{...audit,pending_recompose:pending,copy_revised_at:new Date().toISOString()},
        stage:"Редактура: ожидает пересборки PNG без новых платных запросов",
        updated_at:new Date().toISOString()})
      .eq("id",id).eq("status","needs_review");
    if(ue)throw ue;
    return make(req,200,{ok:true,pending_recompose:pending,
      message:"Текст сохранён. Фоновой обработчик обновит PNG без генерации нового изображения."});
  }
  if(action==="approve"){
    if(!leader)return make(req,403,{ok:false,error:"LEADER_ONLY"});
    if(pilot.status!=="needs_review"||pilot.completed_slides!==8)return make(req,409,{ok:false,error:"NOT_READY"});
    if(pilot.audit?.editorial_version!=="2.1"||!pilot.audit?.hero_verified||
       !pilot.audit?.scene_layers_preserved||arr(pilot.audit?.pending_recompose).length||
       pilot.audit?.requires_visual_review!==true)
      return make(req,409,{ok:false,error:"QA_V21_REQUIRED",message:"Этот комплект сделан до редакционной проверки 2.1. Не утверждайте старые изображения с ошибками; проверьте новую версию."});
    const {error:e}=await db.from("triovist_infographic_v2_pilots").update({status:"approved",stage:"Образец утверждён",updated_at:new Date().toISOString()}).eq("id",id).eq("status","needs_review");if(e)throw e;
    return make(req,200,{ok:true,status:"approved",bulk_release:false});
  }
  const {data:slides,error:se}=await db.from("triovist_infographic_v2_slides").select("slide_no,status,final_path,error_message,factual_ids").eq("pilot_id",id).order("slide_no");
  if(se)throw se;
  if(action==="preview"){
    const paths=arr(slides).filter(s=>s.status==="completed"&&s.final_path).map(s=>s.final_path);
    if(!paths.length)return make(req,409,{ok:false,error:"NO_READY_SLIDES"});
    const {data:urls,error:ue}=await db.storage.from("triovist-infographic-archives").createSignedUrls(paths,600);if(ue)throw ue;
    return make(req,200,{ok:true,images:arr(urls).map((x,i)=>({slide_no:arr(slides).filter(s=>s.status==="completed"&&s.final_path)[i]?.slide_no,url:x.signedUrl})).filter(x=>x.url)});
  }
  return make(req,200,{ok:true,pilot,slides});
 }
 return make(req,400,{ok:false,error:"UNKNOWN_ACTION"});
 }catch(e){console.error("TRIOVIST_V2",e instanceof Error?e.message:"UNKNOWN");return make(req,500,{ok:false,error:"PROCESSING_FAILED",message:e instanceof Error?str(e.message,220):"Ошибка"})}
});