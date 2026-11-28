#!/usr/bin/env python3
"""Prepare the isolated S2-U1 M0 candidate; never admit or run producers."""
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys

RUNTIME = '9b0188b2be5ea69638dff8a44e3e931b4d6d8b10'
OBLIGATIONS = '4c76c66cedd2f82c650e6aaee4d486cbd530091f98c90d137fbff11693900059'
PREFIX = 'modules/atlas/docs/design/genesis-chatgpt-results/20261111-v3-fresh/s2/resume-20261128/evaluation-v2'
# The coordinator must replace this with the SHA-256 of the independently accepted,
# committed receipt covering the first traversal and all 14 frozen cases.
OBSERVED_14_CASE_RECEIPT_SHA256 = 'f87114bbec2cbbc2795deb63882cc2b678e5d7f434d27c341c6df5012d1c6ff2'


def require(condition, message):
    if not condition:
        raise RuntimeError(message)


def sha(data):
    return hashlib.sha256(data).hexdigest()


def encoded(value):
    return (json.dumps(value, ensure_ascii=False, indent=2) + '\n').encode()


def main():
    require(os.environ.get('GITHUB_ACTIONS') == 'true' and os.environ.get('GITHUB_EVENT_NAME') == 'workflow_dispatch', 'manual GitHub execution only')
    require(os.environ.get('GITHUB_REPOSITORY') == 'gustavomhss/hugr-orchestra' and os.environ.get('GITHUB_REF') == 'refs/heads/genesis-interfaces-resume', 'unexpected repository or branch')
    require(OBSERVED_14_CASE_RECEIPT_SHA256 is not None, '14-case exact evidence gate has not been pinned')
    repo = Path(os.environ['GITHUB_WORKSPACE']).resolve(strict=True)
    base = Path(os.environ['RUNNER_TEMP']).resolve(strict=True) / 'genesis-s2-u1-v1'
    runtime, out = base / 'runtime', base / 'evidence/run'
    require(not out.exists() and runtime.is_dir(), 'fresh M0 and pinned runtime required')
    require(subprocess.check_output(['git', '-C', str(repo), 'rev-parse', 'HEAD'], text=True).strip() == os.environ['GITHUB_SHA'], 'checkout SHA mismatch')
    require(subprocess.check_output(['git', '-C', str(runtime), 'rev-parse', 'HEAD'], text=True).strip() == RUNTIME, 'runtime SHA mismatch')
    require(not subprocess.check_output(['git', '-C', str(runtime), 'diff', '--name-only', 'HEAD']).strip(), 'runtime tracked changes')
    gate = repo / 'script/genesis-s2/u1-14-case-results.json'
    data = gate.read_bytes()
    require(sha(data) == OBSERVED_14_CASE_RECEIPT_SHA256, 'observed 14-case receipt hash mismatch')
    require(data == subprocess.check_output(['git', '-C', str(repo), 'show', 'HEAD:script/genesis-s2/u1-14-case-results.json']), 'gate is not committed exact evidence')
    for file in ('u1-plan.json', 'u1-baseline.py', 'u1-driver.ts', 'prepare.py', 'source-inventory.json'):
        path = repo / 'script/genesis-s2' / file
        require(path.read_bytes() == subprocess.check_output(['git', '-C', str(repo), 'show', 'HEAD:script/genesis-s2/' + file]), 'uncommitted driver input: ' + file)
    subprocess.run([sys.executable, str(repo / 'script/genesis-s2/prepare.py'), '--repository', str(repo), '--runtime', str(runtime), '--output', str(out), '--materialize-only'], check=True)
    root = out / 'corpus'
    plan_path = root / PREFIX / 'evaluation-plan.json'
    plan = json.loads(plan_path.read_bytes())
    original_maintenance = plan['maintenance']
    source = root / 'apps/desktop/src/main/owned-serve.ts'
    original = source.read_bytes()
    require(len(original) == 8511 and sha(original) == '0970f4ddb99c1c004e200443abc54ed5ea38cec098e19ef9aa748b771238dfb5', 'baseline source mismatch')
    proposal = json.loads((repo / 'script/genesis-s2/u1-plan.json').read_bytes())
    results = json.loads(data)
    require(results['state'] == 'FOURTEEN_EXECUTED_AND_JUDGED' and set(results['recorded_cases']) == set(plan['consumer_ids']), 'frozen consumer coverage missing')
    source_record = repo / results['source']
    require(sha(source_record.read_bytes()) == results['source_sha256'], 'consumer checkpoint digest mismatch')
    probes = proposal['read_probes']
    require(plan['read_limits'][probes['mode']] == probes['limits'], 'maintenance probe limits differ')
    for probe in probes['ids']:
        require(probe not in plan['consumer_ids'], 'maintenance probe aliases a frozen case')
        plan['consumer_ids'].append(probe)
        plan['consumer_modes'][probe] = probes['mode']
    plan['maintenance'] = {'original': original_maintenance, 's2_u1': proposal, 'observed_14_case_receipt_sha256': sha(data)}
    reconciliation_path = PREFIX + '/maintenance-static-plan/static-reconciliation.json'
    reconciliation = (repo / reconciliation_path).read_bytes()
    require(reconciliation == subprocess.check_output(['git', '-C', str(repo), 'show', 'HEAD:' + reconciliation_path]), 'reconciliation differs from commit')
    reconciliation_copy = root / (PREFIX + '/u1-driver/static-reconciliation.json')
    reconciliation_copy.parent.mkdir(parents=True, exist_ok=True)
    reconciliation_copy.write_bytes(reconciliation)
    plan['implementation'][str(reconciliation_copy.relative_to(root))] = sha(reconciliation)
    gate_copy = root / (PREFIX + '/u1-driver/observed-14-case-receipt.json')
    gate_copy.write_bytes(data)
    plan['implementation'][str(gate_copy.relative_to(root))] = sha(data)
    for file in ('u1-plan.json', 'u1-baseline.py', 'u1-driver.ts', 'prepare.py', 'source-inventory.json'):
        content = (repo / 'script/genesis-s2' / file).read_bytes()
        relative = PREFIX + '/u1-driver/' + file
        dest = root / relative
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(content)
        plan['implementation'][relative] = sha(content)
    plan_path.write_bytes(encoded(plan))
    require(not (root / '.atlas').exists(), 'M0 must begin without projection or CAS')
    def inventory():
        return {str(p.relative_to(root)): sha(p.read_bytes()) for p in sorted(root.rglob('*')) if p.is_file() and '.atlas' not in p.relative_to(root).parts}
    before = inventory()
    bun = Path(shutil.which('bun') or '').resolve(strict=True)
    def runtime_inventory():
        files, links = {}, {}
        for directory, names, filenames in os.walk(runtime, followlinks=False):
            parent = Path(directory)
            names[:] = sorted(n for n in names if n != '.git')
            for name in list(names):
                path = parent / name
                if path.is_symlink():
                    require(path.resolve(strict=True).is_relative_to(runtime), 'runtime link escapes tree')
                    links[str(path.relative_to(runtime))] = os.readlink(path)
                    names.remove(name)
            for name in sorted(filenames):
                path = parent / name
                if path.is_symlink():
                    require(path.resolve(strict=True).is_relative_to(runtime), 'runtime link escapes tree')
                    links[str(path.relative_to(runtime))] = os.readlink(path)
                else:
                    require(path.is_file(), 'nonregular runtime file')
                    files[str(path.relative_to(runtime))] = sha(path.read_bytes())
        return {'files': files, 'symlinks': links}
    runtime_before = runtime_inventory()
    (out / 'u1-runtime-lock.json').write_bytes(encoded(runtime_before))
    runtime_identity = {'git_head': RUNTIME, 'bun_path': str(bun), 'bun_sha256': sha(bun.read_bytes()), 'bun_version': subprocess.check_output([str(bun), '--version'], text=True).strip()}
    prepared_path = out / 'u1-prepared.json'
    argv = [str(bun), 'scripts/genesis-evaluation.ts', 'prepare', str(root), PREFIX + '/evaluation-plan.json', str(prepared_path)]
    env = os.environ.copy()
    env.pop('ATLAS_ACTOR', None)
    env.pop('ATLAS_RATIFY_TOKEN', None)
    result = subprocess.run(argv, cwd=runtime / 'modules/atlas', env=env, stdin=subprocess.DEVNULL, capture_output=True, check=False)
    (out / 'u1-prepare.stdout').write_bytes(result.stdout)
    (out / 'u1-prepare.stderr').write_bytes(result.stderr)
    (out / 'u1-operation.json').write_bytes(encoded({'argv': argv, 'exit_code': result.returncode, 'runtime_identity': runtime_identity, 'source_before': before, 'source_after': inventory(), 'gate_sha256': sha(data)}))
    require(result.returncode == 0, 'M0 prepare failed; inspect receipt')
    require(before == inventory(), 'source changed during prepare')
    require(runtime_before == runtime_inventory(), 'runtime changed during prepare')
    require(sorted(p.name for p in (root / '.atlas').iterdir()) == ['cas'], 'prepare created operational state')
    raw = prepared_path.read_bytes()
    prepared = json.loads(raw)
    require(prepared == json.loads(result.stdout), 'prepared output differs from stdout')
    candidate = prepared['candidate']
    require(prepared['schema'] == 'genesis-native-prepared/v2' and candidate['repo_root'] == str(root) and candidate['evaluation']['obligationSet'] == OBLIGATIONS, 'M0 lineage mismatch')
    require(len(candidate['entries']) == len({e['key'] for e in candidate['entries']}) == 13, 'M0 entry coverage mismatch')
    specs = json.loads(reconciliation)['recipes']
    require(len(specs) == 13 and {r['key'] for r in specs} == {e['key'] for e in candidate['entries']}, 'recipe registry coverage mismatch')
    for entry in candidate['entries']:
        spec = next(r for r in specs if r['key'] == entry['key'])
        inputs = {i['key']: i['version'] for i in entry['inputs']}
        require(set(spec['declaredInputs']) == set(inputs) and set(spec['mandatoryInputs']).issubset(inputs) and inputs.get(spec['recipeInputKey']) == spec['recipeVersion'], 'recipe inputs mismatch: ' + entry['key'])
        require(set(spec['required']) == {d['key'] for d in entry['dependencies']}, 'recipe dependencies mismatch: ' + entry['key'])
    vector = [{'key': e['key'], 'contract': e['contract'], 'result': e['artifact']['result'], 'inputs': e['inputs_id']} for e in candidate['entries']]
    (out / 'u1-review-vector.json').write_bytes(encoded({'state': 'PREPARED_NOT_ADMITTED', 'candidate_id': prepared['candidate_id'], 'prepared_sha256': sha(raw), 'evaluation': candidate['evaluation'], 'runtime_identity': candidate['runtime_identity'], 'entries': vector, 'gate_sha256': sha(data), 'source_sha256': sha(original), 'reviews': 'NOT_RUN', 'admission': 'NOT_RUN', 'maintenance': 'NOT_RUN'}))


if __name__ == '__main__':
    main()
