const CACHE='resanta-tsd-hub-v236247';
const STATIC=['/tsd/','/tsd/manifest.webmanifest','/inventory-icon.svg'];
self.addEventListener('install',e=>{
 e.waitUntil(caches.open(CACHE).then(c=>c.addAll(STATIC)).then(()=>self.skipWaiting()))
});
self.addEventListener('activate',e=>{
 e.waitUntil(caches.keys().then(keys=>Promise.all(
  keys.filter(k=>k.startsWith('resanta-tsd-hub-')&&k!==CACHE).map(k=>caches.delete(k))
 )).then(()=>self.clients.claim()))
});
self.addEventListener('fetch',e=>{
 if(e.request.method!=='GET')return;
 const u=new URL(e.request.url);
 if(u.origin!==location.origin)return;

 if(u.pathname==='/tsd/'||u.pathname==='/tsd/index.html'){
  e.respondWith((async()=>{
    const cache=await caches.open(CACHE);
    const cached=await cache.match('/tsd/');
    const refresh=fetch('/tsd/',{cache:'no-store'}).then(async r=>{
      if(r&&r.ok)await cache.put('/tsd/',r.clone());
      return r;
    }).catch(()=>null);
    if(cached){refresh.catch(()=>{});return cached}
    const timeout=new Promise(resolve=>setTimeout(()=>resolve(null),1200));
    const net=await Promise.race([refresh,timeout]);
    if(net)return net;
    return new Response('<!doctype html><meta charset="utf-8"><script>location.replace("/tsd.html?v=247&entry=sw-fallback&ts="+Date.now())<\/script>',{
      headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store'}
    })
  })());
  return
 }
 if(u.pathname==='/tsd/manifest.webmanifest'){
  e.respondWith(fetch(e.request,{cache:'no-store'}).catch(()=>caches.match(e.request)));
 }
});
