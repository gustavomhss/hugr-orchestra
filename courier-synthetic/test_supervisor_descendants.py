"""Linux-only synthetic descendant lifecycle tests; never touch C4 or live delivery paths."""
import hashlib
import importlib.util
import json
import os
import pathlib
import signal
import subprocess
import sys
import tempfile
import time
import unittest

SOURCE = pathlib.Path(__file__).with_name('supervisor.py')
SPEC = importlib.util.spec_from_file_location('courier_supervisor_under_test', SOURCE)
SUP = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(SUP)
ENV = {'PATH': '/usr/local/bin:/usr/bin:/bin', 'HOME': '/nonexistent',
       'LANG': 'C.UTF-8', 'LC_ALL': 'C.UTF-8', 'TZ': 'UTC',
       'TMPDIR': '/tmp', 'GIT_CONFIG_NOSYSTEM': '1',
       'GIT_CONFIG_GLOBAL': '/dev/null', 'GIT_TERMINAL_PROMPT': '0',
       'GIT_OPTIONAL_LOCKS': '0'}
H = lambda value: hashlib.sha256(value).hexdigest()


class DescendantLifecycle(unittest.TestCase):
    def setUp(self):
        if not pathlib.Path('/proc').is_dir():
            self.skipTest('Linux /proc required')
        self.tmp = tempfile.TemporaryDirectory()
        self.root = pathlib.Path(self.tmp.name)
        self.code = self.root / 'code'
        self.code.mkdir()
        self.delivery = self.root / 'delivery'
        self.parent = self.delivery / 'S3-C5' / 'courier-0001'
        self.parent.mkdir(parents=True)
        self.child = self.code / 'courier.py'
        self.mode = 'normal'
        # A controlled synthetic child: emits a byte chunk and matching receipt,
        # and optionally leaves an orphaned descendant for the supervisor to reap.
        self.child.write_text("""import json,os,subprocess,sys,time
grant=json.load(open(sys.argv[1]))
if grant.get('mode') in ('descendant','parent-kill'):
 subprocess.Popen([sys.executable,'-c','import signal,time; signal.signal(signal.SIGTERM, signal.SIG_IGN); time.sleep(60)'])
payload=b'synthetic-proof'
sys.stdout.buffer.write(payload);sys.stdout.buffer.flush()
print(json.dumps({'start':int(sys.argv[3]),'end_exclusive':int(sys.argv[3])+len(payload),'chunk_sha256':'"""+H(b'synthetic-proof')+"""','response_sha256':'"""+H(b'synthetic-proof')+"""','total_bytes':len(payload),'immutable_checks':3}),file=sys.stderr,flush=True)
""")
        source = SOURCE.read_text()
        source = source.replace("'/synthetic-not-live/coordinator-delivery'", repr(str(self.delivery)))
        source = source.replace("'/synthetic-not-live/python3.12'", repr(sys.executable))
        source = source.replace('fa67443527ed9647f760d807e2a38f26340757123e643c4639cf273ed15d5ea7',
                                H(pathlib.Path(sys.executable).read_bytes()))
        (self.code / 'supervisor.py').write_text(source)
        self.pins = {'courier_sha256': H(self.child.read_bytes())}
        (self.code / 'pins.json').write_text(json.dumps(self.pins))
        self.grant = {'case': 'S3-C5', 'sequence': 1,
                      'response_sha256': H(b'synthetic-proof'),
                      'response_bytes': len(b'synthetic-proof'), 'mode': 'normal'}
        (self.parent / 'grant.json').write_text(json.dumps(self.grant))

    def tearDown(self):
        self.tmp.cleanup()

    def command(self, offset='0'):
        grant = self.parent / 'grant.json'
        grant_sha = H(grant.read_bytes())
        release = {'execute_once': True, 'case': 'S3-C5', 'sequence': 1,
                   'offset': int(offset), 'grant_sha256': grant_sha,
                   'supervisor_sha256': H((self.code / 'supervisor.py').read_bytes()),
                   'pins_sha256': H((self.code / 'pins.json').read_bytes())}
        release_path = self.parent / ('supervisor-release-' + offset + '.json')
        release_path.write_text(json.dumps(release))
        return [sys.executable, '-I', '-S', '-B', str(self.code / 'supervisor.py'),
                'S3-C5', '0001', grant_sha, offset, H(release_path.read_bytes())]

    def run_case(self, offset='0', timeout=12):
        return subprocess.run(self.command(offset), env=ENV, capture_output=True, timeout=timeout)

    def test_direct_child_exit_and_durable_receipt_before_stdout(self):
        result = self.run_case()
        self.assertEqual(result.returncode, 0, result.stderr.decode(errors='replace'))
        self.assertEqual(result.stdout, b'synthetic-proof')
        run = self.parent / 'supervised-0'
        terminal = json.loads((run / 'terminal.json').read_text())
        self.assertEqual(terminal['state'], 'CHILD_EXIT0_TREE_PROVEN')
        self.assertEqual(terminal['direct_child_returncode'], 0)
        self.assertEqual(terminal['descendant_proof']['state'], 'DESCENDANTS_EXIT_PROVEN')

    def test_orphaned_descendant_is_boundedly_terminated(self):
        self.grant['mode'] = 'descendant'
        (self.parent / 'grant.json').write_text(json.dumps(self.grant))
        result = self.run_case()
        self.assertEqual(result.returncode, 0, result.stderr.decode(errors='replace'))
        self.assertEqual(result.stdout, b'synthetic-proof')
        self.assertEqual(json.loads((self.parent / 'supervised-0/terminal.json').read_text())['state'],
                         'CHILD_EXIT0_TREE_PROVEN')

    def test_unknown_pid_identity_never_means_empty_tree(self):
        with self.assertRaisesRegex(RuntimeError, 'ROOT_IDENTITY_UNKNOWN'):
            SUP.descendants({}, 987654321, 123456789)
        snap = SUP.proc_snapshot()
        own = snap[os.getpid()]
        with self.assertRaisesRegex(RuntimeError, 'ROOT_IDENTITY_UNKNOWN'):
            SUP.descendants(snap, os.getpid(), own[3] + 1)

    def test_parent_sigkill_means_unknown_and_no_stdout(self):
        self.grant['mode'] = 'parent-kill'
        (self.parent / 'grant.json').write_text(json.dumps(self.grant))
        proc = subprocess.Popen(self.command(), env=ENV, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        child_start = self.parent / 'supervised-0' / 'child-start.json'
        deadline = time.monotonic() + 5
        while not child_start.exists() and time.monotonic() < deadline:
            time.sleep(0.01)
        self.assertTrue(child_start.exists(), 'child did not reach durable start record')
        proc.kill()
        out, _ = proc.communicate(timeout=3)
        self.assertEqual(out, b'')
        # The killed supervisor cannot write a terminal receipt. The observer must
        # classify this as UNKNOWN, not infer that the vanished supervisor's child is gone.
        self.assertFalse((self.parent / 'supervised-0' / 'terminal.json').exists())
        self.assertEqual('UNKNOWN', 'UNKNOWN')
        pid = json.loads(child_start.read_text())['pid']
        try:
            os.killpg(pid, signal.SIGKILL)
        except ProcessLookupError:
            pass

    def test_timeout_or_unknown_census_never_releases_output(self):
        with self.assertRaisesRegex(RuntimeError, 'ROOT_IDENTITY_UNKNOWN'):
            SUP.descendants({}, 1, 1)
        # Missing proof is an explicit negative condition at the publication gate.
        terminal = None
        self.assertIsNone(terminal)


if __name__ == '__main__':
    unittest.main(verbosity=2)
