#!/usr/bin/env python3
"""Renderer accessibility for Chromium-family apps launched from the workspace, on real desktop entries.

    python3 -B test/native/test_app_launch.py --workspace resources/linux-runtime/workspace.py --self-check

Needs PyGObject's Gio/GLib (the a11y test image has them) but no D-Bus or display: it only builds the
DesktopAppInfo that `workspace.py launch` would start and reads its command line.
--self-check reruns each named test against a temporary mutant and requires its named assertion to fail.
"""

import argparse
import ast
import importlib.util
import io
import os
from pathlib import Path
import sys
import tempfile
import unittest

import gi

gi.require_version("Gio", "2.0")
from gi.repository import Gio

SWITCH = "--force-renderer-accessibility"


class AppLaunchTests(unittest.TestCase):
    api = None

    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix="app-launch-")
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.bin = self.root / "bin"
        self.bin.mkdir()
        self.addCleanup(os.environ.__setitem__, "PATH", os.environ["PATH"])
        os.environ["PATH"] = f"{self.bin}{os.pathsep}{os.environ['PATH']}"

    def program(self, directory, name, *markers):
        directory = self.root / directory
        directory.mkdir(parents=True, exist_ok=True)
        path = directory / name
        path.write_text("#!/bin/sh\n")
        path.chmod(0o755)
        for marker in markers:
            (directory / marker).write_bytes(b"")
        return path

    def entry(self, exec_line, extra=""):
        path = self.root / "app.desktop"
        path.write_text(f"[Desktop Entry]\nType=Application\nName=Probe\nName[pt_BR]=Sonda\nExec={exec_line}\n{extra}")
        return Gio.DesktopAppInfo.new_from_filename(str(path))

    def launched(self, app):
        return self.api.renderer_accessibility(app)

    def test_electron_app_gets_the_switch_and_keeps_its_entry(self):
        program = self.program("electron", "chat", "resources.pak", "v8_context_snapshot.bin")
        app = self.launched(self.entry(f"{program} --no-sandbox %U", f"Path={self.root}\n"))
        self.assertEqual(f"{program} --no-sandbox %U {SWITCH}", app.get_commandline(), "chromium-gets-switch")
        self.assertEqual(("Probe", str(self.root)), (app.get_string("Name"), app.get_string("Path")), "entry-kept")

    def test_symlinked_launcher_resolves_to_the_chromium_directory(self):
        # Slack, Discord and Chrome put a symlink in a bin directory and their real files elsewhere.
        program = self.program("opt/chat", "chat", "snapshot_blob.bin")
        (self.bin / "chat").symlink_to(program)
        app = self.launched(self.entry("chat %U"))
        self.assertTrue(app.get_commandline().endswith(SWITCH), "symlink-resolved")

    def test_other_apps_launch_unchanged(self):
        for markers in ((), ("resources",), ("resources.pak.d",)):
            with self.subTest(markers=markers):
                program = self.program(f"gtk{len(markers)}", "editor", *markers)
                app = self.entry(f"{program} %F")
                self.assertIs(app, self.launched(app), "non-chromium-unchanged")
        # Gio refuses an entry whose program is missing at load time; it can still vanish before launch.
        program = self.program("gone", "app", "resources.pak")
        gone = self.entry(f"{program} %F")
        program.unlink()
        self.assertIs(gone, self.launched(gone), "missing-executable-unchanged")

    def test_switch_is_never_doubled(self):
        program = self.program("code", "code", "resources.pak")
        app = self.entry(f"{program} {SWITCH} --no-sandbox %F")
        self.assertIs(app, self.launched(app), "switch-not-doubled")


MUTATIONS = (
    ("no-switch", "test_electron_app_gets_the_switch_and_keeps_its_entry", "chromium-gets-switch",
     '    entry.set_string("Desktop Entry", "Exec", f"{command} {RENDERER_SWITCH}")\n', ""),
    ("no-realpath", "test_symlinked_launcher_resolves_to_the_chromium_directory", "symlink-resolved",
     "Path(os.path.realpath(executable)).parent", "Path(executable).parent"),
    ("any-app", "test_other_apps_launch_unchanged", "non-chromium-unchanged",
     "            or not any((Path(os.path.realpath(executable)).parent / name).is_file() for name in CHROMIUM_FILES)):",
     "            or False):"),
    ("doubled", "test_switch_is_never_doubled", "switch-not-doubled",
     "    if (not executable or RENDERER_SWITCH in command\n", "    if (not executable\n"),
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
    AppLaunchTests.api = load(args.workspace, source)
    result = unittest.TextTestRunner(verbosity=2).run(unittest.defaultTestLoader.loadTestsFromTestCase(AppLaunchTests))
    if not result.wasSuccessful():
        return 1
    if args.self_check:
        for name, test, assertion, before, after in MUTATIONS:
            if source.count(before) != 1:
                raise AssertionError("mutation anchor changed: " + name)
            AppLaunchTests.api = load(args.workspace, source.replace(before, after))
            mutant = unittest.TextTestRunner(stream=io.StringIO()).run(unittest.TestSuite([AppLaunchTests(test)]))
            if mutant.wasSuccessful() or mutant.errors or not any(assertion in failure for _, failure in mutant.failures):
                raise AssertionError("mutation escaped or failed outside its named assertion: " + name)
            print("Mutation rejected: " + name, flush=True)
    return 0


if __name__ == "__main__":
    sys.dont_write_bytecode = True
    os.umask(0o077)
    raise SystemExit(main())
