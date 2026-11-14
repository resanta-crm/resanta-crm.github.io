export function validSubscription(s){
 if(!s||typeof s.endpoint!=='string'||s.endpoint.length>4096)return false;
 try{const u=new URL(s.endpoint);if(u.protocol!=='https:'||u.username||u.password||u.port||u.hash)return false;
 const h=u.hostname;if(!(h==='fcm.googleapis.com'||h==='updates.push.services.mozilla.com'||h==='web.push.apple.com'||h.endsWith('.push.apple.com')||h.endsWith('.notify.windows.com')))return false;
 return /^[A-Za-z0-9_-]{87}={0,1}$/.test(s.keys?.p256dh||'')&&/^[A-Za-z0-9_-]{22}={0,2}$/.test(s.keys?.auth||'');
 }catch(_){return false;}
}
export function resultFor(status){
 if(status===404||status===410)return {status:'cancelled',error_code:'DEVICE_GONE'};
 if(status===429||status>=500)return {status:'failed',error_code:'PROVIDER_'+status};
 if(status>=400)return {status:'cancelled',error_code:'PROVIDER_'+status};
 return {status:'unknown',error_code:'TRANSPORT_UNCERTAIN'};
}
