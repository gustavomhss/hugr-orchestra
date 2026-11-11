"""Prepare corrected L1 bodies, identities, findings and transport; no product execution."""
from pathlib import Path
import json,hashlib,difflib,copy,collections
HERE=Path(__file__).resolve().parent;ROOT=HERE.parent.parent
PREFIX='modules/atlas/docs/design/genesis-chatgpt-results/20261111-v3-fresh/s1/'
sha=lambda b:hashlib.sha256(b).hexdigest()
def save(name,v):
 p=HERE/name;p.parent.mkdir(parents=True,exist_ok=True);p.write_text(json.dumps(v,ensure_ascii=False,indent=2)+'\n')
def ident(p):
 b=p.read_bytes();return {'path':str(p.relative_to(ROOT)),'byte_length':len(b),'sha256':sha(b)}
def payloadref(p):
 x=ident(p);return {'payload_path':PREFIX+x['path'],'sha256':x['sha256']}
def replace_once(text,old,new):
 assert text.count(old)==1,old
 return text.replace(old,new)

original=json.loads((ROOT/'producers/b/artifacts.json').read_text())
candidate=copy.deepcopy(original)
body_receipts=[];diffs=['# B-v3 body corrections','',
 'Only server-edge, schema-contracts and surface-disposition change relative to B-v2. The Session body is copied exactly from the preserved MCP correction. Six bodies are byte-for-byte unchanged. All prior files remain at their original paths.','']
for a in candidate['artifacts']:
 name=a['key'].removeprefix('s1.api.')
 old=ROOT/('revisions/b-l1-evidence-v1/corrected/session-contract.md' if name=='session-contract' else f'producers/b/bodies/{name}.md')
 raw=old.read_bytes();text=raw.decode();reasons=[]
 if name=='server-edge':
  text=replace_once(text,
   'The schema-error adapter logs a reason truncated to 1,024 characters and returns an `InvalidRequestError` with kind. It does not expose an unbounded raw parser diagnostic. A defect outside the typed error mapping is not proven to receive this treatment.',
   'The schema-error adapter defines `REASON_LIMIT = 1024`. For an oversized reason it retains `reason.slice(0, REASON_LIMIT)` and appends `... (N more chars)`, where N is `reason.length - REASON_LIMIT`; the limit therefore applies to the prefix as measured by JavaScript string length/slice. It logs and returns that prefix plus the omitted-character count in an `InvalidRequestError` with kind, so the complete summary may exceed 1,024 characters. A defect outside the typed error mapping is not proven to receive this treatment.')
  text=replace_once(text,'Other domain handlers are indexed rather than silently granted full semantic acceptance.',
   'The original reading register recorded the other domain handlers as indexed only. B-v3 separately supplies full literal reads and a bounded domain purpose/contract/ownership disposition in `revisions/b-l1-v3/review-domain-disposition.md`; those source observations remain subject to independent judgment.')
  reasons=['B1 factual correction: retained prefix versus appended omission count.','B3 fidelity update: explicitly distinguish the frozen historical index from current bounded domain reading.']
 elif name=='schema-contracts':
  text=replace_once(text,'The remaining Schema production modules are captured and literally indexed, with their internal semantics left unclaimed in `coverage.json`.',
   'The frozen `coverage.json` recorded the remaining 94 Schema production modules as captured and literally indexed. B-v3 preserves that historical record and adds full literal reads with bounded domain purpose, contract and ownership triage in `revisions/b-l1-v3/review-domain-disposition.md`. That supplement distinguishes DTO declarations, executable helpers and attributed service intent; it does not establish unobserved service execution or a semantic PASS.')
  reasons=['B3 fidelity update: distinguish the original 94-member surface-only record from current domain-contract reading; foundational body claims unchanged.']
 elif name=='surface-disposition':
  text=replace_once(text,'The capture contains 291 exact sources:', 'The frozen original capture contains 291 exact sources:')
  text=replace_once(text,'The reading register distinguishes 97 full source reads, two generated-client representative reads, 190 literal surface-indexed sources, and two captured generated sources without semantic reading.',
   'The frozen original reading register distinguishes 97 full source reads, two generated-client representative reads, 190 literal surface-indexed sources, and two captured generated sources without semantic reading.')
  text=replace_once(text,'For modules outside the decisive session/transport/composition reads, this packet claims their declared names/import seams only. Their domain rules, database effects, and failure semantics remain unproved.',
   'That original index claimed only declared names/import seams outside the decisive session/transport/composition reads. B-v3 adds the required domain-level triage now: all exact G30/G39/G52/G57 members (94 Schema, 44 Protocol, 51 Server and SDK tool.ts) received full literal source reads. `revisions/b-l1-v3/review-domain-disposition.md` groups them into 24 coherent domains, maps every member to its local L1 purpose and decisive evidence, and identifies external claims that remain blocked. `semantic-disposition.json` preserves the historical records and appends reader, pin, blob, SHA-256 and complete read spans. This source production is unjudged; neither the old index nor the new read count grants semantic acceptance.')
  text=replace_once(text,'| Other handwritten production modules | Exact byte capture and literal surface index; implementation semantics not accepted by inventory. |',
   '| Historical 190 surface-indexed handwritten modules | Original disposition preserved; B-v3 full literal reads support bounded purpose/contract/ownership triage by domain. External enforcement and runtime claims remain explicitly conditional; no semantic acceptance by count. |')
  text=replace_once(text,'Every manifest entry records commit, observed Git blob SHA, SHA-256, byte length, and capture path.',
   'Every manifest entry records commit, observed Git blob SHA, SHA-256, byte length, and capture path. B-v3 reuses those unchanged captures and copies two explicitly authorized Core source files unchanged from the pinned producer A captures to establish the actual Session/message ownership check. It reads literal bytes and independently verifies their identities; it accepts no A synthesis or unjudged Core artifact as a predecessor.')
  text=replace_once(text,'2. Most domain production modules received surface indexing only. Their presence is accounted for, while deeper ownership questions require targeted reads or the relevant domain artifact.',
   '2. The historical 190 surface-only entries now have a separate full-read, bounded L1 domain disposition. The current local purpose/contract/ownership reading need is addressed for review; F02 remains for broader domain claims and the specific conditional implementation/runtime needs in `revisions/b-l1-v3/conditional-needs.json`. No current mandatory local reading is merely deferred to L2.')
  text=replace_once(text,'This body is supported for the bounded population/provenance statements above.',
   'The compact review projection states only the bounded domain claims necessary for B3; the extensive native helper notes remain preserved as support and are not all promoted to batch claims. The existing F03–F08 obligations, generated/test/fixture boundaries and source discrepancies remain visible.\n\nThis body is supported for the bounded population/provenance and local domain-disposition statements above.')
  reasons=['B3: replace present-tense surface-only limitations with explicit historical/current provenance and the exact 190-member, 24-domain bounded L1 disposition.','Preserve generated/test/doc boundaries, conditional F02–F08, and separation of source production from review/runtime acceptance.']
 out=HERE/'bodies'/f'{name}.md';out.parent.mkdir(parents=True,exist_ok=True);out.write_bytes(text.encode())
 rec={'key':a['key'],'base_version':'B-v2','base_body':ident(old),'candidate_body':ident(out),'changed':raw!=out.read_bytes(),'reasons':reasons,'original_preserved':True}
 if rec['changed']:
  diff=''.join(difflib.unified_diff(raw.decode().splitlines(keepends=True),text.splitlines(keepends=True),fromfile=rec['base_body']['path'],tofile=rec['candidate_body']['path']))
  dp=HERE/'diffs'/f'{name}.diff';dp.parent.mkdir(parents=True,exist_ok=True);dp.write_text(diff)
  rec['diff']=ident(dp)
  diffs += [f"## {a['key']}",'',f"Base {rec['base_body']['byte_length']} bytes / `{rec['base_body']['sha256']}`; new {rec['candidate_body']['byte_length']} bytes / `{rec['candidate_body']['sha256']}`.",'','```diff',diff.rstrip('\n'),'```','']
 body_receipts.append(rec)
 a['body']={'path':str(out.relative_to(ROOT)),'encoding':'utf-8','byte_length':rec['candidate_body']['byte_length'],'sha256':rec['candidate_body']['sha256']}
assert sum(x['changed'] for x in body_receipts)==3
save('body-identities.json',{'schema':'genesis-l1-body-revision/v1','base_version':'S1-L1-B-v2','candidate_version':'S1-L1-B-v3','artifact_count':9,'changed_count':3,'unchanged_count':6,'bodies':body_receipts,'MCP_correction_preserved':True})
(HERE/'body-diffs.md').write_text('\n'.join(diffs))

disposition=json.loads((HERE/'semantic-disposition.json').read_text())
oldcov=json.loads((ROOT/'producers/b/coverage.json').read_text())
updated={x['path']:x for x in disposition['members']}
unchanged=[x['path'] for x in oldcov['entries'] if x['path'] not in updated]
assert len(unchanged)==282
save('coverage-revision.json',{'schema':'genesis-coverage-revision/v1','scope':'orchestra.s1','task':'S1-L1-B-v3','base_coverage_ref':ident(ROOT/'producers/b/coverage.json'),
 'base_assigned_count':472,'base_family_counts_verbatim':oldcov['family_counts'],'base_kind_counts_verbatim':oldcov['kind_counts'],'base_depth_counts_verbatim':oldcov['depth_counts'],
 'new_read_membership_count':190,'new_read_group_counts':{'G30':44,'G39':94,'G52':1,'G57':51},'new_review_domains':24,
 'new_state_ref':ident(HERE/'semantic-disposition.json'),'unchanged_member_count':282,'unchanged_member_paths':unchanged,
 'revision_method':'Immutable historical records plus separately attributed new read state. No original depth/count/status is overwritten. No fixture/generated/test/documentation member was promoted.',
 'conditional_obligations_ref':ident(HERE/'conditional-needs.json'),'semantic_acceptance':'unjudged'})

findings=[
 {'id':'B1','judges':['J1:B1','J2:B1'],'criteria':['QS-1','CC-3','GO-I1'],'status':'addressed_for_review','action':'Corrected server-edge prefix/suffix wording; exact REASON_LIMIT supplied.','body_keys':['s1.api.server-edge'],'new_evidence':['V01'],'reused_evidence':['C29:10-19'],'limits':'Source behavior only; no parser/runtime test.'},
 {'id':'B2.active-history','judges':['J1:B2'],'criteria':['QS-1','CC-3'],'status':'addressed_for_review','action':'Supplied SessionActive and positive <=100 history schema plus missing process-local active-route annotation.','body_keys':['s1.api.session-contract'],'new_evidence':['V02'],'reused_evidence':['C21:102-104','C21:175-181','Schema.PositiveInt in the preserved foundational evidence'],'limits':'Active meaning is attributed to the declared route contract; no process sampled.'},
 {'id':'B2.cross-session','judges':['J1:B2','J2:B2'],'criteria':['QS-1','QS-4','CC-3'],'status':'addressed_for_review','action':'Literal Core SessionStore wiring, database lookup and stored.sessionID === input.sessionID check support the unchanged cross-session statement together with the server missing-result mapping.','body_keys':['s1.api.session-contract'],'new_evidence':['V03','V04'],'reused_evidence':['S16:686-698'],'limits':'Two source captures copied and verified; no A synthesis or broad Core lifecycle acceptance used.'},
 {'id':'B2.production-sse','judges':['J1:B2'],'criteria':['QS-1','CC-3'],'status':'addressed_for_review','action':'Production subscriberCapacity=4096 and eventFrames allocation outside subscriber callback supplied.','body_keys':['s1.api.stream-contract'],'new_evidence':['V05'],'reused_evidence':['C33:13-24','C33:28-45','C33:54-64'],'limits':'Production source scope established, not measured throughput/backpressure or server execution.'},
 {'id':'B2.generated-runtime','judges':['J1:B2'],'criteria':['QS-1','CC-3'],'status':'addressed_for_review','action':'Supplied missing binary-success and finally lines plus exact minimal complete branch reconstruction.','body_keys':['s1.api.client-projection','s1.api.stream-contract'],'new_evidence':['V06'],'reused_evidence':['C34:597','C34:653-654'],'limits':'Main supplement has zero prior-line overlap; complete-branch-context repeats exactly three indispensable prior lines. No regeneration/execution.'},
 {'id':'B3','judges':['J1:B3 (mandatory despite J2 partial PASS)'],'criteria':['QS-2','QS-4','QS-6','CC-1','CC-3','CC-7','GO-I2','GO-I7','GO-I8'],'status':'addressed_for_review','action':'Read all exact 190 modules, preserve historical status, supply 24 coherent cross-layer domains with exact members, current L1 contract/ownership needs, decisive evidence, why depth suffices and conditional blocked claims.','body_keys':['s1.api.surface-disposition','s1.api.schema-contracts','s1.api.sdk-composition'],'new_evidence':['Q001-Q095','P01-P44 (compact selected ranges)','G57 compact selected ranges'],'reused_evidence':['Existing bounded package/session/edge/composition bodies; no build dependencies added'],'limits':'Detailed delegate notes remain support; only compact domain claims are submitted. F02-F08 retained; current local L1 reading is not deferred. No semantic PASS.'}
]
save('findings-resolution.json',{'schema':'genesis-finding-response/v1','task':'S1-L1-B-v3','base_package_sha256':'d8db24cc3e63225fbee28a9a0fc0ea1d16d4894a87500d5c6e765c369370ba3e','base_dossier_sha256':'42c2595c2e243b3612a13b7ed615c5bfbeb731706f760119c1f7fd6719541def',
 'prior_judgments':[ident(HERE/'inputs/j1.md'),ident(HERE/'inputs/j2.md')],'findings':findings,'new_verdict':'not_requested','current_local_source_gaps':[],'remaining_gate':'The two persistent independent judges must assess the exact new body/evidence bytes before acceptance.'})
md=['# B-v3 — mandatory finding response','',
 'Both B-v2 reviews were FIX-FIRST. This response addresses the union of J1 B1/B2/B3 and J2 B1/B2. J2’s bounded partial passes do not waive J1 B3. Status below is producer response for review, not PASS.','',
 '| Finding | Source/body action | Evidence | Limit |','| --- | --- | --- |']
for f in findings:md.append('| '+f['id']+' | '+f['action']+' | '+', '.join(f['new_evidence']+f['reused_evidence'])+' | '+f['limits']+' |')
md+=['','## Original and current boundaries','',
 'Three bodies changed: server-edge corrects the diagnostic and historical/current depth wording; schema-contracts updates only the historical/current 94-module read statement; surface-disposition binds the 24-domain current triage. Six bodies are identical to B-v2, including session-contract with the prior UnknownError/no-logging MCP correction. No source file changed.','',
 'The main supplement adds only missing decisive lines and the compact domain evidence. The complete binary/finally context is separately bound and repeats only the necessary three C34 lines; original C/S archives are not repeated. The 472-path partition and 52-family base remain frozen; only the exact 190 modules get a new attributed read state.','',
 'No current local source-reading gap is asserted for the bounded B1/B2/B3 needs. Broad Core/domain execution, recovery, concurrency, generated freshness, observed auth/stream behavior, the existing source discrepancies and the oversized generated input remain conditional blocked claims under F02–F08. Independent exact-version judgment is still required.','']
(HERE/'findings-resolution.md').write_text('\n'.join(md))

# Actual native dispatch records, without tool-call IDs/timing/tokens/model telemetry invented.
delegations=[]
for handle,op,sub,scope in [('/root/producer_b/protocol_triage','collaboration.spawn_agent','protocol','Exact 44 G30 Protocol members'),('/root/producer_c','collaboration.followup_task','server','Exact 51 G57 Server members')]:
 folder=HERE/'delegates'/sub
 reqs=[ident(p) for p in sorted(folder.glob('request*.txt'))]
 delegations.append({'native_handle':handle,'dispatch_tool':op,'role':'L1 source-reading producer helper, not judge','scope':scope,'exclusive_write_directory':str(folder.relative_to(ROOT)),
   'request_refs':reqs,'response_ref':ident(folder/'response.md'),'final_response_received':True,
   'support_files':[ident(folder/n) for n in ['triage.json','excerpt-selection.json','verification.json']],
   'observability':'Actual native handle and request/response artifacts retained. No invocation ID, model override, timing, cost, token count or independent semantic verdict inferred.'})
save('delegation-record.json',{'schema':'genesis-native-delegation-receipt/v1','producer':'/root/producer_b','task':'S1-L1-B-v3','delegations':delegations,
 'native_status_observation':'Both delegated tasks completed and their final responses were received. A later list_agents showed producer_c running; principal explicitly confirmed that handle had been reused for unrelated transport work after the Server delegation ended. Completion of this delegation is separate from the current state of a reused handle. No interruption, timing or slot metrics were inferred.',
 'no_additional_helpers':True,'no_judge_dispatch':True,'support_messages':ident(HERE/'delegates/server/collaboration-record.json')})

# Complete common transport candidate. The principal performs later package binding/review transport.
candidate['task']='S1-L1-B-v3';candidate['fragment_path_base']='All body paths are future shared-package-relative paths under revisions/b-l1-v3/bodies; original sources remain at producers/b/sources and two copied Core sources under revisions/b-l1-v3/sources.'
candidate['package_state']='IN_PROGRESS'
candidate['producer']={**candidate['producer'],'task':'S1-L1-B-v3','delegation_ref':payloadref(HERE/'delegation-record.json'),'model_telemetry':'No independent model/runtime metrics asserted; original execution association retained, not a new runtime receipt.'}
candidate['known_limits']=[
 'Producer revision only: B1/B2/B3 addressed for review, not semantic PASS or whole-layer acceptance.',
 'B-v2 judgments are FIX-FIRST; the new exact bytes need the two independent applicable judgments.',
 'The main projection covers 24 bounded L1 domains; extensive native support notes are not all promoted to batch claims.',
 'No product test, build, generation, server/provider operation, runtime binding or remote write was executed.',
 'F02-F08 remain conditional obligations for the claims that require them; the oversized generated input remains retained and unbound.'
]
candidate['prior_revision']={'package_sha256':'d8db24cc3e63225fbee28a9a0fc0ea1d16d4894a87500d5c6e765c369370ba3e','dossier_sha256':'42c2595c2e243b3612a13b7ed615c5bfbeb731706f760119c1f7fd6719541def','judgments':[payloadref(HERE/'inputs/j1.md'),payloadref(HERE/'inputs/j2.md')],'decision':'FIX-FIRST','applies_to':'S1-L1-B-v2 only'}
candidate['revision_evidence']={k:payloadref(HERE/v) for k,v in {'body_identities':'body-identities.json','findings':'findings-resolution.json','coverage':'coverage-revision.json','domains':'semantic-disposition.json','conditional_needs':'conditional-needs.json','source_map':'source-excerpts.json','compact_domains':'review-domain-disposition.md','compact_evidence':'review-supplement.md','complete_runtime_branches':'complete-branch-context.md'}.items()}
newrefs={x['path']:{k:x[k] for k in ['commit','path','git_blob_sha','sha256']} for x in json.loads((HERE/'source-manifest.json').read_text())['sources']}
for a in candidate['artifacts']:
 a['recipe_supplement_refs'] += [payloadref(HERE/'request.txt'),payloadref(HERE/'request-steering.txt')]
 a['producer_request_ref']=payloadref(HERE/'request.txt')
 # Bound once response.md is generated at finalization, before the final deterministic checks.
 a['producer_response_ref']={'payload_path':PREFIX+'revisions/b-l1-v3/response.md','sha256':'PENDING_FINAL_RESPONSE_BINDING'}
 a['build_dependencies']=[];a['semantic_review_refs']=[];a['runtime_receipt_refs']=[]
 a['evidence'] += [payloadref(HERE/'findings-resolution.json'),payloadref(HERE/'body-identities.json')]
 if a['key'] in ['s1.api.surface-disposition','s1.api.schema-contracts','s1.api.sdk-composition']:
  a['evidence'] += [payloadref(HERE/'review-domain-disposition.md'),payloadref(HERE/'semantic-disposition.json')]
 if a['key'] not in ['s1.api.boundaries','s1.api.codegen']:
  a['evidence'] += [payloadref(HERE/'review-supplement.md'),payloadref(HERE/'source-excerpts.json')]
 if a['key'] in ['s1.api.stream-contract','s1.api.client-projection']:
  a['evidence'].append(payloadref(HERE/'complete-branch-context.md'))
 if a['key']=='s1.api.schema-contracts':
  a['gaps'][2]='Historical 94-domain surface-only state preserved; B-v3 full reads supply bounded purpose/contract/ownership triage for review. Broader service/runtime claims remain conditional.'
 if a['key']=='s1.api.surface-disposition':
  a['gaps'][2]='183 assigned entries remain inventory-only. The historical 190 surface-indexed modules have separate B-v3 full-read domain triage, which remains unjudged and does not establish all implementation/runtime behavior.'
 if a['key']=='s1.api.session-contract':
  a['gaps'][2]='Literal Core evidence supports the specific stored sessionID/messageID check; broader Core persistence, scheduling, execution and recovery remain delegated, unproven boundaries.'
 adds=[]
 if a['key']=='s1.api.session-contract':adds=['packages/core/src/session.ts','packages/core/src/session/store.ts']
 elif a['key']=='s1.api.schema-contracts':adds=[x['path'] for x in disposition['members'] if x['path'].startswith('packages/schema/')]
 elif a['key']=='s1.api.sdk-composition':adds=['packages/sdk-next/src/tool.ts']
 elif a['key']=='s1.api.surface-disposition':adds=list(newrefs)
 existing={x['path'] for x in a['source_refs']}
 for path in adds:
  if path not in existing:a['source_refs'].append(newrefs[path]);existing.add(path)
  key='file:'+path
  if key not in a['input_keys']:a['input_keys'].append(key)
 a['source_refs'].sort(key=lambda x:x['path'])
save('fragment-metadata.pending.json',candidate)

entry=['# B-v3 review entry','',
 'Candidate scope: the same nine `s1.api.*` L1 keys in `orchestra.s1`; no later-layer production. This revision responds to the exact B-v2 FIX-FIRST union. The principal performs later frozen-package binding and judge transport.','',
 '## Review payload','',
 '1. Read findings-resolution.md and the three delimited body diffs; body-identities.json binds all nine current bodies and proves the six unchanged copies.','2. Use the preserved B-v2 C01–C47 and S01–S38 evidence as base.','3. Add review-domain-disposition.md (24 domains, exact 190-member purpose/need map) and review-supplement.md (only additional selected source lines).','4. Include complete-branch-context.md for the complete binary-success and SSE-finally branches; its exact three-line overlap is declared and hashed.','5. Keep conditional-needs.json/F02–F08, source-excerpts.json and the historical/current coverage projection available for verification.','',
 '## Scope of extended support','',
 'delegates/ and support/ retain full native reading artifacts and detailed source observations. They support provenance and permit targeted follow-up evidence. The review does not promote every such note to a claim requiring an enlarged leaf-level audit. The compact domain claims delimit the asserted B3 content.','',
 'No producer verdict is supplied. No current local source-reading gap remains for the bounded findings; independent dual judgment and the named conditional implementation/runtime obligations remain open. No generated file, fixture, test, documentation family or source discrepancy was silently reclassified.','']
(HERE/'review-entry.md').write_text('\n'.join(entry))
print(json.dumps({'bodies':9,'changed':3,'unchanged':6,'coverage_overlay':190,'unchanged_coverage':282,'review_domains':24,'metadata_state':'pending response binding only'},indent=2))
