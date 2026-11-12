"""Produce two independent L4 documentation packages from accepted inputs only."""

import hashlib
import json
import re
from pathlib import Path

ROOT = Path('/workspace/scratch/7b5d6430f420/genesis-s2')
SOURCE_ROOT = ROOT / 'producers/app-session'
REV = '1cde2ff7a71bcf7aecb5d030917b577165135d38'
MANIFESTS = [
    {'path': 'accepted/l1.json', 'sha256': '8bb7bb5298f42eefe3fb34246a8303ad974947ef54ac99f1390ed40e276644c8'},
    {'path': 'accepted/l2.json', 'sha256': '27db0efc4d2495a7666117abe57907d2bd9e46c1e9bbef3b27ca23140c2ae36c'},
    {'path': 'accepted/l3.json', 'sha256': 'dabee552a1eca7242365072a06604d3468b4de6be04a0085ed70286dbed1497b'},
]
COMMON_HEADINGS = ['Orientation', 'Maintenance protocol', 'Verification and boundaries']


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


accepted = {}
accepted_text = {}
for spec in MANIFESTS:
    raw = (ROOT / 'deliverable' / spec['path']).read_bytes()
    assert sha(raw) == spec['sha256']
    obj = json.loads(raw)
    assert obj['source_revision'] == REV
    for record in obj['artifacts']:
        # Review references are intentionally neither consumed nor followed.
        artifact = {k: record[k] for k in ['key', 'body_path', 'body_sha256', 'byte_length']}
        data = (ROOT / 'deliverable' / artifact['body_path']).read_bytes()
        assert sha(data) == artifact['body_sha256'] and len(data) == artifact['byte_length']
        accepted[artifact['key']] = artifact
        accepted_text[artifact['key']] = data.decode('utf-8')

index_raw = (SOURCE_ROOT / 'sources.json').read_bytes()
index = json.loads(index_raw)
source_index = {r['path']: r for r in index['records']}
raw_sources = {}


def source_record(path, purpose, used_lines=None, used_fields=None):
    r = source_index[path]
    data = (SOURCE_ROOT / r['local_capture_file']).read_bytes()
    assert r['commit'] == REV
    assert sha(data) == r['sha256'] and len(data) == r['byte_length']
    blob = hashlib.sha1(b'blob ' + str(len(data)).encode() + b'\0' + data).hexdigest()
    assert blob == r['git_blob_sha']
    raw_sources[path] = data
    out = {k: r[k] for k in ['commit', 'path', 'git_blob_sha', 'sha256', 'byte_length']}
    out.update({'local_capture_file': 'producers/app-session/' + r['local_capture_file'], 'original_connector_response_file': 'producers/app-session/' + r['connector_response_file'], 'used_for': purpose})
    if used_lines:
        assert all(1 <= a <= b <= len(data.splitlines()) for a, b in used_lines)
        out['used_line_ranges'] = used_lines
    if used_fields:
        out['used_json_fields'] = used_fields
    return out


SOURCE_SPECS = [
    ('AGENTS.md', 'Current codegen/dependency, repo-only docs/skills, remote-test cadence, PTY, guard, runtime and process-local continuation instructions.', [[1, 2], [146, 166], [175, 216]], None),
    ('packages/app-shell/AGENTS.md', 'Stability/simplicity/performance priority, production benchmark requirement, no-restart rule and exact localization guidance.', [[1, 8], [21, 34]], None),
    ('packages/session-ui/AGENTS.md', 'Shared session-UI visible-copy localization and preservation of English source text/keys.', [[1, 7]], None),
    ('packages/schema/AGENTS.md', 'Browser-safe serializable contract ownership, legacy ID compatibility/migration decision and focused contract regression requirements.', [[3, 9], [71, 83]], None),
    ('packages/app-shell/e2e/AGENTS.md', 'Required official-guide reading before E2E work, observable-state/identity assertions, no timing sleeps or retried state-changing actions, and manual-suite discovery limits.', [[1, 22]], None),
    ('packages/app-shell/e2e/performance/AGENTS.md', 'Serial production benchmarking, raw diagnostics, scenario/metric completion and no machine-dependent thresholds.', [[1, 13]], None),
    ('.orchestra/skills/agent-screen-maintenance/SKILL.md', 'Agent-screen guide/endpoint ownership, stable IDs, secret-free presentation, localization, deferred Atlas reads and codegen obligation.', [[8, 41]], None),
    ('packages/app-shell/package.json', 'Declared app typecheck and manual benchmark scripts; no script execution.', None, ['name', 'scripts.typecheck', 'scripts.test:bench']),
    ('packages/session-ui/package.json', 'Declared session-UI typecheck script; no script execution.', None, ['name', 'scripts.typecheck']),
]
all_sources = {spec[0]: source_record(*spec) for spec in SOURCE_SPECS}

L1A = 's2.l1.app-session'
L2A = 's2.l2.app-session'
L3A = 's2.l3.app-session'
L3D = 's2.l3.desktop-web'
L3U = 's2.l3.design-tui'


def ref(key, heading):
    assert key in accepted_text
    assert '\n## ' + heading + '\n' in accepted_text[key]
    return {'key': key, 'heading': heading}


APP_GROUPS = [
    {'heading': 'Orientation', 'basis': 'Accepted static scope and ownership; protocol prescriptions are maintenance inferences, not product execution.', 'refs': [ref(L3A, 'Reading the handoffs'), ref(L3D, 'Orientation and evidence boundaries'), ref(L3U, 'Orientation and accepted ownership')]},
    {'heading': 'Maintenance protocol', 'basis': 'Trigger/owner/stop map synthesizes accepted failure boundaries. Exact current source instructions add contract, naming, localization, codegen and documentation obligations. Rebuild/update consequences are recommendations, not claimed Atlas runtime automation.', 'refs': [
        ref(L3A, 'Enter the intended server and workspace'), ref(L3A, 'Submit once, then hand the draft to its session'), ref(L3A, 'Recover the projection without inventing execution recovery'), ref(L3A, 'Answer requests without transferring server authority to the UI'), ref(L3A, 'Change settings and Skills under the original owner'), ref(L3A, 'Render and localize under caller-owned lifetimes'),
        ref(L2A, 'Navigation, settings and feature controllers'), ref(L1A, 'Requests, terminals and auxiliary lifetimes'), ref(L1A, 'Rendering, evidence and reusable utility contracts'), ref(L1A, 'Assets, localization and verification evidence'),
        ref(L3U, 'Terminal input becomes admission through ordered, separate operations'), ref(L3U, 'Generated products reach consumers through distinct maintenance paths'), ref(L3D, 'Launch, choose a server and identify the health decision')]},
    {'heading': 'Verification and boundaries', 'basis': 'Existing test paths/assertion scopes are accepted L1 evidence. Direct package scripts and current instructions specify future gates. Test-runner package-selector resolution and authorized benchmark execution remain unresolved; no guessed concrete invocation or performed gate is asserted.', 'refs': [ref(L1A, 'Assets, localization and verification evidence'), ref(L2A, 'Verification limits and ownership use'), ref(L3A, 'Route a change through its affected contracts'), ref(L3D, 'Verification status and remaining evidence'), ref(L3U, 'Change impact and verification ownership')]},
]

NAV_ROWS = [
    ('s2.l1.desktop-web', ['1. Startup, readiness and shutdown'], 'Locate host source and startup discrepancy.'),
    ('s2.l1.app-session', ['Prompt admission and draft ownership'], 'Locate submission/draft source evidence.'),
    ('s2.l1.design-tui', ['V2 session action boundary'], 'Locate terminal request/payload contracts.'),
    ('s2.l2.desktop-web', ['Startup publishes readiness before the renderer proceeds'], 'Explain desktop readiness ownership.'),
    ('s2.l2.app-session', ['Durable admission, optimistic state and draft storage'], 'Explain app admission, retry and rollback boundaries.'),
    ('s2.l2.design-tui', ['V2 actions and prompt admission'], 'Explain terminal ordering and its limits.'),
    ('s2.l3.desktop-web', ['Cross renderer, preload and main with a scoped capability'], 'Follow host authority handoffs.'),
    ('s2.l3.app-session', ['Submit once, then hand the draft to its session'], 'Follow first-send ownership/handoff.'),
    ('s2.l3.design-tui', ['Generated products reach consumers through distinct maintenance paths'], 'Follow generated presentation producers/consumers.'),
    ('s2.l4.desktop-web', COMMON_HEADINGS, 'Declared future desktop/web maintenance navigation; no factual L4 input.'),
    ('s2.l4.app-session', COMMON_HEADINGS, 'Declared future app/session maintenance navigation; newly authored L4 app text is not entry evidence.'),
    ('s2.l4.design-tui', COMMON_HEADINGS, 'Declared future terminal/design maintenance navigation; no factual L4 input.'),
]
for key, headings, _ in NAV_ROWS:
    if not key.startswith('s2.l4.'):
        for heading in headings:
            ref(key, heading)

ENTRY_GROUPS = [
    {'heading': 'Orientation', 'basis': 'Population and evidence-depth distinctions come from accepted L1 scopes; layer-role selection and pending-L4 status are construction/navigation explanations from the public dispatch.', 'refs': [ref('s2.l1.desktop-web', 'Scope and evidentiary status'), ref(L1A, 'Scope, identity and depth'), ref('s2.l1.design-tui', 'Scope and evidence strength')]},
    {'heading': 'Maintenance protocol', 'basis': 'The nine accepted bodies support exact heading/need mapping. Three L4 targets use only the public common-heading declaration. Shallow/deep reading limits are from the exact public dispatch; recommended traversal is an inference, not a measured Atlas request.', 'refs': [ref(key, headings[0]) for key, headings, _ in NAV_ROWS if not key.startswith('s2.l4.')] + [ref(L3A, 'Recover the projection without inventing execution recovery'), ref(L3D, 'Finish capture, persistence and installation at the right boundary'), ref(L3U, 'Terminal input becomes admission through ordered, separate operations')]},
    {'heading': 'Verification and boundaries', 'basis': 'Accepted L3 limits and attributed root instructions constrain conclusions. Refreshing pins/dependents and repairing navigation is recommended maintenance, not automatic rebuild behavior.', 'refs': [ref(L3D, 'Verification status and remaining evidence'), ref(L3U, 'Change impact and verification ownership'), ref(L3A, 'Route a change through its affected contracts')]},
]


def source_line(path, needle):
    matches = [i for i, line in enumerate(raw_sources[path].decode().splitlines(), 1) if needle in line]
    assert len(matches) == 1, (path, needle, matches)
    return matches[0]


APP_EXCERPTS = [
    ('E01', 'AGENTS.md', 160, 166, 'Attributed remote-test command and snapshot-write implications. Its owner-only local exception is not authorized in this campaign.'),
    ('E02', 'AGENTS.md', 175, 179, 'Attributed change-scoped versus epic CI cadence and gate-reporting distinction.'),
    ('E03', 'AGENTS.md', 194, 205, 'Attributed guard, restart boundary and package-local typecheck rules; none executed.'),
    ('E04', 'packages/app-shell/AGENTS.md', 1, 8, 'Attributed priorities, mandatory before/after production benchmark and strict app/server no-restart instruction.'),
    ('E05', 'packages/app-shell/e2e/AGENTS.md', 8, 16, 'Attributed observable-state, exact-identity and single-mutation E2E discipline; no E2E test was authored or run.'),
    ('E06', 'packages/app-shell/e2e/performance/AGENTS.md', 7, 13, 'Attributed serial production diagnostics, lossless data, completion-only assertions and separate normal discovery.'),
    ('E07', 'packages/schema/AGENTS.md', 71, 83, 'Attributed ID-compatibility and focused contract-change obligations; no migration or contract change was implemented.'),
    ('E08', 'AGENTS.md', 146, 154, 'Attributed shipped versus repository-only knowledge and user-guide update boundary.'),
    ('E09', 'packages/app-shell/package.json', source_line('packages/app-shell/package.json', '"typecheck":'), source_line('packages/app-shell/package.json', '"typecheck":'), 'New declared-script precision: app typecheck uses tsgo -b; not an executed result.'),
    ('E10', 'packages/session-ui/package.json', source_line('packages/session-ui/package.json', '"typecheck":'), source_line('packages/session-ui/package.json', '"typecheck":'), 'New declared-script precision: session-UI typecheck uses tsgo --noEmit; not an executed result.'),
    ('E11', 'packages/app-shell/package.json', source_line('packages/app-shell/package.json', '"test:bench":'), source_line('packages/app-shell/package.json', '"test:bench":'), 'New declared-script precision: the manual benchmark includes Bun test and Playwright execution, so manual classification alone does not establish permission to execute it here.'),
    ('E12', '.orchestra/skills/agent-screen-maintenance/SKILL.md', 32, 41, 'Attributed deferred Atlas loading, stable seat IDs, secret-free presentation, localization and protocol-generation obligations.'),
]
ENTRY_EXCERPTS = [
    ('E01', 'AGENTS.md', 151, 154, 'Attributed maintenance skills/docs and runtime-knowledge boundary.'),
    ('E02', 'AGENTS.md', 160, 166, 'Attributed remote-test route and snapshot side effect; no command execution or local exception authorization.'),
    ('E03', 'AGENTS.md', 199, 205, 'Attributed restart and package typecheck boundaries; a navigation guide grants no runtime permission.'),
    ('E04', 'AGENTS.md', 214, 216, 'Attributed process-local and post-crash continuation limit; not an implemented recovery claim.'),
]

app_build = [L3A, L3D, L3U, L2A, L1A]
app_navigation = ['s2.l4.desktop-web', 's2.l4.design-tui', 's2.l4.entry']
app_rationale = {
    L3A: 'Build: primary accepted journey evidence for retained identities, first-send/admission, canonical recovery, requests/terminal, Skills and rendering failure/stop boundaries.',
    L3D: 'Build: actual host facts used for startup/health, WSL distinction, remote fallback and stable-exit discrepancy; owner handoffs and remaining host evidence bound app-side diagnosis.',
    L3U: 'Build: actual TUI ordered/non-atomic prompt/retry compatibility and distinct generated-presentation consumer chains; shared UI ownership/verification limits prevent app overreach.',
    L2A: 'Build: settings controller ownership, current feature boundaries and verification-depth limits directly referenced in the maintenance map.',
    L1A: 'Build: concrete request/terminal/rendering source ownership, palette producer chain and exact existing test/benchmark assertion scopes.',
    's2.l4.desktop-web': 'Navigation only: separate host maintenance protocol under common declared headings; no pending sibling prose used as evidence.',
    's2.l4.design-tui': 'Navigation only: separate terminal/shared-design maintenance protocol under common declared headings; no pending sibling prose used as evidence.',
    's2.l4.entry': 'Navigation only: compact cross-unit reading map; the separately authored entry is not a factual input to this unit.',
}
entry_build = [key for key, _, _ in NAV_ROWS if not key.startswith('s2.l4.')]
entry_navigation = [key for key, _, _ in NAV_ROWS]
entry_rationale = {}
for key, headings, purpose in NAV_ROWS:
    if key in entry_build:
        entry_rationale[key] = 'Build: accepted exact headings, bounded source scope or journey/verification limits actually used to construct the entry map. Navigation: ' + purpose + ' Start at ' + '; '.join(headings) + '.'
    else:
        entry_rationale[key] = 'Navigation only: ' + purpose + ' Headings come from the public dispatch contract, not an unaccepted body.'


def make_artifact(config):
    out = ROOT / 'later-producers/app-session' / config['directory']

    def write(name, text):
        destination = out / name
        assert destination.parent == out
        destination.write_text(text, encoding='utf-8', newline='\n')

    def write_json(name, value):
        write(name, json.dumps(value, indent=2, ensure_ascii=False) + '\n')

    dispatch_path = 'deliverable/requests/' + config['dispatch']
    assert sha((ROOT / dispatch_path).read_bytes()) == config['dispatch_sha256']
    body_raw = (out / 'body.md').read_bytes()
    body = body_raw.decode('utf-8')
    sections = list(re.finditer(r'^## (.+)\n([\s\S]*?)(?=^## |\Z)', body, re.M))
    assert [m.group(1) for m in sections] == COMMON_HEADINGS
    assert [g['heading'] for g in config['groups']] == COMMON_HEADINGS
    words = len(re.findall(r'\S+', body))
    assert config['word_min'] <= words <= config['word_max']
    sizes = [{'heading': m.group(1), 'byte_length': len(m.group(0).encode())} for m in sections]
    assert len(body_raw) < 64000 and all(s['byte_length'] < 16000 for s in sizes)
    assert all(key in accepted for key in config['build'])
    assert not any(key.startswith('s2.l4.') for key in config['build'])
    assert set(config['rationale']) == set(config['build'] + config['navigation'])
    for group in config['groups']:
        for source_ref in group['refs']:
            assert source_ref['key'] in config['build']
    if config['unit'] == 's2.l4.entry':
        assert len(config['navigation']) == 12
        assert all(f'`{key}`' in body for key in config['navigation'])
        assert set(config['build']) == set(config['navigation']) & set(accepted)

    sources = [dict(all_sources[path]) for path in config['source_paths']]
    if config['unit'] == 's2.l4.entry':
        sources[0]['used_for'] = 'Directly attributed repository-only knowledge, remote-test, restart/typecheck and process-local continuation instructions for entry boundaries.'
        sources[0]['used_line_ranges'] = [[146, 166], [199, 216]]
    write_json('sources.json', {
        'unit': config['unit'], 'source_revision': REV,
        'capture_index': {'path': 'producers/app-session/sources.json', 'sha256': sha(index_raw)},
        'scope': 'Only directly used captured instructions and declared package-script fields are listed. Complete captured bytes were hashed for identity. Accepted predecessor bodies carry other facts through explicit build edges; no raw peer source or new remote capture was fetched.',
        'sources': sources,
    })
    deps = {
        'unit': config['unit'], 'build': config['build'], 'navigation': config['navigation'], 'rationale': config['rationale'],
        'consumed_layer_manifests': MANIFESTS,
        'consumed_predecessor_bodies': [accepted[key] for key in config['build']],
        'same_layer_factual_inputs': [],
    }
    if config['unit'] == 's2.l4.entry':
        deps['build_navigation_overlap'] = 'Intentional: the nine accepted bodies provide factual heading/scope evidence and are also consultation destinations. The three L4 units are navigation only. No newly authored L4 app body is an entry factual input.'
        deps['navigation_heading_contract'] = [{'key': key, 'headings': headings, 'basis': 'accepted body' if key in accepted else 'public L4 dispatch declaration'} for key, headings, _ in NAV_ROWS]
    write_json('dependencies.json', deps)

    excerpts = []
    for identifier, path, start, end, purpose in config['excerpts']:
        assert path in config['source_paths']
        raw = b''.join(raw_sources[path].splitlines(keepends=True)[start - 1:end])
        assert raw.endswith(b'\n')
        excerpts.append({'id': identifier, 'path': path, 'start_line': start, 'end_line': end, 'sha256': sha(raw), 'byte_length': len(raw), 'purpose': purpose, 'text': raw.decode()})
    evidence = [f"# Decisive evidence for {config['unit']}\n\n## Evidence status\n\nSource revision `{REV}`. {config['evidence_status']} This producer record gives no semantic verdict. All source instructions and declared scripts remain unexecuted.\n\n", '## Accepted predecessor identities\n\n| Key | Body path relative to deliverable | SHA256 | Bytes |\n|---|---|---|---:|\n']
    for key in config['build']:
        a = accepted[key]
        evidence.append(f"| `{key}` | `{a['body_path']}` | `{a['body_sha256']}` | {a['byte_length']} |\n")
    evidence.append('\nAll three accepted-layer manifests were read and byte-verified; dependencies.json records their exact dispatched hashes. Permitted manifest review metadata was not followed. No L4 body is a factual predecessor.\n\n## Section-to-evidence map\n')
    for group in config['groups']:
        evidence.append(f"\n### {group['heading']}\n\n{group['basis']}\n\n")
        for source_ref in group['refs']:
            evidence.append(f"- `{source_ref['key']}` § “{source_ref['heading']}”.\n")
    if config['unit'] == 's2.l4.entry':
        evidence.append('\n## Exact navigation map\n\nThe first nine rows have accepted factual evidence and navigation roles. The last three rows have navigation only. Their headings are copied from the public dispatch, not from new L4 prose.\n\n| Key | Exact headings | Basis and purpose |\n|---|---|---|\n')
        for key, headings, purpose in NAV_ROWS:
            evidence.append(f"| `{key}` | {'; '.join(headings)} | {'Accepted body' if key in accepted else 'Public dispatch declaration'}: {purpose} |\n")
        evidence.append(f"\nRoutine/deep 16000/64000-byte bounds and the common L4 heading declaration are public request constraints in `{dispatch_path}`, SHA256 `{config['dispatch_sha256']}`. No Atlas retrieval or auto-rebuild behavior was executed or inferred from those bounds.\n")
    evidence.append('\n## Bounded exact source excerpts\n\nEach block preserves complete UTF-8 excerpt bytes including its final newline. Hashes below identify excerpts; sources.json identifies full captures.\n')
    for e in excerpts:
        evidence.append(f"\n### {e['id']}: {e['path']}:{e['start_line']}–{e['end_line']}\n\n{e['purpose']}\n\nExcerpt SHA256 `{e['sha256']}`; {e['byte_length']} bytes.\n\n```text\n")
        evidence.append(e['text'])
        evidence.append('```\n')
    evidence.append('\n## Preserved limits and unexecuted work\n\n' + config['limits'] + '\n\nNo product tests, typecheck, guards, benchmark, generation, browser/desktop/terminal session, native/provider calls, source changes, remote writes or CI ran. No new remote source was fetched. No private oracle/judgment/closure material, review packets or transport receipts were read during this L4 authoring. No judge contact, agent inventory or additional subagent occurred.\n')
    write('decisive-evidence.md', ''.join(evidence))
    blocks = re.findall(r'```text\n([\s\S]*?)```', (out / 'decisive-evidence.md').read_text())
    assert len(blocks) == len(excerpts)
    for block, excerpt in zip(blocks, excerpts):
        assert sha(block.encode()) == excerpt['sha256']
    write_json('evidence-map.json', {'unit': config['unit'], 'source_revision': REV, 'sections': config['groups'], 'navigation_map': deps.get('navigation_heading_contract', []), 'excerpts': [{k: v for k, v in e.items() if k != 'text'} for e in excerpts]})
    checks = {
        'kind': 'documentation packaging only; not product testing or semantic judgment', 'unit': config['unit'],
        'dispatch': {'path': dispatch_path, 'sha256': config['dispatch_sha256'], 'verified': True},
        'accepted_manifest_count': 3, 'accepted_body_count': len(config['build']), 'accepted_manifest_and_body_pins_verified': True,
        'source_count': len(sources), 'source_sha256_git_blob_and_lengths_verified': True,
        'build_keys_are_accepted_prior_layers': True, 'same_layer_factual_inputs': [],
        'navigation_count': len(config['navigation']), 'exact_predecessor_headings_verified': True,
        'common_h2_headings_verified': True, 'body': {'sha256': sha(body_raw), 'byte_length': len(body_raw), 'whitespace_word_count': words, 'sections': sizes},
        'all_sections_under_16000_bytes': True, 'body_under_64000_bytes': True,
        'literal_excerpt_count': len(excerpts), 'literal_excerpt_readback_hashes_verified': True,
        'json_parse_checked': True, 'product_or_remote_execution': False,
    }
    if config['unit'] == 's2.l4.entry':
        checks['all_twelve_unit_navigation_keys_present'] = True
        checks['l4_navigation_headings_basis'] = 'Public declaration only; peer L4 bodies were not read to substantiate this entry.'
        checks['accepted_build_navigation_overlap_intentional'] = True
    write_json('author-checks.json', checks)
    response = f'''# {config['unit']} producer response

## Complete output

Produced the complete English body at source revision `{REV}`: {len(body_raw)} UTF-8 bytes, {words} whitespace-delimited words, and the three exact H2 headings Orientation, Maintenance protocol, Verification and boundaries. Body SHA256: `{sha(body_raw)}`. Largest section: {max(s['byte_length'] for s in sizes)} bytes; every section is below 16000 and the whole body below 64000.

{config['result_summary']}

## Actual inputs and authoring

Read and verified exact dispatch `{dispatch_path}` with SHA256 `{config['dispatch_sha256']}`. Read all three specified accepted manifests and verified their pins. Consumed {len(config['build'])} accepted predecessor bodies through bounded relevant sections/heading maps, preserving their byte/hash identities. The manifest pins are:

''' + ''.join(f"- `{m['path']}`: `{m['sha256']}`.\n" for m in MANIFESTS) + f'''
The sources manifest contains {len(sources)} directly used captured source files with actual commit/path, Git blob SHA-1 and SHA256 identities, lengths and used ranges or JSON fields. Complete raw bytes were hashed for identity; this does not claim an exhaustive branch or file audit. No raw peer-domain source or new remote source was fetched. Build dependencies number {len(config['build'])}; navigation edges number {len(config['navigation'])}. All substantive predecessor references resolve to exact accepted headings. No newly authored L4 body is a factual input.

Mapped each body section to accepted evidence and supplied {len(excerpts)} exact bounded source excerpts. Instructions, static declarations, maintenance inferences and unexecuted verification are distinguished. Created five required files plus evidence-map.json, author-checks.json and hashes.json. The artifact-only builder is in the assigned L4 app directory; it constructs each package from its own body plus its declared accepted/source inputs and never uses L4 app content as entry evidence. All writes stayed within the two explicitly assigned L4 output directories; prior sources, bodies and manifests were preserved.

Mechanical checks verified source SHA256/Git blob identities, predecessor/dispatch/manifest pins, JSON parsing, exact heading references, word/byte limits, declared dependency roles and excerpt readback hashes. These checks neither judge the output nor execute product gates.

## Limits and gates

{config['limits']}

No product tests, package typecheck, guard, benchmark, build, source generation, runtime/browser/terminal interaction, provider call, remote write, credential access or CI occurred. No private oracle/judgment/closure material, review packet, transport receipt, agent inventory or judge response was read during L4 production. No judge contact or extra subagent occurred. The current request authorizes documentation only; command examples are future prescribed routes, not claimed runs. No semantic verdict is issued.

## Deliverables

body.md, sources.json, dependencies.json, decisive-evidence.md and response.md are complete. evidence-map.json and author-checks.json preserve public packaging evidence. hashes.json covers these local files and excludes itself. Root may independently reconcile and freeze exact bytes; literal review transport requires a separate dispatch. This producer turn stops after delivery.
'''
    write('response.md', response)
    json_names = ['sources.json', 'dependencies.json', 'evidence-map.json', 'author-checks.json']
    for name in json_names:
        json.loads((out / name).read_text())
    names = ['body.md', 'sources.json', 'dependencies.json', 'decisive-evidence.md', 'response.md', 'evidence-map.json', 'author-checks.json']
    if config['directory'] == 'l4':
        names.append('author_artifacts.py')
    hashes = [{'path': name, 'sha256': sha((out / name).read_bytes()), 'byte_length': (out / name).stat().st_size} for name in names]
    write_json('hashes.json', {'unit': config['unit'], 'algorithm': 'SHA256', 'excludes_self': True, 'files': hashes})
    json.loads((out / 'hashes.json').read_text())
    return {'unit': config['unit'], 'body': checks['body'], 'source_count': len(sources), 'build_count': len(config['build']), 'navigation_count': len(config['navigation']), 'excerpt_count': len(excerpts), 'files': hashes, 'hash_manifest_sha256': sha((out / 'hashes.json').read_bytes())}


app = make_artifact({
    'unit': 's2.l4.app-session', 'directory': 'l4', 'dispatch': 'l4-app-session-dispatch.md', 'dispatch_sha256': '0d0932d214322396b93b998dc7665718be7d0e880a87253a5f918f258bdaef4f',
    'word_min': 800, 'word_max': 1500, 'build': app_build, 'navigation': app_navigation, 'rationale': app_rationale,
    'groups': APP_GROUPS, 'source_paths': list(all_sources), 'excerpts': APP_EXCERPTS,
    'evidence_status': 'The L4 contribution is operational prescription derived from accepted L1–L3: trigger, identity checks, edit owner, deepening evidence, stop boundary and update consequences. New direct precision consists of attributed current maintenance instructions and declared package typecheck/benchmark scripts, not new implementation behavior or runtime findings.',
    'result_summary': 'The app guide covers typical submission changes, invalid Skills/contracts, stale/reconnected state, permission/terminal ownership, shared rendering, API/TUI/host impacts, localization, generated inputs, docs and future test/typecheck/benchmark obligations. It preserves the strict no-restart and uncertain-mutation boundaries.',
    'limits': 'Accepted representative coverage remains representative. Preserve admission ambiguity and unsent edits, bounded SSE without replay, local receipt versus canonical policy provenance, non-atomic TUI calls, desktop/WSL health differences and stable-exit restart discrepancy, native/browser durability differences, partial IPC evidence, request UI versus authorization, terminal buffer growth, uninspected SkillV2 filesystem enforcement and visual/translation/asset limits. Root test:ci package-selector implementation was not inspected, so the official <package> placeholder is retained rather than inventing an alias. A permitted benchmark execution route remains to be established before a future session/timeline change claims that gate; its manual script includes product tests. No current permission or execution is inferred from repository commands.',
})
entry = make_artifact({
    'unit': 's2.l4.entry', 'directory': 'l4-entry', 'dispatch': 'l4-entry-dispatch.md', 'dispatch_sha256': '77249172b64d05aad8b344bce1d6dbadca80901b01579c67ed0137623d836b68',
    'word_min': 400, 'word_max': 700, 'build': entry_build, 'navigation': entry_navigation, 'rationale': entry_rationale,
    'groups': ENTRY_GROUPS, 'source_paths': ['AGENTS.md'], 'excerpts': ENTRY_EXCERPTS,
    'evidence_status': 'No new implementation claim is introduced. The entry maps needs to accepted exact headings and retains accepted limits. Its source instructions are attributed; its reading/update protocol is a recommendation. L4 headings are only the predeclared public contract. Neither newly authored L4 app text nor any pending sibling body is entry factual evidence.',
    'result_summary': 'The compact entry navigates all twelve unit keys across L1–L4. Its nine accepted build dependencies also serve navigation roles, intentionally and explicitly; the three L4 unit destinations are navigation only. It gives a bounded shallow/deep reading protocol, scope and abstention boundaries without treating a complete inventory as exhaustive proof.',
    'limits': 'The entry does not enlarge any family-supported or metadata-only evidence. Accepted semantic explanations and local hashes establish neither runtime/CI/consumer acceptance nor provider continuation, clustered ownership, OS/native effects, authorization, accessibility, language completeness or asset rights. Source instructions are not execution permission. The 16000/64000-byte reading bounds and common L4 headings are public dispatch constraints, not tested Atlas behavior. Navigation alignment for all L4 targets remains for the principal/review gate; no unaccepted L4 text was consumed as evidence. Revalidation/rebuild advice is a maintenance recommendation, not an automatic system behavior claim.',
})
print(json.dumps({'artifacts': [app, entry]}, indent=2))
