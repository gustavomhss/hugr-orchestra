#!/usr/bin/env python3
"""Observe admitted M0 reuse and stage one isolated, bounded U1 drift attempt."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys

RUNTIME = '9b0188b2be5ea69638dff8a44e3e931b4d6d8b10'
PREFIX = 'modules/atlas/docs/design/genesis-chatgpt-results/20261111-v3-fresh/s2/resume-20261128/evaluation-v2'
BASE_SHA = '0970f4ddb99c1c004e200443abc54ed5ea38cec098e19ef9aa748b771238dfb5'
CHANGE_SHA = '9e1d1a2b77d329251082352b6e66d7f8e9cccd0d339a534999714b9f2f6dcb08'


def require(condition, message):
    if not condition:
        raise ValueError(message)


def sha(data):
    return hashlib.sha256(data).hexdigest()


def encoded(value):
    return (json.dumps(value, indent=2, ensure_ascii=False) + '\n').encode()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--summary', type=Path, required=True)
    parser.add_argument('--producer-manifest', type=Path)
    args = parser.parse_args()
    require(os.environ.get('GITHUB_ACTIONS') == 'true' and os.environ.get('GITHUB_EVENT_NAME') == 'workflow_dispatch'
            and os.environ.get('GITHUB_REPOSITORY') == 'gustavomhss/hugr-orchestra'
            and os.environ.get('GITHUB_REF') == 'refs/heads/genesis-interfaces-resume', 'isolated manual workflow required')
    repo = Path(os.environ['GITHUB_WORKSPACE']).resolve(strict=True)
    base = Path(os.environ['RUNNER_TEMP']).resolve(strict=True) / 'genesis-s2-u1-v1'
    runtime, root = base / 'runtime', base / 'evidence/run/corpus'
    prepared_path, summary_path = base / 'evidence/run/u1-prepared.json', base / 'evidence/admission/summary.json'
    out, changed_root = base / 'evidence/u1-operation', base / 'evidence/run/corpus-u1-changed'
    require(args.summary.resolve(strict=True) == summary_path and not out.exists() and not changed_root.exists(), 'unexpected paths or existing output')
    require(subprocess.check_output(['git', '-C', str(runtime), 'rev-parse', 'HEAD'], text=True).strip() == RUNTIME, 'runtime revision mismatch')
    require(subprocess.check_output(['git', '-C', str(repo), 'rev-parse', 'HEAD'], text=True).strip() == os.environ['GITHUB_SHA'], 'checkout revision mismatch')
    out.mkdir(parents=True)
    ledger = {'schema': 's2-u1-operation/v1', 'status': 'HOLD', 'baseline_root': str(root), 'changed_root': str(changed_root),
              'production_promotion': 'NOT_RUN', 'current_read_drift_probe': 'NOT_RUN'}
    try:
        summary = json.loads(summary_path.read_bytes())
        baseline = json.loads(prepared_path.read_bytes())
        marker_raw = (root / '.atlas/evaluation-store.json').read_bytes()
        policy_raw = (root / '.atlas/evaluation-policy.json').read_bytes()
        marker, policy = json.loads(marker_raw), json.loads(policy_raw)
        require(summary['status'] == 'EVALUATION_ADMITTED' and summary['root'] == str(root) and summary['prepared'] == str(prepared_path)
                and summary['runtime'] == RUNTIME and summary['candidate_id'] == baseline['candidate_id'], 'M0 admission summary mismatch')
        require(summary['marker_sha256'] == sha(marker_raw) and summary['policy_sha256'] == sha(policy_raw), 'M0 marker/policy receipt differs')
        evaluation = baseline['candidate']['evaluation']
        require(summary['evaluation'] == evaluation and baseline['candidate']['repo_root'] == str(root), 'M0 candidate lineage mismatch')
        for key, value in {'root': str(root), 'evaluationPlan': evaluation['evaluationPlan'], 'obligationSet': evaluation['obligationSet'],
                           'evaluationCandidate': baseline['candidate_id'], 'generation': summary['generation'], 'scope': baseline['candidate']['scope']}.items():
            require(marker.get(key) == value and policy.get(key) == value, 'marker/policy mismatch: ' + key)
        require(marker['initialized_cas_only'] is True and marker['device'] == root.stat().st_dev and marker['inode'] == root.stat().st_ino,
                'M0 store root identity mismatch')
        require(policy['actor'] == '/root' and 'evaluation-maintenance' in policy['operations'], 'maintenance actor/operation absent')
        frozen_path = root / PREFIX / 'u1-driver/u1-plan.json'
        plan_raw = frozen_path.read_bytes()
        plan = json.loads(plan_raw)
        live_plan = json.loads((root / PREFIX / 'evaluation-plan.json').read_bytes())
        require(live_plan['maintenance']['s2_u1'] == plan and live_plan['maintenance']['observed_14_case_receipt_sha256'] == summary['gate_sha256'], 'frozen maintenance plan or 14-case gate differs')
        gate = root / PREFIX / 'u1-driver/observed-14-case-receipt.json'
        require(sha(gate.read_bytes()) == summary['gate_sha256'], 'observed 14-case bytes differ')
        driver = repo / 'script/genesis-s2/u1-driver.ts'
        driver_bytes = driver.read_bytes()
        copied_driver = root / PREFIX / 'u1-driver/u1-driver.ts'
        require(driver_bytes == copied_driver.read_bytes() and live_plan['implementation'][str(copied_driver.relative_to(root))] == sha(driver_bytes), 'M0-pinned driver differs')
        registry_path = root / PREFIX / 'u1-driver/static-reconciliation.json'
        require(summary['registry'] == str(registry_path) and live_plan['implementation'][str(registry_path.relative_to(root))] == sha(registry_path.read_bytes()), 'M0-pinned registry differs')
        specs = json.loads(registry_path.read_bytes())['recipes']
        recipes = [{'key': s['key'], 'recipe_input_key': s['recipeInputKey'], 'recipe_version': s['recipeVersion'],
                    'declared_inputs': s['declaredInputs'], 'mandatory_inputs': s['mandatoryInputs'], 'required': s['required']} for s in specs]
        require(len(recipes) == 13 and {r['key'] for r in recipes} == {e['key'] for e in baseline['candidate']['entries']}, 'registry coverage differs')
        source_rel = plan['source']['path']
        original = (root / source_rel).read_bytes()
        require(len(original) == 8511 and sha(original) == BASE_SHA == plan['source']['baseline_sha256'], 'baseline source differs')
        before, after = plan['source']['before'].encode(), plan['source']['after'].encode()
        require(original.count(before) == 1, 'patch anchor not unique')
        updated = original.replace(before, after)
        require(len(updated) == len(original) and sha(updated) == CHANGE_SHA == plan['source']['changed_sha256'], 'changed source differs')
        context = {'evaluation': evaluation, 'evaluationCandidate': baseline['candidate_id'], 'generation': summary['generation']}
        target_generation = sha(('s2-u1-target:' + baseline['candidate_id'] + ':m1').encode())
        require(target_generation != summary['generation'], 'generation collision')
        manifest = summary['manifest']
        require(isinstance(manifest, str) and len(manifest) == 64, 'invalid admitted manifest')
        request = {'runtime_root': str(runtime), 'corpus_root': str(root), 'baseline_file': str(prepared_path), 'manifest': manifest,
                   'context': context, 'target_generation': target_generation, 'recipes': recipes}
        env = {**os.environ, 'ATLAS_ACTOR': '/root'}
        def invoke(tag, payload, entrypoint=driver):
            path = out / (tag + '.request.json')
            path.write_bytes(encoded(payload))
            argv = ['bun', str(entrypoint), str(path)]
            result = subprocess.run(argv, cwd=runtime / 'modules/atlas', env=env, stdin=subprocess.DEVNULL, capture_output=True, check=False)
            (out / (tag + '.stdout.txt')).write_bytes(result.stdout)
            (out / (tag + '.stderr.txt')).write_bytes(result.stderr)
            (out / (tag + '.receipt.json')).write_bytes(encoded({'argv': argv, 'exit_code': result.returncode,
                'stdout_sha256': sha(result.stdout), 'stderr_sha256': sha(result.stderr)}))
            return result
        projection = {p.name: sha(p.read_bytes()) for p in sorted((root / '.atlas').glob('projection*.json'))}
        require('projection.json' in projection, 'M0 active projection missing')
        no_op = invoke('reuse', {**request, 'mode': 'prepare', 'checkpoint_dir': str(out / 'reuse-checkpoint')})
        require(no_op.returncode == 0, 'baseline reuse refused; inspect receipt')
        reuse = json.loads(no_op.stdout)
        require(reuse['kind'] == 'evaluation-reuse' and reuse['manifest'] == manifest and reuse['prepared']['candidate_id'] == baseline['candidate_id']
                and reuse['affected'] == [] and reuse['calls'] == [], 'reuse result differs')
        require(projection == {p.name: sha(p.read_bytes()) for p in sorted((root / '.atlas').glob('projection*.json'))}, 'reuse mutated projection')
        ledger.update({'reuse': 'OBSERVED_SAME_MANIFEST_ZERO_CALLS', 'manifest': manifest, 'candidate_id': baseline['candidate_id'],
                       'plan_sha256': sha(plan_raw), 'driver_sha256': sha(driver_bytes), 'gate_sha256': summary['gate_sha256']})
        # M0 is a disposable hosted corpus. Restore its exact input and policy even on refusal.
        live_source = root / source_rel
        reader_policy = {**policy, 'operations': ['read'], 'consumer': {'id': 'S2-U1-M0-current', 'mode': 'routine'}}
        probe_query = out / 'm0-current-read.query.json'
        probe_query.write_bytes(encoded({'scope': baseline['candidate']['scope'],
            'key': 's2.l1.desktop-web', 'section': '1. Startup, readiness and shutdown', 'maxBytes': 5000}))
        def read_current(tag):
            argv = ['bun', 'scripts/genesis-evaluation.ts', 'read', str(root), str(probe_query)]
            result = subprocess.run(argv, cwd=runtime / 'modules/atlas', env=env, stdin=subprocess.DEVNULL,
                                    capture_output=True, check=False)
            (out / (tag + '.stdout.json')).write_bytes(result.stdout)
            (out / (tag + '.stderr.txt')).write_bytes(result.stderr)
            (out / (tag + '.receipt.json')).write_bytes(encoded({'argv': argv, 'exit_code': result.returncode,
                'stdout_sha256': sha(result.stdout), 'stderr_sha256': sha(result.stderr)}))
            return result, json.loads(result.stdout)
        try:
            (root / '.atlas/evaluation-policy.json').write_bytes(encoded(reader_policy))
            (out / 'm0-current-read.policy.json').write_bytes(encoded(reader_policy))
            live_source.write_bytes(updated)
            refusal_result, refusal = read_current('m0-drift-current')
            require(refusal_result.returncode == 2 and refusal['kind'] == 'hold'
                    and any('evaluation-input-drift' in x for x in refusal['evidence']), 'current reader did not refuse changed mandatory input')
            live_source.write_bytes(original)
            require(sha(live_source.read_bytes()) == BASE_SHA, 'restored source bytes differ')
            restored_result, restored = read_current('m0-restored-current')
            require(restored_result.returncode == 0 and restored['kind'] == 'ready' and not restored['historical']
                    and restored['manifest'] == manifest and restored['evaluation']['generation'] == summary['generation'], 'original current reader did not recover after exact restoration')
            ledger['current_read_drift_probe'] = {'drift': 'HOLD_EVALUATION_INPUT_DRIFT', 'exact_restore': 'READY_SAME_M0_MANIFEST'}
        finally:
            live_source.write_bytes(original)
            (root / '.atlas/evaluation-policy.json').write_bytes(policy_raw)
        require(sha(live_source.read_bytes()) == BASE_SHA and sha((root / '.atlas/evaluation-policy.json').read_bytes()) == summary['policy_sha256'], 'failed to restore M0 snapshot')
        def ignore(directory, names):
            return {name for name in names if Path(directory) == root and name in ('.atlas', '.git')}
        for p in root.rglob('*'):
            if '.atlas' not in p.relative_to(root).parts:
                require(not p.is_symlink(), 'source symlink forbidden: ' + str(p))
        shutil.copytree(root, changed_root, ignore=ignore, symlinks=False)
        (changed_root / '.atlas').mkdir()
        for p in (root / '.atlas/cas').rglob('*'):
            require(not p.is_symlink(), 'CAS symlink forbidden')
        shutil.copytree(root / '.atlas/cas', changed_root / '.atlas/cas')
        for p in root.rglob('*'):
            rel = p.relative_to(root)
            if '.atlas' in rel.parts or '.git' in rel.parts or not p.is_file():
                continue
            target = changed_root / rel
            require(target.is_file() and target.stat().st_nlink == 1 and sha(p.read_bytes()) == sha(target.read_bytes()), 'source copy differs: ' + str(rel))
        for p in (root / '.atlas/cas').rglob('*'):
            if p.is_file():
                target = changed_root / '.atlas/cas' / p.relative_to(root / '.atlas/cas')
                require(target.stat().st_nlink == 1 and sha(p.read_bytes()) == sha(target.read_bytes()), 'CAS copy differs')
        require(sorted(p.name for p in (changed_root / '.atlas').iterdir()) == ['cas'], 'changed root inherited state')
        (changed_root / source_rel).write_bytes(updated)
        require(sha((changed_root / source_rel).read_bytes()) == CHANGE_SHA and sha((root / source_rel).read_bytes()) == BASE_SHA, 'source isolation failed')
        changed_request = {**request, 'corpus_root': str(changed_root), 'target_repo_root': str(changed_root)}
        plan_run = invoke('drift-plan', {**changed_request, 'mode': 'plan', 'checkpoint_dir': str(out / 'plan-checkpoint')})
        require(plan_run.returncode == 0, 'drift plan refused; inspect receipt')
        actual = json.loads(plan_run.stdout)
        require(actual['kind'] == 'ownership-update-plan' and set(actual['affected']) == set(plan['closure'])
                and set(actual['frontier']) == set(plan['frontier']) and set(actual['unaffected']) == set(plan['outside'])
                and {x['artifact'] for x in actual['changes']} == set(plan['direct']), 'actual planner differs from frozen oracle')
        ledger['planner'] = {'status': 'OBSERVED', 'affected': actual['affected'], 'frontier': actual['frontier'],
                             'unaffected': actual['unaffected'], 'direct': sorted({x['artifact'] for x in actual['changes']})}
        target_request = {**changed_request, 'mode': 'prepare', 'checkpoint_dir': str(out / 'target-checkpoint')}
        if args.producer_manifest:
            def committed(relative):
                resolved = (repo / relative).resolve(strict=True)
                require(resolved.is_relative_to(repo / 'script/genesis-s2/u1-producers'), 'producer evidence escaped its scope')
                data = resolved.read_bytes()
                path = resolved.relative_to(repo).as_posix()
                require(data == subprocess.check_output(['git', '-C', str(repo), 'show', 'HEAD:' + path]), 'producer evidence differs from commit: ' + path)
                return {'path': str(resolved), 'sha256': sha(data)}

            manifest_ref = committed(args.producer_manifest)
            staged = json.loads(Path(manifest_ref['path']).read_bytes())
            require(staged['schema'] == 'genesis-s2-u1-producer-evidence/v1' and staged['baseline_candidate'] == baseline['candidate_id']
                    and staged['baseline_manifest'] == manifest and staged['generation'] == target_generation, 'producer evidence targets a different rebuild')
            first_dir = out / 'first-callback'
            first = invoke('capture-first', {**target_request, 'checkpoint_dir': str(first_dir)})
            first_hold = json.loads(first.stdout)
            require(first.returncode == 1 and first_hold['kind'] == 'hold'
                    and any('sealed-producer-output-required:' in message for message in first_hold['evidence']), 'first callback did not reach the producer gate')
            snapshots = list(first_dir.glob('snapshot-*.json'))
            require(len(snapshots) == 1 and sha(snapshots[0].read_bytes()) == staged['first_snapshot_sha256'], 'first callback digest drift')
            producers = []
            for item in staged['producers']:
                producers.append({'key': item['key'], 'snapshot_sha256': item['snapshot_sha256'], 'producer_id': item['producer_id'],
                    'response': committed(item['response']), 'decisions': [committed(file) for file in item.get('decisions', [])]})
            sealer = repo / 'script/genesis-s2/u1-output-seal.ts'
            require(sealer.read_bytes() == subprocess.check_output(['git', '-C', str(repo), 'show', 'HEAD:script/genesis-s2/u1-output-seal.ts']), 'output sealer differs from commit')
            sealed_dir = out / 'sealed-producers'
            seal_request = {**changed_request, 'planner_file': str(out / 'drift-plan.stdout.txt'), 'snapshot_file': str(snapshots[0]),
                'checkpoint_dir': str(first_dir), 'producers': producers, 'output_dir': str(sealed_dir)}
            staged_result = invoke('seal-producers', seal_request, sealer)
            require(staged_result.returncode in (0, 2), 'producer evidence sealer refused; inspect receipt')
            staged_result = json.loads(staged_result.stdout)
            registry = sealed_dir / 'outputs.json'
            require(staged_result['registry_path'] == str(registry) and sha(registry.read_bytes()) == staged_result['registry_sha256'], 'staged output registry differs')
            ledger['producer_evidence'] = {**manifest_ref, 'status': staged_result['status'], 'pending': staged_result.get('pending'),
                'steps': staged_result['steps'], 'registry_sha256': staged_result['registry_sha256']}
            target_request.update({'outputs_file': str(registry), 'outputs_sha256': staged_result['registry_sha256']})
        target_run = invoke('changed-prepare', target_request)
        target = json.loads(target_run.stdout) if target_run.stdout else None
        if target and target.get('kind') == 'hold' and any('sealed-producer-output-required:' in x or 'new-semantic-evidence-required' in x for x in target.get('evidence', [])):
            ledger.update({'status': 'AWAITING_REAL_PRODUCER_OR_SEMANTIC_EVIDENCE', 'target_hold': target})
        elif target_run.returncode == 0 and target and target.get('kind') == 'prepared-evaluation-update':
            ledger.update({'status': 'TARGET_PREPARED_REQUIRES_FRESH_ADMIT_BINDING', 'target_candidate': target['prepared']['candidate_id'],
                           'target_generation': target['targetGeneration'], 'affected': target['affected'], 'calls': target['calls']})
        else:
            raise ValueError('changed preparation refused unexpectedly; inspect receipt')
        require(sha((root / source_rel).read_bytes()) == BASE_SHA and projection == {p.name: sha(p.read_bytes()) for p in sorted((root / '.atlas').glob('projection*.json'))}, 'admitted baseline changed')
    except Exception as error:
        ledger.update({'status': 'HOLD', 'error': {'type': type(error).__name__, 'message': str(error)}})
    (out / 'ledger.json').write_bytes(encoded(ledger))
    print(json.dumps(ledger, sort_keys=True))
    return 1 if ledger['status'] == 'HOLD' else 0


if __name__ == '__main__':
    sys.exit(main())
