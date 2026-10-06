"""Owned workspace commands and terminals. No host paths or Docker credentials."""

import json
import itertools
import os
from pathlib import Path
import re
import runpy
import signal
import subprocess
import sys
import time

ROOT = Path("/home/dock/.orchestra-runtime/commands")


def finish(key, code, cancelled=False, timed_out=False):
    (ROOT / (key + ".result")).write_text(json.dumps({"exitCode": code, "cancelled": cancelled, "timedOut": timed_out}))


def identity(pid):
    return Path(f"/proc/{pid}/stat").read_text().rsplit(")", 1)[1].split()[19]


def environment(config):
    env = dict(os.environ)
    env.pop("APP_DOCK_RUNTIME_PASSWORD", None)
    env.update(runpy.run_path("/opt/orchestra/workspace.py")["session_environment"]())
    env.update(config.get("env", {}))
    env.pop("APP_DOCK_RUNTIME_PASSWORD", None)
    env["HOME"] = "/home/dock"
    return env


def main():
    op, key = sys.argv[1:3]
    if not re.fullmatch(r"[a-f0-9-]{36}", key):
        raise ValueError("invalid-id")
    ROOT.mkdir(mode=0o700, parents=True, exist_ok=True)
    os.umask(0o077)
    config_path = ROOT / (key + ".json")
    running_path = ROOT / (key + ".running")
    cancel_path = ROOT / (key + ".cancel")
    if op == "prepare":
        if len(list(itertools.islice(ROOT.iterdir(), 257))) > 256:
            raise RuntimeError("workspace-command-capacity")
        text = sys.stdin.buffer.read(1048577)
        if len(text) > 1048576:
            raise ValueError("input-limit")
        config = json.loads(text)
        argv = config["argv"]
        if not isinstance(argv, list) or not argv or len(argv) > 256 or not all(isinstance(a, str) and "\0" not in a for a in argv):
            raise ValueError("invalid-argv")
        if not isinstance(config["cwd"], str) or not config["cwd"].startswith("/"):
            raise ValueError("invalid-cwd")
        with config_path.open("x") as file:
            json.dump(config, file)
        return
    if op == "cancel":
        cancel_path.touch(mode=0o600, exist_ok=True)
        deadline = time.monotonic() + 2
        while time.monotonic() < deadline:
            if running_path.exists():
                running = json.loads(running_path.read_text())
                pid = running["pid"]
                try:
                    if identity(pid) == running["start"] and os.getpgid(pid) == running["group"] == pid:
                        os.killpg(pid, signal.SIGHUP)
                except (ProcessLookupError, FileNotFoundError):
                    pass
                return
            if not config_path.exists():
                return
            time.sleep(0.02)
        return
    if op == "clean":
        if running_path.exists():
            running = json.loads(running_path.read_text())
            try:
                if identity(running["pid"]) == running["start"]:
                    raise RuntimeError("execution-active")
            except FileNotFoundError:
                pass
        result_path = ROOT / (key + ".result")
        result = json.loads(result_path.read_text()) if result_path.exists() else None
        for path in (config_path, running_path, cancel_path, result_path):
            path.unlink(missing_ok=True)
        print(json.dumps(result))
        return
    if op not in ("run", "terminal"):
        raise ValueError("invalid-operation")
    config = json.loads(config_path.read_text())
    env = environment(config)
    os.chdir(config["cwd"])
    if os.getpgrp() != os.getpid():
        os.setsid()
    cancelled = {"value": False}

    def interrupted(_signal, _frame):
        cancelled["value"] = True

    for sig in (signal.SIGHUP, signal.SIGTERM, signal.SIGINT):
        signal.signal(sig, interrupted)
    with running_path.open("x") as file:
        json.dump({"pid": os.getpid(), "start": identity(os.getpid()), "group": os.getpgrp()}, file)
    if cancel_path.exists() or cancelled["value"]:
        finish(key, 143, cancelled=True)
        sys.exit(143)
    if op == "terminal":
        # Docker owns the actual guest PTY; exec preserves its controlling terminal.
        for sig in (signal.SIGHUP, signal.SIGTERM, signal.SIGINT):
            signal.signal(sig, signal.SIG_DFL)
        sys.stdout.write("\x1b]777;orchestra-ready=" + key + "\x07")
        sys.stdout.flush()
        os.execvpe(config["argv"][0], config["argv"], env)
    child = subprocess.Popen(config["argv"], env=env, stdin=sys.stdin.buffer)
    config_path.unlink(missing_ok=True)
    deadline = time.monotonic() + config["timeoutMs"] / 1000 if config["timeoutMs"] else float("inf")
    while child.poll() is None:
        if cancelled["value"] or cancel_path.exists() or time.monotonic() >= deadline:
            was_cancelled = cancelled["value"] or cancel_path.exists()
            was_timed_out = time.monotonic() >= deadline
            # The supervisor remains the group leader until teardown, preventing
            # PID/group reuse from redirecting a late cancellation to another app.
            os.killpg(os.getpid(), signal.SIGTERM)
            try:
                child.wait(timeout=1)
            except subprocess.TimeoutExpired:
                finish(key, None, cancelled=was_cancelled, timed_out=was_timed_out)
                os.killpg(os.getpid(), signal.SIGKILL)
            finish(key, 143, cancelled=was_cancelled, timed_out=was_timed_out)
            sys.exit(143)
        time.sleep(0.02)
    code = child.returncode if child.returncode >= 0 else 128 - child.returncode
    finish(key, code)
    sys.exit(code)


if __name__ == "__main__":
    try:
        main()
    except OSError as error:
        if len(sys.argv) == 3 and sys.argv[1] == "run" and re.fullmatch(r"[a-f0-9-]{36}", sys.argv[2]):
            finish(sys.argv[2], 127 if error.errno == 2 else 1)
        print(error.strerror or "failed", file=sys.stderr)
        sys.exit(127 if error.errno == 2 else 1)
    except (ValueError, RuntimeError, KeyError, TypeError):
        if len(sys.argv) == 3 and sys.argv[1] == "run" and re.fullmatch(r"[a-f0-9-]{36}", sys.argv[2]):
            finish(sys.argv[2], 1)
        print("workspace-access-failed", file=sys.stderr)
        sys.exit(1)
