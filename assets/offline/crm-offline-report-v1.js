'use strict';

(() => {
  const htmlTags = new Set('div section article header footer h1 h2 h3 h4 h5 p span strong b em i small label ul ol li dl dt dd table caption thead tbody tfoot tr th td details summary br hr figure figcaption meter progress'.split(' '));
  const svgTags = new Set('svg g text tspan line polyline polygon path rect circle ellipse title desc'.split(' '));
  const layoutNames = new Set(['card','grid','row','weak','stat','track']);
  const svgNamespace = 'http://www.w3.org/2000/svg';
  const numericAttributes = ['x','y','x1','x2','y1','y2','cx','cy','r','rx','ry','width','height','stroke-width','opacity','dx','dy','fill-opacity','stroke-opacity','font-size'];
  const chartAttributes = new Map(numericAttributes.map(name => [name,/^-?(?:\d+(?:\.\d+)?|\.\d+)%?$/]));
  chartAttributes.set('viewBox',/^[-.\d ,]+$/);
  chartAttributes.set('points',/^[-.\d ,]+$/);
  chartAttributes.set('d',/^[mMlLhHvVcCsSqQtTaAzZ0-9eE., +\-]+$/);
  chartAttributes.set('fill',/^(?:#[\da-f]{3,8}|[a-z]{1,24}|rgb\([\d,. %]+\))$/i);
  chartAttributes.set('stroke',chartAttributes.get('fill'));
  chartAttributes.set('text-anchor',/^(start|middle|end)$/);
  chartAttributes.set('stroke-linecap',/^(butt|round|square)$/);
  const keepCard = /(?:^|\s)[\w-]*(?:stat|card|metric|bar-row)(?:\s|$)/i;
  const limits = {elements:2500,characters:60000,depth:36,chartAttr:8000};

  function kind(element, css) {
    const classes = element.getAttribute('class') || '';
    if (/\b(?:cc-stat|\w+-kpi-card|\w+-stat-card)\b/.test(classes)) return 'stat';
    if (/\b(?:cc-metrics|cc-columns|cc-route-metrics|\w*-?kpi-grid|\w*-?card-grid)\b/.test(classes)) return 'grid';
    if (/\b(?:cc-track|cc-meter|\w+-progress-track)\b/.test(classes)) return 'track';
    if (/\b(?:cc-bar-row|cc-issue|cc-legend|cc-panel-head|cc-between)\b/.test(classes)) return 'row';
    if (/\b(?:cc-panel|card|\w+-panel|\w+-card)\b/.test(classes) || ['article','section'].includes(element.localName)) return 'card';
    if (/\b(?:cc-muted|muted|\w+-muted|\w+-sub)\b/.test(classes)) return 'weak';
    if (css?.display === 'grid' && element.children.length > 1) return 'grid';
    return '';
  }

  function capture(root) {
    const budget = {...limits};
    function walk(element, depth, inChart = false) {
      if (depth > limits.depth || budget.elements-- <= 0 || budget.characters <= 0) return null;
      if (element.nodeType === 3) {
        const value = (element.nodeValue || '').slice(0,budget.characters);
        budget.characters -= value.length;
        return value || null;
      }
      if (element.nodeType !== 1 || element.hidden || element.getAttribute('aria-hidden') === 'true') return null;
      let tag = element.localName;
      const chart = inChart || tag === 'svg';
      if (/^(script|style|template|iframe|object|embed|canvas|img|audio|video|input|textarea|option)$/.test(tag)) return null;
      if (chart && !svgTags.has(tag)) return null;
      const css = !chart ? window.getComputedStyle(element) : null;
      if (css?.display === 'none' || css?.visibility === 'hidden') return null;
      if (tag === 'select') return element.selectedOptions?.[0]?.textContent?.trim().slice(0,160) || null;
      if (tag === 'button' && !keepCard.test(element.className)) return null;
      if (!chart && !htmlTags.has(tag)) tag = ['a','button'].includes(tag) && css?.display === 'inline' ? 'span' : 'div';
      const out = {tag};
      if (chart) {
        const attrs = {};
        for (const [name, pattern] of chartAttributes) {
          const value = element.getAttribute(name);
          if (value && value.length <= limits.chartAttr && pattern.test(value)) attrs[name] = value;
        }
        if (tag === 'svg') {
          const label = element.getAttribute('aria-label');
          if (label) attrs['aria-label'] = label.slice(0,220);
        }
        if (Object.keys(attrs).length) out.attrs = attrs;
      } else {
        const role = kind(element, css);
        if (role) out.kind = role;
        const width = element.style?.width;
        if (width && element.parentElement && kind(element.parentElement)==='track' && /^\d+(?:\.\d+)?%$/.test(width)) out.width = Math.min(100,parseFloat(width));
        if (tag === 'details' && element.open) out.open = true;
        if (tag === 'th' || tag === 'td') {
          const span = Number(element.getAttribute('colspan'));
          if (span > 1 && span <= 30) out.span = span;
        }
        if (tag === 'meter' || tag === 'progress') {
          const value = Number(element.value), max = Number(element.max);
          if (max > 0 && Number.isFinite(value)) out.width = Math.max(0,Math.min(100,value/max*100));
        }
      }
      const children = tag === 'details' && !out.open
        ? [...element.children].filter(child => child.localName === 'summary')
        : element.childNodes;
      const nodes = [];
      for (const child of children) {
        if (budget.elements <= 0 || budget.characters <= 0) break;
        const item = walk(child,depth+1,chart);
        if (item !== null) nodes.push(item);
      }
      if (nodes.length) out.children = nodes;
      return out;
    }
    const nodes = [];
    for (const child of root.childNodes) {
      if (budget.elements <= 0 || budget.characters <= 0) break;
      const item = walk(child,0);
      if (item !== null) nodes.push(item);
    }
    return nodes;
  }

  function render(nodes, document) {
    const fragment = document.createDocumentFragment();
    const budget = {...limits};
    function append(parent, item, depth, inChart = false) {
      if (depth > limits.depth || budget.elements-- <= 0 || budget.characters <= 0) return;
      if (typeof item === 'string') {
        const text = item.slice(0,budget.characters);
        budget.characters -= text.length;
        parent.append(document.createTextNode(text));
        return;
      }
      const tag = item?.tag;
      const chart = inChart || tag === 'svg';
      if (!(chart ? svgTags : htmlTags).has(tag)) return;
      const el = chart ? document.createElementNS(svgNamespace,tag) : document.createElement(tag);
      if (chart) {
        for (const [name, pattern] of chartAttributes) {
          const value = item.attrs?.[name];
          if (typeof value === 'string' && value.length <= limits.chartAttr && pattern.test(value)) el.setAttribute(name,value);
        }
        if (tag === 'svg') {
          el.setAttribute('role','img');
          const label = item.attrs?.['aria-label'];
          if (typeof label === 'string') el.setAttribute('aria-label',label.slice(0,220));
        }
      } else {
        if (layoutNames.has(item.kind)) el.className = 'offline-report-' + item.kind;
        if (tag === 'details' && item.open === true) el.open = true;
        if ((tag === 'th' || tag === 'td') && Number.isInteger(item.span) && item.span > 1 && item.span <= 30) el.colSpan = item.span;
        if (Number.isFinite(item.width)) {
          const percent = Math.min(100,Math.max(0,item.width));
          if (tag === 'meter' || tag === 'progress') { el.max = 100; el.value = percent; }
          else { el.style.width = percent + '%'; el.classList.add('offline-report-meter-fill'); }
        }
      }
      if (Array.isArray(item.children)) {
        for (const child of item.children) {
          if (budget.elements <= 0 || budget.characters <= 0) break;
          append(el,child,depth+1,chart);
        }
      }
      if (tag === 'table') {
        const scroll = document.createElement('div');
        scroll.className = 'offline-report-table';
        scroll.append(el);
        parent.append(scroll);
      } else parent.append(el);
    }
    for (const item of Array.isArray(nodes) ? nodes : []) {
      if (budget.elements <= 0 || budget.characters <= 0) break;
      append(fragment,item,0);
    }
    return fragment;
  }
  window.crmOfflineReport = Object.freeze({capture, render});
})();
