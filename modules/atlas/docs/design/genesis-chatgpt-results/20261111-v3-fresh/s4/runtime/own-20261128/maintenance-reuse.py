#!/usr/bin/env python3
"""Run the accepted S4 driver once, privately, against the just-published baseline."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess
from datetime import datetime, timezone

CANDIDATE = '10171ee9769ac7ce7013e8e16fbc5064e79a458a9cc65b80a503164e00306253'
MANIFEST = 'df2dae9de5931cb86f7572bb6c093fe3fdaef6a274ad8f4985db5c3c63a21afe'
RUNTIME = '9b0188b2be5ea69638dff8a44e3e931b4d6d8b10'
PREPARED_SHA = 'e6831efca8f63c3e0aeac092d7f4c14ffd0882b5e7d101683c3cf4773f8ba257'
DRIVER_SHA = 'a6a579e6a3978daa9a67f01bce06fda56172334b0e34323e787cba4d5ab9f27f'
DRIVER = 'modules/atlas/docs/design/genesis-chatgpt-results/20261111-v3-fresh/s4/runtime/maintenance-operation.mjs'


def sha(data):
    return hashlib.sha256(data).hexdigest()


def require(condition, message):
    if not condition:
        raise ValueError(message)


def projection(root):
    paths = sorted((root / '.atlas').glob('projection*.json'))
    require(any(path.name == 'projection.json' for path in paths), 'active projection missing')
    return {path.name: sha(path.read_bytes()) for path in paths}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--runtime', type=Path, required=True)
    parser.add_argument('--source', type=Path, required=True)
    parser.add_argument('--prepared', type=Path, required=True)
    parser.add_argument('--publication', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    require(os.environ.get('GITHUB_ACTIONS') == 'true' and os.environ.get('GITHUB_EVENT_NAME') == 'workflow_dispatch'
            and os.environ.get('GITHUB_REPOSITORY') == 'gustavomhss/hugr-orchestra'
            and os.environ.get('GITHUB_REF') == 'refs/heads/genesis-knowledge-resume', 'requires isolated manual workflow')
    runner = Path(os.environ['RUNNER_TEMP']).resolve()
    runtime, root, prepared, publication, out = (p.resolve() for p in
        (args.runtime, args.source, args.prepared, args.publication, args.output))
    require((runtime, root, prepared, publication, out) == (runner / 's4-runtime', runner / 's4-source',
            runner / 's4-evidence/prepared.json', runner / 's4-publication', runner / 's4-maintenance'), 'unexpected paths')
    require(not out.exists(), 'evidence directory already exists')
    out.mkdir()
    ledger = {'schema': 's4-maintenance-reuse/v1', 'status': 'HOLD', 'candidate_id': CANDIDATE,
              'baseline_manifest': MANIFEST, 'runtime': RUNTIME, 'driver_sha256': DRIVER_SHA,
              'started_utc': datetime.now(timezone.utc).isoformat(), 'driver_invocations': 0,
              'activation_attempted': False}
    try:
        revision = subprocess.check_output(['git', '-C', str(runtime), 'rev-parse', 'HEAD'], text=True).strip()
        require(revision == RUNTIME, 'runtime revision differs')
        raw = prepared.read_bytes()
        candidate = json.loads(raw)
        require(sha(raw) == PREPARED_SHA and candidate['candidate_id'] == CANDIDATE
                and candidate['candidate']['repo_root'] == str(root), 'prepared candidate differs')
        summary = json.loads((publication / 'summary.json').read_bytes())
        require(summary['status'] == 'PUBLISHED_AND_READ_BACK' and summary['manifest'] == MANIFEST
                and summary['candidate_id'] == CANDIDATE and summary['runtime'] == RUNTIME, 'publication identity differs')
        driver = root / DRIVER
        require(sha(driver.read_bytes()) == DRIVER_SHA, 'accepted driver bytes differ')
        before = projection(root)
        ledger['projection_before'] = before
        argv = ['bun', str(driver), 'rebuild', str(runtime / 'modules/atlas'), str(root), MANIFEST,
                str(prepared), 's4-binding/approval.json']
        ledger['argv'] = argv
        ledger['driver_invocations'] = 1
        completed = subprocess.run(argv, cwd=runtime / 'modules/atlas', stdin=subprocess.DEVNULL,
                                   capture_output=True, check=False)
        (out / 'driver.stdout.txt').write_bytes(completed.stdout)
        (out / 'driver.stderr.txt').write_bytes(completed.stderr)
        ledger.update({'exit_code': completed.returncode, 'stdout_sha256': sha(completed.stdout),
                       'stderr_sha256': sha(completed.stderr), 'projection_after': projection(root)})
        require(completed.returncode == 0, 'driver refused; inspect original stdout and stderr')
        result = json.loads(completed.stdout)
        require(result['kind'] == 'candidate' and result['private_manifest'] == MANIFEST
                and result['affected'] == [] and result['calls'] == [] and result['manifest_changed'] is False
                and result['activation_attempted'] is False, 'driver did not produce the required private no-op')
        require(result['target_candidate_id'] == CANDIDATE and result['baseline_manifest'] == MANIFEST,
                'driver reported different identities')
        require(result['before'] == result['after'] and len(result['before']) == 15, 'entry identities changed')
        expected = {entry['key']: entry for entry in candidate['candidate']['entries']}
        require(set(result['before']) == set(expected) and all(
            value['result'] == expected[key]['artifact']['result'] and value['inputs_id'] == expected[key]['inputs_id']
            for key, value in result['before'].items()), 'entry identities differ from approved candidate')
        require(ledger['projection_before'] == ledger['projection_after'], 'active projection changed')
        require(sha(driver.read_bytes()) == DRIVER_SHA, 'driver bytes changed')
        ledger['status'] = 'MD_REUSE_OBSERVED'
    except Exception as error:
        ledger['error'] = {'type': type(error).__name__, 'message': str(error)}
    ledger['ended_utc'] = datetime.now(timezone.utc).isoformat()
    (out / 'ledger.json').write_text(json.dumps(ledger, indent=2) + '\n')
    print(json.dumps(ledger, sort_keys=True))
    return 0 if ledger['status'] == 'MD_REUSE_OBSERVED' else 1


if __name__ == '__main__':
    raise SystemExit(main())
