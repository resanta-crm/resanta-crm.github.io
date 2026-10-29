import { createClient } from 'npm:@supabase/supabase-js@2.56.0';
const allowedOrigins = new Set(['https://resanta-crm.by','https://www.resanta-crm.by']);
function cors(origin:string|null) { return {'Access-Control-Allow-Origin':allowedOrigins.has(String(origin))?String(origin):'https://resanta-crm.by','Access-Control-Allow-Headers':'authorization, apikey, x-client-info, content-type','Access-Control-Allow-Methods':'OPTIONS,POST','Vary':'Origin'}; }
function out(data:unknown,status=200,origin:string|null=null) {return new Response(JSON.stringify(data),{status,headers:{...cors(origin),'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}});}
Deno.serve(async(req:Request)=>{
 const origin=req.headers.get('Origin');
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers:cors(origin)});
 if(req.method!=='POST')return out({error:'method_not_allowed'},405,origin);
 if(origin && !allowedOrigins.has(origin))return out({error:'origin_not_allowed'},403,origin);
 const auth=req.headers.get('Authorization')||'';
 const token=auth.startsWith('Bearer ')?auth.slice(7):'';
 if(!token||token.length>6000)return out({error:'not_authorized'},401,origin);
 const url=Deno.env.get('SUPABASE_URL')||'';
 const serviceKey=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'';
 if(!url||!serviceKey)return out({error:'service_not_configured'},503,origin);
 const svc=createClient(url,serviceKey,{auth:{autoRefreshToken:false,persistSession:false}});
 const authRes=await svc.auth.getUser(token).catch(()=>null);
 const user=authRes?.data?.user;
 if(!user?.id||!user.email)return out({error:'not_authorized'},401,origin);
 const prof=await svc.from('users').select('id,name,role,region').eq('id',user.id).maybeSingle();
 const pname=String(prof.data?.name||'').trim().split(/\s+/).join(' ').toLocaleLowerCase('ru-RU');
 const isOwner=user.id==='544fb1e2-ef70-44de-bc62-e0e1596a4bfc'&&prof.data?.role==='boss'&&pname==='александр паюшин';
 const isBranch=user.id==='ba55dfe5-7e48-4f1f-b40e-674c7752fe1a'&&prof.data?.role==='boss'&&pname==='сидарович к.н.'&&prof.data?.region==='Витебск';

 const FIELD_IDS=new Set(['19dd9943-99ae-47c4-a39c-4f82a11059a6',
  '3d935a76-c6fe-44b6-b248-fcbe58c6bf1c',
  '4fd79fa0-232d-4768-8099-25f47923cc4f']);
 const expectedManagers={
  '19dd9943-99ae-47c4-a39c-4f82a11059a6':'руднев',
  '3d935a76-c6fe-44b6-b248-fcbe58c6bf1c':'ачинович',
  '4fd79fa0-232d-4768-8099-25f47923cc4f':'шкуран'};
 const isField=FIELD_IDS.has(user.id)&&prof.data?.role==='manager'&&
   prof.data?.region==='Витебск'&&pname===expectedManagers[user.id];
  if(prof.error||(!isOwner&&!isBranch&&!isField))return out({error:'not_authorized'},403,origin);
 const apiKey=Deno.env.get('OPENAI_API_KEY');
 if(!apiKey)return out({error:'speech_provider_unconfigured'},503,origin);
 const contentLength=Number(req.headers.get('content-length')||0);
 if(contentLength>650000)return out({error:'audio_too_large'},413,origin);
 let data:FormData;
 try{data=await req.formData();}catch{return out({error:'invalid_audio_form'},400,origin);}
 if(data.get('kind')==='status')return out({ready:true},200,origin);
 const clip=data.get('audio');
 if(!(clip instanceof File))return out({error:'missing_audio'},400,origin);
 if(clip.size<900||clip.size>512000)return out({error:'audio_size_invalid'},413,origin);
 if(!(clip.type.startsWith('audio/')||clip.type==='video/webm'))return out({error:'unsupported_audio_format'},415,origin);
 const duration=Number(data.get('duration')||0);
 if(!Number.isFinite(duration)||duration<0.5||duration>16.5)return out({error:'audio_duration_invalid'},400,origin);
 const quota=await svc.rpc('crm_voice_claim_v1',{p_user_id:user.id});
 if(quota.error)return out({error:'quota_unavailable'},503,origin);
 if(!quota.data)return out({error:'voice_daily_limit'},429,origin);
 // Exact clip duration is estimated at gpt-transcribe's $0.0045/minute.
 // The budget claim shares a 5,000 RUB monthly pool with the AI text core and Yandex voice.
 const budget=await svc.rpc('crm_ai360_stt_claim_v2',{p_user_id:user.id,p_duration_seconds:duration});
 if(budget.error)return out({error:'speech_budget_meter_unavailable'},503,origin);
 if(budget.data?.allowed!==true)return out({
   error:budget.data?.reason==='monthly_budget_exhausted'?'speech_monthly_budget_exhausted':'speech_budget_unavailable',
   budget:budget.data||null
 },429,origin);
 const form=new FormData();
 form.append('model','gpt-transcribe');
 form.append('languages[]','ru');
 form.append('keywords[]','Ресанта');
 form.append('keywords[]','Триовист');
 form.append('keywords[]','Витебск');
 form.append('keywords[]','Гомель');
 // Verified current manager surnames, rather than a guessed static phonetic replacement.
 // Never insert instructions from database fields into the transcription system prompt.
 const namesResult=await svc.from('users').select('name').eq('role','manager').limit(40);
 const managerNames=(namesResult.error?[]:namesResult.data||[])
  .map((x:any)=>String(x.name||'').trim())
  .filter((name:string)=>/^[А-Яа-яЁё\s-]{4,70}$/.test(name))
  .slice(0,25);
 for(const name of managerNames)form.append('keywords[]',name);
 form.append('prompt','Русская речь в CRM группы компаний РЕСАНТА. Названия: Ресанта, Huter, Вихрь, Triovist, Триовист, 21vek. Фамилии сотрудников из проверенного справочника: '+managerNames.join(', ')+'. Типичные вопросы руководителя: «как быть по продажам», «какие задачи поставить», «чтобы эти клиенты купили», «сколько белорусских рублей», «дебиторская задолженность», «поручения менеджеру». Сохраняй произнесённые слова и фамилии максимально точно; не додумывай неразборчивые слова.');
 form.append('file',clip,clip.name||'speech.webm');
 let upstream:Response;
 try{upstream=await fetch('https://api.openai.com/v1/audio/transcriptions',{method:'POST',headers:{Authorization:'Bearer '+apiKey},body:form,signal:AbortSignal.timeout(28000)});}
 catch{return out({error:'speech_provider_unavailable'},502,origin);}
 if(!upstream.ok){console.warn('Voice transcription upstream status:',upstream.status);return out({error:upstream.status===429?'speech_provider_rate_limit':'speech_provider_failed'},upstream.status===429?429:502,origin);}
 const payload=await upstream.json().catch(()=>null);
 const transcript=String(payload?.text||'').trim().slice(0,350);
 return out({text:transcript,empty:!transcript},200,origin);
});