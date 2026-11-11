from pathlib import Path
from copy import deepcopy
import json,hashlib,datetime
R=Path(__file__).resolve().parent; O=R/'output';V=O/'revisions/b-l1-v3'
PFX='modules/atlas/docs/design/genesis-chatgpt-results/20261111-v3-fresh/s1/'
sha=lambda b:hashlib.sha256(b).hexdigest()
def read(p):return json.loads(p.read_bytes())
def dump(v):return json.dumps(v,ensure_ascii=False,separators=(',',':'))
def ref(path):
 p=O/path;return {'payload_path':PFX+path,'sha256':sha(p.read_bytes())}
base_path=O/'snapshots/native-package-l1-bv2.json';base=read(base_path); old={a['key']:a for a in base['artifacts']}
working_path=O/'native-package.json';working=read(working_path)
hold=O/'snapshots/native-package-l1-bv2-held.json'
if not hold.exists():
 assert sha(working_path.read_bytes())=='c9394925da800ad57b4887e696e72dfd5ce1b4cab1d80242d9f3ee81f01b6cda'
 hold.write_bytes(working_path.read_bytes())
fragment=read(V/'fragment-metadata.json')
recipe={'schema':'genesis-cumulative-production-recipe/v1','task':'S1-L1-B-v3','source_revision':base['source_revision'],'protocol_ref':base['protocol_ref'],'purpose':'Exact original recipes plus the actual correction/evidence instructions and preserved prior independent findings. This deterministic record binds work already performed; it does not introduce a new semantic author or oracle.','original_recipes':{a['key']:old[a['key']]['recipe_ref'] for a in fragment['artifacts']},'revision_request':ref('requests/l1-b-v3.txt'),'revision_request_preserved_by_producer':ref('revisions/b-l1-v3/request.txt'),'actual_followup_steering':ref('revisions/b-l1-v3/request-steering.txt'),'prior_findings':[ref('judgments/l1-b-v2-j1.md'),ref('judgments/l1-b-v2-j2.md')],'producer_recipe_supplements':{a['key']:a.get('recipe_supplement_refs',[]) for a in fragment['artifacts']},'no_reserved_oracle_disclosed':True}
(O/'recipes').mkdir(exist_ok=True);rp=O/'recipes/b-l1-v3.json';rp.write_text(json.dumps(recipe,ensure_ascii=False,indent=2)+'\n')
new=[];normalization=[]
for raw in fragment['artifacts']:
 a=deepcopy(raw); removed=a.pop('recipe_supplement_refs',[]); previous_recipe=a['recipe_ref'];a['recipe_ref']=ref('recipes/b-l1-v3.json')
 added=['file:'+PFX+'recipes/b-l1-v3.json','file:'+PFX+'requests/l1-b-v3.txt','file:'+PFX+'revisions/b-l1-v3/request-steering.txt','file:'+PFX+'judgments/l1-b-v2-j1.md','file:'+PFX+'judgments/l1-b-v2-j2.md']
 a['input_keys']=list(dict.fromkeys(a['input_keys']+added));new.append(a)
 normalization.append({'key':a['key'],'producer_recipe_ref':previous_recipe,'removed_extension_preserved_in_recipe':removed,'new_recipe_ref':a['recipe_ref'],'live_inputs_added':added,'body_unchanged_from_producer':True})
by_key={a['key']:a for a in new}
working['artifacts']=[by_key.get(a['key'],a) for a in working['artifacts']]
working['package_state']='IN_PROGRESS'
working_path.write_text(json.dumps(working,ensure_ascii=False,indent=2)+'\n')
candidate_sha=sha(working_path.read_bytes());snap=O/'snapshots/native-package-l1-bv3.json';snap.write_bytes(working_path.read_bytes())
delta=[]
for a in new:
 before=old[a['key']]; changes={}
 for k,v in a.items():
  if v==before.get(k):continue
  if k in ['input_keys','source_refs','evidence']:
   previous=before.get(k,[])
   added=[x for x in v if x not in previous];pool=previous+added
   changes[k]={'remove':[x for x in previous if x not in v],'add':added,'exact_new_order_indices_into_original_plus_additions':[pool.index(x) for x in v]}
   assert [pool[i] for i in changes[k]['exact_new_order_indices_into_original_plus_additions']]==v,(a['key'],k)
  else:changes[k]={'new':v}
 delta.append({'key':a['key'],'changes':changes})
body_ids=read(V/'body-identities.json')
parts=['# S1-L1-B-v3 — exact revision for the same persistent judges\n\nThis is the mandatory B1/B2/B3 response to B-v2, not a new bar. Apply the original frozen L1 oracle and all twelve mandatory L1 criteria. J2 bounded PASS on disposition never waived J1 B3. The original d8 package and B-v2 dossier remain predecessors. Six bodies are byte-identical; three complete revised bodies and exact metadata deltas follow. Nothing claims whole L1 release, runtime execution, tests, generation freshness, or broad Core behavior.\n', '## Fixed identities\n```json\n'+dump({'source_revision':base['source_revision'],'protocol_revision':'ee2521a5b966bd505cc95bd1c733e09e12f33531','base_package_sha256':sha(base_path.read_bytes()),'candidate_package_sha256':candidate_sha,'producer_fragment_sha256':sha((V/'fragment-metadata.json').read_bytes()),'criteria':['QS-1','QS-2','QS-4','QS-5','QS-6','CC-1','CC-3','CC-7','GO-I1','GO-I2','GO-I7','GO-I8'],'body_identities':body_ids})+'\n```\n', '## Findings response\n'+(V/'findings-resolution.md').read_text(), '## Complete changed bodies\n']
for item in body_ids['bodies']:
 if item['changed']:
  p=O/item['candidate_body']['path'];parts.append('### '+item['key']+'\n<ARTIFACT_BODY_DATA>\n'+p.read_text()+'</ARTIFACT_BODY_DATA>\n')
parts.append('## Exact metadata changes from B-v2\nFor each changed array, concatenate the original array and the displayed additions, then select its zero-based exact_new_order_indices_into_original_plus_additions. This reconstructs every current element and its exact order, including sorted source refs; removals are explicit. The metadata revision adds a deterministic cumulative recipe; original producer extension values are conserved in that recipe and are not silently discarded. Same recipe contents are not a semantic verdict.\n```json\n'+dump(delta)+'\n```\n```json\n'+dump(recipe)+'\n```\n')
parts.append('## Principal independent mechanical verification\n```json\n'+dump(read(O/'receipts/l1-b-v3-verification.json'))+'\n```\n')
parts.append('## Exact domain disposition\n'+(V/'review-domain-disposition.md').read_text())
parts.append('## Exact missing branch context\n'+(V/'complete-branch-context.md').read_text())
parts.append('## Exact supplementary literal evidence\n'+(V/'review-supplement.md').read_text())
parts.append('## Decision request\nReturn one decision for the exact nine B-v3 artifacts, preserving prior bounded PASSes only where unchanged and sufficient. Cover every mandatory criterion and each B1/B2/B3 finding. Any mandatory unresolved item remains open; identify the minimal evidence or correction, not new optional scope. The 190-domain map is a current L1 purpose/contract/ownership triage, not an assertion that every underlying Core/provider behavior has been executed. Conditional F02–F08 and the large generated-source observer refusal remain explicit.\n')
packet='\n'.join(parts).encode();p=O/'review-packets/l1-b-v3-dossier.md';p.write_bytes(packet)
receipt={'batch':'S1-L1-B-v3','package_sha256':candidate_sha,'package_snapshot':'snapshots/native-package-l1-bv3.json','base_package_sha256':sha(base_path.read_bytes()),'retained_hold_snapshot':'snapshots/native-package-l1-bv2-held.json','packet':{'path':'review-packets/l1-b-v3-dossier.md','sha256':sha(packet),'byte_length':len(packet)},'criteria':['QS-1','QS-2','QS-4','QS-5','QS-6','CC-1','CC-3','CC-7','GO-I1','GO-I2','GO-I7','GO-I8'],'required_keys':list(by_key),'body_identities':body_ids,'principal_metadata_normalization':normalization,'semantic_status':'PENDING','frozen_at':datetime.datetime.now(datetime.timezone.utc).isoformat()}
(O/'receipts/l1-b-v3-freeze.json').write_text(json.dumps(receipt,ensure_ascii=False,indent=2)+'\n')
print(dump({'packet':receipt['packet'],'candidate_package_sha256':candidate_sha,'required_keys':len(by_key)}))
