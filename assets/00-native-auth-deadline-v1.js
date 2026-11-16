/* Bound native CRM authentication transport, including the response body.
 * Supabase remains the only owner of credentials, storage and session changes.
 */
(function(){
 'use strict';
 if(window.RESANTA_NATIVE_AUTH_DEADLINE_V1)return;
 if(!(window.Capacitor?.isNativePlatform?.()===true&&window.Capacitor?.getPlatform?.()==='android'))return;
 if(typeof window.fetch!=='function')return;
 const originalFetch=window.fetch;
 const origin='https://baqchjtvtmcfzwjjluhs.supabase.co',deadlineMs=15000;
 window.fetch=function(input,init){
   let url;
   try{url=new URL(typeof input==='string'||input instanceof URL?String(input):input.url,window.location.href);}catch(_){return originalFetch.apply(this,arguments);}
   if(url.origin!==origin||!url.pathname.startsWith('/auth/v1/'))return originalFetch.apply(this,arguments);
   const receiver=this;
   return (async()=>{
     const controller=new AbortController();
     const parent=init?.signal!==undefined?init.signal:input?.signal;
     const options=Object.create(init&&(typeof init==='object'||typeof init==='function')?init:null);
     Object.defineProperty(options,'signal',{value:controller.signal,enumerable:true});
     let timer,reader,onParent,onAbort;
     const reason=()=>controller.signal.reason||new Error('auth_request_cancelled');
     const check=()=>{if(controller.signal.aborted)throw reason();};
     const stopped=new Promise((_,reject)=>{
       onAbort=()=>{
         const error=reason();
         // Cancel our clone reader as well as the actual network request.
         try{if(reader)Promise.resolve(reader.cancel(error)).catch(()=>{});}catch(_){}
         reject(error);
       };
       controller.signal.addEventListener('abort',onAbort,{once:true});
       onParent=()=>controller.abort(parent.reason||new Error('auth_request_cancelled'));
       if(parent?.aborted)onParent();else parent?.addEventListener('abort',onParent,{once:true});
       timer=setTimeout(()=>{
         const error=new Error('auth_network_timeout');error.name='TimeoutError';controller.abort(error);
       },deadlineMs);
     });
     try{
       return await Promise.race([stopped,(async()=>{
         check();
         const response=await originalFetch.call(receiver,input,options);
         check();
         // Headers alone do not settle SDK initialization. Drain a clone so
         // the SDK receives the original URL/type/status and untouched body.
         const clone=response.clone();
         if(clone.body?.getReader){
           reader=clone.body.getReader();
           try{while(true){const part=await reader.read();check();if(part.done)break;}}
           finally{try{reader.releaseLock();}catch(_){}reader=null;}
         }else{await clone.arrayBuffer();check();}
         check();return response;
       })()]);
     }finally{
       clearTimeout(timer);
       controller.signal.removeEventListener('abort',onAbort);
       parent?.removeEventListener('abort',onParent);
     }
   })();
 };
 window.RESANTA_NATIVE_AUTH_DEADLINE_V1=Object.freeze({version:'20261116-1',deadlineMs});
})();
