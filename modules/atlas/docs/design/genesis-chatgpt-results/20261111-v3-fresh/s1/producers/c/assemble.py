#!/usr/bin/env python3
"""Assemble transport metadata and exact excerpts; does not execute product code."""
from pathlib import Path
import collections
import hashlib
import json
import re
import shutil

ROOT = Path(__file__).resolve().parent
SRC = ROOT / 'sources'
COMMIT = '1cde2ff7a71bcf7aecb5d030917b577165135d38'
PROTOCOL = 'ee2521a5b966bd505cc95bd1c733e09e12f33531'
PREFIX = 'modules/atlas/docs/design/genesis-chatgpt-results/20261111-v3-fresh/s1/producers/c/'
CRITERIA = ['QS-1','QS-2','QS-4','QS-5','QS-6','CC-1','CC-3','CC-7','GO-I1','GO-I2','GO-I7','GO-I8']
def sha(data): return hashlib.sha256(data).hexdigest()
def dump(path, obj):
    # Coverage is a declared file input and must fit the documented 256KB observer ceiling.
    text=json.dumps(obj, ensure_ascii=False, separators=(',',':')) if path=='coverage.json' else json.dumps(obj, ensure_ascii=False, indent=2)
    (ROOT/path).write_text(text+'\n')
def ref(path): return {'payload_path': PREFIX+path, 'sha256':sha((ROOT/path).read_bytes())}
population = json.loads((ROOT/'population.json').read_text())
manifest = json.loads((ROOT/'source-manifest.json').read_text())
sources = {x['path']:x for x in manifest}

definitions = [
 ('llm-turns','llm_turns','component','LLM provider turns and local tool settlement',
  ['No provider or product execution receipt.','Selected schema/reducer inspection does not certify every variant.','Session persistence, authorization and continuation require Core evidence.']),
 ('provider-routes','llm_providers','component','Provider facades, protocol lowering and refusal boundaries',
  ['Remote compatibility and Core route admission are not established by facade source.','Protocol and multimodal helpers were not exhaustively audited.']),
 ('recorded-evidence','llm_recording','evidence','LLM recorded evidence and explicit fixture gaps',
  ['Thirty-nine assigned fixture/media sources are metadata-only in this unit.','No declared test or fixture replay was executed.','Large OpenAPI fixture exceeds documented observer file-size limit.']),
 ('plugin-contracts','plugin','component','Plugin authoring contracts and host-owned behavior',
  ['Host loader, ordering, cleanup, installation and permission implementation not established by package types.','Plan, current declarations and frozen compatibility types must remain distinct.']),
 ('codemode-interpreter','codemode','component','CodeMode explicit tools and plain-data boundary',
  ['Selected interpreter paths and supporting structural scans do not establish full language conformance.','Host adapters and leaf-tool authorization remain external to this implementation proof.','Result-envelope bytes may exceed configured value/log payload budget.']),
 ('codemode-openapi','codemode_openapi','component','OpenAPI tool planning and runtime boundaries',
  ['Response-schema validation and adapter-enforced redirect policy are documented future work.','Large reference fixture remains unobserved; no network or test execution.']),
 ('sqlite-adapters','effect_sqlite','component','Effect SQLite transactions, migration refusal and Node limits',
  ['Generic adapter source does not establish Core startup, backup, restoration or after-commit policies.','Query-builder parity and Node package consumer absence are not independently proved.','Node executeStream is explicitly unimplemented.']),
 ('http-recorder','http_recorder','component','HTTP and socket recording contracts and limitations',
  ['No build, packed-consumer, replay or network execution receipt.','Recordings do not establish timing, backpressure, cancellation or bounded-memory fidelity.','Internal WebSocket helper has different chronology from public socket replay.']),
 ('user-guides','guides_intent','operational','User-guide intent with host implementation gaps',
  ['Host implementation of guide claims was not read in this unit.','Config unknown-key behavior differs in documentary/schema surfaces and needs decoder evidence.']),
 ('maintenance-intent','maintenance_intent','maintenance','Maintenance instructions, historical plans and configuration',
  ['Historical acceptance commands and completed labels are not current execution evidence.','Generated schema publisher and Core migration implementation are outside this source subset.','No L2–L4, semantic verdict or Atlas runtime object is produced here.']),
]
defs = {slug:{'slug':slug,'key':f's1.runtime.{name}.l1','need':need,'title':title,'gaps':gaps} for slug,name,need,title,gaps in definitions}

def group(p):
    if p.startswith('docs/guides/'): return 'user-guides'
    if p.startswith(('.orchestra/','docs/specs/','docs/architecture/')) or p=='schema/config.json': return 'maintenance-intent'
    if p.startswith('packages/plugin/'): return 'plugin-contracts'
    if p.startswith('packages/codemode/'):
        return 'codemode-openapi' if '/openapi/' in p or '/openapi.test.' in p or '/fixtures/' in p else 'codemode-interpreter'
    if p.startswith(('packages/effect-drizzle-sqlite/','packages/effect-sqlite-node/')): return 'sqlite-adapters'
    if p.startswith('tooling/http-recorder/'): return 'http-recorder'
    if p.startswith('packages/llm/'):
        if '/test/' in p or '/script/' in p: return 'recorded-evidence'
        if '/src/providers/' in p or '/src/protocols/' in p or p.endswith('/cache-policy.ts'): return 'provider-routes'
        return 'llm-turns'
    raise ValueError(p)

# Every tuple contains original source line spans, inclusive, never rewritten snippets.
evidence=[]
def E(id, slug, title, *parts):
    evidence.append({'id':id,'artifact_keys':[defs[slug]['key']],'title':title,'parts':parts})
def part(p,*ranges): return (p,ranges)
E('C01','llm-turns','Compile/prepare and terminal finish boundary',part('packages/llm/src/route/client.ts',(341,390)))
E('C02','llm-turns','Dynamic schema identity versus Effect codecs',part('packages/llm/src/tool.ts',(165,196)))
E('C03','llm-turns','One-call dispatch and mapped tool failures',part('packages/llm/src/tool-runtime.ts',(22,61)))
E('C04','llm-turns','Forced structured-object tool and decode refusal',part('packages/llm/src/llm.ts',(110,142)))
E('C05','provider-routes','Protocol-owned overlay refusal and auth order',part('packages/llm/src/route/transport/http.ts',(31,42),(59,85),(88,105)))
E('C06','provider-routes','Retryable and nonretryable error classes',part('packages/llm/src/schema/errors.ts',(74,131)),part('packages/llm/src/route/executor.ts',(355,364)))
E('C07','provider-routes','Text-only escaped chronological update fallback',part('packages/llm/src/protocols/shared.ts',(104,148)))
E('C08','provider-routes','Anthropic model/placement and pending-tool boundary',part('packages/llm/src/protocols/anthropic-messages.ts',(342,395),(408,422)))
E('C09','provider-routes','Responses structured-output refusal',part('packages/llm/src/protocols/openai-responses.ts',(911,919)))
E('C10','provider-routes','Missing WebSocket service refuses the transport',part('packages/llm/src/route/transport/websocket.ts',(240,259)))
E('C11','provider-routes','Guide distinguishes model-layer implementation and Core routing',part('docs/guides/models.md',(7,16)))
evidence[-1]['artifact_keys'].append(defs['user-guides']['key'])
E('C12','recorded-evidence','Recording/replay skip and failure decisions',part('packages/llm/test/recorded-runner.ts',(48,101)))
E('C13','recorded-evidence','Unrecorded ledger rationale and examples',part('packages/llm/test/recorded-utils.ts',(51,90)))
E('C14','recorded-evidence','LLM fixture adapter uses internal recorder API',part('packages/llm/test/recorded-websocket.ts',(1,26)))
E('C15','plugin-contracts','Host binding, agent identity and metadata contract',part('packages/plugin/src/tool.ts',(3,42),(68,75)))
E('C16','plugin-contracts','Current context and scoped registration signatures',part('packages/plugin/src/v2/effect/context.ts',(12,22)),part('packages/plugin/src/v2/effect/registration.ts',(1,15)))
E('C17','plugin-contracts','TUI compatibility and distinct client capability',part('packages/plugin/src/tui.ts',(92,121),(647,671)))
E('C18','plugin-contracts','V2 target plan is not current API documentation',part('packages/plugin/src/v2/effect/PLAN.md',(1,16)))
E('C19','codemode-interpreter','Limits have no defaults and invalid configuration throws',part('packages/codemode/src/codemode.ts',(119,142)))
E('C20','codemode-interpreter','Effect validation versus render-only JSON Schema',part('packages/codemode/src/tool.ts',(3,8),(62,68)))
E('C21','codemode-interpreter','Plain-object, cycle and blocked-property refusal',part('packages/codemode/src/tool-runtime.ts',(268,293)))
E('C22','codemode-interpreter','Supervised calls, abandoned promises and fixed concurrency',part('packages/codemode/src/interpreter/runtime.ts',(692,740)),part('packages/codemode/src/stdlib/promise.ts',(1,6)))
E('C23','codemode-interpreter','Host interruption and sanitized failure',part('packages/codemode/src/tool-runtime.ts',(143,150)),part('packages/codemode/src/interpreter/runtime.ts',(3394,3406)))
E('C24','codemode-interpreter','Output payload truncation and added explanatory markers',part('packages/codemode/src/interpreter/runtime.ts',(3420,3438),(3445,3465)))
E('C25','codemode-openapi','Unsupported parameter encoding and invalid base URL',part('packages/codemode/src/openapi/spec.ts',(128,154),(428,440)))
E('C26','codemode-openapi','Host security alternatives and path refusals',part('packages/codemode/src/openapi/runtime.ts',(116,153),(210,225)))
E('C27','codemode-openapi','Response body cap before and during reading',part('packages/codemode/src/openapi/runtime.ts',(9,9),(290,326)))
E('C28','codemode-openapi','Documented unresolved OpenAPI boundaries',part('packages/codemode/src/openapi/TODO.md',(1,19)))
E('C29','sqlite-adapters','Transaction connection and cleanup control flow',part('packages/effect-drizzle-sqlite/src/effect-sqlite/session.ts',(149,196)))
E('C30','sqlite-adapters','Preserve every original and cleanup failure reason',part('packages/effect-drizzle-sqlite/src/effect-sqlite/session.ts',(237,247)))
E('C31','sqlite-adapters','Journal matching and unmatched-row refusal',part('packages/effect-drizzle-sqlite/src/up-migrations/sqlite.ts',(59,90)))
E('C32','sqlite-adapters','Migration init refusal and transactional execution',part('packages/effect-drizzle-sqlite/src/sqlite-core/effect/session.ts',(452,489)))
E('C33','sqlite-adapters','Node constructor, unsupported stream and documented usage limit',part('packages/effect-sqlite-node/src/index.ts',(59,70),(113,121)),part('packages/effect-sqlite-node/README.md',(3,13)))
E('C34','http-recorder','Auto-mode and unused-interaction exception',part('tooling/http-recorder/src/recorder.ts',(6,18),(35,58)))
E('C35','http-recorder','Replay delegates exact sequential matching',part('tooling/http-recorder/src/internal-effect.ts',(156,178)))
E('C36','http-recorder','Internal executor separates server/client event lists',part('tooling/http-recorder/src/websocket.ts',(138,169)))
evidence[-1]['artifact_keys'].append(defs['recorded-evidence']['key'])
E('C37','http-recorder','Lexical path and prewrite secret refusal',part('tooling/http-recorder/src/cassette.ts',(41,49),(104,121)))
E('C38','http-recorder','Public replay advances through interleaved traffic',part('tooling/http-recorder/src/socket.ts',(74,108),(236,244)))
E('C39','http-recorder','Pack removes internal export and rewrites public paths',part('tooling/http-recorder/script/pack.ts',(16,28)))
E('C40','user-guides','Global-only project trust and API path refusal are guide claims',part('docs/guides/mcp-project-trust.md',(3,14),(48,60)))
E('C41','user-guides','Permission reply and client-state persistence distinctions',part('docs/guides/permissions.md',(13,29)))
E('C42','user-guides','Database backup intent and refusal',part('docs/guides/database-backups.md',(1,24)))
E('C43','user-guides','Credential storage and decryption-failure intent',part('docs/guides/credentials.md',(9,17),(28,35)))
E('C44','user-guides','Behavior plugins differ from code authoring package',part('docs/guides/plugins.md',(1,14),(27,31)))
E('C45','maintenance-intent','Root test-execution authority',part('AGENTS.md',(158,166)))
E('C46','maintenance-intent','Historical phase-card baseline and commands',part('docs/architecture/phase-plans/70-90-briefs/FAC-PLUGIN.md',(7,19)))
E('C47','maintenance-intent','Removal spec separates completion labels from old inventory',part('docs/specs/storage/remove-orchestra-db.md',(43,63)))
E('C48','maintenance-intent','Deferred database constraints and reported landed indexes',part('docs/specs/database/integrity-followups.md',(1,8)))
cfg_lines=(SRC/'schema/config.json').read_text().splitlines()
def around(text,before=0,after=8):
    n=next(i for i,l in enumerate(cfg_lines,1) if text in l)
    return (max(1,n-before),min(len(cfg_lines),n+after))
E('C49','maintenance-intent','Exact config schema root, plugin entry and current property names',part('schema/config.json',(1,4),around('"ConfigV2.Plugin.Entry":',after=18),around('"plugins":',after=12),(1240,1246)))

review=['# S1-L1-C exact review evidence\n',
 'These are original contiguous source-byte excerpts at the pinned baseline. The surrounding prose identifies their role; code fences do not modify excerpt bytes. Line spans are inclusive and each span has its own SHA-256. A documentary excerpt proves what that document says, not that the described host behavior ran. No runtime or semantic pass is asserted.\n']
review += ['\n## Artifact to excerpt map\n\n| Artifact | Evidence groups |\n| --- | --- |\n']
for d in defs.values():
    review.append(f"| `{d['key']}` | {', '.join(e['id'] for e in evidence if d['key'] in e['artifact_keys'])} |\n")
index=[]
for e in evidence:
    review += [f"\n## {e['id']} — {e['title']}\n",f"Artifacts: {', '.join(e['artifact_keys'])}.\n"]
    item={k:v for k,v in e.items() if k!='parts'}; item['excerpts']=[]
    for p,ranges in e['parts']:
        s=sources[p]; lines=(SRC/p).read_bytes().splitlines(keepends=True)
        review.append(f"\nSource `{p}`; commit `{COMMIT}`; Git blob `{s['git_blob_sha']}`; full-source SHA-256 `{s['sha256']}`.\n")
        for a,z in ranges:
            assert 1<=a<=z<=len(lines),(p,a,z,len(lines))
            raw=b''.join(lines[a-1:z]); h=sha(raw)
            review.append(f"\nLines {a}–{z}; excerpt SHA-256 `{h}`.\n\n~~~~text\n")
            review.append(raw.decode('utf-8'))
            if not raw.endswith(b'\n'):review.append('\n')
            review.append('~~~~\n')
            item['excerpts'].append({'path':p,'commit':COMMIT,'git_blob_sha':s['git_blob_sha'],'source_sha256':s['sha256'],'line_start':a,'line_end':z,'byte_length':len(raw),'sha256':h})
    index.append(item)
(ROOT/'review-evidence.md').write_text(''.join(review))
dump('review-evidence-index.json',index)

# Economic judge projection. Original source and full evidence above remain intact.
compact_ranges={
 'C01':[[(344,351),(381,390)]], 'C02':[[(165,170),(174,175),(187,195)]], 'C03':[[(22,34)]],
 'C04':[[(119,141)]], 'C05':[[(73,85)]], 'C06':[[(74,84),(122,131)],[(355,364)]],
 'C07':[[(111,112),(120,121),(128,137)]], 'C08':[[(356,356),(363,373),(408,417)]], 'C09':[[(911,919)]],
 'C10':[[(240,248)]], 'C11':[[(9,16)]], 'C12':[[(68,84)]], 'C13':[[(51,60)]],
 'C14':[[(1,5),(14,24)]], 'C15':[[(3,17),(25,28),(40,42)]], 'C16':[[(12,22)],[(3,15)]],
 'C17':[[(647,653)]], 'C18':[[(1,5)]], 'C19':[[(119,134)]], 'C20':[[(62,68)]],
 'C21':[[(268,291)]], 'C22':[[(692,697),(705,716)],[(3,6)]], 'C23':[[(143,149)],[(3394,3403)]],
 'C24':[[(3432,3438),(3455,3464)]], 'C25':[[(143,154),(430,440)]],
 'C26':[[(126,145),(216,224)]], 'C27':[[(9,9),(297,306)]], 'C28':[[(10,19)]],
 'C29':[[(169,181),(190,196)]], 'C30':[[(239,246)]], 'C31':[[(64,70),(85,90)]],
 'C32':[[(452,459)]], 'C33':[[(118,120)],[(7,8),(13,13)]], 'C34':[[(6,18),(35,42)]],
 'C35':[[(160,171)]], 'C36':[[(152,169)]], 'C37':[[(41,49),(109,112)]],
 'C38':[[(89,105),(240,240)]], 'C39':[[(16,25)]], 'C40':[[(3,8),(48,48),(60,60)]],
 'C41':[[(15,17),(22,22),(26,26)]], 'C42':[[(8,24)]], 'C43':[[(28,35)]], 'C44':[[(1,3),(27,31)]],
 'C45':[[(160,160)]], 'C46':[[(9,9)]], 'C47':[[(45,49),(58,63)]], 'C48':[[(1,8)]],
 'C49':[[around('"ConfigV2.Plugin.Entry":',after=18),around('"plugins":',after=8),(1240,1246)]]
}
compact_omitted={'C04','C06','C10','C17','C39','C43'}
compact_evidence=[e for e in evidence if e['id'] not in compact_omitted]
compact_sources=sorted({p for e in compact_evidence for p,_ in e['parts']})
source_ids={p:f'S{i:02d}' for i,p in enumerate(compact_sources,1)}
compact=['# S1-L1-C compact exact evidence\n\n',
 f'Baseline for every source: `{COMMIT}`. This projection selects decisive original line spans; full evidence and all captured bytes remain in `review-evidence.md` and `sources/`. IDs match the full archive. Documentary excerpts are intent evidence only. No execution or semantic verdict is asserted. Excerpt byte hashes are in `review-evidence-compact-index.json`. Supplementary helper, retry, TUI, packaging and credential-guide groups C04, C06, C10, C17, C39 and C43 remain in the full archive; they are omitted here for economy, not treated as disproved or accepted.\n',
 '\n## Artifact to excerpt map\n\n| Artifact | Evidence groups |\n| --- | --- |\n']
for d in defs.values():compact.append(f"| `{d['key']}` | {', '.join(e['id'] for e in compact_evidence if d['key'] in e['artifact_keys'])} |\n")
compact.append('\n## Source identities\n\n| ID | Repository path | Git blob |\n| --- | --- | --- |\n')
for p in compact_sources:compact.append(f"| {source_ids[p]} | `{p}` | `{sources[p]['git_blob_sha']}` |\n")
compact_index=[]
for e in compact_evidence:
    compact.append(f"\n## {e['id']} — {e['title']}\n")
    item={'id':e['id'],'artifact_keys':e['artifact_keys'],'excerpts':[]}
    for i,(p,_) in enumerate(e['parts']):
        lines=(SRC/p).read_bytes().splitlines(keepends=True)
        for a,z in compact_ranges[e['id']][i]:
            raw=b''.join(lines[a-1:z]);assert 1<=a<=z<=len(lines)
            compact.append(f'\n{source_ids[p]}, lines {a}–{z}:\n\n~~~~text\n')
            compact.append(raw.decode('utf-8'))
            if not raw.endswith(b'\n'):compact.append('\n')
            compact.append('~~~~\n')
            item['excerpts'].append({'path':p,'commit':COMMIT,'git_blob_sha':sources[p]['git_blob_sha'],'line_start':a,'line_end':z,'sha256':sha(raw),'byte_length':len(raw)})
    compact_index.append(item)
(ROOT/'review-evidence-compact.md').write_text(''.join(compact))
dump('review-evidence-compact-index.json',compact_index)

# Retain the recipe sources actually supplied by the parent without guessing repository paths.
protocol_manifest=[]
(ROOT/'recipe-inputs').mkdir(exist_ok=True)
for name in ['SKILL.md','principles.md','transport.md','fatia-1.md','criteria.json']:
    data=(ROOT.parents[1]/'protocol'/name).read_bytes()
    (ROOT/'recipe-inputs'/name).write_bytes(data)
    protocol_manifest.append({'path':'recipe-inputs/'+name,'sha256':sha(data),'byte_length':len(data),'provided_protocol_commit':PROTOCOL,'provenance':'Parent-supplied pinned mirror; no independent connector capture by this producer.'})
dump('recipe-inputs/manifest.json',protocol_manifest)
recipe=f'''# S1-L1-C production recipe

Execution: `c56ee4c3-b9dc-4569-aeb0-d3cfa5c2a502`. Producer: `/root/producer_c`.
Repository: `gustavomhss/hugr-orchestra`; baseline `{COMMIT}`; protocol `{PROTOCOL}`.
Scope: `orchestra.s1`; unit: `S1-L1-C`; layer: 1 only.

The full visible assignment is preserved unchanged in `request.txt`; later parent constraints are preserved in `request-steering.txt` (SHA-256 `{sha((ROOT/'request-steering.txt').read_bytes())}`), with the earlier addenda also retained in `request-addenda.txt`. The recipe follows execute-genesis, principles and common transport from the supplied pinned mirror in `recipe-inputs/`. Applicable criterion IDs: {', '.join(CRITERIA)}.

Production method: read decisive implementation and package intent through the GitHub connector at the baseline; preserve base64-decoded source bytes; verify Git blob SHA-1 and compute SHA-256/length; group coherent L1 records by actual need; distinguish observed code, documentary intent, interpretation and gaps; provide exact evidence excerpts and one coverage disposition per assigned Git entry. Support/test/fixture inspection can be shallower with explicit rationale. No title-only semantic acceptance.

No oracle or reserved answer was read. No product tests, live provider calls, credential values, external writes, builds or package installs were used. Python scripts here only assemble source-byte artifacts and verify transport consistency. Test declarations are not test results. No runtime input version, CAS identifier, semantic review or consumer receipt is invented. L1 bodies require the parent's independent semantic review before downstream acceptance.

Artifact source_refs bind captured repository bytes; input_keys declare those source inputs and this recipe/request/coverage. Uncaptured assigned fixture/media entries remain coverage gaps rather than fictional input observations. There are no accepted artifact build predecessors in this L1 unit. Links to other bodies are navigation only.
'''
(ROOT/'recipe.md').write_text(recipe)

semantic_prefixes=['packages/plugin/src/','tooling/http-recorder/src/','packages/llm/src/providers/','packages/codemode/src/openapi/','packages/effect-drizzle-sqlite/src/effect-sqlite/','packages/effect-drizzle-sqlite/src/up-migrations/']
semantic_files=set('''packages/codemode/src/codemode.ts
packages/codemode/src/interpreter/model.ts
packages/codemode/src/interpreter/runtime.ts
packages/codemode/src/tool.ts
packages/codemode/src/tool-runtime.ts
packages/codemode/src/tool-error.ts
packages/codemode/src/values.ts
packages/codemode/src/stdlib/promise.ts
packages/codemode/src/stdlib/value.ts
packages/codemode/src/stdlib/json.ts
packages/effect-drizzle-sqlite/src/sqlite-core/effect/session.ts
packages/effect-drizzle-sqlite/src/sqlite-core/effect/raw.ts
packages/effect-sqlite-node/src/index.ts
packages/llm/src/llm.ts
packages/llm/src/tool.ts
packages/llm/src/tool-runtime.ts
packages/llm/src/cache-policy.ts
packages/llm/src/provider.ts
packages/llm/src/provider-error.ts
packages/llm/src/schema/errors.ts
packages/llm/src/schema/messages.ts
packages/llm/src/schema/events.ts
packages/llm/src/protocols/shared.ts
packages/llm/src/protocols/anthropic-messages.ts
packages/llm/src/protocols/openai-chat.ts
packages/llm/src/protocols/openai-responses.ts
packages/llm/src/protocols/openai-compatible-chat.ts
packages/llm/src/protocols/gemini.ts
packages/llm/src/protocols/bedrock-converse.ts
packages/llm/src/protocols/bedrock-event-stream.ts
packages/llm/src/protocols/utils/bedrock-auth.ts
packages/llm/src/protocols/utils/lifecycle.ts
packages/llm/src/protocols/utils/response-format.ts
packages/llm/src/protocols/utils/tool-schema.ts
packages/llm/src/utils/record.ts'''.splitlines())
semantic_prefixes.append('packages/llm/src/route/')
harness=set('''packages/llm/test/recorded-test.ts
packages/llm/test/recorded-runner.ts
packages/llm/test/recorded-utils.ts
packages/llm/test/recorded-websocket.ts
packages/llm/test/provider/golden.recorded.test.ts'''.splitlines())
by_path=collections.defaultdict(list)
for e in index:
    for x in e['excerpts']:by_path[x['path']].append({'id':e['id'],'line_start':x['line_start'],'line_end':x['line_end']})
coverage=[]
for x in population:
    p=x['path'];slug=group(p);d=defs[slug];captured=p in sources
    family=p.split('/')[1] if p.startswith(('packages/','tooling/')) else 'guides' if p.startswith('docs/guides/') else 'maintenance-documents'
    kind='implementation';depth='structural_scan';status='captured_structural_scan';reason='Captured declarations and opening structure; grouped support only, no independent semantic acceptance or exhaustive branch claim.'
    if not captured:
        kind='media_asset' if p.endswith('.png') else 'fixture';depth='git_metadata_only';status='not_read'
        reason='Assigned fixture/media variant retained by pinned Git metadata. Representative fixture structures and decisive harness were inspected; this body is not semantic evidence and no conclusion depends on its contents.'
        if x['size']>256000:reason+=' File exceeds the documented 256,000-byte Atlas observer ceiling; preserve unavailable/unobserved, never absent.'
    elif '/fixtures/' in p:
        kind='fixture';depth='json_structure';status='captured_structure_read';reason='Decoded JSON root/envelope and interaction metadata inspected; sampled fixture data does not establish provider behavior or passing replay.'
    elif '/test/' in p:
        kind='test_support' if not ('.test.' in p or p.endswith('.types.ts')) else 'test'
        if p in harness:depth='decisive_harness_read';status='captured_semantic_read';reason='Harness mode, filtering, explicit gaps and refusal decisions read. No tests were executed and scenario declarations are not outcomes.'
        else:depth='declaration_scan';status='captured_declarations_read';reason='All declaration matches preserved in test-declarations.json; inspected bounded declaration samples. Test bodies are not accepted semantic or runtime proof.'
    elif p=='schema/config.json':
        kind='configuration_schema';depth='structured_schema_read';status='captured_selected_read';reason='Parsed schema root, definition/property membership, required fields and additionalProperties policy; generated/publisher/runtime relationship remains unverified.'
    elif p.endswith('.md'):
        kind='instruction' if p.endswith(('AGENTS.md','SKILL.md')) else 'historical_plan' if '/70-90-briefs/' in p else 'design_intent' if ('/specs/' in p or p.endswith(('PLAN.md','DESIGN.md','codemode.md'))) else 'documentation'
        depth='document_read';status='captured_semantic_read';reason='Document content read as attributed intent/instructions; implementation and historical claims are not automatically accepted runtime facts.'
        if p.endswith(('DESIGN.md','call-sites.md')):depth='selected_document_sections';status='captured_selected_read';reason='Status, proposed API and representative contract sections read. Draft/sketch is distinguished from current exported implementation.'
    elif p.endswith(('package.json','tsconfig.json','bunfig.toml')):
        kind='build_configuration';depth='configuration_read';status='captured_read';reason='Configuration bytes read to establish declared commands, exports/dependencies and execution guard only. No install/build/typecheck/test was run.'
    elif p in semantic_files or any(p.startswith(pre) for pre in semantic_prefixes):
        depth='decisive_implementation_read';status='captured_semantic_read';reason='Implementation read at decisive contract, execution or refusal boundaries supporting its L1 body. Selected large-file paths and type contracts do not certify every branch or host behavior.'
    elif '/src/sqlite-core/' in p or '/src/internal/' in p:
        kind='vendored_adapter_support';reason='Copied generic Drizzle adapter declarations and selected execution support inspected; primary driver/transaction/migration facts have direct implementation evidence. No full query parity claim.'
    elif '/example' in p or '/script/' in p:
        kind='example_or_script';reason='Support structure and selected relevant source inspected; examples are not consumer execution evidence and recording/build scripts were not run.'
        if p.startswith('tooling/http-recorder/script/'):depth='script_read';status='captured_semantic_read';reason='Build/pack/consumer-verification source read, including removal of internal export; no script execution or successful package claim.'
    elif p.endswith(('LICENSE','.gitignore','.sql')):
        kind='license_or_support';reason='Captured support bytes retained; no runtime semantic claim rests on this support file.'
    row={'path':p,'commit':COMMIT,'git_blob_sha':x['sha'],'git_byte_length':x['size'],'family':family,'kind':kind,'depth':depth,'justification':reason,'read_status':status,'need':'evidence' if kind in ('test','test_support','fixture','media_asset') else d['need'],'artifact_key':d['key'],'disposition':'bounded_evidence' if status in ('captured_semantic_read','captured_selected_read','captured_read') else 'classification_only','semantic_acceptance':'not_asserted','captured':captured,'review_excerpts':by_path[p]}
    if captured:row.update({'sha256':sources[p]['sha256'],'byte_length':sources[p]['byte_length']})
    else:row['gap']='Content not captured/read; Git metadata is not file-content observation.'
    coverage.append(row)
dump('coverage.json',{'schema':'genesis-source-coverage/v1','unit':'S1-L1-C','scope':'orchestra.s1','source_revision':COMMIT,'entry_count':len(coverage),'capture_root':'sources/','entries':coverage,'counts':{'captured_assigned':sum(r['captured'] for r in coverage),'metadata_only':sum(not r['captured'] for r in coverage),'by_depth':dict(collections.Counter(r['depth'] for r in coverage))},'note':'A disposition covers ownership/classification; it is not semantic acceptance. Root AGENTS is an additional captured source outside the 323 assigned entries.'})

cfg=json.loads((SRC/'schema/config.json').read_text())
dump('config-schema-scan.json',{'source':'schema/config.json','root':{k:v for k,v in cfg.items() if k!='$defs'},'definitions':{k:{'type':v.get('type'),'required':v.get('required'),'additionalProperties':v.get('additionalProperties'),'properties':list(v.get('properties',{}))} for k,v in cfg['$defs'].items()}})

response='''Completed S1-L1-C as a bounded L1 production unit in `/workspace/scratch/2b46fb541868/genesis-s1/producers/c`.

The unit contains 10 L1 bodies, coverage dispositions for all 323 assigned entries, 285 byte-verified source captures (284 assigned plus root AGENTS), and 49 exact review-evidence groups. Thirty-nine fixture/media entries remain explicitly metadata-only; six representative JSON fixtures received structure inspection. The 58 assigned non-fixture test/support files have a preserved declaration scan, not execution results.

The bodies establish source-backed boundaries for provider turns and validation, provider configuration/protocol refusal, recording evidence, plugin contracts, CodeMode execution/OpenAPI, SQLite cleanup/migration refusal, HTTP/socket replay, guide intent, and historical maintenance/configuration material. They distinguish public socket chronology from the internal LLM fixture helper; configuration/schema and historical-plan differences remain explicit.

Key deliverables are `artifacts.json`, `coverage.json`, `source-manifest.json`, the full `review-evidence.md`, the compact `review-evidence-compact.md`, exact excerpt indexes, `recipe.md`, `request.txt`, `request-steering.txt`, `request-addenda.txt`, `response.md`, and `bodies/`. `review-dossier.md` concatenates the original bodies and compact evidence without rewriting them. `validation.json` and `delivery-manifest.json` report deterministic transport/hash checks and file hashes.

No product tests, builds, network provider calls, credential reads, remote writes, oracle reads or Atlas runtime operations were performed. There is no semantic review verdict or runtime PASS. Host lifecycle, Core routing/persistence policies, exhaustive interpreter/query parity and uncaptured fixture contents remain declared limits for subsequent review.
'''
response += '\nSHA-256 bindings:\n\n' + '\n'.join(f'- `{p}`: `{sha((ROOT/p).read_bytes())}`' for p in ['source-manifest.json','coverage.json','review-evidence.md','review-evidence-compact.md']) + '\n'
(ROOT/'response.md').write_text(response)

dossier=['# S1-L1-C producer dossier\n\n',
 'Producer transport only. The following bodies and compact evidence are concatenated verbatim from the named UTF-8 files. They assert bounded L1 source facts, not judge verdicts. Source capture/coverage limits remain explicit.\n']
for slug,d in defs.items():
    path='bodies/'+slug+'.md';raw=(ROOT/path).read_bytes()
    dossier.extend([f"\n---\n\nArtifact `{d['key']}`; file `{path}`; SHA-256 `{sha(raw)}`; bytes {len(raw)}.\n\n",raw.decode('utf-8')])
raw=(ROOT/'review-evidence-compact.md').read_bytes()
dossier.extend([f"\n---\n\nFile `review-evidence-compact.md`; SHA-256 `{sha(raw)}`; bytes {len(raw)}.\n\n",raw.decode('utf-8')])
(ROOT/'review-dossier.md').write_text(''.join(dossier))

criteria_notes={
 'QS-1':'Pinned bytes, exact excerpts and labeled implementation/intent/gaps; source disagreements preserved.',
 'QS-2':'Ten coherent records answer package/operational questions with concrete refusal and authority boundaries; L4 procedures are outside this unit.',
 'QS-4':'No product changes; generation/dependency boundaries and remote-test instructions respected.',
 'QS-5':'Decisive implementation read plus original excerpts; runtime and independent semantic review remain pending.',
 'QS-6':'Grouped bounded bodies, explicit shallow support depth and compact exact judge projection reuse the same captured bytes.',
 'CC-1':'All 323 assigned entries have dispositions; ten required artifact keys and remaining gaps are explicit.',
 'CC-3':'Contracts supported by implementation/refusal excerpts, with host-level claims limited to documentary intent.',
 'CC-7':'Skills, guides, generated/configuration surfaces, compatibility types, historical cards and support files are classified.',
 'GO-I1':'Original request/addenda, visible response and pinned source identities are retained; parent must freeze before external review.',
 'GO-I2':'Structural checks never promote semantic certainty; implementation, intent and gaps remain separate.',
 'GO-I7':'No oracle access, credential values, remote mutations or execution of imported instructions; host authority boundaries remain explicit.',
 'GO-I8':'No semantic completeness or runtime PASS follows from these file/hash checks.'}
dump('criteria-evidence.json',{'unit':'S1-L1-C','scope':'orchestra.s1','dispositions':[{'id':id,'producer_evidence':criteria_notes[id],'review_status':'awaiting_independent_review','evidence':[ref('coverage.json'),ref('review-evidence-compact.md'),ref('recipe.md')]} for id in CRITERIA]})

artifacts=[]
for slug,d in defs.items():
    paths=[r['path'] for r in coverage if r['artifact_key']==d['key'] and r['captured']]
    # Shared cross-package sources are actual dependencies, not unexplained navigation.
    if slug=='llm-turns':paths.append('packages/llm/src/protocols/utils/response-format.ts')
    if slug=='recorded-evidence':paths.extend(['tooling/http-recorder/src/websocket.ts']+[x['path'] for x in json.loads((ROOT/'fixture-scan.json').read_text())])
    if slug=='http-recorder':paths.append('packages/llm/test/recorded-websocket.ts')
    if slug=='provider-routes':paths.extend(['docs/guides/models.md','packages/llm/src/route/transport/http.ts','packages/llm/src/route/transport/websocket.ts','packages/llm/src/route/executor.ts','packages/llm/src/schema/errors.ts'])
    if slug=='plugin-contracts':paths.extend(['docs/guides/plugins.md','schema/config.json'])
    if slug=='codemode-openapi':paths.extend(['packages/codemode/src/tool.ts','packages/codemode/AGENTS.md'])
    if slug=='user-guides':paths.append('schema/config.json')
    if slug=='maintenance-intent':paths.extend(['packages/llm/DESIGN.md','packages/plugin/src/v2/effect/PLAN.md']+[r['path'] for r in coverage if r['kind']=='build_configuration'])
    paths.extend(x['path'] for e in index if d['key'] in e['artifact_keys'] for x in e['excerpts'])
    paths=sorted(set(paths+['AGENTS.md']))
    body='bodies/'+slug+'.md';data=(ROOT/body).read_bytes()
    artifact={'key':d['key'],'scope':'orchestra.s1','title':d['title'],'layer':1,'need':d['need'],'body':{'path':'producers/c/'+body,'encoding':'utf-8','byte_length':len(data),'sha256':sha(data)},'authority':{'scope':'orchestra.s1','basis':'Pinned source implementation where identified; documentation is attributed intent only. Coverage explicitly distinguishes semantic, selected, structural and metadata-only depth. No host or runtime acceptance is implied.'},'validity':'supported','gaps':d['gaps'],'evidence':[ref('review-evidence.md'),ref('review-evidence-index.json'),ref('review-evidence-compact.md'),ref('coverage.json'),ref('source-manifest.json'),ref('recipe-inputs/manifest.json')],'input_keys':['file:'+p for p in paths]+['file:'+PREFIX+p for p in ['recipe.md','request.txt','request-steering.txt','request-addenda.txt','coverage.json','population.json','recipe-inputs/manifest.json']],'source_refs':[{k:sources[p][k] for k in ['commit','path','git_blob_sha','sha256']} for p in paths],'recipe_ref':ref('recipe.md'),'build_dependencies':[],'navigation':[],'producer_request_ref':ref('request.txt'),'producer_response_ref':ref('response.md'),'semantic_review_refs':[],'runtime_receipt_refs':[]}
    artifacts.append(artifact)
dump('artifacts.json',{'schema':'genesis-native-artifact-stubs/v1','unit':'S1-L1-C','session':'S1','scope':'orchestra.s1','source_revision':COMMIT,'protocol_revision':PROTOCOL,'execution_id':'c56ee4c3-b9dc-4569-aeb0-d3cfa5c2a502','criteria':CRITERIA,'required_artifact_keys':[a['key'] for a in artifacts],'artifacts':artifacts,'known_limits':['Producer-local L1 source records only; independent semantic judges and real Atlas runtime proofs remain pending.','No uncaptured fixture is represented as a captured file input or accepted semantic source.']})

# Byte/shape consistency validation, not product or semantic tests.
checks=[]
assert len(population)==323 and len(coverage)==323
assert len({r['path'] for r in coverage})==323
assert {r['path'] for r in coverage}=={r['path'] for r in population}
checks.append('Population membership: 323 unique assigned paths, all with dispositions.')
for p,m in sources.items():
    data=(SRC/p).read_bytes()
    assert sha(data)==m['sha256'] and len(data)==m['byte_length'],p
    assert hashlib.sha1(b'blob '+str(len(data)).encode()+b'\0'+data).hexdigest()==m['git_blob_sha'],p
checks.append(f'All {len(sources)} captured source SHA-256, byte lengths and Git blob hashes match.')
for a in artifacts:
    assert a['layer']==1 and a['need'] in {'entry','ownership','maintenance','operational','flow','evidence','component'}
    data=(ROOT/a['body']['path'].removeprefix('producers/c/')).read_bytes()
    assert sha(data)==a['body']['sha256'] and len(data)==a['body']['byte_length']
    assert any(a['key'] in e['artifact_keys'] for e in index)
    assert not a['runtime_receipt_refs'] and not a['semantic_review_refs']
checks.append('All 10 L1 stubs have legal needs, exact body bytes, input/source refs and original request/response bindings.')
for i in index:
    for x in i['excerpts']:
        raw=b''.join((SRC/x['path']).read_bytes().splitlines(keepends=True)[x['line_start']-1:x['line_end']])
        assert sha(raw)==x['sha256'] and len(raw)==x['byte_length']
checks.append('All 49 review groups contain exact, independently hashed source excerpts; every L1 body is covered.')
for i in compact_index:
    for x in i['excerpts']:
        raw=b''.join((SRC/x['path']).read_bytes().splitlines(keepends=True)[x['line_start']-1:x['line_end']])
        assert sha(raw)==x['sha256'] and len(raw)==x['byte_length']
checks.append('Compact evidence uses original exact source spans and the dossier includes verbatim body/evidence bytes.')
dump('validation.json',{'schema':'genesis-transport-validation/v1','unit':'S1-L1-C','checks':checks,'population_entries':323,'captured_assigned_sources':284,'additional_sources':1,'source_count':len(sources),'artifact_count':len(artifacts),'review_group_count':len(index),'metadata_only_entries':39,'product_tests_run':False,'semantic_review':'not_performed','runtime_receipts':'not_observed','limits':'Only deterministic file/shape/hash validation. This is not a semantic or runtime PASS.'})
files=[]
for f in sorted(ROOT.rglob('*')):
    if not f.is_file() or f.name=='delivery-manifest.json':continue
    data=f.read_bytes();files.append({'path':str(f.relative_to(ROOT)),'byte_length':len(data),'sha256':sha(data)})
dump('delivery-manifest.json',{'schema':'genesis-producer-files/v1','unit':'S1-L1-C','file_count':len(files),'files':files,'self_hash':'Compute externally; manifest intentionally excludes itself.'})
print(json.dumps({'artifacts':len(artifacts),'sources':len(sources),'coverage':len(coverage),'evidence_groups':len(index),'metadata_only':39,'top_level_hashes':{p:sha((ROOT/p).read_bytes()) for p in ['artifacts.json','coverage.json','source-manifest.json','review-evidence.md','response.md','delivery-manifest.json']}},indent=2))
