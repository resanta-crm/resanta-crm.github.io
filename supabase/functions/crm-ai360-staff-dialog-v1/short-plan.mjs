// Personal sales-plan questions are deterministic and read-only.
// Do not expand answers with sales facts, customer lists, or unsolicited analysis.
const normalize=x=>String(x||'').toLocaleLowerCase('ru-RU').replace(/ё/g,'е').replace(/\s+/g,' ').trim();
export function isPersonalPlanQuestion(question){
 const q=normalize(question);
 return /(?:какой|каков|сколько|назови|скажи|подскажи)\b.*?\bплан(?:а|ов)?\b/.test(q)
  &&/(?:у меня|мой|мне|личный|по продажам|на\s+(?:\w+\s+)?месяц|на\s+(?:январ|феврал|март|апрел|ма[йя]|июн|июл|август|сентябр|октябр|ноябр|декабр)|за\s+(?:январ|феврал|март|апрел|ма[йя]|июн|июл|август|сентябр|октябр|ноябр|декабр))/.test(q)
  &&!/(?:почему|причин|сравн|выполн|факт|просроч|клиент|товар|групп|разбив|подроб)/.test(q);
}
export function concisePlan(evidence,manager,month){
 if(!evidence||evidence.answer_verified!==true||evidence.read_only!==true||evidence.domain!=='sales'||
    !Array.isArray(evidence.scope?.managers)||evidence.scope.managers.length!==1||
    evidence.scope.managers[0]!==manager||evidence.data?.source!=='crm_ai360_sales_kpi_snapshot_v1'||
    evidence.data?.month!==month||!Array.isArray(evidence.data?.managers))return null;
 const matches=evidence.data.managers.filter(x=>normalize(x.manager_name)===normalize(manager));
 if(matches.length!==1)return 'В CRM нет подтверждённого плана продаж на выбранный месяц.';
 const plan=Number(matches[0].plan);
 if(matches[0].plan==null||!Number.isFinite(plan)||plan<0)return 'В CRM нет подтверждённого плана продаж на выбранный месяц.';
 const months=['январь','февраль','март','апрель','май','июнь','июль','август','сентябрь','октябрь','ноябрь','декабрь'];
 const mm=Number(month.slice(5,7));
 if(mm<1||mm>12)return null;
 return 'Ваш план продаж на '+months[mm-1]+' '+month.slice(0,4)+' года — '+Math.round(plan).toLocaleString('ru-RU')+' белорусских рублей.';
}
