#!/usr/bin/env python3
"""VS Code-family screen-reader seeding in the workspace runtime, on real files.

    python3 -B test/native/test_editor_settings.py --workspace resources/linux-runtime/workspace.py --self-check

Plain file system work: it needs no D-Bus, display or Gio, and runs on any POSIX host.
--self-check reruns each named test against a temporary mutant and requires its named assertion to fail.
"""

import argparse
import ast
import importlib.util
import io
import json
import os
from pathlib import Path
import sys
import tempfile
import unittest

KEY = "editor.accessibilitySupport"


class EditorSettingsTests(unittest.TestCase):
    api = None

    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix="editor-settings-")
        self.addCleanup(self.temporary.cleanup)
        self.home = Path(self.temporary.name)

    def settings(self, product="Code"):
        return self.home / ".config" / product / "User" / "settings.json"

    def seed(self, *app_ids):
        self.api.seed_editor_accessibility(app_ids, _home=self.home)

    def write(self, data, product="Code"):
        path = self.settings(product)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)
        return path

    def test_absent_file_is_created_on(self):
        self.seed("code.desktop", "codium.desktop")
        for product in ("Code", "VSCodium"):
            self.assertEqual({KEY: "on"}, json.loads(self.settings(product).read_bytes()), "seed-absent-file-on")
        self.assertFalse(self.settings("Code - OSS").exists(), "seed-only-launched-editors")

    def test_missing_key_is_added_and_other_settings_kept(self):
        for data in (b"", b"  \n", json.dumps({"files.trimTrailingWhitespace": True, "[python]": {KEY: "off"}}).encode()):
            with self.subTest(data=data):
                self.write(data)
                self.seed("code.desktop")
                expected = {KEY: "on"} | ({"files.trimTrailingWhitespace": True, "[python]": {KEY: "off"}} if data.strip() else {})
                self.assertEqual(expected, json.loads(self.settings().read_bytes()), "seed-missing-key")

    def test_explicit_choice_is_never_overwritten(self):
        for value in ("off", "auto", "on"):
            with self.subTest(value=value):
                data = json.dumps({KEY: value, "window.zoomLevel": 1}, indent=2).encode()
                self.write(data)
                self.seed("code.desktop")
                self.assertEqual(data, self.settings().read_bytes(), "seed-keeps-user-choice")

    def test_unparsed_or_foreign_files_are_left_alone(self):
        commented = b'{\n    // tabs please\n    "editor.insertSpaces": false,\n}\n'
        for data in (commented, b"[1, 2]", b"\xff\xfe"):
            with self.subTest(data=data):
                path = self.write(data)
                self.seed("code.desktop")
                self.assertEqual(data, path.read_bytes(), "seed-leaves-jsonc-alone")
        target = self.home / "elsewhere.json"
        target.write_bytes(b"{}")
        self.settings().unlink()
        self.settings().symlink_to(target)
        self.seed("code.desktop")
        # Dotfile managers link settings.json; replacing the link with a file would detach it.
        self.assertTrue(self.settings().is_symlink() and target.read_bytes() == b"{}", "seed-keeps-linked-settings")

    def test_other_apps_and_unwritable_profiles_do_not_fail(self):
        self.seed("org.gnome.TextEditor.desktop", "xterm.desktop")
        self.assertFalse((self.home / ".config").exists(), "seed-only-editors")
        (self.home / ".config").mkdir()
        (self.home / ".config" / "Code").write_bytes(b"not a directory")
        self.seed("code.desktop")  # Must not raise: accessibility never blocks a launch.


MUTATIONS = (
    ("keeps-user-choice", "test_explicit_choice_is_never_overwritten", "seed-keeps-user-choice",
     ' or "editor.accessibilitySupport" in settings:', ":"),
    ("jsonc", "test_unparsed_or_foreign_files_are_left_alone", "seed-leaves-jsonc-alone",
     "            settings = json.loads(data) if data.strip() else {}", "            settings = {}"),
    ("symlink", "test_unparsed_or_foreign_files_are_left_alone", "seed-keeps-linked-settings",
     "            if path.is_symlink():\n                continue\n", ""),
)


def load(path, source):
    module = importlib.util.module_from_spec(importlib.util.spec_from_file_location("runtime_workspace", path))
    exec(compile(source, str(path), "exec"), module.__dict__)
    return module


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--workspace", type=Path, default=Path(__file__).resolve().parents[2] / "resources/linux-runtime/workspace.py")
    parser.add_argument("--self-check", action="store_true")
    args = parser.parse_args()
    source = args.workspace.read_text()
    ast.parse(source, filename=str(args.workspace))
    EditorSettingsTests.api = load(args.workspace, source)
    result = unittest.TextTestRunner(verbosity=2).run(unittest.defaultTestLoader.loadTestsFromTestCase(EditorSettingsTests))
    if not result.wasSuccessful():
        return 1
    if args.self_check:
        for name, test, assertion, before, after in MUTATIONS:
            if source.count(before) != 1:
                raise AssertionError("mutation anchor changed: " + name)
            EditorSettingsTests.api = load(args.workspace, source.replace(before, after))
            mutant = unittest.TextTestRunner(stream=io.StringIO()).run(unittest.TestSuite([EditorSettingsTests(test)]))
            if mutant.wasSuccessful() or mutant.errors or not any(assertion in failure for _, failure in mutant.failures):
                raise AssertionError("mutation escaped or failed outside its named assertion: " + name)
            print("Mutation rejected: " + name, flush=True)
    return 0


if __name__ == "__main__":
    sys.dont_write_bytecode = True
    os.umask(0o077)
    raise SystemExit(main())
