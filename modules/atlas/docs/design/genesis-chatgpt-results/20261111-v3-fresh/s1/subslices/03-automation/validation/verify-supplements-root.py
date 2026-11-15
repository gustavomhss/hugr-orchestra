from pathlib import Path
import hashlib,json

W=Path(__file__).resolve().parents[1]
H=lambda b:hashlib.sha256(b).hexdigest()
G=lambda b:hashlib.sha1(b'blob '+str(len(b)).encode()+b'\0'+b).hexdigest()
checks=[]
def check(ok,label):
    if not ok: raise AssertionError(label)
def raw_source(path,meta):
    b=path.read_bytes()
    sh=meta.get('source_sha256',meta.get('sha256'))
    git=meta.get('source_git_blob_sha',meta.get('git_blob_sha'))
    size=meta.get('source_bytes',meta.get('bytes'))
    check(H(b)==sh,str(path)+' source SHA')
    check(G(b)==git,str(path)+' Git blob')
    check(len(b)==size,str(path)+' source size')
    return b
def interval(b,first,last):
    ls=b.splitlines(keepends=True)
    check(1<=first<=last<=len(ls),'line bounds')
    return b''.join(ls[first-1:last])
def prior(p,raw,v):
    d=(p/v['prior_document']).read_bytes()
    check(H(d)==v['prior_document_sha256'],'prior document SHA')
    ex=interval(raw,v['first_line'],v['last_line'])
    check(H(ex)==v['excerpt_sha256'] and len(ex)==v['excerpt_bytes'],'prior excerpt identity')
    check(ex==d[v['literal_content_byte_start']:v['literal_content_byte_end_exclusive']],'prior excerpt bytes')
    return ex

p=W/'producers/automation'
for n in range(1,5):
    f=p/f'review-supplement-{n}.md'; d=f.read_bytes()
    idx=json.loads((p/f'review-supplement-{n}-index.json').read_text())
    count=0; reused=0; ranges=0; unique=set()
    for block in idx.get('literal_blocks',[])+idx.get('literal_chains',[]):
        raw=raw_source(p/block['archive'],block);unique.add(str((p/block['archive']).resolve()))
        check(H(d[block['supplement_byte_start']:block['supplement_byte_end_exclusive']])==block['transport_sha256'],'block transport')
        for v in block.get('intervals',block.get('new_literal_intervals',[])):
            ex=interval(raw,v['first_line'],v['last_line'])
            check(len(ex)==v['bytes'] and H(ex)==v['sha256'],'new excerpt identity')
            check(ex==d[v['literal_content_byte_start']:v['literal_content_byte_end_exclusive']],'new literal bytes')
            count+=1
        for v in block.get('prior_literal_ranges',[]):
            prior(p,raw,v);reused+=1
    for seq in idx.get('source_reconstruction_sequences',[]):
        seen=[]
        for v in seq['sequence']:
            seen.extend(range(v['first_line'],v['last_line']+1))
        expected=[i for a,b in seq['required_source_line_ranges'] for i in range(a,b+1)]
        check(seen==expected,'reconstructed line coverage '+seq['path']);ranges+=1
    tests=0
    for v in idx.get('existing_test_literal_references',[]):
        raw=raw_source(p/v['source_archive'],v);prior(p,raw,v);tests+=1
    checks.append(dict(path=str(f.relative_to(W)),sha256=H(d),bytes=len(d),unique_sources=len(unique),new_intervals=count,reused_intervals=reused,complete_sequences=ranges,existing_test_intervals=tests,status='PASS_LITERAL_IDENTITY'))

p=W/'producers/research'
for part in ['a','b']:
    f=p/f'review-supplement-{part}.md';d=f.read_bytes()
    idx=json.loads((p/f'review-supplement-{part}-index.json').read_text())
    raws={}
    for src in idx['sources']:
        path=W/'inputs'/src['input_path'] if 'input_path' in src else (W/src['path'] if src['path'].startswith('producers/') else p/src.get('source_archive_path','sources/'+src['path']))
        raws[src['source_id']]=raw_source(path,src)
    for frag in idx['fragments']:
        a,b=frag['source_range'];ex=interval(raws[frag['source_id']],a,b)
        check(len(ex)==frag['raw_excerpt_bytes'] and H(ex)==frag['raw_excerpt_sha256'],'research raw excerpt')
        if frag['presentation']=='literal_complete_unprefixed': rendered=ex
        elif frag['presentation']=='literal_original_lines_numbered': rendered=b''.join(str(a+i).encode()+b': '+line for i,line in enumerate(ex.splitlines(keepends=True)))
        else: raise AssertionError(frag['presentation'])
        lo,hi=frag['supplement_content_byte_range'];check(rendered==d[lo:hi],'research rendered literal '+str(frag))
    checks.append(dict(path=str(f.relative_to(W)),sha256=H(d),bytes=len(d),unique_sources=len(raws),new_intervals=len(idx['fragments']),status='PASS_LITERAL_IDENTITY'))

result={'schema':'s1-03-root-literal-supplement-verification/v1','method':'Independent source SHA-256 and Git blob, exact original line intervals, dossier byte offsets, complete requested line reconstruction. This verifies custody and presentation, not semantic acceptance or product test execution.','checks':checks,'status':'PASS'}
out=W/'payload/receipts/root-supplement-literal-verification.json'
out.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
print(json.dumps(result,ensure_ascii=False))
