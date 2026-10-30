/* AI360 staff Android safe launcher · #139.
   No module network load, microphone, data fetch, or AI action at CRM login.
   User explicitly taps; backend staff-read/dialog/STT/TTS revalidate JWT and scope.
   Director's desktop Lera remains exactly as before.
*/
(function(root){
 'use strict';
 if(root.crmAI360MobileStaff139)return;
 const native=()=>/Android/i.test(navigator.userAgent||'')&&
   root.Capacitor?.isNativePlatform?.()===true&&
   root.Capacitor?.getPlatform?.()==='android';
 if(!native())return;
 let button=null,busy=false,ready=false,scriptPromise=null;
 const roles=new Set(['branch_director','field_manager','triovist_category']);
 const identity=()=>root.crmAI360StaffIdentityV1?.()||null;
 function permitted(){
  try{
   const app=document.getElementById('app'),p=identity();
   return !!app&&app.style.display!=='none'&&p&&roles.has(p.tier)&&
    typeof currentUser!=='undefined'&&p.id===currentUser?.id;
  }catch(_){return false;}
 }
 function notice(message,bad=false){
  if(!button)return;
  button.title=String(message||'').slice(0,180);
  button.setAttribute('aria-label',button.title);
  if(bad)button.textContent='🎙 Лера · повторить';
 }
 function load(file){
  return new Promise((resolve,reject)=>{
   const script=document.createElement('script');
   script.defer=false;script.async=false;
   script.src='./assets/'+file;
   script.onload=()=>resolve(true);
   script.onerror=()=>reject(Error('Не удалось загрузить '+file.split('?')[0]));
   document.body.append(script);
  });
 }
 async function activate(){
  if(busy||!permitted())return;
  if(ready&&root.crmAI360BranchVoicePilotV1?.allowed()){
   void root.crmAI360BranchVoicePilotV1.open();
   return;
  }
  if(scriptPromise)return;
  busy=true;button.disabled=true;
  button.textContent='🎙 Подключаем Леру…';
  const expected=identity()?.id;
  root.__resantaAI360AndroidStaffOptIn=true;
  try{
   // Premium audio and shared conversation are optional. Text-only questions
   // remain available if a particular WebView cannot use audio capture.
   for(const file of [
    '146-resanta-ai360-branch-premium-voice-v1.js?v=4',
    '147-resanta-ai360-staff-unified-dialog-v1.js?v=4'
   ]){
    if(!permitted()||identity()?.id!==expected)throw Error('Сессия CRM изменилась');
    try{await load(file);}
    catch(e){console.warn('Optional staff voice component:',e);}
   }
   if(!permitted()||identity()?.id!==expected)throw Error('Сессия CRM изменилась');
   await load('144-resanta-ai360-branch-voice-v1.js?v=9');
   if(!root.crmAI360BranchVoicePilotV1?.allowed())throw Error('Нет доступа к помощнику сотрудника');
   ready=true;
   button.textContent='🎙 Лера';
   notice('Открыть Леру. Данные — только разрешённые вашим доступом CRM.');
   await root.crmAI360BranchVoicePilotV1.open();
  }catch(e){
   notice(e?.message||'Лера сейчас недоступна',true);
  }finally{
   scriptPromise=null;
   busy=false;button.disabled=false;
  }
 }
 function paint(){
  if(!native())return;
  if(!button){
   button=document.createElement('button');button.type='button';
   button.className='rsa-mobile-voice-launch';
   button.textContent='🎙 Лера';
   button.style.cssText=[
    'position:fixed','right:12px','bottom:calc(80px + env(safe-area-inset-bottom,0px))',
    'z-index:900','padding:10px 12px','border:1px solid #2a76b3',
    'border-radius:24px','color:#124a78','background:#e9f5ff',
    'box-shadow:0 4px 14px #082d4555','font-size:13px',
    'font-weight:700','cursor:pointer'
   ].join(';');
   button.addEventListener('click',()=>void activate());
   document.body.append(button);
  }
  button.hidden=!permitted();
  if(!permitted()&&ready){
   root.crmAI360BranchPremiumVoiceV1?.stop?.();
   root.crmAI360BranchVoicePilotV1?.close?.();
  }
 }
 const init=()=>{
  paint();
  root.setInterval(paint,4000);
  const app=document.getElementById('app');
  if(app&&typeof MutationObserver!=='undefined'){
   const watch=new MutationObserver(paint);
   watch.observe(app,{attributes:true,attributeFilter:['style']});
  }
 };
 root.crmAI360MobileStaff139={activate,paint};
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
 else init();
})(window);