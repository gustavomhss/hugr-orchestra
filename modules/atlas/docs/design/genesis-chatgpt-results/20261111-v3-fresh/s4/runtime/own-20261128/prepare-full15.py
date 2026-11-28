#!/usr/bin/env python3
"""Reconstruct the sealed S4 composite and derive the prepare transport; execute only in Actions."""
import argparse
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import subprocess

S4 = 'modules/atlas/docs/design/genesis-chatgpt-results/20261111-v3-fresh/s4'
RECEIPT = S4 + '/runtime/own-20261128/materialization-receipt.json'
RECEIPT_SHA = '3e2cfc5b82924f7e54ba148b026268a92fb4f8250bcce2ac81d40ee805c82f5c'
PACKAGE = S4 + '/native-package.json'
PACKAGE_SHA = '443caac944c273a6066927caddc7b275ef66c037b3125e42c0fe5b620aa6d69b'
DRIVER = 'file:' + S4 + '/runtime/maintenance-operation.mjs'
PROTOCOL = 'file:.orchestra/skills/execute-genesis/references/transport.md'
TRANSPORT = S4 + '/native-package-full15-operational.json'


def sha(data):
    return hashlib.sha256(data).hexdigest()


def git(repo, *args):
    return subprocess.run(['git', '-C', str(repo), *args], check=True, stdout=subprocess.PIPE).stdout


def relative(path):
    p = PurePosixPath(path)
    if not path or p.is_absolute() or any(part in ('', '.', '..', '.git', '.atlas') for part in path.split('/')) or '\\' in path:
        raise ValueError('unsafe path: ' + path)
    return Path(*p.parts)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--repository', type=Path, required=True)
    parser.add_argument('--source-root', type=Path, required=True)
    parser.add_argument('--output-dir', type=Path, required=True)
    parser.add_argument('--runtime-root', type=Path)
    parser.add_argument('--runtime-sha')
    args = parser.parse_args()
    repo, root, out = args.repository.resolve(), args.source_root.resolve(), args.output_dir.resolve()
    if root.exists() or out.exists() or root.is_relative_to(repo) or out.is_relative_to(root) or root.is_relative_to(out):
        raise ValueError('fresh independent source and output roots required')
    raw = (repo / RECEIPT).read_bytes()
    if sha(raw) != RECEIPT_SHA:
        raise ValueError('sealed materialization receipt differs')
    receipt = json.loads(raw)
    if len(receipt['files']) != 283 or receipt['observed_head'] is not None:
        raise ValueError('unexpected composite receipt')
    root.mkdir(parents=True)
    out.mkdir(parents=True)
    seen = set()
    for row in receipt['files']:
        path = row['path']
        if path in seen:
            raise ValueError('duplicate path: ' + path)
        seen.add(path)
        data = git(repo, 'cat-file', 'blob', row['git_blob_sha'])
        blob = hashlib.sha1(f'blob {len(data)}\0'.encode() + data).hexdigest()
        if sha(data) != row['sha256'] or blob != row['git_blob_sha'] or len(data) != row['byte_length']:
            raise ValueError('blob mismatch: ' + path)
        for revision in row['declared_reference_commits']:
            actual = git(repo, 'show', revision + ':' + path)
            if actual != data:
                raise ValueError('declared revision mismatch: ' + revision + ':' + path)
        target = root / relative(path)
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)
    package_bytes = (root / PACKAGE).read_bytes()
    if sha(package_bytes) != PACKAGE_SHA:
        raise ValueError('sealed package differs')
    package = json.loads(package_bytes)
    if len(package['artifacts']) != 15 or len(package['roots']) != 7 or package['source_revision'] != '1cde2ff7a71bcf7aecb5d030917b577165135d38' or package['protocol_ref']['commit'] != 'ee2521a5b966bd505cc95bd1c733e09e12f33531':
        raise ValueError('package identity differs')
    original = json.loads(package_bytes)
    for artifact in package['artifacts']:
        artifact['input_keys'] = sorted(set(artifact['input_keys']) | {DRIVER, PROTOCOL})
    for before, after in zip(original['artifacts'], package['artifacts']):
        if {key: value for key, value in before.items() if key != 'input_keys'} != {key: value for key, value in after.items() if key != 'input_keys'}:
            raise ValueError('non-input metadata changed')
    inputs = {key for artifact in package['artifacts'] for key in artifact['input_keys']}
    if len(inputs) != 251 or not all(key.startswith('file:') and (root / relative(key[5:])).is_file() for key in inputs):
        raise ValueError('input set differs')
    transport = (json.dumps(package, ensure_ascii=False, indent=2) + '\n').encode()
    (root / TRANSPORT).write_bytes(transport)
    info = {'schema': 's4-full15-mechanical-input/v1', 'materialization_receipt_sha256': RECEIPT_SHA,
            'semantic_package_sha256': PACKAGE_SHA, 'operational_transport_sha256': sha(transport),
            'transport_path': TRANSPORT, 'file_count': len(seen), 'artifacts': 15, 'roots': 7,
            'input_count': len(inputs), 'observed_head': None, 'driver_sha256': sha((root / relative(DRIVER[5:])).read_bytes()),
            'scope': 'mechanical derivation only; original body and metadata unchanged; composite is not a Git checkout'}
    (out / 'inputs.json').write_text(json.dumps(info, indent=2) + '\n')
    if not args.runtime_root:
        print(json.dumps(info, sort_keys=True))
        return
    if os.environ.get('GITHUB_ACTIONS') != 'true' or not args.runtime_sha or len(args.runtime_sha) != 40:
        raise ValueError('runtime execution requires GitHub Actions and a full pinned runtime SHA')
    runtime = args.runtime_root.resolve()
    if git(runtime, 'rev-parse', 'HEAD').decode().strip() != args.runtime_sha or git(runtime, 'diff', '--name-only', 'HEAD').strip():
        raise ValueError('runtime checkout mismatch or modified')
    argv = ['bun', 'scripts/genesis-native.ts', 'prepare', str(root), TRANSPORT, str(out / 'prepared.json')]
    result = subprocess.run(argv, cwd=runtime / 'modules/atlas', stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    (out / 'stdout.txt').write_bytes(result.stdout)
    (out / 'stderr.txt').write_bytes(result.stderr)
    operation = {'argv': argv, 'runtime_sha': args.runtime_sha, 'exit_code': result.returncode, 'binding': 'NOT_ATTEMPTED', 'publication': 'NOT_ATTEMPTED'}
    (out / 'operation.json').write_text(json.dumps(operation, indent=2) + '\n')
    if result.returncode:
        raise RuntimeError('prepare failed; retain stdout/stderr and operation receipt')
    prepared = json.loads((out / 'prepared.json').read_bytes())
    candidate = prepared['candidate']
    if prepared != json.loads(result.stdout) or candidate['observed_head'] is not None or len(candidate['entries']) != 15 or len(candidate['observations']) != 251 or candidate['transport']['sha256'] != sha(transport):
        raise ValueError('prepared output mismatch')
    observations = {item['key']: item for item in candidate['observations']}
    if set(observations) != inputs or [entry['key'] for entry in candidate['entries']] != [artifact['key'] for artifact in package['artifacts']]:
        raise ValueError('prepared input or artifact membership differs')
    for key, observation in observations.items():
        if observation['sha256'] != sha((root / relative(key[5:])).read_bytes()):
            raise ValueError('observed bytes differ: ' + key)
    for row in receipt['files']:
        if sha((root / relative(row['path'])).read_bytes()) != row['sha256']:
            raise ValueError('input modified: ' + row['path'])
    operation.update({'prepared_sha256': sha((out / 'prepared.json').read_bytes()), 'candidate_id': prepared['candidate_id'], 'status': 'PREPARE_OUTPUT_CHECKED'})
    (out / 'operation.json').write_text(json.dumps(operation, indent=2) + '\n')
    print(json.dumps(operation, sort_keys=True))


if __name__ == '__main__':
    main()
