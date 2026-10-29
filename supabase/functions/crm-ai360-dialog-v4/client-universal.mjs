// Universal read-only customer resolver. Works for all current clients, not a preset list.
// Only a high-confidence unique match is automatically selected.
const CYR={'а':'a','б':'b','в':'v','г':'g','д':'d','е':'e','ё':'e','ж':'zh','з':'z','и':'i','й':'y','к':'k','л':'l','м':'m','н':'n','о':'o','п':'p','р':'r','с':'s','т':'t','у':'u','ф':'f','х':'h','ц':'ts','ч':'ch','ш':'sh','щ':'sch','ъ':'','ы':'y','ь':'','э':'e','ю':'yu','я':'ya'};
const fold=s=>String(s||'').toLocaleLowerCase('ru-RU').split('').map(c=>CYR[c]??c).join('')
 .replace(/[^a-z0-9]/g,'');
const trimLegal=s=>s.replace(/(?:ooo|odo|zao|chup|ip)$/,'');
const variants=name=>{
 const x=trimLegal(fold(name));const out=new Set([x]);
 if(x.startsWith('el')&&x.length>9)out.add(x.slice(2));
 if(x.startsWith('le')&&x.length>9)out.add(x.slice(2));
 for(const prefix of ['sadovyytsentr','torgovyytsentr','magazin','ooo']){
  if(x.startsWith(prefix)&&x.length>prefix.length+5)out.add(x.slice(prefix.length));
 }
 // Russian sound "Хом" vs English "Home"; drop silent 'e' for fuzzy candidates.
 if(x.includes('home'))out.add(x.replace('home','hom'));
 return [...out].filter(y=>y.length>=5);
};
function bigrams(s){const a=[];for(let i=0;i<s.length-1;i++)a.push(s.slice(i,i+2));return a;}
function dice(a,b){
 if(a===b)return 1;
 const aa=bigrams(a),bb=bigrams(b),freq=new Map();
 for(const x of aa)freq.set(x,(freq.get(x)||0)+1);
 let n=0;for(const x of bb){const c=freq.get(x)||0;if(c){n++;freq.set(x,c-1)}}
 return 2*n/(aa.length+bb.length||1);
}
function scoreText(text,key){
 if(!key||key.length<5)return 0;
 if(text.includes(key))return 1;
 let best=0;
 for(const len of [key.length-2,key.length-1,key.length,key.length+1,key.length+2]){
  if(len<5)continue;
  for(let i=0;i+len<=text.length;i++){
   const sc=dice(key,text.slice(i,i+len));
   if(sc>best)best=sc;
  }
 }
 return best;
}
export const voicedClientMatches=(question,clients)=>{
 const query=fold(question).slice(0,240);
 const ranked=(clients||[]).map(c=>{
  const keys=variants(c.name);
  return {...c,matchScore:Math.max(0,...keys.map(k=>scoreText(query,k)))};
 }).filter(x=>x.matchScore>=0.68)
 .sort((a,b)=>b.matchScore-a.matchScore||String(a.name).localeCompare(String(b.name),'ru'));
 return ranked.slice(0,6);
};
export function chooseClientMatch(question,clients,{memoryClient='',hint=''}={}){
 const ranked=voicedClientMatches(question,clients);
 const strong=ranked.filter(x=>x.matchScore>=0.78);
 const top=strong[0];
 if(top){
  if(strong.length>1&&top.matchScore-strong[1].matchScore<0.09)
   return {error:'client_ambiguous',candidates:strong.slice(0,4).map(x=>x.name)};
  return {id:top.id,name:top.name,manager:top.manager_name,method:'phonetic_directory'};
 }
 // A confirmed, server-matched client may persist across short drilldown follow-ups.
 const followup=/^\s*(?:а\s|какие|покажи|по\s+подгрупп|по\s+артикул|по\s+товар|конкретн|что\s+у\s+него|что\s+из)/i.test(String(question||''));
 const explicitOther=/(?:другого клиента|по клиенту|у клиента|по компании|у компании)/i.test(String(question||''));
 if(followup&&!explicitOther&&memoryClient){
  const matches=clients.filter(x=>fold(x.name)===fold(memoryClient));
  if(matches.length===1)return {id:matches[0].id,name:matches[0].name,manager:matches[0].manager_name,method:'confirmed_followup'};
 }
 if(ranked.length>0)return {error:'client_not_confident',candidates:ranked.slice(0,3).map(x=>x.name)};
 return {error:'client_not_found',candidates:[]};
}
export async function resolveAnyClient(svc,{question,memoryClient='',hint=''}){
 const data=await svc.from('clients').select('id,name,manager_name,is_archived,to_delete').limit(1000);
 if(data.error)return {error:'client_directory_unavailable'};
 const people=(data.data||[]).filter(x=>x.name&&!x.is_archived&&!x.to_delete);
 // Directory completeness is a correctness requirement: never silently search a truncated catalog.
 if((data.data||[]).length===1000)return {error:'client_directory_too_large'};
 return chooseClientMatch(question,people,{memoryClient,hint});
}
