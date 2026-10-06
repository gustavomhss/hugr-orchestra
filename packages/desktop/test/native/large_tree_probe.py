#!/usr/bin/env python3
"""Latency receipt for large Electron trees (VS Code Settings); diagnostic, not proof.

Runs inside the W0 session (see README) with the helper mounted at /bridge:
    orchestra-a11y-session --exec python3 -B /proof/large_tree_probe.py [--deadline-ms N]
It binds the workspace scope the way the host does, then emulates the plugin's
paging (budget 500, maxText 0, cursor pages) and the act() flow behind
ui_keys/ui_type without a ref: whole-tree scans, then one native mutation.
"""

import argparse
import json
import os
from pathlib import Path
import subprocess
import sys
from time import monotonic, sleep

# --bridge=DIR measures another helper copy (e.g. the pre-change baseline) on the same session.
sys.path.insert(0, next((arg.split("=", 1)[1] for arg in sys.argv if arg.startswith("--bridge=")), "/bridge"))
import context as context_module
from actions import press, replace_text
from bindings import BindingStore
from bus import AtspiBus, BusError
from context import RequestContext, process_identity
from refs import RefRegistry
from snapshot import read

DIRTY = {}
CACHE = [None]
SESSION = json.loads(Path("/session/apps.json").read_text())


class TimedBus(AtspiBus):
    """Separates provider wait from helper CPU; every call still uses the real wire."""

    wire_s = 0.0
    methods = {}

    def call(self, *args, **kwargs):
        started = monotonic()
        try:
            return super().call(*args, **kwargs)
        finally:
            spent = monotonic() - started
            self.wire_s += spent
            key = args[3] if args[3] != "Get" else "Get:" + args[5][1]
            entry = self.methods.setdefault(key, [0, 0.0, 0.0])
            entry[0] += 1
            entry[1] += spent
            entry[2] = max(entry[2], spent)


def descendants(pid):
    children, pending = [], [pid]
    while pending:
        current = pending.pop()
        for task in Path(f"/proc/{current}/task").iterdir():
            for child in (task / "children").read_text().split():
                children.append(int(child))
                pending.append(int(child))
    return children


def bind(bus, registry):
    pids = [pid for app in SESSION["apps"].values() for pid in (app["pid"], *descendants(app["pid"]))]
    target = {"scopeKind": "workspace", "appID": "workspace", "launchEpoch": SESSION["sessionID"], "ownershipRevision": 1,
              "runtime": {"runtimeID": "probe", "runtimeEpoch": "probe", "accessibilitySessionID": SESSION["sessionID"]},
              "processIdentities": [process_identity(pid) for pid in pids]}
    store = BindingStore(bus, registry, SESSION["sessionID"])
    dirty = store.dirty

    def counted(kind, owner, path):
        DIRTY[kind] = DIRTY.get(kind, 0) + 1
        return dirty(kind, owner, path)
    store.dirty = counted
    proposal = store.discover({"phase": "discover", "target": target,
                               "identity": {"senderID": 1, "tabID": "probe", "generation": 1, "profileID": "probe"}}, 10000, lambda: False)
    confirmed = store.confirm({"phase": "confirm", "proposalID": proposal["proposalID"], "ownershipRevision": 1,
                               "roots": [{"owner": root["owner"], "path": root["path"]} for root in proposal["roots"]]}, 10000, lambda: False)
    return store, store.bindings[confirmed["bindingID"]], proposal["roots"]


def timed(bus, registry, binding, deadline_ms, run):
    context = RequestContext(bus, registry, binding, deadline_ms, *([None, CACHE[0]] if CACHE[0] else []))
    wire, total, started = bus.wire_s, bus.trace_total, monotonic()
    entry = {}
    try:
        entry["value"] = run(context)
    except BusError as error:
        entry["error"] = error.code
    entry.update(ms=round((monotonic() - started) * 1000), wireMs=round((bus.wire_s - wire) * 1000),
                 calls=bus.trace_total - total, hits=getattr(context, "hits", 0))
    return entry


MAX_PAGES = [48]


def scan(bus, registry, binding, deadline_ms, query, wanted=lambda item: False):
    pages, cursor = [], None
    while True:
        page = timed(bus, registry, binding, deadline_ms, lambda context: read(context, {"cursor": cursor} if cursor else query))
        value = page.pop("value", None)
        if value:
            page.update(items=len(value["items"]), reasons=value["coverage"]["reasons"], visited=value["coverage"]["visited"])
            match = next((item for item in value["items"] if wanted(item)), None)
            if match:
                page["match"] = match
        pages.append(page)
        print(json.dumps({key: value for key, value in page.items() if key != "match"}), file=sys.stderr, flush=True)
        if not value or not value.get("hasMore") or len(pages) >= MAX_PAGES[0]:
            return pages, value
        cursor = value["cursor"]


def summary(pages):
    return {"pages": len(pages), "ms": sum(page["ms"] for page in pages), "wireMs": sum(page["wireMs"] for page in pages),
            "calls": sum(page["calls"] for page in pages), "items": sum(page.get("items", 0) for page in pages),
            "maxPageMs": max(page["ms"] for page in pages), "errors": [page["error"] for page in pages if "error" in page],
            "hits": sum(page["hits"] for page in pages)}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--deadline-ms", type=int, default=10000)
    parser.add_argument("--settle-s", type=float, default=4)
    parser.add_argument("--skip-mutations", action="store_true")
    parser.add_argument("--max-pages", type=int, default=48)
    parser.add_argument("--profile", action="store_true")
    parser.add_argument("--no-cache", action="store_true")
    parser.add_argument("--bridge", default="/bridge")
    parser.add_argument("--no-prepare", action="store_true", help="Settings is already open; skip the welcome scan and key setup")
    args = parser.parse_args()
    MAX_PAGES[0] = args.max_pages
    # Diagnostic only: lift the helper's per-request clamp so the real need is visible.
    context_module.LIMITS["timeoutMs"] = max(context_module.LIMITS["timeoutMs"], args.deadline_ms)
    bus = TimedBus(os.environ["DBUS_SESSION_BUS_ADDRESS"], 1000)
    registry = RefRegistry("probe")
    receipt = {"deadlineMs": args.deadline_ms, "helperLimits": dict(context_module.LIMITS)}
    try:
        store, binding, roots = bind(bus, registry)
        CACHE[0] = None if args.no_cache else getattr(store, "cache", None)
        receipt["cache"] = CACHE[0] is not None and [status.get("changes") for status in store.subscriptions.values()]
        receipt["roots"] = [{"name": root["name"], "role": root["role"]} for root in roots]
        query = {"budget": 500, "maxText": 0}
        if not args.no_prepare:
            pages, _ = scan(bus, registry, binding, args.deadline_ms, query)
            receipt["welcome"] = {"summary": summary(pages), "pages": pages}
            print(json.dumps(receipt["welcome"]["summary"]), file=sys.stderr, flush=True)
            subprocess.run([sys.executable, "/proof/prepare_code.py", "--view", "settings"], check=True, timeout=15,
                           stdout=subprocess.DEVNULL)
            sleep(args.settle_s)
        if args.profile:
            import cProfile
            import pstats
            profiler = cProfile.Profile()
            profiler.enable()
            scan(bus, registry, binding, args.deadline_ms, query)
            profiler.disable()
            pstats.Stats(profiler, stream=sys.stderr).sort_stats("cumulative").print_stats(30)
            pstats.Stats(profiler, stream=sys.stderr).sort_stats("tottime").print_stats(20)
        # ui_find: one whole-tree scan.
        pages, _ = scan(bus, registry, binding, args.deadline_ms, query)
        receipt["find"] = summary(pages)
        if not args.skip_mutations:
            # ui_keys without a target, as the plugin now does it: one roots page, then the key.
            started = monotonic()
            first = timed(bus, registry, binding, args.deadline_ms, lambda context: read(context, {"budget": 32, "maxText": 0}))
            page = first.pop("value", None)
            window = next((item for item in (page or {}).get("items", []) if item["parentRef"] is None
                           and item["roleName"] in ("frame", "window") and 1 in item["states"]), None)
            key = timed(bus, registry, binding, args.deadline_ms, lambda context: press(context, window["ref"], "end")) if window else {}
            key.pop("value", None)
            receipt["keys-no-target"] = {"rootsPage": first, "key": key, "ms": round((monotonic() - started) * 1000)}
            # ui_type by target, as act() does it: two whole-tree scans, a third up to the winner's page, then the type.
            started = monotonic()
            wanted = lambda item: "search settings" in item["name"].lower() and item["capabilities"]["type"]["supported"]
            first, _ = scan(bus, registry, binding, args.deadline_ms, query, wanted)
            second, _ = scan(bus, registry, binding, args.deadline_ms, query, wanted)
            winner = next((index for index, page in enumerate(first) if page.get("match")), None)
            flow = {"scan1": summary(first), "scan2": summary(second), "winnerPage": winner}
            if winner is not None:
                MAX_PAGES[0], limit = winner + 1, MAX_PAGES[0]
                third, _ = scan(bus, registry, binding, args.deadline_ms, query, wanted)
                MAX_PAGES[0] = limit
                flow["scan3"] = summary(third)
                field = third[-1].get("match")
                typed = timed(bus, registry, binding, args.deadline_ms, lambda context: replace_text(context, field["ref"], "font size")) if field else {}
                typed.pop("value", None)
                flow["type"] = typed
            flow["ms"] = round((monotonic() - started) * 1000)
            receipt["type-by-target"] = flow
        store.unbind(binding)
    finally:
        bus.close()
    receipt["dirty"] = DIRTY
    receipt["methods"] = {key: {"n": value[0], "avgMs": round(value[1] / value[0] * 1000, 2), "maxMs": round(value[2] * 1000)}
                          for key, value in sorted(bus.methods.items(), key=lambda item: -item[1][1])}
    print(json.dumps(receipt, indent=1))


if __name__ == "__main__":
    main()
