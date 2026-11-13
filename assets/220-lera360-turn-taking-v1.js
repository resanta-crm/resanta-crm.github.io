/* Lera 360 speech turn-taking: deterministic, local, no network or microphone.
   Maintains incomplete clauses across STT clips. Listening consent belongs to
   the existing owner/staff voice engines. */
(function(root){
'use strict';
if(root.crmAI360TurnTakingV1)return;
const MORE=/((?:^|[\s,;:—-])(?:и|а|но|если|когда|который|которая|которые|что|чтобы|потому|поэтому|например|вот|это|хочу|хотел|хотела|надо|нужно|можешь|можете|давай|значит|смотри|прошу|пожалуйста|встреча\s+с|с\s+клиентом\s+по|с\s+клиентом\s+и|потому\s+что|дело\s+в\s+том|я\s+бы|мы\s+бы)\s*[,—-]?\s*$)/i;
const MORE_COMMAND=/^(?:подожди|я\s+(?:ещ[её]\s+)?не\s+закончил[а]?|я\s+(?:ещ[её]\s+)?говорю|слушай\s+дальше|дай\s+договорить|не\s+перебивай|секунду)\s*[.!?]*$/i;
const END_COMMAND=/^(?:вс[её]\s*[,.]?\s*теперь\s+отвечай|я\s+закончил[а]?|вс[её]\s*[,.]?\s*отвечай)\s*[.!?]*$/i;
const CANCEL_COMMAND=/^(?:отмена|отбой|не\s+надо|забудь)\s*[.!?]*$/i;
const norm=x=>String(x||'').trim().replace(/\s+/g,' ');
function detect(text){
 const s=norm(text).toLocaleLowerCase('ru-RU');
 if(!s)return 'empty';
 if(CANCEL_COMMAND.test(s))return 'cancel';
 if(MORE_COMMAND.test(s))return 'more';
 if(END_COMMAND.test(s))return 'done';
 if(MORE.test(s)||/[,:;—-]\s*$/.test(s))return 'more';
 if(/^(?:ну\s+)?(?:смотри|лера)[,!\s]+.{0,18}$/.test(s)&&!/[?!.]$/.test(s))return 'more';
 return 'ready';
}
function merge(...parts){
 let out='';
 for(const part of parts){
  const s=norm(part);if(!s)continue;
  if(!out){out=s;continue;}
  if(out.toLocaleLowerCase('ru-RU').endsWith(s.toLocaleLowerCase('ru-RU')))continue;
  const sep=/[,;:—-]\s*$/.test(out)?' ':' ';
  out+=sep+s;
 }
 return out.slice(0,2400);
}
function removeWake(s){
 return norm(s).replace(/^(?:(?:привет[\s,!.?—-]+)?(?:лера|ресанта|резанта|рясанта|рисанта))(?=$|[\s,.!?—-])[\s,.!?—-]*/i,'');
}
function isolatedWake(s){
 return /^(?:(?:привет[\s,!.?—-]+)?(?:лера|ресанта|резанта|рясанта|рисанта)|али|алё|алло)[\s,.!?—-]*$/i.test(norm(s));
}
// Start capturing the continuation BEFORE awaiting the preceding STT request.
// Injected callbacks retain ownership/consent in the existing voice engine.
async function collect(first,{capture,transcribe,isCurrent=()=>true,onStatus=()=>{},maxSegments=8}){
 let clip=first,result='';
 for(let n=0;n<maxSegments;n++){
  if(!isCurrent())return null;
  let recognized=false;
  const tail=Promise.resolve(capture({idleMs:1200,canStopIdle:()=>recognized})).then(clip=>({clip}),error=>({error}));
  let text,recognitionError;
  try{text=await transcribe(clip);}catch(error){recognitionError=error;}finally{recognized=true;}
  const captured=await tail;
  if(recognitionError)throw recognitionError;
  if(captured.error)throw captured.error;
  const next=captured.clip;
  if(!isCurrent()||text===null)return null;
  const decision=detect(text);
  if(decision==='cancel')return '';
  if(decision==='done')return result;
  if(text&&decision!=='more')result=merge(result,text);
  else if(text&&!MORE_COMMAND.test(norm(text)))result=merge(result,text);
  if(!next?.loud)return result;
  if(n===maxSegments-1){onStatus('Фраза длинная. Продолжение не отправлено: повтори вопрос короче.');return null;}
  onStatus('Слушаю продолжение фразы…');clip=next;
 }
 return result;
}
root.crmAI360TurnTakingV1=Object.freeze({detect,merge,removeWake,isolatedWake,collect,
 pauseMs:3300,maxSegments:8});
})(window);
