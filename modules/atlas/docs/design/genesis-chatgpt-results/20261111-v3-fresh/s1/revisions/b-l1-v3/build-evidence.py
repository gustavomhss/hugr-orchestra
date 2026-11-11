"""Deterministic projections of frozen inputs; does not execute product code."""
from pathlib import Path
import hashlib, json, runpy

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
PIN = '1cde2ff7a71bcf7aecb5d030917b577165135d38'
PROTOCOL = 'ee2521a5b966bd505cc95bd1c733e09e12f33531'
sha = lambda b: hashlib.sha256(b).hexdigest()
def save(name, obj):
    p=HERE/name; p.parent.mkdir(parents=True,exist_ok=True)
    p.write_text(json.dumps(obj,ensure_ascii=False,indent=2)+'\n')
def identity(path):
    b=path.read_bytes()
    return {'path':str(path.relative_to(ROOT)), 'sha256':sha(b),'byte_length':len(b)}
def gitblob(b): return hashlib.sha1(b'blob '+str(len(b)).encode()+b'\0'+b).hexdigest()

projection=json.loads((ROOT/'revisions/b-l1-evidence-v1/coverage-projection.json').read_text())
groups={g['id']:g for g in projection['groups'] if g['id'] in ['G30','G39','G52','G57']}
historic={m['path']:{**g['common'],**m} for g in groups.values() for m in g['members']}
assert len(historic)==190
manifest=json.loads((ROOT/'producers/b/source-manifest.json').read_text())
sources={x['path']:dict(x) for x in manifest['sources']}
for x in sources.values(): x['capture_path']='producers/b/'+x['capture_path']

# The only extra source captures: copy exact authorized A bytes, not A's synthesis or artifact.
am=json.loads((ROOT/'producers/a/capture-manifest.json').read_text())
for path in ['packages/core/src/session.ts','packages/core/src/session/store.ts']:
    m=next(x for x in am['sources'] if x['path']==path)
    b=(ROOT/'producers/a/sources'/path).read_bytes()
    assert m['commit']==PIN and sha(b)==m['sha256'] and len(b)==m['byte_length'] and gitblob(b)==m['git_blob_sha']
    out=HERE/'sources'/path;out.parent.mkdir(parents=True,exist_ok=True);out.write_bytes(b)
    sources[path]={k:m[k] for k in ['path','commit','git_blob_sha','sha256','byte_length']}
    sources[path].update(capture_path=str(out.relative_to(ROOT)),capture_method='Unchanged copy of explicitly authorized pinned GitHub-connector source capture from producers/a/sources; Git blob and SHA256 independently recomputed.',upstream_capture_manifest=identity(ROOT/'producers/a/capture-manifest.json'))

prior={}
prior_refs={}
for rel in ['producers/b/review-evidence-compact-index.json','revisions/b-l1-evidence-v1/source-supplement-index.json']:
    for s in json.loads((ROOT/rel).read_text())['sources']:
        for rg in s['ranges']:
            prior.setdefault(s['path'],set()).update(range(rg['start_line'],rg['end_line']+1))
            prior_refs.setdefault(s['path'],[]).append({'id':s['id'],**rg})
def runs(ns):
    out=[]
    for n in sorted(set(ns)):
        if out and n==out[-1][1]+1:out[-1][1]=n
        else:out.append([n,n])
    return out
def ref(path):
    return {k:sources[path][k] for k in ['commit','path','git_blob_sha','sha256','byte_length']}
def payload(path):return (ROOT/sources[path]['capture_path']).read_bytes()
def span(path,start,end):
    b=payload(path);ls=b.splitlines(keepends=True)
    assert 1<=start<=end<=len(ls),(path,start,end,len(ls))
    raw=b''.join(ls[start-1:end]);off=sum(map(len,ls[:start-1]))
    return {'start_line':start,'end_line':end,'byte_start':off,'byte_end_exclusive':off+len(raw),'byte_length':len(raw),'sha256':sha(raw)}
used={}
selection=[]
def select(eid,path,ranges,purpose,keys,domain=None):
    wanted=set(n for a,z in ranges for n in range(a,z+1))
    previous=wanted&prior.get(path,set())
    unique=wanted-prior.get(path,set())-used.get(path,set())
    used.setdefault(path,set()).update(unique)
    obj={'id':eid,'source_ref':ref(path),'capture_path':sources[path]['capture_path'],'artifact_keys':keys,'domain_id':domain,'purpose':purpose,'requested_ranges':ranges,'ranges':[span(path,a,z) for a,z in runs(unique)],'prior_evidence_reused':[{'id':x['id'],'start_line':max(x['start_line'],min(previous)),'end_line':min(x['end_line'],max(previous))} for x in prior_refs.get(path,[]) if previous & set(range(x['start_line'],x['end_line']+1))] if previous else [],'duplicate_prior_line_count_removed':len(previous),'duplicate_new_line_count_removed':len(wanted-prior.get(path,set())-unique)}
    selection.append(obj);return obj

schema_plan=runpy.run_path(str(HERE/'schema-plan.py'))
ledger=json.loads((HERE/'schema-read-ledger.json').read_text())
sdkpath='packages/sdk-next/src/tool.ts'
ledger[sdkpath]={'depth':'full_source_read_in_v3','ranges':[[1,2]],'purpose':'L1 ownership of the complete Core tool facade','reader':'/root/producer_b'}
save('schema-read-ledger.json',ledger)
schema_members=[]
for i,(short,domain,fact,ranges) in enumerate(schema_plan['ROWS'],1):
    path=short if short.startswith('packages/') else 'packages/schema/src/'+short
    did=domain if domain.startswith('sdk.') else 'schema.'+domain
    keys=['s1.api.surface-disposition','s1.api.sdk-composition' if path==sdkpath else 's1.api.schema-contracts']
    eid=f'Q{i:03d}'
    select(eid,path,ranges,fact,keys,did)
    assert path in ledger
    b=payload(path);assert sha(b)==sources[path]['sha256'] and gitblob(b)==sources[path]['git_blob_sha']
    schema_members.append({'path':path,'domain_id':did,'historical_record':historic[path],
      'current_read_state':{'status':'full_source_read_for_L1_contract_semantics','reader':'/root/producer_b','revision':'S1-L1-B-v3','source_ref':ref(path),'read_spans':[{'start_line':a,'end_line':z} for a,z in ledger[path]['ranges']],'method':'Literal previously captured source displayed in full and read; file hashes rechecked. An initially truncated multi-file display was not counted and those sources were reread in smaller complete batches.','execution':'none','semantic_review':'unjudged'},
      'l1_fact':fact,'evidence_selection_id':eid,'artifact_keys':keys,
      'depth_justification':'Full literal module read establishes this bounded declaration/implementation role; decisive excerpts expose the stated boundary. No service behavior beyond the observed code and explicitly attributed comments is inferred.'})
assert len(schema_members)==95
schema_domains=[]
for did,title,need,facts,gap in schema_plan['DOMAINS']:
    members=[x for x in schema_members if x['domain_id']==did];assert members,did
    schema_domains.append({'domain_id':did,'purpose':title,'member_paths':[x['path'] for x in members],
      'current_l1_need':need,'source_supported_facts':facts,'new_evidence_ids':[x['evidence_selection_id'] for x in members],
      'existing_artifact_relationship':{'artifact_keys':sorted(set(k for x in members for k in x['artifact_keys'])),'relationship':'L1 factual extension to these existing keys, not an accepted build dependency.'},
      'current_knowledge_status':'Local source need addressed for independent review; no semantic verdict.',
      'mandatory_current_l1_source_gap_for_declared_contract':None,
      'conditional_gap':{'kind':'implementation_or_runtime_claim_not_asserted_by_this_triage','description':gap,'blocked_claim':gap,'blocked_dependents':'Any L1 or later explanation, operational guarantee or maintenance procedure that relies on the expanded claim must obtain its named implementation/runtime evidence. This does not defer the current local L1 reading.'},
      'why_depth_adequate':'All exact members were read, including executable helpers. The current need is purpose, observable contract and ownership/delegation boundary. Unknown service behavior remains outside the supported claim; no file is accepted by inventory.','review_state':'unjudged'})
save('schema-triage.json',{'schema':'genesis-domain-triage/v1','task':'S1-L1-B-v3','finding':'B3','scope':'orchestra.s1','source_revision':PIN,'protocol_revision':PROTOCOL,'historical_groups':['G39','G52'],'member_count':95,'schema_count':94,'sdk_count':1,'domains':schema_domains,'members':schema_members,'acceptance':'Unjudged L1 factual production only.'})

# Judge-requested correction and omitted narrow branches, without repeating C/S source lines.
select('V01','packages/server/src/middleware/schema-error.ts',[(7,9)],'B1 exact REASON_LIMIT; C29 lines10–19 already supply prefix+suffix and log/error mapping.',['s1.api.server-edge'])
select('V02','packages/protocol/src/groups/session.ts',[(95,101),(182,184)],'B2 SessionActive, 1–100 history limit and completion of active-route description after C21 line181.',['s1.api.session-contract'])
select('V03','packages/core/src/session.ts',[(24,24),(270,275),(469,472)],'B2 actual Core message lookup uses SessionStore.Service and returns only a stored message whose sessionID equals the requested sessionID.',['s1.api.session-contract'])
select('V04','packages/core/src/session/store.ts',[(26,28),(33,41),(73,86)],'B2 store service takes Database, selects message by ID and returns its stored owning sessionID for the comparison.',['s1.api.session-contract'])
select('V05','packages/server/src/handlers/event.ts',[(26,26),(46,53)],'B2 production subscriber capacity and eventFrames allocation outside the per-request callback.',['s1.api.stream-contract'])
select('V06','packages/client/src/generated/client.ts',[(595,596),(648,652)],'B2 omitted binary-success and SSE-finally lines; continuity map/complete-branch-context.md bind complete minimal branches to existing C34 closing lines.',['s1.api.client-projection','s1.api.stream-contract'])

# Integrate independent native producer readings as authored L1 evidence, not as a judge verdict.
protocol=json.loads((HERE/'delegates/protocol/triage.json').read_text())
psel=json.loads((HERE/'delegates/protocol/excerpt-selection.json').read_text())
for s in psel['sources']:
    path=s['source_ref']['path']
    assert s['source_ref']==ref(path)
    select(s['id'],path,[(x['start_line'],x['end_line']) for x in s['ranges']],s['purpose'],['s1.api.surface-disposition'],'protocol.'+s['domain_id'])
server=json.loads((HERE/'delegates/server/triage.json').read_text())
ssel=json.loads((HERE/'delegates/server/excerpt-selection.json').read_text())
for s in ssel['excerpts']:
    path=s['path'];r=span(path,s['start_line'],s['end_line'])
    raw=b''.join(payload(path).splitlines(keepends=True)[s['start_line']-1:s['end_line']])
    assert sha(raw)==s['excerpt_sha256'] and raw.decode()==s['text']
    select(s['id'],path,[(s['start_line'],s['end_line'])],s['supports']['kind']+': '+s['supports']['path'],['s1.api.surface-disposition'])

allmembers=list(schema_members)
domains=list(schema_domains)
for x in protocol['members']:
    assert x['historical_record']==historic[x['path']]
    y=dict(x);y['domain_id']='protocol.'+x['domain_id'];y['artifact_keys']=['s1.api.surface-disposition'];allmembers.append(y)
for x in protocol['domains']:
    y=dict(x);y['domain_id']='protocol.'+x['domain_id'];domains.append(y)
for g in server['groups']:
    rows=[x for x in server['entries'] if x['group']==g['id']]
    domains.append({'domain_id':'server.'+g['id'],'purpose':g['title'],'member_paths':g['members'],
      'current_l1_need':g['L1_need'],'source_supported_facts':'Per-member purpose, local authority, error mappings and material branch facts are supplied in the exact-member table below; this group is not a generic CRUD assertion.',
      'new_evidence_ids':sorted(set(e for x in rows for e in x['evidence_refs']+x['shared_contract_evidence_refs'])),
      'existing_artifact_relationship':{'artifact_keys':['s1.api.surface-disposition','s1.api.server-edge','s1.api.boundaries'],'relationship':'Source-level ownership and local adapter behavior extend existing bounded L1 context; no unjudged artifact is used as an accepted build predecessor.'},
      'current_knowledge_status':g['disposition'],'mandatory_current_l1_source_gap_for_declared_contract':None,
      'conditional_gap':{'description':'See explicit server conditional needs '+', '.join(sorted(set(n for x in rows for n in x['conditional_need_ids'])))+'.','blocked_dependents':'Specific claims, affected members and missing evidence are retained in conditional-needs.json; none authorizes an unsupported current claim.'},
      'why_depth_adequate':g['grouping_reason'],'review_state':'unjudged'})
for x in server['entries']:
    path=x['path']
    allmembers.append({'path':path,'domain_id':'server.'+x['group'],'historical_record':historic[path],
      'current_read_state':{'status':'full_source_read_for_L1_contract_semantics','reader':'/root/producer_c','revision':'S1-L1-B-v3','source_ref':ref(path),'read_spans':x['current']['inspected_spans'],'method':'Native producer server delegate literal reads; original read-log and truncation recovery retained.','execution':'none','semantic_review':'unjudged'},
      'l1_fact':x['purpose'],'local_authority':x['local_authority'],'error_contract':x['error_contract'],'material_facts':x['material_facts'],
      'evidence_selection_ids':x['evidence_refs']+x['shared_contract_evidence_refs'],'authority_profile':x['authority_profile'],'conditional_need_ids':x['conditional_need_ids'],
      'artifact_keys':['s1.api.surface-disposition'],'depth_justification':'Full literal adapter/helper read plus applicable API/middleware support establishes local purpose, delegation, errors and authority. Conditional service/runtime claims are separately blocked.'})
assert len(allmembers)==190 and {x['path'] for x in allmembers}==set(historic)
for x in allmembers:assert x['historical_record']==historic[x['path']]

save('semantic-disposition.json',{'schema':'genesis-l1-semantic-disposition/v1','task':'S1-L1-B-v3','source_revision':PIN,'protocol_revision':PROTOCOL,'scope':'orchestra.s1','historical_projection_ref':identity(ROOT/'revisions/b-l1-evidence-v1/coverage-projection.json'),
 'historical_groups_verbatim':list(groups.values()),'membership_count':190,'domain_count':len(domains),'new_read_counts':{'schema':94,'protocol':44,'server':51,'sdk':1},
 'current_l1_need_status':'All 190 local purpose/contract/ownership source needs addressed for review by full literal reads and bounded domain triage. This is producer evidence, not acceptance. No required local reading is deferred to L2.',
 'domains':domains,'members':sorted(allmembers,key=lambda x:x['path']),'server_authority_profiles_verbatim':server['authority_profiles'],
 'fixture_generated_documentation_boundary':'Only exact G30/G39/G52/G57 production members receive new reading state. All other 282 coverage records retain their original classification. No generated fixture/test/doc is promoted to semantic reading or execution.',
 'acceptance_limit':'Unjudged L1 production. No semantic PASS, runtime qualification, whole-layer release or later-layer predecessor is asserted.'})
save('conditional-needs.json',{'schema':'genesis-l1-conditional-needs/v1','scope':'orchestra.s1','task':'S1-L1-B-v3','historical_obligations_verbatim':projection['future_obligations'],
 'F02_update':'The historical 190 surface-indexed record remains verbatim. This revision performs the mandatory local L1 domain reading now and supplies the exact need disposition. Broader implementation/operational claims still require the explicitly named conditional evidence; F02 is not erased or treated as blanket full semantic acceptance.',
 'F04_update':'B2 adds literal Core message-ID/session-ID comparison only; no general lifecycle, transaction, recovery or scheduler obligation is discharged.',
 'server_conditional_needs_verbatim':server['conditional_needs'],'domain_conditional_needs':[{'domain_id':d['domain_id'],'members':d['member_paths'],'gap':d['conditional_gap']} for d in domains if not d['domain_id'].startswith('server.')],
 'source_discrepancies':server['source_discrepancies']+[{'id':'D-relay-control-comment','path':'packages/schema/src/relay-sprint.ts','lines':[27,45],'observed':'Comment says non-string command/judge/path values are not load errors, while the shown Struct accepts optional String/Null command/judge and Array(String) paths. Current L1 does not claim arbitrary non-string values decode.','evidence_ids':['Q086']}],
 'current_local_source_gaps':[],'acceptance_gap':'Both exact-version independent judgments remain required; this file does not mark PASS.'})

selected_paths=sorted(set(s['source_ref']['path'] for s in selection))
for path in selected_paths:
    b=payload(path);m=sources[path]
    assert m['commit']==PIN and sha(b)==m['sha256'] and len(b)==m['byte_length'] and gitblob(b)==m['git_blob_sha']
save('source-manifest.json',{'schema':'genesis-source-capture/v1','source_revision':PIN,'repository':'gustavomhss/hugr-orchestra','sources':[sources[p] for p in selected_paths],'policy':'Existing B captures retained at their exact original path; two Core source files copied unchanged from the explicitly authorized A captures. No remote fetch/write or product execution in this revision.'})
save('source-excerpts.json',{'schema':'genesis-excerpt-selection/v1','source_revision':PIN,'scope':'orchestra.s1','sources':selection,'prior_evidence_indexes':[identity(ROOT/p) for p in ['producers/b/review-evidence-compact-index.json','revisions/b-l1-evidence-v1/source-supplement-index.json']],'deduplication':'Previously supplied C01–C47/S01–S38 source lines and duplicate new selections are referenced rather than reprinted in review-supplement.md. Complete branch context is a separate explicit minimal assembly.'})

md=['# B-v3 — additional decisive source evidence','',f'Source pin: `{PIN}`. Protocol pin: `{PROTOCOL}`. L1 only; all claims remain unjudged.','',
 'This projection contains only additional source lines, deduplicated against C01–C47 and S01–S38. Existing evidence is reused by exact ID and line spans. The separate minimal `complete-branch-context.md` reconstructs the binary and SSE-finally branches as requested; it repeats only their indispensable closing lines from C34. Full original archives and delegate evidence remain preserved.','',
 '## Artifact → new excerpt map','',
 '| Artifact | Additional source evidence |','| --- | --- |',
 '| s1.api.server-edge | V01 (REASON_LIMIT); server domain rows and their G57 selections |',
 '| s1.api.session-contract | V02 (active/history), V03–V04 (Core ownership), C21/S16 continuity |',
 '| s1.api.stream-contract | V05 (production cache/capacity), V06 (complete finally with C34) |',
 '| s1.api.client-projection | V06 (binary branch and finally with C34) |',
 '| s1.api.schema-contracts | Q001–Q094 and semantic-disposition domains |',
 '| s1.api.sdk-composition | Q095, complete two-line Core tool facade |',
 '| s1.api.surface-disposition | All Q/P/G57 source selections and exact 190-member matrix |',
 '| s1.api.boundaries / s1.api.codegen | Original bounded claims unchanged; new domain evidence is navigation, not a new build dependency |','']
for s in sorted(selection,key=lambda s:(not s['id'].startswith('V'),s['id'])):
    if not s['ranges']:
        continue
    rf=s['source_ref'];path=rf['path']
    md += [f"## {s['id']} — {path}",'',s['purpose'],'',f"Pin `{rf['commit']}`; Git blob `{rf['git_blob_sha']}`; full-source SHA256 `{rf['sha256']}`; {rf['byte_length']} source bytes.",'']
    if s['prior_evidence_reused']:md += ['Prior context reused: '+', '.join(f"{x['id']}:{x['start_line']}–{x['end_line']}" for x in s['prior_evidence_reused'])+'.','']
    ls=payload(path).splitlines(keepends=True)
    for rg in s['ranges']:
        raw=b''.join(ls[rg['start_line']-1:rg['end_line']])
        md += [f"Lines {rg['start_line']}–{rg['end_line']}; byte offsets [{rg['byte_start']}, {rg['byte_end_exclusive']}); {rg['byte_length']} bytes; span SHA256 `{rg['sha256']}`.",'','```ts',raw.decode().rstrip('\n'),'```','']
(HERE/'review-supplement.md').write_text('\n'.join(md))

# Explicit minimal, exact, contiguous complete branch reconstruction, with overlap accounted for.
branchpath='packages/client/src/generated/client.ts';ls=payload(branchpath).splitlines(keepends=True)
assemblies=[]
out=['# B2 — complete minimal generated runtime branches','',f'Source `{branchpath}` at `{PIN}`. Git blob `{sources[branchpath]["git_blob_sha"]}`; full-source SHA256 `{sources[branchpath]["sha256"]}`.','',
 'These are the complete requested branches, assembled from the existing C34 source and new V06 lines. Only three prior lines are repeated here: 597, 653 and 654, the indispensable closing/release lines. The main additional supplement has zero C/S overlap. This minimal context is not a regenerated client or an execution result.','']
for name,a,z in [('binary-success',595,597),('SSE-finally',649,654)]:
    rg=span(branchpath,a,z);overlap=sorted(set(range(a,z+1))&prior[branchpath])
    assemblies.append({'name':name,'source_ref':ref(branchpath),**rg,'new_lines':sorted(set(range(a,z+1))-prior[branchpath]),'reused_C34_lines':overlap})
    out += [f'## {name}','',f'Lines {a}–{z}; {rg["byte_length"]} bytes; SHA256 `{rg["sha256"]}`.','','```ts',b''.join(ls[a-1:z]).decode().rstrip('\n'),'```','']
(HERE/'complete-branch-context.md').write_text('\n'.join(out))
save('complete-branch-context.json',{'source_revision':PIN,'assemblies':assemblies,'total_prior_line_overlap':3,'reason':'Minimal complete branch context expressly requested by B2; no other prior archive is repeated.'})

print(json.dumps({'members':len(allmembers),'domains':len(domains),'selected_sources':len(selected_paths),'new_excerpt_ranges':sum(len(x['ranges']) for x in selection),'new_excerpt_lines':sum(r['end_line']-r['start_line']+1 for x in selection for r in x['ranges']),'supplement_bytes':(HERE/'review-supplement.md').stat().st_size,'schema_bytes_read':sum(ref(x['path'])['byte_length'] for x in schema_members),'core_bytes_copied':sum(sources[p]['byte_length'] for p in sources if p.startswith('packages/core/src/session'))},indent=2))
