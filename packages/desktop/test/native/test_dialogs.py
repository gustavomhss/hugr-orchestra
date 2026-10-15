"""An owned app's own dialogs (GTK file chooser, message box) are windows of that app, on private D-Bus/Xvfb.

    xvfb-run -a dbus-run-session -- python3 -B test_dialogs.py
    ... test_dialogs.py --mutations   # each widening reverted must fail a named assertion

GTK gives its file chooser and message dialogs the roles file chooser (19) and alert (2), not dialog (16); a window
role set of frame/dialog/window left both outside every binding, so no ui_* tool could see or type into them. The
receipt (the file name GTK accepted) travels over the fixture's stdout, never through AT-SPI.
"""

import json
import os
from pathlib import Path
import selectors
import shutil
import subprocess
import sys
import tempfile
from time import monotonic, sleep
import unittest

SOURCE = Path(os.environ["A11Y_PAYLOAD"]) if "A11Y_PAYLOAD" in os.environ else Path(__file__).resolve().parents[2] / "resources/linux/app-dock-accessibility"
sys.path.insert(0, str(SOURCE))

from bindings import BindingStore
from bus import AtspiBus, BusError
from context import A, ROOT, RequestContext, process_identity, states
import keyboard
from refs import RefRegistry


def fixture():
    import gi
    gi.require_version("Gtk", "3.0")
    from gi.repository import GLib, Gtk

    window = Gtk.Window(title="Dialog fixture")
    window.add(Gtk.Label(label="Owner of the dialogs"))
    open_dialogs = []

    def answer(value):
        print(json.dumps(value), flush=True)

    def command(stream, condition):
        line = stream.readline()
        if not line:
            Gtk.main_quit()
            return False
        op = json.loads(line)["op"]
        if op == "save":
            dialog = Gtk.FileChooserDialog(title="Save File", parent=window, action=Gtk.FileChooserAction.SAVE)
            dialog.add_buttons("_Cancel", Gtk.ResponseType.CANCEL, "_Save", Gtk.ResponseType.ACCEPT)
            dialog.set_default_response(Gtk.ResponseType.ACCEPT)
            dialog.set_current_folder(tempfile.gettempdir())

            def respond(dialog, response):
                answer({"saved": dialog.get_filename() if response == Gtk.ResponseType.ACCEPT else None})
                dialog.destroy()
                open_dialogs.remove(dialog)

            dialog.connect("response", respond)
        else:
            dialog = Gtk.MessageDialog(parent=window, message_type=Gtk.MessageType.QUESTION, buttons=Gtk.ButtonsType.OK_CANCEL,
                                       text="Keep the change?")
            dialog.connect("response", lambda dialog, response: (dialog.destroy(), open_dialogs.remove(dialog)))
        open_dialogs.append(dialog)
        dialog.show_all()
        answer({"opened": op})
        return True

    GLib.io_add_watch(sys.stdin, GLib.IO_IN | GLib.IO_HUP, command)
    window.show_all()
    GLib.timeout_add(200, lambda: answer({"pid": os.getpid()}) and False)
    Gtk.main()


class DialogTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.app = subprocess.Popen([sys.executable, str(Path(__file__).resolve()), "--fixture"], stdin=subprocess.PIPE,
                                   stdout=subprocess.PIPE, text=True, env=dict(os.environ, GTK_MODULES="atk-bridge", NO_AT_BRIDGE="0"))
        cls.selector = selectors.DefaultSelector()
        cls.selector.register(cls.app.stdout, selectors.EVENT_READ)
        cls.addClassCleanup(cls.shutdown)
        cls.pid = cls.receive()["pid"]
        cls.bus = AtspiBus(os.environ["DBUS_SESSION_BUS_ADDRESS"], 1000)
        cls.session = cls.bus.connection.get_guid()

    @classmethod
    def receive(cls, seconds=10):
        if not cls.selector.select(seconds):
            raise AssertionError("Dialog fixture receipt timed out")
        line = cls.app.stdout.readline()
        if not line:
            raise AssertionError("Dialog fixture exited before its receipt")
        return json.loads(line)

    @classmethod
    def command(cls, op):
        cls.app.stdin.write(json.dumps({"op": op}) + "\n")
        cls.app.stdin.flush()
        return cls.receive()

    @classmethod
    def shutdown(cls):
        if getattr(cls, "bus", None):
            cls.bus.close()
        cls.app.stdin.close()
        try:
            cls.app.wait(timeout=2)
        except subprocess.TimeoutExpired:
            cls.app.kill()
            cls.app.wait(timeout=2)
        cls.app.stdout.close()
        cls.selector.close()

    def bind(self, role):
        """Discover and confirm, as the workspace does on every fresh read, until the dialog with role is proposed."""
        target = {"runtime": {"runtimeID": "private", "runtimeEpoch": "test", "accessibilitySessionID": self.session},
                  "appID": "dialog.gtk", "launchEpoch": "test", "ownershipRevision": 1, "processIdentities": [process_identity(self.pid)]}
        args = {"phase": "discover", "identity": {"senderID": 1, "tabID": "dialogs", "generation": 1, "profileID": "test"}, "target": target}
        deadline, proposal = monotonic() + 5, None
        while monotonic() < deadline:
            # A fresh store per attempt: proposals expire unconsumed, and a store holds at most eight.
            store = BindingStore(self.bus, RefRegistry("dialog-helper"), self.session)
            proposal = store.discover(args, 5000, lambda: False)
            if any(root["role"] == role for root in proposal["roots"]):
                break
            sleep(0.1)
        roles = sorted(root["role"] for root in proposal["roots"])
        self.assertIn(role, roles, "The app's own dialog was not proposed as one of its windows")
        confirmed = store.confirm({"phase": "confirm", "proposalID": proposal["proposalID"], "ownershipRevision": 1,
                                   "roots": [{"owner": root["owner"], "path": root["path"]} for root in proposal["roots"]]}, 5000, lambda: False)
        binding = store.get(confirmed["bindingID"], confirmed["bindingEpoch"])
        dialog = next(root for root in proposal["roots"] if root["role"] == role)
        return binding, {"owner": dialog["owner"], "path": dialog["path"]}

    def focus(self, name):
        # Bare Xvfb has no window manager to focus the new dialog; Xpra does this in the workspace.
        subprocess.run(["xdotool", "search", "--sync", "--name", name, "windowfocus", "--sync"], check=True, capture_output=True, timeout=10)

    def focused(self, context, dialog):
        pending, seen = [dialog["path"]], 0
        while pending and seen < 400:
            path = pending.pop()
            seen += 1
            if 12 in states(self.bus.call(dialog["owner"], path, A + "Accessible", "GetState", "()", (), "(au)")[0]):
                return {"owner": dialog["owner"], "path": path}
            pending.extend(child for _, child in self.bus.children(dialog["owner"], path, 64))
        raise AssertionError("No focused control in the dialog")

    def test_file_chooser_is_a_window_that_takes_typed_text_and_keys(self):
        self.assertEqual({"opened": "save"}, self.command("save"))
        binding, dialog = self.bind(19)
        self.focus("Save File")
        context = RequestContext(self.bus, None, binding, 8000)
        name = self.focused(context, dialog)
        evidence = context.require_owned(name)
        self.assertEqual((dialog["owner"], dialog["path"]), (evidence["owner"], evidence["path"]),
                         "A control inside the file chooser did not resolve to the chooser as its owned window")
        deadline = monotonic() + 3
        while 1 not in states(self.bus.call(dialog["owner"], dialog["path"], A + "Accessible", "GetState", "()", (), "(au)")[0]):
            if monotonic() > deadline:
                raise AssertionError("File chooser never became the active window")
            sleep(0.05)
        try:
            typed = keyboard.press_keys(context, name, None, context.remaining(), evidence, "dialog-proof.txt")
        except BusError as error:
            raise AssertionError("The file chooser refused typed text: " + error.code) from error
        self.assertEqual("acknowledged", typed["dispatch"], "Typed text did not reach the file chooser")
        sleep(0.3)
        context = RequestContext(self.bus, None, binding, 8000)
        keyboard.press_keys(context, dialog, "Return", context.remaining(), context.require_owned(dialog))
        self.assertEqual({"saved": str(Path(tempfile.gettempdir()) / "dialog-proof.txt")}, self.receive(),
                         "GTK did not accept the name typed into its own file chooser")

    def test_message_box_is_a_window(self):
        self.assertEqual({"opened": "alert"}, self.command("alert"))
        binding, dialog = self.bind(2)
        self.focus("Dialog fixture")
        self.assertEqual(dialog["path"], RequestContext(self.bus, None, binding, 8000).require_owned(dialog)["path"])


def mutation_controls():
    """Revert each widening on a copy of the payload; the suite must fail with a named assertion."""
    controls = [
        ("frame-dialog-window-only", "context.py", "WINDOW_ROLES = (2, 9, 16, 19, 22, 23, 69)", "WINDOW_ROLES = (16, 23, 69)",
         "test_file_chooser_is_a_window_that_takes_typed_text_and_keys", "The app's own dialog was not proposed as one of its windows"),
        ("frame-only-key-window", "keyboard.py", "        if parent[1] == ROOT and window is None and role in WINDOW_ROLES:\n",
         "        if False:\n", "test_file_chooser_is_a_window_that_takes_typed_text_and_keys",
         "The file chooser refused typed text: wrong-scope"),
    ]
    with tempfile.TemporaryDirectory(prefix="native-dialog-controls-") as directory:
        for name, module, old, new, test, failure in controls:
            payload = Path(directory) / name
            shutil.copytree(SOURCE, payload)
            source = (payload / module).read_text()
            if source.count(old) != 1:
                raise AssertionError("Dialog mutation anchor missing or ambiguous: " + name)
            (payload / module).write_text(source.replace(old, new))
            run = subprocess.run([sys.executable, str(Path(__file__).resolve()), "DialogTest." + test],
                                 env=dict(os.environ, A11Y_PAYLOAD=str(payload)), capture_output=True, text=True, timeout=120)
            output = run.stdout + run.stderr
            if run.returncode == 0 or failure not in output or test not in output:
                raise AssertionError("Dialog mutation did not produce named failure: " + name + "\n" + output)
            print("MUTATION " + name + ": named failure: " + failure, flush=True)


if __name__ == "__main__":
    if "--fixture" in sys.argv:
        fixture()
        sys.exit(0)
    if "--mutations" in sys.argv:
        mutation_controls()
        sys.exit(0)
    unittest.main(verbosity=2)
