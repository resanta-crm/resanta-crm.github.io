import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {prepareMeetingChange,commitMeetingChange} from '../supabase/functions/crm-ai360-actions-v1/meeting-actions.mjs';
import {agentPrincipal,normalizeAgentRequest,agentGreeting} from '../supabase/functions/crm-ai360-agent-v1/contract.mjs';
const OWNER='544fb1e2-ef70-44de-bc62-e0e1596a4bfc',ID='a9d05f99-4810-4c35-b56d-0c1f9f6480ee',PREP='a8cfc7af-b657-4cdd-8b88-f2526f3d7bc4';
const tick=()=>new Promise(r=>setImmediate(r));
function callerMock(owner=OWNER){
 const meeting={id:ID,owner_id:owner,title:'Проверка Леры',starts_at:'2026-11-16T13:40:00Z',duration_minutes:30,status:'scheduled',updated_at:'2026-11-15T07:55:04Z'};
 const prep={id:PREP,owner_id:owner,context:{meeting_id:ID,month:'2026-11',focus:'2026-11-16'},created_at:'2026-11-15T08:00Z',briefing:{cards:[{id:'tasks',title:'Подтверждённые задачи',fact:'19 с прошедшим сроком'}]},coverage:{entries:[],signals:[]}};
 const calls=[];const client={from(table){const filters=[];const q={select(){return q},eq(k,v){filters.push([k,v]);return q},ilike(){return q},order(){return q},limit(){return q},maybeSingle(){return q},then(resolve){const row=table==='crm_ai360_meetings_v1'?meeting:prep;const match=filters.every(([k,v])=>row[k]===v);resolve({data:match?(table==='crm_ai360_meetings_v1'&&!filters.some(([k])=>k==='id')?[row]:row):null});}};return q;},rpc:async(name,args)=>{calls.push(args);if(args.p_expected!==meeting.updated_at)return {error:{message:'meeting_changed_refresh'}};Object.assign(meeting,args.p_patch);meeting.updated_at='2026-11-15T08:01:00Z';return {data:JSON.parse(JSON.stringify(meeting))};}};
 // A list query by id still returns an array; the same query's maybeSingle returns a row.
 const raw=client.from;client.from=table=>{const q=raw(table);let single=false;const then=q.then;q.maybeSingle=()=>{single=true;return q};q.then=resolve=>then(r=>{if(table==='crm_ai360_meetings_v1'&&!single&&r.data&&!Array.isArray(r.data))r.data=[r.data];resolve(r)});return q;};
 return {client,meeting,prep,calls};
}
const actor={id:OWNER},proof=async()=>({token:'signed',expires_at:'2026-11-15T08:05Z'}),moment=(d,t)=>d&&t?new Date(d+'T'+t+':00+03:00').toISOString():null;
test('reschedule signs the existing ID and changes its time without inserting a second meeting',async()=>{
 const h=callerMock(),r=await prepareMeetingChange({caller:h.client,actor,model:{action:'reschedule_meeting',meeting_ref:'Проверка Леры',due_date:'2026-11-16',due_time:'17:10'},proof,moment});assert.equal(r.mode,'prepared');assert.equal(r.draft.meeting_id,ID);assert.equal(h.calls.length,0);
 const changed=await commitMeetingChange({caller:h.client,actor,draft:r.draft,moment});assert.equal(changed.mode,'rescheduled_meeting');assert.equal(h.meeting.starts_at,'2026-11-16T14:10:00.000Z');assert.equal(h.meeting.duration_minutes,30);assert.equal(h.calls.length,1);
});
test('cancel remains a soft update and stale versions cannot overwrite a changed meeting',async()=>{
 const h=callerMock(),r=await prepareMeetingChange({caller:h.client,actor,model:{action:'cancel_meeting'},context:{meeting_id:ID},proof,moment});h.meeting.updated_at='2026-11-15T08:02Z';const stale=await commitMeetingChange({caller:h.client,actor,draft:r.draft,moment});assert.equal(stale.error,'meeting_changed_refresh');assert.equal(h.meeting.status,'scheduled');
 r.draft.expected_updated_at=h.meeting.updated_at;assert.equal((await commitMeetingChange({caller:h.client,actor,draft:r.draft,moment})).mode,'cancelled_meeting');assert.equal(h.meeting.status,'cancelled');
});
test('agenda uses only server preparation topics and unrelated IDs cannot inject facts',async()=>{
 const h=callerMock(),r=await prepareMeetingChange({caller:h.client,actor,model:{action:'save_meeting_agenda'},context:{meeting_id:ID,preparation_id:PREP,focus:'2026-11-16',month:'2026-11',topic_ids:['tasks','invented']},proof,moment});assert.equal(r.draft.agenda.topics.length,1);assert.equal(r.draft.agenda.topics[0].id,'tasks');const saved=await commitMeetingChange({caller:h.client,actor,draft:r.draft,moment});assert.equal(saved.mode,'saved_meeting_agenda');
});
test('foreign personal meetings cannot be changed',async()=>{const h=callerMock('another');const r=await commitMeetingChange({caller:h.client,actor,draft:{action:'cancel_meeting',owner_id:OWNER,meeting_id:ID,expected_updated_at:'x'},moment});assert.equal(r.error,'meeting_not_allowed');assert.equal(h.calls.length,0);});
test('legacy finance hook leaves meeting explanations on the calendar agent and preserves explicit finance route',async()=>{
 let invoked=0;const root={crmMeetingPlannerPilotV1:{prepareAgentRequest:()=>({meeting_context:{focus:'2026-11-15'}})},addEventListener(){}};
 const doc={hidden:false,getElementById:()=>({style:{display:'flex'}}),querySelector:()=>({})};
 vm.runInNewContext(fs.readFileSync('assets/264-resanta-ai360-finance-voice-bridge-v1.js','utf8'),{window:root,document:doc,currentUser:{id:OWNER},currentProfile:{role:'boss'},db:{auth:{getSession:async()=>({data:{session:{access_token:'test'}}})},functions:{invoke:async()=>{invoked++;return {error:'offline'}}}}});
 const ui={answer(){},textStatus(){}};assert.equal(root.crmAI360FinanceVoiceHandleV1('Почему в совещании просроченные задачи высокого приоритета?',ui),false);assert.equal(invoked,0);assert.equal(root.crmAI360FinanceVoiceHandleV1('Какой бюджет у клиента?',ui),true);await tick();assert.equal(invoked,1);
});
test('meeting explanation returns the protocol required by the live voice bridge',async()=>{
 let handler;const profile={id:OWNER,name:'Александр Паюшин',role:'boss',region:'Витебск'};
 const svc={auth:{getUser:async()=>({data:{user:{id:OWNER}}})},from(){return {select(){return this},eq(){return this},maybeSingle:async()=>({data:profile})}}};
 const source=fs.readFileSync('supabase/functions/crm-ai360-agent-v1/index.ts','utf8').replace(/^import .*\n/gm,'');
 vm.runInNewContext(source,{Deno:{serve:fn=>{handler=fn},env:{get:()=> 'configured'}},createClient:()=>svc,agentPrincipal,normalizeAgentRequest,agentGreeting,readMeetingContext:async()=>({month:'2026-11',text:'19 подтверждённых просроченных'}),runFreeConversation:async()=>({answer:'19 подтверждённых просроченных',mode:'agent360_free_conversation_v1',read_only:true}),saveHistoryTurn:async()=>({saved:false}),Request,Response,Intl,Date,Set});
 const res=await handler(new Request('https://example.test',{method:'POST',headers:{Authorization:'Bearer abcdefghijklmnop','Content-Type':'application/json'},body:JSON.stringify({action:'ask',protocol:'lera_dialogue_v2',question:'Почему высокий приоритет совещания?',meeting_context:{focus:'2026-11-15'}})}));assert.equal(res.status,200);const data=await res.json();assert.equal(data.protocol,'lera_dialogue_v2');assert.match(data.answer,/19/);
});
