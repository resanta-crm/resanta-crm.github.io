// Safely resolve an explicit customer reference. Never trust a model-picked UUID.
const normal=x=>String(x||'').toLocaleLowerCase('ru-RU').replace(/ё/g,'е')
 .replace(/[^a-zа-я0-9]/g,'');
const ALIASES=new Map([
 ['lehomegarden','ЭльХомГарден ООО'],
 ['лехомгарден','ЭльХомГарден ООО'],
 ['эльхомгарден','ЭльХомГарден ООО']
]);
export function clientRequestedInQuestion(client,question,remembered){
 const c=normal(client),q=normal(question),m=normal(remembered);
 if(!c)return false;
 if(q.includes(c)&&c.length>=5)return true;
 if(m===c&&c.length>=5)return true;
 for(const [alias,canonical] of ALIASES){
  if(q.includes(alias)&&c===normal(canonical))return true;
  if(q.includes(alias)&&c===alias)return true;
 }
 return false;
}
export function canonicalClientTerm(client){
 const key=normal(client);
 return ALIASES.get(key)||String(client||'').trim();
}
export async function resolveClient(svc,{client,question,remembered}){
 const supplied=String(client||remembered||'').trim().slice(0,90);
 if(!supplied)return {error:'client_name_required'};
 if(!clientRequestedInQuestion(supplied,question,remembered))
  return {error:'client_not_requested',message:'Name a client explicitly'};
 const canonical=canonicalClientTerm(supplied);
 let q=svc.from('clients').select('id,name,manager_name').eq('name',canonical).limit(3);
 let r=await q;
 if(r.error)return {error:'client_directory_unavailable'};
 if(!(r.data||[]).length){
  const escaped=canonical.replace(/[%_\\]/g,'');
  if(escaped.length<5)return {error:'client_name_too_short'};
  r=await svc.from('clients').select('id,name,manager_name').ilike('name','%'+escaped+'%').limit(10);
  if(r.error)return {error:'client_directory_unavailable'};
 }
 const found=r.data||[];
 if(found.length!==1)return {error:found.length?'client_ambiguous':'client_not_found',
  candidates:found.length?found.slice(0,5).map(x=>x.name):[]};
 return {id:found[0].id,name:found[0].name,manager:found[0].manager_name};
}
