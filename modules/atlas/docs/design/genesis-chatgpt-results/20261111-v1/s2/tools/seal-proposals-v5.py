import datetime
import difflib
import hashlib
import json
import os
import pathlib
import subprocess

ROOT = pathlib.Path(__file__).resolve().parent.parent
PREP = ROOT / 'preparation'
REPO = ROOT / 'orchestra'
SOURCE = '1cde2ff7a71bcf7aecb5d030917b577165135d38'
PROTOCOL = '2689c516d63488be37de678cc853dd4556fd5c13'
BUN = ROOT / 'runtime/node_modules/@oven/bun-linux-x64/bin/bun'

def sha(data):
    return hashlib.sha256(data).hexdigest()

def now():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()

def seal(name, directory, patch_name, dependencies, overlays=()):
    preview = PREP / directory
    files = []
    diff = []
    for source in sorted(preview.rglob('*.ts')):
        path = source.relative_to(preview)
        data = source.read_bytes()
        assert data.endswith(b'\n') and not data.endswith(b'\n\n')
        previous = REPO / path
        for overlay in overlays:
            candidate = PREP / overlay / path
            if candidate.exists():
                previous = candidate
        exists = previous.exists()
        before = previous.read_bytes() if exists else b''
        diff.append(f'diff --git a/{path} b/{path}\n')
        if not exists:
            diff.append('new file mode 100644\n')
        diff.extend(difflib.unified_diff(before.decode().splitlines(keepends=True), data.decode().splitlines(keepends=True), fromfile=f'a/{path}' if exists else '/dev/null', tofile=f'b/{path}'))
        files.append({'path': str(path), 'before_sha256': sha(before) if exists else None, 'sha256': sha(data), 'bytes': len(data), 'guard_line_count': len(data.decode().split('\n'))})
    patch = preview.parent / patch_name
    patch.write_text(''.join(diff))
    manifest = {'schema': 'genesis-s2-proposal/v1', 'campaign': '20261111-v1', 'session': 's2', 'proposal': name,
                'state': 'PROPOSAL_NOT_INTEGRATED', 'author': '/root continuing S2-PREP-ROOT-01; no new agent turn',
                'source_revision': SOURCE, 'protocol_revision': PROTOCOL, 'candidate_revision': None,
                'patch': {'path': patch.name, 'sha256': sha(patch.read_bytes()), 'bytes': patch.stat().st_size},
                'apply_after': dependencies, 'files': files, 'tests': 'NOT_RUN; GitHub Actions only', 's5_acceptance': 'NOT_REQUESTED',
                'technical_review': 'PENDING_S1_ALLOCATION', 'production': 'NOT_RUN'}
    return patch, manifest

native_patch, native = seal('native-importer-v5', 'importer/v5-preview', 'native-importer-v5.patch', [])
capture_patch, capture = seal('extended-source-capture-v1', 'capture/v1-preview', 'extended-source-capture-v1.patch', ['ownership-rebuild-boundaries-v3'], ['update/v3-preview'])
bridge_patch, bridge = seal('native-rebuild-bridge-v1', 'bridge/v1-preview', 'native-rebuild-bridge-v1.patch', ['native-importer-v5', 'ownership-rebuild-boundaries-v3', 'extended-source-capture-v1'])
patches = [native_patch, PREP / 'update/ownership-rebuild-boundaries-v3.patch', capture_patch, bridge_patch]
verification = PREP / 'proposal-sequence-verification'
verification.mkdir(exist_ok=True)
index = verification / 'index'
assert not index.exists(), 'Do not overwrite an earlier verification attempt'
env = {**os.environ, 'GIT_INDEX_FILE': str(index), 'GIT_NO_LAZY_FETCH': '1'}
commands = []

def run(argv, cwd, environment=None):
    started = now()
    result = subprocess.run(argv, cwd=cwd, env=environment, capture_output=True, text=True)
    commands.append({'argv': [str(arg) for arg in argv], 'cwd': str(cwd), 'started_at': started, 'ended_at': now(), 'exit_code': result.returncode, 'stdout': result.stdout, 'stderr': result.stderr,
                     'isolated_index': str(index) if environment else None})
    if result.returncode:
        (PREP / 'receipts/proposal-sequence-failure.json').write_text(json.dumps(commands, indent=2) + '\n')
        raise SystemExit(json.dumps(commands[-1], indent=2))
    return result.stdout

run(['git', 'read-tree', PROTOCOL], REPO, env)
for patch in patches:
    run(['git', 'apply', '--cached', '--check', '--whitespace=error', str(patch)], REPO, env)
    run(['git', 'apply', '--cached', '--whitespace=error', str(patch)], REPO, env)
checks = []
for path in sorted({row['path'] for item in [native, capture, bridge] for row in item['files']}):
    result = subprocess.run(['git', 'show', ':' + path], cwd=REPO, env=env, check=True, capture_output=True).stdout
    expected = (PREP / 'proposal-build' / path).read_bytes()
    checks.append({'path': path, 'sha256': sha(result), 'matches_preview': result == expected})
assert all(row['matches_preview'] for row in checks)
for name in ['ownership-native-import', 'ownership-native-rebuild']:
    run([str(BUN), 'build', 'modules/atlas/scripts/' + name + '.ts', '--target=bun', '--outfile', str(verification / (name + '.bundle.js'))], PREP / 'proposal-build')
clean = subprocess.check_output(['git', 'status', '--porcelain=v1'], cwd=REPO) == b''
assert clean
receipt = {'schema': 'genesis-proposal-sequence-verification/v1', 'source_revision': SOURCE, 'protocol_revision': PROTOCOL, 'candidate_revision': None,
           'ordered_patches': [{'path': str(path.relative_to(PREP)), 'sha256': sha(path.read_bytes())} for path in patches],
           'commands': commands, 'file_checks': checks, 'original_checkout_clean': clean,
           'temporary_index': 'Applied only to a separate Git index for patch applicability; no working-tree integration, branch mutation or candidate commit',
           'typecheck_receipt': 'receipts/source-capture-v1-typecheck-completed.json', 'tests': 'NOT_RUN', 'ci_run': None, 'native_production': 'NOT_RUN'}
(PREP / 'receipts/proposal-sequence-verification.json').write_text(json.dumps(receipt, indent=2) + '\n')
native['supersedes'] = {'commit': 'a50020ca8f3b0147d12b7c7011992419dff02af3', 'path': 'modules/atlas/docs/design/genesis-chatgpt-results/20261111-v1/s2/proposals/native-importer/native-importer-v4.patch', 'sha256': sha((PREP / 'importer/native-importer-v4.patch').read_bytes())}
native['changes'] = ['Compact scope v2 binds exact complete entry/key/root arrays by Atlas canonical identity; original v1 remains supported.', 'Source-capture implementations must be declared when extended input namespaces are used.', 'Export the existing receipt shape guard for the native rebuild adapter.']
native['ci_cases'] = ['NI-%02d' % value for value in range(1, 11)] + ['HI-%02d' % value for value in range(1, 7)]
capture['changes'] = ['Separate bounded byte/mode, literal-link and committed retained-evidence routes; old file/members contracts unchanged.', 'Binary reads through the existing strict no-shell Git seam; nested .atlas evidence is historical only.', 'Source-members expansion and exact captured record validation inside the existing rebuild executor; no alternate planner/cache.']
capture['ci_cases'] = ['SCAP-%02d' % value for value in range(1, 5)] + ['SR-%02d' % value for value in range(1, 5)]
bridge['changes'] = ['Persist pending production/review requests from the existing executor.', 'Validate original native request/response/receipt and both exact S5 decisions; pause when missing.', 'Do not dispatch models, accept affected sets, add a cache, or mutate publication.', 'Retain per-recipe version invalidation independently from the frozen common recipe contract.']
bridge['ci_cases'] = ['NR-%02d' % value for value in range(1, 8)]
for folder, manifest, name in [('importer', native, 'proposal-manifest-v5.json'), ('capture', capture, 'proposal-manifest-v1.json'), ('bridge', bridge, 'proposal-manifest-v1.json')]:
    manifest['sequence_verification'] = {'path': 'receipts/proposal-sequence-verification.json', 'sha256': sha((PREP / 'receipts/proposal-sequence-verification.json').read_bytes())}
    (PREP / folder / name).write_text(json.dumps(manifest, indent=2) + '\n')
print(json.dumps({'patches': [item['patch'] for item in [native, capture, bridge]], 'files_verified': len(checks), 'sequence_exit_codes': [entry['exit_code'] for entry in commands], 'new_ci_cases_total': 31, 'tests': 'NOT_RUN', 'checkout_clean': clean}, indent=2))
