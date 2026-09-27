"""Widget CONTRACT regressions only. These tests do not execute the Orchestra UI."""
import copy
import hashlib
import json
import re
import tempfile
import unittest
from pathlib import Path

from effective_contract import digest, manifest
from select_work import entry_dependencies, conflict
from test_support import install
from validate_plan import ROOT, validate, owners_for
from visual_coverage import required_captures

PLAN = json.loads((ROOT / 'PLAN.json').read_text())
SURFACES = json.loads((ROOT / 'SURFACES.json').read_text())
BY = {n['id']: n for n in PLAN['nodes']}


def predecessors(ident):
    result = set()
    def visit(i):
        for child in entry_dependencies(BY, i):
            if child in result:
                continue
            result.add(child)
            visit(child)
            for desc in BY[child].get('children', []):
                if desc not in result:
                    result.add(desc)
                    visit(desc)
                    descend(desc)
    def descend(i):
        for c in BY[i].get('children', []):
            if c not in result:
                result.add(c)
                visit(c)
                descend(c)
    visit(ident)
    return result


class WidgetContractTests(unittest.TestCase):
    def test_01_valid_plan_includes_closed_widget_contract(self):
        self.assertEqual(validate(PLAN, SURFACES), [])
        self.assertEqual(PLAN['widget_contract_file'], 'WIDGETS.md')
        self.assertEqual(PLAN['contract_revision'], '4.3')

    def test_02_unknown_widget_rejected(self):
        p = copy.deepcopy(PLAN)
        p['nodes'][0]['widget_contracts'] = ['W999']
        self.assertTrue(validate(p, SURFACES))

    def test_03_duplicate_widget_rejected(self):
        p = copy.deepcopy(PLAN)
        p['nodes'][0]['widget_contracts'] = ['W01', 'W01']
        self.assertTrue(validate(p, SURFACES))

    def test_04_bad_case_and_malformed_surfaces_fail_without_crash(self):
        p = copy.deepcopy(PLAN)
        p['nodes'][0]['widget_cases'] = [None]
        self.assertTrue(validate(p, SURFACES))
        self.assertTrue(validate(PLAN, {'surfaces': 'everything'}))

    def test_05_widget_normative_file_cannot_be_omitted(self):
        p = copy.deepcopy(PLAN)
        n = next(n for n in p['nodes'] if n['id'] == 'S17-W1-T1')
        n['normative_files'].remove('WIDGETS.md')
        self.assertTrue(any('effective evidence' in e for e in validate(p, SURFACES)))

    def test_06_activity_consumer_must_exist(self):
        s = copy.deepcopy(SURFACES)
        s['surfaces'] = [r for r in s['surfaces'] if r['id'] != 'UI78']
        self.assertTrue(any('UI78' in e for e in validate(PLAN, s)))

    def test_07_activity_source_cannot_stand_in_for_consumer(self):
        s = copy.deepcopy(SURFACES)
        row = next(r for r in s['surfaces'] if r['id'] == 'UI78')
        row.update(inventory_class='read-anchor', disposition='read-anchor')
        self.assertTrue(any('UI78' in e for e in validate(PLAN, s)))

    def test_08_consumer_wrong_owner_rejected(self):
        s = copy.deepcopy(SURFACES)
        next(r for r in s['surfaces'] if r['id'] == 'UI80')['owner'] = 'S15'
        self.assertTrue(any('UI80' in e for e in validate(PLAN, s)))

    def test_09_activity_test_has_one_writer(self):
        path = 'packages/app/src/pages/session/orchestra-activity.test.tsx'
        self.assertEqual(owners_for([path], PLAN['nodes'])[path], ['S18'])
        self.assertIn(path, BY['S18-W1-T1']['write_paths'])
        self.assertNotIn(path, BY['S18-W1-T2']['write_paths'])

    def test_10_commands_hotspot_has_one_integrator(self):
        path = 'packages/app/src/pages/session/use-session-commands.tsx'
        self.assertEqual(owners_for([path], PLAN['nodes'])[path], ['S25'])
        self.assertIn(path, BY['S25-W1-T1']['write_paths'])
        self.assertNotIn(path, BY['S18-W1-T1']['write_paths'])

    def test_11_missing_docs_state_breaks_local_coverage(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td); install(root)
            s = json.loads((root / 'SURFACES.json').read_text())
            next(r for r in s['surfaces'] if r['id'] == 'UI80')['states'].remove('denied-path')
            (root / 'SURFACES.json').write_text(json.dumps(s))
            with self.assertRaises(ValueError):
                required_captures(BY['S11-W1-T2'], root)

    def test_12_final_capture_manifest_covers_each_new_consumer(self):
        expected = {f'UI{i}' for i in range(77,83)}
        for task in ('S24-W1-T2', 'S25-W1-T2'):
            found = {r['surface_id'] for r in required_captures(BY[task], ROOT)}
            self.assertTrue(expected <= found)
        self.assertIn('UI78', {r['surface_id'] for r in required_captures(BY['S18-W1-T2'], ROOT)})

    def test_13_pilot_does_not_wait_for_or_capture_final_widgets(self):
        for task in ('S25-W0-T1', 'S25-W0-T2'):
            rows = required_captures(BY[task], ROOT)
            self.assertEqual(len(rows), 56)
            self.assertFalse({f'UI{i}' for i in range(77,83)} & {r['surface_id'] for r in rows})
        self.assertNotIn('S11-W1-T1', predecessors('S25-W0-T1'))

    def test_14_widget_text_changes_invalidate_effective_receipt(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td); install(root)
            n = BY['S17-W1-T1']
            before = manifest(n, root, PLAN)
            with (root / 'WIDGETS.md').open('a') as f:
                f.write('\nSynthetic contract mutation, not a product change.\n')
            self.assertNotEqual(before, manifest(n, root, PLAN))

    def test_15_all_28_cases_are_assigned_and_all_9_sections_exist(self):
        text = (ROOT / 'WIDGETS.md').read_text()
        assigned = {c for n in PLAN['nodes'] if n['kind'] == 'task' for c in n.get('widget_cases', [])}
        self.assertEqual(assigned, {f'WK{i:02}' for i in range(1,29)})
        for c in assigned:
            self.assertIn('`'+c+'`', text)
        self.assertEqual(re.findall(r'<a id="(w\d{2})"></a>', text), [f'w{i:02}' for i in range(1,10)])

    def test_16_42_hierarchy_DAG_stages_and_criterion_ids_preserved(self):
        fields = ['id','parent','children','depends_on','acceptance_requires','resource_locks','verification_tier','sampling_requires_quiet_host','required_performance_gates','required_visual_gates','required_native_gates','criterion_ids','criterion_evaluation_stage']
        value = [{key:n.get(key) for key in fields} for n in PLAN['nodes']]
        actual = hashlib.sha256(json.dumps(value,sort_keys=True,ensure_ascii=False,separators=(',',':')).encode()).hexdigest()
        self.assertEqual(actual, '9e378722a2905ef1ec033172647dd66b9ecb1b8e60d51a183da445f6edc29785')

    def test_17_budgets_and_master_not_relaxed(self):
        self.assertEqual(hashlib.sha256((ROOT/'BUDGETS.json').read_bytes()).hexdigest(), '694c764cd15ff85697f8dc4ee93852f106cf14cb00c06a472ccab7078f05230f')
        self.assertEqual(hashlib.sha256((ROOT/'reference/approved.png').read_bytes()).hexdigest(), 'e839b759e0f93beca37b10cd45700725020a840fee6e97da1e67556b2ffb128d')

    def test_18_changed_scope_tasks_do_not_conflict_with_peer_implementers(self):
        for a in ('S18-W1-T1', 'S25-W1-T1'):
            for b in ('S09-W1-T1','S10-W1-T1','S11-W1-T1','S15-W1-T1','S16-W1-T1','S17-W1-T1','S21-W1-T1'):
                self.assertFalse(conflict(BY[a], BY[b]), (a,b))

    def test_19_fixture_is_synthetic_and_has_no_fake_passed_file_or_idle_Janitor(self):
        fixture = json.loads((ROOT/'fixture.json').read_text())
        self.assertEqual(fixture['mode'], 'demo-only')
        self.assertTrue(fixture['testEvidence']['synthetic'])
        self.assertNotIn('filesPassed', fixture['testEvidence'])
        self.assertIn('SYNTHETIC', fixture['testEvidence']['rawOutput'])
        self.assertIsNone(fixture['janitorReport'])
        self.assertFalse(any(r['entity']=='Janitor' for r in fixture['activity']))
        self.assertEqual(set(fixture['checklist'][0]), {'content','status','priority'})

    def test_20_PA_phase_guard_stays_enabled_on_43(self):
        p = copy.deepcopy(PLAN)
        n = next(n for n in p['nodes'] if n['id']=='S23-W1-T2')
        n['resource_locks'] = ['exclusive-benchmark-hardware']
        self.assertTrue(any('collection phase' in e for e in validate(p, SURFACES)))

    def test_21_preparation_and_pilot_do_not_gain_final_WK_obligations(self):
        n = BY['S23-W1-T1']
        self.assertEqual(n['verification_tier'], 'local')
        self.assertFalse(any(s.startswith('Medir WK26') for s in n['steps']))
        self.assertEqual(BY['S25-W0-T2']['widget_cases'], [])
        self.assertNotIn('S23', predecessors('S25-W1-T1'))

    def test_22_projections_embed_direct_widget_links_and_all_five_axes(self):
        import render_issues
        docs = render_issues.render(PLAN)
        self.assertEqual(len(docs),39)
        for ident in ('S09','S10','S11','S15','S17','S18','S25'):
            self.assertIn('/WIDGETS.md#w',docs[ident])
            for key in ('dod','invariants','quality_standards','completeness_criteria','success_criteria'):
                self.assertIn('### '+key,docs[ident])


if __name__ == '__main__':
    unittest.main()
