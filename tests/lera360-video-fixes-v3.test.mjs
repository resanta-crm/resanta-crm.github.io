import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {prepareLeraSpeech} from '../supabase/functions/_shared/lera-speech-v3.mjs';
import {gpsQuestionDay,gpsStartAnswer,readGpsEvidence} from '../supabase/functions/_shared/lera-gps-evidence-v3.mjs';
import {directoryAlias,canonicalMeetingClient} from '../supabase/functions/crm-ai360-actions-v1/identity-aliases.mjs';
import {reminderDraft,commitReminder} from '../supabase/functions/crm-ai360-actions-v1/reminders.mjs';
import {deliverReminder} from '../supabase/functions/crm-ai360-reminders-v1/delivery.mjs';
import {requestContext} from '../supabase/functions/crm-ai360-dialog-v4/context.mjs';
const read=p=>fs.readFileSync(p,'utf8');
function turn(){const window={};vm.runInNewContext(read('assets/220-lera360-turn-taking-v1.js'),{window});return window.crmAI360TurnTakingV1;}
test('date and time spoken during STT are captured before transcription starts',async()=>{
 const t=turn(),events=[],initial={text:'Назначь встречу с Триовист'},tail={text:'на следующий вторник в 16:00',loud:true};let i=0;
 const text=await t.collect(initial,{capture:async options=>{events.push('capture');assert.equal(options.canStopIdle(),false);return i++===0?tail:{loud:false};},transcribe:async clip=>{events.push('stt');await Promise.resolve();return clip.text;}});
 assert.deepEqual(events,['capture','stt','capture','stt']);assert.equal(text,'Назначь встречу с Триовист на следующий вторник в 16:00');
});
test('turn cancellation and account change never submit a partial command',async()=>{
 const t=turn();let active=true;
 assert.equal(await t.collect({},{capture:async()=>({loud:false}),transcribe:async()=>{active=false;return 'Создай';},isCurrent:()=>active}),null);
 assert.equal(await t.collect({},{capture:async()=>({loud:false}),transcribe:async()=> 'Отмена'}),'');
});
test('capture rejection is observed while STT completes; no unhandled tail promise',async()=>{
 await assert.rejects(turn().collect({},{capture:async()=>{throw Error('mic stopped');},transcribe:async()=>{await Promise.resolve();return 'hello';}}),/mic stopped/);
});
test('long turn is rejected rather than silently losing its tail',async()=>{
 assert.equal(await turn().collect({},{maxSegments:1,capture:async()=>({loud:true}),transcribe:async()=> 'Создай встречу'}),null);
});
test('quiet sentence ending after a loud syllable resets the silence timer',()=>{
 const window={};vm.runInNewContext(read('assets/216-lera360-silence-gate-v1.js'),{window});const gate=window.crmAI360CreateSilenceGateV1({pauseMs:3300});
 gate.observe(.0001,0);gate.observe(.06,400);gate.observe(.009,3400);
 assert.equal(gate.observe(.0001,4000).stop,false);assert.equal(gate.observe(.0001,6800).stop,true);
});
test('confirmed surname stresses, abbreviations and financial numbers survive repeated TTS preparation',()=>{
 const input='Шкуран и Ачинович: ПДЗ 123 456,78 BYN, АКБ 62, KPI 90%. артикул CRM42';
 const result=prepareLeraSpeech(input);assert.match(result,/Шк\+уран и Ачин\+ович/);assert.match(result,/просроченная задолженность 123 456,78 BYN/);assert.match(result,/активная клиентская база 62/);assert.match(result,/CRM42/);assert.equal(prepareLeraSpeech(result),result);assert.ok(!prepareLeraSpeech(input,{stress:false}).includes('+'));
 assert.equal(prepareLeraSpeech('Триовист'),'Триовист','unconfirmed proper-name stress must not be guessed');
});
test('browser and server share the same pronunciation behavior',()=>{
 const window={};vm.runInNewContext(read('assets/218-lera360-speech-accents-v1.js'),{window});
 assert.equal(window.crmAI360ApplySpeechAccentsV1('Шкуран Ачинович ПДЗ'),prepareLeraSpeech('Шкуран Ачинович ПДЗ'));
 assert.equal(read('supabase/functions/crm-voice-yandex-tts-v1/speech-text.mjs'),read('supabase/functions/_shared/lera-speech-v3.mjs'));
});
test('yesterday date and invalid dates cannot silently become arbitrary GPS evidence',()=>{
 assert.equal(gpsQuestionDay('вчера','2026-11-13'),'2026-11-12');assert.equal(gpsQuestionDay('позавчера','2026-11-01'),'2026-10-30');
 assert.equal(gpsQuestionDay('31.02.2026','2026-11-13'),'2026-11-13');
});
test('GPS session is not work start; first point requires strict confirmed arrival',async()=>{
 const selects=[];const svc={from:table=>{const q={select:columns=>{selects.push(columns);return q;},eq:()=>q,order:()=>q,limit:async()=>({data:table==='gps_workdays'?[{manager_name:'Шкуран',work_date:'2026-11-12',started_at:'2026-11-12T01:51:00Z'}]:[]})};return q;}};
 const evidence=await readGpsEvidence(svc,{manager:'Шкуран',month:'2026-11',day:'2026-11-13',question:'Во сколько вчера начала работу Шкуран?',firstTT:async()=>({data:[{manager_name:'Шкуран',proof_status:'unconfirmed',actual_arrival:'2026-11-12T06:00:00Z'},{manager_name:'Руднев',proof_status:'gps_confirmed_visit',actual_arrival:'2026-11-12T06:00:00Z'}]})});
 assert.equal(evidence.work_start_proven,false);assert.equal(evidence.confirmed_first_arrivals.length,0);assert.ok(!selects.join().includes('physical_stops'));
 const answer=gpsStartAnswer([evidence],{question:'Во сколько начала работу?'});assert.match(answer.brief,/04:51/);assert.match(answer.brief,/не доказывает фактическое начало работы/);assert.match(answer.brief,/прибытие.*не установлено/);
});
test('plural field managers and network scope clear old individual manager',()=>{
 for(const question of ['Покажи полевых менеджеров','По сети','А остальные менеджеры?']){
 const result=requestContext(question,{manager:'Шкуран'},['Шкуран','Руднев']);assert.equal(result.manager,null,question);
 }
});
test('Petrovich alias resolves only inside the authorized directory',()=>{
 const person={id:'a24954b8-2fe1-4852-b629-d8f351e1bd36',name:'Руководство компании'};
 assert.equal(directoryAlias('Петровичем',[person]),person);assert.equal(directoryAlias('Петрович',[]),null);
 assert.equal(canonicalMeetingClient('21vek triovist'),'Триовист');
});
function bindingSvc(binding={chat_id:123}){return {from:()=>{const q={select:()=>q,eq:()=>q,maybeSingle:async()=>({data:binding})};return q;}};}
test('reminder preparation asks for missing binding/date and only signs an owned draft',async()=>{
 const args={svc:bindingSvc(),actor:{id:'owner'},model:{title:'Ехать домой',due_date:'2026-11-14',due_time:'16:00'},startsAt:'2026-11-14T13:00:00.000Z',proof:async draft=>{assert.equal(draft.owner_id,'owner');return {token:'signed',expires_at:'future'};}};
 assert.equal((await reminderDraft({...args,startsAt:null})).mode,'needs_details');assert.equal((await reminderDraft({...args,svc:bindingSvc(null)})).mode,'needs_details');
 const result=await reminderDraft(args);assert.equal(result.mode,'prepared');assert.equal(result.requires_confirmation,true);assert.equal(result.created,0);assert.equal(result.draft.action,'reminder');
});
test('reminder commit rejects forged ownership and verifies the database insert',async()=>{
 const draft={owner_id:'owner',channel:'telegram',title:'Ехать домой',details:'',due_date:'2026-11-14',due_time:'16:00',due_at:'2026-11-14T13:00:00Z'};
 const args={svc:bindingSvc(),actor:{id:'owner'},draft,validMoment:()=>draft.due_at,caller:{from:()=>({insert:()=>({select:()=>({single:async()=>({data:{id:'new-id',owner_id:'owner',status:'pending',due_at:draft.due_at}})})})})}};
 assert.equal((await commitReminder({...args,draft:{...draft,owner_id:'other'}})).error,'reminder_parameters_invalid');assert.equal((await commitReminder(args)).delivery_status,'pending');
 args.caller={from:()=>({insert:()=>({select:()=>({single:async()=>({error:{code:'23505'}})})})})};assert.equal((await commitReminder(args)).mode,'already_exists');
});
test('delivery only sends to active private binding and records real Telegram acknowledgement',async()=>{
 const saved=[],sent=[];const options={ownerAllowed:true,binding:{chat_id:123},send:async(chat,text)=>{sent.push(chat);return {ok:true,message_id:9};},save:async(id,values)=>{saved.push(values);return true;}};
 assert.equal(await deliverReminder({id:'a',title:'Домой'},options),'sent');assert.deepEqual(sent,[123]);assert.equal(saved[0].telegram_message_id,9);
 sent.length=0;assert.equal(await deliverReminder({id:'b',title:'Домой'},{...options,binding:{chat_id:-123}}),'failed');assert.equal(sent.length,0);
});
test('network uncertainty does not claim delivery or retry a Telegram send',async()=>{
 let calls=0,save;const outcome=await deliverReminder({id:'a',title:'Домой'},{ownerAllowed:true,binding:{chat_id:123},send:async()=>{calls++;throw Error('timeout');},save:async(id,x)=>{save=x;return true;}});
 assert.equal(outcome,'delivery_unknown');assert.equal(calls,1);assert.equal(save.status,'delivery_unknown');
});
test('server requires signed explicit confirmation for creation and cancellation',()=>{
 const src=read('supabase/functions/crm-ai360-actions-v1/index.ts');assert.ok(src.indexOf('verifyToken(secret,actor.id,draft,token)')<src.indexOf("if(draft.action==='reminder')"));assert.ok(src.indexOf("explicit_confirmation_required")<src.indexOf("if(draft.action==='cancel_reminder')"));
 const worker=read('supabase/functions/crm-ai360-reminders-v1/index.ts');assert.ok(worker.indexOf("supplied!==expected")<worker.indexOf("crm_ai360_reminders_claim_v1"));assert.ok(!worker.includes('await req.json()'));
});
test('signed external Triovist meeting can commit without activating an archived client',async()=>{
 const mutations=[];
 const svc={from:table=>{assert.equal(table,'clients');const q={select:()=>q,or:()=>q,eq:()=>q,is:()=>q,ilike:()=>q,limit:async()=>({data:[]})};return q;}};
 const actor={id:'544fb1e2-ef70-44de-bc62-e0e1596a4bfc',tier:'owner'},date=new Date(Date.now()+2*86400000).toISOString().slice(0,10);
 const draft={action:'meeting',owner_id:actor.id,client_id:null,client_name:'Триовист',title:'Обсудить продажи клиента',details:'План продаж на следующий месяц',due_date:date,due_time:'16:00',starts_at:new Date(date+'T16:00:00+03:00').toISOString(),duration_minutes:60,format:'in_person',location:'',participant_names:[],source:'lera_agent360_confirmed_v1'};
 const caller={from:table=>{assert.equal(table,'crm_ai360_meetings_v1');const q={select:()=>q,eq:()=>q,gte:()=>q,lt:()=>q,limit:async()=>({data:[]}),insert:row=>{mutations.push(row);return {select:()=>({single:async()=>({data:{id:'11111111-1111-4111-8111-111111111111',owner_id:actor.id,starts_at:draft.starts_at,source:draft.source}})})};}};return q;}};
 const code=read('supabase/functions/crm-ai360-actions-v1/index.ts').replace(/^import .*;\r?\n/gm,'');const ctx={directoryAlias,canonicalMeetingClient,reminderDraft,commitReminder,TextEncoder,crypto,Response,Request,Intl,Date,Deno:{serve(){},env:{get(){}}},console};
 vm.runInNewContext(code+'\nthis.run=execute;this.sign=prepareToken;',ctx);
 const proof=await ctx.sign('fixture-key',actor.id,draft);
 const result=await ctx.run(new Request('https://resanta-crm.by'),{draft,approval_token:proof.token,confirmation:'подтверждаю'},actor,svc,caller,'fixture-key');
 assert.equal((await result.json()).mode,'created_meeting');assert.equal(mutations.length,1);assert.equal(mutations[0].client_id,null);assert.equal(mutations[0].client_name,'Триовист');
});
