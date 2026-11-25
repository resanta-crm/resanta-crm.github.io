'use strict';

(() => {
  const results = new Map([
    ['sent_to_1c', 'Заказ передан в 1С'],
    ['refused', 'Отказ'],
    ['follow_up', 'Следующий контакт'],
  ]);
  const node = (tag, text) => {
    const el = document.createElement(tag);
    if (text != null) el.textContent = text;
    return el;
  };
  const labelled = (text, input) => {
    const label = node('label');
    label.append(document.createTextNode(text), input);
    return label;
  };
  const requiresDecision = result => /(?:^|\s)(Заказ|Переговоры|Работа с ЛПР|Звонок)$/u.test(result || '');

  function create(items, visitDate) {
    const element = node('section');
    element.className = 'visit-sku-panel';
    element.append(node('h4', 'Итог по артикулам'), node('p', 'Факт отгрузки обновляется из 1С.'));
    const rows = items.map(item => {
      const row = node('div');
      row.className = 'visit-sku-row';
      row.append(node('strong', [item.sku, item.product].filter(Boolean).join(' · ')));
      const facts = node('div');
      const result = node('select');
      for (const [value, label] of [['', 'Выберите итог'], ...results]) {
        const option = node('option', label);
        option.value = value;
        result.append(option);
      }
      const reason = node('input');
      reason.maxLength = 500;
      const date = node('input');
      date.type = 'date';
      date.min = visitDate;
      const comment = node('input');
      comment.maxLength = 500;
      const reasonField = labelled('Причина отказа', reason);
      const dateField = labelled('Дата следующего контакта', date);
      const commentField = labelled('Комментарий по желанию', comment);
      function toggle() {
        reasonField.hidden = result.value !== 'refused';
        dateField.hidden = result.value !== 'follow_up';
        commentField.hidden = !result.value;
      }
      result.addEventListener('change', toggle);
      toggle();
      row.append(facts, labelled('Итог по артикулу ' + item.sku, result), reasonField, dateField, commentField);
      element.append(row);
      return {item, facts, result, reason, date, comment};
    });
    function updateFacts(progress = []) {
      for (const {item, facts} of rows) {
        const actual = progress.find(entry => entry.sku === item.sku)?.actual;
        facts.textContent = 'План ' + item.qty + ' шт. · Факт 1С ' + (actual == null ? '—' : actual + ' шт.');
      }
    }
    function validate(visitResult) {
      if (!requiresDecision(visitResult) && !rows.some(row => row.result.value)) return '';
      for (const {item, result, reason, date} of rows) {
        if (!results.has(result.value)) return 'Выберите итог по артикулу ' + item.sku + '.';
        if (result.value === 'refused' && !reason.value.trim()) return 'Укажите причину отказа по артикулу ' + item.sku + '.';
        if (result.value === 'follow_up' && (!date.value || date.value < visitDate)) {
          return 'Укажите дату следующего контакта по артикулу ' + item.sku + ' не раньше даты визита.';
        }
      }
      return '';
    }
    function values() {
      return rows.filter(row => results.has(row.result.value)).map(({item, result, reason, date, comment}) => ({
        sku: item.sku,
        result: result.value,
        reason: result.value === 'refused' ? reason.value.trim() : null,
        next_date: result.value === 'follow_up' ? date.value : null,
        comment: comment.value.trim() || null,
      }));
    }
    updateFacts();
    return {element, updateFacts, validate, values};
  }

  window.crmVisitSkuFields = Object.freeze({create, label: value => results.get(value) || ''});
})();
