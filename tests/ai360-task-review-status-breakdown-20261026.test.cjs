'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const src=fs.readFileSync('supabase/functions/crm-ai360-director-v1/index.ts','utf8');
const router=fs.readFileSync('supabase/functions/crm-ai360-director-v1/intent-router.mjs','utf8');
const start=src.indexOf('const todayInMinsk=()=>');
const finish=src.indexOf('const instr = [',start);
assert(start>=0&&finish>start,'stateless count-only helper available');
const pure=src.slice(start,finish).replace('svc:any,manager:string','svc,manager');
const taskReviewBreakdown=new Function('Intl','Date',pure+'return taskReviewBreakdown;')(Intl,Date);
function mock(fail=false){
 const inputs=[];
 const db={from(table){
  assert.equal(table,'tasks');
  const q={filters:{},select(name,opts){assert.equal(name,'id');assert.equal(opts.head,true);return this;},
   eq(name,value){this.filters[name]=value;return this;},
   or(){this.filters.open=true;return this;},
   lt(name,value){this.filters.before=value;return this;},
   then(resolve,reject){
    const f=this.filters;
    inputs.push({...f});
    let count;
    if(!f.before&&!f.review_status)count=246;
    if(f.before&&!f.review_status)count=191;
    if(!f.before&&f.review_status==='stale_review')count=184;
    if(f.before&&f.review_status==='stale_review')count=174;
    if(f.before&&f.review_status==='approved')count=17;
    return Promise.resolve({count,error:fail?{code:'server_error'}:null}).then(resolve,reject);
   }};
  return q;
 }};
 return {db,inputs};
}
(async()=>{
 const h=mock(),result=await taskReviewBreakdown(h.db,'Руднев');
 assert.deepEqual([result.open_tasks,result.overdue_due_date,result.stale_review_open,
  result.stale_review_overdue,result.approved_overdue,result.other_status_overdue],
  [246,191,184,174,17,0],'stale_review and approved overdue must be separate and exact');
 assert.equal(h.inputs.length,5,'all read-only count-only filters executed');
 assert(h.inputs.every(x=>x.manager_name==='Руднев'&&x.open),'filter by assigned manager and open tasks');
 const e=mock(true);
 assert.equal(await taskReviewBreakdown(e.db,'Руднев'),null,'never hallucinate counts when query fails');
 assert(src.includes("if(intent==='tasks')"),'tasks get deterministic grounded reply');
 assert(src.includes('stale_review_overdue'),'explicit stale_review summary in grounded answer');
 assert(router.includes('v.task_review_breakdown=ops.task_review_breakdown'),
  'review data forwarded in LLM evidence');
 assert(router.includes('if(b)return'),'fallback must use breakdown');
 assert(src.includes('не доказывает, что менеджер не выполнил'),
  'stale_review not interpreted as confirmed non-performance');
 console.log('AI360 task analytics: 246 open, 191 due, 174 stale_review, 17 approved; fail closed PASS');
})().catch(e=>{console.error(e);process.exitCode=1;});
