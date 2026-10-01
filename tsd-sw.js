const CACHE='resanta-tsd-hub-v236196';
const STATIC=['/tsd.html','/tsd-manifest.webmanifest','/inventory-icon.svg'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(STATIC)).then(()=>self.skipWaiting()))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('resanta-tsd-hub-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',e=>{
 if(e.request.method!=='GET')return;
 const u=new URL(e.request.url);
 if(u.origin!==location.origin)return;
 if(u.pathname==='/tsd.html'){
   e.respondWith(fetch(e.request,{cache:'no-store'}).catch(()=>caches.match('/tsd.html')));
   return;
 }
 if(u.pathname==='/tsd-manifest.webmanifest'){
   e.respondWith(fetch(e.request,{cache:'no-store'}).catch(()=>caches.match('/tsd-manifest.webmanifest')));
 }
});