#!/usr/bin/env python3
"""Render a new evidence-linked closure draft; never judge, execute, publish or seal."""
from __future__ import annotations

import argparse
import collections
import csv
import hashlib
import io
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

SOURCE = '1cde2ff7a71bcf7aecb5d030917b577165135d38'
PROTOCOL = 'ee2521a5b966bd505cc95bd1c733e09e12f33531'
EXECUTION = '46d09d97-39a9-482a-a290-646ba1d94c99'
PAYLOAD_PREFIX = 'modules/atlas/docs/design/genesis-chatgpt-results/20261111-v3-fresh/s2/'
JUDGES = {'/root/s2_resume_j1', '/root/s2_resume_j2'}
REVIEWERS = {'parallel-v3-fresh/S2/J1': '/root/s2_resume_j1',
             'parallel-v3-fresh/S2/J2': '/root/s2_resume_j2'}
EXPECTED_PATHS_SHA = '8b70f96dcbb623bdd1cc2a48b61d51d255d9d9ce90836efc9a5cd05f1fc5a582'
HEX40 = re.compile(r'[0-9a-f]{40}\Z')
HEX64 = re.compile(r'[0-9a-f]{64}\Z')
CRITERION = re.compile(r'(?<![A-Z0-9-])(?:GO-[AI][1-8]|AC-0[1-9]|AC-10|CC-[1-7]|SC-[1-5]|QS-[1-6]|DOD-[1-7])(?![0-9])')


class EvidenceError(Exception):
    pass


def require(condition, message):
    if not condition:
        raise EvidenceError(message)


def digest(path):
    h = hashlib.sha256()
    with path.open('rb') as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b''):
            h.update(block)
    return h.hexdigest()


def json_text(raw, label, fenced=False):
    text = raw.decode('utf-8').strip()
    if fenced and not text.startswith('{'):
        blocks = re.findall(r'```json\s*\n(.*?)\n```', text, re.S)
        require(len(blocks) == 1, f'{label}: expected one original JSON decision block')
        text = blocks[0]
    try:
        value = json.loads(text)
    except (ValueError, UnicodeError) as exc:
        raise EvidenceError(f'{label}: invalid JSON: {exc}') from exc
    require(isinstance(value, dict), f'{label}: expected a JSON object')
    return value


class Evidence:
    def __init__(self, root):
        self.root = root
        self.deliverable = root / 'deliverable'
        self.files = {}

    def path(self, path):
        p = Path(path)
        return p.resolve() if p.is_absolute() else (self.root / p).resolve()

    def register(self, path):
        p = self.path(path)
        require(p.is_file(), f'Required evidence absent: {p}')
        ref = {'path': str(p), 'byte_length': p.stat().st_size, 'sha256': digest(p)}
        previous = self.files.get(str(p))
        require(previous is None or previous == ref, f'Evidence changed during rendering: {p}')
        self.files[str(p)] = ref
        return dict(ref)

    def read(self, path, fenced=False):
        ref = self.register(path)
        p = Path(ref['path'])
        raw = p.read_bytes()
        require(hashlib.sha256(raw).hexdigest() == ref['sha256'], f'Concurrent change: {p}')
        return json_text(raw, str(p), fenced), ref

    def bound_ref(self, ref, base=None, allow_external=False):
        require(isinstance(ref, dict), f'Expected reference object, got {type(ref).__name__}')
        name = ref.get('payload_path', ref.get('path'))
        sha = ref.get('sha256', ref.get('response_sha256'))
        require(isinstance(name, str) and name, 'Reference lacks an exact path')
        require(isinstance(sha, str) and HEX64.fullmatch(sha), f'Reference lacks SHA-256: {name}')
        if name.startswith(PAYLOAD_PREFIX):
            candidates = [self.deliverable / name[len(PAYLOAD_PREFIX):]]
        elif Path(name).is_absolute():
            candidates = [Path(name)]
        else:
            candidates = ([Path(base) / name] if base else []) + [self.root / name, self.deliverable / name]
            # Runtime receipts also name repository-relative source/input files.
            # Resolve that exact name under the already verified staged source root;
            # every candidate must still match the supplied SHA-256 and byte length.
            if ".." not in Path(name).parts:
                candidates.append(self.root / "runtime-work/source-root" / name)
        seen = set()
        existing = []
        for candidate in candidates:
            p = candidate.resolve()
            if p in seen:
                continue
            seen.add(p)
            if p.is_file():
                existing.append(p)
                actual = self.register(p)
                if actual['sha256'] == sha:
                    if 'byte_length' in ref:
                        require(actual['byte_length'] == ref['byte_length'], f'Length mismatch: {p}')
                    return actual
        if not existing and allow_external and HEX40.fullmatch(str(ref.get('commit', ''))):
            return {'path': name, 'commit': ref['commit'], 'sha256': sha,
                    'verification': 'EXTERNAL_IMMUTABLE_REFERENCE_ONLY_NOT_REREAD'}
        require(False, f'Reference absent or SHA-256 mismatch: {name}')

    def nested_refs(self, data, base):
        found = []
        if isinstance(data, dict):
            if ('path' in data or 'payload_path' in data) and 'sha256' in data:
                found.append(self.bound_ref(data, base, allow_external=True))
            else:
                for value in data.values():
                    found.extend(self.nested_refs(value, base))
        elif isinstance(data, list):
            for value in data:
                found.extend(self.nested_refs(value, base))
        return found

    def stable(self):
        for ref in self.files.values():
            p = Path(ref['path'])
            require(p.is_file() and p.stat().st_size == ref['byte_length'] and digest(p) == ref['sha256'],
                    f'Input changed before output; retry on a stable snapshot: {p}')


def leaves(data, prefix=''):
    if isinstance(data, dict):
        for key, value in data.items():
            yield from leaves(value, f'{prefix}.{key}' if prefix else key)
    elif isinstance(data, list):
        for number, value in enumerate(data):
            yield from leaves(value, f'{prefix}[{number}]')
    else:
        yield prefix, data


def observations(data):
    """Quote identifiable receipt fields; do not interpret free prose or raw log bodies."""
    names = {'schema', 'state', 'status', 'result', 'conclusion', 'exit_code', 'prepare_executed',
             'publish_executed', 'executed', 'operation', 'recorded_at', 'started_at', 'ended_at',
             'start_time', 'end_time', 'cwd', 'candidate_id', 'candidate_revision', 'source_revision',
             'protocol_revision', 'native_package_sha256', 'package_sha256', 'implementation_pin',
             'run_id', 'run_attempt', 'head_sha', 'scope', 'own_branch_head', 'observed_branch_head',
             'remote_head', 'release_id', 'discovery_commit', 'release_commit', 'artifact_revision',
             'seal_revision', 'publication_state', 'authorization_state', 'git_checkout',
             'observed_head', 'membership_observation_ready', 'cas_created'}
    result = []
    for path, value in leaves(data):
        name = path.rsplit('.', 1)[-1]
        is_argv = '.argv[' in '.' + path or path.startswith('argv[')
        is_remote_pin = 's4' in path.lower() and name in {'commit', 'sha256', 'path'}
        is_branch = 'own_branch' in path.lower() and name in {'sha', 'head', 'head_sha', 'commit', 'name'}
        if name in names or is_argv or is_remote_pin or is_branch:
            if not isinstance(value, str) or len(value) <= 1500:
                result.append({'field': path, 'value': value})
    return result


def receipt(evidence, path):
    data, ref = evidence.read(path)
    linked = evidence.nested_refs(data, Path(ref['path']).parent)
    return data, {'receipt': ref, 'observed_fields': observations(data), 'verified_reference_files': linked}


def runtime_state(data, override):
    vals = list(leaves(data))
    labels = {str(v).upper().replace('-', '_') for p, v in vals
              if p.rsplit('.', 1)[-1] in {'state', 'status', 'result'}}
    codes = [v for p, v in vals if p.rsplit('.', 1)[-1] == 'exit_code' and isinstance(v, int)]
    false_execution = any(v is False and p.rsplit('.', 1)[-1] in {'executed', 'prepare_executed'} for p, v in vals)
    failed = any(v != 0 for v in codes) or any('FAIL' in s for s in labels)
    not_run = false_execution or any('NOT_RUN' in s or 'NOT_EXECUTED' in s for s in labels)
    held = any('HOLD' in s or 'BLOCK' in s for s in labels)
    if override:
        supported = {'FAIL': failed, 'NOT_RUN': not_run, 'HOLD': held or failed or not_run}[override]
        require(supported, f'--runtime-status {override} is not supported by explicit observed receipt fields')
        return override
    if failed:
        return 'FAIL'
    if not_run:
        return 'NOT_RUN'
    # A zero exit or claimed PASS is quoted, never promoted to full-runtime acceptance.
    return 'HOLD'


def package_binding(data, expected, label, required=True):
    found = []
    for path, value in leaves(data):
        key = path.rsplit('.', 1)[-1]
        if key in {'native_package_sha256', 'package_sha256'} or path.endswith(('native_package.sha256', 'package.sha256')):
            found.append(value)
    require(found or not required, f'{label}: missing native_package_sha256/package_sha256 binding')
    require(all(v == expected for v in found), f'{label}: does not bind the current native-package bytes')
    return bool(found)


def normalize_case_state(data, has_trace):
    claimed = str(data.get('state', data.get('status', data.get('verdict', 'UNKNOWN')))).upper()
    if claimed in {'FAIL', 'FAILED', 'FIX-FIRST'}:
        return 'HOLD', claimed
    if claimed in {'NOT_RUN', 'NOT_EXECUTED'}:
        return 'NOT_RUN', claimed
    return ('HOLD' if has_trace else 'NOT_RUN'), claimed


def criterion_scopes(doc, entry, known, judge, artifact, review_ref):
    scopes = []
    for location, collection in [('artifact.criteria', entry.get('criteria', [])),
                                 ('review.shared_criteria', doc.get('shared_criteria', []))]:
        if isinstance(collection, dict):
            items = [{'id': key, **(value if isinstance(value, dict) else {'decision': value})}
                     for key, value in collection.items()]
        elif isinstance(collection, list):
            items = collection
        else:
            continue
        for item in items:
            if not isinstance(item, dict):
                continue
            original_ids = item.get('ids', item.get('id', []))
            raw_ids = original_ids if isinstance(original_ids, list) else [original_ids]
            ids = {match for raw in raw_ids if isinstance(raw, str) for match in CRITERION.findall(raw)} & known
            for ident in sorted(ids):
                scopes.append({'criterion_id': ident, 'judge': judge, 'artifact_key': artifact,
                               'original_id_labels': raw_ids, 'decision': item.get('decision', item.get('verdict', 'UNSPECIFIED')),
                               'location_in_original': location,
                               'reported_scope': {k: item[k] for k in ['location', 'reason', 'scope'] if k in item},
                               'original_review': review_ref})
    return scopes


def validate_package(e, template, registry, norm_lines):
    package, package_ref = e.read('deliverable/native-package.json')
    require(package.get('source_revision') == SOURCE and package.get('protocol_ref', {}).get('commit') == PROTOCOL,
            'Native package source/protocol pin mismatch')
    expected = template['scope_snapshot']['required_artifact_keys']
    required = package.get('required_artifact_keys')
    require(len(expected) == len(set(expected)) == 13, 'Draft seed lacks exactly 13 required keys')
    require(isinstance(required, list) and len(required) == 13 and set(required) == set(expected),
            'Final required-artifact set differs from frozen 13-key set')
    require(package.get('missing_required_artifact_keys') == [], 'Required artifact keys remain missing')
    items = package.get('artifacts', [])
    require(len(items) == 13 and {a.get('key') for a in items} == set(required), 'Final package lacks exact 13 unique artifacts')
    artifacts = {a['key']: a for a in items}
    all_acceptances, scope_records, optional = [], [], []
    known = {x['id'] for x in registry['criteria']}
    for layer in range(1, 5):
        accepted, accepted_ref = e.read(f'deliverable/accepted/l{layer}.json')
        require(accepted.get('status') == 'SEMANTIC_LAYER_ACCEPTED', f'L{layer}: not actually accepted')
        require(accepted.get('layer') == layer and accepted.get('execution_id') == EXECUTION,
                f'L{layer}: layer/execution mismatch')
        require(accepted.get('source_revision') == SOURCE and accepted.get('protocol_revision') == PROTOCOL,
                f'L{layer}: accepted source/protocol mismatch')
        require(accepted.get('population') == 4506 and accepted.get('paths_sha256') == EXPECTED_PATHS_SHA,
                f'L{layer}: population identity mismatch')
        expected_layer = {key for key in required if key.startswith(f's2.l{layer}.')}
        entries = accepted.get('artifacts', [])
        require(len(entries) == len(expected_layer) and {a.get('key') for a in entries} == expected_layer,
                f'L{layer}: whole-layer acceptance coverage mismatch')
        for entry in entries:
            a = artifacts[entry['key']]
            require(a.get('layer') == layer and a.get('validity') == 'supported', f"{a['key']}: unsupported current artifact")
            body = e.bound_ref(a['body'], e.deliverable)
            require(entry.get('body_path') == a['body']['path'] and entry.get('body_sha256') == body['sha256']
                    and entry.get('byte_length') == body['byte_length'], f"{a['key']}: accepted/current body mismatch")
            for field in ['recipe_ref', 'producer_request_ref', 'producer_response_ref']:
                e.bound_ref(a.get(field), e.deliverable)
            reviews = entry.get('reviews', [])
            require(len(reviews) == 2 and {r.get('judge') for r in reviews} == JUDGES,
                    f"{a['key']}: exact persistent pair missing")
            manifest_reviews = [e.bound_ref(r, e.deliverable) for r in a.get('semantic_review_refs', [])]
            require(len(manifest_reviews) == 2, f"{a['key']}: manifest needs two exact semantic references")
            reviewed = []
            for review in reviews:
                require(review.get('verdict') == 'PASS', f"{a['key']}: accepted review is not PASS")
                rr = e.bound_ref({'path': review['response_path'], 'sha256': review['response_sha256']}, e.deliverable)
                require(any(x['path'] == rr['path'] and x['sha256'] == rr['sha256'] for x in manifest_reviews),
                        f"{a['key']}: review absent from native manifest")
                doc, _ = e.read(rr['path'], fenced=True)
                judge = REVIEWERS.get(doc.get('reviewer', doc.get('reviewer_id')))
                require(judge == review['judge'], f'{rr["path"]}: persistent reviewer identity mismatch')
                require(doc.get('source_revision') == SOURCE and doc.get('protocol_revision') == PROTOCOL,
                        f'{rr["path"]}: original review pin mismatch')
                matching = [x for x in doc.get('artifacts', []) if x.get('key') == a['key']]
                require(len(matching) == 1, f'{rr["path"]}: artifact decision absent/duplicated')
                decision = matching[0]
                require(decision.get('verdict') == 'PASS' and decision.get('mandatory_findings') == []
                        and decision.get('body_sha256') == body['sha256'], f"{a['key']}: original exact PASS proof missing")
                reviewed.append({'judge': judge, 'verdict': 'PASS', 'scope': 'SEMANTIC_ARTIFACT_ONLY', 'response': rr})
                scope_records += criterion_scopes(doc, decision, known, judge, a['key'], rr)
                for suggestion in decision.get('optional_suggestions', []):
                    optional.append({'artifact_key': a['key'], 'judge': judge, 'suggestion_as_recorded': suggestion, 'review': rr})
            all_acceptances.append({'key': a['key'], 'layer': layer, 'body': body, 'accepted_layer': accepted_ref,
                                    'semantic_content_status': 'PASS_RECORDED_FROM_BOTH_ORIGINAL_JUDGES', 'reviews': reviewed})
    # Mechanical graph checks only; they do not certify semantic dependencies.
    graph, nav = {}, {}
    for key, a in artifacts.items():
        deps = a.get('build_dependencies', [])
        require(all(isinstance(d, dict) and d.get('same_package') is True and d.get('key') in artifacts for d in deps),
                f'{key}: unsupported/missing same-package build dependency')
        graph[key] = [d['key'] for d in deps]
        nav[key] = a.get('navigation', [])
        require(isinstance(nav[key], list) and all(isinstance(k, str) and k in artifacts for k in nav[key]),
                f'{key}: broken navigation target')
    seen, active = set(), set()
    def visit(key):
        require(key not in active, f'Build dependency cycle at {key}')
        if key in seen:
            return
        active.add(key)
        for dep in graph[key]:
            visit(dep)
        active.remove(key)
        seen.add(key)
    for key in graph:
        visit(key)
    roots = [v for _, v in leaves(package.get('roots', {}))]
    require(roots and all(isinstance(x, str) and x in artifacts for x in roots), 'Final roots absent or broken')
    reached, queue = set(), list(roots)
    while queue:
        key = queue.pop()
        if key not in reached:
            reached.add(key)
            queue += graph[key] + nav[key]
    require(reached == set(required), 'Required keys are not all reachable from actual roots')
    return package, package_ref, artifacts, all_acceptances, scope_records, optional, graph, nav


def current_coverage(e):
    data, ref = e.read('deliverable/evidence/l1-principal-verification.json')
    coverage_ref = e.register('deliverable/coverage.tsv')
    rows = list(csv.DictReader(Path(coverage_ref['path']).read_text().splitlines(), delimiter='\t'))
    paths = [x['path'] for x in rows]
    sha = hashlib.sha256(('\n'.join(sorted(paths)) + '\n').encode()).hexdigest()
    require(len(paths) == len(set(paths)) == 4506 and sha == EXPECTED_PATHS_SHA,
            'Current coverage.tsv differs from frozen S2 population')
    require(data.get('population') == 4506 and data.get('paths_sha256') == sha, 'Coverage receipt population mismatch')
    require(sum(data.get('depth_counts', {}).values()) == 4506, 'Coverage depth counts do not reconcile')
    for unit in data.get('units', []):
        require(unit.get('source_revision') == SOURCE, 'Coverage unit source pin mismatch')
        for name, binding in unit.get('artifact_hashes', {}).items():
            e.bound_ref({'path': f"layers/l1/{unit['unit']}/{name}", **binding}, e.deliverable)
    return {'receipt': ref, 'coverage': coverage_ref, 'population': 4506, 'paths_sha256': sha,
            'families': data.get('families'), 'depth_counts': data['depth_counts'],
            'unit_counts': dict(collections.Counter(x['unit'] for x in rows)),
            'scope': 'Mechanical coverage/provenance only, not semantic sufficiency'}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output-dir', required=True, help='New, nonexistent direct/indirect child of closure-work')
    parser.add_argument('--runtime-operation-receipt', '--runtime-receipt', dest='runtime_receipt', required=True)
    parser.add_argument('--runtime-status', choices=['HOLD', 'NOT_RUN', 'FAIL'])
    parser.add_argument('--remote-readback', required=True)
    parser.add_argument('--ci-readback', action='append', required=True)
    parser.add_argument('--consumer-receipts', help='Optional actual suite receipt with cases[] and trace_ref(s)')
    parser.add_argument('--update-receipt', help='Optional actual S2-U1 receipt; no graph execution is inferred')
    parser.add_argument('--control-receipt', action='append', default=[], help='Optional actual shared/local control receipt; repeatable')
    args = parser.parse_args()
    closure = Path(__file__).resolve().parent
    root = closure.parent
    out = Path(args.output_dir).expanduser().resolve()
    require(out != closure and closure in out.parents, 'Output must be a new directory strictly under closure-work')
    require(not out.exists() and out.parent.is_dir(), 'Output directory must not exist; its parent must already exist')
    started = datetime.now(timezone.utc).isoformat()
    e = Evidence(root)
    template, template_ref = e.read(closure / 'obligations.json')
    registry, registry_ref = e.read('protocol/references/criteria.json')
    norm_ref = e.register('corpus/' + registry['normative_path'])
    norm_raw = Path(norm_ref['path']).read_bytes()
    norm_lines = norm_raw.decode().splitlines()
    blob = hashlib.sha1(b'blob ' + str(len(norm_raw)).encode() + b'\0' + norm_raw).hexdigest()
    require(registry.get('source_revision') == SOURCE and blob == registry['normative_blob_sha']
            and blob == template['normative_source']['git_blob_sha'], 'Pinned normative source Git blob mismatch')
    expected_ids = [x['id'] for x in registry['criteria']]
    require(len(expected_ids) == len(set(expected_ids)) == 50, 'Registry does not contain exactly 50 unique IDs')
    require([x['id'] for x in template['criteria']] == expected_ids, 'Draft template IDs/order differ from pinned registry')
    for row, origin in zip(template['criteria'], registry['criteria']):
        require(row['source_line'] == origin['source_line'] and row['normative_line'] == norm_lines[origin['source_line'] - 1],
                f"Exact normative line mismatch for {row['id']}")
        require(row['global_complement']['owner'] == 'ROOT', f"Global complement owner changed for {row['id']}")
    package, package_ref, artifacts, accepted, scopes, suggestions, graph, nav = validate_package(e, template, registry, norm_lines)
    coverage = current_coverage(e)
    frozen_oracle_ref = e.register('deliverable/oracles/ownership-v1.json')
    initial_oracle = next(x for x in template['snapshot']['files'] if x['path'] == 'deliverable/oracles/ownership-v1.json')
    require(frozen_oracle_ref['sha256'] == initial_oracle['sha256']
            and package.get('contract', {}).get('oracle_ref', {}).get('sha256') == initial_oracle['sha256'],
            'Frozen ownership oracle hash changed; do not silently reuse old case metadata')
    preservation, preservation_summary = receipt(e, 'deliverable/evidence/original-preservation-final.json')
    require(preservation.get('initial_file_count') == 1231 and preservation.get('all_initial_file_bytes_preserved_and_verified') is True,
            'Final original-preservation receipt does not verify all 1231 initial files')
    preservation_summary['scope'] = ('The existing receipt verifies all 1231 initial files. This renderer binds its archive/override bytes; '
                                     'late transport information is not old semantic acceptance.')
    ledger_ref = e.register('deliverable/execution-ledger.jsonl')
    try:
        ledger = [json.loads(line) for line in Path(ledger_ref['path']).read_text().splitlines() if line.strip()]
    except ValueError as exc:
        raise EvidenceError(f'Invalid ledger JSONL: {exc}') from exc
    require(ledger and all(isinstance(row, dict) and row.get('event') for row in ledger), 'Ledger missing event records')
    runtime, runtime_summary = receipt(e, args.runtime_receipt)
    package_binding(runtime, package_ref['sha256'], 'Runtime-operation receipt')
    runtime_summary['closure_state'] = runtime_state(runtime, args.runtime_status)
    runtime_summary['interpretation'] = ('Only observed receipt fields are quoted. A successful prepare exit/output does not establish '
                                         'binding, governed publication, readers, consumers, update/recovery or CI acceptance.')
    remote, remote_summary = receipt(e, args.remote_readback)
    remote_leaves = list(leaves(remote))
    own_heads = [v for p, v in remote_leaves if isinstance(v, str) and HEX40.fullmatch(v) and
                 (p.rsplit('.', 1)[-1] in {'own_branch_head', 'observed_branch_head', 'remote_head'} or
                  ('own_branch' in p.lower() and p.rsplit('.', 1)[-1] in {'sha', 'head', 'head_sha', 'commit'}))]
    s4_pins = [v for p, v in remote_leaves if isinstance(v, str) and HEX40.fullmatch(v) and 's4' in p.lower()
               and p.rsplit('.', 1)[-1] in {'commit', 'discovery_commit', 'release_commit', 'head_sha'}]
    require(own_heads and s4_pins, 'Final remote readback must identify own branch head and exact S4 discovery commit')
    remote_summary['own_branch_heads_as_recorded'] = sorted(set(own_heads))
    remote_summary['s4_discovery_commits_as_recorded'] = sorted(set(s4_pins))
    remote_summary['interpretation'] = 'Read-only branch/release discovery is not payload publication, sealing, binding or activation.'
    ci = [receipt(e, p)[1] for p in args.ci_readback]
    for item in ci:
        require(any(x['field'].rsplit('.', 1)[-1] in {'run_id', 'conclusion', 'status'} for x in item['observed_fields']),
                'CI receipt lacks identifiable run/result fields; supply an actual structured readback')
    historical = []
    for path in ['deliverable/evidence/archive-publication-rejection.json', 'deliverable/evidence/remote-publication-rejection.json']:
        data, item = receipt(e, path)
        require(data.get('isError') is True, f'Expected original automatic rejection receipt: {path}')
        item['reason_as_recorded'] = [x.get('text', '') for x in data.get('content', []) if x.get('type') == 'text']
        historical.append(item)
    cases = [{k: v for k, v in row.items() if k != 'state'} for row in template['consumer_cases']]
    require(len(cases) == len({x['id'] for x in cases}) == 14, 'Frozen suite lacks exactly 14 unique consumer IDs')
    require(all(x.get('target') in artifacts for x in cases if 'target' in x), 'Frozen direct-use target missing from final package')
    suite_ref, actual_cases = None, {}
    if args.consumer_receipts:
        suite, suite_ref = e.read(args.consumer_receipts)
        package_binding(suite, package_ref['sha256'], 'Consumer suite')
        supplied = suite.get('cases')
        require(isinstance(supplied, list), 'Consumer receipt must contain cases[]')
        require(len({x.get('id') for x in supplied}) == len(supplied), 'Duplicated consumer receipt IDs')
        require({x.get('id') for x in supplied} <= {x['id'] for x in cases}, 'Unknown consumer ID supplied')
        actual_cases = {x['id']: x for x in supplied}
    for case in cases:
        actual = actual_cases.get(case['id'])
        case.update({'state': 'NOT_RUN', 'trace_refs': [], 'evaluation_refs': [],
                     'remaining_proof': 'Real ownership.index/read trace, exact versions/read bounds, observed isolation, and independent evaluation.'})
        if actual:
            refs = list(actual.get('trace_refs', []))
            if actual.get('trace_ref'):
                refs.append(actual['trace_ref'])
            case['trace_refs'] = [e.bound_ref(x, Path(suite_ref['path']).parent) for x in refs]
            case['evaluation_refs'] = [e.bound_ref(x, Path(suite_ref['path']).parent) for x in actual.get('evaluation_refs', [])]
            case['state'], case['reported_state'] = normalize_case_state(actual, bool(refs))
            case['reported_observations'] = {k: actual[k] for k in ['index_calls', 'read_calls', 'body_bytes_total', 'source_access', 'context_isolation', 'artifact_versions'] if k in actual}
            case['interpretation'] = 'Trace/evaluation references are preserved, not independently semantically rejudged by this renderer.'
            if not refs:
                require(str(actual.get('state', actual.get('status', ''))).upper() in {'NOT_RUN', 'NOT_EXECUTED', 'HOLD'},
                        f"{case['id']}: claimed execution/result lacks an actual trace reference")
    changed_input = 'file:apps/desktop/src/main/owned-serve.ts'
    seeds = sorted(key for key, artifact in artifacts.items() if changed_input in artifact.get('input_keys', []))
    require(seeds, 'S2-U1 declared graph lacks its frozen changed input')
    affected = set(seeds)
    while True:
        expanded = affected | {key for key, deps in graph.items() if set(deps) & affected}
        if expanded == affected:
            break
        affected = expanded
    update = {'id': 'S2-U1', 'state': 'NOT_RUN', 'changed_input': changed_input,
              'expected_graph': {'direct_input_consumers': seeds, 'build_dependent_closure': sorted(affected),
                                 'unaffected_by_build_graph': sorted(set(artifacts) - affected),
                                 'navigation_edges_do_not_propagate': True,
                                 'scope': 'Mechanical prediction from the final declared graph; requires independent expected-set validation.'},
              'actual_execution': None, 'set_comparison': 'NOT_RUN'}
    if args.update_receipt:
        actual, summary = receipt(e, args.update_receipt)
        package_binding(actual, package_ref['sha256'], 'Update receipt')
        require(actual.get('id', actual.get('case_id')) == 'S2-U1', 'Update receipt is not S2-U1')
        update.update({'state': 'HOLD', 'actual_execution': summary})
        if 'actual_affected_keys' in actual:
            keys = actual['actual_affected_keys']
            require(isinstance(keys, list) and len(keys) == len(set(keys)) and set(keys) <= set(artifacts), 'Invalid actual affected keys')
            update['reported_actual_affected_keys'] = keys
            update['set_comparison'] = 'RECORDED_SET_MATCH' if set(keys) == affected else 'RECORDED_SET_MISMATCH'
            update['set_comparison_limit'] = 'Set equality does not prove actual rebuild, restoration, semantic sufficiency, reuse or mutation controls.'
    controls = [receipt(e, path)[1] for path in args.control_receipt]
    # These are evidence requirements, not new operations or a new acceptance scheme.
    actions = {
        'G-LAYERS': ('PASS_RECORDED_CONTENT_ONLY', 'All 13 exact artifacts have recorded two-judge semantic PASS; retain accepted bytes and review scope.'),
        'G-RUNTIME': (runtime_summary['closure_state'], 'Use the actual operation result and current S4 discovery; if blocked, obtain a compatible pinned implementation, preserve full inputs and rerun only through an authorized isolated operation. Do not assume historical r1 limitations remain current.'),
        'G-BINDING': ('HOLD', 'Provide two actual binding decisions for the exact prepared candidate/contract/results/inputs plus authorized isolated governed publication receipts; content PASS does not supply binding authority.'),
        'G-CONSUMERS': ('HOLD' if any(x['trace_refs'] for x in cases) else 'NOT_RUN', 'Complete all 14 real Atlas-only traces and independent evaluations under the frozen limits; missing readers/cases remain S2 obligations.'),
        'G-UPDATE': (update['state'], 'Validate the expected final-graph closure and execute S2-U1 restoration/reuse; bind compatible controls for additions/removals, intent/recipe changes, missing edge/input rejection, authority/validity/gaps propagation, receipt-only refresh and unchanged-result stopping.'),
        'G-RECOVERY': ('HOLD' if controls else 'NOT_RUN', 'Bind exact compatible common coherence/recovery/rollback/migration controls and S2 local-use proof: complete current manifest or HOLD, durable resume, stale-current refusal, compatible rollback, labelled history and independent valid scope.'),
        'G-CI': ('HOLD', 'Reconcile provided actual CI conclusions and exact candidate/workflow scope. Supply missing S2 final-payload remote gates, generation/typecheck/guards evidence; shared passing steps never override a failed overall run. ROOT owns union epic/branch-protection integration.'),
        'G-PROVENANCE': ('HOLD', 'Finish final ledger/outcome and source/recipe/review/receipt reconciliation; retain original 1231-file preservation proof and late-receipt distinction. Obtain final same-pair closure assessment; do not infer hidden usage or old approval.'),
        'G-PUBLICATION': ('HOLD', 'Determine current authorization/publication state from real later receipts while preserving both historical public-write refusals. If still blocked, finish independent work and present concrete public-disclosure scope for authorization or an authorized safer destination. No retry/bypass. After authorization: fresh HEAD, payload P, separate handoff H, expected-sha lease/force:false, and exact readback.'),
        'G-CLOSURE': ('HOLD', 'The principal must obtain the final same-pair closure assessment against this exact evidence bundle; this renderer does not issue criterion verdicts or seal a handoff.')}
    gates = [{'id': key, 'state': value[0], 'unblock_or_remaining_action': value[1]} for key, value in actions.items()]
    by_criterion = collections.defaultdict(list)
    for scope in scopes:
        by_criterion[scope['criterion_id']].append(scope)
    criterion_rows = []
    for row in template['criteria']:
        relevant = [g for g in row['open_gate_refs'] if g in actions and g != 'G-LAYERS'] + ['G-CLOSURE']
        criterion_rows.append({'id': row['id'], 'source_line': row['source_line'], 'normative_line': row['normative_line'],
                               'local_status': 'HOLD', 'status_scope': 'DRAFT_WHOLE_CRITERION_PENDING_FINAL_CLOSURE_ASSESSMENT',
                               'local_obligation': row['local_obligation'],
                               'content_status': '13_ARTIFACT_PASSES_RECORDED; NOT_A_50_CRITERION_PASS',
                               'actual_criterion_review_scopes': by_criterion[row['id']],
                               'semantic_artifact_evidence': [x['key'] for x in accepted],
                               'local_evidence_links': {'native_package': package_ref, 'coverage': coverage['receipt'],
                                                        'runtime_operation': runtime_summary['receipt'], 'remote_readback': remote_summary['receipt'],
                                                        'ci_readbacks': [x['receipt'] for x in ci], 'preservation': preservation_summary['receipt'], 'ledger': ledger_ref},
                               'open_gate_refs': list(dict.fromkeys(relevant)),
                               'remaining_proof': [actions[g][1] for g in dict.fromkeys(relevant)],
                               'global_complement': row['global_complement']})
    handoff_path = e.deliverable / 'handoff.json'
    handoff = {'state': 'PRESENT_UNSEALED_BY_THIS_RENDERER', 'reference': e.register(handoff_path)} if handoff_path.exists() else {
        'state': 'PLANNED_ABSENT', 'planned_path': str(handoff_path), 'owner': 'S2 principal',
        'condition': 'Actual payload commit followed by separate seal and exact readback; this renderer never creates it.'}
    end = datetime.now(timezone.utc).isoformat()
    output = {'schema': 'genesis-s2-final-work-draft/v1', 'status': 'DRAFT_FOR_FINAL_SAME_PAIR_ASSESSMENT',
              'execution_id': EXECUTION, 'source_revision': SOURCE, 'protocol_revision': PROTOCOL,
              'render_started_at': started, 'render_completed_at': end,
              'role_limit': 'Mechanical evidence renderer only; no semantic production, reviewer replacement, execution or publication.',
              'normative_registry': registry_ref, 'normative_source': {**norm_ref, 'git_blob_sha': blob}, 'draft_seed': template_ref,
              'semantic_acceptance': accepted, 'optional_suggestions_as_recorded': suggestions,
              'optional_suggestion_limit': 'Optional suggestions do not authorize rewriting accepted bodies; L2 optional desktop heading wording remains at its accepted bytes.',
              'native_package': package_ref, 'package_state_as_recorded': package.get('package_state'),
              'coverage': coverage, 'preservation': preservation_summary,
              'runtime_operation': runtime_summary, 'final_remote_readback': remote_summary, 'ci_readbacks': ci,
              'historical_public_write_rejections': historical,
              'historical_rejection_limit': 'Historical refusals are preserved even if a later properly authorized publication is verified. They are not silently retried or treated as permanent technical incapacity.',
              'consumer_cases': cases, 'consumer_suite_reference': suite_ref, 'frozen_oracle_identity': frozen_oracle_ref,
              'consumer_read_limits': template['consumer_read_limits'],
              'local_update': update, 'control_receipts': controls, 'open_gates': gates,
              'accounting': {'ledger': ledger_ref, 'visible_ledger_rows': len(ledger),
                             'event_counts': dict(sorted(collections.Counter(x['event'] for x in ledger).items())),
                             'tokens': 'UNKNOWN', 'billing': 'UNKNOWN', 'physical_provider_attempts': 'UNKNOWN',
                             'historical_accounting': 'GLOBAL_UNRECONCILED', 'historical_owner': 'ROOT',
                             'limit': 'Visible event counts are not provider attempts, token usage, dollars, a hard adapter guarantee or current agent liveness.'},
              'handoff': handoff, 'criteria': criterion_rows,
              'snapshot_input_files': sorted(e.files.values(), key=lambda x: x['path']),
              'render_actions': {'remote_writes': 0, 'product_tests': 0, 'semantic_judgments': 0, 'handoffs_sealed': 0}}
    work = markdown(output)
    e.stable()
    # All reads/validation finish before any output. mkdir/open are exclusive; never mutate the live deliverable.
    out.mkdir(exist_ok=False)
    with (out / 'work.md').open('x', encoding='utf-8') as stream:
        stream.write(work)
    with (out / 'final-obligations.json').open('x', encoding='utf-8') as stream:
        json.dump(output, stream, ensure_ascii=False, indent=2)
        stream.write('\n')
    print(json.dumps({'status': output['status'], 'criteria': 50, 'semantic_artifacts': 13, 'consumer_cases': 14,
                      'outputs': [{'path': str(out / name), 'sha256': digest(out / name)} for name in ['work.md', 'final-obligations.json']]}, indent=2))


def md(value):
    return str(value).replace('|', '\\|').replace('\n', ' ')


def link(ref):
    return f"[{Path(ref['path']).name}](sandbox:{ref['path']}) (SHA-256 `{ref['sha256']}`)"


def markdown(data):
    lines = ['# Genesis S2 — final work DRAFT', '',
             '**DRAFT_FOR_FINAL_SAME_PAIR_ASSESSMENT.** Thirteen exact artifacts have recorded semantic PASS from both persistent judges. '
             'This renderer does not infer whole-criterion, runtime, consumer, CI, publication or delivery acceptance.', '',
             f"Execution `{EXECUTION}`; baseline `{SOURCE}`; protocol `{PROTOCOL}`. Snapshot {data['render_started_at']} to {data['render_completed_at']}.", '',
             '## Source, coverage and preservation', '',
             f"Native package: {link(data['native_package'])}. Recorded package state: `{data['package_state_as_recorded']}`.", '',
             f"Coverage: {data['coverage']['population']:,} paths, {data['coverage']['families']} families; depths {json.dumps(data['coverage']['depth_counts'], ensure_ascii=False)}. "
             f"Frozen path SHA-256 `{data['coverage']['paths_sha256']}`. Evidence: {link(data['coverage']['receipt'])}.", '',
             'The final preservation receipt verifies all 1,231 initial snapshot files, including the explicitly preserved initial version of the late app transport receipt. '
             'Late transport information creates no old judge acceptance. This renderer checks the receipt and linked archive/override hashes; it does not repeat the original full semantic audit. '
             + link(data['preservation']['receipt']), '',
             '## Recorded semantic acceptances', '',
             '| Artifact | Exact body SHA-256 | Decisions |', '| --- | --- | --- |']
    for item in data['semantic_acceptance']:
        reviews = '; '.join(f"{x['judge']} PASS: `{x['response']['path']}`" for x in item['reviews'])
        lines.append(f"| {item['key']} | `{item['body']['sha256']}` | {md(reviews)} |")
    lines += ['', 'All accepted bodies remain exact. Optional review suggestions are preserved in the JSON and do not reopen acceptance; the optional L2 desktop heading wording remains unchanged.', '',
              '## Actual operation and readback observations', '']
    for title, records in [('Runtime operation', [data['runtime_operation']]), ('Final read-only remote discovery', [data['final_remote_readback']]), ('Current supplied CI readbacks', data['ci_readbacks'])]:
        lines += [f'### {title}', '']
        for record in records:
            lines += [link(record['receipt']), '', '| Observed field | Recorded value |', '| --- | --- |']
            for item in record['observed_fields']:
                lines.append(f"| `{md(item['field'])}` | {md(json.dumps(item['value'], ensure_ascii=False))} |")
            lines.append('')
    lines += ['Runtime content acceptance, prepare, binding, governed publication, index/read, consumers and controls remain separate. '
              'A zero exit or successful CI step proves only its recorded operation/scope. Old release limits are historical; current claims use the explicitly supplied final receipts.', '',
              '## Open local gates and exact next actions', '', '| Gate | Draft state | Remaining evidence / unblock action |', '| --- | --- | --- |']
    for gate in data['open_gates']:
        lines.append(f"| {gate['id']} | {gate['state']} | {md(gate['unblock_or_remaining_action'])} |")
    lines += ['', '## Frozen consumers and local update', '',
              'All consumers require real Atlas index/read, exact artifact versions, fresh observed context and no source/answer-key access. '
              'Routine limits: 2 index calls, 2 reads, 16,000 body bytes. Deep limits: 6 index calls, 5 reads, 64,000 body bytes. '
              'A missing trace is NOT_RUN; a supplied trace remains HOLD for independent evaluation/closure. No reserved question or answer is reproduced.', '',
              '| Case | Target / kind | Depth | State | Actual trace references |', '| --- | --- | --- | --- | --- |']
    for case in data['consumer_cases']:
        refs = '; '.join(x['path'] for x in case['trace_refs']) or 'None supplied'
        lines.append(f"| {case['id']} | {md(case.get('target', case['kind']))} | {case['depth']} | {case['state']} | {md(refs)} |")
    u = data['local_update']
    lines += ['', f"S2-U1 state: **{u['state']}**. Changed input: `{u['changed_input']}`.", '',
              f"Mechanical expected build closure from the final graph: {', '.join('`' + k + '`' for k in u['expected_graph']['build_dependent_closure'])}.", '',
              f"Independent-by-build-graph set: {', '.join('`' + k + '`' for k in u['expected_graph']['unaffected_by_build_graph']) or '(empty)'}. Navigation edges do not propagate rebuild. "
              f"Observed set comparison: `{u['set_comparison']}`. This prediction requires independent expected-set validation and is not execution/rebuild proof.", '',
              '## Fifty-ID local/global disposition matrix', '',
              'Each exact normative source line is preserved in final-obligations.json. Every row retains ROOT as exclusively global complement owner. '
              'Local obligations cannot be moved to ROOT because proof or a tool is missing. All row states remain HOLD for final same-pair closure assessment; '
              'the thirteen artifact PASS decisions and any criterion-specific scopes actually stated in those decisions are linked separately. No N/A or new semantic verdict is synthesized.', '',
              '| ID (source line) | Local state | Local obligation | Open local evidence gates | ROOT global complement |', '| --- | --- | --- | --- | --- |']
    for row in data['criteria']:
        lines.append(f"| {row['id']} ({row['source_line']}) | {row['local_status']} | {md(row['local_obligation'])} | {', '.join(row['open_gate_refs'])} | {md(row['global_complement']['proof'])} |")
    lines += ['', '## Usage, publication and handoff', '',
              f"Ledger: {link(data['accounting']['ledger'])}; {data['accounting']['visible_ledger_rows']} visible events. Native tokens, billing and physical provider attempts remain **UNKNOWN**. "
              'Historical usage remains **GLOBAL_UNRECONCILED**, owner ROOT. Event counts do not establish currency limits, provider attempts or current liveness.', '',
              'Both original automatic approval review refusals remain preserved:', '']
    for refusal in data['historical_public_write_rejections']:
        lines.append('- ' + link(refusal['receipt']))
    lines += ['', 'The refusals concern internal evidence/execution records proposed for public/external GitHub disclosure. '
              'Their history remains even if a later explicitly authorized route succeeds. A read-only branch/S4 discovery receipt does not lift the refusal or prove publication. '
              'If unresolved, finish independent work, present the concrete payload/disclosure scope for authorization or establish an authorized safer destination, then follow payload P → separate seal H → leased update → exact readback. No bypass or silent retry.', '',
              f"Handoff state: `{data['handoff']['state']}`. This renderer never writes or seals deliverable/handoff.json, never overwrites deliverable/work.md, and does not assign an artifact revision or claim delivery complete.", '',
              'Owner acceptance, union integration, landing, production activation, integrated final epic and historical aggregate reconciliation belong to ROOT. '
              'The S2 principal must first reconcile its local evidence and obtain the final same-pair closure assessment. The complete input snapshot, receipt hashes, original decision scopes, optional suggestions and exact normative lines are in final-obligations.json.', '']
    return '\n'.join(lines)


if __name__ == '__main__':
    try:
        main()
    except (EvidenceError, OSError, KeyError, TypeError, ValueError) as exc:
        print(f'RENDER_REFUSED: {exc}', file=sys.stderr)
        raise SystemExit(2)
