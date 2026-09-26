#!/usr/bin/env python3
"""Create a NOT_RUN receipt template for one task. Never reports implementation success."""
from __future__ import annotations
import argparse
import json
import sys
from pathlib import Path
from validate_plan import ROOT, validate
from effective_contract import contract_digest,manifest


def template(plan, ident, root=ROOT):
    errors = validate(plan)
    if errors:
        raise ValueError('; '.join(errors))
    node = next((n for n in plan['nodes'] if n['id'] == ident), None)
    if node is None or node['kind'] != 'task':
        raise ValueError('Choose an existing task ID, not a parent issue or epic')
    return {
        'schema_version': 3, 'id': ident, 'status': 'NOT_RUN', 'head': None,
        'contract_sha256': contract_digest(node,root,plan), 'contract_manifest':manifest(node,root,plan), 'paths_changed': [], 'artifacts': {}, 'source':{'baseline_file':None,'commits':[]},
        'axioms': {key: [
            {'criterion_id': criterion_id, 'criterion_text': text,
             'result': 'NOT_RUN', 'evidence': []}
            for criterion_id, text in zip(node['criterion_ids'][key], texts)
        ] for key, texts in node['axioms'].items()},
        'commands': [], 'review': {'status': 'NOT_RUN', 'head': None, 'method': None, 'evidence': None},
        'performance': {'status': 'NOT_RUN'}, 'visual': {'status': 'NOT_RUN'}, 'native': {'status': 'NOT_RUN'},
        'external_blockers': [],
        'note': 'Template only. Fill actual SHA, commands and evidence. No PASS is implied.'
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('task')
    parser.add_argument('--out', type=Path, help='New output file. Existing files are not overwritten.')
    args = parser.parse_args()
    try:
        plan = json.loads((ROOT / 'PLAN.json').read_text())
        text = json.dumps(template(plan, args.task), ensure_ascii=False, indent=2) + '\n'
        if args.out:
            args.out.parent.mkdir(parents=True, exist_ok=True)
            with args.out.open('x', encoding='utf-8') as target:
                target.write(text)
        else:
            print(text, end='')
        return 0
    except (OSError, ValueError, KeyError, TypeError) as exc:
        print(json.dumps({'status': 'FAIL', 'errors': [str(exc)]}, ensure_ascii=False))
        return 1


if __name__ == '__main__':
    sys.exit(main())
