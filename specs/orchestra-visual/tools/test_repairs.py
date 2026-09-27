"""v4 repair regression tests. All product-shaped observations here are SYNTHETIC."""
import copy,json,subprocess,tempfile,unittest,struct,zlib
from pathlib import Path
from test_contract import PLAN,SURFACES,BY
import test_contract as base_tests
from test_support import install,raw_fixture,png
from effective_contract import load,digest,file_hash,contract_digest
from validate_plan import validate,owners_for
from validate_evidence import validate_receipt
from seal_receipt import seal
from select_work import select,entry_dependencies,dependencies,source_errors,conflict
from source_proof import git,snapshot,footprint,external_proof
from census import discover,check
from visual_coverage import required_captures,validate_captures
from png_check import decode_png
from evaluate_performance import evaluate

class Temp(unittest.TestCase):
 def setUp(self):
  self.temp=tempfile.TemporaryDirectory();self.addCleanup(self.temp.cleanup)
  self.root=Path(self.temp.name)/'packet';self.root.mkdir();install(self.root)
 def write(self,p,data):
  p=self.root/p;p.parent.mkdir(parents=True,exist_ok=True)
  p.write_text(json.dumps(data,ensure_ascii=False,allow_nan=False));return p

class ContractRepairs(Temp):
 def test_R01_producer_has_no_final_gate_obligation(self):
  n=BY['S25-W1-T1'];text=json.dumps(n['axioms'],ensure_ascii=False)
  self.assertNotIn('performance S23 e visual S24 no SHA integrado',text)
  self.assertEqual(n['acceptance_requires'],[])
  self.assertEqual(BY['S25-W1-T2']['acceptance_requires'],['S23','S24'])
  for n in PLAN['nodes']:
   if n['kind']=='task':self.assertEqual(set(n['criterion_evaluation_stage'].values()),{n['id']})
 def test_R01_wrong_evaluation_stage_is_rejected(self):
  p=copy.deepcopy(PLAN);n=next(n for n in p['nodes'] if n['id']=='S25-W1-T1');n['criterion_evaluation_stage'][next(iter(n['criterion_evaluation_stage']))]='S23-W1-T2'
  self.assertTrue(validate(p))
 def test_R02_pilot_before_broad_migration(self):
  def closure(i,seen):
   for d in dependencies(BY,i):
    if d not in seen:seen.add(d);closure(d,seen)
  seen=set();closure('S25-W0-T1',seen)
  self.assertFalse(any(x.startswith(('S07-','S12-','S13-','S21-')) for x in seen))
  self.assertLess(sum(BY[x]['kind']=='task' for x in seen),25)
 def test_R01_R02_complete_graph_including_failed_gate_and_retry(self):
  p={'tasks':{},'external':{e['ref']:{'status':'PASS'} for n in PLAN['nodes'] for e in n.get('external_requires',[])}}
  order=[];failed=False
  for _ in range(160):
   s=select(PLAN,p,check_evidence=False,jobs=4)
   ready=[n['id'] for n in s['selected']]
   if not ready:break
   for i in ready:
    if i=='S23-W1-T2' and not failed:
     p['tasks'][i]={'status':'FAIL'};failed=True
     self.assertNotIn('S25-W1-T2',[x['id'] for x in select(PLAN,p,check_evidence=False)['selected']])
     continue
    p['tasks'][i]={'status':'PASS'};order.append(i)
  self.assertEqual(len(order),66);self.assertTrue(failed)
  self.assertLess(order.index('S25-W0-T2'),order.index('S12-W1-T1'))
  self.assertLess(order.index('S25-W1-T1'),order.index('S23-W1-T1'))
  self.assertLess(order.index('S24-W1-T2'),order.index('S25-W1-T2'))
 def test_R03_sidebar_has_single_writer(self):
  paths=['packages/app/src/pages/layout/'+p+'.tsx' for p in ['sidebar-shell','sidebar-items','sidebar-project','sidebar-workspace','inline-editor','session-tab-avatar']]
  self.assertTrue(all(x==['S06'] for x in owners_for(paths,PLAN['nodes']).values()))
 def test_R03_wrong_surface_write_owner_rejected(self):
  s=copy.deepcopy(SURFACES);s['surfaces'].append({**s['surfaces'][-1],'id':'UI999','path':'packages/core/src/foreign.tsx','owner':'S06'})
  self.assertTrue(validate(PLAN,s))
 def test_R05_ancestor_change_invalidates_receipt(self):
  n=BY['S17-W1-T2'];before=contract_digest(n,self.root,PLAN);p=copy.deepcopy(PLAN)
  next(x for x in p['nodes'] if x['id']=='S17')['axioms']['invariants'][0]+=' Additional real invariant.'
  self.assertNotEqual(before,contract_digest(n,self.root,p))
 def test_R05_every_normative_input_binds_release(self):
  n=BY['S25-W1-T2'];base=contract_digest(n,self.root,PLAN)
  for name in n['normative_files']:
   f=self.root/name;old=f.read_bytes();f.write_bytes(old+b'\nchanged')
   self.assertNotEqual(base,contract_digest(n,self.root,PLAN),name);f.write_bytes(old)
 def test_R05_unrelated_notes_and_other_owner_do_not_invalidate(self):
  n=BY['S17-W1-T2'];a=contract_digest(n,self.root,PLAN)
  (self.root/'NOTES.md').write_text('editorial note')
  s=load(self.root/'SURFACES.json');next(x for x in s['surfaces'] if x['owner']=='S12')['classification_reason']+=' Clarification for settings.';self.write('SURFACES.json',s)
  self.assertEqual(a,contract_digest(n,self.root,PLAN))
 def test_H02_invalid_gate_shapes_fail_early(self):
  for value in [None,[],42,'P01',['UNKNOWN_GATE'],['P01','P01'],[{}],[True]]:
   p=copy.deepcopy(PLAN);n=next(x for x in p['nodes'] if x['id']=='S25-W1-T2');n['required_performance_gates']=value
   self.assertTrue(validate(p),str(value))
 def test_H02_registry_and_final_shape_fail_early(self):
  for field,value in [('gate_registry',None),('gate_registry',{'performance':[{}]}),('final_gate_policy',None),('final_gate_policy',{'task':'S25-W1-T2','performance':[{}]})]:
   p=copy.deepcopy(PLAN);p[field]=value;self.assertTrue(validate(p))
 def test_R08_total_concurrency_zero_to_oversubscribed(self):
  for running in range(6):
   p={'tasks':{n['id']:{'status':'PASS'} for n in PLAN['nodes'] if n['kind']=='task'},'external':{}}
   # Re-open independent tasks with the pilot and required parents delivered.
   for i in ['S07-W1-T1','S08-W1-T1','S09-W1-T1','S10-W1-T1','S12-W1-T1','S13-W1-T1','S14-W1-T1']:
    p['tasks'][i]={'status':'PENDING'};p['tasks'][i[:-1]+'2']={'status':'PENDING'}
   for i in ['S07-W1-T1','S08-W1-T1','S09-W1-T1','S10-W1-T1','S12-W1-T1'][:running]:p['tasks'][i]={'status':'RUNNING'}
   r=select(PLAN,p,check_evidence=False,jobs=4)
   self.assertEqual(len(r['selected']),max(0,4-running))
   self.assertEqual(r['running_count'],running);self.assertEqual(r['over_capacity'],running>4)
 def test_R08_benchmark_requires_quiet_host(self):
  p={'tasks':{n['id']:{'status':'PASS'} for n in PLAN['nodes'] if n['kind']=='task'},'external':{}}
  p['tasks']['S23-W1-T1']={'status':'PENDING'};p['tasks']['S24-W1-T1']={'status':'RUNNING'}
  # Preparation is no longer a host reservation; actual sampling still is.
  from select_work import collection_preflight
  r=select(PLAN,p,check_evidence=False);self.assertIn('S23-W1-T1',[n['id'] for n in r['selected']])
  p['tasks']['S23-W1-T2']={'status':'RUNNING','phase':'work'}
  self.assertFalse(collection_preflight(PLAN,p,'S23-W1-T2')['may_record_collect'])
  p['tasks']['S24-W1-T1']['phase']='review'
  self.assertTrue(collection_preflight(PLAN,p,'S23-W1-T2')['may_record_collect'])
 def test_R06_discovery_and_pilot_are_historical_not_current_acceptance(self):
  snap={'ancestors':['a'*40],'changed_since':{'a'*40:['packages/app/src/app.tsx']},'dirty':[]}
  self.assertEqual(source_errors(BY['S01-W1-T1'],{'head':'a'*40},snap),[])
  self.assertEqual(source_errors(BY['S25-W0-T2'],{'head':'a'*40},snap),[])
  self.assertEqual(source_errors(BY['S06-W1-T1'],{'head':'a'*40},snap),[])
  self.assertTrue(source_errors(BY['S25-W1-T2'],{'head':'a'*40},snap))
 def test_R06_final_delivery_document_does_not_erase_pilot(self):
  snap={'ancestors':['a'*40],'changed_since':{'a'*40:['specs/orchestra-visual/DELIVERY.md']},'dirty':[]}
  self.assertEqual(source_errors(BY['S25-W0-T2'],{'head':'a'*40},snap),[])
 def test_R06_owned_output_and_final_gate_changes_still_invalidate(self):
  snap={'ancestors':['a'*40],'changed_since':{'a'*40:['packages/app/src/pages/layout-new.tsx']},'dirty':[]}
  self.assertTrue(source_errors(BY['S06-W1-T1'],{'head':'a'*40},snap))
  self.assertTrue(source_errors(BY['S06-W1-T2'],{'head':'a'*40},snap))
 def test_R06_invalid_receipt_selects_repair_not_global_deadlock(self):
  r=select(PLAN,{'tasks':{'S01-W1-T1':{'status':'PASS','head':'a'*40,'evidence':'absent.json'}},'external':{}},root=self.root)
  self.assertEqual(r['status'],'REPAIR_REQUIRED');self.assertEqual(r['selected'][0]['id'],'S01-W1-T1')

class GitRepairs(Temp):
 def setUp(self):
  super().setUp();self.repo=Path(self.temp.name)/'repo';self.repo.mkdir()
  git(self.repo,'init','-q');git(self.repo,'config','user.email','synthetic@example.invalid');git(self.repo,'config','user.name','Synthetic Test')
  self.put('packages/app/src/pages/session/tasks-data.ts','initial')
  self.put('packages/app/src/app.tsx','initial');self.put('user.txt','saved')
  self.commit();self.base=git(self.repo,'rev-parse','HEAD').strip()
 def put(self,p,t):
  path=self.repo/p;path.parent.mkdir(parents=True,exist_ok=True);path.write_text(t)
 def commit(self):
  git(self.repo,'add','.');git(self.repo,'commit','-qm','synthetic fixture');return git(self.repo,'rev-parse','HEAD').strip()
 def start(self,name='baseline.json'):
  self.write(name,snapshot(self.repo));return name
 def simple(self,id,base,paths):
  head=git(self.repo,'rev-parse','HEAD').strip()
  return {'id':id,'head':head,'paths_changed':paths,'source':{'baseline_file':base,'commits':git(self.repo,'rev-list','--reverse','--topo-order',load(self.root/base)['head']+'..'+head).splitlines()},'artifacts':{base:file_hash(self.root/base)}}
 def test_R03_actual_new_ui_requires_classification(self):
  c=load(self.root/'CENSUS.json');self.assertTrue(any('unclassified' in x for x in check(PLAN,SURFACES,c,self.repo)))
  c['files']=[{'path':'packages/app/src/app.tsx','disposition':'migrate','owner':'S25','surface_ids':['UI16'],'reason':'Real synthetic root mapped to integration owner.','source':'Synthetic tracked path, not a product audit.'}]
  self.assertEqual(check(PLAN,SURFACES,c,self.repo),[])
  self.put('packages/app/src/pages/new-surface.tsx','new')
  self.assertTrue(any('new-surface' in x for x in check(PLAN,SURFACES,c,self.repo)))
 def test_R03_inherited_ui_valid_with_coverage_and_wrong_owner_rejected(self):
  c=load(self.root/'CENSUS.json');c['files']=[{'path':'packages/app/src/app.tsx','disposition':'inherit','owner':None,'surface_ids':['UI16'],'reason':'Inherits shell theme and is covered as native host.','source':'Synthetic evidence.'}]
  self.assertEqual(check(PLAN,SURFACES,c,self.repo),[])
  c['files'][0].update(disposition='migrate',owner='S06');self.assertTrue(check(PLAN,SURFACES,c,self.repo))
 def test_R07_real_out_of_scope_omission_rejected(self):
  b=self.start();self.put('packages/core/foreign.ts','unallowed');self.commit()
  r=self.simple('S17-W1-T1',b,[]);errs=footprint(BY[r['id']],r,self.root,self.repo)
  self.assertTrue(any('footprint' in x for x in errs));self.assertTrue(any('outside owner' in x for x in errs))
 def test_R07_valid_owned_commit_and_declared_extra(self):
  b=self.start();p='packages/app/src/pages/session/tasks-data.ts';self.put(p,'changed');self.commit()
  r=self.simple('S17-W1-T1',b,[p]);self.assertEqual(footprint(BY[r['id']],r,self.root,self.repo),[])
  r['paths_changed'].append('user.txt');self.assertTrue(footprint(BY[r['id']],r,self.root,self.repo))
 def test_R07_rename_checks_both_paths(self):
  b=self.start();p='packages/app/src/pages/session/tasks-data.ts';git(self.repo,'mv',p,'outside.ts');self.commit()
  r=self.simple('S17-W1-T1',b,[p,'outside.ts']);self.assertTrue(any('outside owner' in x for x in footprint(BY[r['id']],r,self.root,self.repo)))
 def test_R07_preexisting_dirty_is_preserved_not_attributed(self):
  self.put('user.txt','user unsaved work');b=self.start();p='packages/app/src/pages/session/tasks-data.ts';self.put(p,'changed')
  git(self.repo,'add',p);git(self.repo,'commit','-qm','task only')
  r=self.simple('S17-W1-T1',b,[p]);self.assertEqual(footprint(BY[r['id']],r,self.root,self.repo),[])
  self.assertEqual((self.repo/'user.txt').read_text(),'user unsaved work')
  self.put('user.txt','overwritten');self.assertTrue(footprint(BY[r['id']],r,self.root,self.repo))
 def test_R07_preexisting_index_is_preserved(self):
  self.put('user.txt','staged user');git(self.repo,'add','user.txt');b=self.start()
  git(self.repo,'reset','-q','HEAD','--','user.txt') # synthetic negative control only
  r=self.simple('S17-W1-T1',b,[]);self.assertTrue(any('preexisting' in x for x in footprint(BY[r['id']],r,self.root,self.repo)))
 def test_R07_interleaved_foreign_commit_rejected(self):
  b=self.start();p='packages/app/src/pages/session/tasks-data.ts';self.put(p,'changed');self.commit();self.put('foreign.ts','other owner');self.commit()
  r=self.simple('S17-W1-T1',b,[p,'foreign.ts']);self.assertTrue(any('outside owner' in x for x in footprint(BY[r['id']],r,self.root,self.repo)))
 def test_R04_codegen_requires_grant_command_and_recorded_outputs(self):
  b=self.start();p='packages/client/src/generated/synthetic.ts';self.put(p,'generated');self.commit()
  r=self.simple('S19-W2-T1',b,[p]);self.assertTrue(footprint(BY[r['id']],r,self.root,self.repo))
  plan=load(self.root/'PLAN.json');plan['shared_write_leases'][0]['status']='local-command-footprint-verified';self.write('PLAN.json',plan)
  r['commands']=[{'command':cmd,'cwd':'packages/client','exit_code':0} for cmd in ['bun run generate','bun run check:generated']]
  r['source']['codegen']={'manual_edits':False,'outputs':[p]};self.assertEqual(footprint(BY[r['id']],r,self.root,self.repo),[])
  r['source']['codegen']['outputs']=[];self.assertTrue(footprint(BY[r['id']],r,self.root,self.repo))
 def test_R04_codegen_lease_covers_actual_prefixes_and_serializes(self):
  from validate_evidence import matches
  for i in ['S19-W2-T1','S20-W2-T1']:
   self.assertTrue(matches(BY[i],'packages/client/src/generated/new.ts'))
   self.assertTrue(matches(BY[i],'packages/client/src/generated-effect/new.ts'))
   self.assertFalse(matches(BY[i],'packages/core/arbitrary.ts'))
  self.assertTrue(conflict(BY['S19-W2-T1'],BY['S20-W2-T1']))
 def test_R07_verified_import_merge_allowed_but_conflict_rewrite_rejected(self):
  integration_base=self.start('integration-base.json');main=git(self.repo,'branch','--show-current').strip()
  git(self.repo,'switch','-qc','task-lane');childbase=self.start('child-base.json');path='packages/app/src/pages/session/tasks-data.ts';self.put(path,'verified child');childhead=self.commit()
  helper=base_tests.EvidenceTests();child=helper.receipt(self.root,'S17-W1-T1');child.update(self.simple('S17-W1-T1',childbase,[path]));child['review']['head']=childhead;child=seal(child,self.root);self.write('child-receipt.json',child)
  git(self.repo,'switch','-q',main);self.put('packages/app/src/app.tsx','integration');self.commit();git(self.repo,'merge','--no-ff','-qm','verified import','task-lane')
  r=self.simple('S25-W1-T1',integration_base,[path,'packages/app/src/app.tsx']);r['source']['imported_receipts']=['child-receipt.json'];r['artifacts']['child-receipt.json']=file_hash(self.root/'child-receipt.json')
  self.assertEqual(footprint(BY[r['id']],r,self.root,self.repo),[])
  self.put(path,'unauthorized conflict edit');self.commit();new=self.simple('S25-W1-T1',integration_base,r['paths_changed']);new['source']['imported_receipts']=r['source']['imported_receipts'];new['artifacts'].update(r['artifacts'])
  self.assertTrue(any('imported version' in x for x in footprint(BY[new['id']],new,self.root,self.repo)))
 def external(self,installed=False):
  (self.root/'external.log').write_text('SYNTHETIC public positive and negative verification, not product proof')
  head=git(self.repo,'rev-parse','HEAD').strip();binding={'kind':'same-repository','repo':'gmhelmold/HuGR-Orchestra','head':head}
  if installed:
   self.put('vendor/synthetic.bin','installed fixture');self.put('synthetic.lock','locked fixture')
   binding={'kind':'installed-artifact','artifact':{'path':'vendor/synthetic.bin','sha256':file_hash(self.repo/'vendor/synthetic.bin')},'lockfile':{'path':'synthetic.lock','sha256':file_hash(self.repo/'synthetic.lock')}}
  proof={'schema_version':1,'kind':'external-capability-proof','ref':'#109','status':'PASS','candidate_head':head,'binding':binding,'public_path':'synthetic public path','tests':[{'case':case,'command':'synthetic test','cwd':'isolated','exit_code':0,'log':'external.log'} for case in ['public-positive','public-negative']],'review_file':'external.log','artifacts':{'external.log':file_hash(self.root/'external.log')}}
  self.write('external.json',proof);return proof,{'status':'PASS','evidence':'external.json','evidence_sha256':file_hash(self.root/'external.json')}
 def test_R09_current_ancestry_public_proof_valid(self):
  _,r=self.external();self.assertEqual(external_proof('#109',r,self.root,self.repo),[]);self.assertTrue(external_proof('#109',r,self.root,None))
 def test_R09_unrelated_source_and_changed_receipt_rejected(self):
  p,r=self.external();p['binding']['head']='f'*40;self.write('external.json',p);r['evidence_sha256']=file_hash(self.root/'external.json');self.assertTrue(external_proof('#109',r,self.root,self.repo))
  _,r=self.external();(self.root/'external.json').write_text('{}');self.assertTrue(external_proof('#109',r,self.root,self.repo))
 def test_R09_installed_artifact_valid_and_changed_or_removed_fails(self):
  _,r=self.external(True);self.assertEqual(external_proof('#109',r,self.root,self.repo),[])
  self.put('vendor/synthetic.bin','changed');self.assertTrue(external_proof('#109',r,self.root,self.repo))
  (self.repo/'vendor/synthetic.bin').unlink();self.assertTrue(external_proof('#109',r,self.root,self.repo))
 def test_R09_missing_public_test_and_candidate_drift_rejected(self):
  p,r=self.external();p['tests']=p['tests'][:1];self.write('external.json',p);r['evidence_sha256']=file_hash(self.root/'external.json');self.assertTrue(external_proof('#109',r,self.root,self.repo))
  _,r=self.external();self.put('change.txt','newcandidate');self.commit();self.assertTrue(external_proof('#109',r,self.root,self.repo))

class CaptureRepairs(Temp):
 def setUp(self):
  super().setUp();self.r=base_tests.EvidenceTests().receipt(self.root,'S25-W1-T2');base_tests.EvidenceTests().verified_categories(self.root,self.r)
 def errs(self):return validate_receipt(BY[self.r['id']],self.r,self.root)
 def reseal_manifest(self,manifest):self.write('captures.json',manifest);self.r=seal(self.r,self.root)
 def test_R10_full_synthetic_matrix_passes_structure_only(self):self.assertEqual(self.errs(),[])
 def test_R10_one_pixel_is_rejected(self):
  for name in self.r['visual']['screenshots']:(self.root/name).write_bytes(png(1,1))
  self.r=seal(self.r,self.root);self.assertTrue(any('dimensions' in x for x in self.errs()))
 def test_R10_missing_settings_error_viewport_or_native_is_rejected(self):
  original=load(self.root/'captures.json');settings={r['id'] for r in SURFACES['surfaces'] if r['owner']=='S12'}
  filters=[lambda r:r['surface_id'] in settings,lambda r:r['state_id']=='error',lambda r:r['viewport']==[1366,768],lambda r:r['host']=='electron']
  for f in filters:
   m=copy.deepcopy(original);m['captures']=[r for r in m['captures'] if not f(r)];self.reseal_manifest(m);self.assertTrue(any('coverage incomplete' in x for x in self.errs()))
 def test_R10_wrong_native_producer_rejected(self):
  m=load(self.root/'captures.json');next(r for r in m['captures'] if r['host']=='electron')['producer']='playwright';self.reseal_manifest(m);self.assertTrue(any('native composition' in x for x in self.errs()))
 def test_R10_wrong_build_and_master_rejected(self):
  for name,val in [('build_sha256','c'*64),('master_sha256','d'*64)]:
   m=load(self.root/'captures.json');m[name]=val;self.reseal_manifest(m);self.assertTrue(any('binding mismatch' in x for x in self.errs()))
 def test_R10_duplicate_capture_rejected(self):
  m=load(self.root/'captures.json');m['captures'].append(m['captures'][0]);self.reseal_manifest(m);self.assertTrue(any('duplicate capture' in x for x in self.errs()))
 def test_H01_manual_PASS_over_bad_observations_rejected(self):
  raw=load(self.root/'raw.json');ob=next(x for x in raw['observations'] if x['metric']=='input_paint_p95')
  for pair in ob['pairs']:pair['candidate']=[9999]*len(pair['candidate'])
  self.write('raw.json',raw);self.r=seal(self.r,self.root);self.assertTrue(any('recalculated' in x or 'raw' in x for x in self.errs()))

class PerformanceRepairs(Temp):
 def setUp(self):super().setUp();self.b=load(self.root/'BUDGETS.json');self.raw=raw_fixture(self.root,['P03','P11','P12'])
 def result(self):return evaluate(self.raw,self.b,['P03','P11','P12'])
 def test_H01_numeric_positive_control(self):self.assertEqual(self.result()['status'],'PASS')
 def test_H01_overbudget(self):
  for p in self.raw['observations'][0]['pairs']:p['candidate']=[9999]*len(p['candidate'])
  self.assertEqual(self.result()['status'],'FAIL')
 def test_H01_insufficient_samples(self):
  for p in self.raw['observations'][0]['pairs']:p['candidate']=[1]
  self.assertEqual(self.result()['status'],'FAIL')
 def test_H01_missing_baseline_environment_or_observation(self):
  original=copy.deepcopy(self.raw)
  for change in ['baseline_environment','observations','baseline_head']:
   self.raw=copy.deepcopy(original);self.raw.pop(change);self.assertEqual(self.result()['status'],'FAIL')
 def test_H01_NaN_and_negative(self):
  for val in [float('nan'),float('inf'),-1,True]:
   self.raw['observations'][0]['pairs'][0]['candidate'][0]=val;self.assertEqual(self.result()['status'],'FAIL')
 def test_H01_environment_workload_and_capabilities_mismatch(self):
  original=copy.deepcopy(self.raw)
  self.raw['environment']['os']='different';self.assertEqual(self.result()['status'],'FAIL')
  self.raw=copy.deepcopy(original);self.raw['profiles']['P1']['sessions']=1;self.assertEqual(self.result()['status'],'FAIL')
  self.raw=copy.deepcopy(original);self.raw['candidate_features_sha256']='f'*64;self.assertEqual(self.result()['status'],'FAIL')
 def test_H01_one_noisy_pair_is_inconclusive_not_PASS(self):
  for pair in self.raw['observations'][0]['pairs'][:1]:pair['candidate']=[1000]*len(pair['candidate'])
  self.assertEqual(self.result()['status'],'FAIL')
 def test_H01_malformed_budget_rule_rejected(self):
  for mode in ['unknown',None,42]:
   b=copy.deepcopy(self.b);b['metrics'][0]['mode']=mode;self.assertEqual(evaluate(self.raw,b,['P03'])['status'],'FAIL')
 def test_H01_unknown_or_untyped_gate_rejected(self):
  for gates in [None,[],[None],[{}],['UNKNOWN'],['P03','P03']]:self.assertEqual(evaluate(self.raw,self.b,gates)['status'],'FAIL')

class PNGRepairs(Temp):
 def test_H03_valid_png_decodes(self):
  f=self.root/'x.png';f.write_bytes(png(1024,768));self.assertEqual(decode_png(f)['width'],1024)
 def test_H03_truncated_missing_payload_CRC_dimension_and_filter(self):
  valid=png(4,3)
  def chunk(k,b):return struct.pack('>I',len(b))+k+b+struct.pack('>I',zlib.crc32(k+b)&0xffffffff)
  badfilter=valid[:33]+chunk(b'IDAT',zlib.compress((b'\x05'+b'0'*12)*3))+chunk(b'IEND',b'')
  absurd=b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',99999,3,8,2,0,0,0))+chunk(b'IEND',b'')
  for data in [valid[:24],valid[:33]+chunk(b'IEND',b''),valid[:-5],valid[:20]+bytes([valid[20]^1])+valid[21:],absurd,badfilter]:
   f=self.root/'bad.png';f.write_bytes(data)
   with self.assertRaises(ValueError):decode_png(f)

if __name__=='__main__':unittest.main()
