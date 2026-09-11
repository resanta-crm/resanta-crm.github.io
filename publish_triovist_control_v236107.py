#!/usr/bin/env python3
from pathlib import Path
import json

root=Path('.')
perf=root/'assets/66-performance-root-v23657.js'
idx=root/'index.html'
ver=root/'data/app-version.json'

s=perf.read_text(encoding='utf-8')
if "const V='23.6.106'" not in s and "const V='23.6.107'" not in s:
    raise SystemExit('Unexpected performance root version')
s=s.replace("const V='23.6.106'","const V='23.6.107'",1)
needle="    load('assets/78-triovist-hide-recommendations-v23699.js','perf-tri-hide-recs-v23699','RESANTA_TRIOVIST_RECOMMENDATIONS_HIDDEN_V23699')\n"
addition="    load('assets/78-triovist-hide-recommendations-v23699.js','perf-tri-hide-recs-v23699','RESANTA_TRIOVIST_RECOMMENDATIONS_HIDDEN_V23699'),\n    load('assets/80-triovist-21vek-control-v236107.js','perf-tri-21vek-control-v236107','RESANTA_TRIOVIST_21VEK_CONTROL_V236107')\n"
if '80-triovist-21vek-control-v236107.js' not in s:
    if needle not in s:
        raise SystemExit('Triovist contract anchor not found')
    s=s.replace(needle,addition,1)
perf.write_text(s,encoding='utf-8')

h=idx.read_text(encoding='utf-8')
h=h.replace("const APP_VERSION = '2026-09-11-resanta-crm-v23.6.106';","const APP_VERSION = '2026-09-11-resanta-crm-v23.6.107';",1)
h=h.replace('./assets/66-performance-root-v23657.js?v=23.6.106','./assets/66-performance-root-v23657.js?v=23.6.107',1)
idx.write_text(h,encoding='utf-8')

obj=json.loads(ver.read_text(encoding='utf-8'))
obj.update({
    'version':'23.6.107',
    'released_at':'2026-09-11',
    'purpose':'Triovist own 21vek parser control center, status and safe manual refresh queue',
    'deploy_trigger':'2026-09-11T12:05:00Z'
})
ver.write_text(json.dumps(obj,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')

# One-shot publisher cleans itself and its workflow after patching.
for p in [root/'publish_triovist_control_v236107.py',root/'.github/workflows/publish-triovist-control-v236107.yml']:
    try:p.unlink()
    except FileNotFoundError:pass

print('Prepared frontend v23.6.107')
