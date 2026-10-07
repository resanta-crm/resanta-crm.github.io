/* RESANTA CRM v23.6.251 · TRIOVIST DATABASE REQUEST QUEUE
 * Serializes heavy Triovist RPCs so sales/stock/tasks/content do not fight
 * each other for the same PostgREST connection pool.
 */
(function(){
'use strict';
if(window.RESANTA_TRIOVIST_DB_QUEUE_V236251)return;
const base=window.TRIOVIST_DATA_HUB_V227315;
if(!base){console.warn('Triovist queue v23.6.251: data hub not ready');return;}

const PRIORITY={tasks:40,content:30,sales:20,stock:10};
let running=false,seq=0,current=null;
const pending=[];

function drain(){
  if(running||!pending.length)return;
  pending.sort((a,b)=>b.priority-a.priority||a.seq-b.seq);
  const x=pending.shift();
  running=true;current=x.kind;
  Promise.resolve()
    .then(x.job)
    .then(x.resolve,x.reject)
    .finally(()=>{
      running=false;current=null;
      if(typeof queueMicrotask==='function')queueMicrotask(drain);else setTimeout(drain,0);
    });
}
function wrap(kind,fn){
  return function(){
    const args=arguments;
    return new Promise((resolve,reject)=>{
      pending.push({
        kind,
        priority:PRIORITY[kind]||0,
        seq:seq++,
        job:()=>fn.apply(base,args),
        resolve,reject
      });
      if(typeof queueMicrotask==='function')queueMicrotask(drain);else setTimeout(drain,0);
    });
  };
}
function info(){
  const src=typeof base.info==='function'?base.info():{};
  return {...src,queue_version:'v23.6.251',queue_running:running,queue_current:current,queue_pending:pending.length};
}

window.TRIOVIST_DATA_HUB_V227315=Object.freeze({
  sales:wrap('sales',base.sales),
  stock:wrap('stock',base.stock),
  tasks:wrap('tasks',base.tasks),
  content:wrap('content',base.content),
  invalidate:function(){return base.invalidate.apply(base,arguments);},
  info
});
window.RESANTA_TRIOVIST_DB_QUEUE_V236251=Object.freeze({version:'v23.6.251',serialHeavyRpc:true,priority:PRIORITY,info});
})();