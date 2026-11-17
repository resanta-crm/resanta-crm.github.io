/* AIR3 Control Center reads: use Android's configured HTTP route, not WebView's selective tunnel. */
(function(w){
 'use strict';
 if(w.RESANTA_AIR3_CONTROL_HTTP_V1||w.Capacitor?.isNativePlatform?.()!==true||w.Capacitor?.getPlatform?.()!=='android'||w.Capacitor?.isPluginAvailable?.('Air3Voice')!==true||w.Capacitor?.isPluginAvailable?.('CapacitorHttp')!==true)return;
 const original=w.fetch,origin='https://baqchjtvtmcfzwjjluhs.supabase.co';
 const paths=new Set(['crm_control_sales_summary_v1','triovist_get_dashboard','crm_control_sales_year_v1','crm_pdz360_daily_v1'].map(x=>'/rest/v1/rpc/'+x));
 w.fetch=function(input,init){
  let url;try{url=new URL(typeof input==='string'||input instanceof URL?String(input):input.url,w.location.href);}catch(_){return original.apply(this,arguments);}
  const method=String(init?.method||input?.method||'GET').toUpperCase();
  if(url.origin!==origin||!paths.has(url.pathname)||method!=='POST')return original.apply(this,arguments);
  const receiver=this,args=arguments;
  return (async()=>{
   const signal=init?.signal||input?.signal;signal?.throwIfAborted();
   const headers=new Headers(init?.headers||input?.headers),body=init?.body!==undefined?init.body:typeof input?.clone==='function'?await input.clone().text():null;
   // Only existing JSON read RPCs. Never route auth, writes, paid AI, files or arbitrary URLs here.
   if(typeof body!=='string'||!headers.get('content-type')?.includes('application/json'))return original.apply(receiver,args);
   let data;try{data=JSON.parse(body);}catch(_){return original.apply(receiver,args);}
   signal?.throwIfAborted();let onAbort;
   const stopped=new Promise((_,reject)=>{onAbort=()=>reject(signal.reason||new Error('control_read_cancelled'));signal?.addEventListener('abort',onAbort,{once:true});});
   try{
    const result=await Promise.race([stopped,w.Capacitor.Plugins.CapacitorHttp.post({url:url.href,headers:Object.fromEntries(headers),data,responseType:'json',connectTimeout:4000,readTimeout:8000,disableRedirects:true})]);
    signal?.throwIfAborted();
    return new Response(typeof result.data==='string'?result.data:JSON.stringify(result.data),{status:result.status,headers:result.headers});
   }finally{signal?.removeEventListener('abort',onAbort);}
  })();
 };
 w.RESANTA_AIR3_CONTROL_HTTP_V1=Object.freeze({version:'20261117-1',readOnly:true});
})(window);
