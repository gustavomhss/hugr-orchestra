#!/usr/bin/env python3
"""Build an exclusive external command.json; never invoke Atlas or change its roots.

Expected inputs preserve the exact 716 preparation rows and 1170 runtime lock
rows, plus explicit fixed harness/CLI/prepared inputs and operator-pinned controls.
The generated configuration is not an admission, policy or execution receipt.
"""
import argparse
import datetime
import hashlib
import json
import os
from pathlib import Path
import re
import unicodedata

BASE = Path('/workspace/scratch/5cfbb6c803f1')
INVESTIGATION = BASE / 's2-investigation'
ROOT = BASE / 's2-evaluation'
RUNTIME = BASE / 's2-runtime'
CWD = RUNTIME / 'modules/atlas'
BUN = BASE / 's2-tools/node_modules/@oven/bun-linux-x64-baseline/bin/bun'
PREPARED = BASE / 's2-execution/evaluation-prepare-03/prepared.json'
BASELINE_PREPARED_02 = BASE / 's2-execution/evaluation-prepare-02/prepared.json'
PREPARE_RECEIPT = BASE / 's2-execution/evaluation-prepare-02/receipt.json'
GUARDED_PREPARE_RECEIPT_03 = BASE / 's2-execution/evaluation-prepare-03/receipt.json'
BYTE_LOCK = INVESTIGATION / 'evaluation-authority/runtime-byte-lock.json'
RECORDER = INVESTIGATION / 'record-operation.py'
WRAPPER = INVESTIGATION / 'capture-state-operation.py'
ENTRYPOINT = CWD / 'scripts/genesis-evaluation.ts'
EXECUTION = '846d4f9c-fb77-4e21-aff6-1fffccc3132b'
CANDIDATE = 'd1c8478b155b2085df1289ef91edfeaa4834e9300d651c0b953e6e2978aa5d30'
ORIGINAL_CANDIDATE = '4a36e1210acf6a4bb460846b717d446e6c259f80a78fd73cfce8b5a6e445f522'
RUNTIME_REVISION = 'db9b4235022c4df32fe3bfd4faeea8adcd69abb7'
RELEASE_REVISION = 'e171783482d0a44974d6056cd9e144a7e33406a7'
ACTOR = 'genesis-s2-resume-846d4f9c'
SCOPE = 'orchestra.interfaces'
BINDING_RELATIVE = ('modules/atlas/docs/design/genesis-chatgpt-results/20261111-v3-fresh/'
                    's2/resume-20261128/evaluation-v2/binding')
BINDING_ROOT = ROOT / BINDING_RELATIVE
STATE_CONTROLS = {ROOT / '.atlas' / name for name in
                  ('evaluation-store.json', 'evaluation-policy.json', 'policy.json')}
PROTECTED = (ROOT, RUNTIME, BASE / 's2-corpus', BASE / 's2-delivery')
PINS = {
    PREPARE_RECEIPT: '6bcfc052fad8533cd2433c7faf910301ea55fb277d1ed59638068baa56a4a6fe',
    GUARDED_PREPARE_RECEIPT_03: '36c3c2e6506b2ff9b260d932bdf3cf85e9e8d60600197c43b516c49626a4e3ea',
    BYTE_LOCK: 'fe5e317cf140c805554910d20d7a7c8964f76df12217aeb6a5280483c6c12df8',
    PREPARED: 'bb3ee09693ef1ddfb89e548f3f5e0d38c4abaee5e6d253f129c7c6c1a9dbda0e',
    BASELINE_PREPARED_02: 'bb3ee09693ef1ddfb89e548f3f5e0d38c4abaee5e6d253f129c7c6c1a9dbda0e',
    RECORDER: '0185ccf143d7a5d1112b573fd0405da899b27d112cb4c7b431e1cbb1da629b30',
    WRAPPER: 'b7022b3205d04f02b6fceaee94d2f7912f15271be6ee4b2e4d7c62ba0013a441',
    ENTRYPOINT: '3f7477b37400c1ffeea550ca0d48b328b16dedcea4deb015ad190128ff63b94c',
}
NEEDS = {'entry', 'ownership', 'maintenance', 'operational', 'flow', 'evidence', 'component'}
SHA256 = re.compile(r'^[0-9a-f]{64}$')
NATIVE_PATH_FORBIDDEN = re.compile(r'[\\:*?"<>|\x00-\x1f\x7f]')
JS_TRIM = '\u0009\u000a\u000b\u000c\u000d\u0020\u00a0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u2028\u2029\u202f\u205f\u3000\ufeff'


def require(condition, message):
    if not condition:
        raise ValueError(message)


def digest(data):
    return hashlib.sha256(data).hexdigest()


def native_relative(value):
    """Mirror the pinned nativePath's data-path rules without calling Atlas."""
    require(isinstance(value, str) and bool(value.strip(JS_TRIM))
            and unicodedata.normalize('NFC', value) == value, 'invalid native path text')
    require(NATIVE_PATH_FORBIDDEN.search(value) is None, 'native path has forbidden characters: ' + value)
    require(all(part and part not in ('.', '..') and part.lower() not in ('.git', '.atlas')
                and not part.endswith(('.', ' ')) for part in value.split('/')),
            'native path has forbidden segments: ' + value)
    return value


def binding_target(relative):
    relative = native_relative(relative)
    target = ROOT / relative
    require(BINDING_ROOT in target.parents,
            'binding/request/response must be inside ' + str(BINDING_ROOT))
    return target


def full_path(value):
    path = Path(value)
    require(path.is_absolute(), 'use an absolute path: ' + str(path))
    require('..' not in path.parts and str(path) == str(Path(os.path.normpath(path))),
            'path must be normalized: ' + str(path))
    return path


def regular(path):
    path = full_path(path)
    require(path.resolve(strict=True) == path, 'aliased path: ' + str(path))
    require(path.is_file() and not path.is_symlink(), 'expected regular file: ' + str(path))
    return path


def stamp(path, expected=None):
    path = regular(path)
    raw = path.read_bytes()
    row = {'path': str(path), 'byte_length': len(raw), 'sha256': digest(raw)}
    if expected is not None:
        require(SHA256.fullmatch(expected) is not None, 'invalid intended SHA-256 for ' + str(path))
        require(row['sha256'] == expected, 'declared file bytes differ: ' + str(path))
    return row


def outside_sources(path):
    path = full_path(path)
    require(all(path != root and root not in path.parents for root in PROTECTED),
            'control/config/output must be outside protected source roots: ' + str(path))
    return path


def new_external_path(value):
    path = outside_sources(value)
    require(not path.exists() and not path.is_symlink(), 'path already exists: ' + str(path))
    require(path.parent.is_dir() and path.parent.resolve(strict=True) == path.parent,
            'parent must already exist without aliases: ' + str(path.parent))
    return path


def validate_row(row):
    require(isinstance(row, dict) and set(row) == {'path', 'byte_length', 'sha256'},
            'input row must have exactly path, byte_length, sha256')
    full_path(row['path'])
    require(type(row['byte_length']) is int and row['byte_length'] >= 0, 'invalid input byte_length')
    require(isinstance(row['sha256'], str) and SHA256.fullmatch(row['sha256']) is not None,
            'invalid input SHA-256')


def validate_primary_evidence(receipt_02, lock, guarded_03, fixed, prepared):
    """Pure reconciliation of immutable receipt records; no operation is replayed."""
    source_rows = receipt_02['input_files_before']
    runtime_rows = lock['files']
    require(len(source_rows) == 716 and receipt_02['input_files_after'] == source_rows,
            'baseline prepare-02 input list changed')
    require(len(runtime_rows) == 1170 and lock['candidate_id'] == CANDIDATE,
            'runtime lock identity/count changed')
    guard_rows = guarded_03['input_files_before']
    require(len(guard_rows) == 1890 and guarded_03['input_files_after'] == guard_rows,
            'guarded prepare-03 before/after inputs differ')
    expected_rows = source_rows + runtime_rows + [fixed[path] for path in (RECORDER, WRAPPER, BYTE_LOCK, ENTRYPOINT)]
    for rows in (expected_rows, guard_rows):
        for row in rows:
            validate_row(row)
        require(len({row['path'] for row in rows}) == len(rows), 'duplicate path in prepare-03 evidence')
    require({row['path']: row for row in guard_rows} == {row['path']: row for row in expected_rows},
            'prepare-03 inputs differ from 716 baseline + 1170 runtime + 4 exact extras')
    require(guarded_03['schema'] == 'genesis-s2-runtime-operation-receipt/v1'
            and guarded_03['record_kind'] == 'ORIGINAL_EXECUTION_RECEIPT'
            and guarded_03['operation_id'] == 's2-evaluation-prepare-db9b423-20261128-03'
            and guarded_03['operation'] == 'evaluation-prepare-with-external-byte-guard'
            and guarded_03['execution_id'] == EXECUTION, 'guarded prepare-03 receipt identity mismatch')
    require(guarded_03['exit_code'] == 0 and guarded_03['returned_candidate_id'] == CANDIDATE
            and guarded_03['response_schema'] == 'genesis-native-prepared/v2'
            and guarded_03['original_candidate'] == ORIGINAL_CANDIDATE,
            'guarded prepare-03 candidate/exit mismatch')
    require(guarded_03['external_byte_guard'] == {
        'expected_files': 1890, 'matched': True, 'record': 'precondition.json',
        'intrinsic_runtime_identity_modified': False,
    }, 'prepare-03 external guard did not match')
    require(guarded_03['recorder_identity'] == fixed[RECORDER], 'prepare-03 recorder identity mismatch')
    require(guarded_03['named_input_bytes_unchanged'] is True
            and len(guarded_03['cas_before']) == 92
            and guarded_03['cas_before'] == guarded_03['cas_after']
            and guarded_03['state_files_before'] == [] and guarded_03['state_files_after'] == [],
            'prepare-03 was not unchanged CAS-only preparation')
    require(guarded_03['runtime_revision'] == RUNTIME_REVISION
            and guarded_03['release_pin']['release_revision'] == RELEASE_REVISION
            and guarded_03['corpus_revision'] is None
            and guarded_03['corpus_root'] == str(ROOT) and guarded_03['cwd'] == str(CWD),
            'prepare-03 runtime/release/root mismatch')
    require(guarded_03['command_argv'] == [str(BUN), 'scripts/genesis-evaluation.ts', 'prepare',
                                        str(ROOT), prepared['candidate']['plan_path'], str(PREPARED)],
            'prepare-03 original CLI argv mismatch')
    require(guarded_03['output_files'] == [fixed[PREPARED]], 'prepare-03 output bytes mismatch')
    return {
        'primary': {
            'operation_id': guarded_03['operation_id'],
            'receipt': fixed[GUARDED_PREPARE_RECEIPT_03], 'prepared': fixed[PREPARED],
            'exit_code': 0, 'external_byte_guard': guarded_03['external_byte_guard'],
            'started_at': guarded_03['started_at'], 'ended_at': guarded_03['ended_at'],
            'source_input_rows': 716, 'runtime_input_rows': 1170, 'extra_input_rows': 4,
            'before_after_exact': True, 'cas_before_after_exact': True,
        },
        'baseline_input_capture': {
            'receipt': fixed[PREPARE_RECEIPT], 'scope': 'Original 716 source-input rows only.',
            'external_byte_guard_attributed_to_prepare_02': False,
        },
        'prepared_byte_equality': {
            'baseline': fixed[BASELINE_PREPARED_02], 'primary': fixed[PREPARED],
            'identical_bytes': True, 'candidate_id': CANDIDATE,
            'limit': 'Prepare-03 is a distinct original execution. Equal prepared bytes do not transfer its guard evidence to prepare-02.',
        },
    }


def validate_query(query, operation):
    require(isinstance(query, dict), 'query must be an object')
    require(query.get('scope') == SCOPE, 'query scope must be orchestra.interfaces')
    if operation == 'index':
        require(set(query) == {'scope', 'need'}, 'index query keys must be scope and need only')
        require(query['need'] in NEEDS, 'invalid ownership need')
        return
    require(set(query) <= {'scope', 'need', 'key', 'section', 'maxBytes', 'historical'},
            'read query contains extra fields; no answers, hints or oracle fields are allowed')
    require(('need' in query) != ('key' in query), 'read query needs exactly one of need/key')
    require(type(query.get('maxBytes')) is int and 1 <= query['maxBytes'] <= 9007199254740991,
            'read maxBytes must be a positive JavaScript safe integer')
    if 'need' in query:
        require(query['need'] in NEEDS, 'invalid ownership need')
    for key in ('key', 'section'):
        if key in query:
            require(isinstance(query[key], str) and bool(query[key].strip()), 'invalid query ' + key)
    if 'historical' in query:
        require(query['historical'] is True, 'historical can only be true when present')


def parser():
    result = argparse.ArgumentParser(description=__doc__)
    result.add_argument('operation', choices=['init-store', 'admit', 'index', 'read'])
    result.add_argument('--operation-id', required=True, help='New operator-chosen execution identity; no reuse')
    result.add_argument('--command-file', required=True, type=Path, help='Exclusive external JSON file to create')
    result.add_argument('--result-dir', required=True, type=Path, help='Intended future output directory; never created here')
    result.add_argument('--generation', help='Exact preselected 64-hex generation, only for init-store')
    result.add_argument('--approval', help='For admit: exact binding path in evaluation-v2/binding, root-relative or absolute')
    result.add_argument('--approval-source', type=Path, help='Existing exact intended binding bytes if destination is not yet installed')
    result.add_argument('--approval-sha256', help='Explicit intended hash of the approval bytes')
    result.add_argument('--query', type=Path, help='For index/read: existing external query control file')
    result.add_argument('--query-sha256', help='Explicit intended hash of the external query')
    result.add_argument('--consumer-case', help='Actual frozen case ID supplied by operator, only for index/read')
    result.add_argument('--consumer-agent', help='Actual returned native agent identity supplied by operator, never invented')
    result.add_argument('--input', action='append', nargs=2, metavar=('PATH', 'SHA256'), default=[],
                        help='Explicit additional existing file and its intended SHA-256; repeatable')
    result.add_argument('--control', action='append', nargs=3, metavar=('TARGET', 'SOURCE', 'SHA256'), default=[],
                        help='Bind target to exact intended source bytes without installing it; repeatable')
    return result


def build(args):
    require(bool(re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9._-]{1,159}', args.operation_id)),
            'operation-id must be a new 2..160 character filename-safe identity')
    command_path = new_external_path(args.command_file)
    output_path = new_external_path(args.result_dir)
    require(command_path != output_path and output_path not in command_path.parents,
            'command file must be separate from the future result directory')
    require(ROOT.resolve(strict=True) == ROOT and CWD.resolve(strict=True) == CWD,
            'source/runtime root alias')
    require(not (ROOT / '.git').exists(), 'evaluation root unexpectedly became a Git repository')
    fixed = {path: stamp(path, pin) for path, pin in PINS.items()}
    receipt = json.loads(PREPARE_RECEIPT.read_bytes())
    guarded_receipt_03 = json.loads(GUARDED_PREPARE_RECEIPT_03.read_bytes())
    lock = json.loads(BYTE_LOCK.read_bytes())
    prepared = json.loads(PREPARED.read_bytes())
    require(receipt['returned_candidate_id'] == CANDIDATE and receipt['exit_code'] == 0,
            'original prepare receipt identity mismatch')
    require(receipt['input_files_before'] == receipt['input_files_after'], 'prepare inputs were not stable')
    require(len(receipt['input_files_before']) == 716, 'original 716 input rows changed')
    require(lock['candidate_id'] == CANDIDATE and len(lock['files']) == 1170, 'runtime lock identity/count changed')
    require(prepared['schema'] == 'genesis-native-prepared/v2' and prepared['candidate_id'] == CANDIDATE,
            'prepared candidate identity mismatch')
    candidate = prepared['candidate']
    require(candidate['original_candidate'] == ORIGINAL_CANDIDATE and candidate['repo_root'] == str(ROOT)
            and candidate['observed_head'] is None, 'prepared lineage/root mismatch')
    require(PREPARED.read_bytes() == BASELINE_PREPARED_02.read_bytes(),
            'prepare-03 bytes differ from the audited prepare-02 candidate')
    primary_evidence = validate_primary_evidence(receipt, lock, guarded_receipt_03, fixed, prepared)
    expected, categories, order, intended_sources = {}, {}, [], {}

    def add(row, category, verify=True):
        validate_row(row)
        key = row['path']
        if key in expected:
            require(expected[key] == row, 'conflicting expected bytes for ' + key)
        else:
            expected[key] = dict(row)
            order.append(key)
        categories.setdefault(key, []).append(category)
        if verify:
            require(stamp(key) == row, 'pinned bytes drifted: ' + key)

    for row in receipt['input_files_before']:
        add(row, 'prepare-02-original-input')
    for row in lock['files']:
        add(row, 'external-runtime-byte-lock')
    for path, row in fixed.items():
        add(row, 'fixed-control:' + path.name)
    add(stamp(Path(__file__).resolve()), 'config-builder-current-bytes')

    def intended(target, source, pin, label):
        target = full_path(target)
        # nativePath rejects .atlas data references. Only state marker/policies use
        # .atlas; binding and decision bytes occupy the explicit source namespace.
        # No extra input is permitted to redefine any of the 716/1170 pinned rows.
        if ROOT in target.parents:
            if target not in STATE_CONTROLS:
                require(target == binding_target(str(target.relative_to(ROOT))),
                        'invalid binding target: ' + str(target))
        else:
            outside_sources(target)
        source = regular(source)
        source_row = stamp(source, pin)
        add(source_row, label + ':intended-source')
        target_row = dict(source_row, path=str(target))
        # Future installed controls can be absent or currently contain a different policy.
        # The fixed recorder will require these exact intended bytes before any operation.
        if target.exists():
            regular(target)
        add(target_row, label + ':intended-target', verify=False)
        if str(target) in intended_sources:
            previous_source = intended_sources[str(target)]
            require(previous_source.read_bytes() == source.read_bytes(), 'conflicting intended source bytes')
        intended_sources[str(target)] = source
        return target

    def intended_bytes(target):
        target = full_path(target)
        require(str(target) in expected, 'missing explicit expected control: ' + str(target))
        source = intended_sources.get(str(target), target)
        raw = regular(source).read_bytes()
        row = expected[str(target)]
        require(len(raw) == row['byte_length'] and digest(raw) == row['sha256'],
                'intended control bytes drifted: ' + str(target))
        return source, raw

    for value, pin in args.input:
        add(stamp(full_path(value), pin), 'explicit-additional-input')
    for target, source, pin in args.control:
        intended(target, source, pin, 'explicit-control')

    argv = [str(BUN), 'scripts/genesis-evaluation.ts', args.operation, str(ROOT)]
    consumer = None
    reader_policy_check = None
    if args.operation == 'init-store':
        require(args.generation is not None and SHA256.fullmatch(args.generation) is not None,
                'init-store requires the exact 64-hex --generation')
        require(not any([args.approval, args.approval_source, args.approval_sha256, args.query,
                         args.query_sha256, args.consumer_case, args.consumer_agent]),
                'init-store accepts no approval, query or consumer metadata')
        argv += [str(PREPARED), args.generation]
    elif args.operation == 'admit':
        require(args.generation is None and args.query is None and args.query_sha256 is None
                and args.consumer_case is None and args.consumer_agent is None,
                'admit accepts no generation, query or consumer metadata')
        require(args.approval and args.approval_sha256, 'admit requires --approval and --approval-sha256')
        approval_relative = args.approval
        if approval_relative.startswith('/'):
            require(approval_relative.startswith(str(ROOT) + '/'),
                    'original admit entrypoint requires approval inside the evaluation root')
            approval_relative = approval_relative[len(str(ROOT)) + 1:]
        target = binding_target(approval_relative)
        source = args.approval_source if args.approval_source is not None else target
        target = intended(target, source, args.approval_sha256, 'admission-binding')
        # Bind every decision request/response path and its intended bytes too.
        # This checks transport shape/paths only, never verdict validity or authority.
        _, binding_raw = intended_bytes(target)
        binding = json.loads(binding_raw)
        require(isinstance(binding, dict) and isinstance(binding.get('decisions'), list),
                'binding must carry explicit decision references')
        for index, decision in enumerate(binding['decisions']):
            require(isinstance(decision, dict), 'decision must be an object')
            for role in ('request_ref', 'response_ref'):
                ref = decision.get(role)
                require(isinstance(ref, dict), 'decision reference missing: ' + str(index) + '/' + role)
                ref_target = binding_target(ref.get('payload_path', ref.get('path')))
                require(str(ref_target) in expected,
                        'request/response needs explicit --input/--control pin: ' + str(ref_target))
                require(expected[str(ref_target)]['sha256'] == ref.get('sha256'),
                        'decision reference disagrees with intended bytes: ' + str(ref_target))
                intended_bytes(ref_target)
        argv += [str(PREPARED), native_relative(str(target.relative_to(ROOT)))]
    else:
        require(args.generation is None and not any([args.approval, args.approval_source, args.approval_sha256]),
                'index/read accepts no generation or approval arguments')
        require(args.query is not None and args.query_sha256 is not None,
                'index/read requires --query and --query-sha256')
        query = regular(outside_sources(args.query))
        native_relative(query.name)  # CLI reads external controls using nativePath(basename).
        add(stamp(query, args.query_sha256), 'external-reader-query')
        validate_query(json.loads(query.read_bytes()), args.operation)
        argv.append(str(query))
        require(bool(args.consumer_case) == bool(args.consumer_agent),
                'consumer-case and consumer-agent must be supplied together from actual context')
        if args.consumer_case:
            plan = json.loads((ROOT / candidate['plan_path']).read_bytes())
            require(args.consumer_case in plan['consumer_ids'], 'consumer case is outside the fixed 14 cases')
            require(bool(args.consumer_agent.strip()) and args.consumer_agent == args.consumer_agent.strip(),
                    'consumer-agent must be the exact actual returned identity')
            consumer = {'case_id': args.consumer_case, 'native_agent_id': args.consumer_agent,
                        'mode': plan['consumer_modes'][args.consumer_case],
                        'identity_source': 'explicit operator arguments; not invented or authenticated by builder'}
    if args.operation != 'init-store':
        required_state = [ROOT / '.atlas' / name for name in
                          ('evaluation-store.json', 'evaluation-policy.json', 'policy.json')]
        require(all(str(path) in expected for path in required_state),
                'admit/index/read requires explicit --input/--control pins for marker and both policies')
    if args.operation in ('index', 'read'):
        policy_target = ROOT / '.atlas/evaluation-policy.json'
        policy_source, policy_raw = intended_bytes(policy_target)
        policy = json.loads(policy_raw)
        require(isinstance(policy, dict) and policy.get('schema') == 'ownership-evaluation-policy/v1',
                'reader needs intended native evaluation policy bytes')
        policy_consumer = policy.get('consumer')
        require(isinstance(policy_consumer, dict) and set(policy_consumer) == {'id', 'mode'},
                'reader policy must bind the actual finite case and mode')
        plan = json.loads((ROOT / candidate['plan_path']).read_bytes())
        require(policy_consumer['id'] in plan['consumer_ids']
                and plan['consumer_modes'][policy_consumer['id']] == policy_consumer['mode'],
                'reader policy consumer differs from the frozen plan')
        if consumer is not None:
            require(policy_consumer == {'id': consumer['case_id'], 'mode': consumer['mode']},
                    'supplied consumer metadata differs from native policy budget case/mode')
        installed_matches = (policy_target.exists()
                             and digest(regular(policy_target).read_bytes()) == digest(policy_raw))
        reader_policy_check = {
            'intended_policy_source': str(policy_source), 'intended_policy_sha256': digest(policy_raw),
            'native_budget_consumer': policy_consumer,
            'supplied_consumer_metadata_matches': None if consumer is None else True,
            'installed_policy_currently_matches_intended_bytes': installed_matches,
            'limit': 'If intended policy is not installed, the fixed recorder must reject until exact target bytes exist. No agent identity is inferred from policy.',
        }
    nominal = {} if args.operation == 'init-store' else {'ATLAS_ACTOR': ACTOR}
    config = {
        'execution_id': EXECUTION, 'operation_id': args.operation_id,
        'operation': 'evaluation-' + args.operation,
        'code_root': str(RUNTIME), 'corpus_root': str(ROOT),
        'runtime_revision': RUNTIME_REVISION, 'corpus_revision': None,
        'require_no_atlas_state': False,
        'bun': str(BUN), 'cwd': str(CWD), 'command_argv': argv,
        'nominal_environment': nominal,
        'unset_environment': ['ATLAS_ACTOR', 'ATLAS_RATIFY_TOKEN'],
        'release_pin': {
            'state': 'FIXED_PREPARE_QUALIFICATION_RELEASE_NOT_DOMAIN_ACCEPTANCE',
            'release_id': '20261128-s4-runtime-db9b423-prepare-v1',
            'release_revision': RELEASE_REVISION,
            'payload_revision': 'da9800f55f31926f33c41a5ca2fd88bf26fcaccc',
            'runtime_revision': RUNTIME_REVISION,
            'release_manifest_sha256': '2922f769ea2b533d06748a4c10471b19deba3fd0c41b8f1bf7930512eaa75af1',
        },
        'candidate_id': CANDIDATE, 'original_candidate': ORIGINAL_CANDIDATE,
        'prepare_evidence': primary_evidence,
        'input_files': order, 'expected_input_files': [expected[path] for path in order],
        'output_files': [],
        'configuration': {
            'schema': 'genesis-s2-operation-configuration/v1',
            'created_at': datetime.datetime.now(datetime.timezone.utc).isoformat(),
            'state': 'NOT_RUN_CONFIGURATION_ONLY',
            'intended_output_dir': str(output_path),
            'builder': stamp(Path(__file__).resolve()),
            'wrapper': fixed[WRAPPER], 'recorder': fixed[RECORDER],
            'baseline_input_rows': 716, 'runtime_lock_rows': 1170,
            'input_sources': categories,
            'consumer': consumer,
            'reader_policy_check': reader_policy_check,
            'limits': [
                'Building this file neither executes Atlas nor initializes state, installs policy, admits a candidate or creates a vote.',
                'Runtime controls whose targets are not yet installed are bound to explicit intended source bytes; recorder verifies the target before execution.',
                'External byte guard supplements the fixed candidate without changing intrinsic runtime_identity.',
                'Actor is a nominal local declaration. Consumer identities are only supplied actual arguments; no authentication is inferred.',
                'Reserved answers, oracle contents and producer hints are not inserted into query controls or consumer metadata.',
            ],
        },
    }
    require(config['input_files'] == [row['path'] for row in config['expected_input_files']], 'input alignment')
    require(len(order) == len(set(order)), 'duplicate paths')
    return command_path, output_path, config


def main():
    args = parser().parse_args()
    command_path, output_path, config = build(args)
    raw = (json.dumps(config, ensure_ascii=False, indent=2) + '\n').encode()
    with command_path.open('xb') as stream:
        stream.write(raw)
        stream.flush()
        os.fsync(stream.fileno())
    print(json.dumps({'state': 'CONFIGURATION_WRITTEN_RUNTIME_NOT_RUN',
                      'command_file': str(command_path), 'byte_length': len(raw), 'sha256': digest(raw),
                      'expected_input_files': len(config['expected_input_files']),
                      'intended_output_dir': str(output_path), 'output_dir_created': False,
                      'future_capture_argv': ['python', str(WRAPPER), str(command_path), str(output_path)]}))


if __name__ == '__main__':
    main()
