"""Executor aid checks. Temporary Git fixtures only, not product proof."""
import copy
import hashlib
import io
import json
import os
import shutil
import subprocess
import tempfile
import unittest
from contextlib import redirect_stdout
from pathlib import Path
from unittest.mock import patch

import executor as ex
from test_support import install
from effective_contract import load


class ExecutorTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.repo = Path(self.tmp.name) / 'repo'
        self.root = self.repo / ex.BASE
        self.root.mkdir(parents=True)
        install(self.root)
        for name in ('GITHUB.json', 'progress.json', 'EXECUTE.md'):
            shutil.copyfile(ex.ROOT / name, self.root / name)
        (self.repo / 'AGENTS.md').write_text('# Synthetic repository rules\n')
        (self.repo / 'package.json').write_text(json.dumps({'packageManager':'bun@1.3.14'}))
        app = self.repo / 'packages/app'
        app.mkdir(parents=True)
        (app / 'package.json').write_text(json.dumps({'scripts':{'typecheck':'check', 'test':'tests', 'publish':'unsafe'}}))
        (app / 'AGENTS.md').write_text('# Synthetic app rules\n')
        self.git('init', '-q')
        self.git('config', 'user.email', 'fixture@example.invalid')
        self.git('config', 'user.name', 'Synthetic fixture')
        self.git('remote', 'add', 'origin', 'https://github.com/gmhelmold/HuGR-Orchestra.git')
        self.git('add', '.')
        self.git('commit', '-qm', 'Synthetic fixture, not a product revision')
        self.plan, self.by, self.registry = ex.contracts(self.root)
        self.repo, self.state, self.tracked = ex.checkout(self.root, self.repo)
        self.ready, self.progress = ex.readiness(self.plan, self.root, self.repo, self.tracked, 4)

    def git(self, *args):
        return subprocess.check_output(['git', '-C', str(self.repo), *args], text=True, stderr=subprocess.DEVNULL)

    def context(self, task='S17-W1-T1'):
        return ex.packet(self.plan,self.by,self.registry,self.root,self.repo,self.state,self.ready,self.progress,task)

    def test_01_only_initial_task_selected(self):
        self.assertEqual([x['id'] for x in self.ready['selected']], ['S01-W1-T1'])

    def test_02_packet_preserves_every_task_criterion_and_ancestor(self):
        text = self.context()
        for ident in ex.chain(self.by, 'S17-W1-T1'):
            for group in ex.GROUPS:
                for value in self.by[ident]['criterion_ids'][group]:
                    self.assertIn(value, text)
        data = json.loads(text.split('```json\n')[1].split('\n```')[0])
        self.assertEqual(data['task_contract'], self.by['S17-W1-T1'])
        self.assertEqual(data['task_contract']['criterion_evaluation_stage'], self.by['S17-W1-T1']['criterion_evaluation_stage'])

    def test_03_blocked_packet_is_not_start_permission(self):
        self.assertIn('PREPARATION_OR_RESUME_ONLY', self.context())
        self.assertNotIn('SELECTED_BY_EXISTING_POLICY', self.context())

    def test_04_unknown_or_parent_task_rejected(self):
        for task in ('NONE','S17','S17-W1','E1'):
            with self.subTest(task=task), self.assertRaises(ValueError):
                self.context(task)

    def test_05_exact_assigned_widgets_only(self):
        text = self.context()
        self.assertIn('<a id="w05"></a>', text)
        self.assertIn('<a id="w06"></a>', text)
        self.assertNotIn('<a id="w04"></a>', text)
        source = (self.root/'WIDGETS.md').read_text()
        section = source.split('<a id="w05"></a>')[1].split('<a id="w06"></a>')[0]
        self.assertIn(section, text)

    def test_06_missing_and_duplicate_widget_fail_closed(self):
        for text in ('no sections', '<a id="w05"></a>\nhello\n<a id="w05"></a>\nagain'):
            with self.assertRaises(ValueError): ex.widget_extract(text,['W05'])

    def test_07_widget_mutation_changes_effective_digest(self):
        before = self.context()
        with (self.root/'WIDGETS.md').open('a') as f:f.write('\nSynthetic change.\n')
        a = json.loads(before.split('```json\n')[1].split('\n```')[0])
        b = json.loads(self.context().split('```json\n')[1].split('\n```')[0])
        self.assertNotEqual(a['effective_contract_sha256'],b['effective_contract_sha256'])

    def test_08_bad_master_rejected(self):
        (self.root/'reference/approved.png').write_bytes(b'not approved')
        with self.assertRaises(ValueError): ex.contracts(self.root)

    def test_09_wrong_repo_and_external_plan_rejected(self):
        with self.assertRaises(ValueError): ex.checkout(self.root.parent,self.repo)
        self.git('remote','set-url','origin','https://token:SECRET@github.com/wrong/repo.git')
        with self.assertRaisesRegex(ValueError,'URL withheld') as error:
            ex.checkout(self.root,self.repo)
        self.assertNotIn('SECRET',str(error.exception))

    def test_10_remote_forms_and_no_secret_echo(self):
        for url in ('https://user:secret@github.com/gmhelmold/HuGR-Orchestra.git', 'git@github.com:gmhelmold/HuGR-Orchestra.git','ssh://git@github.com/gmhelmold/HuGR-Orchestra.git'):
            self.assertTrue(ex.expected_remote(url))
        for url in ('https://github.com.evil/gmhelmold/HuGR-Orchestra','file:///tmp/repo','https://github.com/x/HuGR-Orchestra'):
            self.assertFalse(ex.expected_remote(url))

    def test_11_dirty_and_staged_files_preserved(self):
        p=self.repo/'user-draft.txt';p.write_text('staged');self.git('add','user-draft.txt');p.write_text('unstaged')
        before=(p.read_bytes(),(self.repo/'.git/index').read_bytes(),self.git('status','--porcelain=v1'))
        ex.checkout(self.root,self.repo); self.context()
        with patch.object(ex,'version',return_value=None):ex.doctor(self.plan,self.root,self.repo,self.state)
        after=(p.read_bytes(),(self.repo/'.git/index').read_bytes(),self.git('status','--porcelain=v1'))
        self.assertEqual(before,after)

    def test_12_bun_absent_and_mismatch_not_product_ready(self):
        for value in (None,'0.0.0'):
            with patch.object(ex,'version',return_value=value):
                report=ex.doctor(self.plan,self.root,self.repo,self.state)
            self.assertFalse(report['bun']['matches'])
            self.assertEqual(report['product_checks']['build'],'NOT_RUN')
            self.assertTrue(report['observations'])

    def test_13_matching_bun_still_does_not_prove_product(self):
        with patch.object(ex,'version',return_value='1.3.14'):
            report=ex.doctor(self.plan,self.root,self.repo,self.state)
        self.assertTrue(report['bun']['matches'])
        self.assertEqual(set(report['product_checks'].values()),{'NOT_RUN'})
        self.assertFalse(report['mutation_performed'])

    def test_14_scripts_discovered_only_from_packages_never_root_test(self):
        info=ex.package_info(self.repo,'packages/app')
        self.assertEqual({r['argv'][-1] for r in info['commands']},{'typecheck','test'})
        self.assertEqual(ex.package_info(self.repo,'')['commands'],[])
        self.assertTrue(all(x['execution']=='NOT_RUN' for x in info['commands']))

    def test_15_missing_manifest_is_explicit(self):
        self.assertEqual(ex.package_info(self.repo,'packages/absent')['state'],'MISSING')

    def test_16_path_escape_and_symlink_escape_rejected(self):
        for rel in ('../secret','/secret','a\\b'):
            with self.assertRaises(ValueError): ex.inside(self.root,rel)
        (self.root/'escape').symlink_to(self.repo/'AGENTS.md')
        with self.assertRaises(ValueError): ex.inside(self.root,'escape')

    def test_17_fenced_headings_are_not_document_sections(self):
        text='# A\n```sh\n## NOT HEADING\n```\n## B\n'
        self.assertEqual(ex.headings(text),[{'line':1,'heading':'# A'},{'line':5,'heading':'## B'}])

    def test_18_resume_rejects_invalid_progress(self):
        (self.root/'progress.json').write_text('{"tasks": []}')
        with self.assertRaises(ValueError): ex.readiness(self.plan,self.root,self.repo,self.tracked,4)

    def test_19_no_product_claim_written(self):
        before=(self.root/'progress.json').read_bytes()
        self.context();ex.readiness(self.plan,self.root,self.repo,self.tracked,4)
        self.assertEqual(before,(self.root/'progress.json').read_bytes())
        self.assertEqual(self.ready['completed_tasks'],0)

    def test_20_out_refuses_overwrite(self):
        out=self.repo/'important.md';out.write_text('KEEP')
        argv=['executor.py','packet','S01-W1-T1','--repo',str(self.repo),'--out',str(out)]
        with patch.object(ex,'ROOT',self.root),patch('sys.argv',argv),redirect_stdout(io.StringIO()):
            self.assertEqual(ex.main(),1)
        self.assertEqual(out.read_text(),'KEEP')

    def test_21_packet_includes_local_instruction_files(self):
        self.assertIn('packages/app/AGENTS.md',self.context())

    def test_22_missing_agency_rules_fail_closed(self):
        (self.repo/'AGENTS.md').unlink()
        with self.assertRaisesRegex(ValueError,'AGENTS'):ex.checkout(self.root,self.repo)

    def test_23_shapes_and_bounds_validated(self):
        for args in (['doctor','BAD'],['packet'],['resume','--jobs','0']):
            with patch.object(ex,'ROOT',self.root),patch('sys.argv',['executor.py',*args,'--repo',str(self.repo)]),redirect_stdout(io.StringIO()):
                self.assertEqual(ex.main(),1)

    def test_24_unchanged_packet_is_deterministic(self):
        self.assertEqual(self.context(),self.context())


if __name__ == '__main__':unittest.main()
