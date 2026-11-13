"""CI-only tests of the SAME generic broker used by the private launcher.
Synthetic subprocesses and disposable roots only; no Atlas reader, model, network or real quota.
"""
from pathlib import Path
import unittest,tempfile,subprocess,sys,json,hashlib,os,signal,time,importlib.util
from unittest import mock
BROKER=Path(__file__).resolve().parents[1]/'script/evaluation-reader-broker.py'
LIFECYCLE=BROKER.with_name('evaluation-reader-lifecycle.py')
spec=importlib.util.spec_from_file_location('tested_lifecycle',LIFECYCLE)
lifecycle=importlib.util.module_from_spec(spec);spec.loader.exec_module(lifecycle)
sha=lambda b:hashlib.sha256(b).hexdigest()
def put(p,v):p.write_text(json.dumps(v,ensure_ascii=False)+'\n')
def get(p):return json.loads(p.read_text())
CHILD=r'''
import json,sys,os,time,subprocess
from pathlib import Path
e=json.loads(sys.argv[1]);control=Path(e['runtime']['control']);mode=(control/'mode').read_text()
p=control/'spawns';p.write_text(str(int(p.read_text())+1));(control/'started').write_text(str(os.getpid()))
assert 'ATLAS_RATIFY_TOKEN' not in os.environ
assert os.environ['ATLAS_ACTOR']==e['actor']
if mode=='hang':time.sleep(60)
if mode=='renamed-orphan':
 q=subprocess.Popen([sys.executable,'-c',"import ctypes,time;ctypes.CDLL(None).prctl(15,b'innocent-name',0,0,0);time.sleep(60)"]);(control/'descendant').write_text(str(q.pid));sys.exit(0)
if mode=='orphan':
 q=subprocess.Popen([sys.executable,'-c','import time;time.sleep(60)']);(control/'descendant').write_text(str(q.pid));sys.exit(0)
if mode=='barrier':
 while not (control/'continue').exists():time.sleep(.01)
root=Path(e['root']);path=root/'.atlas'/e['ledgerName']
v=json.loads(path.read_text()) if path.exists() else dict(schema='evaluation-read-budget/v1',candidate=e['candidate'],generation=e['generation'],consumer=e['consumer'],mode=e['mode'],index_calls=0,read_calls=0,body_bytes_total=0)
v[e['request']['operation']+'_calls']+=1
body=('x' if mode=='tiny' else 'síntese') if e['request']['operation']=='read' else None
if body is not None:v['body_bytes_total']+=len(body.encode())
path.write_text(json.dumps(v)+'\n')
if mode=='other-change':(root/'.atlas'/('evaluation-budget-'+'b'*64+'.json')).write_text('{}')
if mode=='other-delete':(root/'.atlas'/('evaluation-budget-'+'b'*64+'.json')).unlink()
if mode=='partial':(root/'.atlas'/(e['ledgerName']+'.next')).write_text('{}')
r={'kind':'read' if body else 'index','evaluation':{'phase':'evaluation','evaluationCandidate':e['candidate'],'generation':e['generation'],'manifest':'d'*64}}
if body:r['body']=body
else:r.update(bodyBytes=9999,bodiesReturned=False)
if mode=='hold':r={'kind':'hold','reason':'synthetic-refusal'}
print(json.dumps(r,ensure_ascii=False))
'''
class BrokerCI(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.base=Path(self.tmp.name);self.root=self.base/'root';self.root.mkdir();self.atlas=self.root/'.atlas';self.atlas.mkdir();self.logs=self.base/'logs';self.control=self.base/'control';self.control.mkdir();(self.control/'mode').write_text('normal');(self.control/'spawns').write_text('0');self.processes=[]
  self.child=self.base/'fixture-reader.py';self.child.write_text(CHILD);self.name='evaluation-budget-'+'a'*64+'.json';self.case='fixture-case';self.cfgid={'candidate_id':'c'*64,'generation':'e'*64,'ownership':'d'*64,'actor':'fixture-actor','scope':'fixture-scope'}
  policy={'operations':['read','index'],'consumer':{'id':self.case,'mode':'routine'},'fixture':True};put(self.atlas/'evaluation-policy.json',policy);self.policies=self.base/'policies';self.policies.mkdir();put(self.policies/'policy.json',policy);st=self.root.stat();put(self.atlas/'evaluation-store.json',{'device':st.st_dev,'inode':st.st_ino,'evaluationCandidate':self.cfgid['candidate_id'],'generation':self.cfgid['generation']})
  self.casefile=self.base/'cases.json';put(self.casefile,{**self.cfgid,'cases':[{'id':self.case,'mode':'routine','limits':{'index_calls':2,'read_calls':2,'body_bytes_total':16000},'policy_sha256':sha((self.atlas/'evaluation-policy.json').read_bytes()),'policy_proposal':'policy.json'}]});self.auth=self.base/'auth.json';self.config=self.base/'config.json'
  put(self.config,{'root':str(self.root),'policy_directory':str(self.policies),'cases_file':str(self.casefile),'authorization_file':str(self.auth),'logs':str(self.logs),'reader_argv':[sys.executable,str(self.child)],'cwd':str(self.base),'driver_files':{'broker':str(BROKER),'reader':str(self.child),'lifecycle':str(LIFECYCLE)},'runtime':{'control':str(self.control)},'timeout_seconds':2})
  self.authorize()
 def authorize(self):put(self.auth,{'state':'RELEASED','config_sha256':sha(self.config.read_bytes()),'cases_sha256':sha(self.casefile.read_bytes()),'active_case':self.case,'ledger_name':self.name,'driver_sha256':{'broker':sha(BROKER.read_bytes()),'reader':sha(self.child.read_bytes()),'lifecycle':sha(LIFECYCLE.read_bytes())}})
 def tearDown(self):
  for p in self.processes:
   if p.poll() is None:p.kill();p.wait(timeout=5)
  # Fixture-only cleanup, not a broker reset/recovery path.
  for name in ['started','descendant']:
   f=self.control/name
   if f.exists():
    try:os.kill(int(f.read_text()),signal.SIGKILL)
    except ProcessLookupError:pass
  self.tmp.cleanup()
 def command(self,operation='index'):
  args={'need':'entry'} if operation=='index' else {'key':'synthetic','maxBytes':100}
  return [sys.executable,str(BROKER),str(self.config),self.case,json.dumps({'operation':operation,'args':args})]
 def call(self,operation='index'):return subprocess.run(self.command(operation),capture_output=True,text=True,timeout=12)
 def path(self,n=1):return self.logs/self.case/f'{n:04d}'
 def count(self):return int((self.control/'spawns').read_text())
 def ack(self,n=1,wrong=False):
  response=(self.path(n)/'response.json').read_bytes();digest=sha(response);literal=f'I received the complete response for {self.case} call {n:04d}: {len(response)} bytes, SHA256 {digest}.'
  put(self.path(n)/'consumer-ack.json',{'case':self.case,'sequence':n,'response_sha256':digest,'response_bytes':len(response),'literal_confirmation':literal+('WRONG' if wrong else ''),'source':'literal-consumer-message'})
 def positive(self):
  p=self.call();self.assertEqual(p.returncode,0,p.stderr);self.assertEqual(self.count(),1);self.ack();return p
 def stopped_before_spawn(self):
  n=self.count();p=self.call();self.assertNotEqual(p.returncode,0);self.assertEqual(self.count(),n);self.assertTrue((self.logs/'active.lock').exists())
 def start_barrier(self,mode):
  (self.control/'mode').write_text(mode);p=subprocess.Popen(self.command(),stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True);self.processes.append(p)
  until=time.monotonic()+5
  while not (self.control/'started').exists() and time.monotonic()<until:time.sleep(.01)
  self.assertTrue((self.control/'started').exists());return p
 def test_positive_index_then_utf8_read(self):
  self.positive();p=self.call('read');self.assertEqual(p.returncode,0,p.stderr);r=get(self.path(2)/'receipt.json');self.assertEqual(r['body_bytes_charged'],len('síntese'.encode()));self.assertEqual(r['ledger_after']['value']['index_calls'],1);self.assertEqual(r['consumer_delivery_ack'],'UNKNOWN_PENDING_LITERAL_CONSUMER_CONFIRMATION');self.assertNotIn('delivered',r);self.assertTrue(r['response']['persisted']);self.assertFalse((self.logs/'active.lock').exists());self.ack(2)
 def test_missing_ledger(self):self.positive();(self.atlas/self.name).unlink();self.stopped_before_spawn()
 def test_regressed_ledger(self):
  self.positive();v=get(self.atlas/self.name);v['index_calls']=0;put(self.atlas/self.name,v);self.stopped_before_spawn()
 def test_unexplained_advance(self):
  self.positive();v=get(self.atlas/self.name);v['index_calls']=2;put(self.atlas/self.name,v);self.stopped_before_spawn()
 def test_missing_receipt(self):self.positive();(self.path()/'receipt.json').unlink();self.stopped_before_spawn()
 def test_corrupt_receipt(self):self.positive();(self.path()/'receipt.json').write_text('{}');self.stopped_before_spawn()
 def test_missing_ack(self):
  self.assertEqual(self.call().returncode,0);self.stopped_before_spawn()
 def test_wrong_ack(self):
  self.assertEqual(self.call().returncode,0);self.ack(wrong=True);self.stopped_before_spawn()
 def test_other_ledger_changed(self):
  (self.control/'mode').write_text('other-change');p=self.call();self.assertNotEqual(p.returncode,0);self.assertEqual(self.count(),1);self.assertTrue((self.logs/'active.lock').exists());self.assertFalse((self.path()/'receipt.json').exists())
 def test_other_ledger_deleted(self):
  put(self.atlas/('evaluation-budget-'+'b'*64+'.json'),{'consumer':'other'});(self.control/'mode').write_text('other-delete');self.assertNotEqual(self.call().returncode,0);self.assertTrue((self.logs/'active.lock').exists())
 def test_partial_ledger(self):
  (self.control/'mode').write_text('partial');self.assertNotEqual(self.call().returncode,0);self.assertTrue((self.atlas/(self.name+'.next')).exists());self.assertTrue((self.logs/'active.lock').exists())
 def test_interrupt_child_alive(self):
  p=self.start_barrier('hang');pid=int((self.control/'started').read_text());p.send_signal(signal.SIGTERM);p.communicate(timeout=8);self.assertNotEqual(p.returncode,0);self.assertTrue((self.logs/'active.lock').exists());self.assertTrue((self.logs/'active.lock/STOP.json').exists())
  with self.assertRaises(ProcessLookupError):os.kill(pid,0)
  self.stopped_before_spawn()
 def test_timeout_sticky_lock(self):
  (self.control/'mode').write_text('hang');self.assertNotEqual(self.call().returncode,0);self.assertTrue((self.logs/'active.lock/STOP.json').exists());self.stopped_before_spawn()
 def test_hard_kill_parent_leaves_lock(self):
  p=self.start_barrier('hang');p.kill();p.communicate(timeout=5);self.assertTrue((self.logs/'active.lock').exists());self.stopped_before_spawn()
 def test_orphan_group_blocks_release(self):
  (self.control/'mode').write_text('orphan');self.assertNotEqual(self.call().returncode,0);self.assertTrue((self.logs/'active.lock').exists())
 def test_response_write_failure_keeps_charge(self):
  p=self.start_barrier('barrier');(self.path()/'response.json').mkdir();(self.control/'continue').write_text('go');p.communicate(timeout=8);self.assertNotEqual(p.returncode,0);self.assertEqual(get(self.atlas/self.name)['index_calls'],1);self.assertFalse((self.path()/'receipt.json').exists());self.assertTrue((self.logs/'active.lock').exists())
 def test_authorization_changed_while_call_active(self):
  p=self.start_barrier('barrier');a=get(self.auth);a['active_case']='other';put(self.auth,a);(self.control/'continue').write_text('go');p.communicate(timeout=8);self.assertNotEqual(p.returncode,0);self.assertTrue((self.logs/'active.lock').exists())
 def test_hold_preserves_charge_and_stops(self):
  (self.control/'mode').write_text('hold');self.assertNotEqual(self.call().returncode,0);self.assertEqual(get(self.atlas/self.name)['index_calls'],1);self.assertTrue((self.logs/'active.lock').exists())
 def setcaps(self,index,reads,total,**extra):
  v=get(self.casefile);v['cases'][0]['limits']={'index_calls':index,'read_calls':reads,'body_bytes_total':total};v['cases'][0].update(extra);put(self.casefile,v);self.authorize()
 def depth(self,value):
  a=get(self.auth);a['read_depth']=value;put(self.auth,a)
 def rawcall(self,operation,args):
  command=self.command();command[-1]=json.dumps({'operation':operation,'args':args});return subprocess.run(command,capture_output=True,text=True,timeout=12)
 def test_read_count_precheck(self):
  self.setcaps(2,1,16000);self.assertEqual(self.call('read').returncode,0);self.ack();before=(self.atlas/self.name).read_bytes();p=self.call('read');self.assertNotEqual(p.returncode,0);self.assertEqual(self.count(),1);self.assertEqual((self.atlas/self.name).read_bytes(),before)
 def test_maxbytes_remaining_precheck(self):
  self.setcaps(2,3,10);self.assertEqual(self.rawcall('read',{'key':'synthetic','maxBytes':10}).returncode,0);self.ack();remaining=10-len('síntese'.encode());before=(self.atlas/self.name).read_bytes();p=self.rawcall('read',{'key':'synthetic','maxBytes':remaining+1});self.assertNotEqual(p.returncode,0);self.assertEqual(self.count(),1);self.assertEqual((self.atlas/self.name).read_bytes(),before)
 def test_exact_remaining_boundary(self):
  self.setcaps(2,3,2);(self.control/'mode').write_text('tiny')
  self.assertEqual(self.rawcall('read',{'key':'synthetic','maxBytes':2}).returncode,0);self.ack();self.assertEqual(self.rawcall('read',{'key':'synthetic','maxBytes':1}).returncode,0);self.ack(2)
  self.assertEqual(get(self.atlas/self.name)['body_bytes_total'],2);self.assertNotEqual(self.rawcall('read',{'key':'synthetic','maxBytes':1}).returncode,0);self.assertEqual(self.count(),2)
 def test_s4_per_read_precheck(self):
  self.setcaps(2,12,62000,per_read_max_bytes=18000,shallow_max_bytes=6000)
  self.depth('deep');self.assertNotEqual(self.rawcall('read',{'key':'synthetic','maxBytes':18001,'depth':'deep'}).returncode,0);self.assertEqual(self.count(),0);self.assertFalse((self.atlas/self.name).exists())
 def test_s4_shallow_precheck(self):
  self.setcaps(2,12,62000,per_read_max_bytes=18000,shallow_max_bytes=6000)
  self.depth('shallow');self.assertNotEqual(self.rawcall('read',{'key':'synthetic','maxBytes':6001,'depth':'shallow'}).returncode,0);self.assertEqual(self.count(),0)
 def test_s4_shallow_and_deep_share_ledger(self):
  self.setcaps(2,12,62000,per_read_max_bytes=18000,shallow_max_bytes=6000)
  self.depth('shallow');self.assertEqual(self.rawcall('read',{'key':'synthetic','maxBytes':6000,'depth':'shallow'}).returncode,0);self.ack();self.depth('deep');self.assertEqual(self.rawcall('read',{'key':'synthetic','maxBytes':18000,'depth':'deep'}).returncode,0);self.assertEqual(get(self.atlas/self.name)['read_calls'],2);self.assertEqual(get(self.atlas/self.name)['body_bytes_total'],2*len('síntese'.encode()))
 def test_shallow_cannot_self_upgrade(self):
  self.setcaps(2,12,62000,per_read_max_bytes=18000,shallow_max_bytes=6000);self.depth('shallow')
  self.assertNotEqual(self.rawcall('read',{'key':'synthetic','maxBytes':18000,'depth':'deep'}).returncode,0);self.assertEqual(self.count(),0)
 def test_caps_cannot_expand_declared_native(self):
  self.setcaps(3,2,10000,native_limits={'index_calls':2,'read_calls':2,'body_bytes_total':16000})
  self.assertNotEqual(self.call().returncode,0);self.assertEqual(self.count(),0)
 def test_shallow_is_not_native_mode(self):
  v=get(self.casefile);v['cases'][0]['mode']='shallow';put(self.casefile,v);self.authorize();self.assertNotEqual(self.call().returncode,0);self.assertEqual(self.count(),0)


 def entrycaps(self):
  self.setcaps(2,12,62000,per_read_max_bytes=18000,shallow_max_bytes=6000,shallow_entry_key='synthetic')
 def test_entry_gate_denies_wrong_shallow_key(self):
  self.entrycaps();self.depth('shallow')
  self.assertNotEqual(self.rawcall('read',{'key':'other','maxBytes':6000,'depth':'shallow'}).returncode,0);self.assertEqual(self.count(),0)
 def test_entry_gate_denies_need_selection(self):
  self.entrycaps();self.depth('shallow')
  self.assertNotEqual(self.rawcall('read',{'need':'entry','maxBytes':6000,'depth':'shallow'}).returncode,0);self.assertEqual(self.count(),0)
 def test_entry_gate_denies_deep_first(self):
  self.entrycaps();self.depth('deep')
  self.assertNotEqual(self.rawcall('read',{'key':'synthetic','maxBytes':18000,'depth':'deep'}).returncode,0);self.assertEqual(self.count(),0)
 def test_entry_gate_denies_second_shallow(self):
  self.entrycaps();self.depth('shallow')
  self.assertEqual(self.rawcall('read',{'key':'synthetic','maxBytes':6000,'depth':'shallow'}).returncode,0);self.ack()
  before=(self.atlas/self.name).read_bytes()
  self.assertNotEqual(self.rawcall('read',{'key':'synthetic','maxBytes':6000,'depth':'shallow'}).returncode,0);self.assertEqual(self.count(),1);self.assertEqual((self.atlas/self.name).read_bytes(),before)
 def test_entry_gate_positive_shared_transition(self):
  self.entrycaps();self.depth('shallow')
  self.assertEqual(self.rawcall('read',{'key':'synthetic','maxBytes':6000,'depth':'shallow'}).returncode,0);self.ack()
  self.depth('deep');self.assertEqual(self.rawcall('read',{'key':'intermediate','maxBytes':18000,'depth':'deep'}).returncode,0);self.assertEqual(self.count(),2);self.assertEqual(get(self.atlas/self.name)['read_calls'],2)
 def test_entry_gate_invalid_config(self):
  self.setcaps(2,12,62000,shallow_entry_key='synthetic')
  self.assertNotEqual(self.call().returncode,0);self.assertEqual(self.count(),0)
 def test_s4_missing_depth_denied(self):
  self.entrycaps();self.depth('shallow')
  self.assertNotEqual(self.rawcall('read',{'key':'synthetic','maxBytes':6000}).returncode,0);self.assertEqual(self.count(),0)
 def test_s4_native_boolean_limit_denied(self):
  self.setcaps(True,12,62000)
  self.assertNotEqual(self.call().returncode,0);self.assertEqual(self.count(),0)


 def test_lifecycle_success_durable_chain(self):
  self.positive();start=get(self.path()/'process-start.json');release=get(self.path()/'process-release.json');end=get(self.path()/'process-exit.json');receipt=get(self.path()/'receipt.json')
  self.assertEqual(start['identity'],release['identity']);self.assertEqual(end['anchor'],start['identity']);self.assertTrue(end['group_absent']);self.assertEqual(receipt['process_identity'],start['identity']);self.assertGreater(start['identity']['starttime'],0);self.assertIn('pid:[',start['identity']['pid_namespace'])
 def test_lifecycle_hold_retains_identity_quota(self):
  (self.control/'mode').write_text('hold');p=self.call();self.assertNotEqual(p.returncode,0);self.assertTrue((self.path()/'process-start.json').is_file());self.assertTrue((self.path()/'process-release.json').is_file());self.assertEqual(get(self.atlas/self.name)['index_calls'],1);self.assertTrue((self.logs/'active.lock/STOP.json').exists())
 def test_lifecycle_timeout_retains_identity(self):
  (self.control/'mode').write_text('hang');self.assertNotEqual(self.call().returncode,0);self.assertTrue((self.path()/'process-start.json').is_file());self.assertFalse((self.atlas/self.name).exists());self.assertTrue((self.logs/'active.lock').exists())
 def test_lifecycle_renamed_descendant_still_blocks(self):
  (self.control/'mode').write_text('renamed-orphan');self.assertNotEqual(self.call().returncode,0);self.assertTrue((self.logs/'active.lock').exists());self.assertTrue((self.path()/'process-start.json').exists())
 def test_lifecycle_repeated_signal_sticky(self):
  p=self.start_barrier('hang')
  for sig in [signal.SIGINT,signal.SIGTERM,signal.SIGHUP,signal.SIGINT]:
   if p.poll() is None:
    try:p.send_signal(sig)
    except ProcessLookupError:pass
  p.communicate(timeout=12);self.assertNotEqual(p.returncode,0);self.assertTrue((self.logs/'active.lock').exists());self.assertTrue((self.path()/'process-start.json').exists());self.assertFalse((self.atlas/self.name).exists())
 def test_lifecycle_pid_reuse_refuses_signal(self):
  anchor=lifecycle.identity(os.getpid());reused={**anchor,'starttime':anchor['starttime']+1}
  with mock.patch.object(lifecycle,'stat_identity',return_value={k:reused[k] for k in ['pid','pgid','sid','starttime']}),mock.patch.object(lifecycle.os,'killpg') as kill:
   with self.assertRaisesRegex(RuntimeError,'pid-reuse'):lifecycle.stop_group(mock.Mock(returncode=None),anchor)
   kill.assert_not_called()
 def test_lifecycle_gate_eof_no_native_work(self):
  run=self.base/'gate-eof';run.mkdir();rd,wr=os.pipe();marker=self.base/'native-ran'
  argv=[sys.executable,'-c',f'from pathlib import Path;Path({str(marker)!r}).write_text("BAD")']
  p=subprocess.Popen([sys.executable,str(LIFECYCLE),'gate',str(rd),str(run),json.dumps(argv)],pass_fds=(rd,),start_new_session=True,stdout=subprocess.PIPE,stderr=subprocess.PIPE);self.processes.append(p);os.close(rd);os.close(wr);p.communicate(timeout=5)
  self.assertEqual(p.returncode,78);self.assertFalse(marker.exists());self.assertTrue((run/'process-start.json').exists());self.assertFalse((self.atlas/self.name).exists())
 def test_lifecycle_crash_window_parent_death_closes_gate(self):
  run=self.base/'gate-crash';run.mkdir();marker=self.base/'crash-native-ran'
  argv=[sys.executable,'-c',f'from pathlib import Path;Path({str(marker)!r}).write_text("BAD")']
  # Synthetic launcher crashes immediately after Popen, before ANY parent record/release.
  code="import os,sys,subprocess;rd,wr=os.pipe();subprocess.Popen([sys.executable,sys.argv[1],'gate',str(rd),sys.argv[2],sys.argv[3]],pass_fds=(rd,),start_new_session=True);os._exit(99)"
  p=subprocess.run([sys.executable,'-c',code,str(LIFECYCLE),str(run),json.dumps(argv)],capture_output=True,timeout=5);self.assertEqual(p.returncode,99)
  until=time.monotonic()+3
  while not (run/'process-start.json').exists() and time.monotonic()<until:time.sleep(.01)
  self.assertTrue((run/'process-start.json').exists());self.assertFalse(marker.exists());self.assertFalse((self.atlas/self.name).exists())
 def test_lifecycle_missing_record_denies_next_call(self):
  self.positive();(self.path()/'process-start.json').unlink();self.stopped_before_spawn()


 def test_v2_atomic_absence_not_empty_census(self):
  anchor=lifecycle.identity(os.getpid())
  with mock.patch.object(lifecycle.os,'killpg',side_effect=ProcessLookupError):
   proof=lifecycle.kernel_group_absent(anchor);self.assertEqual(proof['kernel_probe'],'killpg-zero-ESRCH')
  with mock.patch.object(lifecycle.os,'killpg',return_value=None):
   with self.assertRaisesRegex(RuntimeError,'kernel-group-present'):lifecycle.kernel_group_absent(anchor)
 def test_v2_disappearance_during_stat_is_unknown(self):
  anchor=lifecycle.identity(os.getpid())
  with mock.patch.object(lifecycle,'stat_identity',side_effect=FileNotFoundError):
   with self.assertRaisesRegex(RuntimeError,'census-partial'):lifecycle.members(anchor)
 def test_v2_zombie_member_missing_namespace_unknown(self):
  anchor=lifecycle.identity(os.getpid());fake={k:anchor[k] for k in ['pid','pgid','sid','starttime']};fake['pid']+=1
  real=lifecycle.os.readlink
  def readlink(path):
   if str(path)==f"/proc/{fake['pid']}/ns/pid":raise FileNotFoundError()
   return real(path)
  with mock.patch.object(lifecycle.Path,'iterdir',return_value=iter([Path('/proc')/str(fake['pid'])])),mock.patch.object(lifecycle,'stat_identity',return_value=fake),mock.patch.object(lifecycle.os,'readlink',side_effect=readlink):
   with self.assertRaisesRegex(RuntimeError,'member-namespace'):lifecycle.members(anchor)
 def test_v2_fork_after_census_caught_by_kernel(self):
  anchor=lifecycle.identity(os.getpid());proc=mock.Mock(returncode=None);proc.wait.return_value=0
  with mock.patch.object(lifecycle,'members',return_value=[anchor]),mock.patch.object(lifecycle.os,'killpg',return_value=None):
   with self.assertRaisesRegex(RuntimeError,'kernel-group-present'):lifecycle.finish_group(proc,anchor)
 def test_v2_unreaped_leader_pins_identity_through_signal(self):
  anchor=lifecycle.identity(os.getpid());proc=mock.Mock(pid=anchor['pid'],returncode=None);events=[]
  def killpg(group,sig):
   if sig==signal.SIGKILL:self.assertIsNone(proc.returncode);events.append('signal-before-reap')
   else:raise ProcessLookupError()
  def wait(timeout):events.append('reap');proc.returncode=-9;return -9
  proc.wait.side_effect=wait
  with mock.patch.object(lifecycle.os,'killpg',side_effect=killpg):
   lifecycle.stop_group(proc,anchor)
  self.assertEqual(events,['signal-before-reap','reap'])
 def test_v2_reuse_between_check_and_signal_not_possible_after_reap(self):
  anchor=lifecycle.identity(os.getpid());proc=mock.Mock(returncode=0)
  with mock.patch.object(lifecycle.os,'killpg') as kill:
   with self.assertRaisesRegex(RuntimeError,'reaped-leader-no-signal'):lifecycle.stop_group(proc,anchor)
   kill.assert_not_called()
 def test_v2_partial_stop_identity_never_signals(self):
  anchor=lifecycle.identity(os.getpid())
  with mock.patch.object(lifecycle,'stat_identity',side_effect=FileNotFoundError),mock.patch.object(lifecycle.os,'killpg') as kill:
   with self.assertRaises(FileNotFoundError):lifecycle.stop_group(mock.Mock(returncode=None),anchor)
   kill.assert_not_called()
 def test_v2_directory_chain_fsync_each_ancestor(self):
  target=self.base/'durable'/'nested';seen=[];real=lifecycle.os.fsync
  def record(fd):seen.append(os.readlink(f'/proc/self/fd/{fd}'));return real(fd)
  with mock.patch.object(lifecycle.os,'fsync',side_effect=record):lifecycle.durable_directory(target)
  self.assertEqual(seen,[str(p) for p in [target,*target.parents]])
 def test_v2_directory_stage_fsync_failure_prevents_native(self):
  # Each directory-creation stage fails before a gate/native subprocess exists.
  for stage in ['logs','lock','case','attempt']:
   fixture=BrokerCI('runTest');fixture.setUp()
   try:
    with mock.patch.object(sys,'argv',fixture.command()):
     spec=importlib.util.spec_from_file_location('broker_fsync_failure_'+stage,BROKER);broker=importlib.util.module_from_spec(spec);spec.loader.exec_module(broker)
    broker.SETTINGS_PATH=fixture.config
    original=broker._lifecycle.durable_directory
    paths={'logs':fixture.logs,'lock':fixture.logs/'active.lock','case':fixture.logs/fixture.case,'attempt':fixture.logs/fixture.case/'0001'}
    def create(path,exclusive=False):
     if Path(path)==paths[stage]:
      with mock.patch.object(broker._lifecycle.os,'fsync',side_effect=OSError('synthetic-fsync-failure')):return original(path,exclusive)
     return original(path,exclusive)
    with mock.patch.object(sys,'argv',[str(BROKER),str(fixture.config),fixture.case,json.dumps({'operation':'index','args':{'need':'entry'}})]),mock.patch.object(broker._lifecycle,'durable_directory',side_effect=create),mock.patch.object(broker.subprocess,'Popen') as spawn:
     with self.assertRaises(OSError):broker.main()
     spawn.assert_not_called()
    self.assertEqual(fixture.count(),0);self.assertFalse((fixture.atlas/fixture.name).exists())
   finally:fixture.tearDown()


 def test_v2_real_unreaped_leader_identity_at_signal_boundary(self):
  p=subprocess.Popen([sys.executable,'-c','import sys;sys.stdin.read()'],stdin=subprocess.PIPE,start_new_session=True);self.processes.append(p)
  anchor=lifecycle.identity(p.pid);p.stdin.close();lifecycle.wait_unreaped(p,3)
  real=lifecycle.os.killpg;seen=[]
  def boundary(pgid,sig):
   if sig==signal.SIGKILL:
    self.assertIsNone(p.returncode);self.assertEqual(lifecycle.stat_identity(p.pid),{k:anchor[k] for k in ['pid','pgid','sid','starttime']});seen.append('identity-still-pinned-at-signal')
   return real(pgid,sig)
  with mock.patch.object(lifecycle.os,'killpg',side_effect=boundary):proof=lifecycle.stop_group(p,anchor)
  self.assertEqual(seen,['identity-still-pinned-at-signal']);self.assertEqual(proof['kernel_probe'],'killpg-zero-ESRCH')
 def test_v2_every_directory_ancestor_fsync_failure_is_fatal(self):
  target=self.base/'ancestor-check';target.mkdir();count=len([target,*target.parents]);real=lifecycle.os.fsync
  for fail_at in range(1,count+1):
   calls=[]
   def fail_n(fd):
    calls.append(fd)
    if len(calls)==fail_at:raise OSError('ancestor-fsync-failure')
    return real(fd)
   with mock.patch.object(lifecycle.os,'fsync',side_effect=fail_n):
    with self.assertRaises(OSError):lifecycle.durable_directory(target)
   self.assertEqual(len(calls),fail_at)

# Every S3 cap is exercised through the real broker until its own index quota.
def s3_cap_test(index,reads,total):
 def test(self):
  self.setcaps(index,reads,total)
  for n in range(1,index+1):
   p=self.call();self.assertEqual(p.returncode,0,p.stderr);self.ack(n)
  before=(self.atlas/self.name).read_bytes();self.assertNotEqual(self.call().returncode,0);self.assertEqual(self.count(),index);self.assertEqual((self.atlas/self.name).read_bytes(),before)
 return test
for number,caps in enumerate([(3,2,10000),(4,4,28000),(5,5,36000),(4,4,30000),(4,4,28000),(3,3,16000),(3,3,18000)],1):
 setattr(BrokerCI,f'test_s3_case_{number}_cap',s3_cap_test(*caps))
if __name__=='__main__':unittest.main(verbosity=2)
