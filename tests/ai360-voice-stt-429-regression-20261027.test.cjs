'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync('assets/135-resanta-voice-capture-fix-v2.js','utf8');
const migration=fs.readFileSync('supabase/migrations/20261027195900_ai360_voice_claim_300_v1.sql','utf8');
const launcher=fs.readFileSync('assets/137-resanta-ai360-lazy-launch-v1.js','utf8');
const html=fs.readFileSync('index.html','utf8');
assert.match(migration,/WHERE c\.requests < 300/);
assert.match(migration,/ON CONFLICT \(user_id,usage_date\)/);
assert.match(migration,/RETURN n IS NOT NULL/);
assert.doesNotMatch(migration,/TRUNCATE|DELETE FROM|DROP TABLE/i);
assert.match(source,/voice_daily_limit\|daily_limit/);
assert.match(source,/speech_monthly_budget_exhausted/);
assert.match(source,/speech_provider_rate_limit/);
assert.match(source,/лимит распознавания на сегодня исчерпан \(300 фраз\)/i);
assert.match(source,/if\(phrase===null\)\{await stopAll\(transcriptFailure\|\|/);
assert.match(source,/if\(question===null\)\{await stopAll\(transcriptFailure\|\|/);
assert.match(source,/if\(newMode==='manual' && activeRecorder\?\.state==='recording'\)/);
assert.match(source,/activeRecorder\.stop\(\);info\('Завершаю запись/);
assert.match(source,/Date\.now\(\)-lastLoud>\(mode==='wake'\?2200:2700\)/);
assert.match(source,/const clip=await capture\(12,epoch\)/);
assert.match(launcher,/135-resanta-voice-capture-fix-v2.js\?v=16/);
assert.match(html,/137-resanta-ai360-lazy-launch-v1.js\?v=30/);
const start=source.indexOf(' async function manualLoop(epoch){');
const end=source.indexOf(' async function wakeLoop(epoch){',start);
assert.ok(start>=0&&end>start);
const manual=source.slice(start,end);
const messages=[];
const ctx={
 listenEpoch:1,mode:'manual',transcriptFailure:'Лимит распознавания на сегодня исчерпан (300 фраз).',
 capture:async()=>({blob:{size:12000},loud:true}),
 transcribe:async()=>null,
 stopAll:async message=>messages.push(message),
 info:()=>{},submit:()=>{},noiseOnly:()=>false,greetingOnly:()=>false,
 waitForAssistant:async()=>{},reason:e=>String(e)
};
vm.runInNewContext(manual+'\nthis.manualLoop=manualLoop;',ctx);
ctx.manualLoop(1).then(()=>{
 assert.equal(messages.length,1,'only one terminal stop');
 assert.equal(messages[0],ctx.transcriptFailure,'server rejection must not be displayed as unintelligible speech');
 console.log('PASS: quota issue preserved in UI, natural pauses and 300/day atomic cap');
}).catch(e=>{console.error(e);process.exitCode=1;});
