import re, sys, pathlib
EASE = {"", "ease", "ease-out", "ease-in-out", "cubic-bezier(.2, .8, .2, 1)"}
def dur(v):
    s = float(v[:-2]) / 1000 if v.endswith("ms") else float(v[:-1])
    return "var(--orchestra-duration-fast)" if s <= 0.14 else "var(--orchestra-duration-base)" if s <= 0.25 else None
def part(p):
    p = p.strip()
    m = re.match(r"^([a-z-]+(?:\s+[a-z-]+)?)\s+(\d*\.?\d+m?s)\s*(.*?)(\s+both)?$", p)
    if not m: return None
    name, d, ease, both = m.group(1), m.group(2), m.group(3).strip(), m.group(4) or ""
    if "infinite" in p or ease not in EASE: return None
    nd = dur(d)
    if not nd: return None
    return f"{name} {nd} var(--orchestra-ease-out){both}"
changed = 0
for f in sys.argv[1:]:
    path = pathlib.Path(f); src = path.read_text()
    def rep(m):
        global changed
        prop, body = m.group(1), m.group(2)
        parts = [x for x in re.split(r",(?![^(]*\))", body)]
        new = [part(x) for x in parts]
        if any(n is None for n in new): return m.group(0)
        changed += 1
        if "\n" in body:
            ind = re.match(r"\n(\s*)", body).group(1)
            return f"{prop}:\n" + ",\n".join(ind + n for n in new) + ";"
        return f"{prop}: " + ", ".join(new) + ";"
    out = re.sub(r"(?<![-\w])(transition|animation):[ \t]*([^;{}]+);", rep, src)
    if out != src: path.write_text(out)
print(changed)
