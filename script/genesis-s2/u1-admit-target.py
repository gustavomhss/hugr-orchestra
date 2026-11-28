#!/usr/bin/env python3
"""Finalize, stop and separately resume one independently reviewed S2-U1 target."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess

RUNTIME = '9b0188b2be5ea69638dff8a44e3e931b4d6d8b10'
PREFIX = 'modules/atlas/docs/design/genesis-chatgpt-results/20261111-v3-fresh/s2/resume-20261128/evaluation-v2'
SOURCES = {'M1': '9e1d1a2b77d329251082352b6e66d7f8e9cccd0d339a534999714b9f2f6dcb08',
           'M2': '0970f4ddb99c1c004e200443abc54ed5ea38cec098e19ef9aa748b771238dfb5'}
SECTION = '1. Startup, readiness and shutdown'


def require(condition, message):
    if not condition:
        raise ValueError(message)


def sha(data):
    return hashlib.sha256(data).hexdigest()


def encoded(value):
    return (json.dumps(value, ensure_ascii=False, indent=2) + '\n').encode()


def write(path, data):
    with path.open('xb') as stream:
        stream.write(data)
        stream.flush()
        os.fsync(stream.fileno())


def inventory(root):
    rows = []
    for path in sorted(root.rglob('*')):
        require(not path.is_symlink(), 'symlink in sealed tree: ' + str(path))
        if path.is_file():
            require(path.stat().st_nlink == 1, 'hardlink in sealed tree: ' + str(path))
            rows.append({'path': str(path.relative_to(root)), 'bytes': path.stat().st_size, 'sha256': sha(path.read_bytes())})
    return rows


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--phase', choices=['finalize', 'resume', 'restore-capture'], required=True)
    parser.add_argument('--target', choices=['M1', 'M2'], required=True)
    parser.add_argument('--request', type=Path, required=True, help='Actual successful target prepare driver request')
    parser.add_argument('--target-file', type=Path, required=True, help='Complete prepared-evaluation-update result')
    parser.add_argument('--callback-root', type=Path, required=True, help='Existing producer callback checkpoint tree')
    parser.add_argument('--binding-directory', type=Path, required=True, help='Committed exact target-specific seal and review pair')
    parser.add_argument('--output', type=Path, required=True, help='Fresh independent finalize/resume checkpoint directory')
    args = parser.parse_args()
    require(os.environ.get('GITHUB_ACTIONS') == 'true' and os.environ.get('GITHUB_EVENT_NAME') == 'workflow_dispatch'
            and os.environ.get('GITHUB_REPOSITORY') == 'gustavomhss/hugr-orchestra'
            and os.environ.get('GITHUB_REF') == 'refs/heads/genesis-interfaces-resume', 'manual isolated GitHub run required')
    repo = Path(os.environ['GITHUB_WORKSPACE']).resolve(strict=True)
    base = Path(os.environ['RUNNER_TEMP']).resolve(strict=True) / 'genesis-s2-u1-v1'
    runtime = base / 'runtime'
    require(subprocess.check_output(['git', '-C', str(runtime), 'rev-parse', 'HEAD'], text=True).strip() == RUNTIME, 'runtime drift')
    require(subprocess.check_output(['git', '-C', str(repo), 'rev-parse', 'HEAD'], text=True).strip() == os.environ['GITHUB_SHA'], 'checkout drift')
    request_path, target_path = args.request.resolve(strict=True), args.target_file.resolve(strict=True)
    callback_root = args.callback_root.resolve(strict=True)
    out = args.output.absolute()
    require(all(p.is_relative_to(base / 'evidence') for p in (request_path, target_path, callback_root, out)), 'checkpoint paths outside hosted evidence')
    binding_dir = args.binding_directory.resolve(strict=True)
    require(binding_dir == repo / 'script/genesis-s2/u1-target-binding' / args.target.lower(), 'unexpected binding directory')
    def committed(path):
        data = subprocess.check_output(['git', '-C', str(repo), 'show', 'HEAD:' + path.relative_to(repo).as_posix()])
        require(path.read_bytes() == data, 'uncommitted review evidence')
        return data
    seal_raw = committed(binding_dir / 'seal.json')
    seal = json.loads(seal_raw)
    require(seal['schema'] == 'genesis-s2-u1-target-seal/v1' and seal['target'] == args.target, 'target seal mismatch')
    binding_raw = committed(binding_dir / 'approval.json')
    require(sha(binding_raw) == seal['approval_sha256'], 'approval bytes mismatch')
    binding = json.loads(binding_raw)
    raw_target = target_path.read_bytes()
    require(sha(raw_target) == seal['target_sha256'], 'target bytes differ from reviewed seal')
    target = json.loads(raw_target)
    require(target['kind'] == 'prepared-evaluation-update', 'complete target required')
    prepared = target['prepared']
    candidate = prepared['candidate']
    root = Path(candidate['repo_root']).resolve(strict=True)
    require(root.is_relative_to(base / 'evidence/run') and root != base / 'evidence/run/corpus', 'target must be isolated sibling')
    require(not out.is_relative_to(root) and not out.is_relative_to(callback_root) and not callback_root.is_relative_to(out), 'checkpoint directories must be independent')
    require(prepared['candidate_id'] == seal['candidate_id'] and target['targetGeneration'] == seal['generation']
            and candidate['evaluation'] == seal['evaluation'] and candidate['scope'] == 'orchestra.interfaces', 'reviewed target identity mismatch')
    require(sha((root / 'apps/desktop/src/main/owned-serve.ts').read_bytes()) == SOURCES[args.target], 'target source bytes mismatch')
    require(len(candidate['entries']) == len({e['key'] for e in candidate['entries']}) == 13, 'target coverage')
    selected = next(e for e in candidate['entries'] if e['key'] == 's2.l1.desktop-web')
    require(selected['artifact']['result'] == seal['expected_result'], 'reviewed result mismatch')
    plan = json.loads((root / PREFIX / 'u1-driver/u1-plan.json').read_bytes())
    require('S2-U1-' + args.target + '-current' in plan['read_probes']['ids'] and plan['read_probes']['mode'] == 'routine', 'probe absent from frozen plan')
    require(binding['candidate_id'] == prepared['candidate_id'] and len(binding['reviewers']) == len(set(binding['reviewers'])) == 2
            and len(binding['decisions']) == 2, 'fresh target review pair required')
    review_files = {}
    for decision in binding['decisions']:
        require(decision['candidate_id'] == prepared['candidate_id'] and decision['reviewer'] in binding['reviewers'] and decision['verdict'] == 'PASS', 'target decision mismatch')
        for field in ('request_ref', 'response_ref'):
            ref = decision[field]
            name = Path(ref['payload_path']).name
            require(ref['payload_path'] == 'u1-' + args.target.lower() + '-binding/' + name and name not in ('', '.', '..', 'approval.json'), 'review reference path')
            data = committed(binding_dir / name)
            require(sha(data) == ref['sha256'], 'review reference digest mismatch')
            require(name not in review_files or review_files[name] == data, 'conflicting review reference')
            review_files[name] = data
    require(len({d['reviewer'] for d in binding['decisions']}) == 2 and len({d['response_ref']['sha256'] for d in binding['decisions']}) == 2, 'review independence mismatch')
    request = json.loads(request_path.read_bytes())
    require(request['mode'] == 'prepare' and request['runtime_root'] == str(runtime) and request['corpus_root'] == str(root)
            and request['target_repo_root'] == str(root) and request['target_generation'] == target['targetGeneration'], 'prepare request mismatch')
    driver = repo / 'script/genesis-s2/u1-driver.ts'
    driver_copy = root / PREFIX / 'u1-driver/u1-driver.ts'
    require(committed(driver) == driver_copy.read_bytes(), 'pinned driver drift')
    env = {**os.environ, 'ATLAS_ACTOR': '/root', 'ATLAS_RATIFY_TOKEN': '/root'}
    def invoke(tag, argv, expected=0):
        result = subprocess.run(argv, cwd=runtime / 'modules/atlas', env=env, stdin=subprocess.DEVNULL, capture_output=True, check=False)
        write(out / (tag + '.stdout'), result.stdout)
        write(out / (tag + '.stderr'), result.stderr)
        write(out / (tag + '.receipt.json'), encoded({'argv': argv, 'exit_code': result.returncode, 'stdout_sha256': sha(result.stdout), 'stderr_sha256': sha(result.stderr)}))
        require(result.returncode == expected, tag + ' failed; inspect receipt')
        return json.loads(result.stdout)
    if args.phase == 'restore-capture':
        require(args.target == 'M1' and out.is_dir(), 'admitted M1 required to capture restoration')
        summary = json.loads((out / 'summary.json').read_bytes())
        require(summary['status'] == 'TARGET_ADMITTED_AND_CURRENT_READ' and summary['candidate_id'] == prepared['candidate_id']
                and summary['generation'] == target['targetGeneration'] and summary['seal_sha256'] == sha(seal_raw), 'M1 admission checkpoint mismatch')
        restored_root = root.parent / 'corpus-u1-restored'
        require(not restored_root.exists() and not (out / 'restoration-capture').exists(), 'restoration root already exists')
        source_before = inventory(root)
        def only_cas(directory, names):
            return set(names) - {'cas'} if Path(directory) == root / '.atlas' else ()
        shutil.copytree(root, restored_root, ignore=only_cas)
        restored_before = inventory(restored_root)
        require(restored_before == [p for p in source_before if not p['path'].startswith('.atlas/') or p['path'].startswith('.atlas/cas/')],
                'restoration clone drift')
        require(sorted(p.name for p in (restored_root / '.atlas').iterdir()) == ['cas'], 'restored root inherited operational state')
        source = restored_root / plan['source']['path']
        variant = source.read_bytes()
        after = plan['source']['after'].encode()
        require(variant.count(after) == 1 and sha(variant) == SOURCES['M1'], 'changed source anchor drift')
        original = variant.replace(after, plan['source']['before'].encode())
        require(sha(original) == SOURCES['M2'], 'restored source bytes differ')
        source.write_bytes(original)
        restore = {k: v for k, v in request.items() if k not in ('outputs_file', 'outputs_sha256')}
        restore.update({'corpus_root': str(restored_root), 'target_repo_root': str(restored_root), 'baseline_file': str(out / 'target-prepared.json'),
            'manifest': summary['admitted_manifest'], 'target_generation': sha(('s2-u1-target:' + prepared['candidate_id'] + ':m2').encode()),
            'context': {'evaluation': candidate['evaluation'], 'evaluationCandidate': prepared['candidate_id'], 'generation': target['targetGeneration']}})
        restored_plan_request = out / 'restoration-plan-request.json'
        write(restored_plan_request, encoded({**restore, 'mode': 'plan', 'checkpoint_dir': str(out / 'restoration-plan')}))
        planned = invoke('restoration-plan', ['bun', str(driver), str(restored_plan_request)])
        require(planned['kind'] == 'ownership-update-plan' and planned['affected'] == target['affected']
                and set(planned['unaffected']) == set(plan['outside']), 'restoration planner differs from original closure')
        capture_request = out / 'restoration-capture-request.json'
        write(capture_request, encoded({**restore, 'mode': 'prepare', 'checkpoint_dir': str(out / 'restoration-capture')}))
        hold = invoke('restoration-capture', ['bun', str(driver), str(capture_request)], expected=1)
        require(hold['kind'] == 'hold' and any('sealed-producer-output-required:' in detail for detail in hold['evidence']), 'restoration did not reach the callback gate')
        snapshots = list((out / 'restoration-capture').glob('snapshot-*.json'))
        require(len(snapshots) == 1 and json.loads(snapshots[0].read_bytes())['key'] == planned['affected'][0]
                and snapshots[0].name == 'snapshot-' + sha(snapshots[0].read_bytes()) + '.json', 'unexpected restoration snapshot')
        require(inventory(root) == source_before, 'restoration changed the admitted M1 root')
        write(out / 'restoration-summary.json', encoded({'status': 'RESTORED_SOURCE_CAPTURED_AWAITING_RECIPE_EVIDENCE',
            'baseline_candidate': prepared['candidate_id'], 'baseline_manifest': summary['admitted_manifest'], 'generation': restore['target_generation'],
            'source_sha256': sha(original), 'affected': planned['affected'], 'first_snapshot_sha256': sha(snapshots[0].read_bytes()), 'first_key': planned['affected'][0]}))
        producer_dir = repo / 'script/genesis-s2/u1-producers/m2'
        manifest_path = producer_dir / 'manifest.json'
        if not manifest_path.exists():
            return
        manifest = json.loads(committed(manifest_path))
        require(manifest['schema'] == 'genesis-s2-u1-producer-evidence/v1' and manifest['baseline_candidate'] == prepared['candidate_id']
                and manifest['baseline_manifest'] == summary['admitted_manifest'] and manifest['generation'] == restore['target_generation']
                and manifest['first_snapshot_sha256'] == sha(snapshots[0].read_bytes()), 'M2 replay manifest mismatch')
        def evidence(relative):
            path = (producer_dir / relative).resolve(strict=True)
            require(path.is_relative_to(producer_dir), 'M2 evidence escaped its scope')
            return {'path': str(path), 'sha256': sha(committed(path))}
        producers = [{'key': row['key'], 'snapshot_sha256': row['snapshot_sha256'], 'producer_id': row['producer_id'],
                      'response': evidence(row['response']), 'decisions': [evidence(p) for p in row['decisions']]} for row in manifest['producers']]
        sealer = repo / 'script/genesis-s2/u1-output-seal.ts'
        committed(sealer)
        seal_request = {**restore, 'planner_file': str(out / 'restoration-plan.stdout'), 'checkpoint_dir': str(out / 'restoration-capture'),
            'snapshot_file': str(snapshots[0]), 'producers': producers, 'retention_review': evidence(manifest['retention_review']),
            'output_dir': str(out / 'restoration-sealed')}
        seal_request_file = out / 'restoration-seal-request.json'
        write(seal_request_file, encoded(seal_request))
        staged = invoke('restoration-seal', ['bun', str(sealer), str(seal_request_file)])
        registry = out / 'restoration-sealed/outputs.json'
        require(staged['status'] == 'READY_FOR_EXACT_PREPARE' and sha(registry.read_bytes()) == staged['registry_sha256'], 'M2 registry incomplete')
        restore_checkpoint = out / 'restoration-prepared-checkpoint'
        prepare_request_file = out / 'restoration-prepare-request.json'
        write(prepare_request_file, encoded({**restore, 'mode': 'prepare', 'checkpoint_dir': str(restore_checkpoint),
            'outputs_file': str(registry), 'outputs_sha256': staged['registry_sha256']}))
        complete = invoke('restoration-prepare', ['bun', str(driver), str(prepare_request_file)])
        exact_m2 = restore_checkpoint / 'result.json'
        require(complete['kind'] == 'prepared-evaluation-update' and complete == json.loads(exact_m2.read_bytes()), 'M2 durable result differs')
        verify_request_file = out / 'restoration-verify-request.json'
        write(verify_request_file, encoded({**seal_request, 'output_dir': str(out / 'restoration-verified'),
            'prepared_run_file': str(exact_m2), 'prepared_callbacks_file': str(restore_checkpoint / 'callbacks.jsonl')}))
        verified = invoke('restoration-verify', ['bun', str(sealer), str(verify_request_file)])
        original_candidate = json.loads(Path(request['baseline_file']).read_bytes())['candidate']
        before = {entry['key']: entry['artifact']['result'] for entry in original_candidate['entries']}
        after = {entry['key']: entry['artifact']['result'] for entry in complete['prepared']['candidate']['entries']}
        require(before == after and len(after) == 13 and verified['actual_prepare_verification'] == 'MATCHED_OBSERVED_CALLBACKS_AND_RESULTS',
                'restored M2 does not reproduce all M0 result identities')
        require(inventory(root) == source_before, 'M2 prepare changed the admitted M1 root')
        write(out / 'restoration-prepare-summary.json', encoded({'status': 'M2_PREPARED_ALL_M0_RESULTS_RESTORED_REQUIRES_ADMIT',
            'candidate_id': complete['prepared']['candidate_id'], 'generation': complete['targetGeneration'], 'target_sha256': sha(exact_m2.read_bytes()),
            'manifest_baseline': summary['admitted_manifest'], 'observed_callbacks': complete['calls'], 'restored_original_results': len(after)}))
        return
    if args.phase == 'finalize':
        require(not out.exists() and sorted(p.name for p in (root / '.atlas').iterdir()) == ['cas'], 'fresh target CAS required')
        out.mkdir(parents=True)
        destination = root / ('u1-' + args.target.lower() + '-binding')
        require(not destination.exists(), 'fresh target review directory required')
        destination.mkdir()
        for name, data in review_files.items():
            write(destination / name, data)
        write(destination / 'approval.json', binding_raw)
        prepared_path = out / 'target-prepared.json'
        write(prepared_path, encoded(prepared))
        final_request = {**request, 'mode': 'finalize', 'checkpoint_dir': str(out / 'finalize-checkpoint'), 'target_file': str(target_path), 'binding_file': str(destination / 'approval.json')}
        final_request_path = out / 'finalize-request.json'
        write(final_request_path, encoded(final_request))
        before_callbacks = inventory(callback_root)
        final = invoke('finalize', ['bun', str(driver), str(final_request_path)])
        require(final['kind'] == 'private-evaluation-candidate' and final['prepared'] == prepared
                and final['context']['generation'] == target['targetGeneration'], 'private finalization mismatch')
        events = (out / 'finalize-checkpoint/callbacks.jsonl').read_text().splitlines()
        require(not any(json.loads(line)['event'].startswith('callback-') for line in events), 'finalization invoked recipe')
        require(before_callbacks == inventory(callback_root), 'producer callback state changed during finalization')
        require(sorted(p.name for p in (root / '.atlas').iterdir()) == ['cas'], 'finalization created operational state')
        lock = {'schema': 'genesis-s2-u1-resume-lock/v1', 'target': args.target, 'pid': os.getpid(), 'candidate_id': prepared['candidate_id'],
                'generation': target['targetGeneration'], 'private_manifest': final['manifest'], 'seal_sha256': sha(seal_raw),
                'request_sha256': sha(request_path.read_bytes()), 'target_sha256': sha(raw_target), 'callbacks': before_callbacks,
                'root_inventory': inventory(root), 'finalize_checkpoint': inventory(out / 'finalize-checkpoint')}
        write(out / 'resume-lock.json', encoded(lock))
        return
    require(out.is_dir(), 'missing finalized checkpoint')
    lock = json.loads((out / 'resume-lock.json').read_bytes())
    require(lock['schema'] == 'genesis-s2-u1-resume-lock/v1' and lock['target'] == args.target and lock['pid'] != os.getpid(), 'separate-process resume required')
    require(lock['candidate_id'] == prepared['candidate_id'] and lock['generation'] == target['targetGeneration'] and lock['seal_sha256'] == sha(seal_raw)
            and lock['request_sha256'] == sha(request_path.read_bytes()) and lock['target_sha256'] == sha(raw_target), 'resume identity drift')
    require((out / 'target-prepared.json').read_bytes() == encoded(prepared), 'prepared target changed after finalization')
    require(lock['callbacks'] == inventory(callback_root) and lock['root_inventory'] == inventory(root)
            and lock['finalize_checkpoint'] == inventory(out / 'finalize-checkpoint'), 'resume checkpoint drift')
    require(sorted(p.name for p in (root / '.atlas').iterdir()) == ['cas'], 'resume requires fresh target store')
    cli = ['bun', 'scripts/genesis-evaluation.ts']
    init = invoke('init-store', cli + ['init-store', str(root), str(out / 'target-prepared.json'), target['targetGeneration']])
    require(init['kind'] == 'evaluation-store-initialized', 'unexpected initialization')
    marker = json.loads((root / '.atlas/evaluation-store.json').read_bytes())
    for key, value in {'root': str(root), 'evaluationPlan': candidate['evaluation']['evaluationPlan'], 'obligationSet': candidate['evaluation']['obligationSet'],
                       'evaluationCandidate': prepared['candidate_id'], 'generation': target['targetGeneration'], 'scope': candidate['scope'], 'initialized_cas_only': True}.items():
        require(marker.get(key) == value, 'marker mismatch: ' + key)
    policy = {'t0Heuristic': {'keywords': ['auth', 'payments', 'secrets', 'kms', 'crypto', 'billing']}, 'authz': {'scopes': {'orchestra.interfaces': ['/root']}, 'anchors': {'.': 'orchestra.interfaces'}}}
    access = {'schema': 'ownership-evaluation-policy/v1', 'root': str(root), 'evaluationPlan': candidate['evaluation']['evaluationPlan'],
              'obligationSet': candidate['evaluation']['obligationSet'], 'evaluationCandidate': prepared['candidate_id'], 'generation': target['targetGeneration'],
              'scope': candidate['scope'], 'actor': '/root', 'operations': ['admit'], 'consumer': None}
    write(root / '.atlas/policy.json', encoded(policy))
    write(root / '.atlas/evaluation-policy.json', encoded(access))
    admit = invoke('admit-target', cli + ['admit-target', str(root), str(out / 'target-prepared.json'), 'u1-' + args.target.lower() + '-binding/approval.json'])
    require(admit['candidate_id'] == prepared['candidate_id'] and admit['generation'] == target['targetGeneration']
            and admit['emission']['ok'] is True and admit['emission']['data']['emitted'] is True, 'target admission did not emit')
    manifest = admit['ownership']
    require(isinstance(manifest, str) and re.fullmatch('[0-9a-f]{64}', manifest), 'admitted manifest invalid')
    read_policy = {**access, 'operations': ['read'], 'consumer': {'id': 'S2-U1-' + args.target + '-current', 'mode': 'routine'}}
    (root / '.atlas/evaluation-policy.json').write_bytes(encoded(read_policy))
    write(out / 'read-policy.json', encoded(read_policy))
    query = {'scope': candidate['scope'], 'key': 's2.l1.desktop-web', 'section': SECTION, 'maxBytes': 5000}
    write(out / 'read-query.json', encoded(query))
    read = invoke('read-current', cli + ['read', str(root), str(out / 'read-query.json')])
    require(read['kind'] == 'ready' and read['historical'] is False and read['manifest'] == manifest and read['result'] == seal['expected_result']
            and read['key'] == query['key'] and read['evaluation']['generation'] == target['targetGeneration'], 'current read identity mismatch')
    seconds = '150' if args.target == 'M1' else '120'
    pattern = rf'\b(?:{seconds}[ -]?(?:seconds?|s)|{seconds}[ ,_]?000\s*(?:ms|milliseconds?))\b'
    require(re.search(pattern, read['body'], re.IGNORECASE) is not None, 'current section does not report required timeout')
    require(lock['callbacks'] == inventory(callback_root), 'callback occurred after finalization')
    write(out / 'summary.json', encoded({'status': 'TARGET_ADMITTED_AND_CURRENT_READ', 'target': args.target, 'candidate_id': prepared['candidate_id'],
          'generation': target['targetGeneration'], 'private_manifest': lock['private_manifest'], 'admitted_manifest': manifest,
          'reviewed_result': seal['expected_result'], 'section': SECTION, 'callback_state_unchanged': True, 'seal_sha256': sha(seal_raw)}))


if __name__ == '__main__':
    main()
