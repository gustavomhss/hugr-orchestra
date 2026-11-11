from pathlib import Path
import base64,hashlib,json,zlib
P=Path(__file__).resolve().parent;ROOT=P/'code';TASK=P.parents[1];OBJ=TASK/'gate-checkout/.git/objects'
captured={}
for f in (P/'captures').glob('*.json'):
    x=json.loads(f.read_text());b=x['content'].encode() if x['encoding']=='utf-8' else base64.b64decode(''.join(x['content'].split()),validate=True)
    oid=hashlib.sha1(b'blob '+str(len(b)).encode()+b'\0'+b).hexdigest();assert oid==x['sha']==f.stem
    captured[oid]=b
tree=json.loads((P/'atlas-tree.json').read_text());assert not tree['truncated'];manifest=[]
for e in tree['tree']:
    if e['type']!='blob':continue
    q=e['path'];selected=(q.startswith('packages/') and ('/src/' in q or q.endswith('/package.json') or q.endswith('/tsconfig.json'))) or q in ['package.json','bun.lock','package-lock.json','tsconfig.json','tsconfig.base.json','scripts/genesis-native.ts','scripts/fix-scip-types.mjs']
    if not selected or q.endswith('.test.ts') or q.endswith('.spec.ts'):continue
    path='modules/atlas/'+q;dest=ROOT/path
    if e['sha'] in captured:b=captured[e['sha']]
    else:
        src=OBJ/e['sha'][:2]/e['sha'][2:];raw=zlib.decompress(src.read_bytes());header,b=raw.split(b'\0',1)
        assert header==b'blob '+str(len(b)).encode()
    assert hashlib.sha1(b'blob '+str(len(b)).encode()+b'\0'+b).hexdigest()==e['sha'] and len(b)==e['size']
    dest.parent.mkdir(parents=True,exist_ok=True);dest.write_bytes(b)
    manifest.append({'path':path,'git_blob_sha':e['sha'],'sha256':hashlib.sha256(b).hexdigest(),'byte_length':len(b)})
receipt={'schema':'genesis-runtime-code-materialization/v1','release_commit':'673b90d82b8b888d5d0184d2e17dec6d5d1b05f1','candidate_revision':'e3a8ab8cf56dbff1ee91272df51ffa398d882aa1','atlas_tree':'79644b2a9f9c0d997a9c815eee5f4fa03a307dab','files':manifest,'checkout_kind':'verified source materialization; no local fabricated Git HEAD','runtime_execution':'NOT_RUN','product_tests':'NOT_RUN'}
(P/'materialization-receipt.json').write_text(json.dumps(receipt,indent=2)+'\n')
lock=json.loads((ROOT/'modules/atlas/package-lock.json').read_text());resolved=sorted({x.get('resolved','') for x in lock.get('packages',{}).values() if x.get('resolved') and not x.get('link')})
remote_domains=sorted({x.split('/')[2] if x.startswith('https://') else x for x in resolved})
print(json.dumps({'verified_files':len(manifest),'bytes':sum(x['byte_length'] for x in manifest),'lockfileVersion':lock['lockfileVersion'],'resolved_domains':remote_domains}))
