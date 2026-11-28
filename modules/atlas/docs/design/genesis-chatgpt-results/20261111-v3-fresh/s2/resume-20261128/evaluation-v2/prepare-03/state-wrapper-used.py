#!/usr/bin/env python3
"""Run the fixed recorder once and preserve actual non-CAS state on both sides.

This wrapper is evidence capture, not an Atlas reader or authorization mechanism.
It does not create policies, replay commands, reset budgets or change source files.
"""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import sys

RECORDER = Path('/workspace/scratch/5cfbb6c803f1/s2-investigation/record-operation.py')
RECORDER_SHA256 = '0185ccf143d7a5d1112b573fd0405da899b27d112cb4c7b431e1cbb1da629b30'


def capture(root):
    directory = root / '.atlas'
    return {str(path.relative_to(root)): path.read_bytes()
            for path in sorted(directory.rglob('*'))
            if path.is_file() and 'cas' not in path.relative_to(directory).parts}


def inventory(values):
    return [{'path': name, 'byte_length': len(data), 'sha256': hashlib.sha256(data).hexdigest()}
            for name, data in sorted(values.items())]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('command_file', type=Path)
    parser.add_argument('output_dir', type=Path)
    args = parser.parse_args()
    assert hashlib.sha256(RECORDER.read_bytes()).hexdigest() == RECORDER_SHA256, 'recorder drift'
    assert not args.output_dir.exists(), 'operation already has a result or partial output; inspect it before any further attempt'
    config = json.loads(args.command_file.read_bytes())
    root = Path(config['corpus_root'])
    before = capture(root)
    process = subprocess.run([sys.executable, str(RECORDER), str(args.command_file), str(args.output_dir)], check=False)
    after = capture(root)
    if not args.output_dir.exists():
        return process.returncode
    for label, values in [('state-before', before), ('state-after', after)]:
        for name, data in values.items():
            target = args.output_dir / label / name
            target.parent.mkdir(parents=True, exist_ok=True)
            with target.open('xb') as stream:
                stream.write(data)
    receipt_path = args.output_dir / 'receipt.json'
    receipt = json.loads(receipt_path.read_bytes()) if receipt_path.exists() else None
    before_match = inventory(before) == receipt['state_files_before'] if receipt else None
    after_match = inventory(after) == receipt['state_files_after'] if receipt else None
    record = {
        'schema': 'genesis-s2-runtime-state-capture/v1',
        'operation_id': config['operation_id'],
        'wrapper_sha256': hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
        'recorder_sha256': RECORDER_SHA256,
        'recorder_exit_code': process.returncode,
        'original_runtime_receipt_exists': receipt is not None,
        'before_matches_original_recorder_inventory': before_match,
        'after_matches_original_recorder_inventory': after_match,
        'state_before': inventory(before), 'state_after': inventory(after),
        'limit': 'File snapshots accompany the original CLI streams. They are not substitute reader output and do not claim race freedom or OS isolation.',
    }
    with (args.output_dir / 'state-capture.json').open('x') as stream:
        json.dump(record, stream, ensure_ascii=False, indent=2)
        stream.write('\n')
    print(json.dumps({'state_before': len(before), 'state_after': len(after),
                      'matches': before_match is True and after_match is True}))
    if receipt and (not before_match or not after_match):
        return 4
    return process.returncode


if __name__ == '__main__':
    raise SystemExit(main())
