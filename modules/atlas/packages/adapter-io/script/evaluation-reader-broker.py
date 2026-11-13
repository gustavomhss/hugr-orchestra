"""Generic isolated-reader broker. Configuration and release are external trusted operator inputs.
Only explicit reviewed recovery may remove a sticky lock/STOP after uncertainty.
"""
from pathlib import Path
import sys,json,os,hashlib,subprocess,datetime,signal,re,importlib.util,tempfile
_lifecycle_path=Path(__file__).with_name("evaluation-reader-lifecycle.py")
_spec=importlib.util.spec_from_file_location("evaluation_reader_lifecycle",_lifecycle_path)
_lifecycle=importlib.util.module_from_spec(_spec);_spec.loader.exec_module(_lifecycle)
# Operator supplies immutable configuration; consumer-facing launcher fixes this path.
SETTINGS_PATH=Path(sys.argv[1]).resolve() if len(sys.argv)>1 else Path('/nonexistent-config')
SETTINGS=None
ROOT=PLAN=CASEFILE=AUTH=LOGS=None
NEEDS={'entry','ownership','maintenance','operational','flow','evidence','component'}
COUNTS=['index_calls','read_calls','body_bytes_total']
sha=lambda b:hashlib.sha256(b).hexdigest()
now=lambda:datetime.datetime.now(datetime.timezone.utc).isoformat()
def fail(s):raise RuntimeError(s)
def _stream_evidence(stream,complete):
 if stream is None:return {'present':False,'bytes':0,'sha256':None,'complete':False}
 # pread avoids changing the shared file offset inherited by the child as stdout/stderr.
 size=os.fstat(stream.fileno()).st_size;digest=hashlib.sha256();offset=0
 while offset<size:
  chunk=os.pread(stream.fileno(),min(65536,size-offset),offset)
  if not chunk:break
  digest.update(chunk);offset+=len(chunk)
 return {'present':True,'bytes':offset,'sha256':digest.hexdigest(),'complete':bool(complete and offset==size)}

def _file_evidence(path):
 if not path.exists():return {'present':False,'bytes':0,'sha256':None}
 data=path.read_bytes()
 return {'present':True,'bytes':len(data),'sha256':sha(data)}

def retain_private_payloads(run,names,streams=None):
 # Restricted forensic copy is durable and verified BEFORE public names are unlinked.
 private=run/'private-failure-evidence'
 os.mkdir(private,0o700)
 dfd=os.open(private,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW)
 copied=[]
 try:
  st=os.fstat(dfd)
  if st.st_uid!=os.getuid() or st.st_mode&0o777!=0o700:
   fail('private-evidence-directory-permissions')
  for name in names:
   source=run/name
   if not source.exists():continue
   if source.is_symlink() or not source.is_file() or source.stat().st_nlink!=1:
    fail('private-evidence-source-unsafe')
   before=source.stat()
   data=source.read_bytes()
   fd=os.open(name,os.O_RDWR|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600,dir_fd=dfd)
   try:
    fst=os.fstat(fd)
    if fst.st_uid!=os.getuid() or fst.st_mode&0o777!=0o600:
     fail('private-evidence-file-permissions')
    view=memoryview(data)
    while view:
     written=os.write(fd,view)
     if written<=0:fail('private-evidence-short-write')
     view=view[written:]
    os.fsync(fd)
    os.lseek(fd,0,os.SEEK_SET)
    check=b''
    while len(check)<len(data):
     chunk=os.read(fd,min(65536,len(data)-len(check)))
     if not chunk:break
     check+=chunk
    if check!=data:fail('private-evidence-readback')
   finally:os.close(fd)
   after=source.stat()
   if (before.st_dev,before.st_ino,before.st_size,before.st_mtime_ns)!=(after.st_dev,after.st_ino,after.st_size,after.st_mtime_ns):
    fail('private-evidence-source-drift')
   copied.append(name)
  stream_copies={}
  for label,stream in (streams or {}).items():
   if stream is None:
    stream_copies[label]={'present':False,'bytes':0,'sha256':None,'complete':False}
    continue
   source_fd=stream.fileno();before=os.fstat(source_fd);size=before.st_size
   fd=os.open(label+'.bin',os.O_RDWR|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600,dir_fd=dfd)
   digest=hashlib.sha256();offset=0
   try:
    fst=os.fstat(fd)
    if fst.st_uid!=os.getuid() or fst.st_mode&0o777!=0o600:
     fail('private-stream-permissions')
    while offset<size:
     chunk=os.pread(source_fd,min(65536,size-offset),offset)
     if not chunk:break
     view=memoryview(chunk)
     while view:
      written=os.write(fd,view)
      if written<=0:fail('private-stream-short-write')
      view=view[written:]
     digest.update(chunk);offset+=len(chunk)
    os.fsync(fd)
    os.lseek(fd,0,os.SEEK_SET);check=hashlib.sha256();checked=0
    while True:
     chunk=os.read(fd,65536)
     if not chunk:break
     check.update(chunk);checked+=len(chunk)
    if checked!=offset or check.hexdigest()!=digest.hexdigest():
     fail('private-stream-readback')
   finally:os.close(fd)
   after=os.fstat(source_fd)
   stream_copies[label]={'present':True,'bytes':offset,'sha256':digest.hexdigest(),
                         'complete':bool(offset==size and after.st_size==size and
                                          after.st_mtime_ns==before.st_mtime_ns)}
  os.fsync(dfd)
  # Verify every private copy before removing any original public-path payload.
  for name in copied:
   original=(run/name).read_bytes()
   fd=os.open(name,os.O_RDONLY|os.O_NOFOLLOW,dir_fd=dfd)
   try:
    chunks=[]
    while True:
     chunk=os.read(fd,65536)
     if not chunk:break
     chunks.append(chunk)
    if b''.join(chunks)!=original:fail('private-evidence-final-verification')
   finally:os.close(fd)
  for name in copied:(run/name).unlink()
  rfd=os.open(run,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW)
  try:os.fsync(rfd)
  finally:os.close(rfd)
  return {'state':'RETAINED_RESTRICTED','directory':'private-failure-evidence',
          'files':copied,'streams':stream_copies,'directory_mode':'0700','file_mode':'0600'}
 finally:os.close(dfd)

def preserve_failure_evidence(run,out_stream,err_stream,error,process_outcome):
 if run is None:return None
 complete=(process_outcome.get('lifecycle_state')=='TERMINATION_PROVEN' and process_outcome.get('group_absent') is True and process_outcome.get('kernel_probe')=='killpg-zero-ESRCH' and process_outcome.get('members')==[])
 payload_names=('stdout.json','stderr.txt','response.json')
 outputs={
  'stdout_anonymous':_stream_evidence(out_stream,complete),
  'stderr_anonymous':_stream_evidence(err_stream,complete),
  'stdout_persisted':_file_evidence(run/'stdout.json'),
  'stderr_persisted':_file_evidence(run/'stderr.txt'),
  'response_persisted':_file_evidence(run/'response.json'),
 }
 lifecycle={name:(run/name).is_file() for name in ('process-start.json','process-release.json','process-exit.json','process-spawn-stop.json','process-spawn-uncertain.json')}
 try:
  retention=retain_private_payloads(run,payload_names,{'stdout-anonymous':out_stream,'stderr-anonymous':err_stream})
 except BaseException:
  # Fail closed: never truncate or unlink the only surviving forensic copy.
  retention={'state':'BLOCKED_NOT_PURGED','directory':None,'files':[],
             'reason':'restricted-retention-could-not-be-verified'}
 evidence={'schema':'reader-failure-evidence/v2','status':'UNKNOWN',
  'diagnostic':safe_error_diagnostic(error),'outputs':outputs,'lifecycle_records':lifecycle,
  'capture_completeness':'COMPLETE_AFTER_TERMINATION_PROOF' if complete else 'INCOMPLETE_UNKNOWN',
  'process_outcome':process_outcome,'payload_retained':retention['state']=='RETAINED_RESTRICTED',
  'payload_retention':retention,
  'payload_policy':'raw payload retained only in owner-restricted mode 0700 directory with mode 0600 files; public copies removed only after verified durable copy'}
 write(run/'failure-evidence.json',evidence)
 return evidence

def safe_error_diagnostic(error):return _lifecycle.safe_failure_diagnostic(error)

def failure_process_outcome(proc,anchor,run):
 if proc is None:return {'lifecycle_state':'GATE_OR_RELEASE_STATE_SEE_DURABLE_RECORDS','state':'UNKNOWN'}
 exit_record=run/'process-exit.json' if run is not None else None
 if exit_record is not None and exit_record.is_file():
  try:proof=read(exit_record)
  except BaseException:return {'lifecycle_state':'PROCESS_EXIT_RECORD_INVALID','state':'UNKNOWN','identity':anchor}
  if (proof.get('anchor')==anchor and proof.get('group_absent') is True and
      proof.get('kernel_probe')=='killpg-zero-ESRCH' and proof.get('members')==[]):
   return proof
  return {'lifecycle_state':'PROCESS_EXIT_RECORD_UNPROVEN','state':'UNKNOWN','identity':anchor}
 try:return _lifecycle.stop_group(proc,anchor)
 except BaseException as cleanup:
  return {'lifecycle_state':'POSSIBLY_STARTED_TERMINATION_UNKNOWN','state':'UNKNOWN',
          'diagnostic':safe_error_diagnostic(cleanup),'identity':anchor}
def filebytes(p):
 if p.is_symlink() or not p.is_file() or p.stat().st_nlink!=1:fail('unsafe-file:'+str(p))
 return p.read_bytes()
def read(p):return json.loads(filebytes(p))
def durable(p,b):
 with p.open('xb') as f:f.write(b);f.flush();os.fsync(f.fileno())
 fd=os.open(p.parent,os.O_RDONLY)
 try:os.fsync(fd)
 finally:os.close(fd)
def write(p,v):durable(p,(json.dumps(v,ensure_ascii=False,indent=2)+'\n').encode())
def snapshot():
 result={}
 for p in sorted(ROOT.rglob('*')):
  if p.is_symlink():fail('root-symlink')
  result[str(p.relative_to(ROOT))]={'kind':'file','sha256':sha(filebytes(p))} if p.is_file() else {'kind':'directory'}
 return result
def configure():
 global SETTINGS,ROOT,PLAN,CASEFILE,AUTH,LOGS
 SETTINGS=read(SETTINGS_PATH)
 required={'root','policy_directory','cases_file','authorization_file','logs','reader_argv','cwd','driver_files','runtime','timeout_seconds'}
 if set(SETTINGS)!=required:fail('configuration-schema')
 for key in ['root','policy_directory','cases_file','authorization_file','logs','cwd']:
  if not Path(SETTINGS[key]).is_absolute():fail('configuration-relative-path')
 ROOT=Path(SETTINGS['root']);PLAN=Path(SETTINGS['policy_directory']);CASEFILE=Path(SETTINGS['cases_file']);AUTH=Path(SETTINGS['authorization_file']);LOGS=Path(SETTINGS['logs'])
 if SETTINGS['driver_files'].get('lifecycle')!=str(_lifecycle_path.resolve()):fail('lifecycle-driver-not-pinned')
 if not isinstance(SETTINGS['reader_argv'],list) or not SETTINGS['reader_argv'] or not all(isinstance(x,str) for x in SETTINGS['reader_argv']):fail('configuration-command')
 if not 0<SETTINGS['timeout_seconds']<=120:fail('configuration-timeout')

def authorization(case_id):
 authbytes=filebytes(AUTH);a=json.loads(authbytes);cfg=read(CASEFILE)
 if a.get('config_sha256')!=sha(filebytes(SETTINGS_PATH)):fail('configuration-drift')
 if a.get('state')!='RELEASED' or a.get('cases_sha256')!=sha(filebytes(CASEFILE)) or a.get('active_case')!=case_id:fail('not-released')
 for name,path in SETTINGS['driver_files'].items():
  if a.get('driver_sha256',{}).get(name)!=sha(filebytes(Path(path))):fail('driver-drift')
 c=next((c for c in cfg['cases'] if c['id']==case_id),None)
 if c is None or not re.fullmatch(r'evaluation-budget-[0-9a-f]{64}\.json',a.get('ledger_name','')):fail('case-ledger-authorization')
 return a,c,cfg,sha(authbytes)
def policycheck(c,cfg):
 p=ROOT/'.atlas/evaluation-policy.json'
 if sha(filebytes(p))!=c['policy_sha256'] or read(p)!=read(PLAN/c['policy_proposal']):fail('policy-drift')
 if ROOT.resolve()!=ROOT or (ROOT/'.atlas').resolve()!=ROOT/'.atlas':fail('root-alias')
 m=read(ROOT/'.atlas/evaluation-store.json');st=ROOT.stat()
 if m.get('device')!=st.st_dev or m.get('inode')!=st.st_ino or m.get('evaluationCandidate')!=cfg['candidate_id'] or m.get('generation')!=cfg['generation']:fail('marker-drift')
 if list((ROOT/'.atlas').glob('staging*')):fail('unexpected-staging')
def identity(c,cfg):return {'case':c['id'],'mode':c['mode'],'candidate':cfg['candidate_id'],'generation':cfg['generation']}
def ledger(c,cfg,name):
 path=ROOT/'.atlas'/name
 for p in (ROOT/'.atlas').glob('evaluation-budget-*'):
  if p.name.endswith(('.lock','.next')):fail('unsettled-budget')
  value=read(p)
  if value.get('consumer')==c['id'] and p.name!=name:fail('unexpected-case-ledger-path')
 if not path.exists():return {'path':name,'exists':False,'sha256':None,'value':None}
 b=filebytes(path);v=json.loads(b)
 expected={'schema':'evaluation-read-budget/v1','candidate':cfg['candidate_id'],'generation':cfg['generation'],'consumer':c['id'],'mode':c['mode']}
 if set(v)!=set(expected)|set(COUNTS) or any(v[k]!=val for k,val in expected.items()):fail('ledger-identity')
 if any(type(v[k])is not int or v[k]<0 or v[k]>c['limits'][k] for k in COUNTS):fail('ledger-values')
 return {'path':name,'exists':True,'sha256':sha(b),'value':v}
def counts(l):return {k:l['value'][k] if l['exists'] else 0 for k in COUNTS}
def validate_case_limits(c):
 # Broker caps may only restrict an operator-declared native ceiling, never expand it.
 for source in ['limits']+(['native_limits'] if 'native_limits'in c else []):
  if set(c[source])!=set(COUNTS) or any(type(c[source][k])is not int or c[source][k]<1 for k in COUNTS):fail('case-limit-schema')
 if 'native_limits'in c and any(c['limits'][k]>c['native_limits'][k] for k in COUNTS):fail('case-limit-exceeds-native')
 for name in ['per_read_max_bytes','shallow_max_bytes']:
  if name in c and (type(c[name])is not int or c[name]<1 or c[name]>c['limits']['body_bytes_total']):fail('per-read-cap-schema')
 if c.get('shallow_max_bytes',0)>c.get('per_read_max_bytes',c['limits']['body_bytes_total']):fail('shallow-exceeds-per-read')
 if 'shallow_entry_key'in c and (not isinstance(c['shallow_entry_key'],str) or not c['shallow_entry_key'] or len(c['shallow_entry_key'])>4096 or 'shallow_max_bytes' not in c):fail('shallow-entry-schema')
 if c['mode'] not in ['routine','deep']:fail('unsupported-native-mode')

def precheck_budget(req,c,live,authorization):
 # Called only after exact history reconciliation, inside the shared lock, BEFORE spawn.
 used=counts(live);operation=req['operation']
 if used[operation+'_calls']>=c['limits'][operation+'_calls']:fail('broker-call-budget-exhausted')
 if operation=='read':
  if 'shallow_max_bytes'in c and (authorization.get('read_depth') not in ['shallow','deep'] or req['args'].get('depth')!=authorization['read_depth']):fail('read-depth-not-authorized')
  if 'shallow_entry_key'in c:
   # One shallow entry body, then deep reads in the SAME identity/ledger.
   # Answer freezing is a separate trusted dispatch gate, not inferred here.
   if req['args'].get('depth')=='shallow':
    if used['read_calls']!=0 or req['args'].get('key')!=c['shallow_entry_key'] or 'need'in req['args']:fail('shallow-entry-only-first-read')
   elif used['read_calls']<1:fail('deep-before-shallow-entry')
  remaining=c['limits']['body_bytes_total']-used['body_bytes_total']
  ceiling=min(remaining,c.get('per_read_max_bytes',c['limits']['body_bytes_total']))
  if req['args'].get('depth')=='shallow':ceiling=min(ceiling,c.get('shallow_max_bytes',ceiling))
  if req['args']['maxBytes']>ceiling:fail('broker-read-budget-before-spawn')

def validate_request(req,c):
 validate_case_limits(c)
 if not isinstance(req,dict) or set(req)!={'operation','args'} or not isinstance(req['args'],dict):fail('request-schema')
 a=req['args']
 if req['operation']=='index':
  if set(a)!={'need'} or a['need'] not in NEEDS:fail('index-args')
 elif req['operation']=='read':
  if not set(a)<={'need','key','section','maxBytes','depth'} or ('need'in a)==('key'in a):fail('read-selection')
  if 'need'in a and a['need'] not in NEEDS:fail('read-need')
  if 'depth'in a and (a['depth'] not in ['shallow','deep'] or 'shallow_max_bytes' not in c):fail('read-depth-schema')
  for k in ['key','section']:
   if k in a and (not isinstance(a[k],str) or not a[k] or len(a[k])>4096):fail('read-string')
  if type(a.get('maxBytes'))is not int or not 0<a['maxBytes']<=c['limits']['body_bytes_total']:fail('read-limit')
 else:fail('operation-denied')
def history(case_logs,c,cfg,live):
 """Every prior capture must be complete, hash-linked, acknowledged and ledger-contiguous."""
 entries=sorted(case_logs.iterdir())
 if any(p.is_symlink() for p in entries):fail('history-alias')
 if any(not p.is_dir() or not re.fullmatch(r'[0-9]{4}',p.name) for p in entries):fail('history-unexpected-file')
 previous_hash=None;previous_after={'path':live['path'],'exists':False,'sha256':None,'value':None}
 for number,d in enumerate(entries,1):
  if d.name!=f'{number:04d}':fail('history-sequence')
  if {p.name for p in d.iterdir()}!={'attempt.json','before.json','stdout.json','stderr.txt','after.json','response.json','receipt.json','receipt.sha256','consumer-ack.json','process-start.json','process-release.json','process-exit.json'}:fail('history-incomplete-or-extra')
  rb=filebytes(d/'receipt.json');receipt=json.loads(rb)
  if filebytes(d/'receipt.sha256').decode().strip()!=sha(rb):fail('receipt-hash')
  if receipt['identity']!=identity(c,cfg) or receipt['sequence']!=number or receipt['previous_receipt_sha256']!=previous_hash:fail('history-identity-chain')
  if receipt['conclusion']!='CAPTURE_COMMITTED' or not receipt['governed_result_validated_and_charged'] or receipt['exit_code']!=0 or not receipt['process_exit_confirmed']:fail('history-not-confirmed')
  for name,expected in receipt['capture_files'].items():
   if name not in ['attempt.json','before.json','stdout.json','stderr.txt','after.json','response.json','process-start.json','process-release.json','process-exit.json'] or sha(filebytes(d/name))!=expected:fail('capture-integrity')
  if set(receipt['capture_files'])!={'attempt.json','before.json','stdout.json','stderr.txt','after.json','response.json','process-start.json','process-release.json','process-exit.json'}:fail('capture-coverage')
  start=read(d/'process-start.json');release=read(d/'process-release.json');ended=read(d/'process-exit.json')
  if start['identity']!=release['identity'] or ended.get('anchor')!=start['identity'] or ended.get('group_absent') is not True or ended.get('kernel_probe')!='killpg-zero-ESRCH' or ended.get('members')!=[]:fail('history-process-lifecycle')
  if receipt.get('process_identity')!=start['identity']:fail('history-process-identity')
  bootstrap=_lifecycle.validate_bootstrap(start.get('python_bootstrap'))
  if release.get('python_bootstrap')!=bootstrap:fail('history-python-bootstrap')
  attempt=read(d/'attempt.json')
  if start['native_argv']!=attempt['argv'] or release['native_argv']!=attempt['argv'] or release.get('attempt_registered') is not True or release.get('release_intent') is not True:fail('history-native-release')
  if attempt['identity']!=identity(c,cfg) or attempt['sequence']!=number or attempt['ledger_before']!=previous_after:fail('attempt-chain')
  if receipt['ledger_before']!=previous_after:fail('ledger-history-gap')
  validate_request(attempt['request'],c)
  if attempt['request']['operation']=='read' and 'shallow_max_bytes'in c and attempt['request']['args'].get('depth')!=attempt['authorized_read_depth']:fail('history-depth-authority')
  precheck_budget(attempt['request'],c,receipt['ledger_before'],{'read_depth':attempt.get('authorized_read_depth')})
  if receipt['operation']!=attempt['request']['operation'] or receipt['arguments']!=attempt['request']['args']:fail('history-request-mismatch')
  old=counts(receipt['ledger_before']);new=counts(receipt['ledger_after'])
  old[receipt['operation']+'_calls']+=1;old['body_bytes_total']+=receipt['body_bytes_charged']
  if not receipt['ledger_after']['exists'] or new!=old or receipt['ledger_after']['path']!=live['path']:fail('history-charge-mismatch')
  before_snapshot=read(d/'before.json');after_snapshot=read(d/'after.json')
  changed={k for k in set(before_snapshot)|set(after_snapshot) if before_snapshot.get(k)!=after_snapshot.get(k)}
  if changed-{'.atlas/'+live['path']}:fail('history-other-state-mutation')
  for value,snapshot in [(receipt['ledger_before'],before_snapshot),(receipt['ledger_after'],after_snapshot)]:
   actual=snapshot.get('.atlas/'+live['path'])
   expected={'kind':'file','sha256':value['sha256']} if value['exists'] else None
   if actual!=expected:fail('history-ledger-snapshot')
  response=filebytes(d/'response.json')
  if response!=filebytes(d/'stdout.json') or receipt['envelope_bytes']!=len(response):fail('history-response-integrity')
  parsed=json.loads(response);label=parsed.get('evaluation',{})
  if parsed.get('kind')=='hold' or label.get('phase')!='evaluation' or label.get('evaluationCandidate')!=cfg['candidate_id'] or label.get('generation')!=cfg['generation'] or label.get('manifest')!=cfg['ownership']:fail('history-response-identity')
  if receipt['body_bytes_charged']!=len(parsed.get('body','').encode()):fail('history-body-charge')
  if receipt['response']!={'path':'response.json','bytes':len(response),'sha256':sha(response),'persisted':True}:fail('response-persistence')
  ack=read(d/'consumer-ack.json')
  expected_literal=f"I received the complete response for {c['id']} call {number:04d}: {len(response)} bytes, SHA256 {sha(response)}."
  if ack!={'case':c['id'],'sequence':number,'response_sha256':sha(response),'response_bytes':len(response),'literal_confirmation':expected_literal,'source':'literal-consumer-message'}:fail('consumer-delivery-unconfirmed')
  previous_hash=sha(rb);previous_after=receipt['ledger_after']
 if live!=previous_after:fail('live-ledger-not-exact-last-confirmed')
 return len(entries),previous_hash

def interrupted(signum,frame):raise KeyboardInterrupt(f'signal:{signum}')
def main():
 if len(sys.argv)!=4:fail('usage CONFIG CASE_ID ONE_JSON_REQUEST')
 configure()
 case_id=sys.argv[2];req=json.loads(sys.argv[3]);a,c,cfg,authhash=authorization(case_id);validate_request(req,c)
 _lifecycle.durable_directory(LOGS);lock=LOGS/'active.lock';_lifecycle.durable_directory(lock,exclusive=True) # sticky if any uncertainty
 safe_release=False;run=None;proc=None;anchor=None;out_stream=None;err_stream=None
 signal.signal(signal.SIGTERM,interrupted);signal.signal(signal.SIGHUP,interrupted);signal.signal(signal.SIGINT,interrupted)
 try:
  # Authorization MUST be reread after acquiring the global lock.
  a,c,cfg,lockedhash=authorization(case_id)
  if lockedhash!=authhash:fail('authorization-changed-before-lock')
  validate_request(req,c);policycheck(c,cfg)
  case_logs=LOGS/case_id;_lifecycle.durable_directory(case_logs)
  if case_logs.is_symlink():fail('case-history-alias')
  live=ledger(c,cfg,a['ledger_name']);seq,prevhash=history(case_logs,c,cfg,live)
  precheck_budget(req,c,live,a)
  run=case_logs/f'{seq+1:04d}';_lifecycle.durable_directory(run,exclusive=True)
  before=snapshot();write(run/'before.json',before)
  envelope={'request':req,'candidate':cfg['candidate_id'],'generation':cfg['generation'],'consumer':case_id,'mode':c['mode'],'ledgerName':a['ledger_name'],'root':str(ROOT),'actor':cfg['actor'],'scope':cfg['scope'],'runtime':SETTINGS['runtime']}
  argv=SETTINGS['reader_argv']+[json.dumps(envelope,separators=(',',':'))]
  cwd=Path(SETTINGS['cwd'])
  env=os.environ.copy();env.pop('ATLAS_RATIFY_TOKEN',None);env.pop('NODE_OPTIONS',None);env.pop('BUN_OPTIONS',None);env['ATLAS_ACTOR']=cfg['actor']
  write(run/'attempt.json',{'identity':identity(c,cfg),'sequence':seq+1,'ledger_before':live,'authorization_sha256':authhash,'policy_sha256':c['policy_sha256'],'argv':argv,'cwd':str(cwd),'request':req,'authorized_read_depth':a.get('read_depth'),'started':now()})
  if authorization(case_id)[3]!=authhash:fail('authorization-drift-before-spawn')
  policycheck(c,cfg)
  # Child-controlled bytes stay in anonymous temporary storage until exit is proven.
  # stderr is discarded; on UNKNOWN there is no named output file for a live child to keep writing.
  out_stream=tempfile.TemporaryFile();err_stream=tempfile.TemporaryFile()
  proc,anchor=_lifecycle.gated_spawn(argv,cwd,env,out_stream,err_stream,run,SETTINGS['timeout_seconds'])
  # Keep anonymous streams open through cleanup so failure evidence can be hashed after stop.
  _lifecycle.wait_unreaped(proc,SETTINGS['timeout_seconds'])
  out_stream.flush();err_stream.flush();os.fsync(out_stream.fileno());os.fsync(err_stream.fileno())
  code,absence=_lifecycle.finish_group(proc,anchor)
  out_stream.seek(0);raw=out_stream.read()
  write(run/'process-exit.json',absence)
  result=json.loads(raw) if code==0 else None
  current=ledger(c,cfg,a['ledger_name']);after=snapshot();write(run/'after.json',after)
  changes={k for k in set(before)|set(after) if before.get(k)!=after.get(k)}
  if changes- {'.atlas/'+a['ledger_name']}:fail('unexpected-state-mutation')
  if authorization(case_id)[3]!=authhash:fail('authorization-drift-after-call')
  policycheck(c,cfg)
  labels=result.get('evaluation',{}) if isinstance(result,dict) else {}
  valid=code==0 and isinstance(result,dict) and result.get('kind')!='hold'
  valid=valid and labels.get('phase')=='evaluation' and labels.get('evaluationCandidate')==cfg['candidate_id'] and labels.get('generation')==cfg['generation'] and labels.get('manifest')==cfg['ownership']
  body=len(result.get('body','').encode()) if isinstance(result,dict) and isinstance(result.get('body',''),str) else 0
  expected=counts(live);expected[req['operation']+'_calls']+=1;expected['body_bytes_total']+=body
  valid=valid and current['exists'] and counts(current)==expected
  if not valid:fail('runtime-hold-or-capture-not-confirmed')
  # Only a fully validated response is copied from anonymous storage into the durable history.
  durable(run/'stdout.json',raw);durable(run/'stderr.txt',b'')
  # Persist the COMPLETE response BEFORE describing it as persisted. Delivery remains UNKNOWN.
  durable(run/'response.json',raw)
  if filebytes(run/'response.json')!=raw:fail('response-write-verification')
  capture={name:sha(filebytes(run/name)) for name in ['attempt.json','before.json','stdout.json','stderr.txt','after.json','response.json','process-start.json','process-release.json','process-exit.json']}
  receipt={'identity':identity(c,cfg),'sequence':seq+1,'previous_receipt_sha256':prevhash,'conclusion':'CAPTURE_COMMITTED','governed_result_validated_and_charged':True,'process_exit_confirmed':True,'exit_code':code,'pid':proc.pid,'process_identity':anchor,'operation':req['operation'],'arguments':req['args'],'raw_body_bytes':body,'body_bytes_charged':body,'envelope_bytes':len(raw),'ledger_before':live,'ledger_after':current,'capture_files':capture,'response':{'path':'response.json','bytes':len(raw),'sha256':sha(raw),'persisted':True},'consumer_delivery_ack':'UNKNOWN_PENDING_LITERAL_CONSUMER_CONFIRMATION','finished':now()}
  write(run/'receipt.json',receipt);durable(run/'receipt.sha256',(sha(filebytes(run/'receipt.json'))+'\n').encode())
  print(json.dumps({'case':case_id,'call':run.name,'response_file':str(run/'response.json'),'response_bytes':len(raw),'response_sha256':sha(raw),'ledger_after':current['value'],'consumer_delivery_ack':'UNKNOWN','ack_required_literal':f"I received the complete response for {case_id} call {run.name}: {len(raw)} bytes, SHA256 {sha(raw)}."}),flush=True)
  safe_release=True
 except BaseException as error:
  safe_release=False
  # Repeated catchable signals cannot interrupt conservative cleanup.
  for sig in (signal.SIGTERM,signal.SIGINT,signal.SIGHUP):signal.signal(sig,signal.SIG_IGN)
  outcome=failure_process_outcome(proc,anchor,run)
  if run is not None and not (run/'process-start.json').is_file():
   outcome={**outcome,'registration':'NOT_DURABLY_REGISTERED'}
  # Preserve safe forensic digests before removing any raw child-controlled payload.
  evidence=None
  try:evidence=preserve_failure_evidence(run,out_stream,err_stream,error,outcome)
  except BaseException:pass
  # No retry, refund, ledger mutation or lock release on any failure.
  try:write(lock/'STOP.json',{'case':case_id,'attempt':str(run) if run else None,'status':'UNKNOWN','diagnostic':safe_error_diagnostic(error),'process':outcome,'failure_evidence':str(run/'failure-evidence.json') if evidence else None,'recovery':'EXPLICIT_REVIEW_REQUIRED; no release, retry, ledger reset or automatic rollback'})
  except BaseException:pass
  raise
 finally:
  # Only a normal confirmed exit AND completed capture can release the shared lock.
  if safe_release and proc is not None and proc.poll() is not None:lock.rmdir()
  for stream in (out_stream,err_stream):
   if stream is not None:stream.close()
def entrypoint():
 try:main()
 except BaseException as error:
  # Suppress Python traceback/exception repr, which can disclose argv and envelopes.
  for sig in (signal.SIGTERM,signal.SIGINT,signal.SIGHUP):
   try:signal.signal(sig,signal.SIG_IGN)
   except (ValueError,OSError):pass
  sys.stderr.write(json.dumps({'status':'UNKNOWN','diagnostic':safe_error_diagnostic(error)},separators=(',',':'))+'\n')
  raise SystemExit(1)
if __name__=='__main__':entrypoint()
