#!/usr/bin/env python3
"""Read-only audit of preserved S4 Actions evidence. Does not import or run product code."""
import collections
import hashlib
import json
from pathlib import Path, PurePosixPath
import re
import stat
import sys
import zipfile
from datetime import datetime, timezone

BASE = Path('/workspace/scratch/7c87ae3af0a9')
RUN = BASE / 's4-run-46114652347'
PREP = RUN / 'prepare'
PROV = BASE / 's4-provenance'
Q = '09a4c4afc7aab2f9a153eb059d13df0ecf15595c'
RUNTIME = 'db9b4235022c4df32fe3bfd4faeea8adcd69abb7'
SOURCE = '1cde2ff7a71bcf7aecb5d030917b577165135d38'
PROTOCOL = 'ee2521a5b966bd505cc95bd1c733e09e12f33531'
REMOTE = '/home/runner/work/_temp/genesis-runtime-46114652347-1/evidence/'
report = {'schema': 'genesis-s4-final-evidence-audit/v1', 'reviewer': 'runtime_audit',
          'formal_release_judge': False, 'run_id': 46114652347, 'harness_revision': Q,
          'runtime_revision': RUNTIME, 'started_at': datetime.now(timezone.utc).isoformat(),
          'verdict': 'FAILED', 'assertions': 0, 'failures': [], 'checks': {}, 'product_code_executed_locally': False}

def sha(data):
    return hashlib.sha256(data).hexdigest()

def blob(data):
    return hashlib.sha1(f'blob {len(data)}\0'.encode() + data).hexdigest()

def read(path):
    return json.loads(path.read_bytes())

def require(condition, label):
    report['assertions'] += 1
    if not condition:
        report['failures'].append(label)

def receipt(path):
    raw = path.read_bytes()
    return {'path': str(path), 'sha256': sha(raw), 'byte_length': len(raw)}

def refpath(ref):
    return ref.get('payload_path', ref.get('path'))

def verify_receipts(value):
    count = 0
    if isinstance(value, dict):
        if {'path', 'byte_length', 'sha256'} <= value.keys() and str(value['path']).startswith(REMOTE):
            path = PREP / value['path'][len(REMOTE):]
            require(path.is_file(), f'missing referenced evidence: {value["path"]}')
            raw = path.read_bytes()
            require(len(raw) == value['byte_length'] and sha(raw) == value['sha256'], f'evidence digest: {value["path"]}')
            count += 1
        count += sum(verify_receipts(child) for child in value.values())
    elif isinstance(value, list):
        count += sum(verify_receipts(child) for child in value)
    return count

def audit():
    api = read(RUN / 'audit-api.json')
    require(api['run']['head_sha'] == Q and api['run']['conclusion'] == 'success' and api['run']['run_attempt'] == 1,
            'GitHub run identity/conclusion')
    jobs = api['jobs']['jobs']
    require({j['name'] for j in jobs} == {'prepare', 'guards'} and all(j['conclusion'] == 'success' and j['head_sha'] == Q for j in jobs), 'GitHub jobs')
    require(all(s['conclusion'] == 'success' for j in jobs for s in j['steps']), 'GitHub step results')
    report['checks']['github'] = {'run_url': api['run']['html_url'], 'jobs': [{'id': j['id'], 'name': j['name'], 'conclusion': j['conclusion']} for j in jobs], 'api_capture': receipt(RUN / 'audit-api.json')}
    archives = []
    for name in ('prepare', 'guards'):
        archive = RUN / (name + '.zip')
        artifact = next(a for a in api['artifacts']['artifacts'] if a['name'].startswith('genesis-runtime-' + name + '-'))
        actual = receipt(archive)
        require('sha256:' + actual['sha256'] == artifact['digest'] and actual['byte_length'] == artifact['size_in_bytes'], name + ' archive API digest/length')
        with zipfile.ZipFile(archive) as z:
            require(z.testzip() is None, name + ' ZIP CRC')
            members = [i for i in z.infolist() if not i.is_dir()]
            require(len(members) == len({i.filename for i in members}), name + ' duplicate ZIP entries')
            require({i.filename for i in members} == {p.relative_to(RUN / name).as_posix() for p in (RUN / name).rglob('*') if p.is_file()}, name + ' exact extraction file set')
            for item in members:
                path = PurePosixPath(item.filename)
                require(not path.is_absolute() and '..' not in path.parts and stat.S_IFMT(item.external_attr >> 16) != stat.S_IFLNK, name + ' safe ZIP path:' + item.filename)
                require(z.read(item) == (RUN / name / item.filename).read_bytes(), name + ' ZIP/local bytes:' + item.filename)
        archives.append({**actual, 'artifact_id': artifact['id'], 'api_digest_match': True, 'entry_count': len(members), 'crc_and_extracted_bytes': 'PASS'})
    report['checks']['archives'] = archives
    index = read(PREP / 'evidence-index.json')
    require(len(index) == len({r['path'] for r in index}), 'evidence index uniqueness')
    require({r['path'] for r in index} == {p.relative_to(PREP).as_posix() for p in PREP.rglob('*') if p.is_file() and p.name != 'evidence-index.json'}, 'evidence index coverage')
    for row in index:
        raw = (PREP / row['path']).read_bytes()
        require(len(raw) == row['byte_length'] and sha(raw) == row['sha256'], 'evidence index bytes:' + row['path'])
    report['checks']['evidence_index'] = {**receipt(PREP / 'evidence-index.json'), 'indexed_files': len(index), 'coverage': 'all files except index itself'}
    summary = read(PREP / 'summary.json')
    lockpath = PROV / 'source-manifest.json'
    lock = read(lockpath)
    require(sha(lockpath.read_bytes()) == summary['input_lock']['sha256'] and len(lockpath.read_bytes()) == summary['input_lock']['byte_length'], 'input lock exact bytes')
    require(summary['verdict'] == 'PASS_PREPARE_QUALIFICATION' and summary['harness_revision'] == Q and summary['runtime_revision'] == RUNTIME and summary['source_revision'] == SOURCE and summary['protocol_revision'] == PROTOCOL, 'summary identities and verdict')
    require(summary['binding'] == 'NOT_ATTEMPTED' and summary['publication'] == 'NOT_ATTEMPTED', 'no binding/publication claimed')
    receipt_count = 0
    for path in PREP.rglob('*.json'):
        receipt_count += verify_receipts(read(path))
    report['checks']['referenced_evidence'] = {'checked_receipt_occurrences': receipt_count, 'input_lock': receipt(lockpath)}
    packages = []
    for label, dirname, pkgname, artifacts, inputs, observations, checks_total, large_total in (
        ('S1-03', 's1-03', 's1pkg.json', 12, 694, 694, 707, 6),
        ('S2', 's2', 's2pkg.json', 13, 625, 626, 640, 3)):
        spec = next(s for s in lock['packages'] if s['id'] == label)
        pkgraw = (PROV / pkgname).read_bytes()
        pkg = json.loads(pkgraw)
        require(sha(pkgraw) == spec['package_sha256'] and blob(pkgraw) == spec['package_git_blob_sha'], label + ' original package hashes')
        prepared = read(PREP / dirname / 'prepared.json')
        candidate = prepared['candidate']
        package_summary = next(s for s in summary['packages'] if s['id'] == label)
        materialization = read(PREP / (dirname + '-materialization.json'))
        verification = read(PREP / (dirname + '-verification.json'))
        operation = read(PREP / dirname / 'receipt.json')
        kernel = read(PREP / dirname / 'kernel-identities.json')['checks']
        kernel_receipt = read(PREP / dirname / 'kernel-identities.receipt.json')
        require(prepared == read(PREP / dirname / 'stdout.txt'), label + ' stdout candidate equality')
        require(operation['exit_code'] == 0 and kernel_receipt['exit_code'] == 0 and not (PREP / dirname / 'stderr.txt').read_bytes() and not (PREP / dirname / 'kernel-identities.stderr.txt').read_bytes(), label + ' exit0 empty stderr')
        require(operation['runtime_revision'] == RUNTIME and operation['observed_head'] == SOURCE and operation['root'] == candidate['repo_root'] and operation['argv'][2] == 'prepare', label + ' original CLI/root/code identity')
        require(all(operation[k] is False for k in ['runtime_code_modified', 'seams_used', 'policy_or_actor_created', 'binding_or_publication_attempted']), label + ' no authority/runtime modification')
        require(candidate['observed_head'] == SOURCE and candidate['source_revision'] == SOURCE and candidate['transport']['sha256'] == spec['package_sha256'], label + ' prepared provenance')
        require(prepared['candidate_id'] == package_summary['candidate_id'] == verification['candidate_id'], label + ' unique candidate agreement')
        require(len(candidate['entries']) == artifacts and len(candidate['observations']) == observations, label + ' candidate counts')
        require([e['key'] for e in candidate['entries']] == [a['key'] for a in pkg['artifacts']] == spec['expected_artifact_keys'], label + ' execution order')
        require(candidate['required_artifact_keys'] == pkg['required_artifact_keys'] and set(candidate['required_artifact_keys']) == set(spec['expected_artifact_keys']), label + ' exact required vector/set')
        require(candidate['roots'] == pkg['roots'] and candidate['criteria'] == list(dict.fromkeys([*pkg['contract']['criteria'], 'runtime-import-binding'])), label + ' roots/criteria')
        rows = {r['path']: r for r in materialization['files']}
        locked = {r['path']: r for r in spec['files']}
        require(len(rows) == len(materialization['files']) == spec['materialized_file_count'] and set(rows) == set(locked), label + ' materialization count/set')
        require(materialization['observed_head'] == SOURCE and materialization['repo_root'] == candidate['repo_root'] and materialization['initial_atlas_state'] == 'absent' and materialization['working_tree_is_complete'] is False and materialization['materialization_mode'] == 'no-checkout-required-input-view', label + ' isolated data identity')
        for path, row in rows.items():
            require(all(row[k] == locked[path][k] for k in ['commit', 'sha256', 'roles']) and row['git_mode'] in ['100644', '100755'], label + ' locked materialization:' + path)
            for field in ['git_blob_sha', 'byte_length']:
                require(locked[path][field] is None or row[field] == locked[path][field], label + ' optional locked field:' + field + ':' + path)
        expected_inputs = {key for a in pkg['artifacts'] for key in a['input_keys']}
        expected_observed = expected_inputs | {'file:' + refpath(pkg['protocol_ref'])}
        observed = {r['key']: r for r in candidate['observations']}
        require(len(expected_inputs) == inputs and set(observed) == expected_observed and len(observed) == observations, label + ' complete observations')
        for key, row in observed.items():
            require(row['sha256'] == rows[key[5:]]['sha256'], label + ' observed hash:' + key)
        preceding = {}
        for artifact, entry in zip(pkg['artifacts'], candidate['entries']):
            ordered = list(dict.fromkeys([*artifact['input_keys'], 'file:' + refpath(pkg['protocol_ref'])]))
            require(entry['inputs'] == [{'key': k, 'version': observed[k]['version']} for k in ordered], label + ' exact entry inputs:' + entry['key'])
            require(entry['dependencies'] == [{'key': d['key'], 'result': preceding[d['key']]} for d in artifact['build_dependencies']], label + ' graph:' + entry['key'])
            require(all(entry['artifact'][k] == artifact[k] for k in ['key', 'scope', 'title', 'layer', 'need', 'navigation']), label + ' metadata:' + entry['key'])
            preceding[entry['key']] = entry['artifact']['result']
        require(len(kernel) == checks_total and all(r['actual'] == r['expected'] for r in kernel), label + ' every recorded kernel rehash')
        kind_counts = dict(collections.Counter(r['kind'] for r in kernel))
        require(kind_counts == {'candidate': 1, 'entry-inputs': artifacts, 'full-file-input': observations}, label + ' kernel check kinds')
        require(next(r for r in kernel if r['kind'] == 'candidate')['actual'] == prepared['candidate_id'], label + ' candidate rehash linkage')
        input_checks = {r['key']: r for r in kernel if r['kind'] == 'full-file-input'}
        require(set(input_checks) == set(observed), label + ' kernel exact input coverage')
        for key, check in input_checks.items():
            require(check['expected'] == observed[key]['version'] and check['byte_length'] == rows[key[5:]]['byte_length'], label + ' kernel input/bytes linkage:' + key)
        entry_checks = {r['key']: r for r in kernel if r['kind'] == 'entry-inputs'}
        require(set(entry_checks) == set(preceding), label + ' kernel exact entry coverage')
        for entry in candidate['entries']:
            require(entry_checks[entry['key']]['expected'] == entry['inputs_id'], label + ' entry input ID linkage:' + entry['key'])
        cas = verification['state']['cas']
        require(sha(json.dumps(cas, sort_keys=True).encode()) == package_summary['cas_inventory_sha256'], label + ' CAS inventory seal')
        require(len(cas) == len({r['path'] for r in cas}) and all(re.fullmatch(r'[0-9a-f]{2}/[0-9a-f]{64}', r['path']) for r in cas), label + ' CAS inventory paths/uniqueness')
        cas_candidate = next(r for r in cas if r['path'] == prepared['candidate_id'][:2] + '/' + prepared['candidate_id'])
        stored_candidate = json.dumps(candidate, ensure_ascii=False, separators=(',', ':')).encode()
        require(sha(stored_candidate) == cas_candidate['sha256'] and len(stored_candidate) == cas_candidate['byte_length'], label + ' preserved candidate CAS bytes digest')
        large = package_summary['large_inputs']
        require(len(large) == large_total and {r['path'] for r in large} == {k[5:] for k in observed if rows[k[5:]]['byte_length'] > 256000}, label + ' large source coverage')
        for row in large:
            require(row['kernel_version'] == observed['file:' + row['path']]['version'] and row['byte_length'] <= 2097152, label + ' large kernel/limit:' + row['path'])
        packages.append({'id': label, 'candidate_id': prepared['candidate_id'], 'prepared_file': receipt(PREP / dirname / 'prepared.json'), 'artifacts': artifacts, 'declared_inputs': inputs, 'observations': observations, 'kernel_checks': len(kernel), 'kernel_kind_counts': kind_counts, 'materialized_files': len(rows), 'cas_inventory_objects': len(cas), 'large_inputs': len(large), 'elapsed_seconds': operation['elapsed_seconds']})
    report['checks']['packages'] = packages
    large_records = []
    for definition in read(PROV / 'hash-defs.json'):
        if not definition.get('local', '').startswith('large-'):
            continue
        raw = (PROV / definition['local']).read_bytes()
        locked = next(r for r in lock['large_inputs'] if r['path'] == definition['path'])
        require(len(raw) == definition['byte_length'] == locked['byte_length'] and sha(raw) == definition['sha256'] == locked['sha256'] and blob(raw) == definition['git_blob_sha'] == locked['git_blob_sha'] and sha(raw[-64:]) == locked['tail64_sha256'], 'local complete large source:' + definition['path'])
        from_run = next(r for p in summary['packages'] for r in p['large_inputs'] if r['path'] == definition['path'])
        require(all(from_run[k] == locked[k] for k in ['sha256', 'git_blob_sha', 'byte_length', 'tail64_sha256']), 'run large source linkage:' + definition['path'])
        large_records.append({'path': definition['path'], 'local_capture': definition['local'], 'byte_length': len(raw), 'sha256': sha(raw), 'git_blob_sha': blob(raw), 'tail64_sha256': sha(raw[-64:])})
    require(len(large_records) == 9, 'all nine complete large source captures')
    report['checks']['local_large_file_rehashes'] = large_records
    negative = summary['real_permission_refusal']
    neg_receipt = read(PREP / 's2-permission-refusal/receipt.json')
    neg_error = read(PREP / 's2-permission-refusal/stderr.txt')
    require(negative['verdict'] == 'PASS' and negative['uid'] != 0 and negative['read_probe'] == 'PermissionError' and negative['error'] == neg_error and negative['positive_roots_unchanged'] is True, 'real EACCES recorded assertions')
    require(neg_receipt['exit_code'] == negative['exit_code'] == 1 and neg_receipt['output'] is None and not (PREP / 's2-permission-refusal/prepared.json').exists() and not (PREP / 's2-permission-refusal/stdout.txt').read_bytes(), 'EACCES no candidate/exit1')
    require(neg_error['kind'] == 'error' and 'EACCES' in neg_error['error'] and negative['path'] in neg_error['error'], 'exact EACCES error/path')
    s2_mat = read(PREP / 's2-materialization.json')
    neg_mat = read(PREP / 's2-refusal-materialization.json')
    require(neg_mat['files'] == s2_mat['files'] and neg_mat['declared_reference_checks'] == s2_mat['declared_reference_checks'] and neg_mat['repo_root'] != s2_mat['repo_root'] and neg_mat['initial_atlas_state'] == 'absent', 'negative same inputs/separate root')
    report['checks']['real_permission_refusal'] = {'uid': negative['uid'], 'exit_code': negative['exit_code'], 'error': neg_error, 'no_candidate': True, 'distinct_root_same_materialization': True, 'positive_roots_unchanged_recorded': True}
    guards = read(RUN / 'guards/receipt.json')
    guard_raw = (RUN / 'guards/guards.log').read_bytes()
    require(sha(guard_raw) == guards['log_sha256'] and len(guard_raw) == guards['log_bytes'] and guards['candidate_revision'] == Q and guards['exit_code'] == 0, 'guards exact log/identity/exit0')
    lines = guard_raw.decode().splitlines()
    warnings = [line for line in lines if line.startswith('WARN ')]
    baseline = next(r for r in read(BASE / 's4-ci-evidence.json')['runs'] if r['head_sha'] == RUNTIME)
    prior_warnings = {line.split(' WARN ', 1)[1] for line in baseline['evidence_excerpt'] if ' WARN ' in line}
    current_warnings = {line[5:] for line in warnings}
    introduced = current_warnings - prior_warnings
    require(len(warnings) == 5 and len(prior_warnings) == 4 and prior_warnings <= current_warnings and len(introduced) == 1 and 'evidence/attempt-1/prepare.zip [binary-added]' in next(iter(introduced)), 'guards four inherited plus exact new binary warning')
    require(any('0 gate and 5 warn findings, 0 errors.' in line for line in lines), 'guards result line')
    report['checks']['guards'] = {'exit_code': 0, 'gate_findings': 0, 'warnings': 5, 'errors': 0, 'base_sha': guards['base_sha'], 'log': receipt(RUN / 'guards/guards.log'), 'preexisting_warnings': sorted(prior_warnings), 'new_warning': sorted(introduced)}

try:
    audit()
except Exception as error:
    report['failures'].append(f'unexpected audit exception: {type(error).__name__}: {error}')
report['verdict'] = 'PASS_MECHANICAL_EVIDENCE_AUDIT' if not report['failures'] else 'FAILED'
report['finished_at'] = datetime.now(timezone.utc).isoformat()
report['command'] = ['python3', str(Path(__file__).resolve())]
report['audit_script'] = receipt(Path(__file__).resolve())
report['limits'] = [
    'Local audit reads and hashes preserved artifacts; it does not rerun Atlas, Bun, product tests or GitHub jobs.',
    'Kernel BLAKE3 identities are verified as complete, candidate-linked recorded Actions checks; the local audit does not implement or execute the kernel algorithm.',
    'The nine large inputs were independently rehashed from complete local GitHub captures. Other source-file provenance is cross-checked against the locked materialization receipts; their full bytes are not all stored in these ZIPs.',
    'CAS inventory hashes and candidate CAS byte digest are checked; the full raw CAS is not contained in the downloaded evidence artifact.',
    'Runtime acceptance, domain-specific binding/publication, merge and activation are outside this mechanical audit.',
    'The guard gate passed with five warnings; this audit does not relabel warning output as zero warnings.',
]
destination = RUN / 'audit-final-evidence.json'
destination.write_text(json.dumps(report, indent=2, ensure_ascii=False) + '\n')
print(json.dumps({'verdict': report['verdict'], 'assertions': report['assertions'], 'failures': report['failures'], 'output': str(destination), 'sha256': sha(destination.read_bytes()), 'packages': report['checks'].get('packages')}))
sys.exit(0 if not report['failures'] else 1)
