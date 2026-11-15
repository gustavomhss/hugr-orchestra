"""Verify actual connector readbacks against one immutable publication snapshot.

This is byte-level transport verification. It does not contact GitHub, grant semantic
acceptance or infer runtime authority. The caller must capture actual connector
results in remote-readback.json and historical-entry-readback.json first.
"""
from pathlib import Path
from datetime import datetime, timezone
import hashlib
import json
import sys

W = Path(__file__).resolve().parents[1]
P = W / 'payload'
OUT = 'modules/atlas/docs/design/genesis-chatgpt-results/20261111-v3-fresh/s1/subslices/03-automation'
name = sys.argv[1]
assert '/' not in name and name not in {'.', '..'}
D = W / 'publish' / name
read = lambda p: json.loads(p.read_text())
H = lambda b: hashlib.sha256(b).hexdigest()
G = lambda b: hashlib.sha1(b'blob ' + str(len(b)).encode() + b'\0' + b).hexdigest()
index = read(D / 'index.json')
pub = read(D / 'publication.json')
remote = read(D / 'remote-readback.json')
assert pub['base'] == index['base'] and pub['lease']['success'] is True
assert remote['branch_head'] == pub['seal']
assert remote['branch_root_tree'] == pub['root_tree']
assert remote['tree_sha'] == pub['out_tree'] and remote['truncated'] is False
files = {r['path']: r for r in index['files']}
assert len(files) == len(index['files'])
blobs = {r['path']: r for r in remote['tree'] if r['type'] == 'blob'}
assert len(blobs) == sum(r['type'] == 'blob' for r in remote['tree'])
assert set(blobs) == set(files) | {'handoff.json'}, 'Unexpected missing or added file in the output subtree'
for path, row in files.items():
    raw = (D / 'files' / path).read_bytes()
    assert H(raw) == row['sha256'] and G(raw) == row['git_blob_sha']
    assert len(raw) == row['byte_length']
    got = blobs[path]
    assert got['sha'] == row['git_blob_sha'] and got['size'] == row['byte_length']
    assert got['mode'] == row['mode'] == '100644'
handoff = (D / 'handoff.json').read_bytes()
hand = json.loads(handoff)
assert hand['artifact_revision'] == pub['payload']
assert hand['observed_branch_head'] == pub['base']
assert blobs['handoff.json']['sha'] == pub['handoff_blob'] == G(handoff)
assert blobs['handoff.json']['size'] == len(handoff)
critical = []
for result in remote['critical']:
    assert result['encoding'] == 'utf-8'
    prefix = 'https://github.com/gustavomhss/hugr-orchestra/blob/' + pub['seal'] + '/' + OUT + '/'
    assert result['display_url'].startswith(prefix)
    path = result['display_url'][len(prefix):]
    expected = handoff if path == 'handoff.json' else (D / 'files' / path).read_bytes()
    actual = result['content'].encode('utf-8')
    assert actual == expected and G(actual) == result['sha']
    critical.append(path)
assert 'handoff.json' in critical, 'The sealed handoff requires an actual raw read'
historical = read(D / 'historical-entry-readback.json')
historical_bytes = historical['content'].encode('utf-8')
assert historical['encoding'] == 'utf-8'
assert H(historical_bytes) == '6a488ca8f9717a497949b71ed41db84d995f23b90c31cc59c22c5bd86239ca6c'
assert G(historical_bytes) == historical['sha'] == '894266bd4543763fb1ee2a4dbf0ba749a244ec48'
assert '/' + pub['seal'] + '/' in historical['display_url']
record = {
    'schema': 's1-03-payload-seal-readback/v2',
    'recorded_utc': datetime.now(timezone.utc).isoformat(),
    'state': hand['completion_state'],
    **{k: pub[k] for k in ['base', 'payload', 'seal', 'root_tree', 'out_tree']},
    'lease': {'expected_sha': pub['base'], 'force': False, 'success': True},
    'payload_files_verified': len(files),
    'payload_bytes': sum(r['byte_length'] for r in files.values()),
    'git_sha_and_sizes_all_match': True,
    'exact_output_blob_path_set': True,
    'critical_actual_byte_readback': critical + ['historical s1.core.entry'],
    'historical_entry_unchanged': True,
    'handoff': {'bytes': len(handoff), 'sha256': H(handoff), 'git_blob_sha': G(handoff)},
    'scope': 'S1-03 only; transport integrity is not semantic or runtime acceptance',
    'snapshot_index': str((D / 'index.json').relative_to(W)),
    'post_seal_receipt': 'Created after the observed seal; cannot be contained in that same seal without self-reference.'
}
destination = P / 'receipts' / (name + '-readback.json')
assert not destination.exists(), 'Keep each actual readback receipt immutable'
destination.write_text(json.dumps(record, ensure_ascii=False, indent=2) + '\n')
print(json.dumps({'receipt': str(destination.relative_to(W)), 'payload': pub['payload'],
                  'seal': pub['seal'], 'files': len(files), 'all_match': True}))
