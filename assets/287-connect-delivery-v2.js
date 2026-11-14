/* CONNECT v2: explicit per-browser enrollment. No automatic permission prompts. */
(function(){'use strict';if(window.crmConnectDeliveryV2)return;
const $=id=>document.getElementById(id),dbClient=()=>typeof db!=='undefined'?db:null,profile=()=>typeof currentProfile!=='undefined'?currentProfile:null;
const muted=new Set();
let registration=null,deviceId=null,boundAccount=null,busy=false,bootActor=null,pendingOpen=null;
const api=async(action,body={})=>{const r=await dbClient().functions.invoke('connect-delivery-v2',{body:{action,...body},signal:AbortSignal.timeout(12000)});if(r.error||!r.data?.ok)throw Error(r.data?.error||'Сервис уведомлений временно недоступен');return r.data;};
const supported=()=>!!navigator.serviceWorker&&typeof PushManager!=='undefined'&&typeof Notification!=='undefined'&&window.isSecureContext;
function bind(account='',device=''){registration?.active?.postMessage({type:'CONNECT_BIND',account_id:account,device_id:device});}
async function worker(){if(registration?.active)return registration;registration=await navigator.serviceWorker.register('/connect-push-sw.js?v=20261114-v2',{scope:'/connect-push/'});if(!registration.active)await new Promise((resolve,reject)=>{const w=registration.installing||registration.waiting;if(!w)return reject(Error('Не удалось запустить push'));const timer=setTimeout(()=>reject(Error('Push пока не активирован')),12000);w.addEventListener('statechange',()=>{if(w.state==='activated'){clearTimeout(timer);resolve();}if(w.state==='redundant'){clearTimeout(timer);reject(Error('Push не активирован'));}});});return registration;}
function b64(s){const raw=atob(s.replace(/-/g,'+').replace(/_/g,'/'));return Uint8Array.from(raw,c=>c.charCodeAt(0));}
async function enroll(prompt=false){
 const actor=profile()?.id;if(!actor)throw Error('Войдите в CRM');if(!supported())throw Error('Фоновый push недоступен в этом браузере. В APK используйте «Push на Android».');
 if(prompt){const p=await Notification.requestPermission();if(p!=='granted')throw Error('Разрешите уведомления для resanta-crm.by в настройках браузера.');}
 if(Notification.permission!=='granted')throw Error('Уведомления браузера не разрешены');
 const config=await api('config');if(!config.public_key)throw Error('Сервер push ещё настраивается');
 const reg=await worker();let sub=await reg.pushManager.getSubscription();
 if(!sub&&!prompt)return false;if(!sub)sub=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:b64(config.public_key)});
 if(profile()?.id!==actor){await sub.unsubscribe();throw Error('Учётная запись изменилась');}
 const result=await api('register',{subscription:sub.toJSON(),label:((navigator.userAgent||'').includes('Mac')?'Mac · ':'ПК · ')+((navigator.userAgent||'').includes('YaBrowser')?'Яндекс':(navigator.userAgent||'').includes('Edg')?'Edge':(navigator.userAgent||'').includes('Chrome')?'Chrome':'Браузер')});
 if(profile()?.id!==actor){await api('unregister',{device_id:result.device_id}).catch(()=>{});await sub.unsubscribe();throw Error('Учётная запись изменилась');}
 deviceId=result.device_id;boundAccount=actor;bind(actor,deviceId);return true;
}
function line(text){const e=document.createElement('p');e.textContent=text;return e;}
function button(text,fn){const b=document.createElement('button');b.type='button';b.className='c126-btn';b.textContent=text;b.addEventListener('click',fn);return b;}
async function panel(){
 let overlay=$('c216-notification-panel');if(!overlay){overlay=document.createElement('div');overlay.id='c216-notification-panel';overlay.className='c216-notification-panel';overlay.setAttribute('role','dialog');overlay.setAttribute('aria-modal','true');overlay.setAttribute('aria-label','Уведомления CONNECT');$('app')?.append(overlay);}
 overlay.hidden=false;overlay.replaceChildren();overlay.addEventListener('keydown',e=>{if(e.key==='Escape')overlay.hidden=true;},{once:true});
 const title=document.createElement('h3');title.textContent='Уведомления CONNECT';overlay.append(title,button('Закрыть',()=>{overlay.hidden=true;}));
 const info=line('Проверяем подключение…');info.setAttribute('role','status');overlay.append(info);
 const actor=profile()?.id;
 overlay.append(button('Подключить этот браузер',async()=>{if(busy)return;busy=true;try{await enroll(true);await panel();}catch(e){info.textContent=e.message;}finally{busy=false;}}));
 overlay.append(button('Проверить на этом устройстве',async()=>{if(busy)return;busy=true;try{if(!deviceId||boundAccount!==actor)throw Error('Сначала подключите этот браузер');const r=await api('test',{device_id:deviceId});info.textContent='Проверка поставлена в очередь. Нажмите полученное уведомление, чтобы подтвердить получение.';pendingTest=r.delivery_id;}catch(e){info.textContent=e.message;}finally{busy=false;}}));
 overlay.append(button('Отключить этот браузер',async()=>{await cleanup();await panel();}));
 const sound=document.createElement('label'),input=document.createElement('input');input.type='checkbox';input.checked=localStorage.getItem('connect-sound:'+actor)==='on';input.addEventListener('change',()=>{localStorage.setItem('connect-sound:'+actor,input.checked?'on':'off');if(input.checked)playSound();});sound.append(input,document.createTextNode(' Звук входящих звонков при открытой CRM'));overlay.append(sound);
 const list=document.createElement('div');overlay.append(list);
 try{const data=await api('status');if(profile()?.id!==actor)return;info.textContent=!supported()?'Браузерный push не поддерживается здесь.':Notification.permission==='denied'?'Уведомления запрещены. Разрешите их для resanta-crm.by в настройках браузера.':deviceId&&data.devices.some(x=>x.id===deviceId)?'Этот браузер подключён. Показ также зависит от настроек уведомлений ОС и режима «Не беспокоить».':'Этот браузер не подключён к фоновым уведомлениям.';
  list.append(line('Android-устройств: '+data.native_devices));for(const d of data.devices)list.append(line(d.label+(d.id===deviceId?' · это устройство':'')));
  if(!data.deliveries.length)list.append(line('Отправок пока нет.'));
  for(const d of data.deliveries.slice(0,8)){const state=d.confirmed_at?'Получение теста подтверждено':({pending:'В очереди',sending:'Отправляется',sent:'Принято провайдером',failed:'Ошибка отправки',unknown:'Результат неизвестен',no_device:'Нет подключённого устройства',cancelled:'Отменено / срок истёк'}[d.status]||d.status);list.append(line(new Date(d.created_at).toLocaleString('ru-RU')+' · '+d.channel+' · '+state));}
 }catch(e){info.textContent=e.message;}
}
let pendingTest=null,soundContext=null;
async function cleanup(){const id=deviceId;bind();deviceId=null;boundAccount=null;bootActor=null;
 try{if(id&&profile()?.id)await api('unregister',{device_id:id});}catch(_){}
 try{await(await registration?.pushManager.getSubscription())?.unsubscribe();}catch(_){}
}
function playSound(){try{const A=window.AudioContext||window.webkitAudioContext;if(!A)return;const c=soundContext||(soundContext=new A());void c.resume();const o=c.createOscillator(),g=c.createGain();o.connect(g);g.connect(c.destination);g.gain.value=.08;o.frequency.value=620;o.start();o.stop(c.currentTime+.3);o.onended=()=>{o.disconnect();g.disconnect();};}catch(_){} }
async function openPayload(d){
 if(!profile()?.id){pendingOpen=d;return;}
 if(d.account_id&&d.account_id!==profile().id)return;
 if(d.kind==='test'&&d.delivery_id){await api('confirm',{delivery_id:d.delivery_id}).catch(()=>{});pendingTest=null;await panel();return;}
 if(d.room_id)await window.crmConnectOpenRoom136?.(d.room_id,false);
 if(d.call_id&&d.room_id){const r=await dbClient().rpc('connect_call_action_v2',{p_room_id:d.room_id,p_call_id:d.call_id,p_action:'get'});if(r.data?.call&&['ringing','active'].includes(r.data.call.status))window.crmConnectNotify128?.incoming?.({...d,id:d.message_id||d.delivery_id,body:'📹 Начался видеозвонок',sender_id:'incoming'});}
}
async function resume(){
 if(!profile()?.id||$('app')?.style?.display==='none'){if(boundAccount)void cleanup();return;}
 const actor=profile().id;if(bootActor===actor)return;bootActor=actor;muted.clear();try{const r=await dbClient().from('connect_preferences_v2').select('room_id,muted').eq('user_id',actor);if(profile()?.id===actor)for(const p of r.data||[])if(p.muted)muted.add(p.room_id);}catch(_){}
 if(supported()&&Notification.permission==='granted')try{await enroll(false);}catch(_){}
 if(pendingOpen){const d=pendingOpen;pendingOpen=null;await openPayload(d);}
}
function init(){
 navigator.serviceWorker?.addEventListener('message',e=>{const d=e.data?.payload;if(e.data?.type==='CONNECT_OPEN')void openPayload(d);else if(e.data?.type==='CONNECT_PUSH'&&d?.account_id===profile()?.id){if(d.kind==='test'){pendingTest=d.delivery_id;return;}window.crmConnectNotify128?.incoming?.({...d,id:d.message_id||d.delivery_id,sender_id:'incoming',body:d.kind==='video_call'?'📹 Начался видеозвонок':''});}});
 const query=new URLSearchParams(location.search);if(query.has('connect_account')){pendingOpen={account_id:query.get('connect_account'),room_id:query.get('connect_room'),call_id:query.get('connect_call'),kind:query.get('connect_test')?'test':'message',delivery_id:query.get('connect_test')};for(const k of ['connect_account','connect_room','connect_call','connect_test'])query.delete(k);history.replaceState(null,'',location.pathname+(query.size?'?'+query:'')+location.hash);}
 const root=$('app');if(root)new MutationObserver(resume).observe(root,{attributes:true,attributeFilter:['style']});
 const client=dbClient();if(client?.auth){client.auth.onAuthStateChange((event)=>{if(event==='SIGNED_OUT'){bind();deviceId=null;boundAccount=null;bootActor=null;}else setTimeout(resume,0);});const original=client.auth.signOut.bind(client.auth);client.auth.signOut=async(...args)=>{await Promise.race([cleanup(),new Promise(r=>setTimeout(r,5000))]);await Promise.race([window.crmConnectPush138?.beforeSignOut?.(),new Promise(r=>setTimeout(r,5000))]);return original(...args);};}
 void resume();
}
window.crmConnectDeliveryV2={panel,cleanup,isMuted:id=>muted.has(id),setMuted:(id,value)=>{if(value)muted.add(id);else muted.delete(id);},isSubscribed:()=>!!deviceId&&boundAccount===profile()?.id,playSound:()=>{if(localStorage.getItem('connect-sound:'+profile()?.id)==='on')playSound();},testReceived:()=>pendingTest};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
