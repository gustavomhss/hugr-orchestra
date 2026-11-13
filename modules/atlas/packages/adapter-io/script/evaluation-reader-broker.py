"""Generic isolated-reader broker. Configuration and release are external trusted operator inputs.
Only explicit reviewed recovery may remove a sticky lock/STOP after uncertainty.
"""
from pathlib import Path
import sys,json,os,hashlib,subprocess,datetime,signal,re
# Operator supplies immutable configuration; consumer-facing launcher fixes this path.
SETTINGS_PATH=Path(sys.argv[1]).resolve() if len(sys.argv)>1 else Path('/nonexistent-config')
SETTINGS=None
ROOT=PLAN=CASEFILE=AUTH=LOGS=None
NEEDS={'entry','ownership','maintenance','operational','flow','evidence','component'}
COUNTS=['index_calls','read_calls','body_bytes_total']
sha=lambda b:hashlib.sha256(b).hexdigest()
now=lambda:datetime.datetime.now(datetime.timezone.utc).isoformat()
def fail(s):raise RuntimeError(s)
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
def validate_request(req,c):
 if not isinstance(req,dict) or set(req)!={'operation','args'} or not isinstance(req['args'],dict):fail('request-schema')
 a=req['args']
 if req['operation']=='index':
  if set(a)!={'need'} or a['need'] not in NEEDS:fail('index-args')
 elif req['operation']=='read':
  if not set(a)<={'need','key','section','maxBytes'} or ('need'in a)==('key'in a):fail('read-selection')
  if 'need'in a and a['need'] not in NEEDS:fail('read-need')
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
  if {p.name for p in d.iterdir()}!={'attempt.json','before.json','stdout.json','stderr.txt','after.json','response.json','receipt.json','receipt.sha256','consumer-ack.json'}:fail('history-incomplete-or-extra')
  rb=filebytes(d/'receipt.json');receipt=json.loads(rb)
  if filebytes(d/'receipt.sha256').decode().strip()!=sha(rb):fail('receipt-hash')
  if receipt['identity']!=identity(c,cfg) or receipt['sequence']!=number or receipt['previous_receipt_sha256']!=previous_hash:fail('history-identity-chain')
  if receipt['conclusion']!='CAPTURE_COMMITTED' or not receipt['governed_result_validated_and_charged'] or receipt['exit_code']!=0 or not receipt['process_exit_confirmed']:fail('history-not-confirmed')
  for name,expected in receipt['capture_files'].items():
   if name not in ['attempt.json','before.json','stdout.json','stderr.txt','after.json','response.json'] or sha(filebytes(d/name))!=expected:fail('capture-integrity')
  if set(receipt['capture_files'])!={'attempt.json','before.json','stdout.json','stderr.txt','after.json','response.json'}:fail('capture-coverage')
  attempt=read(d/'attempt.json')
  if attempt['identity']!=identity(c,cfg) or attempt['sequence']!=number or attempt['ledger_before']!=previous_after:fail('attempt-chain')
  if receipt['ledger_before']!=previous_after:fail('ledger-history-gap')
  validate_request(attempt['request'],c)
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
 LOGS.mkdir(parents=True,exist_ok=True);lock=LOGS/'active.lock';lock.mkdir() # sticky if any uncertainty
 safe_release=False;run=None;proc=None
 signal.signal(signal.SIGTERM,interrupted);signal.signal(signal.SIGHUP,interrupted)
 try:
  # Authorization MUST be reread after acquiring the global lock.
  a,c,cfg,lockedhash=authorization(case_id)
  if lockedhash!=authhash:fail('authorization-changed-before-lock')
  validate_request(req,c);policycheck(c,cfg)
  case_logs=LOGS/case_id;case_logs.mkdir(exist_ok=True)
  if case_logs.is_symlink():fail('case-history-alias')
  live=ledger(c,cfg,a['ledger_name']);seq,prevhash=history(case_logs,c,cfg,live)
  run=case_logs/f'{seq+1:04d}';run.mkdir(exist_ok=False)
  before=snapshot();write(run/'before.json',before)
  envelope={'request':req,'candidate':cfg['candidate_id'],'generation':cfg['generation'],'consumer':case_id,'mode':c['mode'],'ledgerName':a['ledger_name'],'root':str(ROOT),'actor':cfg['actor'],'scope':cfg['scope'],'runtime':SETTINGS['runtime']}
  argv=SETTINGS['reader_argv']+[json.dumps(envelope,separators=(',',':'))]
  cwd=Path(SETTINGS['cwd'])
  env=os.environ.copy();env.pop('ATLAS_RATIFY_TOKEN',None);env.pop('NODE_OPTIONS',None);env.pop('BUN_OPTIONS',None);env['ATLAS_ACTOR']=cfg['actor']
  write(run/'attempt.json',{'identity':identity(c,cfg),'sequence':seq+1,'ledger_before':live,'authorization_sha256':authhash,'policy_sha256':c['policy_sha256'],'argv':argv,'cwd':str(cwd),'request':req,'started':now()})
  if authorization(case_id)[3]!=authhash:fail('authorization-drift-before-spawn')
  policycheck(c,cfg)
  with (run/'stdout.json').open('xb') as out,(run/'stderr.txt').open('xb') as err:
   proc=subprocess.Popen(argv,cwd=cwd,env=env,stdout=out,stderr=err,start_new_session=True)
   # On timeout/interruption the BaseException path kills and reaps the process group, but still retains sticky lock.
   code=proc.wait(timeout=SETTINGS['timeout_seconds'])
   out.flush();err.flush();os.fsync(out.fileno());os.fsync(err.fileno())
  try:os.killpg(proc.pid,0)
  except ProcessLookupError:pass
  else:fail('process-group-still-alive-after-leader-exit')
  raw=filebytes(run/'stdout.json');result=json.loads(raw) if code==0 else None
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
  # Persist the COMPLETE response BEFORE describing it as persisted. Delivery remains UNKNOWN.
  durable(run/'response.json',raw)
  if filebytes(run/'response.json')!=raw:fail('response-write-verification')
  capture={name:sha(filebytes(run/name)) for name in ['attempt.json','before.json','stdout.json','stderr.txt','after.json','response.json']}
  receipt={'identity':identity(c,cfg),'sequence':seq+1,'previous_receipt_sha256':prevhash,'conclusion':'CAPTURE_COMMITTED','governed_result_validated_and_charged':True,'process_exit_confirmed':True,'exit_code':code,'pid':proc.pid,'operation':req['operation'],'arguments':req['args'],'raw_body_bytes':body,'body_bytes_charged':body,'envelope_bytes':len(raw),'ledger_before':live,'ledger_after':current,'capture_files':capture,'response':{'path':'response.json','bytes':len(raw),'sha256':sha(raw),'persisted':True},'consumer_delivery_ack':'UNKNOWN_PENDING_LITERAL_CONSUMER_CONFIRMATION','finished':now()}
  write(run/'receipt.json',receipt);durable(run/'receipt.sha256',(sha(filebytes(run/'receipt.json'))+'\n').encode())
  print(json.dumps({'case':case_id,'call':run.name,'response_file':str(run/'response.json'),'response_bytes':len(raw),'response_sha256':sha(raw),'ledger_after':current['value'],'consumer_delivery_ack':'UNKNOWN','ack_required_literal':f"I received the complete response for {case_id} call {run.name}: {len(raw)} bytes, SHA256 {sha(raw)}."}),flush=True)
  safe_release=True
 except BaseException as error:
  safe_release=False
  # SIGKILL leaves lock on disk; next invocation refuses. Catchable interrupts explicitly stop/reap the group.
  outcome='not-started'
  if proc is not None:
   try:
    os.killpg(proc.pid,signal.SIGKILL)
   except ProcessLookupError:pass
   except BaseException:pass
   try:proc.wait(timeout=10);outcome='leader-exit-confirmed-group-kill-requested'
   except BaseException:outcome='possibly-alive-or-unreaped'
  try:write(lock/'STOP.json',{'case':case_id,'attempt':str(run) if run else None,'error':str(error),'process':outcome,'recovery':'EXPLICIT_REVIEW_REQUIRED; no release, retry, ledger reset or automatic rollback'})
  except BaseException:pass
  raise
 finally:
  # Only a normal confirmed exit AND completed capture can release the shared lock.
  if safe_release and proc is not None and proc.poll() is not None:lock.rmdir()
if __name__=='__main__':main()
