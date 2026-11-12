/* Lera 360: curated Russian stress hints for Yandex SpeechKit v3.
 * Only spoken text is modified, never answers on screen or CRM data.
 * Proper names are deliberately absent until their stress is verified.
 */
(function(root){
 'use strict';
 if(root.crmAI360ApplySpeechAccentsV1)return;
 const accents=Object.freeze({
  'звонит':'звон+ит',
  'звонят':'звон+ят',
  'перезвонит':'перезвон+ит',
  'перезвонят':'перезвон+ят',
  'каталог':'катал+ог',
  'каталога':'катал+ога',
  'каталоге':'катал+оге',
  'договор':'догов+ор',
  'договора':'догов+ора',
  'договоры':'догов+оры'
 });
 // Match whole Cyrillic words, not fragments of client names or article codes.
 const words=Object.keys(accents).sort((a,b)=>b.length-a.length).join('|');
 const regex=new RegExp('(^|[^А-Яа-яЁё])('+words+')(?=$|[^А-Яа-яЁё])','giu');
 root.crmAI360ApplySpeechAccentsV1=function(value){
  return String(value||'').replace(regex,(_match,sep,word)=>{
   const result=accents[word.toLocaleLowerCase('ru-RU')];
   return sep+(/^[А-ЯЁ]/.test(word)?result[0].toUpperCase()+result.slice(1):result);
  });
 };
})(window);
