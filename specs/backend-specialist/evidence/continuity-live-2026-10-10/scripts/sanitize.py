import json,sys,re
src,dst,prefix=sys.argv[1],sys.argv[2],sys.argv[3]
def clean(s):
  s=s.replace(prefix,"<host>")
  s=re.sub(r"backend-label","backend-label",s,flags=re.I)
  return s
def walk(o):
  if isinstance(o,dict): return {k:walk(v) for k,v in o.items()}
  if isinstance(o,list): return [walk(v) for v in o]
  if isinstance(o,str):
    o=clean(o)
    return o if len(o)<=3000 else o[:3000]+f"…[truncated {len(o)-3000} chars]"
  return o
txt=open(src).read()
try:
  out=json.dumps(walk(json.loads(txt)),indent=1,ensure_ascii=False)
except Exception:
  try:
    out="\n".join(json.dumps(walk(json.loads(l)),ensure_ascii=False) for l in txt.splitlines() if l.strip())+"\n"
  except Exception:
    out=clean(txt)
open(dst,"w").write(out)
