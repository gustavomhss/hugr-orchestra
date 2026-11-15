"""Mechanical transport configuration from preserved actual-input manifests; no semantic judgment."""
from pathlib import Path
import json,hashlib,datetime
W=Path(__file__).resolve().parents[1];P=W/'payload'
OUT='modules/atlas/docs/design/genesis-chatgpt-results/20261111-v3-fresh/s1/subslices/03-automation'
H=lambda b:hashlib.sha256(b).hexdigest()
G=lambda b:hashlib.sha1(b'blob '+str(len(b)).encode()+b'\0'+b).hexdigest()
audit=json.loads((W/'assembly-native-descriptors/descriptors.json').read_text())
spec={}
for a in audit['artifacts']:
 spec[a['key']]={'additional_actual_inputs':[],'audited_path_aliases':{},'actual_recipe_local_path':a['recipe_ref']['path'].removeprefix(OUT+'/'),'request_local_path':a['producer_request_ref']['path'].removeprefix(OUT+'/'),'response_local_path':a['producer_response_ref']['path'].removeprefix(OUT+'/'),'audited_base_version':a['version']}
def unit(local,identity,alias=None):
 b=(W/(alias or local)).read_bytes()
 size=identity.get('bytes',identity.get('byte_length'));blob=identity.get('git_blob_sha',identity.get('calculated_git_blob_sha'))
 assert len(b)==size and H(b)==identity['sha256'] and G(b)==blob,local
 return {'local_path':local,'bytes':size,'sha256':H(b),'git_blob_sha':blob,**({'retained_alias':alias} if alias and alias!=local else {})}
for version in ['v3','v4']:
 d=json.loads((W/f'producers/research/revisions/{version}/input-manifest-extension.json').read_text())
 for u in d['inputs']:
  prefix='producers/research/' if version=='v3' else ''
  local=prefix+u['read_path'];alias=prefix+u.get('retained_path',u['read_path'])
  spec['s1.core.research']['additional_actual_inputs'].append(unit(local,u['identity'],alias))
spec['s1.core.research'].update(actual_recipe_local_path='producers/research/revisions/v4/apply.py',request_local_path='producers/research/revisions/v4/request.txt',response_local_path='producers/research/revisions/v4/response.md')
d=json.loads((W/'producers/boundaries/revisions/boundaries-v3/input-manifest-extension.json').read_text())
aliases={a['path']:a['stable_alias']['path'] for a in d['changed_in_place_aliases']}
for u in d['new_dispatch_whole_file_reads']+d['procedure_inputs']:
 spec['s1.core.boundaries']['additional_actual_inputs'].append(unit(u['path'],u,aliases.get(u['path'])))
spec['s1.core.boundaries'].update(actual_recipe_local_path='producers/boundaries/revisions/boundaries-v3/apply.py',request_local_path='producers/boundaries/revisions/boundaries-v3/request.txt',response_local_path='producers/boundaries/revisions/boundaries-v3/response.md')
old='producers/boundaries/bodies/boundaries.md';alias='producers/boundaries/revisions/boundaries-v3/history/body.md'
prior=next(a for a in audit['artifacts'] if a['key']=='s1.subslice03.support')
oldunit=next(u for u in prior['input_units'] if u['canonical_path']==OUT+'/'+old)
unit(old,oldunit,alias)
spec['s1.subslice03.support']['audited_path_aliases'][OUT+'/'+old]={'original_local_path':old,'retained_local_path':alias,'original_origin_commit':oldunit['origin_commit'],'reason':'Exact earlier boundaries v2 consumed as a mechanical preservation sentinel by support v2; not the new boundaries v3 semantic predecessor.'}
record={'schema':'s1-03-current-l1-native-input-configuration/v1','created_at_utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'role':'Transport configuration only, not a producer recipe or a semantic acceptance','audit_base':'assembly/native-l1-v2/descriptors.json','audit_base_sha256':H((W/'assembly-native-descriptors/descriptors.json').read_bytes()),'artifacts':spec,'no_input_split_or_removed':True,'versions':['automation v4','research v4','boundaries v3','support v2'],'pending_gate_note':'Assembly still requires two current complete-body PASS decisions for each selected artifact and every required derived artifact.'}
dest=P/'assembly/native-l1-current-inputs.json';assert not dest.exists();dest.write_text(json.dumps(record,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'file':str(dest.relative_to(W)),'sha256':H(dest.read_bytes()),'additional_input_rows':{k:len(v['additional_actual_inputs']) for k,v in spec.items()},'support_alias_verified':True},ensure_ascii=False))
