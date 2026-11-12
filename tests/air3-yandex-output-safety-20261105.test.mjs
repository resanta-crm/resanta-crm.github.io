import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const quality=readFileSync('assets/136-resanta-voice-quality-v3.js','utf8');
const loader=readFileSync('assets/137-resanta-ai360-lazy-launch-v1.js','utf8');
const manager=readFileSync('assets/157-resanta-ai360-android-staff-launch-v1.js','utf8');

test('Android output is primed only after an explicit director action, not at CRM login',()=>{
 assert.ok(loader.includes('function primeAndroidOutput()'));
 assert.ok(loader.includes('if(!nativeAndroid||!owner())return false'));
 const begin=loader.indexOf("start.addEventListener('click',async()=>{");
 const click=loader.slice(begin,loader.indexOf('\n });\n}',begin));
 assert.ok(click.includes('primeAndroidOutput();'));
 assert.ok(click.indexOf('primeAndroidOutput();')<click.indexOf('await load(src);'));
 assert.ok(loader.includes('window.__resantaAI360AndroidOutputContextV1=context'));
 assert.ok(loader.includes('new Constructor()'));
 assert.ok(!loader.slice(loader.indexOf('async function activate(){'),loader.indexOf('function reconcile(){')).includes('primeAndroidOutput();'));
 assert.ok(!manager.includes('__resantaAI360AndroidOutputContextV1'));
});

test('Android sound is a separate optional file; desktop retains old player path',()=>{
 assert.ok(loader.includes("'./assets/136-resanta-voice-quality-v3.js?v=19'"));
 assert.ok(loader.includes("'./assets/136-resanta-voice-quality-v3.js?v=19'"),'desktop script stays version 17');
 assert.ok(quality.includes('const nativeAndroidDirector='));
 assert.ok(quality.includes('const context=androidContext();'));
 assert.ok(quality.includes('await playAndroidWav(blob,run);'));
 assert.ok(quality.includes("androidOutputMode='html-audio-fallback'"));
 assert.ok(quality.includes('output=new Audio(outputUrl);output.preload='));
 assert.ok(quality.includes('!approvedYandex'));
 assert.ok(quality.includes('resumeAndroidOutputFromGesture();'));
});

function isolatePlayer(context,setStatus=()=>{}){
 const begin=quality.indexOf('async function playAndroidWav(blob,run){');
 const end=quality.indexOf('const VOICE_KEY=',begin);
 assert.ok(begin>=0&&end>begin);
 const part=quality.slice(begin,end);
 return new Function('context','setStatus',
 'let epoch=7, audioDone=null,androidSource=null,androidOutputMode="";\n'+
 'const androidContext=()=>context;\n'+part+
 '\nreturn {playAndroidWav,state:()=>({epoch,audioDone,androidSource,androidOutputMode})};'
 )(context,setStatus);
}
test('AudioBufferSource plays Yandex WAV and ends cleanly on INMO',async()=>{
 let started=0,connected=0,disconnected=0;
 const statuses=[];
 const context={state:'running',destination:{},
 decodeAudioData:async()=>({duration:0.5}),
 createBufferSource:()=>({playbackRate:{value:1},
  connect(){connected++;},disconnect(){disconnected++;},
  start(){started++;queueMicrotask(()=>this.onended?.());}
 })
 };
 const p=isolatePlayer(context,s=>statuses.push(s));
 await p.playAndroidWav({arrayBuffer:async()=>new ArrayBuffer(32)},7);
 assert.equal(started,1);
 assert.equal(connected,1);
 assert.equal(disconnected,1);
 assert.equal(p.state().androidSource,null);
 assert.equal(p.state().androidOutputMode,'webaudio');
 assert.ok(statuses.some(s=>s.includes('Web Audio')));
});
test('Suspended output and invalid WAV are reported instead of silent success',async()=>{
 const suspended=isolatePlayer({state:'suspended'});
 await assert.rejects(suspended.playAndroidWav({arrayBuffer:async()=>new ArrayBuffer(32)},7),/android_audio_context_suspended/);
 const invalid=isolatePlayer({state:'running',decodeAudioData:async()=>{throw Error('bad wav')}});
 await assert.rejects(invalid.playAndroidWav({arrayBuffer:async()=>new ArrayBuffer(32)},7),/android_wav_decode_failed/);
});
test('Output timeout and fallback leave CRM alive without touching Supabase writes',()=>{
 assert.ok(quality.includes('android_audio_timeout'));
 assert.ok(quality.includes('android_html_audio_stalled'));
 assert.ok(quality.includes('android_audio_context_suspended'));
 assert.ok(quality.includes('android_wav_decode_failed'));
 assert.ok(quality.includes('Yandex audio validated'));
 assert.ok(!quality.includes('.insert(') && !quality.includes('.update('));
});
