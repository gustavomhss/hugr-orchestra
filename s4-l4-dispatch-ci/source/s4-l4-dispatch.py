"""Supervised S4 route over unchanged CI67 broker. Only fixed verified launcher calls run().
No sandbox or universal race-free claim. Operator files must remain immutable during calls.
"""
from pathlib import Path
import sys,os,json,hashlib,contextlib,io,re,types,copy,importlib.util,importlib.abc
H=lambda b:hashlib.sha256(b).hexdigest()
def require(ok,reason):
 if not ok:raise RuntimeError(reason)
def safe_path(value,missing=False):
 p=Path(value);require(p.is_absolute() and str(p)==value and '..' not in p.parts,'noncanonical-path')
 for q in reversed([p,*p.parents]):
  if q.exists() or q.is_symlink():require(not q.is_symlink(),'ancestor-symlink')
  else:require(missing,'missing-path')
 return p
def raw(value):
 p=safe_path(str(value));fd=os.open(p,os.O_RDONLY|os.O_NOFOLLOW)
 try:
  st=os.fstat(fd);require(st.st_nlink==1,'hardlink');b=b''
  while True:
   part=os.read(fd,65536)
   if not part:break
   b+=part
  after=os.fstat(fd);current=p.stat();require((st.st_dev,st.st_ino,st.st_size,st.st_mtime_ns)==(after.st_dev,after.st_ino,after.st_size,after.st_mtime_ns),'read-drift');require((st.st_dev,st.st_ino)==(current.st_dev,current.st_ino),'path-drift');safe_path(str(p));return b
 finally:os.close(fd)
def read(p):return json.loads(raw(p))
def syncdir(p):
 for q in [Path(p),*Path(p).parents]:
  safe_path(str(q));fd=os.open(q,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW)
  try:os.fsync(fd)
  finally:os.close(fd)
def directory(p,exclusive=False):
 safe_path(str(p),True);p.mkdir(parents=not exclusive,exist_ok=not exclusive);syncdir(p)
def write(p,value):
 safe_path(str(p),True);data=(json.dumps(value,ensure_ascii=False,indent=2)+'\n').encode()
 with p.open('xb') as f:f.write(data);f.flush();os.fsync(f.fileno())
 syncdir(p.parent);require(raw(p)==data,'write-readback')
def hexid(v):return type(v) is str and re.fullmatch(r'[0-9a-f]{64}',v) is not None
def validate_binding(config):
 require(config['state']=='RELEASED','not-released');b=config['binding'];require(type(b) is dict,'binding-missing')
 require(set(b)=={'consumer','scope','candidate','generation','manifest','entry','targets'},'binding-schema')
 require(b['consumer']=='S4-L4-prospective-session-v2-r2' and b['scope']==config['scope']=='atlas-continuity-rag-genesis','binding-scope-consumer')
 for k in ['candidate','generation','manifest']:require(hexid(b[k]),'binding-'+k)
 require(type(b['targets']) is list and len(b['targets'])==3,'three-targets-required')
 rows=[b['entry'],*b['targets']];needs=['entry','ownership','maintenance','operational']
 require([t.get('need') for t in rows]==needs,'binding-needs-order')
 for t,need in zip(rows,needs):
  require(set(t)=={'key','need','scope','manifest','artifact','result','receipt','body_bytes','body_sha256'},'tuple-schema')
  require(t['key']=='S4:L4:'+need and t['scope']==b['scope'] and t['manifest']==b['manifest'],'tuple-key-scope-manifest')
  for k in ['manifest','artifact','result','receipt','body_sha256']:require(hexid(t[k]),'tuple-digest-'+k)
  require(type(t['body_bytes']) is int and 0<t['body_bytes']<=(5000 if need=='entry' else 10000),'tuple-size')
 require(sum(t['body_bytes'] for t in rows)<=35000,'binding-total')
 for k in ['key','artifact','result','receipt','body_sha256']:require(len({t[k] for t in rows})==4,'tuple-not-unique-'+k)
 return b
def responsecheck(r,b,expected,kind):
 require(r.get('kind')==kind,'response-kind');ev=r.get('evaluation',{})
 require(ev.get('phase')=='evaluation' and ev.get('evaluationCandidate')==b['candidate'] and ev.get('generation')==b['generation'] and ev.get('manifest')==b['manifest'],'response-evaluation-identity')
 for k in ['manifest','artifact','result','receipt','key','scope','need']:require(r.get(k)==expected[k],'response-tuple-'+k)
 if kind=='ready':
  require(type(r.get('body')) is str,'body-missing');data=r['body'].encode();require(len(data)==expected['body_bytes'] and H(data)==expected['body_sha256'],'body-integrity-completeness')
def ackcheck(folder,case,sequence):
 data=raw(folder/'response.json');digest=H(data);a=read(folder/'consumer-ack.json')
 require(a=={'case':case,'sequence':sequence,'response_sha256':digest,'response_bytes':len(data),'literal_confirmation':f'I received the complete response for {case} call {sequence:04d}: {len(data)} bytes, SHA256 {digest}.','source':'literal-consumer-message'},'literal-ack-absent-or-mismatch')
def routecheck(req,config,folder):
 b=config['binding'];entry=b['entry'];targets=b['targets'];history=[]
 if folder.exists():
  for d in sorted(folder.iterdir()):
   require(d.is_dir() and re.fullmatch(r'[0-9]{4}',d.name),'history-name');q=read(d/'attempt.json')['request'];r=read(d/'response.json');ackcheck(d,b['consumer'],int(d.name));history.append((q,r))
 reads=[(q,r) for q,r in history if q['operation']=='read'];indexes=[(q,r) for q,r in history if q['operation']=='index']
 require(len(reads)<=4 and len(indexes)<=2,'route-counts');require(len({r['key'] for q,r in reads})==len(reads),'duplicate-body')
 for q,r in history:
  t=next((t for t in [entry,*targets] if t['key']==r.get('key')),None);require(t is not None,'unexpected-history-target');responsecheck(r,b,t,'ready' if q['operation']=='read' else 'index')
 if history:require(history[0][0]=={'operation':'index','args':{'need':'entry'}},'first-index')
 if reads:
  require(reads[0][0]=={'operation':'read','args':{'need':'entry','maxBytes':5000,'depth':'shallow'}},'first-entry')
  for t in targets:require(re.search(r'(?<![A-Za-z0-9:_-])'+re.escape(t['key'])+r'(?![A-Za-z0-9:_-])',reads[0][1]['body']) is not None,'target-not-discovered')
 for q,r in reads[1:]:require(q=={'operation':'read','args':{'key':r['key'],'maxBytes':10000,'depth':'deep'}},'deep-shape')
 if req=={'operation':'finalize','args':{}}:
  require(len(reads)==4 and {r['key'] for q,r in reads[1:]}=={t['key'] for t in targets},'final-four-bodies-and-ACKs-required');return None
 require(len(reads)<4,'session-complete-final-ACK-required')
 if not history:require(req=={'operation':'index','args':{'need':'entry'}},'initial-index-required');return entry
 if not reads:require(req=={'operation':'read','args':{'need':'entry','maxBytes':5000,'depth':'shallow'}},'entry-required');return entry
 if req.get('operation')=='index':
  require(len(indexes)<2 and set(req.get('args',{}))=={'need'},'second-index-shape');t=next((t for t in [entry,*targets] if t['need']==req['args']['need']),None);require(t is not None,'index-need');return t
 require(req.get('operation')=='read','operation-denied');t=next((t for t in targets if t['key']==req.get('args',{}).get('key')),None);require(t is not None,'target-allowlist')
 require(req=={'operation':'read','args':{'key':t['key'],'maxBytes':10000,'depth':'deep'}},'target-query');require(t['key'] not in {r['key'] for q,r in reads},'target-already-read');return t
class FrozenLoader(importlib.abc.Loader):
 def __init__(self,data,path):self.data=data;self.path=path
 def create_module(self,spec):return None
 def exec_module(self,module):module.__file__=self.path;exec(compile(self.data,self.path,'exec'),module.__dict__)
def import_central(authority,verified,central_bytes):
 path=authority['broker'];helper=authority['lifecycle'];original=importlib.util.spec_from_file_location
 def pinned(name,location,*args,**kwargs):
  require(str(location)==helper,'unexpected-import-path');return importlib.util.spec_from_loader(name,FrozenLoader(verified[helper],helper),origin=helper)
 module=types.ModuleType('pinned_central_broker');module.__file__=path
 try:
  importlib.util.spec_from_file_location=pinned;exec(compile(verified[path],path,'exec'),module.__dict__)
 finally:importlib.util.spec_from_file_location=original
 # Configure() must parse the EXACT bytes already hashed/read once, not reread a mutable config.
 original_read=module.read
 module.read=lambda p:json.loads(central_bytes) if str(p)==authority['central_config'] else original_read(p)
 module.SETTINGS_PATH=Path(authority['central_config']);return module

def run(config_bytes,authority,verified,request):
 """Only a frozen launcher supplies authority/config bytes/verified source bytes."""
 require(H(config_bytes)==authority['config_sha256'],'dispatcher-config-hash');config=json.loads(config_bytes);binding=validate_binding(config)
 require(config['central_config']==authority['central_config'],'central-path')
 require(set(authority['pins'])>=set([authority['dispatcher'],authority['broker'],authority['lifecycle']]),'mandatory-pins')
 for path,digest in authority['pins'].items():require(H(verified[path])==digest and raw(path)==verified[path],'verified-source-drift')
 central_bytes=raw(authority['central_config']);require(H(central_bytes)==config['central_config_sha256'],'central-config-hash');central=json.loads(central_bytes)
 for key in ['root','policy_directory','cases_file','authorization_file','logs','cwd']:safe_path(central[key],key=='logs')
 safe_path(config['dispatch_logs'],True);safe_path(authority['central_config']);require('ATLAS_RATIFY_TOKEN' not in os.environ,'ratify-forbidden')
 cases_bytes=raw(central['cases_file']);require(H(cases_bytes)==config['cases_sha256'],'fixed-cases-hash');cases=json.loads(cases_bytes);require(cases['candidate_id']==binding['candidate'] and cases['generation']==binding['generation'] and cases['ownership']==binding['manifest'] and cases['scope']==binding['scope'],'binding-central')
 c=next(c for c in cases['cases'] if c['id']==binding['consumer']);require(c['mode']=='deep' and c['limits']==c['native_limits']=={'index_calls':2,'read_calls':4,'body_bytes_total':35000},'exact-budget');require(c['per_read_max_bytes']==10000 and c['shallow_max_bytes']==5000 and 'shallow_entry_key' not in c,'exact-caps')
 auth_bytes=raw(central['authorization_file']);auth=json.loads(auth_bytes);require(auth['state']=='RELEASED' and auth['active_case']==binding['consumer'],'central-release');require(auth['config_sha256']==H(central_bytes) and auth['cases_sha256']==H(cases_bytes),'central-auth-hash')
 # Validate every fixed operator source/path BEFORE directory effects/import.
 for path in authority['pins']:safe_path(path)
 logs=Path(config['dispatch_logs']);safe_path(str(logs),True);require(not (logs/'FAIL_CLOSED.json').exists() and not (logs/'COMPLETE.json').exists(),'dispatch-closed')
 directory(logs);lock=logs/'active.lock';directory(lock,True);outcome='BEFORE_CENTRAL';delivery='NOT_EXPOSED';native_attempted=False
 try:
  for path in authority['pins']:require(raw(path)==verified[path],'source-changed-before-import')
  broker=import_central(authority,verified,central_bytes);case=binding['consumer'];folder=Path(central['logs'])/case;oldargv=sys.argv[:];sys.argv=[authority['broker'],authority['central_config'],case,json.dumps(request)]
  try:
   if request=={'operation':'finalize','args':{}}:
    # NO native/index/read invocation; final ACK is an explicit separate external action.
    broker.configure();a,cc,cfg,authhash=broker.authorization(case);require(authhash==H(auth_bytes),'finalize-authorization-before-lock-drift');admin=Path(central['logs'])/'active.lock';directory(admin,True)
    try:
     require(raw(central['cases_file'])==cases_bytes and raw(authority['central_config'])==central_bytes,'finalize-operator-bytes-drift')
     a,cc,cfg,lockedhash=broker.authorization(case);require(lockedhash==authhash==H(auth_bytes),'finalize-authorization-before-lock-drift')
     broker.policycheck(cc,cfg);live=broker.ledger(cc,cfg,a['ledger_name']);broker.history(folder,cc,cfg,live);routecheck(request,config,folder)
     require(raw(central['authorization_file'])==auth_bytes and raw(central['cases_file'])==cases_bytes and raw(authority['central_config'])==central_bytes,'finalize-operator-drift-before-complete')
     write(logs/'COMPLETE.json',{'all_four_body_ACKs_verified':True,'ledger':live,'native_calls_this_finalization':0});notice={'state':'COMPLETE','native_calls':0}
     admin.rmdir();syncdir(admin.parent)
    except BaseException:raise
   else:
    selected=[];original=broker.precheck_budget;original_history=broker.history
    history_state={'active':False,'reconciled':False,'historical_budget_checks':0,'historical_route_gates':0,'new_route_gates':0}
    def historical(*args,**kwargs):
     require(not history_state['active'] and not history_state['reconciled'],'history-context-reentry')
     history_state['active']=True
     try:
      result=original_history(*args,**kwargs)
      history_state['reconciled']=True
      return result
     finally:history_state['active']=False
    broker.history=historical
    def guarded(req,caseconfig,ledger,authorization):
     original(req,caseconfig,ledger,authorization)
     if history_state['active']:
      history_state['historical_budget_checks']+=1
      return # Historical budgets/ACKs/chain remain central-owned; no route gate.
     require(history_state['reconciled'] and not selected and req==request,'new-query-gate-context')
     require(raw(central['cases_file'])==cases_bytes and raw(authority['central_config'])==central_bytes,'operator-bytes-drift')
     for path in authority['pins']:require(raw(path)==verified[path],'source-changed-before-spawn')
     history_state['new_route_gates']+=1
     selected.append(routecheck(req,config,folder))
    broker.precheck_budget=guarded;capture=io.StringIO();native_attempted=True
    with contextlib.redirect_stdout(capture):broker.main()
    outcome='CENTRAL_CAPTURE_CHARGED';notice=json.loads(capture.getvalue());d=folder/notice['call'];data=raw(d/'response.json');require(len(selected)==1 and H(data)==notice['response_sha256'] and len(data)==notice['response_bytes'],'notice-integrity');responsecheck(json.loads(data),binding,selected[0],'ready' if request['operation']=='read' else 'index')
    write(logs/(notice['call']+'.validated.json'),{'response_sha256':H(data),'request':request,'identity_body_complete':True,'gate_context':history_state,'delivery':'UNKNOWN_PENDING_LITERAL_ACK'});outcome='VALIDATED'
  finally:sys.argv=oldargv
  # Emission is not delivery ACK. Any failure here or during cleanup is persisted fail-closed.
  print(json.dumps(notice),flush=True);delivery='NOTICE_EXPOSED_DELIVERY_UNKNOWN';outcome='FINALIZING'
  lock.rmdir();syncdir(logs);outcome='FINALIZED'
 except BaseException as error:
  record={'outcome':outcome,'delivery':delivery,'native_may_have_been_attempted':native_attempted,'error':str(error),'recovery':'EXPLICIT_REVIEW_REQUIRED_NO_RETRY_REFUND','sticky_lock_exists':lock.exists(),'durability':'UNCONFIRMED_UNTIL_THIS_WRITE_FSYNC_SUCCEEDS'}
  try:
   write(logs/'FAIL_CLOSED.json',record)
  except BaseException as persist_error:
   print(json.dumps({'state':'FINALIZATION_OR_PERSISTENCE_UNKNOWN','lock_exists':lock.exists(),'error':str(persist_error),'no_retry':True}),file=sys.stderr,flush=True)
  raise
