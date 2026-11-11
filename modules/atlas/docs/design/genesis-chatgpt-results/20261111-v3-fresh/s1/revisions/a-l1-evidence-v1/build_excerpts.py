from pathlib import Path
import hashlib, json

ROOT=Path('/workspace/scratch/2b46fb541868/genesis-s1')
BASE=ROOT/'producers/a'
OUT=ROOT/'revisions/a-l1-evidence-v1'
PIN='1cde2ff7a71bcf7aecb5d030917b577165135d38'
sha=lambda b:hashlib.sha256(b).hexdigest()
captures=json.loads((BASE/'capture-manifest.json').read_text())
by_source={s['path']:s for s in captures['sources']}
artifacts=json.loads((BASE/'artifacts.json').read_text())['artifacts']
old=json.loads((BASE/'excerpt-map.json').read_text())
selected=[]

def add(keys,path,lo,hi,claim,authority='observed_implementation'):
    selected.append({'artifact_keys':['s1.core.'+key for key in keys.split(',')], 'path':path,'start_line':lo,'end_line':hi,'claim_supported':claim,'authority':authority})

# Only already-captured bytes. Each selection fills material information absent
# from the compact projection; existing excerpt IDs remain separate and frozen.
add('session-admission','packages/core/src/session.ts',357,364,'Existing Session identity wins before applying new creation fields.')
add('session-admission','packages/core/src/session.ts',393,414,'Concurrent creation adopts the recorded Session; post-create hooks cannot undo it.')
add('session-admission','packages/core/src/session.ts',304,325,'Prompt hooks occur before admission; an already durable message skips re-asking and leaves retry reconciliation to admission.')
add('session-admission','packages/core/src/session/input.ts',96,158,'Historical prompt reconciliation needs the original durable Prompted event for delivery and verifies all projection identity before inserting a promoted inbox row.')
add('session-admission','packages/core/src/session/input.ts',348,390,'Steers use the admission cutoff and sequence order; queue promotion takes one oldest pending row.')
add('session-admission','packages/core/src/session/projector.ts',283,310,'Prompted promotes and writes visible projection; PromptAdmitted only projects admission under the event machinery.')

add('session-execution','packages/core/src/session/execution/local.ts',14,29,'The drain resolves the stored Session and routes through its concrete Location.')
add('session-execution','packages/core/src/session/run-coordinator.ts',136,153,'Stop targets the exact process-local entry and clears pendingWake; it is not a durable cluster lease.')
add('session-execution,security,context','packages/core/src/session/runner/llm.ts',185,215,'Stored placement and governance precede promotion; agent and Session rules are materialized; missing context is initialized before input visibility and new input resets the step allowance.')
add('session-execution,context','packages/core/src/session/runner/llm.ts',237,270,'History follows baselineSeq; the final provider step advertises no tools; hosted engine history bypasses the Core provider compaction transform.')
add('session-execution','packages/core/src/session/runner/llm.ts',671,682,'Interrupting a drain cancels all of that Session’s pending permission and question requests.')

add('persistence','packages/core/src/database/migration.ts',21,48,'An unknown nonempty database is refused; fresh schema initialization uses an immediate transaction with a second existence check.')
add('persistence','packages/core/src/database/migration.ts',55,94,'Unknown journal entries are refused; pending migrations first get VACUUM INTO backup and retention pruning.')
add('persistence','packages/core/src/database/migration.ts',150,166,'Every pending migration rereads its identity inside an immediate write transaction before running and journaling it.')
add('persistence,entry','packages/core/src/database/README.md',7,38,'Database path, ordered migration identity and generated schema maintenance are user-data/maintenance contracts; history cannot be discarded.', 'repository_normative_documentation')
add('persistence','packages/core/src/event.ts',319,367,'Strict owner mismatch fails; exact replay identity is reconciled; conflicting replay and sequence gaps fail; ordinary foreign owner replay returns without applying.')
add('persistence','packages/core/src/event.ts',383,425,'Projectors, optional commit hook, sequence and sealed event insertion execute before the same immediate transaction closes.')
add('persistence','packages/core/src/event.ts',449,455,'The implementation explicitly refuses combining persist:false with a commit hook.')
add('persistence','packages/core/src/event.ts',681,699,'The durable stream subscribes to wakes before reading history and advances from stored durable events.')

add('context','packages/core/src/system-context/registry.ts',38,60,'Scoped registrations reject duplicate keys; load sorts keys and provides the current turn only to load effects.')
add('context','packages/core/src/instruction-context.ts',70,80,'Configured project instructions must resolve inside the project while global inputs have distinct authority.')
add('context','packages/core/src/instruction-context.ts',101,119,'Escaped, missing discovered or missing configured instructions yield unavailable, not an empty/deleted context.')
add('context','packages/core/src/session/history.ts',24,52,'Model history is selected by compaction and baseline sequence predicates, rather than deleting prior transcript rows.')
add('context','packages/core/src/session/history.ts',82,85,'loadAll explicitly retains compacted history.')
add('context','packages/core/src/session/compaction.ts',17,20,'The exact default buffer, tail, tool-character and summary-output caps are constants.')
add('context','packages/core/src/session/compaction.ts',225,242,'The compaction LLM request has no tools; provider errors and text are collected before the successful-summary branch already shown in C018.')
add('context','packages/core/src/session/compaction.ts',313,326,'The composed default transform preserves messages and afterStep does nothing; alternate behavior requires replacement.')

add('tools','packages/core/src/tool/tool.ts',102,122,'Canonical Tool.make decodes input and encodes/validates output, mapping violations to ToolFailure.')
add('tools','packages/core/src/tool/tool.ts',156,177,'Tool.dynamic passes input undecoded to its external owner; local JSON Schema decoding must not be inferred.')
add('tools','packages/core/src/tool/registry.ts',145,173,'Safety inspection precedes contextual bounding; Lean projection is selected only when generic bounding has not already retained a full file.')
add('tools','packages/core/src/tool/registry.ts',243,274,'Scoped cleanup removes its own registrations, and latest local entries overlay process registrations during materialization.')
add('tools','packages/core/src/tool/registry.ts',321,334,'Registry composition depends on safety/output, not PermissionV2; ordinary action/resource authorization remains a leaf boundary.')
add('tools','packages/core/src/tool-output-store.ts',165,200,'The generic bound limits contextual text but preserves structured output and media; managed paths remain observable.')
add('tools','packages/core/src/tool-output-store.ts',16,19,'Default contextual limits and retained-output lifetime are fixed constants.')
add('tools','packages/core/src/tool-output-store.ts',203,215,'Retention deletes only old tool_* files; capture/body state is not inferred from a model preview.')

add('security','packages/core/src/permission.ts',76,85,'Rule evaluation is last-match with default ask.')
add('security','packages/core/src/permission.ts',140,170,'Ordinary configured authorization resolves agent permissions, and configured deny precedes saved project allow; compare Session rules in the runner excerpt.')
add('security','packages/core/src/tool/bash.ts',193,217,'Bash permission precedes profile handling; read-only agents require confinement without fallback; confined background launches are refused.')
add('security','packages/core/src/tool/bash.ts',233,245,'Background launch preparation uses the same sandbox wrapper with its lifetime bound to the process.')
add('security','packages/core/src/tool/bash.ts',255,267,'Foreground execution wraps before agent-terminal launch; this is the actual order needed to interpret the older unsandboxed claim.')
add('security','packages/core/src/tool-safety-sandbox.ts',24,47,'Environment scrub is limited to tool children and recognized patterns; discovery alone does not establish confinement.')
add('security','packages/core/src/tool/agent-terminal.ts',36,44,'Agent terminal is opt-in, excludes Windows/verbatim command paths and takes an already confined command.')
add('security','packages/core/src/credential/cipher.ts',27,37,'Cipher implementation uses AES-256-GCM with a random 12-byte IV and auth tag.')
add('security','packages/core/src/credential/cipher.ts',57,75,'OS keychain is preferred; fallback to a data-directory key file is explicitly weaker.')
add('security','packages/core/src/credential.ts',83,117,'Memory inheritance is opt-in; legacy sealing failure preserves readability; undecodable rows are skipped and left untouched.')
add('security,entry','AGENTS.md',182,192,'Current terminal instructions require the sandbox-before-PTY ordering and exact environment boundary.', 'repository_normative_documentation')

add('configuration','packages/core/src/config.ts',215,245,'Project documents are discovered once at Location opening and general settings apply global, direct, then .orchestra precedence; C032 supplies reverse policy order/global refresh.')
add('configuration','packages/core/src/config/trust.ts',40,56,'Approve is parent-aware; revoke removes only the folder’s own entry, preserving any trusted parent.')
add('configuration','packages/core/src/config/trust.ts',63,81,'Approval canonicalizes an existing absolute folder and refuses filesystem root.')

add('project','packages/core/src/project.ts',125,148,'Repository identity chooses remote, cache, then root commit; no repository returns the global project at filesystem root.')
add('project','packages/core/src/location-mutation.ts',90,132,'Physical resolution follows existing ancestors and bounded dangling symlinks; path authority is not just lexical normalization.')
add('project','packages/core/src/project/checkpoint.ts',99,132,'Checkpoint identity, exact retry and retained owner are checked before requiring the current Session; retries survive source Session deletion.')
add('project','packages/core/src/project/checkpoint.ts',163,185,'Reads bind project and digest; lists enforce the default and maximum page limits.')
add('project','packages/core/src/session.ts',537,568,'Fork writes copied projections with new message IDs and negative sequence positions, rather than replaying original side effects.')

add('extensions','packages/core/src/state.ts',63,91,'State rebuilds from initial plus ordered transforms, finalizes before commit, and serializes rebuild/read with a semaphore.')
add('extensions','packages/core/src/plugin.ts',115,151,'Plugin activation uses a child scope, publishes only after materialization, and closes/replays after failure.')
add('extensions','packages/core/src/plugin.ts',187,207,'Boot retry is collected flush followed by per-plugin reinstall after failure; this is not outer-batch durable atomicity.')
add('extensions','packages/core/src/mcp.ts',235,263,'Each ordinary MCP call asserts its namespaced permission and forwards cancellation and timeout to the SDK.')
add('extensions','packages/core/src/mcp.ts',283,309,'Stale asynchronous connection/catalog results close their client before registration; connected follows successful tools registration.')
add('extensions','packages/core/src/skill.ts',153,172,'Generation invalidation prevents stale in-flight skill loading from refilling a new cache.')
add('extensions','packages/core/src/integration.ts',231,238,'OAuth attempts are synchronized in-memory state owned by the Location layer; this map does not establish a durable resumable workflow.')

add('capability','packages/core/src/capability/invocation.ts',34,50,'The issued-frame symbol is private and the host boundary expressly does not prove persisted Session/tool-part existence.')
add('capability','packages/core/src/capability/policy.ts',35,78,'Persisted validation rechecks placement, current root pending/running tool and the exact running child lineage.')
add('capability','packages/core/src/capability/tools.ts',36,68,'Leaf construction/registration is Location-owned and lazy vendor I/O stays first-use; a failed noninterrupt startup sweep is logged.')
add('capability','packages/core/src/scheduled-task/port.ts',7,26,'The host binds scheduler process state and an absent binding defects explicitly.')
add('capability','packages/core/src/capability/mcp/README.md',43,70,'Transport catalog/session bounds are documented by the native MCP owner; this is normative intent, not a newly observed implementation run.', 'repository_normative_documentation')

add('automation','packages/core/src/actions.ts',49,85,'Actions binding is obtained lazily on first operation and provider read adapters are explicit.')
add('automation','packages/core/src/actions/operations.ts',60,96,'Prepare strictly decodes intent, verifies binding revision, reconciles exact retry and refuses capacity/unknown-outcome overflow before insertion.')
add('automation','packages/core/src/scheduled-task.ts',272,301,'Stale takeover checks exact prior ownership/claim and distinguishes admitted exact retry from void unadmitted dispatch.')
add('automation','packages/core/src/board/decision.ts',90,128,'Changing a decision updates standing lineage, while recording an outcome logs a stated reason rather than independently verifying work.')

add('research','packages/core/src/backend-toolkit/index.ts',180,198,'Dependency and host-floor checks precede acquisition; cross-target prefetch is not host execution.')
add('research','packages/core/src/research-toolkit/index.ts',52,67,'Config can lower the owner byte caps, never raise them.')
add('research','packages/core/src/research-toolkit/index.ts',281,300,'Status record writes are best effort; a failed rename/write can lose status and is not evidence of a successful build.')
add('research','packages/core/src/research/ledger.ts',32,51,'Research identity uses canonical object order, operation tuple and execution-scoped event ID.')
add('research','packages/core/src/research/ledger.ts',62,84,'Retained research events are filtered/decoded and scope/receipt mismatches are refused.')

add('runtime','packages/core/src/effect/app-node.ts',1,14,'Composition types allow Location to depend on global nodes and preserve the converse boundary.')
add('runtime','packages/core/src/process.ts',131,173,'Collectors continue draining after byte caps; inspectors receive raw chunks; the process path receives optional RSS constraints.')
add('runtime','packages/core/src/process.ts',258,272,'Native collect is conditional on eligibility and other options route through the configured spawner; there is no universal captured-output bound.')
add('runtime','packages/core/src/omni.ts',62,84,'Explicit native addon/supervisor paths must form an existing pair and do not silently borrow mismatched candidates.')
add('runtime','packages/core/src/omni.ts',139,152,'The positive/strict control predicate is code, not an executed qualification result.')
add('runtime','packages/core/src/pty.ts',23,39,'PTY exited retention and finalization cap are explicit; each subscriber has a pending array distinct from the retained output ring.')
add('runtime','packages/core/src/pty.ts',186,197,'PTY finalization waits for pending stops only up to the configured cap.')
add('runtime','packages/core/src/lsp/lsp.ts',153,159,'Project LSP commands are admitted through ConfigTrust.')
add('runtime','packages/core/src/lsp/lsp.ts',193,198,'Workspace-code LSP commands take the confined branch; ordinary trusted commands have a distinct spawn path.')
add('runtime','packages/core/src/format/format.ts',97,143,'Formatter workspace code is confined with explicit write targets and exact child environment.')
add('runtime','packages/core/src/observability/otlp.ts',50,58,'Log/tracing startup is conditional on an endpoint, not a claim of observed exporter availability.')
add('runtime','.orchestra/skills/terminal-maintenance/SKILL.md',10,29,'The maintenance source explicitly preserves unresolved WebSocket-client backpressure/memory limits.', 'repository_normative_documentation')

add('models','packages/core/src/session/runner/model.ts',147,188,'Native routes strip API keys from body settings; unknown explicit variants fail rather than silently changing selection.')
add('models','packages/core/src/session/runner/model.ts',193,245,'The actual adapter branches accept a narrower API set than arbitrary SDK/catalog entries and return UnsupportedApiError otherwise.')

add('economy','packages/core/src/economy/admission.ts',242,284,'The final request digest participates in sealed identity; admitted bound dimensions are mandatory and positive safe integers.')
add('economy','packages/core/src/economy/admission.ts',463,505,'Occupancy uses settled usage or retained unsettled bounds and refuses/holds corrupt evidence; in-flight release is tracked independently.')
add('economy','packages/core/src/economy/admission.ts',551,579,'Reservation persists body snapshot and distinct forward/terminal/usage/completion/semantic fields in its immediate transaction.')

add('boundaries','packages/core/src/control-plane/move-session.ts',83,138,'Move applies captured changes, then publishes Session.Moved, then discards source changes with a distinct later failure; no cross-filesystem/event rollback appears in this function.')
add('boundaries','packages/core/src/rag-studio/sql.ts',5,81,'The complete remainder of the assigned RAG SQL schema shows table/column scope and the deliberate chunk-orphan cleanup boundary; it cannot prove an engine or retrieval implementation.')
add('entry,models','packages/core/README.md',54,88,'The repository owner inventory places provider/vendor, utilities and data contracts under Core; this is navigation/ownership intent, not acceptance of every member.', 'repository_normative_documentation')
add('entry,session-execution,context','AGENTS.md',207,217,'The current repository instructions explicitly keep execution local and context ownership split across Core/domain/Session boundaries.', 'repository_normative_documentation')

verified_sources={}
for e in selected:
    path=e['path']; s=by_source[path]; raw=(BASE/'sources'/path).read_bytes()
    assert s['commit']==PIN
    assert sha(raw)==s['sha256'] and len(raw)==s['byte_length']
    assert hashlib.sha1(b'blob '+str(len(raw)).encode()+b'\0'+raw).hexdigest()==s['git_blob_sha']
    verified_sources[path]={k:s[k] for k in ['path','commit','git_blob_sha','sha256','byte_length','read_status']}
    lines=raw.splitlines(keepends=True)
    lo=e['start_line'];hi=e['end_line'];assert 1<=lo<=hi<=len(lines),(path,lo,hi,len(lines))
    body=b''.join(lines[lo-1:hi]);e['bytes']=body
    e['source_revision']=PIN;e['git_blob_sha']=s['git_blob_sha'];e['source_sha256']=s['sha256'];e['source_byte_length']=s['byte_length'];e['sha256']=sha(body);e['byte_length']=len(body)
    existing=[x for x in old['compact']['excerpts'] if x['path']==path and max(lo,x['start_line'])<=min(hi,x['end_line'])]
    e['overlapping_existing_compact_ids']=[x['id'] for x in existing]
    old_lines={n for x in existing for n in range(x['start_line'],x['end_line']+1)}
    e['new_line_count_relative_to_compact']=sum(n not in old_lines for n in range(lo,hi+1))
    assert e['new_line_count_relative_to_compact']>0,(path,lo,hi,'wholly redundant with compact')

for i,e in enumerate(selected,1):e['id']=f'AEX{i:03d}'
artifact_map={a['key']:{'body':a['body'],'original_compact_excerpt_ids':old['compact']['artifact_map'][a['key']]['excerpt_ids'],'supplement_excerpt_ids':[e['id'] for e in selected if a['key'] in e['artifact_keys']]} for a in artifacts}
assert all(x['supplement_excerpt_ids'] for x in artifact_map.values())

out=['# Exact supplementary source evidence — frozen Core L1 A', '',
 'Revision `a-l1-evidence-v1`; scope `orchestra.s1`; all source bytes are from `'+PIN+'`.', '',
 'These excerpts complement the original compact evidence. They do not replace bodies, source captures, earlier review payloads or original read-status records. The claim captions below were authored for this revision; the fenced source content is byte-exact and contains no inserted line numbers or ellipses. Source code shows implementation, repository instructions/READMEs show stated intent, and neither is a product execution receipt.', '',
 'Original compact evidence SHA256: `'+old['compact']['sha256']+'`. Body identity, exact source blob/full-file SHA256, line span and excerpt SHA256 are recorded below and in `supplement-excerpt-map.json`. Some spans overlap an earlier snippet where a complete branch/transaction is necessary; every added span includes new source lines absent from the compact projection.', '',
 '## Artifact → excerpt map', '',
 '| Frozen artifact key | Existing compact excerpts | Added exact excerpts |', '| --- | --- | --- |']
for key,m in artifact_map.items():out.append('| `'+key+'` | '+', '.join(m['original_compact_excerpt_ids'])+' | '+', '.join(m['supplement_excerpt_ids'])+' |')
out += ['', '## Preserved conflicts and mandatory limits', '',
 '- Session rules: the runner merges Session rules (AEX009) while ordinary PermissionV2.configured returns selected-agent permissions. Both executable branches are included. No universal enforcement/ignoring claim is substituted.',
 '- Bash: original C030 preserves the old unsandboxed wording. Added foreground/background permission→wrapper branches and the current AGENTS requirement preserve the actual conditional confinement boundary. C027/C028 preserve no-requirement/fallback cases.',
 '- Permission rejection: original C026 and C031 retain implementation fan-out versus one-request guide wording. No source here resolves that conflict by fiat.',
 '- Binary read: original C022 and C024 preserve the current supported-image restriction versus the earlier broad binary description.',
 '- Native MCP bounds remain normative README authority. The transport implementation was not captured/read here; behavioral guarantees beyond the inspected policy/registration boundary remain mandatory gaps.',
 '- 599 unread implementation leaves, seven orientation-only frozen entries and external engine/OS/provider boundaries remain outside exhaustive semantic acceptance. This revision supplies material source context; it does not certify those members or qualify runtime.', '',
 '## Exact source spans', '']
for e in selected:
    out += ['### '+e['id'], '',
      '**Artifacts:** '+', '.join('`'+k+'`' for k in e['artifact_keys'])+'.', '',
      '**Claim/limit supported:** '+e['claim_supported'], '',
      '**Authority:** `'+e['authority']+'`. **Source:** `'+e['path']+':'+e['git_blob_sha']+'`, lines '+str(e['start_line'])+'–'+str(e['end_line'])+'.', '',
      '**Source commit:** `'+PIN+'`; **full source SHA256:** `'+e['source_sha256']+'`; **excerpt SHA256:** `'+e['sha256']+'` ('+str(e['byte_length'])+' bytes).', '',
      '````text\n'+e['bytes'].decode('utf-8')+('' if e['bytes'].endswith(b'\n') else '\n')+'````', '']
doc=('\n'.join(out)+'\n').encode('utf-8');(OUT/'supplement-evidence.md').write_bytes(doc)
manifest={'schema':'genesis-l1-evidence-supplement/v1','revision':'a-l1-evidence-v1','source_revision':PIN,
 'authority':'Exact extra source spans from the producer’s already frozen captures. Captions/maps are evidence projection, not revised L1 bodies or semantic acceptance.',
 'original_compact':{k:old['compact'][k] for k in ['path','sha256','byte_length']},
 'document':{'path':'supplement-evidence.md','sha256':sha(doc),'byte_length':len(doc)},
 'artifact_map':artifact_map,'sources':[verified_sources[k] for k in sorted(verified_sources)],
 'excerpts':[{k:v for k,v in e.items() if k!='bytes'} for e in selected],
 'product_execution':'NOT_RUN','remote_source_fetches_this_revision':0,'semantic_acceptance':False}
(OUT/'supplement-excerpt-map.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')

pkg=(BASE/'sources/packages/core/package.json').read_bytes();obj=json.loads(pkg);keys=list(obj['exports'])
observed={'schema':'genesis-deterministic-source-observations/v1','source_revision':PIN,
 'observations':[{'path':'packages/core/package.json','git_blob_sha':by_source['packages/core/package.json']['git_blob_sha'],'sha256':sha(pkg),
 'json_selector':'$.exports','number_of_keys':len(keys),'has_bare_dot_export':'.' in keys,'wildcard_keys':[k for k in keys if '*' in k],
 'method':'Python json.loads of unchanged captured bytes; no package code/build/test execution.'}], 'semantic_acceptance':False}
(OUT/'deterministic-source-observations.json').write_text(json.dumps(observed,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'excerpts':len(selected),'captured_sources_reused':len(verified_sources),'document_bytes':len(doc),'sha256':sha(doc),'material_body_keys':len(artifact_map),'new_source_lines':sum(e['new_line_count_relative_to_compact'] for e in selected),'exports':len(keys)}))
