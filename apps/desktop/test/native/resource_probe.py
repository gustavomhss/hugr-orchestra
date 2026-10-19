#!/usr/bin/env python3
"""W0 helper-only characterization, not an SLA, leak proof, or toolkit proof.

Host: python3 -B resource_probe.py --bus-dir LEAD_PAYLOAD --proof-dir LEAD_TESTS
      --receipt /outside/source/receipt.json
Only new, labelled containers are controlled. Existing testbed inspection reads
process identities, limits, and its launch manifest; it never calls GUI APIs.
The envelope includes this probe, Service fixture, Gio, and private D-Bus daemons.
It excludes Docker/VM overhead and external provider/app/daemon allocations.
"""

import argparse
from concurrent.futures import Future
import hashlib
import importlib
import json
import os
from pathlib import Path
import platform
import selectors
import signal
import subprocess
import sys
import tempfile
from threading import Thread, enumerate
from time import monotonic, sleep
import traceback
import uuid

IMAGE = "orchestra-a11y-test:20260930"
OWNER = "dock-accessibility"
BASE = "5e4bea3b519c04cebfb787e98dfa171f5771d25c"
MAIN = "orchestra-a11y-session-20260930"


def require(ok, name, detail=""):
    if not ok:
        raise AssertionError(name + (": " + str(detail) if detail else ""))


def process(pid):
    root = Path(f"/proc/{pid}")
    status = dict(line.split(":", 1) for line in (root / "status").read_text().splitlines())
    memory = dict(line.split(":", 1) for line in (root / "smaps_rollup").read_text().splitlines()[1:])
    stat = (root / "stat").read_text().rsplit(")", 1)[1].split()
    return {"pid": pid, "start_ticks": int(stat[19]), "cpu_ticks": int(stat[11]) + int(stat[12]),
            "rss_kib": int(status["VmRSS"].split()[0]), "pss_kib": int(memory["Pss"].split()[0]),
            "fds": len(list((root / "fd").iterdir())), "threads": int(status["Threads"]),
            "tasks": {p.name: (p / "comm").read_text().strip() for p in (root / "task").iterdir()},
            "namespaces": {n: os.readlink(root / "ns" / n) for n in ("pid", "mnt", "cgroup", "net")},
            "cgroup": (root / "cgroup").read_text().strip(), "nspid": status["NSpid"].split()}


def envelope(memory=128, cpu=0.5):
    root = Path("/sys/fs/cgroup")
    require((root / "cgroup.controllers").is_file(), "cgroup-v2-required")
    result = {n: (root / n).read_text().strip() for n in (
        "memory.max", "memory.swap.max", "cpu.max", "memory.current", "memory.events", "cpu.stat", "cgroup.procs")}
    require(result["memory.max"] == str(memory * 1024**2), "memory-envelope", result)
    require(result["memory.swap.max"] == "0", "swap-envelope", result)
    quota, period = result["cpu.max"].split()
    require(quota != "max" and int(quota) == int(int(period) * cpu), "cpu-envelope", result)
    require(os.getpid() in [int(p) for p in result["cgroup.procs"].split()], "sampler-inside-envelope")
    return result


def checkpoint(label, bus=None, settle=0.15):
    sleep(settle)  # Fixed settling window, not a convergence/leak oracle.
    result = {"label": label, "monotonic_s": monotonic(), "process": process(os.getpid()),
              "cgroup": envelope(), "python_threads": [{"name": t.name, "native_id": t.native_id} for t in enumerate()]}
    if bus:
        with bus._lock:
            result["wire"] = {"pending": len(bus._pending), "active": len(bus._active),
                              "connections": len(bus._connections), "subscriptions": len(bus._subscriptions),
                              "trace_entries": len(bus._trace), "trace_total": bus.trace_total,
                              "thread_alive": bus._thread.is_alive(), "loop_running": bus._loop.is_running()}
        result["trace_tail"] = bus.trace[-4:]
    return result


def sampler_control():
    code = ('import sys\nfrom time import sleep\nprint("ready", flush=True)\nsys.stdin.readline()\n'
            'fds = [open("/dev/null", "rb") for _ in range(24)]\nheld = b"x" * (8 * 1024**2)\n'
            'print("retained", flush=True)\nsys.stdin.readline()\n')
    child = subprocess.Popen([sys.executable, "-B", "-c", code], stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True)
    def ready(expected):
        with selectors.DefaultSelector() as selector:
            selector.register(child.stdout, selectors.EVENT_READ)
            require(selector.select(3), "sampler-control-ready")
        require(child.stdout.readline().strip() == expected, "sampler-control-message")
    try:
        ready("ready")
        before = process(child.pid)
        child.stdin.write("grow\n")
        child.stdin.flush()
        ready("retained")
        after = process(child.pid)
        require(after["fds"] - before["fds"] == 24, "fd-positive-control", (before, after))
        require(after["rss_kib"] - before["rss_kib"] >= 6144, "allocation-positive-control", (before, after))
        child.stdin.write("release\n")
        child.stdin.flush()
        require(child.wait(3) == 0, "sampler-control-exit")
        return {"before": before, "retained": after, "allocation_bytes": 8 * 1024**2, "opened_fds": 24}
    finally:
        if child.poll() is None:
            child.kill()
            child.wait(3)
        child.stdin.close()
        child.stdout.close()


def exercise(bus, fixture, fixture_module, iterations):
    owner = fixture.exporter.get_unique_name()
    for index in range(iterations):
        require(bus.property(owner, "/org/a11y/atspi/accessible/root", "org.a11y.atspi.Accessible", "Name") == fixture_module.VALUE,
                "real-property-value")
        require(bus.children(owner, fixture_module.ROOT, 3) == [(owner, fixture_module.ROOT + "/0"), (owner, fixture_module.ROOT + "/2")],
                "real-indexed-value")
        if index % 24 == 23:
            sleep(0.02)


def close_checkpoint(bus, samples, label):
    connections = [c for c, _ in bus._connections]
    bus.close()
    sample = checkpoint(label, bus)
    samples.append(sample)
    require(not sample["wire"]["thread_alive"] and not sample["wire"]["loop_running"], "close-glib-clean", sample)
    require(all(sample["wire"][k] == 0 for k in ("pending", "active", "connections", "subscriptions")), "close-owned-state-clean", sample)
    require(connections and all(c.is_closed() for c in connections), "close-real-connections")


def guest(args):
    sys.path[:0] = [str(args.bus_dir), str(args.proof_dir)]
    wire = importlib.import_module("bus")
    fixture_module = importlib.import_module("test_bus")
    service, bus = fixture_module.Service(), None
    result = {"status": "passed", "scope": "helper + Gio + conformance fixture + private daemons; no toolkit/SLA/leak proof",
              "guest": {"architecture": platform.machine(), "kernel": platform.release(), "cpu_ticks_per_s": os.sysconf("SC_CLK_TCK")},
              "versions": {k: v for k, v in json.loads(Path("/opt/orchestra-a11y/versions.json").read_text()).items()
                           if k in ("baseImage", "guestArchitecture", "python", "pygobject", "glib")},
              "hashes": {"bus": hashlib.sha256((args.bus_dir / "bus.py").read_bytes()).hexdigest(),
                         "fixture": hashlib.sha256((args.proof_dir / "test_bus.py").read_bytes()).hexdigest()},
              "workload": {"warmup_iterations": 12, "batches": [240, 240, 240], "calls_per_iteration": 6,
                           "reopen_iterations": [24, 24, 24], "settle_s": 0.15, "pacing_s_per_24": 0.02}, "samples": []}
    envelope()
    try:
        if not args.cap_only:
            result["sampler_control"] = sampler_control()
        service.start()
        result["fixture_daemon"] = process(service.daemon.pid)
        result["samples"].append(checkpoint("fixture-idle"))
        bus = wire.AtspiBus(os.environ["DBUS_SESSION_BUS_ADDRESS"], timeout_ms=1200)
        require(bus.process_id(service.exporter.get_unique_name()) == os.getpid(), "real-fixture-pid")
        exercise(bus, service, fixture_module, 12)
        result["samples"].append(checkpoint("warm", bus))
        for index in range(3):
            exercise(bus, service, fixture_module, 240)
            result["samples"].append(checkpoint(f"indexed-property-{(index + 1) * 240}", bus))
            require(all(result["samples"][-1]["wire"][k] == 0 for k in ("pending", "active")), "settled-wire-clean")
            require(len(bus.trace) == min(bus.trace_total, 4096), "trace-retention-cap", (len(bus.trace), bus.trace_total))
            require(bus.trace_total == 74 + (index + 1) * 1440, "explicit-call-count", bus.trace_total)
        require(bus.trace_total > 4096 and len(bus.trace) == 4096, "trace-filled-nonempty")
        if args.cap_only:
            close_checkpoint(bus, result["samples"], "cap-close")
            return result
        def delay(future, timeout):
            started = monotonic()
            try:
                value = bus.call(service.exporter.get_unique_name(), fixture_module.ROOT, fixture_module.NAME,
                                 "Delay", "(u)", (600,), "(s)", timeout)
                future.set_result({"code": "unexpected-success", "value": value, "elapsed_s": monotonic() - started})
            except Exception as error:
                future.set_result({"code": getattr(error, "code", type(error).__name__), "elapsed_s": monotonic() - started})
        future = Future()
        caller = Thread(target=delay, args=(future, 200), daemon=True)
        caller.start()
        require(service.received.wait(1), "deadline-real-dispatch")
        # No settling here: observe a known live operation before its deadline.
        result["live_operation"] = checkpoint("deadline-pending", bus, 0)
        require(all(result["live_operation"]["wire"][k] > 0 for k in ("pending", "active")), "pending-active-positive-control")
        caller.join(2)
        require(not caller.is_alive(), "deadline-caller-finished")
        result["deadline_control"] = future.result(1)
        require(result["deadline_control"]["code"] == "timeout" and result["deadline_control"]["elapsed_s"] < 1,
                "deadline-late-reply", result["deadline_control"])
        require(service.replied.wait(2), "real-late-reply")
        require(bus.property(service.exporter.get_unique_name(), fixture_module.ROOT, fixture_module.ACCESSIBLE, "Name") == fixture_module.VALUE,
                "valid-after-late-reply")
        result["samples"].append(checkpoint("after-late-reply", bus))
        result["deadline_control"].update({"late_reply": service.replied.is_set(),
            "service_dispatches": sum(c[1] == "Delay" for c in service.calls), "wire_dispatches": sum(c["method"] == "Delay" for c in bus.trace)})
        require(result["deadline_control"]["service_dispatches"] == result["deadline_control"]["wire_dispatches"] == 1, "deadline-no-retry")
        require(result["samples"][-1]["wire"]["pending"] == result["samples"][-1]["wire"]["active"] == 0, "late-reply-clean")
        service.received.clear()
        future = Future()
        caller = Thread(target=delay, args=(future, 1200), daemon=True)
        caller.start()
        require(service.received.wait(1), "close-real-pending-dispatch")
        close_checkpoint(bus, result["samples"], "close-pending")
        caller.join(2)
        require(not caller.is_alive() and future.result(1)["code"] == "cancelled", "close-pending-cancelled")
        for index in range(3):
            bus = wire.AtspiBus(os.environ["DBUS_SESSION_BUS_ADDRESS"], timeout_ms=1200)
            exercise(bus, service, fixture_module, 24)
            result["samples"].append(checkpoint(f"reopen-{index + 1}", bus))
            require(result["samples"][-1]["wire"]["connections"] == 2, "reopen-real-connections")
            close_checkpoint(bus, result["samples"], f"reclose-{index + 1}")
    finally:
        if bus:
            bus.close()
        service.close()
    result["samples"].append(checkpoint("fixture-closed"))
    require(result["samples"] and not service.thread.is_alive(), "fixture-clean-nonempty")
    return result


def mutations(args):
    source = (args.bus_dir / "bus.py").read_text()
    anchor = "deque(maxlen=4096)"
    require(source.count(anchor) == 1, "mutation-anchor")
    results = []
    with tempfile.TemporaryDirectory(prefix="orchestra-resource-cap-") as directory:
        for name, payload in (("trace-cap-4097", source.replace(anchor, "deque(maxlen=4097)")), ("restored-no-op", source + "\n# No-op calibration.\n")):
            (Path(directory) / "bus.py").write_text(payload)
            command = ["dbus-run-session", "--", sys.executable, "-B", str(Path(__file__).resolve()),
                       "--inside-session", "--cap-only", "--bus-dir", directory, "--proof-dir", str(args.proof_dir)]
            run = subprocess.run(command, capture_output=True, text=True, timeout=25)
            require((run.returncode == 1 and "AssertionError: trace-retention-cap" in run.stderr) if name == "trace-cap-4097"
                    else run.returncode == 0 and json.loads(run.stdout)["status"] == "passed", "mutation-named-verdict", run.stderr)
            results.append({"name": name, "command": command, "exit": run.returncode, "stdout": json.loads(run.stdout), "stderr": run.stderr})
    require((args.bus_dir / "bus.py").read_text() == source, "original-source-unchanged")
    return results


def main_scope(command):
    code = '''import json, os
from pathlib import Path
apps = json.loads(Path('/session/apps.json').read_text())['apps']
def identity(pid):
    p = Path('/proc') / str(pid)
    return {'pid': pid, 'start_ticks': int((p/'stat').read_text().rsplit(')', 1)[1].split()[19]),
            'namespaces': {n: os.readlink(p/'ns'/n) for n in ('pid', 'mnt', 'cgroup', 'net')},
            'cgroup': (p/'cgroup').read_text().strip()}
assert set(apps) == {'mousepad', 'featherpad', 'vscode'}, 'main-app-manifest-required'
current = {n: identity(a['pid']) for n, a in apps.items()}
assert all(current[n]['start_ticks'] == a['startTicks'] for n, a in apps.items()), 'main-app-identity'
print(json.dumps({'init': identity(1), 'apps': current, 'limits': {n: (Path('/sys/fs/cgroup')/n).read_text().strip()
    for n in ('memory.max', 'memory.swap.max', 'cpu.max')}}))'''
    scope = json.loads(command(["docker", "exec", MAIN, "/usr/bin/python3", "-B", "-c", code], 10).stdout)
    container = json.loads(command(["docker", "inspect", MAIN]).stdout)[0]
    require(container["State"]["Running"], "main-testbed-running")
    scope["container"] = {"id": container["Id"], "vm_init_pid": container["State"]["Pid"]}
    return scope


def host(args):
    require(args.receipt and args.receipt.parent.is_dir(), "receipt-parent-required")
    require(args.bus_dir.is_dir() and args.proof_dir.is_dir(), "readonly-inputs-required")
    started = monotonic()
    receipt = {"status": "failed", "baseline": BASE, "host": platform.platform(), "commands": [], "containers": [],
               "probe_sha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
               "bounds_s": {"helper": 70, "mutation_child": 25, "oom": 8, "host": 110, "cleanup_extra_max": 40},
               "clock": "guest/host monotonic durations; CPU ticks use recorded guest SC_CLK_TCK"}
    created = []
    def command(argv, timeout=15):
        started = monotonic()
        run = subprocess.run(argv, capture_output=True, text=True, timeout=timeout)
        receipt["commands"].append({"argv": argv, "exit": run.returncode, "elapsed_s": monotonic() - started,
                                    "stdout_bytes": len(run.stdout.encode()), "stderr": run.stderr})
        require(run.returncode == 0, "command-failed", {"argv": argv, "stdout": run.stdout, "stderr": run.stderr})
        return run
    try:
        receipt["head"] = command(["git", "rev-parse", "HEAD"]).stdout.strip()
        receipt["branch"] = command(["git", "branch", "--show-current"]).stdout.strip()
        require(receipt["head"] == BASE and receipt["branch"] in ("a11y-resource", "dock-accessibility"), "pinned-worktree")
        root = Path(command(["git", "rev-parse", "--show-toplevel"]).stdout.strip())
        require(root not in args.receipt.resolve().parents, "receipt-outside-source")
        receipt["docker"] = json.loads(command(["docker", "version", "--format", "{{json .}}"]).stdout)
        receipt["image"] = json.loads(command(["docker", "image", "inspect", IMAGE]).stdout)[0]["Id"]
        receipt["main_before"] = main_scope(command)
        for mode, memory, cpu in (("helper", 128, "0.5"), ("oom", 32, "0.25")):
            argv = ["docker", "create", "--pull", "never", "--name", args.name + "-" + mode, "--label", "orchestra.a11y.owner=" + OWNER,
                    "--memory", f"{memory}m", "--memory-swap", f"{memory}m", "--cpus", cpu, "--network", "none", "--pids-limit", "64",
                    "--cgroupns", "private", "--cap-drop", "ALL", "--security-opt", "no-new-privileges", "--read-only", "--tmpfs", "/tmp:rw,size=16m"]
            for source, target in ((args.bus_dir, "/bridge"), (args.proof_dir, "/proof"), (Path(__file__).resolve().parent, "/probe")):
                argv += ["--mount", f"type=bind,source={source.resolve()},target={target},readonly"]
            argv += ["--entrypoint", "/usr/bin/dbus-run-session" if mode == "helper" else "/usr/bin/python3", IMAGE]
            argv += (["--", "/usr/bin/python3", "-B", "/probe/resource_probe.py", "--inside-session"] if mode == "helper"
                     else ["-B", "/probe/resource_probe.py", "--oom-control"])
            cid = command(argv).stdout.strip()
            require(len(cid) == 64 and all(c in "0123456789abcdef" for c in cid), "created-container-id")
            created.append(cid)
            command(["docker", "start", cid])
            live = json.loads(command(["docker", "inspect", cid]).stdout)[0]
            item = {"id": cid, "name": live["Name"], "host_init_pid": live["State"]["Pid"], "image": live["Image"],
                    "limits": {k: live["HostConfig"][k] for k in ("Memory", "MemorySwap", "NanoCpus", "CgroupnsMode", "PidMode", "NetworkMode")},
                    "mounts": live["Mounts"], "labels": live["Config"]["Labels"]}
            receipt["containers"].append(item)
            require(item["image"] == receipt["image"] and item["labels"]["orchestra.a11y.owner"] == OWNER, "container-provenance")
            mounts = [m for m in item["mounts"] if m["Destination"] in ("/bridge", "/proof", "/probe")]
            require(len(mounts) == 3 and all(not m["RW"] for m in mounts), "readonly-source-mounts")
            exit_code = int(command(["docker", "wait", cid], 75 if mode == "helper" else 12).stdout)
            item["state"] = json.loads(command(["docker", "inspect", "--format", "{{json .State}}", cid]).stdout)
            logs = command(["docker", "logs", cid]).stdout
            require(exit_code == item["state"]["ExitCode"] and not item["state"]["Running"] and item["state"]["Pid"] == 0, "runtime-reaped")
            if mode == "helper":
                item["proof"] = json.loads(logs)
                require(exit_code == 0 and not item["state"]["OOMKilled"] and item["proof"]["status"] == "passed", "helper-proof-required", item)
                scope = item["proof"]["samples"][0]["process"]["namespaces"]
                require(all(p["namespaces"]["pid"] != scope["pid"] and p["namespaces"]["cgroup"] != scope["cgroup"]
                            for p in [receipt["main_before"]["init"], *receipt["main_before"]["apps"].values()]), "main-outside-envelope")
                require(receipt["main_before"]["limits"]["memory.max"] != item["proof"]["samples"][0]["cgroup"]["memory.max"], "main-separate-limit")
                continue
            item["control"] = json.loads(logs)
            item["exit_mapping"] = {"code": "helper-resource-exit" if item["state"]["OOMKilled"] else "helper-exited",
                                    "outcome": "unknown", "exit": exit_code, "source": "real Docker State.OOMKilled/ExitCode; runtime integration not claimed"}
            require(item["state"]["OOMKilled"] and exit_code == 137, "disposable-memory-limit-oom", item)
        receipt["main_after"] = main_scope(command)
        require(receipt["main_before"] == receipt["main_after"], "main-identities-preserved")
        require(len(receipt["containers"]) == 2 and receipt["containers"][0]["proof"]["mutation_controls"], "nonempty-required-controls")
        receipt["status"] = "passed"
    except Exception as error:
        receipt["error"] = str(error)
    finally:
        for cid in reversed(created):
            try:
                run = subprocess.run(["docker", "rm", "-f", cid], capture_output=True, text=True, timeout=15)
                receipt.setdefault("cleanup", []).append({"id": cid, "exit": run.returncode, "stdout": run.stdout, "stderr": run.stderr})
                require(run.returncode == 0, "owned-container-cleanup", run.stderr)
                absent = subprocess.run(["docker", "inspect", cid], capture_output=True, text=True, timeout=5)
                receipt["cleanup"][-1].update({"inspect_exit": absent.returncode, "inspect_stderr": absent.stderr})
                require(absent.returncode == 1 and "No such object: " + cid in absent.stderr, "owned-container-removed")
            except Exception as error:
                receipt["status"], receipt["error"] = "failed", "owned-container-cleanup"
                receipt.setdefault("cleanup_errors", []).append({"id": cid, "error": str(error)})
        receipt["elapsed_s"] = monotonic() - started
        raw = json.dumps(receipt, indent=2) + "\n"
        require(len(raw.encode()) <= 131072, "raw-receipt-size", len(raw.encode()))
        args.receipt.write_text(raw)
    summary = {"status": receipt["status"], "receipt": str(args.receipt), "containers": len(created), "error": receipt.get("error")}
    if receipt["status"] == "passed":
        proof = receipt["containers"][0]["proof"]
        summary.update({"settled_samples": len(proof["samples"]), "trace_total": max(s.get("wire", {}).get("trace_total", 0) for s in proof["samples"]),
                        "oom_exit": receipt["containers"][1]["state"]["ExitCode"], "mutation": proof["mutation_controls"][0]["stdout"]["error"]})
    print(json.dumps(summary))
    return 0 if receipt["status"] == "passed" else 1


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--bus-dir", type=Path, default=Path("/bridge"))
    parser.add_argument("--proof-dir", type=Path, default=Path("/proof"))
    parser.add_argument("--receipt", type=Path)
    parser.add_argument("--name", default="orchestra-a11y-resource-20261001-" + uuid.uuid4().hex[:8])
    parser.add_argument("--inside-session", action="store_true")
    parser.add_argument("--cap-only", action="store_true")
    parser.add_argument("--oom-control", action="store_true")
    args = parser.parse_args()
    def expired(*_):
        raise TimeoutError("whole-experiment-deadline")
    signal.signal(signal.SIGALRM, expired)
    signal.alarm(70 if args.inside_session else 110)
    try:
        if args.oom_control:
            signal.alarm(8)
            print(json.dumps({"scope": process(os.getpid()), "envelope": envelope(32, 0.25), "max_allocation_bytes": 48 * 1024**2}), flush=True)
            sleep(1)
            held = []
            for _ in range(24):
                held.append(b"x" * (2 * 1024**2))
                sleep(0.03)
            raise AssertionError("oom-control-survived-limit")
        if args.inside_session:
            result = guest(args)
            if not args.cap_only:
                result["mutation_controls"] = mutations(args)
            print(json.dumps(result))
            return 0
        return host(args)
    except Exception as error:
        print(json.dumps({"status": "failed", "error": str(error)}))
        traceback.print_exc()
        return 1


if __name__ == "__main__":
    sys.exit(main())
