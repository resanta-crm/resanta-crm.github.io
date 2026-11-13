// Presentation aliases resolve ONLY to an entry already in the authorized directory.
const norm=x=>String(x||'').toLocaleLowerCase('ru-RU').replace(/ё/g,'е').replace(/[^а-яa-z0-9]+/g,'').trim();
const EXEC='a24954b8-2fe1-4852-b629-d8f351e1bd36';
const PETROVICHEV=new Set(['петрович','петровичем','петровичу','петровичев','петровичева','петровичеву','петровичевым','виталий','виталию','виталием','виталийпетровичев']);
export function directoryAlias(name,directory){
 if(!PETROVICHEV.has(norm(name)))return null;
 return (directory||[]).find(x=>x.id===EXEC)||null;
}
export function displayPerson(person){return person?.id===EXEC?'Виталий Петровичев':String(person?.name||'');}
export function canonicalMeetingClient(value){
 const compact=norm(value).replace(/^(ооо|одо|оао)/,'').replace(/(ооо|одо|оао)$/,'');
 return /^(?:триовист|тривист|triovist|21vek|21век|(?:21vek|21век)(?:триовист|тривист|triovist)|(?:триовист|тривист|triovist)(?:21vek|21век))$/.test(compact)?'Триовист':String(value||'').trim();
}
