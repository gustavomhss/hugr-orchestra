"""CI-only route-unit fixtures. No native Atlas root, reader, model or oracle."""
import importlib.util,pathlib,tempfile,json,hashlib,unittest
P=pathlib.Path(__file__).with_name('s4-l4-dispatch.py');spec=importlib.util.spec_from_file_location('route',P);route=importlib.util.module_from_spec(spec);spec.loader.exec_module(route)
class RouteCI(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.root=pathlib.Path(self.tmp.name);self.case='synthetic';self.binding={'consumer':self.case,'scope':'atlas-continuity-rag-genesis','candidate':'c'*64,'generation':'g'*64,'manifest':'m'*64};self.targets=[self.target('target-'+str(i),'need-'+str(i),'body-'+str(i)) for i in range(3)];self.entry=self.target('entry','entry',' '.join(t['key'] for t in self.targets));self.binding.update(entry=self.entry,targets=self.targets);self.config={'binding':self.binding}
 def tearDown(self):self.tmp.cleanup()
 def target(self,key,need,body):return {'key':key,'need':need,'scope':self.binding['scope'],'manifest':self.binding['manifest'],'artifact':'a-'+key,'result':'r-'+key,'receipt':'p-'+key,'body_bytes':len(body.encode()),'body_sha256':hashlib.sha256(body.encode()).hexdigest(),'fixture_body':body}
 def request(self,t,entry=False):return {'operation':'read','args':{'need':'entry','maxBytes':5000,'depth':'shallow'}} if entry else {'operation':'read','args':{'key':t['key'],'maxBytes':10000,'depth':'deep'}}
 def response(self,t,read=True):
  r={k:v for k,v in t.items() if k in ['key','need','scope','manifest','artifact','result','receipt']};r.update(kind='ready' if read else 'index',evaluation={'phase':'evaluation','evaluationCandidate':self.binding['candidate'],'generation':self.binding['generation'],'manifest':self.binding['manifest']})
  if read:r['body']=t['fixture_body']
  return r
 def add(self,q,t,ack=True):
  n=len(list(self.root.iterdir()))+1;d=self.root/f'{n:04d}';d.mkdir();(d/'attempt.json').write_text(json.dumps({'request':q}));data=json.dumps(self.response(t,q['operation']=='read')).encode();(d/'response.json').write_bytes(data);sha=hashlib.sha256(data).hexdigest()
  if ack:(d/'consumer-ack.json').write_text(json.dumps({'case':self.case,'sequence':n,'response_sha256':sha,'response_bytes':len(data),'literal_confirmation':f'I received the complete response for {self.case} call {n:04d}: {len(data)} bytes, SHA256 {sha}.','source':'literal-consumer-message'}))
 def prefix(self):self.add({'operation':'index','args':{'need':'entry'}},self.entry);self.add(self.request(self.entry,True),self.entry)
 def test_index_first(self):self.assertEqual(route.routecheck({'operation':'index','args':{'need':'entry'}},self.config,self.root),self.entry)
 def test_no_read_before_index(self):
  with self.assertRaises(RuntimeError):route.routecheck(self.request(self.entry,True),self.config,self.root)
 def test_exact_entry_after_index(self):
  self.add({'operation':'index','args':{'need':'entry'}},self.entry);self.assertEqual(route.routecheck(self.request(self.entry,True),self.config,self.root),self.entry)
 def test_deep_before_entry_denied(self):
  self.add({'operation':'index','args':{'need':'entry'}},self.entry)
  with self.assertRaises(RuntimeError):route.routecheck(self.request(self.targets[0]),self.config,self.root)
 def test_missing_ack_denied(self):
  self.add({'operation':'index','args':{'need':'entry'}},self.entry,False)
  with self.assertRaises(RuntimeError):route.routecheck(self.request(self.entry,True),self.config,self.root)
 def test_positive_discovered_target(self):self.prefix();self.assertEqual(route.routecheck(self.request(self.targets[0]),self.config,self.root),self.targets[0])
 def test_duplicate_target_denied(self):
  self.prefix();self.add(self.request(self.targets[0]),self.targets[0])
  with self.assertRaises(RuntimeError):route.routecheck(self.request(self.targets[0]),self.config,self.root)
 def test_outside_allowlist_denied(self):
  self.prefix();q=self.request(self.targets[0]);q['args']['key']='outside'
  with self.assertRaises(RuntimeError):route.routecheck(q,self.config,self.root)
 def test_corrupt_body_denied(self):
  r=self.response(self.entry);r['body']+='x'
  with self.assertRaises(RuntimeError):route.responsecheck(r,self.binding,self.entry,'ready')
 def test_mismatched_identity_denied(self):
  r=self.response(self.entry);r['receipt']='wrong'
  with self.assertRaises(RuntimeError):route.responsecheck(r,self.binding,self.entry,'ready')
 def test_four_reads_close_session(self):
  self.prefix()
  for t in self.targets:self.add(self.request(t),t)
  with self.assertRaises(RuntimeError):route.routecheck({'operation':'index','args':{'need':'entry'}},self.config,self.root)
 def test_larger_target_request_denied(self):
  self.prefix();q=self.request(self.targets[0]);q['args']['maxBytes']=10001
  with self.assertRaises(RuntimeError):route.routecheck(q,self.config,self.root)
if __name__=='__main__':unittest.main(verbosity=2)
