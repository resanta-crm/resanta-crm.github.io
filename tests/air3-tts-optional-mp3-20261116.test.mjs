import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {stripTypeScriptTypes} from 'node:module';
import {prepareLeraSpeech} from '../supabase/functions/crm-voice-yandex-tts-v1/speech-text.mjs';

const source=stripTypeScriptTypes(fs.readFileSync('supabase/functions/crm-voice-yandex-tts-v1/index.ts','utf8').replace(/^import .*;\n/gm,''));
const bytes=header=>new Uint8Array([...header,...new Uint8Array(400)]);
const WAV=bytes([82,73,70,70,0,0,0,0,87,65,86,69]);
const ID3=bytes([73,68,51,4,0,0,0,0,0,0]);
const FRAME=bytes([255,251,144,0]);
function fixture({audio=ID3,authorized=true,forbidden=false,upstreamStatus=200}={}){
 let handler;const calls=[],claims=[];
 const profile={id:'544fb1e2-ef70-44de-bc62-e0e1596a4bfc',name:'Александр Паюшин',role:forbidden?'disabled':'boss'};
 const supabase={auth:{getUser:async()=>({data:{user:authorized?{id:profile.id,email:'owner@example.test'}:null}})},
  from:()=>({select(){return this;},eq(){return this;},maybeSingle:async()=>({data:profile})}),
  rpc:async(name,args)=>{claims.push({name,args});return {data:{allowed:true}};}};
 const ctx={Request,Response,Uint8Array,TextEncoder,TextDecoder,AbortSignal,Promise,JSON,Set,Error,String,Record:undefined,
  atob:value=>Buffer.from(value,'base64').toString('binary'),prepareLeraSpeech,createClient:()=>supabase,
  console:{warn(){}},Deno:{env:{get:()=> 'test-only'},serve:fn=>handler=fn},
  fetch:async(url,options)=>{calls.push({url,body:JSON.parse(options.body)});return new Response(JSON.stringify({audioChunk:{data:Buffer.from(audio).toString('base64')}}),{status:upstreamStatus});}};
 vm.runInNewContext(source,ctx);
 const request=payload=>handler(new Request('https://example.test',{method:'POST',headers:{Authorization:'Bearer test-only',Origin:'https://resanta-crm.by','Content-Type':'application/json'},body:JSON.stringify(payload)}));
 return {request,calls,claims};
}
test('optional MP3 uses one budget claim and one synthesis with unchanged prepared text/voice/model/role',async()=>{
 const h=fixture(),text='Шкуран проверит договор.';
 const response=await h.request({text,voice:'dasha',format:'mp3'});
 assert.equal(response.status,200);assert.equal(h.claims.length,1);assert.equal(h.calls.length,1);
 assert.equal(h.claims[0].name,'crm_ai360_yandex_monthly_claim_v1');assert.equal(h.claims[0].args.p_characters,prepareLeraSpeech(text).length);
 assert.deepEqual(h.calls[0].body,{text:prepareLeraSpeech(text),model:'general',hints:[{voice:'dasha'},{role:'friendly'}],outputAudioSpec:{containerAudio:{containerAudioType:'MP3'}}});
 assert.equal(response.headers.get('Content-Type'),'application/octet-stream');assert.equal(response.headers.get('X-Audio-Content-Type'),'audio/mpeg');assert.equal(response.headers.get('Cache-Control'),'no-store');
 assert.deepEqual(new Uint8Array(await response.arrayBuffer()),ID3);
});
test('omitted format and explicit WAV preserve the previous upstream request and WAV bytes',async()=>{
 for(const explicit of [false,true]){
  const h=fixture({audio:WAV}),payload={text:'Проверка звука.',voice:'lera'};if(explicit)payload.format='wav';
  const response=await h.request(payload);assert.equal(response.status,200);assert.equal(h.claims.length,1);assert.equal(h.calls.length,1);
  assert.deepEqual(h.calls[0].body,{text:prepareLeraSpeech(payload.text),model:'general',hints:[{voice:'lera'},{role:'friendly'}]});
  assert.equal(response.headers.get('X-Audio-Content-Type'),'audio/wav');assert.deepEqual(new Uint8Array(await response.arrayBuffer()),WAV);
 }
});
test('unsupported or malformed format is rejected before reserving budget or sending synthesis',async()=>{
 for(const format of ['ogg','MP3','',null,12,{}]){
  const h=fixture(),response=await h.request({text:'Проверка.',voice:'lera',format});
  assert.equal(response.status,400);assert.equal((await response.json()).error,'invalid_audio_format');assert.equal(h.claims.length,0);assert.equal(h.calls.length,0);
 }
});
test('MP3 format does not bypass existing authentication or profile authorization',async()=>{
 for(const options of [{authorized:false},{forbidden:true}]){
  const h=fixture(options),response=await h.request({text:'Проверка.',voice:'lera',format:'mp3'});
  assert.equal(response.status,options.authorized===false?401:403);assert.equal(h.claims.length,0);assert.equal(h.calls.length,0);
 }
});
test('ID3 and MPEG Layer III signatures are accepted; mismatched or malformed audio never resynthesizes',async()=>{
 for(const audio of [ID3,FRAME,WAV,bytes([73,68,51,9,0,0,0,0,0,0]),bytes([255,255,255,0])]){
  const h=fixture({audio}),response=await h.request({text:'Проверка.',voice:'lera',format:'mp3'});
  assert.equal(response.status,audio===ID3||audio===FRAME?200:502);assert.equal(h.claims.length,1);assert.equal(h.calls.length,1);
 }
});
test('provider failures remain one claim/one upstream call without WAV retry',async()=>{
 const h=fixture({upstreamStatus:503}),response=await h.request({text:'Проверка.',voice:'lera',format:'mp3'});
 assert.equal(response.status,502);assert.equal(h.claims.length,1);assert.equal(h.calls.length,1);
});
