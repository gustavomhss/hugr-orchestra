"""Linux local lifecycle evidence. Not a sandbox against hostile native code.
Gate child persists identity before waiting for a one-byte release. EOF never execs.
"""
from pathlib import Path
import os,sys,json,time,signal,subprocess,hashlib

def durable(path,value):
 data=(json.dumps(value,sort_keys=True)+'\n').encode()
 with Path(path).open('xb') as f:f.write(data);f.flush();os.fsync(f.fileno())
 fd=os.open(Path(path).parent,os.O_RDONLY)
 try:os.fsync(fd)
 finally:os.close(fd)
 if Path(path).read_bytes()!=data:raise RuntimeError('lifecycle-readback')

def executable_identity():
 executable=str(Path(sys.executable).resolve(strict=True))
 actual=str(Path('/proc/self/exe').resolve(strict=True))
 digest=hashlib.sha256(Path('/proc/self/exe').read_bytes()).hexdigest()
 if actual!=executable or hashlib.sha256(Path(executable).read_bytes()).hexdigest()!=digest:raise RuntimeError('python-executable-identity-drift')
 return {'executable':executable,'sha256':digest}

def bootstrap_receipt():
 return {**executable_identity(),'flags':{'isolated':sys.flags.isolated,'no_site':sys.flags.no_site,'dont_write_bytecode':sys.dont_write_bytecode}}

def validate_bootstrap(value):
 expected={**executable_identity(),'flags':{'isolated':1,'no_site':1,'dont_write_bytecode':True}}
 if value!=expected:raise RuntimeError('gate-python-bootstrap-mismatch')
 return expected

def stat_identity(pid):
 raw=(Path('/proc')/str(pid)/'stat').read_text();tail=raw[raw.rfind(')')+2:].split()
 return {'pid':pid,'pgid':int(tail[2]),'sid':int(tail[3]),'starttime':int(tail[19])}

def namespace_context():
 return {'pid_namespace':os.readlink('/proc/self/ns/pid'),'boot_id':Path('/proc/sys/kernel/random/boot_id').read_text().strip()}

def identity(pid):
 return {**stat_identity(pid),'pid_namespace':os.readlink(Path('/proc')/str(pid)/'ns/pid'),'boot_id':namespace_context()['boot_id']}

def same_identity(a,b):return a==b

def check_namespace(anchor):
 if namespace_context()!={k:anchor[k] for k in ['pid_namespace','boot_id']}:raise RuntimeError('lifecycle-namespace-drift')

def members(anchor):
 check_namespace(anchor);rows=[]
 for p in Path('/proc').iterdir():
  if not p.name.isdigit():continue
  try:i=stat_identity(int(p.name))
  except FileNotFoundError:raise RuntimeError('lifecycle-census-partial-UNKNOWN')
  if i['pgid']==anchor['pgid']:
   if i['sid']!=anchor['sid'] or i['starttime']<anchor['starttime']:raise RuntimeError('lifecycle-group-identity-uncertain')
   # The pinned, unreaped direct child may be a zombie with no namespace link.
   if i['pid']==anchor['pid'] and i=={k:anchor[k] for k in i}:i={**i,**namespace_context()}
   else:
    try:i={**i,'pid_namespace':os.readlink(p/'ns/pid'),'boot_id':namespace_context()['boot_id']}
    except FileNotFoundError:raise RuntimeError('lifecycle-member-namespace-UNKNOWN')
   rows.append(i)
 return sorted(rows,key=lambda i:i['pid'])

def kernel_group_absent(anchor):
 # Census is diagnostic only. ESRCH is the atomic kernel absence observation.
 check_namespace(anchor)
 try:os.killpg(anchor['pgid'],0)
 except ProcessLookupError:
  check_namespace(anchor)
  return {'lifecycle_state':'TERMINATION_PROVEN','group_absent':True,'kernel_probe':'killpg-zero-ESRCH','members':[],'checked_monotonic':time.monotonic(),'anchor':anchor}
 raise RuntimeError('lifecycle-kernel-group-present')

def wait_unreaped(proc,timeout):
 end=time.monotonic()+timeout
 while True:
  value=os.waitid(os.P_PID,proc.pid,os.WEXITED|os.WNOHANG|os.WNOWAIT)
  if value is not None:return value
  if time.monotonic()>=end:raise subprocess.TimeoutExpired(proc.args,timeout)
  time.sleep(.01)

def finish_group(proc,anchor):
 # Leader remains an unreaped direct child while census is inspected.
 if proc.returncode is not None:raise RuntimeError('lifecycle-leader-already-reaped')
 rows=members(anchor)
 if len(rows)!=1 or not same_identity(rows[0],anchor):raise RuntimeError('lifecycle-other-members-or-partial')
 code=proc.wait(timeout=1)
 return code,kernel_group_absent(anchor)

def stop_group(proc,anchor):
 if anchor is None:raise RuntimeError('lifecycle-no-durable-anchor')
 check_namespace(anchor)
 if proc.returncode is not None:raise RuntimeError('lifecycle-reaped-leader-no-signal-UNKNOWN')
 # Unreaped Popen child pins PID/PGID. Never signal a possibly reused group.
 current=stat_identity(proc.pid)
 if current!={k:anchor[k] for k in current}:raise RuntimeError('lifecycle-pid-reuse-no-signal')
 os.killpg(anchor['pgid'],signal.SIGKILL)
 proc.wait(timeout=10)
 # Zombies/descendants still in group => UNKNOWN, not a false absence claim.
 return kernel_group_absent(anchor)

def durable_directory(path,exclusive=False):
 path=Path(path)
 if exclusive:path.mkdir()
 else:path.mkdir(parents=True,exist_ok=True)
 # Fsync the complete ancestor chain, not just the leaf's immediate parent.
 for p in [path,*path.parents]:
  if p.is_symlink() or not p.is_dir():raise RuntimeError('directory-chain-alias')
  flags=os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW
  fd=os.open(p,flags)
  try:
   st=os.fstat(fd);os.fsync(fd)
   if (st.st_dev,st.st_ino)!=(p.stat().st_dev,p.stat().st_ino):raise RuntimeError('directory-chain-drift')
  finally:os.close(fd)

def gated_spawn(argv,cwd,env,out,err,run,timeout):
 # Child inherits ONLY read end. Parent death closes release write end => EOF.
 rd,wr=os.pipe();proc=None;anchor=None
 try:
  proc=subprocess.Popen([sys.executable,'-I','-S','-B',str(Path(__file__).resolve()),'gate',str(rd),str(run),json.dumps(argv)],cwd=cwd,env=env,stdout=out,stderr=err,start_new_session=True,pass_fds=(rd,))
  os.close(rd);rd=None
  end=time.monotonic()+min(timeout,10)
  while not (run/'process-start.json').exists():
   if os.waitid(os.P_PID,proc.pid,os.WEXITED|os.WNOHANG|os.WNOWAIT) is not None:raise RuntimeError('gate-exited-before-registration')
   if time.monotonic()>=end:raise RuntimeError('gate-registration-timeout')
   time.sleep(.01)
  # Child's durable() completion is confirmed with a ready pipe? A separate file
  # is atomically renamed only AFTER fsync/readback, so existence means complete.
  registration=json.loads((run/'process-start.json').read_bytes())
  bootstrap=validate_bootstrap(registration['python_bootstrap'])
  anchor=registration['identity']
  if anchor['pid']!=proc.pid or anchor['pgid']!=proc.pid or anchor['sid']!=proc.pid or not same_identity(identity(proc.pid),anchor):raise RuntimeError('gate-identity-mismatch')
  d=os.open(run,os.O_RDONLY);os.fsync(d);os.close(d)
  durable(run/'process-release.json',{'identity':anchor,'native_argv':argv,'attempt_registered':True,'release_intent':True,'python_bootstrap':bootstrap,'lifecycle_state':'RELEASE_INTENT_EXEC_UNKNOWN'})
  os.write(wr,b'G');os.close(wr);wr=None
  return proc,anchor
 except BaseException:
  if wr is not None:os.close(wr);wr=None
  # Never lose Popen handle if registration/release fails. EOF denies native exec.
  for sig in (signal.SIGTERM,signal.SIGINT,signal.SIGHUP):signal.signal(sig,signal.SIG_IGN)
  if proc is not None:
   try:
    if anchor is None and (run/'process-start.json').exists():anchor=json.loads((run/'process-start.json').read_bytes())['identity']
    if anchor is None:
     # Handle is still unreaped, so its PID cannot yet be reused. Native remains gated.
     proc.kill();proc.wait(timeout=2)
     durable(run/'process-spawn-stop.json',{'native_release':False,'gate_reaped':True,'group_absence':'UNKNOWN_NO_ANCHOR'})
    else:durable(run/'process-spawn-stop.json',stop_group(proc,anchor))
   except BaseException as cleanup:
    durable(run/'process-spawn-uncertain.json',{'lifecycle_state':'POSSIBLY_STARTED_TERMINATION_UNKNOWN','error':str(cleanup),'identity':anchor,'recovery':'EXPLICIT_REVIEW_REQUIRED'})
  raise
 finally:
  if rd is not None:os.close(rd)
  if wr is not None:os.close(wr)

def gate(fd,run,argv):
 run=Path(run);anchor=identity(os.getpid());bootstrap=bootstrap_receipt()
 # Registration completed atomically before parent can release native work.
 tmp=run/'process-start.pending'
 durable(tmp,{'identity':anchor,'gate':'waiting-release','lifecycle_state':'GATE_CREATED_NOT_RELEASED','python_bootstrap':bootstrap,'native_argv':argv})
 os.rename(tmp,run/'process-start.json');d=os.open(run,os.O_RDONLY);os.fsync(d);os.close(d)
 try:token=os.read(fd,1)
 finally:os.close(fd)
 if token!=b'G':raise SystemExit(78)
 validate_bootstrap(bootstrap)
 # Parent committed attempt and registration before releasing this byte.
 os.execvpe(argv[0],argv,os.environ)

if __name__=='__main__':
 if len(sys.argv)!=5 or sys.argv[1]!='gate':raise SystemExit('gate-only')
 gate(int(sys.argv[2]),sys.argv[3],json.loads(sys.argv[4]))
