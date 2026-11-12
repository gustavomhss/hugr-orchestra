"""Build app/session L2 provenance and run artifact-only mechanical checks.

Reads only the assigned producer captures, named dispatch and accepted L1 input.
Writes only this file's parent. Does not run or import product code.
"""

from pathlib import Path
import hashlib
import json
import re

ROOT = Path('/workspace/scratch/7b5d6430f420/genesis-s2')
OUT = Path(__file__).resolve().parent
assert OUT == ROOT / 'later-producers/app-session/l2'
PRODUCER = ROOT / 'producers/app-session'
REV = '1cde2ff7a71bcf7aecb5d030917b577165135d38'
MANIFEST_HASH = '8bb7bb5298f42eefe3fb34246a8303ad974947ef54ac99f1390ed40e276644c8'
L1_HASH = '67a2787d0813738c8930a23253c9d185933cc228e997d530056cd4fa98b0b16e'
DISPATCH_HASH = '0cd465cb782425a419f6c52e7056e6d775c28aaae7e7b45e4c94ae7d1f785e60'


def sha(data):
    return hashlib.sha256(data).hexdigest()


def write_json(name, value):
    (OUT / name).write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


dispatch_path = ROOT / 'deliverable/requests/l2-app-session-dispatch.md'
manifest_path = ROOT / 'deliverable/accepted/l1.json'
l1_path = ROOT / 'deliverable/layers/l1/app-session/l1.md'
assert sha(dispatch_path.read_bytes()) == DISPATCH_HASH
assert sha(manifest_path.read_bytes()) == MANIFEST_HASH
assert sha(l1_path.read_bytes()) == L1_HASH
manifest = json.loads(manifest_path.read_text())
assert manifest['source_revision'] == REV
assert manifest['status'] == 'SEMANTIC_LAYER_ACCEPTED'
accepted = next(x for x in manifest['artifacts'] if x['key'] == 's2.l1.app-session')
assert accepted['body_sha256'] == L1_HASH
assert accepted['body_path'] == 'layers/l1/app-session/l1.md'
# Review-response references in the acceptance manifest are intentionally unused.
source_index_path = PRODUCER / 'sources.json'
source_index = json.loads(source_index_path.read_text())
records = {x['path']: x for x in source_index['records']}
coverage_path = PRODUCER / 'coverage.json'
coverage = json.loads(coverage_path.read_text())

# Actual direct reads performed by this author. Whole-file means content was read,
# not that all branches or behavior were audited.
used = [
    ('AGENTS.md', None, 'Root dependency, generation, repository-only maintenance, PTY and verification instructions.'),
    ('packages/app-shell/AGENTS.md', None, 'Priority, conditional benchmark and localization instructions.'),
    ('packages/session-ui/AGENTS.md', None, 'Session UI localization and English-preservation instructions.'),
    ('packages/schema/AGENTS.md', None, 'Browser-safe serializable contract ownership instruction.'),
    ('.orchestra/skills/agent-avatars-maintenance/SKILL.md', None, 'Avatar ownership instructions; generic guidance kept separate from inherited measured dimensions.'),
    ('.orchestra/skills/agent-screen-maintenance/SKILL.md', None, 'Stable seat IDs, localization, roster/detail ownership and coordinated contract instructions.'),
    ('.orchestra/skills/hugr-composer-maintenance/SKILL.md', None, 'Attributed external Composer maintenance intent; installation commands not executed.'),
    ('.orchestra/skills/onboarding-usage/SKILL.md', None, 'Onboarding workflow and display terminology instructions; no walkthrough executed.'),
    ('.orchestra/skills/settings-usage/SKILL.md', None, 'Settings, trust and MCP usage instructions; no trust/configuration mutation performed.'),
    ('packages/app-shell/src/app.tsx', [[65,175],[392,443],[526,599]], 'Provider composition, target/draft route identity and shell ownership.'),
    ('packages/app-shell/src/context/global.tsx', [[68,114]], 'Disposable credential identity versus persistent connection identity.'),
    ('packages/app-shell/src/pages/session/session-ownership.ts', None, 'Generation-based owner capture across departure and return.'),
    ('packages/app-shell/src/components/prompt-input/submission-admission.ts', None, 'Admission WeakMap lifetime and busy handoff.'),
    ('packages/app-shell/src/components/prompt-input/submit.ts', [[1,73],[280,476],[480,585],[600,708]], 'Captured submit ownership, policy rechecks, optimistic cleanup and ambiguous admission retry.'),
    ('packages/app-shell/src/components/settings-v2/general-controllers.ts', [[1,100]], 'Local optimistic shell setting and rollback on failure.'),
    ('packages/core/src/session/input.ts', [[48,94],[291,316],[348,390]], 'Durable admission return, exact-retry versus projection equivalence, promotion boundary.'),
    ('packages/app-shell/src/context/session-recovery.ts', [[32,97]], 'Generation/policy read fences and local receipt distinction.'),
    ('packages/app-shell/src/context/server-sdk.tsx', [[86,140],[227,340]], 'Adjacent-delta coalescing and scoped stream lifetime.'),
    ('packages/app-shell/src/orchestra/chapters/skills-data.ts', None, 'Catalog decoding, visibility, lexical source/access classification and error extraction.'),
    ('packages/app-shell/src/orchestra/chapters/skills.tsx', [[29,137],[208,240]], 'Scoped warm reads, unavailable/error distinction and save/remove orchestration.'),
    ('packages/app-shell/src/orchestra/chapters/skills-dialog.tsx', [[1,57],[134,175]], 'Path/mtime save mapping, busy/disposed guards and editability controls.'),
    ('packages/protocol/src/groups/skill.ts', None, 'Pinned skill API declarations and attributed write contract.'),
    ('packages/server/src/handlers/skill.ts', None, 'Location-scoped delegation and conflict/invalid-request error mapping.'),
    ('packages/server/src/handlers/event.ts', None, 'Bounded subscription before connected, heartbeat and absence of SSE replay IDs.'),
    ('packages/session-ui/src/transcript-model.ts', None, 'Renderer-view-model boundary; no wire-contract inference.'),
    ('packages/session-ui/src/components/markdown-cache.tsx', None, 'Bounded sanitized Markdown cache and unsupported-sanitizer behavior.'),
    ('packages/session-ui/src/components/markdown-worker-queue.ts', None, 'Latest-per-key serial worker queue and disposal ordering.'),
    ('packages/app-shell/src/context/permission-auto-respond.ts', None, 'Ancestry/cycle handling, false override and Relay hook exclusion.'),
    ('packages/app-shell/src/orchestra/chapter-route.tsx', [[1,120]], 'Registered chapter reachability and selected owner lifetime.'),
    ('packages/app-shell/src/components/terminal.tsx', [[440,573]], 'Ticket-before-WebSocket flow, reconnect/gone and UTF-16 cursor observation.'),
    ('packages/app-shell/src/utils/pty-ticket.ts', None, 'App PTY token request/response boundary, without token-security guarantee.'),
]

source_rows = []
for path, ranges, purpose in used:
    record = records[path]
    captured = PRODUCER / record['local_capture_file']
    data = captured.read_bytes()
    assert record['commit'] == REV, path
    assert sha(data) == record['sha256'], path
    git_blob_sha = hashlib.sha1(b'blob ' + str(len(data)).encode() + b'\0' + data).hexdigest()
    assert git_blob_sha == record['git_blob_sha'], path
    line_count = len(data.decode('utf-8').splitlines())
    if ranges:
        assert all(1 <= lo <= hi <= line_count for lo, hi in ranges), path
    source_rows.append({
        'commit': record['commit'], 'path': path,
        'git_blob_sha': record['git_blob_sha'], 'sha256': record['sha256'],
        'byte_length': len(data),
        'local_capture_file': str(captured.relative_to(ROOT)),
        'original_connector_response_file': 'producers/app-session/' + record['connector_response_file'],
        'read_scope': {'kind': 'whole-file content read' if ranges is None else 'selected text spans', 'line_ranges': ranges or [[1,line_count]], 'limit': 'A recorded read does not assert exhaustive branch coverage or execution.'},
        'used_for': purpose,
    })
assert len(source_rows) == len({x['path'] for x in source_rows}) == 31
write_json('sources.json', {
    'source_revision': REV,
    'artifact_key': 's2.l2.app-session',
    'source_capture_index': {'path': 'producers/app-session/sources.json', 'sha256': sha(source_index_path.read_bytes())},
    'sources': source_rows,
    'limit': 'Only the 31 source captures directly used in this L2 authoring are listed. Inherited factual evidence is bound through the accepted L1 build dependency. No new remote capture was made.',
})

dependencies = {
    'build': ['s2.l1.app-session'],
    'navigation': ['s2.l2.desktop-web','s2.l2.design-tui'],
    'rationale': {
        's2.l1.app-session': {'kind': 'build', 'reason': 'Supplies accepted app/session observations, source limits, discrepancies and the complete meaningful 59-family accounting. This L2 synthesizes that accepted body and corroborates selected claims in pinned raw captures.'},
        's2.l2.desktop-web': {'kind': 'navigation', 'reason': 'Optional consultation for native host lifecycle, Dock/Linux/WSL, Live and packaging beyond the app-facing contracts described here. The destination may be pending and supplies no factual premise to this body.'},
        's2.l2.design-tui': {'kind': 'navigation', 'reason': 'Optional consultation for shared browser design/accessibility/themes and TUI behavior beyond session-ui seams. The destination may be pending and supplies no factual premise to this body.'},
    },
    'consumed_layer_manifests': [{'path': 'accepted/l1.json','sha256': MANIFEST_HASH}],
    'accepted_predecessors': [{'key':'s2.l1.app-session','body_path':'layers/l1/app-session/l1.md','sha256':L1_HASH,'byte_length':len(l1_path.read_bytes())}],
    'cross_unit_factual_dependency_note': 'No other unit body was consumed. Core, Protocol, Server and Schema boundary facts come from the accepted app/session body and its exact captured boundary sources, not from an unaccepted L2 destination.',
}
write_json('dependencies.json', dependencies)
assert set(dependencies['build']).issubset({item['key'] for item in manifest['artifacts']})
assert not set(dependencies['build']) & set(dependencies['navigation'])
assert set(dependencies['rationale']) == set(dependencies['build'] + dependencies['navigation'])

H = {
 'orientation':'Orientation and evidence status',
 'composition':'Composition, identity and asynchronous ownership',
 'admission':'Durable admission, optimistic state and draft storage',
 'transport':'Transport, liveness and canonical recovery',
 'requests':'Permission requests and terminal boundaries',
 'rendering':'Shared rendering, files and evidence interpretation',
 'navigation':'Navigation, settings and feature controllers',
 'skills':'Skills catalog, content and editing ownership',
 'host':'Host capabilities and auxiliary lifetimes',
 'visual':'Visual resources and prescribed maintenance',
 'verification':'Verification limits and ownership use',
}
L = {
 'scope':'Scope, identity and depth',
 'authority':'Authority, composition and identity',
 'transport':'Transport, stream health and canonical recovery',
 'prompt':'Prompt admission and draft ownership',
 'requests':'Requests, terminals and auxiliary lifetimes',
 'rendering':'Rendering, evidence and reusable utility contracts',
 'navigation':'Navigation, settings and feature-family disposition',
 'skills':'Skills catalog, editing and ownership',
 'assets':'Assets, localization and verification evidence',
}
groups = [
 (['authority','history','skills','guides'], ['visual'], ['authority']),
 (['bootstrap','session-route','entry-recovery'], ['composition'], ['authority']),
 (['transport','sync'], ['transport'], ['transport']),
 (['prompt','persistence','session-ui-editor'], ['admission'], ['prompt']),
 (['requests','terminal'], ['requests'], ['requests']),
 (['timeline','files','cockpit','session-ui-contract','session-ui-markdown','session-ui-review','controls','dom-input','feedback','pull-request'], ['rendering'], ['rendering']),
 (['identity-utils'], ['composition'], ['rendering']),
 (['dock','live','wsl','janitor','diagnostics'], ['host'], ['requests']),
 (['home','commands','settings','agents','actions','relay','atlas','integrations','lean','board','guardrails','schedule','rag','plugins','workspace-tools'], ['navigation'], ['navigation']),
 (['mcp-skills'], ['navigation','skills'], ['navigation','skills']),
 (['palette-source','palette-generated','styles','localization','avatars','wallpaper-assets','brand-assets','zen-assets'], ['visual'], ['assets']),
 (['evidence-fixtures'], ['rendering','verification'], ['rendering','assets']),
 (['browser-tests','e2e-tests','test-support'], ['verification'], ['assets']),
 (['benchmarks'], ['visual','verification'], ['authority','assets']),
]
mapping = {}
for ids, body_keys, l1_keys in groups:
    for family_id in ids:
        assert family_id not in mapping, family_id
        mapping[family_id] = ([H[x] for x in body_keys], [L[x] for x in l1_keys])
assert set(mapping) == {x['id'] for x in coverage['families']}
assert len(mapping) == 59
family_rows = []
for family in coverage['families']:
    body_sections, predecessor_sections = mapping[family['id']]
    family_rows.append({
        'family_id': family['id'], 'family_title': family['title'],
        'inherited_path_count': family['path_count'],
        'inherited_evidence_depth_counts': family['evidence_depth_counts'],
        'body_sections': body_sections,
        'accepted_predecessor': 's2.l1.app-session',
        'accepted_predecessor_sections': predecessor_sections,
        'preserved_family_limit': family['limits'],
    })
assert sum(x['inherited_path_count'] for x in family_rows) == 1887
write_json('family-map.json', {
    'artifact_key':'s2.l2.app-session',
    'inherited_coverage': {'path':'producers/app-session/coverage.json','sha256':sha(coverage_path.read_bytes()),'accepted_body_sha256':L1_HASH},
    'meaning':'A mapping of accepted family dispositions to L2 explanations; no individual-file depth is upgraded.',
    'family_count':len(family_rows),'assigned_path_count':1887,'families':family_rows,
})

evidence = [
 ('N1','Newly explicit static observation: optimistic cleanup is separate from durable admission outcome',
  H['admission'], [L['prompt']],
  'The new detail is the visible removeOptimisticMessage/restoreInput/settleEmptySession(true) failure sequence. Session/request retention, policy checks and draft handoff are inherited from accepted L1. The inference is that local visual cleanup cannot settle an ambiguous server outcome; no universal rollback guarantee is claimed.',
  [('packages/app-shell/src/components/prompt-input/submit.ts',442,466),('packages/app-shell/src/components/prompt-input/submit.ts',660,672)]),
 ('N2','Newly explicit instruction: Schema contract ownership',
  H['visual'], [L['authority']],
  'This is an instruction from captured package authority, not a claim that an architectural checker ran or that every module complies.',
  [('packages/schema/AGENTS.md',1,10)]),
 ('N3','Newly explicit instruction: repository maintenance material and runtime skills have different destinations',
  H['visual'], [L['authority']],
  'The repository-only classification is attributed to root AGENTS. The accepted L1 supports the existence and intended use of the five maintainer/onboarding skills and six guides; their installation statements remain unverified.',
  [('AGENTS.md',146,154)]),
 ('N4','Newly explicit instruction and known limit: agent terminal safety path',
  H['requests'], [L['requests']],
  'L1 already identifies the separate Core safety boundary. This L2 spells out the root instruction about sandbox wrapping, sanitized model text, nonce-bound shell marks and the recorded slow-reader limit. These are prescribed/recorded boundaries, not executed security verification.',
  [('AGENTS.md',182,192)]),
 ('C1','Corroboration: identity values and owner generations serve different lifetimes',
  H['composition'], [L['authority']],
  'The explanatory three-identity table and maintenance implication synthesize accepted observations. The excerpts corroborate credential disposal and irreversible generation expiry; they add no claim of exhaustive asynchronous correctness.',
  [('packages/app-shell/src/context/global.tsx',68,98),('packages/app-shell/src/pages/session/session-ownership.ts',3,33)]),
 ('C2','Corroboration: exact retry does not equal projection equivalence',
  H['admission'], [L['prompt']],
  'The comparison distinction is already explicit in accepted L1. Prompt context is not added to the retry identity by this explanation.',
  [('packages/core/src/session/input.ts',291,316)]),
 ('C3','Corroboration: bounded live SSE does not supply durable replay',
  H['transport'], [L['transport']],
  'The reconnect-and-reconcile interpretation follows the no-ID frame and bounded listener/heartbeat observations already accepted. It makes no losslessness or real overload result claim.',
  [('packages/server/src/handlers/event.ts',13,20),('packages/server/src/handlers/event.ts',25,43)]),
 ('C4','Corroboration: canonical read receipts are client-local ordering evidence',
  H['transport'], [L['transport']],
  'Generation rejection, policy-repeat behavior and snapshot provenance limits support the recovery explanation. This is not a backend revision or post-crash provider continuation proof.',
  [('packages/app-shell/src/context/session-recovery.ts',45,64)]),
 ('C5','Corroboration: Skills decoder, access and write lifecycle must remain separate',
  H['skills'], [L['skills']],
  'All Skills facts in the body are inherited from the accepted L1r3 Skills section. These excerpts preserve the whole-array decoder, lexical governed-root precedence, path/mtime mapping and the absence of a page signal on write calls. No filesystem implementation is inferred.',
  [('packages/app-shell/src/orchestra/chapters/skills-data.ts',11,28),('packages/app-shell/src/orchestra/chapters/skills-data.ts',54,56),('packages/app-shell/src/orchestra/chapters/skills-data.ts',69,81),('packages/app-shell/src/orchestra/chapters/skills-dialog.tsx',43,57),('packages/app-shell/src/orchestra/chapters/skills.tsx',100,125)]),
 ('C6','Corroboration: rendering and permission policy retain narrow contracts',
  H['rendering'], [L['rendering'],L['requests']],
  'The renderer model declaration and sanitizer fallback support bounded rendering ownership. The Relay hook exclusion supports the separate request section. These are not broad security/accessibility assurances.',
  [('packages/session-ui/src/transcript-model.ts',1,6),('packages/session-ui/src/components/markdown-cache.tsx',35,38),('packages/app-shell/src/context/permission-auto-respond.ts',59,69)]),
 ('C7','Corroboration: settings optimism does not prove server persistence',
  H['navigation'], [L['navigation']],
  'The accepted settings observation is explained as reversible client presentation; the source restores the previous shell value when updateConfig rejects.',
  [('packages/app-shell/src/components/settings-v2/general-controllers.ts',75,88)]),
]

parts = [
 '# Decisive evidence — s2.l2.app-session',
 '## Bound inputs and claim status',
 f'All source excerpts below are exact UTF-8 spans from captured commit `{REV}`. `sources.json` binds each directly used file to its actual Git blob SHA and SHA256. The sole factual build predecessor is accepted `s2.l1.app-session`, body SHA256 `{L1_HASH}`, under manifest `accepted/l1.json` SHA256 `{MANIFEST_HASH}`.',
 'L2 contributes an explanation of ownership and maintenance consequences. Most facts are inherited from the nine accepted L1 sections. N1–N4 identify the few details newly made explicit here and give bounded primary support. C1–C7 corroborate inherited claims. Maintenance inferences are recommendations derived from the named mechanisms, not invented feature intent. No product code, tests, benchmarks, native operations, provider calls or filesystem skill writes were executed.',
 '## Synthesis and bounded primary support',
]
excerpt_rows = []
for evidence_id,title,body_heading,l1_sections,note,spans in evidence:
    parts += [f'### {evidence_id} — {title}', f'L2 section: **{body_heading}**. Accepted support: ' + '; '.join(f'`s2.l1.app-session` §{x}' for x in l1_sections) + '.', note]
    for path,start,end in spans:
        record = records[path]
        assert path in {x['path'] for x in source_rows}
        data = (PRODUCER / record['local_capture_file']).read_bytes()
        lines = data.decode('utf-8').splitlines(keepends=True)
        assert 1 <= start <= end <= len(lines)
        excerpt = ''.join(lines[start-1:end])
        excerpt_hash = sha(excerpt.encode('utf-8'))
        parts += [f'`{path}:{start}–{end}` · file SHA256 `{record["sha256"]}` · excerpt SHA256 `{excerpt_hash}`', '```text\n' + excerpt + ('' if excerpt.endswith('\n') else '\n') + '```']
        excerpt_rows.append({'id':evidence_id,'path':path,'start_line':start,'end_line':end,'sha256':excerpt_hash})

parts += [
 '## Complete meaningful-family mapping',
 f'The accepted coverage input is `producers/app-session/coverage.json`, SHA256 `{sha(coverage_path.read_bytes())}`. The following 59 rows retain its 1,887-path partition. The machine-readable `family-map.json` also preserves each family\'s original depth counts and limitation. A family mapped here is not a claim that every member was read for L2.',
]
family_table = [
 '| Family ID | Paths | L2 explanation section | Accepted L1 support |',
 '|---|---:|---|---|',
]
for row in family_rows:
    family_table.append('| `' + row['family_id'] + '` | ' + str(row['inherited_path_count']) + ' | ' + '; '.join(row['body_sections']) + ' | ' + '; '.join('§'+x for x in row['accepted_predecessor_sections']) + ' |')
parts.append('\n'.join(family_table))
parts += [
 '## Captured maintenance guidance consulted',
 'Root and app-shell/session-ui/Schema AGENTS were read. The five captured `.orchestra/skills/.../SKILL.md` files listed in `sources.json` were read for scope and maintenance obligations: agent-screen, agent-avatars, HuGR Composer, onboarding and settings. They were treated as attributed instructions or intended workflows. Their installation, account, trust and native-operation instructions were not performed. Root/package dependency and generation rules, session/timeline benchmark obligations and immutable English localization rules remain prescribed rather than executed.',
 '## Preserved limits and discrepancies',
 'The app README/browserSafe policy distinction and separate Client prohibition; readiness PID-or-healthy versus health healthy-only predicates; admission/retry versus projection equivalence; local read receipt versus durable sequence; lexical skill access versus filesystem authority; unsignalled writes versus suppressed late UI; retained legacy CI source versus actual Actions routing; unregistered Guardrails; generic avatar sizing versus the captured sample; and generated palette outputs versus authored CSS remain explicit. The accepted L1 failed-lookup/capture ledger and 30 metadata-only leaves are not reclassified by this L2.',
 'Native host/scanner behavior, PTY slow-reader resolution, provider/OAuth/storage outcomes, Core scheduling, RAG retrieval quality, Board mutations, SkillV2/SkillFile filesystem enforcement, exhaustive specialized renderers and per-locale/per-asset provenance remain unestablished. Browser suites, E2E mocks, stories, fixture logs and benchmark guidance are evidence of intended checks, not passing executions. No pending navigation destination is used as proof.',
]
(OUT / 'decisive-evidence.md').write_text('\n\n'.join(parts) + '\n', encoding='utf-8')
written_excerpts = re.findall(r'```text\n(.*?)```', (OUT / 'decisive-evidence.md').read_text(), re.S)
assert len(written_excerpts) == len(excerpt_rows)
assert all(sha(text.encode('utf-8')) == row['sha256'] for text,row in zip(written_excerpts,excerpt_rows))

body_bytes = (OUT / 'body.md').read_bytes()
body = body_bytes.decode('utf-8')
heading_matches = list(re.finditer(r'^## (.+)$', body, re.M))
headings = [x.group(1) for x in heading_matches]
assert headings == list(H.values())
section_metrics = []
for index, match in enumerate(heading_matches):
    end = heading_matches[index+1].start() if index + 1 < len(heading_matches) else len(body)
    section = body[match.start():end]
    assert 's2.l1.app-session' in section or '`packages/' in section or '`AGENTS.md`' in section
    section_metrics.append({'heading':match.group(1),'bytes':len(section.encode('utf-8')),'whitespace_words':len(section.split())})
assert max(x['bytes'] for x in section_metrics) < 16000
assert len(body_bytes) < 64000
assert all(all(section in headings for section in x['body_sections']) for x in family_rows)
l1_headings = re.findall(r'^## (.+)$', l1_path.read_text(), re.M)
assert all(all(section in l1_headings for section in x['accepted_predecessor_sections']) for x in family_rows)
predecessor_sections = sorted({section for row in family_rows for section in row['accepted_predecessor_sections']} | {L['scope']})

checks = {
    'artifact_key':'s2.l2.app-session','check_kind':'artifact-only mechanical author checks; no semantic verdict',
    'dispatch_sha256_verified':DISPATCH_HASH,'accepted_manifest_sha256_verified':MANIFEST_HASH,'accepted_predecessor_sha256_verified':L1_HASH,
    'body':{'sha256':sha(body_bytes),'bytes':len(body_bytes),'whitespace_words':len(body.split()),'h2_count':len(headings),'h2_sections':section_metrics,'below_deep_query_64000_bytes':len(body_bytes)<64000,'every_h2_below_routine_query_16000_bytes':all(x['bytes']<16000 for x in section_metrics)},
    'direct_source_count':len(source_rows),'source_sha256_matches':len(source_rows),'source_git_blob_sha_matches':len(source_rows),'source_duplicate_paths':0,
    'build_dependency_count':len(dependencies['build']),'navigation_dependency_count':len(dependencies['navigation']),'accepted_predecessor_section_count':len(predecessor_sections),'accepted_predecessor_sections':predecessor_sections,
    'mapped_family_count':len(family_rows),'mapped_family_path_count':sum(x['inherited_path_count'] for x in family_rows),'unmapped_family_ids':[],
    'evidence_group_count':len(evidence),'newly_explicit_evidence_groups':4,'corroboration_groups':7,'exact_excerpt_count':len(excerpt_rows),'exact_excerpts':excerpt_rows,
    'unexecuted':['product tests','benchmarks','typechecks','builds','Client/palette generation','browser/native interactions','provider/model calls','remote writes','CI'],
    'errors':[],
}
write_json('author-checks.json', checks)

response = f'''# Producer response — s2.l2.app-session

## Actual output

Produced the complete English `body.md` and its actual `sources.json`, `dependencies.json`, `decisive-evidence.md` and this response in the exclusive `later-producers/app-session/l2/` area. Added `family-map.json`, `author-checks.json`, `hashes.json` and the artifact-only `author_artifacts.py` for concrete accounting and reproducible mechanical checks.

Body SHA256: `{sha(body_bytes)}`. Exact UTF-8 length: **{len(body_bytes)} bytes**. Whitespace word count: **{len(body.split())}**. Stable level-two sections: **{len(headings)}**. Each section is below 16,000 bytes; the complete body is below 64,000 bytes. The body exceeds the preferred 1,200–2,200-word range to preserve useful explanations across all 59 families, the accepted Skills detail and the material distinctions/limits; no per-file inventory was copied into it.

## Inputs actually consumed

- Frozen actual dispatch: `deliverable/requests/l2-app-session-dispatch.md`, SHA256 `{DISPATCH_HASH}`.
- Exact accepted manifest: `deliverable/accepted/l1.json`, SHA256 `{MANIFEST_HASH}`. Only acceptance/artifact identity was used; review-response references were not followed.
- Accepted predecessor: `s2.l1.app-session`, `deliverable/layers/l1/app-session/l1.md`, SHA256 `{L1_HASH}`, {len(l1_path.read_bytes())} bytes.
- Original capture index: `producers/app-session/sources.json`, SHA256 `{sha(source_index_path.read_bytes())}`.
- Complete family ledger: `producers/app-session/coverage.json`, SHA256 `{sha(coverage_path.read_bytes())}`.
- **{len(source_rows)} unique directly used source captures** at `{REV}`, including root/package AGENTS and five captured maintenance/usage skills. Their selected read spans and original connector response locations are recorded in the output source manifest. No remote source fetch was needed.

## Actions and evidence counts

Read the accepted predecessor, applicable captured authority and maintenance guidance; synthesized local ownership, admission/optimism, stream/recovery, requests/terminal, rendering, feature/skills and host/resource boundaries; and mapped all **59 meaningful families / 1,887 paths** to independently usable body sections. Preserved inherited depths of 234 inspected, 1,623 family-supported and 30 metadata-only rather than claiming fresh full-file inspection.

Executed only deterministic artifact checks: verified the dispatch/manifest/predecessor SHA256 pins, checked SHA256 and Git blob SHA for all **{len(source_rows)}** directly used captures, parsed the written JSON, checked unique source paths and accepted build/navigation edges, reconciled all 59 family IDs and their 1,887-path sum, verified all mapped section names, and generated **{len(excerpt_rows)} exact bounded source excerpts** in **{len(evidence)} evidence groups**. Four groups describe newly explicit static detail/instruction; seven corroborate inherited facts. The explanation uses **1 build predecessor**, **{len(predecessor_sections)} accepted predecessor sections** and **2 navigation-only destinations**. Mechanical counts and per-section byte sizes are in `author-checks.json`.

The output source manifest contains only directly used raw source files. Factual synthesis inherited from L1 remains bound by the explicit accepted build edge. Host and design/TUI L2 keys are optional consultation routes, potentially pending, not evidence dependencies. No other unit body was consumed.

The initial AGENTS filename enumeration included the workspace root before the exact dispatch was read. Its output contained AGENTS paths only; it did not read other producer bodies or prohibited review material. Subsequent source/predecessor searches and reads were confined to the named app/session and accepted-input paths. This scope detail was reported to the principal.

## Preserved uncertainty and unexecuted work

Preserved the UI/browserSafe versus Client dependency distinction; prescribed Client regeneration and no-hand-edit rules; mandatory production benchmark before/after condition for session/timeline changes; readiness-predicate mismatch; exact retry versus projection equivalence; local receipt versus durable sequence; reconnect/reconcile without replay guarantee; lexical Skills ownership versus server filesystem enforcement; write-result suppression versus cancellation; legacy CI source versus Actions route; unregistered Guardrails; generic avatar guidance versus measured sample; and generated palettes versus authored styles.

Underlying SkillV2/SkillFile filesystem enforcement, native host/scanner operation, PTY slow-reader behavior, provider/OAuth/storage outcomes, Core scheduling, RAG quality, Board mutations, full rendering/accessibility and per-locale/per-asset provenance remain unestablished. Existing tests, stories, mock infrastructure and fixture logs remain unexecuted evidence. No product tests, benchmarks, typechecks, builds, restarts, generation, native/browser actions, external paid calls, remote writes or CI were performed. No semantic verdict is issued by this producer.

Only this assigned output area was edited. Prior source captures, accepted L1 bodies/manifests and the native package were not modified. No oracle, judge packet/decision, correction exposure note, closure-work content or transport record was read; no judge was contacted. The completed files await principal integration, freeze and any separately authorized literal-transport continuation. No later layer was started.
'''
(OUT / 'response.md').write_text(response, encoding='utf-8')

# Parse emitted JSON as an artifact check and create a hash list without a self-hash.
for name in ['sources.json','dependencies.json','family-map.json','author-checks.json']:
    json.loads((OUT / name).read_text())
files = ['body.md','sources.json','dependencies.json','decisive-evidence.md','response.md','family-map.json','author-checks.json','author_artifacts.py']
hashes = {'artifact_key':'s2.l2.app-session','hash_algorithm':'sha256','files':[{ 'path':name, 'sha256':sha((OUT/name).read_bytes()),'byte_length':len((OUT/name).read_bytes())} for name in files], 'note':'This list omits its own recursive hash; the producer final response reports hashes.json separately.'}
write_json('hashes.json', hashes)
print(json.dumps({'body':checks['body'],'sources':len(source_rows),'families':len(family_rows),'excerpts':len(excerpt_rows),'files':hashes['files'],'hashes_json_sha256':sha((OUT/'hashes.json').read_bytes())}, ensure_ascii=False, indent=2))
