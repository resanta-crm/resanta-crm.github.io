import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const read=n=>fs.readFileSync(new URL('../'+n,import.meta.url),'utf8');
const code=read('assets/178-crm-view-resume-v1.js');

function fixture({email='payushin_ar@resanta.ru',role='boss',scope='all',section='triovist',subtab='competitors',storage=new Map()}={}){
 let selected=section,tab=subtab,loggedIn=true,clicks=0;
 const timers=[],docEvents={},windowEvents={};
 const profile={email,role,access_scope:scope};
 const app={style:{display:'flex'},dataset:{activePage:section}};
 const login={style:{display:'none'}};
 const title={textContent:'Триовист / 21vek.by'};
 const pages=['dashboard','triovist','clients','routes-boss','tasks'].map(n=>({id:'page-'+n,style:{},dataset:{triovistView:n==='triovist'?tab:''}}));
 const navs=pages.map(p=>({id:'nav-'+p.id.slice(5),style:{display:'flex'}}));
 const buttons=['home','competitors','tasks','cards','groups'].map(n=>({dataset:{tr14:n},classList:{contains:c=>c==='on'&&tab===n},click(){tab=n; pages.find(p=>p.id==='page-triovist').dataset.triovistView=n;clicks++}}));
 const byId=id=>id==='app'?app:id==='login-wrap'?login:id==='topbar-title'?title:pages.find(p=>p.id===id)||navs.find(p=>p.id===id)||null;
 const document={
  visibilityState:'visible',
  getElementById:byId,
  querySelector(sel){
   if(sel==='.page.active')return pages.find(p=>p.id==='page-'+selected)||null;
   if(sel==='#tr14-shell [data-tr14].on')return buttons.find(b=>b.dataset.tr14===tab)||null;
   return null;
  },
  querySelectorAll(sel){return sel==='#tr14-shell [data-tr14]'?buttons:[]},
  addEventListener(type,fn){(docEvents[type]??=[]).push(fn)}
 };
 const window={
  currentProfile:profile,sessionStorage:{
   getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)
  },
  addEventListener(type,fn){(windowEvents[type]??=[]).push(fn)},
  goPage(name,titleText){selected=name;app.dataset.activePage=name;title.textContent=titleText;clicks++}
 };
 const ctx={window,document,Date,JSON,Set,Number,setTimeout:fn=>{timers.push(fn);return timers.length},console};
 vm.runInNewContext(code,ctx);
 function emit(type,{hidden}={}){
  if(hidden!==undefined)document.visibilityState=hidden?'hidden':'visible';
  for(const fn of (docEvents[type]||[]))fn({});
 }
 function signal(type){for(const fn of (windowEvents[type]||[]))fn({});}
 function flush(){for(let i=0;i<90&&timers.length;i++){const a=timers.splice(0,timers.length);a.forEach(fn=>fn())}}
 return {window,document,storage,emit,signal,flush,profile,app,login,
  get section(){return selected},set section(v){selected=v;app.dataset.activePage=v},
  get tab(){return tab},set tab(v){tab=v},
  get clicks(){return clicks},
  navClick(){for(const fn of(docEvents.click||[]))fn({target:{closest:()=>({})}})},
  loginOut(){loggedIn=false;login.style.display='flex';app.style.display='none'}
 };
}
test('resume module syntax, restricted surface and no server activity',()=>{
 assert.doesNotThrow(()=>new vm.Script(code));
 assert.doesNotMatch(code,/\.rpc\(|\.from\(|fetch\(|\.insert\(|\.delete\(|\.update\(|location\.reload|window\.reload|setInterval\(/);
 assert.match(code,/sessionStorage/);
 assert.match(code,/visibilitychange/);
 assert.match(code,/pagehide/);
 assert.match(code,/pageshow/);
});
test('browser tab switch saves previous CRM workspace and restores main tab and Triovist subsection',()=>{
 const f=fixture();f.emit('visibilitychange',{hidden:true});
 const saved=JSON.parse([...f.storage.values()][0]);assert.equal(saved.page,'triovist');assert.equal(saved.tab,'competitors');
 f.section='dashboard';f.tab='home';
 f.emit('visibilitychange',{hidden:false});f.flush();
 assert.equal(f.section,'triovist');assert.equal(f.tab,'competitors');
 assert.ok(f.clicks>=1);
});
test('returning to already selected workspace makes no navigation calls or duplicates',()=>{
 const f=fixture();f.emit('visibilitychange',{hidden:true});
 f.emit('visibilitychange',{hidden:false});f.flush();
 assert.equal(f.section,'triovist');assert.equal(f.tab,'competitors');
 assert.equal(f.clicks,0);
});
test('manual navigation updates saved workspace and is not overwritten by older snapshot',()=>{
 const f=fixture();f.emit('visibilitychange',{hidden:true});
 f.emit('visibilitychange',{hidden:false});
 f.section='clients';f.navClick();f.flush();
 const state=JSON.parse([...f.storage.values()][0]);assert.equal(state.page,'clients');
 assert.equal(f.section,'clients');
});
test('restoration is restricted to same active authenticated identity and role',()=>{
 const f=fixture();f.emit('visibilitychange',{hidden:true});f.section='dashboard';
 f.profile.email='different@resanta.ru';f.emit('visibilitychange',{hidden:false});f.flush();
 assert.equal(f.section,'dashboard');
 const same=fixture();same.emit('visibilitychange',{hidden:true});same.section='dashboard';same.loginOut();
 same.emit('visibilitychange',{hidden:false});same.flush();
 assert.equal(same.section,'dashboard');
});
test('Triovist pages are refused for unrelated roles even with sessionStorage manipulation',()=>{
 const f=fixture({email:'rudnev@resanta.ru',role:'manager',scope:'standard',section:'dashboard'});
 f.storage.set('resanta_crm_view_resume_v1',JSON.stringify({v:1,email:'rudnev@resanta.ru',role:'manager',scope:'standard',page:'triovist',tab:'competitors',title:'Triovist'}));
 f.signal('pageshow');f.flush();
 assert.equal(f.section,'dashboard');
});
test('only one isolated versioned script is added and core routes remain unchanged',()=>{
 const index=read('index.html');
 assert.match(index,/178-crm-view-resume-v1\.js\?v=20261105-tabreturn1/);
 assert.match(index,/03-triovist-routes\.js/);
 assert.match(index,/34-triovist-root-v23614\.js/);
 assert.match(index,/169-triovist-tasks360-ux-v1\.js/);
});
