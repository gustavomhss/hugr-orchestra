#!/usr/bin/env python3
"""Finalize, stop and separately resume one independently reviewed S2-U1 target."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
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
    parser.add_argument('--phase', choices=['finalize', 'resume'], required=True)
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
    def invoke(tag, argv):
        result = subprocess.run(argv, cwd=runtime / 'modules/atlas', env=env, stdin=subprocess.DEVNULL, capture_output=True, check=False)
        write(out / (tag + '.stdout'), result.stdout)
        write(out / (tag + '.stderr'), result.stderr)
        write(out / (tag + '.receipt.json'), encoded({'argv': argv, 'exit_code': result.returncode, 'stdout_sha256': sha(result.stdout), 'stderr_sha256': sha(result.stderr)}))
        require(result.returncode == 0, tag + ' failed; inspect receipt')
        return json.loads(result.stdout)
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
    pattern = r'\b(?:150\s*(?:seconds?|s)|150[ ,_]?000\s*(?:ms|milliseconds?))\b' if args.target == 'M1' else r'\b(?:120\s*(?:seconds?|s)|120[ ,_]?000\s*(?:ms|milliseconds?))\b'
    require(re.search(pattern, read['body'], re.IGNORECASE) is not None, 'current section does not report required timeout')
    require(lock['callbacks'] == inventory(callback_root), 'callback occurred after finalization')
    write(out / 'summary.json', encoded({'status': 'TARGET_ADMITTED_AND_CURRENT_READ', 'target': args.target, 'candidate_id': prepared['candidate_id'],
          'generation': target['targetGeneration'], 'private_manifest': lock['private_manifest'], 'admitted_manifest': manifest,
          'reviewed_result': seal['expected_result'], 'section': SECTION, 'callback_state_unchanged': True, 'seal_sha256': sha(seal_raw)}))


if __name__ == '__main__':
    main()
