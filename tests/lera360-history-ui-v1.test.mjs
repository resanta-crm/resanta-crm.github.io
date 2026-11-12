import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const file='assets/217-lera360-history-ui-v1.js';
const js=fs.readFileSync(file,'utf8');
function context(){
 const invoked=[],elements=[];
 const make=tag=>{
  const node={tag,style:{display:''},children:[],listeners:{},textContent:'',
   hidden:false,disabled:false,value:'',type:'',className:'',
   setAttribute(name,v){this[name]=v;},
   append(...kids){this.children.push(...kids);},
   appendChild(kid){this.children.push(kid);return kid;},
   replaceChildren(...kids){this.children=[...kids];},
   addEventListener(name,callback){this.listeners[name]=callback;},
   querySelector(){return null;}};
  elements.push(node);return node;
 };
 const settings={history_enabled:true};
 const responses=[{id:'9f936d72-8944-41c1-8d22-aaf855ce263b',mode:'chat',
  created_at:'2026-11-12T13:56:32Z',question:'Привет <script>alert(1)</script>',
  answer:'Привет! Чем помочь?',answer_verified:false}];
 const win={confirm:()=>true,db:{auth:{getSession:async()=>({data:{session:{access_token:'test-token'}}})},
  functions:{invoke:async(endpoint,{body})=>{
   invoked.push({endpoint,body});
   if(body.action==='history:status')return {data:settings};
   if(body.action==='history:list')return {data:{turns:responses}};
   if(body.action==='history:feedback')return {data:{feedback_saved:true}};
   if(body.action==='history:clear'){responses.length=0;return {data:{cleared:true}};}
   if(body.action==='history:enable'){settings.history_enabled=body.enabled;return {data:settings};}
   return {error:{message:'invalid_action'}};
  }}}};
 const ctx={window:win,document:{createElement:make},console,setTimeout,Date,Promise};
 vm.runInNewContext(js,ctx,{filename:file});
 return {win,invoked,elements,make};
}
test('history module is inert until user explicitly opens the UI',async()=>{
 const {win,invoked,make}=context();
 const host=make('div');
 const mount=win.crmAI360HistoryUIV1.mount(host,{allowed:()=>true});
 assert.equal(mount.tag,'details');
 assert.equal(invoked.length,0);
 mount.open=true;
 await mount.listeners.toggle();
 await new Promise(resolve=>setTimeout(resolve,5));
 assert.deepEqual(invoked.map(x=>x.body.action),['history:status','history:list']);
 assert.ok(invoked.every(x=>x.endpoint==='crm-ai360-agent-v1'));
 assert.equal(host.children.length,1);
});
test('printed stored user text is textContent, never executable innerHTML',()=>{
 assert.doesNotMatch(js,/\.innerHTML\s*=/);
 assert.match(js,/textContent=text/);
 assert.match(js,/Личные тексты хранятся 30 дней/);
 assert.match(js,/Аудио не сохраняется/);
 assert.match(js,/не изменения данных CRM/);
});
test('per-user auth gate is checked before every history action',()=>{
 assert.match(js,/options\.allowed\?\.\(\)===true/);
 assert.match(js,/session\?\.access_token/);
 assert.match(js,/db\.functions\.invoke\(API,\{body:\{action,\.\.\.data\}\}\)/);
 assert.doesNotMatch(js,/SUPABASE_SERVICE_ROLE_KEY|service_role|localStorage|sessionStorage/);
});
test('user can clear history, disable history and correct one answer',()=>{
 assert.match(js,/history:clear/);
 assert.match(js,/history:enable/);
 assert.match(js,/history:feedback/);
 assert.match(js,/feedback_type:select\.value/);
 assert.match(js,/feedback_note:textarea\.value\.slice\(0,500\)/);
 assert.match(js,/root\.confirm\?\./);
 assert.match(js,/history:status/);
 assert.match(js,/history:list/);
});
test('HTML script wiring loads history UI before lazy director and staff modules',()=>{
 const html=fs.readFileSync('index.html','utf8');
 const a=html.indexOf('217-lera360-history-ui-v1.js?v=1');
 const b=html.indexOf('137-resanta-ai360-lazy-launch-v1.js?v=39');
 const c=html.indexOf('144-resanta-ai360-branch-voice-v1.js?v=');
 assert.ok(a>0&&a<b&&a<c);
});
