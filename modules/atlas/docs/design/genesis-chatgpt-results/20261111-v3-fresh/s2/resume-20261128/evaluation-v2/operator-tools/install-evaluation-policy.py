#!/usr/bin/env python3
"""Install one exact predeclared policy in this execution's initialized store.

The user authorized isolated S2 publication and finite consumers. This is explicit
operator configuration, separate from Atlas prepare/init/admit and any judge vote.
"""
import argparse
import datetime
import hashlib
import json
import os
from pathlib import Path
import uuid

BASE = Path('/workspace/scratch/5cfbb6c803f1')
AUTH = BASE / 's2-investigation/evaluation-authority'
PREPARED = BASE / 's2-execution/evaluation-prepare-02/prepared.json'
PINS = {
    'evaluation-policy-admit.draft.json': '2e2afec9425fe047cad8e52b2b75b8a43f5bbd0b5800e7aaa4bff73c9f6977c4',
    'evaluation-policies-consumer.draft.json': '50ca61068826dd0f10570bc6a2c3b7cf1a927ed2805874dd519d97b34d06a83b',
    'governance-policy.draft.json': 'edc84d9c4809be52f1ccea1b72851aa54c11fa81777a890c988a05b00e97cf22',
}


def encode(value):
    return (json.dumps(value, ensure_ascii=False, indent=2) + '\n').encode()


def stamp(data):
    return {'byte_length': len(data), 'sha256': hashlib.sha256(data).hexdigest()}


def proposed(name):
    data = (AUTH / name).read_bytes()
    assert hashlib.sha256(data).hexdigest() == PINS[name], 'predeclared policy bytes changed'
    return data


def atomic_write(path, data):
    temp = path.with_name(path.name + '.' + str(uuid.uuid4()) + '.tmp')
    with temp.open('xb') as stream:
        stream.write(data)
        stream.flush()
        os.fsync(stream.fileno())
    os.replace(temp, path)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('case', help='admit or one frozen consumer case ID')
    parser.add_argument('output_dir', type=Path)
    args = parser.parse_args()
    prepared_bytes = PREPARED.read_bytes()
    assert hashlib.sha256(prepared_bytes).hexdigest() == 'bb3ee09693ef1ddfb89e548f3f5e0d38c4abaee5e6d253f129c7c6c1a9dbda0e'
    prepared = json.loads(prepared_bytes)
    root = Path(prepared['candidate']['repo_root'])
    assert root == BASE / 's2-evaluation' and root.resolve(strict=True) == root
    marker_bytes = (root / '.atlas/evaluation-store.json').read_bytes()
    marker = json.loads(marker_bytes)
    assert marker['evaluationCandidate'] == prepared['candidate_id']
    if args.case == 'admit':
        source = AUTH / 'evaluation-policy-admit.draft.json'
        policy_bytes = proposed(source.name)
        policy = json.loads(policy_bytes)
    else:
        source = AUTH / 'evaluation-policies-consumer.draft.json'
        choices = json.loads(proposed(source.name))
        assert args.case in choices, 'case is not predeclared'
        policy = choices[args.case]
        policy_bytes = encode(policy)
    for key in ['root', 'evaluationPlan', 'obligationSet', 'evaluationCandidate', 'generation', 'scope']:
        assert policy[key] == marker[key], 'marker/policy binding mismatch: ' + key
    assert policy['actor'] == 'genesis-s2-resume-846d4f9c'
    expected_operations = ['admit'] if args.case == 'admit' else ['index', 'read']
    assert policy['operations'] == expected_operations
    governance_bytes = proposed('governance-policy.draft.json')
    governed = json.loads(governance_bytes)
    assert governed['authz']['scopes'] == {'orchestra.interfaces': [policy['actor']]}
    args.output_dir.mkdir(parents=True, exist_ok=False)
    revisions = []
    for name, data in [('policy.json', governance_bytes), ('evaluation-policy.json', policy_bytes)]:
        path = root / '.atlas' / name
        before = path.read_bytes() if path.exists() else None
        if before is not None:
            assert not path.is_symlink() and path.stat().st_nlink == 1
            if name == 'policy.json':
                assert before == data, 'existing governance policy differs'
            else:
                previous = json.loads(before)
                for key in ['schema', 'root', 'evaluationPlan', 'obligationSet', 'evaluationCandidate', 'generation', 'scope', 'actor']:
                    assert previous[key] == policy[key], 'existing evaluation authority differs'
        if before != data:
            atomic_write(path, data)
        assert path.read_bytes() == data
        (args.output_dir / ('after-' + name)).write_bytes(data)
        if before is not None:
            (args.output_dir / ('before-' + name)).write_bytes(before)
        revisions.append({'path': str(path), 'before': None if before is None else stamp(before),
                          'after': stamp(data), 'changed': before != data})
    record = {
        'schema': 'genesis-s2-explicit-policy-installation/v1',
        'recorded_at': datetime.datetime.now(datetime.timezone.utc).isoformat(),
        'case': args.case, 'candidate_id': prepared['candidate_id'],
        'generation': policy['generation'], 'actor': policy['actor'],
        'operations': policy['operations'], 'consumer': policy['consumer'],
        'marker_before': stamp(marker_bytes), 'revisions': revisions,
        'installer_sha256': hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
        'runtime_command_executed': False, 'judge_decision_created': False,
        'budget_files_modified': False,
        'authority_limit': 'Explicit user-authorized local configuration; actor is nominal and unauthenticated. No global activation or accepted-phase promotion.',
    }
    with (args.output_dir / 'receipt.json').open('x') as stream:
        json.dump(record, stream, ensure_ascii=False, indent=2)
        stream.write('\n')
    print(json.dumps({'case': args.case, 'operations': policy['operations'], 'candidate': prepared['candidate_id']}))


if __name__ == '__main__':
    raise SystemExit(main())
