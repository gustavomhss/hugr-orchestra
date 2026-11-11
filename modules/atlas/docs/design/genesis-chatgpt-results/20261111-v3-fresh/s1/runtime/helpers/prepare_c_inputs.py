from pathlib import Path
import copy,hashlib,json,datetime
P=Path(__file__).resolve().parent;TASK=P.parents[1];O=TASK/'output';ROOT=P/'isolated-c-v1'
PREFIX='modules/atlas/docs/design/genesis-chatgpt-results/20261111-v3-fresh/s1/'
sha=lambda b:hashlib.sha256(b).hexdigest()
raw=(O/'native-package.json').read_bytes();assert sha(raw)=='d8db24cc3e63225fbee28a9a0fc0ea1d16d4894a87500d5c6e765c369370ba3e'
pack=json.loads(raw);original=copy.deepcopy(pack);pack['artifacts']=[a for a in pack['artifacts'] if a['key'].startswith('s1.runtime.')];assert len(pack['artifacts'])==10
keys=[a['key'] for a in pack['artifacts']];pack['required_artifact_keys']=keys;pack['missing_required_artifact_keys']=[]
pack['package_state']='SELECTED_C_L1_SEMANTIC_PASS_PREPARE_ONLY'
pack['known_limits'].append('Explicit ten-artifact C view only. This does not release the whole S1 L1 layer, later layers, binding, publication, readers or CI. Original d8 package remains unchanged.')
reviews=[]
for name in ['l1-c-v1-supplement-j1.md','l1-c-v1-supplement-j2.md']:
    data=(O/'judgments'/name).read_bytes();reviews.append({'payload_path':PREFIX+'judgments/'+name,'sha256':sha(data)})
changes=[];roots={}
for a in pack['artifacts']:
    before=copy.deepcopy(a)
    assert set(a['authority'])=={'scope','basis'}
    a['evidence']=[json.dumps(x,ensure_ascii=False,sort_keys=True,separators=(',',':')) if not isinstance(x,str) else x for x in a['evidence']]
    assert all((json.loads(after)==prior if not isinstance(prior,str) else after==prior) for prior,after in zip(before['evidence'],a['evidence']))
    a['semantic_review_refs']=copy.deepcopy(reviews)
    roots.setdefault(a['need'],a['key'])
    changes.append({'key':a['key'],'fields':{'evidence':{'before':before['evidence'],'after':a['evidence']},'semantic_review_refs':{'before':before['semantic_review_refs'],'after':a['semantic_review_refs']}}})
for need,key in roots.items():
    a=next(x for x in pack['artifacts'] if x['key']==key);before=list(a['navigation'])
    for other in pack['artifacts']:
        if other['need']==need and other['key']!=key and other['key'] not in a['navigation']:a['navigation'].append(other['key'])
    if a['navigation']!=before:next(x for x in changes if x['key']==key)['fields']['navigation']={'before':before,'after':a['navigation']}
pack['roots']=roots
selected=(json.dumps(pack,ensure_ascii=False,indent=2)+'\n').encode();(O/'native-package.c-r1.json').write_bytes(selected)
ROOT.mkdir(exist_ok=True);copied={}
def install(path,data,kind):
    assert not Path(path).is_absolute() and '..' not in Path(path).parts
    dest=ROOT/path;assert dest.resolve().is_relative_to(ROOT.resolve()) and not dest.is_symlink()
    if path in copied:assert copied[path]['sha256']==sha(data);return
    if dest.exists():assert dest.read_bytes()==data
    else:dest.parent.mkdir(parents=True,exist_ok=True);dest.write_bytes(data)
    copied[path]={'path':path,'sha256':sha(data),'byte_length':len(data),'kind':kind}
def locate(path):
    if path.startswith(PREFIX):
        rel=path[len(PREFIX):];candidates=[O/rel,TASK/rel]
    elif path=='.orchestra/skills/execute-genesis/SKILL.md':candidates=[TASK/'protocol/SKILL.md']
    elif path.startswith('.orchestra/skills/execute-genesis/references/'):
        candidates=[TASK/'protocol'/Path(path).name]
    else:candidates=[TASK/'producers'/g/'sources'/path for g in ['c','a','b']]
    f=next((f for f in candidates if f.is_file() and not f.is_symlink()),None)
    assert f is not None,('missing capture',path)
    return f.read_bytes()
def preserve(ref):
    path=ref.get('payload_path',ref.get('path'));b=locate(path);assert sha(b)==ref['sha256'],path;install(path,b,'preserved-reference')
preserve(pack['protocol_ref']);preserve(pack['contract']['oracle_ref'])
for a in pack['artifacts']:
    for r in [a['recipe_ref'],a['producer_request_ref'],a['producer_response_ref'],*a['semantic_review_refs'],*a['runtime_receipt_refs']]:preserve(r)
    for s in a['source_refs']:
        data=locate(s['path']);assert sha(data)==s['sha256']
        assert hashlib.sha1(b'blob '+str(len(data)).encode()+b'\0'+data).hexdigest()==s['git_blob_sha']
        install(s['path'],data,'verified-captured-source')
    for key in a['input_keys']:
        assert key.startswith('file:'),('unexpected membership',key)
        path=key[5:];install(path,locate(path),'declared-input')
    b=(O/a['body']['path']).read_bytes();assert sha(b)==a['body']['sha256'] and len(b)==a['body']['byte_length']
    install(PREFIX+a['body']['path'],b,'unchanged-semantic-body')
install(PREFIX+'native-package.c-r1.json',selected,'selected-transport')
assert (O/'native-package.json').read_bytes()==raw
receipt={'schema':'genesis-principal-transport-normalization/v1','recorded_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'base_package_sha256':sha(raw),'selected_package_path':PREFIX+'native-package.c-r1.json','selected_package_sha256':sha(selected),'selected_package_bytes':len(selected),'original_body_count_unchanged':10,'scope':'orchestra.s1','selection':keys,'roots_before':{need:[a['key'] for a in original['artifacts'] if a['key'] in keys and a['need']==need] for need in roots},'roots_after':roots,'changes':changes,'isolated_root':str(ROOT),'files':list(copied.values()),'body_or_source_removed':'NONE within the explicit C view','semantic_decisions':'Two actual final C decisions preserved; metadata transformation is not yet binding-approved','candidate_id':'NOT_CREATED','runtime_execution':'NOT_RUN','product_tests':'NOT_RUN'}
out=O/'runtime/preparation';out.mkdir(parents=True,exist_ok=True);(out/'c-r1-inputs-normalization.json').write_text(json.dumps(receipt,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'selected_sha256':sha(selected),'selected_bytes':len(selected),'preserved_bodies':10,'isolated_files':len(copied),'oversize_declared_inputs':[x for x in copied.values() if x['kind']=='declared-input' and x['byte_length']>256000],'input_root':str(ROOT)}))
