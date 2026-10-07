const LEGACY_PREFIX='resanta-inventory-';
self.addEventListener('install',e=>{
 e.waitUntil(self.skipWaiting());
});
self.addEventListener('activate',e=>{
 e.waitUntil((async()=>{
  try{
   const keys=await caches.keys();
   await Promise.all(keys.filter(k=>k.startsWith(LEGACY_PREFIX)).map(k=>caches.delete(k)));
  }catch(_){}
  try{await self.registration.unregister()}catch(_){}
  try{
   const clients=await self.clients.matchAll({type:'window',includeUncontrolled:true});
   for(const c of clients)try{c.navigate(c.url)}catch(_){}
  }catch(_){}
 })());
});
