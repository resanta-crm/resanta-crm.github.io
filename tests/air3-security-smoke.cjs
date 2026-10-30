// No production endpoint is contacted. Simulated browser/network validates logout races.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const {webcrypto} = require('node:crypto');
const html = fs.readFileSync('air3.html','utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
assert.ok(script,'AIR3 JavaScript missing');
assert.ok(!/localStorage\.|sessionStorage\.|document\.cookie/.test(script),'AIR3 must not persist credentials');

const dom = new Map(), timers=new Map(), events={}, requests=[];
let nextTimer=0,pendingAsk,askStarted;
const startedAsk=new Promise(resolve=>{askStarted=resolve});
const el=id=>{
 if(!dom.has(id)){
  const classes=new Set(id==='assistant'?['hidden']:[]);
  dom.set(id,{value:'',textContent:'',disabled:false,
   classList:{add:k=>classes.add(k),remove:k=>classes.delete(k),contains:k=>classes.has(k)},
   handlers:{},addEventListener(type,fn){this.handlers[type]=fn}});
 }
 return dom.get(id);
};
let speechCalls=0;
const speechSynthesis={cancel(){},speak(){speechCalls++}};
const window={speechSynthesis,addEventListener(type,fn){events[type]=fn}};
const fetch=async(url,opts)=>{
 const body=JSON.parse(opts.body);requests.push(body.action);
 const value=await (async()=>{
  if(body.action==='pair')return {ok:true,id:'123'};
  if(body.action==='status')return {ok:true,status:'approved'};
  if(body.action==='redeem')return {ok:true,token:'token_abcdefghijklmnopqrstuvwxyz1234567890ABCD',expires_in:1800};
  if(body.action==='ask'){askStarted();return await new Promise(resolve=>pendingAsk=resolve)}
  if(body.action==='close')return {ok:true};
  return {ok:false,error:'Unexpected operation'};
 })();
 return {ok:true,json:async()=>value};
};
const setInterval=(fn,ms)=>{const id=++nextTimer;timers.set(id,{fn,ms});return id};
const clearInterval=id=>timers.delete(id);
const context={document:{getElementById:el},window,fetch,crypto:webcrypto,btoa,
 setInterval,clearInterval,Date,Intl,Number,JSON,RegExp,String,Math,Error,Promise,SpeechSynthesisUtterance:function(s){this.text=s;},
 speechSynthesis};
vm.runInNewContext(script,context,{timeout:5000});
(async()=>{
 el('code').value='123456';
 await el('connect').handlers.click();
 const polling=[...timers.values()].find(x=>x.ms===2300);
 assert.ok(polling,'Pending approval polling missing');
 await polling.fn();
 assert.ok(!el('assistant').classList.contains('hidden'),'Approved temporary session should show assistant');
 const awaiting=el('sales').handlers.click();
 await startedAsk;
 el('exit').handlers.click();
 assert.ok(el('assistant').classList.contains('hidden'),'Logout must hide private data immediately');
 pendingAsk({ok:true,domain:'sales',data:{month:'2026-10',managers:[{manager_name:'PRIVATE_NAME',plan:5,actual:999}]}});
 await awaiting;
 assert.equal(el('answer').textContent,'','Response must not reappear after logout');
 assert.equal(speechCalls,0,'Private analytics must not be spoken after logout');
 assert.ok(requests.includes('close'),'Logout should revoke server token');
 console.log('AIR3 security smoke passed: no persistent token, approved pairing, exit, delayed response isolation, voice isolation');
})().catch(e=>{console.error(e);process.exitCode=1});
