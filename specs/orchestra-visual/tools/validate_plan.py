#!/usr/bin/env python3
"""Validate the execution contract, not the implementation of the product."""
from __future__ import annotations
import argparse
import fnmatch
import hashlib
import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
AX = {'dod', 'invariants', 'quality_standards', 'completeness_criteria', 'success_criteria'}
KINDS = {'epic', 'issue', 'subissue', 'wp', 'task'}


def safe_pattern(path):
    return (isinstance(path, str) and bool(path.strip()) and path not in ('.', './')
            and not path.startswith(('/', '~')) and not re.match(r'^[A-Za-z]:', path)
            and '..' not in path.split('/') and '\\' not in path and '\x00' not in path)


def validate(data, surfaces=None):
    errors = []
    nodes = data.get('nodes') if isinstance(data, dict) else None
    if not isinstance(nodes, list) or not nodes:
        return ['PLAN.nodes must be a nonempty array']
    if data.get('repo') != 'gmhelmold/HuGR-Orchestra':
        errors.append('unexpected repository identity')
    if not safe_pattern(data.get('reference_path')):
        errors.append('reference path must stay inside package')
    if not isinstance(data.get('source_sha'), str) or not re.fullmatch(r'[0-9a-f]{40}', data['source_sha']):
        errors.append('source_sha must be full commit ID')
    by, criterion_owner = {}, {}
    for n in nodes:
        if not isinstance(n, dict) or not isinstance(n.get('id'), str) or not re.fullmatch(r'[A-Z][A-Z0-9-]*', n['id']):
            errors.append('invalid node or node id')
            continue
        if n['id'] in by:
            errors.append('duplicate node id: ' + n['id'])
        by[n['id']] = n
    parent_kind = {'issue': 'epic', 'subissue': 'issue', 'wp': ('issue', 'subissue'), 'task': 'wp'}
    for ident, n in by.items():
        kind = n.get('kind')
        if kind not in KINDS:
            errors.append(ident + ': invalid kind')
        if not isinstance(n.get('title'), str) or not n['title'].strip():
            errors.append(ident + ': nonempty title required')
        axes, ids = n.get('axioms'), n.get('criterion_ids')
        if not isinstance(axes, dict) or set(axes) != AX:
            errors.append(ident + ': five explicit axioms required')
            axes = axes if isinstance(axes, dict) else {}
        if not isinstance(ids, dict) or set(ids) != AX:
            errors.append(ident + ': five criterion ID groups required')
            ids = ids if isinstance(ids, dict) else {}
        for key in AX:
            vals, codes = axes.get(key), ids.get(key)
            if not isinstance(vals, list) or not vals or any(not isinstance(x, str) or len(x.strip()) < 15 for x in vals):
                errors.append(ident + ': empty/invalid ' + key)
                continue
            if not isinstance(codes, list) or len(codes) != len(vals):
                errors.append(ident + ': criterion identifiers inconsistent: ' + key)
                continue
            prefix = ident + '-' + key.upper() + '-'
            for code in codes:
                if not isinstance(code, str) or not re.fullmatch(re.escape(prefix) + r'\d{2,}', code):
                    errors.append(ident + ': criterion ID must identify its node and axiom: ' + str(code))
                elif code in criterion_owner:
                    errors.append('duplicate global criterion ID: ' + code)
                else:
                    criterion_owner[code] = ident
        arrays = ('children', 'depends_on', 'acceptance_requires', 'write_paths', 'leased_write_paths', 'read_paths', 'exclude_paths', 'resource_locks','source_watch_paths')
        for field in arrays:
            arr = n.get(field, [])
            if not isinstance(arr, list) or any(not isinstance(v, str) or not v.strip() for v in arr):
                errors.append(ident + ': invalid ' + field)
            elif len(arr) != len(set(arr)):
                errors.append(ident + ': duplicate ' + field)
        parent = n.get('parent')
        if kind == 'epic':
            if parent is not None:
                errors.append(ident + ': epic must be root')
        elif not isinstance(parent, str) or parent not in by:
            errors.append(ident + ': non-epic needs an existing parent')
        else:
            allowed = parent_kind.get(kind, ())
            allowed = (allowed,) if isinstance(allowed, str) else allowed
            if by[parent].get('kind') not in allowed or not isinstance(by[parent].get('children'), list) or ident not in by[parent]['children']:
                errors.append(ident + ': inconsistent parent or hierarchy kind')
        children, deps = n.get('children', []), n.get('depends_on', [])
        if isinstance(children, list):
            for child in children:
                if not isinstance(child, str) or child not in by or by[child].get('parent') != ident:
                    errors.append(ident + ': inconsistent child ' + str(child))
        if isinstance(deps, list):
            for dep in deps:
                if not isinstance(dep, str) or dep not in by:
                    errors.append(ident + ': unknown dependency ' + str(dep))
        if kind == 'task':
            steps = n.get('steps')
            if children or not isinstance(steps, list) or not steps or any(not isinstance(v, str) or not v.strip() for v in steps):
                errors.append(ident + ': task needs nonempty string steps and no children')
            requirements = n.get('evidence_requirements')
            if not isinstance(requirements, dict) or set(requirements) != {'performance', 'visual', 'native'} or any(
                value not in ('required', 'scoped') for value in requirements.values()):
                errors.append(ident + ': evidence requirements must classify all three categories')
        elif kind in KINDS and (not isinstance(children, list) or not children):
            errors.append(ident + ': aggregate has no children')
        for field in ('write_paths', 'leased_write_paths', 'read_paths', 'exclude_paths','source_watch_paths'):
            arr = n.get(field, [])
            if isinstance(arr, list):
                for path in arr:
                    if not safe_pattern(path):
                        errors.append(ident + ': unsafe ' + field + ' ' + str(path))
        exts = n.get('external_requires', [])
        if not isinstance(exts, list):
            errors.append(ident + ': external_requires must be an array')
        else:
            for ext in exts:
                if not isinstance(ext, dict) or not isinstance(ext.get('ref'), str) or not re.fullmatch(r'#\d+', ext['ref']) or not isinstance(ext.get('rule'), str) or not ext['rule'].strip():
                    errors.append(ident + ': malformed external prerequisite')
    if errors:return errors
    registry = data.get('gate_registry', {})
    if not isinstance(registry,dict):return ['gate_registry must be an object']
    allowed_gates = {'performance': {f'P{i:02}' for i in range(1,13)}, 'visual': {f'Q{i:02}' for i in range(1,17)}, 'native': {'window-controls','drag-hit-testing','focus-restoration','identity','idle-and-soak','native-composition','nested-occlusion','process-attribution','profile-preservation','resources','single-tab-close','startup-theme','updater-states','bounds-hit-testing'}}
    for cat, allowed in allowed_gates.items():
        vals=registry.get(cat)
        if not isinstance(vals,list) or any(not isinstance(v,str) for v in vals) or len(vals)!=len(set(vals)) or set(vals)!=allowed:
            errors.append('gate registry invalid: '+cat)
    for ident,n in by.items():
        if n.get('kind')!='task': continue
        for cat,allowed in allowed_gates.items():
            vals=n.get('required_'+cat+'_gates')
            if not isinstance(vals,list) or any(not isinstance(v,str) or v not in allowed for v in vals) or len(vals)!=len(set(vals)):
                errors.append(ident+': invalid required_'+cat+'_gates'); continue
            if n.get('evidence_requirements',{}).get(cat)=='required' and not vals:
                errors.append(ident+': mandatory category lacks gates '+cat)
        for dep in n.get('acceptance_requires',[]):
            if dep not in by: errors.append(ident+': unknown acceptance producer '+str(dep))
    if data.get('contract_revision') in ('4.2', '4.3'):
        policy = data.get('scheduling_policy', {})
        if policy.get('priority_targets') != ['S25-W0-T1', 'S25-W0-T2']:
            errors.append('explicit pilot priority policy missing or invalid')
        for ident, n in by.items():
            if n.get('kind') != 'task':
                continue
            if n.get('verification_tier') not in ('local', 'focused', 'pilot', 'release', 'aggregate'):
                errors.append(ident + ': verification tier invalid')
            if type(n.get('sampling_requires_quiet_host')) is not bool:
                errors.append(ident + ': sampling policy must be explicit')
            if 'exclusive-benchmark-hardware' in n.get('resource_locks', []):
                errors.append(ident + ': use collection phase, not task-wide machine reservation')
            if n.get('verification_tier') in ('local', 'focused') and 'P10' in n.get('required_performance_gates', []):
                errors.append(ident + ': full soak belongs to release/aggregate, not ordinary local verification')

    if data.get('contract_revision') == '4.3':
        if data.get('widget_contract_file') != 'WIDGETS.md':
            errors.append('widget contract file missing')
        allowed_widgets = {f'W{i:02}' for i in range(1, 10)}
        allowed_cases = {f'WK{i:02}' for i in range(1, 29)}
        for ident, n in by.items():
            for field, allowed in [('widget_contracts', allowed_widgets), ('widget_cases', allowed_cases)]:
                values = n.get(field, [])
                if not isinstance(values, list) or any(not isinstance(x, str) or x not in allowed for x in values) or len(values) != len(set(values)):
                    errors.append(ident + ': invalid ' + field)
            if n.get('widget_contracts') and n.get('kind') == 'task' and 'WIDGETS.md' not in n.get('normative_files', []):
                errors.append(ident + ': widget contract must bind effective evidence')
        if surfaces is not None:
            entries = surfaces.get('surfaces') if isinstance(surfaces, dict) else None
            catalog = {r['id']: r for r in entries if isinstance(r, dict) and isinstance(r.get('id'), str)} if isinstance(entries, list) else {}
            for sid, owner in [('UI77','S09'), ('UI78','S18'), ('UI79','S11'), ('UI80','S11'), ('UI81','S11'), ('UI82','S11')]:
                row = catalog.get(sid, {})
                if row.get('owner') != owner or row.get('inventory_class') != 'ui-surface' or not row.get('widget_contracts'):
                    errors.append(sid + ': required widget consumer/owner missing')

    final=data.get('final_gate_policy',{})
    if not isinstance(final,dict):return errors+['final_gate_policy must be an object']
    release=by.get(final.get('task'),{})
    if final.get('task')!='S25-W1-T2': errors.append('release task identity invalid')
    for cat,allowed in allowed_gates.items():
        expected=allowed if cat!='native' else {'window-controls','identity','bounds-hit-testing','nested-occlusion','single-tab-close','resources'}
        fv=final.get(cat); rv=release.get('required_'+cat+'_gates')
        if not isinstance(fv,list) or any(not isinstance(x,str) for x in fv) or not isinstance(rv,list) or any(not isinstance(x,str) for x in rv) or set(fv)!=expected or set(rv)!=expected or release.get('evidence_requirements',{}).get(cat)!='required': errors.append('release policy coverage invalid '+cat)

    for n in by.values():
        if n.get('kind')!='task':continue
        files=n.get('normative_files')
        if not isinstance(files,list) or not files or any(not safe_pattern(v) or any(c in v for c in '*?[') for v in files):errors.append(n['id']+': normative files invalid')
        if n.get('source_watch_mode') not in ('historical','current'):errors.append(n['id']+': invalid source watch mode')
        stages=n.get('criterion_evaluation_stage',{})
        expected={c for vals in n.get('criterion_ids',{}).values() for c in vals}
        if not isinstance(stages,dict) or set(stages)!=expected or any(v!=n['id'] for v in stages.values()):errors.append(n['id']+': criterion evaluated at wrong stage')
        for path in n.get('leased_write_paths',[]):
            grants=[x for x in data.get('shared_write_leases',[]) if n['id'] in x['tasks'] and path in x['paths'] and x['lock'] in n.get('resource_locks',[])]
            if len(grants)!=1:errors.append(n['id']+': ungranted leased write '+path)

    # Invalid shapes must yield a diagnostic, not a traversal exception.
    if errors:
        return errors
    grey, black = set(), set()
    def visit(ident, trail):
        if ident in grey:
            errors.append('dependency cycle: ' + ' -> '.join(trail + [ident]))
            return
        if ident in black:
            return
        grey.add(ident)
        inherited, current, seen = set(), ident, set()
        while current is not None and current not in seen:
            seen.add(current)
            inherited.update(by[current].get('depends_on', [])); inherited.update(by[current].get('acceptance_requires', []))
            current = by[current].get('parent')
        for dep in sorted(inherited) + by[ident].get('children', []):
            visit(dep, trail + [ident])
        grey.remove(ident)
        black.add(ident)
    for ident in by:
        visit(ident, [])
    if surfaces is not None:
        rows = surfaces.get('surfaces') if isinstance(surfaces, dict) else None
        if not isinstance(rows, list) or not rows:
            errors.append('SURFACES.surfaces must be a nonempty array')
        else:
            seen = set()
            for row in rows:
                if not isinstance(row, dict) or not isinstance(row.get('id'), str):
                    errors.append('invalid surface record')
                    continue
                ident = row['id']
                if ident in seen:
                    errors.append('duplicate surface ' + ident)
                seen.add(ident)
                owner = row.get('owner')
                if not isinstance(owner, str) or owner not in by or by[owner].get('kind') != 'subissue':
                    errors.append('surface without unique leaf owner ' + ident)
                if any(not row.get(f) for f in ('path', 'current_capability', 'states', 'evidence_level')):
                    errors.append('surface incomplete ' + ident)
                if not safe_pattern(row.get('path')) or not isinstance(row.get('states'), list):
                    errors.append('surface path/states invalid ' + ident)
                disposition=row.get('disposition')
                if disposition not in ('migrate','inherit','out-of-scope','read-anchor'):errors.append('surface disposition missing '+ident)
                if not isinstance(row.get('classification_reason'),str) or len(row['classification_reason'])<15:errors.append('surface classification reason missing '+ident)
                if row.get('inventory_class')=='ui-surface' and disposition=='migrate' and owner in by:
                    assigned=owners_for([row['path']],nodes).get(row['path'],[])
                    if assigned!=[owner]:errors.append('surface writer mismatch '+ident+': '+str(assigned))

    return errors


def owners_for(files, nodes):
    leaves = [n for n in nodes if n['kind'] == 'subissue']
    result = {}
    for file in filter(None, files):
        result[file] = [n['id'] for n in leaves
                        if any(fnmatch.fnmatchcase(file, p) for p in n.get('write_paths', []))
                        and not any(fnmatch.fnmatchcase(file, p) for p in n.get('exclude_paths', []))]
    return result


def inspect(root=ROOT, repo=None, census_strict=False):
    data = json.loads((root / 'PLAN.json').read_text())
    surfaces = json.loads((root / 'SURFACES.json').read_text())
    errors = validate(data, surfaces)
    ref = root / data['reference_path']
    reference_ok = ref.is_file() and hashlib.sha256(ref.read_bytes()).hexdigest() == data['reference_sha256']
    if not reference_ok:
        errors.append('approved reference missing/hash mismatch')
    for name in ('EXECUTE.md', 'SPEC.md', 'PERFORMANCE.md', 'MAP.md', 'OWNERSHIP.md'):
        if not (root / name).is_file():
            errors.append('missing ' + name)
    if data.get('contract_revision') == '4.3':
        widgets = root / 'WIDGETS.md'
        if not widgets.is_file():
            errors.append('missing WIDGETS.md')
        else:
            text = widgets.read_text(encoding='utf-8')
            for wid in [f'w{i:02}' for i in range(1,10)]:
                if text.count('<a id="'+wid+'"></a>') != 1:
                    errors.append('widget anchor missing/duplicate: '+wid)
            for case in [f'WK{i:02}' for i in range(1,29)]:
                if '`'+case+'`' not in text:
                    errors.append('widget behavior case missing: '+case)
    if data.get('contract_revision') in ('4.1', '4.2', '4.3'):
        from verify_brand import verify
        brand_report = verify(root)
        errors.extend('brand: ' + err for err in brand_report['errors'])
    if not errors and data.get('contract_revision') in ('4.2', '4.3'):
        from visual_coverage import required_captures
        for n in data['nodes']:
            if n.get('kind') == 'task' and n.get('evidence_requirements', {}).get('visual') == 'required':
                try:
                    if not required_captures(n, root):
                        errors.append(n['id'] + ': mandatory visual category has no consumer coverage')
                except (KeyError, TypeError, ValueError) as exc:
                    errors.append(n['id'] + ': invalid visual consumer binding: ' + str(exc))
    scope, unmatched = [], []
    if repo:
        files = subprocess.check_output(['git', '-C', str(repo), 'ls-files', '-z'], text=True).split('\0')
        owners = owners_for(files, data['nodes'])
        scope = [{'path': f, 'owners': v} for f, v in owners.items() if len(v) > 1]
        if scope:
            errors.append('overlapping leaf scopes: ' + str(len(scope)))
        from census import check
        if census_strict:
            errors += check(data,surfaces,json.loads((root/'CENSUS.json').read_text()),repo)
    return {'kind': 'plan-validation-not-product-tests', 'status': 'FAIL' if errors else 'PASS',
            'nodes': len(data['nodes']), 'axiom_groups': sum(len(n['axioms']) for n in data['nodes']),
            'criterion_count': sum(len(v) for n in data['nodes'] for v in n['axioms'].values()),
            'surfaces': len(surfaces['surfaces']), 'reference_verified': reference_ok,
            'errors': errors, 'scope_overlaps': scope, 'read_anchor_not_write_owner': unmatched,
            'repo_scope_expanded': bool(repo)}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--repo', type=Path)
    parser.add_argument('--census-strict', action='store_true')
    parser.add_argument('--json', action='store_true', help='Output is always JSON; retained for scripting.')
    args = parser.parse_args()
    try:
        report = inspect(repo=args.repo,census_strict=args.census_strict)
    except (OSError, ValueError, KeyError, TypeError, AttributeError, subprocess.SubprocessError) as exc:
        report = {'kind': 'plan-validation-not-product-tests', 'status': 'FAIL', 'errors': [str(exc)]}
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0 if report['status'] == 'PASS' else 1


if __name__ == '__main__':
    sys.exit(main())
