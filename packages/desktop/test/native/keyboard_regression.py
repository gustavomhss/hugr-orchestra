"""R2 native-wire adversaries and real GTK keyboard receipts on private D-Bus/Xvfb.

No registry substitute. Keyboard/read boundaries can run while R2 registry is
pending; test_actions.py separately exercises admission with the actual registry.
--mutations requires A11Y_BASELINE_KEYBOARD, a read-only copy of the frozen module.
"""

import hashlib
import os
from pathlib import Path
from threading import Event
import subprocess
import sys
import tempfile
import unittest

from test_actions import NativeFixtureTest, SOURCE, load
from bus import BusError
from context import A, ROOT, RequestContext

keyboard = load("keyboard_under_test", os.environ.get("A11Y_KEYBOARD_MODULE", str(SOURCE / "keyboard.py")))
actions = load("actions_under_test", os.environ.get("A11Y_ACTIONS_MODULE", str(SOURCE / "actions.py")))
probe_module = load("independent_probe", Path(__file__).with_name("keyboard_probe.py"))


class TappedContext(RequestContext):
    def __init__(self, *args):
        super().__init__(*args)
        self.events, self.cleanup = [], []

    def call(self, owner, path, interface, method, signature="()", parameters=(), reply="()", timeout_ms=None):
        value = super().call(owner, path, interface, method, signature, parameters, reply, timeout_ms)
        if method == "GenerateKeyboardEvent":
            self.events.append(parameters)
        return value

    def cleanup_call(self, *args):
        value = super().cleanup_call(*args)
        self.cleanup.append(args[5])
        return value


class KeyboardRegressionTest(NativeFixtureTest):
    def context(self, cancelled=None):
        return TappedContext(self.bus, None, self.binding, 8000, cancelled)

    def evidence(self, context, name="wire", controlled=False):
        evidence = context.require_owned(self.nodes[name])
        return dict(evidence, focus=self.ready["field"].replace("_field", "_focus")) if controlled else evidence

    def rejected_keyboard(self, code, text="replacement", controlled=False, context=None):
        context = context or self.context()
        with self.assertRaises(BusError, msg="Native malformed/focus readback must reject") as caught:
            keyboard.replace_text(context, self.nodes["wire"], text, context.remaining(), self.evidence(context, controlled=controlled))
        self.assertEqual([], context.events, "Fresh controlled descendant guard dispatched keys")
        self.assertEqual(code, caught.exception.code, "Fresh native safety guard returned wrong named failure")
        result = caught.exception.result
        self.assertFalse(result["focus"]["confirmed"], "Unsafe or unverified focus reported confirmed")
        for field in ("before", "value"):
            value = result.get(field)
            self.assertTrue(value is None or isinstance(value, str) and len(value) <= keyboard.MAX_TEXT,
                            "Unbounded native readback leaked into error evidence")
        return caught.exception

    def test_protected_after_grab_rejects_before_keys(self):
        self.command("wire", states=[7, 8, 24, 25], relation="controlled", afterGrab={"focusRole": 40})
        self.rejected_keyboard("protected-text", controlled=True)
        roles = self.command("wire-receipt")["rolesRead"]
        self.assertIn([self.ready["field"].replace("_field", "_focus"), 40], roles,
                      "Native protected role transition was never observed")

    def test_missing_hint_uses_only_owned_controlling_relation(self):
        self.command("wire", states=[7, 8, 24, 25], relation="controlled")
        context = self.context()
        result = keyboard.replace_text(context, self.nodes["wire"], "start", context.remaining(), self.evidence(context))
        self.assertEqual("verified", result["postcondition"])
        self.assertEqual([], context.events)
        self.command("reset")
        self.command("wire", states=[7, 8, 24, 25], keepUnfocused=True)
        self.rejected_keyboard("focus-unconfirmed", "replacement")
        self.assertEqual(1, self.command("wire-receipt")["calls"].get("GrabFocus", 0), "Focus mutation must never retry")

    def test_disabled_defunct_and_drift_after_grab_reject_before_keys(self):
        for change, code in (({"focusStates": [12, 24, 25]}, "disabled"),
                             ({"focusStates": [8, 12, 25]}, "disabled"),
                             ({"focusStates": [8, 12, 24]}, "disabled"),
                             ({"focusStates": [6, 8, 12, 24, 25]}, "defunct"),
                             ({"focusRole": 41}, "focus-unconfirmed"),
                             ({"focusParent": ROOT}, "focus-unconfirmed"),
                             ({"relation": "none"}, "focus-unconfirmed")):
            with self.subTest(change=change):
                self.command("reset")
                self.command("wire", states=[7, 8, 24, 25], relation="controlled", afterGrab=change)
                self.rejected_keyboard(code, controlled=True)

    def test_fresh_guard_before_select_all_preserves_unlock(self):
        self.command("wire", states=[7, 8, 24, 25], relation="controlled")
        test = self

        class ProtectAfterRealLock(TappedContext):
            def call(self, owner, path, interface, method, signature="()", parameters=(), reply="()", timeout_ms=None):
                value = super().call(owner, path, interface, method, signature, parameters, reply, timeout_ms)
                if method == "GenerateKeyboardEvent" and parameters == (4, "", 5):
                    test.command("wire", focusRole=40)
                return value

        context = ProtectAfterRealLock(self.bus, None, self.binding, 8000)
        with self.assertRaises(BusError) as caught:
            keyboard.replace_text(context, self.nodes["wire"], "replacement", context.remaining(), self.evidence(context, controlled=True))
        self.assertEqual("protected-text", caught.exception.code)
        self.assertEqual([(4, "", 5)], context.events, "Guard must stop select-all after native focus changes")
        self.assertEqual([(4, "", 6)], context.cleanup, "Real modifier lock must still be released")
        self.assertFalse(caught.exception.result["focus"]["confirmed"])
        self.assertEqual("unknown", caught.exception.result["dispatch"])

    def test_controlled_focus_can_move_to_target_during_confirmation(self):
        self.command("wire", states=[7, 8, 24, 25], relation="controlled")
        test = self
        changed = []

        class DirectFocusDuringRelationRead(TappedContext):
            def call(self, owner, path, interface, method, signature="()", parameters=(), reply="()", timeout_ms=None):
                if method == "GetRelationSet" and not changed:
                    changed.append(True)
                    test.command("wire", states=[7, 8, 12, 24, 25], focusStates=[8, 24, 25])
                return super().call(owner, path, interface, method, signature, parameters, reply, timeout_ms)

        context = DirectFocusDuringRelationRead(self.bus, None, self.binding, 8000)
        try:
            result = keyboard.replace_text(context, self.nodes["wire"], "start", context.remaining(), self.evidence(context, controlled=True))
        except BusError as error:
            self.fail("Direct native focus transition was lost: " + error.code)
        self.assertTrue(changed, "Native relation-read transition was not exercised")
        self.assertTrue(result["noOp"])
        self.assertEqual("verified", result["postcondition"])
        self.assertEqual([], context.events, "Focus stabilization must not dispatch or replay keys")
        self.assertEqual(0, self.command("wire-receipt")["calls"].get("GrabFocus", 0), "No-op focus stabilization must remain read-only")

    def test_direct_focus_transition_keeps_fresh_target_guards(self):
        for change, code in (({"role": 40}, "protected-text"),
                             ({"role": 79}, "focus-unconfirmed"),
                             ({"states": [7, 12, 24, 25]}, "disabled"),
                             ({"states": [6, 7, 8, 12, 24, 25]}, "defunct"),
                             ({"fieldParent": ROOT}, "wrong-scope"),
                             ({"fieldParent": self.ready["field"].replace("_field", "_group"), "groupRole": 40}, "protected-text")):
            with self.subTest(change=change):
                self.command("reset")
                self.command("wire", states=[7, 8, 24, 25], relation="controlled")
                test = self
                changed = []

                class GuardChangeDuringRelationRead(TappedContext):
                    def call(self, owner, path, interface, method, signature="()", parameters=(), reply="()", timeout_ms=None):
                        if method == "GetRelationSet" and not changed:
                            changed.append(True)
                            test.command("wire", **({"states": [7, 8, 12, 24, 25], "focusStates": [8, 24, 25]} | change))
                        return super().call(owner, path, interface, method, signature, parameters, reply, timeout_ms)

                context = GuardChangeDuringRelationRead(self.bus, None, self.binding, 8000)
                self.rejected_keyboard(code, "start", controlled=True, context=context)
                self.assertTrue(changed)

    def test_post_select_all_transition_cancellation_never_replays_keys(self):
        self.command("wire", states=[7, 8, 24, 25], relation="controlled")
        test = self
        selected, changed = [], []
        cancelled = Event()
        cleanup_after_cancel = []

        class CancelAfterDirectFocusRecheck(TappedContext):
            def call(self, owner, path, interface, method, signature="()", parameters=(), reply="()", timeout_ms=None):
                if selected and method == "GetRelationSet" and not changed:
                    changed.append(True)
                    test.command("wire", states=[7, 8, 12, 24, 25], focusStates=[8, 24, 25])
                value = super().call(owner, path, interface, method, signature, parameters, reply, timeout_ms)
                if method == "GenerateKeyboardEvent" and parameters == (ord("a"), "", 3):
                    selected.append(True)
                if changed and method == "GetState" and path == test.ready["field"]:
                    cancelled.set()
                return value

            def cleanup_call(self, *args):
                value = super().cleanup_call(*args)
                if cancelled.is_set():
                    cleanup_after_cancel.append(args[5])
                return value

        context = CancelAfterDirectFocusRecheck(self.bus, None, self.binding, 8000, cancelled.is_set)
        with self.assertRaises(BusError) as caught:
            keyboard.replace_text(context, self.nodes["wire"], "replacement", context.remaining(), self.evidence(context, controlled=True))
        self.assertTrue(selected and changed, "Actual select-all/fresh native focus transition was not exercised")
        self.assertEqual("cancelled", caught.exception.code, "Post-select-all direct focus was not freshly rechecked")
        self.assertEqual([(4, "", 5), (ord("a"), "", 3)], context.events, "Select-all or typing was replayed during focus stabilization")
        self.assertTrue(context.cleanup, "Cancellation must release real modifier locks")
        self.assertTrue(all(event == (4, "", 6) for event in context.cleanup), "Cleanup dispatched a non-unlock event")
        self.assertEqual([(4, "", 6)], cleanup_after_cancel, "Cancellation-path modifier cleanup did not run")
        self.assertEqual(len(context.events) + len(context.cleanup), caught.exception.result["controllerCalls"])
        self.assertEqual(1, self.command("wire-receipt")["calls"].get("GrabFocus", 0), "Focus mutation was replayed during stabilization")
        self.assertEqual("unknown", caught.exception.result["dispatch"])

    def test_malformed_admission_rejects_before_focus_or_keys(self):
        for change in ({"readback": "x" * (1500 + 1)},
                       {"value": "wanted trailing", "readback": "wanted"},
                       {"value": "wanted", "countOverride": True},
                       {"value": "wanted", "countAfterRead": 7}):
            with self.subTest(change=list(change)):
                self.command("reset")
                self.command("wire", **change)
                self.rejected_keyboard("verification-incomplete", "wanted")
                self.assertEqual(0, self.command("wire-receipt")["calls"].get("GrabFocus", 0),
                                 "Malformed admission readback reached focus mutation")

    def test_truncated_noop_is_not_verified(self):
        self.command("wire", value="wanted trailing", readback="wanted")
        self.rejected_keyboard("verification-incomplete", "wanted")

    def test_actions_and_independent_probe_reject_malformed_ranges(self):
        for change in ({"readback": "x" * 1501}, {"readback": "wa", "value": "wanted"},
                       {"value": "wanted", "countAfterRead": 7}, {"countOverride": True}):
            with self.subTest(change=list(change)):
                self.command("reset")
                self.command("wire", **change)
                with self.assertRaises(BusError, msg="Action full-value boundary must reject malformed native range") as caught:
                    actions._value(self.context(), self.nodes["wire"], 1500)
                self.assertEqual("verification-incomplete", caught.exception.code)
                self.command("reset")
                self.command("wire", **change)
                probe = probe_module.Probe(self.bus, None)
                probe.owner = self.ready["owner"]
                with self.assertRaisesRegex(RuntimeError, "verification-incomplete", msg="Independent probe must reject malformed native range"):
                    probe.text(self.nodes["wire"])

    def test_scalar_and_utf16_full_ranges_are_valid(self):
        text = "012345678901234567890123🧪"
        for utf16 in (False, True):
            with self.subTest(utf16=utf16):
                self.command("reset")
                self.command("wire", value=text, utf16=utf16)
                context = self.context()
                try:
                    value = actions._value(context, self.nodes["wire"], 1500)
                    result = keyboard.replace_text(context, self.nodes["wire"], text, context.remaining(), self.evidence(context))
                except BusError as error:
                    self.fail("True full native scalar/UTF16 range rejected: " + error.code)
                self.assertEqual(text, value)
                self.assertEqual(text, result["value"])
                self.assertEqual("verified", result["postcondition"])
                self.assertTrue(result["noOp"])
                self.assertEqual([], context.events)
                probe = probe_module.Probe(self.bus, None)
                probe.owner = self.ready["owner"]
                self.assertEqual(text, probe.text(self.nodes["wire"]))

    def test_real_gtk_unicode_clear_and_noop(self):
        text = "café 漢字 🧪 e\u0301"
        context = self.context()
        try:
            result = keyboard.replace_text(context, self.nodes["entry"], text, context.remaining(), self.evidence(context, "entry"))
        except BusError as error:
            self.fail("Real Unicode segment typing failed: " + error.code)
        self.assertEqual(text, result["value"])
        self.assertEqual("verified", result["postcondition"])
        self.assertEqual("unfenced", result["focus"]["externalRaces"])
        segments = [event[1] for event in context.events if event[2] == 4]
        self.assertEqual(["caf", "é", " ", "漢", "字", " ", "🧪", " e", "\u0301"], segments,
                         "Unicode remaps must be separate native KEY_STRING segments")
        receipt = self.command("receipt")
        self.assertEqual(text, receipt["entry"], "Independent GTK receipt differs from exact requested Unicode")
        prefix = ""
        for segment in segments:
            prefix += segment
            self.assertIn(["entry", prefix], receipt["changes"], "Application never consumed a verified native segment")
        for value in (text, "", ""):
            context = self.context()
            result = keyboard.replace_text(context, self.nodes["entry"], value, context.remaining(), self.evidence(context, "entry"))
            self.assertEqual(value, result["value"])
            self.assertEqual(value, self.command("receipt")["entry"])
            if result.get("noOp"):
                self.assertEqual([], context.events, "Verified no-op dispatched keyboard events")


def mutation_controls():
    source = (SOURCE / "keyboard.py").read_text()
    digest = hashlib.sha256(source.encode()).hexdigest()
    baseline = Path(os.environ["A11Y_BASELINE_KEYBOARD"]).read_text()
    anchor = "    generate(0, segment, 4)"
    if source.count(anchor) != 1:
        raise AssertionError("Single native KEY_STRING segment mutation anchor changed")
    controls = [("cold-protected", baseline, "test_protected_after_grab_rejects_before_keys",
                 "Fresh controlled descendant guard dispatched keys"),
                ("cold-truncated-noop", baseline, "test_truncated_noop_is_not_verified",
                 "Native malformed/focus readback must reject"),
                ("cold-unbounded-read", baseline, "test_malformed_admission_rejects_before_focus_or_keys",
                 "Fresh controlled descendant guard dispatched keys"),
                ("suppress-segments", source.replace(anchor, "    return  # Suppressed KEY_STRING segment control."),
                 "test_real_gtk_unicode_clear_and_noop", "Real Unicode segment typing failed")]
    with tempfile.TemporaryDirectory(prefix="w2b-r2-keyboard-controls-") as directory:
        for name, code, test, assertion in controls:
            path = Path(directory) / (name + ".py")
            path.write_text(code)
            run = subprocess.run([sys.executable, str(Path(__file__).resolve()), "KeyboardRegressionTest." + test],
                                 env=dict(os.environ, A11Y_KEYBOARD_MODULE=str(path)), capture_output=True, text=True, timeout=30)
            output = run.stdout + run.stderr
            if run.returncode == 0 or "AssertionError" not in output or assertion not in output or test not in output:
                raise AssertionError("R2 mutation failed to produce named assertion: " + name + "\n" + output)
            print("MUTATION " + name + ": named assertion failed: " + assertion, flush=True)
    if hashlib.sha256((SOURCE / "keyboard.py").read_bytes()).hexdigest() != digest:
        raise AssertionError("Production keyboard changed during temporary controls")
    print("RESTORED: keyboard SHA256 " + digest, flush=True)
    focus_controls()


def focus_controls():
    source = (SOURCE / "keyboard.py").read_text()
    digest = hashlib.sha256(source.encode()).hexdigest()
    controls = [
        ("focus-recheck", "    for _ in range(2):", "    for _ in range(1):",
         "test_controlled_focus_can_move_to_target_during_confirmation", "Direct native focus transition was lost"),
        ("protected-ancestor", '        role = call(ref, A + "Accessible", "GetRole", reply="(u)")',
         '        role = call(ref, A + "Accessible", "GetRole", reply="(u)") if stop is None or len(paths) == 1 or ref[1] in (stop, ROOT) else None',
         "test_direct_focus_transition_keeps_fresh_target_guards", "Native malformed/focus readback must reject"),
        ("cancel-cleanup", "            finally:\n                _release(bus, controller, result)\n            prefix += segment",
         "            finally:\n                pass\n            prefix += segment",
         "test_post_select_all_transition_cancellation_never_replays_keys", "Cancellation-path modifier cleanup did not run"),
    ]
    with tempfile.TemporaryDirectory(prefix="native-focus-controls-") as directory:
        for name, old, new, test, assertion in controls:
            if source.count(old) != 1:
                raise AssertionError("Focus mutation anchor missing or ambiguous: " + name)
            path = Path(directory) / (name + ".py")
            path.write_text(source.replace(old, new))
            run = subprocess.run([sys.executable, str(Path(__file__).resolve()), "KeyboardRegressionTest." + test],
                                 env=dict(os.environ, A11Y_KEYBOARD_MODULE=str(path)), capture_output=True, text=True, timeout=30)
            output = run.stdout + run.stderr
            if run.returncode == 0 or "AssertionError" not in output or assertion not in output or test not in output:
                raise AssertionError("Focus mutation did not produce named failure: " + name + "\n" + output)
            print("MUTATION " + name + ": named assertion failed: " + assertion, flush=True)
    if hashlib.sha256((SOURCE / "keyboard.py").read_bytes()).hexdigest() != digest:
        raise AssertionError("Production keyboard changed during focus controls")
    print("RESTORED: focus source SHA256 " + digest, flush=True)


if __name__ == "__main__":
    if "--focus-mutations" in sys.argv:
        focus_controls()
        sys.exit(0)
    if "--mutations" in sys.argv:
        mutation_controls()
        sys.exit(0)
    unittest.main(verbosity=2)
