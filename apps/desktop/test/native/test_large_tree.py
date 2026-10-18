#!/usr/bin/env python3
"""Large-tree latency contracts on the actual helper modules and a real Gio exporter.

Time-sliced pages, the event-invalidated traversal cache and its fence. Reuses the
W2 A exporter fixture (test_snapshot.py); no GUI. Run Python -B under dbus-run-session:
    python3 -B test_large_tree.py --payload <helper dir> [--self-check]
--self-check breaks each guarded line in a temporary copy, requires the named
assertion to fail, restores the copy and checks the production digests.
"""

import argparse
import hashlib
import importlib
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
from threading import Event, Timer
import time
import unittest

from gi.repository import GLib

from test_snapshot import A, ROOT, WINDOW, Exporter

CHILDREN = 24


class LargeTreeTests(unittest.TestCase):
    wire = context = refs = snapshot = bindings = None

    def setUp(self):
        self.service = Exporter()
        self.service.start()
        self.addCleanup(self.service.close)
        self.service.add(ROOT, role=75, parent="/org/a11y/atspi/null", name="application")
        self.service.add(WINDOW, role=23, parent=ROOT, name="window")
        self.paths = [f"{WINDOW}/c{index}" for index in range(CHILDREN)]
        for index, path in enumerate(self.paths):
            self.service.add(path, name=f"control {index}", actions=("press",))
        self.service.change(ROOT, children=[("", WINDOW)])
        self.service.change(WINDOW, children=[("", path) for path in self.paths])
        self.bus = self.wire.AtspiBus(os.environ["DBUS_SESSION_BUS_ADDRESS"], 1000)
        self.addCleanup(self.bus.close)
        self.registry = self.refs.RefRegistry("helper")
        self.binding = {"bindingID": "binding", "bindingEpoch": "epoch", "scopeKind": "workspace",
            "dock": {"senderID": 1, "tabID": "tab", "generation": 1, "profileID": "profile"},
            "runtime": {"runtimeID": "runtime", "runtimeEpoch": "epoch", "accessibilitySessionID": "session"},
            "appID": "workspace", "launchEpoch": "session", "ownershipRevision": 1,
            "processIdentities": [self.context.process_identity(os.getpid())],
            "roots": [{"owner": self.service.owner, "path": WINDOW}]}
        self.registry.register(self.binding)
        # The production event routing: BindingStore.dirty feeds its cache.
        self.store = self.bindings.BindingStore(self.bus, self.registry, "session")
        status = self.bus.subscribe_lifecycle(self.service.owner, self.store.dirty)
        self.assertEqual(status["changes"], "registered", "change-event-registration-positive-control")
        self.store.cache.enable(self.service.owner)

    def ctx(self, timeout_ms=10000, cache=True):
        return self.context.RequestContext(self.bus, self.registry, self.binding, timeout_ms, None, self.store.cache if cache else None)

    def pages(self, query, timeout_ms=10000, cache=True):
        pages = [self.snapshot.read(self.ctx(timeout_ms, cache), query)]
        while pages[-1]["hasMore"]:
            self.assertLess(len(pages), 64, "pages-must-finish")
            pages.append(self.snapshot.read(self.ctx(timeout_ms, cache), {"cursor": pages[-1]["cursor"]}))
        return pages

    def names(self, pages):
        return [item["name"] for page in pages for item in page["items"]]

    def wire_calls(self, method, path=None):
        return sum(1 for call in self.bus.trace if call["method"] == method and (path is None or call["path"] == path))

    def emit(self, path, member="PropertyChange", detail="accessible-name"):
        def send():
            self.service.connection.emit_signal(None, path, A + "Event.Object", member,
                                                GLib.Variant("(siiv)", (detail, 0, 0, GLib.Variant("s", ""))))
            self.service.connection.flush_sync(None)
        self.service.on(send)

    def test_slow_provider_pages_by_time_slice(self):
        for path in self.paths:
            self.service.change(path, onRole=lambda: time.sleep(0.06))
        # 24 slow children need ~1.5 s; each request has 1 s and stops starting records at 0.5 s.
        pages = self.pages({"budget": 500, "maxText": 0}, timeout_ms=1000, cache=False)
        self.assertEqual(self.names(pages), ["window", *[f"control {index}" for index in range(CHILDREN)]],
                         "time-sliced-pages-cover-every-record-once")
        self.assertGreater(len(pages), 1, "slow-provider-splits-pages")
        self.assertIn("time-slice", pages[0]["coverage"]["reasons"], "time-slice-reason-named")
        self.assertTrue(pages[-1]["coverage"]["complete"], "time-slice-is-not-partial-coverage")

    def test_stalled_provider_call_ends_the_page_before_its_record(self):
        stalls = [True]

        def stall():
            if stalls.pop() if stalls else False:
                time.sleep(1.0)  # Beyond the 800 ms provider-call cap, well inside the 2 s request.

        self.service.change(self.paths[1], onRole=stall)
        try:
            pages = self.pages({"budget": 500, "maxText": 0}, timeout_ms=2000, cache=False)
        except self.wire.BusError as error:
            self.fail("stalled-record-retried-on-next-page: the page was lost to " + error.code)
        self.assertEqual(self.names(pages), ["window", *[f"control {index}" for index in range(CHILDREN)]],
                         "stalled-record-retried-on-next-page")
        self.assertIn("provider-stall", pages[0]["coverage"]["reasons"], "provider-stall-reason-named")
        self.assertTrue(pages[-1]["coverage"]["complete"], "provider-stall-is-not-partial-coverage")

    def test_paged_calls_end_at_the_cutoff(self):
        context = self.ctx(2000, cache=False)
        context.paged, context.cutoff, before = True, time.monotonic() - 0.001, self.bus.trace_total
        with self.assertRaises(self.wire.BusError, msg="paged-call-refused-after-cutoff") as caught:
            context.call(self.service.owner, WINDOW, A + "Accessible", "GetRole", reply="(u)")
        self.assertEqual((caught.exception.code, self.bus.trace_total), ("timeout", before), "paged-call-refused-after-cutoff")
        self.assertTrue(context.stalled(), "cutoff-is-a-stall-while-the-deadline-holds")

    def test_cached_rescan_reads_no_child_facts(self):
        query = {"budget": 500, "maxText": 0}
        first = self.names(self.pages(query))
        counts = lambda: [sum(self.wire_calls(method, path) for path in self.paths) for method in ("GetRole", "GetState", "Get")]
        before = (counts(), self.wire_calls("GetChildAtIndex"), self.wire_calls("GetName"), self.wire_calls("GetRole", WINDOW))
        second = self.pages(query)
        self.assertEqual(self.names(second), first, "cached-rescan-same-tree")
        after = (counts(), self.wire_calls("GetChildAtIndex"), self.wire_calls("GetName"), self.wire_calls("GetRole", WINDOW))
        self.assertEqual(after[0], before[0], "cached-rescan-child-facts-not-refetched")
        self.assertEqual(after[1:3], before[1:3], "cached-rescan-children-and-actions-not-refetched")
        self.assertGreater(after[3], before[3], "confirmed-root-stays-fresh")

    def test_change_event_invalidates_only_its_path(self):
        query = {"budget": 500, "maxText": 0}
        self.pages(query)
        self.service.change(self.paths[3], name="renamed")
        self.emit(self.paths[3])
        roles = self.wire_calls("GetRole", self.paths[3]), self.wire_calls("GetRole", self.paths[4])
        names = self.names(self.pages(query))
        self.assertEqual(names[4], "renamed", "change-event-drops-cached-name")
        self.assertEqual((self.wire_calls("GetRole", self.paths[3]), self.wire_calls("GetRole", self.paths[4])),
                         (roles[0] + 1, roles[1]), "change-event-invalidates-only-its-path")

    def test_fence_orders_reads_after_pending_events(self):
        query = {"budget": 500, "maxText": 0}
        self.pages(query)
        # Hold the helper's GLib loop so the event's invalidation stays queued until the read's fence.
        blocked, release = Event(), Event()

        def hold(*_):
            blocked.set()
            release.wait(3)
            return False

        source = GLib.idle_source_new()
        source.set_callback(hold)
        source.attach(self.bus._context)
        self.assertTrue(blocked.wait(2))
        self.service.change(self.paths[5], name="late rename")
        self.emit(self.paths[5])
        time.sleep(0.1)  # The worker has queued the callback behind the held loop.
        Timer(0.3, release.set).start()
        names = self.names(self.pages(query))
        release.set()
        self.assertEqual(names[6], "late rename", "fence-runs-queued-invalidations-before-cached-reads")

    def test_ref_resolution_stays_fresh_and_heals_a_missed_event(self):
        query = {"budget": 500, "maxText": 0}
        self.pages(query)
        self.service.change(self.paths[2], name="silent rename")  # No event: an exporter that drops one.
        page = self.snapshot.read(self.ctx(), query)
        stale = next(item for item in page["items"] if item["name"] == "control 2")
        with self.assertRaises(self.wire.BusError) as caught:
            self.registry.resolve(stale["ref"], self.ctx())
        self.assertEqual(caught.exception.code, "stale-ref", "mutation-refs-never-trust-cached-facts")
        self.assertIn("silent rename", self.names(self.pages(query)), "fresh-mismatch-drops-exporter-cache")

    def test_descendant_managing_children_are_not_cached(self):
        self.service.change(WINDOW, states={8, 24, 31})
        query = {"budget": 500, "maxText": 0}
        self.pages(query)
        before = self.wire_calls("GetChildAtIndex", WINDOW)
        self.pages(query)
        self.assertEqual(self.wire_calls("GetChildAtIndex", WINDOW) - before, CHILDREN, "manages-descendants-children-read-fresh")

    def test_fetch_racing_an_invalidation_is_not_stored(self):
        cache = self.refs.TreeCache()
        cache.enable(":1.9")
        seen = cache.mark(":1.9")
        cache.invalidate(":1.9", "/node")
        cache.put(":1.9", "/node", "count", 3, seen)
        self.assertIsNone(cache.get(":1.9", "/node", "count"), "raced-fetch-must-not-be-cached")
        cache.put(":1.9", "/node", "count", 4, cache.mark(":1.9"))
        self.assertEqual(cache.get(":1.9", "/node", "count"), 4, "fresh-fetch-cached-positive-control")

    def test_page_sizing_matches_the_encoded_frame(self):
        for index, path in enumerate(self.paths):
            self.service.change(path, name="🧪 \"quoted\" " + "x" * 200 + str(index))
        size, checked = self.snapshot._size, []

        def exact(result, items_bytes, text_bytes):
            # Every byte decision the read makes must equal the real encoding of what it would send.
            value = size(result, items_bytes, text_bytes)
            checked.append(value == len(json.dumps(result)))
            return value

        self.snapshot._size = exact
        self.addCleanup(setattr, self.snapshot, "_size", size)
        for budget in (1, 2, 7, 500):
            self.snapshot.read(self.ctx(cache=False), {"budget": budget, "maxText": 0})
        self.assertGreater(len(checked), CHILDREN, "sizing-spy-positive-control")
        self.assertTrue(all(checked), "incremental-size-formula-exact")


def self_check(args):
    files = ("context.py", "refs.py", "snapshot.py")
    digests = {name: hashlib.sha256((args.payload / name).read_bytes()).hexdigest() for name in files}
    probes = (("time-slice", "snapshot.py", "test_slow_provider_pages_by_time_slice",
               'if result["items"] and context.sliced():', "if False:", "time-slice-reason-named"),
              ("stall-raises", "snapshot.py", "test_stalled_provider_call_ends_the_page_before_its_record",
               'if error.code == "timeout" and result["items"] and position is not None and context.stalled():', "if False:",
               "stalled-record-retried-on-next-page"),
              ("stall-uncapped", "context.py", "test_paged_calls_end_at_the_cutoff",
               "            remaining = int((self.cutoff - monotonic()) * 1000)\n", "", "paged-call-refused-after-cutoff"),
              ("cache-off", "context.py", "test_cached_rescan_reads_no_child_facts",
               "if self.cache is None or owner not in self.fenced:", "if True:", "cached-rescan-child-facts-not-refetched"),
              ("event-ignored", "refs.py", "test_change_event_invalidates_only_its_path",
               '            entry["stamps"][path] = entry["seq"]\n            entry["nodes"].pop(path, None)',
               '            entry["stamps"][path] = entry["seq"]', "change-event-drops-cached-name"),
              ("over-invalidation", "refs.py", "test_change_event_invalidates_only_its_path",
               "if path is None or len(entry[\"stamps\"]) >= self.limit:", "if True:", "change-event-invalidates-only-its-path"),
              ("no-fence", "context.py", "test_fence_orders_reads_after_pending_events",
               "            self.bus.fence()\n", "", "fence-runs-queued-invalidations-before-cached-reads"),
              ("no-heal", "refs.py", "test_ref_resolution_stays_fresh_and_heals_a_missed_event",
               "                context.cache.invalidate(record[\"owner\"])", "                pass", "fresh-mismatch-drops-exporter-cache"),
              ("volatile-cached", "snapshot.py", "test_descendant_managing_children_are_not_cached",
               'return fetch() if parent.get("volatile", True) else context.cached(parent["owner"], parent["path"], ("child", index), fetch)',
               'return context.cached(parent["owner"], parent["path"], ("child", index), fetch)', "manages-descendants-children-read-fresh"),
              ("race-stored", "refs.py", "test_fetch_racing_an_invalidation_is_not_stored",
               ' or entry["stamps"].get(path, 0) > seen:', ":", "raced-fetch-must-not-be-cached"),
              ("size-separators", "snapshot.py", "test_page_sizing_matches_the_encoded_frame",
               'item_bytes = len(json.dumps(item)) + (2 if result["items"] else 0)', "item_bytes = len(json.dumps(item))",
               "incremental-size-formula-exact"))
    for label, file, case, old, new, assertion in probes:
        source = (args.payload / file).read_text(encoding="utf-8")
        if source.count(old) != 1:
            raise AssertionError("mutation-anchor-drift:" + label)
        with tempfile.TemporaryDirectory(prefix="large-tree-mutation-") as directory:
            copy = Path(directory) / file
            command = [sys.executable, "-B", str(Path(__file__).resolve()), "--payload", str(args.payload),
                       "--override", directory, "--case", case]
            copy.write_text(source.replace(old, new), encoding="utf-8")
            red = subprocess.run(command, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, timeout=60)
            if red.returncode != 1 or "FAIL: " + case not in red.stdout or assertion not in red.stdout:
                print(red.stdout, end="", flush=True)
                raise AssertionError("mutation-missed-named-assertion:" + label)
            copy.write_text(source, encoding="utf-8")
            green = subprocess.run(command, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, timeout=60)
            if green.returncode != 0 or "OK" not in green.stdout:
                print(green.stdout, end="", flush=True)
                raise AssertionError("restored-copy-not-green:" + label)
            print("MUTATION KILLED + RESTORED: " + label + " / " + assertion, flush=True)
    if digests != {name: hashlib.sha256((args.payload / name).read_bytes()).hexdigest() for name in files}:
        raise AssertionError("production-source-digest-changed")
    print("PRODUCTION DIGESTS UNCHANGED: " + json.dumps(digests, sort_keys=True), flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--payload", type=Path, default=Path(__file__).resolve().parent.parent.parent / "resources/linux/app-dock-accessibility")
    parser.add_argument("--override", type=Path, help=argparse.SUPPRESS)
    parser.add_argument("--case", choices=unittest.defaultTestLoader.getTestCaseNames(LargeTreeTests))
    parser.add_argument("--self-check", action="store_true")
    args = parser.parse_args()
    if not os.environ.get("DBUS_SESSION_BUS_ADDRESS") or sys.flags.optimize:
        raise RuntimeError("Private dbus-run-session and enabled assertions required")
    args.payload = args.payload.resolve()
    sys.path.insert(0, str(args.payload))
    if args.override:
        sys.path.insert(0, str(args.override.resolve()))
    for name in ("wire:bus", "context", "refs", "snapshot", "bindings"):
        attribute, _, module = name.partition(":")
        setattr(LargeTreeTests, attribute, importlib.import_module(module or attribute))
    suite = unittest.TestSuite([LargeTreeTests(args.case)]) if args.case else unittest.defaultTestLoader.loadTestsFromTestCase(LargeTreeTests)
    result = unittest.TextTestRunner(verbosity=2).run(suite)
    if result.wasSuccessful() and args.self_check:
        self_check(args)
    return 0 if result.wasSuccessful() else 1


if __name__ == "__main__":
    sys.exit(main())
