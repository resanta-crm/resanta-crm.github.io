from pathlib import Path
import json

# Cache/version sync for the safe Triovist groups fixes.
idx = Path('index.html')
s = idx.read_text(encoding='utf-8')
s = s.replace('23.6.120', '23.6.121')
idx.write_text(s, encoding='utf-8')

for fn in ['assets/66-performance-root-v23657.js','assets/34-triovist-root-v23614.js']:
    p=Path(fn)
    if p.exists():
        t=p.read_text(encoding='utf-8').replace('23.6.120','23.6.121').replace('v23.6.120','v23.6.121')
        p.write_text(t,encoding='utf-8')

app=Path('data/app-version.json')
d=json.loads(app.read_text(encoding='utf-8'))
d.update({
  'version':'23.6.121',
  'released_at':'2026-09-15',
  'purpose':'Triovist Группы и динамика: сохранять фильтры при обновлении + Excel + доступ менеджеров',
  'deploy_trigger':'2026-09-15T09:20:00Z'
})
app.write_text(json.dumps(d,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')

# one-shot cleanup
Path('.github/workflows/_tmp-publish-group-dynamics-v236121.yml').unlink(missing_ok=True)
Path('publish_group_dynamics_v236121.py').unlink(missing_ok=True)
