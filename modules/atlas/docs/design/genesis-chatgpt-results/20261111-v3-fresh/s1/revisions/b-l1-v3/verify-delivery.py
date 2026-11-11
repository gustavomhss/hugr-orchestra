"""Recompute B-v3 evidence/transport mechanics. Does not import or run product code."""
from pathlib import Path, PurePosixPath
import argparse, collections, difflib, hashlib, json, re

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
PIN = '1cde2ff7a71bcf7aecb5d030917b577165135d38'
PROTOCOL = 'ee2521a5b966bd505cc95bd1c733e09e12f33531'
PREFIX = 'modules/atlas/docs/design/genesis-chatgpt-results/20261111-v3-fresh/s1/'
sha = lambda b: hashlib.sha256(b).hexdigest()
args = argparse.ArgumentParser()
args.add_argument('--allow-pending', action='store_true')
pending = args.parse_args().allow_pending
def read(rel): return json.loads((ROOT / rel).read_text())
def local(rel): return read('revisions/b-l1-v3/' + rel)
def ident(path):
    raw = path.read_bytes()
    return {'path': str(path.relative_to(ROOT)), 'sha256': sha(raw), 'byte_length': len(raw)}
def safe(rel):
    p = PurePosixPath(rel)
    assert not p.is_absolute() and '..' not in p.parts, rel
    out = ROOT / p
    assert out.resolve().is_relative_to(ROOT.resolve()), rel
    assert not out.is_symlink(), rel
    return out
def identity(ref):
    raw = safe(ref['path']).read_bytes()
    assert sha(raw) == ref['sha256'], ref['path']
    if 'byte_length' in ref: assert len(raw) == ref['byte_length'], ref['path']
    return raw

# Frozen history is compared against an independent pre-edit inventory.
frozen = local('frozen-inputs-before.json')
assert len(frozen) == 330
for path, expected in frozen.items(): identity({'path': path, **expected})
snapshot = ROOT / 'output/snapshots/native-package-l1-bv2.json'
assert sha(snapshot.read_bytes()) == 'd8db24cc3e63225fbee28a9a0fc0ea1d16d4894a87500d5c6e765c369370ba3e'
for judge in ('j1', 'j2'):
    assert (HERE / f'inputs/{judge}.md').read_bytes() == (ROOT / f'output/judgments/l1-b-v2-{judge}.md').read_bytes()

# Recompute entire source-file Git object IDs, SHA-256 and byte lengths.
manifest = local('source-manifest.json')
assert manifest['source_revision'] == PIN
sources = {s['path']: s for s in manifest['sources']}
assert len(sources) == len(manifest['sources']) == 206
source_bytes = {}
for path, s in sources.items():
    raw = safe(s['capture_path']).read_bytes()
    assert s['commit'] == PIN and len(raw) == s['byte_length'], path
    assert sha(raw) == s['sha256'], path
    blob = hashlib.sha1(f'blob {len(raw)}\0'.encode() + raw).hexdigest()
    assert blob == s['git_blob_sha'], path
    source_bytes[path] = raw
for path in ('packages/core/src/session.ts', 'packages/core/src/session/store.ts'):
    assert source_bytes[path] == (ROOT / 'producers/a/sources' / path).read_bytes()
    assert sources[path]['capture_path'].startswith('revisions/b-l1-v3/sources/')

base = read('revisions/b-l1-evidence-v1/coverage-projection.json')
selected = [g for g in base['groups'] if g['id'] in {'G30', 'G39', 'G52', 'G57'}]
historical = {m['path']: {**g['common'], **m} for g in selected for m in g['members']}
d = local('semantic-disposition.json')
assert d['historical_groups_verbatim'] == selected
assert d['source_revision'] == PIN and d['protocol_revision'] == PROTOCOL
members = {m['path']: m for m in d['members']}
assert len(members) == len(d['members']) == d['membership_count'] == 190
assert members.keys() == historical.keys()
assert d['new_read_counts'] == {'schema': 94, 'protocol': 44, 'server': 51, 'sdk': 1}
reader_counts = collections.Counter()
for path, m in members.items():
    assert m['historical_record'] == historical[path], path
    state = m['current_read_state']
    assert state['status'] == 'full_source_read_for_L1_contract_semantics'
    assert state['revision'] == 'S1-L1-B-v3'
    assert state['execution'] == 'none' and state['semantic_review'] == 'unjudged'
    expected = {k: sources[path][k] for k in ('commit','path','git_blob_sha','sha256','byte_length')}
    assert state['source_ref'] == expected, path
    read_lines = {n for q in state['read_spans'] for n in range(q['start_line'], q['end_line'] + 1)}
    assert read_lines == set(range(1, len(source_bytes[path].splitlines()) + 1)), path
    assert m['l1_fact'] and m['depth_justification'] and m['additional_evidence_ids'], path
    reader_counts[state['reader']] += 1
assert reader_counts == {'/root/producer_b': 95, '/root/producer_b/protocol_triage': 44, '/root/producer_c': 51}
domains = {g['id']: g for g in d['domains']}
assert len(domains) == len(d['domains']) == d['review_domain_count'] == 24
paths = [p for g in domains.values() for p in g['member_paths']]
assert len(paths) == len(set(paths)) == 190 and set(paths) == set(members)
for gid, g in domains.items():
    assert g['member_count'] == len(g['member_paths'])
    for k in ('current_l1_need','bounded_claim','conditional_gap','blocked_dependents','depth','why_depth_adequate'):
        assert g[k], (gid, k)
    assert g['local_source_need_status'] == 'addressed_for_review' and g['semantic_acceptance'] == 'unjudged'
    for path in g['member_paths']: assert members[path]['review_domain'] == gid

coverage = read('producers/b/coverage.json')
overlay = local('coverage-revision.json')
assert len(coverage['entries']) == 472 and len(coverage['family_counts']) == 52
for name in ('family', 'kind', 'depth'):
    assert overlay[f'base_{name}_counts_verbatim'] == coverage[f'{name}_counts']
all_paths = {m['path'] for m in coverage['entries']}
assert set(overlay['unchanged_member_paths']) == all_paths - set(members)
assert overlay['unchanged_member_count'] == len(overlay['unchanged_member_paths']) == 282
assert overlay['new_read_group_counts'] == {'G30': 44, 'G39': 94, 'G52': 1, 'G57': 51}
for path in members: assert historical[path]['kind'] == 'production'
needs = local('conditional-needs.json')
assert needs['historical_obligations_verbatim'] == base['future_obligations']
assert all(f'F{i:02}' in {n['id'] for n in needs['historical_obligations_verbatim']} for i in range(2, 9))

# Independent line/byte slice verification plus exact C/S-overlap accounting.
prior = set()
for rel in ('producers/b/review-evidence-compact-index.json', 'revisions/b-l1-evidence-v1/source-supplement-index.json'):
    for s in read(rel)['sources']:
        for q in s['ranges']:
            prior.update((s['path'], n) for n in range(q['start_line'], q['end_line'] + 1))
def verify_selection(index, main=False):
    seen = set(); count = 0; raw_total = 0; rendered = []
    for s in index['sources']:
        path = s['source_ref']['path']; raw = source_bytes[path]; lines = raw.splitlines(keepends=True)
        assert s['source_ref'] == {k: sources[path][k] for k in ('commit','path','git_blob_sha','sha256','byte_length')}
        assert s['capture_path'] == sources[path]['capture_path']
        for q in s['ranges']:
            a, z = q['start_line'], q['end_line']
            assert 1 <= a <= z <= len(lines)
            part = b''.join(lines[a - 1:z]); start = sum(map(len, lines[:a - 1]))
            assert q['byte_start'] == start and q['byte_end_exclusive'] == start + len(part)
            assert raw[q['byte_start']:q['byte_end_exclusive']] == part
            assert q['byte_length'] == len(part) and q['sha256'] == sha(part)
            entries = {(path, n) for n in range(a, z + 1)}
            assert not entries & prior, (s['id'], 'prior overlap')
            assert not entries & seen, (s['id'], 'new overlap')
            seen |= entries; count += 1; raw_total += len(part)
            if main:
                header = f"Lines {a}–{z}; {len(part)} exact bytes; span SHA256 `{sha(part)}`.\n\n```ts\n".encode()
                rendered.append(header + part + b'```\n')
    return seen, count, raw_total, rendered

excerpt = local('source-excerpts.json')
seen, range_count, literal_bytes, literal_fences = verify_selection(excerpt, True)
review_raw = (HERE / 'review-supplement.md').read_bytes()
for content in literal_fences: assert content in review_raw, 'Literal rendering differs from the exact source slice'
assert review_raw.count(b'\n```ts\n') == range_count
byid = {s['id']: s for s in excerpt['sources']}
assert len(byid) == len(excerpt['sources'])
for path, m in members.items():
    assert all(byid[i]['source_ref']['path'] == path for i in m['additional_evidence_ids'])
    assert all(byid[i]['ranges'] for i in m['additional_evidence_ids'])
for g in domains.values():
    assert set(g['additional_evidence_ids']) == {i for p in g['member_paths'] for i in members[p]['additional_evidence_ids']}
full = local('support/full-source-excerpts.json')
full_seen, full_range_count, full_literal_bytes, _ = verify_selection(full)
assert seen <= full_seen
assemblies = local('complete-branch-context.json')
overlap = []
for a in assemblies['assemblies']:
    path = a['source_ref']['path']; raw = source_bytes[path]
    part = b''.join(raw.splitlines(keepends=True)[a['start_line'] - 1:a['end_line']])
    assert sha(part) == a['sha256'] and len(part) == a['byte_length']
    assert raw[a['byte_start']:a['byte_end_exclusive']] == part
    overlap.extend((path, n) for n in range(a['start_line'], a['end_line'] + 1) if (path, n) in prior)
    assert part in (HERE / 'complete-branch-context.md').read_bytes()
assert len(overlap) == assemblies['total_prior_line_overlap'] == 3
assert sorted(n for _, n in overlap) == [597, 653, 654]

# All nine body identities, exact diffs and the retained MCP correction.
bodies = local('body-identities.json')
assert len(bodies['bodies']) == bodies['artifact_count'] == 9
changed = []
for item in bodies['bodies']:
    old = identity(item['base_body']); new = identity(item['candidate_body'])
    assert (old != new) == item['changed']
    if item['changed']:
        changed.append(item['key'])
        patch = ''.join(difflib.unified_diff(old.decode().splitlines(keepends=True), new.decode().splitlines(keepends=True), fromfile=item['base_body']['path'], tofile=item['candidate_body']['path'])).encode()
        assert patch == identity(item['diff'])
assert set(changed) == {'s1.api.server-edge','s1.api.schema-contracts','s1.api.surface-disposition'}
session = (HERE / 'bodies/session-contract.md').read_bytes()
assert sha(session) == '22b526a2423572f2bbc17f3bfccd2eb0ea8f7fb16f2215bb0904f1cc5c2125bc'
assert session == (ROOT / 'revisions/b-l1-evidence-v1/corrected/session-contract.md').read_bytes()

# Resolve all available producer payload refs. Oracle content is never opened.
fragment_name = 'fragment-metadata.pending.json' if pending else 'fragment-metadata.json'
fragment = local(fragment_name)
assert fragment['source_revision'] == PIN and fragment['protocol_ref']['commit'] == PROTOCOL
assert fragment['scope'] == 'orchestra.s1' and fragment['package_state'] == 'IN_PROGRESS'
original = read('producers/b/artifacts.json')
assert fragment['required_artifact_keys'] == original['required_artifact_keys']
artifacts = {a['key']: a for a in fragment['artifacts']}
assert len(artifacts) == 9 and set(artifacts) == set(fragment['required_artifact_keys'])
assert fragment['missing_required_artifact_keys'] == []
legal_needs = {'entry','ownership','maintenance','operational','flow','evidence','component'}
for a in artifacts.values():
    assert a['need'] in legal_needs and a['layer'] == 1 and a['scope'] == 'orchestra.s1'
    assert a['build_dependencies'] == a['semantic_review_refs'] == a['runtime_receipt_refs'] == []
    assert a['validity'] in {'supported','blocked'}
    assert a['body']['path'].startswith('revisions/b-l1-v3/bodies/')
    identity(a['body'])
    assert all(k.startswith(('file:', 'members:')) for k in a['input_keys'])
    for s in a['source_refs']:
        if s['path'] in sources:
            assert all(s[k] == sources[s['path']][k] for k in ('commit','path','git_blob_sha','sha256'))
    if not pending: assert a['producer_response_ref']['sha256'] == sha((HERE / 'response.md').read_bytes())
payload_refs = set()
def refs(value):
    if isinstance(value, dict):
        if 'payload_path' in value and 'sha256' in value:
            path, checksum = value['payload_path'], value['sha256']
            if pending and checksum == 'PENDING_FINAL_RESPONSE_BINDING': return
            assert path.startswith(PREFIX), path
            identity({'path': path.removeprefix(PREFIX), 'sha256': checksum})
            payload_refs.add((path, checksum))
        for k, child in value.items():
            if k != 'oracle_ref': refs(child)
    elif isinstance(value, list):
        for child in value: refs(child)
refs(fragment)

# Check cross-file mechanical refs, native request/response bindings and limits.
for ref in excerpt['prior_evidence_indexes'] + [excerpt['full_preserved_selection_ref']]: identity(ref)
for ref in (d['support_projection_ref'], d['future_obligations_ref'], overlay['base_coverage_ref'], overlay['new_state_ref'], overlay['conditional_obligations_ref']): identity(ref)
projection = local('review-projection-receipt.json')
for ref in projection['extensive_support_preserved'] + [projection['compact_claims_ref'], projection['compact_evidence_ref']]: identity(ref)
assert projection['exact_line_ranges'] == range_count and projection['exact_lines'] == len(seen)
delegation = local('delegation-record.json')
assert len(delegation['delegations']) == 2 and delegation['no_additional_helpers'] and delegation['no_judge_dispatch']
for item in delegation['delegations']:
    for ref in item['request_refs'] + [item['response_ref']] + item['support_files']: identity(ref)
    assert item['final_response_received'] and item['role'].endswith('not judge')
for f in local('findings-resolution.json')['findings']: assert f['status'] == 'addressed_for_review'

report = {
    'schema': 'genesis-producer-mechanical-verification/v1',
    'task': 'S1-L1-B-v3', 'source_revision': PIN, 'protocol_revision': PROTOCOL,
    'result': 'verified_mechanics_only', 'final_response_bound': not pending,
    'scope': 'Hash/byte/line/membership/transport checks only; no semantic judgment or product execution.',
    'frozen_original_files_unchanged': len(frozen),
    'base_package_snapshot': ident(snapshot),
    'working_package_note': 'The principal separately changed old B validity in the working package; that file is intentionally not required to match the preserved B-v2 snapshot.',
    'source_files_verified': len(sources),
    'source_bytes_verified': sum(map(len, source_bytes.values())),
    'copied_core_sources': 2, 'copied_core_bytes': 38548,
    'historical_assigned_count': 472, 'historical_families': 52,
    'new_full_read_members': 190, 'new_read_counts': d['new_read_counts'],
    'new_read_source_bytes': sum(len(source_bytes[p]) for p in members),
    'reader_counts': dict(sorted(reader_counts.items())),
    'unchanged_coverage_members': 282, 'review_domains': 24,
    'compact_source_records': len(excerpt['sources']),
    'compact_unique_sources': len({s['source_ref']['path'] for s in excerpt['sources']}),
    'compact_ranges': range_count, 'compact_literal_lines': len(seen),
    'compact_literal_bytes': literal_bytes,
    'compact_markdown': ident(HERE / 'review-supplement.md'),
    'compact_prior_line_overlap': 0, 'compact_duplicate_new_lines': 0,
    'complete_branch_prior_overlap': [{'path': p, 'line': n} for p, n in overlap],
    'preserved_full_support_ranges': full_range_count,
    'preserved_full_support_literal_lines': len(full_seen),
    'preserved_full_support_literal_bytes': full_literal_bytes,
    'bodies': 9, 'changed_bodies': changed, 'unchanged_bodies': 6,
    'prior_MCP_correction_unchanged': True, 'F02_F08_verbatim_preserved': True,
    'resolved_payload_refs': len(payload_refs), 'native_delegations_completed': 2,
    'current_local_source_gaps': [],
    'conditional_limits_ref': ident(HERE / 'conditional-needs.json'),
    'pending_semantic_gate': 'The two persistent independent judges must review the exact B-v3 body/evidence version.',
    'not_observed': ['Product execution/tests', 'generation/freshness', 'runtime/CI/Atlas import', 'independent semantic acceptance'],
    'checked_fragment': ident(HERE / fragment_name),
}
out = HERE / ('checks.pre-binding.json' if pending else 'checks.json')
out.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
print(json.dumps({k: report[k] for k in ('result','final_response_bound','frozen_original_files_unchanged','source_files_verified','new_full_read_members','review_domains','compact_ranges','compact_literal_lines','compact_prior_line_overlap','bodies','unchanged_bodies','resolved_payload_refs')}, indent=2))
