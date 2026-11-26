'use strict';

(() => {
  const store = window.crmOfflineStore;
  const status = document.getElementById('offline-status');
  const content = document.getElementById('offline-content');
  const navigation = document.getElementById('offline-navigation');
  const menu = document.getElementById('offline-menu');
  const menuClose = document.getElementById('offline-menu-close');
  const mobile = document.getElementById('offline-mobile-nav');
  const pageTitle = document.getElementById('offline-page-title');
  const connection = document.getElementById('offline-connection');
  const online = document.getElementById('offline-online');
  const groups = [
    ['Главная',['dashboard','alerts']],
    ['Продажи',['vip','sales','falling','abc','triovist','managers']],
    ['Клиенты',['clients','lpr-birthdays','lpr','networks','client360']],
    ['Рабочий день',['meeting-planner','tasks','visits','my-routes','routes','route','workday','control','gps-control','routes-boss','my-run','queue']],
    ['Товары',['markdown','warehouse-control','receiving','orders','inventory','picking','warehouse-vitebsk360']],
    ['Продвижение',['promotions','stands','vip-actions']],
    ['Деньги',['budgets','debt','payments','payment-registry']],
  ];
  const legacySections = [
    ['routes','Маршрут'],['tasks','Задачи'],['clients','Клиенты'],['visits','История визитов'],['queue','Очередь'],
    ['dashboard','Центр управления'],
  ];
  const outcomes = ['✅ Заказ','🤝 Переговоры','❌ Не застал','📦 Мерчендайзинг','📚 Обучение','💬 Работа с ЛПР','📞 Звонок'];
  const owner = store.identity();
  let data;
  let active = '';
  let activeGroup = '';
  let sections = new Map();
  let entries = [];
  let mobileToggle;
  let revision = 0;
  const routes = new Set(['routes','route','my-routes','routes-boss']);
  const node = (tag,text) => {
    const element = document.createElement(tag);
    if (text != null) element.textContent = text;
    return element;
  };
  const button = (text,run) => {
    const element = node('button',text);
    element.type = 'button';
    element.addEventListener('click',run);
    return element;
  };
  function labelled(text,input) {
    const label = node('label');
    label.append(document.createTextNode(text),input);
    return label;
  }
  function card(title, detail) {
    const article = node('article');
    article.className = 'offline-card';
    article.append(node('h3',title));
    if (detail) article.append(node('p',detail));
    return article;
  }
  function list(items, format, empty, host = content, grid = false) {
    if (!items.length) {host.append(card(empty)); return;}
    const rows = node('div');
    rows.className = 'offline-list' + (grid ? ' offline-grid' : '');
    let shown = 0;
    const more = button('Показать ещё', next);
    function next() {
      const page = items.slice(shown,shown+40);
      rows.append(...page.map(format));
      shown += page.length;
      more.hidden = shown >= items.length;
    }
    host.append(rows,more);
    next();
  }
  const client = id => data.clients.find(row => row.id === id);
  const activeTasks = id => data.tasks.filter(task => task.clientId === id && task.active && !task.managedKind);
  function visitSkuForms(id, date) {
    const week = new Date(date + 'T12:00:00Z');
    week.setUTCDate(week.getUTCDate() - (week.getUTCDay() + 6) % 7);
    return data.tasks.filter(task => task.clientId === id && task.skuPlan?.week === week.toISOString().slice(0,10)).map(task => {
      const form = window.crmVisitSkuFields.create(task.skuPlan.items, date);
      form.updateFacts(task.skuPlan.progress);
      return {task, form};
    });
  }
  const localTime = value => new Intl.DateTimeFormat('ru-RU',{dateStyle:'short',timeStyle:'short',timeZone:'Europe/Minsk'}).format(value);

  function taskFields(task) {
    const container = card(task.title, task.dueDate ? 'Срок · ' + task.dueDate : '');
    const outcome = node('select');
    outcome.required = true;
    outcome.append(new Option('Выберите результат',''),new Option('Выполнена','done'),new Option('Не выполнена','defer'));
    const reason = node('input');
    reason.maxLength = 1000;
    const next = node('input');
    next.type = 'date';
    const detail = node('div');
    detail.hidden = true;
    detail.append(labelled('Причина',reason),labelled('Предложить дату',next));
    outcome.addEventListener('change',() => {
      detail.hidden = outcome.value !== 'defer';
      reason.required = next.required = !detail.hidden;
    });
    container.append(labelled('Итог задачи',outcome),detail);
    return {element:container, decision:() => ({
      task_id:task.id, done:outcome.value === 'done', reason:reason.value.trim() || null,
      new_date:next.value || null, expected_due_date:task.dueDate || null,
      expected_review_status:task.reviewStatus || null,
    })};
  }

  function form(route) {
    const point = route.demo ? {id:'test-point',name:'Пробная торговая точка'} : client(route.clientId);
    if (!point || route.visited || !route.own) return;
    const previous = active;
    active = 'form';
    pageTitle.textContent = 'Визит';
    const panel = node('form');
    const result = node('select');
    result.required = true;
    result.append(new Option('Выберите итог',''));
    for (const outcome of outcomes) result.append(new Option(outcome,outcome));
    const note = node('textarea');
    note.maxLength = 4000;
    const message = node('p');
    message.setAttribute('role','status');
    const send = node('button','Сохранить на телефоне');
    send.type = 'submit';
    const tasks = activeTasks(point.id).map(taskFields);
    const skuForms = visitSkuForms(point.id, route.date);
    note.required = !skuForms.length;
    let gps;
    const geo = button('Сохранить координаты',() => {
      if (!navigator.geolocation) {message.textContent = 'Геолокация недоступна.'; return;}
      geo.disabled = true;
      navigator.geolocation.getCurrentPosition(({coords}) => {
        gps = {gps_lat:coords.latitude,gps_lng:coords.longitude,gps_accuracy:Math.round(coords.accuracy)};
        message.textContent = 'Координаты записаны.';
        geo.disabled = false;
      }, () => {
        message.textContent = 'Координаты недоступны. Можно сохранить визит без них.';
        geo.disabled = false;
      }, {enableHighAccuracy:true, timeout:8000, maximumAge:0});
    });
    panel.append(node('h2',point.name),node('p',[route.address,route.date].filter(Boolean).join(' · ')),
      labelled('Результат визита',result),labelled(skuForms.length ? 'Заметка по желанию' : 'Что обсуждали / что сделали',note),
      ...tasks.map(task => task.element),...skuForms.map(({form}) => form.element),geo,message,send);
    panel.addEventListener('submit',async event => {
      event.preventDefault();
      if (send.disabled) return;
      const visitNote = note.value.trim();
      if (!visitNote && !skuForms.length) {message.textContent = 'Напишите итог визита.'; return;}
      for (const {form} of skuForms) {
        const error = form.validate(result.value);
        if (error) {message.textContent = error; return;}
      }
      const decisions = tasks.map(task => task.decision());
      if (decisions.some(task => !task.done && (!task.reason || !task.new_date))) {
        message.textContent = 'Укажите причину и дату по каждой невыполненной задаче.';
        return;
      }
      for (const {task, form} of skuForms) {
        const sku_outcomes = form.values();
        if (sku_outcomes.length) decisions.push({task_id:task.id,sku_outcomes});
      }
      send.disabled = true;
      try {
        await store.enqueue(owner,{client_id:point.id,route_plan_id:route.id,date:route.date,result:result.value,text:visitNote||result.value,...gps},decisions,route.demo);
        await open('queue');
        status.textContent = route.demo ? 'Пробный визит сохранён на телефоне.' : 'Визит сохранён на телефоне и ожидает отправки.';
        reconnect();
      } catch (error) {
        message.textContent = error.message || 'Не удалось сохранить на телефоне.';
        send.disabled = false;
      }
    });
    content.replaceChildren(button('К маршруту',() => open(previous).catch(showError)),panel);
    result.focus();
  }

  function setMenu(open) {
    menu.dataset.open = String(open);
    mobileToggle?.setAttribute('aria-expanded',String(open));
    if (open) menuClose.focus();
  }

  function drawNavigation() {
    navigation.replaceChildren();
    for (const [group, keys] of entries) {
      const openGroup = group === activeGroup;
      const groupButton = button(group, () => {
        activeGroup = openGroup ? '' : group;
        drawNavigation();
        [...navigation.querySelectorAll('[data-group]')].find(el=>el.dataset.group===group)?.focus();
      });
      groupButton.dataset.group = group;
      groupButton.setAttribute('aria-expanded',String(openGroup));
      navigation.append(groupButton);
      if (!openGroup) continue;
      const links = node('div');
      links.className = 'offline-section-links';
      for (const key of keys) {
        const tab = button(sections.get(key), () => {
          setMenu(false);
          void open(key).then(()=>content.focus()).catch(showError);
        });
        if (key === active) tab.setAttribute('aria-current','page');
        links.append(tab);
      }
      navigation.append(links);
    }
    for (const tab of mobile.querySelectorAll('[data-section]')) {
      if (tab.dataset.section === active) tab.setAttribute('aria-current','page');
      else tab.removeAttribute('aria-current');
    }
  }

  function connectionState() {
    connection.textContent = navigator.onLine ? 'Локальные данные' : 'Офлайн';
    online.hidden = !navigator.onLine;
  }

  function drawReport(report) {
    if (!report) {
      content.append(card('Данные раздела ещё не сохранены','Откройте этот раздел при подключении к интернету.'));
      return;
    }
    const area = node('div');
    area.className = 'offline-report';
    if (report.tree?.length) area.append(window.crmOfflineReport.render(report.tree,document));
    else {
      for (const block of String(report.text || '').split(/\n\s*\n/u).map(part => part.trim()).filter(Boolean)) {
        const lines = block.split(/\n/u);
        const panel = card(lines.shift());
        if (lines.length) {
          const text = node('p',lines.join('\n'));
          text.className = 'offline-report-fallback';
          panel.append(text);
        }
        area.append(panel);
      }
    }
    content.append(area);
  }

  async function open(section) {
    if (!sections.has(section)) return;
    const opened = ++revision;
    active = section;
    activeGroup = entries.find(([, keys]) => keys.includes(section))?.[0] || '';
    pageTitle.textContent = sections.get(section).replace(/^\P{L}+/u,'');
    document.title = pageTitle.textContent + ' · Ресанта CRM';
    const url = new URL(location.href);
    url.searchParams.set('section',section);
    window.history.replaceState(null,'',url);
    const report = data.reports?.[section];
    status.textContent = 'Сохранено ' + localTime(report?.savedAt || data.savedAt);
    content.replaceChildren();
    drawNavigation();
    const records = routes.has(section) || section === 'queue' ? await store.queue(owner) : [];
    if (opened !== revision) return;
    if (owner !== store.identity()) {location.reload(); return;}
    if (!report || !report.tree?.length) content.append(node('h2',pageTitle.textContent));
    if (routes.has(section)) {
      if (store.canRecord(owner,data) && !data.routes.some(route => route.own && !route.visited && client(route.clientId))) {
        const demo = button('Записать пробный визит',() => form({
          id:'test-route',address:'Тестирование офлайн-режима',own:true,demo:true,
          date:new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Minsk'}).format(new Date()),
        }));
        demo.className = 'offline-search';
        content.append(demo);
      }
      list(data.routes,route => {
        const point = client(route.clientId);
        const entry = card(route.name || point?.name || 'Торговая точка',[route.date,route.address].filter(Boolean).join(' · '));
        const pending = records.find(row => row.visit.route_plan_id === route.id);
        if (pending) {
          const message = pending.state === 'sent' ? 'Сохранено в CRM' :
            pending.state === 'conflict' ? 'Нужна проверка в очереди' : 'Ожидает отправки';
          entry.append(button(message,()=>open('queue').catch(showError)));
        } else if (route.visited) entry.append(node('p','Посещена'));
        else if (point && route.own) entry.append(button('Записать визит',() => form(route)));
        else if (point && store.canRecord(owner,data)) entry.append(node('p','Маршрут другого сотрудника.'));
        else if (!point) entry.append(node('p','Карточка точки не загружена.'));
        return entry;
      },'На устройстве пока нет маршрута.',content,true);
    } else if (section === 'tasks') {
      list(data.tasks,task => {
        const entry = card(task.title,[client(task.clientId)?.name,task.dueDate].filter(Boolean).join(' · '));
        const state = node('span',task.confirmed ? 'Подтверждено 1С' : task.done ? 'Сохранён результат' :
          task.reviewStatus==='pending' ? 'На согласовании' : 'Открыта');
        state.className = 'offline-pill';
        entry.append(state);
        if (task.skuPlan?.items?.length) {
          const positions = node('details');
          positions.append(node('summary','План и факт отгрузки'));
          for (const item of task.skuPlan.items) {
            const actual = task.skuPlan.progress?.find(row=>row.sku===item.sku)?.actual;
            positions.append(node('p',item.sku+' · '+(item.product||'')+' · план '+item.qty+' · факт '+(actual??'—')));
          }
          entry.append(positions);
        }
        return entry;
      },'На устройстве пока нет задач.',content,true);
    } else if (section === 'clients') {
      const input = node('input');
      input.type = 'search';
      input.placeholder = 'Название, код или адрес';
      const search = labelled('Поиск клиента',input);
      search.className = 'offline-search';
      content.append(search);
      const results = node('div');
      content.append(results);
      const render = () => {
        const query = input.value.trim().toLowerCase();
        const matching = data.clients.filter(row => [row.name,row.address,row.code].some(value => String(value||'').toLowerCase().includes(query)));
        results.replaceChildren();
        list(matching,row => {
          const entry = card(row.name,row.address);
          const meta = [row.code,row.status,row.manager].filter(Boolean).join(' · ');
          if (meta) {
            const chip = node('span',meta);
            chip.className = 'offline-pill';
            entry.append(chip);
          }
          return entry;
        },'Клиенты не найдены.',results,true);
      };
      input.addEventListener('input',render);
      render();
    } else if (section === 'visits') {
      list(data.visits,row => card(client(row.clientId)?.name || 'Торговая точка',[row.date,row.result].filter(Boolean).join(' · ')),
        'На устройстве пока нет истории визитов.',content,true);
    } else if (section === 'queue') {
      list(records,record => {
        const summary = record.state==='demo'?'Тест · хранится на устройстве':record.state==='sent'?'Сохранено в CRM':record.state==='conflict'?
          'Нужна проверка · '+record.reason:'Ожидает отправки';
        const entry = card(record.state==='demo'?'Пробный визит':client(record.visit.client_id)?.name || 'Запись визита',
          [record.visit.date,record.visit.result,summary].join(' · '));
        const details = node('details');
        details.append(node('summary','Заметка визита'),node('p',record.visit.text));
        entry.append(details);
        return entry;
      }, 'Очередь пуста.');
      if (records.some(row => row.state === 'pending')) content.append(node('p',
        'CRM отправит записи при восстановлении связи. Если сессия истекла, войдите снова.'));
    } else drawReport(report);
  }
  async function init() {
    try {
      data = await store.readSnapshot(owner);
      if (!data) {
        status.textContent = 'Данные на этом устройстве пока недоступны. Откройте CRM при наличии интернета.';
        return;
      }
      sections = new Map(Object.entries(data.menu || Object.fromEntries(legacySections)));
      if (store.canRecord(owner,data)) sections.set('queue','Очередь визитов');
      else sections.delete('queue');
      entries = groups.map(([group,keys])=>[group,keys.filter(key=>sections.has(key))]).filter(([,keys])=>keys.length);
      const groupedKeys = new Set(entries.flatMap(([,keys])=>keys));
      const extra = [...sections.keys()].filter(key=>!groupedKeys.has(key));
      if (extra.length) entries.push(['Прямые входы',extra]);
      if (!sections.size) {
        status.textContent = 'Откройте CRM при наличии интернета, чтобы сохранить разделы.';
        return;
      }
      mobileToggle = button('Разделы',()=>setMenu(menu.dataset.open!=='true'));
      mobileToggle.setAttribute('aria-controls','offline-menu');
      mobileToggle.setAttribute('aria-expanded','false');
      mobile.append(mobileToggle);
      const quick = [
        ['dashboard','Главная'],['clients','Клиенты'],
        [[...routes].find(key=>sections.has(key)),'Маршрут'],['tasks','Задачи'],
      ];
      for (const [key,title] of quick.filter(([key])=>sections.has(key))) {
        const item = button(title,() => { setMenu(false); void open(key).catch(showError); });
        item.dataset.section = key;
        mobile.append(item);
      }
      menu.hidden = false;
      mobile.hidden = false;
      const requested = new URLSearchParams(location.search).get('section');
      await open(sections.has(requested) ? requested : sections.keys().next().value);
      reconnect();
    } catch (error) { showError(error); }
  }
  function showError(error) {
    status.textContent = 'Не удалось открыть локальные данные. ' + (error.message || '');
  }
  function reconnect() {
    store.synchronize(owner)?.then(() => {
      if (active === 'queue') return open('queue');
    }).catch(showError);
  }
  content.tabIndex = -1;
  menuClose.addEventListener('click',()=>{setMenu(false);mobileToggle?.focus();});
  document.addEventListener('keydown',event=>{
    if (event.key==='Escape' && menu.dataset.open==='true') {setMenu(false);mobileToggle?.focus();}
  });
  window.addEventListener('online',()=>{connectionState();reconnect();});
  window.addEventListener('offline',connectionState);
  connectionState();
  window.addEventListener('storage',() => {
    if (owner !== store.identity()) {content.replaceChildren(); menu.hidden = true; mobile.hidden = true; status.textContent = ''; pageTitle.textContent = ''; location.reload();}
  });
  init();
})();
