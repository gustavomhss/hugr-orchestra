import json, os, re, sys, fnmatch, collections
ROOT = sys.argv[1]
APP = os.path.join(ROOT, "removed-v1")
arch = json.load(open(os.path.join(ROOT, "script/module-architecture.json")))
doms = arch["packages"]["orchestra"]["domains"]
def owner(rel):  # rel like src/x/y.ts
    best = None
    for name, d in doms.items():
        for p in d["patterns"]:
            if p.endswith("/"):
                if rel.startswith(p): cand = (1, len(p), name)
                else: continue
            elif "*" in p:
                if fnmatch.fnmatch(rel, p) and "/" not in rel[len(p.split("*")[0]):]: cand = (2, len(p), name)
                else: continue
            else:
                if rel == p: cand = (3, len(p), name)
                else: continue
            if best is None or cand[:2] > best[:2]: best = cand
    return best[2] if best else None
IMP = re.compile(r"""(?:import|export)\s+(type\s+)?(?:([\w*{}\s,$]+?)\s+from\s+)?["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)""", re.S)
def resolve(src_file, spec):
    base = None
    if spec.startswith("@/"): base = os.path.join(APP, "src", spec[2:])
    elif spec.startswith("@test/"): base = os.path.join(APP, "test", spec[6:])
    elif spec.startswith("."): base = os.path.normpath(os.path.join(os.path.dirname(src_file), spec))
    else: return None
    for c in [base, base + ".ts", base + ".tsx", os.path.join(base, "index.ts")]:
        if os.path.isfile(c): return os.path.relpath(c, APP)
    if base.endswith(".js"):
        b = base[:-3]
        for c in [b + ".ts", b + ".tsx"]:
            if os.path.isfile(c): return os.path.relpath(c, APP)
    return "UNRESOLVED:" + spec
def scan(rel):
    p = os.path.join(APP, rel)
    txt = open(p, encoding="utf-8", errors="replace").read()
    out = []
    for m in IMP.finditer(txt):
        spec = m.group(3) or m.group(4)
        names = (m.group(2) or "").strip()
        names = re.sub(r"\s+", " ", names)
        tonly = bool(m.group(1))
        out.append((spec, names, tonly, m.group(4) is not None))
    return out
files = []
for dp, dn, fn in os.walk(os.path.join(APP, "src")):
    for f in fn:
        if f.endswith((".ts", ".tsx")):
            files.append(os.path.relpath(os.path.join(dp, f), APP))
TEST = re.compile(r"\.(test|spec|fixture)\.[jt]sx?$")
res = []
for rel in sorted(files):
    od = owner(rel)
    for spec, names, tonly, dyn in scan(rel):
        tgt = resolve(os.path.join(APP, rel), spec)
        td = owner(tgt) if tgt and not tgt.startswith("UNRESOLVED") and tgt.startswith("src/") else None
        res.append(dict(file=rel, fdom=od, test=bool(TEST.search(rel)), spec=spec, names=names, typeOnly=tonly, dynamic=dyn, target=tgt, tdom=td))
json.dump(res, open(sys.argv[2], "w"), indent=0)
print(len(files), len(res))
