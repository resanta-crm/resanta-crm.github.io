from pathlib import Path
import json
from datetime import datetime, timezone

# Root cache/version.
root = Path('assets/66-performance-root-v23657.js')
text = root.read_text(encoding='utf-8')
old = "const V='23.6.104',flights=new Map(),contractFlights=new Map();"
new = "const V='23.6.105',flights=new Map(),contractFlights=new Map();"
if old not in text:
    raise SystemExit('Expected performance root v23.6.104 marker not found')
root.write_text(text.replace(old, new, 1), encoding='utf-8')

# Main HTML cache bust.
index = Path('index.html')
text = index.read_text(encoding='utf-8')
old_app = "const APP_VERSION = '2026-09-11-resanta-crm-v23.6.104';"
new_app = "const APP_VERSION = '2026-09-11-resanta-crm-v23.6.105';"
old_root = './assets/66-performance-root-v23657.js?v=23.6.104'
new_root = './assets/66-performance-root-v23657.js?v=23.6.105'
if old_app not in text or old_root not in text:
    raise SystemExit('Expected index v23.6.104 markers not found')
text = text.replace(old_app, new_app, 1).replace(old_root, new_root, 1)
index.write_text(text, encoding='utf-8')

# Public version marker used by the automatic frontend reload guard.
av = Path('data/app-version.json')
data = json.loads(av.read_text(encoding='utf-8'))
data['version'] = '23.6.105'
data['released_at'] = '2026-09-11'
data['purpose'] = 'Promotion closed-row filter, sales scope truth and explicit over-budget approval'
data['deploy_trigger'] = datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace('+00:00','Z')
av.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

# One-shot publisher cleans itself and its workflow.
for path in [Path('.github/workflows/publish-promotions-v236105.yml'), Path('publish_promotions_v236105.py')]:
    if path.exists():
        path.unlink()
