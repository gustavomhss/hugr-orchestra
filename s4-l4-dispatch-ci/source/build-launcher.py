"""Pure source renderer for a fixed, reviewable launcher. Never runs it."""
import json
TEMPLATE=r'''# Frozen operator launcher. No path/config/driver arguments accepted.
from pathlib import Path
import sys,os,json,hashlib,types
A=AUTHORITY
H=lambda b:hashlib.sha256(b).hexdigest()
def check(ok,why):
 if not ok:raise RuntimeError(why)
def safe(path):
 p=Path(path);check(p.is_absolute() and str(p)==path and '..' not in p.parts,'canonical-path')
 for q in [p,*p.parents]:check(not q.is_symlink() and q.exists(),'alias-or-missing')
 return p
def raw(path):
 p=safe(path);fd=os.open(p,os.O_RDONLY|os.O_NOFOLLOW)
 try:
  before=os.fstat(fd);check(before.st_nlink==1,'hardlink');parts=[]
  while True:
   b=os.read(fd,65536)
   if not b:break
   parts.append(b)
  after=os.fstat(fd);st=p.stat();safe(path);check((before.st_dev,before.st_ino,before.st_size,before.st_mtime_ns)==(after.st_dev,after.st_ino,after.st_size,after.st_mtime_ns),'file-drift');check((st.st_dev,st.st_ino)==(before.st_dev,before.st_ino),'path-drift');return b''.join(parts)
 finally:os.close(fd)
check(len(sys.argv)==1,'no-launcher-arguments')
check(sys.flags.isolated==1 and sys.flags.no_site==1 and sys.dont_write_bytecode,'bootstrap-flags')
actual=str(Path('/proc/self/exe').resolve(strict=True));check(actual==A['engine']['path']==str(Path(sys.executable).resolve(strict=True)),'engine-path')
check(H(Path('/proc/self/exe').read_bytes())==A['engine']['sha256']==H(raw(actual)),'engine-hash')
check(set(A['pins'])>=set([A['dispatcher'],A['broker'],A['lifecycle']]),'mandatory-pins')
verified={p:raw(p) for p in A['pins']}
for p,d in A['pins'].items():check(H(verified[p])==d,'source-hash')
config_bytes=raw(A['config']);check(H(config_bytes)==A['config_sha256'],'fixed-config-hash')
request=json.loads(sys.stdin.read())
m=types.ModuleType('fixed_verified_dispatcher');m.__file__=A['dispatcher']
exec(compile(verified[A['dispatcher']],A['dispatcher'],'exec'),m.__dict__)
m.run(config_bytes,A,verified,request)
'''
def render(authority):return TEMPLATE.replace('AUTHORITY',repr(authority))
