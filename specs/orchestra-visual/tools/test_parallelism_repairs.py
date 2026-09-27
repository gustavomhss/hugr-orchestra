"""PA-01..06 regressions. Every scenario is synthetic; no Orchestra benchmark is run."""
import copy
import json
import tempfile
import subprocess
import sys
import unittest
from pathlib import Path
from effective_contract import load, digest, manifest
from validate_plan import ROOT, validate, inspect
from select_work import select, dependencies, collection_preflight, conflict
from evaluate_performance import evaluate
from visual_coverage import required_captures, validate_captures
from test_support import install, raw_fixture, png
import test_contract as fixtures

PLAN = load(ROOT/'PLAN.json')
BY = {n['id']: n for n in PLAN['nodes']}
BUDGETS = load(ROOT/'BUDGETS.json')


def progress_done():
    return {'tasks': {n['id']: {'status': 'PASS'} for n in PLAN['nodes'] if n['kind'] == 'task'},
            'external': {e['ref']: {'status': 'PASS'} for n in PLAN['nodes'] for e in n.get('external_requires', [])}}


def predecessors(ident):
    found=set();pending=list(dependencies(BY,ident))
    while pending:
        i=pending.pop()
        if i in found:continue
        found.add(i);pending.extend(dependencies(BY,i))
    return found


class ParallelismRepairs(unittest.TestCase):
    def test_PA01_wait_exit_code_does_not_authorize_collection(self):
        with tempfile.TemporaryDirectory() as d:
            f=Path(d)/'progress.json'
            f.write_text(json.dumps({'tasks':{'S23-W1-T2':{'status':'RUNNING'},'S09-W1-T1':{'status':'RUNNING'}}}))
            r=subprocess.run([sys.executable,str(ROOT/'tools/select_work.py'),'--collect','S23-W1-T2','--progress',str(f)],capture_output=True,text=True)
            self.assertEqual(r.returncode,2)
            self.assertEqual(json.loads(r.stdout)['status'],'WAIT')
    def test_PA01_malformed_preflight_progress_fails_closed(self):
        for p in [None,{'tasks':{'X':42}},{'tasks':{'S23-W1-T2':{'status':'RUNNING','phase':'typo'}}}]:
            self.assertFalse(collection_preflight(PLAN,p,'S23-W1-T2')['may_record_collect'])
    def test_PA01_no_task_wide_benchmark_reservations(self):
        self.assertFalse(any('exclusive-benchmark-hardware' in n.get('resource_locks',[]) for n in BY.values()))
    def test_PA01_release_only_soak(self):
        users=[n['id'] for n in BY.values() if 'P10' in n.get('required_performance_gates',[])]
        self.assertEqual(set(users),{'S23-W1-T2','S25-W1-T2'})
    def test_PA01_preparation_and_review_do_not_reserve(self):
        p=progress_done();p['tasks']['S07-W1-T1']={'status':'PENDING'};p['tasks']['S07-W1-T2']={'status':'PENDING'}
        p['tasks']['S23-W1-T2']={'status':'RUNNING','phase':'review'}
        self.assertIn('S07-W1-T1',[x['id'] for x in select(PLAN,p,check_evidence=False)['selected']])
    def test_PA01_active_collection_defers_new_work(self):
        p=progress_done();p['tasks']['S07-W1-T1']={'status':'PENDING'}
        p['tasks']['S23-W1-T2']={'status':'RUNNING','phase':'collect'}
        self.assertEqual(select(PLAN,p,check_evidence=False)['selected'],[])
    def test_PA01_collection_preflight_blocks_local_work(self):
        p={'tasks':{'S23-W1-T2':{'status':'RUNNING'},'S09-W1-T1':{'status':'RUNNING'}}}
        self.assertFalse(collection_preflight(PLAN,p,'S23-W1-T2')['may_record_collect'])
        p['tasks']['S09-W1-T1']['phase']='review'
        self.assertTrue(collection_preflight(PLAN,p,'S23-W1-T2')['may_record_collect'])
    def test_PA01_collection_on_pending_task_is_denied(self):
        self.assertFalse(collection_preflight(PLAN,{'tasks':{}},'S23-W1-T2')['may_record_collect'])
    def test_PA01_overlapping_or_malformed_collection_is_rejected(self):
        for phase in ('collect','bad-phase'):
            p={'tasks':{'S23-W1-T2':{'status':'RUNNING','phase':'collect'},'S25-W0-T2':{'status':'RUNNING','phase':phase}}}
            self.assertEqual(select(PLAN,p,check_evidence=False)['status'],'FAIL')
    def test_PA01_illegal_task_wide_lock_fails_contract(self):
        p=copy.deepcopy(PLAN);next(n for n in p['nodes'] if n['id']=='S23-W1-T2')['resource_locks']=['exclusive-benchmark-hardware']
        self.assertTrue(validate(p))
    def test_PA02_no_supplier_T2_needed_for_shell_T1(self):
        deps=predecessors('S06-W1-T1')
        for i in ['S03-W1-T2','S04-W1-T2','S05-W1-T2','S22-W1-T2']:self.assertNotIn(i,deps)
    def test_PA02_copy_can_run_before_primitives(self):
        self.assertNotIn('S04-W1-T1',predecessors('S22-W1-T1'))
        self.assertIn('S04',predecessors('S22-W1-T2'))
    def test_PA02_diff_develops_on_existing_contract_then_verifies_timeline(self):
        self.assertNotIn('S09-W1-T1',predecessors('S11-W1-T1'))
        self.assertIn('S09-W1-T1',predecessors('S11-W1-T2'))
    def test_PA02_ready_pilot_is_not_starved_by_plan_order(self):
        p=progress_done()
        for i in ['S25-W0-T1','S25-W0-T2','S06-W1-T2','S15-W1-T2','S17-W1-T1','S17-W1-T2']:p['tasks'][i]={'status':'PENDING'}
        r=select(PLAN,p,check_evidence=False,jobs=1)
        self.assertEqual(r['selected'][0]['id'],'S25-W0-T1')
    def test_PA02_missing_input_still_blocks_pilot(self):
        p=progress_done()
        for i in ['S03-W1-T1','S25-W0-T1','S25-W0-T2']:p['tasks'][i]={'status':'PENDING'}
        r=select(PLAN,p,check_evidence=False)
        self.assertNotIn('S25-W0-T1',[x['id'] for x in r['selected']])
        self.assertIn('S03-W1-T1',[x['id'] for x in r['selected']])
    def test_PA02_same_codegen_lease_preserved(self):
        self.assertTrue(conflict(BY['S19-W2-T1'],BY['S20-W2-T1']))
        self.assertIn('public-api-registration-and-client-codegen',BY['S19-W2-T1']['resource_locks'])
    def test_PA02_all_66_tasks_finish_with_failed_gate_retry(self):
        p={'tasks':{},'external':progress_done()['external']};finished=[]
        for step in range(100):
            r=select(PLAN,p,check_evidence=False,jobs=4)
            if r['completed_tasks']==66:break
            self.assertTrue(r['selected'],r)
            for item in r['selected']:
                i=item['id']
                if i=='S23-W1-T2' and not p.get('negative_tried'):
                    p['tasks'][i]={'status':'FAIL'};p['negative_tried']=True
                else:p['tasks'][i]={'status':'PASS'};finished.append(i)
        self.assertEqual(r['completed_tasks'],66)
        self.assertLess(finished.index('S25-W0-T2'),finished.index('S07-W1-T1'))
        self.assertLess(finished.index('S25-W1-T1'),finished.index('S23-W1-T2'))
        self.assertLess(finished.index('S23-W1-T2'),finished.index('S25-W1-T2'))
    def test_PA03_candidate_stage_does_not_require_future_gate_closure(self):
        for i in ['S25','S25-W1','S25-W1-T1']:
            qs=BY[i]['axioms']['quality_standards']
            self.assertFalse(any(v.startswith('Evidência P01–P12 no SHA final') or v.startswith('GateQ01–Q16 em todo app') for v in qs))
        self.assertIn('S23',predecessors('S25-W1-T2'))
        self.assertNotIn('S23',predecessors('S25-W1-T1'))
    def test_PA03_collection_preparation_not_release_claim(self):
        self.assertEqual(BY['S23-W1-T1']['verification_tier'],'local')
        self.assertEqual(BY['S23-W1-T2']['verification_tier'],'release')
    def test_PA03_changed_sampling_contract_invalidates_proof(self):
        p=copy.deepcopy(PLAN);n=next(n for n in p['nodes'] if n['id']=='S17-W1-T2')
        before=manifest(n,ROOT,p);n['verification_tier']='local'
        self.assertNotEqual(before,manifest(n,ROOT,p))


class PerformancePolicyRepairs(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup);self.root=Path(self.tmp.name);install(self.root)
    def result(self,raw,gates):return evaluate(raw,BUDGETS,gates)
    def raw(self,gates):return raw_fixture(self.root,gates)
    def fill(self,raw,metric,base,candidate):
        for ob in raw['observations']:
            if ob['metric']==metric:
                for pair in ob['pairs']:pair['baseline']=[base]*len(pair['baseline']);pair['candidate']=[candidate]*len(pair['candidate'])
    def test_PA01_static_two_manifests_no_timing_trials(self):
        raw=self.raw(['P01']);raw['quiet_host']=False
        self.assertEqual(raw['observations'],[])
        self.assertEqual(self.result(raw,['P01'])['status'],'PASS')
    def test_PA01_missing_static_manifest_fails(self):
        raw=self.raw(['P01']);del raw['artifact_manifests']['candidate']
        self.assertEqual(self.result(raw,['P01'])['status'],'FAIL')
    def test_PA01_static_build_mismatch_and_size_limit_fail(self):
        raw=self.raw(['P01']);raw['artifact_manifests']['candidate']['build_sha256']='f'*64
        self.assertEqual(self.result(raw,['P01'])['status'],'FAIL')
        raw=self.raw(['P01']);raw['artifact_manifests']['candidate']['initial_chunks']=[{'path':'app.js','kind':'js','sha256':'a'*64,'gzip_bytes':61441}]
        self.assertEqual(self.result(raw,['P01'])['status'],'FAIL')
    def test_PA01_new_dependency_and_malformed_size_fail(self):
        raw=self.raw(['P01']);raw['artifact_manifests']['candidate']['runtime_dependencies']=['new-runtime']
        self.assertEqual(self.result(raw,['P01'])['status'],'FAIL')
        raw=self.raw(['P01']);raw['artifact_manifests']['candidate']['initial_chunks']=[{'path':'app.js','kind':'js','sha256':'a'*64,'gzip_bytes':-1}]
        self.assertEqual(self.result(raw,['P01'])['status'],'FAIL')
    def test_PA01_temporal_collection_still_requires_quiet(self):
        raw=self.raw(['P03']);raw['quiet_host']=False
        self.assertEqual(self.result(raw,['P03'])['status'],'FAIL')
    def test_PA04_negative_memory_slope_passes(self):
        raw=self.raw(['P10']);self.fill(raw,'residual_slope',-20,-1000)
        self.assertEqual(self.result(raw,['P10'])['status'],'PASS')
    def test_PA04_zero_passes_sustained_positive_fails(self):
        raw=self.raw(['P10']);self.fill(raw,'residual_slope',0,0)
        self.assertEqual(self.result(raw,['P10'])['status'],'PASS')
        self.fill(raw,'residual_slope',0,1)
        self.assertEqual(self.result(raw,['P10'])['status'],'FAIL')
    def test_PA04_mixed_noise_is_inconclusive_not_PASS(self):
        raw=self.raw(['P10']);ob=next(x for x in raw['observations'] if x['metric']=='residual_slope')
        for i,p in enumerate(ob['pairs']):p['candidate']=[(-100 if i%2 else 100)]
        r=self.result(raw,['P10']);self.assertEqual(r['status'],'FAIL')
        self.assertEqual(next(x for x in r['gates'][0]['metrics'] if x['id']=='residual_slope')['status'],'INCONCLUSIVE')
    def test_PA04_wrong_units_NaN_and_missing_samples_fail(self):
        for mode in ('unit','NaN','empty'):
            raw=self.raw(['P10']);ob=next(x for x in raw['observations'] if x['metric']=='residual_slope')
            if mode=='unit':ob['unit']='bytes/minute'
            if mode=='NaN':ob['pairs'][0]['candidate']=[float('nan')]
            if mode=='empty':ob['pairs']=[]
            self.assertEqual(self.result(raw,['P10'])['status'],'FAIL')
    def test_PA05_large_regressions_below_absolute_ceiling_fail(self):
        for name,base,value in [('input_paint_p95',8,49),('hot_tab',10,90),('feedback',8,40),('input_paint_p99',10,90)]:
            raw=self.raw(['P03']);self.fill(raw,name,base,value)
            self.assertEqual(self.result(raw,['P03'])['status'],'FAIL',name)
    def test_PA05_small_noise_and_improvement_pass(self):
        for base,value in [(8,9),(20,10)]:
            raw=self.raw(['P03']);self.fill(raw,'input_paint_p95',base,value)
            self.assertEqual(self.result(raw,['P03'])['status'],'PASS')
    def test_PA05_slow_baseline_cannot_override_absolute_ceiling(self):
        raw=self.raw(['P03']);self.fill(raw,'input_paint_p95',90,51)
        self.assertEqual(self.result(raw,['P03'])['status'],'FAIL')


class ConsumerCoverageRepairs(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup);self.root=Path(self.tmp.name);install(self.root)
    def test_PA06_mandatory_visual_tasks_have_nonempty_targets(self):
        for n in BY.values():
            if n.get('evidence_requirements',{}).get('visual')=='required':self.assertTrue(required_captures(n,self.root),n['id'])
    def test_PA06_theme_and_governance_have_specific_consumers(self):
        for i,surface,state in [('S03-W1-T2','UI75','first-paint-dark'),('S20-W1-T2','UI76','unavailable'),('S20-W2-T2','UI76','stale-denied')]:
            rows=required_captures(BY[i],self.root)
            self.assertTrue(any(r['surface_id']==surface and r['state_id']==state for r in rows))
    def test_PA06_consumer_removal_fails_not_empty_success(self):
        data=load(self.root/'SURFACES.json');data['surfaces']=[r for r in data['surfaces'] if r['id']!='UI76'];(self.root/'SURFACES.json').write_text(json.dumps(data))
        with self.assertRaises(ValueError):required_captures(BY['S20-W1-T2'],self.root)
    def test_PA06_state_removal_and_empty_binding_fail(self):
        s=load(self.root/'SURFACES.json');next(r for r in s['surfaces'] if r['id']=='UI76')['states'].remove('unavailable');(self.root/'SURFACES.json').write_text(json.dumps(s))
        with self.assertRaises(ValueError):required_captures(BY['S20-W1-T2'],self.root)
        install(self.root);c=load(self.root/'COVERAGE.json');c['task_consumer_states']['S20-W1-T2']=[];(self.root/'COVERAGE.json').write_text(json.dumps(c))
        with self.assertRaises(ValueError):required_captures(BY['S20-W1-T2'],self.root)
    def test_PA06_unrelated_capture_and_missing_state_rejected(self):
        n=BY['S20-W1-T2'];value=fixtures.EvidenceTests().receipt(self.root,n['id']);fixtures.EvidenceTests().verified_categories(self.root,value)
        cm=load(self.root/'captures.json');cm['captures'][0]['surface_id']='UNRELATED'
        errors=validate_captures(n,cm,self.root,value['head'],'b'*64,lambda x:self.root/x)
        self.assertTrue(errors)
        cm=load(self.root/'captures.json');cm['captures'].pop()
        self.assertTrue(validate_captures(n,cm,self.root,value['head'],'b'*64,lambda x:self.root/x))
    def test_PA06_same_capture_reuse_is_allowed_for_visible_consumers(self):
        n=BY['S20-W1-T2'];value=fixtures.EvidenceTests().receipt(self.root,n['id']);fixtures.EvidenceTests().verified_categories(self.root,value)
        cm=load(self.root/'captures.json')
        self.assertEqual(validate_captures(n,cm,self.root,value['head'],'b'*64,lambda x:self.root/x),[])
        self.assertLess(len({r['path'] for r in cm['captures']}),len(cm['captures']))

if __name__=='__main__':unittest.main()
