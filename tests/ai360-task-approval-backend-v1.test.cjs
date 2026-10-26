'use strict';
const fs=require('node:fs');
const assert=require('node:assert/strict');
const server=fs.readFileSync('supabase/functions/crm-ai360-task-approval-v1/index.ts','utf8');
const source=server.replace(/^import [^\n]+\n/m,'');
const director='544fb1e2-ef70-44de-bc62-e0e1596a4bfc';
const client='a84979f3-1ad9-4d42-9d72-71e506971ec9';
const manager='19dd9943-99ae-47c4-a39c-4f82a11059a6';
const approval='52e8ea87-99c1-44db-ae99-f2b5c544e6df';
function day(){
 const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Minsk',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
 const p=k=>parts.find(x=>x.type===k).value;
 return p('year')+'-'+p('month')+'-'+p('day');
}
function due(){
 const d=new Date(day()+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+8);
 return d.toISOString().slice(0,10);
}
function harness(opts={}){
 let handler=null,writes=0,stored=[],busy=!!opts.busy;
 const db={
  auth:{getUser:async()=>({data:{user:{id:opts.guest?'nobody':director}}})},
  rpc:async()=>({data:{period:{as_of:day(),last_closed_month:'09.2026',last_closed_year_ago:'09.2025'},
    declining_clients:[{client_name:'Клиент А',closed_year_ago:1000,closed_month:450,open_tasks:0,next_route:null}]}}),
  from:table=>{
    const query={
      select(){return this;},eq(){return this;},in(){return this;},
      gte(){return this;},lte(){return this;},or(){return this;},
      maybeSingle:async()=>({data:opts.unauthorizedProfile?
        {name:'Злоумышленник',role:'manager'}:{name:'Александр Паюшин',role:'boss'}}),
      limit:async()=>{
        if(table==='users')return {data:[{id:manager,name:'Руднев',role:'manager',region:'Витебск'}]};
        if(table==='clients')return {data:[{id:client,name:'Клиент А',manager_id:manager,
          manager_name:'Руднев',is_archived:false,to_delete:false}]};
        if(table==='route_plans')return {data:busy?[{client_id:client}]:[]};
        if(table==='tasks')return {data:stored};
        throw Error('Unexpected table '+table);
      },
      insert(rows){
        writes++;
        stored.push(...rows.map(x=>({id:x.id,client_id:x.client_id,source:x.source})));
        return {select:async()=>({data:rows.map(x=>({id:x.id,client_id:x.client_id}))})};
      }
    };
    return query;
  }
 };
 const Deno={env:{get:key=>key==='SUPABASE_URL'?'https://example.supabase.co':
     key==='SUPABASE_SERVICE_ROLE_KEY'?'only-in-test':null},
   serve:f=>{handler=f;}};
 class Response{
  constructor(body,{status=200}={}){this.body=body;this.status=status;}
  json(){return JSON.parse(this.body||'{}');}
 }
 const crypto={subtle:{digest:async()=>new Uint8Array(32).map((_,i)=>i+1).buffer}};
 new Function('Deno','createClient','Response','crypto','TextEncoder','Intl','Date',source)(
   Deno,()=>db,Response,crypto,typeof TextEncoder==='undefined'?class TextEncoder{
    encode(t){return new Uint8Array([...t].map(x=>x.charCodeAt(0)));}}:TextEncoder,Intl,Date);
 const request=(body,headers={})=>({method:'POST',headers:{get:k=>headers[k]||(
   k==='Authorization'?'Bearer user-token':k==='Origin'?'https://resanta-crm.by':null)},
   json:async()=>body});
 const proposal={client_id:client,client_name:'Клиент А',manager_name:'Руднев',
    title:'Связаться с клиентом',text:'Уточнить причину снижения закупок и срок заказа',
    due_date:due(),expected_result:'Согласован следующий заказ',
    criteria:'Следующий шаг в CRM'};
 return {call:async body=>{const res=await handler(request(body));return {status:res.status,data:res.json()};},
   payload:(kind='validate')=>({kind,approval_id:approval,items:[proposal],
       ...(kind==='commit'?{confirmation:'подтверждаю создание поручений'}:{})}),
   writes:()=>writes};
}
(async()=>{
 const a=harness();
 const ready=await a.call(a.payload());
 assert.equal(ready.status,200);
 assert.equal(ready.data.mode,'ready');
 assert.equal(ready.data.created,0);
 assert.equal(a.writes(),0,'validation must never insert');
 const invalid=await a.call({...a.payload('commit'),confirmation:'да'});
 assert.equal(invalid.status,400,'generic yes cannot authorize a write');
 assert.equal(a.writes(),0);
 const created=await a.call(a.payload('commit'));
 assert.equal(created.status,200);
 assert.equal(created.data.mode,'created');
 assert.equal(created.data.created,1);
 assert.equal(a.writes(),1);
 const replay=await a.call(a.payload('commit'));
 assert.equal(replay.status,200);
 assert.equal(replay.data.mode,'already_created');
 assert.equal(a.writes(),1,'replay does not insert again');
 const conflict=harness({busy:true});
 const denied=await conflict.call(conflict.payload('commit'));
 assert.equal(denied.status,409);
 assert.equal(conflict.writes(),0);
 const guest=harness({guest:true});
 const forbidden=await guest.call(guest.payload('commit'));
 assert.equal(forbidden.status,403);
 assert.equal(guest.writes(),0);
 const role=harness({unauthorizedProfile:true});
 const noRole=await role.call(role.payload('commit'));
 assert.equal(noRole.status,403);
 assert.equal(role.writes(),0);
 assert(server.includes("insert(rows).select('id,client_id')"),'batch insertion is one transaction');
 assert(server.includes("SOURCE='ai360_voice_approved'"),'reserved index source');
 console.log('AI360 approval backend: validate 0 writes, exact confirmation, atomic insert, idempotency, no guest access, conflicts blocked PASS');
})().catch(e=>{console.error(e);process.exitCode=1;});
