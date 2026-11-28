#!/usr/bin/env python3
"""Reconstruct S2 evidence, refresh its plan and perform one guarded hosted prepare."""
import argparse
import hashlib
import io
import json
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import subprocess
import sys
import zipfile

RUNTIME = '9b0188b2be5ea69638dff8a44e3e931b4d6d8b10'
BASELINE = '7d323273e6d2d4675cbc46104cb0f93bdc811894'
PREFIX = 'modules/atlas/docs/design/genesis-chatgpt-results/20261111-v3-fresh/s2/resume-20261128/evaluation-v2'
OLD_RUNTIME = 'db9b4235022c4df32fe3bfd4faeea8adcd69abb7'
HERE = Path(__file__).resolve().parent


def require(condition, message):
    if not condition:
        raise RuntimeError(message)


def sha(data):
    return hashlib.sha256(data).hexdigest()


def write(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open('xb') as stream:
        stream.write(data)


def encoded(obj):
    return (json.dumps(obj, ensure_ascii=False, indent=2) + '\n').encode()


def row(path):
    data = path.read_bytes()
    return {'path': str(path), 'byte_length': len(data), 'sha256': sha(data)}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--repository', required=True, type=Path)
    parser.add_argument('--runtime', required=True, type=Path)
    parser.add_argument('--output', required=True, type=Path)
    parser.add_argument('--materialize-only', action='store_true')
    args = parser.parse_args()
    repository = args.repository.resolve(strict=True)
    runtime = args.runtime.resolve(strict=True)
    out = args.output.absolute()
    require(not out.exists(), 'output must be absent')
    def git(*argv):
        return subprocess.check_output(['git', '-C', str(repository), *argv])
    require(git('rev-parse', RUNTIME + '^{commit}').decode().strip() == RUNTIME, 'runtime unavailable')
    require(subprocess.check_output(['git', '-C', str(runtime), 'rev-parse', 'HEAD']).decode().strip() == RUNTIME, 'runtime HEAD mismatch')
    require(not subprocess.check_output(['git', '-C', str(runtime), 'diff', '--name-only', 'HEAD']).strip(), 'runtime tracked changes')
    inventory = json.loads((HERE / 'source-inventory.json').read_bytes())
    baseline = json.loads(git('show', f'{BASELINE}:{PREFIX}/prepare-02/receipt.json'))
    expected = {entry['path'].removeprefix('/workspace/scratch/5cfbb6c803f1/s2-evaluation/'): (entry['byte_length'], entry['sha256']) for entry in baseline['input_files_before']}
    require(len(expected) == 716 and baseline['input_files_before'] == baseline['input_files_after'], 'baseline receipt mismatch')
    require(len(inventory['resolved']) == 716 and not inventory['missing'], 'inventory mismatch')
    require({x['target']: (x['byte_length'], x['sha256']) for x in inventory['resolved']} == expected, 'inventory does not match receipt')
    out.mkdir(parents=True)
    original = out / 'historical-inputs'
    corpus = out / 'corpus'
    archives = {}
    for item in inventory['resolved']:
        target = PurePosixPath(item['target'])
        require(not target.is_absolute() and all(p not in ('', '.', '..') for p in target.parts), 'unsafe path')
        if 'git' in item:
            data = git('show', item['git'])
        else:
            name, member = item['archive'].split(':', 1)
            require(name in ('dossier-and-transport-evidence.zip', 'operator-preparation-evidence.zip', 'maintenance-not-run-evidence.zip'), 'unexpected archive')
            if name not in archives:
                archives[name] = zipfile.ZipFile(io.BytesIO(git('show', f'{BASELINE}:{PREFIX}/admission-r1/archives/{name}')))
            data = archives[name].read(member)
        require((len(data), sha(data)) == expected[item['target']], 'historical source mismatch: ' + item['target'])
        write(original.joinpath(*target.parts), data)
    shutil.copytree(original, corpus)
    plan_path = corpus / PREFIX / 'evaluation-plan.json'
    plan = json.loads(plan_path.read_bytes())
    origin = json.loads((corpus / plan['original_prepared']['payload_path']).read_bytes())
    require(origin['candidate_id'] == '4a36e1210acf6a4bb460846b717d446e6c259f80a78fd73cfce8b5a6e445f522', 'original candidate mismatch')
    new_implementation = {}
    marker = f'{PREFIX}/implementation/{OLD_RUNTIME}/'
    for old, old_hash in plan['implementation'].items():
        require(old.startswith(marker), 'unexpected old implementation path')
        require(sha((corpus / old).read_bytes()) == old_hash, 'old implementation mismatch')
        relative = old.removeprefix(marker)
        data = git('show', f'{RUNTIME}:{relative}')
        require((runtime / relative).read_bytes() == data, 'runtime source drift: ' + relative)
        new = f'{PREFIX}/implementation/{RUNTIME}/{relative}'
        write(corpus / new, data)
        new_implementation[new] = sha(data)
    plan['implementation'] = new_implementation
    plan['isolation'] = {'root': str(corpus), 'original_root': origin['candidate']['repo_root']}
    plan_path.write_bytes(encoded(plan))
    require(not (corpus / '.git').exists() and not (corpus / '.atlas').exists(), 'corpus must be fresh')
    write(out / 'materialization.json', encoded({'runtime_revision': RUNTIME, 'historical_input_count': len(expected), 'historical_inputs': str(original), 'refreshed_plan': row(plan_path), 'implementation_count': len(new_implementation), 'old_candidate': 'd1c8478b155b2085df1289ef91edfeaa4834e9300d651c0b953e6e2978aa5d30', 'state': 'MATERIALIZED_NOT_ADMITTED'}))
    if args.materialize_only:
        return
    require(os.environ.get('GITHUB_ACTIONS') == 'true', 'execution requires GitHub Actions')
    bun = Path(shutil.which('bun') or '').resolve(strict=True)
    def runtime_inventory():
        files = []
        links = []
        for directory, names, filenames in os.walk(runtime, followlinks=False):
            parent = Path(directory)
            names[:] = sorted(name for name in names if name != '.git')
            for name in list(names):
                path = parent / name
                if path.is_symlink():
                    require(path.resolve(strict=True).is_relative_to(runtime), 'runtime symlink escapes tree')
                    links.append({'path': str(path), 'target': os.readlink(path)})
                    names.remove(name)
            for name in sorted(filenames):
                path = parent / name
                if path.is_symlink():
                    require(path.resolve(strict=True).is_relative_to(runtime), 'runtime symlink escapes tree')
                    links.append({'path': str(path), 'target': os.readlink(path)})
                else:
                    require(path.is_file(), 'nonregular runtime file')
                    files.append(row(path))
        return files, links
    files, links = runtime_inventory()
    write(out / 'runtime-byte-lock.json', encoded({'runtime_revision': RUNTIME, 'files': files, 'symlinks': links, 'bun': row(bun), 'scope': 'installed runtime regular files and symlinks after npm ci and build; external guard, not intrinsic runtime identity'}))
    source_files = [row(p) for p in sorted(corpus.rglob('*')) if p.is_file()]
    recorder = repository / PREFIX / 'prepare-03/recorder-used.py'
    require(sha(recorder.read_bytes()) == '0185ccf143d7a5d1112b573fd0405da899b27d112cb4c7b431e1cbb1da629b30', 'historical recorder mismatch')
    extras = [row(recorder), row(out / 'runtime-byte-lock.json')]
    # Entry point and Bun are already in the runtime/host lock; each path occurs once.
    inputs = source_files + files + extras + [row(bun)]
    require(len({r['path'] for r in inputs}) == len(inputs), 'duplicate guard input')
    prepared = out / 'prepared.json'
    command = {'execution_id': '846d4f9c-fb77-4e21-aff6-1fffccc3132b', 'operation_id': 's2-evaluation-prepare-9b0188b-' + os.environ['GITHUB_RUN_ID'] + '-' + os.environ['GITHUB_RUN_ATTEMPT'], 'operation': 'evaluation-prepare-with-external-byte-guard', 'code_root': str(runtime), 'corpus_root': str(corpus), 'runtime_revision': RUNTIME, 'corpus_revision': None, 'require_no_atlas_state': True, 'bun': str(bun), 'cwd': str(runtime / 'modules/atlas'), 'command_argv': [str(bun), 'scripts/genesis-evaluation.ts', 'prepare', str(corpus), PREFIX + '/evaluation-plan.json', str(prepared)], 'nominal_environment': {}, 'unset_environment': ['ATLAS_ACTOR', 'ATLAS_RATIFY_TOKEN'], 'candidate_id': None, 'original_candidate': origin['candidate_id'], 'previous_evaluation_candidate': 'd1c8478b155b2085df1289ef91edfeaa4834e9300d651c0b953e6e2978aa5d30', 'input_files': [r['path'] for r in inputs], 'expected_input_files': inputs, 'output_files': [str(prepared)], 'release_pin': {'runtime_revision': RUNTIME, 'qualification_run': '46157365177', 'qualification_status': 'referenced separately; not transferred'}}
    write(out / 'command.json', encoded(command))
    result = subprocess.run([sys.executable, str(recorder), str(out / 'command.json'), str(out / 'operation')], check=False)
    receipt_path = out / 'operation/receipt.json'
    require(receipt_path.is_file(), f'recorder failed before receipt: {result.returncode}')
    receipt = json.loads(receipt_path.read_bytes())
    current_files, current_links = runtime_inventory()
    source_after = [row(p) for p in sorted(corpus.rglob('*')) if p.is_file() and '.atlas' not in p.relative_to(corpus).parts]
    historical_after = [row(p) for p in sorted(original.rglob('*')) if p.is_file()]
    require(result.returncode == 0 and receipt['exit_code'] == 0, 'prepare failed')
    require(receipt['named_input_bytes_unchanged'] and current_files == files and current_links == links and source_after == source_files, 'byte guard changed')
    require(not receipt['cas_before'] and not receipt['state_files_before'] and not receipt['state_files_after'] and receipt['cas_after'], 'unexpected non-CAS state or missing CAS')
    require(len(historical_after) == 716 and all((r['byte_length'], r['sha256']) == expected[str(Path(r['path']).relative_to(original))] for r in historical_after), 'historical inputs changed')
    value = json.loads(prepared.read_bytes())
    require(value == json.loads((out / 'operation/stdout.json').read_bytes()), 'stdout and prepared output differ')
    require(value['schema'] == 'genesis-native-prepared/v2' and re.fullmatch(r'[0-9a-f]{64}', value['candidate_id']), 'unexpected prepared result')
    require(value['candidate']['repo_root'] == str(corpus) and value['candidate']['original_candidate'] == origin['candidate_id'], 'candidate lineage mismatch')
    write(out / 'verification.json', encoded({'state': 'PREPARED_NOT_ADMITTED', 'candidate_id': value['candidate_id'], 'old_candidate': command['previous_evaluation_candidate'], 'inputs_unchanged': True, 'historical_inputs_unchanged': True, 'cas_before': 0, 'cas_after': len(receipt['cas_after']), 'non_cas_state_files': 0, 'runtime_symlinks_unchanged': True, 'admission': 'NOT_RUN', 'review': 'NOT_RUN'}))


if __name__ == '__main__':
    main()
