#!/usr/bin/env python3
"""Idempotently link existing Orchestra tickets. Dry-run by default; no ticket creation."""
from __future__ import annotations
import argparse
import json
import re
import shutil
import subprocess
import sys
import time
from pathlib import Path
from validate_plan import ROOT, validate

REPO = 'gmhelmold/HuGR-Orchestra'
API_VERSION = '2026-03-10'


class APIError(RuntimeError):
    def __init__(self, message, status=None):
        super().__init__(message)
        self.status = status


class GhClient:
    def __init__(self):
        self.executable = shutil.which('gh')
        if not self.executable:
            raise APIError('GitHub CLI gh not found. Use normal gh authentication; never paste a token into this plan.')

    def request(self, method, path, body=None, allow_404=False):
        suffix = r'repos/' + re.escape(REPO) + r'/issues/[1-9][0-9]*(?:/(?:parent|sub_issues|dependencies/blocked_by))?(?:\?per_page=100&page=[1-9][0-9]*)?'
        if not re.fullmatch(suffix, path):
            raise APIError('Endpoint outside the fixed repository relationship scope')
        if method not in ('GET', 'POST'):
            raise APIError('Only additive issue relationships are supported')
        if method == 'POST':
            valid_parent = path.endswith('/sub_issues') and isinstance(body, dict) and set(body) == {'sub_issue_id', 'replace_parent'} and type(body['sub_issue_id']) is int and body['sub_issue_id'] > 0 and body['replace_parent'] is False
            valid_dep = path.endswith('/dependencies/blocked_by') and isinstance(body, dict) and set(body) == {'issue_id'} and type(body['issue_id']) is int and body['issue_id'] > 0
            if not (valid_parent or valid_dep):
                raise APIError('POST must add exactly one permitted relationship without reparenting')
        args = [self.executable, 'api', '--hostname', 'github.com', '--method', method,
                '-H', 'Accept: application/vnd.github+json',
                '-H', 'X-GitHub-Api-Version: ' + API_VERSION, path]
        payload = None
        if body is not None:
            args += ['--input', '-']
            payload = json.dumps(body)
        proc = subprocess.run(args, input=payload, capture_output=True, text=True, timeout=60)
        if proc.returncode:
            match = re.search(r'HTTP\s+(\d{3})', proc.stderr)
            status = int(match.group(1)) if match else None
            if allow_404 and status == 404:
                return None
            # Do not echo issue bodies, credentials, environment or full response payloads.
            raise APIError(f'{method} {path}: gh failed (HTTP {status or "unknown"}); no retry loop performed', status)
        return json.loads(proc.stdout) if proc.stdout.strip() else None

    def listing(self, path):
        rows = []
        for page in range(1, 101):
            result = self.request('GET', path + f'?per_page=100&page={page}')
            if not isinstance(result, list):
                raise APIError('Expected paginated issue array')
            rows += result
            if len(result) < 100:
                return rows
        raise APIError('Pagination safety limit reached; refusing incomplete listing')


def desired_relations(plan, metadata):
    errors = validate(plan)
    if errors:
        raise ValueError('; '.join(errors))
    if plan['repo'] != REPO or metadata.get('repo') != REPO:
        raise ValueError('This script is restricted to ' + REPO)
    by = {n['id']: n for n in plan['nodes']}
    tickets = metadata['issues']
    expected = {n['id'] for n in plan['nodes'] if n['kind'] in ('epic', 'issue', 'subissue')}
    if set(tickets) != expected:
        raise ValueError('Published ticket map does not match the plan')
    numbers = [r.get('number') for r in tickets.values()]
    if any(type(n) is not int or n < 1 for n in numbers) or len(set(numbers)) != len(numbers):
        raise ValueError('Invalid or duplicate GitHub issue numbers')
    parents, dependencies, fine = [], set(), set()

    def owner(ident):
        while ident not in tickets:
            ident = by[ident]['parent']
        return ident

    for ident, row in tickets.items():
        parent = by[ident].get('parent')
        if parent is not None:
            if parent not in tickets:
                raise ValueError('Non-published parent for published issue')
            parents.append({'parent': tickets[parent]['number'], 'child': row['number'], 'node': ident})
        if by[ident]['kind'] == 'subissue':
            # Closure prerequisites may come from verification tasks (e.g. S25 needs
            # S23/S24). Partial WP/task prerequisites never become whole-issue edges.
            descendants = [n for n in by.values() if owner(n['id']) == ident]
            for n in descendants:
                for dep in n.get('depends_on', []):
                    if dep in tickets and dep != ident:
                        dependencies.add((row['number'], tickets[dep]['number']))
                    elif dep not in tickets:
                        fine.add((n['id'], dep))
            for ext in by[ident].get('external_dependencies', []):
                if ext.get('hard') and re.fullmatch(r'#\d+', ext.get('ref', '')):
                    dependencies.add((row['number'], int(ext['ref'][1:])))
                else:
                    fine.add((ident, ext['ref'] + ' (advisory; not a required issue dependency)'))
    # Coarse graph must remain acyclic after translating closure prerequisites.
    graph = {}
    for a, b in dependencies:
        graph.setdefault(a, set()).add(b)
    grey, black = set(), set()

    def visit(i):
        if i in grey:
            raise ValueError('Coarse GitHub dependency cycle; keep it task-level instead')
        if i in black:
            return
        grey.add(i)
        for j in graph.get(i, []):
            visit(j)
        grey.remove(i)
        black.add(i)
    for i in graph:
        visit(i)
    original_count = len(dependencies)
    # Keep a transitive reduction: all readiness constraints remain in PLAN,
    # but GitHub avoids redundant links. Existing user links are never deleted.
    def reachable(start, goal, skip):
        pending, seen = [start], set()
        while pending:
            item = pending.pop()
            if item in seen:
                continue
            seen.add(item)
            for nxt in graph.get(item, []):
                if (item, nxt) == skip:
                    continue
                if nxt == goal:
                    return True
                pending.append(nxt)
        return False
    dependencies = {(a,b) for a,b in dependencies if not reachable(a,b,(a,b))}
    return {'parents': parents, 'coarse_edges_before_reduction': original_count,
            'dependencies': [{'issue': a, 'blocked_by': b} for a, b in sorted(dependencies)],
            'fine_grained_only': [{'node': a, 'prerequisite': b} for a, b in sorted(fine)]}


def reconcile(client, plan, metadata, apply=False, delay=1.0):
    desired = desired_relations(plan, metadata)
    all_numbers = {r['number'] for r in metadata['issues'].values()}
    all_numbers |= {r['blocked_by'] for r in desired['dependencies']}
    known = {}
    markers = {r['number']: r['marker'] for r in metadata['issues'].values()}
    base = 'repos/' + REPO + '/issues/'
    for number in sorted(all_numbers):
        row = client.request('GET', base + str(number))
        if not isinstance(row, dict) or row.get('number') != number or type(row.get('id')) is not int or 'pull_request' in row:
            raise APIError('Issue identity/type mismatch for ' + str(number))
        if row.get('html_url', '').rstrip('/') != f'https://github.com/{REPO}/issues/{number}':
            raise APIError('Issue transferred or repository identity mismatch')
        if number in markers and markers[number] not in (row.get('body') or ''):
            raise APIError('Program marker absent; refusing to modify #' + str(number))
        known[number] = row['id']
    operations, existing = [], []
    # Finish all preflight reads before any POST; other parents are never replaced.
    for rel in desired['parents']:
        current = client.request('GET', base + str(rel['child']) + '/parent', allow_404=True)
        if current:
            if current.get('id') != known[rel['parent']]:
                raise APIError('Another parent already owns #' + str(rel['child']) + '; refusing reparent')
            existing.append({'kind': 'parent', **rel})
        else:
            operations.append({'kind': 'parent', **rel})
    dependency_cache = {}
    for rel in desired['dependencies']:
        num = rel['issue']
        if num not in dependency_cache:
            dependency_cache[num] = {r['id'] for r in client.listing(base + str(num) + '/dependencies/blocked_by')}
        if known[rel['blocked_by']] in dependency_cache[num]:
            existing.append({'kind': 'dependency', **rel})
        else:
            operations.append({'kind': 'dependency', **rel})
    report = {'kind': 'github-relationship-sync', 'mode': 'apply' if apply else 'dry-run',
              'status': 'PLANNED', 'native_writes_performed': 0, 'already_present': len(existing),
              'planned_operations': operations, 'fine_grained_only': desired['fine_grained_only'],
              'applied': [], 'errors': []}
    if not apply:
        return report
    for op in operations:
        try:
            if op['kind'] == 'parent':
                # Recheck after preflight to avoid replacing a concurrent owner's link.
                current = client.request('GET', base + str(op['child']) + '/parent', allow_404=True)
                if current and current.get('id') != known[op['parent']]:
                    raise APIError('Parent changed concurrently; no replacement allowed')
                if not current:
                    client.request('POST', base + str(op['parent']) + '/sub_issues',
                                   {'sub_issue_id': known[op['child']], 'replace_parent': False})
                    report['native_writes_performed'] += 1
                verified = client.request('GET', base + str(op['child']) + '/parent')
                if not verified or verified.get('id') != known[op['parent']]:
                    raise APIError('Parent read-back verification failed')
            else:
                current = {r['id'] for r in client.listing(base + str(op['issue']) + '/dependencies/blocked_by')}
                if known[op['blocked_by']] not in current:
                    client.request('POST', base + str(op['issue']) + '/dependencies/blocked_by',
                                   {'issue_id': known[op['blocked_by']]})
                    report['native_writes_performed'] += 1
                verified = {r['id'] for r in client.listing(base + str(op['issue']) + '/dependencies/blocked_by')}
                if known[op['blocked_by']] not in verified:
                    raise APIError('Dependency read-back verification failed')
            report['applied'].append(op)
            if delay:
                time.sleep(delay)
        except (APIError, subprocess.SubprocessError, OSError, ValueError) as exc:
            report['status'] = 'PARTIAL_FAILURE'
            report['errors'].append(str(exc))
            return report
    report['status'] = 'VERIFIED'
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apply', action='store_true', help='Add and verify missing parent/dependency relationships.')
    parser.add_argument('--offline', action='store_true', help='Print desired links without GitHub calls; not remote verification.')
    parser.add_argument('--out', type=Path, help='Optional local report file. Existing files will not be overwritten.')
    args = parser.parse_args()
    try:
        if args.offline and args.apply:
            raise ValueError('--offline cannot be combined with --apply')
        if args.out and args.out.exists():
            raise ValueError('--out already exists; choose a fresh report path')
        plan = json.loads((ROOT / 'PLAN.json').read_text())
        metadata = json.loads((ROOT / 'GITHUB.json').read_text())
        if args.offline:
            report = {'kind': 'github-desired-links-only', 'status': 'NOT_APPLIED', 'native_writes_performed': 0,
                      **desired_relations(plan, metadata)}
        else:
            report = reconcile(GhClient(), plan, metadata, apply=args.apply)
        if args.out:
            args.out.parent.mkdir(parents=True, exist_ok=True)
            args.out.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
        print(json.dumps(report, ensure_ascii=False, indent=2))
        return 1 if report.get('status') == 'PARTIAL_FAILURE' else 0
    except (OSError, ValueError, KeyError, TypeError, APIError, subprocess.SubprocessError) as exc:
        print(json.dumps({'status': 'FAIL', 'errors': [str(exc)]}, ensure_ascii=False))
        return 1


if __name__ == '__main__':
    sys.exit(main())
