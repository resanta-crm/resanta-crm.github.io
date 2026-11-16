import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const code=fs.readFileSync('assets/136-resanta-voice-quality-v3.js','utf8');
const helper=code.slice(code.indexOf('async function air3ReadVoiceAudioV1'),code.indexOf('async function cloudSpeak'));
function setup(fetch){
 const logs=[];const context={fetch,Date,Blob,Error,SUPABASE_URL:'https://example.supabase.co',SUPABASE_KEY:'public-test',console:{info:x=>logs.push(x)}};
 vm.runInNewContext(helper,context);return {read:context.air3ReadVoiceAudioV1,logs};
}
test('AIR3 uses one authenticated request and preserves binary audio bytes',async()=>{
 let calls=0;
 const bytes=new Uint8Array(204646);bytes.set([82,73,70,70]);bytes.set([87,65,86,69],8);
 const c=setup(async(url,options)=>{
  calls++;assert.equal(url,'https://example.supabase.co/functions/v1/crm-voice-yandex-tts-v1');
  assert.equal(options.headers.Authorization,'Bearer session-test');
  return new Response(bytes,{headers:{'Content-Type':'application/octet-stream'}});
 });
 const result=await c.read({access_token:'session-test'},{text:'Тест',voice:'lera'},new AbortController().signal);
 assert.equal(calls,1);assert.equal(result.data.size,bytes.length);
 assert.deepEqual(new Uint8Array(await result.data.arrayBuffer()),bytes);
 assert.ok(c.logs.some(x=>x.includes('complete bytes=204646')));
 assert.ok(c.logs.every(x=>!x.includes('session-test')));
});
test('stop during pending response never returns late audio or replays request',async()=>{
 let release,calls=0;
 const c=setup(()=>{calls++;return new Promise(done=>{release=done;});});
 const controller=new AbortController();
 const result=c.read({access_token:'test'},{},controller.signal);
 controller.abort(new Error('voice_request_cancelled'));
 release(new Response(new Uint8Array(1024)));
 await assert.rejects(result,/voice_request_cancelled/);assert.equal(calls,1);
});
test('provider error is preserved without attempting playback',async()=>{
 const c=setup(async()=>new Response(JSON.stringify({error:'tts_monthly_budget_exhausted'}),{status:429}));
 await assert.rejects(c.read({access_token:'test'},{},new AbortController().signal),/tts_monthly_budget_exhausted/);
});
