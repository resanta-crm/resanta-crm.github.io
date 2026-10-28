/* RESANTA AI 360 — pilot v1, 2026-10-22.
 * Standalone, read-only, director-only UI. No backend, DB writes, or LLM calls.
 * Browser speech recognition can use a remote browser provider; wake mode is opt-in.
 * Existing CRM navigation, RLS, sales/GPS import logic, and APK are unchanged.
 */
(function () {
  'use strict';
 // v23.7.14: 21 Oct Android incident; avoid optional voice APIs on all Android browsers and WebViews.
 if (/Android/i.test(navigator.userAgent || '')) return;

  if (window.__resantaVoicePilotV1) return;
  window.__resantaVoicePilotV1 = true;

  const WAKE = /(?:^|\s)привет[\s,!.\-–—]+ресанта(?:[\s,!.?]|$)/i;
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const state = { wake:false, active:false, awaiting:false, speaking:false,
    silent:false, recognition:null, localReady:false, mounted:false, timer:0, pendingRestart:0, manualRestart:0, manualSequence:0 };
  let root, trigger, statusEl, historyEl, field, wakeBtn, micBtn, muteBtn;
  let lastDetailedResponse='';
  let feedbackTarget=null;
  let lastSubstantialAnswer='';
  function briefVoiceText(message){
    const raw=String(message||'').replace(/\*\*/g,'').replace(/\s+/g,' ').trim();
    if(raw.length<=190)return raw;
    // Keep a complete thought rather than cut in the middle of a figure/SKU.
    const first=raw.slice(0,175);
    let end=first.lastIndexOf('. ');
    if(end>=85)end+=1;
    else {
      end=first.lastIndexOf('; ');
      if(end>=85)end+=1;
      else end=first.lastIndexOf(' ');
    }
    const intro=raw.slice(0,Math.max(80,end)).trim().replace(/[,;:]+$/,'');
    return intro+' Полный план на экране.';
  }

    function allowed() {
    try {
      return typeof currentUser !== 'undefined' && !!currentUser?.id &&
        typeof currentProfile !== 'undefined' && currentProfile?.role === 'boss' &&
        String(currentProfile?.name || '').trim().replace(/\s+/g, ' ').toLowerCase() === 'александр паюшин' &&
        document.getElementById('app')?.style.display !== 'none';
    } catch (_) { return false; }
  }
  function visible() { return allowed() && !!root && !root.hidden && !document.hidden; }
  function textStatus(message) { if(statusEl){statusEl.textContent=message;statusEl.title=String(message||'');} }
  async function copyExplicitly(value,successMessage){
    try {
      if(!navigator.clipboard?.writeText)throw new Error('clipboard_unavailable');
      await navigator.clipboard.writeText(String(value||''));
      textStatus(successMessage||'Скопировано. Перед отправкой проверь коммерческие данные.');
    }catch(_){textStatus('Копирование браузером запрещено. Можно выделить и скопировать текст ответа вручную.');}
  }
  function lastUserQuestion(){
    if(!historyEl)return '';
    const entries=[...historyEl.querySelectorAll('.rva-line[data-speaker="you"]')];
    return entries.length?entries[entries.length-1].querySelector('.rva-line-body')?.textContent||'':'';
  }
  function showFeedback(response,question){
    const card=root?.querySelector('.rva-feedback');
    if(!card)return;
    feedbackTarget={question:String(question||'').slice(0,300),response:String(response||'').slice(0,6000)};
    card.hidden=false;
    card.querySelector('.rva-feedback-comment').value='';
    card.querySelector('.rva-feedback-type')?.focus();
  }
  function addLine(who, message) {
    if (!historyEl) return;
    const wrap = document.createElement('div');
    wrap.className = 'rva-line';
    wrap.dataset.speaker=who==='Вы'?'you':'assistant';
    const head = document.createElement('strong'); head.textContent = who;
    const txt = document.createElement('div'); const raw = String(message || '');
    txt.className='rva-line-body';
    txt.style.whiteSpace='pre-line';
    for(const part of raw.split(/(\*\*[^*]+\*\*)/g)){
      if(/^\*\*[^*]+\*\*$/.test(part)){
        const strong=document.createElement('b');strong.textContent=part.slice(2,-2);txt.appendChild(strong);
      }else txt.appendChild(document.createTextNode(part));
    }
    wrap.append(head, txt);
    if(who==='РЕСАНТА AI' && raw.length>=30){
      const actions=document.createElement('div'); actions.className='rva-line-actions';
      const copy=document.createElement('button');copy.type='button';copy.textContent='⧉ Копировать';
      copy.addEventListener('click',()=>void copyExplicitly(raw,'Ответ скопирован. Проверь коммерческие данные перед отправкой.'));
      const flag=document.createElement('button');flag.type='button';flag.textContent='⚑ Отметить ошибку';
      const relatedQuestion=lastUserQuestion();
      flag.addEventListener('click',()=>showFeedback(raw,relatedQuestion));
      actions.append(copy,flag);
      if(raw.length>220){
        const all=document.createElement('button');all.type='button';all.textContent='▶ Прочитать полностью';
        all.addEventListener('click',()=>{lastDetailedResponse=raw;speak(raw);});
        actions.prepend(all);
      }
      wrap.appendChild(actions);
    }
    historyEl.appendChild(wrap);
    while (historyEl.children.length > 18) historyEl.removeChild(historyEl.firstChild);
    historyEl.scrollTop = historyEl.scrollHeight;
  }
  function speak(message,options={}) {
    if (typeof window.crmResantaVoiceSpeakV3 === 'function' && visible()) {
      if (state.silent) { state.speaking=false; resumeWake(); return; }
      state.speaking=true;
      Promise.resolve().then(()=>window.crmResantaVoiceSpeakV3(String(message),options))
        .catch(e=>console.warn('Resanta voice synthesis',e))
        .finally(()=>{state.speaking=false;resumeWake();});
      return;
    }
    if (!visible() || state.silent || !('speechSynthesis' in window) || !('SpeechSynthesisUtterance' in window)) {
      state.speaking = false; resumeWake(); return;
    }
    try {
      window.speechSynthesis.cancel();
      const utter = new SpeechSynthesisUtterance(String(message));
      utter.lang = 'ru-RU'; utter.rate = 1; utter.volume = 0.85;
      const voices = window.speechSynthesis.getVoices?.() || [];
      const voice = voices.find(v => /^ru(?:-|_)/i.test(v.lang || ''));
      if (voice) utter.voice = voice;
      state.speaking = true;
      utter.onend = utter.onerror = function () { state.speaking = false; resumeWake(); };
      window.speechSynthesis.speak(utter);
    } catch (_) { state.speaking = false; resumeWake(); }
  }
  function answer(message,options={}) {
    addLine('РЕСАНТА AI',message);
    const text=String(message||'').trim();
    if(text.length>220)lastSubstantialAnswer=text;
    // Detail-on-demand can display a full answer without forcing TTS.
    if(options?.noVoice===true){
      lastDetailedResponse=text;
      textStatus('Подробный разбор показан на экране. Можешь задать следующий вопрос.');
      return;
    }
    // The verified proactive briefing has exactly five distinct factual
    // priorities and should speak all five, not the generic 150-character teaser.
    // Other long CRM answers retain their existing concise speech behavior.
    const directorBriefVoice=typeof options?.briefingVoiceText==='string'&&
      options.briefingVoiceText.length>=80&&options.briefingVoiceText.length<=3600?
      options.briefingVoiceText.trim():'';
    const verifiedBrief=typeof options?.speechSummary==='string'&&options.speechSummary.length<=230?
      options.speechSummary.trim():'';
    const compact=options?.fullVoice===true?'':(directorBriefVoice||verifiedBrief||(text.length>225?briefVoiceText(text):''));
    if(compact && compact!==text){
      lastDetailedResponse=text;
      textStatus(directorBriefVoice?'Озвучиваю пять приоритетов директора…':'Готовлю краткий голосовой итог…');
      speak(compact,{shortSummary:!directorBriefVoice});
    }else{
      // Brief confirmations must not erase the last detailed analysis.
      if(!lastDetailedResponse && lastSubstantialAnswer)lastDetailedResponse=lastSubstantialAnswer;
      textStatus('Готовлю голосовой ответ…');
      speak(text);
    }
  }
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
    let query = normalized.replace(/(?:^|\s)привет\s+(?:ресанта|резанта|рясанта|рисанта)\s*/i, ' ').trim();
    if (!query) { answer('Привет! Слушаю тебя. Чем могу помочь?'); return; }
    if(/^(?:(?:лера|ресанта)\s+)?(?:остановись|останови\s+(?:речь|озвучку)|хватит\s+говорить|замолчи)$/.test(query)){
      window.crmResantaVoiceStopV3?.();
      textStatus('Озвучка остановлена. Можешь задать следующий вопрос.');
      return;
    }
    if(/^(?:большое\s+)?спасибо(?:\s+(?:большое|тебе|вам))?$|^благодарю(?:\s+тебя)?$|^спасибочки$/.test(query)){
      answer('Пожалуйста! Обращайся, если понадобится ещё что-нибудь.');
      return;
    }
    // The latest question «Хочешь подробнее?» belongs to the unified dialogue.
    // Handle yes/no/screen before legacy «read full answer» text patterns.
    if(typeof window.crmAI360UnifiedDialogFollowupV3==='function'){
      try{if(window.crmAI360UnifiedDialogFollowupV3(query,{answer,textStatus}))return;}
      catch(e){console.warn('AI360 followup unavailable',e);}
    }
    const asksForFullNarration=/(?:расскаж|прочита|озвуч|произнес|хочу|можешь|нужно|дай|пожалуйста).{0,105}(?:подробн|поподробн|полност|целиком|весь\s+ответ|услыш|послуш|слушать|не\s+хочу\s+читать)|^(?:подробнее|поподробнее|полностью|прочитай\s+все|вслух)$|^(?:(?:лера|ресанта)\s+)?(?:расскажи|прочитай|озвучь|зачитай|повтори)\s+(?:(?:мне|пожалуйста)\s+){0,2}(?:(?:весь|полный|предыдущий)\s+)?(?:план|ответ|разбор)(?:\s+(?:целиком|подробно|полностью))?$/.test(query);
    if(asksForFullNarration){
      if(lastDetailedResponse || lastSubstantialAnswer){
        lastDetailedResponse=lastDetailedResponse||lastSubstantialAnswer;
        addLine('РЕСАНТА AI','Озвучиваю предыдущий ответ полностью.');
        textStatus('Озвучиваю полный ответ');
        speak(lastDetailedResponse);
      }else answer('Последний ответ уже был коротким. Что ещё проверить?');
      return;
    }

    // Route all explicit task approvals to the dedicated, separately confirmed
    // module. If its optional script is missing/fails, NEVER let a command to
    // approve a task fall through to the analytics/LLM chat.
    const approvalCommand=/(?:соглас(?:ую|уем|ует|уете|овать|уй|уйте|овыва[а-я]*)|утвержда[а-я]*|утверд(?:ить|и|ите)|одобря[а-я]*|одобр(?:ить|и|ите)|согласен\s+на|согласна\s+на)/i.test(query)
      &&/(?:перв[а-я]*|втор[а-я]*|трет[а-я]*|выбранн[а-я]*|поручен[а-я]*|задач[а-я]*|[1-3])/.test(query);
    if (typeof window.crmAI360TaskDraftsHandleV1 === 'function') {
      try { if (window.crmAI360TaskDraftsHandleV1(query, {answer, textStatus})) return; }
      catch (e) { console.warn('AI360 task approval module failed', e); }
    }
    if(approvalCommand){
      answer('Не могу безопасно выполнить согласование: модуль черновиков недоступен или не распознал команду. Перезапусти Леру и сначала запроси поручения для нужного менеджера. Ничего не создано.');
      return;
    }

    // The director briefing has its own authenticated read-only data source.
    // It takes precedence over generic analytics on the explicit briefing intent.
    if (typeof window.crmAI360DirectorBriefHandleV1 === 'function') {
      try { if (window.crmAI360DirectorBriefHandleV1(query, {answer, textStatus})) return; }
      catch (e) { console.warn('AI360 director briefing unavailable',e); }
    }
    if(/(?:брифинг(?:\s+директора)?|приоритет[а-яё]*\s+(?:дня|на\s+сегодня))/i.test(query)){
      answer('Не удалось открыть защищённый брифинг директора. Перезагрузи окно Леры. Данные CRM не менялись.');
      return;
    }
    if (typeof window.crmAI360UnifiedDialogHandleV1 === 'function') {
      try { if (window.crmAI360UnifiedDialogHandleV1(query, {answer, textStatus})) return; }
      catch (e) { console.warn('AI360 unified conversation unavailable',e); }
    }
    // Optional sales/KPI dialogue. No background requests; director action only.
    if (typeof window.crmAI360SalesHandleV1 === 'function') {
      try { if (window.crmAI360SalesHandleV1(query, {answer, textStatus})) return; }
      catch (e) { console.warn('AI360 sales dialogue unavailable',e); }
    }
    const stats = snapshot();
    // Commercial questions must take precedence over generic "today / what's important" patterns.
    if (/(продаж|оборота?|отгруз|выручк|реализаци)/.test(query)) {
      const ok=openPage('sales','Продажи');
      answer(ok ? 'Открываю раздел продаж. Цифры за сегодня пока нужно смотреть в отчёте 1С: голосовой модуль ещё не подключён к достоверному расчёту оборота на дату. Я не буду подменять продажи количеством задач.' : 'Раздел продаж сейчас недоступен. Проверь меню CRM.');
      return;
    }
    if (/(что\s+(сегодня\s+)?важн|какие\s+(сегодня\s+)?проблем|проблем.*сегодня|сигнал|что\s+контрол|что\s+на\s+сегодня|что\s+за\s+утро)/.test(query)) {
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
    answer('Уточни, пожалуйста, вопрос. Могу проверить продажи, клиентов, маршруты и поручения по конкретному менеджеру.');
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
  function restartManualMic() {
    // Manual button always allows another question; release the old browser recognizer
    // before starting a replacement. Invalidate earlier delayed starts on every click.
    const sequence=++state.manualSequence;
    clearTimeout(state.manualRestart);
    state.manualRestart=0;
    if(!visible())return;
    setWake(false);
    textStatus('Перезапускаю микрофон…');
    state.manualRestart=setTimeout(()=>{
      state.manualRestart=0;
      if(sequence!==state.manualSequence||!visible())return;
      startListening('manual');
    },450);
  }
  function setWake(on) {
    state.wake=!!on; state.awaiting=false; stopRecognition();
    window.speechSynthesis?.cancel();state.speaking=false;updateButtons();
    if (state.wake) startListening('wake');
    else textStatus('Фоновая голосовая активация выключена');
  }
  function closePanel() {
    ++state.manualSequence;clearTimeout(state.manualRestart);state.manualRestart=0;
    setWake(false); window.speechSynthesis?.cancel(); state.speaking=false;
    if(root){root.hidden=true;root.classList.remove('rva-mini');}
    feedbackTarget=null;
    if(trigger)trigger.setAttribute('aria-expanded','false');
  }
  function mount() {
    if (state.mounted || !document.getElementById('app')) return;
    const top=document.querySelector('#app .topbar'); if(!top)return;
    state.mounted=true;
    const style=document.createElement('style');
    style.textContent=`
      .rva-launch{border:1px solid #185FA5;border-radius:10px;background:#EFF6FF;color:#185FA5;font-weight:750;font-size:12px;padding:7px 10px;cursor:pointer;white-space:nowrap}
      .rva-window{position:fixed;z-index:950;right:18px;top:64px;bottom:18px;width:min(510px,calc(100vw - 24px));max-height:calc(100dvh - 80px);overflow:hidden;border:1px solid #d6e0ed;border-radius:20px;background:#f6f8fc;color:#172b48;box-shadow:0 16px 52px #142c4d36;display:flex;flex-direction:column;font-family:system-ui,Arial,sans-serif}
      .rva-window[hidden],.rva-launch[hidden]{display:none!important}
      .rva-head{padding:16px 18px;display:flex;align-items:center;gap:10px;justify-content:space-between;background:linear-gradient(110deg,#102c52,#194876);color:#fff;flex-shrink:0}
      .rva-brand{display:flex;align-items:center;gap:10px;min-width:0}
      .rva-brand-mark{width:38px;height:38px;border-radius:12px;background:#fff2;color:#b6e5ff;display:grid;place-items:center;font-size:22px;flex-shrink:0}
      .rva-brand-title{font-size:16px;font-weight:790;letter-spacing:.1px}
      .rva-sub{font-size:11px;color:#b8d5ef;margin-top:3px}
      .rva-head-buttons{display:flex;align-items:center;gap:4px;flex-shrink:0}
      .rva-head-buttons button{border:0;background:transparent;color:#d7e9ff;border-radius:8px;width:31px;height:31px;font-size:18px;cursor:pointer}
      .rva-head-buttons button:hover{background:#fff2}
      .rva-status-bar{display:flex;align-items:center;gap:8px;padding:8px 16px;border-bottom:1px solid #e6edf5;background:white;height:38px;min-height:38px;max-height:38px;box-sizing:border-box;overflow:hidden;flex-shrink:0}
      .rva-status-dot{width:9px;height:9px;border-radius:50%;background:#36a887;flex-shrink:0;box-shadow:0 0 0 3px #3db89120}
      .rva-status{display:block;font-size:12px;color:#38546f;line-height:18px;flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .rva-mic-meter[hidden]{display:none!important}
      .rva-history{padding:18px 16px 22px;min-height:120px;overflow-y:auto;flex:1;max-height:none;overscroll-behavior:contain}
      .rva-line{margin:0 0 16px;padding:13px 14px;background:white;border:1px solid #e3eaf3;border-radius:14px 14px 14px 5px;box-shadow:0 3px 10px #142c4d0b;font-size:13px;line-height:1.58;overflow-wrap:anywhere;white-space:normal}
      .rva-line[data-speaker="you"]{background:#e5f1ff;border-color:#cadef8;border-radius:14px 14px 5px 14px;margin-left:30px}
      .rva-line strong{display:block;color:#2767aa;font-size:11px;margin-bottom:6px}
      .rva-line-actions{display:flex;flex-wrap:wrap;gap:5px;margin-top:11px;padding-top:9px;border-top:1px solid #eaf0f7}
      .rva-line-actions button{color:#355c85;background:#f1f6fc;border:1px solid #e0e9f4;border-radius:7px;font-size:11px;padding:6px 8px;cursor:pointer}
      .rva-line-actions button:hover{background:#e4f0fe}
      .rva-control{padding:11px 16px 14px;border-top:1px solid #dfe7f2;display:grid;gap:9px;background:white;flex-shrink:0}
      .rva-actions{display:flex;gap:6px;align-items:center;flex-wrap:wrap}
      .rva-btn{border:1px solid #c8d9ec;border-radius:10px;background:#ecf4fd;color:#174b7f;padding:9px 11px;cursor:pointer;font-size:12px;font-weight:650}
      .rva-btn:hover{background:#e0efff}.rva-btn.primary{background:#2075cb;border-color:#2075cb;color:white}
      .rva-btn[aria-pressed="true"]{background:#e1f7ef;color:#117449;border-color:#9ed8bc}
      .rva-q{display:flex;gap:7px;align-items:center}.rva-q input{flex:1;min-width:0;border:1px solid #c7d7e8;border-radius:10px;padding:12px;font-size:13px;background:#f8fbff;color:#172b48}
      .rva-q input:focus{outline:2px solid #a5cff5;outline-offset:1px}
      .rva-note{font-size:10px;line-height:1.5;color:#627f9d}
      .rva-settings{border-top:1px solid #e6edf5;padding-top:8px;font-size:12px;color:#395e82}
      .rva-settings summary{cursor:pointer;list-style:none;user-select:none;padding:3px 0}
      .rva-settings-body{display:grid;gap:7px;padding:11px 0 4px}
      .rva-feedback{position:absolute;z-index:15;left:50%;top:50%;transform:translate(-50%,-50%);width:min(440px,calc(100% - 28px));max-height:calc(100% - 45px);box-sizing:border-box;overflow-y:auto;display:grid;gap:10px;padding:18px;background:#fff;border:1px solid #ccdaea;border-radius:16px;box-shadow:0 0 0 100vmax rgba(12,30,55,.36),0 18px 45px #10274350}
      .rva-feedback[hidden]{display:none!important}
      .rva-feedback select,.rva-feedback textarea{width:100%;box-sizing:border-box;border:1px solid #bfcee0;background:#fff;color:#17314e;border-radius:8px;padding:8px;font-size:12px}
      .rva-feedback textarea{min-height:54px;resize:vertical}
      .rva-feedback small{color:#58738e;font-size:10px}
      .rva-window.rva-fullscreen{inset:14px;width:auto;max-height:calc(100dvh - 28px)}
      .rva-window.rva-mini{top:auto;bottom:18px;height:auto;max-height:110px;width:min(405px,calc(100vw - 24px))}
      .rva-window.rva-mini .rva-history,.rva-window.rva-mini .rva-control,.rva-window.rva-mini .rva-status-bar{display:none}
      @media(max-width:600px){.rva-window{left:6px;right:6px;top:7px;bottom:7px;width:auto;max-height:calc(100dvh - 14px);border-radius:14px}.rva-window.rva-fullscreen{inset:2px;max-height:calc(100dvh - 4px)}.rva-launch{padding:6px;font-size:0}.rva-launch::before{content:"🎙";font-size:18px}.rva-head{padding:11px}.rva-control{padding:10px}.rva-line{font-size:13px}}`;
    document.head.appendChild(style);
    trigger=document.createElement('button'); trigger.type='button'; trigger.className='rva-launch';
    trigger.textContent='🎙 РЕСАНТА AI';trigger.setAttribute('aria-label','Открыть голосовой помощник РЕСАНТА AI');trigger.hidden=true;trigger.setAttribute('aria-expanded','false');
    top.insertBefore(trigger,top.querySelector('.user-badge'));
    root=document.createElement('section');root.className='rva-window';root.hidden=true;root.setAttribute('role','dialog');root.setAttribute('aria-label','Голосовой помощник РЕСАНТА AI');
    root.innerHTML=`<div class="rva-head">
        <div class="rva-brand"><span class="rva-brand-mark">✦</span><div>
          <div class="rva-brand-title">РЕСАНТА AI 360°</div>
          <div class="rva-sub">Твой интеллектуальный помощник · только чтение</div>
        </div></div>
        <div class="rva-head-buttons">
          <button class="rva-mini-playback" type="button" title="Пауза или продолжить голос" aria-label="Пауза/продолжить">⏸</button>
          <button class="rva-mini-toggle" type="button" title="Свернуть в плеер" aria-label="Свернуть">−</button>
          <button class="rva-expand" type="button" title="На весь экран" aria-label="Развернуть">⛶</button>
          <button class="rva-close" type="button" aria-label="Закрыть помощника">×</button>
        </div>
      </div>
      <div class="rva-status-bar"><span class="rva-status-dot"></span><span class="rva-status" aria-live="polite">Готова к разговору</span></div>
      <div class="rva-history" role="log" aria-live="polite"></div>
      <div class="rva-control">
        <div class="rva-q"><input class="rva-input" type="text" maxlength="300" placeholder="Спроси о продажах, клиентах или задачах…" aria-label="Вопрос помощнику"><button class="rva-btn primary rva-send" type="button" aria-label="Отправить">➤</button></div>
        <div class="rva-actions"><button class="rva-btn primary rva-mic" type="button">🎤 Спросить</button><button class="rva-btn rva-wake" type="button" aria-pressed="false">◉ «Привет, Ресанта»</button></div>
        <div class="rva-actions"><button class="rva-btn rva-pause-audio" type="button" aria-pressed="false">⏸ Пауза</button><button class="rva-btn rva-stop-audio" type="button">■ Стоп</button></div>
        <div class="rva-feedback" role="dialog" aria-modal="true" aria-label="Отметить ошибку" hidden>
          <strong>Отметить ошибку в ответе</strong>
          <select class="rva-feedback-type" aria-label="Тип ошибки">
            <option value="Неверные данные">Неверные данные</option>
            <option value="Не поняла вопрос">Не поняла вопрос</option>
            <option value="Ошибка озвучки">Ошибка озвучки</option>
            <option value="Неудобный интерфейс">Неудобный интерфейс</option>
          </select>
          <textarea class="rva-feedback-comment" maxlength="500" placeholder="Что именно было не так? (необязательно)"></textarea>
          <small>Отчёт не отправляется автоматически. Если в ответе есть коммерческие данные CRM, проверь текст перед тем как поделиться им.</small>
          <div class="rva-actions"><button class="rva-btn primary rva-feedback-copy" type="button">Копировать отчёт</button><button class="rva-btn rva-feedback-close" type="button">Отмена</button></div>
        </div>
        <details class="rva-settings"><summary>⚙ Настройки голоса и расходы</summary>
          <div class="rva-settings-body">
            <button class="rva-btn rva-mute" type="button">🔊 Озвучка включена</button>
            <div class="rva-note">Микрофон работает только при открытом помощнике в активной вкладке. При переходе в ChatGPT он отключается, а текущая озвучка может продолжаться. Текст диалога не сохраняется после обновления страницы.</div>
          </div>
        </details>
      </div>`;
    document.body.appendChild(root);
    historyEl=root.querySelector('.rva-history');statusEl=root.querySelector('.rva-status');field=root.querySelector('.rva-input');
    wakeBtn=root.querySelector('.rva-wake');micBtn=root.querySelector('.rva-mic');muteBtn=root.querySelector('.rva-mute');
    trigger.addEventListener('click',()=>{
      if(!allowed())return;
      if(root.classList.contains('rva-mini')){root.classList.remove('rva-mini');return;}
      root.hidden=!root.hidden;trigger.setAttribute('aria-expanded',String(!root.hidden));
      if(root.hidden)closePanel();
      else if(!historyEl.children.length)answer('Привет! Я РЕСАНТА AI 360°. Могу проверить продажи, клиентов, долги и маршруты.');
    });
    root.querySelector('.rva-close').addEventListener('click',closePanel);
    const mini=root.querySelector('.rva-mini-toggle');
    mini.addEventListener('click',()=>{
      const shrunk=root.classList.toggle('rva-mini');
      if(shrunk){
        root.classList.remove('rva-fullscreen');
        window.crmResantaVoiceSuspendV2?.();
        textStatus('Мини-плеер · микрофон приостановлен, озвучка продолжается.');
      }
      mini.textContent=shrunk?'▢':'−';
      mini.title=shrunk?'Развернуть панель':'Свернуть в мини-плеер';
    });
    const expand=root.querySelector('.rva-expand');
    expand.addEventListener('click',()=>{
      root.classList.remove('rva-mini');mini.textContent='−';
      const isFull=root.classList.toggle('rva-fullscreen');
      expand.title=isFull?'Вернуть боковую панель':'На весь экран';
      expand.setAttribute('aria-pressed',String(isFull));
    });
    root.addEventListener('keydown',e=>{
      if(e.key==='Escape'){
        const modal=root.querySelector('.rva-feedback');
        if(modal&&!modal.hidden){e.preventDefault();modal.hidden=true;feedbackTarget=null;}
      }
    });
    root.querySelector('.rva-feedback-close')?.addEventListener('click',()=>{
      const card=root.querySelector('.rva-feedback');
      if(card)card.hidden=true;
      feedbackTarget=null;
    });
    root.querySelector('.rva-feedback-copy')?.addEventListener('click',()=>{
      if(!feedbackTarget){textStatus('Выбери ответ Леры для замечания.');return;}
      const type=root.querySelector('.rva-feedback-type')?.value||'Другая ошибка';
      const note=(root.querySelector('.rva-feedback-comment')?.value||'').trim().slice(0,500);
      const report='РЕСАНТА AI 360° · замечание для проверки\n'
        +'Время (местное): '+new Date().toLocaleString('ru-RU')+'\n'
        +'Тип: '+type+'\n'
        +'Вопрос: '+feedbackTarget.question+'\n'
        +'Ответ: '+feedbackTarget.response+'\n'
        +'Комментарий: '+(note||'нет')+'\n'
        +'Версия: голосовой модуль 134, защищённый директорский режим\n'
        +'Отчёт скопирован вручную пользователем; данные никуда автоматически не отправлены.';
      void copyExplicitly(report,'Отчёт скопирован. Проверь коммерческие данные перед отправкой в ChatGPT.');
    });
    micBtn.addEventListener('click',restartManualMic);
    wakeBtn.addEventListener('click',()=>{
      if(state.wake){setWake(false);return;}
      if(!Recognition){textStatus('Этот браузер не поддерживает распознавание речи.');return;}
      if(!window.confirm('Включить голосовую активацию в открытой CRM? Браузер может отправлять речь своему сервису распознавания. Микрофон можно выключить в любой момент.'))return;
      setWake(true);
    });
    muteBtn.addEventListener('click',()=>{state.silent=!state.silent;if(state.silent){window.speechSynthesis?.cancel();state.speaking=false;resumeWake();}updateButtons();});
    root.querySelector('.rva-stop-audio')?.addEventListener('click',()=>{
      window.crmResantaVoiceStopV3?.();
      textStatus('Озвучка остановлена. Можно задать следующий вопрос.');
    });
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
    if(!ok){++state.manualSequence;clearTimeout(state.manualRestart);state.manualRestart=0;if(state.active)stopRecognition();}
  }
  document.addEventListener('visibilitychange',()=>{
    if(document.hidden) {++state.manualSequence;clearTimeout(state.manualRestart);setWake(false);window.speechSynthesis?.cancel();state.speaking=false;}
  });
  window.addEventListener('pagehide',()=>{++state.manualSequence;clearTimeout(state.manualRestart);setWake(false);window.speechSynthesis?.cancel();});
  // Opt in to local recognition only if this browser actually has a Russian pack.
  if (Recognition && typeof Recognition.available === 'function') {
    try {
      Promise.resolve(Recognition.available({langs:['ru-RU'],processLocally:true}))
        .then(status=>{state.localReady=status==='available';}).catch(()=>{});
    } catch (_) { /* Browsers may restrict on-device probing through permissions policy. */ }
  }
  reconcile();state.timer=window.setInterval(reconcile,1600);
})();