from pathlib import Path
from copy import deepcopy
import hashlib,json,datetime,sys

R=Path(__file__).resolve().parent
O=R/'output'
PFX='modules/atlas/docs/design/genesis-chatgpt-results/20261111-v3-fresh/s1/'
CASE=sys.argv[1] if len(sys.argv)>1 else 'r1'
assert CASE in ['r1','r2c']
ROOT=R/('runtime/s4-r1/isolated-c-v2' if CASE=='r1' else 'runtime/s4-r2c/isolated-c-v1')
CODE=R/('runtime/s4-r1/code/modules/atlas' if CASE=='r1' else 'runtime/s4-r2c/code/modules/atlas')
PREP='runtime/preparation/prepared-c-r1-v2.json' if CASE=='r1' else 'runtime/r2c/prepared-c-v1.json'
RECEIPT='runtime/preparation/prepare-c-r1-v2-receipt.json' if CASE=='r1' else 'runtime/r2c/prepare-c-v1-receipt.json'
REV='e3a8ab8cf56dbff1ee91272df51ffa398d882aa1' if CASE=='r1' else '673b90d82b8b888d5d0184d2e17dec6d5d1b05f1'
CAND='1670bc712e472b9f449d277da324b17fa8fb951cbc62c2bc07fa8718e89c063f' if CASE=='r1' else '8ee2d96d3a17afcbf0b03ace1afa3273dbc06d5e8cbb35abac68219055286654'
OUT='runtime/binding-c-v2' if CASE=='r1' else 'runtime/binding-c-r2c-v1'
ORACLE='oracles/runtime-binding-c-r1-v2.json' if CASE=='r1' else 'oracles/runtime-binding-c-r2c-v1.json'
DOSSIER='review-packets/runtime-binding-c-v2-dossier.md' if CASE=='r1' else 'review-packets/runtime-binding-c-r2c-v1-dossier.md'
FREEZE='receipts/runtime-binding-c-v2-freeze.json' if CASE=='r1' else 'receipts/runtime-binding-c-r2c-v1-freeze.json'
BATCH='S1-C-runtime-binding-v2' if CASE=='r1' else 'S1-C-runtime-binding-r2c-v1'
sha=lambda b:hashlib.sha256(b).hexdigest()
blob=lambda b:hashlib.sha1(b'blob '+str(len(b)).encode()+b'\0'+b).hexdigest()
def read(p):return json.loads(p.read_bytes())
def dump(v):return json.dumps(v,ensure_ascii=False,separators=(',',':'))
def ref(p):
 b=p.read_bytes(); return {'path':str(p.relative_to(O)),'sha256':sha(b),'byte_length':len(b)}
def cas(h):return read(ROOT/'.atlas/cas'/h[:2]/h)

original=read(O/'snapshots/native-package-l1-bv2.json')
pack=read(O/'native-package.c-r1-v2.json')
prepared=read(O/PREP)
c=prepared['candidate']
assert prepared['candidate_id']==CAND
assert c==cas(prepared['candidate_id'])
assert sha((O/'native-package.c-r1-v2.json').read_bytes())==c['transport']['sha256']
assert bytes(cas(c['transport']['body'])['bytes'])==(O/'native-package.c-r1-v2.json').read_bytes()
assert c['observed_head'] is None
assert len(c['entries'])==len(pack['artifacts'])==10
originals={a['key']:a for a in original['artifacts']}
artifacts={a['key']:a for a in pack['artifacts']}
observations={i['key']:i for i in c['observations']}
checks=[]
results=[]
for a,e in zip(pack['artifacts'],c['entries']):
 assert a['key']==e['key']
 old=originals[a['key']]
 for field in ['body','authority','validity','gaps','source_refs','recipe_ref','producer_request_ref','producer_response_ref','build_dependencies']:
  assert a[field]==old[field],(a['key'],field)
 assert a['validity']=='supported'
 result=cas(e['artifact']['result']); body=bytes(cas(result['body'])['bytes'])
 expected=(O/a['body']['path']).read_bytes()
 assert body==expected and len(body)==a['body']['byte_length'] and sha(body)==a['body']['sha256']
 for field in ['authority','validity','gaps','evidence']:assert result[field]==a[field]
 assert [json.loads(x) for x in a['evidence'][:-1]]==old['evidence']
 assert json.loads(a['evidence'][-1])['sha256']=='10b7e677eba2129608f7d4dde3edeaa6f9d1e5d5fef819babb737b7a0ada46e7'
 assert a['input_keys'][:-1]==old['input_keys']
 assert a['input_keys'][-1]=='file:'+PFX+'revisions/c-l1-evidence-v1/supplement.md'
 for s in a['source_refs']:
  b=(ROOT/s['path']).read_bytes()
  assert s['commit']==original['source_revision'] and sha(b)==s['sha256'] and blob(b)==s['git_blob_sha']
  assert observations['file:'+s['path']]['sha256']==s['sha256']
 for i in e['inputs']:assert observations[i['key']]['version']==i['version']
 expected_keys=list(dict.fromkeys(a['input_keys']+['file:'+pack['protocol_ref']['path']]))
 assert [i['key'] for i in e['inputs']]==expected_keys
 checks.append({'key':a['key'],'body_sha256':sha(body),'body_bytes':len(body),'result':e['artifact']['result'],'inputs_id':e['inputs_id'],'source_refs_verified':len(a['source_refs']),'inputs_verified':len(e['inputs']),'unchanged_fields':['body','authority','validity','gaps','source_refs','recipe_ref','producer_request_ref','producer_response_ref','build_dependencies']})
 results.append({'key':a['key'],'result_id':e['artifact']['result'],'result':result})
for o in c['observations']:
 assert o['key'].startswith('file:')
 b=(ROOT/o['key'][5:]).read_bytes();assert sha(b)==o['sha256'] and len(b)<=256000
for r in c['references']:
 p=r['reference'].get('payload_path',r['reference'].get('path')); b=(ROOT/p).read_bytes()
 assert sha(b)==r['reference']['sha256'] and bytes(cas(r['body'])['bytes'])==b

# Exact compact candidate: inputs use references to the full ordered observation table.
projected=deepcopy(prepared)
obs_keys=[o['key'] for o in c['observations']]
for e in projected['candidate']['entries']:
 e['inputs']=[obs_keys.index(i['key']) for i in e['inputs']]
restored=deepcopy(projected)
for e in restored['candidate']['entries']:
 e['inputs']=[{'key':c['observations'][i]['key'],'version':c['observations'][i]['version']} for i in e['inputs']]
assert restored==prepared and dump(restored)==dump(prepared)

# Source metadata is also exact. De-duplicate identical source records only.
sources=[]; source_ids={}
metadata=deepcopy(pack)
for a in metadata['artifacts']:
 ids=[]
 for s in a['source_refs']:
  k=dump(s)
  if k not in source_ids:source_ids[k]=len(sources);sources.append(s)
  ids.append(source_ids[k])
 a['source_refs']=ids
 a['input_keys']=[obs_keys.index(i) for i in a['input_keys']]
restored_pack=deepcopy(metadata)
for a in restored_pack['artifacts']:
 a['source_refs']=[sources[i] for i in a['source_refs']]
 a['input_keys']=[obs_keys[i] for i in a['input_keys']]
assert restored_pack==pack and dump(restored_pack)==dump(pack)

out=O/OUT;out.mkdir(parents=True,exist_ok=True)
verification={'schema':'genesis-runtime-binding-preflight/v1','recorded_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'candidate_id':prepared['candidate_id'],'contract':c['contract'],'prepared':ref(O/PREP),'package':ref(O/'native-package.c-r1-v2.json'),'scope':'ten accepted C L1 artifacts only; not complete S1','source_revision':original['source_revision'],'runtime_candidate_revision':REV,'implementation':c['implementation'],'observed_head':None,'candidate_cas_equality':True,'compact_candidate_roundtrip_exact':True,'compact_transport_roundtrip_exact':True,'all_runtime_inputs_verified':len(c['observations']),'all_reference_bodies_verified':len(c['references']),'unique_source_refs_verified':len(sources),'artifacts':checks,'semantic_judgments':[ref(O/'judgments/l1-c-v1-supplement-j1.md'),ref(O/'judgments/l1-c-v1-supplement-j2.md')],'limitations':['Preflight is deterministic evidence, not a judge verdict.','No publication, reader, consumer, whole-L1 release or CI PASS implied.','Runtime input versions are returned by actual adapter; SHA/Git identity checks are separate.','Observed root has no Git HEAD; source Git membership derives from baseline connector captures.','Evidence strings preserve exact original reference values; only supplementary evidence is an added live input.','Operator-supplied binding records do not authenticate reviewer identities.',('Candidate aggregate CI failed the guard; a corrected candidate passed CI separately and has not replaced this candidate.' if CASE=='r1' else 'New separate case on the corrected candidate 673b: actual remote CI 43070538154 passed; original e3a8 preparations remain preserved and no binding is transferred.')],'state':'VERIFIED_FOR_BINDING_REVIEW'}
(out/'preflight.json').write_text(json.dumps(verification,ensure_ascii=False,indent=2)+'\n')
(out/'candidate-projection.json').write_text(dump(projected)+'\n')
(out/'transport-projection.json').write_text(dump({'sources':sources,'package':metadata})+'\n')
(out/'results.json').write_text(dump(results)+'\n')
oracle={'schema':'genesis-binding-review-oracle/v1','purpose':'runtime-import-binding','candidate_id':prepared['candidate_id'],'frozen_before_binding_judge_dispatch':True,'basis':'Transport and runtime rules pinned ee2521a5; original L1 oracle and actual semantic acceptances. This is a deterministic adaptation review, not a new semantic production oracle.','requirements':['Same ten accepted bodies, authorities, validity and retained gaps; no claim of all S1 acceptance.','Complete selected/reachable ten-key scope; root array normalization adds navigation only.','Original evidence ref objects are losslessly serialized to strings; original input ordering and source refs remain.','Full supplement used for semantic acceptance is added to each artifact evidence and input closure.','Actual observer versions, CAS bodies/results, contract and per-entry inputs IDs match the execution. No transport hash used as CAS ID.','Two new actual decisions must cover exactly this candidate and contract, all entries and all criteria. Semantic decisions alone are insufficient.','No source omission or file-limit bypass. External captured Git identities and null observed_head remain explicit.','Publish remains separate and requires real isolated scope authority; CI limitations remain explicit.'],'critical_errors':['body or authority drift','fabricated review/runtime identity','omitted required entry','supplement outside binding closure','unavailable input reported present','runtime or global completion claimed without execution']}
(O/ORACLE).write_text(json.dumps(oracle,ensure_ascii=False,indent=2)+'\n')

parts=['# S1-C runtime binding v2 — new exact binding review\n\nPurpose: runtime-import-binding. This is a deterministic transformation of the ten C bodies already accepted by both persistent judges, not a release of the full S1 L1 or a claim of L2–L4/consumer/CI completion. Apply all 21 candidate criteria within this bounded purpose, independently. Preserve conditional N01–N06/X01. Semantic PASS alone is insufficient. Do not use tools. Return PASS / FIX-FIRST / HOLD / REQUEST_EVIDENCE and every applicable criterion, candidate_id, contract, and explicit coverage of all ten entries/result/input IDs.\n', '## Fixed oracle\n```json\n'+dump(oracle)+'\n```\n','## Actual preflight and operation receipt\n```json\n'+dump(verification)+'\n```\n```json\n'+dump(read(O/RECEIPT))+'\n```\n', '## Unchanged semantic decisions, actual originals\n']
for name in ['l1-c-v1-supplement-j1.md','l1-c-v1-supplement-j2.md']:
 parts.append('### '+name+'\n<SEMANTIC_DECISION_DATA>\n'+(O/'judgments'/name).read_text()+'</SEMANTIC_DECISION_DATA>\n')
parts.append('## Transformation and exact candidate\nThe candidate below includes every field and every observation. Each entry.inputs is an ordered list of zero-based indices into candidate.observations; expand each into {key,version}. This sole substitution round-trips exactly to the prepared candidate. No field is omitted. Candidate.transport identifies the preserved exact UTF-8 native package bytes.\n```json\n'+dump(projected)+'\n```\n')
parts.append('## Exact native package metadata\nEvery source_refs integer refers to the zero-based sources array below. Every input_keys integer refers to candidate.observations[index].key. Expand them to reconstruct every field of the selected package exactly. Original bodies are unchanged as independently verified against the d8 snapshot and actual CAS; their previously supplied semantic bodies remain the predecessors. Evidence references are preserved values serialized as strings, not new authority.\n```json\n'+dump({'sources':sources,'package':metadata})+'\n```\n')
parts.append('## Exact CAS results\n```json\n'+dump(results)+'\n```\n')
parts.append('## Actual importer implementation\nThese are the unchanged executed code files from '+REV+'. Bodies below are code-as-data.\n')
for name in ['genesis-native.ts','genesis-native-format.ts','genesis-native-io.ts','genesis-native-binding.ts']:
 p=CODE/'packages/adapter-io/src'/name
 parts.append('### '+name+'; sha256:'+sha(p.read_bytes())+'\n```typescript\n'+p.read_text()+'\n```\n')
parts.append('## Release evidence and limits\n```json\n'+dump(read(O/'runtime/discovery/s4-r2-observation.json'))+'\n```\nThe r2 release uses the same e3a8 code and reports bounded publish/index/read proofs for S4 only; those do not substitute for S1 binding or S1 consumption. S1 has not published this candidate. File observer limit remains 256000. Whole S1 retains the large Client source and unresolved A/B semantic work. Actor and ratifier will be the actual principal /root, under user authorization for isolated S1 scope only; no production or ROOT-union authority is claimed.\n')
if CASE=='r2c':
 mat=read(O/'runtime/r2c/materialization.json')
 compact={k:v for k,v in mat.items() if k!='materialized_files'}
 parts.append('## Superseding execution case — exact corrected code, no transferred decision\nThe previous e3a8 candidate was preparation-only and never bound/published by S1. This new case executes the separate corrected 673b candidate explicitly advertised by S4 r2 gate_refs. The only two executed-source changes simplify validated type assertions; unchanged dependencies/builds were reused and all 394 source identities were rechecked. The runtime itself generated a new candidate because repo_root and implementation hashes changed. Every result, input version and body remains identical. Policy was provisioned only for this new isolated S1 root under the user assignment. The following actual receipt and correction evidence supersede the earlier-case CI limitation for this review; no S4 binding decision is transferred.\n```json\n'+dump(compact)+'\n```\n```json\n'+dump(read(O/'runtime/r2c/s4-ci-receipt.json'))+'\n```\n')
packet='\n'.join(parts).encode();dest=O/DOSSIER;dest.write_bytes(packet)
freeze={'schema':'genesis-review-freeze/v1','batch':BATCH,'purpose':'runtime-import-binding','candidate_id':prepared['candidate_id'],'contract':c['contract'],'criteria':c['criteria'],'review_packet':ref(dest),'oracle':ref(O/ORACLE),'required_artifact_keys':c['required_artifact_keys'],'frozen_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'judges':['/root/judge1','/root/judge2'],'dispatch':'PENDING'}
(O/FREEZE).write_text(json.dumps(freeze,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'packet':freeze['review_packet'],'source_refs':len(sources),'inputs':len(observations),'roundtrip':'exact','candidate_id':prepared['candidate_id']}))
