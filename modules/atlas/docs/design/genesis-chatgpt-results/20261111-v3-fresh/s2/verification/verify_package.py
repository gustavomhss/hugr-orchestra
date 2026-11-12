import base64
import collections
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent
OUT = ROOT / 'deliverable'
UNITS = ['desktop-web', 'app-session', 'design-tui']

def digest(b):
    return hashlib.sha256(b).hexdigest()

def read_json(p):
    return json.loads(p.read_text())

def records(s):
    if 'sources' in s:
        return s['sources'] + s.get('captured_not_directly_inspected', [])
    return s.get('records', s.get('captures', []))

def original_objects(x):
    if isinstance(x, dict):
        if isinstance(x.get('content'), str):
            yield x
        for v in x.values():
            yield from original_objects(v)
    elif isinstance(x, list):
        for v in x:
            yield from original_objects(v)

reports = []
all_paths = []
all_depths = collections.Counter()
for unit in UNITS:
    p = ROOT / 'producers' / unit
    c = read_json(p / 'coverage.json')
    s = read_json(p / 'sources.json')
    expected = read_json(OUT / 'inputs' / f'{unit}-tree.json')
    wanted = {v['path']: v for v in expected}
    entries = c['entries']
    assert len({v['path'] for v in entries}) == len(entries) == len(wanted)
    assert set(wanted) == {v['path'] for v in entries}
    for e in entries:
        for k in ['path', 'mode', 'type', 'sha', 'size']:
            assert e.get(k) == wanted[e['path']].get(k), (unit, e['path'], k)
    rs = records(s)
    by_path = {v['path']: v for v in rs}
    source_bytes = 0
    original_verified = 0
    for r in rs:
        b = (p / r['local_capture_file']).read_bytes()
        sha = hashlib.sha1(b'blob ' + str(len(b)).encode() + b'\0' + b).hexdigest()
        assert sha == r['git_blob_sha'], (unit, r['path'], 'git sha')
        assert digest(b) == r['sha256'], (unit, r['path'], 'sha256')
        assert len(b) == r['byte_length'], (unit, r['path'], 'bytes')
        if r['path'] in wanted:
            assert sha == wanted[r['path']]['sha']
        original = read_json(p / r['connector_response_file'])
        matched = False
        for obj in original_objects(original):
            if obj.get('sha') is not None and obj.get('sha') != sha:
                continue
            raw = obj['content']
            ob = base64.b64decode(raw) if obj.get('encoding') == 'base64' else raw.encode('utf-8')
            if ob == b:
                matched = True
                break
        assert matched, (unit, r['path'], 'original connector bytes')
        original_verified += 1
        source_bytes += len(b)
    for f in c['families']:
        assert f.get('id')
        for path in f.get('representative_source_paths', []):
            assert path in by_path, (unit, f['id'], path, 'uncaptured representative')
    depths = collections.Counter(e.get('evidence_depth', e.get('evidence-depth')) for e in entries)
    assert None not in depths
    all_depths.update(depths)
    all_paths.extend(wanted)
    hashes = {}
    for f in ['l1.md', 'coverage.json', 'sources.json', 'decisive-evidence.md', 'response.md']:
        fp = p / f
        if fp.exists():
            b = fp.read_bytes()
            b.decode('utf-8')
            hashes[f] = {'sha256': digest(b), 'byte_length': len(b)}
    report = {
        'unit': unit,
        'source_revision': '1cde2ff7a71bcf7aecb5d030917b577165135d38',
        'verification_actor': '/root',
        'method': 'Independent deterministic reconciliation against frozen input trees; hash exact source bytes and compare to original GitHub connector bodies. No product tests, semantic judgments or runtime acceptance.',
        'paths': len(wanted), 'families': len(c['families']), 'depth_counts': dict(depths),
        'source_captures': len(rs), 'source_bytes': source_bytes,
        'original_connector_bodies_verified': original_verified,
        'artifact_hashes': hashes,
        'result': 'PASS_MECHANICAL_ONLY'
    }
    reports.append(report)
assert len(all_paths) == len(set(all_paths)) == 4506
path_hash = digest(('\n'.join(sorted(all_paths)) + '\n').encode())
assert path_hash == '8b70f96dcbb623bdd1cc2a48b61d51d255d9d9ce90836efc9a5cd05f1fc5a582'
result = {'schema': 'genesis-s2-principal-verification/v1', 'population': len(all_paths), 'paths_sha256': path_hash,
          'families': sum(r['families'] for r in reports), 'depth_counts': dict(all_depths), 'units': reports}
(OUT / 'evidence' / 'l1-principal-verification.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
print(json.dumps({k:v for k,v in result.items() if k != 'units'}, indent=2))
for r in reports:
    print(r['unit'], r['paths'], r['source_captures'], r['source_bytes'], sorted(r['artifact_hashes']))
