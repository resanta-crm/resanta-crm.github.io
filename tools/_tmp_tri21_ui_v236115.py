from pathlib import Path
import json

# 21vek control panel: permanent Excel button + clear freshness/error wording.
p=Path('assets/80-triovist-21vek-control-v236107.js')
s=p.read_text(encoding='utf-8')
s=s.replace('/* RESANTA CRM v23.6.110 · TRIOVIST OWN 21VEK CONTROL CENTER', '/* RESANTA CRM v23.6.115 · TRIOVIST OWN 21VEK CONTROL CENTER', 1)
s=s.replace("const VERSION='v23.6.110',TTL=30000;", "const VERSION='v23.6.115',TTL=15000;", 1)
s=s.replace(
"function n(v){return Number(v||0).toLocaleString('ru-RU');}\nfunction activeTriovist(){return document.getElementById('page-triovist')?.classList.contains('active');}",
"""function n(v){return Number(v||0).toLocaleString('ru-RU');}\nfunction ageText(v){\n  if(!v)return'время не определено';\n  const ms=Date.now()-new Date(v).getTime();if(!Number.isFinite(ms))return'время не определено';\n  const m=Math.max(0,Math.floor(ms/60000));\n  if(m<1)return'только что';if(m<60)return m+' мин назад';\n  const h=Math.floor(m/60);if(h<24)return h+' ч '+(m%60)+' мин назад';\n  return Math.floor(h/24)+' дн назад';\n}\nfunction parserError(d){\n  const p=d?.parser||{};\n  if(String(p.status||'')!=='failed'&&Number(p.errors||0)<=0)return'';\n  return String(p.error_explain||p.error_text||'Сбор завершился не полностью. Рабочий снимок не заменён; используются последние проверенные данные.');\n}\nfunction activeTriovist(){return document.getElementById('page-triovist')?.classList.contains('active');}""", 1)
s=s.replace(
".tri21ctl-note{font-size:10px;color:var(--sub);margin-top:6px;max-width:740px}.tri21ctl-error{font-size:12px;color:var(--r);font-weight:700;padding:10px;background:var(--rb);border:1px solid #FECACA;border-radius:8px}",
".tri21ctl-note{font-size:10px;color:var(--sub);margin-top:6px;max-width:900px}.tri21ctl-fresh{margin-top:10px;padding:9px 11px;border-radius:9px;font-size:11px;line-height:1.45}.tri21ctl-fresh.ok{background:#F0FDF4;border:1px solid #BBF7D0;color:#166534}.tri21ctl-fresh.warn{background:#FFFBEB;border:1px solid #FDE68A;color:#92400E}.tri21ctl-error{font-size:12px;color:var(--r);font-weight:700;padding:10px;background:var(--rb);border:1px solid #FECACA;border-radius:8px}", 1)
s=s.replace(
"  const reqActive=rq&&['queued','claimed'].includes(String(rq.status));\n  const can=!!d?.can_refresh;\n  const btnText=rq?.status==='claimed'?'⏳ Сбор выполняется':rq?.status==='queued'?'⏱ В очереди':'↻ Запустить обновление 21vek';",
"""  const reqActive=rq&&['queued','claimed'].includes(String(rq.status));\n  const can=!!d?.can_refresh;\n  const btnText=rq?.status==='claimed'?'⏳ Сбор выполняется':rq?.status==='queued'?'⏱ В очереди':'↻ Запустить обновление 21vek';\n  const workingAt=w.completed_at||t.finished_at||g.finished_at||null;\n  const ageH=workingAt?Math.max(0,(Date.now()-new Date(workingAt).getTime())/3600000):999;\n  const freshClass=ageH<=24?'ok':'warn';\n  const freshIcon=ageH<=24?'✅':'⚠️';\n  const errText=parserError(d);""", 1)
s=s.replace(
"    ${warningHtml(d)}\n    <div class=\"tri21ctl-grid\">",
"""    ${warningHtml(d)}\n    <div class=\"tri21ctl-fresh ${freshClass}\">${freshIcon} <b>${workingAt?'Данные CRM обновлены '+dt(workingAt):'Время обновления рабочего снимка не определено'}</b>${workingAt?' · '+ageText(workingAt):''}. Карточки: ${n(g.success||w.cards)}/${n(w.cards)}; TOP: ${t.finished_at?'проверен '+dt(t.finished_at):'нет подтверждённого полного запуска'}.</div>\n    ${errText?`<div class=\"tri21ctl-alert red\">❗ <strong>Что произошло:</strong> ${esc(errText)}<br><span style=\"font-weight:500\">Рабочие данные не заменяются неполным запуском — CRM оставляет последний полностью проверенный снимок.</span></div>`:''}\n    <div class=\"tri21ctl-grid\">""", 1)
s=s.replace("<div class=\"tri21ctl-kpi\"><span>Ошибки последнего запуска</span><b>${n(errors)}</b></div>", "<div class=\"tri21ctl-kpi\"><span>Ошибки текущего/последнего запуска</span><b>${n(errors)}</b></div>", 1)
s=s.replace(
"      <button class=\"btn-secondary\" type=\"button\" onclick=\"triovist21vekRefreshStatusV236107()\">↻ Статус</button>",
"""      <button id=\"tri21-export-xlsx-v236109\" class=\"btn-secondary\" type=\"button\" onclick=\"window.triovist21vekExportExcelV236109?window.triovist21vekExportExcelV236109():alert('Модуль Excel ещё загружается. Повторите через несколько секунд.')\">📥 Выгрузить Excel</button>\n      <button class=\"btn-secondary\" type=\"button\" onclick=\"triovist21vekRefreshStatusV236107()\">↻ Проверить свежесть</button>""", 1)
s=s.replace(
"    ${can?'<div class=\"tri21ctl-note\">Ручной запрос обычно подхватывается сервером в течение 10–20 минут; при задержке GitHub запуск может начаться позже. Рабочий снимок меняется только после полного успешного сбора карточек и TOP; при ошибке остаётся последний хороший снимок.</div>':'<div class=\"tri21ctl-note\">Менеджеру ничего запускать вручную не нужно. Контролируйте цвет статуса: зелёный — работаем; оранжевый/красный — сообщить руководителю со скриншотом.</div>'}`;",
"""    ${can?'<div class=\"tri21ctl-note\"><b>Как читать блок:</b> «Проверить свежесть» только перечитывает статус и время данных. «Запустить обновление 21vek» запускает новый полный сбор. «Выгрузить Excel» скачивает именно текущий рабочий проверенный снимок. При ошибке новый неполный сбор не подменяет рабочие данные.</div>':'<div class=\"tri21ctl-note\"><b>Как читать блок:</b> зелёный — данные рабочие; время выше показывает, когда CRM получила последний проверенный снимок. «Выгрузить Excel» скачивает доступные вам текущие рабочие карточки. При красном/оранжевом статусе CRM сохраняет последний хороший снимок.</div>'}`;""", 1)
if "📥 Выгрузить Excel" not in s or "Данные CRM обновлены" not in s or "v23.6.115" not in s:
    raise SystemExit('control patch incomplete')
p.write_text(s,encoding='utf-8')

# Keep export module version aligned. The button itself now lives in the stable control render,
# so a status re-render can no longer remove it.
p=Path('assets/81-triovist-21vek-export-v236109.js')
s=p.read_text(encoding='utf-8')
s=s.replace('/* RESANTA CRM v23.6.110 · TRIOVIST 21VEK EXCEL EXPORT', '/* RESANTA CRM v23.6.115 · TRIOVIST 21VEK EXCEL EXPORT', 1)
s=s.replace("const VERSION='v23.6.110';", "const VERSION='v23.6.115';", 1)
p.write_text(s,encoding='utf-8')

# Bump module-loader cache key so everybody with Triovist access receives the fresh files.
p=Path('assets/66-performance-root-v23657.js')
s=p.read_text(encoding='utf-8')
s=s.replace("const V='23.6.114',flights=new Map(),contractFlights=new Map();", "const V='23.6.115',flights=new Map(),contractFlights=new Map();", 1)
if "const V='23.6.115'" not in s: raise SystemExit('root version patch failed')
p.write_text(s,encoding='utf-8')

# Browser-level version + loader query.
p=Path('index.html')
s=p.read_text(encoding='utf-8')
s=s.replace("const APP_VERSION = '2026-09-14-resanta-crm-v23.6.114';", "const APP_VERSION = '2026-09-14-resanta-crm-v23.6.115';", 1)
s=s.replace('./assets/66-performance-root-v23657.js?v=23.6.114', './assets/66-performance-root-v23657.js?v=23.6.115', 1)
if 'resanta-crm-v23.6.115' not in s: raise SystemExit('index version patch failed')
p.write_text(s,encoding='utf-8')

# Public version marker used by automatic frontend version check.
p=Path('data/app-version.json')
d=json.loads(p.read_text(encoding='utf-8'))
d['version']='23.6.115'
d['released_at']='2026-09-14'
d['purpose']='Triovist 21vek: постоянная Excel-выгрузка, понятная свежесть данных и расшифровка ошибок'
d['deploy_trigger']='2026-09-14T10:05:00Z'
p.write_text(json.dumps(d,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
