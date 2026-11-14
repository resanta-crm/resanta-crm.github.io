/* CONNECT-only push worker. No fetch handler, no CRM caching or login interception. */
const DB='resanta-connect-push-v2';
function state(write){return new Promise((resolve,reject)=>{const r=indexedDB.open(DB,1);r.onupgradeneeded=()=>r.result.createObjectStore('state');r.onerror=()=>reject(r.error);r.onsuccess=()=>{const db=r.result;const t=db.transaction('state',write===undefined?'readonly':'readwrite'),s=t.objectStore('state');const q=write===undefined?s.get('binding'):s.put(write,'binding');q.onsuccess=()=>{const value=q.result;t.oncomplete=()=>{db.close();resolve(value);};};t.onerror=()=>{db.close();reject(t.error);};};});}
self.addEventListener('install',e=>e.waitUntil(self.skipWaiting()));
self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));
self.addEventListener('message',e=>{if(e.data?.type==='CONNECT_BIND')e.waitUntil(state({account_id:String(e.data.account_id||''),device_id:String(e.data.device_id||'')}));});
self.addEventListener('push',e=>e.waitUntil((async()=>{
 let d;try{d=e.data?.json();}catch(_){return;}
 const binding=await state();if(!d||!binding?.account_id||d.account_id!==binding.account_id||Date.parse(d.expires_at)<=Date.now())return;
 if(d.room_id&&!/^[0-9a-f-]{36}$/i.test(d.room_id))return;
 const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});
 // A focused CRM page owns the in-app banner; background notifications are owned here.
 let focused=false;for(const c of windows){if(new URL(c.url).origin!==self.location.origin)continue;c.postMessage({type:'CONNECT_PUSH',payload:d});if(c.focused&&c.visibilityState==='visible')focused=true;}
 if(focused&&d.kind!=='test')return;
 await self.registration.showNotification(d.title||'РЕСАНТА CONNECT',{body:d.body||'Новое событие',tag:'connect-'+(d.message_id||d.delivery_id),data:d,renotify:false,requireInteraction:d.kind==='video_call'});
})()));
self.addEventListener('notificationclick',e=>{e.notification.close();e.waitUntil((async()=>{
 const d=e.notification.data||{},binding=await state();if(!binding?.account_id||binding.account_id!==d.account_id)return;
 const params=new URLSearchParams({connect_room:d.room_id||'',connect_account:d.account_id||'',connect_call:d.call_id||'',connect_test:d.kind==='test'?d.delivery_id||'':''});
 const url=self.location.origin+'/?'+params;
 const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});
 const c=windows.find(w=>new URL(w.url).origin===self.location.origin);
 if(c){c.postMessage({type:'CONNECT_OPEN',payload:d});await c.focus();}else await self.clients.openWindow(url);
})());});
