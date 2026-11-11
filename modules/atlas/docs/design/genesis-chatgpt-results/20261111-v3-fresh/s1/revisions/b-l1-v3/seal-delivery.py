"""Bind the preserved producer response and seal local B-v3 files; no product execution."""
from pathlib import Path
import hashlib, json, subprocess, sys

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
sha = lambda b: hashlib.sha256(b).hexdigest()
def ident(p):
    b = p.read_bytes()
    return {'path': str(p.relative_to(ROOT)), 'byte_length': len(b), 'sha256': sha(b)}

pending = HERE / 'fragment-metadata.pending.json'
current = HERE / 'fragment-metadata.json'
fragment = json.loads((pending if pending.exists() else current).read_text())
response = ident(HERE / 'response.md')
for a in fragment['artifacts']:
    a['producer_response_ref']['sha256'] = response['sha256']
current.write_text(json.dumps(fragment, ensure_ascii=False, indent=2) + '\n')
if pending.exists(): pending.unlink()
precheck = HERE / 'checks.pre-binding.json'
if precheck.exists(): precheck.unlink()

# This command runs only our independent byte/line/membership checker.
subprocess.run([sys.executable, str(HERE / 'verify-delivery.py')], check=True)
checks = json.loads((HERE / 'checks.json').read_text())
assert checks['final_response_bound'] and checks['result'] == 'verified_mechanics_only'

excluded = {'manifest.json', 'SHA256SUMS'}
files = [p for p in sorted(HERE.rglob('*')) if p.is_file() and p.relative_to(HERE).as_posix() not in excluded]
assert not any(p.is_symlink() for p in files)
records = [ident(p) for p in files]
manifest = {
    'schema': 'genesis-producer-revision-manifest/v1',
    'task': 'S1-L1-B-v3', 'scope': 'orchestra.s1',
    'source_revision': '1cde2ff7a71bcf7aecb5d030917b577165135d38',
    'protocol_revision': 'ee2521a5b966bd505cc95bd1c733e09e12f33531',
    'state': 'producer_revision_complete_for_independent_review',
    'semantic_verdict': 'none', 'runtime_receipt': 'none',
    'file_count_excluding_manifest_and_checksum_list': len(records),
    'total_bytes_excluding_manifest_and_checksum_list': sum(r['byte_length'] for r in records),
    'file_path_base': 'genesis-s1 workspace / future shared-package base',
    'primary_fragment': ident(current), 'producer_response': response,
    'mechanical_verification': ident(HERE / 'checks.json'),
    'boundary': 'Only revisions/b-l1-v3 files were written by this revision. Original producer B and evidence-v1 files remain unchanged; output working package is maintained independently by the principal.',
    'source_evidence_policy': 'Literal captured bytes; source and span identities recomputed. Main compact projection answers the original B1/B2/B3 union. Extensive support is preserved without promoting every note into batch claims.',
    'acceptance_gate': 'Two independent exact-version judgments remain required. No producer PASS or L2-L4 release is asserted.',
    'files': records,
    'self_hash_policy': 'This manifest and SHA256SUMS are excluded from files to avoid a hash cycle. SHA256SUMS includes this manifest and every other file except itself.',
}
(HERE / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
sumfiles = [p for p in sorted(HERE.rglob('*')) if p.is_file() and p.relative_to(HERE).as_posix() != 'SHA256SUMS']
(HERE / 'SHA256SUMS').write_text(''.join(sha(p.read_bytes()) + '  ' + p.relative_to(HERE).as_posix() + '\n' for p in sumfiles))
for p in sumfiles:
    assert not p.is_symlink()
for rec in records:
    p = ROOT / rec['path']
    assert ident(p) == rec
print(json.dumps({'sealed_file_count_including_manifest': len(sumfiles), 'manifest': ident(HERE / 'manifest.json'), 'checks': ident(HERE / 'checks.json'), 'fragment': ident(current), 'response': response, 'SHA256SUMS': ident(HERE / 'SHA256SUMS')}, indent=2))
