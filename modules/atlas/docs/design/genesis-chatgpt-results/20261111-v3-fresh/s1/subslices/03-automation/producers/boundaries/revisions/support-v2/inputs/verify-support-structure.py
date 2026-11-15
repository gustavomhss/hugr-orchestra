from pathlib import Path
from collections import Counter
import hashlib,json,sys,io,tarfile,zipfile,re

root=Path(sys.argv[1]);manifest=Path(sys.argv[2]);output=Path(sys.argv[3])
captures={x['path']:x for x in map(json.loads,manifest.read_text().splitlines())}
sources=[]
def load(path):
    b=(root/path).read_bytes();c=captures[path]
    assert hashlib.sha256(b).hexdigest()==c['sha256']
    assert hashlib.sha1(b'blob '+str(len(b)).encode()+b'\0'+b).hexdigest()==c['git_blob_sha']
    assert len(b)==c['byte_length']
    sources.append({k:c[k] for k in ['path','commit','git_blob_sha','sha256','byte_length']})
    return b
pkg=json.loads(load('packages/core/package.json'));exports=pkg['exports']
schema=json.loads(load('packages/core/schema.json'));counts=dict(Counter(x['entityType'] for x in schema['ddl']))
tb=load('packages/core/vendor/hugr-lean-0.4.0-0660c2b5dc92.tgz')
with tarfile.open(fileobj=io.BytesIO(tb),mode='r:gz') as tar:
    members=[{'name':m.name,'size':m.size,'type':m.type.decode('ascii','backslashreplace')} for m in tar.getmembers()]
    package_json=tar.extractfile('package/package.json').read()
    meta=json.loads(package_json)
zb=load('packages/core/test/fixture/pinned-artifact/tool.zip')
with zipfile.ZipFile(io.BytesIO(zb)) as z:
    zipped=[{'member':v.filename,'bytes':len(z.read(v)),'sha256':hashlib.sha256(z.read(v)).hexdigest(),'hex':z.read(v).hex()} for v in z.infolist()]
scip=[]
for name in ['core','orchestra']:
    path='packages/core/test/fixture/scip-alias/'+name+'.scip';b=load(path)
    scip.append({'path':path,'ascii_printable_strings_min_length':4,'strings':[{'byte_start':m.start(),'byte_end_exclusive':m.end(),'text':m.group().decode('ascii')} for m in re.finditer(rb'[ -~]{4,}',b)],'semantic_protocol_decode':False})
result={
 'schema':'s1-03-independent-support-structure/v1',
 'method':'Python stdlib only: exact captured bytes and source hashes checked; JSON parse, Counter(entityType) over ddl list, tar member metadata/read package.json in memory, ZIP member bytes, ASCII printable SCIP strings with byte offsets. No archive extraction to filesystem, import, install, build, test, generator or binary execution.',
 'sources':sources,
 'package':{'name':pkg['name'],'version':pkg['version'],'exports_count':len(exports),'has_bare_export':'.' in exports,'has_wildcard':any('*' in k for k in exports),'exports_keys':list(exports)},
 'schema_snapshot':{'version':schema['version'],'dialect':schema['dialect'],'id':schema['id'],'prevIds':schema['prevIds'],'ddl_total':len(schema['ddl']),'ddl_entities':counts},
 'tar':{'member_count':len(members),'members':members,'package_json_exact_utf8':package_json.decode(),'package_json_bytes':len(package_json),'package_json_sha256':hashlib.sha256(package_json).hexdigest(),'package_name':meta['name'],'package_version':meta['version']},
 'zip_fixture':zipped,'scip_fixtures':scip,
 'status':'PASS_STRUCTURAL_FACTS_ONLY','semantic_acceptance':'NOT_ASSIGNED','product_execution':'NOT_RUN'}
assert result['package']['exports_count']==437
assert not result['package']['has_bare_export'] and not result['package']['has_wildcard']
assert counts=={'tables':63,'columns':637,'fks':59,'pks':63,'indexes':52,'uniques':3,'checks':1}
assert len(members)==191 and hashlib.sha256(package_json).hexdigest()=='eb1e4264a0ddc9a050fe30490415dc020f33d2bb7a3de73e768943ef499851fa'
output.parent.mkdir(parents=True,exist_ok=True);output.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'output':str(output),'bytes':output.stat().st_size,'sha256':hashlib.sha256(output.read_bytes()).hexdigest(),'exports':len(exports),'ddl':counts,'tar_members':len(members),'status':result['status']},ensure_ascii=False))
