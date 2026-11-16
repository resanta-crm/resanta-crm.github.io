const norm=s=>String(s||'').toLowerCase().replaceAll('ё','е');
export function routeTaskCommand(q){return /задач/.test(norm(q))&&/(?:сформир|подготов|постав|созда|назнач)/.test(norm(q))&&!/не\s+(?:надо\s+|нужно\s+)?(?:став|созда|формир|подготов|назнач)/.test(norm(q));}
export function spokenRouteDate(question,today){
 let q=norm(question).replace(/семнадцат(?:ое|ого|ый)/g,'17').replace(/восемнадцат(?:ое|ого|ый)/g,'18').replace(/девятнадцат(?:ое|ого|ый)/g,'19').replace(/двадцат(?:ое|ого|ый)/g,'20');
 const shift=n=>new Date(Date.parse(today+'T12:00:00Z')+n*86400000).toISOString().slice(0,10);
 if(/послезавтра/.test(q))return shift(2);if(/завтра/.test(q))return shift(1);if(/сегодня/.test(q))return today;
 const iso=q.match(/\b(20\d\d)-(\d\d)-(\d\d)\b/),dotted=q.match(/\b(\d{1,2})\.(\d{1,2})(?:\.(20\d\d))?\b/);
 const months=['январ','феврал','март','апрел','ма[йяе]','июн','июл','август','сентябр','октябр','ноябр','декабр'];
 const named=q.match(new RegExp('(\\d{1,2})(?:-?(?:е|го|ое|ого))?\\s*('+months.join('|')+')[а-я]*(?:\\s+(20\\d\\d))?'));
 const bare=q.match(/(?:на\s+|к\s+)(\d{1,2})(?:-?(?:е|го|ое|ого))?(?:\s+числ[а-я]*)?(?=\s|[,?.!]|$)/);
 let date=iso?iso[0]:dotted?`${dotted[3]||today.slice(0,4)}-${dotted[2].padStart(2,'0')}-${dotted[1].padStart(2,'0')}`:named?`${named[3]||today.slice(0,4)}-${String(months.findIndex(m=>new RegExp('^'+m).test(named[2]))+1).padStart(2,'0')}-${named[1].padStart(2,'0')}`:bare?today.slice(0,8)+bare[1].padStart(2,'0'):null;
 if(!date)return null;
 return !Number.isNaN(Date.parse(date+'T12:00:00Z'))&&new Date(date+'T12:00:00Z').toISOString().slice(0,10)===date?date:null;
}
export async function prepareRouteRequest(caller,input,profile,today){
 const q=String(input.question||''),pending=input.memory?.route_task_prepare;
 const formation=routeTaskCommand(q)&&(/маршрут|менеджер|недел|числ|на\s+\d|завтра|сегодня/.test(norm(q))||/задачи/.test(norm(q)));
 if(!formation&&!pending)return null;
 const base={protocol:'lera_dialogue_v2',read_only:true,writes_enabled:false,created:0,requires_confirmation:true,mode:'route_task_clarify_v5'};
 if(profile.role!=='boss'||!['Витебск','Все филиалы'].includes(profile.region))return {...base,answer:'Формировать задачи по маршруту может руководитель. Вы можете посмотреть свои задачи.'};
 if(pending&&/отмен|не надо|не нужно/.test(norm(q)))return {...base,answer:'Подготовка отменена. Задачи не создавались.',memory:{route_task_prepare:null}};
 // Do not reinterpret a new unrelated question as a pending route choice.
 if(pending&&!routeTaskCommand(q)&&q.length>140)return null;
 const users=await caller.from('users').select('name').eq('role','manager').eq('region','Витебск');
 if(users.error)throw Error('staff_directory_unavailable');
 const names=(users.data||[]).map(x=>x.name),matches=names.filter(n=>norm(q).split(/[^а-я]+/).some(word=>norm(n).split(' ').some(part=>part.length>=4&&new RegExp('^'+part+'(?:а|у|е|о|ом|ым|ой|ей)?$').test(word))));
 const manager=matches.length===1?matches[0]:matches.length>1?null:names.includes(pending?.manager)?pending.manager:null;
 const explicitDate=spokenRouteDate(q,today),date=explicitDate||pending?.date||null;
 const memory={route_task_prepare:{manager,date}};
 if(!manager)return {...base,answer:'Для какого менеджера подготовить задачи из маршрута?',memory};
 if(!date)return {...base,answer:`На какую дату подготовить маршрут ${manager}? Назовите число и месяц.`,memory};
 if(date<today)return {...base,answer:'Это прошедшая дата. Назовите дату предстоящего маршрута.',memory:{route_task_prepare:{manager,date:null}}};
 const r=await caller.from('route_plans').select('id,client_id,linked_client_ids,approved,review_status,removed,is_office_day,is_network_point,network_point_id').eq('manager_name',manager).eq('visit_date',date).limit(1000);
 if(r.error)throw Error('route_context_unavailable');
 if(r.data?.length===1000)throw Error('route_context_incomplete');
 const routes=(r.data||[]).filter(x=>!x.removed&&!x.is_office_day&&!x.is_network_point&&!x.network_point_id&&(x.approved||x.review_status==='approved')&&(x.client_id||x.linked_client_ids?.length));
 if(!routes.length)return {...base,answer:`У ${manager} на ${date} нет утверждённого маршрута с клиентами. Выберите другую дату.`,memory:{route_task_prepare:{manager,date:null}}};
 return {...base,mode:'route_task_prepare_v5',manager,date,route_ids:routes.map(x=>x.id),answer:`Подготавливаю задачи: ${manager}, ${date}. Предложения откроются для проверки; задачи будут поставлены после утверждения.`,memory:{route_task_prepare:null}};
}
