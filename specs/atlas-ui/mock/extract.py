# Extracts the real Atlas-on-Atlas store into a JS data file for the design preview.
import json, os, re, subprocess, sys, glob, collections
REPO = os.path.expanduser('~/Documents/HuGR/atlas')
OUT = sys.argv[1]
A = os.path.join(REPO, '.atlas')
def git(*args):
    return subprocess.run(['git', '-C', REPO, *args], capture_output=True, text=True).stdout
proj = json.load(open(os.path.join(A, 'projection.json')))
stag = json.load(open(os.path.join(A, 'staging.json')))
cas = lambda h: json.load(open(os.path.join(A, 'cas', h[:2], h)))
staged = {k: r for k, r in stag['current']}
head = git('rev-parse', 'HEAD').strip()
facts, reasoning = [], {}
def entry(k, r, promoted):
    obj = cas(r['contentHash'])
    ans = staged.get(k, {}).get('answerRef')
    if ans:
        reasoning[ans[:12]] = cas(ans)
    f = r['primaryAnchor']
    item = {
        'key': k, 'hash': r['contentHash'], 'claim': r['claims'][0], 'file': f,
        'family': r['family'], 'tier': r['tier'], 'scope': r['scope'], 'derivedAt': r['derivedAt'][:8],
        'subtree': obj['grounding']['entries'][0]['anchor']['subtreeHash'][:16],
        'obvious': (obj.get('obviousness') or {}).get('rank'), 'promoted': promoted,
        'why': ans[:12] if ans else None,
        # The CAS fact's own fields (knowledge/src/types.ts GroundedFact): kind, authoring, stored freshness, grounding.
        'kind': obj.get('kind'), 'authoring': obj.get('authoring'), 'storedFreshness': obj.get('freshness'),
        'obviousBy': (obj.get('obviousness') or {}).get('by'),
        'anchor': {k2: obj['grounding']['entries'][0]['anchor'][k2] for k2 in ('kind', 'qualifiedPath')},
        'slot': r.get('slot'), 'seal': r.get('seal'), 'supersededBy': r.get('supersededBy'), 'sameAs': r.get('sameAs'),
        'provenance': r.get('provenanceByClaim'),
    }
    old = git('rev-parse', f"{r['derivedAt']}:{f}").strip()
    new = git('rev-parse', f'HEAD:{f}').strip()
    if old and new and old != new:
        diff = git('diff', '-U2', r['derivedAt'], 'HEAD', '--', f).splitlines()
        hunks, cur = [], None
        for line in diff:
            if line.startswith('@@'):
                if len(hunks) == 2: break
                cur = {'at': line.split('@@')[1].strip(), 'lines': []}; hunks.append(cur)
            elif cur is not None and not line.startswith(('---', '+++', '\\')) and len(cur['lines']) < 18:
                cur['lines'].append(line[:160])
        stat = git('diff', '--shortstat', r['derivedAt'], 'HEAD', '--', f).strip()
        log = git('log', '--format=%h%x09%s', f"{r['derivedAt']}..HEAD", '--', f).splitlines()[:3]
        item['drift'] = {'hunks': hunks, 'stat': stat, 'commits': [l.split('\t', 1) for l in log]}
    return item
for k, r in proj['current']:
    facts.append(entry(k, r, True))
promoted = {k for k, _ in proj['current']}
candidates = [entry(k, r, False) for k, r in stag['current'] if k not in promoted]
# Dependents from import statements (stand-in for the SCIP dependency axis).
src = [p for p in git('ls-files', 'packages').splitlines() if p.endswith('.ts') and '/src/' in p]
pkgindex = {p.split('/')[1]: p for p in src if p.endswith('/src/index.ts')}
deps = collections.defaultdict(set)
imp = re.compile(r"""from\s+['"]([^'"]+)['"]""")
for p in src:
    try: text = open(os.path.join(REPO, p)).read()
    except Exception: continue
    for m in imp.findall(text):
        if m.startswith('@atlas/'):
            t = pkgindex.get(m.split('/')[1])
        elif m.startswith('.'):
            base = os.path.normpath(os.path.join(os.path.dirname(p), m)).replace('.js', '')
            t = next((c for c in (base + '.ts', base + '/index.ts') if c in src), None)
        else:
            t = None
        if t and t != p: deps[t].add(p)
data = {
    'project': 'atlas', 'head': head[:8], 'builtAt': proj['builtAt'][:8], 'gen': proj['gen'], 'stagingGen': stag['gen'],
    'identity': proj['identity'], 'casObjects': len(glob.glob(os.path.join(A, 'cas', '*', '*'))),
    'policy': json.load(open(os.path.join(A, 'policy.json')))['authz']['scopes'],
    't0Keywords': json.load(open(os.path.join(A, 'policy.json')))['t0Heuristic']['keywords'],
    'scip': os.path.exists(os.path.join(A, 'index.scip')),
    # adapter-io/src/store-provenance.ts: which durable store files git tracks decides what reads may serve.
    'tracked': (lambda t: {'projection': any(re.match(r'\.atlas/projection(\.\d+)?\.json$', x) for x in t), 'cas': sum(1 for x in t if x.startswith('.atlas/cas/')),
                           'staging': any(re.match(r'\.atlas/staging(\.\d+)?\.json$', x) for x in t), 'policy': '.atlas/policy.json' in t, 'memory': '.atlas/memory.jsonl' in t})(git('ls-files', '.atlas').splitlines()),
    'sealed': sum(1 for _, n in proj['current'] if n.get('seal') == 'proven'),
    # doctor cas (adapter-io/src/doctor-source.ts:366-383): referenced = the projection's cas list only.
    'casAudit': (lambda present, ref: {'objects': len(present), 'referenced': len(ref), 'missing': len(ref - present), 'orphan': len(present - ref)})(
        {os.path.basename(x) for x in glob.glob(os.path.join(A, 'cas', '*', '*'))}, set(proj['cas'])),
    'generations': sorted(os.path.basename(x) for x in glob.glob(os.path.join(A, '*.json')) if re.match(r'(projection|staging)(\.\d+)?\.json$', os.path.basename(x))),
    'abstained': len(proj.get('abstained') or []),
    # doctor index (adapter-io/src/scip.ts:203-223): tracked files per extension, ts and py have a pinned indexer.
    'langs': collections.Counter(os.path.splitext(x)[1].lstrip('.') for x in git('ls-files').splitlines() if os.path.splitext(x)[1] in ('.ts', '.tsx', '.js', '.mjs', '.py', '.rs', '.go', '.sh')),
    'facts': facts, 'candidates': candidates, 'reasoning': reasoning,
    'dependents': {k: sorted(v) for k, v in deps.items()}, 'dependentCount': {k: len(v) for k, v in deps.items()},
}
with open(OUT, 'w') as f:
    f.write('// Generated from the real Atlas-on-Atlas store (~/Documents/HuGR/atlas/.atlas) by extract.py.\n')
    f.write('// Drift is the real git diff since each fact was derived; dependents come from import statements.\n')
    f.write('window.Atlas = window.Atlas || {}\nwindow.Atlas.real = ')
    json.dump(data, f, ensure_ascii=False, separators=(',', ':'))
    f.write('\n')
print('facts', len(facts), 'drifted', sum(1 for x in facts if 'drift' in x), 'candidates', len(candidates), 'reasoning', len(reasoning), 'deps', len(deps), 'bytes', os.path.getsize(OUT))
