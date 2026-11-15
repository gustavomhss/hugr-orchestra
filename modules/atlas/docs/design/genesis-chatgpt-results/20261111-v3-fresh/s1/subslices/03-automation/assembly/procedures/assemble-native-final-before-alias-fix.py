"""Assemble the exact selected native package after all semantic gates. No runtime operation or remote write.

Inputs are enumerated by the audited L1 descriptors and genuine producer manifests/extensions.
This is transport assembly, never a semantic authoring recipe. It does not invent Atlas versions.
"""
from pathlib import Path
import json,hashlib,sys,shutil,datetime
W=Path(__file__).resolve().parents[1];P=W/'payload';N=W/'native-source'
OUT='modules/atlas/docs/design/genesis-chatgpt-results/20261111-v3-fresh/s1/subslices/03-automation'
H=lambda b:hashlib.sha256(b).hexdigest()
G=lambda b:hashlib.sha1(b'blob '+str(len(b)).encode()+b'\0'+b).hexdigest()
def readj(p):return json.loads(p.read_text())
def ident(p):
 b=p.read_bytes();return {'bytes':len(b),'sha256':H(b),'git_blob_sha':G(b)}
def exact(p,sha,size=None,blob=None):
 b=p.read_bytes();assert H(b)==sha,(str(p),'sha256');assert size is None or len(b)==size,(str(p),'size');assert blob is None or G(b)==blob,(str(p),'blob');return b

# This assembly is intentionally released by an explicit root-created configuration after review.
if len(sys.argv) not in [2,3]:raise SystemExit('usage: assemble-native-final.py CONFIG_JSON [--inventory-only]')
inventory_only=len(sys.argv)==3 and sys.argv[2]=='--inventory-only'
cfg=readj(Path(sys.argv[1]));pin=cfg.get('source_payload_commit')
if not inventory_only:
 assert isinstance(pin,str) and len(pin)==40 and all(c in '0123456789abcdef' for c in pin)
 snapshot=readj(W/cfg['published_input_snapshot_index'])
 readback=readj(W/cfg['published_input_readback_receipt'])
 assert readback['payload']==pin and readback['git_sha_and_sizes_all_match'] is True
 published={f['path']:f for f in snapshot['files']}
else:assert pin is None, 'Prepublication inventory must not assert an invented source pin.'
plan=readj(P/'artifact-plan.json');gates={a['key']:a for a in readj(P/'semantic-acceptances.json')['artifacts']}
audit={a['key']:a for a in readj(W/'assembly-native-descriptors/descriptors.json')['artifacts']}
shared=readj(P/'receipts/shared-input-materialization.json')['files'];shared_by_local={a['capture_archive']:a for a in shared}
audited_by_path={}
for record in audit.values():
 for u in record['input_units']:
  if not u['canonical_path'].startswith(OUT+'/'):audited_by_path[u['canonical_path']]=u
translation=[];materialized={};all_units={};artifacts=[]

def put_payload(rel,b):
 p=P/rel;p.parent.mkdir(parents=True,exist_ok=True)
 if p.exists(): assert p.read_bytes()==b,(str(p),'do not overwrite a distinct staged artifact')
 else:p.write_bytes(b)
 return OUT+'/'+rel

def put_native(path,b):
 p=N/path;p.parent.mkdir(parents=True,exist_ok=True)
 if not p.exists() or p.read_bytes()!=b:p.write_bytes(b)
 materialized[path]={'path':path,'bytes':len(b),'sha256':H(b),'git_blob_sha':G(b)}

def canonical_local(local,sha,size=None,blob=None,alias=None,original_read_paths=None):
 """Map a genuine local input, honoring exact old-version alias supplied in config."""
 p=W/(alias or local);b=exact(p,sha,size,blob)
 if local in shared_by_local:
  m=shared_by_local[local];assert m['sha256']==sha;dest=m['path'];commit=m['commit']
 elif '/sources/' in local and local.split('/sources/',1)[1] in audited_by_path:
  dest=local.split('/sources/',1)[1];m=audited_by_path[dest];assert m['sha256']==sha;commit=m['origin_commit']
 elif local.startswith('inputs/'):
  raise AssertionError(('unmapped original authority file',local))
 else:
  rel=(alias or local).removeprefix('payload/');dest=put_payload(rel,b);commit=pin
 put_native(dest,b)
 lineage=original_read_paths or [local]
 translation.append({'declared_local_input_path':local,'original_read_paths':lineage,'retained_path':alias or local,'canonical_path':dest,'sha256':sha,'bytes':len(b),'whole_file':True,'publication_commit':commit})
 return {'input_key':'file:'+dest,'canonical_path':dest,'bytes':len(b),'sha256':sha,'git_blob_sha':G(b),'origin_commit':commit,'whole_file':True,'uses':[{'role':'genuine producer input; source or procedure provenance retained in original manifest','original_read_paths':lineage,'retained_alias':alias}]}

def merge_unit(units,u):
 path=u['canonical_path']
 if path in units:
  assert all(units[path][k]==u[k] for k in ['sha256','bytes','git_blob_sha']),('input path version collision',path)
  units[path].setdefault('uses',[]).extend(u.get('uses',[]))
 else:units[path]=u
 if path in all_units:assert all_units[path]['sha256']==u['sha256'],('global input collision',path)
 else:all_units[path]=dict(u)|{'input_for':[]}

for task in plan['artifacts']:
 key=task['key'];gate=gates[key];spec=cfg['artifacts'][key]
 assert gate['status']=='PASS_SEMANTIC_CURRENT_BODY',(key,'semantic gate')
 assert {j['judge_id'] for j in gate['judgments']}=={'parallel-v3-fresh/S1-03/J1','parallel-v3-fresh/S1-03/J2'}
 b=exact(W/gate['local_body_path'],gate['body_sha256'],gate['body_bytes'],gate['body_git_blob_sha'])
 bodyrel=gate['local_body_path'];assert bodyrel.startswith('producers/')
 put_payload(bodyrel,b);put_native(OUT+'/'+bodyrel,b)
 units={}
 if key in audit:
  for source in audit[key]['input_units']:
   u=json.loads(json.dumps(source));path=u['canonical_path'];override=spec.get('audited_path_aliases',{}).get(path)
   if override:
    original=dict(u);u=canonical_local(override['original_local_path'],u['sha256'],u['bytes'],u['git_blob_sha'],override['retained_local_path']);u['uses']+=original.get('uses',[])
    u['uses'].append({'role':'Origin before exact retained alias; no old-version bytes replaced by current body','origin_commit':original['origin_commit'],'origin_path':original['canonical_path'],'sha256':original['sha256'],'git_blob_sha':original['git_blob_sha']})
   else:
    raw=exact(N/path,u['sha256'],u['bytes'],u['git_blob_sha'])
    if path.startswith(OUT+'/'):
     put_payload(path[len(OUT)+1:],raw);u['origin_commit']=pin
   merge_unit(units,u)
 # The root configuration enumerates genuinely consumed extension rows after reading their actual schemas.
 # No file is added merely because it is an output or was inspected by the transport assembler.
 for row in spec.get('additional_actual_inputs',[]):
  merge_unit(units,canonical_local(row['local_path'],row['sha256'],row['bytes'],row['git_blob_sha'],row.get('retained_alias'),row.get('original_read_paths')))
 for path,u in units.items():
  if key not in all_units[path]['input_for']:all_units[path]['input_for'].append(key)
 refs=[{'commit':u['origin_commit'],'path':u['canonical_path'],'git_blob_sha':u['git_blob_sha'],'sha256':u['sha256']} for u in units.values()]
 def ref(local):
  raw=(W/local).read_bytes();rel=local.removeprefix('payload/');dest=put_payload(rel,raw);put_native(dest,raw);return {'payload_path':dest,'sha256':H(raw)}
 reviewrefs=[]
 for j in gate['judgments']:
  original=exact(W/j['original_response_path'],j['original_response_sha256']);assert j['body_sha256']==gate['body_sha256'] and j['status']=='PASS'
  archive=spec['review_payload_paths'][j['judge_id']];assert (P/archive).read_bytes()==original
  reviewrefs.append(ref('payload/'+archive))
 recipe=ref(spec['actual_recipe_local_path']);assert 'file:'+recipe['payload_path'] in [u['input_key'] for u in units.values()],(key,'actual recipe missing genuine input')
 artifacts.append({'key':key,'scope':'orchestra.s1','title':task['purpose'],'layer':task['layer'],'need':task['need'],
  'body':{'path':bodyrel,'encoding':'utf-8','byte_length':len(b),'sha256':H(b)},
  'authority':{'scope':'orchestra.s1','basis':'S1-03 COMMON/mission at 70234d541a9a3539935ef16f19e33c8f2d5f30ec; current body accepted by the same two local native judges. Content authority only; no runtime or production activation authority is conferred.'},
  'validity':'supported','gaps':spec['gaps'],'evidence':spec['evidence'],
  'input_keys':[u['input_key'] for u in units.values()],'source_refs':refs,'recipe_ref':recipe,
  'build_dependencies':[{'key':p,'same_package':True} for p in task['required_build_predecessors']],
  'navigation':spec.get('navigation',[]),'producer_request_ref':ref(spec['request_local_path']),'producer_response_ref':ref(spec['response_local_path']),
  'semantic_review_refs':reviewrefs,'runtime_receipt_refs':[]})

proto=next(s for s in shared if s['path']=='.orchestra/skills/execute-genesis/references/transport.md')
oracle=P/'oracles/consumer-maintenance-v1.json';put_native(OUT+'/oracles/consumer-maintenance-v1.json',oracle.read_bytes())
pack={'schema':'genesis-native-package/v1','campaign':'20261111-v1','protocol_epoch':'parallel-v3-fresh','results_epoch':'20261111-v3-fresh','session':'S1',
 'source_revision':'1cde2ff7a71bcf7aecb5d030917b577165135d38','protocol_ref':{k:proto[k] for k in ['commit','path','sha256']},'scope':'orchestra.s1','package_state':'SEMANTICALLY_REVIEWED_RUNTIME_OPERATIONS_PENDING',
 'contract':{'criteria':cfg['native_contract_criteria'],'oracle_ref':{'payload_path':OUT+'/oracles/consumer-maintenance-v1.json','sha256':H(oracle.read_bytes())}},
 'required_artifact_keys':[t['key'] for t in plan['artifacts']],'artifacts':artifacts,'roots':cfg['roots'],'missing_required_artifact_keys':[],
 'known_limits':cfg['known_limits']}
# Deterministic transport checks before the official adapter checks the complete package itself.
keys={a['key'] for a in artifacts};seen=set()
for a in artifacts:
 assert all(d['key'] in seen for d in a['build_dependencies']);seen.add(a['key']);assert set(a['navigation'])<=keys
 assert len(set(a['input_keys']))==len(a['input_keys'])==len(a['source_refs'])
 assert a['key']!='s1.core.entry'
for need,key in cfg['roots'].items():assert next(a for a in artifacts if a['key']==key)['need']==need
reached=set();queue=list(cfg['roots'].values())
while queue:
 key=queue.pop()
 if key in reached:continue
 reached.add(key);a=next(a for a in artifacts if a['key']==key);queue+=a['navigation']+[d['key'] for d in a['build_dependencies']]
assert reached==keys
if not inventory_only:
 # Every local-payload input is pinned to a real immutable P0 whose tree was reread.
 # Also check body/recipe/request/response/review bytes against that frozen snapshot;
 # none may drift while the runtime package is assembled after publication.
 checks=[]
 for u in all_units.values():
  if u['canonical_path'].startswith(OUT+'/'):
   assert u['origin_commit']==pin
   checks.append((u['canonical_path'],u['sha256'],u['bytes'],u['git_blob_sha']))
 for a in artifacts:
  b=a['body'];raw=(P/b['path']).read_bytes();checks.append((OUT+'/'+b['path'],b['sha256'],b['byte_length'],G(raw)))
  for ref in [a['recipe_ref'],a['producer_request_ref'],a['producer_response_ref'],*a['semantic_review_refs']]:
   raw=(N/ref['payload_path']).read_bytes();checks.append((ref['payload_path'],ref['sha256'],len(raw),G(raw)))
 for path,sha,size,blob in checks:
  row=published.get(path,published.get(path.removeprefix(OUT+'/')))
  assert row is not None,(path,'absent from immutable published snapshot')
  assert row['sha256']==sha and row['byte_length']==size and row['git_blob_sha']==blob,(path,'published snapshot mismatch')
pb=(json.dumps(pack,ensure_ascii=False,indent=2)+'\n').encode()
if not inventory_only:
 (P/'native-package.json').write_bytes(pb);put_native(OUT+'/native-package.json',pb)
receipt={'schema':'s1-03-final-native-assembly/v1','assembled_at_utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'source_payload_commit':pin,'scope':'S1-03, not all S1','package_sha256':H(pb),'package_bytes':len(pb),'artifact_count':len(artifacts),'unique_input_count':len(all_units),'input_counts':{a['key']:len(a['input_keys']) for a in artifacts},'whole_input_units':list(all_units.values()),'local_path_translations':translation,'native_root':str(N),'observed_git_head':None,'actual_runtime_prepare_executed':False,'runtime_versions_not_transport_hashes':True,'no_input_removed_split_or_normalized':True,'materialized_reference_count':len(materialized),'oversized_inputs':[u for u in all_units.values() if u['bytes']>256000]}
receipt['inventory_only']=inventory_only
if not inventory_only:receipt['immutable_payload_input_checks']={'source_payload_commit':pin,'snapshot_index':cfg['published_input_snapshot_index'],'readback_receipt':cfg['published_input_readback_receipt'],'exact_checks':len(checks),'all_match':True}
if inventory_only:
 receipt['package_sha256']=None;receipt['package_bytes']=None;receipt['state']='INPUT_INVENTORY_ONLY_BEFORE_PUBLICATION_NO_NATIVE_PACKAGE_EMITTED'
 dest=P/'assembly/final-input-inventory.json'
else:dest=P/'receipts/native-package-assembly.json'
dest.write_text(json.dumps(receipt,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({k:receipt[k] for k in ['package_sha256','package_bytes','artifact_count','unique_input_count','input_counts','materialized_reference_count']},ensure_ascii=False))
