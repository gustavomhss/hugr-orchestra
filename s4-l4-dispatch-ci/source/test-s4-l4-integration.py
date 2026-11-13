"""CI-only exact central broker integration with disposable synthetic state. No Atlas corpus."""
from pathlib import Path
import sys,os,json,hashlib,tempfile,unittest,subprocess,time,signal,importlib.util,contextlib,io
from unittest import mock
HERE=Path(__file__).resolve().parent
CENTRAL=HERE.parent/'ci/central/modules/atlas/packages/adapter-io/script'
def module(name,path):
 spec=importlib.util.spec_from_file_location(name,path);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m
builder=module('builder',HERE/'build-launcher.py')
H=lambda b:hashlib.sha256(b).hexdigest()
def put(p,v):p.write_text(json.dumps(v)+'\n')
def get(p):return json.loads(p.read_bytes())
CHILD=r'''
from pathlib import Path
import sys,json,os,time
x=json.loads(sys.argv[1]);control=Path(x['runtime']['control']);v=json.loads((control/'data.json').read_bytes());mode=(control/'mode').read_text();(control/'spawns').write_text(str(int((control/'spawns').read_text())+1));(control/'started').write_text(str(os.getpid()))
if mode=='hang':time.sleep(60)
rq=x['request'];a=rq['args'];t=next(t for t in v['tuples'] if t['key']==a.get('key') or t['need']==a.get('need'));r={k:t[k] for k in ['key','need','scope','manifest','artifact','result','receipt']};r.update(kind='index' if rq['operation']=='index' else 'ready',evaluation={'phase':'evaluation','evaluationCandidate':x['candidate'],'generation':x['generation'],'manifest':v['manifest'],'evaluationPlan':'1'*64,'obligationSet':'2'*64})
r.update(title='Synthetic '+t['need'],layer='L4',navigation=[],dependencies=[],checked=[t['key']])
if rq['operation']=='read':r.update(body=v['bodies'][t['key']]+('CORRUPT' if mode=='badbody' else ''),historical=False,knowledge={'authority':'synthetic','validity':'synthetic','gaps':[],'evidence':[]})
if mode in ['wrongcandidate','wronggeneration','wrongmanifest']:r['evaluation'][{'wrongcandidate':'evaluationCandidate','wronggeneration':'generation','wrongmanifest':'manifest'}[mode]]='f'*64
if rq['operation']=='index':r.update(navigation=[],dependencies=[],sections=[],bodyBytes=len(v['bodies'][t['key']].encode()),bodiesReturned=False,bodyBytesVerified=True,checked=[t['key']])
p=Path(x['root'])/'.atlas'/x['ledgerName'];ledger=json.loads(p.read_bytes()) if p.exists() else {'schema':'evaluation-read-budget/v1','candidate':x['candidate'],'generation':x['generation'],'consumer':x['consumer'],'mode':x['mode'],'index_calls':0,'read_calls':0,'body_bytes_total':0};ledger[rq['operation']+'_calls']+=1;ledger['body_bytes_total']+=len(r.get('body','').encode());p.write_text(json.dumps(ledger)+'\n');print(json.dumps(r))
'''
class Integration(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.p=Path(self.tmp.name);self.root=self.p/'root';self.root.mkdir();self.atlas=self.root/'.atlas';self.atlas.mkdir();self.control=self.p/'control';self.control.mkdir();(self.control/'mode').write_text('normal');(self.control/'spawns').write_text('0');self.processes=[]
  self.id='S4-L4-prospective-session-v2-r2';self.scope='atlas-continuity-rag-genesis';self.cid='c'*64;self.gen='e'*64;self.man='d'*64;self.ledger='evaluation-budget-'+'a'*64+'.json';self.logs=self.p/'central-logs';self.outer=self.p/'dispatch-logs';self.auth=self.p/'auth.json';self.casefile=self.p/'cases.json';self.cc=self.p/'central.json';self.dc=self.p/'dispatcher.json';self.launch=self.p/'launch.py';self.child=self.p/'reader.py';self.child.write_text(CHILD)
  needs=['entry','ownership','maintenance','operational'];bodies={'S4:L4:'+n:(' '.join('S4:L4:'+x for x in needs[1:]) if n=='entry' else 'synthetic '+n) for n in needs}
  self.tuples=[{'key':'S4:L4:'+n,'need':n,'scope':self.scope,'manifest':self.man,'artifact':H(('a'+n).encode()),'result':H(('r'+n).encode()),'receipt':H(('p'+n).encode()),'body_bytes':len(bodies['S4:L4:'+n].encode()),'body_sha256':H(bodies['S4:L4:'+n].encode())} for n in needs]
  put(self.control/'data.json',{'tuples':self.tuples,'bodies':bodies,'manifest':self.man});self.binding={'consumer':self.id,'scope':self.scope,'candidate':self.cid,'generation':self.gen,'manifest':self.man,'entry':self.tuples[0],'targets':self.tuples[1:]}
  self.policies=self.p/'policies';self.policies.mkdir();policy={'operations':['index','read'],'consumer':{'id':self.id,'mode':'deep'}};put(self.policies/'policy.json',policy);put(self.atlas/'evaluation-policy.json',policy);st=self.root.stat();put(self.atlas/'evaluation-store.json',{'device':st.st_dev,'inode':st.st_ino,'evaluationCandidate':self.cid,'generation':self.gen})
  limits={'index_calls':2,'read_calls':4,'body_bytes_total':35000};put(self.casefile,{'candidate_id':self.cid,'generation':self.gen,'ownership':self.man,'actor':'synthetic-actor','scope':self.scope,'cases':[{'id':self.id,'mode':'deep','limits':limits,'native_limits':limits,'per_read_max_bytes':10000,'shallow_max_bytes':5000,'policy_proposal':'policy.json','policy_sha256':H((self.atlas/'evaluation-policy.json').read_bytes())}]})
  self.broker=str(CENTRAL/'evaluation-reader-broker.py');self.helper=str(CENTRAL/'evaluation-reader-lifecycle.py');self.bridge=str(CENTRAL/'evaluation-reader-call.mjs')
  put(self.cc,{'root':str(self.root),'policy_directory':str(self.policies),'cases_file':str(self.casefile),'authorization_file':str(self.auth),'logs':str(self.logs),'reader_argv':[sys.executable,'-I','-S','-B',str(self.child)],'cwd':str(self.p),'driver_files':{'broker':self.broker,'lifecycle':self.helper,'reader':str(self.child),'bridge':self.bridge},'runtime':{'control':str(self.control)},'timeout_seconds':1})
  put(self.dc,{'state':'RELEASED','scope':self.scope,'binding':self.binding,'central_config':str(self.cc),'central_config_sha256':H(self.cc.read_bytes()),'cases_sha256':H(self.casefile.read_bytes()),'dispatch_logs':str(self.outer)})
  self.authorize('shallow');self.freeze()
 def authorize(self,depth):put(self.auth,{'state':'RELEASED','config_sha256':H(self.cc.read_bytes()),'cases_sha256':H(self.casefile.read_bytes()),'active_case':self.id,'ledger_name':self.ledger,'read_depth':depth,'driver_sha256':{k:H(Path(p).read_bytes()) for k,p in get(self.cc)['driver_files'].items()}})
 def freeze(self):
  dispatcher=str(HERE/'s4-l4-dispatch.py');pins={p:H(Path(p).read_bytes()) for p in [dispatcher,self.broker,self.helper,self.bridge,str(self.child)]};engine=str(Path(sys.executable).resolve());self.authority={'config':str(self.dc),'config_sha256':H(self.dc.read_bytes()),'central_config':str(self.cc),'dispatcher':dispatcher,'broker':self.broker,'lifecycle':self.helper,'pins':pins,'engine':{'path':engine,'sha256':H(Path('/proc/self/exe').read_bytes())}};self.launch.write_text(builder.render(self.authority))
 def tearDown(self):
  for p in self.processes:
   if p.poll() is None:p.kill();p.wait(timeout=5)
  f=self.control/'started'
  if f.exists():
   try:os.kill(int(f.read_text()),signal.SIGKILL)
   except ProcessLookupError:pass
  self.tmp.cleanup()
 def index(self,need='entry'):return {'operation':'index','args':{'need':need}}
 def entry(self):return {'operation':'read','args':{'need':'entry','maxBytes':5000,'depth':'shallow'}}
 def target(self,n):return {'operation':'read','args':{'key':self.tuples[n]['key'],'maxBytes':10000,'depth':'deep'}}
 def call(self,q,flags=True):return subprocess.run([sys.executable,*(['-I','-S','-B'] if flags else []),str(self.launch)],input=json.dumps(q),capture_output=True,text=True,timeout=15)
 def count(self):return int((self.control/'spawns').read_text())
 def ack(self,n):
  folder=self.logs/self.id/f'{n:04d}';data=(folder/'response.json').read_bytes();digest=H(data);put(folder/'consumer-ack.json',{'case':self.id,'sequence':n,'response_sha256':digest,'response_bytes':len(data),'literal_confirmation':f'I received the complete response for {self.id} call {n:04d}: {len(data)} bytes, SHA256 {digest}.','source':'literal-consumer-message'})
 def ok(self,q,n,ack=True):
  p=self.call(q);self.assertEqual(p.returncode,0,p.stderr)
  record=get(self.outer/f'{n:04d}.validated.json')['gate_context'];self.assertEqual(record['historical_budget_checks'],n-1);self.assertEqual(record['historical_route_gates'],0);self.assertEqual(record['new_route_gates'],1);self.assertTrue(record['reconciled']);self.assertFalse(record['active'])
  if ack:self.ack(n)
 def denied(self,q,diagnostic,count):
  p=self.call(q);self.assertNotEqual(p.returncode,0);self.assertIn(diagnostic,p.stderr);self.assertEqual(self.count(),count);self.assertFalse((self.outer/'COMPLETE.json').exists());return p
 def prefix(self):self.ok(self.index(),1);self.ok(self.entry(),2);self.authorize('deep')
 def test_positive_full_real_broker_chain_final_ack(self):
  self.prefix()
  for n in range(1,4):self.ok(self.target(n),n+2)
  p=self.call({'operation':'finalize','args':{}});self.assertEqual(p.returncode,0,p.stderr);self.assertEqual(self.count(),5);ledger=get(self.atlas/self.ledger);self.assertEqual((ledger['index_calls'],ledger['read_calls']),(1,4));self.assertEqual(ledger['body_bytes_total'],sum(t['body_bytes'] for t in self.tuples));self.assertTrue(get(self.outer/'COMPLETE.json')['all_four_body_ACKs_verified'])
 def test_invalid_binding_zero_spawn(self):
  cfg=get(self.dc);cfg['binding']['targets'][0]['need']='wrong';put(self.dc,cfg);self.freeze();self.denied(self.index(),'binding-needs-order',0);self.assertFalse(self.logs.exists())
 def test_config_drift_zero_spawn(self):
  cfg=get(self.dc);cfg['binding']['candidate']='f'*64;put(self.dc,cfg);self.denied(self.index(),'fixed-config-hash',0)
 def test_central_bytes_hash_same_read(self):
  cfg=get(self.cc);cfg['timeout_seconds']=2;put(self.cc,cfg);self.denied(self.index(),'central-config-hash',0)
 def test_bootstrap_zero_spawn(self):
  p=self.call(self.index(),False);self.assertNotEqual(p.returncode,0);self.assertIn('bootstrap-flags',p.stderr);self.assertEqual(self.count(),0);self.assertFalse(self.outer.exists())
 def test_source_pin_zero_spawn(self):
  self.authority['pins'][self.broker]='0'*64;self.launch.write_text(builder.render(self.authority));self.denied(self.index(),'source-hash',0)
 def test_ancestor_symlink_zero_spawn(self):
  alias=self.p/'alias';alias.symlink_to(self.root,target_is_directory=True);cfg=get(self.cc);cfg['root']=str(alias);put(self.cc,cfg);d=get(self.dc);d['central_config_sha256']=H(self.cc.read_bytes());put(self.dc,d);self.authorize('shallow');self.freeze();self.denied(self.index(),'ancestor-symlink',0)
 def test_namespace_marker_zero_spawn(self):
  m=get(self.atlas/'evaluation-store.json');m['inode']+=1;put(self.atlas/'evaluation-store.json',m);self.denied(self.index(),'marker-drift',0)
 def test_initial_deep_zero_spawn(self):self.authorize('deep');self.denied(self.target(1),'initial-index-required',0)
 def test_missing_ack_zero_additional_spawn(self):
  self.ok(self.index(),1,False);self.denied(self.entry(),'history-incomplete-or-extra',1)
 def test_late_charged_invalid_body_no_notice(self):
  self.ok(self.index(),1);(self.control/'mode').write_text('badbody');p=self.call(self.entry());self.assertNotEqual(p.returncode,0);self.assertIn('body-integrity-completeness',p.stderr);self.assertEqual(p.stdout,'');self.assertEqual(get(self.atlas/self.ledger)['read_calls'],1);self.assertTrue((self.outer/'FAIL_CLOSED.json').exists())
 def test_final_fourth_ack_required_no_new_spawn(self):
  self.prefix()
  for n in range(1,4):self.ok(self.target(n),n+2,n!=3)
  self.denied({'operation':'finalize','args':{}},'history-incomplete-or-extra',5)
 def test_partial_delivery_ack_rejected(self):
  self.ok(self.index(),1);p=self.logs/self.id/'0001/consumer-ack.json';a=get(p);a['response_bytes']-=1;put(p,a);self.denied(self.entry(),'consumer-delivery-unconfirmed',1)
 def test_duplicate_target_zero_additional_spawn(self):
  self.prefix();self.ok(self.target(1),3);self.denied(self.target(1),'target-already-read',3)
 def test_second_index_then_third_rejected(self):
  self.prefix();self.ok(self.index('ownership'),3);self.denied(self.index('maintenance'),'broker-call-budget-exhausted',3)
 def test_concurrency_outer_lock_no_second_spawn(self):
  (self.control/'mode').write_text('hang');p=subprocess.Popen([sys.executable,'-I','-S','-B',str(self.launch)],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True);self.processes.append(p);p.stdin.write(json.dumps(self.index()));p.stdin.close();p.stdin=None
  end=time.monotonic()+3
  while not (self.control/'started').exists() and time.monotonic()<end:time.sleep(.01)
  self.assertTrue((self.control/'started').exists());q=self.call(self.index());self.assertNotEqual(q.returncode,0);self.assertIn('FileExistsError',q.stderr);p.communicate(timeout=12);self.assertEqual(self.count(),1)
 def test_interruption_during_central_sticky(self):
  (self.control/'mode').write_text('hang');p=subprocess.Popen([sys.executable,'-I','-S','-B',str(self.launch)],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True);self.processes.append(p);p.stdin.write(json.dumps(self.index()));p.stdin.close();p.stdin=None
  end=time.monotonic()+3
  while not (self.control/'started').exists() and time.monotonic()<end:time.sleep(.01)
  self.assertTrue((self.control/'started').exists());p.send_signal(signal.SIGTERM);p.communicate(timeout=12);self.assertNotEqual(p.returncode,0);self.assertIn('signal:15',get(self.outer/'FAIL_CLOSED.json')['error']);self.assertTrue((self.outer/'FAIL_CLOSED.json').exists());self.assertEqual(self.count(),1)
 def test_discovery_missing_key_no_target_spawn(self):
  data=get(self.control/'data.json');data['bodies']['S4:L4:entry']='S4:L4:ownership S4:L4:maintenance';t=data['tuples'][0];t['body_bytes']=len(data['bodies'][t['key']].encode());t['body_sha256']=H(data['bodies'][t['key']].encode());put(self.control/'data.json',data);cfg=get(self.dc);cfg['binding']['entry']=t;put(self.dc,cfg);self.freeze();self.prefix();self.denied(self.target(1),'target-not-discovered',2)
 def key_boundary(self,prefix):
  data=get(self.control/'data.json');key='S4:L4:operational';data['bodies']['S4:L4:entry']=data['bodies']['S4:L4:entry'].replace(key,('X'+key if prefix else key+'X'));t=data['tuples'][0];t['body_bytes']=len(data['bodies'][t['key']].encode());t['body_sha256']=H(data['bodies'][t['key']].encode());put(self.control/'data.json',data);cfg=get(self.dc);cfg['binding']['entry']=t;put(self.dc,cfg);self.freeze();self.prefix();self.denied(self.target(1),'target-not-discovered',2)
 def test_discovery_prefix_key_rejected(self):self.key_boundary(True)
 def test_discovery_suffix_key_rejected(self):self.key_boundary(False)
 def test_section_query_rejected(self):
  self.prefix();q=self.target(1);q['args']['section']='synthetic';self.denied(q,'target-query',2)
 def test_need_plus_key_rejected(self):
  self.prefix();q=self.target(1);q['args']['need']='ownership';self.denied(q,'read-selection',2)
 def test_extra_field_rejected(self):
  self.prefix();q=self.target(1);q['args']['extra']='synthetic';self.denied(q,'read-selection',2)
 def wrong_response_identity(self,field):
  self.ok(self.index(),1);(self.control/'mode').write_text('wrong'+field);p=self.denied(self.entry(),'runtime-hold-or-capture-not-confirmed',2);self.assertEqual(p.stdout,'');self.assertEqual(get(self.atlas/self.ledger)['read_calls'],1);self.assertTrue((self.outer/'FAIL_CLOSED.json').exists())
 def test_response_candidate_only_mismatch(self):self.wrong_response_identity('candidate')
 def test_response_generation_only_mismatch(self):self.wrong_response_identity('generation')
 def test_response_manifest_only_mismatch(self):self.wrong_response_identity('manifest')
 def finalize_drift(self,what):
  self.prefix()
  for n in range(1,4):self.ok(self.target(n),n+2)
  route=module('finalize_drift_'+what,HERE/'s4-l4-dispatch.py');verified={p:Path(p).read_bytes() for p in self.authority['pins']};original=route.directory
  def acquire(path,exclusive=False):
   result=original(path,exclusive)
   if path==self.logs/'active.lock':
    target={'auth':self.auth,'cases':self.casefile,'config':self.cc}[what];v=get(target);v['synthetic_changed_after_authorization']=True;put(target,v)
   return result
  diagnostic='finalize-authorization-before-lock-drift' if what=='auth' else 'finalize-operator-bytes-drift'
  with mock.patch.object(route,'directory',side_effect=acquire):
   with self.assertRaisesRegex(RuntimeError,diagnostic):route.run(self.dc.read_bytes(),self.authority,verified,{'operation':'finalize','args':{}})
  self.assertEqual(self.count(),5);self.assertFalse((self.outer/'COMPLETE.json').exists());self.assertIn(diagnostic,get(self.outer/'FAIL_CLOSED.json')['error']);self.assertTrue((self.logs/'active.lock').exists())
 def test_finalize_auth_changed_after_read_before_lock(self):self.finalize_drift('auth')
 def test_finalize_cases_changed_after_read_before_lock(self):self.finalize_drift('cases')
 def test_finalize_config_changed_after_read_before_lock(self):self.finalize_drift('config')
 def invoke_fault(self,stage):
  route=module('fault_route_'+stage,HERE/'s4-l4-dispatch.py');verified={p:Path(p).read_bytes() for p in self.authority['pins']};originalwrite=route.write;originalsync=route.syncdir;originalrmdir=Path.rmdir;captured=io.StringIO();errors=io.StringIO()
  def write(path,value):
   if stage=='validated' and str(path).endswith('.validated.json'):raise OSError('injected-validated-write')
   return originalwrite(path,value)
  def rmdir(path):
   if stage=='cleanup-rmdir' and path==self.outer/'active.lock':raise OSError('injected-rmdir')
   return originalrmdir(path)
  def sync(path):
   if stage=='cleanup-fsync' and Path(path)==self.outer and (self.outer/'0001.validated.json').exists() and not (self.outer/'active.lock').exists():raise OSError('injected-post-remove-fsync')
   return originalsync(path)
  with contextlib.ExitStack() as stack:
   stack.enter_context(contextlib.redirect_stdout(captured));stack.enter_context(contextlib.redirect_stderr(errors));stack.enter_context(mock.patch.object(route,'write',side_effect=write));stack.enter_context(mock.patch.object(route,'syncdir',side_effect=sync));stack.enter_context(mock.patch.object(Path,'rmdir',side_effect=rmdir,autospec=True))
   if stage=='before-central':stack.enter_context(mock.patch.object(route,'import_central',side_effect=KeyboardInterrupt('injected-before-central')))
   if stage=='after-central':stack.enter_context(mock.patch.object(route,'responsecheck',side_effect=KeyboardInterrupt('injected-after-central')))
   if stage=='delivery':stack.enter_context(mock.patch.object(route,'print',side_effect=BrokenPipeError('injected-partial-delivery'),create=True))
   with self.assertRaises(BaseException):route.run(self.dc.read_bytes(),self.authority,verified,self.index())
  self.assertTrue((self.outer/'FAIL_CLOSED.json').exists());self.assertEqual(self.count(),0 if stage=='before-central' else 1)
  if stage in ['before-central','after-central','validated','delivery']:self.assertEqual(captured.getvalue(),'')
  if stage=='cleanup-fsync':self.assertFalse((self.outer/'active.lock').exists());self.assertIn('PERSISTENCE_UNKNOWN',errors.getvalue())
  # No replay/refund: a second launcher call refuses before any extra native spawn.
  n=self.count();self.denied(self.index(),'dispatch-closed',n)
 def test_fault_before_central_zero_spawn(self):self.invoke_fault('before-central')
 def test_fault_after_central_charged_no_delivery(self):self.invoke_fault('after-central')
 def test_fault_validated_persistence(self):self.invoke_fault('validated')
 def test_fault_partial_notice_delivery(self):self.invoke_fault('delivery')
 def test_fault_cleanup_rmdir_sticky(self):self.invoke_fault('cleanup-rmdir')
 def test_fault_cleanup_fsync_no_false_sticky_claim(self):self.invoke_fault('cleanup-fsync')
if __name__=='__main__':unittest.main(verbosity=2)
