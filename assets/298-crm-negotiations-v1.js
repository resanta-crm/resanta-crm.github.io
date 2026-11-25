(() => {
  'use strict';
  const page = document.getElementById('page-negotiations');
  const dialog = document.getElementById('neg-training-dialog');
  const visitLinks = new Map();
  const audioTypes = {mp3:'audio/mpeg', m4a:'audio/mp4', mp4:'video/mp4', aac:'audio/aac',
    ogg:'audio/ogg', webm:'audio/webm', wav:'audio/wav', flac:'audio/flac'};
  const statuses = {draft:'Черновик', uploading:'Загрузка записи', queued:'Транскрибируется',
    ready:'Готово к разбору', error:'Ошибка распознавания'};
  const errors = {
    pilot_disabled:'Переговоры ещё не подключены в этой сборке.',
    scribe_not_configured:'Транскрибатор не подключён.',
    scribe_unavailable:'Транскрибатор временно недоступен. Попробуйте ещё раз.',
    scribe_queue_full:'Очередь транскрибатора заполнена. Повторите позже.',
    ai_budget_limit:'Лимит ИИ исчерпан. Ответ остаётся в форме.',
    ai_unavailable:'ИИ временно недоступен. Попробуйте ещё раз.',
    client_not_available:'Карточка клиента недоступна вашему аккаунту.',
    busy:'Операция уже выполняется. Повторите через несколько секунд.',
    transcript_too_long:'Диалог слишком длинный для одного разбора.',
    invalid_period:'Проверьте порядок дат. В сводке можно выбрать период до года.',
    task_details_required:'Сначала привяжите карточку клиента и укажите срок.',
  };
  let userId, tab = 'history', listPage = 0, layout = 0, pollTimer, selectedId;
  let capture;
  let pendingClient;
  let people = [];
  let historyFilter = {};
  let reportFilter = {};
  let pointContext;

  const allowedOrigins = new Set([
    'https://resanta-crm.by', 'https://www.resanta-crm.by',
    'https://resanta-director-pilot-20261119.wigglybean257.chatgpt.site',
  ]);
  const permitted = () => !!currentUser?.id && currentProfile?.id === currentUser.id &&
    currentProfile.access_scope === 'standard' && currentProfile.region === 'Витебск' &&
    ['manager', 'boss'].includes(currentProfile.role);
  const localDate = () => new Intl.DateTimeFormat('sv-SE', {timeZone:'Europe/Minsk'}).format(new Date());
  const stamp = date => new Intl.DateTimeFormat('ru-RU', {
    timeZone:'Europe/Minsk', dateStyle:'short', timeStyle:'short',
  }).format(new Date(date));
  function node(tag, value, className) {
    const el = document.createElement(tag);
    if (value !== undefined) el.textContent = value;
    if (className) el.className = className;
    return el;
  }
  function button(text, run, primary = false) {
    const el = node('button', text, primary ? 'btn-primary' : 'btn-secondary');
    el.type = 'button';
    el.addEventListener('click', run);
    return el;
  }
  function group(...children) {
    const el = node('div', undefined, 'nt-actions');
    el.append(...children);
    return el;
  }
  function field(label, control) {
    const el = node('label', undefined, 'nt-field');
    el.append(node('span', label), control);
    control.classList.add('form-input');
    return el;
  }
  function input(type, max, value = '') {
    const el = node('input');
    el.type = type;
    if (max) el.maxLength = max;
    el.value = value;
    return el;
  }
  function status() {
    const el = node('p', '', 'nt-message');
    el.setAttribute('role', 'status');
    return el;
  }
  const errorText = e => errors[e.message] || 'Операция не выполнена. Попробуйте ещё раз.';
  function operation(el, message, run, pending = 'Подождите…') {
    el.disabled = true;
    message.textContent = pending;
    Promise.resolve().then(run).catch(error => { message.textContent = errorText(error); })
      .finally(() => { el.disabled = false; });
  }
  async function api(body, chunk) {
    const actor = currentUser?.id;
    if (!permitted()) throw Error('forbidden');
    const {data} = await db.auth.getSession();
    const session = data.session;
    if (!session || actor !== session.user.id || actor !== currentUser?.id) throw Error('forbidden');
    const path = '/functions/v1/crm-negotiation-training-v1' + (chunk ? '?' + new URLSearchParams(body) : '');
    const response = await fetch(SUPABASE_URL + path, {
      method:'POST', signal:AbortSignal.timeout(65_000),
      headers:{apikey:SUPABASE_KEY, Authorization:'Bearer ' + session.access_token,
        'Content-Type':chunk ? 'application/octet-stream' : 'application/json'},
      body:chunk || JSON.stringify(body),
    });
    const result = await response.json().catch(() => ({}));
    if (actor !== currentUser?.id) throw Error('forbidden');
    if (!response.ok) throw Error(result.error || 'unavailable');
    return result;
  }

  function open(next = 'history') {
    if (!permitted()) return;
    goPage('negotiations', 'Переговоры');
    tab = next;
    selectedId = null;
    listPage = 0;
    render();
  }

  function openReview(id) {
    if (!permitted()) return;
    closeModal('modal-client');
    goPage('negotiations', 'Переговоры');
    tab = 'history';
    selectedId = id;
    listPage = 0;
    render();
  }

  function labelled(label, text) {
    const item = node('p');
    item.append(node('strong', label + ' · '), document.createTextNode(text));
    return item;
  }

  function renderPoint(host, context) {
    const heading = node('h3', 'Лера · к этому визиту');
    const content = node('div');
    const message = status();
    const record = button('Записать разговор', () => {
      const route = allRoutePlans.find(item => item.id === context.routePlanId);
      closeModal('modal-client');
      openQuickVisit(context.clientId, route?.visit_date || TODAY, context.routePlanId);
      recordVisit('quick');
    }, true);
    host.hidden = false;
    host.replaceChildren(heading, content, group(record), message);
    message.textContent = 'Загружаем историю точки…';
    context.request.then(data => {
      if (pointContext !== context || !host.contains(content) || !host.isConnected) return;
      message.textContent = '';
      const {previous, last_review:review, task} = data;
      if (context.routePlanId && data.address) content.append(node('p',[data.city,data.address].filter(Boolean).join(' · '),'nt-muted'));
      if (previous) content.append(labelled('Прошлый визит · ' + previous.date.split('-').reverse().join('.'),
        previous.recap || 'Визит сохранён.'));
      if (review) {
        content.append(labelled('ИИ-разбор · ' + stamp(review.created_at), review.recap || 'Разбор сохранён.'));
        if (review.open) content.append(labelled('Осталось уточнить', review.open));
        if (review.action) content.append(labelled('Сегодня', review.action));
        if (review.phrase) content.append(node('blockquote', '«' + review.phrase + '»'));
        record.parentElement.append(button('Прошлый разбор', () => openReview(review.id)));
      } else if (previous?.open) content.append(labelled('Открытый вопрос', previous.open));
      if (task) content.append(labelled('Задача по клиенту' + (task.due_date ? ' · до ' + task.due_date : ''), task.title));
      if (!previous && !review && !task) content.append(node('p','У этой точки пока нет сохранённых визитов или разборов.','nt-muted'));
    }).catch(error => {
      if (host.contains(message) && pointContext === context) message.textContent = 'История точки недоступна. ' + errorText(error);
    });
  }

  function canRecordClient(clientId) {
    if (!permitted()) return false;
    const client = allClients.find(item => String(item.id) === String(clientId));
    return !!client && (currentProfile.role === 'boss' || client.manager_name === currentProfile.name);
  }

  function mountPoint(clientId) {
    if (pointContext && pointContext.clientId !== clientId) pointContext = null;
    const host = document.getElementById('nt-client-point');
    if (!host || !canRecordClient(clientId)) return;
    if (pointContext) {
      renderPoint(host, pointContext);
      return;
    }
    host.hidden = false;
    host.replaceChildren(button('Записать разговор', () => {
      closeModal('modal-client');
      openQuickVisit(clientId, TODAY);
      recordVisit('quick');
    }));
  }

  function beginCheckin(clientId, routePlanId, returnMode) {
    if (!allowedOrigins.has(location.origin) || !canRecordClient(clientId) || !navigator.onLine) return null;
    const isCard = returnMode === 'client';
    const context = {clientId, routePlanId, request:api({action:'visit_context',client_id:clientId,route_plan_id:routePlanId})};
    context.request.catch(() => {});
    pointContext = context;
    if (isCard) mountPoint(clientId);
    return () => {
      if (pointContext !== context || !permitted()) return false;
      if (isCard) return false;
      if (!['my-routes','route'].includes(returnMode) || !document.getElementById('page-' + returnMode)?.classList.contains('active')) return false;
      if (routePlanId && !allRoutePlans.some(route => String(route.id) === String(routePlanId))) return false;
      openClient(clientId);
      return true;
    };
  }
  function card(title) {
    const el = node('section', undefined, 'card nt-card');
    el.append(node('h3', title));
    return el;
  }
  function render(focusTarget) {
    const ticket = ++layout;
    clearTimeout(pollTimer);
    page.replaceChildren();
    if (!permitted()) return;
    const tabs = node('div', undefined, 'nt-actions nt-tabs');
    for (const [id, text] of [['history','История'], ['new','Новый клиент'], ['report','Сводка обучения']]) {
      const el = button(text, () => { tab = id; selectedId = null; listPage = 0; render(); });
      el.setAttribute('aria-pressed', id === tab);
      tabs.append(el);
    }
    page.append(node('h2', 'Переговоры', 'page-title'), tabs);
    if (tab === 'new') renderNew();
    else if (tab === 'report') renderReport();
    else if (selectedId) renderDetail(ticket, selectedId, focusTarget);
    else renderList(ticket);
  }
  function renderNew() {
    const box = card('Переговоры с новым клиентом');
    box.append(node('p','Укажите название компании или торговой точки. Карточку клиента можно привязать после встречи.'));
    const name = input('text',180), city = input('text',120), address = input('text',220);
    const message = status();
    const save = button('Перейти к записи', () => {
      if (name.value.trim().length < 2) {message.textContent = 'Укажите название.'; name.focus(); return;}
      begin({prospect_name:name.value, city:city.value, address:address.value});
    }, true);
    box.append(field('Название',name), field('Город',city), field('Адрес торговой точки',address), save, message);
    page.append(box);
  }
  function filters(form, selection, apply, {search = false, reset = null} = {}) {
    const from = input('date', 0, selection.from || '');
    const to = input('date', 0, selection.to || '');
    const manager = node('select');
    const text = input('search', 120, selection.search || '');
    const bar = group();
    bar.classList.add('nt-filters');
    const managerField = field('Менеджер', manager);
    const updatePeople = () => {
      const choices = [{id:'',name:'Все менеджеры'}, ...people].map(person => {
        const option = node('option', person.name);
        option.setAttribute('value', person.id);
        option.selected = person.id === (selection.manager_id || '');
        return option;
      });
      manager.replaceChildren(...choices);
      managerField.hidden = currentProfile?.role !== 'boss' && people.length < 2;
    };
    updatePeople();
    if (search) bar.append(field('Клиент или торговая точка', text));
    bar.append(managerField, field('Дата с', from), field('Дата по', to));
    const submit = node('button','Показать','btn-primary');
    submit.type = 'submit';
    bar.append(submit);
    if (reset) bar.append(button('Сбросить', reset));
    form.append(bar);
    form.addEventListener('submit', event => {
      event.preventDefault();
      apply({from:from.value, to:to.value, manager_id:manager.value, ...(search ? {search:text.value.trim()} : {})});
    });
    return updatePeople;
  }

  function renderList(ticket) {
    const box = card('История переговоров'), message = status(), form = node('form');
    const populate = filters(form, historyFilter, selection => {
      historyFilter = selection; listPage = 0; render();
    }, {search:true, reset:() => {historyFilter = {}; listPage = 0; render();}});
    box.append(form, message);
    message.textContent = 'Загружаем…';
    page.append(box);
    api({action:'list', page:listPage, ...historyFilter}).then(({rows, more, managers}) => {
      if (ticket !== layout) return;
      if (Array.isArray(managers)) {people = managers; populate();}
      message.textContent = rows.length ? '' : 'По выбранным условиям переговоров нет.';
      for (const item of rows) {
        const remaining = item.review?.cases.filter(entry => entry.score === null).length || 0;
        const state = item.review ? remaining ? 'Ждёт ответа · ' + remaining : 'Разбор завершён' : statuses[item.audio_state];
        const row = node('div', undefined, 'nt-row');
        const meta = node('div');
        meta.append(node('strong', item.prospect_name), node('div',
          [stamp(item.created_at), item.manager_name, item.city, item.address, state].filter(Boolean).join(' · '), 'nt-muted'));
        row.append(meta, button('Открыть', () => { selectedId = item.id; render(); }));
        box.append(row);
      }
      if (listPage > 0 || more) {
        const controls = group();
        if (listPage > 0) controls.append(button('Назад', () => { listPage--; render(); }));
        controls.append(node('span', 'Страница ' + (listPage + 1), 'nt-muted'));
        if (more) controls.append(button('Далее', () => { listPage++; render(); }));
        box.append(controls);
      }
    }).catch(error => { if (ticket === layout) message.textContent = errorText(error); });
  }

  function historyFromReport(managerId, dates) {
    historyFilter = {from:dates.from, to:dates.to, manager_id:managerId};
    tab = 'history';
    selectedId = null;
    listPage = 0;
    render();
  }

  function reportMetric(label, value) {
    const metric = node('div', undefined, 'nt-metric');
    metric.append(node('strong', String(value)), node('span', label, 'nt-muted'));
    return metric;
  }

  function renderReport() {
    const box = card('Сводка обучения');
    const today = localDate();
    if (!reportFilter.from) reportFilter = {from:today.slice(0,7) + '-01', to:today};
    const form = node('form');
    const populate = filters(form, reportFilter, selection => {reportFilter = selection; render();});
    for (const input of form.querySelectorAll('input[type=date]')) input.required = true;
    const results = node('div', undefined, 'nt-report'), message = status();
    const ticket = layout;
    box.append(form, message, results);
    page.append(box);
    message.textContent = 'Загружаем…';
    const dates = {...reportFilter};
    api({action:'report', ...dates}).then(data => {
      if (ticket !== layout) return;
      if (Array.isArray(data.managers)) {people = data.managers; populate();}
      message.textContent = data.report.length ? '' : 'За этот период разборов пока нет.';
      for (const item of data.report) {
        const panel = card(item.name);
        const metrics = node('div', undefined, 'nt-report-metrics');
        metrics.append(
          reportMetric('Разобрано разговоров',item.reviewed),
          reportMetric('Качество переговоров',item.quality === null ? '—' : item.quality + '%'),
          reportMetric('Переговоров ждут ответа',item.waiting_records ?? item.waiting),
          reportMetric('Действий ожидают задачи',item.to_assign || 0),
          reportMetric('Задач выполнено',item.tasks ? item.done + ' из ' + item.tasks : 'Пока нет задач'),
        );
        const details = node('details');
        details.append(node('summary','Ответы и подсказки'),
          node('p', 'Завершено ситуаций ' + item.completed + ' · С подсказкой ИИ ' + item.assisted),
          node('p', 'Самостоятельность · ' + (item.completed < 10 ? item.completed + ' из 10 ситуаций для оценки' : item.independence + '%')),
          node('p', 'Удачные решения · с первой попытки ' + item.first + ', со второй ' + item.second + ', с третьей ' + item.third));
        panel.append(metrics,button('Открыть переговоры',() => historyFromReport(item.id, dates)),details);
        results.append(panel);
      }
    }).catch(error => {if (ticket === layout) message.textContent = errorText(error);});
  }
  function clientLink(row, box) {
    if (row.client_id || row.owner_id !== currentUser?.id) return;
    const details = node('details');
    details.id = 'nt-link-client';
    details.append(node('summary','Карточка клиента'));
    const search = input('search',120,row.prospect_name);
    const matches = node('div'), message = status();
    const connect = button('Найти в CRM', () => operation(connect,message,async () => {
      const {clients} = await api({action:'clients',search:search.value});
      matches.replaceChildren();
      message.textContent = clients.length ? 'Сверьте торговую точку и адрес.' : 'Совпадений нет. Проверьте название или создайте карточку.';
      for (const candidate of clients) {
        const item = node('div',undefined,'nt-row');
        const link = button('Привязать',() => operation(link,message,async () => {
          await api({action:'link_client', id:row.id, client_id:candidate.id});
          render();
        }));
        item.append(node('span',[candidate.name,candidate.city,candidate.address].filter(Boolean).join(' · ')),link);
        matches.append(item);
      }
      const create = button('Создать карточку', () => {
        pendingClient = {id:row.id, owner:currentUser.id};
        openAddClient();
        for (const [id,value] of [['nc-name',row.prospect_name],['nc-city',row.city],['nc-address',row.address],['nc-status','Потенциальный']]) {
          document.getElementById(id).value = value;
        }
      });
      matches.append(create);
    }));
    details.append(group(field('Название в CRM',search),connect),message,matches);
    box.append(details);
  }
  function timeLabel(value) {
    const seconds = Math.floor(value);
    return Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0');
  }
  function speakerLabels(lines) {
    const labels = new Map();
    for (const line of lines) {
      if (line.speaker && !labels.has(line.speaker)) labels.set(line.speaker, 'Голос ' + (labels.size + 1));
    }
    return labels;
  }
  function chooseSpeaker(id, lines, labels, box, message, ticket, previous = []) {
    if (!labels.size) {
      message.textContent = 'Транскрибатор не смог разделить голоса. Проверьте расшифровку.';
      return;
    }
    const choices = node('fieldset', undefined, 'nt-speaker-choices');
    choices.append(node('legend', 'Какие реплики ваши?'));
    const hint = node('p', 'Отметьте группы со своими фразами. Если ваш голос попал в две группы, отметьте обе.', 'nt-muted');
    hint.id = 'nt-speaker-hint';
    choices.setAttribute('aria-describedby', hint.id);
    choices.append(hint);
    const cards = node('div', undefined, 'nt-speaker-grid');
    const progress = status();
    const refresh = previous.length > 0;
    const analyse = button(refresh ? 'Обновить разбор' : 'Запустить разбор', () => operation(analyse, progress, async () => {
      const speakers = [...choices.querySelectorAll('[name="nt-speaker"]:checked')].map(choice => choice.value);
      if (!speakers.length) return;
      await api({action:'analyse', id, speakers, refresh_review:refresh});
      if (ticket === layout) render('summary');
    }, 'ИИ анализирует реплики менеджера…'), true);
    analyse.disabled = !refresh;
    for (const [speaker, label] of labels) {
      const option = node('label', undefined, 'nt-speaker');
      const checkbox = input('checkbox');
      checkbox.name = 'nt-speaker';
      checkbox.value = speaker;
      checkbox.checked = previous.includes(speaker);
      checkbox.addEventListener('change', () => {
        analyse.disabled = !choices.querySelector('[name="nt-speaker"]:checked');
      });
      const examples = lines.filter(line => line.speaker === speaker);
      const excerpts = examples.filter(line => line.text.length >= 18).slice(0, 2);
      const heading = node('span', label, 'nt-speaker-name');
      option.append(checkbox, heading);
      for (const line of excerpts.length ? excerpts : examples.slice(0, 2)) {
        const text = line.text.length > 180 ? line.text.slice(0, 177) + '…' : line.text;
        option.append(node('span', timeLabel(line.time) + ' · «' + text + '»', 'nt-speaker-quote'));
      }
      cards.append(option);
    }
    choices.append(cards, analyse, progress);
    box.append(choices);
  }
  async function renderDetail(ticket,id,focusTarget) {
    const box = card('Запись переговоров'), message = status();
    page.append(button('К истории',() => {selectedId = null; render();}), box);
    box.append(message); message.textContent = 'Загружаем…';
    try {
      const {row} = await api({action:'get',id});
      if (ticket !== layout) return;
      box.firstElementChild.textContent = row.prospect_name;
      box.insertBefore(node('p',[stamp(row.created_at),row.city,row.address].filter(Boolean).join(' · '),'nt-muted'),message);
      message.textContent = statuses[row.audio_state] || '';
      const owner = row.owner_id === currentUser?.id;
      if (owner && ['draft','error','uploading'].includes(row.audio_state)) {
        box.append(button('Записать разговор',() => begin({id:row.id,prospect_name:row.prospect_name}),true));
      }
      if (row.visit_id) box.append(node('p','Привязано к визиту','nt-muted'));
      else if (owner && row.client_id) visitLink(row,box);
      if (row.audio_state === 'queued') {
        message.textContent = 'Запись отправлена. Можно вернуться к ней позже.';
        pollTimer = setTimeout(async () => {
          if (ticket !== layout || !page.classList.contains('active')) return;
          try {await api({action:'poll',id});}
          catch (e) {message.textContent = errorText(e);}
          if (ticket === layout) render();
        }, 12_000);
      }
      if (row.audio_state === 'ready' || row.audio_state === 'error') {
        api({action:'poll',id}).catch(() => {});
      }
      const canRefresh = owner && row.review && (row.review.coach_version ?? 0) < 2 && row.manager_speaker &&
        row.review.cases.every(item => item.score === null && !item.task_id);
      if (row.review) {
        message.textContent = '';
        if (canRefresh) {
          const prior = node('details');
          prior.append(node('summary', 'Предыдущий разбор'));
          renderReview(row, prior, false);
          box.append(prior);
        } else renderReview(row, box, owner);
      }
      if (row.transcript?.length) {
        const labels = speakerLabels(row.transcript);
        if (owner && (!row.review || canRefresh) && row.audio_state === 'ready') {
          message.textContent = '';
          if (canRefresh) box.append(node('p', 'Обновите разбор, чтобы он опирался на реплики менеджера.', 'nt-muted'));
          chooseSpeaker(id, row.transcript, labels, box, message, ticket,
            canRefresh ? row.review.manager_speakers || [row.manager_speaker] : []);
        }
        const transcript = node('details');
        const lines = node('div', undefined, 'nt-transcript');
        for (const line of row.transcript) {
          const label = labels.get(line.speaker) || 'Голос не определён';
          lines.append(node('p', timeLabel(line.time) + ' · ' + label + ' · ' + line.text));
        }
        transcript.append(node('summary', 'Вся расшифровка'), lines);
        box.append(transcript);
      }
      clientLink(row,box);
      if (focusTarget) {
        const target = [...box.querySelectorAll('[data-nt-focus]')].find(el => el.dataset.ntFocus === focusTarget);
        if (target) {
          target.tabIndex = -1;
          target.focus({preventScroll:true});
          target.scrollIntoView?.({block:'nearest'});
        }
      }
    } catch (error) {if (ticket === layout) message.textContent = errorText(error);}
  }
  function visitLink(row,box) {
    const candidates = allVisits.filter(visit => visit.client_id === row.client_id && visit.manager_id === currentUser.id).slice(0,20);
    if (!candidates.length) return;
    const select = node('select');
    for (const visit of candidates) select.add(new Option(visit.date + ' · ' + (visit.result || 'Визит'),visit.id));
    const message = status();
    const link = button('Привязать',() => operation(link,message,async () => {
      await api({action:'link_visit',id:row.id,visit_id:select.value});
      render();
    }));
    box.append(group(field('Визит',select),link),message);
  }
  function renderReview(row,box,owner) {
    const review = row.review;
    const brief = review.visit_brief;
    if (brief || (owner && row.manager_speaker && row.audio_state === 'ready')) {
      const panel = card('К следующему визиту');
      panel.classList.add('nt-next-step');
      panel.dataset.ntFocus = 'summary';
      if (brief) {
        panel.append(labelled('Что произошло', brief.recap));
        if (brief.open) panel.append(labelled('Осталось уточнить', brief.open));
        panel.append(labelled('Что сделать', brief.action));
        if (brief.phrase) panel.append(node('blockquote','Можно сказать · «' + brief.phrase + '»'));
        const evidence = node('details');
        evidence.append(node('summary','Реплики, на которых основана подсказка'));
        if (brief.client_evidence) evidence.append(labelled('Клиент · ' + timeLabel(brief.client_evidence.time), brief.client_evidence.text));
        if (brief.manager_evidence) evidence.append(labelled('Менеджер · ' + timeLabel(brief.manager_evidence.time), brief.manager_evidence.text));
        if (brief.client_evidence || brief.manager_evidence) panel.append(evidence);
      } else {
        const message = status();
        const prepare = button('Подготовить подсказку', () => operation(prepare,message,async () => {
          await api({action:'prepare_visit_brief',id:row.id});
          if (selectedId === row.id) render('summary');
        }, 'Разбираем ход переговоров…'));
        panel.append(prepare,message);
      }
      box.append(panel);
    }
    const completed = review.cases.filter(entry => entry.plan);
    if (completed.length) box.append(node('h4', 'Что сделать дальше'));
    for (const item of completed) {
      const panel = card(item.plan.source === 'ai' ? 'Подсказка ИИ' : 'Согласованное действие');
      panel.dataset.ntFocus = item.id;
      const plan = item.plan;
      panel.classList.add('nt-next-step');
      panel.append(node('p',item.issue,'nt-muted'),node('strong',plan.action),
        node('p','Ожидаемый результат · ' + plan.result), node('p','Как проверить · ' + plan.check));
      if (item.task_id) panel.append(node('p','Задача создана · срок ' + item.due_date,'nt-muted'));
      else if (owner && row.client_id) {
        const due = input('date'); due.min = localDate();
        const message = status();
        const add = button('Согласовать и создать задачу',() => operation(add,message,async () => {
          if (!due.value || due.value < due.min) {message.textContent = 'Укажите срок выполнения.'; return;}
          await api({action:'task',id:row.id,case_id:item.id,due:due.value});
          if (selectedId === row.id) render();
        }),true);
        panel.append(group(field('Срок',due),add),message);
      } else if (owner) {
        panel.append(button('Привязать клиента для задачи',() => {
          const details = box.querySelector('#nt-link-client');
          if (details) {details.open = true; details.scrollIntoView?.({block:'nearest'});}
        }));
      }
      box.append(panel);
    }
    const heading = node('h4', review.quality === null ? 'Разбор работы менеджера' : 'Качество переговоров менеджера · ' + review.quality + '%');
    if (!box.querySelector('[data-nt-focus="summary"]')) heading.dataset.ntFocus = 'summary';
    box.append(heading, node('p', review.summary));
    const modeLabel = {first_visit:'Первая встреча', repeat_visit:'Повторный визит', deescalation:'Реакция на напряжение или отказ'}[review.mode];
    if (modeLabel) heading.after(node('p', modeLabel, 'nt-muted'));
    if (review.strength?.evidence) {
      box.append(node('h4','Что получилось'), node('p', review.strength.observation),
        node('blockquote','Менеджер · ' + timeLabel(review.strength.evidence.time) + ' · ' + review.strength.evidence.text));
    }
    const score = node('details');
    score.append(node('summary','Оценки и основания'));
    for (const item of review.criteria) {
      score.append(node('p',item.name + ' · ' + (item.score ?? 'Н/П') + (item.reason ? ' · ' + item.reason : '')));
      if (item.evidence && review.coach_version >= 2) {
        score.append(node('blockquote', 'Менеджер · ' + timeLabel(item.evidence.time) + ' · ' + item.evidence.text));
      }
    }
    box.append(score);
    const pending = review.cases.find(item => item.score === null);
    if (pending) {
      if (review.mode) box.append(node('h4','Что улучшить'));
      const panel = card('Ситуация ' + (review.cases.indexOf(pending) + 1) + ' из ' + review.cases.length + ' · ждёт ответа');
      panel.dataset.ntFocus = pending.id;
      panel.append(node('strong',pending.issue),
        node('blockquote', (review.coach_version >= 2 ? 'Менеджер · ' + timeLabel(pending.evidence.time) + ' · ' : '') + pending.evidence.text));
      if (pending.client_context) {
        panel.append(node('p', 'Клиент · ' + timeLabel(pending.client_context.time) + ' · «' + pending.client_context.text + '»', 'nt-muted'));
      }
      if (pending.reason) panel.append(node('p',pending.reason));
      if (pending.last_reply) {
        panel.append(node('p', 'Ваш ответ сохранён · «' + pending.last_reply.text + '»', 'nt-muted'));
      }
      if (pending.feedback) panel.append(node('p', pending.feedback));
      panel.append(node('p', pending.followup || pending.question));
      if (owner) {
        const answer = node('textarea');
        answer.rows = 3;
        answer.maxLength = 2500;
        const message = status();
        let sentAnswer, requestId;
        const send = button('Ответить',() => operation(send,message,async () => {
          const text = answer.value.trim();
          if (!text) {message.textContent = 'Напишите свой вариант решения или уточняющий вопрос.'; return;}
          if (sentAnswer !== text) {
            sentAnswer = text;
            requestId = crypto.randomUUID();
          }
          await api({action:'answer', id:row.id, case_id:pending.id,answer:text,request_id:requestId});
          if (selectedId === row.id) render(pending.id);
        },'ИИ анализирует ваш ответ…'),true);
        panel.append(field('Ваш ответ · попытка ' + (pending.attempts.length + 1) + ' из 3',answer),send,message);
      }
      box.append(panel);
    }
  }

  function microphoneError(error) {
    switch (error.name) {
      case 'NotAllowedError':
      case 'PermissionDeniedError':
      case 'SecurityError':
        return window.Capacitor?.getPlatform?.() === 'android'
          ? 'Разрешите микрофон в настройках Android: Приложения → Ресанта CRM → Разрешения → Микрофон. Затем нажмите «Начать запись» ещё раз.'
          : 'Разрешите микрофон для этого сайта в настройках браузера. Если доступ отключён на устройстве, разрешите его и для браузера. Затем нажмите «Начать запись» ещё раз.';
      case 'NotFoundError':
      case 'DevicesNotFoundError':
        return 'Устройство не видит микрофон. Проверьте, что он включён или подключён.';
      case 'NotReadableError':
      case 'TrackStartError':
      case 'AbortError':
        return 'Не удалось включить микрофон. Завершите звонок или запись в другом приложении, проверьте доступ к микрофону и повторите.';
      default:
        return 'Не удалось включить микрофон. Попробуйте ещё раз или выберите готовый аудиофайл.';
    }
  }

  function startRecorder(stream, ondata, onerror, onstop) {
    const Recorder = window.MediaRecorder;
    const formats = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];
    for (const mimeType of [...formats.filter(type => Recorder.isTypeSupported?.(type)), '']) {
      try {
        const recorder = new Recorder(stream, mimeType ? {mimeType} : undefined);
        recorder.ondataavailable = ondata;
        recorder.onerror = onerror;
        recorder.onstop = () => onstop(recorder, mimeType);
        recorder.start();
        return recorder;
      } catch {
        // A WebView can advertise a format whose encoder fails to start.
      }
    }
    return null;
  }

  function androidRecorder() {
    const bridge = window.Capacitor;
    return bridge?.getPlatform?.() === 'android' && bridge.isPluginAvailable?.('NegotiationAudio')
      ? bridge.Plugins?.NegotiationAudio : null;
  }

  function discardAndroidRecording(state) {
    const session = state?.androidSession;
    if (!session) return;
    state.androidSession = null;
    return state.android.discardRecording({session}).catch(() => {});
  }

  function begin(context) {
    if (!permitted() || capture) return;
    const state = {owner:currentUser.id, context, file:null, busy:false, android:androidRecorder()};
    capture = state;
    dialog.replaceChildren(node('h3','Записать разговор'), node('p',context.prospect_name || 'Выбранная торговая точка'));
    const consent = input('checkbox');
    const file = input('file'); file.accept = 'audio/*,.m4a,.webm,.mp4';
    const message = status();
    const settings = button('Открыть разрешения Android', async () => {
      try { await state.android.openSettings(); }
      catch { message.textContent = 'Откройте настройки «Ресанта CRM» и проверьте разрешение на микрофон.'; }
    });
    settings.classList.add('nt-permission-settings');
    settings.hidden = true;
    const record = button('Начать запись',async () => {
      if (state.android) {
        if (!consent.checked) {message.textContent = 'Подтвердите согласие участников.'; return;}
        await recordAndroid();
        return;
      }
      if (state.recorder?.state === 'recording') {
        record.disabled = true;
        state.sendOnStop = true;
        state.recorder.stop();
        return;
      }
      if (!consent.checked) {message.textContent = 'Подтвердите согласие участников.'; return;}
      if (window.isSecureContext === false || !navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
        message.textContent = 'Запись здесь недоступна. Откройте рабочую CRM по HTTPS в Chrome или Safari либо выберите готовый аудиофайл.';
        return;
      }
      let stream;
      record.disabled = true;
      file.disabled = true;
      consent.disabled = true;
      send.disabled = true;
      message.textContent = 'Подключаем микрофон. Если появится запрос, разрешите доступ.';
      try {
        stream = await navigator.mediaDevices.getUserMedia({audio:true,video:false});
        if (capture !== state || !dialog.open || state.suspended) return;
        state.stream = stream;
        const chunks = [];
        let interrupted = false;
        state.recorder = startRecorder(stream,
          event => {if (event.data?.size) chunks.push(event.data);},
          () => {interrupted = true;},
          (recorder, mimeType) => {
            stream.getTracks().forEach(track => track.stop());
            state.stream = null;
            if (capture !== state) return;
            const recording = new Blob(chunks,{type:recorder.mimeType || chunks[0]?.type || mimeType});
            if (recording.size) state.file = recording;
            record.textContent = 'Записать заново';
            record.disabled = false;
            message.textContent = interrupted
              ? recording.size ? 'Запись прервана. Можно отправить записанный фрагмент или начать заново.'
                : 'Запись прервана. Проверьте микрофон и повторите.'
              : recording.size ? 'Запись готова к отправке.' : 'Микрофон не записал звук.';
            send.disabled = !state.file?.size;
            file.disabled = false;
            consent.disabled = false;
            if (state.sendOnStop && recording.size && !interrupted && !state.suspended) send.click();
            state.sendOnStop = false;
          });
        if (!state.recorder) {
          message.textContent = 'Микрофон подключён, но устройство не смогло начать запись. Откройте CRM в Chrome или Safari либо выберите готовый аудиофайл.';
          return;
        }
        record.textContent = 'Остановить и отправить';
        message.textContent = 'Идёт запись. Оставьте эту вкладку открытой.';
      } catch (error) {
        if (capture === state && !state.suspended) message.textContent = microphoneError(error);
      } finally {
        record.disabled = false;
        if (state.recorder?.state !== 'recording') {
          stream?.getTracks().forEach(track => track.stop());
          state.stream = null;
          file.disabled = false;
          consent.disabled = false;
          send.disabled = !state.file?.size;
        }
      }
    });
    async function recordAndroid() {
      settings.hidden = true;
      record.disabled = file.disabled = consent.disabled = close.disabled = send.disabled = true;
      let recordingReady = false;
      try {
        if (state.androidSession) {
          message.textContent = 'Подготавливаем аудио…';
          const {path} = await state.android.stop({session:state.androidSession});
          const response = await fetch(window.Capacitor.convertFileSrc(path));
          if (!response.ok) throw Error('Cannot read recording');
          const audio = await response.blob();
          if (!audio.size) throw Error('Empty recording');
          if (capture !== state || state.suspended) return;
          state.file = new Blob([audio],{type:'audio/mp4'});
          recordingReady = true;
        } else {
          message.textContent = 'Подключаем микрофон. Если появится запрос Android, разрешите доступ.';
          state.androidSession = crypto.randomUUID();
          await state.android.start({session:state.androidSession});
          if (capture === state && !state.suspended && state.androidSession) {
            record.textContent = 'Остановить и отправить';
            message.textContent = 'Идёт запись. Оставьте CRM открытой.';
            return;
          }
        }
      } catch (error) {
        if (capture === state && !state.suspended) {
          settings.hidden = error.code !== 'microphone_denied';
          message.textContent = error.code === 'microphone_denied'
            ? 'Android не разрешил запись для «Ресанта CRM». Откройте разрешения приложения или выберите готовый аудиофайл.'
            : 'Android не смог записать звук. Завершите звонок или запись в другом приложении и повторите.';
        }
        await discardAndroidRecording(state);
      } finally {
        if (recordingReady || capture !== state || state.suspended) await discardAndroidRecording(state);
        record.disabled = close.disabled = false;
        if (!state.androidSession) {
          record.textContent = state.file?.size ? 'Записать заново' : 'Начать запись';
          file.disabled = consent.disabled = false;
          send.disabled = !state.file?.size;
        }
      }
      if (recordingReady && capture === state && !state.suspended) send.click();
    }
    file.addEventListener('change',() => {
      state.file = file.files[0];
      send.disabled = !state.file?.size;
      message.textContent = state.file ? 'Аудиофайл выбран.' : '';
    });
    const close = button('Закрыть',() => {
      if (state.busy || state.androidSession || state.recorder?.state === 'recording') return;
      if (state.file?.size && !state.sent && !confirm('Закрыть без отправки записи?')) return;
      dialog.close();
    });
    const send = button('Отправить на расшифровку',() => operation(send,message,async () => {
      if (!state.file?.size || !consent.checked) {message.textContent = 'Выберите запись и подтвердите согласие участников.'; return;}
      if (state.file.size > 160 * 1024 * 1024) {message.textContent = 'Запись больше 160 МБ. Выберите файл меньшего размера.'; return;}
      const ext = state.file.name?.toLowerCase().split('.').pop();
      const mime = state.file.type.split(';')[0];
      const type = Object.values(audioTypes).includes(mime) ? mime : audioTypes[ext];
      if (!type) {message.textContent = 'Формат записи не поддерживается.'; return;}
      state.busy = true; file.disabled = true; record.disabled = true; close.disabled = true;
      try {
        const id = (state.id ||= context.id || crypto.randomUUID());
        if (!context.id) await api({...context,action:'create',id});
        const meta = await api({action:'start',id,type,size:state.file.size,permission:true});
        const count = Math.ceil(state.file.size / meta.partSize);
        for (let index = 0; index < count; index++) {
          message.textContent = 'Загрузка · ' + (index + 1) + ' из ' + count;
          const offset = index * meta.partSize;
          await api({id,part:index},state.file.slice(offset,offset + meta.partSize));
        }
        await api({action:'complete',id});
        state.sent = true;
        dialog.close();
        if (context.visitForm) {
          visitLinks.set(context.visitForm,{id,client:context.client_id,owner:state.owner});
          const notice = document.getElementById('nt-' + context.visitForm + '-notice');
          notice.textContent = 'Запись отправлена. Сохраните визит, чтобы связать его с переговорами.';
        } else {
          tab = 'history'; selectedId = id; render();
        }
      } finally {
        state.busy = false; file.disabled = false; close.disabled = false;
        record.disabled = false;
      }
    }),true);
    send.disabled = true;
    consent.classList.add('nt-check');
    const agreement = node('label',undefined,'nt-agreement');
    agreement.append(consent,node('span','Участники согласились на запись и её разбор'));
    dialog.append(agreement,group(record,settings),field('Или выберите аудиофайл',file),message,group(close,send));
    dialog.showModal();
  }
  dialog.addEventListener('cancel',event => event.preventDefault());
  dialog.addEventListener('close',() => {
    const finished = capture;
    capture = null;
    void discardAndroidRecording(finished);
    if (finished?.recorder?.state === 'recording') finished.recorder.stop();
    finished?.stream?.getTracks().forEach(track => track.stop());
  });
  window.addEventListener('pagehide',() => {
    if (!capture) return;
    capture.suspended = true;
    void discardAndroidRecording(capture);
    capture.stream?.getTracks().forEach(track => track.stop());
  });
  window.addEventListener('pageshow',() => {
    if (capture) capture.suspended = false;
  });

  const visitContext = {
    quick:{client:'qv-client-id', title:'qv-title', address:'qv-addr'},
    visit:{client:'v-client', title:'v-client-search'},
  };
  function recordVisit(form) {
    const context = visitContext[form];
    if (!permitted() || !context) return;
    const id = document.getElementById(context.client).value;
    const name = document.getElementById(context.title);
    if (!/^[a-f0-9-]{36}$/i.test(id)) {
      const message = document.getElementById('nt-' + form + '-notice');
      message.textContent = 'Выберите торговую точку. Если клиента нет в CRM, откройте «Переговоры → Новый клиент».';
      return;
    }
    const prior = visitLinks.get(form);
    if (prior?.client === id && prior.owner === currentUser.id) {
      document.getElementById('nt-' + form + '-notice').textContent = 'Запись уже отправлена. Сохраните визит.';
      return;
    }
    const address = context.address ? document.getElementById(context.address).textContent : '';
    begin({client_id:id, prospect_name:name.value || name.textContent, address,
      route_plan_id:form === 'quick' ? qvRoutePlanId : null, visitForm:form});
  }
  window.addEventListener('resanta-negotiation-visit-saved',async ({detail}) => {
    const draft = visitLinks.get(detail?.form);
    if (!draft || !detail.visit?.id || draft.client !== detail.visit.client_id || draft.owner !== currentUser?.id) return;
    try {
      await api({action:'link_visit',id:draft.id,visit_id:detail.visit.id});
      if (visitLinks.get(detail.form) === draft) visitLinks.delete(detail.form);
    } catch {
      // History retains the recording and offers manual attachment if the network was interrupted.
    }
  });
  window.addEventListener('resanta-negotiation-client-saved',async ({detail}) => {
    const draft = pendingClient;
    pendingClient = null;
    if (!draft || draft.owner !== currentUser?.id) return;
    try {await api({action:'link_client',id:draft.id,client_id:detail.id});}
    catch {alert('Карточка клиента сохранена. Привяжите её к записи в разделе «Переговоры».');}
  });
  new MutationObserver(() => {
    if (!document.getElementById('modal-add-client').classList.contains('open')) pendingClient = null;
  }).observe(document.getElementById('modal-add-client'), {attributes:true,attributeFilter:['class']});

  function sync() {
    const visible = permitted();
    for (const el of document.querySelectorAll('[data-nt-entry]')) el.hidden = !visible;
    const next = visible ? currentUser.id : null;
    if (next === userId) return;
    userId = next; ++layout;
    clearTimeout(pollTimer);
    visitLinks.clear(); pendingClient = null; selectedId = null; pointContext = null; people = []; historyFilter = {}; reportFilter = {};
    const point = document.getElementById('nt-client-point');
    if (point) {point.hidden = true; point.replaceChildren();}
    page.replaceChildren();
    if (dialog.open) dialog.close();
  }
  new MutationObserver(sync).observe(document.getElementById('app'),{attributes:true,attributeFilter:['class','style','data-active-page']});
  new MutationObserver(sync).observe(document.getElementById('nav-sales'),{attributes:true,attributeFilter:['style','class']});
  function resetVisit(form) {
    visitLinks.delete(form);
    const notice = document.getElementById('nt-' + form + '-notice');
    if (notice) notice.textContent = '';
  }
  window.crmNegotiations = {open, recordVisit, beginCheckin, mountPoint, resetVisit};
  sync();
})();
