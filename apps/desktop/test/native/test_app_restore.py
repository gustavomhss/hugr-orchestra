#!/usr/bin/env python3
"""Reopening the apps that were open when the workspace stopped, with real processes and real desktop entries.

    python3 -B test/native/test_app_restore.py --workspace resources/linux-runtime/workspace.py --self-check

Needs Linux /proc and PyGObject's Gio (the a11y test image has both) but no display: apps are shell probes that Gio
really launches, and `remember` scans the real /proc for real child processes. Nothing is stubbed.
--self-check reruns each named test against a temporary mutant and requires its named assertion to fail.
"""

import argparse
import ast
import importlib.util
import io
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import time
import unittest

import gi

gi.require_version("Gio", "2.0")
from gi.repository import Gio

MARKER = "ORCHESTRA_APP_ID"
# A child that makes itself non-dumpable: its /proc entries become root-owned and its environ unreadable.
NON_DUMPABLE = "import ctypes, signal; ctypes.CDLL(None).prctl(4, 0, 0, 0, 0); signal.pause()"


class AppRestoreTests(unittest.TestCase):
    api = None

    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix="app-restore-")
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name).resolve()
        self.runtime = self.root / "runtime"
        (self.runtime / "run").mkdir(mode=0o700, parents=True)
        self.record = self.runtime / "open-apps.json"
        self.log = self.root / "launched.log"

    def app(self, name, launchable=True):
        """An installed desktop entry whose program logs its marker and whether the record still existed.

        Apps that Gio launches here (editor, viewer, broken) never share a name with the processes the remember tests
        start, so a probe that has logged but not yet exited cannot leak into a remember result."""
        program = self.root / name
        program.write_text(f'#!/bin/sh\n[ -e "$1" ] && state=present || state=absent\n'
                           f'printf "%s %s %s\\n" "$0" "${MARKER}" "$state" >> "$2"\n')
        program.chmod(0o755)
        entry = self.root / f"{name}.desktop"
        # A working directory that does not exist makes the spawn itself fail, before any program runs.
        directory = "" if launchable else f"Path={self.root / 'missing'}\n"
        entry.write_text(f"[Desktop Entry]\nType=Application\nName={name}\nExec={program} {self.record} {self.log}\n{directory}")
        return Gio.DesktopAppInfo.new_from_filename(str(entry))

    def installed(self, *names):
        return {f"{name}.desktop": self.app(name) for name in names}

    def running(self, *app_ids):
        """Real processes that inherited the marker, as a launched app's children do."""
        processes = [subprocess.Popen(["sleep", "60"], env={**os.environ, MARKER: app_id}) for app_id in app_ids]
        for process in processes:
            self.addCleanup(process.wait)
            self.addCleanup(process.kill)
        # Popen returns once exec has replaced the child's memory, before the kernel has laid out its environment, so
        # /proc/<pid>/environ can still read empty for a moment; a real app has long been running when remember scans.
        deadline = time.monotonic() + 5
        for process, app_id in zip(processes, app_ids):
            marker = f"{MARKER}={app_id}".encode()
            while marker not in Path(f"/proc/{process.pid}/environ").read_bytes().split(b"\0"):
                if time.monotonic() >= deadline:
                    raise AssertionError("marked process never exposed its environment")
                time.sleep(0.01)
        return processes

    def launched(self, count):
        """Each launched probe as "<program> <marker> <record present|absent>", once `count` have logged or after 10s."""
        deadline = time.monotonic() + 10
        while time.monotonic() < deadline and (not self.log.exists() or len(self.log.read_text().splitlines()) < count):
            time.sleep(0.05)
        lines = self.log.read_text().splitlines() if self.log.exists() else []
        return sorted(" ".join((Path(line.split()[0]).name, *line.split()[1:])) for line in lines)

    def remembered(self, installed):
        self.api.remember(installed, _runtime=self.runtime)
        return json.loads(self.record.read_bytes()) if self.record.exists() else None

    def test_launch_marks_the_app(self):
        installed = self.installed("editor")
        self.api.launch_app("editor.desktop", {"DISPLAY": ":100"}, installed)
        self.assertEqual(["editor editor.desktop absent"], self.launched(1), "launch-marks-app")

    def test_remember_records_installed_apps_that_still_run(self):
        installed = {f"{name}.desktop": None for name in ("chat", "notes", "closed")}
        closed = self.running("closed.desktop")[0]
        closed.kill()
        closed.wait()
        self.running("notes.desktop", "chat.desktop", "notes.desktop", "removed.desktop")
        self.assertEqual(["chat.desktop", "notes.desktop"], self.remembered(installed), "remember-running-installed")
        self.assertEqual(0o600, self.record.stat().st_mode & 0o777, "remember-running-installed")

    def test_remember_keeps_at_most_sixteen_apps(self):
        names = [f"app-{index:02}" for index in range(20)]
        installed = {f"{name}.desktop": None for name in names}
        self.running(*reversed(list(installed)))
        self.assertEqual([f"{name}.desktop" for name in names[:16]], self.remembered(installed), "remember-limit")

    def test_remember_without_open_apps_removes_the_record(self):
        self.record.write_text('["notes.desktop"]')
        self.assertIsNone(self.remembered({"notes.desktop": None}), "remember-empty-removes")

    def test_remember_skips_processes_it_cannot_read(self):
        installed = {"chat.desktop": None, "secret.desktop": None}
        hidden = subprocess.Popen([sys.executable, "-c", NON_DUMPABLE], env={**os.environ, MARKER: "secret.desktop"})
        self.addCleanup(hidden.wait)
        self.addCleanup(hidden.kill)
        deadline = time.monotonic() + 5
        while os.access(f"/proc/{hidden.pid}/environ", os.R_OK) and time.monotonic() < deadline:
            time.sleep(0.02)
        self.assertFalse(os.access(f"/proc/{hidden.pid}/environ", os.R_OK), "fixture: environ became unreadable")
        self.running("chat.desktop")
        try:
            result = self.remembered(installed)
        except Exception as error:
            result = error
        self.assertEqual(["chat.desktop"], result, "remember-tolerates-unreadable")

    def test_restore_removes_the_record_before_reopening(self):
        installed = self.installed("viewer", "editor")
        self.record.write_text('["viewer.desktop", "editor.desktop"]')
        self.api.restore(installed, {"DISPLAY": ":100"}, _runtime=self.runtime)
        self.assertEqual(["editor editor.desktop absent", "viewer viewer.desktop absent"], self.launched(2), "restore-deletes-first")
        self.assertFalse(self.record.exists(), "restore-deletes-first")

    def test_restore_refuses_garbage_and_skips_unknown_apps(self):
        installed = self.installed("editor")
        for data in ('{"editor.desktop": 1}', '"editor.desktop"', '["editor.desktop"]' + " " * 8192,
                     json.dumps(["gone.desktop"] * 16 + ["editor.desktop"]), b"\xff[", "[" * 5000):
            with self.subTest(data=str(data)[:40]):
                self.record.write_bytes(data if isinstance(data, bytes) else data.encode())
                self.api.restore(installed, {}, _runtime=self.runtime)
                self.assertFalse(self.record.exists(), "restore-removes-garbage")
        # The positive control: once it has launched, any launch the refused records started has logged too.
        self.record.write_text(json.dumps(["gone.desktop", 7, ["x"], "editor.desktop"]))
        self.api.restore(installed, {}, _runtime=self.runtime)
        time.sleep(0.5)
        self.assertEqual(["editor editor.desktop absent"], self.launched(1), "restore-refuses-garbage")

    def test_one_failing_app_does_not_keep_the_others_closed(self):
        installed = {"broken.desktop": self.app("broken", launchable=False), **self.installed("editor")}
        self.record.write_text('["broken.desktop", "editor.desktop"]')
        try:
            self.api.restore(installed, {}, _runtime=self.runtime)
        except Exception:
            pass  # A raising restore shows up below as the editor that never reopened.
        self.assertEqual(["editor editor.desktop absent"], self.launched(1), "restore-isolates-failures")


MUTATIONS = (
    ("no-marker", "test_launch_marks_the_app", "launch-marks-app",
     "{**environment, APP_MARKER: app_id}.items()", "environment.items()"),
    ("any-app", "test_remember_records_installed_apps_that_still_run", "remember-running-installed",
     "sorted(set(found).intersection(installed))", "sorted(set(found))"),
    ("no-dedupe", "test_remember_records_installed_apps_that_still_run", "remember-running-installed",
     "sorted(set(found).intersection(installed))", "sorted(app for app in found if app in installed)"),
    ("no-limit", "test_remember_keeps_at_most_sixteen_apps", "remember-limit", "[:OPEN_APPS_LIMIT]\n", "\n"),
    ("empty-kept", "test_remember_without_open_apps_removes_the_record", "remember-empty-removes",
     "    if not app_ids:\n        path.unlink(missing_ok=True)\n        return\n", ""),
    ("unreadable-fatal", "test_remember_skips_processes_it_cannot_read", "remember-tolerates-unreadable",
     "        except OSError:\n            continue  # Exited", "        except FileNotFoundError:\n            continue  # Exited"),
    ("record-kept", "test_restore_removes_the_record_before_reopening", "restore-deletes-first",
     "        path.unlink()\n        app_ids", "        app_ids"),
    ("any-shape", "test_restore_refuses_garbage_and_skips_unknown_apps", "restore-refuses-garbage",
     " or not isinstance(app_ids, list) or len(app_ids) > OPEN_APPS_LIMIT:", ":"),
    ("any-size", "test_restore_refuses_garbage_and_skips_unknown_apps", "restore-refuses-garbage",
     "    if len(data) > OPEN_APPS_BYTES or not", "    if not"),
    ("first-failure-stops", "test_one_failing_app_does_not_keep_the_others_closed", "restore-isolates-failures",
     "        try:\n            launch_app(app_id, environment, installed)\n        except Exception:\n            continue\n",
     "        launch_app(app_id, environment, installed)\n"),
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
    AppRestoreTests.api = load(args.workspace, source)
    result = unittest.TextTestRunner(verbosity=2).run(unittest.defaultTestLoader.loadTestsFromTestCase(AppRestoreTests))
    if not result.wasSuccessful():
        return 1
    if args.self_check:
        for name, test, assertion, before, after in MUTATIONS:
            if source.count(before) != 1:
                raise AssertionError("mutation anchor changed: " + name)
            AppRestoreTests.api = load(args.workspace, source.replace(before, after))
            mutant = unittest.TextTestRunner(stream=io.StringIO()).run(unittest.TestSuite([AppRestoreTests(test)]))
            if mutant.wasSuccessful() or mutant.errors or not any(assertion in failure for _, failure in mutant.failures):
                raise AssertionError("mutation escaped or failed outside its named assertion: " + name)
            print("Mutation rejected: " + name, flush=True)
    return 0


if __name__ == "__main__":
    sys.dont_write_bytecode = True
    os.umask(0o077)
    raise SystemExit(main())
