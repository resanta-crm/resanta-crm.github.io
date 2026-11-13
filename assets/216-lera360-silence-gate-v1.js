/* Adaptive, budget-free local speech-end detector; configurable 1.5–4.2 s silence, never microphone access.
 * Only amplitude data from an already user-authorized foreground stream is inspected.
 */
(function(root){
 'use strict';
 if(root.crmAI360CreateSilenceGateV1)return;
 root.crmAI360CreateSilenceGateV1=function(options={}){
  const pauseMs=Math.max(1500,Math.min(4200,Number(options.pauseMs)||3300));
  const noSpeechMs=Math.max(2500,Math.min(7000,Number(options.noSpeechMs)||4200));
  let floor=Infinity,peak=0,peakAt=0,lastVoiceAt=0,heard=false;
  function observe(rms,elapsedMs){
   if(!Number.isFinite(rms)||rms<0||!Number.isFinite(elapsedMs))
    return {heard,stop:false,reason:'meter_unavailable'};
   const level=Math.min(1,Math.max(0,rms));
   floor=Math.min(floor,level); // auto-adapt to steady background noise
   if(level>peak){peak=level;peakAt=elapsedMs;}
   const baseline=Math.max(0.0004,floor);
   const hasSpeech=peak>=Math.max(0.0030,baseline*1.75);
   if(hasSpeech){
    if(!heard){heard=true;lastVoiceAt=peakAt;}
    const active=Math.max(0.0028,baseline*1.3,peak*0.65);
    if(level>=active)lastVoiceAt=elapsedMs;
    if(elapsedMs>=550&&elapsedMs-lastVoiceAt>=pauseMs)
     return {heard:true,stop:true,reason:'end_of_speech'};
   }else if(elapsedMs>=noSpeechMs){
    return {heard:false,stop:true,reason:'no_speech'};
   }
   return {heard,stop:false};
  }
  return Object.freeze({observe});
 };
})(window);
