(function (w) {
 'use strict';
 const sessions = new WeakMap();
 const fields = ['p_from', 'p_to', 'p_previous_from', 'p_previous_to'];
 const money = new Intl.NumberFormat('ru-RU', {minimumFractionDigits:2, maximumFractionDigits:2});
 const integerDate = value => Date.parse(value + 'T00:00:00Z');
 const isoDate = value => new Date(value).toISOString().slice(0, 10);
 const monthStart = (year, month) => isoDate(Date.UTC(year, month, 1));
 const monthEnd = (year, month) => isoDate(Date.UTC(year, month + 1, 0));
 const dateLabel = value => value.split('-').reverse().join('.');
 const rangeLabel = (from, to) => dateLabel(from) + ' — ' + dateLabel(to);
 const amount = value => value == null ? '—' : money.format(value) + ' BYN';
 const esc = value => String(value ?? '').replace(/[&<>"']/g, c =>
  ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[c]));

 function yearEarlier(date) {
  const [year, month, day] = date.split('-').map(Number);
  const lastDay = new Date(Date.UTC(year - 1, month, 0)).getUTCDate();
  return isoDate(Date.UTC(year - 1, month - 1, Math.min(day, lastDay)));
 }

 function comparePeriods(one, two) {
  if (!one.complete || !two.complete) return null;
  if (one.full_months && two.full_months && one.months === two.months) {
   return one.total - two.total;
  }
  const oneDuration = integerDate(one.to_date) - integerDate(one.from_date);
  const twoDuration = integerDate(two.to_date) - integerDate(two.from_date);
  return oneDuration === twoDuration ? one.total - two.total : null;
 }

 function renderResult(data) {
  const [one, two] = data.periods;
  const delta = comparePeriods(one, two);
  const signed = value => (value > 0 ? '+' : '') + amount(value);
  const pct = delta !== null && two.total > 0
   ? new Intl.NumberFormat('ru-RU', {style:'percent', maximumFractionDigits:1, signDisplay:'exceptZero'}).format(delta / two.total)
   : '';
  const cards = data.periods.map(period => {
   const missing = period.missing || [];
   const gaps = missing.slice(0, 3).map(slice => esc(rangeLabel(slice.from, slice.to))).join(', ');
   const hint = period.complete ? '' : '<p class="s360-muted">Нет полного среза 1С' +
    (gaps ? ' за ' + gaps : '') + (missing.length > 3 ? ' и ещё ' + (missing.length - 3) : '') + '.</p>';
   return '<div class="s360-compare-card"><div>Период ' + esc(period.pos) + ' · ' +
    esc(rangeLabel(period.from_date, period.to_date)) + '</div><strong>' +
    esc(period.complete ? amount(period.total) : '—') + '</strong>' + hint +
    (data.include_triovist ? '<p class="s360-muted">Полевые продажи · ' + esc(amount(period.field)) +
     '<br>Триовист · ' + esc(amount(period.triovist)) + '</p>' : '') + '</div>';
  });
  const status = delta === null
   ? (one.complete && two.complete ? 'Выберите периоды одинаковой длительности или одинаковое число полных месяцев.' :
      'Для сравнения нужны данные 1С за оба периода.')
   : 'Разница · период 1 к периоду 2';
  const scope = data.include_triovist ? 'Весь филиал · полевые продажи и Триовист' :
   'Полевые продажи' + (data.manager ? ' · ' + data.manager : '');
  const timestamp = data.source_message_at ? new Intl.DateTimeFormat('ru-RU', {
   dateStyle:'short', timeStyle:'short', timeZone:'Europe/Minsk'
  }).format(new Date(data.source_message_at)) : '';
  return '<p class="s360-muted">' + esc(scope) + (timestamp ? ' · последний срез полевых продаж 1С · ' + esc(timestamp) : '') +
   '</p><div class="s360-compare-grid">' + cards.join('') +
   '<div class="s360-compare-card"><div>Сравнение продаж</div><strong>' +
   esc(delta === null ? '—' : signed(delta)) + (pct ? ' · ' + esc(pct) : '') +
   '</strong><p class="s360-muted">' + esc(status) + '</p></div></div>';
 }

 function mount(host, {actor, manager, db}) {
  const previous = sessions.get(host);
  if (previous?.actor === actor && previous.manager === manager) return;
  const session = {actor, manager, request:0, last:previous?.actor === actor ? previous.last : null};
  sessions.set(host, session);
  const input = (key, label) => '<label>' + label + '<input type="date" name="' + key +
   '" min="2023-01-01" required></label>';
  host.innerHTML = '<form aria-label="Сравнение продаж по датам">' +
   '<div class="s360-compare-filters"><fieldset><legend>Период 1</legend>' +
   input(fields[0], 'С') + input(fields[1], 'По') + '</fieldset><fieldset><legend>Период 2</legend>' +
   input(fields[2], 'С') + input(fields[3], 'По') + '</fieldset></div>' +
   '<div class="s360-filters"><div class="s360-field"><label for="s360-branch-preset">Быстрый выбор периода 2</label>' +
   '<select id="s360-branch-preset"><option value="">Свои даты</option>' +
   '<option value="year">Те же даты год назад</option><option value="year-month">Полный месяц год назад</option>' +
   '<option value="previous-month">Предыдущий месяц</option></select></div>' +
   '<button type="submit" class="s360-btn primary">Сравнить периоды</button>' +
   '<button type="button" class="s360-btn" data-closed-month>Последний закрытый месяц</button></div></form>' +
   '<div class="s360-muted" role="status"></div><div data-branch-results></div>';
  const form = host.querySelector('form');
  const dates = fields.map(key => form.querySelector('[name="' + key + '"]'));
  const preset = form.querySelector('select');
  const status = host.querySelector('[role="status"]');
  const result = host.querySelector('[data-branch-results]');
  const closed = host.querySelector('[data-closed-month]');
  const submit = form.querySelector('[type="submit"]');
  const selection = () => Object.fromEntries(fields.map((key, i) => [key, dates[i].value]));
  let today;

  function updateDates(one, two) {
   [one.from_date, one.to_date, two.from_date, two.to_date].forEach((value, i) => { dates[i].value = value; });
  }

  async function load(period) {
   const request = ++session.request;
   status.textContent = 'Загружаю продажи из 1С…';
   submit.disabled = true;
   try {
    const {data, error} = await db.rpc('crm_branch_sales_periods_v1', {p_manager:manager, ...period});
    if (error) throw error;
    if (!Array.isArray(data?.periods) || data.periods.length !== 2) throw new Error('Invalid branch sales result');
    if (sessions.get(host) !== session || request !== session.request) return;
    today = data.today;
    dates.forEach(date => { date.max = today; });
    closed.disabled = false;
    if (!period || !dates[0].value) updateDates(...data.periods);
    session.last = period;
    result.innerHTML = renderResult(data);
    status.textContent = '';
   } catch (error) {
    if (sessions.get(host) !== session || request !== session.request) return;
    result.innerHTML = '';
    status.innerHTML = error?.code === '22023'
     ? 'Проверьте даты. Каждый период должен быть короче трёх лет и заканчиваться не позднее сегодня.'
     : 'Не удалось загрузить продажи. <button type="button" class="s360-btn">Повторить</button>';
    status.querySelector('button')?.addEventListener('click', () => void load(period));
   } finally {
    if (sessions.get(host) === session && request === session.request) submit.disabled = false;
   }
  }

  form.addEventListener('submit', e => {
   e.preventDefault();
   const [fromOne, toOne, fromTwo, toTwo] = dates.map(date => date.value);
   if (fromOne > toOne || fromTwo > toTwo) {
    status.textContent = 'Дата начала должна быть не позднее даты окончания.';
    return;
   }
   void load(selection());
  });
  form.addEventListener('input', e => { if (dates.includes(e.target)) preset.value = ''; });
  preset.addEventListener('change', () => {
   const [from, to] = dates.map(date => date.value);
   if (!from || !to || !preset.value) return;
   const [year, month] = from.split('-').map(Number);
   if (preset.value === 'year') {
    dates[2].value = yearEarlier(from);
    dates[3].value = yearEarlier(to);
   } else {
    const y = preset.value === 'year-month' ? year - 1 : year;
    const m = preset.value === 'year-month' ? month - 1 : month - 2;
    dates[2].value = monthStart(y, m);
    dates[3].value = monthEnd(y, m);
   }
  });
  closed.disabled = true;
  closed.addEventListener('click', () => {
   if (!today) return;
   const [year, month] = today.split('-').map(Number);
   const m = month - 2;
   updateDates({from_date:monthStart(year, m), to_date:monthEnd(year, m)},
    {from_date:monthStart(year - 1, m), to_date:monthEnd(year - 1, m)});
   preset.value = 'year-month';
   void load(selection());
  });
  void load(session.last);
 }

 w.RESANTA_BRANCH_SALES_PERIODS_V1 = {mount};
})(window);
