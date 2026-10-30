const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const page=fs.readFileSync('air3-control.html','utf8');
assert.match(page,/<button id="air3-launch"[^>]*hidden>/);
assert.doesNotMatch(page,/156-air3-controller-v1\.js/);
const scripts=[...page.matchAll(/<script(?:\s+[^>]*)?>([\s\S]*?)<\/script>/g)].map(m=>m[1]).filter(Boolean);
assert.equal(scripts.length,1);
const hooks={},elements=new Map(),calls=[];
function node(id=''){
  if(!elements.has(id)){
    elements.set(id,{
      hidden:true,textContent:'',value:'',disabled:false,childNodes:[],
      replaceChildren(...children){this.childNodes=children},
      appendChild(x){this.childNodes.push(x)},
      get classList(){return {add(){},remove(){}}}
    });
  }
  return elements.get(id);
}
const document={
 getElementById:node,createDocumentFragment(){return {children:[],appendChild(x){this.children.push(x)}}},
 createElement(){return {textContent:'',childNodes:[],appendChild(x){this.childNodes.push(x)},onclick:null}}
};
node('air3-pending').hidden=false;
const profile={name:'Александр Паюшин',role:'boss'};
const user={id:'boss-user'};
const client={
 auth:{getSession:async()=>({data:{session:{access_token:'mock-access'}},error:null}),getUser:async()=>({data:{user},error:null})},
 from(name){assert.equal(name,'users');return {select(){return this},eq(){return this},maybeSingle:async()=>({data:profile,error:null})}}
};
const window={
 supabase:{createClient:()=>client},
 addEventListener(name,fn){hooks[name]=fn}
};
const fetch=async(url,options)=>{
 assert.equal(options.headers.authorization,'Bearer mock-access');
 const args=JSON.parse(options.body);calls.push(args.action);
 const payload=args.action==='create'?{ok:true,code:'123456',expires_at:new Date(Date.now()+120000).toISOString()}:{ok:true,items:[]};
 return {ok:true,json:async()=>payload}
};
vm.runInNewContext(scripts[0],{window,document,fetch,Date,Math,String,Error,Number,
 setInterval(){return 1},clearInterval(){},console}, {timeout:1000});
(async()=>{
 assert.equal(node('air3-launch').hidden,true,'Button must be hidden before authentication');
 await hooks.DOMContentLoaded();
 assert.equal(node('air3-launch').hidden,false,'Authenticated director should immediately see button');
 node('air3-launch').onclick();
 assert.equal(node('air3-panel').hidden,false);
 await node('air3-create').onclick();
 assert.equal(node('air3-code').textContent,'123456');
 assert.ok(calls.includes('create'));
 assert.ok(calls.includes('pending'));
 console.log('AIR3 control smoke passed: button appears immediately, code generated via authenticated request');
})().catch(e=>{console.error(e);process.exitCode=1});
