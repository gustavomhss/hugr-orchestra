"""PROPOSED, NOT RELEASED. Read-only exact governed-output chunks; never ACK."""
import os,sys,json,hashlib,stat
from pathlib import Path
BASE=Path('/synthetic-not-live/consumer-captures')
def digest(b):return hashlib.sha256(b).hexdigest()
def read_regular(path):
 fd=os.open(path,os.O_RDONLY|os.O_NOFOLLOW)
 try:
  a=os.fstat(fd);assert stat.S_ISREG(a.st_mode)
  with os.fdopen(os.dup(fd),'rb') as f:b=f.read()
  z=os.fstat(fd)
  assert (a.st_dev,a.st_ino,a.st_size,a.st_mtime_ns,a.st_ctime_ns)==(z.st_dev,z.st_ino,z.st_size,z.st_mtime_ns,z.st_ctime_ns)
  return b,(a.st_dev,a.st_ino,a.st_size,a.st_mtime_ns,a.st_ctime_ns)
 finally:os.close(fd)
def main():
 # Coordinator-issued grant path/hash and offset are explicit per-message authority.
 assert len(sys.argv)==4
 grant_path=Path(sys.argv[1]);raw,_=read_regular(grant_path);assert digest(raw)==sys.argv[2]
 g=json.loads(raw);assert g['state']=='COURIER_ONE_RESPONSE_AUTHORIZED'
 assert g['case'] in ['S3-C5','S3-C6','S3-C7']
 assert type(g['sequence']) is int and 1<=g['sequence']<=9999
 path=BASE/g['case']/f"{g['sequence']:04d}"/'response.json'
 assert g['response_path']==str(path)
 # Reject symlink ancestors through trusted fixed base, no directory enumeration.
 for parent in [path.parent,path.parent.parent,BASE]:assert not parent.is_symlink()
 b,identity=read_regular(path);assert digest(b)==g['response_sha256'] and len(b)==g['response_bytes']
 assert list(identity)==g['file_identity']
 b.decode('utf-8',errors='strict')
 start=int(sys.argv[3]);assert 0<=start<len(b)
 b[:start].decode('utf-8',errors='strict')
 end=min(start+8192,len(b))
 while end>start:
  try:b[start:end].decode('utf-8',errors='strict');break
  except UnicodeDecodeError:end-=1
 assert end>start
 again,identity2=read_regular(path);assert again==b and identity2==identity
 # Raw response bytes only on stdout. Metadata separate on stderr. No JSON response parsing.
 sys.stdout.buffer.write(b[start:end]);sys.stdout.buffer.flush()
 final,identity3=read_regular(path);assert final==b and identity3==identity
 sys.stderr.write(json.dumps({'start':start,'end_exclusive':end,'total_bytes':len(b),'chunk_sha256':digest(b[start:end]),'response_sha256':digest(b),'immutable_checks':3,'ack_generated':False})+'\n')
if __name__=='__main__':main()
