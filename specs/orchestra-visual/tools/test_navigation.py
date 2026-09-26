"""Navigation tests only: no GitHub writes and no product execution."""
import copy
import json
import re
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
import render_navigation as nav


class NavigationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.root = Path(__file__).resolve().parents[1]
        cls.plan, cls.nodes, cls.tickets, cls.surfaces = nav.read_contracts(cls.root)
        cls.text = nav.render(cls.root)

    def test_all_143_nodes_have_exactly_one_anchor(self):
        anchors = re.findall(r'<a id="([^"]+)"', self.text)
        self.assertEqual(len(anchors), len(self.nodes))
        self.assertEqual(set(anchors), {i.lower() for i in self.nodes})

    def test_all_39_ticket_links(self):
        for entry in self.tickets.values():
            self.assertIn('/issues/' + str(entry['number']) + ')', self.text)
        self.assertEqual(len(self.tickets), 39)

    def test_all_66_tasks_have_existing_show_command(self):
        tasks = [n for n in self.nodes.values() if n['kind'] == 'task']
        self.assertEqual(len(tasks), 66)
        for n in tasks:
            self.assertEqual(self.text.count('python3 tools/select_work.py --show ' + n['id'] + '\n'), 1)

    def test_package_links_and_fragment_targets(self):
        self.assertEqual(nav.validate_links(self.root, self.text), [])

    def test_unknown_anchor_is_rejected(self):
        self.assertIn('Unknown anchor', '\n'.join(nav.validate_links(self.root, '[bad](#missing-node)')))

    def test_missing_file_is_rejected(self):
        self.assertIn('Missing package link', '\n'.join(nav.validate_links(self.root, '[bad](missing-input.md)')))

    def test_patterns_are_not_misrepresented_as_existing_files(self):
        result = nav.path_description(self.root, 'packages/app/src/new-*.tsx')
        self.assertIn('padrão', result)
        self.assertNotIn('](', result)

    def test_proposed_file_is_not_given_broken_link(self):
        with tempfile.TemporaryDirectory() as td:
            result = nav.path_description(self.root, 'packages/app/src/nonexistent.tsx', Path(td))
            self.assertIn('a conferir', result)
            self.assertNotIn('](', result)

    def test_real_source_link_uses_code_root(self):
        with tempfile.TemporaryDirectory() as td:
            p = Path(td) / 'packages/app/src/real.tsx'
            p.parent.mkdir(parents=True); p.write_text('/* synthetic navigation fixture */')
            result = nav.path_description(self.root, 'packages/app/src/real.tsx', Path(td))
            self.assertIn('(../../packages/app/src/real.tsx)', result)

    def test_ticket_mapping_is_unambiguous(self):
        self.assertEqual(nav.containing_ticket(self.nodes, 'S17-W1-T2'), 'S17')
        self.assertEqual(self.tickets['S17']['number'], 160)
        self.assertEqual(nav.containing_ticket(self.nodes, 'I01-W1-T1'), 'I01')

    def test_unsafe_navigation_path_is_rejected(self):
        for value in ('../escape', '/absolute', 'a\\b', 'a\nb'):
            with self.subTest(value=value), self.assertRaises(ValueError):
                nav.safe_path(value)

    def test_duplicate_ticket_number_is_rejected(self):
        github = json.loads((self.root / 'GITHUB.json').read_text())
        broken = copy.deepcopy(github)
        broken['issues']['S17']['number'] = broken['issues']['S18']['number']
        original = nav.read_json
        def fake(path):
            return broken if path.name == 'GITHUB.json' else original(path)
        with patch.object(nav, 'read_json', side_effect=fake), self.assertRaises(ValueError):
            nav.read_contracts(self.root)

    def test_render_does_not_mutate_canonical_inputs(self):
        before = copy.deepcopy((self.plan, self.nodes, self.tickets, self.surfaces))
        nav.render(self.root)
        self.assertEqual((self.plan, self.nodes, self.tickets, self.surfaces), before)


if __name__ == '__main__':
    unittest.main()
