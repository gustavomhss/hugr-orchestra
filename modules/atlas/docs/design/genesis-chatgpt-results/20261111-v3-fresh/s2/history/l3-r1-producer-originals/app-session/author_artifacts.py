"""Build and verify L3 documentation artifacts only; never run product checks."""

import hashlib
import json
import re
from pathlib import Path


ROOT = Path('/workspace/scratch/7b5d6430f420/genesis-s2')
OUT = ROOT / 'later-producers/app-session/l3'
SOURCE_ROOT = ROOT / 'producers/app-session'
REVISION = '1cde2ff7a71bcf7aecb5d030917b577165135d38'
UNIT = 's2.l3.app-session'


def digest(data):
    return hashlib.sha256(data).hexdigest()


def write(name, value):
    destination = OUT / name
    assert destination.parent == OUT
    destination.write_text(value, encoding='utf-8', newline='\n')


def write_json(name, value):
    write(name, json.dumps(value, indent=2, ensure_ascii=False) + '\n')


manifest_specs = [
    {'path': 'accepted/l1.json', 'sha256': '8bb7bb5298f42eefe3fb34246a8303ad974947ef54ac99f1390ed40e276644c8'},
    {'path': 'accepted/l2.json', 'sha256': '27db0efc4d2495a7666117abe57907d2bd9e46c1e9bbef3b27ca23140c2ae36c'},
]
dispatch_path = 'deliverable/requests/l3-app-session-dispatch.md'
dispatch_sha = '125f7a8c157d2dfc76f0f118babba54aa4a1896416efa2d307d51be683964f20'
assert digest((ROOT / dispatch_path).read_bytes()) == dispatch_sha
accepted = {}
for spec in manifest_specs:
    raw = (ROOT / 'deliverable' / spec['path']).read_bytes()
    assert digest(raw) == spec['sha256']
    manifest = json.loads(raw)
    assert manifest['source_revision'] == REVISION
    # Consume artifact identities only. Never follow review references.
    for artifact in manifest['artifacts']:
        accepted[artifact['key']] = {
            key: artifact[key]
            for key in ('key', 'body_path', 'body_sha256', 'byte_length')
        }

build = ['s2.l2.app-session', 's2.l2.desktop-web', 's2.l2.design-tui', 's2.l1.app-session']
navigation = ['s2.l3.desktop-web', 's2.l3.design-tui']
accepted_text = {}
for key in build:
    artifact = accepted[key]
    raw = (ROOT / 'deliverable' / artifact['body_path']).read_bytes()
    assert digest(raw) == artifact['body_sha256']
    assert len(raw) == artifact['byte_length']
    accepted_text[key] = raw.decode('utf-8')

dependencies = {
    'unit': UNIT,
    'build': build,
    'navigation': navigation,
    'rationale': {
        's2.l2.app-session': 'Primary factual predecessor: composition, credential/generation ownership, admission and draft handoff, stream/canonical recovery, requests/terminals, settings/Skills, rendering and maintenance limits. L3 relates those accepted local mechanisms into user journeys; it does not enlarge the family audit.',
        's2.l2.desktop-web': 'Actual cross-unit evidence for Electron-main readiness before renderer publication, host/preload trust boundaries, stored-remote fallback, stable-exit restart discrepancy, and native SQLite draft persistence. These facts are used in entry and draft journeys, not merely linked for navigation.',
        's2.l2.design-tui': 'Actual cross-unit evidence for shared UI caller/dialog lifetimes, locale versus layout direction, segmented-control direction limit, browser-theme preview ownership, and generated-output boundaries. No TUI runtime or pending L3 account is used as evidence.',
        's2.l1.app-session': 'Directly consumes Assets, localization and verification evidence for exact existing test paths/assertion scopes and performance-test exclusion. Those source-backed observations provide proposed verification routes; no product test was run.',
        's2.l3.desktop-web': 'Optional next consultation for the separate desktop/host journey. Its eventual body is not a factual input, accepted predecessor or build edge here.',
        's2.l3.design-tui': 'Optional next consultation for the separate TUI/shared-design journey. Its eventual body is not a factual input, accepted predecessor or build edge here.',
    },
    'consumed_layer_manifests': manifest_specs,
    'consumed_predecessor_bodies': [accepted[key] for key in build],
}
assert set(dependencies['rationale']) == set(build + navigation)
assert not (set(build) & set(navigation))
assert all(key.startswith(('s2.l1.', 's2.l2.')) for key in build)
write_json('dependencies.json', dependencies)

source_specs = [
    ('AGENTS.md', [[1, 2], [209, 216]], 'Attributed generation/dependency instructions and explicit process-local versus post-crash continuation boundary.'),
    ('packages/app-shell/AGENTS.md', [[1, 4], [21, 25]], 'Attributed production benchmark and visible-copy/English-preservation maintenance requirements.'),
    ('packages/session-ui/AGENTS.md', [[1, 7]], 'Attributed shared session-UI localization and English-preservation requirements.'),
    ('.orchestra/skills/onboarding-usage/SKILL.md', [[10, 14], [35, 42]], 'Attributed folder trust/project entry workflow and unexecuted manual checks.'),
    ('.orchestra/skills/settings-usage/SKILL.md', [[10, 13], [23, 36]], 'Attributed global/project settings visibility and trust/inheritance capability boundary.'),
    ('packages/app-shell/src/app.tsx', [[99, 115], [153, 175]], 'Exact target-server route predicate/fallback and keyed draft server/directory provider composition.'),
    ('packages/app-shell/src/context/global.tsx', [[68, 98]], 'Transport credential identity separate from stable connection key; old context disposal.'),
    ('packages/app-shell/src/pages/session/session-ownership.ts', [[1, 37]], 'Generation capture expiry on departure/cleanup, including return to a former key.'),
    ('packages/app-shell/src/components/prompt-input/submit.ts', [[510, 579]], 'Request selection by action key and policy receipt revision, dispatch rechecks and admitted draft handoff carrying later edits.'),
    ('packages/app-shell/src/context/session-recovery.ts', [[45, 64]], 'Superseded recovery rejection, policy-generation reread, snapshot provenance and local read-receipt distinction.'),
    ('packages/app-shell/src/orchestra/chapters/skills-data.ts', [[12, 28], [55, 81]], 'Whole-array response decoder and lexical source/access classification.'),
    ('packages/app-shell/src/orchestra/chapters/skills.tsx', [[69, 125]], 'Distinct catalog states, decoding before cache update, read cancellation and write completion after owner disposal.'),
    ('packages/app-shell/src/orchestra/chapters/skills-dialog.tsx', [[34, 57]], 'Busy/disposed dialog ownership and edit payload location/mtime.'),
]
index_raw = (SOURCE_ROOT / 'sources.json').read_bytes()
index = json.loads(index_raw)
records = {record['path']: record for record in index['records']}
sources = []
source_bytes = {}
for path, ranges, purpose in source_specs:
    record = records[path]
    assert record['commit'] == REVISION
    raw = (SOURCE_ROOT / record['local_capture_file']).read_bytes()
    assert digest(raw) == record['sha256']
    git_blob = hashlib.sha1(b'blob ' + str(len(raw)).encode('ascii') + b'\0' + raw).hexdigest()
    assert git_blob == record['git_blob_sha']
    assert len(raw) == record['byte_length']
    assert all(1 <= start <= end <= len(raw.splitlines()) for start, end in ranges)
    source_bytes[path] = raw
    sources.append({
        'commit': record['commit'],
        'path': path,
        'git_blob_sha': git_blob,
        'sha256': digest(raw),
        'byte_length': len(raw),
        'local_capture_file': 'producers/app-session/' + record['local_capture_file'],
        'original_connector_response_file': 'producers/app-session/' + record['connector_response_file'],
        'used_line_ranges': ranges,
        'used_for': purpose,
    })
assert len(sources) == len({s['path'] for s in sources}) == 13
write_json('sources.json', {
    'unit': UNIT,
    'source_revision': REVISION,
    'capture_index': {'path': 'producers/app-session/sources.json', 'sha256': digest(index_raw)},
    'scope': 'Only directly used baseline captures are listed. Used ranges are bounded evidence, not a claim of full-file audit. Complete captured bytes were hashed for identity. Other factual claims are inherited through the four explicit accepted-predecessor build edges; no raw peer-domain sources or new remote sources were fetched.',
    'sources': sources,
})

A = 's2.l2.app-session'
D = 's2.l2.desktop-web'
U = 's2.l2.design-tui'
L1 = 's2.l1.app-session'
TESTS = 'Assets, localization and verification evidence'
section_map = [
    {'heading': 'Reading the handoffs', 'predecessors': [(A, 'Orientation and evidence status'), (A, 'Verification limits and ownership use')], 'classification': 'Evidence contract and inherited scope; no new runtime or coverage finding.', 'direct_sources': []},
    {'heading': 'Enter the intended server and workspace', 'predecessors': [(D, 'Orientation and ownership'), (D, 'Startup publishes readiness before the renderer proceeds'), (D, 'Persistence and recovery have several owners'), (D, 'Privilege is checked at each request boundary'), (A, 'Composition, identity and asynchronous ownership'), (A, 'Navigation, settings and feature controllers'), (L1, TESTS)], 'classification': 'Integrated handoff inference from accepted host/app observations; exact route gate is a bounded direct-source refinement. Trust workflow is attributed instruction.', 'direct_sources': ['packages/app-shell/src/app.tsx', 'packages/app-shell/src/context/global.tsx', 'packages/app-shell/src/pages/session/session-ownership.ts', '.orchestra/skills/onboarding-usage/SKILL.md', '.orchestra/skills/settings-usage/SKILL.md']},
    {'heading': 'Submit once, then hand the draft to its session', 'predecessors': [(A, 'Durable admission, optimistic state and draft storage'), (D, 'Persistence and recovery have several owners'), (L1, TESTS)], 'classification': 'Relates inherited admission, retry, rollback and persistence boundaries. Exact request selection by action key/receipt revision is directly corroborated and bounded; no execution observation.', 'direct_sources': ['packages/app-shell/src/components/prompt-input/submit.ts', 'AGENTS.md']},
    {'heading': 'Recover the projection without inventing execution recovery', 'predecessors': [(A, 'Transport, liveness and canonical recovery'), (L1, TESTS)], 'classification': 'Cross-stage inference distinguishes transport liveness, canonical projection and provider execution. Explicit root process-local/post-crash policy is attributed instruction, not an implementation or runtime proof.', 'direct_sources': ['packages/app-shell/src/context/session-recovery.ts', 'AGENTS.md']},
    {'heading': 'Answer requests without transferring server authority to the UI', 'predecessors': [(A, 'Permission requests and terminal boundaries'), (L1, TESTS)], 'classification': 'Relates inherited request/terminal ownership; proposed verification is unexecuted. Slow-reader risk and server authorization limit remain.', 'direct_sources': []},
    {'heading': 'Change settings and Skills under the original owner', 'predecessors': [(A, 'Navigation, settings and feature controllers'), (A, 'Skills catalog, content and editing ownership')], 'classification': 'Integrates inherited controller/mutation boundaries with direct corroboration. Trust is attributed guidance; lexical classification is not filesystem authorization; SkillV2 enforcement remains uninspected.', 'direct_sources': ['.orchestra/skills/settings-usage/SKILL.md', 'packages/app-shell/src/orchestra/chapters/skills-data.ts', 'packages/app-shell/src/orchestra/chapters/skills.tsx', 'packages/app-shell/src/orchestra/chapters/skills-dialog.tsx']},
    {'heading': 'Render and localize under caller-owned lifetimes', 'predecessors': [(A, 'Shared rendering, files and evidence interpretation'), (A, 'Visual resources and prescribed maintenance'), (U, 'Browser UI ownership, lifecycle and accessibility'), (U, 'Localization, direction and two theme systems'), (U, 'Generated products and asset provenance'), (L1, TESTS)], 'classification': 'Actual shared-UI/theme cross-unit build dependency. Localization requirements are instructions; rendering, direction and generated-output facts remain static observations with visual/accessibility limits.', 'direct_sources': ['packages/app-shell/AGENTS.md', 'packages/session-ui/AGENTS.md']},
    {'heading': 'Route a change through its affected contracts', 'predecessors': [(A, 'Visual resources and prescribed maintenance'), (A, 'Verification limits and ownership use'), (L1, TESTS)], 'classification': 'Maintenance inference and attributed dependency/codegen/benchmark instructions. Optional L3 destinations supply no factual evidence.', 'direct_sources': ['AGENTS.md', 'packages/app-shell/AGENTS.md', 'packages/session-ui/AGENTS.md']},
]

body_raw = (OUT / 'body.md').read_bytes()
body = body_raw.decode('utf-8')
sections = list(re.finditer(r'^## (.+)\n([\s\S]*?)(?=^## |\Z)', body, re.M))
assert [m.group(1) for m in sections] == [s['heading'] for s in section_map]
for entry in section_map:
    entry['predecessors'] = [{'key': key, 'heading': heading} for key, heading in entry['predecessors']]
    for ref in entry['predecessors']:
        assert ref['key'] in build
        assert '\n## ' + ref['heading'] + '\n' in accepted_text[ref['key']]
    assert set(entry['direct_sources']) <= set(source_bytes)
section_sizes = [{'heading': m.group(1), 'byte_length': len(m.group(0).encode('utf-8'))} for m in sections]
assert max(s['byte_length'] for s in section_sizes) < 16000
assert len(body_raw) < 64000
word_count = len(re.findall(r'\S+', body))
assert 1000 <= word_count <= 1800

excerpt_specs = [
    ('E01', 'packages/app-shell/src/app.tsx', 105, 115, 'Direct refinement: the target route requires resolved server identity and otherwise navigates home. The conditional, not the comment alone, bounds the statement.'),
    ('E02', 'packages/app-shell/src/components/prompt-input/submit.ts', 513, 523, 'Direct precision: request identity is replaced when the action key or policy receipt revision changes; L3 only describes retention for an unchanged pair.'),
    ('E03', 'AGENTS.md', 209, 216, 'Attributed instruction: admission/execution separation, process-local drains and the explicit need for a separate post-crash provider-continuation design. This is not a demonstration of implemented crash recovery.'),
    ('E04', 'packages/app-shell/src/context/session-recovery.ts', 45, 60, 'Corroboration of accepted recovery: superseded owner and policy-generation checks, compatibility snapshot limit and local receipt.'),
    ('E05', 'packages/app-shell/src/orchestra/chapters/skills.tsx', 100, 125, 'Corroboration of accepted mutation boundary: no page abort signal is passed to save/remove; disposal is checked after completion and suppresses UI work.'),
    ('E06', 'packages/app-shell/src/orchestra/chapters/skills-dialog.tsx', 44, 56, 'Corroboration of accepted edit payload identity: path and optional mtime accompany the editor fields.'),
    ('E07', '.orchestra/skills/onboarding-usage/SKILL.md', 35, 40, 'Attributed proposed manual checks for folder trust and provider setup, not a performed walkthrough.'),
    ('E08', '.orchestra/skills/settings-usage/SKILL.md', 23, 31, 'Attributed trust capability and inherited-parent revocation guidance, not verified filesystem behavior.'),
    ('E09', 'AGENTS.md', 1, 2, 'Attributed client-generation and runtime dependency rules; no generator or product check was executed.'),
]
excerpts = []
for identifier, path, start, end, purpose in excerpt_specs:
    raw = b''.join(source_bytes[path].splitlines(keepends=True)[start - 1:end])
    assert raw.endswith(b'\n')
    excerpts.append({'id': identifier, 'path': path, 'start_line': start, 'end_line': end, 'sha256': digest(raw), 'byte_length': len(raw), 'purpose': purpose, 'text': raw.decode('utf-8')})

evidence = [
    '# Decisive evidence for s2.l3.app-session\n',
    '## Evidence status\n',
    f'Source revision: `{REVISION}`. This is a producer evidence record, not a semantic verdict. The L3 contribution is the relation between accepted local mechanisms: who owns each transition, which identity survives, how a failure is observed, and where a change must be checked. No runtime result, remote action or new filesystem-security proof was produced.\n',
    'Most factual statements are inherited from the exact accepted predecessor sections mapped below. Two narrow implementation refinements are supported directly: the target-server route predicate/fallback (E01) and request selection by action key plus acknowledged policy revision (E02). Root process-local/post-crash policy is reproduced as attributed instruction (E03), not promoted to a source-execution finding. E04–E09 corroborate accepted behavior or precisely attribute instructions. Other directly used captures support the bounded ownership/classification/maintenance observations listed in sources.json.\n',
    '## Accepted predecessor identities\n',
    '| Key | Exact body path, relative to deliverable | SHA256 | Bytes |\n|---|---|---|---:|\n',
]
for key in build:
    artifact = accepted[key]
    evidence.append(f"| `{key}` | `{artifact['body_path']}` | `{artifact['body_sha256']}` | {artifact['byte_length']} |\n")
evidence += ['\nThe two consumed accepted-layer manifest hashes are recorded exactly in dependencies.json. Review references inside those permitted manifests were not followed. No pending L3 unit supplies evidence.\n', '\n## Section-to-evidence map\n']
for entry in section_map:
    evidence.append(f"\n### {entry['heading']}\n\n{entry['classification']}\n\n")
    for ref in entry['predecessors']:
        evidence.append(f"- `{ref['key']}` § “{ref['heading']}”.\n")
    if entry['direct_sources']:
        evidence.append('\nDirectly used captures: ' + '; '.join(f'`{p}`' for p in entry['direct_sources']) + '. Used ranges and actual byte/blob hashes are in sources.json.\n')
evidence.append('\n## Bounded exact source excerpts\n\nEach code block preserves the captured UTF-8 excerpt bytes, including final newline. Its hash is the excerpt hash, distinct from the complete source hash in sources.json. Line numbers are metadata outside the literal excerpt.\n')
for item in excerpts:
    evidence.append(f"\n### {item['id']}: {item['path']}:{item['start_line']}–{item['end_line']}\n\n{item['purpose']}\n\nExcerpt SHA256 `{item['sha256']}`; {item['byte_length']} bytes.\n\n```text\n")
    evidence.append(item['text'])
    evidence.append('```\n')
evidence.append('\n## Unexecuted verification and unresolved evidence\n\nTest paths/assertion scopes are consumed from accepted s2.l1.app-session, not new raw test inspections or execution. No product tests, typecheck, benchmark, CI, browser/desktop walkthrough, provider call, source generator or server restart ran. Preserved limits include ambiguous admission responses, divergent browser/native draft durability, bounded SSE without replay IDs, snapshot policy provenance, desktop stable-exit restart and IPC coverage discrepancies, terminal slow-reader buffering, uninspected SkillV2 filesystem enforcement, and unverified translation/geometry/focus/contrast. The handoff and maintenance recommendations are inferences; optional L3 destinations are navigation only.\n')
write('decisive-evidence.md', ''.join(evidence))
readback = (OUT / 'decisive-evidence.md').read_text()
blocks = re.findall(r'```text\n([\s\S]*?)```', readback)
assert len(blocks) == len(excerpts)
for block, item in zip(blocks, excerpts):
    assert digest(block.encode('utf-8')) == item['sha256']
write_json('evidence-map.json', {'unit': UNIT, 'source_revision': REVISION, 'sections': section_map, 'excerpts': [{k: v for k, v in item.items() if k != 'text'} for item in excerpts]})

checks = {
    'kind': 'documentation-artifact mechanical checks only; no semantic verdict or product test',
    'unit': UNIT,
    'dispatch': {'path': dispatch_path, 'sha256': dispatch_sha, 'exact_bytes_verified': True},
    'consumed_layer_manifests': manifest_specs,
    'accepted_body_count': len(build),
    'accepted_body_hashes_and_lengths_verified': True,
    'source_capture_count': len(sources),
    'source_sha256_and_git_blob_identities_verified': True,
    'dependency_partition_and_predecessor_headings_checked': True,
    'body': {'sha256': digest(body_raw), 'byte_length': len(body_raw), 'whitespace_word_count': word_count, 'level_two_section_count': len(sections), 'sections': section_sizes, 'all_sections_under_16000_bytes': True, 'whole_body_under_64000_bytes': True},
    'literal_excerpt_count': len(excerpts),
    'literal_excerpt_readback_hashes_verified': True,
    'json_outputs_parse_checked': True,
    'product_tests_executed': False,
    'remote_writes_executed': False,
    'pending_l3_peer_bodies_used': False,
}
write_json('author-checks.json', checks)

response = f'''# L3 app/session producer response

## Concrete result

Produced complete English `body.md` for `{UNIT}`, with eight stable level-two sections covering entry/identity, first-send admission and draft handoff, stream/canonical recovery, request/terminal decisions, settings/Skills mutations, caller-owned rendering/theme/localization, and change impact. The body is {len(body_raw)} UTF-8 bytes and {word_count} whitespace-delimited words. Exact SHA256: `{digest(body_raw)}`. Its largest independently retrievable section is {max(s['byte_length'] for s in section_sizes)} bytes; all sections are below 16000 bytes and the whole body is below 64000.

## Actual inputs and actions

Read the exact dispatched L3 request (`{dispatch_sha}`), both named accepted manifests, the required accepted app evidence and selected desktop/shared-UI sections. Verified both manifest pins and all four consumed body hashes/byte lengths. Used accepted L1 app evidence for existing test names and assertion scopes; no new raw test-read claim is made.

The build edges are `s2.l2.app-session`, `s2.l2.desktop-web`, `s2.l2.design-tui` and `s2.l1.app-session`. The desktop and design edges are actual factual inputs, with section-specific rationales. `s2.l3.desktop-web` and `s2.l3.design-tui` are optional navigation only; their pending bodies were not read or used. The accepted manifests were consumed at:

- `accepted/l1.json`: `{manifest_specs[0]['sha256']}`.
- `accepted/l2.json`: `{manifest_specs[1]['sha256']}`.

Read captured root/app/session instructions and relevant onboarding/settings maintenance skills. Directly used {len(sources)} pinned raw captures, with actual source SHA256, computed Git blob identity, byte length, used ranges and capture provenance in `sources.json`. Complete source bytes were hashed for identity; bounded used ranges do not claim a full-file audit. No extra source was fetched. `decisive-evidence.md` maps all eight sections to accepted predecessors and contains {len(excerpts)} byte-preserved excerpts. The new precision is limited to target-route fallback and action/revision request selection; process-local/post-crash limits are explicitly attributed root instructions. Other synthesis joins accepted evidence and marks inferences.

Wrote only this assigned `later-producers/app-session/l3` area. Created the five required files plus the reproducible artifact-only builder, evidence map, mechanical checks and a hash manifest. Parsed JSON outputs, checked build/navigation separation and exact predecessor headings, verified source/blob and excerpt readback hashes, and measured body/section sizes. These checks concern documentation packaging, not semantic acceptance or product execution.

## Limits retained

This unit does not expand the accepted app unit's 59-family accounting into a complete file audit. Desktop startup retains the stable-exit restart discrepancy and nonuniform IPC checks. Browser/native draft mechanisms do not establish equal crash durability. Ambiguous admission responses retain server uncertainty; SSE has a bounded queue and no replay ID; UI recovery does not establish provider continuation or clustered ownership. Local read receipts and compatibility snapshots do not create canonical policy provenance. Request UI does not authorize server actions. Terminal slow-reader growth remains unresolved. Skills classification is lexical and underlying SkillV2 filesystem enforcement remains uninspected; issued writes can finish after page disposal. Visual focus/geometry/contrast, translations, actual credentials/provider behavior and runtime trust remain unverified.

No product edits, local product tests, typecheck, benchmark, CI, source generation, browser/desktop walkthrough, provider calls, paid-model calls, remote writes, credentials access or server restarts occurred. No oracle, judgment, closure-work, correction notes, review packet or transport receipt was read during L3 authoring; allowed accepted-manifest review references were not followed. No agent inventory, additional subagent, judge contact or L4 work occurred. Verification routes are future recommendations based on existing evidence. No self semantic verdict is issued.

## Delivered files

- `body.md`: complete synthesis.
- `sources.json`: {len(sources)} directly used source captures and actual hashes.
- `dependencies.json`: four accepted build edges, two optional navigation edges, exact consumed manifests and body pins.
- `decisive-evidence.md`: predecessor mapping and {len(excerpts)} bounded exact excerpts.
- `response.md`: this actual-work and limits record.
- `evidence-map.json`, `author-checks.json`, `author_artifacts.py`, `hashes.json`: public reproducibility and packaging records; hashes.json excludes itself to avoid a recursive hash.

The principal may now reconcile and freeze these exact bytes. This turn stops here; literal judge transport and any later layer require the principal's separate dispatch.
'''
write('response.md', response)

for name in ('sources.json', 'dependencies.json', 'evidence-map.json', 'author-checks.json'):
    json.loads((OUT / name).read_text())
required = ['body.md', 'sources.json', 'dependencies.json', 'decisive-evidence.md', 'response.md']
extra = ['evidence-map.json', 'author-checks.json', 'author_artifacts.py']
file_hashes = []
for name in required + extra:
    raw = (OUT / name).read_bytes()
    file_hashes.append({'path': name, 'sha256': digest(raw), 'byte_length': len(raw)})
write_json('hashes.json', {'unit': UNIT, 'algorithm': 'SHA256', 'excludes_self': True, 'files': file_hashes})
json.loads((OUT / 'hashes.json').read_text())
print(json.dumps({'body': checks['body'], 'source_count': len(sources), 'excerpt_count': len(excerpts), 'files': file_hashes, 'hash_manifest': {'path': 'hashes.json', 'sha256': digest((OUT / 'hashes.json').read_bytes()), 'byte_length': (OUT / 'hashes.json').stat().st_size}}, indent=2))
