import { createClient } from 'npm:@supabase/supabase-js@2.56.0';

const ORIGINS = new Set(['https://resanta-crm.by','https://www.resanta-crm.by']);
const cors = (origin:string|null) => ({
 'Access-Control-Allow-Origin':ORIGINS.has(String(origin))?String(origin):'https://resanta-crm.by',
 'Access-Control-Allow-Headers':'authorization,apikey,x-client-info,content-type',
 'Access-Control-Allow-Methods':'OPTIONS,POST','Vary':'Origin'
});
function json(data:unknown,status=200,origin:string|null=null) {
 return new Response(JSON.stringify(data),{status,headers:{...cors(origin),'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}});
}
const VOICES = new Set(['lera','dasha']);
function b64Bytes(value:string):Uint8Array {
 const raw=atob(value), buffer=new Uint8Array(raw.length);
 for(let i=0;i<raw.length;i++)buffer[i]=raw.charCodeAt(i);
 return buffer;
}
function audioParts(body:string):Uint8Array[] {
 const chunks:Uint8Array[]=[];
 const candidates:any[]=[];
 try {
   const obj=JSON.parse(body);
   if(Array.isArray(obj))candidates.push(...obj);
   else candidates.push(obj);
 } catch {
   for(const line of body.split(/\r?\n/)){
      const trimmed=line.trim();
      if(!trimmed)continue;
      try{candidates.push(JSON.parse(trimmed));}catch{}
   }
 }
 for(const c of candidates){
   const data=c?.result?.audioChunk?.data||c?.audioChunk?.data;
   if(typeof data==='string' && data.length)chunks.push(b64Bytes(data));
 }
 return chunks;
}
Deno.serve(async(req:Request)=>{
 const origin=req.headers.get('Origin');
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers:cors(origin)});
 if(req.method!=='POST')return json({error:'method_not_allowed'},405,origin);
 if(origin && !ORIGINS.has(origin))return json({error:'origin_not_allowed'},403,origin);
 const authorization=req.headers.get('Authorization')||'';
 const token=authorization.startsWith('Bearer ')?authorization.slice(7):'';
 if(!token||token.length>6000)return json({error:'unauthorized'},401,origin);
 const url=Deno.env.get('SUPABASE_URL')||'';
 const serviceKey=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'';
 if(!url||!serviceKey)return json({error:'service_not_configured'},503,origin);
 const supabase=createClient(url,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});
 const authRes=await supabase.auth.getUser(token).catch(()=>null);
 const user=authRes?.data?.user;
 if(!user?.id||!user.email)return json({error:'unauthorized'},401,origin);
 const {data:profile,error:profileError}=await supabase.from('users').select('name,role')
   .eq('email',user.email.trim().toLowerCase()).maybeSingle();
 const name=String(profile?.name||'').trim().replace(/\s+/g,' ').toLocaleLowerCase('ru-RU');
 if(profileError||profile?.role!=='boss'||name!=='александр паюшин')return json({error:'forbidden'},403,origin);
 let payload:any;
 try{payload=await req.json();}catch{return json({error:'invalid_json'},400,origin);}
 const apiKey=Deno.env.get('YANDEX_SPEECHKIT_API_KEY')||'';
 const folderId=Deno.env.get('YANDEX_CLOUD_FOLDER_ID')||'';
 if(payload?.kind==='status')return json({configured:!!apiKey,voices:['lera','dasha'],engine:'Yandex SpeechKit v3 general'},200,origin);
 if(!apiKey)return json({error:'yandex_credentials_required'},503,origin);
 const voice=String(payload?.voice||'');
 const text=String(payload?.text||'').trim();
 if(!VOICES.has(voice))return json({error:'invalid_voice'},400,origin);
 if(text.length<1||text.length>240)return json({error:'text_length_240'},400,origin);
 const claim=await supabase.rpc('crm_voice_yandex_tts_claim_v2',{p_user_id:user.id,p_characters:text.length});
 if(claim.error)return json({error:'quota_unavailable'},503,origin);
 if(!claim.data)return json({error:'tts_daily_limit'},429,origin);
 const headers:Record<string,string>={'Authorization':'Api-Key '+apiKey,'Content-Type':'application/json'};
 if(folderId)headers['x-folder-id']=folderId;
 let upstream:Response;
 try{
  upstream=await fetch('https://tts.api.cloud.yandex.net/tts/v3/utteranceSynthesis',{
   method:'POST',headers,signal:AbortSignal.timeout(26000),
   body:JSON.stringify({text,model:'general',hints:[{voice},{role:'friendly'}]})
  });
 }catch(e){
  console.warn('Yandex SpeechKit network failure',String(e).slice(0,100));
  return json({error:'yandex_unavailable'},502,origin);
 }
 if(!upstream.ok){
  console.warn('Yandex SpeechKit status',upstream.status);
  return json({error:upstream.status===401||upstream.status===403?'yandex_credentials_invalid':'yandex_provider_failed'},upstream.status===401||upstream.status===403?503:502,origin);
 }
 const responseText=await upstream.text();
 if(responseText.length>6500000)return json({error:'yandex_audio_too_large'},502,origin);
 let pieces:Uint8Array[]=[];
 try{pieces=audioParts(responseText);}catch{return json({error:'yandex_audio_invalid'},502,origin);}
 const size=pieces.reduce((n,x)=>n+x.byteLength,0);
 if(!size||size>1800000)return json({error:'yandex_audio_empty_or_large'},502,origin);
 const output=new Uint8Array(size);
 let offset=0;for(const part of pieces){output.set(part,offset);offset+=part.length;}
 return new Response(output,{status:200,headers:{...cors(origin),'Content-Type':'application/octet-stream','X-Audio-Content-Type':'audio/wav','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
});