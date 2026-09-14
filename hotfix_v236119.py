from pathlib import Path
import json, re

root = Path('assets/66-performance-root-v23657.js')
s = root.read_text(encoding='utf-8')
s, n = re.subn(
    r"const V='23\.6\.\d+',flights=new Map\(\),contractFlights=new Map\(\);",
    "const V=(()=>{try{return new URL(document.currentScript?.src||'',location.href).searchParams.get('v')||'23.6.119'}catch(_){return'23.6.119'}})().replace(/^v/,''),flights=new Map(),contractFlights=new Map();",
    s,
    count=1,
)
if n != 1:
    raise SystemExit(f'root version contract patch failed: {n}')

old = """    if(remote&&remote!==V){
      frontendReloading=true;
      const b=document.getElementById('crm-update-banner');
      if(b){b.textContent='CRM обновлена. Загружаем новую версию…';b.classList.add('show')}
      setTimeout(()=>location.reload(),250);
      return true;
    }
"""
new = """    if(remote&&remote!==V){
      const reloadKey='crm_frontend_reload_target_v236119';
      let attempted='';
      try{attempted=sessionStorage.getItem(reloadKey)||''}catch(_){}
      if(attempted===remote){
        console.warn('CRM version mismatch persisted after one reload:',{loaded:V,remote});
        const b=document.getElementById('crm-update-banner');
        if(b)b.classList.remove('show');
        return false;
      }
      try{sessionStorage.setItem(reloadKey,remote)}catch(_){}
      frontendReloading=true;
      const b=document.getElementById('crm-update-banner');
      if(b){b.textContent='CRM обновлена. Загружаем новую версию…';b.classList.add('show')}
      setTimeout(()=>location.reload(),250);
      return true;
    }
    try{sessionStorage.removeItem('crm_frontend_reload_target_v236119')}catch(_){}
"""
if old not in s:
    raise SystemExit('reload guard patch target not found')
s = s.replace(old, new, 1)
root.write_text(s, encoding='utf-8')

idx = Path('index.html')
h = idx.read_text(encoding='utf-8')
h, n1 = re.subn(r"const APP_VERSION = '2026-09-14-resanta-crm-v23\.6\.\d+';", "const APP_VERSION = '2026-09-14-resanta-crm-v23.6.119';", h, count=1)
h, n2 = re.subn(r"(assets/66-performance-root-v23657\.js\?v=)23\.6\.\d+", r"\g<1>23.6.119", h, count=1)
if n1 != 1 or n2 != 1:
    raise SystemExit(f'index patch failed: APP={n1}, root={n2}')
idx.write_text(h, encoding='utf-8')

vp = Path('data/app-version.json')
data = json.loads(vp.read_text(encoding='utf-8'))
data.update({
    'version': '23.6.119',
    'released_at': '2026-09-14',
    'purpose': 'Hotfix: устранён бесконечный цикл перезагрузки CRM; версия root теперь берётся из cache-buster URL',
    'deploy_trigger': '2026-09-14T11:22:00Z',
})
vp.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

for p in [Path('.github/workflows/_tmp-hotfix-v236119.yml'), Path('hotfix_v236119.py'), Path('.github/workflows/_tmp-hotfix-reload-loop-v236119.yml')]:
    if p.exists():
        p.unlink()
