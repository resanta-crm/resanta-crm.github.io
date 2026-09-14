from pathlib import Path

src=Path('tools/_tmp_accelerate_21vek_v07.py').read_text(encoding='utf-8')
code=src.split('# ---------- workflow tuning ----------',1)[0]
exec(compile(code,'tools/_tmp_accelerate_21vek_v07.py','exec'))
