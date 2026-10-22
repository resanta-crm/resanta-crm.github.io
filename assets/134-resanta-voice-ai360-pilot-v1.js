/* RESANTA AI 360 — pilot v1, 2026-10-22.
 * Standalone, read-only, director-only UI. No backend, DB writes, or LLM calls.
 * Browser speech recognition can use a remote browser provider; wake mode is opt-in.
 * Existing CRM navigation, RLS, sales/GPS import logic, and APK are unchanged.
 */
(function () {
  'use strict';
  if (window.__resantaVoicePilotV1) return;
  window.__resantaVoicePilotV1 = true;

  const WAKE = /(?:^|\s)привет[\s,!.\-–—]+ресанта(?:[\s,!.?]|$)/i;
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const state = { wake:false, active:false, awaiting:false, speaking:false,
    silent:false, recognition:null, localReady:false, mounted:false, timer:0, pendingRestart:0 };
  let root, trigger, statusEl, historyEl, field, wakeBtn, micBtn, muteBtn;

  function allowed() {
    try {
      return typeof currentUser !== 'undefined' && !!currentUser?.id &&
        typeof currentProfile !== 'undefined' && currentProfile?.role === 'boss' &&
        String(currentProfile?.name || '').trim().replace(/\s+/g, ' ').toLowerCase() === 'александр паюшин' &&
        document.getElementById('app')?.style.display !== 'none';
    } catch (_) { return false; }
  }
  function visible() { return allowed() && !!root && !root.hidden && !document.hidden; }
  function textStatus(message) { if (statusEl) statusEl.textContent = message; }
  function addLine(who, message) {
    if (!historyEl) return;
    const wrap = document.createElement('div');
    wrap.className = 'rva-line';
    const head = document.createElement('strong'); head.textContent = who;
    const txt = document.createElement('div'); txt.textContent = String(message || '');
    wrap.append(head, txt); historyEl.appendChild(wrap);
    while (historyEl.children.length > 12) historyEl.removeChild(historyEl.firstChild);
    historyEl.scrollTop = historyEl.scrollHeight;
  }
  function speak(message) {
    if (!visible() || state.silent || !('speechSynthesis' in window) || !('SpeechSynthesisUtterance' in window)) {
      state.speaking = false; resumeWake(); return;
    }
    try {
      window.speechSynthesis.cancel();
      const utter = new SpeechSynthesisUtterance(String(message).slice(0, 450));
      utter.lang = 'ru-RU'; utter.rate = 1; utter.volume = 0.85;
      const voices = window.speechSynthesis.getVoices?.() || [];
      const voice = voices.find(v => /^ru(?:-|_)/i.test(v.lang || ''));
      if (voice) utter.voice = voice;
      state.speaking = true;
      utter.onend = utter.onerror = function () { state.speaking = false; resumeWake(); };
      window.speechSynthesis.speak(utter);
    } catch (_) { state.speaking = false; resumeWake(); }
  }
  function answer(message) { addLine('РЕСАНТА AI', message); textStatus('Готов к следующему вопросу'); speak(message); }
  function hasLoadedSnapshot() {
    return !!document.querySelector('#dash-kpi .kpi') &&
      typeof allClients !== 'undefined' && Array.isArray(allClients) &&
      typeof allTasks !== 'undefined' && Array.isArray(allTasks);
  }
  function snapshot() {
    if (!hasLoadedSnapshot()) return null;
    try {
      const active = typeof canonicalActiveTasks === 'function' ? canonicalActiveTasks(allTasks) : [];
      const overdue = typeof isTaskOverdue === 'function' ? active.filter(isTaskOverdue).length : null;
      const todayTasks = typeof TODAY !== 'undefined' ? active.filter(t => t.due_date === TODAY).length : null;
      const visits = typeof visibleVisitsForCurrentUser === 'function' ? visibleVisitsForCurrentUser() : [];
      const todayVisits = typeof visitDate === 'function' && typeof TODAY !== 'undefined'
        ? visits.filter(v => visitDate(v) === TODAY).length : null;
      return { clients:allClients.length, tasks:active.length, overdue, todayTasks, todayVisits };
    } catch (_) { return null; }
  }
  function openPage(id, title) {
    if (!allowed() || typeof goPage !== 'function') return false;
    const page = document.getElementById('page-' + id);
    const nav = document.getElementById('nav-' + id);
    if (!page || !nav || nav.style.display === 'none' || getComputedStyle(nav).display === 'none') return false;
    goPage(id, title);
    return true;
  }
  function handleCommand(raw) {
    if (!allowed()) return;
    const input = String(raw || '').trim().slice(0, 300);
    if (!input) return;
    addLine('Вы', input);
    const normalized = input.toLocaleLowerCase('ru-RU').replace(/ё/g,'е').replace(/[!?.,]/g, ' ').replace(/\s+/g,' ').trim();
    let query = normalized.replace(/(?:^|\s)привет\s+ресанта\s*/i, ' ').trim();
    if (!query) { answer('Привет! Слушаю тебя. Спроси о задачах, клиентах, визитах или попроси открыть раздел CRM.'); return; }

    const stats = snapshot();
    if (/(кто|какие|что).*(проблем|важн|сигнал|контрол|сегодня|утро)|(что|какие)\s+сегодня/.test(query)) {
      if (!stats) { answer('Данные CRM ещё загружаются. Повтори вопрос после появления показателей на дашборде.'); return; }
      answer('По загруженным данным CRM: рабочих задач ' + stats.tasks +
        (stats.overdue === null ? '' : ', просроченных ' + stats.overdue) +
        (stats.todayTasks === null ? '' : ', со сроком сегодня ' + stats.todayTasks) +
        '. Клиентов в текущей выборке ' + stats.clients +
        '. Это краткая сводка задач, не анализ продаж. Для проверки продаж скажи: открой продажи.');
      return;
    }
    if (/(просроч|задач)\w*/.test(query) && /(сколько|какие|покажи|назови|провер|просроч)\w*/.test(query)) {
      if (!stats) { answer('Задачи ещё загружаются.'); return; }
      answer('Сейчас в загруженной выборке ' + stats.tasks + ' рабочих задач' +
        (stats.overdue === null ? '' : ', из них ' + stats.overdue + ' просроченных') +
        '. ' + (openPage('tasks','Задачи') ? 'Открываю задачи.' : 'Раздел задач недоступен.'));
      return;
    }
    if (/(сколько|число|количество).*клиент/.test(query)) {
      answer(stats ? ('Сейчас в загруженной выборке CRM ' + stats.clients + ' клиентов. Это не обязательно вся клиентская база.') :
        'Список клиентов ещё загружается.'); return;
    }
    if (/(сколько|провер|сегодня).*(визит|посещен)/.test(query)) {
      answer(stats && stats.todayVisits !== null ? 'По сохранённым визитам CRM сегодня ' + stats.todayVisits + ' посещений. Это не проверка достоверности GPS.' :
        'Данные визитов ещё недоступны для подсчёта.'); return;
    }
    if (/(найди|найти|поищи|поиск).*клиент/.test(query)) {
      const needle = query.replace(/^.*?клиент(?:а|ов|у)?\s*/,'').trim();
      if (needle.length < 3) { answer('Назови клиента. Например: найди клиента Триовист.'); return; }
      if (!stats) { answer('Карточки клиентов ещё загружаются.'); return; }
      const matches = allClients.filter(c=>String(c.name||'').toLocaleLowerCase('ru-RU').includes(needle)).slice(0,5);
      if (!matches.length) { answer('В загруженном списке подходящий клиент не найден. Возможно, карточка не вошла в текущую выборку.'); return; }
      if (!openPage('clients','Клиенты')) { answer('Раздел клиентов сейчас недоступен.'); return; }
      const search = document.getElementById('client-search');
      if (search) { search.value=needle; try { if (typeof renderClients==='function') renderClients(); } catch (_) {} }
      answer('Нашёл в загруженных данных: ' + matches.map(c=>c.name).join(', ') + '. Открываю раздел клиентов.'); return;
    }
    const pages = [
      [/триовист|21\s*век|21vek/, 'triovist', 'Триовист'],
      [/продаж/, 'sales', 'Продажи'],
      [/маршрут/, 'routes-boss', 'Маршруты'],
      [/(дебитор|задолж|долг)/, 'debt', 'Задолженность'],
      [/(менеджер|кпи|kpi)/, 'managers', 'Менеджеры · KPI'],
      [/(контрол|gps|джипиэс)/, 'gps-control', 'GPS-контроль'],
      [/(задач)/, 'tasks', 'Задачи'],
      [/(клиент)/, 'clients', 'Клиенты'],
      [/(сигнал|уведомлен)/, 'alerts', 'Сигналы'],
      [/(акци)/, 'promotions', 'Акции'],
      [/(дашборд|главн)/, 'dashboard', 'Дашборд']
    ];
    if (/(открой|покажи|перейди|выведи|посмотри|что с|как там|анализ)/.test(query)) {
      for (const [pattern, id, label] of pages) {
        if (pattern.test(query)) {
          if (openPage(id, label)) answer('Открываю раздел «' + label + '». Данные будут показаны средствами CRM.');
          else answer('Не могу безопасно открыть раздел «' + label + '» из голосового пилота. Открой его через меню CRM.');
          return;
        }
      }
    }
    if (/^(стоп|замолчи|хватит|тише)$/.test(query)) { window.speechSynthesis?.cancel(); textStatus('Озвучивание остановлено'); return; }
    answer('Пока это пилот голосового управления. Я могу открыть продажи, маршруты, задачи, задолженность или показать сводку по задачам и клиентам. Полноценный ИИ-анализ продаж добавим отдельным проверенным этапом.');
  }
  function stopRecognition() {
    clearTimeout(state.pendingRestart);
    const r = state.recognition;
    state.recognition = null;
    state.active = false;
    if (r) { r.onend=null; r.onresult=null; r.onerror=null; try { r.abort(); } catch (_) {} }
  }
  function resumeWake() {
    if (!state.wake || !visible() || state.speaking || state.active) return;
    clearTimeout(state.pendingRestart);
    state.pendingRestart = setTimeout(()=>{if(state.wake&&!state.active&&!state.speaking&&visible()) startListening('wake');},650);
  }
  function startListening(mode) {
    if (!visible()) return;
    if (!Recognition) { textStatus('Распознавание речи не поддерживается браузером. Используй поле для вопроса.'); return; }
    if (state.active) return;
    const r = new Recognition();
    state.recognition=r; state.active=true;
    r.lang='ru-RU'; r.continuous=mode==='wake'; r.interimResults=false; r.maxAlternatives=1;
    if ('processLocally' in r && state.localReady) r.processLocally=true;
    textStatus(mode==='wake' ? 'Микрофон включён: ожидаю «Привет, Ресанта»' : 'Слушаю вопрос…');
    r.onresult=(event)=>{
      for(let i=event.resultIndex;i<event.results.length;i++){
        const res=event.results[i]; if(!res?.isFinal)continue;
        const phrase=String(res[0]?.transcript||'').trim(); if(!phrase)continue;
        if (mode==='wake') {
          const found=phrase.match(WAKE);
          if(!found)continue;
          const rest=phrase.slice(found.index+found[0].length).trim();
          stopRecognition();
          if (rest) { handleCommand(rest); }
          else { state.awaiting=true; textStatus('Фраза распознана. Слушаю вопрос…');
            // The previous recognizer releases the mic asynchronously: avoid a start/abort race.
            setTimeout(()=>{if(state.wake && state.awaiting && visible()) startListening('question');},450); }
          return;
        }
        stopRecognition(); state.awaiting=false;
        handleCommand(phrase);
        return;
      }
    };
    r.onerror=(event)=>{
      const error=String(event?.error||'ошибка');
      if (/not-allowed|service-not-allowed|audio-capture|language-not-supported|network/.test(error)) {
        state.wake=false; state.awaiting=false; updateButtons();
      }
      textStatus('Микрофон: ' + error + '. Можно ввести вопрос текстом.');
    };
    r.onend=()=>{
      if (state.recognition!==r) return;
      state.recognition=null; state.active=false;
      if (mode==='question') state.awaiting=false;
      if (state.wake) resumeWake();
      else if (!state.speaking) textStatus('Готов к вопросу');
    };
    try { r.start(); } catch(e) {
      state.recognition=null; state.active=false; state.wake=false; updateButtons();
      textStatus('Не удалось запустить микрофон. Разреши доступ в браузере или введи вопрос текстом.');
    }
  }
  function updateButtons() {
    if (wakeBtn) {wakeBtn.textContent=state.wake?'■ Отключить фразу':'◉ Включить «Привет, Ресанта»';wakeBtn.setAttribute('aria-pressed',String(state.wake));}
    if (muteBtn) muteBtn.textContent=state.silent?'🔇 Озвучка выключена':'🔊 Озвучка включена';
  }
  function setWake(on) {
    state.wake=!!on; state.awaiting=false; stopRecognition();
    window.speechSynthesis?.cancel();state.speaking=false;updateButtons();
    if (state.wake) startListening('wake');
    else textStatus('Фоновая голосовая активация выключена');
  }
  function closePanel() {
    setWake(false); window.speechSynthesis?.cancel(); state.speaking=false;
    if(root)root.hidden=true;
    if(trigger)trigger.setAttribute('aria-expanded','false');
  }
  function mount() {
    if (state.mounted || !document.getElementById('app')) return;
    const top=document.querySelector('#app .topbar'); if(!top)return;
    state.mounted=true;
    const style=document.createElement('style');
    style.textContent=`
      .rva-launch{border:1px solid #185FA5;border-radius:9px;background:#EFF6FF;color:#185FA5;font-weight:750;font-size:12px;padding:7px 9px;cursor:pointer;white-space:nowrap}
      .rva-window{position:fixed;z-index:950;right:16px;bottom:18px;width:min(400px,calc(100vw - 24px));max-height:min(80dvh,650px);overflow:hidden;border-radius:16px;background:#101d36;color:#f6faff;box-shadow:0 16px 48px #0005;display:flex;flex-direction:column;font-family:system-ui,Arial,sans-serif}
      .rva-window[hidden],.rva-launch[hidden]{display:none!important}
      .rva-head{padding:14px 16px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #ffffff22}
      .rva-close{border:0;background:transparent;color:white;font-size:23px;cursor:pointer;padding:2px 6px}
      .rva-sub{font-size:11px;color:#a6bedb;margin-top:2px}.rva-history{padding:12px 14px;min-height:125px;overflow-y:auto;flex:1;max-height:330px}
      .rva-line{margin:0 0 12px;font-size:13px;line-height:1.45;overflow-wrap:anywhere}.rva-line strong{display:block;color:#9cc8fc;font-size:11px;margin-bottom:4px}
      .rva-control{padding:12px 14px 15px;border-top:1px solid #ffffff22;display:grid;gap:8px}.rva-status{font-size:12px;color:#d6e7ff}
      .rva-actions{display:flex;gap:7px;flex-wrap:wrap}.rva-btn{border:1px solid #6683a8;border-radius:9px;background:#24416a;color:white;padding:8px 10px;cursor:pointer;font-size:12px}
      .rva-btn.primary{background:#2075cb;border-color:#2075cb}.rva-q{display:flex;gap:6px}.rva-q input{flex:1;min-width:0;border:1px solid #60789d;border-radius:8px;padding:9px;font-size:13px;background:#fff;color:#111}
      .rva-note{font-size:10px;line-height:1.45;color:#a8bad4}
      @media(max-width:600px){.rva-window{left:8px;right:8px;bottom:calc(75px + env(safe-area-inset-bottom));width:auto;max-height:70dvh}.rva-launch{padding:6px;min-width:34px;font-size:0}.rva-launch::before{content:"🎙";font-size:18px}}
    `;
    document.head.appendChild(style);
    trigger=document.createElement('button'); trigger.type='button'; trigger.className='rva-launch';
    trigger.textContent='🎙 РЕСАНТА AI';trigger.setAttribute('aria-label','Открыть голосовой помощник РЕСАНТА AI');trigger.hidden=true;trigger.setAttribute('aria-expanded','false');
    top.insertBefore(trigger,top.querySelector('.user-badge'));
    root=document.createElement('section');root.className='rva-window';root.hidden=true;root.setAttribute('role','dialog');root.setAttribute('aria-label','Голосовой помощник РЕСАНТА AI');
    root.innerHTML=`<div class="rva-head"><div><strong>🎙 РЕСАНТА AI 360°</strong><div class="rva-sub">Пилот · только чтение · только ДФС</div></div><button class="rva-close" type="button" aria-label="Закрыть помощника">×</button></div>
      <div class="rva-history" role="log" aria-live="polite"></div>
      <div class="rva-control"><div class="rva-status" aria-live="polite">Микрофон пока выключен</div>
      <div class="rva-actions"><button class="rva-btn primary rva-mic" type="button">🎤 Спросить голосом</button><button class="rva-btn rva-wake" type="button" aria-pressed="false">◉ Включить «Привет, Ресанта»</button></div>
      <div class="rva-q"><input class="rva-input" type="text" maxlength="300" placeholder="Или напиши вопрос…" aria-label="Вопрос помощнику"><button class="rva-btn primary rva-send" type="button">➤</button></div>
      <div class="rva-actions"><button class="rva-btn rva-mute" type="button">🔊 Озвучка включена</button></div>
      <div class="rva-note">По умолчанию микрофон выключен. При включении распознавания браузер может передавать звук своему провайдеру. Фоновая фраза действует только в открытом окне. Запись и история диалога не сохраняются. Пилот не отправляет запросы платному ИИ и не изменяет данные CRM.</div></div>`;
    document.body.appendChild(root);
    historyEl=root.querySelector('.rva-history');statusEl=root.querySelector('.rva-status');field=root.querySelector('.rva-input');
    wakeBtn=root.querySelector('.rva-wake');micBtn=root.querySelector('.rva-mic');muteBtn=root.querySelector('.rva-mute');
    trigger.addEventListener('click',()=>{
      if(!allowed())return;
      root.hidden=!root.hidden;trigger.setAttribute('aria-expanded',String(!root.hidden));
      if(root.hidden)closePanel();
      else if(!historyEl.children.length)answer('Привет! Я пилот голосового помощника. Могу показать задачи, клиентов, визиты и открыть разделы CRM.');
    });
    root.querySelector('.rva-close').addEventListener('click',closePanel);
    micBtn.addEventListener('click',()=>{setWake(false); startListening('manual');});
    wakeBtn.addEventListener('click',()=>{
      if(state.wake){setWake(false);return;}
      if(!Recognition){textStatus('Этот браузер не поддерживает распознавание речи.');return;}
      if(!window.confirm('Включить голосовую активацию в открытой CRM? Браузер может отправлять речь своему сервису распознавания. Микрофон можно выключить в любой момент.'))return;
      setWake(true);
    });
    muteBtn.addEventListener('click',()=>{state.silent=!state.silent;if(state.silent){window.speechSynthesis?.cancel();state.speaking=false;resumeWake();}updateButtons();});
    const submit=()=>{const q=field.value.trim(); if(!q)return;field.value=''; handleCommand(q);};
    root.querySelector('.rva-send').addEventListener('click',submit);
    field.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();submit();}});
    addLine('РЕСАНТА AI','Готов к проверке. Примеры: «Что сегодня важного?», «Сколько просроченных задач?», «Открой продажи».');
    updateButtons();
  }
  function reconcile() {
    if(!state.mounted)mount();
    if(!state.mounted)return;
    const ok=allowed();
    trigger.hidden=!ok;
    if(!ok && !root.hidden)closePanel();
    if(!ok && state.active)stopRecognition();
  }
  document.addEventListener('visibilitychange',()=>{
    if(document.hidden) {setWake(false);window.speechSynthesis?.cancel();state.speaking=false;}
  });
  window.addEventListener('pagehide',()=>{setWake(false);window.speechSynthesis?.cancel();});
  // Opt in to local recognition only if this browser actually has a Russian pack.
  if (Recognition && typeof Recognition.available === 'function') {
    try {
      Promise.resolve(Recognition.available({langs:['ru-RU'],processLocally:true}))
        .then(status=>{state.localReady=status==='available';}).catch(()=>{});
    } catch (_) { /* Browsers may restrict on-device probing through permissions policy. */ }
  }
  reconcile();state.timer=window.setInterval(reconcile,1600);
})();