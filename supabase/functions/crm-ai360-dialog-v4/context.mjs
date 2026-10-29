// Shared deterministic conversational subject boundaries. No database access or writes.
import { russianSpokenDates } from './dates.mjs';
export const KNOWN_ENTITY_DOMAINS=new Set([
 'triovist','triovist_stock','triovist_tasks','competitors','cards_21vek',
 'card_issues','mrc','parser','infographics'
]);
const norm=x=>String(x||'').toLocaleLowerCase('ru-RU').replace(/ё/g,'е').trim();
const ending=new Set(['','а','у','ом','ым','ой','е','ы','ов','ой','ей']);
export function namedManager(question,managers){
 const words=norm(question).match(/[а-яa-z]+/g)||[];
 const hits=(managers||[]).filter(name=>{
  const key=norm(name);
  return words.some(w=>w===key||(w.startsWith(key)&&ending.has(w.slice(key.length))));
 });
 return hits.length===1?hits[0]:null;
}
export function isNetworkQuestion(question){
 return /(?:по всей сети|по всем менеджерам|все менеджеры|всех менеджеров|в целом по сети|в целом по филиалу|общие продажи|всего по филиалу)/i.test(String(question||''));
}
export function clientTopic(question){
 return /(?:триовист|триовист[ауеом]?|триовиста|тривист|21\s*век|21vek)/i.test(norm(question));
}
export function requestContext(question,memory,managers){
 const explicit=namedManager(question,managers);
 const network=isNetworkQuestion(question);
 const explicitClient=clientTopic(question);
 const contextFollowup=/^(?:а\s|а\?|сколько|какой план|что предлагаешь|расскажи подробнее|а почему)/i.test(norm(question));
 const otherSection=/(?:склад|остатк|пд[зс]|gps|джипиэс|маршрут|клиент[ыа]?|задач|акци|менеджер)/i.test(norm(question));
 const client=explicitClient||(!explicitClient&&!otherSection&&!explicit&&
   memory?.subject==='client'&&contextFollowup);
 const prior=typeof memory?.manager==='string'&&managers.includes(memory.manager)?memory.manager:null;
 const manager=network?null:(explicit||(client?null:prior));
 return {explicitManager:explicit,manager,network,client,
  resetManager:network||(client&&!explicit),subject:client?'client':manager?'manager':'network'};
}
export function effectiveManager(domain,context){
 if(domain==='client_groups'||domain==='client_schedule')return {manager:null,scope:'client_all'};
 if(domain==='triovist'){
  return context.explicitManager?{error:'triovist_personal_attribution_unavailable'}:
   {manager:null,scope:'client_all'};
 }
 if(KNOWN_ENTITY_DOMAINS.has(domain))return {manager:null,scope:'entity_all'};
 return {manager:context.manager,scope:context.manager?'manager':'network'};
}
export function localeSpeech(value){
 return russianSpokenDates(String(value||''))
  .replace(/в\s+с[эе]мпле/giu,'в неполной выборке')
  .replace(/с[эе]мпл(?:а|е|у|ом)?/giu,'неполная выборка')
  .replace(/\bsample\b/gi,'неполная выборка')
  .replace(/\b(?:сэмплы|семплы|samples)\b/gi,'неполные выборки')
  .replace(/\bBYN\b/g,'белорусских рублей')
  .replace(/\bRPC\b/g,'серверный расчёт')
  .replace(/\bSKU\b/g,'артикулов')
  .replace(/\bAI\b/g,'ИИ');
}
export function guardVoicePair(pair,{evidence=[],managers=[],question='',period=''}={}){
 if(!pair)return null;
 const normalized={brief:localeSpeech(pair.brief),detail:localeSpeech(pair.detail),offer:localeSpeech(pair.offer)};
 const triovist=evidence.find(x=>x?.domain==='triovist'&&x?.scope==='client_all'&&!x?.error);
 if(triovist){
  const joined=[normalized.brief,normalized.detail].join(' ');
  const wrongCurrency=/(?:₽|\bRUB\b|российск\w*\s+рубл)/i.test(joined);
  const wrongOwner=managers.some(name=>new RegExp('(?:^|[^а-я])'+norm(name)+'(?:а|у|ом|ым|ой|е)?(?:[^а-я]|$)','i').test(norm(joined)));
  if(wrongCurrency||wrongOwner){
   const money=n=>Number(n||0).toLocaleString('ru-RU',{maximumFractionDigits:2});
   const month=String(triovist.month||period||'').slice(0,7);
   const initial='По клиенту «Триовист» за '+month+': продажи '+money(triovist.revenue)+
      ' белорусских рублей при плане '+money(triovist.plan)+' белорусских рублей.';
   return {brief:initial,detail:initial+' Это общий показатель клиента, не персональные продажи менеджера.',
    offer:'Проверить выполнение плана и причины отклонений?',corrected:true,reason:wrongCurrency?'currency':'owner'};
  }
 }
 return {...normalized,corrected:false};
}
