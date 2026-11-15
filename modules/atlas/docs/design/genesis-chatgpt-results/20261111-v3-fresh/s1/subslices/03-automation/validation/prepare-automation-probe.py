from pathlib import Path
import hashlib,json,shutil,subprocess,datetime
W=Path(__file__).resolve().parents[1];P=W/'producers/automation';N=W/'native-source';S=W/'payload'
OUT='modules/atlas/docs/design/genesis-chatgpt-results/20261111-v3-fresh/s1/subslices/03-automation'
H=lambda b:hashlib.sha256(b).hexdigest()
G=lambda b:hashlib.sha1(b'blob '+str(len(b)).encode()+b'\0'+b).hexdigest()
d=json.loads((P/'native-input-disposition.json').read_text())
contexts=json.loads((S/'receipts/shared-input-materialization.json').read_text())['files']
bysha={x['sha256']:x for x in contexts}
inputs=[];sources=[];materialized=[]
def copy_payload(src,rel):
    b=src.read_bytes();dest=S/rel;dest.parent.mkdir(parents=True,exist_ok=True)
    if src.resolve()!=dest.resolve():dest.write_bytes(b)
    target=N/OUT/rel;target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(b)
    materialized.append({'path':OUT+'/'+rel,'bytes':len(b),'sha256':H(b)})
    return {'payload_path':OUT+'/'+rel,'sha256':H(b)}
for v in d['source_inputs']+d['external_schema_inputs']:
    raw=(P/v['capture_path']).read_bytes();assert H(raw)==v['sha256'] and G(raw)==v['git_blob_sha']
    path=v['repository_path'];assert (N/path).read_bytes()==raw
    sources.append({k:v[k] for k in ['commit','git_blob_sha','sha256']}|{'path':path});inputs.append('file:'+path)
for v in d['shared_contexts']:
    if not v['effective_build_input']:continue
    raw=(P/v['path']).read_bytes();assert H(raw)==v['sha256'] and G(raw)==v['git_blob_sha']
    mapped=bysha[v['sha256']];path=mapped['path'];assert (N/path).read_bytes()==raw
    sources.append({k:mapped[k] for k in ['commit','git_blob_sha','sha256']}|{'path':path});inputs.append('file:'+path)
for v in d['producer_and_review_records']:
    if not v['effective_build_input']:continue
    ref=copy_payload(P/v['path'],'producers/automation/'+v['path']);assert ref['sha256']==v['sha256'];inputs.append('file:'+ref['payload_path'])
recipe=copy_payload(P/'recipe.json','producers/automation/recipe.json')
req=copy_payload(P/'request.txt','producers/automation/request.txt')
response=copy_payload(P/'revisions/v4/response.md','producers/automation/revisions/v4/response.md')
body=copy_payload(P/'body.md','producers/automation/body.md')
reviews=[copy_payload(W/f'relay/automation-4/j{i}-response.md',f'judgments/l1/automation-4-j{i}-response.md') for i in [1,2]]
oracle=copy_payload(S/'oracles/consumer-maintenance-v1.json','oracles/consumer-maintenance-v1.json')
proto=next(x for x in contexts if x['path']=='.orchestra/skills/execute-genesis/SKILL.md')
protocol={k:proto[k] for k in ['commit','path','sha256']}
criteria=['GO-A1','GO-A2','GO-A3','GO-A4','GO-A5','GO-A6','GO-A7','QS-1','QS-2','QS-3','QS-4','QS-5','QS-6','CC-1','CC-3','CC-7','GO-I1','GO-I2','GO-I7','GO-I8','runtime-import-binding']
a={'key':'s1.core.automation','scope':'orchestra.s1','title':'Automação, Actions, Board e agendamento — probe de captura anterior ao aceite','layer':1,'need':'flow','body':{'path':'producers/automation/body.md','encoding':'utf-8','byte_length':(P/'body.md').stat().st_size,'sha256':body['sha256']},'authority':{'scope':'orchestra.s1','basis':'S1-03 COMMON and mission at 70234d541a9a3539935ef16f19e33c8f2d5f30ec; no runtime publication authority is granted by this transport.'},'validity':'blocked','gaps':['Semantic review of v4 remains pending; preserved v1 REQUEST_EVIDENCE responses are not approval.','This is an entire-automation-input capture probe only, not the final 12-artifact S1-03 package.'],'evidence':['producer native-input-disposition/v1; all declared effective dependencies retained','Original public reviews automation-4 J1/J2 remain REQUEST_EVIDENCE'],'input_keys':list(dict.fromkeys(inputs)),'source_refs':sources,'recipe_ref':recipe,'build_dependencies':[],'navigation':[],'producer_request_ref':req,'producer_response_ref':response,'semantic_review_refs':reviews,'runtime_receipt_refs':[]}
pack={'schema':'genesis-native-package/v1','campaign':'20261111-v1','protocol_epoch':'parallel-v3-fresh','results_epoch':'20261111-v3-fresh','session':'S1','source_revision':'1cde2ff7a71bcf7aecb5d030917b577165135d38','protocol_ref':protocol,'scope':'orchestra.s1','package_state':'PREACCEPTANCE_CAPTURE_PROBE_NOT_PUBLISHABLE','contract':{'criteria':criteria,'oracle_ref':oracle},'required_artifact_keys':['s1.core.automation'],'artifacts':[a],'roots':{'flow':'s1.core.automation'},'missing_required_artifact_keys':[],'known_limits':['Selection is the complete automation input closure only; final mission graph remains 12 artifacts in artifact-plan.json.','No semantic PASS, binding or publication is claimed. Preparation is allowed to measure exact input-capture refusal before the independent review finishes.','Retain required historical projection of 726892 bytes; never remove/split it to pass.']}
rel='runtime-probe-automation.json';pb=(json.dumps(pack,ensure_ascii=False,indent=2)+'\n').encode();(S/rel).write_bytes(pb);(N/OUT/rel).write_bytes(pb)
prepared=W/'runtime-results/automation-preacceptance-prepared.json';prepared.parent.mkdir(exist_ok=True)
cmd=[str(W/'runtime-preflight/bun-runtime/node_modules/.bin/bun'),'scripts/genesis-native.ts','prepare',str(N),OUT+'/'+rel,str(prepared)]
assert not prepared.exists()
start=datetime.datetime.now(datetime.timezone.utc).isoformat();r=subprocess.run(cmd,cwd=W/'runtime-preflight/candidate/modules/atlas',capture_output=True,timeout=60)
(W/'runtime-results/automation-preacceptance.stdout').write_bytes(r.stdout);(W/'runtime-results/automation-preacceptance.stderr').write_bytes(r.stderr)
receipt={'schema':'s1-03-native-prepare-probe/v1','command':cmd,'cwd':str(W/'runtime-preflight/candidate/modules/atlas'),'started_utc':start,'candidate_revision':'e3a8ab8cf56dbff1ee91272df51ffa398d882aa1','source_root':str(N),'observed_git_head':None,'package_path':OUT+'/'+rel,'package_sha256':H(pb),'selection':['s1.core.automation'],'effective_inputs':len(a['input_keys']),'source_refs':len(sources),'semantic_status':'PENDING_REQUEST_EVIDENCE','exit_code':r.returncode,'stdout':r.stdout.decode(),'stderr':r.stderr.decode(),'prepared_file_exists':prepared.exists(),'publication_attempted':False,'final_mission_prepare_still_required':True,'materialized_payload_files':materialized}
(S/'receipts/automation-native-prepare-probe.json').write_text(json.dumps(receipt,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({k:v for k,v in receipt.items() if k not in ['materialized_payload_files','command','cwd']},ensure_ascii=False))
