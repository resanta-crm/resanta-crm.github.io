'use strict';
const fs=require('node:fs');
const assert=require('node:assert/strict');
const pilot=fs.readFileSync('assets/134-resanta-voice-ai360-pilot-v1.js','utf8');
const capture=fs.readFileSync('assets/135-resanta-voice-capture-fix-v2.js','utf8');
const voice=fs.readFileSync('assets/136-resanta-voice-quality-v3.js','utf8');
const loader=fs.readFileSync('assets/137-resanta-ai360-lazy-launch-v1.js','utf8');
// Main panel, not a cramped popover. Controls are real and have listeners.
for(const expected of [
 'width:min(510px','rva-history','rva-control','rva-fullscreen','rva-mini-toggle',
 "root.classList.toggle('rva-mini')","root.classList.toggle('rva-fullscreen')",
 'rva-pause-audio','rva-mini-playback','rva-stop-audio','rva-settings-body',
 'rva-feedback-type','rva-feedback-copy','Отметить ошибку','Прочитать полностью'
])assert(pilot.includes(expected),'missing UI feature: '+expected);
assert(pilot.includes("root.querySelector('.rva-feedback-copy')?.addEventListener('click'"),
 'feedback must be a live control');
assert(pilot.includes('navigator.clipboard?.writeText'),'only copy on user action, no remote submission');
assert(!/db\.(?:from|functions)\.invoke.*feedback/i.test(pilot),'no automatic CRM feedback writes');
assert(pilot.includes('feedbackTarget.response')&&pilot.includes('feedbackTarget.question'),
 'feedback includes an answer and its question');
const detailed=/const asksForFullNarration=([^;]+);/.exec(pilot);
assert(detailed,'missing conversational full narration recognizer');
const matches=(q)=>new RegExp(detailed[1].slice(1,detailed[1].lastIndexOf('/')),'').test(q);
assert(matches('расскажи пожалуйста поподробнее чтобы я не хочу читать хочу услышать'),
 'must understand the exact phrase from video');
assert(matches('хочу услышать полностью'));
assert(matches('прочитай весь ответ'));
assert(matches('расскажи подробнее'));
assert(!matches('какие продажи у Шкуран'),'sales question must not be mistaken for full playback');
assert(pilot.includes('lastSubstantialAnswer'),'short clarifications must not erase long earlier answer');
for(const clause of ['window.crmResantaVoiceTogglePauseV3','updatePlaybackControls','paused=!paused'])
 assert(voice.includes(clause),'missing audio pause/resume: '+clause);
assert(voice.includes("panel.querySelector('.rva-mini-playback')?.addEventListener('click'"),'mini player pause must be wired');
assert(voice.includes('window.addEventListener(\'pagehide\',stopSpeech)'),
 'navigation still stops audio');
assert(!voice.includes("document.addEventListener('visibilitychange',()=>{if(document.hidden)stopSpeech();});"),
 'hiding browser tab must not stop Lera');
assert(!voice.includes('||panel?.hidden||document.hidden)break'),
 'speech must finish when switching tabs');
assert(capture.includes("if(document.hidden && mode)void stopAll"),'hidden tab must stop microphone');
assert(capture.includes("!panel.classList?.contains('rva-mini')"),'mini player must stop microphone');
assert(capture.includes('noiseOnly(phrase)'),'skip lone noise fragments');
assert(loader.includes('Android'),'safe lazy launch still excludes Android');
assert(pilot.includes("currentProfile?.role === 'boss'"),'only director sees assistant');
console.log('AI360 UX: director-only spacious panel, feedback, nuanced full speech, background audio and foreground mic guards PASS');
