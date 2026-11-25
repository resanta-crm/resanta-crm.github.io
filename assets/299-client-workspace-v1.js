(function (root, doc) {
  'use strict';
  const app = doc.getElementById('app');
  const sidebar = app?.querySelector('.layout > .sidebar');
  if (!sidebar) return;
  const groups = [
    { label: 'Разделы клиентов', sections: [
      ['clients', 'Клиенты'],
      ['lpr-birthdays', 'ЛПР и дни рождения'],
      ['networks', 'Сети'],
    ] },
    { label: 'Разделы рабочего дня', sections: [
      ['connect', 'Чаты'],
      ['meeting-planner', 'Календарь и совещания'],
      ['tasks', 'Задачи'],
      ['visits', 'Визиты'],
      ['gps-control', 'GPS-контроль'],
      ['routes-boss', 'Маршруты'],
      ['my-routes', 'Мой маршрут'],
      ['route', 'Маршрут дня'],
    ] },
  ];
  const owners = new Map(groups.flatMap(group => group.sections.map(([id]) => [id, group])));
  let scheduled = false;

  function permitted(id) {
    const button = doc.getElementById('nav-' + id);
    if (!button || !sidebar.contains(button) || button.disabled || button.hidden ||
        button.getAttribute('aria-hidden') === 'true' || button.getAttribute('aria-disabled') === 'true') return null;
    const style = root.getComputedStyle(button);
    return style.display !== 'none' && style.visibility === 'visible' ? button : null;
  }

  function render() {
    scheduled = false;
    const active = app.dataset.activePage;
    const group = owners.get(active);
    if (!group) return;
    const page = doc.getElementById('page-' + active);
    if (!page) return;
    let nav = page.querySelector(':scope > .crm-workspace-tabs');
    const tabs = group.sections.filter(([id]) => permitted(id));
    if (tabs.length < 2 || !tabs.some(([id]) => id === active)) {
      nav?.remove();
      return;
    }
    const key = tabs.map(([id]) => id).join('|');
    if (nav?.dataset.sections === key) return;
    if (!nav) {
      nav = doc.createElement('nav');
      nav.className = 'crm-workspace-tabs';
      nav.setAttribute('aria-label', group.label);
      page.prepend(nav);
    }
    nav.dataset.sections = key;
    nav.replaceChildren(...tabs.map(([id, title]) => {
      const button = doc.createElement('button');
      button.type = 'button';
      button.textContent = title;
      if (id === active) button.setAttribute('aria-current', 'page');
      else button.addEventListener('click', () => permitted(id)?.click());
      return button;
    }));
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    root.requestAnimationFrame(render);
  }

  const observer = new MutationObserver(schedule);
  observer.observe(app, {attributes:true, attributeFilter:['data-active-page']});
  observer.observe(sidebar, {
    subtree:true, childList:true, attributes:true,
    attributeFilter:['style','hidden','disabled','aria-hidden','aria-disabled','class'],
  });
  render();
})(window, document);
