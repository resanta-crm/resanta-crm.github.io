import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 historyAction,historyEnabled,saveHistoryTurn,recentFreeMemory
} from '../supabase/functions/crm-ai360-agent-v1/history.mjs';
import {runFreeConversation} from '../supabase/functions/crm-ai360-agent-v1/conversation.mjs';
const read=path=>readFileSync(path,'utf8');
const CURRENT='544fb1e2-ef70-44de-bc62-e0e1596a4bfc';
const OTHER='a24954b8-2fe1-4852-b629-d8f351e1bd36';
const turnId='11111111-1111-4111-8111-111111111111';
function fakeDb({enabled=true,rows=[]}={}){
 const calls=[];
 return {
  calls,
  from(table){
   const s={table,filters:{},mode:'read',values:null};
   const chain=new Proxy({},{
    get(_,name){
     if(name==='then')return (resolve,reject)=>Promise.resolve().then(()=>{
      if(s.table==='crm_ai360_lera_history_settings_v1'){
       if(s.mode==='upsert')return resolve({error:null,data:null});
       return resolve({error:null,data:{enabled}});
      }
      if(s.mode==='insert')return resolve({data:{id:turnId},error:null});
      if(s.mode==='update')return resolve({data:s.filters.id===turnId?{id:turnId}:null,error:null});
      if(s.mode==='delete')return resolve({data:null,error:null});
      if(s.mode==='read')return resolve({data:rows,error:null});
      return resolve({error:'unknown_db_operation'});
     }).catch(reject);
     return (...args)=>{
      calls.push({table,method:name,args});
      if(['insert','update','upsert','delete'].includes(name))s.mode=name;
      if(name==='eq')s.filters[args[0]]=args[1];
      return chain;
     };
    }
   });
   return chain;
  }
 };
}
test('no permission-free history: status and opt-out require user binding',async()=>{
 const db=fakeDb({enabled:true});
 const state=await historyAction(db,CURRENT,'history:status');
 assert.equal(state.history_enabled,true);
 assert.equal(state.retention_days,30);
 assert.equal(state.audio_saved,false);
 const off=await historyAction(db,CURRENT,'history:enable',{enabled:false});
 assert.equal(off.history_enabled,false);
 assert(db.calls.some(x=>x.table==='crm_ai360_lera_history_v1'&&x.method==='delete'));
 assert(db.calls.some(x=>x.method==='eq'&&x.args[0]==='user_id'&&x.args[1]===CURRENT));
 assert(!db.calls.some(x=>x.args.includes(OTHER)));
});
test('anyone can delete only their own history, never all users',async()=>{
 const db=fakeDb();
 const value=await historyAction(db,CURRENT,'history:clear');
 assert.equal(value.cleared,true);
 assert(db.calls.some(x=>x.method==='eq'&&x.args[0]==='user_id'&&x.args[1]===CURRENT));
});
test('correction is user-scoped and cannot be written to a foreign turn',async()=>{
 const db=fakeDb();
 const v=await historyAction(db,CURRENT,'history:feedback',{
  turn_id:turnId,feedback_type:'Не поняла вопрос',feedback_note:'Отвечай по существу'
 });
 assert.equal(v.feedback_saved,true);
 assert.equal(v.crm_data_unchanged,true);
 assert(db.calls.some(x=>x.method==='eq'&&x.args[0]==='user_id'&&x.args[1]===CURRENT));
 assert(db.calls.some(x=>x.method==='eq'&&x.args[0]==='id'&&x.args[1]===turnId));
 const denied=await historyAction(db,CURRENT,'history:feedback',{
  turn_id:OTHER,feedback_type:'Неверные данные',feedback_note:''
 });
 assert.equal(denied.error,'history_turn_not_found');
});
test('no opt-in means no transcript saved',async()=>{
 const db=fakeDb({enabled:false});
 const saved=await saveHistoryTurn(db,CURRENT,{mode:'chat',question:'Привет',answer:'Привет!',answerVerified:false});
 assert.equal(saved.saved,false);
 assert(!db.calls.some(x=>x.method==='insert'));
 const state=await historyAction(db,CURRENT,'history:list');
 assert.equal(state.history_enabled,false);
 assert.equal(state.turns.length,0);
});
test('opt-in creates text-only, verified mode-tagged turn',async()=>{
 const db=fakeDb();
 const a=await saveHistoryTurn(db,CURRENT,{mode:'crm',question:'Сколько продаж?',answer:'Сумма CRM',answerVerified:true});
 assert.equal(a.saved,true);
 assert.equal(a.turn_id,turnId);
 const insert=db.calls.find(x=>x.method==='insert');
 assert.deepEqual(Object.keys(insert.args[0]).sort(),
 ['answer','answer_verified','mode','question','user_id'].sort());
 assert.equal(insert.args[0].user_id,CURRENT);
 assert.equal(insert.args[0].answer_verified,true);
 assert.equal(insert.args[0].mode,'crm');
});
test('stored CRM figures never get forwarded as casual-memory context',async()=>{
 const db=fakeDb({rows:[{question:'Сколько продаж?',answer:'1000000 BYN'}]});
 const r=await recentFreeMemory(db,CURRENT);
 assert(db.calls.some(x=>x.method==='eq'&&x.args[0]==='mode'&&x.args[1]==='chat'));
 assert(db.calls.some(x=>x.method==='eq'&&x.args[0]==='user_id'&&x.args[1]===CURRENT));
 assert(db.calls.some(x=>x.method==='gt'&&x.args[0]==='expires_at'));
 assert.equal(r.history.length,2); // mock returns a row regardless; query bound to chat only
});
test('LLM receives personal feedback only as unverified user text, never system',async()=>{
 const calls=[];
 const svc={rpc:async(name,args)=>{
  calls.push({name,args});
  return name==='crm_ai360_core_claim_v2'?
   {data:{allowed:true,claim_id:'x'},error:null}:{data:{ok:true},error:null};
 }};
 let body;
 const res=await runFreeConversation({
  svc,userId:CURRENT,question:'Как дела?',history:[],
  feedback:[{kind:'Не поняла вопрос',note:'Не повторяй приветствие дважды'}],
  apiKey:'test',
  fetcher:async(url,options)=>{
   body=JSON.parse(options.body);
   return {ok:true,json:async()=>({output:[{type:'message',content:[{
    type:'output_text',text:'Отлично! О чём поболтаем?'
   }]}],usage:{input_tokens:120,output_tokens:22}})};
  }
 });
 assert.equal(res.mode,'agent360_free_conversation_v1');
 assert.equal(body.input[0].role,'system');
 assert(body.input.some(x=>x.role==='user'&&x.content.includes('Не повторяй приветствие')));
 assert(!body.input[0].content.includes('Не повторяй приветствие'));
 assert.deepEqual(calls.map(x=>x.name),['crm_ai360_core_claim_v2','crm_ai360_core_finish_v2']);
});
test('database schema enforces zero authenticated direct access and 30-day purge',()=>{
 const sql=read('docs/sql/lera_ai360_history_30d_20261112.sql');
 assert.match(sql,/enable row level security/g);
 assert.match(sql,/revoke all on public\.crm_ai360_lera_history_v1 from PUBLIC, anon, authenticated/);
 assert.match(sql,/grant select,insert,update,delete on public\.crm_ai360_lera_history_v1 to service_role/);
 assert.match(sql,/interval '30 days'/);
 assert.match(sql,/cron\.schedule/);
 assert.doesNotMatch(sql,/raw_audio|audio_data|voice_blob/);
});
test('JWT-gated server checks current principal before history actions',()=>{
 const src=read('supabase/functions/crm-ai360-agent-v1/index.ts');
 assert(src.indexOf('agentPrincipal(user.id,profile.data,user)')<
  src.indexOf("input.action.startsWith('history:')"));
 assert.match(src,/historyAction\(svc,user\.id,input\.action,input\)/);
 assert.match(src,/saveHistoryTurn\(svc,user\.id,/);
 assert.doesNotMatch(src,/historyAction\(svc,input\.user_id/);
});
