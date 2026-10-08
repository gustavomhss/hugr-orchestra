"""Real Darwin CLI proof, not a local unit suite.

python3 -B script/tcp-proxy-native-proof.py --runtime /path/to/installed/checkout \
  --pinned /path/to/unchanged/gocqlx-schemagen --lan <working-host-IPv4> \
  --artifacts /path/to/existing/private/temp/parent

Owns ephemeral listeners and a private scratch directory only. DYLD injection
exists only in the confined child's shell. Never changes host environment,
network configuration, generator files or dependency installations.
"""
import argparse
import hashlib
import json
import os
import pathlib
import select
import shlex
import shutil
import socket
import subprocess
import sys
import tempfile
import threading
import time


SCRIPT = pathlib.Path(__file__).resolve().parent
PINNED_HASH = "c8e6a7220e347a2f5cbe884a45fe365929b5045c195ee769ec525884fc92a068"


def client(cfg):
    cases = [
        ("loop", socket.AF_INET, socket.SOCK_STREAM, "127.0.0.1", cfg["port"], "connect"),
        ("second", socket.AF_INET, socket.SOCK_STREAM, "127.0.0.1", cfg["second"], "connect"),
        ("lan", socket.AF_INET, socket.SOCK_STREAM, cfg["lan"], cfg["port"], "connect"),
        ("other", socket.AF_INET, socket.SOCK_STREAM, "127.0.0.1", cfg["other"], "connect"),
        ("ipv6", socket.AF_INET6, socket.SOCK_STREAM, "::1", cfg["port"], "connect"),
        ("mapped-loop", socket.AF_INET6, socket.SOCK_STREAM, "::ffff:127.0.0.1", cfg["port"], "connect"),
        ("mapped-lan", socket.AF_INET6, socket.SOCK_STREAM, "::ffff:" + cfg["lan"], cfg["port"], "connect"),
        ("udp-loop", socket.AF_INET, socket.SOCK_DGRAM, "127.0.0.1", cfg["port"], "sendto"),
        ("udp-lan", socket.AF_INET, socket.SOCK_DGRAM, cfg["lan"], cfg["port"], "sendto"),
        ("udp-connected", socket.AF_INET, socket.SOCK_DGRAM, "127.0.0.1", cfg["port"], "connect"),
        ("udp6", socket.AF_INET6, socket.SOCK_DGRAM, "::1", cfg["port"], "sendto"),
        ("bind-loop", socket.AF_INET, socket.SOCK_STREAM, "127.0.0.1", 0, "bind"),
        ("bind-lan", socket.AF_INET, socket.SOCK_STREAM, cfg["lan"], 0, "bind"),
        ("bind-any", socket.AF_INET, socket.SOCK_STREAM, "0.0.0.0", 0, "bind"),
        ("bind6", socket.AF_INET6, socket.SOCK_STREAM, "::1", 0, "bind"),
        ("bind-udp", socket.AF_INET, socket.SOCK_DGRAM, "127.0.0.1", 0, "bind"),
        ("unix-proxy", socket.AF_UNIX, socket.SOCK_STREAM, cfg["socket"], 0, "unix"),
        ("unix-alternate", socket.AF_UNIX, socket.SOCK_STREAM, cfg["alternate"], 0, "unix"),
    ]
    rows = []
    for name, family, kind, host, port, action in cases:
        stage = action
        try:
            with socket.socket(family, kind) as c:
                c.settimeout(1)
                if action == "bind":
                    c.bind((host, port))
                    response = "BOUND"
                else:
                    data = ("OWN:" + name).encode()
                    if action == "unix":
                        c.connect(host)
                        c.sendall(data)
                    elif action == "sendto":
                        c.sendto(data, (host, port))
                    else:
                        c.connect((host, port))
                        c.sendall(data)
                    stage = "recv"
                    response = c.recv(512).decode()
                rows.append({"name": name, "ok": True, "response": response})
        except OSError as error:
            rows.append({"name": name, "ok": False, "stage": stage, "errno": error.errno, "error": str(error)})
    print(json.dumps(rows))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--runtime", type=pathlib.Path, required=True)
    parser.add_argument("--pinned", type=pathlib.Path, required=True)
    parser.add_argument("--lan", required=True)
    parser.add_argument("--artifacts", type=pathlib.Path, required=True)
    parser.add_argument("--go-client", type=pathlib.Path, help="Reuse an owned Go client unchanged for source-only reruns")
    parser.add_argument("--discard-go-cache", type=pathlib.Path, action="append", default=[], help="Discard only an explicitly owned previous proof's Go build cache")
    args = parser.parse_args()
    if sys.platform != "darwin":
        raise RuntimeError("real Darwin required; no skip/green on another OS")
    args.runtime = args.runtime.resolve(strict=True)
    args.pinned = args.pinned.resolve(strict=True)
    for previous in args.discard_go_cache:
        previous = previous.resolve(strict=True)
        receipt = json.loads((previous / "evidence.json").read_text())
        assert previous.parent == args.artifacts.resolve(strict=True) and previous.name.startswith("tcp-n-")
        assert receipt["root"] == str(previous) and receipt["runtime"] == str(args.runtime) and receipt["pinned"] == str(args.pinned)
        assert receipt["cleanup"]["open_sockets"] == 0 and receipt["cleanup"]["threads_alive"] == 0
        if (previous / "go-build").exists():
            shutil.rmtree(previous / "go-build")
    root = pathlib.Path(tempfile.mkdtemp(prefix="tcp-n-", dir=args.artifacts.resolve(strict=True)))
    evidence = {"root": str(root), "runs": [], "started": time.time(), "runtime": str(args.runtime), "pinned": str(args.pinned)}
    events, resources, threads = [], [], []
    stop = threading.Event()
    event_lock = threading.Lock()
    thread_lock = threading.Lock()
    env = {"PATH": "/usr/local/bin:/usr/bin:/bin", "HOME": str(root), "TMPDIR": str(root / "tmp"),
           "XDG_DATA_HOME": str(root / "data"), "XDG_CONFIG_HOME": str(root / "config"),
           "XDG_STATE_HOME": str(root / "state"), "XDG_CACHE_HOME": str(root / "cache"),
           "ORCHESTRA_TEST_HOME": str(root), "BUN_RUNTIME_TRANSPILER_CACHE_PATH": str(root / "bun-cache")}
    bun = shutil.which("bun")
    if not bun:
        raise RuntimeError("Bun required")

    def save():
        (root / "evidence.json").write_text(json.dumps(evidence, indent=2))

    def event(name, kind, data=None, **extra):
        with event_lock:
            events.append({"listener": name, "event": kind, **({"hex": data.hex()} if data is not None else {}), **extra})

    def alive(pid):
        try:
            os.kill(pid, 0)
            return True
        except ProcessLookupError:
            return False

    def start(fn, *values):
        t = threading.Thread(target=fn, args=values)
        with thread_lock:
            threads.append(t)
        t.start()

    def listener(name, host, port=0, family=socket.AF_INET, kind=socket.SOCK_STREAM, target=None):
        s = socket.socket(family, kind)
        resources.append(s)
        if family == socket.AF_INET6:
            s.setsockopt(socket.IPPROTO_IPV6, socket.IPV6_V6ONLY, 1)
        s.bind(host if family == socket.AF_UNIX else (host, port))
        if kind == socket.SOCK_STREAM:
            s.listen(128)
        s.settimeout(.1)

        def serve_connection(c):
            upstream = None
            first = b""
            try:
                if target:
                    # Destination captured by host at listener creation. No
                    # destination bytes, routing env or child request is read.
                    upstream = socket.create_connection(target, timeout=2)
                    resources.append(upstream)
                    while not stop.is_set():
                        ready, _, _ = select.select([c, upstream], [], [], .2)
                        for src in ready:
                            data = src.recv(65536)
                            if not data:
                                if src is c:
                                    pids = first.strip().split(b":") if first.startswith(b"fork-eof:") else []
                                    event(name, "eof", first, alive=[alive(int(pid)) for pid in pids[1:]] if len(pids) == 3 else [])
                                return
                            if src is c and b"\n" not in first and len(first) < 128:
                                first = (first + data)[:128]
                            (upstream if src is c else c).sendall(data)
                else:
                    c.settimeout(2)
                    while not stop.is_set():
                        data = c.recv(65536)
                        if not data:
                            break
                        event(name, "bytes", data)
                        c.sendall(data)
            except OSError as error:
                if not stop.is_set() and error.errno not in (32, 54, 57):
                    event(name, "connection-error", str(error).encode())
            finally:
                c.close()
                if upstream:
                    upstream.close()

        def serve():
            while not stop.is_set():
                try:
                    if kind == socket.SOCK_DGRAM:
                        data, peer = s.recvfrom(65536)
                        event(name, "bytes", data)
                        s.sendto(data, peer)
                    else:
                        c, _ = s.accept()
                        resources.append(c)
                        event(name, "accept")
                        start(serve_connection, c)
                except socket.timeout:
                    continue
                except OSError:
                    break
        start(serve)
        return s.getsockname()[1] if family != socket.AF_UNIX else str(host)

    def run(label, argv, mode="native", routes=None, helper="adapter.dylib"):
        exports = {} if routes is False else {"ORCHESTRA_TCP_PROXY_ROUTES": route_map if routes is None else routes}
        if helper:
            exports["DYLD_INSERT_LIBRARIES"] = str(root / helper)
        shell = "export " + " ".join(k + "=" + shlex.quote(v) for k, v in exports.items()) + "; exec " + shlex.join(argv)
        command = ["/bin/sh", "-c", shell]
        if mode == "baseline":
            command = argv
        elif mode == "deny-all":
            command = ["/usr/bin/sandbox-exec", "-p", "(version 1)(allow default)(deny network*)"] + command
        elif mode in {"native", "production"}:
            inp = {"runtime": str(args.runtime), "shell": shell, "root": str(root),
                   "sockets": [cfg["socket"], cfg["socket2"]], "artifact": str(root / (label + "-policy.json"))}
            if mode == "production":
                inp.update(production=cfg["port"], source=str(SCRIPT.parent / "src/tcp-proxy-native.ts"), argv=argv)
            command = [bun, str(SCRIPT / "tcp-proxy-native-wrap.ts"), json.dumps(inp)]
        else:
            raise RuntimeError("unknown mode")
        with event_lock:
            before = len(events)
        p = subprocess.run(command, cwd=args.runtime / "packages/core", env=env, capture_output=True, text=True, timeout=30)
        time.sleep(.15)
        with event_lock:
            receipts = list(events[before:])
        row = {"label": label, "mode": mode, "code": p.returncode, "out": p.stdout, "err": p.stderr,
               "events": receipts, "routes": exports.get("ORCHESTRA_TCP_PROXY_ROUTES")}
        evidence["runs"].append(row)
        save()
        print(label + ": exit=" + str(p.returncode), flush=True)
        if mode in {"native", "production"}:
            policy = json.loads((root / (label + "-policy.json")).read_text())
            assert policy["report"]["fact"]["shellWrites"] == "enforced", policy
            assert policy["report"]["fact"]["shellSandbox"]["kind"] == "seatbelt", policy
            assert policy["command"] == "/usr/bin/sandbox-exec", policy
            if mode == "production":
                proxy = policy["proxy"]
                library = pathlib.Path(proxy["library"])
                assert (library.parent / "proxy.c").read_text() == source, "production compiled stale SOURCE"
                assert hashlib.sha256(library.read_bytes()).hexdigest() == (library.parent / "sha256").read_text(), "production cache integrity"
                assert all(not pathlib.Path(p).exists() for p in proxy["sockets"]), "production socket scope leak"
                evidence["production_acquisition"] = {"library": str(library), "source_sha256": evidence["source_sha256"], "sockets_cleaned": True}
                save()
        return row

    def baseline(row):
        assert row["code"] == 0, row
        rows = json.loads(row["out"])
        assert len(rows) == 18 and all(r["ok"] and r["response"] == ("BOUND" if r["name"].startswith("bind") else "OWN:" + r["name"]) for r in rows), row
        for name in ["loop", "second", "lan", "other", "ipv6", "udp-loop", "udp-lan", "udp6", "alternate", "broker"]:
            assert any(e["listener"] == name for e in row["events"]), (name, row)

    def confined(row, helper=True):
        assert row["code"] == 0, row
        rows = json.loads(row["out"])
        assert len(rows) == 18, row
        for r in rows:
            if r["name"] in ({"loop", "second", "unix-proxy"} if helper else {"unix-proxy"}):
                assert r["ok"] and r["response"] == "OWN:" + r["name"], r
            else:
                assert not r["ok"] and r["errno"] == 1 and r["stage"] != "recv", r
        assert all(e["listener"] in {"loop", "second", "broker", "broker2"} for e in row["events"]), row

    def positive(row, target="loop"):
        assert row["code"] == 0 and "ECHO owned-echo" in row["out"] and "REMOTE 127.0.0.1:" in row["out"] and "LOCAL 127.0.0.1:" in row["out"], row
        assert any(e["listener"] == target and e.get("hex") == b"owned-echo".hex() for e in row["events"]), row

    def denied(row):
        assert row["code"] == 2 and "connect: operation not permitted" in row["out"] and not row["events"], row

    try:
        for name in ["tmp", "data", "config", "cache", "state", "bun-cache"]:
            (root / name).mkdir()
        evidence["hash_before"] = hashlib.sha256(args.pinned.read_bytes()).hexdigest()
        assert evidence["hash_before"] == PINNED_HASH, "wrong pinned generator"
        module = SCRIPT.parent / "src/tcp-proxy-native.ts"
        exported = json.loads(subprocess.check_output([bun, "-e", "import { SOURCE, ROUTES } from " + json.dumps(str(module)) + "; console.log(JSON.stringify({SOURCE, ROUTES}))"], text=True))
        assert exported["ROUTES"] == "ORCHESTRA_TCP_PROXY_ROUTES"
        source = exported["SOURCE"]
        (root / "adapter.c").write_text(source)
        evidence["source_sha256"] = hashlib.sha256(source.encode()).hexdigest()
        flags = ["clang", "-std=c11", "-Wall", "-Wextra", "-Werror", "-Wpedantic"]
        subprocess.run(flags + ["-dynamiclib", "-pthread", "-o", str(root / "adapter.dylib"), str(root / "adapter.c")], check=True)
        subprocess.run(flags + ["-pthread", "-o", str(root / "fds"), str(SCRIPT / "tcp-proxy-native-fds.c")], check=True)
        if args.go_client:
            shutil.copyfile(args.go_client.resolve(strict=True), root / "go-client")
            (root / "go-client").chmod(0o700)
        else:
            subprocess.run(["go", "build", "-o", str(root / "go-client"), str(SCRIPT / "tcp-proxy-native-client.go")], env={**env, "GOCACHE": str(root / "go-build"), "GOPATH": str(root / "go-path")}, check=True)
        evidence["go_client_hash_before"] = hashlib.sha256((root / "go-client").read_bytes()).hexdigest()
        evidence["compile"] = {"flags": flags, "warnings_fatal": True}

        port = listener("loop", "127.0.0.1")
        listener("lan", args.lan, port)
        listener("ipv6", "::1", port, socket.AF_INET6)
        other = listener("other", "127.0.0.1")
        second = listener("second", "127.0.0.1")
        listener("udp-loop", "127.0.0.1", port, kind=socket.SOCK_DGRAM)
        listener("udp-lan", args.lan, port, kind=socket.SOCK_DGRAM)
        listener("udp6", "::1", port, socket.AF_INET6, socket.SOCK_DGRAM)
        sock = listener("broker", str(root / "p-é€😀.sock"), family=socket.AF_UNIX, target=("127.0.0.1", port))
        sock2 = listener("broker2", str(root / "p2.sock"), family=socket.AF_UNIX, target=("127.0.0.1", second))
        alternate = listener("alternate", str(root / "alt.sock"), family=socket.AF_UNIX)
        cfg = {"port": port, "second": second, "other": other, "lan": args.lan, "socket": sock, "socket2": sock2, "alternate": alternate}
        evidence["config"] = cfg
        primary = str(port) + ":" + sock.encode().hex()
        route_map = primary + ";" + str(second) + ":" + sock2.encode().hex()
        matrix = [sys.executable, "-B", str(SCRIPT / "tcp-proxy-native-proof.py"), "--client", json.dumps(cfg)]
        go = [str(root / "go-client"), "127.0.0.1:" + str(port)]
        baseline(run("baseline-before", matrix, "baseline"))
        confined(run("matrix-native", matrix))
        confined(run("matrix-no-helper", matrix, helper=None), False)
        positive(run("go-native", go))
        positive(run("go-second-route", [go[0], "127.0.0.1:" + str(second)]), "second")
        full_map = ";".join(str(p) + ":" + sock.encode().hex() for p in range(1, 32)) + ";65535:" + sock2.encode().hex()
        positive(run("go-32-routes-max-port", [go[0], "127.0.0.1:65535"], routes=full_map), "second")
        positive(run("go-min-port", [go[0], "127.0.0.1:1"], routes=full_map))
        positive(run("go-uppercase-hex", go, routes=str(port) + ":" + sock.encode().hex().upper()))
        denied(run("go-no-helper", go, helper=None))
        denied(run("go-no-routing-key", go, routes=False))
        denied(run("go-deny-all", go, "deny-all"))
        bad_maps = {
            "empty": "", "zero-port": "0:" + sock.encode().hex(), "high-port": "65536:" + sock.encode().hex(),
            "negative": "-1:" + sock.encode().hex(), "long-port": "000001:" + sock.encode().hex(),
            "space": " " + primary, "missing-colon": str(port), "odd-hex": str(port) + ":2",
            "nonhex": str(port) + ":zz", "empty-path": str(port) + ":", "relative": str(port) + ":6162",
            "nul": primary + "00", "invalid-utf8": str(port) + ":2fff", "overlong-utf8": str(port) + ":2fc080",
            "surrogate": str(port) + ":2feda080", "large-codepoint": str(port) + ":2ff4908080",
            "long-path": str(port) + ":" + ("/" + "x" * 104).encode().hex(),
            "trailing": primary + ";", "bad-suffix": primary + ";x:22", "duplicate": primary + ";" + primary,
            "33-routes": full_map + ";" + str(port) + ":" + sock.encode().hex(), "oversize": "1:" + "2f" * 4000,
        }
        for label, value in bad_maps.items():
            denied(run("malformed-" + label, go, routes=value))
        denied(run("foreign-unix-map", go, routes=str(port) + ":" + alternate.encode().hex()))
        positive(run("go-after-malformed", go))
        fds = run("fd-native", [str(root / "fds"), str(port), sock])
        assert fds["code"] == 0 and "REGISTRY bounded raw-close churn/reclamation OK" in fds["out"] and "FORK concurrent/inherited/fresh OK" in fds["out"], (fds["code"], fds["out"], fds["err"])
        assert all(e["listener"] in {"loop", "broker"} for e in fds["events"]), fds
        critical = [str(root / "fds"), str(port), sock]
        for mode in ["preconnect", "preconnect-fork", "unix-control", "concurrent", "raw-race", "fork-eof"]:
            row = run("critical-" + mode, critical + [mode])
            assert row["code"] == 0, (mode, row["code"], row["out"], row["err"])
            if mode == "fork-eof":
                assert any(e["listener"] == "broker" and e["event"] == "eof" and e.get("alive") == [True, True] for e in row["events"]), "no broker EOF while both processes alive"
                assert "FORK EOF both alive; retained-client control; local pins gone OK" in row["out"], row
        shared_route = run("critical-fork-shared-route", [critical[0], "1", sock, "preconnect-fork"], routes=primary + ";1:" + sock.encode().hex())
        assert shared_route["code"] == 0, (shared_route["out"], shared_route["err"])
        positive(run("go-production-acquisition", go, "production"))

        for label, mode in [("pinned-cql-negative", "native"), ("pinned-cql-production", "production")]:
            generator = run(label, [str(args.pinned), "-cluster", "127.0.0.1:" + str(port),
                            "-keyspace", "owned_absent", "-output", str(root / "output"), "-connection-timeout", "500ms", "-query-timeout", "500ms"], mode)
            diagnostic = generator["out"] + generator["err"]
            assert generator["code"] == 1 and "unable to discover protocol version: got a request frame from server" in diagnostic, generator
            assert "panic" not in diagnostic.lower() and "operation not permitted" not in diagnostic.lower(), generator
            assert any(e["listener"] == "loop" and e.get("hex") == "040000010500000000" for e in generator["events"]), generator
            assert all(e["listener"] in {"loop", "broker"} for e in generator["events"]), generator

        # Real OS FD inventory exceeds this deliberately tiny capacity. The
        # adapter must refuse socket creation, not release unproven pins.
        assert source.count("#define FD_LIMIT 65536") == 1
        (root / "small-inventory.c").write_text(source.replace("#define FD_LIMIT 65536", "#define FD_LIMIT 2"))
        subprocess.run(flags + ["-dynamiclib", "-pthread", "-o", str(root / "small-inventory.dylib"), str(root / "small-inventory.c")], check=True)
        unavailable = run("inventory-truncated-deny", go, helper="small-inventory.dylib")
        assert unavailable["code"] == 2 and "socket: operation not permitted" in unavailable["out"] and not unavailable["events"], unavailable
        positive(run("inventory-restored", go))

        guard = "if (in->sin_addr.s_addr != htonl(INADDR_LOOPBACK)) goto denied;"
        assert source.count(guard) == 1, "mutation target missing/ambiguous"
        (root / "mutant.c").write_text(source.replace(guard, "/* address guard deliberately removed */"))
        subprocess.run(flags + ["-dynamiclib", "-pthread", "-o", str(root / "mutant.dylib"), str(root / "mutant.c")], check=True)
        mutant = run("mutation-address-guard", matrix, helper="mutant.dylib")
        try:
            confined(mutant)
        except AssertionError:
            mutated_rows = json.loads(mutant["out"])
            assert any(r["name"] == "lan" and r["ok"] for r in mutated_rows), mutant
            assert any(e["listener"] == "loop" and e.get("hex") == b"OWN:lan".hex() for e in mutant["events"]), mutant
            evidence["mutation"] = {"removed": "exact IPv4 address guard", "oracle": "confined matrix", "red": True}
        else:
            raise RuntimeError("mutation escaped oracle")
        confined(run("matrix-restored", matrix))
        evidence["mutation"]["restored_green"] = True
        connect_call = "int result = connect(fd, (const struct sockaddr *)&routes[route].peer, routes[route].peer.sun_len);"
        assert source.count(connect_call) == 1
        replacement = """int replacement = socket(AF_UNIX, SOCK_STREAM, 0);
    int result = connect(replacement, (const struct sockaddr *)&routes[route].peer, routes[route].peer.sun_len);
    if (result == 0) dup2(replacement, fd);
    close(replacement);"""
        split = source.replace(connect_call, replacement)
        state_guard = """    struct sockaddr_un peer = {0};
    socklen_t size = sizeof(peer);
    if (getpeername(fd, (struct sockaddr *)&peer, &size) == 0) {
        pthread_mutex_unlock(&lock); errno = EISCONN; return -1;
    }
    if (errno != ENOTCONN) { int error = errno; pthread_mutex_unlock(&lock); errno = error; return -1; }
    // Publish the route before the kernel makes the shared socket connected:
    // another process can query its peer before this connect call returns.
    // The claim also serializes competing parent/child connects after fork.
    unsigned unclaimed = 0;
    if (!atomic_compare_exchange_strong(p->port, &unclaimed, routes[route].port)) {
        pthread_mutex_unlock(&lock); errno = EISCONN; return -1;
    }
"""
        assert source.count(state_guard) == 1
        overwrite = source.replace(state_guard, "").replace(connect_call, replacement.replace(
            "if (result == 0) dup2(replacement, fd);",
            "if (result == 0) { dup2(replacement, fd); dup2(replacement, p->keeper); p->handle = identity(fd); }"))
        prune_start = source.index("static int prune(void)")
        prune_end = source.index("static void *maintain", prune_start)
        pin_close = "if (identity(records[i].keeper) == records[i].handle) close(records[i].keeper);"
        assert source[prune_start:prune_end].count(pin_close) == 1
        retain = source[:prune_start] + source[prune_start:prune_end].replace(pin_close, """struct socket_fdinfo refs = {0};
        if (proc_pidfdinfo(getpid(), records[i].keeper, PROC_PIDFDSOCKETINFO, &refs, sizeof(refs)) == sizeof(refs) && (refs.pfi.fi_status & PROC_FP_SHARED)) continue;
        """ + pin_close) + source[prune_end:]
        evidence["blocker_mutations"] = []
        for bug, mutant_source, mode, diagnostic in [
            ("preconnect-alias-split", split, "preconnect", "PRECONNECT_IDENTITY split"),
            ("concurrent-overwrite", overwrite, "concurrent", "successes=8 eisconn=0"),
            ("fork-mutual-retention", retain, "fork-eof", "FORK_KEEPER_COUNT child"),
        ]:
            (root / (bug + ".c")).write_text(mutant_source)
            subprocess.run(flags + ["-dynamiclib", "-pthread", "-o", str(root / (bug + ".dylib")), str(root / (bug + ".c"))], check=True)
            broken = run("mutation-" + bug, critical + [mode], helper=bug + ".dylib")
            assert broken["code"] != 0 and diagnostic in broken["err"], (bug, broken["code"], broken["out"], broken["err"])
            restored = run("restored-" + bug, critical + [mode])
            assert restored["code"] == 0, (bug, restored["out"], restored["err"])
            if mode == "fork-eof":
                assert any(e["event"] == "eof" and e.get("alive") == [True, True] for e in restored["events"])
            evidence["blocker_mutations"].append({"bug": bug, "red": True, "restored_green": True, "diagnostic": diagnostic})
            save()
        baseline(run("baseline-after", matrix, "baseline"))
        evidence["generated_files"] = [str(p.relative_to(root)) for p in (root / "output").rglob("*") if p.is_file()]
        assert not evidence["generated_files"], evidence["generated_files"]
        evidence["passed"] = True
    except BaseException as error:
        evidence["failure"] = repr(error)
        raise
    finally:
        stop.set()
        for s in resources:
            s.close()
        for t in list(threads):
            t.join(timeout=3)
        for p in root.glob("*.sock"):
            p.unlink()
        evidence["hash_after"] = hashlib.sha256(args.pinned.read_bytes()).hexdigest()
        if (root / "go-client").exists():
            evidence["go_client_hash_after"] = hashlib.sha256((root / "go-client").read_bytes()).hexdigest()
            assert evidence["go_client_hash_after"] == evidence["go_client_hash_before"], "Go client changed"
        evidence["cleanup"] = {"threads_alive": sum(t.is_alive() for t in threads), "open_sockets": sum(s.fileno() >= 0 for s in resources),
                               "socket_leaves": [str(p) for p in root.glob("*.sock")], "scratch_leaves": [str(p) for p in (root / "tmp").glob("orchestra-tool-scratch-*")]}
        evidence["finished"] = time.time()
        # Keep source, binaries and evidence; discard this CLI's rebuildable Go
        # compilation cache. Never clean another proof's or owner's directory.
        if (root / "go-build").exists():
            shutil.rmtree(root / "go-build")
        save()
        assert evidence["hash_after"] == evidence.get("hash_before"), "generator changed"
        assert evidence["cleanup"] == {"threads_alive": 0, "open_sockets": 0, "socket_leaves": [], "scratch_leaves": []}, evidence["cleanup"]
        print("ARTIFACT " + str(root / "evidence.json"), flush=True)


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "--client":
        client(json.loads(sys.argv[2]))
    else:
        main()
