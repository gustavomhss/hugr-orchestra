#!/usr/bin/env python3
"""Select ready tasks. Read-only: never edits source, progress or GitHub."""
from __future__ import annotations
import argparse
import fnmatch
import json
import re
import subprocess
import sys
from pathlib import Path
from validate_plan import ROOT, validate
from validate_evidence import local_file, validate_submission
from source_proof import source_errors, git_snapshot

STATUSES = {'PENDING', 'RUNNING', 'PASS', 'FAIL', 'NOT_RUN', 'BLOCKED_EXTERNAL', 'STALE'}


def entry_dependencies(by, ident):
    values, visited = set(), set()
    while ident is not None and ident not in visited:
        visited.add(ident)
        values.update(by[ident].get('depends_on', [])); values.update(by[ident].get('acceptance_requires', []))
        ident = by[ident].get('parent')
    return sorted(values)


def dependencies(by, ident):
    return entry_dependencies(by, ident) + by[ident].get('children', [])


def invalidated_closure(by, ids):
    """A changed prerequisite invalidates transitive dependents and aggregate claims."""
    result = set(ids)
    while True:
        new = {i for i in by if any(d in result for d in dependencies(by, i))}
        if new <= result:
            return sorted(result)
        result |= new


def ext_requirements(by, ident):
    values = {}
    while ident:
        n = by[ident]
        for ext in n.get('external_requires', []):
            values[ext['ref']] = ext
        ident = n.get('parent')
    return list(values.values())


def scope_matches(node, file):
    return any(fnmatch.fnmatchcase(file, p) for p in node.get('write_paths', []) + node.get('leased_write_paths', [])) and not any(
        fnmatch.fnmatchcase(file, p) for p in node.get('exclude_paths', []))


def conflict(a, b, tracked=None):
    if set(a.get('resource_locks', [])) & set(b.get('resource_locks', [])):
        return True
    if tracked is not None and any(scope_matches(a, p) and scope_matches(b, p) for p in tracked):
        return True
    # Include proposed files absent from git. Conservative prefix check can serialize
    # too much, never grants extra write permission. Refine cones, not this guard.
    for x in a.get('write_paths', []) + a.get('leased_write_paths', []):
        for y in b.get('write_paths', []) + b.get('leased_write_paths', []):
            if x == y:
                return True
            if not any(c in x + y for c in '*?['):
                continue
            px, py = re.split(r'[\*?\[]', x)[0], re.split(r'[\*?\[]', y)[0]
            if px.startswith(py) or py.startswith(px):
                # Exact exclusions resolve common published cones (logo/settings).
                if not any(fnmatch.fnmatchcase(y, e) for e in a.get('exclude_paths', [])) and not any(
                        fnmatch.fnmatchcase(x, e) for e in b.get('exclude_paths', [])):
                    return True
    return False



def collection_preflight(data, progress, ident):
    """Read-only coordinator check, not an OS/process lock or a claim of quiet hardware."""
    by = {n['id']: n for n in data['nodes']}
    records = progress.get('tasks', {}) if isinstance(progress, dict) else None
    if not isinstance(records, dict) or any(not isinstance(rec, dict) for rec in records.values()):
        return {'status': 'FAIL', 'errors': ['invalid progress task records'], 'may_record_collect': False}
    if any(rec.get('phase', 'work') not in ('work', 'collect', 'review') for rec in records.values()):
        return {'status': 'FAIL', 'errors': ['invalid progress phase'], 'may_record_collect': False}
    if ident not in by or by[ident].get('kind') != 'task' or not by[ident].get('sampling_requires_quiet_host'):
        return {'status': 'FAIL', 'errors': ['task is not eligible for collection'], 'may_record_collect': False}
    if records.get(ident, {}).get('status') != 'RUNNING':
        return {'status': 'FAIL', 'errors': ['start/claim the ready task before requesting collection'], 'may_record_collect': False}
    blockers = [i for i, rec in records.items() if i != ident and rec.get('status') == 'RUNNING' and rec.get('phase', 'work') != 'review']
    return {'status': 'WAIT' if blockers else 'READY_TO_RESERVE', 'may_record_collect': not blockers,
            'blocking_tasks': sorted(blockers), 'mutation_performed': False,
            'instruction': 'Single coordinator records phase=collect BEFORE starting measurement. Verify actual processes/energy. Review phase permits no local build/test/render/write during sampling. Set phase=review when collection ends; no service/OS lock is acquired here.'}


def priority_ready(by, ready, completed, policy):
    """One explicit milestone priority; stable plan order otherwise, no optimizer."""
    target = next((i for i in policy.get('priority_targets', []) if not completed(i)), None)
    wanted, pending = set(), [target] if target else []
    while pending:
        ident = pending.pop()
        if ident in wanted:
            continue
        wanted.add(ident)
        pending.extend(dependencies(by, ident))
    return sorted(ready, key=lambda n: 0 if n['id'] in wanted else 1)


def select(data, progress, root=ROOT, jobs=4, tracked=None, check_evidence=True, source_snapshot=None):
    surfaces=json.loads((root/'SURFACES.json').read_text()) if (root/'SURFACES.json').exists() else None
    errors = validate(data,surfaces)
    if type(jobs) is not int or not 1<=jobs<=8: errors.append('jobs must be an integer between 1 and 8')
    if errors:
        return {'status': 'FAIL', 'errors': errors, 'selected': []}
    by = {n['id']: n for n in data['nodes']}
    if not isinstance(progress, dict):
        return {'status': 'FAIL', 'errors': ['progress must be an object']}
    records = progress.get('tasks', {})
    external = progress.get('external', {})
    if not isinstance(records, dict) or not isinstance(external, dict):
        return {'status': 'FAIL', 'errors': ['progress.tasks/external must be objects']}
    invalid_claims={}; verified_sources=[]
    for ident, record in records.items():
        if ident not in by or by[ident]['kind'] != 'task':
            errors.append('progress key must identify a task: ' + ident)
            continue
        if not isinstance(record, dict) or record.get('status') not in STATUSES:
            errors.append('invalid task state: ' + ident)
            continue
        phase = record.get('phase', 'work')
        if phase not in ('work', 'collect', 'review'):
            errors.append(ident + ': phase must be work, collect or review')
            continue
        if record.get('status') == 'RUNNING' and phase == 'collect' and not by[ident].get('sampling_requires_quiet_host'):
            errors.append(ident + ': collection is not permitted by the task')
        if record.get('status') == 'PASS' and check_evidence:
            if not isinstance(record.get('head'), str) or not re.fullmatch(r'[0-9a-f]{40}', record['head']):
                errors.append(ident + ': progress requires full source HEAD')
            try:
                found=[]
                path = local_file(root, record.get('evidence'))
                receipt = json.loads(path.read_text())
                found = validate_submission(by[ident], receipt, root, record.get('head'), repo=source_snapshot.get('repo') if source_snapshot else None, plan=data, source_snapshot=source_snapshot)
                if found:invalid_claims[ident]=found
                elif source_snapshot is not None:verified_sources.append(ident)
            except (OSError, ValueError, TypeError) as exc:
                invalid_claims[ident]=[str(exc)]
    ext_ok = {}; external_errors={}
    needed = {e['ref'] for n in by.values() for e in ext_requirements(by, n['id'])}
    for ref in needed:
        record=external.get(ref,{})
        okay=isinstance(record,dict) and record.get('status')=='PASS'
        if okay and check_evidence:
            from source_proof import external_proof
            found=external_proof(ref,record,root,source_snapshot.get('repo') if source_snapshot else None)
            if found:external_errors[ref]=found;okay=False
        ext_ok[ref]=okay
    collecting = [i for i, rec in records.items() if isinstance(rec,dict) and rec.get('status') == 'RUNNING' and rec.get('phase') == 'collect']
    if len(collecting) > 1:
        errors.append('multiple collection reservations on the same host')
    if collecting:
        check = collection_preflight(data, progress, collecting[0])
        if not check.get('may_record_collect'):
            errors.append('collection overlaps active local work: ' + ', '.join(check.get('blocking_tasks', [])))
    if errors:
        return {'kind': 'readiness-not-execution', 'status': 'FAIL', 'errors': errors, 'selected': []}
    cache = {}

    def completed(ident):
        if ident in cache:
            return cache[ident]
        n = by[ident]
        okay = all(completed(d) for d in dependencies(by, ident))
        okay = okay and all(ext_ok[e['ref']] for e in ext_requirements(by, ident))
        if n['kind'] == 'task':
            okay = okay and records.get(ident, {}).get('status') == 'PASS' and ident not in invalid_claims
        cache[ident] = okay
        return okay

    ready, blocked = [], []
    running = [by[i] for i, r in records.items() if r['status'] == 'RUNNING']
    for n in data['nodes']:
        if n['kind'] != 'task' or completed(n['id']):
            continue
        unmet = [d for d in entry_dependencies(by, n['id']) if not completed(d)]
        ext = [e['ref'] for e in ext_requirements(by, n['id']) if not ext_ok[e['ref']]]
        state = records.get(n['id'], {}).get('status', 'PENDING')
        if state == 'RUNNING':
            continue
        setup=[]
        if check_evidence and n.get('leased_write_paths'):
            setup=[x['lock'] for x in data.get('shared_write_leases',[]) if n['id'] in x['tasks'] and x.get('status')!='local-command-footprint-verified']
        if unmet or ext or setup:
            blocked.append({'id': n['id'], 'prerequisites': unmet, 'external': ext, 'contract_setup':setup})
        else:
            ready.append(n)
    ready = priority_ready(by, ready, completed, data.get('scheduling_policy', {}))
    chosen, deferred = [], []
    for n in ready:
        if collecting:
            deferred.append({'id': n['id'], 'reason': 'host reserved only during active collection'})
        elif len(chosen) >= max(0,jobs-len(running)):
            deferred.append({'id': n['id'], 'reason': 'parallelism limit'})
        elif any(conflict(n, other, tracked) for other in chosen + running):
            deferred.append({'id': n['id'], 'reason': 'write-scope or resource lease conflict'})
        elif 'exclusive-benchmark-hardware' in n.get('resource_locks', []) and (chosen or running):
            deferred.append({'id': n['id'], 'reason': 'benchmark needs quiet host'})
        elif any('exclusive-benchmark-hardware' in other.get('resource_locks', []) for other in chosen + running):
            deferred.append({'id': n['id'], 'reason': 'host reserved for benchmark'})
        else:
            chosen.append(n)
    return {'kind': 'readiness-not-execution', 'status': 'REPAIR_REQUIRED' if invalid_claims else 'PASS', 'errors': [], 'invalid_claims':invalid_claims, 'external_errors':external_errors, 'running_count':len(running), 'slots_available':max(0,jobs-len(running)), 'over_capacity':len(running)>jobs, 'verified_sources':verified_sources,
            'selected': [{'id': n['id'], 'title': n['title'], 'write_paths': n['write_paths'],
                          'resource_locks': n.get('resource_locks', [])} for n in chosen],
            'ready_total': len(ready), 'deferred': deferred, 'blocked': blocked,
            'completed_tasks': sum(completed(n['id']) for n in data['nodes'] if n['kind'] == 'task'),
            'source_scope_expanded': tracked is not None, 'source_revision_verified': source_snapshot is not None and bool(source_snapshot.get('repo')) and not invalid_claims and not external_errors, 'source_verification_scope':'candidate ancestry, attributed writes, effective contracts and declared output scopes; historical milestones are not current whole-product acceptance'}



def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--progress', type=Path, default=ROOT / 'progress.json')
    parser.add_argument('--repo', type=Path)
    parser.add_argument('--jobs', type=int, default=4)
    parser.add_argument('--collect', help='Read-only preflight to reserve collection for a RUNNING task.')
    parser.add_argument('--show', help='Print this task and ancestor axioms only.')
    parser.add_argument('--affected-by', nargs='+', help='Read-only list of claims to mark STALE after changes.')
    parser.add_argument('--all', action='store_true', help='Include all blocked/deferred task reasons.')
    args = parser.parse_args()
    try:
        data = json.loads((ROOT / 'PLAN.json').read_text())
        errors = validate(data)
        if errors:
            raise ValueError('; '.join(errors))
        by = {n['id']: n for n in data['nodes']}
        if args.collect:
            progress = json.loads(args.progress.read_text()) if args.progress.exists() else {'tasks': {}}
            result = collection_preflight(data, progress, args.collect)
        elif args.show:
            if args.show not in by:
                raise ValueError('unknown node ' + args.show)
            ancestors, ident = [], by[args.show].get('parent')
            while ident:
                n = by[ident]
                ancestors.append({k: n[k] for k in ('id', 'kind', 'title', 'axioms', 'criterion_ids')})
                ident = n.get('parent')
            result = {'node': by[args.show], 'ancestor_axioms': ancestors}
        elif args.affected_by:
            if any(i not in by for i in args.affected_by):
                raise ValueError('unknown changed node')
            result = {'potential_impact_review_not_blanket_invalidation': invalidated_closure(by, args.affected_by), 'instruction':'Revalidate each effective contract/source proof; mark only invalid claims STALE. Historical census is not a promise of immutable product code.', 'mutation_performed':False}
        else:
            if not 1 <= args.jobs <= 8:
                raise ValueError('--jobs must be between 1 and 8; default 4 is a ceiling, not a hardware claim')
            progress = json.loads(args.progress.read_text()) if args.progress.exists() else {'tasks': {}, 'external': {}}
            tracked = None
            if args.repo:
                tracked = subprocess.check_output(['git', '-C', str(args.repo), 'ls-files', '-z'], text=True).split('\0')
            result = select(data, progress, jobs=args.jobs, tracked=tracked, source_snapshot=git_snapshot(args.repo, progress) if args.repo else None)
            if not args.all:
                result['blocked_count'] = len(result.pop('blocked', []))
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return 1 if result.get('status') == 'FAIL' else 2 if result.get('status') == 'WAIT' else 0
    except (OSError, ValueError, KeyError, TypeError, subprocess.SubprocessError) as exc:
        print(json.dumps({'status': 'FAIL', 'errors': [str(exc)]}, ensure_ascii=False))
        return 1


if __name__ == '__main__':
    sys.exit(main())
