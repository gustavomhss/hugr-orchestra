"""EX-01/02/03 and H-01 regression controls, only in temporary Git repositories.

All evidence, including positive envelope controls, is fabricated for these tests.
No artifact from this module may be used to approve the Orchestra application.
"""
import copy
import json
import os
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

import test_contract as fixtures
from census import REQUIRED_ROOTS, check, discover, scan_roots
from effective_contract import AXIOM_APPLICATION, contract_digest, load, manifest
from seal_receipt import seal
from select_work import select
from source_proof import git, git_snapshot, snapshot, source_errors
from test_support import install
from validate_evidence import evidence_origin_errors, validate_receipt, validate_submission
from validate_plan import validate

PLAN, SURFACES, BY = fixtures.PLAN, fixtures.SURFACES, fixtures.BY
TOOLS = Path(__file__).resolve().parent


class RepairFixture(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.root = Path(temp.name)/'contracts'
        self.root.mkdir()
        install(self.root)
        self.repo = Path(temp.name)/'repo'
        self.repo.mkdir()
        git(self.repo, 'init', '-q')
        git(self.repo, 'config', 'user.name', 'Isolated Test')
        git(self.repo, 'config', 'user.email', 'test@example.invalid')
        for root in REQUIRED_ROOTS:
            (self.repo/root).mkdir(parents=True)
        self.put('packages/app/src/app.tsx', 'original\n')
        self.put('packages/app/src/pages/session/tasks-data.ts', 'original\n')
        self.commit()

    def put(self, path, value):
        file = self.repo/path
        file.parent.mkdir(parents=True, exist_ok=True)
        file.write_text(value)

    def commit(self):
        git(self.repo, 'add', '.')
        git(self.repo, 'commit', '-qm', 'isolated regression fixture')
        return git(self.repo, 'rev-parse', 'HEAD').strip()

    def write(self, path, value):
        (self.root/path).write_text(json.dumps(value, ensure_ascii=False)+'\n')

    def census(self):
        value = load(self.root/'CENSUS.json')
        value['files'] = [{'path': 'packages/app/src/app.tsx', 'disposition': 'migrate',
                           'owner': 'S25', 'surface_ids': ['UI16'],
                           'reason': 'Root application mapped to the integration owner.',
                           'source': 'Isolated regression fixture, not an application audit.'}]
        return value

    def receipt(self, ident='S17-W1-T1'):
        receipt = fixtures.EvidenceTests().receipt(self.root, ident)
        # Positive submission-envelope controls must be unmarked on purpose.
        # The enclosing test module and isolated directory remain explicitly synthetic.
        receipt.pop('synthetic', None)
        before = snapshot(self.repo)
        self.write('baseline.json', before)
        self.put('packages/app/src/pages/session/tasks-data.ts', 'reviewed change\n')
        head = self.commit()
        receipt.update(head=head, paths_changed=['packages/app/src/pages/session/tasks-data.ts'],
                       source={'baseline_file':'baseline.json', 'commits':[head]})
        if ident.startswith('S25-'):
            receipt['paths_changed'] = []
            receipt['source']['commits'] = []
            before = snapshot(self.repo)
            self.write('baseline.json', before)
        receipt['review']['head'] = head
        return seal(receipt, self.root)

    def cli(self, script, *args):
        if not (self.root/'tools').exists():
            shutil.copytree(TOOLS, self.root/'tools', ignore=shutil.ignore_patterns('__pycache__'))
        return subprocess.run([sys.executable, str(self.root/'tools'/script), *map(str,args)],
                              capture_output=True, text=True, timeout=30,
                              env={**os.environ, 'PYTHONDONTWRITEBYTECODE':'1', 'GIT_OPTIONAL_LOCKS':'0'})


class CensusBoundary(RepairFixture):
    def test_empty_roots_rejected(self):
        c = self.census(); c.update(scan_roots=[], files=[])
        self.assertTrue(check(PLAN,SURFACES,c,self.repo))

    def test_missing_mandatory_root_rejected(self):
        c = self.census(); c['scan_roots'].pop()
        self.assertTrue(check(PLAN,SURFACES,c,self.repo))

    def test_nonexistent_root_rejected(self):
        c = self.census(); c['scan_roots'].append('packages/absent/src')
        self.assertTrue(check(PLAN,SURFACES,c,self.repo))

    def test_missing_checkout_directory_rejected(self):
        (self.repo/REQUIRED_ROOTS[-1]).rmdir()
        self.assertTrue(check(PLAN,SURFACES,self.census(),self.repo))

    def test_trailing_slashes_do_not_erase_discovery(self):
        c = self.census(); c['scan_roots'] = [p+'/' for p in REQUIRED_ROOTS]
        self.assertEqual(check(PLAN,SURFACES,c,self.repo), [])
        c['files'] = []
        self.assertTrue(any('unclassified' in x for x in check(PLAN,SURFACES,c,self.repo)))

    def test_normalized_duplicate_rejected(self):
        c = self.census(); c['scan_roots'].append(REQUIRED_ROOTS[0]+'/')
        self.assertTrue(check(PLAN,SURFACES,c,self.repo))

    def test_unsafe_roots_rejected(self):
        for root in ['../outside','/tmp','~','C:/x','packages\\app','*','.',None,42]:
            with self.subTest(root=root), self.assertRaises(ValueError):
                scan_roots([*REQUIRED_ROOTS,root],self.repo)

    def test_symlink_root_rejected(self):
        path = self.repo/REQUIRED_ROOTS[-1];path.rmdir()
        path.symlink_to(self.repo/REQUIRED_ROOTS[0],target_is_directory=True)
        self.assertTrue(check(PLAN,SURFACES,self.census(),self.repo))

    def test_new_untracked_ui_cannot_be_omitted(self):
        self.put('packages/ui/src/new.tsx','new\n')
        self.assertTrue(any('new.tsx' in x for x in check(PLAN,SURFACES,self.census(),self.repo)))

    def test_valid_census_passes_without_writes(self):
        before = snapshot(self.repo)
        self.assertEqual(check(PLAN,SURFACES,self.census(),self.repo), [])
        self.assertEqual(before, snapshot(self.repo))

    def test_cli_strict_rejects_empty_search_and_accepts_real_coverage(self):
        for name in ('EXECUTE.md','MAP.md','OWNERSHIP.md'):
            shutil.copyfile(TOOLS.parent/name,self.root/name)
        shutil.copytree(TOOLS.parent/'vendor',self.root/'vendor')
        c = self.census();self.write('CENSUS.json',c)
        good = self.cli('validate_plan.py','--repo',self.repo,'--census-strict')
        self.assertEqual(good.returncode,0,good.stdout+good.stderr)
        c.update(scan_roots=[], files=[]);self.write('CENSUS.json',c)
        bad = self.cli('validate_plan.py','--repo',self.repo,'--census-strict')
        self.assertNotEqual(bad.returncode,0)


class AncestorPolicy(RepairFixture):
    def test_all_published_policies_are_the_same_validated_rule(self):
        self.assertEqual(validate(PLAN,SURFACES),[])
        self.assertTrue(all(n['axiom_application']==AXIOM_APPLICATION for n in PLAN['nodes']))

    def test_application_change_is_rejected_and_invalidates_descendant(self):
        p = copy.deepcopy(PLAN);node = next(n for n in p['nodes'] if n['id']=='S25')
        node['axiom_application'] = 'Parent closure must precede its producer.'
        self.assertTrue(validate(p))
        self.assertNotEqual(contract_digest(BY['S25-W1-T1'],self.root,PLAN),
                            contract_digest(BY['S25-W1-T1'],self.root,p))

    def test_ancestor_stage_change_is_rejected_and_bound(self):
        for value in ['NOT-A-VALID-STAGE','S23-W1-T2','S25-W1-T1']:
            p = copy.deepcopy(PLAN);node = next(n for n in p['nodes'] if n['id']=='S25')
            node['criterion_evaluation_stage'] = {c:value for a in node['criterion_ids'].values() for c in a}
            with self.subTest(stage=value):
                self.assertTrue(validate(p))
                self.assertNotEqual(contract_digest(BY['S25-W1-T1'],self.root,PLAN),
                                    contract_digest(BY['S25-W1-T1'],self.root,p))

    def test_explicit_aggregate_own_closure_is_valid(self):
        p = copy.deepcopy(PLAN);node=next(n for n in p['nodes'] if n['id']=='S25')
        node['criterion_evaluation_stage'] = {c:node['id'] for a in node['criterion_ids'].values() for c in a}
        self.assertEqual(validate(p),[])

    def test_task_future_stage_still_rejected(self):
        p=copy.deepcopy(PLAN);node=next(n for n in p['nodes'] if n['id']=='S25-W1-T1')
        node['criterion_evaluation_stage'][node['criterion_ids']['dod'][0]]='S23-W1-T2'
        self.assertTrue(validate(p))

    def test_widget_assignments_are_bound_without_changing_widget_text(self):
        n=copy.deepcopy(BY['S18-W1-T1']);before=contract_digest(n,self.root,PLAN)
        n['widget_contracts']=[]
        self.assertNotEqual(before,contract_digest(n,self.root,PLAN))


class CandidateBoundary(RepairFixture):
    def test_current_candidate_passes_both_routes(self):
        r=self.receipt();n=BY[r['id']]
        self.assertEqual(validate_submission(n,r,self.root,repo=self.repo),[])
        snap=git_snapshot(self.repo,{'tasks':{n['id']:{'status':'PASS','head':r['head']}}})
        self.assertEqual(source_errors(n,r,snap),[])

    def test_committed_relevant_change_is_stale_in_direct_and_selector(self):
        r=self.receipt();self.write('receipt.json',r)
        self.put(r['paths_changed'][0],'later change\n');self.commit()
        self.assertEqual(validate_receipt(BY[r['id']],r,self.root,repo=self.repo),[])
        errors=validate_submission(BY[r['id']],r,self.root,repo=self.repo)
        self.assertTrue(any('STALE:' in x for x in errors))
        progress={'tasks':{r['id']:{'status':'PASS','head':r['head'],'evidence':'receipt.json'}}}
        result=select(PLAN,progress,root=self.root,source_snapshot=git_snapshot(self.repo,progress))
        self.assertTrue(any('STALE:' in x for x in result['invalid_claims'][r['id']]))

    def test_dirty_relevant_change_is_rejected(self):
        r=self.receipt();self.put(r['paths_changed'][0],'dirty change\n')
        self.assertTrue(validate_submission(BY[r['id']],r,self.root,repo=self.repo))

    def test_unrelated_commit_does_not_invalidate(self):
        r=self.receipt();self.put('README.md','unrelated\n');self.commit()
        self.assertEqual(validate_submission(BY[r['id']],r,self.root,repo=self.repo),[])

    def test_historical_pilot_remains_historical(self):
        n=BY['S25-W0-T2'];r={'head':git(self.repo,'rev-parse','HEAD').strip()}
        self.put('packages/app/src/app.tsx','after pilot\n');self.commit()
        snap=git_snapshot(self.repo,{'tasks':{n['id']:{'status':'PASS','head':r['head']}}})
        self.assertEqual(source_errors(n,r,snap),[])
        self.assertTrue(source_errors(BY['S25-W1-T2'],r,snap))

    def test_submission_requires_repository(self):
        r=self.receipt()
        self.assertTrue(any('requires --repo' in x for x in validate_submission(BY[r['id']],r,self.root)))

    def test_cli_current_stale_and_historical_have_distinct_results(self):
        r=self.receipt();self.write('receipt.json',r)
        args=(r['id'],self.root/'receipt.json','--repo',self.repo)
        good=self.cli('validate_evidence.py',*args)
        self.assertEqual(good.returncode,0,good.stdout+good.stderr)
        self.assertTrue(json.loads(good.stdout)['candidate_compatible'])
        self.put(r['paths_changed'][0],'after approval\n');self.commit()
        bad=self.cli('validate_evidence.py',*args)
        self.assertEqual(bad.returncode,1)
        historical=self.cli('validate_evidence.py',*args,'--integrity-only')
        result=json.loads(historical.stdout)
        self.assertEqual(historical.returncode,0,historical.stdout+historical.stderr)
        self.assertEqual(result['status'],'INTEGRITY_VALID')
        self.assertFalse(result['candidate_compatible'])

    def test_invalid_ancestor_cannot_be_submitted(self):
        r=self.receipt();p=copy.deepcopy(PLAN)
        next(n for n in p['nodes'] if n['id']=='S17')['axiom_application']='Close parent first.'
        self.assertTrue(any('axiom application' in x for x in validate_submission(BY[r['id']],r,self.root,repo=self.repo,plan=p)))


class EvidenceOrigin(RepairFixture):
    def test_structural_library_accepts_fixture_but_submission_rejects_it(self):
        r=self.receipt();r['synthetic']=True
        self.assertEqual(validate_receipt(BY[r['id']],r,self.root,repo=self.repo),[])
        self.assertTrue(any('test/demo' in x for x in validate_submission(BY[r['id']],r,self.root,repo=self.repo)))

    def test_final_synthetic_metrics_and_captures_are_rejected(self):
        r=self.receipt('S25-W1-T2');fixtures.EvidenceTests().verified_categories(self.root,r)
        self.assertEqual(validate_receipt(BY[r['id']],r,self.root,repo=self.repo),[])
        errors=validate_submission(BY[r['id']],r,self.root,repo=self.repo)
        self.assertTrue(any('raw.json' in x and 'test/demo' in x for x in errors))
        self.assertTrue(any('captures.json' in x and 'test/demo' in x for x in errors))
        self.assertTrue(any('native.json' in x and 'test/demo' in x for x in errors))

    def test_synthetic_workload_is_not_synthetic_measurement(self):
        r=self.receipt();r['workload']={'synthetic':True, 'dataset':'deterministic UI fixture'}
        self.assertEqual(validate_submission(BY[r['id']],r,self.root,repo=self.repo),[])

    def test_explicit_demo_test_and_fabrication_markers_rejected(self):
        for flag in ['synthetic','fabricated','test_only','demo','example']:
            with self.subTest(flag=flag):
                self.assertTrue(evidence_origin_errors({flag:True},self.root))
        self.assertTrue(evidence_origin_errors({'provenance':{'evidence_origin':'test-fixture'}},self.root))

    def test_imported_synthetic_receipt_is_not_laundered(self):
        self.write('child.json',{'synthetic':True})
        r={'source':{'imported_receipts':['child.json']}}
        self.assertTrue(any('test/demo' in x for x in evidence_origin_errors(r,self.root)))

    def test_nested_import_rejected_without_recursion(self):
        self.write('child.json',{'source':{'imported_receipts':['child.json']}})
        self.assertTrue(any('nested' in x for x in evidence_origin_errors({'source':{'imported_receipts':['child.json']}},self.root)))

    def test_unmarked_envelopes_are_not_claimed_authenticated(self):
        self.assertEqual(evidence_origin_errors({'evidence_origin':'observed', 'workload':{'synthetic':True}},self.root),[])
