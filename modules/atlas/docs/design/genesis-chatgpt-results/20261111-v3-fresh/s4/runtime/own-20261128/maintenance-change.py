#!/usr/bin/env python3
"""Stage a frozen mixed-pin case; execute only with fresh target-specific binding."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess

RUNTIME = '9b0188b2be5ea69638dff8a44e3e931b4d6d8b10'
CANDIDATE = '10171ee9769ac7ce7013e8e16fbc5064e79a458a9cc65b80a503164e00306253'
MANIFEST = 'df2dae9de5931cb86f7572bb6c093fe3fdaef6a274ad8f4985db5c3c63a21afe'
DRIVER_SHA = 'a6a579e6a3978daa9a67f01bce06fda56172334b0e34323e787cba4d5ab9f27f'
DRIVER = 'modules/atlas/docs/design/genesis-chatgpt-results/20261111-v3-fresh/s4/runtime/maintenance-operation.mjs'


def sha(value):
    return hashlib.sha256(value).hexdigest()


def require(condition, message):
    if not condition:
        raise ValueError(message)


def main():
    p = argparse.ArgumentParser()
    for arg in ('repository', 'runtime', 'source', 'prepared', 'publication', 'oracle', 'binding-directory', 'output'):
        p.add_argument('--' + arg, type=Path, required=True)
    args = p.parse_args()
    require(os.environ.get('GITHUB_ACTIONS') == 'true' and os.environ.get('GITHUB_EVENT_NAME') == 'workflow_dispatch'
            and os.environ.get('GITHUB_REPOSITORY') == 'gustavomhss/hugr-orchestra'
            and os.environ.get('GITHUB_REF') == 'refs/heads/genesis-knowledge-resume', 'requires isolated manual workflow')
    temp = Path(os.environ['RUNNER_TEMP']).resolve()
    repo, runtime, root, prepared, publication, out = (x.resolve() for x in
        (args.repository, args.runtime, args.source, args.prepared, args.publication, args.output))
    require((runtime, root, prepared, publication, out) == (temp / 's4-runtime', temp / 's4-source',
            temp / 's4-evidence/prepared.json', temp / 's4-publication', temp / 's4-change'), 'unexpected paths')
    out.mkdir()
    ledger = {'schema': 's4-maintenance-change/v1', 'status': 'HOLD', 'activation_attempted': False,
              'baseline_candidate': CANDIDATE, 'baseline_manifest': MANIFEST, 'runtime': RUNTIME}
    try:
        oracle_raw = args.oracle.read_bytes()
        oracle = json.loads(oracle_raw)
        ledger['oracle_sha256'] = sha(oracle_raw)
        require(oracle['frozen_before_target_preparation'] is True and oracle['baseline_manifest'] == MANIFEST, 'wrong frozen oracle')
        require(subprocess.check_output(['git', '-C', str(runtime), 'rev-parse', 'HEAD'], text=True).strip() == RUNTIME, 'wrong runtime')
        baseline = json.loads(prepared.read_bytes())
        pub = json.loads((publication / 'summary.json').read_bytes())
        require(baseline['candidate_id'] == CANDIDATE and pub['manifest'] == MANIFEST and pub['candidate_id'] == CANDIDATE
                and pub['runtime'] == RUNTIME and pub['status'] == 'PUBLISHED_AND_READ_BACK', 'wrong approved baseline')
        driver = root / DRIVER
        require(sha(driver.read_bytes()) == DRIVER_SHA, 'historical driver differs')
        path = oracle['source_path']
        def git(*argv):
            return subprocess.check_output(['git', '-C', str(repo), *argv])
        old = git('show', oracle['baseline_commit'] + ':' + path)
        new = git('show', oracle['target_commit'] + ':' + path)
        for label, data in (('baseline', old), ('target', new)):
            require(sha(data) == oracle[label + '_sha256'] and
                    git('rev-parse', oracle[label + '_commit'] + ':' + path).decode().strip() == oracle[label + '_git_blob'],
                    label + ' immutable Git pin differs')
        (out / 'baseline-source.txt').write_bytes(old)
        (out / 'target-source.txt').write_bytes(new)
        (out / 'source-diff.txt').write_bytes(git('diff', oracle['baseline_commit'], oracle['target_commit'], '--', path))
        source = root / path
        require(source.read_bytes() == old, 'live source is not baseline')
        base_path = baseline['candidate']['transport']['path']
        base_bytes = (root / base_path).read_bytes()
        require(sha(base_bytes) == baseline['candidate']['transport']['sha256'], 'baseline transport differs')
        original = json.loads(base_bytes)
        changed = json.loads(json.dumps(original))
        matches = [(a, r) for a in changed['artifacts'] for r in a['source_refs'] if r['path'] == path]
        require(len(matches) == 1 and matches[0][0]['key'] == oracle['direct_key'], 'source membership differs')
        ref = matches[0][1]
        require(ref == {'commit': oracle['baseline_commit'], 'path': path, 'git_blob_sha': oracle['baseline_git_blob'],
                        'sha256': oracle['baseline_sha256']}, 'baseline source reference differs')
        ref.update({'commit': oracle['target_commit'], 'git_blob_sha': oracle['target_git_blob'], 'sha256': oracle['target_sha256']})
        target_path = str(Path(base_path).with_name('native-package-full15-maintenance.json'))
        (root / target_path).write_text(json.dumps(changed, ensure_ascii=False, indent=2) + '\n')
        (out / 'target-transport.json').write_bytes((root / target_path).read_bytes())
        ledger.update({'target_transport': target_path, 'target_transport_sha256': sha((root / target_path).read_bytes()),
                       'source_pins': {'baseline': oracle['baseline_commit'], 'target': oracle['target_commit']}})
        projection = {p.name: sha(p.read_bytes()) for p in sorted((root / '.atlas').glob('projection*.json'))}
        require('projection.json' in projection, 'active projection missing')
        def run(tag, argv):
            result = subprocess.run(argv, cwd=runtime / 'modules/atlas', stdin=subprocess.DEVNULL, capture_output=True,
                                    env={**os.environ, 'ATLAS_ACTOR': '/root', 'ATLAS_RATIFY_TOKEN': '/root'}, check=False)
            (out / (tag + '.stdout.txt')).write_bytes(result.stdout)
            (out / (tag + '.stderr.txt')).write_bytes(result.stderr)
            receipt = {'argv': argv, 'exit_code': result.returncode, 'stdout_sha256': sha(result.stdout), 'stderr_sha256': sha(result.stderr)}
            (out / (tag + '.receipt.json')).write_text(json.dumps(receipt, indent=2) + '\n')
            return result
        cli = ['bun', 'scripts/genesis-native.ts', 'prepare', str(root)]
        source.write_bytes(new)
        refusal = run('control-old-ref-new-source', [*cli, base_path, str(out / 'control-old.json')])
        require(refusal.returncode != 0 and b'native-source-drift' in refusal.stderr and path.encode() in refusal.stderr
                and not (out / 'control-old.json').exists(), 'old reference did not refuse new source')
        source.write_bytes(old)
        refusal = run('control-new-ref-old-source', [*cli, target_path, str(out / 'control-new.json')])
        require(refusal.returncode != 0 and b'native-source-drift' in refusal.stderr and path.encode() in refusal.stderr
                and not (out / 'control-new.json').exists(), 'new reference did not refuse old source')
        source.write_bytes(new)
        target_file = out / 'prepared.json'
        result = run('prepare-target', [*cli, target_path, str(target_file)])
        require(result.returncode == 0 and target_file.exists(), 'target prepare refused')
        target = json.loads(target_file.read_bytes())
        require(target == json.loads(result.stdout) and target['candidate_id'] != CANDIDATE, 'target identity not distinct')
        prior, current = baseline['candidate'], target['candidate']
        require(current['contract'] == prior['contract'] and current['criteria'] == prior['criteria'] and current['roots'] == prior['roots']
                and current['implementation'] == prior['implementation'] and current['repo_root'] == prior['repo_root'], 'contract or execution identity changed')
        require(len(current['entries']) == len(prior['entries']) == 15 and len(current['observations']) == 251, 'target population changed')
        for a, b in zip(prior['entries'], current['entries']):
            require(a['key'] == b['key'] and a['artifact'] == b['artifact'] and a['dependencies'] == b['dependencies'], 'body/result or graph changed')
            require((a['inputs_id'] != b['inputs_id']) == (a['key'] == oracle['direct_key']), 'unexpected target input identity')
        obs_old = {x['key']: x for x in prior['observations']}
        obs_new = {x['key']: x for x in current['observations']}
        require(set(obs_old) == set(obs_new) and [k for k in obs_old if obs_old[k] != obs_new[k]] == ['file:' + path], 'unexpected source observations')
        require(projection == {p.name: sha(p.read_bytes()) for p in sorted((root / '.atlas').glob('projection*.json'))}, 'prepare or controls activated state')
        ledger.update({'status': 'PREPARED_NEEDS_FRESH_SEMANTIC_AND_BINDING', 'target_candidate': target['candidate_id'],
                       'target_contract': current['contract'], 'prepared_sha256': sha(target_file.read_bytes()),
                       'controls': 'BOTH_REFUSED_SOURCE_DRIFT', 'projection_before': projection})
        if os.environ.get('S4_EXECUTE_CHANGE') == 'true':
            binding_dir = args.binding_directory.resolve()
            semantic = json.loads((binding_dir / 'semantic-acceptance.json').read_bytes())
            require(semantic['candidate_id'] == target['candidate_id'] and semantic['source_sha256'] == oracle['target_sha256']
                    and len(semantic['decisions']) == 2
                    and len({d['reviewer'] for d in semantic['decisions']}) == 2, 'fresh semantic acceptance required')
            for decision in semantic['decisions']:
                name = decision['response_file']
                require(Path(name).name == name and name not in ('', '.', '..') and decision['verdict'] == 'PASS'
                        and sha((binding_dir / name).read_bytes()) == decision['response_sha256'], 'semantic decision evidence differs')
            binding_bytes = (binding_dir / 'approval.json').read_bytes()
            binding = json.loads(binding_bytes)
            require(binding['candidate_id'] == target['candidate_id'] and binding['contract'] == current['contract']
                    and len(binding['decisions']) == 2 and len(set(binding['reviewers'])) == 2, 'fresh target binding required')
            target_binding = root / 's4-change-binding'
            target_binding.mkdir()
            for decision in binding['decisions']:
                for field in ('request_ref', 'response_ref'):
                    ref = decision[field]
                    name = Path(ref['payload_path']).name
                    require(ref['payload_path'] == 's4-change-binding/' + name and name not in ('', '.', '..', 'approval.json'), 'invalid binding reference')
                    data = (binding_dir / name).read_bytes()
                    require(sha(data) == ref['sha256'], 'binding evidence differs')
                    (target_binding / name).write_bytes(data)
            (target_binding / 'approval.json').write_bytes(binding_bytes)
            command = ['bun', str(driver), 'rebuild', str(runtime / 'modules/atlas'), str(root), MANIFEST, str(target_file), 's4-change-binding/approval.json']
            rebuilt = run('private-rebuild', command)
            require(rebuilt.returncode == 0, 'private rebuild refused')
            report = json.loads(rebuilt.stdout)
            require(report['kind'] == 'candidate' and report['affected'] == oracle['planned_affected'] and report['calls'] == oracle['expected_calls']
                    and report['private_manifest'] != MANIFEST and report['activation_attempted'] is False, 'rebuild does not match frozen oracle')
            require(len(report['before']) == len(report['after']) == 15 and all(
                (report['before'][k] != report['after'][k]) == (k == oracle['direct_key']) for k in report['before']), 'unexpected identity changes')
            require(projection == {p.name: sha(p.read_bytes()) for p in sorted((root / '.atlas').glob('projection*.json'))}, 'private rebuild activated state')
            ledger['publish_command_started'] = True
            command[2] = 'publish'
            emitted = run('governed-publish', command)
            try:
                ledger['activation_attempted'] = json.loads(emitted.stdout).get('activation_attempted', 'UNKNOWN')
            except (ValueError, UnicodeDecodeError):
                ledger['activation_attempted'] = 'UNKNOWN'
            require(emitted.returncode == 0, 'governed activation refused; inspect original output')
            response = json.loads(emitted.stdout)
            require(response['kind'] == 'publication-attempt' and response['private_manifest'] == report['private_manifest']
                    and response['affected'] == oracle['planned_affected'] and response['calls'] == oracle['expected_calls']
                    and response['emission']['ok'] is True and response['emission']['data']['emitted'] is True
                    and response['published_manifest_matches_candidate'] is True, 'governed activation/readback did not match')
            ledger.update({'status': 'CHANGED_REBUILD_AND_ACTIVATION_OBSERVED', 'published_manifest': report['private_manifest']})
    except Exception as error:
        ledger['error'] = {'type': type(error).__name__, 'message': str(error)}
        ledger['status'] = 'HOLD'
    (out / 'ledger.json').write_text(json.dumps(ledger, indent=2) + '\n')
    print(json.dumps(ledger, sort_keys=True))
    return 1 if ledger['status'] == 'HOLD' else 0


if __name__ == '__main__':
    raise SystemExit(main())
