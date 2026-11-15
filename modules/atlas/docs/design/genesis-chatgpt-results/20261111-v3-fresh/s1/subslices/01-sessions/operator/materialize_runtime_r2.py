from pathlib import Path
import json, hashlib, datetime, subprocess, os

W=Path(__file__).resolve().parents[1]
NEW='7102f2e3a1a9a3822bcd0ae054b36ecffe9da553'
OLD='e3a8ab8cf56dbff1ee91272df51ffa398d882aa1'
R=W/'runtime-r2'
D=W/'receipts/runtime-r2-bootstrap'
D.mkdir(parents=True,exist_ok=True)
compare=json.loads((W/'receipts/runtime-candidate-comparison.json').read_text())
assert compare['base']==OLD and compare['head']==NEW and not compare.get('too_large')
changed={f['filename']:f for f in compare['files']}
delta={}
for raw in json.loads((W/'runtime-r2-delta-captures.json').read_text()):
    assert raw['status']=='fulfilled'
    v=raw['value'];assert not v.get('isError')
    x=v['structuredContent'];p=x['display_url'].split('/blob/'+NEW+'/')[1]
    b=x['content'].encode('utf-8')
    sha1=hashlib.sha1(b'blob '+str(len(b)).encode()+b'\0'+b).hexdigest()
    assert sha1==x['sha'],p
    delta[p]=(b,sha1)
records=[]
prior=json.loads((W/'runtime-code/capture-manifest.json').read_text())
for old in prior:
    path=old['path']
    if path in delta:b,blob=delta.pop(path);method='fresh GitHub connector capture at target commit'
    else:
        assert path not in changed,('missing changed code capture',path)
        b=(W/'runtime-code'/path).read_bytes();blob=old['git_blob_sha'];method='exact previously captured bytes; complete commit comparison proves path unchanged'
        assert hashlib.sha256(b).hexdigest()==old['sha256'],path
    assert hashlib.sha1(b'blob '+str(len(b)).encode()+b'\0'+b).hexdigest()==blob,path
    dst=R/path;dst.parent.mkdir(parents=True,exist_ok=True);dst.write_bytes(b)
    records.append({'path':path,'commit':NEW,'git_blob_sha':blob,'sha256':hashlib.sha256(b).hexdigest(),'bytes':len(b),'verification':method})
for path,(b,blob) in delta.items():
    dst=R/path;dst.parent.mkdir(parents=True,exist_ok=True);dst.write_bytes(b)
    records.append({'path':path,'commit':NEW,'git_blob_sha':blob,'sha256':hashlib.sha256(b).hexdigest(),'bytes':len(b),'verification':'fresh GitHub connector capture at target commit'})
(R/'capture-manifest.json').write_text(json.dumps(records,indent=2)+'\n')
cwd=R/'modules/atlas'
commands=[['npm','ci','--ignore-scripts','--no-audit','--no-fund'],['node','scripts/fix-scip-types.mjs'],[str(W/'runtime-tools/bun'),'run','typecheck','--force']]
env=os.environ.copy();env['PATH']=str(W/'runtime-tools')+os.pathsep+env['PATH']
receipts=[]
for i,argv in enumerate(commands,1):
    start=datetime.datetime.now(datetime.timezone.utc).isoformat()
    p=subprocess.run(argv,cwd=cwd,env=env,text=True,capture_output=True)
    (D/f'{i}-stdout.txt').write_text(p.stdout);(D/f'{i}-stderr.txt').write_text(p.stderr)
    receipt={'argv':argv,'cwd':str(cwd),'started_at':start,'ended_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'exit_code':p.returncode,'stdout_sha256':hashlib.sha256(p.stdout.encode()).hexdigest(),'stderr_sha256':hashlib.sha256(p.stderr.encode()).hexdigest()}
    receipts.append(receipt)
    (D/'receipt.json').write_text(json.dumps({'schema':'s1-01-runtime-r2-bootstrap/v1','candidate_revision':NEW,'previous_code_preserved_at':str(W/'runtime-code'),'copied_files':len(records),'source_manifest_sha256':hashlib.sha256((R/'capture-manifest.json').read_bytes()).hexdigest(),'complete_comparison':str(W/'receipts/runtime-candidate-comparison.json'),'commands':receipts,'product_tests':'NOT_RUN','binding':'NEW_EXACT_BINDING_REQUIRED','publication_policy_created':False},indent=2)+'\n')
    print(json.dumps(receipt),flush=True)
    if p.returncode:raise SystemExit(p.returncode)
