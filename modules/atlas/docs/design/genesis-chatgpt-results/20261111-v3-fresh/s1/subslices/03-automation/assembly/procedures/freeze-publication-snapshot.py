"""Freeze an immutable payload for connector-only Git writes with an observed lease.

This script neither contacts GitHub nor changes a branch. The caller must provide an
actual fresh read receipt. The later connector writer uploads these exact bytes and
creates payload P, seal H, then leases the observed branch from B directly to H.
"""
from pathlib import Path
from datetime import datetime, timezone
import hashlib
import json
import shutil
import sys

W = Path(__file__).resolve().parents[1]
P = W / 'payload'
name, state, observed_receipt, previous_name, purpose = sys.argv[1:]
assert state in {'IN_PROGRESS', 'INCOMPLETE_BLOCKED', 'DELIVERY_COMPLETE'}
assert '/' not in name and name not in {'.', '..'}
observed_path = W / observed_receipt
observed = json.loads(observed_path.read_text())
base, root_tree, out_tree = (observed[k] for k in ['branch_head', 'root_tree', 'out_tree'])
assert observed['branch'] == 'genesis-s1-automation'
assert observed['repository'] == 'gustavomhss/hugr-orchestra'
assert observed['actual_connector_reads'] is True
assert all(len(x) == 40 and set(x) <= set('0123456789abcdef') for x in [base, root_tree, out_tree])
previous = json.loads((W / 'publish' / previous_name / 'index.json').read_text())
previous_publication = json.loads((W / 'publish' / previous_name / 'publication.json').read_text())
assert base == previous_publication['seal'], 'A newer branch advance requires explicit reconciliation before a snapshot.'
old_files = {row['path']: row for row in previous['files']}
known_blobs = {row['git_blob_sha'] for row in previous['files']}
snapshot = W / 'publish' / name
assert not snapshot.exists(), 'Never replace a frozen publication snapshot.'
files_root = snapshot / 'files'
files_root.mkdir(parents=True)
rows = []
for source in sorted(P.rglob('*')):
    if not source.is_file():
        continue
    relative = source.relative_to(P)
    assert not source.is_symlink(), source
    if relative.as_posix() == 'handoff.json':
        continue
    assert not any(part in {'.git', '..'} for part in relative.parts)
    raw = source.read_bytes()
    raw.decode('utf-8', errors='strict')
    destination = files_root / relative
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_bytes(raw)
    assert destination.read_bytes() == raw
    rows.append({'path': relative.as_posix(), 'mode': '100644', 'type': 'blob',
                 'sha256': hashlib.sha256(raw).hexdigest(),
                 'git_blob_sha': hashlib.sha1(b'blob ' + str(len(raw)).encode() + b'\0' + raw).hexdigest(),
                 'byte_length': len(raw)})
assert set(old_files) <= {row['path'] for row in rows}, 'Preserved prior payload files must not disappear.'
changed = [row for row in rows if old_files.get(row['path'], {}).get('git_blob_sha') != row['git_blob_sha']]
unique = {}
for row in changed:
    if row['git_blob_sha'] not in known_blobs:
        unique.setdefault(row['git_blob_sha'], row)
index = {'schema': 's1-03-publish-snapshot/v1', 'state': state,
         'created_utc': datetime.now(timezone.utc).isoformat(), 'base': base,
         'base_tree': root_tree, 'base_out_tree': out_tree,
         'files': rows, 'changed_files': changed, 'purpose': purpose,
         'fresh_base_receipt': {'path': observed_receipt,
                                'sha256': hashlib.sha256(observed_path.read_bytes()).hexdigest()},
         'handoff_excluded_for_seal': True,
         'remote_writes_performed': False}
(snapshot / 'index.json').write_text(json.dumps(index, ensure_ascii=False, indent=2) + '\n')
(snapshot / 'upload-plan.json').write_text(json.dumps({'unique_uploads': list(unique.values()), 'changed_files': changed}, ensure_ascii=False, indent=2) + '\n')
shutil.copyfile(observed_path, snapshot / 'observed-base.json')
print(json.dumps({'snapshot': str(snapshot.relative_to(W)), 'base': base, 'files': len(rows),
                  'bytes': sum(row['byte_length'] for row in rows),
                  'changed_files': len(changed), 'unique_uploads': len(unique)}))
