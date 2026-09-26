#!/usr/bin/env python3
"""Inventory referenced artifact hashes. Never sets PASS or claims authentic evidence."""
from __future__ import annotations
import argparse
import json
import sys
from pathlib import Path
from validate_plan import ROOT
from validate_evidence import local_file, digest_file


def seal(receipt, root=ROOT):
    if not isinstance(receipt, dict):
        raise ValueError('receipt must be an object')
    refs = set()
    def add(values):
        if not isinstance(values, list) or any(not isinstance(x, str) for x in values):
            raise ValueError('artifact references must be string arrays')
        refs.update(values)
    for group in receipt.get('axioms', {}).values():
        for row in group:
            add(row.get('evidence', []))
    for cmd in receipt.get('commands', []):
        add([cmd.get('log')])
    review = receipt.get('review', {}).get('evidence')
    if review:
        add([review])
    for category, key in (('performance', 'metrics_file'), ('native', 'report_file')):
        section = receipt.get(category, {})
        if section.get(key):
            ref = section[key]; add([ref])
            report = json.loads(local_file(root, ref).read_text())
            for gate in report.get('gates', []):
                add(gate.get('evidence', []))
    source=receipt.get('source',{})
    if source.get('baseline_file'):add([source['baseline_file']])
    for ref in source.get('imported_receipts',[]):add([ref])
    raw=receipt.get('performance',{}).get('observations_file')
    if raw:add([raw])
    visual = receipt.get('visual', {})
    if visual.get('manifest_file'):
        add([visual['manifest_file']]);report=json.loads(local_file(root,visual['manifest_file']).read_text())
        for capture in report.get('captures',[]):add([capture['path'],capture['review_file']])
    add(visual.get('screenshots', []))
    if visual.get('review_file'):
        add([visual['review_file']])
    # Deep copy preserves all status fields and avoids mutating the caller.
    result = json.loads(json.dumps(receipt))
    result['artifacts'] = {ref: digest_file(local_file(root, ref)) for ref in sorted(refs)}
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('receipt', type=Path)
    parser.add_argument('--out', type=Path, required=True, help='A new file; no overwrite')
    args = parser.parse_args()
    try:
        value = seal(json.loads(args.receipt.read_text()))
        args.out.parent.mkdir(parents=True, exist_ok=True)
        with args.out.open('x', encoding='utf-8') as target:
            json.dump(value, target, ensure_ascii=False, indent=2)
            target.write('\n')
        print(json.dumps({'operation': 'artifact-hash-inventory-only', 'status_unchanged': value.get('status'), 'output': str(args.out)}))
        return 0
    except (OSError, ValueError, TypeError, KeyError) as exc:
        print(json.dumps({'status': 'FAIL', 'errors': [str(exc)]}))
        return 1


if __name__ == '__main__':
    sys.exit(main())
