"""Independent documentary verifier; never imports/runs product or producer code."""
from pathlib import Path
import hashlib
import json
import re

OUT = Path(__file__).resolve().parent
WD = OUT.parent
PREFIX = 'modules/atlas/docs/design/genesis-chatgpt-results/20261111-v3-fresh/s1/subslices/03-automation'
P = 'f6ffb725704cc01682847d7e175f22b6ead3894c'
errors = []
checks = 0


def require(value, message):
    global checks
    checks += 1
    if not value:
        errors.append(message)


def ident(path):
    path = Path(path)
    if not path.is_absolute():
        path = WD / path
    require(path.resolve().is_relative_to(WD), 'Path outside workspace: ' + str(path))
    require(not any(x.lower() in {'oracle', 'oracles', 'reserved'} for x in path.parts), 'Reserved path: ' + str(path))
    if any(x.lower() in {'oracle', 'oracles', 'reserved'} for x in path.parts):
        raise ValueError('Reserved path refused')
    require(not path.is_symlink(), 'Symlink source: ' + str(path))
    raw = path.read_bytes()
    return {'bytes': len(raw), 'sha256': hashlib.sha256(raw).hexdigest(),
            'git_blob_sha': hashlib.sha1(b'blob ' + str(len(raw)).encode() + b'\0' + raw).hexdigest()}


def same(a, b):
    return a['bytes'] == b.get('bytes', b.get('byte_length')) and a['sha256'] == b['sha256'] and a['git_blob_sha'] == b['git_blob_sha']


def path_valid(path):
    return bool(path) and not re.search(r'[\\:*?"<>|\x00-\x1f\x7f]', path) and not any(not p or p in {'.', '..'} or p.lower() in {'.git', '.atlas'} or p.endswith(('.', ' ')) for p in path.split('/'))


d = json.loads((OUT / 'descriptors.json').read_text())
p = json.loads((OUT / 'materialization-plan.json').read_text())
observed = json.loads((OUT / 'observed-identities.json').read_text())
published = {row['path']: row for row in json.loads((WD / 'publish/l1-corrections-v2b/index.json').read_text())['files']}
table = {row['canonical_path']: row for row in p['files']}
require(len(table) == len(p['files']), 'Duplicate destination')
for row in observed['files']:
    require(same(ident(row['local_path']), row), 'Previously observed file changed: ' + row['local_path'])

for path, row in table.items():
    require(path_valid(path), 'Invalid canonical path: ' + path)
    require(not (path.startswith(PREFIX + '/') and Path(path).name == 'AGENTS.md'), 'Authority copy in results: ' + path)
    for alias in row['local_sources']:
        require(same(ident(alias), row), 'Alias mismatch: ' + alias)
    if row['origin_commit'] == P:
        rel = path[len(PREFIX) + 1:]
        require(path.startswith(PREFIX + '/'), 'P path outside output prefix: ' + path)
        require(rel in published and same(row, published[rel]), 'Unproven P path/identity: ' + path)
        require(same(ident('publish/l1-corrections-v2b/files/' + rel), row), 'Published snapshot byte mismatch: ' + path)

artifact_summary = []
for artifact in d['artifacts']:
    key = artifact['key']
    units = {row['input_key']: row for row in artifact['input_units']}
    require(set(units) == set(artifact['input_keys']) and len(units) == len(artifact['input_keys']), 'Input-key mismatch: ' + key)
    require(len({row['path'] for row in artifact['source_refs']}) == len(artifact['source_refs']), 'Duplicate source path: ' + key)
    require('semantic_review_refs' not in artifact and 'validity' not in artifact, 'Review/validity was assigned: ' + key)
    require('file:' + PREFIX + '/' + artifact['body']['path'] not in units, 'Current body self-input: ' + key)
    posterior = artifact['posterior_descriptive_recipe_ref']
    require('file:' + posterior.get('path', posterior.get('payload_path')) not in units, 'Posterior recipe promoted to earlier input: ' + key)
    for unit in units.values():
        require(unit['whole_file'] is True, 'Input is not whole: ' + unit['input_key'])
        require(unit['canonical_path'] in table and same(unit, table[unit['canonical_path']]), 'Input identity missing from plan: ' + unit['input_key'])
    for ref in artifact['source_refs']:
        require(set(ref) == {'commit', 'path', 'git_blob_sha', 'sha256'}, 'Wrong source-ref shape: ' + key)
        require(bool(re.fullmatch('[0-9a-f]{40}', ref['commit'])), 'Invalid commit: ' + key)
        require('file:' + ref['path'] in units, 'Source without input: ' + ref['path'])
        require(ref['sha256'] == table[ref['path']]['sha256'] and ref['git_blob_sha'] == table[ref['path']]['git_blob_sha'] and ref['commit'] == table[ref['path']]['origin_commit'], 'Source-ref drift: ' + ref['path'])
    for field in ['recipe_ref', 'producer_request_ref', 'producer_response_ref']:
        ref = artifact[field]
        expected_keys = {'commit', 'path', 'sha256'} if 'commit' in ref else {'payload_path', 'sha256'}
        require(set(ref) == expected_keys, 'Wrong reference shape: ' + field + ': ' + key)
        path = ref.get('path', ref.get('payload_path'))
        require(path in table and ref['sha256'] == table[path]['sha256'], 'Reference drift: ' + path)
        if field == 'recipe_ref':
            require('file:' + path in units, 'Recipe is not native input: ' + key)
    body = artifact['body']
    current = ident(body['path'])
    require(current['bytes'] == body['byte_length'] and current['sha256'] == body['sha256'], 'Body changed: ' + key)
    require(artifact['layer'] == 1 and artifact['need'] in {'flow', 'component', 'entry'}, 'Invalid native layer/need: ' + key)
    artifact_summary.append({'key': key, 'inputs': len(units), 'source_refs': len(artifact['source_refs']),
                             'body_bytes': current['bytes'], 'body_sha256': current['sha256']})

require(len(d['artifacts']) == 4, 'Wrong artifact count')
require(len(d['whole_inputs_exceeding_runtime_cap']) == 6, 'Missing whole oversized input')
require(p['summary']['destination_conflicts'] == 0, 'Destination conflict remains')
output = {'schema': 's1-03-native-descriptor-verification/v1',
          'status': 'VERIFIED_DOCUMENTARY_IDENTITIES_ONLY' if not errors else 'IDENTITY_VERIFICATION_FAILED',
          'checks': checks, 'errors': errors, 'observed_original_files_rechecked': len(observed['files']),
          'canonical_files': len(table), 'artifacts': artifact_summary,
          'source_ref_pin_rule': 'Every local P source_ref matched path + SHA256 + length + Git blob in the published index and the exact snapshot file. H is never used as a content commit.',
          'not_run': ['product tests', 'producer recipes', 'Atlas prepare', 'Atlas publish', 'network', 'semantic judgment'],
          'no_original_bytes_changed_by_this_task': not errors}
(OUT / 'verification.json').write_text(json.dumps(output, ensure_ascii=False, indent=2) + '\n')
print(json.dumps(output, ensure_ascii=False, indent=2))
raise SystemExit(1 if errors else 0)
