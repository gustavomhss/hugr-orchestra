"""PROPOSED NOT EXECUTABLE UNTIL REVIEW/RELEASE. One offset, no automatic retry."""
import os,sys,json,hashlib,subprocess,stat,signal
from pathlib import Path
P=Path(__file__).resolve().parent
BASE=Path('/synthetic-not-live/coordinator-delivery')
PYTHON='/synthetic-not-live/python3.12'
PY_SHA='fa67443527ed9647f760d807e2a38f26340757123e643c4639cf273ed15d5ea7'
ENV={'PATH':'/usr/local/bin:/usr/bin:/bin','HOME':'/nonexistent','LANG':'C.UTF-8','LC_ALL':'C.UTF-8','TZ':'UTC','TMPDIR':'/tmp','GIT_CONFIG_NOSYSTEM':'1','GIT_CONFIG_GLOBAL':'/dev/null','GIT_TERMINAL_PROMPT':'0','GIT_OPTIONAL_LOCKS':'0'}
def sha(b):return hashlib.sha256(b).hexdigest()
def fsyncdir(p):
 fd=os.open(p,os.O_RDONLY)
 try:os.fsync(fd)
 finally:os.close(fd)
def durable(p,b):
 with p.open('xb') as f:f.write(b);f.flush();os.fsync(f.fileno())
 fsyncdir(p.parent)
def emit(p,x):durable(p,(json.dumps(x,sort_keys=True)+'\n').encode())
def main():
 assert sys.executable==PYTHON and str(Path('/proc/self/exe').resolve())==str(Path(PYTHON).resolve())
 assert sha(Path(PYTHON).read_bytes())==PY_SHA and sys.flags.isolated and sys.flags.no_site and sys.dont_write_bytecode
 assert dict(os.environ)==ENV
 pins=json.loads((P/'pins.json').read_text());assert sha((P/'courier.py').read_bytes())==pins['courier_sha256']
 assert len(sys.argv)==6
 case,seq,grantsha,offset,release_sha=sys.argv[1:];assert case in ['S3-C5','S3-C6','S3-C7'];assert seq.isdigit() and seq==f'{int(seq):04d}' and 1<=int(seq)<=9999;assert offset and all('0'<=c<='9' for c in offset) and str(int(offset))==offset
 parent=BASE/case/('courier-'+seq)
 for path in [BASE,BASE/case,parent]:assert path.is_dir() and not path.is_symlink()
 grant=parent/'grant.json';raw=grant.read_bytes();assert sha(raw)==grantsha;g=json.loads(raw);assert g['case']==case and g['sequence']==int(seq)
 release=parent/('supervisor-release-'+offset+'.json');rb=release.read_bytes();assert sha(rb)==release_sha;r=json.loads(rb);assert r['execute_once'] is True and r['case']==case and r['sequence']==int(seq) and r['offset']==int(offset) and r['grant_sha256']==grantsha
 assert r['supervisor_sha256']==sha(Path(__file__).read_bytes()) and r['pins_sha256']==sha((P/'pins.json').read_bytes())
 run=parent/('supervised-'+offset);run.mkdir();fsyncdir(parent)
 emit(run/'attempt.json',{'case':case,'sequence':int(seq),'offset':int(offset),'grant_sha256':grantsha,'retry':False})
 proc=None;error=None;code=None
 def interrupted(signum,frame):raise InterruptedError('supervisor interrupted')
 for sig in [signal.SIGINT,signal.SIGTERM,signal.SIGHUP]:signal.signal(sig,interrupted)
 try:
  with (run/'stdout.raw').open('xb') as out,(run/'stderr.raw').open('xb') as err:
   proc=subprocess.Popen([PYTHON,'-I','-S','-B',str(P/'courier.py'),str(grant),grantsha,offset],env=ENV,cwd=P,stdout=out,stderr=err)
   emit(run/'child-start.json',{'pid':proc.pid,'scope':'direct read-only Python child, no descendants spawned by reviewed code'})
   try:code=proc.wait(timeout=120)
   except subprocess.TimeoutExpired:
    proc.kill();code=proc.wait(timeout=10);raise RuntimeError('child-timeout-failed-no-retry')
   out.flush();os.fsync(out.fileno());err.flush();os.fsync(err.fileno())
  assert code==0
  payload=(run/'stdout.raw').read_bytes();meta=json.loads((run/'stderr.raw').read_bytes());assert meta['start']==int(offset) and meta['end_exclusive']-meta['start']==len(payload) and len(payload)<=8192 and meta['chunk_sha256']==sha(payload) and meta['response_sha256']==g['response_sha256'] and meta['total_bytes']==g['response_bytes'] and meta['immutable_checks']==3
  payload.decode('utf-8',errors='strict')
  emit(run/'terminal.json',{'state':'CHILD_EXIT0_CHUNK_DURABLE','direct_child_returncode':code,'chunk':meta,'stdout_sha256':sha(payload),'stderr_sha256':sha((run/'stderr.raw').read_bytes()),'outer_tool_status':'NOT_ASSERTED','ack_generated':False})
  # Work is committed before output; never output bytes before child exit/receipt durability.
  sys.stdout.buffer.write(payload);sys.stdout.buffer.flush();sys.stderr.write(json.dumps({'terminal_receipt':str(run/'terminal.json'),'terminal_sha256':sha((run/'terminal.json').read_bytes()),'chunk':meta,'outer_tool_status':'NOT_ASSERTED'})+'\n')
 except BaseException as exc:
  for sig in [signal.SIGINT,signal.SIGTERM,signal.SIGHUP]:signal.signal(sig,signal.SIG_IGN)
  # Direct child only; never process-group signaling after reap. No retry.
  if proc is not None and code is None:
   try:proc.kill();code=proc.wait(timeout=10)
   except BaseException:error='CHILD_TERMINATION_UNKNOWN'
  try:emit(run/'STOP.json',{'state':error or 'FAILED','error_type':type(exc).__name__,'direct_child_returncode':code,'retry':False})
  except BaseException:pass
  raise
if __name__=='__main__':main()
