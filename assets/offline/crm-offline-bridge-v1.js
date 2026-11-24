'use strict';

(() => {
  const store = window.crmOfflineStore;
  const production = 'https://resanta-crm.by';
  const director = '544fb1e2-ef70-44de-bc62-e0e1596a4bfc';
  if (location.origin !== production || !store) return;
  const app = document.getElementById('app');
  const name = document.getElementById('user-name');
  const reportNames = new Map([
    ['dashboard','Центр управления'],['sales','Продажи'],['managers','Менеджеры · KPI'],
    ['abc','ABC-анализ'],['vip','ВИП клиенты'],['falling','Падающие клиенты'],
    ['workday','Рабочий день'],['triovist','Триовист / 21vek'],['promotions','Акции'],
    ['markdown','Уценка'],['stands','Стенды'],
  ]);
  let actor;
  let controls;

  function owner() {
    const id = currentUser?.id;
    return getComputedStyle(app).display !== 'none' && !document.documentElement.classList.contains('native-app') &&
      id === director && currentProfile?.id === id && currentProfile.role === 'boss' &&
      currentProfile.access_scope === 'standard' && store.identity() === id ? id : null;
  }
  async function verify(id) {
    const {data,error} = await db.auth.getUser();
    if (error || data.user?.id !== id || owner() !== id) throw Error('Сессия CRM не подтверждена.');
  }
  const selected = value => String(value ?? '').trim();
  const same = (a,b) => selected(a).toLowerCase() === selected(b).toLowerCase();
  const limitText = (value,limit) => selected(value).slice(0,limit);

  async function capture(id) {
    await verify(id);
    if (!navigator.serviceWorker) throw Error('На этом устройстве офлайн-открытие недоступно.');
    if (!window.crmCoreGetV22733) throw Error('Дождитесь загрузки CRM.');
    const [tasks,visits,routes] = await Promise.all(['tasks','visits','routes'].map(key => window.crmCoreGetV22733(key,true)));
    if (owner() !== id) throw Error('Учётная запись изменилась.');
    if (![tasks,routes,visits,allClients].every(Array.isArray)) throw Error('Данные CRM ещё не загружены.');
    const me = currentProfile.name;
    const active = new Set(canonicalActiveTasks(tasks).map(row => row.id));
    const data = {
      owner:id,savedAt:Date.now(),
      routes:routes.filter(row => !row.removed && !['pending','rejected'].includes(row.review_status))
        .map(row => ({
          id:String(row.id),clientId:row.client_id,name:limitText(row.client_name,240),date:row.visit_date,
          address:limitText(row.address,220),visited:!!(row.visited || row.linked_visit_id),own:same(row.manager_name,me),
        })).sort((a,b) => String(b.date).localeCompare(String(a.date))),
      tasks:tasks.map(row => ({
        id:String(row.id),clientId:row.client_id,dueDate:row.due_date,done:row.done===true,reviewStatus:row.review_status,
        active:active.has(row.id),title:limitText(row.title || row.text || 'Задача',420),
      })),
      visits:visits.filter(row => !row.is_duplicate).map(row => ({
        date:row.date,clientId:row.client_id,result:limitText(row.result,150),
      })),
      clients:allClients.map(row => ({
        id:String(row.id),name:limitText(row.name,240),address:limitText([row.city,row.address].filter(Boolean).join(', '),280),
      })),
    };
    await store.writeSnapshot(data);
    const registration = await navigator.serviceWorker.register('./assets/offline/sw.js',{scope:'./assets/offline/'});
    const installed = registration.installing || registration.waiting;
    if (installed && installed.state !== 'activated') {
      await new Promise((resolve,reject) => {
        const timer = setTimeout(() => reject(Error('Подготовка офлайн-экрана заняла слишком много времени.')),15000);
        installed.addEventListener('statechange',() => {
          if (installed.state === 'activated') {clearTimeout(timer);resolve();}
          if (installed.state === 'redundant') {clearTimeout(timer);reject(Error('Не удалось подготовить офлайн-экран.'));}
        });
      });
    }
    if (!(await navigator.serviceWorker.getRegistration('./assets/offline/'))?.active) throw Error('Не удалось подготовить офлайн-экран.');
  }

  async function sync() {
    await store.synchronize(owner());
    await status();
  }
  async function status() {
    const id = owner();
    if (!id || !controls) return;
    const queue = await store.queue(id);
    if (!owner()) return;
    const pending = queue.filter(row => row.state === 'pending').length;
    const conflicts = queue.filter(row => row.state === 'conflict').length;
    controls.open.textContent = ['Офлайн',pending ? 'В очереди '+pending : '',conflicts ? 'На проверке '+conflicts : ''].filter(Boolean).join(' · ');
  }

  async function saveView(id) {
    const key = app.dataset.activePage;
    const title = reportNames.get(key);
    const page = document.getElementById('page-'+key);
    if (!title || !page?.classList.contains('active')) throw Error('Откройте нужный отчёт.');
    const text = page.innerText?.trim() || '';
    if (!text) throw Error('Дождитесь загрузки отчёта.');
    if (text.length > 80000) throw Error('Отчёт слишком большой. Уточните фильтры.');
    await store.saveReport(id,{key,title,text,savedAt:Date.now()});
  }

  function mount() {
    const id = owner();
    if (!id) {
      if (actor) store.removeSnapshot(actor).catch(() => {});
      actor = null;
      if (controls) controls.panel.hidden = true;
      return;
    }
    if (actor === id && controls) {
      controls.save.hidden = !reportNames.has(app.dataset.activePage);
      return;
    }
    actor = id;
    if (!controls) {
      const panel = document.createElement('span');
      panel.style.cssText = 'display:inline-flex;gap:5px;flex-wrap:wrap';
      const prepare = document.createElement('button');
      prepare.type = 'button';
      prepare.className = 'btn-secondary';
      prepare.textContent = 'Подготовить офлайн';
      const open = document.createElement('a');
      open.className = 'btn-secondary';
      open.href = './assets/offline/';
      open.textContent = 'Офлайн';
      const message = document.createElement('span');
      message.setAttribute('role','status');
      const save = document.createElement('button');
      save.type = 'button';
      save.className = 'btn-secondary';
      save.textContent = 'Сохранить экран офлайн';
      save.addEventListener('click',async () => {
        try {await saveView(owner()); message.textContent = 'Копия экрана сохранена.';}
        catch (error) {message.textContent = error.message || 'Не удалось сохранить экран.';}
      });
      prepare.addEventListener('click',async () => {
        const user = owner();
        if (!user) return;
        prepare.disabled = true;
        message.textContent = 'Сохраняем данные…';
        try {await capture(user);message.textContent = 'Данные готовы для работы без сети.';await sync();}
        catch (error) {message.textContent = error.message || 'Не удалось подготовить данные.';}
        finally {prepare.disabled = false;}
      });
      panel.append(prepare,open,save,message);
      name?.after(panel);
      controls = {panel,open,save};
    }
    controls.panel.hidden = false;
    controls.save.hidden = !reportNames.has(app.dataset.activePage);
    status().catch(() => {});
    sync().catch(() => {});
  }
  new MutationObserver(mount).observe(app,{attributes:true,attributeFilter:['style','data-active-page']});
  new MutationObserver(mount).observe(document.documentElement,{attributes:true,attributeFilter:['class']});
  window.addEventListener('online',()=>sync().catch(() => {}));
  window.addEventListener('focus',()=>{mount();sync().catch(() => {});});
  db.auth.onAuthStateChange(event => setTimeout(() => {
    if (event === 'SIGNED_OUT' && actor) {
      store.removeSnapshot(actor).catch(() => {});
      if (controls) controls.panel.hidden = true;
      actor = null;
    }
  },0));
  mount();
})();
