"""Additional negative controls; no live product measurements or GitHub mutations."""
import copy
import json
import tempfile
import unittest
from pathlib import Path
from test_contract import PLAN, SURFACES, BY
import test_contract as fixtures
from validate_plan import validate
from validate_evidence import validate_receipt, contract_digest, digest_file
from select_work import select, source_errors

class ReceiptHardening(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup)
        self.root=Path(self.tmp.name);self.helper=fixtures.EvidenceTests();self.r=self.helper.receipt(self.root)
    def errors(self):return validate_receipt(BY[self.r['id']],self.r,self.root)
    def test_missing_categories_rejected(self):
        self.r.pop('visual');self.r.pop('performance');self.assertTrue(self.errors())
    def test_invalid_category_enum_rejected(self):
        self.r['visual']={'status':'BANANA'};self.assertTrue(self.errors())
    def test_missing_native_decision_rejected(self):
        self.r.pop('native');self.assertTrue(self.errors())
    def test_null_head_diagnostic(self):
        self.r['head']=None;self.assertTrue(self.errors())
    def test_nonstring_head_diagnostic(self):
        self.r['head']=42;self.assertTrue(self.errors())
    def test_old_schema_rejected(self):
        self.r['schema_version']=1;self.assertTrue(self.errors())
    def test_changed_contract_rejected(self):
        n=copy.deepcopy(BY[self.r['id']]);n['axioms']['dod'][0]+=' new mandatory rule'
        self.assertTrue(validate_receipt(n,self.r,self.root))
    def test_artifact_content_change_rejected(self):
        (self.root/'proof.txt').write_text('different bytes');self.assertTrue(self.errors())
    def test_empty_artifact_rejected(self):
        (self.root/'proof.txt').write_text('');self.assertTrue(self.errors())
    def test_path_outside_write_scope_rejected(self):
        self.r['paths_changed']=['packages/core/src/credential.ts'];self.assertTrue(self.errors())
    def test_paths_changed_field_required(self):
        self.r.pop('paths_changed');self.assertTrue(self.errors())
    def test_expected_failure_must_be_boolean(self):
        self.r['commands'][0].update(exit_code=1,expected_failure='yes',negative_control='test');self.assertTrue(self.errors())
    def test_negative_only_commands_not_sufficient(self):
        self.r['commands'][0].update(exit_code=1,expected_failure=True,negative_control='induced fault');self.assertTrue(self.errors())
    def test_review_pass_required(self):
        self.r['review'].pop('status');self.assertTrue(self.errors())
    def test_review_wrong_revision_rejected(self):
        self.r['review']['head']='c'*40;self.assertTrue(self.errors())
    def test_mandatory_native_not_applicable_rejected(self):
        self.r=self.helper.receipt(self.root,'S25-W1-T2');self.helper.verified_categories(self.root,self.r)
        self.r['native']={'status':'NOT_APPLICABLE','reason':'No Electron hardware is available.'};self.assertTrue(self.errors())
    def test_text_named_screenshot_rejected(self):
        self.helper.verified_categories(self.root,self.r);self.r['visual']['screenshots']=['proof.txt'];self.assertTrue(self.errors())
    def test_metrics_not_json_rejected(self):
        self.helper.verified_categories(self.root,self.r);self.r['performance']['metrics_file']='proof.txt';self.assertTrue(self.errors())
    def test_gate_coverage_required(self):
        self.r=self.helper.receipt(self.root,'S25-W1-T2');self.helper.verified_categories(self.root,self.r)
        p=self.root/'metrics.json';data=json.loads(p.read_text());data['gates'].pop();p.write_text(json.dumps(data))
        self.r['artifacts']['metrics.json']=digest_file(p);self.assertTrue(self.errors())
    def test_build_mismatch_rejected(self):
        self.helper.verified_categories(self.root,self.r);self.r['visual']['build_sha256']='c'*64;self.assertTrue(self.errors())
    def test_evidence_failure_not_removed_by_hash(self):
        self.helper.verified_categories(self.root,self.r)
        p=self.root/'metrics.json';data=json.loads(p.read_text());data['gates'][0]['status']='FAIL';p.write_text(json.dumps(data));self.r['artifacts']['metrics.json']=digest_file(p)
        self.assertTrue(self.errors())
    def test_valid_fixture_remains_explicitly_synthetic(self):
        self.helper.verified_categories(self.root,self.r);self.assertEqual(self.errors(),[])

class PlanHardening(unittest.TestCase):
    def mutate(self):return copy.deepcopy(PLAN)
    def test_cross_node_criterion_id_rejected(self):
        p=self.mutate();p['nodes'][1]['criterion_ids']['dod'][0]=p['nodes'][0]['criterion_ids']['dod'][0];self.assertTrue(validate(p))
    def test_orphan_task_rejected(self):
        p=self.mutate();n=next(n for n in p['nodes'] if n['kind']=='task');pid=n['parent'];n['parent']=None
        next(a for a in p['nodes'] if a['id']==pid)['children'].remove(n['id']);self.assertTrue(validate(p))
    def test_steps_must_be_string_array(self):
        p=self.mutate();next(n for n in p['nodes'] if n['kind']=='task')['steps']='looks like instructions';self.assertTrue(validate(p))
    def test_bad_children_returns_diagnostic(self):
        p=self.mutate();p['nodes'][0]['children']=None;self.assertTrue(validate(p))
    def test_unsafe_exclusion_rejected(self):
        p=self.mutate();p['nodes'][0]['exclude_paths']=['../anything'];self.assertTrue(validate(p))
    def test_empty_write_pattern_rejected(self):
        p=self.mutate();p['nodes'][0]['write_paths']=[''];self.assertTrue(validate(p))
    def test_surface_wrong_shape_rejected(self):
        self.assertTrue(validate(PLAN,{'surfaces':'everything'}))
    def test_missing_requirements_rejected(self):
        p=self.mutate();next(n for n in p['nodes'] if n['kind']=='task').pop('evidence_requirements');self.assertTrue(validate(p))

class SourceFreshness(unittest.TestCase):
    def setUp(self):
        self.node=BY['S17-W1-T2'];self.receipt={'head':'a'*40}
        self.snapshot={'head':'b'*40,'ancestors':['a'*40],'changed_since':{'a'*40:[]},'dirty':[]}
    def test_unrelated_docs_change_not_stale(self):
        self.snapshot['changed_since']['a'*40]=['README.md'];self.assertEqual(source_errors(self.node,self.receipt,self.snapshot),[])
    def test_changed_read_source_is_stale(self):
        self.snapshot['changed_since']['a'*40]=['packages/app/src/pages/session/tasks-data.ts'];self.assertTrue(source_errors(self.node,self.receipt,self.snapshot))
    def test_uncommitted_source_is_stale(self):
        self.snapshot['dirty']=['packages/app/src/pages/session/tasks-data.ts'];self.assertTrue(source_errors(self.node,self.receipt,self.snapshot))
    def test_absent_or_divergent_commit_rejected(self):
        self.snapshot['ancestors']=[];self.assertTrue(source_errors(self.node,self.receipt,self.snapshot))
    def test_final_release_watches_all_product_packages(self):
        self.snapshot['dirty']=['packages/desktop/src/main/app-dock.ts'];self.assertTrue(source_errors(BY['S25-W1-T2'],self.receipt,self.snapshot))


class AdditionalIntegrity(unittest.TestCase):
    def test_sealing_never_promotes_status(self):
        from seal_receipt import seal
        from receipt_template import template
        with tempfile.TemporaryDirectory() as d:
            value=template(PLAN,'S01-W1-T1');result=seal(value,Path(d))
            self.assertEqual(result['status'],'NOT_RUN')
            self.assertEqual(result['native']['status'],'NOT_RUN')
            self.assertEqual(result['artifacts'],{})
    def test_sealing_known_proof_hashes(self):
        from seal_receipt import seal
        with tempfile.TemporaryDirectory() as d:
            root=Path(d);value=fixtures.EvidenceTests().receipt(root);value['artifacts']={}
            result=seal(value,root)
            self.assertEqual(result['artifacts']['proof.txt'],digest_file(root/'proof.txt'))
            self.assertEqual(value['artifacts'],{})
    def test_rendered_issues_match_plan(self):
        from render_issues import render
        from validate_plan import ROOT
        for ident,text in render(PLAN).items():
            self.assertEqual((ROOT/'issues'/(ident+'.md')).read_text(),text)
    def test_reduced_github_dependencies_preserve_reachability(self):
        from github_sync import desired_relations
        from test_contract import META
        links=desired_relations(PLAN,META)
        edges={(x['issue'],x['blocked_by']) for x in links['dependencies']}
        self.assertEqual(len(links['parents']),35)
        self.assertLess(len(edges),links['coarse_edges_before_reduction'])
        def reaches(a,b,skip=None):
            seen=set();todo=[a]
            while todo:
                n=todo.pop()
                if n in seen:continue
                seen.add(n)
                for x,y in edges:
                    if (x,y)==skip or x!=n:continue
                    if y==b:return True
                    todo.append(y)
            return False
        for a,b in edges:self.assertFalse(reaches(a,b,(a,b)))
        # Core published order is unchanged despite removal of redundant edges.
        self.assertTrue(reaches(168,166))
        self.assertTrue(reaches(168,146))
        self.assertTrue(reaches(161,160))
        self.assertFalse(reaches(166,168))
    def test_git_snapshot_uses_real_local_commits(self):
        import subprocess
        from select_work import git_snapshot
        with tempfile.TemporaryDirectory() as d:
            root=Path(d)
            def git(*a):return subprocess.check_output(['git','-C',str(root),*a],text=True,stderr=subprocess.DEVNULL).strip()
            git('init');git('config','user.name','Synthetic test');git('config','user.email','test@example.invalid')
            path=root/'packages/app/src/pages/session/tasks-data.ts';path.parent.mkdir(parents=True);path.write_text('first\n')
            git('add','.');git('commit','-m','test fixture');head=git('rev-parse','HEAD')
            state={'tasks':{'S17-W1-T2':{'status':'PASS','head':head}}}
            first=git_snapshot(root,state)
            self.assertEqual(source_errors(BY['S17-W1-T2'],{'head':head},first),[])
            path.write_text('changed\n');second=git_snapshot(root,state)
            self.assertTrue(source_errors(BY['S17-W1-T2'],{'head':head},second))

class InheritedPrerequisites(unittest.TestCase):
    def test_task_cannot_drop_parent_entry_gate(self):
        plan=copy.deepcopy(PLAN)
        next(n for n in plan['nodes'] if n['id']=='S02-W1-T1')['depends_on']=[]
        result=select(plan,{'tasks':{},'external':{}},check_evidence=False)
        self.assertEqual([n['id'] for n in result['selected']],['S01-W1-T1'])
    def test_inherited_cycle_rejected(self):
        plan=copy.deepcopy(PLAN)
        next(n for n in plan['nodes'] if n['id']=='S01')['depends_on']=['S01-W1-T1']
        self.assertTrue(any('cycle' in e for e in validate(plan)))

class ProofLifecycle(unittest.TestCase):
    def test_writing_receipt_does_not_invalidate_source(self):
        snapshot={'head':'a'*40,'ancestors':['a'*40],'changed_since':{'a'*40:[]},
                  'dirty':['specs/orchestra-visual/evidence/S17/W1-T2.json',
                           'specs/orchestra-visual/progress.json']}
        self.assertEqual(source_errors(BY['S17-W1-T2'],{'head':'a'*40},snapshot),[])
    def test_contract_output_is_still_source(self):
        snapshot={'head':'a'*40,'ancestors':['a'*40],'changed_since':{'a'*40:[]},
                  'dirty':['specs/orchestra-visual/SURFACES.json']}
        self.assertTrue(source_errors(BY['S01-W1-T1'],{'head':'a'*40},snapshot))
    def test_native_gates_are_scoped_to_owner(self):
        self.assertNotIn('single-tab-close',BY['S08-W1-T2']['required_native_gates'])
        self.assertIn('single-tab-close',BY['S16-W1-T2']['required_native_gates'])
        self.assertIn('startup-theme',BY['S08-W1-T2']['required_native_gates'])
    def test_every_required_performance_task_names_its_gates(self):
        for node in PLAN['nodes']:
            if node['kind']=='task' and node['evidence_requirements']['performance']=='required':
                self.assertTrue(node.get('required_performance_gates'),node['id'])

if __name__=='__main__':unittest.main(verbosity=2)
