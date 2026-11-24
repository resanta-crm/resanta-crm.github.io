'use strict';

(() => {
  const store = window.crmOfflineStore;
  const status = document.getElementById('offline-status');
  const content = document.getElementById('offline-content');
  const navigation = document.getElementById('offline-navigation');
  const legacySections = [
    ['routes','Маршрут'],['tasks','Задачи'],['clients','Клиенты'],['visits','История визитов'],['queue','Очередь'],
    ['dashboard','Центр управления'],
  ];
  const outcomes = ['✅ Заказ','🤝 Переговоры','❌ Не застал','📦 Мерчендайзинг','📚 Обучение','💬 Работа с ЛПР','📞 Звонок'];
  const owner = store.identity();
  let data;
  let active = '';
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
    article.append(node('h3',title));
    if (detail) article.append(node('p',detail));
    return article;
  }
  function list(items, format, empty) {
    if (!items.length) content.append(node('p',empty));
    const rows = node('div');
    let shown = 0;
    const more = button('Показать ещё', next);
    function next() {
      const page = items.slice(shown,shown+40);
      rows.append(...page.map(format));
      shown += page.length;
      more.hidden = shown >= items.length;
    }
    content.append(rows,more);
    next();
  }
  const client = id => data.clients.find(row => row.id === id);
  const activeTasks = id => data.tasks.filter(task => task.clientId === id && task.active);
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
    active = 'form';
    const panel = node('form');
    const result = node('select');
    result.required = true;
    result.append(new Option('Выберите итог',''));
    for (const outcome of outcomes) result.append(new Option(outcome,outcome));
    const note = node('textarea');
    note.required = true;
    note.maxLength = 4000;
    const message = node('p');
    message.setAttribute('role','status');
    const send = node('button','Сохранить на телефоне');
    send.type = 'submit';
    const tasks = activeTasks(point.id).map(taskFields);
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
      labelled('Результат визита',result),labelled('Что обсуждали / что сделали',note),
      ...tasks.map(task => task.element),geo,message,send);
    panel.addEventListener('submit',async event => {
      event.preventDefault();
      if (send.disabled) return;
      if (!note.value.trim()) {message.textContent = 'Напишите итог визита.'; return;}
      const decisions = tasks.map(task => task.decision());
      if (decisions.some(task => !task.done && (!task.reason || !task.new_date))) {
        message.textContent = 'Укажите причину и дату по каждой невыполненной задаче.';
        return;
      }
      send.disabled = true;
      try {
        await store.enqueue(owner,{client_id:point.id,route_plan_id:route.id,date:route.date,result:result.value,text:note.value.trim(),...gps},decisions,route.demo);
        await open('queue');
        status.textContent = route.demo ? 'Пробный визит сохранён на телефоне.' : 'Визит сохранён на телефоне и ожидает отправки.';
        reconnect();
      } catch (error) {
        message.textContent = error.message || 'Не удалось сохранить на телефоне.';
        send.disabled = false;
      }
    });
    content.replaceChildren(button('К маршруту',() => open(active)),panel);
    result.focus();
  }

  async function open(section) {
    active = section;
    content.replaceChildren();
    for (const tab of navigation.children) tab.setAttribute('aria-current',tab.dataset.section===section?'page':'false');
    const records = await store.queue(owner);
    if (active !== section) return;
    if (owner !== store.identity()) {location.reload(); return;}
    if (routes.has(section)) {
      if (store.canRecord(owner,data) && !data.routes.some(route => route.own && !route.visited && client(route.clientId))) {
        content.append(button('Записать пробный визит',() => form({
          id:'test-route',address:'Тестирование офлайн-режима',own:true,demo:true,
          date:new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Minsk'}).format(new Date()),
        })));
      }
      list(data.routes,route => {
        const point = client(route.clientId);
        const entry = card(route.name || point?.name || 'Торговая точка',[route.date,route.address].filter(Boolean).join(' · '));
        const pending = records.find(row => row.visit.route_plan_id === route.id);
        if (pending) entry.append(node('p', pending.state === 'sent' ? 'Сохранено в CRM' :
          pending.state === 'conflict' ? 'Нужна проверка в очереди' : 'Ожидает отправки'));
        else if (route.visited) entry.append(node('p','Посещена'));
        else if (point && route.own) entry.append(button('Записать визит',() => form(route)));
        else if (point && store.canRecord(owner,data)) entry.append(node('p','Маршрут другого сотрудника.'));
        else entry.append(node('p','Карточка точки не загружена.'));
        return entry;
      },'На телефоне пока нет маршрута.');
    } else if (section === 'tasks') {
      list(data.tasks,task => card(task.title,[client(task.clientId)?.name,task.dueDate,task.done?'Выполнена':task.reviewStatus==='pending'?'На согласовании':null].filter(Boolean).join(' · ')),
        'На телефоне пока нет задач.');
    } else if (section === 'clients') {
      const input = node('input');
      input.type = 'search';
      input.placeholder = 'Название или адрес';
      content.append(labelled('Поиск клиента',input));
      const results = node('div');
      content.append(results);
      const render = () => {
        const query = input.value.trim().toLowerCase();
        results.replaceChildren(...data.clients.filter(row => (row.name+' '+row.address).toLowerCase().includes(query))
          .map(row => card(row.name,row.address)));
      };
      input.addEventListener('input',render);
      render();
    } else if (section === 'visits') {
      list(data.visits,row => card(row.result || 'Визит',[row.date,client(row.clientId)?.name].filter(Boolean).join(' · ')),
        'На телефоне пока нет истории визитов.');
    } else if (section === 'queue') {
      list(records,record => {
        const summary = record.state==='demo'?'Тест · хранится на телефоне':record.state==='sent'?'Сохранено в CRM':record.state==='conflict'?
          'Нужна проверка · '+record.reason:'Ожидает отправки';
        const entry = card(record.state==='demo'?'Пробный визит':client(record.visit.client_id)?.name || 'Запись визита',
          [record.visit.date,record.visit.result,summary].join(' · '));
        const details = node('details');
        details.append(node('summary','Заметка визита'),node('p',record.visit.text));
        entry.append(details);
        return entry;
      }, 'Очередь пуста.');
      if (records.some(row => row.state === 'pending')) content.append(node('p',
        'CRM отправит записи при восстановлении связи. Если сессия истекла, откройте CRM онлайн и войдите снова.'));
    } else {
      const report = data.reports?.[section];
      if (!report) {
        content.append(node('p','Данные этого раздела ещё не успели загрузиться на устройство.'));
        return;
      }
      const entry = card(report.title,'Данные от '+localTime(report.savedAt));
      const text = node('pre',report.text);
      text.className = 'offline-report';
      entry.append(text);
      content.append(entry);
    }
  }
  async function init() {
    try {
      data = await store.readSnapshot(owner);
      if (!data) {
        status.textContent = 'Данные на этом устройстве пока недоступны. Откройте CRM при наличии интернета.';
        return;
      }
      status.textContent = 'Данные на устройстве от ' + localTime(data.savedAt) + '.';
      navigation.hidden = false;
      const sections = Object.entries(data.menu || Object.fromEntries(legacySections));
      if (store.canRecord(owner,data) && !sections.some(([key]) => key === 'queue')) sections.push(['queue','Очередь']);
      for (const [key,title] of sections) {
        const tab = button(title,() => open(key).catch(showError));
        tab.dataset.section = key;
        navigation.append(tab);
      }
      const requested = new URLSearchParams(location.search).get('section');
      const initial = sections.some(([key]) => key===requested) ? requested : sections[0]?.[0];
      if (initial) await open(initial);
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
  window.addEventListener('online',reconnect);
  window.addEventListener('storage',() => {
    if (owner !== store.identity()) {content.replaceChildren(); navigation.hidden = true; location.reload();}
  });
  init();
})();
