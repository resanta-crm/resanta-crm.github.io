from pathlib import Path
import json

repls = {
    'index.html': [
        ("2026-09-15-resanta-crm-v23.6.121", "2026-09-15-resanta-crm-v23.6.122"),
        ("assets/66-performance-root-v23657.js?v=23.6.121", "assets/66-performance-root-v23657.js?v=23.6.122"),
    ],
    'assets/66-performance-root-v23657.js': [
        ("'23.6.121'", "'23.6.122'"),
    ],
    'assets/34-triovist-root-v23614.js': [
        ("v23.6.121", "v23.6.122"),
    ],
}
for fn, pairs in repls.items():
    p=Path(fn); s=p.read_text(encoding='utf-8')
    for a,b in pairs:
        if a not in s:
            raise SystemExit(f'missing marker in {fn}: {a}')
        s=s.replace(a,b)
    p.write_text(s,encoding='utf-8')

Path('data/app-version.json').write_text(json.dumps({
    'version':'23.6.122',
    'released_at':'2026-09-15',
    'purpose':'Triovist Группы и динамика: обновление применяет выбранные фильтры + быстрый Excel',
    'deploy_trigger':'2026-09-15T09:35:00Z'
},ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
