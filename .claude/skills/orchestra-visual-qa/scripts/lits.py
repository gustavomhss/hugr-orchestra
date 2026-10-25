import re,sys
lit=re.compile(r'#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)')
for p in sys.argv[1:]:
    s=re.sub(r'/\*.*?\*/',lambda m:re.sub(r'[^\n]',' ',m.group(0)),open(p).read(),flags=re.S)
    for m in re.finditer(r'(?<![\w-])(-?-?[\w-]+)\s*:\s*([^;{}]*)',s):
        if m.group(1).startswith('--') or not lit.search(m.group(2)): continue
        if 'url(' in m.group(2) and not lit.search(re.sub(r'url\([^)]*\)','',m.group(2))): continue
        line=s.count('\n',0,m.start())+1
        print(f"{p}:{line}: {m.group(1)}: {' '.join(m.group(2).split())[:110]}")
