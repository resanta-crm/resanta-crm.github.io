from pathlib import Path
p=Path('assets/74-markdown-v23687.js')
s=p.read_text(encoding='utf-8')
a='oninput="crmMarkdownPriceSyncV236114(\'discount\')"'
b='oninput="crmMarkdownPriceSyncV236114(&quot;discount&quot;)"'
c='oninput="crmMarkdownPriceSyncV236114(\'final\')"'
d='oninput="crmMarkdownPriceSyncV236114(&quot;final&quot;)"'
if a not in s or c not in s:
    raise SystemExit('price sync handlers not found')
s=s.replace(a,b,1).replace(c,d,1)
p.write_text(s,encoding='utf-8')
