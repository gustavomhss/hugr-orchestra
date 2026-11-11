from pathlib import Path
from collections import Counter
import hashlib, json, re

ROOT=Path('/workspace/scratch/2b46fb541868/genesis-s1')
BASE=ROOT/'producers/a'
OUT=ROOT/'revisions/a-l1-evidence-v1'
PIN='1cde2ff7a71bcf7aecb5d030917b577165135d38'
PROTOCOL='ee2521a5b966bd505cc95bd1c733e09e12f33531'
sha=lambda b:hashlib.sha256(b).hexdigest()

def read(path): return json.loads(path.read_text())
def ref(path,base=OUT):
    raw=path.read_bytes()
    return {'path':path.relative_to(base).as_posix(),'sha256':sha(raw),'byte_length':len(raw)}
def dump(name,value): (OUT/name).write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n')

freeze=read(OUT/'original-freeze-before.json')
current=[ref(p,BASE) for p in sorted(BASE.rglob('*')) if p.is_file()]
assert current==freeze['files'],'An original file changed, appeared or disappeared during this evidence-only revision'
assert sha((BASE/'artifacts.json').read_bytes())=='528eaae032b21708a9a55ef027bd7449b6e29d0c9881f26d84b16d58805a67e7'
original_c=read(BASE/'coverage.json'); original_f=read(BASE/'family-disposition.json');original_a=read(BASE/'artifacts.json')
p=read(OUT/'coverage-needs-projection.json');n=read(OUT/'needs-and-blockers.json');e=read(OUT/'supplement-excerpt-map.json')
roundtrip=[]
for g in p['coverage_groups']:
    assert g['count']==len(g['members'])
    roundtrip += [{**g['classification'],**m} for m in g['members']]
assert sorted(roundtrip,key=lambda x:x['path'])==sorted(original_c['entries'],key=lambda x:x['path'])
assert len(roundtrip)==len({x['path'] for x in roundtrip})==1441
assert [f['original_record'] for f in p['families']]==original_f['families']
assert [a['original_artifact'] for a in p['artifacts']]==original_a['artifacts']
assert p['original_need_roots']==n['original_roots']==original_a['roots']
assert sum(r['count'] for r in p['reason_dictionary'])==1441
original_by_key={a['key']:a for a in original_a['artifacts']}
assert len(original_by_key)==17 and set(e['artifact_map'])==set(original_by_key)
for x in n['needs']:
    a=original_by_key[x['key']]
    for k in ['key','need','validity','gaps','input_keys','build_dependencies','body']:assert x[k]==a[k],(x['key'],k)
for f in p['families']:
    rows=[r for r in roundtrip if r['family']==f['original_record']['family']]
    assert len(rows)==f['original_record']['population_count']
    assert dict(Counter(r['depth'] for r in rows))==f['derived_counts']['by_depth']
    assert dict(Counter(r['source_read_status'] for r in rows))==f['derived_counts']['by_read_status']

doc=(OUT/'supplement-evidence.md').read_bytes()
assert sha(doc)==e['document']['sha256'] and len(doc)==e['document']['byte_length']
captured=read(BASE/'capture-manifest.json'); sources={s['path']:s for s in captured['sources']}
source_bytes=0
for s in e['sources']:
    original=sources[s['path']];raw=(BASE/'sources'/s['path']).read_bytes()
    assert s['commit']==PIN==original['commit']
    assert sha(raw)==s['sha256']==original['sha256']
    assert len(raw)==s['byte_length']==original['byte_length']
    assert hashlib.sha1(b'blob '+str(len(raw)).encode()+b'\0'+raw).hexdigest()==s['git_blob_sha']==original['git_blob_sha']
    source_bytes+=len(raw)

parsed=re.findall(rb'^### (AEX\d+)\n(.*?)^````text\n(.*?)^````\n',doc,re.S|re.M)
assert len(parsed)==len(e['excerpts'])==96
exact_by_id={id.decode():body for id,header,body in parsed}
newlines=0
for x in e['excerpts']:
    raw=(BASE/'sources'/x['path']).read_bytes(); lines=raw.splitlines(keepends=True)
    expected=b''.join(lines[x['start_line']-1:x['end_line']])
    assert expected==exact_by_id[x['id']]
    assert sha(expected)==x['sha256'] and len(expected)==x['byte_length']
    assert x['source_revision']==PIN and x['git_blob_sha']==sources[x['path']]['git_blob_sha']
    assert x['new_line_count_relative_to_compact']>0
    newlines+=x['new_line_count_relative_to_compact']
    for key in x['artifact_keys']:
        assert key in original_by_key and x['id'] in e['artifact_map'][key]['supplement_excerpt_ids']
for key,m in e['artifact_map'].items():
    assert m['body']==original_by_key[key]['body']
    assert sha((BASE/m['body']['path']).read_bytes())==m['body']['sha256']
    assert m['supplement_excerpt_ids']

obs=read(OUT/'deterministic-source-observations.json')['observations'][0]
pkg=read(BASE/'sources/packages/core/package.json')['exports']
assert obs['number_of_keys']==len(pkg)==437
assert obs['has_bare_dot_export']==('.' in pkg)==False
assert obs['wildcard_keys']==[k for k in pkg if '*' in k]==[]

manifest={
 'schema':'genesis-evidence-revision-manifest/v1','revision':'a-l1-evidence-v1','producer_task':'S1-L1-A','producer_handle':'/root/producer_a',
 'scope':'orchestra.s1','source_revision':PIN,'protocol_revision':PROTOCOL,
 'principal_execution':'c56ee4c3-b9dc-4569-aeb0-d3cfa5c2a502',
 'request':ref(OUT/'request.txt'),'steering':ref(OUT/'request-steering.txt'),
 'base_artifacts':ref(BASE/'artifacts.json',ROOT),
 'base_dossier':p['base_dossier'],
 'purpose':'Supplement the frozen L1 evidence with lossless grouped coverage/needs projections and exact extra spans from already-captured source bytes. No body/original changes or new L2–L4 artifacts.',
 'files':[ref(x) for x in sorted(OUT.iterdir()) if x.is_file() and x.name not in {'revision-manifest.json','verification.json','checksums.json'}],
 'new_classification_authority':'Separately labeled clarifications only; original fields unchanged. Unknown critical leaf behavior remains a mandatory gap when required by the L1 need.',
 'judge_dispatch':'NOT_SENT','oracles':'NOT_READ','remote_reads_this_revision':0,'remote_writes':'NONE','product_execution':'NOT_RUN',
 'semantic_acceptance':'PENDING_PRINCIPAL_INDEPENDENT_REVIEW',
 'usage':{'tokens':'UNKNOWN','physical_model_attempts':'UNKNOWN','billing':'UNKNOWN'},
}
dump('revision-manifest.json',manifest)
verification={
 'schema':'genesis-evidence-revision-verification/v1','revision':'a-l1-evidence-v1','result':'PASS_EVIDENCE_BINDINGS_ONLY',
 'revision_manifest':ref(OUT/'revision-manifest.json'),
 'checks':{
   'original_files_unchanged':len(current),'original_bodies_unchanged':len(original_by_key),
   'original_artifacts_expected_sha256':sha((BASE/'artifacts.json').read_bytes()),
   'coverage_exact_roundtrip_entries':len(roundtrip),'coverage_unique_paths':len({r['path'] for r in roundtrip}),
   'coverage_groups':len(p['coverage_groups']),'original_justifications_preserved':len(p['reason_dictionary']),
   'family_records_exact':len(p['families']),'artifact_records_exact':len(p['artifacts']),'needs_fields_exact':len(n['needs']),
   'source_files_reverified_git_blob_sha256_size':len(e['sources']),'source_bytes_reverified':source_bytes,
   'exact_fenced_excerpts_compared_to_source_slices':len(e['excerpts']),'added_source_lines_relative_to_compact':newlines,
   'frozen_bodies_bound_in_artifact_excerpt_map':len(e['artifact_map']),'explicit_export_keys_parsed':437,
 },
 'limits':[
   'Structural/evidence validation does not decide semantic sufficiency or accept the L1 layer.',
   'The principal-provided base dossier hash is carried as supplied, not locally verified; the dossier and oracles were not read.',
   'No product, provider, database, toolkit, sandbox, MCP, native, runtime, CI or consumer execution occurred.',
   'Unread leaves, orientation-only historical read status, source/document conflicts and external implementation boundaries remain preserved.',
   'No L2–L4 dependent artifact keys or build edges were invented; no dependent is released by this supplement.',
 ],
 'product_tests':'NOT_RUN','runtime_checks':'NOT_RUN','remote_source_fetches_this_revision':0,'remote_writes':'NONE','semantic_review':'NOT_PERFORMED_BY_PRODUCER','judge_dispatch':'NOT_SENT',
}
dump('verification.json',verification)
dump('checksums.json',{'schema':'genesis-evidence-revision-checksums/v1','revision':'a-l1-evidence-v1','files':[ref(x) for x in sorted(OUT.iterdir()) if x.is_file() and x.name!='checksums.json'],'self_hash_excluded':True})
print(json.dumps({'result':verification['result'],'checks':verification['checks'],'key_files':[ref(OUT/name) for name in ['coverage-needs-projection.json','coverage-needs-projection.md','needs-and-blockers.json','supplement-evidence.md','supplement-excerpt-map.json','revision-manifest.json','verification.json','checksums.json']]},ensure_ascii=False,indent=2))
