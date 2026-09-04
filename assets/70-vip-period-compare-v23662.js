/* RESANTA CRM v23.6.64 · VIP MASTER ONLY
 * Keeps the confirmed 1C VIP membership/departments.
 * The optional "Дополнительное сравнение ВИП" block is intentionally removed.
 * No sales logic changes. No writes. No polling. No MutationObserver.
 */
(function(){
'use strict';
if(window.RESANTA_VIP_MASTER_V23664)return;

const legacyVipDefinitions=typeof window.vipMemberDefinitions==='function'?window.vipMemberDefinitions:null;
const VIP_1C_MASTER=[
  ['ВИП ДФ','Витебская строительная база ООО'],
  ['ВИП ДФ','ЧТУП Бензоленд'],
  ['ВИП ДФ','ЭльХомГарден ООО'],
  ['ВИП ДФ','Белзащита ОДО'],
  ['ВИП ДФ','Домич Строй ООО'],
  ['ВИП ДФ','Чашники Продмаркет ООО'],
  ['ВИП ДФ','ЦарьСтройДом ООО'],
  ['ВИП ДФ','Торговый Дом Бахус ЧТУП'],
  ['ВИП ДФ','Трухнов Валерий Антонович ИП'],
  ['ВИП ДФ','ВикингМаркетБай ООО'],
  ['ВИП ДФ','Умелый садовник ООО'],
  ['ВИП ДФ','ТолокА Инструмент Сервис ЧТСУП'],
  ['ВИП ДФ','Санторгснаб ООО'],
  ['ВИП ДФ','Аникогрупп ЧТПУП'],
  ['ВИП ДФС','Строймастер УЧП'],
  ['ВИП ДФС','Солстройкомплект ООО'],
  ['ВИП ДФС','Руд Буд ЧТУП'],
  ['ВИП МПП','Нарэк-торг УТЧП'],
  ['ВИП МПП','РегионТехСнаб ООО'],
  ['ВИП МПП','Элбиком ЧТУП'],
  ['ВИП МПП','ТД ИнструментМаркет ООО'],
  ['ВИП МПП','НилСтрой ООО'],
  ['ВИП МПП','Слабодчиков Андрей Сергеевич ИП'],
  ['ВИП МПП','Каримов Дмитрий Владимирович ИП'],
  ['ВИП МПП','Шанс-Хоум ООО'],
  ['ВИП МПП','Строй-АС ЧПТУП'],
  ['ВИП МПП','Пасанта ООО'],
  ['ВИП МПП','ИТ технологии ЧП'],
  ['ВИП МПП','АлгаСтрой ЧТУП'],
  ['ВИП МПП','Вулкан ЗАО'],
  ['ВИП МПП','Стройбазторг ООО'],
  ['ВИП МПП','Клен-сервис ОДО'],
  ['ВИП МПП','МирТехники ЧТПУП'],
  ['ВИП МПП','МИСАС ООО']
];

let cache={sig:'',rows:[]};

function key(v){
  let s=String(v||'');
  try{s=s.normalize('NFKC')}catch(_){}
  return s
    .replace(/\uFFFD/g,'')
    .replace(/\([^)]*головн[^)]*\)/giu,' ')
    .toLowerCase()
    .replace(/ё/g,'е')
    .replace(/[^a-zа-я0-9]+/giu,'')
    .trim();
}

function stableVipDefinitions(){
  const vipRows=(typeof allVipSales!=='undefined'&&Array.isArray(allVipSales))?allVipSales:[];
  const sig=String(vipRows.length);
  if(!vipRows.length){
    try{return legacyVipDefinitions?legacyVipDefinitions():[]}catch(_){return[]}
  }
  if(cache.sig===sig)return cache.rows;

  let base=[];
  try{base=legacyVipDefinitions?legacyVipDefinitions():[]}catch(_){base=[]}
  const used=new Set();

  const rows=VIP_1C_MASTER.map(([department,name])=>{
    const k=key(name);
    let hit=base.find((d,i)=>{
      if(used.has(i))return false;
      const names=[d?.client_name,d?.legal_name,...(Array.isArray(d?.member_names)?d.member_names:[])];
      return names.some(x=>key(x)===k);
    });
    if(hit){
      const i=base.indexOf(hit);
      used.add(i);
      return {...hit,client_name:name,legal_name:name,department};
    }
    return {
      client_name:name,
      legal_name:name,
      holding_name:'',
      department,
      member_names:[name],
      source_rows:[]
    };
  });

  cache={sig,rows};
  return rows;
}

window.vipMemberDefinitions=stableVipDefinitions;
try{vipMemberDefinitions=stableVipDefinitions}catch(_){}

try{document.getElementById('vip-period-compare-v23662')?.remove()}catch(_){}

window.RESANTA_VIP_MASTER_V23664=Object.freeze({
  version:'v23.6.64',
  masterSource:'1C confirmed list 04.09.2026',
  counts:{'ВИП ДФ':14,'ВИП ДФС':3,'ВИП МПП':17},
  comparisonBlockRemoved:true,
  noWrites:true,
  noPolling:true,
  noMutationObserver:true
});
})();