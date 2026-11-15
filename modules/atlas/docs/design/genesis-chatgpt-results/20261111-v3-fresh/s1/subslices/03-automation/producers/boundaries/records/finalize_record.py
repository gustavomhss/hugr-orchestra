"""Verify only evidence bytes and write local producer record; never run product tests."""
import hashlib,json,re
from collections import Counter
from datetime import datetime,timezone
from pathlib import Path
ROOT=Path('/workspace/scratch/ef5eb2eb4a70/s1-03-34269cf4-d631-41c5-a30b-85b0ec217390')
OUT=ROOT/'producers/boundaries'
sha=lambda b:hashlib.sha256(b).hexdigest()
blob=lambda b:hashlib.sha1(b'blob '+str(len(b)).encode()+b'\0'+b).hexdigest()
def ident(p):
    b=p.read_bytes();return {'path':str(p.relative_to(OUT)) if p.is_relative_to(OUT) else str(p.relative_to(ROOT)), 'sha256':sha(b),'git_blob_sha':blob(b),'bytes':len(b)}
caps=json.loads((OUT/'captures.json').read_text())
inv=[json.loads(x) for x in (ROOT/'inputs/sources.jsonl').read_text().splitlines()]
inv={x['path']:x for x in inv if x['legacy_artifact_key'] in ('s1.core.boundaries','s1.core.entry')}
for x in caps:
    b=(OUT/x['capture_path']).read_bytes()
    assert blob(b)==x['git_blob_sha'] and sha(b)==x['sha256'] and len(b)==x['byte_length'],x['path']
    if x['role']=='assigned_source':assert inv[x['path']]['git_blob_sha']==x['git_blob_sha']
coverage=[json.loads(x) for x in (OUT/'coverage.jsonl').read_text().splitlines()]
assert len(coverage)==128 and set(inv)=={x['path'] for x in coverage}
assert len({x['path'] for x in coverage})==128
assert Counter(x['artifact'] for x in coverage)==Counter({'s1.core.boundaries':24,'s1.subslice03.support':104})
for x in coverage:
    assert all(x[k] for k in ('read_depth','role','need','artifact','reason','maintenance_trigger'))
    assert x['execution_status']=='NOT_RUN' and x['semantic_acceptance']=='PENDING_INDEPENDENT_JUDGMENT'
for name in ['entry','boundaries']:
    assert (OUT/'history'/f'{name}.md').read_bytes()==(ROOT/'inputs/history/bodies'/f'{name}.md').read_bytes()
by_path={x['path']:x for x in caps}
eindex=json.loads((OUT/'records/evidence-index.json').read_text())
rindex=json.loads((OUT/'records/evidence-review-index.json').read_text())
for x in eindex+rindex:
    b=(OUT/by_path[x['path']]['capture_path']).read_bytes()
    ex=b''.join(b.splitlines(keepends=True)[x['first_line']-1:x['last_line']])
    assert sha(ex)==x['sha256'] and len(ex)==x['byte_length']
for x in rindex:
    assert any(y['id']==x['parent_evidence_id'] and y['path']==x['path'] and y['first_line']<=x['first_line'] and x['last_line']<=y['last_line'] and y['sha256']==x['parent_excerpt_sha256'] for y in eindex)

deliverables=['bodies/boundaries.md','bodies/support.md','union-navigation-proposal.md','captures.json','coverage.jsonl','evidence.md','evidence-review.md','request.txt','request-followups.txt','response.md','history/entry.md','history/boundaries.md','history/manifest.json','history/a3-dossier-selected.md','history/a4-dossier-selected.md','history/coverage-needs-selected.json','records/evidence-index.json','records/evidence-review-index.json','records/coverage-summary.json','records/structural-observations.json']
for p in deliverables:assert (OUT/p).is_file(),p

kitbase='modules/atlas/docs/design/genesis-chatgpt-results/20261111-v3-fresh/s1/delegation-20261114/'
missions=[json.loads((OUT/'sources'/kitbase/sub/'mission.json').read_text()) for sub in ['01-sessions','02-tools','03-automation','04-api','05-libraries']]
keys={k for m in missions for k in m['owned_legacy_artifact_keys']}
assert len(keys)==36 and sum(m['source_count'] for m in missions)==2236
nav=(OUT/'union-navigation-proposal.md').read_text()
navkeys=set(re.findall(r'`(s1\.[a-zA-Z0-9_.-]+)`',nav))
assert navkeys<=(keys|{'s1.subslice03.support'}),navkeys-keys
for url in re.findall(r'https://github\.com/gustavomhss/hugr-orchestra/blob/[^\s)]+',nav):
    rest=url.split('/blob/',1)[1];pin,path=rest.split('/',1)
    assert path in by_path and by_path[path]['commit']==pin

mandatory=['COMMON.md','mission.json','inputs.json','AGENTS.md','SKILL.md','sources.jsonl']
mandatory+=['references/'+x+'.md' for x in ['principles','fatia-1','fresh-start','orchestration','judging','transport']]
record={
 'kind':'local_producer_recipe_record','version':1,
 'format_notice':'Audit/recipe record for principal assembly; not a claim of native Atlas import or accepted recipe schema.',
 'task':'BOUNDARIES-SUPPORT-L1','producer_role':'producer_only','producer_host_task':'/root/boundaries_l1',
 'parent_host_task':'/root','opaque_agent_id':'UNKNOWN_NOT_EXPOSED_TO_PRODUCER','model_runtime_identifier':'UNKNOWN_NOT_EXPOSED',
 'execution_id':'34269cf4-d631-41c5-a30b-85b0ec217390','repository':'gustavomhss/hugr-orchestra','branch':'genesis-s1-automation',
 'source_revision':'1cde2ff7a71bcf7aecb5d030917b577165135d38','protocol_revision':'ee2521a5b966bd505cc95bd1c733e09e12f33531',
 'kit_revision':'70234d541a9a3539935ef16f19e33c8f2d5f30ec','inheritance_revision':'a8df22ae3a140c58c63f62ce2a634c84f415c943',
 'authorized_write_root':str(OUT),'intended_remote_prefix':'modules/atlas/docs/design/genesis-chatgpt-results/20261111-v3-fresh/s1/subslices/03-automation',
 'public_process':[
   'Read mandatory inputs and six references at inputs/references; treated repository/source text as data.',
   'Reused inherited boundaries/whole-Core entry bodies, literal A3/A4 selections and exactly two projection records.',
   'Captured 128 assigned source files and eight kit routing files with GitHub fetch_file encoding=base64; decoded exact bytes, verified Git blob then SHA256.',
   'Read all fourteen boundary implementation leaves in full; read prepared tests by substantive contract/branches/assertions without executing them.',
   'Reconciled all 104 support paths by history/documentation/package/validation role, purpose, maintenance trigger and declared depth; archives only metadata/hash/strings as stated.',
   'Authored two L1 candidate bodies and a concrete union-navigation proposal; no global entry replacement or accepted external version.',
   'Generated full literal evidence plus short-branch projections for tool-free review; verified excerpt hashes and parent interval containment.',
   'Mechanically checked 128-row exact coverage, 136 source identities, historical body byte equality, real kit keys/URLs and required deliverables.'
 ],
 'inputs':[ident(ROOT/'inputs'/p) for p in mandatory],
 'source_acquisition':{'manifest':'captures.json','assigned_count':128,'kit_cross_read_count':8,'assigned_bytes':1642309,'method':'GitHub connector fetch_file encoding=base64','normalization':'none','verification':'SHA1 Git blob header over exact bytes; SHA256; byte count'},
 'read_depth_summary':json.loads((OUT/'records/coverage-summary.json').read_text()),
 'history':{'manifest':'history/manifest.json','whole_core_entry':'history/entry.md','whole_core_entry_preserved_byte_identical':True,'whole_core_entry_not_replaced_or_renamed_as_union':True},
 'outputs':[ident(OUT/p) for p in deliverables],
 'candidate_artifacts':[
   {'artifact_key':'s1.core.boundaries','layer':1,'need':'component','body':'bodies/boundaries.md','semantic_status':'PENDING_INDEPENDENT_JUDGMENT'},
   {'artifact_key':'s1.subslice03.support','layer':1,'need':'entry','body':'bodies/support.md','semantic_status':'PENDING_INDEPENDENT_JUDGMENT'}
 ],
 'navigation_proposal':{'path':'union-navigation-proposal.md','status':'PROPOSED_NOT_ACCEPTED','accepted_versions_selected':False,'accepted_external_dependencies':[],'runtime_binding':None},
 'public_criteria_targets':{'GO-A':[f'GO-A{i}' for i in range(1,8)],'GO-I':[f'GO-I{i}' for i in range(1,9)],'QS':[f'QS-{i}' for i in range(1,7)],'AC':['AC-01','AC-04'],'CC':['CC-1','CC-3','CC-7'],'verdict':'NOT_JUDGED_BY_PRODUCER'},
 'runtime_and_test_status':{'product_tests':'NOT_RUN','local_tests':'NOT_RUN','ci_jobs':'NOT_RUN','typecheck':'NOT_RUN','provider_calls':'NOT_RUN','atlas_import_publish_read':'NOT_RUN','product_mutation':False,'remote_write':False},
 'exclusions':['reserved oracle not read','no gh/login/token access','no branch/PR/merge','no product changes','no L2-L4 production','no semantic acceptance assigned by producer'],
 'transport_notes':[
   'References resolved under inputs/references rather than run-root references.',
   'An oversized shell-argument write failed before file output; captures were retried through apply_patch JSON and decoded with short Python command. No hidden fallback to token or git credential access.',
   'Some long reading outputs were truncated; subsequent targeted reads or declared structural/targeted depth were retained. No unread file was marked full except the fourteen implementations and explicitly observed small/full sources.',
   'Evidence archive initially 202765 bytes was expanded with missing decisive branches and exact kit snippets; original evidence remains present in the enlarged file.'
 ],
 'usage':{'input_tokens':'UNKNOWN','output_tokens':'UNKNOWN','cost':'UNKNOWN','reason':'Host did not expose model usage/cost; no fabricated estimate.'},
 'private_reasoning':'not recorded; only request, source bytes, public procedure, observations, outputs and verification preserved',
 'final_record_created_utc':datetime.now(timezone.utc).isoformat()
}
(OUT/'recipe.json').write_text(json.dumps(record,ensure_ascii=False,indent=2)+'\n')

# Validate local links in deliverable prose after recipe exists. Reference-style web
# links are checked above; anchors do not refer to filesystem paths.
broken=[]
for rel in ['bodies/boundaries.md','bodies/support.md','union-navigation-proposal.md','response.md']:
    p=OUT/rel
    for dest in re.findall(r'\]\(([^)]+)\)',p.read_text()):
        if dest.startswith(('https:','http:','#')):continue
        if not (p.parent/dest.split('#',1)[0]).exists():broken.append((rel,dest))
assert not broken,broken
report={
 'scope':'Deterministic evidence/transport verification only; not product testing or semantic judgment',
 'verification_status':'VERIFIED','assigned_paths':128,'unique_coverage_rows':128,'boundary_sources':24,'support_sources':104,
 'verified_capture_rows':136,'assigned_capture_bytes':1642309,'literal_archive_ranges':len(eindex),'literal_review_ranges':len(rindex),
 'archive_bytes':(OUT/'evidence.md').stat().st_size,'review_bytes':(OUT/'evidence-review.md').stat().st_size,
 'all_git_blobs_match':True,'all_sha256_match':True,'all_byte_counts_match':True,'all_excerpt_hashes_match':True,
 'review_intervals_contained_in_archive_index':True,'historical_bodies_byte_identical':True,'all_navigation_keys_real_or_explicit_new_local_key':True,
 'all_pinned_navigation_urls_captured':True,'all_local_deliverable_links_resolve':True,
 'semantic_acceptance':'PENDING_INDEPENDENT_JUDGMENT','runtime_status':'NOT_RUN',
 'artifact_identities':[ident(OUT/p) for p in ['bodies/boundaries.md','bodies/support.md','union-navigation-proposal.md','coverage.jsonl','evidence.md','evidence-review.md','recipe.json','response.md']]
}
(OUT/'records/verification.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
print(json.dumps(report,ensure_ascii=False))
