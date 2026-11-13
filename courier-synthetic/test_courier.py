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
 def setUp(self):
  sys.path.insert(0,str(P))
  from native_caller_check import verify_capture
  self.verify_capture=verify_capture
  self.payload="abc€".encode()
  self.grant={'state':'COURIER_ONE_RESPONSE_AUTHORIZED','response_sha256':H(self.payload),'response_bytes':len(self.payload)}
  # Preserve these exact bytes; deliberately non-canonical JSON whitespace proves
  # that the checker hashes the received grant, not a re-serialized object.
  self.grant_bytes=json.dumps(self.grant,indent=2).encode()
  self.tuple={'case':'S3-C5','sequence':7,'offset':0,'grant_sha256':H(self.grant_bytes)}
  self.descriptor=dict(self.tuple);self.release=dict(self.tuple);self.attempt=dict(self.tuple)
  self.chunk={'start':0,'end_exclusive':len(self.payload),'total_bytes':len(self.payload),
              'response_sha256':H(self.payload),'chunk_sha256':H(self.payload)}
  self.terminal={'state':'CHILD_EXIT0_CHUNK_DURABLE','direct_child_returncode':0,
                 'chunk':self.chunk,'stdout_sha256':H(self.payload)}
  self.fragments=[{'offset':0,'data':self.payload[:2]},
                  {'offset':2,'data':self.payload[2:4]},
                  {'offset':4,'data':self.payload[4:]}]
 def verify(self,**overrides):
  args={'descriptor':self.descriptor,'release':self.release,'attempt':self.attempt,
        'grant_bytes':self.grant_bytes,'fragments':self.fragments,
        'terminal':self.terminal,'terminal_binding':self.tuple,'complete':True}
  args.update(overrides)
  return self.verify_capture(**args)
 def test_fragmented_raw_bytes_and_terminal_tuple(self):
  result=self.verify()
  self.assertEqual(result,{'advance':len(self.payload),'ack_allowed':False,'chunk_verified':True})
 def test_utf8_codepoint_may_cross_fragment_boundary(self):
  euro='€'.encode()
  self.fragments=[{'offset':0,'data':b'abc'+euro[:1]},
                  {'offset':4,'data':euro[1:]}]
  self.chunk.update({'end_exclusive':6,'chunk_sha256':H(self.payload)})
  self.terminal['stdout_sha256']=H(self.payload)
  self.assertTrue(self.verify()['chunk_verified'])
 def test_gap_overlap_reorder_and_duplicate_fragments_rejected(self):
  for fragments in [
   [{'offset':0,'data':b'ab'},{'offset':3,'data':self.payload[2:]}],
   [{'offset':0,'data':b'abc'},{'offset':2,'data':self.payload[2:]}],
   list(reversed(self.fragments)),
   self.fragments+[dict(self.fragments[-1])],
  ]:
   self.assertFalse(self.verify(fragments=fragments)['chunk_verified'])
   self.assertIsNone(self.verify(fragments=fragments)['advance'])
 def test_truncation_or_incomplete_capture_rejected(self):
  self.assertFalse(self.verify(complete=False)['chunk_verified'])
  self.assertFalse(self.verify(fragments=self.fragments[:-1])['chunk_verified'])
  self.assertFalse(self.verify(terminal=None)['chunk_verified'])
 def test_terminal_tuple_mismatch_rejected(self):
  for key,value in [('case','S3-C6'),('sequence',8),('offset',1),('grant_sha256','0'*64)]:
   binding=dict(self.tuple);binding[key]=value
   self.assertFalse(self.verify(terminal_binding=binding)['chunk_verified'])
  self.assertFalse(self.verify(terminal_binding=None)['chunk_verified'])
 def test_descriptor_release_attempt_all_bound_to_raw_grant(self):
  for name in ('descriptor','release','attempt'):
   changed=dict(getattr(self,name));changed['grant_sha256']='0'*64
   self.assertFalse(self.verify(**{name:changed})['chunk_verified'])
  # Same semantic JSON with different bytes is not the grant named by the tuple.
  self.assertFalse(self.verify(grant_bytes=json.dumps(self.grant,separators=(',',':')).encode())['chunk_verified'])
 def test_terminal_receipt_mismatch_and_absence_rejected(self):
  self.assertFalse(self.verify(terminal=None)['chunk_verified'])
  bad=dict(self.terminal);bad['direct_child_returncode']=7
  self.assertFalse(self.verify(terminal=bad)['chunk_verified'])
  bad=dict(self.terminal);bad['state']='FAILED'
  self.assertFalse(self.verify(terminal=bad)['chunk_verified'])
  bad=dict(self.terminal);bad['stdout_sha256']='0'*64
  self.assertFalse(self.verify(terminal=bad)['chunk_verified'])
 def test_chunk_hash_and_extent_mismatch_rejected(self):
  bad=dict(self.terminal);bad['chunk']=dict(self.chunk,chunk_sha256='0'*64)
  self.assertFalse(self.verify(terminal=bad)['chunk_verified'])
  bad=dict(self.terminal);bad['chunk']=dict(self.chunk,end_exclusive=len(self.payload)+1)
  self.assertFalse(self.verify(terminal=bad)['chunk_verified'])
  bad=dict(self.terminal);bad['chunk']=dict(self.chunk,response_sha256='0'*64)
  self.assertFalse(self.verify(terminal=bad)['chunk_verified'])
if __name__=='__main__':unittest.main(verbosity=2)
