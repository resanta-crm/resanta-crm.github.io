const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {webcrypto}=require('node:crypto');
const html=fs.readFileSync('air3.html','utf8');
const script=html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
assert.ok(script);
const nodes=new Map(),intervals=new Map(),events={},actions=[];
let id=0,pingFail=false,pingDenied=false;
const element=(name)=>{
 if(!nodes.has(name)){
  const classes=new Set(name==='assistant'?['hidden']:[]);
  nodes.set(name,{textContent:'',value:'',disabled:false,classList:{add:x=>classes.add(x),remove:x=>classes.delete(x),contains:x=>classes.has(x)},events:{},addEventListener(event,fn){this.events[event]=fn}});
 }
 return nodes.get(name);
};
const response=(status,data)=>({ok:status<400,status,json:async()=>data});
const fetch=async(_url,options)=>{
 const args=JSON.parse(options.body);actions.push(args.action);
 if(args.action==='pair')return response(200,{ok:true,id:'a1'});
 if(args.action==='status')return response(200,{ok:true,status:'approved'});
 if(args.action==='redeem')return response(200,{ok:true,token:'T'.repeat(55),expires_in:1800});
 if(args.action==='ping'){if(pingFail)throw new TypeError('offline');if(pingDenied)return response(401,{ok:false,error:'Access revoked'});return response(200,{ok:true})}
 if(args.action==='close')return response(200,{ok:true});
 return response(400,{ok:false,error:'unsupported'});
};
const context={document:{getElementById:element,hidden:false,addEventListener(name,fn){events[name]=fn}},window:{addEventListener(name,fn){events[name]=fn}},fetch,crypto:webcrypto,btoa,setTimeout,clearTimeout,setInterval(fn,ms){const k=++id;intervals.set(k,{fn,ms});return k},clearInterval(k){intervals.delete(k)},Date,Intl,Number,JSON,RegExp,String,Math,Error,TypeError,AbortController,Promise,speechSynthesis:{cancel(){}},console};
vm.runInNewContext(script,context,{timeout:1500});
(async()=>{
 element('code').value='123456';
 await element('connect').events.click();
 const stateCheck=[...intervals.values()].find(x=>x.ms===2500);
 assert.ok(stateCheck);
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(element('assistant').classList.contains('hidden'),false);
 const heartbeat=[...intervals.values()].find(x=>x.ms===15000);
 assert.ok(heartbeat);
 pingFail=true;await heartbeat.fn();
 assert.equal(element('assistant').classList.contains('hidden'),false,'A single network failure must not logout');
 assert.match(element('connection').textContent,/Нестабильная связь/);
 assert.equal(actions.filter(x=>x==='close').length,0,'No revoke on temporary Wi-Fi failure');
 pingFail=false;await heartbeat.fn();
 assert.equal(element('connection').textContent,'Сервер: подключён');
 pingDenied=true;await heartbeat.fn();
 assert.equal(element('assistant').classList.contains('hidden'),true,'401 must trigger immediate logout');
 assert.ok(actions.includes('close'));
 console.log('AIR3 ping recovery and real revocation smoke: PASS');
})().catch(err=>{console.error(err);process.exitCode=1});
