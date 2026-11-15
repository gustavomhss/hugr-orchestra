"""Normalize actual producer records after all twelve gates; never infer a missing input.

This is transport preparation. It does not author knowledge, run Atlas, bind a review,
or assign an unpublished commit. The immutable publication pin is added separately.
"""
from pathlib import Path
import datetime
import hashlib
import json

W = Path(__file__).resolve().parents[1]
P = W / 'payload'

def readj(path):
    return json.loads(path.read_text())

def verified_input(row):
    local = row['local_path']
    raw = (W / local).read_bytes()
    size = row.get('bytes', row.get('byte_length'))
    assert len(raw) == size, (local, 'input size')
    assert hashlib.sha256(raw).hexdigest() == row['sha256'], (local, 'input hash')
    assert hashlib.sha1(b'blob ' + str(size).encode() + b'\0' + raw).hexdigest() == row['git_blob_sha']
    return {'local_path': local, 'bytes': size, 'sha256': row['sha256'],
            'git_blob_sha': row['git_blob_sha'],
            'original_read_paths': row.get('original_read_paths', [local])}

plan = readj(P / 'artifact-plan.json')
gates = {a['key']: a for a in readj(P / 'semantic-acceptances.json')['artifacts']}
assert len(plan['artifacts']) == 12
assert all(gates.get(a['key'], {}).get('status') == 'PASS_SEMANTIC_CURRENT_BODY'
           for a in plan['artifacts']), 'All twelve exact current-body gates are required.'
base = readj(P / 'assembly/native-l1-current-inputs.json')
specs = base['artifacts']

for task in plan['artifacts']:
    key = task['key']
    gate = gates[key]
    raw = (W / gate['local_body_path']).read_bytes()
    assert hashlib.sha256(raw).hexdigest() == gate['body_sha256']
    if task['layer'] > 1:
        directory = str(Path(gate['local_body_path']).parent)
        manifest = readj(W / directory / 'production-manifest.json')
        if key == 's1.subslice03.entry':
            assert manifest.get('schema') == 's1-03-derived-production-manifest/v1', (
                key, 'unknown entry manifest schema')
            assert manifest.get('record_kind') == 'POSTPRODUCTION_DESCRIPTIVE_MANIFEST_NOT_RETROACTIVE_RECIPE'
            assert manifest.get('artifact', {}).get('key') == key
            assert not any(name in manifest for name in
                           ['inputs', 'actual_authoring_recipe', 'actual_recipe', 'effective_authoring_recipe']), (
                key, 'ambiguous entry manifest schema')
            rows = manifest.get('actual_inputs')
            actual = manifest.get('effective_recipe')
            assert isinstance(rows, list) and rows, (key, 'actual_inputs must be a nonempty list')
            assert isinstance(actual, dict) and actual.get('this_manifest_is_not_a_recipe') is True
            counts = manifest['input_counts']
            assert type(counts['unique_actual_input_units']) is int
            assert len(rows) == counts['unique_actual_input_units']
            assert all(counts[name] == 1 for name in ['per_task_recipe', 'request', 'visible_dispatch'])
            assert type(counts['enumerated_whole_files']) is int
            assert len(rows) == counts['enumerated_whole_files'] + 3
            assert all(isinstance(row, dict) and
                       (row.get('whole_file_read') is True or row.get('whole_message_consumed') is True)
                       for row in rows), (key, 'entry inputs must be consumed whole')
            inputs = [verified_input(row) for row in rows]
            by_path = {row['local_path']: row for row in inputs}
            assert len(by_path) == len(inputs), (key, 'duplicate actual input paths')
            for name in ['common_contract', 'per_task_recipe', 'request', 'visible_dispatch']:
                declared = actual[name]
                assert isinstance(declared, dict), (key, name, 'unknown binding schema')
                bound = by_path.get(declared['local_path'])
                assert bound is not None, (key, name, 'binding was not an actual input')
                assert declared.get('bytes', declared.get('byte_length')) == bound['bytes']
                assert declared['sha256'] == bound['sha256']
                assert declared['git_blob_sha'] == bound['git_blob_sha']
            recipe = actual['per_task_recipe']['local_path']
            request = actual['request']['local_path']
        else:
            assert 'actual_inputs' not in manifest and 'effective_recipe' not in manifest, (
                key, 'unsupported derived manifest schema; explicit inspection required')
            inputs = [verified_input(row) for row in manifest['inputs']]
            actual = manifest.get('actual_authoring_recipe', manifest.get('actual_recipe',
                                 manifest.get('effective_authoring_recipe', {})))
            recipe = next((actual[n]['local_path'] for n in
                           ['actual_procedure', 'script', 'task_recipe', 'per_task', 'current_recipe', 'correction']
                           if n in actual), None)
            request = next((actual[n]['local_path'] for n in ['current_request', 'frozen_request'] if n in actual),
                           directory + '/request.txt')
        assert recipe is not None, (key, 'actual recipe schema requires explicit inspection')
        assert recipe in {row['local_path'] for row in inputs}, (key, 'recipe was not an actual input')
        assert request in {row['local_path'] for row in inputs}, (key, 'request was not an actual input')
        specs[key] = {'additional_actual_inputs': inputs, 'audited_path_aliases': {},
                      'actual_recipe_local_path': recipe, 'request_local_path': request,
                      'response_local_path': directory + '/response.md',
                      'manifest_local_path': directory + '/production-manifest.json'}
    spec = specs[key]
    spec['review_payload_paths'] = {}
    for judgment in gate['judgments']:
        original = Path(judgment['original_response_path'])
        assert original.parts[0] in ['relay', 'relay-root']
        lot = original.parts[1]
        category = 'derived' if lot.startswith('derived-') else 'l1'
        archive = Path('judgments') / category / lot
        if original.parts[0] == 'relay-root':
            archive /= 'root-transport'
        archive /= Path(*original.parts[2:])
        archived = (P / archive).read_bytes()
        assert archived == (W / original).read_bytes()
        assert hashlib.sha256(archived).hexdigest() == judgment['original_response_sha256']
        spec['review_payload_paths'][judgment['judge_id']] = str(archive)
    assert set(spec['review_payload_paths']) == {'parallel-v3-fresh/S1-03/J1', 'parallel-v3-fresh/S1-03/J2'}
    spec['gaps'] = ['Own Atlas preparation, exact runtime binding, governed publication, consumers and maintenance are assessed separately; semantic PASS does not certify those operations.']
    spec['evidence'] = ['semantic-acceptances.json#' + key,
                        *spec['review_payload_paths'].values()]
    if task['layer'] > 1:
        spec['evidence'].append(str(Path(gate['local_body_path']).with_name('evidence.md')))
    spec['navigation'] = []

# The local entry is a consultation hub. These navigation links grant no build or union authority.
specs['s1.subslice03.entry']['navigation'] = [a['key'] for a in plan['artifacts']
                                           if a['key'] != 's1.subslice03.entry']
criteria = readj(P / 'recipes/derived-public-criteria.json')['rows']
config = {
    'schema': 's1-03-final-assembly-configuration/v1',
    'created_at_utc': datetime.datetime.now(datetime.timezone.utc).isoformat(),
    'source_payload_commit': None,
    'status': 'ALL_SEMANTIC_GATES_VERIFIED_PREPUBLICATION_INPUT_INVENTORY',
    'artifacts': specs,
    'roots': {'entry': 's1.subslice03.entry', 'component': 's1.core.research',
              'flow': 's1.subslice03.automation-flow', 'operational': 's1.subslice03.automation-impact',
              'maintenance': 's1.subslice03.automation-maintenance'},
    'native_contract_criteria': [row['id'] for row in criteria],
    'known_limits': [
        'S1-03 only: 462 assigned sources and twelve planned artifacts. The historical s1.core.entry remains unchanged and outside this package.',
        'Semantic current-body PASS is separate from native binding, governed activation, live reads, consumers and maintenance. No operational success is inferred here.',
        'Every genuinely consumed whole input remains present. Current Atlas file limits are tested by the official prepare operation; oversized inputs are not removed or split.',
        'The original native FINAL of research L2 correction v2 was not separately captured before compaction. The original author response file, exact outputs and later non-verbatim confirmation are preserved. Full GO-I1 is not certified by this transport assembly.',
        'The union-navigation proposal remains local and NOT_SELECTED for union. Selection and composition belong to S1_COORDINATION.',
        'Host physical attempts, token usage and billing are UNKNOWN; historical campaign accounting is GLOBAL_UNRECONCILED.'
    ]
}
destination = P / 'assembly/final-config-prepublication.json'
assert not destination.exists(), 'Do not overwrite a frozen assembly configuration.'
destination.write_text(json.dumps(config, ensure_ascii=False, indent=2) + '\n')
print(json.dumps({'path': str(destination.relative_to(W)), 'artifacts': len(specs),
                  'criteria': len(criteria), 'source_payload_commit': None}))
