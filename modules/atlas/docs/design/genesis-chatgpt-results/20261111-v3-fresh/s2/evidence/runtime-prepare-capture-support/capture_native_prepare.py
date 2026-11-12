#!/usr/bin/env python3
"""Verify a sealed final S2 stage; --execute runs its exact prepare once.

No product tests, publication, retries, source rewrites or CAS cleanup occur.
An exclusive attempt marker makes interrupted or failed attempts non-repeatable.
"""
from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import time

CANDIDATE = 'e3a8ab8cf56dbff1ee91272df51ffa398d882aa1'
SOURCE = '1cde2ff7a71bcf7aecb5d030917b577165135d38'
PROTOCOL = 'ee2521a5b966bd505cc95bd1c733e09e12f33531'
MATERIALIZATION_SHA = '9ba791b332abab7bba4b6949aedce9363a13dbb87ab3a4aa58ad485b695bea60'
DEPENDENCIES_SHA = '973e1414bdc71833420da907e15c1183bc0d452de70f8f7044b7f850cfc29e20'
BUILD_SHA = 'cf284f3645bf605be0500716db346e55cb9241374b7b1ecd9042d4cecb5a1022'
PREFIX = 'modules/atlas/docs/design/genesis-chatgpt-results/20261111-v3-fresh/s2'
ROOT = Path(__file__).resolve().parents[2]
REQUIRED = {f's2.l{n}.{u}' for n in (1, 2, 3, 4) for u in ('desktop-web', 'app-session', 'design-tui')} | {'s2.l4.entry'}


def now():
    return dt.datetime.now(dt.timezone.utc).isoformat()


def require(condition, message):
    if not condition:
        raise ValueError(message)


def digest(path):
    value = hashlib.sha256()
    with path.open('rb') as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b''):
            value.update(block)
    return value.hexdigest()


def ref(path):
    return {'path': str(path), 'sha256': digest(path), 'byte_length': path.stat().st_size}


def read_json(path):
    return json.loads(path.read_text(encoding='utf-8'))


def safe_path(path, parent):
    path = Path(path)
    require(path.is_absolute() and path.resolve() == path and path.is_relative_to(parent), f'Unsafe path: {path}')
    return path


def check_file(path, expected, length=None, git_blob=None):
    require(path.is_file() and not path.is_symlink() and path.resolve() == path, f'Missing or linked file: {path}')
    require(digest(path) == expected, f'SHA256 mismatch: {path}')
    if length is not None:
        require(path.stat().st_size == length, f'Byte length mismatch: {path}')
    if git_blob:
        data = path.read_bytes()
        require(hashlib.sha1(b'blob ' + str(len(data)).encode() + b'\0' + data).hexdigest() == git_blob, f'Git blob mismatch: {path}')


def write_new(path, value):
    raw = (json.dumps(value, ensure_ascii=False, indent=2) + '\n').encode()
    with path.open('xb') as stream:
        stream.write(raw)
        stream.flush()
        os.fsync(stream.fileno())
    return ref(path)


def inventory(path):
    result = {'root': str(path), 'exists': path.exists(), 'entries': [], 'files': 0, 'bytes': 0}
    if not path.exists():
        return result
    for item in [path, *sorted(path.rglob('*'))]:
        name = str(item.relative_to(path))
        if item.is_symlink():
            result['entries'].append({'relative_path': name, 'kind': 'symlink', 'target': os.readlink(item)})
        elif item.is_file():
            size = item.stat().st_size
            result['entries'].append({'relative_path': name, 'kind': 'file', 'byte_length': size, 'sha256': digest(item)})
            result['files'] += 1
            result['bytes'] += size
        elif item.is_dir():
            result['entries'].append({'relative_path': name, 'kind': 'directory'})
        else:
            result['entries'].append({'relative_path': name, 'kind': 'other'})
    return result


def verify(stage):
    stage = safe_path(stage, ROOT / 'runtime-work/final-staging')
    require(stage.is_dir(), 'Stage directory does not exist')
    plan_path, seal_path = stage / 'stage-plan.json', stage / 'sealed.json'
    plan, seal = read_json(plan_path), read_json(seal_path)
    require(plan['schema'] == 'genesis-s2-final-staging-plan/v1', 'Wrong plan schema')
    require(seal['schema'] == 'genesis-s2-final-staging-seal/v1', 'Wrong seal schema')
    require(seal['stage_plan_sha256'] == digest(plan_path), 'Sealed stage-plan hash mismatch')
    package_sha = plan['package_sha256']
    require(stage.name == package_sha == seal['package_sha256'], 'Stage/package identity mismatch')
    require(not plan['final_conditions'] and not plan['reference_errors'], 'Final staging has unresolved conditions/references')
    require(not seal['prepare_executed'] and not seal['runtime_cas_created'], 'Seal reports prior execution')
    require(plan['runtime_candidate_revision'] == CANDIDATE, 'Wrong native candidate revision')
    require(plan['payload_prefix'] == seal['payload_prefix'] == PREFIX, 'Wrong payload prefix')
    require(plan['artifact_count'] == plan['supported_count'] == plan['required_count'] == 13, 'Exactly13 accepted artifacts required')
    require(plan['roots_observed'] == {'entry': 's2.l4.entry'}, 'Wrong final entry roots')
    require(set(plan['reachable_required_keys']) == REQUIRED, 'Not all13 artifacts reachable')
    source_root = safe_path(plan['source_root'], ROOT / 'runtime-work')
    require(str(source_root) == seal['source_root'], 'Source-root mismatch')
    require(not (source_root / '.git').exists(), 'No fabricated Git checkout allowed')
    require(not (source_root / '.atlas').exists(), 'Preexisting .atlas/CAS prohibits a new attempt')
    package_path = ROOT / 'deliverable/native-package.json'
    check_file(package_path, package_sha, plan['package_bytes'])
    pack = read_json(package_path)
    require(pack['source_revision'] == SOURCE and pack['protocol_ref']['commit'] == PROTOCOL, 'Source/protocol pin mismatch')
    require(pack['roots'] == {'entry': 's2.l4.entry'} and not pack['missing_required_artifact_keys'], 'Final package incomplete')
    require({a['key'] for a in pack['artifacts']} == REQUIRED and len(pack['artifacts']) == 13, 'Wrong artifact set')
    require(all(a['validity'] == 'supported' and len(a['semantic_review_refs']) >= 2 for a in pack['artifacts']), 'Missing semantic decisions')
    for record in plan['files']:
        path = safe_path(source_root / record['path'], source_root)
        check_file(path, record['sha256'], record['byte_length'], record.get('git_blob_sha'))
    for record in plan['materialized_originals_to_preserve']:
        path = safe_path(source_root / record['path'], source_root)
        check_file(path, record['sha256'], record['byte_length'])
    require(seal['file_count'] == len(plan['files']) and seal['original_count_preserved'] == len(plan['materialized_originals_to_preserve']), 'Seal inventory count mismatch')
    check_file(source_root / PREFIX / 'native-package.json', package_sha, plan['package_bytes'])
    runtime_root = ROOT / 'runtime-work/runtime-code'
    runtime_dir = runtime_root / 'modules/atlas'
    materialization_path = ROOT / 'runtime-work/runtime-materialization.json'
    check_file(materialization_path, MATERIALIZATION_SHA)
    materialization = read_json(materialization_path)
    require(materialization['candidate_revision'] == CANDIDATE and materialization['verified_files'] == 406 and not materialization['missing'], 'Invalid native materialization receipt')
    require(len(materialization['files']) == 406, 'Incomplete native source manifest')
    for record in materialization['files']:
        path = safe_path(runtime_root / record['path'], runtime_root)
        check_file(path, record['sha256'], record['byte_length'], record['git_blob_sha'])
    for name, expected in plan['runtime_implementation_sha256'].items():
        check_file(safe_path(runtime_dir / name, runtime_dir), expected)
    dependencies_path = ROOT / 'runtime-work/dependency-materialization.json'
    check_file(dependencies_path, DEPENDENCIES_SHA)
    dependencies = read_json(dependencies_path)
    build_path = ROOT / 'runtime-work/supplement-r2/build-receipt-initial.json'
    check_file(build_path, BUILD_SHA)
    build = read_json(build_path)
    require(build['candidate_revision'] == CANDIDATE and build['postinstall']['exit_code'] == build['typecheck']['exit_code'] == 0, 'Required prior native setup did not succeed')
    patched_scip = build['scip_package_after']
    for record in dependencies['files']:
        path = safe_path(ROOT / 'runtime-work' / record['path'], ROOT / 'runtime-work')
        if str(path) == patched_scip['path']:
            check_file(path, patched_scip['sha256'], patched_scip['byte_length'])
        else:
            check_file(path, record['sha256'], record['byte_length'])
    for record in dependencies['symlinks']:
        path = ROOT / 'runtime-work' / record['path']
        require(path.is_symlink() and os.readlink(path) == record['target'] and str(path.resolve()) == record['resolved'], f'Dependency link drift: {path}')
    bun = safe_path(dependencies['bun']['binary_path'], ROOT / 'runtime-work')
    check_file(bun, dependencies['bun']['binary_sha256'])
    require(os.access(bun, os.X_OK), 'Bun is not executable')
    request = plan['prepare_request']
    expected = [str(bun), 'scripts/genesis-native.ts', 'prepare', str(source_root), PREFIX + '/native-package.json', str(stage / 'prepared.json')]
    require(request['argv'] == expected and request['cwd'] == str(runtime_dir), 'Stage command differs from the exact bounded operation')
    for key, name in [('output_file', 'prepared.json'), ('stdout_file', 'prepare.stdout'), ('stderr_file', 'prepare.stderr'), ('receipt_file', 'prepare-execution-receipt.json')]:
        require(request[key] == str(stage / name), f'Unexpected operation path: {key}')
    require(plan['operation_directory'] == str(stage) and request['future_cas'] == str(source_root / '.atlas/cas'), 'Wrong operation/CAS path')
    for name in ('prepared.json', 'prepare.stdout', 'prepare.stderr', 'prepare-execution-receipt.json', 'prepare-attempt.json', 'preflight.json', 'cas-before.json', 'cas-after.json', 'post-operation-integrity.json'):
        require(not (stage / name).exists(), f'Prior/uncertain attempt evidence exists: {name}; do not retry')
    receipt = {'state': 'VERIFIED_NOT_EXECUTED', 'recorded_at': now(), 'native_package_sha256': package_sha,
        'candidate_revision': CANDIDATE, 'source_revision': SOURCE, 'protocol_revision': PROTOCOL,
        'stage_plan': ref(plan_path), 'seal': ref(seal_path), 'canonical_package': ref(package_path),
        'runtime_materialization': ref(materialization_path), 'dependency_materialization': ref(dependencies_path), 'prior_build': ref(build_path),
        'bun': ref(bun), 'staged_files_verified': len(plan['files']), 'original_files_verified': len(plan['materialized_originals_to_preserve']),
        'native_source_files_verified': 406, 'dependency_files_verified': len(dependencies['files']),
        'known_oversized_inputs': plan['r1_oversized_live_inputs'], 'runtime_compatibility': plan['runtime_compatibility'],
        'argv': expected, 'cwd': str(runtime_dir), 'prepare_executed': False,
        'limits': ['This verifies recorded bytes, not provenance beyond the retained receipts.', 'Known cap incompatibility is preserved; no source is omitted or truncated.', 'No product tests or new version command execute during preflight.']}
    return plan, source_root, receipt


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--stage-dir', required=True, type=Path)
    parser.add_argument('--execute', action='store_true', help='Explicitly execute exactly one native prepare after successful verification')
    parser.add_argument('--authorization-note', help='Required concrete root authorization/context for --execute; not a user permission prompt')
    args = parser.parse_args()
    require(not args.execute or bool(args.authorization_note), '--execute requires --authorization-note')
    plan, source_root, preflight = verify(args.stage_dir)
    if not args.execute:
        print(json.dumps(preflight, ensure_ascii=False, indent=2))
        return 0
    stage = args.stage_dir
    marker = {'schema': 'genesis-s2-one-shot-native-prepare-attempt/v1', 'recorded_at': now(), 'native_package_sha256': plan['package_sha256'],
              'authorization_note': args.authorization_note, 'argv': plan['prepare_request']['argv'], 'cwd': plan['prepare_request']['cwd'],
              'automatic_retry_allowed': False, 'helper': ref(Path(__file__).resolve())}
    marker_ref = write_new(stage / 'prepare-attempt.json', marker)
    preflight_ref = write_new(stage / 'preflight.json', preflight)
    before = inventory(source_root / '.atlas')
    before_ref = write_new(stage / 'cas-before.json', before)
    require(not before['exists'], 'Concurrent CAS creation after preflight; attempt remains recorded and must not retry')
    request = plan['prepare_request']
    started, elapsed_start = now(), time.monotonic()
    executed, exit_code, launch_error = False, None, None
    with (stage / 'prepare.stdout').open('xb') as stdout, (stage / 'prepare.stderr').open('xb') as stderr:
        try:
            process = subprocess.Popen(request['argv'], cwd=request['cwd'], stdout=stdout, stderr=stderr, shell=False)
            executed = True
            exit_code = process.wait()
        except OSError as error:
            launch_error = {'type': type(error).__name__, 'message': str(error)}
        finally:
            stdout.flush(); os.fsync(stdout.fileno())
            stderr.flush(); os.fsync(stderr.fileno())
    ended, elapsed = now(), time.monotonic() - elapsed_start
    after = inventory(source_root / '.atlas')
    after_ref = write_new(stage / 'cas-after.json', after)
    integrity_errors = []
    for record in plan['files'] + plan['materialized_originals_to_preserve']:
        try:
            check_file(source_root / record['path'], record['sha256'], record['byte_length'])
        except (OSError, ValueError) as error:
            integrity_errors.append(str(error))
    materialization = read_json(ROOT / 'runtime-work/runtime-materialization.json')
    for record in materialization['files']:
        try:
            check_file(ROOT / 'runtime-work/runtime-code' / record['path'], record['sha256'], record['byte_length'])
        except (OSError, ValueError) as error:
            integrity_errors.append(str(error))
    try:
        check_file(ROOT / 'deliverable/native-package.json', plan['package_sha256'], plan['package_bytes'])
    except (OSError, ValueError) as error:
        integrity_errors.append(str(error))
    integrity_ref = write_new(stage / 'post-operation-integrity.json', {'recorded_at': now(), 'errors': integrity_errors, 'unchanged': not integrity_errors})
    output = stage / 'prepared.json'
    candidate_id, output_ref, parsed_output_error = None, None, None
    if output.is_file() and not output.is_symlink():
        output_ref = ref(output)
        try:
            prepared = read_json(output)
            if prepared.get('schema') == 'genesis-native-prepared/v1' and re.fullmatch(r'[0-9a-f]{64}', str(prepared.get('candidate_id', ''))):
                candidate_id = prepared['candidate_id']
            else:
                parsed_output_error = 'Output exists but does not have the expected prepared schema/candidate hash'
        except (OSError, ValueError, AttributeError) as error:
            parsed_output_error = str(error)
    status = 'PREPARE_NOT_RUN_LAUNCH_FAILED' if not executed else ('PREPARE_FAILED' if exit_code != 0 else 'PREPARE_COMPLETED_RUNTIME_UNACCEPTED')
    if integrity_errors:
        status = 'POST_OPERATION_INTEGRITY_FAILED'
    receipt = {'schema': 'genesis-s2-native-prepare-execution/v1', 'operation': 'prepare', 'state': status,
        'recorded_at': now(), 'started_at': started, 'ended_at': ended, 'duration_seconds': elapsed,
        'native_package_sha256': plan['package_sha256'], 'candidate_revision': CANDIDATE, 'source_revision': SOURCE, 'protocol_revision': PROTOCOL,
        'argv': request['argv'], 'cwd': request['cwd'], 'prepare_executed': executed, 'exit_code': exit_code, 'launch_error': launch_error,
        'attempt': marker_ref, 'preflight': preflight_ref, 'stdout': ref(stage / 'prepare.stdout'), 'stderr': ref(stage / 'prepare.stderr'),
        'cas_before': before_ref, 'cas_after': after_ref, 'cas_created': not before['exists'] and after['exists'],
        'partial_cas_preserved': bool(after['exists'] and (exit_code != 0 or not output_ref)), 'cas_file_count_after': after['files'],
        'post_operation_integrity': integrity_ref, 'output': output_ref, 'parsed_output_error': parsed_output_error,
        'candidate_id': candidate_id, 'candidate_id_basis': 'Actual prepared.json only' if candidate_id else None,
        'binding_id': None, 'publish_executed': False, 'tests_executed': False, 'runtime_acceptance': 'UNACCEPTED',
        'git_checkout': False, 'observed_head': None, 'membership_observation_ready': False,
        'automatic_retries': 0, 'cas_deleted': False, 'tokens': 'UNKNOWN', 'billing': 'UNKNOWN', 'physical_provider_attempts': 'UNKNOWN',
        'limits': ['Prepare is not binding, publication, consumer acceptance, CI or a product test.', 'CAS inventory records exact observed bytes, including partial state; no cleanup occurs.', 'An interrupted wrapper may leave marker/logs without a final receipt; inspect and preserve, never rerun automatically.']}
    receipt_ref = write_new(stage / 'prepare-execution-receipt.json', receipt)
    print(json.dumps({'state': status, 'exit_code': exit_code, 'receipt': receipt_ref, 'candidate_id': candidate_id, 'cas_files': after['files']}, indent=2))
    return 0 if executed and exit_code == 0 and not integrity_errors else 1


if __name__ == '__main__':
    try:
        raise SystemExit(main())
    except (ValueError, OSError, KeyError, TypeError) as error:
        print(json.dumps({'state': 'HELPER_REFUSED_OR_INTERRUPTED', 'error': str(error), 'automatic_retry_allowed': False}), file=sys.stderr)
        raise SystemExit(2)
