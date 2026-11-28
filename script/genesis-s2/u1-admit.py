#!/usr/bin/env python3
"""Admit one reviewed evaluation candidate on an isolated GitHub runner."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess

RUNTIME = '9b0188b2be5ea69638dff8a44e3e931b4d6d8b10'
CRITERIA = {'ADMIT-EXACT-TRANSFORM', 'ADMIT-SOURCE-BINDINGS', 'ADMIT-SEMANTIC-SCOPE', 'ADMIT-ISOLATED-PLAN'}


def require(condition, message):
    if not condition:
        raise ValueError(message)


def digest(data):
    return hashlib.sha256(data).hexdigest()


def write_json(path, value):
    with path.open('x', encoding='utf-8') as stream:
        json.dump(value, stream, indent=2, ensure_ascii=False)
        stream.write('\n')


def inventory(root):
    return [{'path': str(p.relative_to(root)), 'bytes': p.stat().st_size, 'sha256': digest(p.read_bytes())}
            for p in sorted(root.rglob('*')) if p.is_file()]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--runtime', required=True, type=Path)
    parser.add_argument('--source', required=True, type=Path)
    parser.add_argument('--prepared', required=True, type=Path)
    parser.add_argument('--binding-directory', required=True, type=Path)
    parser.add_argument('--output', required=True, type=Path)
    args = parser.parse_args()
    require(os.environ.get('GITHUB_ACTIONS') == 'true' and os.environ.get('GITHUB_EVENT_NAME') == 'workflow_dispatch'
            and os.environ.get('GITHUB_REPOSITORY') == 'gustavomhss/hugr-orchestra'
            and os.environ.get('GITHUB_REF') == 'refs/heads/genesis-interfaces-resume'
            and os.environ.get('ADMIT_U1_M0') == 'true', 'manual exact admission only')
    runner = Path(os.environ['RUNNER_TEMP']).resolve()
    base = runner / 'genesis-s2-u1-v1'
    runtime, root, prepared_path = args.runtime.resolve(strict=True), args.source.resolve(strict=True), args.prepared.resolve(strict=True)
    out = args.output.absolute()
    require((runtime, root, prepared_path, out) == (base / 'runtime', base / 'evidence/run/corpus', base / 'evidence/run/u1-prepared.json', base / 'evidence/admission'), 'wrong isolated paths')
    require(subprocess.check_output(['git', '-C', str(runtime), 'rev-parse', 'HEAD'], text=True).strip() == RUNTIME, 'wrong runtime')
    binding_dir = args.binding_directory.resolve(strict=True)
    repository = Path(os.environ['GITHUB_WORKSPACE']).resolve(strict=True)
    require(binding_dir == repository / 'script/genesis-s2/u1-admission', 'unexpected binding directory')
    def committed(path):
        relative = path.relative_to(repository).as_posix()
        data = subprocess.check_output(['git', '-C', str(repository), 'show', 'HEAD:' + relative])
        require(path.read_bytes() == data, 'review evidence differs from sealed commit: ' + relative)
        return data
    seal = json.loads(committed(binding_dir / 'seal.json'))
    require(seal['schema'] == 'genesis-s2-u1-m0-seal/v1', 'seal schema mismatch')
    CANDIDATE, PREPARED_SHA, APPROVAL_SHA = seal['candidate_id'], seal['prepared_sha256'], seal['approval_sha256']
    GENERATION = seal['generation']
    require(all(len(x) == 64 and all(c in '0123456789abcdef' for c in x) for x in (CANDIDATE, PREPARED_SHA, APPROVAL_SHA, GENERATION)), 'invalid seal digest')
    raw = prepared_path.read_bytes()
    require(digest(raw) == PREPARED_SHA, 'prepared bytes differ from judged candidate')
    prepared = json.loads(raw)
    candidate = prepared['candidate']
    require(prepared['candidate_id'] == CANDIDATE and candidate['repo_root'] == str(root) and candidate['scope'] == 'orchestra.interfaces'
            and candidate['evaluation'] == seal['evaluation'], 'candidate/plan/obligations mismatch')
    baseline_receipt = json.loads((prepared_path.parent / 'u1-operation.json').read_bytes())
    require(baseline_receipt['gate_sha256'] == seal['gate_sha256'], '14-case evidence gate differs from reviewed seal')
    PLAN, OBLIGATIONS = candidate['evaluation']['evaluationPlan'], candidate['evaluation']['obligationSet']
    require(OBLIGATIONS == '4c76c66cedd2f82c650e6aaee4d486cbd530091f98c90d137fbff11693900059', 'original obligations changed')
    require(sorted(p.name for p in (root / '.atlas').iterdir()) == ['cas'], 'requires fresh CAS-only state')
    binding_bytes = (binding_dir / 'approval.json').read_bytes()
    require(digest(binding_bytes) == APPROVAL_SHA, 'approval differs from the sealed independent decisions')
    # HEAD is the sealed review package; never use uncommitted working-tree bytes.
    repository = Path(os.environ['GITHUB_WORKSPACE']).resolve(strict=True)
    require(subprocess.check_output(['git', '-C', str(repository), 'rev-parse', 'HEAD'], text=True).strip() == os.environ['GITHUB_SHA'], 'review checkout differs from workflow revision')
    require(binding_bytes == committed(binding_dir / 'approval.json'), 'binding bytes differ from sealed commit')
    binding = json.loads(binding_bytes)
    require(binding['schema'] == 'genesis-evaluation-binding/v1' and binding['purpose'] == 'isolated-evaluation-admission'
            and binding['candidate_id'] == CANDIDATE and len(binding['reviewers']) == len(set(binding['reviewers'])) == 2
            and len(binding['decisions']) == 2, 'binding identity or reviewer count')
    expected = {e['key']: (e['contract'], e['artifact']['result'], e['inputs_id']) for e in candidate['entries']}
    require(len(expected) == 13, 'candidate entry count')
    evidence = {}
    for decision in binding['decisions']:
        require(decision['reviewer'] in binding['reviewers'] and decision['candidate_id'] == CANDIDATE
                and decision['purpose'] == binding['purpose'] and decision['verdict'] == 'PASS', 'decision identity')
        require(len(decision['entries']) == 13 and {e['key'] for e in decision['entries']} == set(expected), 'decision coverage')
        for entry in decision['entries']:
            require((entry['contract'], entry['result'], entry['inputs']) == expected[entry['key']]
                    and len(entry['criteria']) == 4 and {c['id'] for c in entry['criteria']} == CRITERIA
                    and all(c['verdict'] == 'PASS' for c in entry['criteria']), 'decision entry mismatch')
        for field in ('request_ref', 'response_ref'):
            ref = decision[field]
            name = Path(ref['payload_path']).name
            require(ref['payload_path'] == 's2-binding/' + name and name not in ('', '.', '..', 'approval.json'), 'invalid evidence path')
            data = committed(binding_dir / name)
            require(digest(data) == ref['sha256'], 'decision evidence hash mismatch')
            if name in evidence:
                require(evidence[name] == data, 'duplicate evidence differs')
            evidence[name] = data
        require(decision['decision_id'] == 'sha256:' + decision['response_ref']['sha256'], 'decision response binding')
    require({d['reviewer'] for d in binding['decisions']} == set(binding['reviewers'])
            and len({d['response_ref']['sha256'] for d in binding['decisions']}) == 2, 'review independence identity mismatch')
    destination = root / 's2-binding'
    destination.mkdir()
    for name, data in evidence.items():
        (destination / name).write_bytes(data)
    (destination / 'approval.json').write_bytes(binding_bytes)
    out.mkdir()
    try:
        write_json(out / 'input-identities.json', {'candidate_id': CANDIDATE, 'prepared_sha256': PREPARED_SHA, 'binding_sha256': digest(binding_bytes), 'review_commit': os.environ['GITHUB_SHA'], 'runtime': RUNTIME, 'root': str(root), 'evaluationPlan': PLAN, 'obligationSet': OBLIGATIONS, 'generation': GENERATION, 'before_atlas': inventory(root / '.atlas')})
        def cli(tag, mode, *arguments, actor=None):
            argv = ['bun', 'scripts/genesis-evaluation.ts', mode, str(root), *map(str, arguments)]
            env = os.environ.copy()
            env.pop('ATLAS_ACTOR', None)
            env.pop('ATLAS_RATIFY_TOKEN', None)
            if actor is not None:
                env['ATLAS_ACTOR'] = actor
                env['ATLAS_RATIFY_TOKEN'] = actor
            result = subprocess.run(argv, cwd=runtime / 'modules/atlas', env=env, stdin=subprocess.DEVNULL, capture_output=True, check=False)
            (out / (tag + '.stdout.json')).write_bytes(result.stdout)
            (out / (tag + '.stderr.txt')).write_bytes(result.stderr)
            write_json(out / (tag + '.receipt.json'), {'argv': argv, 'actor': actor, 'exit_code': result.returncode, 'stdout_sha256': digest(result.stdout), 'stderr_sha256': digest(result.stderr)})
            require(result.returncode == 0, tag + ' failed; inspect original receipt')
            return json.loads(result.stdout)
        init = cli('init-store', 'init-store', prepared_path, GENERATION)
        require(init.get('kind') == 'evaluation-store-initialized', 'unexpected init result')
        marker = json.loads((root / '.atlas/evaluation-store.json').read_bytes())
        for key, value in {'root': str(root), 'evaluationPlan': PLAN, 'obligationSet': OBLIGATIONS, 'evaluationCandidate': CANDIDATE, 'generation': GENERATION, 'scope': 'orchestra.interfaces', 'initialized_cas_only': True}.items():
            require(marker.get(key) == value, 'marker mismatch: ' + key)
        policy = {'t0Heuristic': {'keywords': ['auth', 'payments', 'secrets', 'kms', 'crypto', 'billing']}, 'authz': {'scopes': {'orchestra.interfaces': ['/root']}, 'anchors': {'.': 'orchestra.interfaces'}}}
        evaluation_policy = {'schema': 'ownership-evaluation-policy/v1', 'root': str(root), 'evaluationPlan': PLAN, 'obligationSet': OBLIGATIONS, 'evaluationCandidate': CANDIDATE, 'generation': GENERATION, 'scope': 'orchestra.interfaces', 'actor': '/root', 'operations': ['admit', 'evaluation-maintenance'], 'consumer': None}
        write_json(root / '.atlas/policy.json', policy)
        write_json(root / '.atlas/evaluation-policy.json', evaluation_policy)
        write_json(out / 'authorization.json', {'governance_policy': policy, 'evaluation_policy': evaluation_policy, 'identity_limit': 'nominal local actor, not authenticated identity'})
        result = cli('admit', 'admit', prepared_path, 's2-binding/approval.json', actor='/root')
        require(result.get('candidate_id') == CANDIDATE and result.get('generation') == GENERATION
                and result.get('check', {}).get('wouldEmit') is True and result.get('emission', {}).get('ok') is True
                and result.get('emission', {}).get('data', {}).get('emitted') is True, 'admission did not emit')
        require(isinstance(result['ownership'], str) and len(result['ownership']) == 64, 'invalid admitted manifest')
        write_json(out / 'summary.json', {'status': 'EVALUATION_ADMITTED', 'candidate_id': CANDIDATE, 'generation': GENERATION, 'manifest': result['ownership'], 'binding_sha256': digest(binding_bytes), 'gate_sha256': baseline_receipt['gate_sha256'], 'marker_sha256': digest((root / '.atlas/evaluation-store.json').read_bytes()), 'policy_sha256': digest((root / '.atlas/evaluation-policy.json').read_bytes()), 'atlas_after': inventory(root / '.atlas'), 'evaluation': candidate['evaluation'], 'root': str(root), 'prepared': str(prepared_path), 'runtime': RUNTIME, 'runtime_root': str(runtime), 'registry': str(root / 'modules/atlas/docs/design/genesis-chatgpt-results/20261111-v3-fresh/s2/resume-20261128/evaluation-v2/u1-driver/static-reconciliation.json'), 'consumers': 'NOT_RUN', 'maintenance': 'NOT_RUN', 'production_promotion': 'NOT_RUN'})
    finally:
        if (root / '.atlas').is_dir():
            shutil.copytree(root / '.atlas', out / 'atlas-after')


if __name__ == '__main__':
    main()
