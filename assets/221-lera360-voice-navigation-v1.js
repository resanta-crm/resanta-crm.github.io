/* Unified Lera 360 local navigation. No writes, no new pages.
   Route only explicit user commands to an actually visible authorized CRM nav. */
(function(root,doc){
'use strict';
if(root.crmAI360NavigateV1)return;
const route=[
 // Calendar navigation reuses existing voice engine; the page itself checks owner identity.
 [/календар|планировщик|совещан/i,'meeting-planner','Календарь и совещания'],
 [/уценк/i,'markdown','Уценка'],
 [/падающ|падени[ея]\s+клиент/i,'clients','Клиенты'],
 [/триовист|тривист|21\s*век|21vek/i,'vip','ВИП'],
 [/маршрут.*(?:согласован|менеджер|руководител)/i,'routes-boss','Маршруты'],
 [/маршрут.*(?:дня|сегодня)|мой\s+маршрут/i,'route','Маршрут дня'],
 [/маршрут/i,'routes-boss','Маршруты'],
 [/джипиэс|\bgps\b|gps[- ]?контрол/i,'gps-control','GPS-контроль'],
 [/план.*(?:визит|встреч)|визит/i,'visits','Визиты'],
 [/задач|поручен/i,'tasks','Задачи'],
 [/пдз|дебитор|задолжен/i,'debt','ПДЗ'],
 [/поступлен|оплат/i,'budgets','Бюджеты'],
 [/бюджет/i,'budgets','Бюджеты'],
 [/акци/i,'promotions','Акции'],
 [/стенд/i,'stands','Стенды'],
 [/склад|остатк/i,'control','Остатки'],
 [/вип|\bvip\b/i,'vip','ВИП'],
 [/менеджер|\bkpi\b|кпи/i,'managers','Менеджеры'],
 [/продаж|выручк/i,'sales','Продажи'],
 [/клиент/i,'clients','Клиенты'],
 [/\babc\b|абс|а\s*б\s*с/i,'abc','ABC'],
 [/сводк|главн|дашборд/i,'dashboard','Сводка'],
 [/уведомлен|сигнал/i,'alerts','Сигналы'],
 [/чат|connect/i,'connect','Чаты']
];
const n=x=>String(x||'').toLocaleLowerCase('ru-RU').replace(/ё/g,'е').trim();
function talk(ui,message){
 if(typeof ui?.answer==='function')ui.answer(message);
 else ui?.show?.(message);
}
function navigation(text,ui){
 const sentence=n(text).replace(/^(?:лера|ресанта)[, ]+/,'');
 const correction=/^(?:нет[, ]+)?(?:не\s+оценк[иа][, ]+а\s+)?уценк[ауеи]?$/.test(sentence);
 const m=sentence.match(/^(?:(?:открой|открывай|перейди|переходи|вернись|покажи|выведи)\s+(?:мне\s+)?(?:(?:в|на)\s+)?(?:(?:раздел|вкладку|страницу)\s+)?)(.+)$/);
 if(!correction&&!m)return false;
 const subject=correction?'уценка':m[1];
 const found=route.find(([regexp])=>regexp.test(subject));
 if(!found)return false;
 const [,pageId,title]=found;
 const profile=root.crmAI360GreetingV1?.()||root.crmAI360StaffIdentityV1?.();
 const auth=typeof currentUser!=='undefined'&&!!profile&&profile.id===currentUser?.id;
 const page=doc.getElementById('page-'+pageId);
 const nav=doc.getElementById('nav-'+pageId);
 const mobile=doc.getElementById('bn-'+pageId);
 const visible=x=>!!x&&x.style.display!=='none'&&
  (typeof getComputedStyle!=='function'||getComputedStyle(x).display!=='none');
 const permitted=visible(nav)||visible(mobile);
 if(!auth||!page||!permitted||typeof root.goPage!=='function'){
  talk(ui,'Раздел «'+title+'» сейчас недоступен для этой учётной записи. Ничего не изменено.');
  return true;
 }
 try{
  root.goPage(pageId,title);
  const active=page.classList?.contains('active')||page.style.display==='block';
  if(!active){
   talk(ui,'Переход к разделу «'+title+'» не подтвердился. Попробуй открыть его через меню.');
   return true;
  }
  talk(ui,'Открыла раздел «'+title+'».');
 }catch(_){talk(ui,'Не удалось открыть раздел «'+title+'». Попробуй через меню CRM.');}
 return true;
}
root.crmAI360NavigateV1=navigation;
})(window,document);
