import {createClient} from 'npm:@supabase/supabase-js@2.56.0';
import {minskDate,evaluate,personalFor,voiceBrief} from './logic.mjs';

const sb=createClient(Deno.env.get('SUPABASE_URL')||'',Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'',
 {auth:{persistSession:false,autoRefreshToken:false}});
const BOT_TOKEN=Deno.env.get('TELEGRAM_BOT_TOKEN')||'';
const OWNER_ID='544fb1e2-ef70-44de-bc62-e0e1596a4bfc';
const respond=(status:number,payload:unknown)=>new Response(JSON.stringify(payload),
 {status,headers:{'content-type':'application/json;charset=utf-8','cache-control':'no-store'}});
const clean=(s:unknown)=>String(s??'').replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]||c));
async function runtime(key:string){
 const {data,error}=await sb.from('crm_telegram_runtime').select('value').eq('key',key).maybeSingle();
 if(error)throw new Error('RUNTIME_UNAVAILABLE');return data?.value||null
}
async function savedRuntime(key:string,value:unknown){
 const {error}=await sb.from('crm_telegram_runtime').upsert({key,value,updated_at:new Date().toISOString()},{onConflict:'key'});
 if(error)throw new Error('RUNTIME_LOG_FAILED')
}
async function telegram(method:string,payload:unknown){
 if(!BOT_TOKEN)throw new Error('TELEGRAM_UNCONFIGURED');
 const r=await fetch('https://api.telegram.org/bot'+BOT_TOKEN+'/'+method,{
  method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(23000)
 });
 const data=await r.json().catch(()=>({}));if(!r.ok||!data.ok)throw new Error('TELEGRAM_'+method+'_'+String(data.description||r.status).slice(0,80));
 return data.result
}
function speechBytes(body:string,format:'OGG_OPUS'|'MP3'):Uint8Array{
 if(body.length>6000000)throw new Error('SPEECH_TOO_LARGE');
 const packets:any[]=[];try{const r=JSON.parse(body);packets.push(...(Array.isArray(r)?r:[r]))}
 catch{for(const line of body.split(/\r?\n/)){if(line.trim()){try{packets.push(JSON.parse(line))}catch{throw new Error('BAD_SPEECH_RESPONSE')}}}}
 const parts:Uint8Array[]=[];
 for(const p of packets){const chunk=p?.result?.audioChunk?.data||p?.audioChunk?.data;if(!chunk)continue;
  const data=atob(chunk),bin=new Uint8Array(data.length);for(let i=0;i<data.length;i++)bin[i]=data.charCodeAt(i);parts.push(bin)}
 const n=parts.reduce((a,b)=>a+b.length,0);if(n<80||n>1800000)throw new Error('BAD_AUDIO_SIZE');
 const out=new Uint8Array(n);let i=0;for(const v of parts){out.set(v,i);i+=v.length}
 const head=new TextDecoder().decode(out.slice(0,100));
 if(format==='OGG_OPUS'&&(!head.startsWith('OggS')||!head.includes('OpusHead')))throw new Error('NOT_OGG');
 if(format==='MP3'&&head.slice(0,3)!=='ID3'&&!(out[0]===255&&(out[1]&224)===224))throw new Error('NOT_MP3');
 return out
}
async function synthesize(text:string,uid:string,fmt:'OGG_OPUS'|'MP3'){
 const key=Deno.env.get('YANDEX_SPEECHKIT_API_KEY')||'';
 if(!key)throw new Error('NO_SPEECHKIT');
 const reserve=await sb.rpc('crm_ai360_yandex_monthly_claim_v1',{p_user_id:uid,p_characters:text.length});
 if(reserve.error||reserve.data?.allowed!==true)throw new Error('TTS_BUDGET_DENIED');
 const headers:Record<string,string>={'Authorization':'Api-Key '+key,'content-type':'application/json'};
 const folder=Deno.env.get('YANDEX_CLOUD_FOLDER_ID');if(folder)headers['x-folder-id']=folder;
 const res=await fetch('https://tts.api.cloud.yandex.net/tts/v3/utteranceSynthesis',{
  method:'POST',headers,signal:AbortSignal.timeout(26000),
  body:JSON.stringify({text,model:'general',hints:[{voice:'lera'},{role:'friendly'}],outputAudioSpec:{containerAudio:{containerAudioType:fmt}}})
 });
 if(!res.ok)throw new Error('TTS_'+res.status);
 return speechBytes(await res.text(),fmt)
}
async function voice(chat:number|string,uid:string,text:string){
 const mode=(await runtime('promotion360_delivery_mode:'+uid))?.mode||'voice';
 for(const fmt of (mode==='audio'?['MP3']:['OGG_OPUS','MP3']) as ('OGG_OPUS'|'MP3')[]){
  try{
   const sound=await synthesize(text,uid,fmt);const form=new FormData();
   form.append('chat_id',String(chat));
   const data=new Uint8Array(new ArrayBuffer(sound.length));data.set(sound);
   form.append(fmt==='OGG_OPUS'?'voice':'audio',new Blob([data],{type:fmt==='OGG_OPUS'?'audio/ogg':'audio/mpeg'}),
    fmt==='OGG_OPUS'?'lera-promo360.ogg':'lera-promo360.mp3');
   form.append('caption','🎧 Лера · Акции 360°');
   if(fmt==='MP3'){form.append('title','Лера · Акции 360°');form.append('performer','РЕСАНТА CRM')}
   const method=fmt==='OGG_OPUS'?'sendVoice':'sendAudio';
   const r=await fetch('https://api.telegram.org/bot'+BOT_TOKEN+'/'+method,{method:'POST',body:form,signal:AbortSignal.timeout(23000)});
   const v=await r.json().catch(()=>({}));
   if(!r.ok||!v.ok)throw new Error(String(v.description||r.status));
   if(fmt==='MP3')await savedRuntime('promotion360_delivery_mode:'+uid,{mode:'audio'});
   return {ok:true,format:fmt,id:v.result?.message_id};
  }catch(e){
   if(fmt==='OGG_OPUS'&&String(e).includes('VOICE_MESSAGES_FORBIDDEN'))continue;
   throw e
  }
 }
 throw new Error('VOICE_FAILED')
}
async function loadPromotions(today:string){
 const {data,error}=await sb.from('promotions').select('id,client_id,client_name,manager_name,title,status,start_date,end_date,sales_plan')
  .eq('status','in_work').lte('start_date',today).gte('end_date',today).limit(151);
 if(error||!data)throw new Error('PROMOTIONS_UNAVAILABLE');
 if(data.length>=151)throw new Error('PROMOTIONS_RESULT_TRUNCATED');
 const results=await Promise.all(data.map(async p=>{
  const [truth,snapshot]=await Promise.all([
   sb.rpc('crm_promotion_sales_truth_v236360',{p_promotion_id:p.id}),
   sb.from('promotion_sales_snapshots').select('source_message_at').eq('promotion_id',p.id)
    .order('source_message_at',{ascending:false}).limit(1).maybeSingle()
  ]);
  if(truth.error||snapshot.error)throw new Error('SALES_DATA_UNAVAILABLE');
  return {...p,assessment:evaluate(p,truth.data,snapshot.data?.source_message_at,today)}
 }));
 return results
}
async function profiles(){
 const r=await sb.from('users').select('id,name,role,email').in('role',['boss','manager']).limit(150);
 if(r.error||!r.data||r.data.length>=150)throw new Error('STAFF_UNAVAILABLE');
 return r.data
}
async function executeDaily(req:Request,mode:string){
 const expected=(await runtime('dispatch_secret'))?.secret||'',header=req.headers.get('x-crm-dispatch-secret')||'';
 if(!expected||expected!==header)return respond(403,{ok:false,error:'FORBIDDEN'});
 if(mode!=='dry_run'&&mode!=='daily')return respond(400,{ok:false,error:'BAD_MODE'});
 const settings=await sb.from('crm_promotion360_settings_v1').select('*').eq('id','main').single();
 if(settings.error||!settings.data)throw new Error('CONFIG_MISSING');
 const cfg=settings.data,today=minskDate();
 if(mode==='daily'&&!cfg.enabled)return respond(200,{ok:true,enabled:false,reason:'FEATURE_DISABLED'});
 const [promos,people]=await Promise.all([loadPromotions(today),profiles()]);
 const byName=new Map(people.filter(x=>x.role==='manager').map(x=>[String(x.name).trim().toLowerCase(),x]));
 const owner=people.find(x=>x.id===OWNER_ID);
 const ids=promos.map(x=>x.id),existing=ids.length?
  await sb.from('crm_promotion360_actions_v1').select('id,promotion_id,milestone,status,due_at,next_check_at,manager_id,created_at')
    .in('promotion_id',ids).limit(500):{data:[],error:null};
 if(existing.error)throw new Error('ACTION_LOAD_FAILED');
 const actions=existing.data||[],proposed:any[]=[],wouldEscalate:any[]=[];
 for(const p of promos){
  const m=byName.get(String(p.manager_name||'').trim().toLowerCase());
  if(!m)continue;
  const a=p.assessment;
  if(a.milestone&&!actions.some(t=>t.promotion_id===p.id&&t.milestone===a.milestone))
   proposed.push({promotion_id:p.id,manager_id:m.id,manager_name:p.manager_name,
    client_name:p.client_name,title:p.title,milestone:a.milestone,due_at:new Date(Date.now()+48*3600000).toISOString()});
  for(const t of actions.filter(x=>x.promotion_id===p.id)){
   if((t.status==='open'&&Date.parse(t.due_at)<Date.now())||
      (t.status==='working'&&t.next_check_at&&Date.parse(t.next_check_at)<Date.now()&&a.zero))
    wouldEscalate.push({...t,client_name:p.client_name,manager_name:p.manager_name});
  }
 }
 if(mode==='daily'&&cfg.auto_tasks_enabled){
  if(proposed.length){
   const upsert=await sb.from('crm_promotion360_actions_v1').upsert(
    proposed.map(p=>({promotion_id:p.promotion_id,manager_id:p.manager_id,milestone:p.milestone,
     status:'open',due_at:p.due_at})),{onConflict:'promotion_id,milestone',ignoreDuplicates:true});
   if(upsert.error)throw new Error('ACTION_SAVE_FAILED');
  }
  for(const t of wouldEscalate){
   const u=await sb.from('crm_promotion360_actions_v1').update({status:'escalated',updated_at:new Date().toISOString()})
    .eq('id',t.id).eq('status',t.status).select('id').maybeSingle();
   if(u.error)throw new Error('ESCALATION_FAILED');
  }
 }
 const taskRows=mode==='daily'&&cfg.auto_tasks_enabled?
  (await sb.from('crm_promotion360_actions_v1').select('id,promotion_id,milestone,status,manager_id').in('promotion_id',ids).limit(500)).data||[]:actions;
 const cases=taskRows.map(t=>{
  const p=promos.find(x=>x.id===t.promotion_id);
  return p?{...t,client_name:p.client_name,manager_name:p.manager_name,title:p.title}:null
 }).filter(Boolean);
 const previews:any[]=[];
 for(const u of [owner,...people.filter(x=>x.role==='manager')].filter(Boolean)){
  const personalPromos=personalFor(u,promos),personalTasks=personalFor(u,cases);
  const script=voiceBrief(u,personalPromos.map(x=>({...x,evidence_valid:x.assessment.verified})),personalTasks);
  if(!script)continue;
  previews.push({recipient:u.name,role:u.role,promotions:personalPromos.length,
   actions:personalTasks.filter(x=>x.status!=='closed').length,voice_characters:script.length,
   script:mode==='dry_run'?script:undefined,user_id:u.id});
 }
 if(mode==='dry_run')return respond(200,{ok:true,mode,today,promotions:promos.length,proposed,would_escalate:wouldEscalate.length,preview:previews,emails_sent:0,text_sent:0,voice_sent:0});
 if(!cfg.telegram_enabled)return respond(200,{ok:true,mode,today,tasks_created:cfg.auto_tasks_enabled?proposed.length:0,voice_enabled:false,preview:previews.map(x=>({recipient:x.recipient,actions:x.actions}))});
 const uid=previews.map(x=>x.user_id);
 const binds=uid.length?await sb.from('crm_telegram_bindings').select('user_id,chat_id,active').in('user_id',uid).eq('active',true):{data:[],error:null};
 if(binds.error)throw new Error('TELEGRAM_LINKS_FAILED');
 const map=new Map((binds.data||[]).filter(x=>Number(x.chat_id)>0).map(x=>[x.user_id,x]));
 let sentText=0,sentVoice=0;const errors:any[]=[];
 for(const p of previews){
  const binding=map.get(p.user_id);if(!binding)continue;
  const guard='promo360_digest_v1:'+today+':'+p.user_id;
  if((await runtime(guard))?.sent)continue;
  const text='🎯 <b>Лера · Акции 360°</b>\n'+clean(p.recipient)+
   '\nДействующих акций: '+p.promotions+'. Поручения: '+p.actions+
   '.\nОткройте <a href="https://resanta-crm.by">РЕСАНТА CRM → Акции 360°</a>.';
  try{
   await telegram('sendMessage',{chat_id:binding.chat_id,text,parse_mode:'HTML',disable_web_page_preview:true});
   sentText++;
   await savedRuntime(guard,{sent:true,text_sent:true,at:new Date().toISOString()});
   try{
    const script=voiceBrief(people.find(x=>x.id===p.user_id),personalFor(people.find(x=>x.id===p.user_id),promos).map(x=>({...x,evidence_valid:x.assessment.verified})),personalFor(people.find(x=>x.id===p.user_id),cases));
    if(script){await voice(binding.chat_id,p.user_id,script);sentVoice++}
   }catch(e){errors.push({recipient:p.recipient,stage:'voice',error:String(e).slice(0,80)})}
  }catch(e){errors.push({recipient:p.recipient,stage:'text',error:String(e).slice(0,80)})}
 }
 return respond(200,{ok:true,mode,today,promotions:promos.length,tasks_created:cfg.auto_tasks_enabled?proposed.length:0,text_sent:sentText,voice_sent:sentVoice,errors});
}
Deno.serve(async(req:Request)=>{
 if(req.method!=='POST')return respond(405,{ok:false,error:'POST_ONLY'});
 try{
  const body=await req.json().catch(()=>({}));
  return await executeDaily(req,String(body.mode||'dry_run'));
 }catch(e){console.error('PROMOTION360_LERA',e instanceof Error?e.message:String(e));
  return respond(500,{ok:false,error:'PROMOTION360_CYCLE_FAILED'})}
});
