#!/usr/bin/env python3
"""Amend exact L2 recipes on the admitted S2 corpus and route only four retries."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess


BASELINE = 'ade18f60d8b143fc90fae24bc5c6cd1c14d1e56756800f14b65d19f7eacdf542'
MANIFEST = '5cbb56e97ad62901f5ec673d6bbf2559201cc54bc6f7faa33af92c4f825c7bbf'
GENERATION = '146c26228238c2ff0f4b274c1b0cc43b573df54b2529fcb68859820950f805ac'
RUNTIME = '9b0188b2be5ea69638dff8a44e3e931b4d6d8b10'
PREFIX = 'modules/atlas/docs/design/genesis-chatgpt-results/20261111-v3-fresh/s2/resume-20261128/evaluation-v2'
CASES = {'S2-C1', 'S2-C2', 'S2-C4', 'S2-I2U'}
DIRECT = {'s2.l2.app-session', 's2.l2.desktop-web', 's2.l2.design-tui'}


def require(condition, message):
    if not condition:
        raise ValueError(message)


def sha(data):
    return hashlib.sha256(data).hexdigest()


def load(path):
    return json.loads(path.read_bytes())


def encode(value):
    return (json.dumps(value, ensure_ascii=False, indent=2) + '\n').encode()


def write(path, value):
    with path.open('xb') as file:
        file.write(value if isinstance(value, bytes) else encode(value))


def recipe_bytes(original, key, body_sha):
    return original + (f'\n\n## S2 consumer evidence amendment\n\n'
                       f'Use the reviewed correction for `{key}`, with exact UTF-8 body SHA-256 `{body_sha}`. '
                       'Preserve all other conclusions and their original source scope.\n').encode()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--stage', choices=['prepare', 'admit'], required=True)
    args = parser.parse_args()
    require(os.environ.get('GITHUB_ACTIONS') == 'true' and os.environ.get('GITHUB_EVENT_NAME') == 'workflow_dispatch'
            and os.environ.get('GITHUB_REPOSITORY') == 'gustavomhss/hugr-orchestra'
            and os.environ.get('GITHUB_REF') == 'refs/heads/genesis-interfaces-resume', 'isolated manual workflow required')
    repo = Path(os.environ['GITHUB_WORKSPACE']).resolve(strict=True)
    base = Path(os.environ['RUNNER_TEMP']).resolve(strict=True) / 'genesis-s2-46158062855-1'
    runtime = base / 'runtime'
    run = base / 'evidence/run'
    original = run / 'corpus'
    root = run / 'corpus-corrected'
    receipts = base / 'evidence/amendment'
    pack = repo / 'script/genesis-s2/amendment'
    require(not root.exists() and not receipts.exists(), 'fresh amendment root and receipts required')
    require(subprocess.check_output(['git', '-C', str(runtime), 'rev-parse', 'HEAD'], text=True).strip() == RUNTIME, 'runtime drift')
    require(subprocess.check_output(['git', '-C', str(repo), 'rev-parse', 'HEAD'], text=True).strip() == os.environ['GITHUB_SHA'], 'checkout drift')

    def committed(path):
        data = subprocess.check_output(['git', '-C', str(repo), 'show', 'HEAD:' + path.relative_to(repo).as_posix()])
        require(path.read_bytes() == data, 'unsealed evidence: ' + str(path))
        return data

    def evidence(name):
        path = (pack / name).resolve(strict=True)
        require(path.is_relative_to(pack), 'amendment evidence path escaped its scope')
        return {'path': str(path), 'sha256': sha(committed(path))}

    admission = load(base / 'evidence/admission/summary.json')
    require(admission['state'] == 'EVALUATION_ADMITTED' and admission['candidate_id'] == BASELINE
            and admission['ownership'] == MANIFEST and admission['generation'] == GENERATION, 'original admission not reproduced')
    baseline_path = run / 'prepared.json'
    baseline = load(baseline_path)
    require(baseline['candidate_id'] == BASELINE and baseline['candidate']['repo_root'] == str(original), 'original candidate drift')
    pack_manifest = json.loads(committed(pack / 'manifest.json'))
    require(pack_manifest['schema'] == 'genesis-s2-amendment/v1' and pack_manifest['baseline_manifest'] == MANIFEST
            and len(pack_manifest['deltas']) == 3 and {row['key'] for row in pack_manifest['deltas']} == DIRECT, 'amendment scope mismatch')
    compatibility = json.loads(committed(pack / 'compatibility.json'))
    require(compatibility['source_manifest'] == MANIFEST and compatibility['hosted_reader_run'] == 46165708773
            and compatibility['authored_body_sha256'] == {row['key']: row['body_sha256'] for row in pack_manifest['deltas']}
            and compatibility['totals'] == {'cases': 10, 'reads': 14, 'identical_reads': 14, 'changed_reads': 0}
            and len({row['case'] for row in compatibility['cases']}) == 10
            and all(row['case'] not in CASES and row['all_served_bodies_identical'] for row in compatibility['cases']),
            'prior approved evidence is incompatible with correction')
    require(not any(path.is_symlink() for path in original.rglob('*')), 'corpus has a symlink')
    shutil.copytree(original, root, ignore=lambda path, names: set(names) - {'cas'} if Path(path) == original / '.atlas' else ())
    require(sorted(path.name for path in (root / '.atlas').iterdir()) == ['cas'], 'target inherited active policy or projection')
    receipts.mkdir()
    registry = repo / PREFIX / 'maintenance-static-plan/static-reconciliation.json'
    specs = json.loads(committed(registry))['recipes']
    recipes = [{'key': row['key'], 'recipe_input_key': row['recipeInputKey'], 'recipe_version': row['recipeVersion'],
                'declared_inputs': row['declaredInputs'], 'mandatory_inputs': row['mandatoryInputs'], 'required': row['required']} for row in specs]
    old_entries = {row['key']: row for row in baseline['candidate']['entries']}
    require(len(recipes) == len(old_entries) == 13 and {row['key'] for row in recipes} == set(old_entries), 'recipe coverage drift')
    producers = []
    for delta in pack_manifest['deltas']:
        key = delta['key']
        recipe = next(row for row in recipes if row['key'] == key)
        source_key = recipe['recipe_input_key']
        require(source_key.startswith('file:') and source_key[5:] == delta['recipe_path']
                and [row['key'] for row in recipes if source_key in row['declared_inputs']] == [key]
                and old_entries[key]['artifact']['result'] == delta['original_result'], 'amendment recipe or prior result drift')
        path = (root / source_key[5:]).resolve(strict=True)
        require(path.is_relative_to(root), 'recipe input escaped corrected corpus')
        before = path.read_bytes()
        after = recipe_bytes(before, key, delta['body_sha256'])
        require(sha(before) == delta['recipe_sha256_before'] and sha(after) == delta['recipe_sha256_after'], 'declared recipe bytes drift')
        response = evidence(delta['response'])
        output = load(Path(response['path']))
        require(sha(output['body'].encode()) == delta['body_sha256'], 'reviewed body drift')
        path.write_bytes(after)
        recipe['recipe_version'] = delta['recipe_version_after']
        producers.append({'key': key, 'snapshot_sha256': delta['snapshot_sha256'], 'producer_id': output['producer_id'],
                          'response': response, 'decisions': [evidence(file) for file in delta['decisions']]})

    driver = repo / 'script/genesis-s2/u1-driver.ts'
    sealer = repo / 'script/genesis-s2/u1-output-seal.ts'
    for script in (driver, sealer):
        committed(script)
    env = {**os.environ, 'ATLAS_ACTOR': '/root', 'ATLAS_RATIFY_TOKEN': '/root'}

    def invoke(tag, command, expected=0):
        call = subprocess.run(command, cwd=runtime / 'modules/atlas', env=env, stdin=subprocess.DEVNULL, capture_output=True, check=False)
        write(receipts / (tag + '.stdout.json'), call.stdout)
        write(receipts / (tag + '.stderr.txt'), call.stderr)
        write(receipts / (tag + '.receipt.json'), {'argv': command, 'exit_code': call.returncode,
              'stdout_sha256': sha(call.stdout), 'stderr_sha256': sha(call.stderr)})
        require(call.returncode == expected, f'{tag} refused ({call.returncode}); inspect hosted receipts')
        return json.loads(call.stdout)

    def execute(tag, program, request, expected=0):
        path = receipts / (tag + '-request.json')
        write(path, request)
        return invoke(tag, ['bun', str(program), str(path)], expected)

    request = {'runtime_root': str(runtime), 'corpus_root': str(root), 'baseline_file': str(baseline_path), 'manifest': MANIFEST,
               'context': {'evaluation': baseline['candidate']['evaluation'], 'evaluationCandidate': BASELINE, 'generation': GENERATION},
               'target_generation': sha(('s2-consumer-amendment:' + BASELINE).encode()), 'target_repo_root': str(root), 'recipes': recipes}
    planned = execute('plan', driver, {**request, 'mode': 'plan', 'checkpoint_dir': str(receipts / 'planner')})
    require(planned['kind'] == 'ownership-update-plan' and {change['artifact'] for change in planned['changes']} == DIRECT
            and set(planned['unaffected']) == {key for key in old_entries if key.startswith('s2.l1.')}
            and len(planned['affected']) == 10, 'amendment changed inputs outside the three declared L2 recipes')
    capture = receipts / 'capture'
    hold = execute('first-capture', driver, {**request, 'mode': 'prepare', 'checkpoint_dir': str(capture)}, expected=1)
    snapshots = list(capture.glob('snapshot-*.json'))
    require(hold['kind'] == 'hold' and any('sealed-producer-output-required:' in item for item in hold['evidence'])
            and len(snapshots) == 1 and sha(snapshots[0].read_bytes()) == pack_manifest['first_snapshot_sha256'], 'actual capture differs from reviewed inputs')
    sealed = receipts / 'sealed'
    seal_request = {**request, 'checkpoint_dir': str(capture), 'planner_file': str(receipts / 'plan.stdout.json'),
                    'snapshot_file': str(snapshots[0]), 'producers': producers, 'retention_review': evidence('retention-review.json'),
                    'output_dir': str(sealed)}
    seal = execute('seal', sealer, seal_request)
    outputs = sealed / 'outputs.json'
    require(seal['status'] == 'READY_FOR_EXACT_PREPARE' and sha(outputs.read_bytes()) == seal['registry_sha256'], 'amendment outputs not ready')
    checkpoint = receipts / 'target'
    result = execute('prepare', driver, {**request, 'mode': 'prepare', 'checkpoint_dir': str(checkpoint),
                     'outputs_file': str(outputs), 'outputs_sha256': seal['registry_sha256']})
    target = checkpoint / 'result.json'
    require(result['kind'] == 'prepared-evaluation-update' and load(target) == result, 'durable target missing')
    verify = execute('verify', sealer, {**seal_request, 'output_dir': str(receipts / 'verified'), 'prepared_run_file': str(target),
                     'prepared_callbacks_file': str(checkpoint / 'callbacks.jsonl')})
    require(verify['actual_prepare_verification'] == 'MATCHED_OBSERVED_CALLBACKS_AND_RESULTS', 'observed recipe verification failed')
    corrected = result['prepared']
    target_entries = {row['key']: row for row in corrected['candidate']['entries']}
    expected_results = {key: row['artifact']['result'] for key, row in old_entries.items()}
    expected_results.update({row['key']: row['corrected_result'] for row in pack_manifest['deltas']})
    require({key: row['artifact']['result'] for key, row in target_entries.items()} == expected_results, 'unexpected result identity change')
    require(corrected['candidate']['evaluation']['obligationSet'] == baseline['candidate']['evaluation']['obligationSet'], 'obligation set changed')
    summary = {'status': 'AMENDED_PREPARED_REQUIRES_ADMIT', 'candidate_id': corrected['candidate_id'], 'target_sha256': sha(target.read_bytes()),
               'generation': result['targetGeneration'], 'prior_manifest': MANIFEST, 'affected': result['affected'], 'calls': result['calls'],
               'changed_results': sorted(DIRECT), 'retained_results': sorted(set(old_entries) - DIRECT)}
    write(receipts / 'prepare-summary.json', summary)
    if args.stage == 'admit':
        admit_and_read(repo, root, receipts, request, target, corrected, summary, invoke, execute, committed)


def admit_and_read(repo, root, receipts, request, target, corrected, summary, invoke, execute, committed):
    binding_dir = repo / 'script/genesis-s2/amendment-binding'
    seal = json.loads(committed(binding_dir / 'seal.json'))
    approval_raw = committed(binding_dir / 'approval.json')
    require(seal == {'schema': 'genesis-s2-amendment-admission/v1', 'candidate_id': summary['candidate_id'],
                    'target_sha256': summary['target_sha256'], 'generation': summary['generation'], 'approval_sha256': sha(approval_raw)},
            'review scope does not match the exact corrected candidate')
    approval = json.loads(approval_raw)
    require(len(approval['decisions']) == len(set(approval['reviewers'])) == 2, 'two exact independent admissions required')
    bind = root / 'amend-binding'
    bind.mkdir()
    for decision in approval['decisions']:
        for label in ('request_ref', 'response_ref'):
            ref = decision[label]
            name = Path(ref['payload_path']).name
            require(ref['payload_path'] == 'amend-binding/' + name and name != 'approval.json', 'admission reference escaped scope')
            data = committed(binding_dir / name)
            require(ref['sha256'] == sha(data), 'review reference digest mismatch')
            write(bind / name, data)
    write(bind / 'approval.json', approval_raw)
    finalized = execute('finalize', repo / 'script/genesis-s2/u1-driver.ts', {**request, 'mode': 'finalize',
                        'checkpoint_dir': str(receipts / 'finalized'), 'target_file': str(target), 'binding_file': str(bind / 'approval.json')})
    require(finalized['kind'] == 'private-evaluation-candidate' and finalized['prepared'] == corrected, 'private finalization drift')
    require(sorted(path.name for path in (root / '.atlas').iterdir()) == ['cas'], 'admission target is not fresh')
    candidate = corrected['candidate']
    scope = candidate['scope']
    cli = ['bun', 'scripts/genesis-evaluation.ts']
    prepared_file = receipts / 'corrected-prepared.json'
    write(prepared_file, corrected)
    init = invoke('init-store', cli + ['init-store', str(root), str(prepared_file), summary['generation']])
    require(init['kind'] == 'evaluation-store-initialized', 'corrected init failed')
    policy = {'t0Heuristic': {'keywords': ['auth', 'payments', 'secrets', 'kms', 'crypto', 'billing']},
              'authz': {'scopes': {scope: ['/root']}, 'anchors': {'.': scope}}}
    access = {'schema': 'ownership-evaluation-policy/v1', 'root': str(root), 'evaluationPlan': candidate['evaluation']['evaluationPlan'],
              'obligationSet': candidate['evaluation']['obligationSet'], 'evaluationCandidate': corrected['candidate_id'],
              'generation': summary['generation'], 'scope': scope, 'actor': '/root', 'operations': ['admit'], 'consumer': None}
    write(root / '.atlas/policy.json', policy)
    access_path = root / '.atlas/evaluation-policy.json'
    write(access_path, access)
    admitted = invoke('admit-target', cli + ['admit-target', str(root), str(prepared_file), 'amend-binding/approval.json'])
    require(admitted['candidate_id'] == corrected['candidate_id'] and admitted['generation'] == summary['generation']
            and admitted['emission']['ok'] and admitted['emission']['data']['emitted'], 'corrected target did not emit')
    candidates = {row['key']: row['artifact']['result'] for row in candidate['entries']}
    plan = load(root / PREFIX / 'evaluation-plan.json')
    scope_files = repo / 'script/genesis-s2/amendment'
    routes = json.loads(committed(scope_files / 'routes.json'))
    retained = set()
    if (scope_files / 'retained-retry-cases.json').exists():
        carry = json.loads(committed(scope_files / 'retained-retry-cases.json'))
        require(carry['schema'] == 'genesis-s2-retained-retry-cases/v2', 'retained retry evidence identity mismatch')
        expected_bodies = {row['key']: row['body_sha256'] for row in load(scope_files / 'manifest.json')['deltas']}
        require(carry['corrected_body_sha256'] == expected_bodies, 'retained retry evidence body mismatch')
        prior_cases = {}
        for source in carry['prior_runs']:
            run_id = source['run_id']
            require(type(run_id) is int and run_id > 0, 'invalid retained run ID')
            archive = repo / Path(PREFIX).parent / f'runtime-followup/amendment-retries-{run_id}'
            prior_bytes = committed(archive / 'checkpoint.json')
            prior = json.loads(prior_bytes)
            require(sha(prior_bytes) == source['checkpoint_sha256'] and prior['manifest'] == source['manifest']
                    and prior['run_id'] == run_id, 'prior retry receipts drifted')
            for case, receipt in prior['cases'].items():
                if receipt['status'] == 'PASS':
                    prior_cases[(run_id, case)] = receipt
        retained = {row['id'] for row in carry['cases']}
        require(retained < CASES and len(retained) == len(carry['cases']), 'invalid retained retry scope')
        for row in carry['cases']:
            previous = prior_cases.get((row['run_id'], row['id']))
            require(previous and row['verdicts'] == ['PASS', 'PASS'] and row['served_bodies_identical']
                    and sorted(item['body_sha256'] for item in row['reads']) == sorted(item['body_sha256'] for item in previous['reads']),
                    'retained retries require exact prior dual PASS and byte-identical evidence')
    require(len(routes) == len(CASES - retained) and {row['id'] for row in routes} == CASES - retained, 'consumer scope mismatch')
    received = {}
    try:
        for route in routes:
            case = route['id']
            mode = plan['consumer_modes'][case]
            require(1 <= len(route['reads']) <= plan['read_limits'][mode]['read_calls'], 'route read budget exceeded')
            require(any(query['key'] in DIRECT for query in route['reads']), 'retry must include the corrected evidence')
            access_path.write_bytes(encode({**access, 'operations': ['read'], 'consumer': {'id': case, 'mode': mode}}))
            byte_count = 0
            received[case] = []
            for index, query in enumerate(route['reads'], 1):
                require(set(query) == {'key', 'section', 'maxBytes'} and query['key'] in candidates, 'retry route escaped the isolated corpus')
                query_file = receipts / f'{case}-{index}-query.json'
                write(query_file, {**query, 'scope': scope})
                tag = f'{case}-{index}-read'
                read = invoke(tag, cli + ['read', str(root), str(query_file)])
                require(read['kind'] == 'ready' and read['historical'] is False and read['manifest'] == admitted['ownership']
                        and read['key'] == query['key'] and read['result'] == candidates[query['key']], 'retry read identity mismatch')
                size = len(read['body'].encode())
                byte_count += size
                received[case].append({'key': read['key'], 'result': read['result'], 'section': query['section'], 'bytes': size,
                                       'read_sha256': sha((receipts / (tag + '.stdout.json')).read_bytes())})
            ledgers = [row for row in map(load, (root / '.atlas').glob('evaluation-budget-*.json')) if row['consumer'] == case]
            require(len(ledgers) == 1 and ledgers[0]['read_calls'] == len(route['reads']) and ledgers[0]['body_bytes_total'] == byte_count
                    and ledgers[0]['candidate'] == corrected['candidate_id'] and ledgers[0]['generation'] == summary['generation'], 'retry ledger drift')
            write(receipts / f'{case}-budget.json', ledgers[0])
    finally:
        access_path.write_bytes(encode(access))
    require(len(list((root / '.atlas').glob('evaluation-budget-*.json'))) == len(routes), 'an unrequested consumer ran')
    write(receipts / 'admission-and-retries.json', {**summary, 'status': 'AMENDED_ADMITTED_SCOPED_RETRIES', 'retained_retries': sorted(retained),
          'manifest': admitted['ownership'], 'private_manifest': finalized['manifest'], 'emission': admitted['emission'], 'reads': received})


if __name__ == '__main__':
    main()
