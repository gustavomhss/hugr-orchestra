"""Bounded, fail-closed supervision for the synthetic courier.

A missing PID is never treated as proof. Linux /proc census failures, PID reuse,
unreadable entries, escaped descendants, or an unobservable supervisor death
produce UNKNOWN and suppress stdout. This is synthetic infrastructure only.
"""
import ctypes
import errno
import hashlib
import json
import os
import signal
import subprocess
import sys
import time
from pathlib import Path

P = Path(__file__).resolve().parent
BASE = Path('/synthetic-not-live/coordinator-delivery')
PYTHON = '/synthetic-not-live/python3.12'
PY_SHA = 'fa67443527ed9647f760d807e2a38f26340757123e643c4639cf273ed15d5ea7'
ENV = {'PATH': '/usr/local/bin:/usr/bin:/bin', 'HOME': '/nonexistent',
       'LANG': 'C.UTF-8', 'LC_ALL': 'C.UTF-8', 'TZ': 'UTC',
       'TMPDIR': '/tmp', 'GIT_CONFIG_NOSYSTEM': '1',
       'GIT_CONFIG_GLOBAL': '/dev/null', 'GIT_TERMINAL_PROMPT': '0',
       'GIT_OPTIONAL_LOCKS': '0'}
TREE_TIMEOUT = 5.0
POLL_INTERVAL = 0.025


def sha(data):
    return hashlib.sha256(data).hexdigest()


def fsyncdir(path):
    fd = os.open(path, os.O_RDONLY)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)


def durable(path, data):
    with path.open('xb') as stream:
        stream.write(data)
        stream.flush()
        os.fsync(stream.fileno())
    fsyncdir(path.parent)


def emit(p,x):durable(p,(json.dumps(x,sort_keys=True)+'\n').encode())


def enable_subreaper():
    # Linux PR_SET_CHILD_SUBREAPER: orphaned grandchildren are adopted here.
    libc = ctypes.CDLL(None, use_errno=True)
    if libc.prctl(36, 1, 0, 0, 0) != 0:
        error = ctypes.get_errno()
        raise OSError(error, os.strerror(error))


def proc_row(pid):
    raw = (Path('/proc') / str(pid) / 'stat').read_text()
    close = raw.rfind(')')
    if close < 0:
        raise ValueError('malformed proc stat')
    fields = raw[close + 2:].split()
    return (int(fields[1]), int(fields[2]), int(fields[3]), int(fields[19]), fields[0])


def proc_snapshot():
    """Return pid -> (ppid, pgrp, session, starttime, state); errors are UNKNOWN."""
    found = {}
    try:
        entries = list(Path('/proc').iterdir())
    except OSError as exc:
        raise RuntimeError('PROC_CENSUS_UNKNOWN') from exc
    for entry in entries:
        if not entry.name.isdecimal():
            continue
        try:
            found[int(entry.name)] = proc_row(int(entry.name))
        except FileNotFoundError:
            # A racing exit is not evidence of absence; force a fresh census.
            raise RuntimeError('PROC_ENTRY_RACE_UNKNOWN')
        except PermissionError as exc:
            raise RuntimeError('PROC_ENTRY_UNREADABLE_UNKNOWN') from exc
        except (OSError, ValueError, IndexError) as exc:
            raise RuntimeError('PROC_ENTRY_MALFORMED_UNKNOWN') from exc
    return found


def descendants(snapshot, root_pid, root_start):
    root = snapshot.get(root_pid)
    if root is None or root[3] != root_start:
        raise RuntimeError('ROOT_IDENTITY_UNKNOWN')
    parents = {pid: row[0] for pid, row in snapshot.items()}
    result = {}
    for pid, row in snapshot.items():
        cursor = pid
        seen = set()
        while cursor in parents and cursor not in seen:
            if cursor == root_pid:
                if pid != root_pid:
                    result[pid] = row[3]
                break
            seen.add(cursor)
            cursor = parents[cursor]
    return result


def signal_identity(pid, starttime, sig):
    snapshot = proc_snapshot()
    row = snapshot.get(pid)
    if row is None or row[3] != starttime:
        raise RuntimeError('PID_IDENTITY_UNKNOWN')
    os.kill(pid, sig)


def reap_adopted():
    while True:
        try:
            pid, _ = os.waitpid(-1, os.WNOHANG)
            if pid == 0:
                return
        except ChildProcessError:
            return


def terminate_tree(root_pid, root_start, proc, child_start, timeout=TREE_TIMEOUT):
    """Bounded TERM/KILL/reap loop. Return proof only after repeated empty census."""
    deadline = time.monotonic() + timeout
    term_sent = set()
    kill_sent = set()
    empty_samples = 0
    while time.monotonic() < deadline:
        try:
            snapshot = proc_snapshot()
        except RuntimeError as exc:
            if 'PROC_ENTRY_RACE_UNKNOWN' in str(exc):
                time.sleep(POLL_INTERVAL)
                continue
            raise
        current = descendants(snapshot, root_pid, root_start)
        if proc.poll() is None:
            # The direct child is tracked separately from this supervisor root.
            if child_start is None:
                raise RuntimeError('CHILD_IDENTITY_UNKNOWN')
            current[proc.pid] = child_start
        if not current:
            empty_samples += 1
            reap_adopted()
            if empty_samples >= 3:
                return {'state': 'DESCENDANTS_EXIT_PROVEN', 'samples': empty_samples}
        else:
            empty_samples = 0
            for pid, start in current.items():
                if pid not in term_sent:
                    signal_identity(pid, start, signal.SIGTERM)
                    term_sent.add(pid)
            if time.monotonic() >= deadline - timeout / 2:
                for pid, start in current.items():
                    if pid not in kill_sent:
                        signal_identity(pid, start, signal.SIGKILL)
                        kill_sent.add(pid)
        if proc.poll() is not None:
            reap_adopted()
        time.sleep(POLL_INTERVAL)
    raise RuntimeError('DESCENDANT_TERMINATION_UNKNOWN')


def main():
    assert sys.executable == PYTHON
    assert sha(Path(PYTHON).read_bytes()) == PY_SHA
    assert sys.flags.isolated and sys.flags.no_site and sys.dont_write_bytecode
    assert dict(os.environ) == ENV
    pins = json.loads((P / 'pins.json').read_text())
    assert sha((P / 'courier.py').read_bytes()) == pins['courier_sha256']
    assert len(sys.argv) == 6
    case, seq, grantsha, offset, release_sha = sys.argv[1:]
    assert case in ['S3-C5', 'S3-C6', 'S3-C7']
    assert seq.isdigit() and seq == f'{int(seq):04d}' and 1 <= int(seq) <= 9999
    assert offset and offset.isascii() and offset.isdecimal() and str(int(offset)) == offset
    parent = BASE / case / ('courier-' + seq)
    for path in [BASE, BASE / case, parent]:
        assert path.is_dir() and not path.is_symlink()
    grant = parent / 'grant.json'
    raw = grant.read_bytes()
    assert sha(raw) == grantsha
    g = json.loads(raw)
    assert g['case'] == case and g['sequence'] == int(seq)
    release = parent / ('supervisor-release-' + offset + '.json')
    rb = release.read_bytes()
    assert sha(rb) == release_sha
    r = json.loads(rb)
    assert r['execute_once'] is True and r['case'] == case
    assert r['sequence'] == int(seq) and r['offset'] == int(offset)
    assert r['grant_sha256'] == grantsha
    assert r['supervisor_sha256'] == sha(Path(__file__).read_bytes())
    assert r['pins_sha256'] == sha((P / 'pins.json').read_bytes())
    run = parent / ('supervised-' + offset)
    run.mkdir()
    fsyncdir(parent)
    emit(run / 'attempt.json', {'case': case, 'sequence': int(seq),
         'offset': int(offset), 'grant_sha256': grantsha, 'retry': False})

    proc = None
    root_start = None
    child_start = None
    try:
        enable_subreaper()
        def interrupted(signum, frame):
            raise InterruptedError('supervisor interrupted')
        for sig in (signal.SIGINT, signal.SIGTERM, signal.SIGHUP):
            signal.signal(sig, interrupted)
        own = proc_row(os.getpid())
        if own is None:
            raise RuntimeError('SUPERVISOR_IDENTITY_UNKNOWN')
        root_start = own[3]
        with (run / 'stdout.raw').open('xb') as out, (run / 'stderr.raw').open('xb') as err:
            proc = subprocess.Popen([PYTHON, '-I', '-S', '-B', str(P / 'courier.py'),
                 str(grant), grantsha, offset], env=ENV, cwd=P,
                 stdout=out, stderr=err, start_new_session=True)
            try:
                row = proc_row(proc.pid)
            except (OSError, ValueError, IndexError) as exc:
                raise RuntimeError('CHILD_IDENTITY_UNKNOWN') from exc
            child_start = row[3]
            emit(run / 'child-start.json', {'pid': proc.pid, 'starttime': child_start,
                 'session': row[2], 'scope': 'subreaper ancestry census'})
            try:
                code = proc.wait(timeout=120)
            except subprocess.TimeoutExpired:
                code = None
            proof = terminate_tree(os.getpid(), root_start, proc, child_start)
            if code is None:
                code = proc.wait(timeout=1)
                raise RuntimeError('CHILD_TIMEOUT')
            out.flush()
            os.fsync(out.fileno())
            err.flush()
            os.fsync(err.fileno())
        assert code == 0
        payload = (run / 'stdout.raw').read_bytes()
        meta = json.loads((run / 'stderr.raw').read_bytes())
        assert meta['start'] == int(offset)
        assert meta['end_exclusive'] - meta['start'] == len(payload)
        assert len(payload) <= 8192
        assert meta['chunk_sha256'] == sha(payload)
        assert meta['response_sha256'] == g['response_sha256']
        assert meta['total_bytes'] == g['response_bytes']
        assert meta['immutable_checks'] == 3
        payload.decode('utf-8', errors='strict')
        emit(run / 'terminal.json', {'state': 'CHILD_EXIT0_TREE_PROVEN',
             'direct_child_returncode': code, 'descendant_proof': proof,
             'chunk': meta, 'stdout_sha256': sha(payload),
             'stderr_sha256': sha((run / 'stderr.raw').read_bytes()),
             'outer_tool_status': 'NOT_ASSERTED', 'ack_generated': False})
        # Durable terminal proof precedes the first externally visible byte.
        sys.stdout.buffer.write(payload);sys.stdout.buffer.flush()
        sys.stdout.buffer.flush()
        sys.stderr.write(json.dumps({'terminal_receipt': str(run / 'terminal.json'),
             'terminal_sha256': sha((run / 'terminal.json').read_bytes()),
             'chunk': meta, 'outer_tool_status': 'NOT_ASSERTED'}) + '\n')
    except BaseException as exc:
        # If the supervisor itself is killed, this handler cannot run. Its
        # caller must classify the missing terminal proof as UNKNOWN.
        if proc is not None and root_start is not None:
            try:
                terminate_tree(os.getpid(), root_start, proc, child_start)
            except BaseException:
                pass
        try:
            emit(run / 'STOP.json', {'state': 'UNKNOWN', 'error_type': type(exc).__name__,
                 'direct_child_returncode': None if proc is None else proc.poll(),
                 'retry': False, 'stdout_released': False})
        except BaseException:
            pass
        raise


if __name__ == '__main__':
    main()
