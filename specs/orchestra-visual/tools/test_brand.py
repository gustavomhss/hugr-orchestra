"""Brand integration contract tests. File copies are synthetic; no product tests."""
from __future__ import annotations
import copy
import json
import shutil
import tempfile
import unittest
from pathlib import Path
from effective_contract import contract_digest, load
from verify_brand import ROOT, verify
from validate_plan import owners_for, inspect
from render_issues import render


class BrandContractTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name) / 'package'
        self.root.mkdir()
        for rel in ['PLAN.json', 'SURFACES.json', 'BRAND-ASSETS.json', 'BRAND-INTEGRATION.md',
                    'SPEC.md', 'CONTRACTS.md', 'PERFORMANCE.md', 'BUDGETS.json',
                    'COVERAGE.json', 'fixture.json', 'RECEIPTS-v4.md', 'EXECUTE.md', 'MAP.md', 'OWNERSHIP.md', 'reference/approved.png']:
            target = self.root / rel
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(ROOT / rel, target)
        shutil.copytree(ROOT / 'vendor', self.root / 'vendor')
        self.map = load(self.root / 'BRAND-ASSETS.json')
        self.repo = Path(self.temp.name) / 'repo'
        self.repo.mkdir()

    def tearDown(self):
        self.temp.cleanup()

    def store_map(self):
        (self.root / 'BRAND-ASSETS.json').write_text(json.dumps(self.map))

    def install_required(self):
        for asset in self.map['assets']:
            if not asset['required_for_initial_brand_integration']:
                continue
            target = self.repo / asset['destination']
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(self.root / self.map['kit_root'] / asset['source'], target)

    def test_01_source_complete_is_valid_not_product_proof(self):
        result = verify(self.root)
        self.assertEqual(result['status'], 'PASS')
        self.assertEqual(result['source_files_checked'], 304)
        self.assertFalse(result['product_integration_tested'])
        self.assertFalse(result['destination_checked'])

    def test_02_altered_kit_bytes_fail(self):
        target = self.root / self.map['kit_root'] / self.map['assets'][0]['source']
        target.write_bytes(target.read_bytes() + b' ')
        self.assertEqual(verify(self.root)['status'], 'FAIL')

    def test_03_two_required_copies_pass_optional_not_installed(self):
        self.install_required()
        result = verify(self.root, self.repo)
        self.assertEqual(result['status'], 'PASS', result['errors'])
        self.assertEqual(len(result['repo_copies_checked']), 2)
        self.assertEqual(len(result['conditional_assets_absent']), 12)
        self.assertFalse(result['product_integration_tested'])

    def test_04_missing_required_copy_fails(self):
        self.assertEqual(verify(self.root, self.repo)['status'], 'FAIL')

    def test_05_variant_swapped_at_destination_fails(self):
        self.install_required()
        a, b = self.map['assets'][:2]
        shutil.copyfile(self.repo / a['destination'], self.repo / b['destination'])
        self.assertEqual(verify(self.root, self.repo)['status'], 'FAIL')

    def test_06_required_destination_symlink_fails(self):
        self.install_required()
        row = self.map['assets'][0]
        target = self.repo / row['destination']
        target.unlink()
        target.symlink_to(self.root / self.map['kit_root'] / row['source'])
        self.assertEqual(verify(self.root, self.repo)['status'], 'FAIL')

    def test_07_source_path_escape_fails(self):
        self.map['assets'][0]['source'] = '../../PLAN.json'
        self.store_map()
        self.assertEqual(verify(self.root)['status'], 'FAIL')

    def test_08_destination_outside_scope_fails(self):
        self.map['assets'][0]['destination'] = 'packages/app/src/app.tsx'
        self.store_map()
        self.assertEqual(verify(self.root)['status'], 'FAIL')

    def test_09_brand_contract_changes_invalidate_receipt_digest(self):
        plan = load(self.root / 'PLAN.json')
        node = next(n for n in plan['nodes'] if n['id'] == 'S05-W1-T2')
        old = contract_digest(node, self.root, plan)
        path = self.root / 'BRAND-INTEGRATION.md'
        path.write_text(path.read_text() + '\nChanged normative rule for synthetic test.\n')
        self.assertNotEqual(contract_digest(node, self.root, plan), old)

    def test_10_no_legacy_redraw_instruction_in_s05(self):
        plan = load(self.root / 'PLAN.json')
        for node in plan['nodes']:
            if not node['id'].startswith('S05'):
                continue
            text = json.dumps(node, ensure_ascii=False)
            self.assertNotIn('Prepare SVG limpo da marca por vetorização', text)
            self.assertNotIn('Contorno do elo', text)
            self.assertEqual(len(node['axioms']), 5)

    def test_11_wrapper_and_registry_have_exclusive_owners(self):
        plan = load(self.root / 'PLAN.json')
        path = 'packages/app/src/components/orchestra-brand.tsx'
        self.assertEqual(owners_for([path], plan['nodes'])[path], ['S05'])
        registry = 'specs/orchestra-visual/BRAND-ASSETS.json'
        self.assertEqual(owners_for([registry], plan['nodes'])[registry], ['S01'])

    def test_12_extra_source_file_fails(self):
        (self.root / self.map['kit_root'] / 'unauthorized.svg').write_text('<svg/>')
        self.assertEqual(verify(self.root)['status'], 'FAIL')

    def test_13_changed_layout_reference_fails(self):
        file = self.root / 'reference/approved.png'
        file.write_bytes(file.read_bytes() + b'changed')
        self.assertEqual(verify(self.root)['status'], 'FAIL')

    def test_14_duplicate_map_entry_fails(self):
        self.map['assets'].append(copy.deepcopy(self.map['assets'][0]))
        self.store_map()
        self.assertEqual(verify(self.root)['status'], 'FAIL')

    def test_15_full_plan_inspection_refuses_brand_corruption(self):
        target = self.root / self.map['kit_root'] / self.map['assets'][0]['source']
        target.write_bytes(b'corrupted')
        result = inspect(self.root)
        self.assertEqual(result['status'], 'FAIL')
        self.assertTrue(any('brand:' in err for err in result['errors']))

    def test_16_projection_uses_actual_version(self):
        values = render(load(self.root / 'PLAN.json'))
        self.assertIn('Contrato canônico v4.1', values['S05'])
        self.assertEqual(len(values), 39)

    def test_17_no_fonts_added_to_source_kit(self):
        self.assertFalse(any(Path(f['path']).suffix.lower() in {'.ttf','.otf','.woff','.woff2'} for f in self.map['kit_files']))

    def test_18_conditional_asset_cannot_be_copied_with_wrong_bytes(self):
        self.install_required()
        row = next(a for a in self.map['assets'] if not a['required_for_initial_brand_integration'])
        target = self.repo / row['destination']
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text('<html>SPA fallback is not an SVG</html>')
        self.assertEqual(verify(self.root, self.repo)['status'], 'FAIL')

if __name__ == '__main__':
    unittest.main()
