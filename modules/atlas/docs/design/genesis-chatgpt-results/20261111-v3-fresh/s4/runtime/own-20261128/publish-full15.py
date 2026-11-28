#!/usr/bin/env python3
"""Publish and read back the approved S4 candidate through the normal Atlas CLI."""

import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess


CANDIDATE = '10171ee9769ac7ce7013e8e16fbc5064e79a458a9cc65b80a503164e00306253'
PREPARED_SHA = 'e6831efca8f63c3e0aeac092d7f4c14ffd0882b5e7d101683c3cf4773f8ba257'
RUNTIME = '9b0188b2be5ea69638dff8a44e3e931b4d6d8b10'
SCOPE = 'atlas-continuity-rag-genesis'
ACTOR = '/root'
APPROVAL_DIR = 's4-binding'


def insist(condition, message):
    if not condition:
        raise ValueError(message)


def sha(data):
    return hashlib.sha256(data).hexdigest()


def write_json(path, value):
    with path.open('x', encoding='utf-8') as output:
        json.dump(value, output, indent=2, ensure_ascii=False)
        output.write('\n')


def cli(runtime, root, out, tag, mode, *arguments):
    argv = ['bun', 'scripts/genesis-native.ts', mode, str(root), *map(str, arguments)]
    completed = subprocess.run(
        argv, cwd=runtime / 'modules/atlas', stdin=subprocess.DEVNULL, capture_output=True,
        env={**os.environ, 'ATLAS_ACTOR': ACTOR, 'ATLAS_RATIFY_TOKEN': ACTOR}, check=False,
    )
    (out / (tag + '.stdout.json')).write_bytes(completed.stdout)
    (out / (tag + '.stderr.txt')).write_bytes(completed.stderr)
    write_json(out / (tag + '.receipt.json'), {
        'argv': argv, 'exit_code': completed.returncode,
        'stdout_sha256': sha(completed.stdout), 'stderr_sha256': sha(completed.stderr),
    })
    insist(completed.returncode == 0, tag + ' refused; inspect the original command receipt')
    return json.loads(completed.stdout)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--runtime', type=Path, required=True)
    parser.add_argument('--source', type=Path, required=True)
    parser.add_argument('--prepared', type=Path, required=True)
    parser.add_argument('--binding-directory', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    insist(os.environ.get('GITHUB_ACTIONS') == 'true' and os.environ.get('GITHUB_EVENT_NAME') == 'workflow_dispatch'
           and os.environ.get('GITHUB_REPOSITORY') == 'gustavomhss/hugr-orchestra'
           and os.environ.get('GITHUB_REF') == 'refs/heads/genesis-knowledge-resume', 'requires isolated manual workflow')
    runner = Path(os.environ['RUNNER_TEMP']).resolve()
    runtime, root = args.runtime.resolve(), args.source.resolve()
    out, prepared_path = args.output.resolve(), args.prepared.resolve()
    insist((runtime, root) == (runner / 's4-runtime', runner / 's4-source'), 'unexpected runtime or corpus root')
    insist(out == runner / 's4-publication' and prepared_path == runner / 's4-evidence/prepared.json', 'unexpected evidence paths')
    actual_revision = subprocess.check_output(['git', '-C', str(runtime), 'rev-parse', 'HEAD'], text=True).strip()
    insist(actual_revision == RUNTIME, 'runtime revision differs')
    raw = prepared_path.read_bytes()
    insist(sha(raw) == PREPARED_SHA, 'prepared bytes differ from the judged replay')
    prepared = json.loads(raw)
    candidate = prepared['candidate']
    insist(prepared['candidate_id'] == CANDIDATE and candidate['scope'] == SCOPE and candidate['repo_root'] == str(root), 'candidate identity differs')
    insist(sorted(path.name for path in (root / '.atlas').iterdir()) == ['cas'], 'pre-publication state must contain CAS only')
    binding_bytes = (args.binding_directory / 'approval.json').read_bytes()
    binding = json.loads(binding_bytes)
    insist(binding['candidate_id'] == CANDIDATE and binding['contract'] == candidate['contract'], 'approval targets different candidate')
    insist(len(binding['decisions']) == 2 and len(set(binding['reviewers'])) == 2, 'requires two independent decisions')
    binding_files = {}
    for decision in binding['decisions']:
        for field in ('request_ref', 'response_ref'):
            ref = decision[field]
            name = Path(ref['payload_path']).name
            insist(ref['payload_path'] == f'{APPROVAL_DIR}/{name}' and name not in {'', '.', '..', 'approval.json'}, 'unexpected review path')
            data = (args.binding_directory / name).read_bytes()
            insist(sha(data) == ref['sha256'], 'review evidence changed')
            binding_files[name] = data
    copied = root / APPROVAL_DIR
    copied.mkdir()
    for name, data in binding_files.items():
        (copied / name).write_bytes(data)
    approval = copied / 'approval.json'
    approval.write_bytes(binding_bytes)
    out.mkdir()
    policy = {
        't0Heuristic': {'keywords': ['auth', 'payments', 'secrets', 'kms', 'crypto', 'billing']},
        'authz': {'scopes': {SCOPE: [ACTOR]}, 'anchors': {'.': SCOPE}},
    }
    write_json(root / '.atlas/policy.json', policy)
    write_json(out / 'authorization.json', {'root': str(root), 'actor': ACTOR, 'scope': SCOPE, 'policy': policy})
    publication = cli(runtime, root, out, 'publish', 'publish', prepared_path, f'{APPROVAL_DIR}/approval.json')
    emission = publication['emission']
    insist(publication['candidate_id'] == CANDIDATE and publication['check']['wouldEmit'] is True
           and emission['ok'] is True and emission['data']['emitted'] is True, 'governed publication did not emit')
    ownership = publication['ownership']
    results = {entry['key']: entry['artifact']['result'] for entry in candidate['entries']}
    for need, key in candidate['roots'].items():
        tag = f'index-{need}'
        query = out / (tag + '.query.json')
        write_json(query, {'scope': SCOPE, 'need': need})
        observed = cli(runtime, root, out, tag, 'index', query)
        insist(observed['kind'] == 'index' and observed['manifest'] == ownership and observed['result'] == results[key], 'index did not return the approved root')
    package_path = root / candidate['transport']['path']
    package = json.loads(package_path.read_bytes())
    for number, artifact in enumerate(package['artifacts'], 1):
        body = artifact['body']
        tag = f'read-{number:02d}'
        query = out / (tag + '.query.json')
        write_json(query, {'scope': SCOPE, 'key': artifact['key'], 'maxBytes': body['byte_length']})
        observed = cli(runtime, root, out, tag, 'read', query)
        served = observed['body'].encode('utf-8')
        insist(observed['kind'] == 'ready' and observed['manifest'] == ownership and observed['result'] == results[artifact['key']]
               and len(served) == body['byte_length'] and sha(served) == body['sha256'], 'served artifact differs from the accepted version')
    write_json(out / 'summary.json', {
        'status': 'PUBLISHED_AND_READ_BACK', 'candidate_id': CANDIDATE, 'manifest': ownership,
        'runtime': RUNTIME, 'indexes': len(candidate['roots']), 'body_reads': len(package['artifacts']),
        'independent_consumer': 'NOT_RUN', 'maintenance': 'NOT_RUN',
    })


if __name__ == '__main__':
    main()
