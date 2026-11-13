#!/usr/bin/env python3
"""Synthetic tests for reader error redaction; no private reader/recovery is invoked."""
import importlib.util
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

ROOT = Path(__file__).resolve().parents[1]
LIFECYCLE = ROOT / "script" / "evaluation-reader-lifecycle.py"
BROKER = ROOT / "script" / "evaluation-reader-broker.py"

def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module

lifecycle = load("reader_redaction_lifecycle", LIFECYCLE)
broker = load("reader_redaction_broker", BROKER)

class ReaderErrorRedaction(unittest.TestCase):
    def test_timeout_exception_never_retains_argv(self):
        sentinel = "SYNTHETIC_SECRET_ENVELOPE_08"
        proc = mock.Mock(pid=4242, args=["node", "--secret", sentinel])
        with mock.patch.object(lifecycle.os, "waitid", return_value=None), \
             mock.patch.object(lifecycle.time, "monotonic", side_effect=[0.0, 2.0]), \
             mock.patch.object(lifecycle.time, "sleep"):
            with self.assertRaises(subprocess.TimeoutExpired) as caught:
                lifecycle.wait_unreaped(proc, 1)
        self.assertEqual(caught.exception.cmd, "reader-process")
        self.assertNotIn(sentinel, str(caught.exception))
        self.assertEqual(lifecycle.safe_failure_diagnostic(caught.exception), "reader-timeout-UNKNOWN")

    def test_signal_and_failure_diagnostics_are_allowlisted(self):
        sentinel = "SYNTHETIC_SECRET_SIGNAL_08"
        cases = [
            (KeyboardInterrupt(sentinel), "reader-interrupted-UNKNOWN"),
            (RuntimeError(sentinel), "reader-failure-UNKNOWN"),
            (subprocess.TimeoutExpired(["node", sentinel], 1, output=sentinel, stderr=sentinel),
             "reader-timeout-UNKNOWN"),
        ]
        for error, expected in cases:
            with self.subTest(expected=expected):
                diagnostic = broker.safe_error_diagnostic(error)
                self.assertEqual(diagnostic, expected)
                self.assertNotIn(sentinel, diagnostic)
                self.assertNotIn(sentinel, repr({"status": "UNKNOWN", "diagnostic": diagnostic}))

    def test_failed_child_output_is_scrubbed_without_removing_unknown(self):
        sentinel = "SYNTHETIC_SECRET_STDOUT_STDERR_08"
        with tempfile.TemporaryDirectory() as temp:
            run = Path(temp)
            (run / "stdout.json").write_text(sentinel)
            (run / "stderr.txt").write_text(sentinel)
            broker.scrub_capture(run)
            self.assertEqual((run / "stdout.json").read_bytes(), b"")
            self.assertEqual((run / "stderr.txt").read_bytes(), b"")
            stop = {"status": "UNKNOWN", "diagnostic": "reader-failure-UNKNOWN",
                    "recovery": "EXPLICIT_REVIEW_REQUIRED"}
            self.assertEqual(stop["status"], "UNKNOWN")
            self.assertNotIn(sentinel, repr(stop))

    def test_cli_failure_has_no_traceback_or_exception_payload(self):
        sentinel = "SYNTHETIC_SECRET_TRACEBACK_08"
        completed = subprocess.run(
            [sys.executable, str(BROKER)],
            text=True, capture_output=True, timeout=5,
        )
        self.assertEqual(completed.returncode, 1)
        self.assertNotIn("Traceback", completed.stderr)
        self.assertNotIn(sentinel, completed.stdout + completed.stderr)
        self.assertIn('"status":"UNKNOWN"', completed.stderr)
        self.assertIn('"diagnostic":"reader-failure-UNKNOWN"', completed.stderr)

if __name__ == "__main__":
    unittest.main(verbosity=2)
