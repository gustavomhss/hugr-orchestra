"""Tests of planning tools only. No product tests and no live GitHub writes."""
import copy
import json
import re
import tempfile
import unittest
from pathlib import Path
from validate_plan import ROOT, AX, validate, inspect, owners_for
from validate_evidence import validate_receipt, local_file, contract_digest, digest_file
from select_work import select, invalidated_closure, conflict
from github_sync import desired_relations, reconcile, APIError, REPO
from receipt_template import template

PLAN = json.loads((ROOT / 'PLAN.json').read_text())
SURFACES = json.loads((ROOT / 'SURFACES.json').read_text())
META = json.loads((ROOT / 'GITHUB.json').read_text())
BY = {n['id']: n for n in PLAN['nodes']}


class ContractTests(unittest.TestCase):
    def test_valid_contract(self):
        self.assertEqual(validate(PLAN, SURFACES), [])

    def test_missing_axiom(self):
        plan = copy.deepcopy(PLAN)
        del plan['nodes'][0]['axioms']['invariants']
        self.assertTrue(validate(plan))

    def test_empty_axiom(self):
        plan = copy.deepcopy(PLAN)
        plan['nodes'][0]['axioms']['dod'] = []
        self.assertTrue(validate(plan))

    def test_duplicate_id(self):
        plan = copy.deepcopy(PLAN)
        plan['nodes'].append(copy.deepcopy(plan['nodes'][0]))
        self.assertTrue(validate(plan))

    def test_cycle_including_aggregate(self):
        plan = copy.deepcopy(PLAN)
        next(n for n in plan['nodes'] if n['id'] == 'S01-W1-T1')['depends_on'] = ['E1']
        self.assertTrue(any('cycle' in e for e in validate(plan)))

    def test_unknown_dependency(self):
        plan = copy.deepcopy(PLAN)
        plan['nodes'][0]['depends_on'] = ['DOES_NOT_EXIST']
        self.assertTrue(validate(plan))

    def test_unsafe_write_path(self):
        plan = copy.deepcopy(PLAN)
        plan['nodes'][0]['write_paths'] = ['../user-secret']
        self.assertTrue(validate(plan))

    def test_wrong_surface_owner(self):
        surfaces = copy.deepcopy(SURFACES)
        surfaces['surfaces'][0]['owner'] = 'I01'
        self.assertTrue(validate(PLAN, surfaces))

    def test_reference_hash_is_verified(self):
        self.assertTrue(inspect()['reference_verified'])
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / 'PLAN.json').write_text(json.dumps(PLAN))
            (root / 'SURFACES.json').write_text(json.dumps(SURFACES))
            (root / 'reference').mkdir()
            (root / PLAN['reference_path']).write_bytes(b'wrong reference')
            result = inspect(root)
            self.assertEqual(result['status'], 'FAIL')
            self.assertFalse(result['reference_verified'])

    def test_exclusive_known_hotspots(self):
        files = ['packages/app/src/app.tsx', 'packages/ui/src/components/logo.tsx',
                 'packages/app/src/components/settings-v2/providers.tsx',
                 'packages/app/src/components/session/session-header.tsx']
        result = owners_for(files, PLAN['nodes'])
        self.assertEqual(result[files[0]], ['S25'])
        self.assertEqual(result[files[1]], ['S05'])
        self.assertEqual(result[files[2]], ['S13'])
        self.assertEqual(result[files[3]], ['S06'])


class TemplateTests(unittest.TestCase):
    def test_template_starts_not_run_with_exact_criteria(self):
        r = template(PLAN, 'S01-W1-T1')
        self.assertEqual(r['status'], 'NOT_RUN')
        self.assertIsNone(r['head'])
        for key in AX:
            self.assertEqual([x['criterion_id'] for x in r['axioms'][key]], BY[r['id']]['criterion_ids'][key])
            self.assertTrue(all(x['result'] == 'NOT_RUN' and x['evidence'] == [] for x in r['axioms'][key]))

    def test_template_rejects_non_task(self):
        with self.assertRaises(ValueError):
            template(PLAN, 'E1')


class ReadinessTests(unittest.TestCase):
    def test_only_first_task_ready(self):
        r = select(PLAN, {'tasks': {}, 'external': {}}, check_evidence=False)
        self.assertEqual([n['id'] for n in r['selected']], ['S01-W1-T1'])

    def test_pass_without_receipt_rejected(self):
        r = select(PLAN, {'tasks': {'S01-W1-T1': {'status': 'PASS'}}, 'external': {}})
        self.assertEqual(r['status'], 'FAIL')

    def progress_with_all_except(self, prefixes):
        return {'tasks': {n['id']: {'status': 'PASS'} for n in PLAN['nodes']
                          if n['kind'] == 'task' and not any(n['id'].startswith(p) for p in prefixes)},
                'external': {}}

    def test_integration_precedes_final_gates(self):
        p = self.progress_with_all_except(['S19-W2', 'S20-W2', 'S23-', 'S24-', 'S25-'])
        p['tasks']['S25-W0-T1']={'status':'PASS'}
        p['tasks']['S25-W0-T2']={'status':'PASS'}
        r = select(PLAN, p, check_evidence=False)
        self.assertIn('S25-W1-T1', [n['id'] for n in r['selected']])
        self.assertNotIn('S23-W1-T1', [n['id'] for n in r['selected']])

    def test_final_gates_do_not_need_whole_S25(self):
        p = self.progress_with_all_except(['S19-W2', 'S20-W2', 'S23-', 'S24-', 'S25-'])
        p['tasks']['S25-W0-T1']={'status':'PASS'}
        p['tasks']['S25-W0-T2']={'status':'PASS'}
        p['tasks']['S25-W1-T1'] = {'status': 'PASS'}
        r = select(PLAN, p, check_evidence=False)
        self.assertTrue(r['selected'])
        self.assertIn(r['selected'][0]['id'], ('S23-W1-T1', 'S24-W1-T1'))

    def test_live_blocker_not_bypassed_by_parent_claim(self):
        p = self.progress_with_all_except(['S19-W2', 'S20-W2'])
        r = select(PLAN, p, check_evidence=False)
        blocked = {n['id']: n for n in r['blocked']}
        self.assertIn('#109', blocked['S19-W2-T1']['external'])
        self.assertIn('#106', blocked['S20-W2-T1']['external'])

    def test_own_and_governance_codegen_serialize(self):
        self.assertTrue(conflict(BY['S19-W2-T1'], BY['S20-W2-T1']))

    def test_rework_invalidates_dependent_release_claims(self):
        invalid = invalidated_closure(BY, ['S09-W1-T1'])
        self.assertIn('S09-W1-T2', invalid)
        self.assertIn('S23-W1-T1', invalid)
        self.assertIn('S25-W1-T2', invalid)

    def test_unknown_progress_node_fails(self):
        r = select(PLAN, {'tasks': {'wrong': {'status': 'PASS'}}, 'external': {}}, check_evidence=False)
        self.assertEqual(r['status'], 'FAIL')


class EvidenceTests(unittest.TestCase):
    def receipt(self, root, ident='S01-W1-T1'):
        from test_support import install
        install(root)
        (root / 'proof.txt').write_text('Synthetic evidence for a schema test. NOT product proof.')
        value = template(PLAN, ident)
        value.update({'head': 'a'*40, 'status': 'PASS'})
        value['axioms'] = {k: [{'criterion_id': c, 'result': 'PASS', 'evidence': ['proof.txt']}
                               for c in BY[ident]['criterion_ids'][k]] for k in AX}
        value['commands'] = [{'cwd': 'isolated-fixture', 'command': 'synthetic-schema-test', 'exit_code': 0, 'log': 'proof.txt'}]
        value['review'] = {'status': 'PASS', 'head': 'a'*40, 'method': 'self-cold-review', 'evidence': 'proof.txt'}
        value['artifacts'] = {'proof.txt': digest_file(root/'proof.txt')}
        for category in ('performance', 'visual', 'native'):
            value[category] = {'status': 'NOT_APPLICABLE', 'reason': 'Synthetic schema test with no product runtime.'}
        return value

    def verified_categories(self, root, value):
        from test_support import categories
        return categories(root,value,BY[value['id']])

    def test_complete_receipt_shape(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            self.assertEqual(validate_receipt(BY['S01-W1-T1'], self.receipt(root), root), [])

    def test_criterion_omission_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp); r = self.receipt(root)
            r['axioms']['dod'].pop()
            self.assertTrue(validate_receipt(BY['S01-W1-T1'], r, root))

    def test_evidence_path_escape_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            with self.assertRaises(ValueError):
                local_file(Path(tmp), '../outside.txt')

    def test_not_run_never_passes(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp); r = self.receipt(root)
            r['performance'] = {'status': 'NOT_RUN'}
            self.assertTrue(validate_receipt(BY['S01-W1-T1'], r, root))

    def test_final_release_requires_both_gates(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp); r = self.receipt(root, 'S25-W1-T2')
            self.assertTrue(validate_receipt(BY['S25-W1-T2'], r, root))
            self.verified_categories(root, r)
            self.assertEqual(validate_receipt(BY['S25-W1-T2'], r, root), [])

    def test_empty_commands_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp); r = self.receipt(root)
            r['commands'] = []
            self.assertTrue(validate_receipt(BY['S01-W1-T1'], r, root))

    def test_pass_metrics_without_file_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp); r = self.receipt(root)
            r['performance'] = {'status': 'PASS', 'metrics_file': 'missing.json'}
            self.assertTrue(validate_receipt(BY['S01-W1-T1'], r, root))

    def test_pass_visual_without_captures_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp); r = self.receipt(root)
            r['visual'] = {'status': 'PASS', 'screenshots': [], 'known_defects': []}
            self.assertTrue(validate_receipt(BY['S01-W1-T1'], r, root))

    def test_not_applicable_requires_reason(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp); r = self.receipt(root)
            r['visual'] = {'status': 'NOT_APPLICABLE'}
            self.assertTrue(validate_receipt(BY['S01-W1-T1'], r, root))

    def test_noninteger_exit_code_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp); r = self.receipt(root)
            r['commands'][0]['exit_code'] = None
            self.assertTrue(validate_receipt(BY['S01-W1-T1'], r, root))


class FakeGitHub:
    """Explicit transport fake: tests sync algorithm, never contacts GitHub."""
    def __init__(self):
        rel = desired_relations(PLAN, META)
        numbers = {r['number'] for r in META['issues'].values()} | {r['blocked_by'] for r in rel['dependencies']}
        markers = {r['number']: r['marker'] for r in META['issues'].values()}
        self.rows = {n: {'number': n, 'id': n + 100000, 'html_url': f'https://github.com/{REPO}/issues/{n}',
                         'body': markers.get(n, 'existing external issue')} for n in numbers}
        self.parents, self.deps, self.posts = {}, {}, []
        self.fail_after = None

    def request(self, method, path, body=None, allow_404=False):
        suffix = path.split('/issues/')[1]
        bits = suffix.split('/'); n = int(bits[0])
        if method == 'GET':
            if len(bits) == 1: return copy.deepcopy(self.rows[n])
            if bits[1] == 'parent':
                p = self.parents.get(n)
                return copy.deepcopy(self.rows[p]) if p is not None else None
        if method == 'POST':
            if self.fail_after is not None and len(self.posts) >= self.fail_after:
                raise APIError('simulated transport failure', 403)
            self.posts.append((path, body))
            if bits[1] == 'sub_issues':
                assert body['replace_parent'] is False
                self.parents[body['sub_issue_id'] - 100000] = n
            elif bits[1:] == ['dependencies', 'blocked_by']:
                self.deps.setdefault(n, set()).add(body['issue_id'] - 100000)
            else: raise AssertionError('unexpected POST')
            return {}
        raise AssertionError('unexpected request')

    def listing(self, path):
        n = int(path.split('/issues/')[1].split('/')[0])
        return [self.rows[i] for i in sorted(self.deps.get(n, set()))]


class GitHubSyncTests(unittest.TestCase):
    def test_no_fine_grained_dependency_collapsed_into_cycle(self):
        r = desired_relations(PLAN, META)
        edges = {(x['issue'], x['blocked_by']) for x in r['dependencies']}
        self.assertNotIn((166, 168), edges)  # S23 waits only for S25-T1
        self.assertIn((168, 166), edges)     # S25 closure needs S23
        self.assertEqual(len(r['parents']), 35)

    def test_dry_run_no_writes(self):
        api = FakeGitHub(); r = reconcile(api, PLAN, META)
        self.assertEqual(api.posts, [])
        self.assertEqual(r['native_writes_performed'], 0)

    def test_apply_and_rerun_are_idempotent(self):
        api = FakeGitHub(); r = reconcile(api, PLAN, META, apply=True, delay=0)
        self.assertEqual(r['status'], 'VERIFIED')
        count = len(api.posts)
        self.assertEqual(count, len(desired_relations(PLAN, META)['parents']) + len(desired_relations(PLAN, META)['dependencies']))
        again = reconcile(api, PLAN, META, apply=True, delay=0)
        self.assertEqual(again['native_writes_performed'], 0)
        self.assertEqual(len(api.posts), count)

    def test_foreign_parent_refused_before_post(self):
        api = FakeGitHub(); api.parents[134] = 131
        with self.assertRaises(APIError):
            reconcile(api, PLAN, META, apply=True, delay=0)
        self.assertEqual(api.posts, [])

    def test_marker_mismatch_refused(self):
        api = FakeGitHub(); api.rows[130]['body'] = 'another issue'
        with self.assertRaises(APIError):
            reconcile(api, PLAN, META, apply=True, delay=0)
        self.assertEqual(api.posts, [])

    def test_partial_failure_is_not_success(self):
        api = FakeGitHub(); api.fail_after = 2
        r = reconcile(api, PLAN, META, apply=True, delay=0)
        self.assertEqual(r['status'], 'PARTIAL_FAILURE')
        self.assertEqual(r['native_writes_performed'], 2)

    def test_fixed_repository_boundary(self):
        m = copy.deepcopy(META); m['repo'] = 'someone/else'
        with self.assertRaises(ValueError):
            desired_relations(PLAN, m)


if __name__ == '__main__':
    unittest.main(verbosity=2)
