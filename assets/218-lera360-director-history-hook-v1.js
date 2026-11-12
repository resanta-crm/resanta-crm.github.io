/* Director/peer Lera history entry - no changes to voice or lazy loader.
 * Hooks the already-authorized user click on the AI panel, never auto-opens,
 * records voice, makes database calls or exposes other people's transcripts.
 */
(function(root){
 'use strict';
 if(root.crmAI360DirectorHistoryHookV1)return;
 root.crmAI360DirectorHistoryHookV1=true;
 const DIRECTORS=new Set([
  '544fb1e2-ef70-44de-bc62-e0e1596a4bfc',
  'a24954b8-2fe1-4852-b629-d8f351e1bd36'
 ]);
 function eligible(){
  try{
   const p=root.crmAI360GreetingV1?.();
   return !!p&&DIRECTORS.has(p.id)&&
    typeof currentUser!=='undefined'&&currentUser?.id===p.id&&
    document.getElementById('app')?.style.display!=='none';
  }catch{return false;}
 }
 // Existing voice panel is assembled by its own lazy loader. Only attach the
 // history control after the user's explicit open click has finished.
 document.addEventListener('click',ev=>{
  if(!ev.target?.closest?.('.rva-launch')||!eligible())return;
  root.setTimeout(()=>{
   const panel=document.querySelector('.rva-window');
   const slot=panel?.querySelector('.rva-control');
   if(!panel||panel.hidden||!slot||!eligible())return;
   root.crmAI360HistoryUIV1?.mount(slot,{allowed:()=>eligible()&&!panel.hidden});
  },0);
 },true);
})(window);
