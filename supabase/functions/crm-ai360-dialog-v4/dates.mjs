// Server-side spoken Russian dates: avoid TTS reading "28.10" as digits.
export const MONTHS_GEN=['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'];
const MONTHS_NOM=['январь','февраль','март','апрель','май','июнь','июль','август','сентябрь','октябрь','ноябрь','декабрь'];
const MONTHS_PREP=['январе','феврале','марте','апреле','мае','июне','июле','августе','сентябре','октябре','ноябре','декабре'];
function valid(day,month,year=2024){
 const date=new Date(Date.UTC(year,month-1,day));
 return month>=1&&month<=12&&day>=1&&day<=31&&
 date.getUTCDate()===day&&date.getUTCMonth()===month-1;
}
export function russianSpokenDates(raw){
 let s=String(raw??'');
 // ISO full date (year-month-day), e.g. 2026-10-29
 s=s.replace(/\b(20\d{2})-(0[1-9]|1[0-2])-([0-2]\d|3[01])\b/g,(full,yy,mm,dd)=>{
  const y=Number(yy),m=Number(mm),d=Number(dd);
  return valid(d,m,y)?d+' '+MONTHS_GEN[m-1]+' '+y+' года':full;
 });
 // Full Russian date dd.mm.yyyy, with optional single-digit month/day.
 s=s.replace(/(^|[^\d])([0-2]?\d|3[01])\.(0?[1-9]|1[0-2])\.(20\d{2})(?!\d)/g,
 (full,p,dd,mm,yy)=>valid(+dd,+mm,+yy)?p+(+dd)+' '+MONTHS_GEN[+mm-1]+' '+yy+' года':full);
 // Bare day/month: don't rewrite a price when followed immediately by rubles.
 s=s.replace(/(^|[^\d.])([0-2]?\d|3[01])\.(0?[1-9]|1[0-2])(?![\d.])/g,
 (full,p,dd,mm,offset,whole)=>{
  const after=whole.slice(offset+full.length);
  if(/^\s*(?:руб(?:л|\.|\b)|₽|BYN|бел\.?\s*руб)/i.test(after))return full;
  return valid(+dd,+mm)?p+(+dd)+' '+MONTHS_GEN[+mm-1]:full;
 });
 // Period labels, not quantities. "за 2026-10" -> "за октябрь 2026 года"
 s=s.replace(/\bза\s+(20\d{2})-(0[1-9]|1[0-2])\b/gi,
 (_full,y,m)=>'за '+MONTHS_NOM[+m-1]+' '+y+' года');
 s=s.replace(/\bв\s+(20\d{2})-(0[1-9]|1[0-2])\b/gi,
 (_full,y,m)=>'в '+MONTHS_PREP[+m-1]+' '+y+' года');
 return s;
}
