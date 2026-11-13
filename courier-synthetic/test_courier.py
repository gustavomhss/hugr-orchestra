"""Synthetic stdlib tests. Fixture transforms recorded; no campaign files accessed."""
import unittest,tempfile,pathlib,sys,hashlib,json,subprocess,os,signal,time
P=pathlib.Path(__file__).resolve().parent
H=lambda b:hashlib.sha256(b).hexdigest()
ENV={'PATH':'/usr/local/bin:/usr/bin:/bin','HOME':'/nonexistent','LANG':'C.UTF-8','LC_ALL':'C.UTF-8','TZ':'UTC','TMPDIR':'/tmp','GIT_CONFIG_NOSYSTEM':'1','GIT_CONFIG_GLOBAL':'/dev/null','GIT_TERMINAL_PROMPT':'0','GIT_OPTIONAL_LOCKS':'0'}
class Synthetic(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.base=pathlib.Path(self.tmp.name);self.code=self.base/'code';self.code.mkdir();self.responses=self.base/'responses';self.delivery=self.base/'delivery';self.parent=self.delivery/'S3-C5/courier-0001';self.parent.mkdir(parents=True);self.response=self.responses/'S3-C5/0001/response.json';self.response.parent.mkdir(parents=True)
  self.response.write_bytes(('x'*8191+'€'+'y'*23).encode());self.transforms=[]
  for name in ['supervisor.py','courier.py']:
   raw=(P/name).read_text();s=raw
   old='/synthetic-not-live/'+('coordinator-delivery' if name=='supervisor.py' else 'consumer-captures');s=s.replace(old,str(self.delivery if name=='supervisor.py' else self.responses))
   if name=='supervisor.py':s=s.replace('/synthetic-not-live/python3.12',sys.executable).replace('fa67443527ed9647f760d807e2a38f26340757123e643c4639cf273ed15d5ea7',H(pathlib.Path(sys.executable).read_bytes()))
   (self.code/name).write_text(s);self.transforms.append({'file':name,'original':H(raw.encode()),'transformed':H(s.encode()),'seams':'fixed paths and current test Python identity only'})
  self.sync()
 def tearDown(self):self.tmp.cleanup()
 def sync(self):
  (self.code/'pins.json').write_text(json.dumps({'courier_sha256':H((self.code/'courier.py').read_bytes())}));st=self.response.stat();b=self.response.read_bytes();self.grant={'state':'COURIER_ONE_RESPONSE_AUTHORIZED','case':'S3-C5','sequence':1,'response_path':str(self.response),'response_sha256':H(b),'response_bytes':len(b),'file_identity':[st.st_dev,st.st_ino,st.st_size,st.st_mtime_ns,st.st_ctime_ns]};(self.parent/'grant.json').write_text(json.dumps(self.grant))
  (self.code/'transformations.json').write_text(json.dumps(self.transforms))
 def run_case(self,offset='0',case='S3-C5'):
  grantsha=H((self.parent/'grant.json').read_bytes());r={'execute_once':True,'case':case,'sequence':1,'offset':int(offset) if offset.isdecimal() else 0,'grant_sha256':grantsha,'supervisor_sha256':H((self.code/'supervisor.py').read_bytes()),'pins_sha256':H((self.code/'pins.json').read_bytes())};rp=self.parent/('supervisor-release-'+offset+'.json');rp.write_text(json.dumps(r))
  return subprocess.run([sys.executable,'-I','-S','-B',str(self.code/'supervisor.py'),case,'0001',grantsha,offset,H(rp.read_bytes())],env=ENV,capture_output=True,timeout=15)
 def seam(self,name,old,new):
  f=self.code/name;s=f.read_text();assert old in s;s=s.replace(old,new);f.write_text(s);self.transforms.append({'file':name,'injection':old,'replacement':new});self.sync()
 def test_utf8_and_durable_before_output(self):
  # Test-only assertion at exact output seam observes committed receipt before exposure.
  self.seam('supervisor.py','sys.stdout.buffer.write(payload);','assert (run/"terminal.json").is_file() and json.loads((run/"terminal.json").read_text())["direct_child_returncode"]==0;sys.stdout.buffer.write(payload);')
  r=self.run_case();self.assertEqual(r.returncode,0,r.stderr);self.assertEqual(r.stdout,self.response.read_bytes()[:8191]);r2=self.run_case('8191');self.assertEqual(r2.returncode,0,r2.stderr);self.assertEqual(r.stdout+r2.stdout,self.response.read_bytes())
 def test_canonical_reject_before_effects(self):
  for s in ['00','08192','+0','-0','٠','８１９２',' 0','0 ']:
   r=self.run_case(s);self.assertNotEqual(r.returncode,0);self.assertFalse((self.parent/('supervised-'+s)).exists())
 def test_replay_and_scope(self):
  self.assertEqual(self.run_case().returncode,0);self.assertNotEqual(self.run_case().returncode,0);self.assertNotEqual(self.run_case(case='S3-C4').returncode,0)
 def test_child_nonzero(self):
  self.seam('courier.py',"if __name__=='__main__':main()","if __name__=='__main__':raise SystemExit(7)");r=self.run_case();self.assertNotEqual(r.returncode,0);self.assertEqual(r.stdout,b'');self.assertFalse((self.parent/'supervised-0/terminal.json').exists())
 def test_child_timeout(self):
  self.seam('courier.py',"if __name__=='__main__':main()","if __name__=='__main__':\n import time;time.sleep(10)");self.seam('supervisor.py','proc.wait(timeout=120)','proc.wait(timeout=0.05)');r=self.run_case();self.assertNotEqual(r.returncode,0);self.assertEqual(r.stdout,b'');stop=json.loads((self.parent/'supervised-0/STOP.json').read_text());self.assertIsNotNone(stop['direct_child_returncode'])
 def test_persistence_failure_cleanup(self):
  self.seam('courier.py',"if __name__=='__main__':main()","if __name__=='__main__':\n import time;time.sleep(10)");self.seam('supervisor.py','def emit(p,x):durable(p,','def emit(p,x):\n if p.name=="child-start.json":raise OSError("synthetic-save-failure")\n durable(p,');r=self.run_case();self.assertNotEqual(r.returncode,0);self.assertEqual(r.stdout,b'');stop=json.loads((self.parent/'supervised-0/STOP.json').read_text());self.assertIsNotNone(stop['direct_child_returncode'])
 def test_mutation_rejected(self):
  # Fixture mutation occurs between first and second read; never real data.
  self.seam('courier.py','again,identity2=read_regular(path);','path.write_bytes(b+ b"!");again,identity2=read_regular(path);');r=self.run_case();self.assertNotEqual(r.returncode,0);self.assertEqual(r.stdout,b'')
 def test_complete_output_then_nonzero(self):
  self.seam('courier.py',"if __name__=='__main__':main()","if __name__=='__main__':\n main();raise SystemExit(7)")
  r=self.run_case();self.assertNotEqual(r.returncode,0);self.assertEqual(r.stdout,b'')
  run=self.parent/'supervised-0'
  raw=(run/'stdout.raw').read_bytes();meta=json.loads((run/'stderr.raw').read_bytes())
  self.assertEqual(raw,self.response.read_bytes()[:8191])
  self.assertEqual(meta['chunk_sha256'],H(raw));self.assertEqual(meta['immutable_checks'],3)
  self.assertFalse((run/'terminal.json').exists())
  stop=json.loads((run/'STOP.json').read_text());self.assertEqual(stop['direct_child_returncode'],7);self.assertFalse(stop['retry'])
  # An attempted same-offset replay is rejected before spawn; old attempt remains exact.
  attempt=(run/'attempt.json').read_bytes()
  self.assertNotEqual(self.run_case().returncode,0)
  self.assertEqual((run/'attempt.json').read_bytes(),attempt)

 def test_terminal_persistence_failure_after_child0(self):
  self.seam('supervisor.py','def emit(p,x):durable(p,','def emit(p,x):\n if p.name=="terminal.json":raise OSError("synthetic-terminal-failure")\n durable(p,')
  r=self.run_case();self.assertNotEqual(r.returncode,0);self.assertEqual(r.stdout,b'')
  run=self.parent/'supervised-0';self.assertTrue((run/'stdout.raw').read_bytes());self.assertFalse((run/'terminal.json').exists())
  stop=json.loads((run/'STOP.json').read_text());self.assertEqual(stop['direct_child_returncode'],0);self.assertFalse(stop['retry']);self.assertNotEqual(self.run_case().returncode,0)
 def test_interrupt_during_wait(self):
  self.seam('courier.py',"if __name__=='__main__':main()","if __name__=='__main__':\n import time;time.sleep(10)")
  # Fixture-only original subprocess.run replacement launches same argv, waits for durable child-start, signals supervisor once.
  original=subprocess.run
  def interrupt_run(argv,**kwargs):
   proc=subprocess.Popen(argv,env=kwargs['env'],stdout=subprocess.PIPE,stderr=subprocess.PIPE)
   deadline=time.monotonic()+5
   while not (self.parent/'supervised-0/child-start.json').exists() and time.monotonic()<deadline:time.sleep(0.01)
   if not (self.parent/'supervised-0/child-start.json').exists():
    proc.kill();proc.communicate();raise AssertionError('child-start missing')
   proc.send_signal(signal.SIGTERM);out,err=proc.communicate(timeout=12)
   return subprocess.CompletedProcess(argv,proc.returncode,out,err)
  subprocess.run=interrupt_run
  try:r=self.run_case()
  finally:subprocess.run=original
  self.assertNotEqual(r.returncode,0);self.assertEqual(r.stdout,b'');run=self.parent/'supervised-0';self.assertFalse((run/'terminal.json').exists());stop=json.loads((run/'STOP.json').read_text());self.assertIsNotNone(stop['direct_child_returncode']);self.assertFalse(stop['retry']);self.assertNotEqual(self.run_case().returncode,0)

class CallerSpecificationOnly(unittest.TestCase):
 def verify(self,events,descriptor,release,attempt,grant,terminal,expected,start=0):
  # Small reference checker for procedure only; not production caller or backend end-to-end.
  try:
   sid=None;fragments=[];done=False
   for e in events:
    assert not done and not any(e.get(k) for k in ['error','truncated','lost','save_failed'])
    if e.get('session'):
     assert sid is None or sid==e['session'];sid=e['session']
    fragments.append(e.get('output',''))
    if 'exit' in e:assert e['exit']==0;done=True
   assert done and terminal and terminal['state']=='CHILD_EXIT0_CHUNK_DURABLE' and terminal['direct_child_returncode']==0
   for k in ['case','sequence','offset','grant_sha256']:assert descriptor[k]==release[k]==attempt[k]
   assert descriptor['grant_sha256']==H(json.dumps(grant,sort_keys=True).encode())
   m=terminal['chunk'];assert start==m['start']==attempt['offset'];assert m['end_exclusive']-start==len(expected);assert m['response_sha256']==grant['response_sha256'];assert m['total_bytes']==grant['response_bytes'];assert m['chunk_sha256']==H(expected)
   text=''.join(fragments);mark='META:'+json.dumps(m,sort_keys=True)+'\n';assert text.count(mark)==1;payload=text.replace(mark,'',1).encode();assert payload==expected and H(payload)==terminal['stdout_sha256']
   return {'advance':m['end_exclusive'],'ack_allowed':False,'chunk_verified':True}
  except (AssertionError,KeyError,TypeError):return {'advance':None,'ack_allowed':False,'chunk_verified':False}
 def fixture(self):
  payload='abc€'.encode();grant={'response_sha256':H(payload),'response_bytes':len(payload)};d={'case':'SYNTHETIC','sequence':1,'offset':0,'grant_sha256':H(json.dumps(grant,sort_keys=True).encode())};m={'start':0,'end_exclusive':len(payload),'total_bytes':len(payload),'response_sha256':H(payload),'chunk_sha256':H(payload)};t={'state':'CHILD_EXIT0_CHUNK_DURABLE','direct_child_returncode':0,'chunk':m,'stdout_sha256':H(payload)};text='META:'+json.dumps(m,sort_keys=True)+'\n'+payload.decode();events=[{'session':4,'output':text[:11]},{'session':4,'output':text[11:-2]},{'exit':0,'output':text[-2:]}];return events,d,dict(d),dict(d),grant,t,payload
 def test_fragmented_success_and_no_autoACK(self):
  self.assertEqual(self.verify(*self.fixture()),{'advance':6,'ack_allowed':False,'chunk_verified':True})
 def test_incompatible_bindings_and_missing_proofs(self):
  for index,key,value in [(1,'sequence',2),(2,'offset',1),(3,'case','OTHER')]:
   args=list(self.fixture());args[index][key]=value;self.assertFalse(self.verify(*args)['chunk_verified'])
  args=list(self.fixture());args[5]=None;self.assertFalse(self.verify(*args)['chunk_verified'])
  args=list(self.fixture());args[0][-1].pop('exit');self.assertFalse(self.verify(*args)['chunk_verified'])
 def test_unknown_truncation_loss_gap_overlap(self):
  for event in [{'error':'Unknown process id'},{'truncated':True},{'lost':True},{'save_failed':True},{'session':99}]:
   args=list(self.fixture());args[0].insert(1,event);r=self.verify(*args);self.assertIsNone(r['advance']);self.assertFalse(r['ack_allowed'])
  for bad in ['ab','abc€abc€']:
   args=list(self.fixture());args[0][-1]['output']=bad;r=self.verify(*args);self.assertFalse(r['chunk_verified'])
  args=list(self.fixture());self.assertFalse(self.verify(*args,start=1)['chunk_verified'])
if __name__=='__main__':unittest.main(verbosity=2)
