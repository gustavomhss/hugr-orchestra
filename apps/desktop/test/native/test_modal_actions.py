"""Acting on GTK controls that open a modal dialog, on a private D-Bus/Xvfb with real GTK 3 and the real registry.

    xvfb-run -a dbus-run-session -- python3 -B test_modal_actions.py
    ... test_modal_actions.py --mutations   # each fix reverted must fail a named assertion

at-spi2-atk runs DoAction's handler inside its D-Bus dispatch. A handler that runs gtk_dialog_run (Thunar
"Create Folder...", Mousepad "Go to...") nests a main loop there, so the app stops answering AT-SPI until the dialog
closes, and in the workspace the first key event then deadlocked it for good. The fixture's menu item and button run
such a dialog; receipts travel over the fixture's stdout, never through AT-SPI.
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

import actions
from bindings import BindingStore
from bus import AtspiBus, BusError
from context import A, ROOT, RequestContext, process_identity, states
from refs import RefRegistry
from snapshot import read


def fixture(title):
    import gi
    gi.require_version("Gtk", "3.0")
    from gi.repository import GLib, Gtk

    window = Gtk.Window(title=title)
    box = Gtk.Box(orientation=Gtk.Orientation.VERTICAL)
    bar, search, menu = Gtk.MenuBar(), Gtk.MenuItem(label="Search"), Gtk.Menu()
    item = Gtk.MenuItem(label="Go to...")

    def answer(value):
        print(json.dumps(value), flush=True)

    def run_dialog(*_):
        dialog = Gtk.Dialog(title="Go to line", transient_for=window, modal=True)
        dialog.add_button("_Jump", Gtk.ResponseType.OK)
        answer({"dialog": "running"})
        dialog.run()  # The nested main loop that deafened apps when started inside DoAction.
        dialog.destroy()
        answer({"dialog": "closed"})

    item.connect("activate", run_dialog)
    menu.append(item)
    search.set_submenu(menu)
    bar.append(search)
    button = Gtk.Button(label="Open modal")
    button.connect("clicked", run_dialog)
    box.pack_start(bar, False, False, 0)
    box.pack_start(button, False, False, 0)
    window.add(box)
    window.set_default_size(400, 300)
    window.connect("destroy", Gtk.main_quit)
    window.show_all()
    GLib.timeout_add(200, lambda: answer({"pid": os.getpid()}) and False)
    Gtk.main()


class App:
    def __init__(self, title):
        self.title = title
        self.process = subprocess.Popen([sys.executable, str(Path(__file__).resolve()), "--fixture", title], stdout=subprocess.PIPE,
                                        text=True, env=dict(os.environ, GTK_MODULES="atk-bridge", NO_AT_BRIDGE="0"))
        self.selector = selectors.DefaultSelector()
        self.selector.register(self.process.stdout, selectors.EVENT_READ)
        self.pid = self.receive()["pid"]

    def receive(self, seconds=10):
        if not self.selector.select(seconds):
            return None
        line = self.process.stdout.readline()
        return json.loads(line) if line else None

    def close(self):
        self.process.kill()
        self.process.wait(timeout=5)
        self.process.stdout.close()
        self.selector.close()


class ModalActionTest(unittest.TestCase):
    def setUp(self):
        self.bus = AtspiBus(os.environ["DBUS_SESSION_BUS_ADDRESS"], 1000)
        self.session = self.bus.connection.get_guid()
        self.apps = []
        self.addCleanup(self.cleanup)

    def cleanup(self):
        for app in self.apps:
            app.close()
        self.bus.close()

    def launch(self, title):
        app = App(title)
        self.apps.append(app)
        return app

    def bind(self, apps, workspace=False):
        target = {"runtime": {"runtimeID": "private", "runtimeEpoch": "test", "accessibilitySessionID": self.session},
                  "appID": "workspace" if workspace else "modal.gtk", "launchEpoch": self.session if workspace else "test",
                  "ownershipRevision": 1, "processIdentities": [process_identity(app.pid) for app in apps],
                  **({"scopeKind": "workspace"} if workspace else {})}
        store = BindingStore(self.bus, RefRegistry("modal-helper"), self.session)
        proposal = store.discover({"phase": "discover", "target": target,
                                   "identity": {"senderID": 1, "tabID": "modal", "generation": 1, "profileID": "test"}}, 8000, lambda: False)
        confirmed = store.confirm({"phase": "confirm", "proposalID": proposal["proposalID"], "ownershipRevision": 1,
                                   "roots": [{"owner": root["owner"], "path": root["path"]} for root in proposal["roots"]]}, 8000, lambda: False)
        return store, store.get(confirmed["bindingID"], confirmed["bindingEpoch"]), proposal

    def find(self, store, binding, role, name):
        """A fresh page and the ref of the control with role and name (refs are consumed by every action)."""
        page = read(RequestContext(self.bus, store.registry, binding, 8000, None, store.cache), {"budget": 200, "maxText": 0})
        matches = [item for item in page["items"] if item["role"] == role and item["name"] == name]
        self.assertEqual(1, len(matches), f"Fixture control {name!r} not found exactly once")
        return matches[0]

    def act(self, store, binding, role, name):
        return actions.invoke(RequestContext(self.bus, store.registry, binding, 8000, None, store.cache),
                              self.find(store, binding, role, name)["ref"])

    def activate(self, app):
        # Bare Xvfb has no window manager; the workspace's Xpra client focuses windows the same way.
        subprocess.run(["xdotool", "search", "--sync", "--name", "^" + app.title + "$", "windowfocus", "--sync"],
                       check=True, capture_output=True, timeout=10)

    def wait_state(self, owner, path, state, present=True):
        deadline = monotonic() + 5
        while (state in states(self.bus.call(owner, path, A + "Accessible", "GetState", "()", (), "(au)")[0])) != present:
            if monotonic() > deadline:
                raise AssertionError(f"State {state} never became {present}")
            sleep(0.05)

    def answers(self, owner):
        try:
            self.bus.call(owner, ROOT, A + "Accessible", "GetRole", "()", (), "(u)", 1500)
            return True
        except BusError:
            return False

    def test_menu_item_opening_a_modal_dialog_keeps_the_app_answering(self):
        app = self.launch("Modal fixture")
        self.activate(app)
        store, binding, proposal = self.bind([app])
        frame = proposal["roots"][0]
        self.wait_state(frame["owner"], frame["path"], 1)
        try:
            self.act(store, binding, 33, "Search")  # Opening a menu runs no nested loop, whichever way it is opened.
            item = None
            deadline = monotonic() + 5
            while item is None or 25 not in item["states"]:
                if monotonic() > deadline:
                    raise AssertionError("The menu never showed its item")
                item = self.find(store, binding, 35, "Go to...")
            result = actions.invoke(RequestContext(self.bus, store.registry, binding, 8000, None, store.cache), item["ref"])
        except BusError as error:
            raise AssertionError("The app stopped answering AT-SPI after the action opened its modal dialog: " + error.code) from error
        self.assertEqual({"dialog": "running"}, app.receive(), "The menu item never ran its dialog")
        self.assertEqual(("pointer", "acknowledged", "target", "unverified"),
                         (result["via"], result["dispatch"], result["hit"], result["postcondition"]))
        self.assertTrue(self.answers(frame["owner"]), "The app stopped answering AT-SPI after the action opened its modal dialog")
        # The dialog is itself a window of the app, so the next look shows it.
        _, _, proposal = self.bind([app])
        self.assertIn("Go to line", [root["name"] for root in proposal["roots"]])

    def test_item_of_a_closed_menu_is_refused_before_any_dispatch(self):
        app = self.launch("Modal fixture")
        self.activate(app)
        store, binding, _ = self.bind([app])
        error = None
        try:
            self.act(store, binding, 35, "Go to...")
        except BusError as caught:
            error = caught
        self.assertEqual("menu-closed", getattr(error, "code", None), "An item of a closed GTK menu was activated")
        self.assertIsNone(app.receive(1), "A refused menu item still ran its dialog")
        self.assertFalse(hasattr(error, "result"), "A refusal before dispatch carried dispatch evidence")

    def test_action_that_leaves_the_app_deaf_is_reported(self):
        # Another app holds the active window: a click cannot stand in, so the advertised action runs and the app goes deaf.
        app, other = self.launch("Modal fixture"), self.launch("Other fixture")
        self.activate(other)
        store, binding, proposal = self.bind([app])
        frame = proposal["roots"][0]
        self.wait_state(frame["owner"], frame["path"], 1, present=False)
        error = None
        try:
            self.act(store, binding, 43, "Open modal")
        except BusError as caught:
            error = caught
        self.assertEqual({"dialog": "running"}, app.receive(), "The button never ran its dialog")
        self.assertEqual("app-not-responding", getattr(error, "code", None),
                         "A deaf app after an action was reported as a plain acknowledgement")
        self.assertEqual(("action", "acknowledged", "focus-unconfirmed", "unverified"),
                         tuple(error.result.get(key) for key in ("via", "dispatch", "clickRefused", "postcondition")))
        self.assertFalse(self.answers(proposal["roots"][0]["owner"]), "Fixture premise: the app answers inside DoAction")

    def test_workspace_binding_leaves_out_an_app_that_stopped_answering(self):
        deaf, live = self.launch("Deaf fixture"), self.launch("Live fixture")
        store, binding, _ = self.bind([deaf], workspace=True)
        owner = binding["roots"][0]["owner"]
        button = self.find(store, binding, 43, "Open modal")
        record = store.registry.resolve(button["ref"], RequestContext(self.bus, store.registry, binding, 8000))
        self.bus.call(owner, record["path"], A + "Action", "DoAction", "(i)", (0,), "(b)")
        self.assertEqual({"dialog": "running"}, deaf.receive(), "Fixture premise: the button runs its dialog")
        started = monotonic()
        try:
            store, binding, proposal = self.bind([deaf, live], workspace=True)
        except BusError as error:
            raise AssertionError("One unresponsive app failed the whole workspace binding: " + error.code) from error
        self.assertLess(monotonic() - started, 5)
        self.assertEqual(["Live fixture"], [root["name"] for root in proposal["roots"]])
        page = read(RequestContext(self.bus, store.registry, binding, 8000, None, store.cache), {"budget": 50, "maxText": 0})
        self.assertIn("app-not-responding:python3", page["coverage"]["reasons"], "The read does not name the app that is not responding")
        self.assertFalse(page["coverage"]["complete"])
        error = None
        try:
            self.bind([deaf], workspace=True)
        except BusError as caught:
            error = caught
        self.assertEqual(("app-not-responding", "Not responding: python3"), (getattr(error, "code", None), getattr(error, "message", None)))


def mutation_controls():
    """Revert each fix on a copy of the payload; the suite must fail with a named assertion."""
    deaf = "The app stopped answering AT-SPI after the action opened its modal dialog"
    controls = [
        ("no-click", "actions.py", '    if action["name"] != "click":\n        return None', "    return None",
         "test_menu_item_opening_a_modal_dialog_keeps_the_app_answering", deaf),
        ("frame-hit-test", "keyboard.py", "in (33, 41) else window", "in () else window",
         "test_menu_item_opening_a_modal_dialog_keeps_the_app_answering", deaf),
        ("closed-menu", "actions.py", "    if record[\"role\"] in (8, 35, 45) and 25 not in live:", "    if False:",
         "test_item_of_a_closed_menu_is_refused_before_any_dispatch", "An item of a closed GTK menu was activated"),
        ("no-liveness", "actions.py", '        _responding(context, record["owner"])\n', "",
         "test_action_that_leaves_the_app_deaf_is_reported", "A deaf app after an action was reported as a plain acknowledgement"),
        ("whole-binding", "bindings.py", '                if error.code != "timeout":\n                    raise', "                raise",
         "test_workspace_binding_leaves_out_an_app_that_stopped_answering", "One unresponsive app failed the whole workspace binding"),
        ("silent-read", "snapshot.py", '        _reason(result, "app-not-responding:" + name)', "        pass",
         "test_workspace_binding_leaves_out_an_app_that_stopped_answering", "The read does not name the app that is not responding"),
    ]
    with tempfile.TemporaryDirectory(prefix="native-modal-controls-") as directory:
        for name, module, old, new, test, failure in controls:
            payload = Path(directory) / name
            shutil.copytree(SOURCE, payload)
            source = (payload / module).read_text()
            if source.count(old) != 1:
                raise AssertionError("Modal mutation anchor missing or ambiguous: " + name)
            (payload / module).write_text(source.replace(old, new))
            run = subprocess.run([sys.executable, str(Path(__file__).resolve()), "ModalActionTest." + test],
                                 env=dict(os.environ, A11Y_PAYLOAD=str(payload)), capture_output=True, text=True, timeout=180)
            output = run.stdout + run.stderr
            if run.returncode == 0 or failure not in output or test not in output:
                raise AssertionError("Modal mutation did not produce named failure: " + name + "\n" + output)
            print("MUTATION " + name + ": named failure: " + failure, flush=True)


if __name__ == "__main__":
    if "--fixture" in sys.argv:
        fixture(sys.argv[sys.argv.index("--fixture") + 1])
        sys.exit(0)
    if "--mutations" in sys.argv:
        mutation_controls()
        sys.exit(0)
    unittest.main(verbosity=2)
