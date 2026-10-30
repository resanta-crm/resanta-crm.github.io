/* RESANTA CONNECT #138: native Android FCM registration (staged until Firebase setup).
 * No background permissions requested without an explicit user click.
 * Authorization and device ownership are enforced by connect_push_register_v1.
 */
(function(){
 'use strict';
 if(window.crmConnectPush138)return;
 const $=id=>document.getElementById(id);
 let setup=false,registered=false,registering=false,currentToken=null,registeredUser=null;
 const push=()=>window.Capacitor?.Plugins?.PushNotifications||null;
 const native=()=>window.Capacitor?.isNativePlatform?.()===true&&window.Capacitor?.getPlatform?.()==='android';
 const dbClient=()=>typeof db!=='undefined'?db:null;
 const profile=()=>typeof currentProfile!=='undefined'?currentProfile:null;
 const status=(s,bad)=>{const t=$('c138-status');if(t){t.textContent=String(s);t.style.color=bad?'#b42318':'#1763a3';}};
 function buildButton(){
  if(!native()||!push()||$('c138-enable'))return;
  const bar=$('page-connect')?.querySelector('.c126-top');
  if(!bar)return;
  const b=document.createElement('button');b.type='button';b.id='c138-enable';
  b.className='c126-btn';b.textContent='🔔 Push на Android';
  b.addEventListener('click',enable);
  const txt=document.createElement('span');txt.id='c138-status';txt.className='c138-status';
  bar.append(b,txt);
 }
 async function checkRights(id){
  const client=dbClient();
  if(!client)throw Error('CRM ещё не загружена.');
  const auth=await client.auth.getUser();
  if(auth.error||auth.data?.user?.id!==id||profile()?.id!==id)throw Error('Войдите в CRM.');
  const right=await client.from('connect_permissions_v1').select('chat_enabled')
    .eq('user_id',id).maybeSingle();
  if(right.error||!right.data?.chat_enabled)throw Error('У вас нет права на чаты CONNECT.');
  return client;
 }
 async function saveToken(token){
  const id=profile()?.id;
  if(!token||!id)return;
  const client=await checkRights(id);
  const result=await client.rpc('connect_push_register_v1',{p_token:token});
  if(result.error)throw result.error;
  registeredUser=id;currentToken=token;registered=true;
  status('Push-уведомления подключены к вашей учётной записи.');
 }
 async function enable(){
  if(registering)return;
  registering=true;const btn=$('c138-enable');if(btn)btn.disabled=true;
  try{
   if(!native()||!push())throw Error('Эта функция доступна в обновлённом Android APK.');
   const id=profile()?.id;if(!id)throw Error('Сначала войдите в CRM.');
   await checkRights(id);
   await listeners();
   const permission=await push().requestPermissions();
   if(permission.receive!=='granted')throw Error('Уведомления запрещены в настройках Android.');
   await push().createChannel?.({id:'resanta_connect',name:'РЕСАНТА CONNECT',
     description:'Сообщения и входящие вызовы',importance:4,visibility:1,
     vibration:true});
   status('Получаем разрешённый Firebase-токен устройства…');
   await push().register();
  }catch(e){status(String(e?.message||e),true);}
  finally{registering=false;if(btn)btn.disabled=false;}
 }
 async function listeners(){
  if(setup||!push())return;
  setup=true;
  await push().addListener('registration',async result=>{
   try{await saveToken(result.value);}catch(e){status('Не удалось зарегистрировать устройство: '+String(e?.message||e),true);}
  });
  await push().addListener('registrationError',()=>status('Не удалось подключить Firebase на этом телефоне.',true));
  await push().addListener('pushNotificationActionPerformed',result=>{
   const info=result?.notification?.data||{};
   const id=String(info.room_id||'');
   if(/^[0-9a-f-]{36}$/i.test(id)&&profile()?.id){
    window.crmConnectOpenRoom136?.(id,info.kind==='video_call');
   }
  });
 }
 async function beforeSignOut(){
  const token=currentToken;
  if(token&&dbClient()){
   // Best-effort remove CRM server delivery target BEFORE Supabase revokes the JWT.
   try{await dbClient().rpc('connect_push_unregister_v1',{p_token:token});}catch(_){}
  }
  registered=false;registeredUser=null;currentToken=null;
  try{await push()?.unregister?.();}catch(_){}
  status('Push отключены после выхода из CRM.');
 }
 async function onSignedOut(){
  // When account sessions disappear unexpectedly, at least remove native Firebase token.
  if(registered)await beforeSignOut();
 }
 function init(){
  if(!native()||!push())return;
  buildButton();
  // Register click handlers on every APK startup, not only after requesting permission.
  // This permits notification taps to open the chat when Android resumes a closed WebView.
  listeners().catch(()=>{});
  const app=$('app');
  if(app&&typeof MutationObserver!=='undefined'){
   const observer=new MutationObserver(()=>{if(app.style.display==='none')onSignedOut();else buildButton();});
   observer.observe(app,{attributes:true,attributeFilter:['style']});
  }
  const client=dbClient();
  if(client?.auth?.onAuthStateChange){
   client.auth.onAuthStateChange((event)=>{
    if(event==='SIGNED_OUT')onSignedOut();
   });
  }
 }
 async function sendForMessage(messageId){
  if(!messageId||!dbClient())return;
  try{
   const result=await dbClient().functions.invoke('connect-fcm-send',{body:{message_id:messageId}});
   // Sending push must never interrupt chat or call invitation delivery.
   if(result.error)console.warn('CONNECT push dispatch unavailable');
  }catch(_){console.warn('CONNECT push dispatch temporarily unavailable');}
 }
 window.crmConnectPush138={init,sendForMessage,beforeSignOut};
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
 else init();
})();