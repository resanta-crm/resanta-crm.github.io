/* Shared, user-confirmed speech pronunciation; no requests or microphone. */
(function(root){
'use strict';
// Pronunciation only. Never apply this module to CRM records or display names.
// Surname stresses explicitly confirmed by Александр on 13 November 2026.
const ACCENTS=Object.freeze({
 'звонит':'звон+ит','звонят':'звон+ят','перезвонит':'перезвон+ит','перезвонят':'перезвон+ят',
 'каталог':'катал+ог','каталога':'катал+ога','каталоге':'катал+оге',
 'договор':'догов+ор','договора':'догов+ора','договоры':'догов+оры',
 'шкуран':'шк+уран','шкурана':'шк+урана','шкурану':'шк+урану','шкураном':'шк+ураном',
 'ачинович':'ачин+ович','ачиновича':'ачин+овича','ачиновичу':'ачин+овичу','ачиновичем':'ачин+овичем'
});
const ABBREVIATIONS=Object.freeze({'ПДЗ':'просроченная задолженность','АКБ':'активная клиентская база',
 'ТТ':'торговая точка','KPI':'показатели эффективности','КПИ':'показатели эффективности',
 'CRM':'система','СRM':'система','SKU':'артикул','УЧП':'частное предприятие','ООО':'общество с ограниченной ответственностью'});
function prepareLeraSpeech(value,{stress=true}={}){
 let s=String(value||'').normalize('NFC').replace(/\u0301/g,'')
  .replace(/\bpartial\s*[:=]\s*false\b/gi,'список выбранного источника полный')
  .replace(/\bpartial\s*[:=]\s*true\b/gi,'показана часть данных');
 s=s.replace(/(^|[^А-Яа-яЁёA-Za-z0-9])([А-ЯЁA-Z]{2,4})(?=$|[^А-Яа-яЁёA-Za-z0-9])/g,
  (all,sep,word)=>ABBREVIATIONS[word]?sep+ABBREVIATIONS[word]:all);
 // Idempotent: a caller may already have supplied SpeechKit stress marks.
 s=s.replace(/\+([АЕЁИОУЫЭЮЯаеёиоуыэюя])/g,'$1');
 if(!stress)return s;
 return s.replace(/[А-Яа-яЁё]+/g,word=>{
  const result=ACCENTS[word.toLocaleLowerCase('ru-RU')];
  if(!result)return word;
  return word===word.toUpperCase()?result.toUpperCase():/^[А-ЯЁ]/.test(word)?result[0].toUpperCase()+result.slice(1):result;
 });
}

root.crmAI360ApplySpeechAccentsV1=prepareLeraSpeech;
root.crmAI360PrepareSpeechTextV3=value=>prepareLeraSpeech(value,{stress:false});
})(window);
