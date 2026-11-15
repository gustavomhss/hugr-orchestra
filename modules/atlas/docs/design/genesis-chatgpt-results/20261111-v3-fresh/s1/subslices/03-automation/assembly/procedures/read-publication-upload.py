"""Read frozen UTF-8 Git blob content for the sole root connector writer.

This helper is read-only. Chunking is a tool-envelope transport detail: the writer
concatenates the entire exact file before one create_blob; source files are not split.
"""
from pathlib import Path
import hashlib,json,sys
W=Path(__file__).resolve().parents[1]
name,mode=sys.argv[1:3]
assert '/' not in name and name not in {'.','..'}
D=W/'publish'/name
plan=json.loads((D/'upload-plan.json').read_bytes())
if mode=='plan':
 print(json.dumps(plan,ensure_ascii=False,separators=(',',':')))
elif mode=='chunk':
 index,offset=map(int,sys.argv[3:5]);row=plan['unique_uploads'][index]
 raw=(D/'files'/row['path']).read_bytes()
 assert len(raw)==row['byte_length'] and hashlib.sha256(raw).hexdigest()==row['sha256']
 assert hashlib.sha1(b'blob '+str(len(raw)).encode()+b'\0'+raw).hexdigest()==row['git_blob_sha']
 text=raw.decode('utf-8');assert 0<=offset<=len(text)
 chunk=text[offset:offset+16000]
 print(json.dumps({'index':index,'path':row['path'],'git_blob_sha':row['git_blob_sha'],'bytes':len(raw),'start':offset,'next':offset+len(chunk),'total_characters':len(text),'content':chunk},ensure_ascii=False,separators=(',',':')))
else:
 raise SystemExit('plan or chunk required')
