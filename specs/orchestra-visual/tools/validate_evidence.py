#!/usr/bin/env python3
"""Fail-closed receipt validation. Valid files do NOT prove semantic truth or product quality."""
from __future__ import annotations
import argparse
import fnmatch
import hashlib
import json
import re
import struct
import sys
from pathlib import Path, PurePosixPath
from validate_plan import AX, ROOT

SHA1 = re.compile(r'[0-9a-f]{40}')
SHA256 = re.compile(r'[0-9a-f]{64}')
CATEGORIES = ('performance', 'visual', 'native')
DECISIONS = {'PASS', 'NOT_APPLICABLE'}


def digest_file(path):
    h = hashlib.sha256()
    with path.open('rb') as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b''):
            h.update(chunk)
    return h.hexdigest()


from effective_contract import contract_digest, manifest, load
from png_check import decode_png


def valid_relative(value):
    return (isinstance(value, str) and bool(value.strip()) and '\\' not in value and '\x00' not in value
            and not value.startswith(('/', '~')) and not re.match(r'^[A-Za-z]:', value)
            and '..' not in PurePosixPath(value).parts and value not in ('.', './'))


def local_file(root, value):
    if not valid_relative(value):
        raise ValueError('evidence must be a safe nonempty relative file path')
    path = (root / value).resolve()
    try:
        path.relative_to(root.resolve())
    except ValueError:
        raise ValueError('evidence path escapes package root')
    if not path.is_file() or path.stat().st_size == 0:
        raise ValueError('evidence file missing or empty: ' + value)
    return path


def matches(node, path):
    return (any(fnmatch.fnmatchcase(path, p) for p in node.get('write_paths', []) + node.get('leased_write_paths', []))
            and not any(fnmatch.fnmatchcase(path, p) for p in node.get('exclude_paths', [])))


def validate_receipt(node, receipt, root=ROOT, expected_head=None, repo=None, plan=None):
    errors = []
    if not isinstance(receipt, dict):
        return ['receipt must be an object']
    if receipt.get('schema_version') != 3:
        errors.append('receipt schema_version must be 3; previous receipts require new evaluation')
    if receipt.get('id') != node['id']:
        errors.append('receipt task ID mismatch')
    head = receipt.get('head')
    if not isinstance(head, str) or not SHA1.fullmatch(head):
        errors.append('full source commit SHA required')
    if expected_head is not None and head != expected_head:
        errors.append('progress and receipt source HEAD differ')
    try:
        expected_manifest=manifest(node,root,plan)
        if receipt.get('contract_sha256') != contract_digest(node,root,plan) or receipt.get('contract_manifest') != expected_manifest:
            errors.append('receipt contract digest differs from effective current contract')
    except (OSError,ValueError,KeyError,TypeError) as exc: errors.append('effective contract unavailable: '+str(exc))
    if receipt.get('status') != 'PASS':
        errors.append('receipt is not PASS')
    changed = receipt.get('paths_changed')
    if not isinstance(changed, list) or any(not valid_relative(p) for p in changed):
        errors.append('paths_changed must be an array of safe repository-relative paths')
    elif len(set(changed)) != len(changed):
        errors.append('paths_changed contains duplicates')
    else:
        for path in changed:
            if not matches(node, path) and not (node['id'].startswith('S25-') and receipt.get('source',{}).get('imported_receipts')):
                errors.append('changed path outside task write scope: ' + path)
    inventory = receipt.get('artifacts')
    if not isinstance(inventory, dict):
        inventory = {}
        errors.append('artifacts hash inventory required')
    checked = {}

    def artifact(value):
        if isinstance(value, str) and value in checked:
            return checked[value]
        try:
            path = local_file(root, value)
            claimed = inventory.get(value)
            if not isinstance(claimed, str) or not SHA256.fullmatch(claimed):
                raise ValueError('SHA-256 missing for artifact: ' + str(value))
            if digest_file(path) != claimed:
                raise ValueError('artifact content changed: ' + str(value))
            checked[value] = path
            return path
        except (OSError, ValueError, TypeError) as exc:
            errors.append(str(exc))
            return None

    axes = receipt.get('axioms')
    if not isinstance(axes, dict) or set(axes) != AX:
        return errors + ['receipt requires five explicit axiom groups']
    for key in sorted(AX):
        records = axes[key]
        expected = set(node['criterion_ids'][key])
        if not isinstance(records, list):
            errors.append('invalid group ' + key)
            continue
        observed = []
        for record in records:
            if not isinstance(record, dict) or not isinstance(record.get('criterion_id'), str):
                errors.append('invalid criterion record: ' + key)
                continue
            observed.append(record['criterion_id'])
            if record.get('result') != 'PASS':
                errors.append('criterion not PASS: ' + record['criterion_id'])
            refs = record.get('evidence')
            if not isinstance(refs, list) or not refs:
                errors.append('criterion has no evidence array: ' + record['criterion_id'])
                continue
            for ref in refs:
                artifact(ref)
        if set(observed) != expected or len(observed) != len(expected):
            errors.append('criterion coverage mismatch: ' + key)
    commands = receipt.get('commands')
    if not isinstance(commands, list) or not commands:
        errors.append('at least one recorded verification command is required')
        commands = []
    positive = False
    for command in commands:
        if not isinstance(command, dict):
            errors.append('invalid command record')
            continue
        if any(not isinstance(command.get(k), str) or not command[k].strip() for k in ('command', 'cwd')):
            errors.append('command and cwd must be nonempty strings')
        code = command.get('exit_code')
        expected_failure = command.get('expected_failure', False)
        if type(code) is not int or type(expected_failure) is not bool:
            errors.append('exit_code must be an integer and expected_failure a boolean')
        elif expected_failure:
            if code == 0 or not isinstance(command.get('negative_control'), str) or not command['negative_control'].strip():
                errors.append('expected failure needs a named negative control and nonzero exit code')
        elif code != 0:
            errors.append('unexpected command failure')
        else:
            positive = True
        artifact(command.get('log'))
    if not positive:
        errors.append('at least one successful positive verification command is required')
    requirements = node.get('evidence_requirements', {})
    for category in CATEGORIES:
        section = receipt.get(category)
        if not isinstance(section, dict) or section.get('status') not in DECISIONS:
            errors.append(category + ' requires explicit PASS or justified NOT_APPLICABLE')
            continue
        if requirements.get(category) == 'required' and section['status'] != 'PASS':
            errors.append(category + ' is mandatory for this task')
        if section['status'] == 'NOT_APPLICABLE':
            if not isinstance(section.get('reason'), str) or len(section['reason'].strip()) < 15:
                errors.append(category + ' NOT_APPLICABLE requires a scoped reason')
            continue
        if section.get('head') != head:
            errors.append(category + ' source HEAD differs from receipt')
        if not isinstance(section.get('build_sha256'), str) or not SHA256.fullmatch(section['build_sha256']):
            errors.append(category + ' requires the measured build hash')
        if section.get('known_defects') != []:
            errors.append(category + ' PASS requires explicit empty known_defects')
        if category == 'visual':
            screenshots = section.get('screenshots')
            if not isinstance(screenshots, list) or not screenshots:
                errors.append('visual PASS requires screenshot evidence')
            else:
                for ref in screenshots:
                    path = artifact(ref)
                    if path:
                        try: decode_png(path)
                        except (ValueError,OSError) as exc:errors.append('invalid screenshot: '+str(exc))
            artifact(section.get('review_file'))
            manifest_path=artifact(section.get('manifest_file'))
            if manifest_path:
                try:
                    from visual_coverage import validate_captures
                    capture_manifest=load(manifest_path)
                    errors += validate_captures(node,capture_manifest,root,head,section.get('build_sha256'),artifact)
                    manifest_shots={x.get('path') for x in capture_manifest.get('captures',[]) if isinstance(x,dict)}
                    if manifest_shots!=set(section.get('screenshots',[])): errors.append('screenshot list differs from capture manifest')
                except (ValueError,OSError,KeyError,TypeError) as exc:errors.append(str(exc))
        else:
            key = 'metrics_file' if category == 'performance' else 'report_file'
            path = artifact(section.get(key))
            if path:
                try:
                    data = load(path)
                    kind = 'performance-evaluation' if category == 'performance' else 'native-evaluation'
                    if not isinstance(data, dict) or data.get('kind') != kind or data.get('status') != 'PASS':
                        raise ValueError(category + ' evaluation kind/status invalid')
                    if data.get('head') != head or data.get('build_sha256') != section.get('build_sha256'):
                        raise ValueError(category + ' report revision/build mismatch')
                    if not isinstance(data.get('environment'), dict) or not data['environment']:
                        raise ValueError(category + ' environment provenance missing')
                    groups = data.get('gates')
                    if not isinstance(groups, list) or not groups:
                        raise ValueError(category + ' evaluation needs per-gate results')
                    seen = set()
                    for gate in groups:
                        if not isinstance(gate, dict) or not isinstance(gate.get('id'), str) or gate['id'] in seen:
                            raise ValueError(category + ' gate ID invalid/duplicated')
                        seen.add(gate['id'])
                        if gate.get('status') != 'PASS':
                            raise ValueError(category + ' gate did not PASS: ' + gate['id'])
                        sources = gate.get('evidence')
                        if not isinstance(sources, list) or not sources:
                            raise ValueError(category + ' gate lacks raw evidence')
                        for ref in sources:
                            artifact(ref)
                    if category == 'performance':
                        from evaluate_performance import evaluate
                        observations=artifact(section.get('observations_file'))
                        if observations:
                            raw=load(observations);required=node.get('required_performance_gates') or ['P11','P12']
                            recalculated=evaluate(raw,load(root/'BUDGETS.json'),required)
                            if raw.get('fixture_sha256')!=digest_file(root/'fixture.json'):errors.append('performance fixture identity mismatch')
                            if recalculated.get('status')!='PASS' or recalculated.get('head')!=head or recalculated.get('build_sha256')!=section.get('build_sha256'):errors.append('raw observations fail deterministic budgets/binding')
                            expected_gates=[{'id':g['id'],'status':g['status']} for g in recalculated.get('gates',[])]
                            if [{'id':g['id'],'status':g['status']} for g in groups]!=expected_gates:errors.append('manual performance report differs from recalculation')
                            if data.get('raw_sha256')!=recalculated.get('raw_sha256') or data.get('budget_sha256')!=recalculated.get('budget_sha256'):errors.append('performance report inputs unbound')
                    required_ids = node.get('required_performance_gates', []) if category == 'performance' else node.get('required_native_gates', [])
                    if not set(required_ids) <= seen:
                        raise ValueError(category + ' required gate coverage incomplete')
                except (OSError, ValueError, TypeError) as exc:
                    errors.append(str(exc))
    passed_builds = {receipt[c].get('build_sha256') for c in CATEGORIES
                     if isinstance(receipt.get(c), dict) and receipt[c].get('status') == 'PASS'}
    if len(passed_builds) > 1:
        errors.append('performance, visual and native evidence must identify the same build')
    review = receipt.get('review')
    if not isinstance(review, dict) or review.get('status') != 'PASS':
        errors.append('explicit cold-review PASS required')
    else:
        if review.get('head') != head:
            errors.append('cold-review source HEAD differs')
        if review.get('method') not in ('self-cold-review', 'independent-agent', 'human'):
            errors.append('cold-review method must state actual reviewer independence')
        artifact(review.get('evidence'))
    if repo is not None:
        from source_proof import footprint
        errors += footprint(node,receipt,root,repo)
    elif not isinstance(receipt.get('source'),dict):
        errors.append('source attribution record required; actual Git checking still requires --repo')
    return errors


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('task')
    parser.add_argument('receipt', type=Path)
    parser.add_argument('--repo',type=Path)
    args = parser.parse_args()
    try:
        plan = json.loads((ROOT / 'PLAN.json').read_text())
        node = next(n for n in plan['nodes'] if n['id'] == args.task)
        errors = validate_receipt(node, json.loads(args.receipt.read_text()),repo=args.repo)
    except (OSError, ValueError, StopIteration, KeyError, TypeError) as exc:
        errors = [str(exc)]
    print(json.dumps({'kind': 'receipt-integrity-not-semantic-proof', 'status': 'FAIL' if errors else 'PASS', 'errors': errors, 'source_revision_verified': args.repo is not None and not errors}, indent=2))
    return int(bool(errors))


if __name__ == '__main__':
    sys.exit(main())
