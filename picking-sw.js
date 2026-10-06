const CACHE='resanta-picking-v236222';
const STATIC=['/picking.html','/picking-manifest.webmanifest','/picking-icon.svg'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(STATIC)).then(()=>self.skipWaiting()))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('resanta-picking-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',e=>{
 if(e.request.method!=='GET')return;
 const u=new URL(e.request.url);
 if(u.origin!==location.origin)return;
 if(u.pathname==='/picking.html'){
   e.respondWith(fetch(e.request,{cache:'no-store'}).catch(()=>caches.match('/picking.html')));
   return;
 }
 if(['/picking-manifest.webmanifest','/picking-icon.svg'].includes(u.pathname)){
   e.respondWith(fetch(e.request,{cache:'no-store'}).then(r=>{const cp=r.clone();caches.open(CACHE).then(c=>c.put(e.request,cp)).catch(()=>{});return r}).catch(()=>caches.match(e.request)));
 }
});
