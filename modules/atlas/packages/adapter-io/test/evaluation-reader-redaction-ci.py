#!/usr/bin/env python3
"""Synthetic tests for reader error redaction and safe failure evidence."""
import importlib.util
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock
import hashlib
import json

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

    def test_failure_after_persisted_capture_keeps_forensic_digests(self):
        sentinel = "SYNTHETIC_PRIVATE_PAYLOAD_08"
        stdout = json.dumps({"body": sentinel, "evaluation": {"phase": "evaluation"}}).encode()
        stderr = ("diagnostic " + sentinel).encode()
        response = stdout
        with tempfile.TemporaryDirectory() as temp:
            run = Path(temp)
            (run / "stdout.json").write_bytes(stdout)
            (run / "stderr.txt").write_bytes(stderr)
            (run / "response.json").write_bytes(response)
            (run / "process-start.json").write_text('{"identity":"synthetic"}')
            error = RuntimeError(sentinel)
            evidence = broker.preserve_failure_evidence(run, None, None, error,
                {"lifecycle_state": "POSSIBLY_STARTED_TERMINATION_UNKNOWN", "state": "UNKNOWN"})
            stored = json.loads((run / "failure-evidence.json").read_text())
            self.assertEqual(evidence, stored)
            self.assertEqual(stored["status"], "UNKNOWN")
            self.assertEqual(stored["outputs"]["stdout_persisted"],
                {"present": True, "bytes": len(stdout), "sha256": hashlib.sha256(stdout).hexdigest()})
            self.assertEqual(stored["outputs"]["stderr_persisted"]["sha256"], hashlib.sha256(stderr).hexdigest())
            self.assertEqual(stored["outputs"]["response_persisted"]["sha256"], hashlib.sha256(response).hexdigest())
            self.assertTrue(stored["lifecycle_records"]["process-start.json"])
            self.assertFalse(stored["payload_retained"])
            self.assertEqual(stored["capture_completeness"], "INCOMPLETE_UNKNOWN")
            for name in ("stdout.json", "stderr.txt", "response.json"):
                self.assertEqual((run / name).read_bytes(), b"")
            self.assertNotIn(sentinel, (run / "failure-evidence.json").read_text())
            self.assertEqual(stored["process_outcome"]["state"], "UNKNOWN")

    def test_anonymous_output_streams_are_hashed_without_payload_retention(self):
        secret = b"SYNTHETIC_ANONYMOUS_STDERR_08"
        with tempfile.TemporaryDirectory() as temp:
            run = Path(temp)
            out = tempfile.TemporaryFile()
            err = tempfile.TemporaryFile()
            try:
                out.write(b"partial stdout " + secret);err.write(secret)
                out.flush();err.flush()
                evidence = broker.preserve_failure_evidence(run, out, err,
                    KeyboardInterrupt("private signal detail"), {"state": "UNKNOWN"})
                self.assertFalse(evidence["outputs"]["stdout_anonymous"]["complete"])
                self.assertFalse(evidence["outputs"]["stderr_anonymous"]["complete"])
                self.assertEqual(evidence["outputs"]["stdout_anonymous"]["sha256"],
                    hashlib.sha256(b"partial stdout " + secret).hexdigest())
                self.assertEqual(evidence["outputs"]["stderr_anonymous"]["sha256"],
                    hashlib.sha256(secret).hexdigest())
                self.assertNotIn(secret.decode(), (run / "failure-evidence.json").read_text())
            finally:
                out.close();err.close()


    def test_anonymous_stream_hash_is_complete_only_after_absence_proof(self):
        with tempfile.TemporaryDirectory() as temp:
            run = Path(temp)
            out = tempfile.TemporaryFile()
            err = tempfile.TemporaryFile()
            try:
                out.write(b"safe-output");err.write(b"safe-diagnostic")
                out.flush();err.flush()
                outcome = {"lifecycle_state": "TERMINATION_PROVEN", "group_absent": True,
                           "kernel_probe": "killpg-zero-ESRCH", "members": []}
                evidence = broker.preserve_failure_evidence(run, out, err,
                    RuntimeError("synthetic"), outcome)
                self.assertEqual(evidence["capture_completeness"], "COMPLETE_AFTER_TERMINATION_PROOF")
                self.assertTrue(evidence["outputs"]["stdout_anonymous"]["complete"])
                self.assertTrue(evidence["outputs"]["stderr_anonymous"]["complete"])
            finally:
                out.close();err.close()

    def test_failure_after_exit_proof_reuses_proof_without_resignaling(self):
        with tempfile.TemporaryDirectory() as temp:
            run = Path(temp)
            anchor = {"pid": 41, "pgid": 41, "sid": 41, "starttime": 900,
                      "pid_namespace": "pid:[synthetic]", "boot_id": "synthetic"}
            proof = {"lifecycle_state": "TERMINATION_PROVEN", "group_absent": True,
                     "kernel_probe": "killpg-zero-ESRCH", "members": [], "anchor": anchor}
            (run / "process-exit.json").write_text(json.dumps(proof))
            proc = mock.Mock(returncode=0)
            with mock.patch.object(lifecycle, "stop_group") as stop:
                outcome = broker.failure_process_outcome(proc, anchor, run)
            self.assertEqual(outcome, proof)
            stop.assert_not_called()

    def test_mismatched_exit_record_stays_unknown_without_signal(self):
        with tempfile.TemporaryDirectory() as temp:
            run = Path(temp)
            anchor = {"pid": 41}
            (run / "process-exit.json").write_text(json.dumps({
                "lifecycle_state": "TERMINATION_PROVEN", "group_absent": True,
                "kernel_probe": "killpg-zero-ESRCH", "members": [], "anchor": {"pid": 42}}))
            proc = mock.Mock(returncode=0)
            with mock.patch.object(lifecycle, "stop_group") as stop:
                outcome = broker.failure_process_outcome(proc, anchor, run)
            self.assertEqual(outcome["state"], "UNKNOWN")
            self.assertEqual(outcome["lifecycle_state"], "PROCESS_EXIT_RECORD_UNPROVEN")
            stop.assert_not_called()

    def test_cli_failure_has_no_traceback_or_exception_payload(self):
        completed = subprocess.run([sys.executable, str(BROKER)],
            text=True, capture_output=True, timeout=5)
        self.assertEqual(completed.returncode, 1)
        self.assertNotIn("Traceback", completed.stderr)
        self.assertIn('"status":"UNKNOWN"', completed.stderr)
        self.assertIn('"diagnostic":"reader-failure-UNKNOWN"', completed.stderr)

if __name__ == "__main__":
    unittest.main(verbosity=2)
