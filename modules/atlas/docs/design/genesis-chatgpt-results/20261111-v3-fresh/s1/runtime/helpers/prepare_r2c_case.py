from pathlib import Path
import json,hashlib,shutil,difflib,datetime
R=Path(__file__).resolve().parent
cap=json.loads((R/'capture/s4-r2-corrected-case.json').read_text())
old=R/'runtime/s4-r1/code/modules/atlas';new=R/'runtime/s4-r2c/code/modules/atlas'
assert not new.exists()
new.parent.mkdir(parents=True,exist_ok=True);shutil.copytree(old,new,symlinks=True)
changes=[]
for q in cap['sources']:
 assert q['status']=='fulfilled'
 x=q['value'];v=x['result'];assert not v['isError'];s=v['structuredContent'];b=s['content'].encode()
 blob=hashlib.sha1(b'blob '+str(len(b)).encode()+b'\0'+b).hexdigest();assert blob==s['sha']
 rel=x['path'].removeprefix('modules/atlas/');p=new/rel;before=p.read_bytes();p.write_bytes(b)
 delta=''.join(difflib.unified_diff(before.decode().splitlines(True),b.decode().splitlines(True),fromfile='e3a8/'+rel,tofile='673b/'+rel));print(delta)
 changes.append({'path':x['path'],'git_blob_sha':blob,'sha256':hashlib.sha256(b).hexdigest(),'byte_length':len(b),'before_sha256':hashlib.sha256(before).hexdigest(),'diff':delta})
manifest=json.loads((R/'runtime/s4-r1/materialization-receipt.json').read_text())
comp=cap['compare']['value']['structuredContent'];comp=json.loads(comp['content']) if 'content' in comp else comp
materialized=[]
for x in manifest['files']:
 path=x.get('path',x.get('relative_path'));rel=path.removeprefix('modules/atlas/');p=new/rel;b=p.read_bytes()
 change=next((c for c in changes if c['path']==path),None)
 if change:expected=change['sha256']
 else:
  expected=x['sha256'];assert not any(f['filename']==path for f in comp['files']),path
 assert hashlib.sha256(b).hexdigest()==expected,path
 materialized.append({'path':path,'sha256':expected,'bytes':len(b),'git_blob_sha':hashlib.sha1(b'blob '+str(len(b)).encode()+b'\0'+b).hexdigest()})
newroot=R/'runtime/s4-r2c/isolated-c-v1';assert not newroot.exists()
shutil.copytree(R/'runtime/s4-r1/isolated-c-v2',newroot,ignore=shutil.ignore_patterns('.atlas'))
(newroot/'.atlas').mkdir()
policy={'t0Heuristic':{'keywords':[]},'authz':{'scopes':{'orchestra.s1':['/root']}}}
(newroot/'.atlas/policy.json').write_text(json.dumps(policy,indent=2)+'\n')
out=R/'output/runtime/r2c';out.mkdir(parents=True,exist_ok=True)
ci=cap['ci_receipt']['value']['structuredContent']['content'].encode()
assert hashlib.sha256(ci).hexdigest()=='32c72a14a9ad5753dac4b49ba9d847aef8ffd2c05224f15b0be3d09fea39ae20'
(out/'s4-ci-receipt.json').write_bytes(ci)
ci_run=json.loads(cap['ci_run']['value']['structuredContent']['content'])
assert ci_run['head_sha']=='673b90d82b8b888d5d0184d2e17dec6d5d1b05f1' and ci_run['conclusion']=='success'
record={'schema':'genesis-runtime-candidate-materialization/v1','recorded_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'new_case':'S1-C-r2c-v1','release_ref':{'release_id':'20261111-v3-fresh-s4-r2','commit':'7102f2e3a1a9a3822bcd0ae054b36ecffe9da553'},'release_primary_candidate':'e3a8ab8cf56dbff1ee91272df51ffa398d882aa1','selected_related_corrected_candidate':'673b90d82b8b888d5d0184d2e17dec6d5d1b05f1','reason':'Separate new case using exact corrected code/control candidate advertised by r2 gate_refs; actual remote CI success read back. No old candidate or binding is relabelled.','basis_compare':comp,'changed_materialized_sources':changes,'materialized_files':materialized,'dependency_and_build_reuse':'Exact same manifests/lockfile and unchanged compiled kernel/contracts/knowledge sources; copied existing npm install and dist. CLI imports corrected adapter source directly. No product test suite executed.','code_root':str(new),'isolated_source_root':str(newroot),'observed_head':None,'policy':policy,'actual_actor':'/root','ratifier':'/root','policy_authority':'Explicit user assignment and isolated operations authorized for S1; local responsibility declaration only, not production or union ROOT authority.','previous_case_candidate_preserved':'1670bc712e472b9f449d277da324b17fa8fb951cbc62c2bc07fa8718e89c063f','remote_ci':{k:ci_run[k] for k in ['id','head_sha','status','conclusion','html_url']},'new_binding':'REQUIRED','semantic_bodies':'Ten original C bodies unchanged and accepted; no full L1 release.'}
(out/'materialization.json').write_text(json.dumps(record,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'files':len(materialized),'changes':len(changes),'root':str(newroot),'ci':ci_run['conclusion']}))
