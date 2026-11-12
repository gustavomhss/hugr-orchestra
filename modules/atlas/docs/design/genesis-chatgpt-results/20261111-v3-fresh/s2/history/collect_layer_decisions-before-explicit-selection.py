import hashlib
import json
import sys
from pathlib import Path

root = Path(__file__).resolve().parent
out = root / 'deliverable'
layer = int(sys.argv[1])
files = sys.argv[2:]
assert files
package = json.loads((out / 'native-package.json').read_text())
expected = {a['key']: a for a in package['artifacts'] if a['layer'] == layer}
required = {k for k in package['required_artifact_keys'] if k.startswith(f's2.l{layer}.')}
assert set(expected) == required
grouped = {'/root/s2_resume_j1': [], '/root/s2_resume_j2': []}
for rel in files:
    path = out / rel
    raw = path.read_bytes()
    text = raw.decode().strip()
    if text.startswith('```json\n'):
        assert text.endswith('\n```')
        text = text[len('```json\n'):-len('\n```')]
    data = json.loads(text)
    reviewer = data.get('reviewer', data.get('reviewer_id'))
    judge = {'parallel-v3-fresh/S2/J1': '/root/s2_resume_j1', 'parallel-v3-fresh/S2/J2': '/root/s2_resume_j2'}[reviewer]
    assert data['source_revision'] == package['source_revision']
    assert data['protocol_revision'] == package['protocol_ref']['commit']
    for entry in data['artifacts']:
        key = entry['key']
        assert key in expected
        assert entry['body_sha256'] == expected[key]['body']['sha256']
        assert entry['verdict'] == 'PASS', (judge, key, entry['verdict'])
        assert entry['mandatory_findings'] == [], (judge, key, 'mandatory findings remain')
        assert not any(x['key'] == key for x in grouped[judge]), (judge, key, 'duplicate final judgment')
        grouped[judge].append({'key': key, 'body_sha256': entry['body_sha256'], 'verdict': 'PASS', 'mandatory_findings_open': 0, 'response_path': rel, 'response_sha256': hashlib.sha256(raw).hexdigest()})
for judge, entries in grouped.items():
    assert {v['key'] for v in entries} == required, (judge, 'whole-layer coverage missing')
result = {'schema': 'genesis-s2-independent-decision-bindings/v1', 'layer': layer, 'scope': 'Semantic artifact decisions only; all actual original responses remain referenced and unchanged.', 'reviews': [{'judge': judge, 'artifacts': entries} for judge, entries in grouped.items()]}
target = out / 'judgments' / f'l{layer}-accepted-decision-bindings.json'
assert not target.exists()
target.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
print(str(target))
