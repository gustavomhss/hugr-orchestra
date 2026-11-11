from pathlib import Path
import json,hashlib,shutil,datetime
R=Path(__file__).resolve().parent
V=R/'revisions/b-l1-v3'; O=R/'output'
sha=lambda b:hashlib.sha256(b).hexdigest()
blob=lambda b:hashlib.sha1(b'blob '+str(len(b)).encode()+b'\0'+b).hexdigest()
def read(p):return json.loads(p.read_bytes())
def ident(p):
 b=p.read_bytes();return {'path':str(p.relative_to(R)),'sha256':sha(b),'byte_length':len(b)}
frozen=read(V/'frozen-inputs-before.json')
for p,x in frozen.items():
 b=(R/p).read_bytes();assert sha(b)==x['sha256'] and len(b)==x['byte_length'],p
manifest=read(V/'manifest.json')
for x in manifest['files']:
 b=(R/x['path']).read_bytes();assert sha(b)==x['sha256'] and len(b)==x['byte_length'],x['path']
for line in (V/'SHA256SUMS').read_text().splitlines():
 digest,path=line.split('  ',1);path=path.strip(); p=R/path
 if not p.exists():p=V/path
 assert sha(p.read_bytes())==digest,path
sources=read(V/'source-manifest.json')['sources'];by_path={s['path']:s for s in sources}
source_bytes={}
for s in sources:
 b=(R/s['capture_path']).read_bytes();assert len(b)==s['byte_length'] and sha(b)==s['sha256'] and blob(b)==s['git_blob_sha'],s['path']
 assert s['commit']=='1cde2ff7a71bcf7aecb5d030917b577165135d38'
 source_bytes[s['path']]=b
excerpts=read(V/'source-excerpts.json')['sources'];seen=set();nlines=nbytes=0
supp=(V/'review-supplement.md').read_bytes()
for x in excerpts:
 s=x['source_ref'];b=(R/x['capture_path']).read_bytes();assert sha(b)==s['sha256'] and blob(b)==s['git_blob_sha']
 lines=b.splitlines(keepends=True)
 for span in x['ranges']:
  a,z=span['start_line'],span['end_line'];chunk=b''.join(lines[a-1:z]); start=sum(map(len,lines[:a-1]))
  assert start==span['byte_start'] and start+len(chunk)==span['byte_end_exclusive']
  assert len(chunk)==span['byte_length'] and sha(chunk)==span['sha256']
  assert chunk in supp,(x['id'],a,z)
  for ln in range(a,z+1):assert (s['path'],ln) not in seen;seen.add((s['path'],ln))
  nlines+=z-a+1;nbytes+=len(chunk)
disp=read(V/'semantic-disposition.json'); overlay=read(V/'coverage-revision.json')
hist={}
for g in disp['historical_groups_verbatim']:
 for m in g['members']:
  p=m['path'];assert p not in hist;hist[p]={**g['common'],**m}
assert len(hist)==len(disp['members'])==190
covered=[]
for d in disp['domains']:
 assert d['current_l1_need'] and d['bounded_claim'] and d['conditional_gap']
 covered+=d['member_paths']
assert len(covered)==len(set(covered))==190 and set(covered)==set(hist)
readers={}
for m in disp['members']:
 p=m['path'];assert m['historical_record']==hist[p]
 st=m['current_read_state'];s=st['source_ref'];b=source_bytes[p]
 assert s['sha256']==sha(b) and s['git_blob_sha']==blob(b) and s['byte_length']==len(b)
 assert st['read_spans']==[{'start_line':1,'end_line':len(b.splitlines())}],p
 assert st['execution']=='none' and st['semantic_review']=='unjudged'
 readers[st['reader']]=readers.get(st['reader'],0)+1
 assert m['l1_fact'] and m['depth_justification']
assert len(overlay['unchanged_member_paths'])==282
assert not set(overlay['unchanged_member_paths'])&set(hist)
old=read(O/'snapshots/native-package-l1-bv2.json');old_a={a['key']:a for a in old['artifacts']}
fragment=read(V/'fragment-metadata.json');changed=[]
for a in fragment['artifacts']:
 b=(R/a['body']['path']).read_bytes();assert sha(b)==a['body']['sha256'] and len(b)==a['body']['byte_length']
 previous=(O/old_a[a['key']]['body']['path']).read_bytes()
 if b!=previous:changed.append(a['key'])
assert sorted(changed)==sorted(['s1.api.server-edge','s1.api.schema-contracts','s1.api.surface-disposition'])
assert sha((V/'bodies/session-contract.md').read_bytes())=='22b526a2423572f2bbc17f3bfccd2eb0ea8f7fb16f2215bb0904f1cc5c2125bc'
assert len(fragment['artifacts'])==9 and len(disp['domains'])==24
dest=O/'revisions/b-l1-v3'
if dest.exists():
 for p in dest.rglob('*'):
  if p.is_file():assert p.read_bytes()==(V/p.relative_to(dest)).read_bytes()
shutil.copytree(V,dest,dirs_exist_ok=True)
receipt={'schema':'genesis-principal-producer-verification/v1','batch':'S1-L1-B-v3','recorded_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'state':'PASS_MECHANICAL_ONLY','frozen_originals_verified':len(frozen),'manifest_files_verified':len(manifest['files']),'source_files_verified':len(sources),'source_bytes_verified':sum(map(len,source_bytes.values())),'literal_ranges_verified':sum(len(x['ranges']) for x in excerpts),'literal_lines_verified':nlines,'literal_bytes_verified':nbytes,'duplicate_new_lines':0,'exact_historical_members_preserved':190,'domain_membership_bijection':190,'domains':24,'full_read_provenance_counts':readers,'bodies':9,'changed_bodies':changed,'unchanged_bodies':6,'original_MCP_correction_unchanged':True,'fragment':ident(V/'fragment-metadata.json'),'response':ident(V/'response.md'),'semantic_acceptance':'PENDING same persistent judges','independence':'Principal independently recalculated source/Git/SHA/byte/span/membership/manifest/body assertions; no product tests or producer semantic PASS inferred.'}
(O/'receipts/l1-b-v3-verification.json').write_text(json.dumps(receipt,ensure_ascii=False,indent=2)+'\n')
print(json.dumps(receipt,ensure_ascii=False))
