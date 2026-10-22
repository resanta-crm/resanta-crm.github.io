/* RESANTA AI360 staff recognition v1. Pure matching only, no data access or network.
 * Staff directory comes only from authenticated server and is passed by caller.
 * Ambiguous audio or names MUST NOT be silently mapped to a real employee.
 */
(function(root){
'use strict';
function norm(v){
 return String(v||'').toLocaleLowerCase('ru-RU').replace(/ё/g,'е').replace(/[^а-яa-z0-9\s-]/gi,' ').replace(/\s+/g,' ').trim();
}
function surname(full){
 return norm(full).split(' ').filter(Boolean).pop()||'';
}
function lev(a,b){
 const row=Array.from({length:b.length+1},(_,i)=>i);
 for(let i=1;i<=a.length;i++){
  let last=row[0];row[0]=i;
  for(let j=1;j<=b.length;j++){
   const previous=row[j];
   row[j]=Math.min(row[j]+1,row[j-1]+1,last+(a[i-1]===b[j-1]?0:1));
   last=previous;
  }
 }
 return row[b.length];
}
function resolve(question, directory){
 const input=norm(question);
 const persons=Array.isArray(directory)?directory.filter(p=>p&&p.role==='manager'&&surname(p.name).length>=4).slice(0,60):[];
 const words=input.split(' ').filter(Boolean);
 // A single exact surname with Russian case endings unambiguously identifies a manager.
 const exact=persons.filter(p=>{
  const name=surname(p.name);
  return words.some(w=>w===name||(w.startsWith(name)&&w.length<=name.length+3));
 });
 if(exact.length===1)return {kind:'exact',manager:exact[0].name};
 if(exact.length>1)return {kind:'ambiguous'};
 const mentionsManager=/\bменеджер[а-я]*\b/.test(input);
 const mentionMatch=input.match(/\bменеджер[а-я]*\s+(?:по\s+)?([а-я-]{4,})/);
 const candidate=mentionMatch?.[1]||null;
 if(!candidate)return {kind:'none'};
 const choices=persons.map(p=>({person:p,distance:lev(candidate,surname(p.name))}))
   .sort((a,b)=>a.distance-b.distance);
 const near=choices.filter(p=>p.distance<=2);
 if(near.length===1 && (!choices[1]||choices[1].distance>near[0].distance+1))
   return {kind:'confirm',manager:near[0].person.name,heard:candidate};
 // Observed STT 'менеджера орудия' when the speaker said 'менеджера Руднева'.
 // This is NOT auto-correction: always explicitly ask before using the name.
 if(mentionsManager && /^(орудия|орудие|орудиям)$/.test(candidate)){
  const rudnev=persons.find(p=>surname(p.name)==='руднев');
  if(rudnev)return {kind:'confirm',manager:rudnev.name,heard:candidate};
 }
 return {kind:'unknown',heard:candidate};
}
root.crmAI360StaffResolveV1={resolve,norm,surname};
})(window);
