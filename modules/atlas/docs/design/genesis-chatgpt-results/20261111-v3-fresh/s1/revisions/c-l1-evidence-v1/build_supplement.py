"""Assemble a source-byte supplement; never imports or executes product code."""
from pathlib import Path
import collections
import hashlib
import json
import re

ROOT = Path('/workspace/scratch/2b46fb541868/genesis-s1')
BASE = ROOT / 'producers/c'
OUT = ROOT / 'revisions/c-l1-evidence-v1'
PIN = '1cde2ff7a71bcf7aecb5d030917b577165135d38'
PROTOCOL = 'ee2521a5b966bd505cc95bd1c733e09e12f33531'
PACKAGE = 'df1ac005133bc4b89577a581ea9053bd7a5231cf98b7b99c4a67db58921ed670'
DOSSIER = '9f44b927d8b5dd277ffe188197575d133afb910c53430a5c05630f78b526e83f'
sha = lambda data: hashlib.sha256(data).hexdigest()
def dump(name, value):
    (OUT / name).write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')
def mdcell(value):
    return str(value).replace('|', '\\|').replace('\n', '<br>')
def table(headers, rows):
    return '\n'.join(['| ' + ' | '.join(headers) + ' |', '| ' + ' | '.join(['---'] * len(headers)) + ' |'] +
        ['| ' + ' | '.join(mdcell(cell) for cell in row) + ' |' for row in rows]) + '\n'
def counts(entries, field):
    return dict(sorted(collections.Counter(e[field] for e in entries).items()))
def render_counts(value):
    return '; '.join(f'{key}={count}' for key, count in value.items())

EXPECTED = {
    'artifacts.json': 'd91c3605542369e8b196daccbf25571f9dfd31d8b6ee1522c78178f2f91be27a',
    'coverage.json': 'ad31d28525eeca24b2a98cdac2cb1377ab763f2d34a4d63cb56c96b88cc87fc9',
    'source-manifest.json': '940524583809e3166c269d3dd9e4cc5a27c55c75c7cabc14c9cb08adafcc84cc',
    'review-evidence.md': 'bfc3c3f4ea147681a1e19f18b46244b70ecefa8659e6e4efddbc43a95c75b899',
    'review-evidence-index.json': '5e79a9ad30bc3df62f4b06175a92b432953864bd964278de42fb3d5c43317379',
    'review-dossier.md': DOSSIER,
    'config-schema-scan.json': 'a2d9e465aa59f4d04d1db240b95edcc6e4111fed6aaf23532eecd223176578d8',
}
inputs = []
for name, expected in EXPECTED.items():
    data = (BASE / name).read_bytes()
    assert sha(data) == expected, name
    assert (ROOT / 'output/producers/c' / name).read_bytes() == data, name
    inputs.append({'path': str(BASE / name), 'bytes': len(data), 'sha256': sha(data), 'frozen_output_identical': True})
for name, expected in [
    ('l1-c-v1-j1.md', 'e928bc4d57f3c9bbe20e74a24d55e7744ab227ad13a3bb7b56231b8934767fc0'),
    ('l1-c-v1-j2.md', 'cfc4a93d90efe60920db3269c1f1776d5bad61d09d7f20c2d4f50f15c2e6013a'),
]:
    path = ROOT / 'output/judgments' / name
    data = path.read_bytes()
    assert sha(data) == expected
    inputs.append({'path': str(path), 'bytes': len(data), 'sha256': sha(data), 'role': 'authorized original evidence request'})

artifacts = json.loads((BASE / 'artifacts.json').read_text())
coverage = json.loads((BASE / 'coverage.json').read_text())
manifest = {r['path']: r for r in json.loads((BASE / 'source-manifest.json').read_text())}
frozen_index = json.loads((BASE / 'review-evidence-index.json').read_text())
entries = coverage['entries']
assert len(entries) == coverage['entry_count'] == 323
assert len({e['path'] for e in entries}) == 323
assert [a['key'] for a in artifacts['artifacts']] == artifacts['required_artifact_keys']
assert len(artifacts['artifacts']) == 10
assert sum(e['captured'] for e in entries) == 284
metadata = [e for e in entries if e['depth'] == 'git_metadata_only']
assert len(metadata) == 39 and all(not e['captured'] for e in metadata)
assert all(e['semantic_acceptance'] == 'not_asserted' for e in entries)
assert counts(entries, 'depth') == dict(sorted(coverage['counts']['by_depth'].items()))
entry_by_path = {e['path']: e for e in entries}
config_scan = json.loads((BASE / 'config-schema-scan.json').read_text())
config_projection = {'source': config_scan['source'], 'root': config_scan['root'],
                     'definitions': {'Config.Info': config_scan['definitions']['Config.Info']}}
dump('R1-generated-config-frozen-projection.json', config_projection)
artifact_fields = ['key', 'scope', 'title', 'layer', 'need', 'body', 'authority', 'validity', 'gaps',
                   'build_dependencies', 'navigation', 'semantic_review_refs', 'runtime_receipt_refs']
projection = {
    'projection_status': 'Exact selected frozen JSON values; JSON formatting is new. Derived counts are separately labeled.',
    'source_artifacts_sha256': EXPECTED['artifacts.json'],
    'source_coverage_sha256': EXPECTED['coverage.json'],
    'selected_artifact_fields': artifact_fields,
    'required_artifact_keys': artifacts['required_artifact_keys'],
    'artifacts': [{k: a[k] for k in artifact_fields} for a in artifacts['artifacts']],
    'known_limits': artifacts['known_limits'],
    'coverage_counts': coverage['counts'],
    'coverage_note': coverage['note'],
    'derived_by_family': counts(entries, 'family'),
    'derived_by_kind': counts(entries, 'kind'),
    'derived_by_need': counts(entries, 'need'),
    'derived_by_disposition': counts(entries, 'disposition'),
    'derived_by_artifact': [],
}
artifact_ids = {}
for number, a in enumerate(artifacts['artifacts'], 1):
    artifact_ids[a['key']] = f'A{number:02}'
    own = [e for e in entries if e['artifact_key'] == a['key']]
    projection['derived_by_artifact'].append({
        'artifact_key': a['key'], 'entry_count': len(own), 'families': counts(own, 'family'),
        'depths': counts(own, 'depth'), 'kinds': counts(own, 'kind'), 'needs': counts(own, 'need'),
        'dispositions': counts(own, 'disposition'), 'read_statuses': counts(own, 'read_status'),
        'captured_assigned': sum(e['captured'] for e in own),
        'metadata_only': sum(not e['captured'] for e in own),
    })
    body = (ROOT / a['body']['path']).read_bytes()
    assert len(body) == a['body']['byte_length'] and sha(body) == a['body']['sha256']
    assert (ROOT / 'output' / a['body']['path']).read_bytes() == body

reasons = []
reason_ids = {}
for e in entries:
    text = e['justification']
    if text not in reason_ids:
        reason_ids[text] = f'J{len(reasons)+1:02}'
        matching = [row for row in entries if row['justification'] == text]
        reasons.append({'id': reason_ids[text], 'justification': text, 'entry_count': len(matching),
                        'depths': counts(matching, 'depth')})

group_fields = ['family', 'kind', 'depth', 'justification', 'read_status', 'need', 'artifact_key',
                'disposition', 'semantic_acceptance', 'captured']
grouped = {}
for e in entries:
    key = tuple(e[k] for k in group_fields)
    if key not in grouped:
        grouped[key] = {'id': f'G{len(grouped)+1:03}', 'frozen_fields': {k: e[k] for k in group_fields}, 'members': []}
    grouped[key]['members'].append({k: e[k] for k in ['path', 'commit', 'git_blob_sha', 'git_byte_length']})
groups = list(grouped.values())
assert sum(len(g['members']) for g in groups) == 323
for g in groups:
    for member in g['members']:
        original = entry_by_path[member['path']]
        assert all(original[k] == v for k, v in g['frozen_fields'].items())
        assert all(original[k] == v for k, v in member.items())
dump('R1-artifact-coverage-projection.json', projection)
dump('R1-coverage-groups.json', {'source_sha256': EXPECTED['coverage.json'], 'group_fields': group_fields,
     'membership_count': 323, 'groups': groups, 'justifications': reasons})
dump('R1-metadata-only-dispositions.json', {'source_sha256': EXPECTED['coverage.json'], 'entry_count': 39, 'entries': metadata})

gap_rows = []
gap_category_map = {
    'llm_turns': [['N03'], ['N04'], ['N01', 'N02']],
    'llm_providers': [['N02', 'N03'], ['N04']],
    'llm_recording': [['N06'], ['N03'], ['N06']],
    'plugin': [['N01'], ['X01']],
    'codemode': [['N04'], ['N01'], ['X01']],
    'codemode_openapi': [['X01'], ['N06', 'N03']],
    'effect_sqlite': [['N02'], ['N04', 'N02'], ['X01']],
    'http_recorder': [['N03'], ['X01', 'N03'], ['X01']],
    'guides_intent': [['N01'], ['N05']],
    'maintenance_intent': [['N03'], ['N05', 'N02'], ['X01', 'N03']],
}
for a in artifacts['artifacts']:
    name = a['key'].split('.')[2]
    assert len(a['gaps']) == len(gap_category_map[name])
    for i, gap in enumerate(a['gaps']):
        gap_rows.append({'id': artifact_ids[a['key']] + f'.g{i}', 'artifact_key': a['key'],
                         'frozen_gap_pointer': f"/artifacts/{artifacts['artifacts'].index(a)}/gaps/{i}",
                         'frozen_text': gap, 'new_proposed_classifications': gap_category_map[name][i]})

need_proposals = [
    {'id': 'N01', 'need': 'ownership', 'knowledge_missing': 'Host lifecycle and authority/policy implementation: loader ordering/disposal/install behavior, session continuation and tool selection, leaf-tool authorization, and guide-reported host rules.',
     'owning_target': 'Core/session, plugin-host and execution-host/policy owners; the concrete owning artifact is unresolved in this unit.',
     'blocked_dependent_acceptance': 'Any promotion of package declarations, maintenance pointers or guide statements into accepted host lifecycle, credential, permission, trust, or authorization behavior.',
     'bounded_exclusion': 'The original L1 records can describe their package declarations and attributed documentary intent without claiming those host implementations were inspected.'},
    {'id': 'N02', 'need': 'component', 'knowledge_missing': 'Core route admission/adoption, application database startup/backup/restore/post-commit behavior, migration adoption, and a current consumer/import census where absence is asserted.',
     'owning_target': 'Core model-routing/database owners and repository consumer census; concrete owning artifact unresolved in this unit.',
     'blocked_dependent_acceptance': 'Accepted claims that the session core routes every facade, that a generic adapter proves Core database policy, or that the Node adapter has no current consumers.',
     'bounded_exclusion': 'Facade and generic-adapter mechanisms remain local source facts; the model guide and Node README remain documentary evidence about adoption.'},
    {'id': 'N03', 'need': 'evidence', 'knowledge_missing': 'Actual authorized execution receipts for any claimed provider/tool/replay/build/migration/consumer behavior, and real Atlas/runtime receipts if later stages require them.',
     'owning_target': 'Authorized CI/runtime/provider/consumer operators and later-stage owners; no concrete execution owner or receipt is supplied by this unit.',
     'blocked_dependent_acceptance': 'Any runtime PASS, provider conformance, successful build/replay/migration or consumer/runtime qualification inferred from source, fixtures, script declarations, hashes or counts.',
     'bounded_exclusion': 'This evidence supplement and the original source-only L1 records do not require product execution to quote or inspect code. Such execution remains unperformed, and cannot be presumed.'},
    {'id': 'N04', 'need': 'component', 'knowledge_missing': 'Uninspected interpreter/operator/stdlib, schema/reducer/protocol/multimodal and query-builder branches beyond the selected source boundaries.',
     'owning_target': 'CodeMode, LLM and generic Drizzle adapter maintainers; concrete branch-level follow-up owners unresolved in this unit.',
     'blocked_dependent_acceptance': 'Exhaustive language conformance, full isolation/security qualification, complete protocol/schema coverage, or full relational/query parity based on the selected or structural review.',
     'bounded_exclusion': 'Selected decisive implementation paths support only their stated bounded mechanisms. The frozen depth labels and group rationales are retained, including newly excerpted files whose earlier depth was structural.'},
    {'id': 'N05', 'need': 'maintenance', 'knowledge_missing': 'The generated schema publisher/regeneration chain and actual runtime config decoder, including treatment of unknown extra keys.',
     'owning_target': 'Core config decoder and schema publisher owners; concrete owning artifact unresolved in this unit.',
     'blocked_dependent_acceptance': 'A runtime rejection/ignore guarantee, successful regeneration claim, or established defect conclusion inferred solely from the schema/guide discrepancy.',
     'bounded_exclusion': 'The schema bytes and the guide wording are both preserved as differently scoped sources. This supplement does not resolve their runtime relationship.'},
    {'id': 'N06', 'need': 'evidence', 'knowledge_missing': 'Contents and semantics of all 39 metadata-only fixture/media entries; observation of the large OpenAPI specimen within an authorized observation path if needed.',
     'owning_target': 'Fixture/evidence owners; concrete capture/consumer owner unresolved in this unit.',
     'blocked_dependent_acceptance': 'Any claim that depends on the unread fixture/media bodies, any claim those files were observed/absent, or a replay/provider result inferred from their pinned metadata.',
     'bounded_exclusion': 'All 39 entries remain classification_only and not_read. The original bodies disclaim reliance on their contents; that is a bounded exclusion for these bodies, not discharge of a future required content observation.'},
    {'id': 'X01', 'need': 'component', 'knowledge_missing': 'No missing fact is invented for an already stated limit or distinct authority surface. Future claims beyond it would need implementation/change evidence or an explicitly different contract.',
     'owning_target': 'Relevant package or later-layer owner; no new owning runtime artifact is created here.',
     'blocked_dependent_acceptance': 'Claims of implemented Node streaming, response-schema/redirect guarantees, all-envelope byte limits, identical public/internal socket chronology, current APIs inferred from plans/frozen compatibility types, or completed later layers.',
     'bounded_exclusion': 'These are explicit original limits, distinct contract surfaces or out-of-scope outputs. They are not silent unknowns and do not support the excluded capability.'},
]
for proposal in need_proposals:
    proposal['classification_status'] = 'NEW PROPOSAL for principal review; not an original frozen typed need'
    proposal['proposed_validity_for_dependent_acceptance'] = 'blocked'
    proposal['mandatory_condition'] = 'Mandatory before accepting the dependent claim named here; not a retroactive alteration of original artifact validity.'
    proposal['frozen_gap_ids'] = [r['id'] for r in gap_rows if proposal['id'] in r['new_proposed_classifications']]
dump('R1-new-need-classification-proposals.json', {
    'status': 'New classification proposals, visibly separate from frozen values; originals remain unchanged.',
    'frozen_status': 'All ten original artifact validity values are supported; gap strings have no separate mandatory/owner/status typing. The original empty semantic_review_refs and runtime_receipt_refs are preserved.',
    'gaps': gap_rows, 'proposals': need_proposals,
})

common_authority = artifacts['artifacts'][0]['authority']
assert all(a['authority'] == common_authority for a in artifacts['artifacts'])
r1 = ['# R1 — Exact frozen coverage, artifact and need projection\n',
      'This section selects original JSON field values without paraphrasing them. JSON/Markdown formatting and arithmetic counts are new projections; the original files remain unchanged. The source hashes bind the complete originals. No separate frozen need ledger exists: artifact `need`, `gaps`, coverage dispositions and body limits are the frozen basis. New classifications appear only in the explicitly labeled proposal section.\n',
      f"Frozen artifacts SHA-256: `{EXPECTED['artifacts.json']}`. Frozen coverage SHA-256: `{EXPECTED['coverage.json']}`.\n",
      f"Original source revision: `{PIN}`. Scope: `{artifacts['scope']}`. Assigned entries: {coverage['entry_count']}; captured assigned: {coverage['counts']['captured_assigned']}; metadata-only: {coverage['counts']['metadata_only']}.\n",
      'Original coverage note:\n\n~~~~text\n' + coverage['note'] + '\n~~~~\n',
      '## Artifact ownership and declared need\n',
      table(['ID', 'Artifact key', 'Original artifact need', 'Original validity', 'Assigned entries', 'Assigned families'], [
          [artifact_ids[a['key']], a['key'], a['need'], a['validity'], d['entry_count'], render_counts(d['families'])]
          for a, d in zip(artifacts['artifacts'], projection['derived_by_artifact'])]),
      'All ten original `semantic_review_refs`, `runtime_receipt_refs`, `build_dependencies` and `navigation` arrays are empty. `supported` is the original bounded producer-record validity; it is not a judge verdict or discharge of a listed gap.\n',
      'Original common authority object:\n\n~~~~json\n' + json.dumps(common_authority, ensure_ascii=False, indent=2) + '\n~~~~\n',
      '## Family, kind and depth counts\n',
      table(['Family', 'Assigned entries'], sorted(projection['derived_by_family'].items())),
      table(['Kind', 'Assigned entries'], sorted(projection['derived_by_kind'].items())),
      table(['Frozen depth', 'Assigned entries'], sorted(coverage['counts']['by_depth'].items())),
      'Coverage needs (distinct from each artifact’s single declared need): ' + render_counts(projection['derived_by_need']) + '.\n',
      'Coverage dispositions: ' + render_counts(projection['derived_by_disposition']) + '. All 323 retain `semantic_acceptance: not_asserted`.\n',
      '## Depth and read status by artifact\n',
      table(['Artifact ID', 'Frozen depth counts', 'Frozen read-status counts', 'Coverage need counts'], [
          [artifact_ids[d['artifact_key']], render_counts(d['depths']), render_counts(d['read_statuses']), render_counts(d['needs'])]
          for d in projection['derived_by_artifact']]),
      '## Original grouping and depth justifications\n',
      'Each reason below is the unchanged `justification` value. The group membership file reconstructs the selected frozen fields for all 323 paths. Selected/structural/declaration depth remains selected/structural/declaration depth, including where this supplement adds a newly selected excerpt.\n',
      table(['Reason ID', 'Entry count', 'Frozen depth counts', 'Exact original justification'], [
          [r['id'], r['entry_count'], render_counts(r['depths']), r['justification']] for r in reasons]),
      '## Complete grouped disposition map\n',
      'These 60 groups partition all 323 assigned paths. All labels below are selected frozen field values; only group IDs, counts and the reason/owner abbreviations are new presentation. Full exact path membership is retained in `R1-coverage-groups.json`. The table maps each artifact/family/depth to its actual reason and disposition for tool-free review.\n',
      table(['Group', 'Entries', 'Artifact ID', 'Family', 'Kind', 'Depth', 'Read status', 'Need', 'Disposition', 'Reason'], [
          [g['id'], len(g['members']), artifact_ids[g['frozen_fields']['artifact_key']],
           g['frozen_fields']['family'], g['frozen_fields']['kind'], g['frozen_fields']['depth'],
           g['frozen_fields']['read_status'], g['frozen_fields']['need'], g['frozen_fields']['disposition'],
           reason_ids[g['frozen_fields']['justification']]] for g in groups]),
      '## All 39 metadata-only dispositions\n',
      'The following common values are unchanged in every one of the 39 original entries:\n\n~~~~json\n' + json.dumps({k: metadata[0][k] for k in ['commit', 'depth', 'read_status', 'need', 'disposition', 'semantic_acceptance', 'captured', 'review_excerpts', 'gap']}, indent=2) + '\n~~~~\n',
      'The exact path/blob/Git-size and original family/kind/owner/reason assignment for every entry follow. Git size is metadata, not a local content observation. No SHA-256 of unread content is invented.\n',
      table(['Path', 'Git blob', 'Git bytes', 'Family', 'Kind', 'Owning artifact', 'Reason'], [
          [e['path'], e['git_blob_sha'], e['git_byte_length'], e['family'], e['kind'], e['artifact_key'], reason_ids[e['justification']]] for e in metadata]),
      '## Original body identities and gap texts\n',
      table(['Artifact ID', 'Original body path', 'Bytes', 'SHA-256'], [
          [artifact_ids[a['key']], a['body']['path'], a['body']['byte_length'], a['body']['sha256']] for a in artifacts['artifacts']]),
      table(['Gap ID', 'Artifact ID', 'Exact original gap text'], [
          [r['id'], artifact_ids[r['artifact_key']], r['frozen_text']] for r in gap_rows]),
      'Original known-limit strings:\n\n~~~~json\n' + json.dumps(artifacts['known_limits'], ensure_ascii=False, indent=2) + '\n~~~~\n',
      '## Exact frozen generated-config scan projection\n',
      f"Selected unchanged values from `config-schema-scan.json`, SHA-256 `{EXPECTED['config-schema-scan.json']}`. These are structural schema observations, not a publisher/decoder/runtime guarantee. D04 supplies both documentary/source sides.\n\n~~~~json\n" + json.dumps(config_projection, ensure_ascii=False, indent=2) + '\n~~~~\n',
]

# Preserve consequential body limitation paragraphs as exact bytes, not a new assurance.
body_limits = []
for name, prefix in [
    ('http-recorder.md', 'Cassette names reject'),
    ('codemode-interpreter.md', '**Boundary and gaps.**'),
    ('sqlite-adapters.md', '**Boundary and gaps.**'),
    ('plugin-contracts.md', '**Boundary and gaps.**'),
    ('maintenance-intent.md', '`schema/config.json`'),
    ('user-guides.md', '**Boundary and gaps.**'),
]:
    p = BASE / 'bodies' / name
    raw = p.read_bytes()
    paragraphs = raw.split(b'\n\n')
    paragraph = next(part for part in paragraphs if part.startswith(prefix.encode()))
    body_limits.append({'path': 'producers/c/bodies/' + name, 'body_sha256': sha(raw),
                        'byte_start': raw.index(paragraph), 'byte_length': len(paragraph), 'sha256': sha(paragraph)})
    r1.append(f"### Frozen body boundary: `{name}`\n\nBody SHA-256 `{sha(raw)}`; exact paragraph SHA-256 `{sha(paragraph)}`.\n\n~~~~text\n" + paragraph.decode() + '\n~~~~\n')
dump('R1-body-limit-index.json', body_limits)
(OUT / 'R1-frozen-projection.md').write_text('\n'.join(r1))

proposal_md = ['# R1 supplement — NEW need/blocker classification proposals\n',
    'This classification did not exist as a separate typed ledger in the frozen packet. It is proposed now for the principal’s review. Each original gap is preserved above and linked below. No original `validity`, `need`, coverage depth, gap, body or authority value has been edited. A missing implementation or runtime fact stays unresolved; a bounded exclusion cannot waive it when a dependent claim needs it.\n',
    table(['Frozen gap ID', 'New proposed classification IDs'], [[r['id'], ', '.join(r['new_proposed_classifications'])] for r in gap_rows]),
]
for p in need_proposals:
    proposal_md += [f"## {p['id']} — NEW proposal; need `{p['need']}`\n",
       f"Original gap bindings: {', '.join(p['frozen_gap_ids'])}.\n",
       f"Missing knowledge or limit: {p['knowledge_missing']}\n",
       f"Owning target / unresolved owner: {p['owning_target']}\n",
       f"Proposed status for dependent acceptance: **blocked**. {p['mandatory_condition']}\n",
       f"Acceptance blocked: {p['blocked_dependent_acceptance']}\n",
       f"Reason for the original bounded exclusion: {p['bounded_exclusion']}\n"]
(OUT / 'R1-new-proposals.md').write_text('\n'.join(proposal_md))

# R2: restore the entire frozen groups byte-for-byte.
full_evidence = (BASE / 'review-evidence.md').read_bytes()
starts = list(re.finditer(rb'(?m)^## (C\d{2}) \xe2\x80\x94 ', full_evidence))
sections = {}
for i, match in enumerate(starts):
    end = starts[i+1].start() if i+1 < len(starts) else len(full_evidence)
    sections[match.group(1).decode()] = (match.start(), end, full_evidence[match.start():end])
requested = ['C04', 'C06', 'C10', 'C17', 'C39', 'C43']
(OUT / 'frozen-groups').mkdir(exist_ok=True)
frozen_group_index = []
selected_sources = {}
def verify_source(path):
    if path in selected_sources:
        return (BASE / 'sources' / path).read_bytes()
    row = manifest[path]
    raw = (BASE / 'sources' / path).read_bytes()
    assert row['commit'] == PIN
    assert len(raw) == row['byte_length'] and sha(raw) == row['sha256'], path
    git_sha = hashlib.sha1(b'blob ' + str(len(raw)).encode() + b'\0' + raw).hexdigest()
    assert git_sha == row['git_blob_sha'], path
    selected_sources[path] = dict(row)
    return raw
for group_id in requested:
    start, end, raw_group = sections[group_id]
    original = next(g for g in frozen_index if g['id'] == group_id)
    for ex in original['excerpts']:
        raw_source = verify_source(ex['path'])
        raw = b''.join(raw_source.splitlines(keepends=True)[ex['line_start']-1:ex['line_end']])
        assert len(raw) == ex['byte_length'] and sha(raw) == ex['sha256']
        assert ex['commit'] == PIN and ex['git_blob_sha'] == manifest[ex['path']]['git_blob_sha']
        assert ex['source_sha256'] == sha(raw_source)
        assert raw in raw_group
    (OUT / 'frozen-groups' / f'{group_id}.md').write_bytes(raw_group)
    frozen_group_index.append({'id': group_id, 'original_evidence_byte_start': start,
        'original_evidence_byte_end_exclusive': end, 'group_bytes': len(raw_group),
        'group_sha256': sha(raw_group), 'frozen_index_entry': original})
dump('R2-frozen-group-index.json', frozen_group_index)
r2_intro = ('# R2 — Complete unchanged frozen groups\n\n'
    'The following six group sections are copied byte-for-byte from the frozen full evidence archive, '
    f'SHA-256 `{EXPECTED["review-evidence.md"]}`. Their source identities, spans, text and hashes are unchanged. '
    'Additional narrow spans in R3 cover the directly associated material claims where the original named group alone supplied only part of the cited mechanism.\n\n').encode()
(OUT / 'R2-frozen-groups.md').write_bytes(r2_intro + b''.join(sections[g][2] for g in requested))

# R3/R4: bounded newly selected raw spans from already captured source bytes.
# Each tuple is (repository path, inclusive line start, inclusive line end).
K = lambda short: 's1.runtime.' + short + '.l1'
specs = [
 ('E01', 'OpenAI facade default, explicit selectors and auth', [K('llm_providers')], [
  ('packages/llm/src/providers/openai.ts',1,6), ('packages/llm/src/providers/openai.ts',10,55)]),
 ('E02', 'Anthropic facade route and x-api-key resolution', [K('llm_providers')], [
  ('packages/llm/src/providers/anthropic.ts',1,31)]),
 ('E03', 'Google facade route and x-goog-api-key resolution', [K('llm_providers')], [
  ('packages/llm/src/providers/google.ts',1,31)]),
 ('E04', 'Bedrock facade endpoint, region and auth branch', [K('llm_providers')], [
  ('packages/llm/src/providers/amazon-bedrock.ts',1,7), ('packages/llm/src/providers/amazon-bedrock.ts',18,39),
  ('packages/llm/src/protocols/bedrock-converse.ts',672,672)]),
 ('E05', 'Azure required URL alternatives, query/auth and model default', [K('llm_providers')], [
  ('packages/llm/src/providers/azure.ts',1,46), ('packages/llm/src/providers/azure.ts',65,104),
  ('packages/llm/src/route/auth-options.ts',33,40)]),
 ('E06', 'Copilot model-name routing and explicit endpoint/auth configuration', [K('llm_providers')], [
  ('packages/llm/src/providers/github-copilot.ts',1,30), ('packages/llm/src/providers/github-copilot.ts',37,64)]),
 ('E07', 'Cloudflare derived endpoints and gateway/upstream auth branches', [K('llm_providers')], [
  ('packages/llm/src/providers/cloudflare.ts',1,11), ('packages/llm/src/providers/cloudflare.ts',36,73),
  ('packages/llm/src/providers/cloudflare.ts',93,116)]),
 ('E08', 'Generic compatible facade and actual shared Chat protocol', [K('llm_providers')], [
  ('packages/llm/src/providers/openai-compatible.ts',1,35),
  ('packages/llm/src/protocols/openai-compatible-chat.ts',1,6), ('packages/llm/src/protocols/openai-compatible-chat.ts',17,22)]),
 ('E09', 'OpenRouter body extension, route and auth configuration', [K('llm_providers')], [
  ('packages/llm/src/providers/openrouter.ts',1,14), ('packages/llm/src/providers/openrouter.ts',33,95)]),
 ('E10', 'xAI Responses default with Chat selector', [K('llm_providers')], [
  ('packages/llm/src/providers/xai.ts',1,50)]),
 ('E11', 'Shared bearer option/config fallback mechanism', [K('llm_providers')], [
  ('packages/llm/src/route/auth-options.ts',42,55)]),
 ('E12', 'Route/model/request precedence, recursive merge and compile use', [K('llm_turns')], [
  ('packages/llm/src/route/client.ts',167,180), ('packages/llm/src/route/client.ts',341,351),
  ('packages/llm/src/schema/options.ts',6,34), ('packages/llm/src/schema/options.ts',39,51),
  ('packages/llm/src/schema/options.ts',66,72), ('packages/llm/src/schema/options.ts',105,122),
  ('packages/llm/src/utils/record.ts',1,3)]),
 ('E13', 'Automatic cache route selection and preservation of existing hints', [K('llm_providers'),K('llm_turns')], [
  ('packages/llm/src/cache-policy.ts',18,24), ('packages/llm/src/cache-policy.ts',33,59),
  ('packages/llm/src/cache-policy.ts',67,83), ('packages/llm/src/cache-policy.ts',99,111)]),
 ('E14', 'HTTP final URL/body/header overlays precede auth', [K('llm_providers')], [
  ('packages/llm/src/route/transport/http.ts',73,106)]),
 ('E15', 'CodeMode constructed globals, scope-only lookup and explicit tool entry', [K('codemode')], [
  ('packages/codemode/src/interpreter/runtime.ts',617,661),
  ('packages/codemode/src/interpreter/runtime.ts',3267,3279),
  ('packages/codemode/src/interpreter/runtime.ts',3297,3308),
  ('packages/codemode/src/interpreter/runtime.ts',3340,3354),
  ('packages/codemode/src/interpreter/runtime.ts',3366,3376)]),
 ('E16', 'CodeMode property access refuses blocked names and opaque runtime references', [K('codemode')], [
  ('packages/codemode/src/interpreter/runtime.ts',550,573),
  ('packages/codemode/src/interpreter/runtime.ts',1921,1940),
  ('packages/codemode/src/stdlib/object.ts',6,21), ('packages/codemode/src/stdlib/math.ts',1,23),
  ('packages/codemode/src/interpreter/runtime.ts',2965,3001),
  ('packages/codemode/src/interpreter/runtime.ts',3067,3122)]),
 ('E17', 'CodeMode depth limit, blocked names and recursive plain-data enforcement', [K('codemode')], [
  ('packages/codemode/src/tool-runtime.ts',117,122), ('packages/codemode/src/tool-runtime.ts',152,183),
  ('packages/codemode/src/tool-runtime.ts',269,295)]),
 ('E18', 'Eight permits, eager supervised calls and pending-call drainage', [K('codemode')], [
  ('packages/codemode/src/stdlib/promise.ts',3,6),
  ('packages/codemode/src/interpreter/runtime.ts',70,70),
  ('packages/codemode/src/interpreter/runtime.ts',610,615),
  ('packages/codemode/src/interpreter/runtime.ts',690,749),
  ('packages/codemode/src/interpreter/runtime.ts',1895,1911)]),
 ('E19', 'OpenAPI request construction and validation precede auth; auth headers apply last', [K('codemode_openapi')], [
  ('packages/codemode/src/openapi/runtime.ts',11,30), ('packages/codemode/src/openapi/runtime.ts',54,114)]),
 ('E20', 'OpenAPI security alternatives and conflicting credential carriers', [K('codemode_openapi')], [
  ('packages/codemode/src/openapi/runtime.ts',116,198)]),
 ('E21', 'SQLite reserve/reuse, transaction state, interruption restoration and scope closure', [K('effect_sqlite')], [
  ('packages/effect-drizzle-sqlite/src/effect-sqlite/session.ts',115,218)]),
 ('E22', 'SQLite init journal-only branch and normal transactional statements/journal', [K('effect_sqlite')], [
  ('packages/effect-drizzle-sqlite/src/sqlite-core/effect/session.ts',426,490)]),
 ('E23', 'Recorder redaction configuration reaches request and response snapshots', [K('http_recorder')], [
  ('tooling/http-recorder/src/effect.ts',16,25), ('tooling/http-recorder/src/redactor.ts',8,9),
  ('tooling/http-recorder/src/redactor.ts',18,24), ('tooling/http-recorder/src/redactor.ts',32,53),
  ('tooling/http-recorder/src/redactor.ts',72,127),
  ('tooling/http-recorder/src/internal-effect.ts',100,116), ('tooling/http-recorder/src/internal-effect.ts',129,145)]),
 ('E24', 'Recorder known/configured names, URL/header redaction and bounded secret scan', [K('http_recorder')], [
  ('tooling/http-recorder/src/redaction.ts',3,98), ('tooling/http-recorder/src/redaction.ts',106,117)]),
 ('E25', 'Recorder lexical path, unsafe-cassette refusal and temp-write/rename sequence', [K('http_recorder')], [
  ('tooling/http-recorder/src/cassette.ts',41,50), ('tooling/http-recorder/src/cassette.ts',69,70),
  ('tooling/http-recorder/src/cassette.ts',104,123)]),
 ('E26', 'Recorder binary encoding and socket redaction boundary', [K('http_recorder')], [
  ('tooling/http-recorder/src/internal-effect.ts',55,62), ('tooling/http-recorder/src/socket.ts',34,49),
  ('tooling/http-recorder/src/socket.ts',291,298)]),
 ('E27', 'Associated C06 support: classifier, retry default, redacted diagnostics and post-read truncation', [K('llm_providers')], [
  ('packages/llm/src/route/executor.ts',35,39), ('packages/llm/src/route/executor.ts',48,74),
  ('packages/llm/src/route/executor.ts',150,164), ('packages/llm/src/route/executor.ts',188,222),
  ('packages/llm/src/route/executor.ts',225,305), ('packages/llm/src/route/executor.ts',370,378),
  ('packages/llm/src/schema/errors.ts',62,73), ('packages/llm/src/schema/errors.ts',181,183)]),
 ('E28', 'Associated C10 support: Responses protocol reuse and WebSocket message preparation', [K('llm_providers')], [
  ('packages/llm/src/protocols/openai-responses.ts',977,1013),
  ('packages/llm/src/route/transport/websocket.ts',226,239)]),
 ('E29', 'Associated C17 support: TUI lifecycle and preceding capability declarations', [K('plugin')], [
  ('packages/plugin/src/tui.ts',560,565), ('packages/plugin/src/tui.ts',618,646)]),
 ('E30', 'Associated C39 support: workspace exports, runtime/peer declarations and retained build files', [K('http_recorder')], [
  ('tooling/http-recorder/package.json',23,25), ('tooling/http-recorder/package.json',35,38),
  ('tooling/http-recorder/package.json',53,59), ('tooling/http-recorder/script/build.ts',5,20)]),
 ('D01', 'Model guide: Core routing limits, one host turn, outer orchestration, gates and billing refusal', [K('guides_intent'),K('llm_providers')], [
  ('docs/guides/models.md',9,16), ('docs/guides/models.md',24,24), ('docs/guides/models.md',31,37)]),
 ('D02', 'Claude-mode guide: provider entry, retained orchestration/tools and billing intent', [K('guides_intent')], [
  ('docs/guides/claude-mode.md',3,5), ('docs/guides/claude-mode.md',12,15),
  ('docs/guides/claude-mode.md',24,32), ('docs/guides/claude-mode.md',38,46)]),
 ('D03', 'Claude maintenance: host/tool ownership, governed loading and billing restrictions', [K('maintenance_intent')], [
  ('.orchestra/skills/claude-code-maintenance/SKILL.md',12,30),
  ('.orchestra/skills/claude-code-maintenance/SKILL.md',42,48),
  ('.orchestra/skills/claude-mode-maintenance/SKILL.md',25,40),
  ('.orchestra/skills/claude-mode-maintenance/SKILL.md',56,64)]),
 ('D04', 'Config guide and generated schema: both unresolved documentary/schema sides', [K('guides_intent'),K('maintenance_intent')], [
  ('docs/guides/config-errors.md',9,20), ('schema/config.json',1,4),
  ('schema/config.json',1054,1064), ('schema/config.json',1234,1246)]),
]
(OUT / 'excerpts').mkdir(exist_ok=True)
new_index = []
group_texts = []
for group_id, title, keys, spans in specs:
    group = (f'## {group_id} — {title}\n\nArtifacts: {", ".join(keys)}.\n\n').encode()
    index_row = {'id': group_id, 'title': title, 'artifact_keys': keys, 'group_file': f'excerpts/{group_id}.md', 'excerpts': []}
    if group_id.startswith('D'):
        group += b'Documentary/schema evidence only; no host execution or runtime acceptance follows.\n\n'
    for path, lo, hi in spans:
        source = verify_source(path)
        lines = source.splitlines(keepends=True)
        assert 1 <= lo <= hi <= len(lines), (path, lo, hi, len(lines))
        raw = b''.join(lines[lo-1:hi])
        m = manifest[path]
        meta = (f'Source `{path}`; commit `{PIN}`; Git blob `{m["git_blob_sha"]}`; '
                f'full-source SHA-256 `{m["sha256"]}`.\n\n'
                f'Lines {lo}–{hi} inclusive; {len(raw)} excerpt bytes; excerpt SHA-256 `{sha(raw)}`.\n\n~~~~text\n').encode()
        group += meta
        offset = len(group)
        group += raw
        group += (b'' if raw.endswith(b'\n') else b'\n') + b'~~~~\n\n'
        index_row['excerpts'].append({'path': path, 'commit': PIN, 'git_blob_sha': m['git_blob_sha'],
            'source_sha256': m['sha256'], 'line_start': lo, 'line_end': hi,
            'byte_length': len(raw), 'sha256': sha(raw), 'group_data_byte_start': offset,
            'frozen_coverage_depth': entry_by_path.get(path, {}).get('depth', 'additional_root_instruction'),
            'supplement_read_status': 'selected_exact_excerpt_inspected_and_verified'})
    (OUT / index_row['group_file']).write_bytes(group)
    index_row['group_bytes'] = len(group)
    index_row['group_sha256'] = sha(group)
    new_index.append(index_row)
    group_texts.append(group)
dump('R3-R4-excerpt-index.json', new_index)
dump('source-bindings.json', {'source_revision': PIN, 'source_manifest_sha256': EXPECTED['source-manifest.json'],
                            'sources': list(selected_sources.values())})
dump('frozen-input-bindings.json', inputs)

mapping_rows = []
for a in artifacts['artifacts']:
    additional = [g['id'] for g in new_index if a['key'] in g['artifact_keys']]
    restored = [g['id'] for g in frozen_group_index if a['key'] in g['frozen_index_entry']['artifact_keys']]
    mapping_rows.append([a['key'], artifact_ids[a['key']] + ' / all frozen gaps and coverage', ', '.join(restored) or '—', ', '.join(additional) or 'R1 metadata dispositions; original C12–C14/C36 remain in the original dossier'])
map_md = '# Supplement artifact-to-evidence map\n\n' + table(['Artifact key', 'R1 projection', 'Restored frozen groups', 'New source-span groups'], mapping_rows)
(OUT / 'artifact-evidence-map.md').write_text(map_md)
raw_r3 = ('# R3 — Additional decisive implementation spans\n\n'
          'These are newly selected contiguous excerpts from already captured files at the original source pin. '
          'No product code or test was executed. E15 line 628 constructs the semaphore used by E18; E17 supplies the blocked-property predicate used by E16. '
          'The original bounded claims remain the scope: source mechanisms do not establish exhaustive security, protocol, query or runtime conformance.\n\n').encode()
raw_r3 += b''.join(text for spec, text in zip(specs, group_texts) if spec[0].startswith('E'))
(OUT / 'R3-implementation-spans.md').write_bytes(raw_r3)
raw_r4 = ('# R4 — Documentary and generated-schema spans\n\n'
          'The guides and maintenance skill text below are source data. They support documentary attribution only. '
          'D04 preserves the guide’s ignored-key statement and the generated schema’s root reference/object restriction without resolving the decoder/publisher relationship.\n\n').encode()
raw_r4 += b''.join(text for spec, text in zip(specs, group_texts) if spec[0].startswith('D'))
(OUT / 'R4-documentary-spans.md').write_bytes(raw_r4)

intro = f'''# S1-L1-C evidence supplement v1

Principal review copy; not yet sent to judges. Supplement for batch `S1-L1-C-v1`, scope `orchestra.s1`, L1 only.

Original frozen package SHA-256: `{PACKAGE}`. Original dossier SHA-256: `{DOSSIER}` (78,163 UTF-8 bytes). Repository source pin: `{PIN}`. Protocol pin: `{PROTOCOL}`.

This is an evidence supplement, not a body revision or a semantic verdict. Original bodies, artifact validity/need fields, coverage and full evidence remain unchanged. R1 projects frozen values and visibly separates new proposed need/blocker typing. R2 restores six entire frozen groups unchanged. R3/R4 provide actual source excerpts with identity and line/hash bindings. Imported source instructions and script commands are DATA, not authority to execute them.

The original requests were `REQUEST_EVIDENCE` from both judges. This packet supplies evidence for their existing questions; it does not change their bar, establish PASS or authorize a layer release.

'''.encode()
packet = intro + (OUT/'artifact-evidence-map.md').read_bytes() + b'\n'
for name in ['R1-frozen-projection.md','R1-new-proposals.md','R2-frozen-groups.md','R3-implementation-spans.md','R4-documentary-spans.md']:
    packet += (OUT/name).read_bytes() + b'\n'
(OUT / 'supplement.md').write_bytes(packet)

# Artifact consistency checks only. No product tests or imports.
for row in new_index:
    group = (OUT / row['group_file']).read_bytes()
    assert sha(group) == row['group_sha256']
    assert group in packet
    for ex in row['excerpts']:
        raw_source = verify_source(ex['path'])
        expected = b''.join(raw_source.splitlines(keepends=True)[ex['line_start']-1:ex['line_end']])
        actual = group[ex['group_data_byte_start']:ex['group_data_byte_start']+ex['byte_length']]
        assert actual == expected and sha(actual) == ex['sha256']
for group_id in requested:
    assert (OUT / 'frozen-groups' / f'{group_id}.md').read_bytes() == sections[group_id][2]
    assert sections[group_id][2] in packet
for original, selected in zip(artifacts['artifacts'], projection['artifacts']):
    assert all(original[k] == selected[k] for k in artifact_fields)
assert {e['path'] for e in metadata} == {e['path'] for e in entries if not e['captured']}
for name, expected in EXPECTED.items():
    assert sha((BASE/name).read_bytes()) == expected
    assert sha((ROOT/'output/producers/c'/name).read_bytes()) == expected
assert json.loads((BASE/'sources/schema/config.json').read_text())['$defs']['Config.Info']['additionalProperties'] is False
report = {
 'unit': 'S1-L1-C', 'supplement': 'c-l1-evidence-v1', 'source_revision': PIN,
 'original_package_sha256': PACKAGE, 'original_dossier_sha256': DOSSIER,
 'artifact_count': 10, 'coverage_entries': 323, 'metadata_only_entries': 39,
 'coverage_groups': len(groups), 'original_justification_values': len(reasons),
 'original_gap_strings_projected': len(gap_rows), 'new_classification_proposals': len(need_proposals),
 'restored_frozen_groups': requested,
 'restored_frozen_excerpts': sum(len(x['frozen_index_entry']['excerpts']) for x in frozen_group_index),
 'additional_excerpt_groups': len(new_index),
 'additional_source_excerpts': sum(len(x['excerpts']) for x in new_index),
 'captured_source_files_used': len(selected_sources),
 'source_sha256_and_git_blob_checks': 'all used captured files match original manifest',
 'excerpt_fidelity_checks': 'all selected spans match original captured bytes, line ranges, lengths and SHA-256',
 'frozen_group_checks': 'all six complete group sections are byte-identical to the full frozen evidence archive',
 'projection_checks': 'all selected frozen values and 323 grouped memberships match; all 39 metadata-only entries retained',
 'original_body_checks': 'all ten body hashes/lengths match original artifacts and frozen output copies',
 'frozen_input_checks': 'all bound original producer files and matching frozen output files remain unchanged',
 'supplement_md_bytes': len(packet), 'supplement_md_sha256': sha(packet),
 'product_execution': 'none', 'judge_dispatch': 'none', 'semantic_verdict': 'not asserted',
}
dump('verification.json', report)
dump('findings-and-proposed-body-fixes.json', {
 'scope': 'Only requested evidence supplementation; not a judge decision or full implementation audit.',
 'established_body_contradictions_in_requested_spans': [], 'proposed_body_fixes': [],
 'retained_unresolved_issue': 'The config guide/schema relationship remains unresolved and is shown on both sides; no runtime defect or resolution is asserted.',
 'new_typing_notice': 'The frozen packet contains gap strings rather than a separate typed future-need ledger. Proposed typing is explicitly new in R1-new-need-classification-proposals.json.',
})
print(json.dumps(report, indent=2))
