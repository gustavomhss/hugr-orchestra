#!/usr/bin/env python3
"""Scan or drive one app in a running Linux workspace with the real native helper; diagnostic, not proof.

Runs inside the workspace container as `dock`, with the helper copied to /opt/orchestra/app-dock-accessibility
(the desktop app does that on first native use). The workspace session comes from `workspace.py native-session`,
so the binding sees exactly what the host would see:

    docker exec --user dock <container> python3 /tmp/app_probe.py scan mousepad
    docker exec --user dock <container> python3 /tmp/app_probe.py act mousepad --role "menu item" --name "Word Wrap"

`scan` binds every top-level window of the app's processes (matched by executable name), pages through the whole
tree like ui_find does (budget 500, maxText 0) and prints timings, item counts, a role histogram and an outline.
`keys` sends --keys to the top-level window named --name, as ui_keys does (needs an active window, so an attached
Xpra client). `type` replaces the text of the matched field through its editable-text interface, as ui_type does.
`act` finds the first (or --nth) item whose role and trimmed name match and invokes its single advertised action, as ui_act does.
"""

import argparse
from collections import Counter
import json
import os
from pathlib import Path
import subprocess
import sys
from time import monotonic

sys.path.insert(0, "/opt/orchestra/app-dock-accessibility")
from actions import invoke, press, replace_text
from bindings import BindingStore
from bus import AtspiBus, BusError
from context import RequestContext, process_identity
from refs import RefRegistry
from snapshot import read

# AT-SPI role numbers to readable names; the same table as packages/orchestra/src/plugin/app-dock-outline.ts.
ROLES = ("invalid", "accelerator label", "alert", "animation", "arrow", "calendar", "canvas", "check box",
         "check menu item", "color chooser", "column header", "combo box", "date editor", "desktop icon",
         "desktop frame", "dial", "dialog", "directory pane", "drawing area", "file chooser", "filler",
         "focus traversable", "font chooser", "frame", "glass pane", "html container", "icon", "image",
         "internal frame", "label", "layered pane", "list", "list item", "menu", "menu bar", "menu item",
         "option pane", "page tab", "page tab list", "panel", "password text", "popup menu", "progress bar",
         "push button", "radio button", "radio menu item", "root pane", "row header", "scroll bar", "scroll pane",
         "separator", "slider", "spin button", "split pane", "status bar", "table", "table cell",
         "table column header", "table row header", "tearoff menu item", "terminal", "text", "toggle button",
         "tool bar", "tool tip", "tree", "tree table", "unknown", "viewport", "window", "extended", "header",
         "footer", "paragraph", "ruler", "application", "autocomplete", "editbar", "embedded", "entry", "chart",
         "caption", "document frame", "heading", "page", "section", "redundant object", "form", "link",
         "input method window", "table row", "tree item", "document spreadsheet", "document presentation",
         "document text", "document web", "document email", "comment", "list box", "grouping", "image map",
         "notification", "info bar", "level bar", "title bar", "block quote", "audio", "video", "definition",
         "article", "landmark", "log", "marquee", "math", "rating", "timer", "static", "math fraction", "math root",
         "subscript", "superscript", "description list", "description term", "description value", "footnote",
         "content deletion", "content insertion", "mark", "suggestion", "push button menu")


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("command", choices=("scan", "act", "keys", "type"))
    parser.add_argument("process", help="executable name, e.g. mousepad, featherpad, thunar")
    parser.add_argument("--role")
    parser.add_argument("--name")
    parser.add_argument("--nth", type=int, default=1, help="act on the Nth match in tree order")
    parser.add_argument("--keys", help="keys: key chord sent to the window named --name, e.g. escape or ctrl+s")
    parser.add_argument("--text", help="type: text that replaces the matched field's content")
    parser.add_argument("--deadline-ms", type=int, default=10000)
    parser.add_argument("--outline", type=int, default=400, help="max outline lines printed by scan")
    args = parser.parse_args()
    session = json.loads(subprocess.check_output(["python3", "/opt/orchestra/workspace.py", "native-session"]))
    os.environ.update(session["environment"])
    bus = AtspiBus(os.environ["DBUS_SESSION_BUS_ADDRESS"], 1000)
    registry = RefRegistry("probe")
    try:
        started = monotonic()
        store, binding, roots = bind(bus, registry, session["sessionID"], args.process, args.deadline_ms)
        bound_ms = round((monotonic() - started) * 1000)
        wanted = (lambda item: (args.role is None or role(item) == args.role)
                  and (args.name is None or item["name"].strip() == args.name)) if args.command != "scan" else None
        if args.command == "keys":
            args.role, wanted = None, lambda item: item["parentRef"] is None and item["name"] == args.name
        pages = scan(bus, registry, binding, args.deadline_ms, store.cache, wanted, args.nth)
        items = [item for page in pages for item in page.pop("items", [])]
        if args.command == "keys":
            # Like ui_keys: the chord goes to a top-level window through the helper's keyboard path.
            print(json.dumps(mutate(bus, registry, binding, args, pages[-1].get("match"), store.cache,
                                    lambda context, match: press(context, match["ref"], args.keys))))
            return
        if args.command == "type":
            # Like ui_type: the field's own editable-text interface, verified by reading the value back.
            print(json.dumps(mutate(bus, registry, binding, args, pages[-1].get("match"), store.cache,
                                    lambda context, match: replace_text(context, match["ref"], args.text))))
            return
        if args.command == "act":
            print(json.dumps(act(bus, registry, binding, args, pages[-1].get("match"), store.cache), indent=1))
            return
        depth = {}
        for item in items:
            depth[item["ref"]] = depth.get(item["parentRef"], -1) + 1
        receipt = {
            "process": args.process, "bindMs": bound_ms, "roots": [{"name": root["name"], "role": root["role"]} for root in roots],
            "pages": len(pages), "items": len(items), "ms": sum(page["ms"] for page in pages),
            "wireCalls": sum(page["calls"] for page in pages), "maxPageMs": max(page["ms"] for page in pages),
            "errors": [page["error"] for page in pages if "error" in page],
            "reasons": sorted({reason for page in pages for reason in page.get("reasons", [])}),
            "actionable": sum(item["capabilities"]["action"]["supported"] for item in items),
            "typeable": sum(item["capabilities"]["type"]["supported"] for item in items),
            "keyboardTypeable": sum(item["capabilities"]["keyboardType"]["supported"] for item in items),
            "unnamedActionable": sum(item["capabilities"]["action"]["supported"] and not item["name"] for item in items),
            "roles": dict(Counter(role(item) for item in items).most_common()),
        }
        print(json.dumps(receipt, indent=1))
        for item in items[:args.outline]:
            flags = "".join(flag for flag, key in (("A", "action"), ("T", "type"), ("K", "keyboardType"))
                            if item["capabilities"][key]["supported"])
            states = [name for name, state in (("checked", 4), ("checkable", 41), ("focused", 12), ("selected", 23))
                      if state in item["states"]] + ([] if 24 in item["states"] else ["insensitive"])
            print(f"{'  ' * depth[item['ref']]}{role(item)} {json.dumps(item['name'])} {flags} {' '.join(states)}".rstrip())
    finally:
        bus.close()


def bind(bus, registry, session_id, process, deadline_ms):
    pids = [int(pid) for pid in subprocess.run(["pgrep", "-x", process], capture_output=True, text=True).stdout.split()]
    if not pids:
        raise SystemExit(f"no running process named {process}")
    target = {"scopeKind": "workspace", "appID": "workspace", "launchEpoch": session_id, "ownershipRevision": 1,
              "runtime": {"runtimeID": "probe", "runtimeEpoch": "probe", "accessibilitySessionID": session_id},
              "processIdentities": [process_identity(pid) for pid in pids]}
    store = BindingStore(bus, registry, session_id)
    proposal = store.discover({"phase": "discover", "target": target,
                               "identity": {"senderID": 1, "tabID": "probe", "generation": 1, "profileID": "probe"}},
                              deadline_ms, lambda: False)
    if not proposal["roots"]:
        raise SystemExit(f"{process} has no window on the AT-SPI desktop")
    confirmed = store.confirm({"phase": "confirm", "proposalID": proposal["proposalID"], "ownershipRevision": 1,
                               "roots": [{"owner": root["owner"], "path": root["path"]} for root in proposal["roots"]]},
                              deadline_ms, lambda: False)
    return store, store.bindings[confirmed["bindingID"]], proposal["roots"]


def scan(bus, registry, binding, deadline_ms, cache, wanted=None, nth=1):
    # Refs stay valid only until the next page starts, so an action stops on the page holding its target.
    pages, cursor, skip = [], None, [nth - 1]
    while len(pages) < 48:
        context = RequestContext(bus, registry, binding, deadline_ms, None, cache)
        calls, started = bus.trace_total, monotonic()
        page = {}
        try:
            value = read(context, {"cursor": cursor} if cursor else {"budget": 500, "maxText": 0})
            page.update(items=value["items"], reasons=value["coverage"]["reasons"])
            matches = [item for item in value["items"] if wanted and wanted(item)]
            page["match"] = matches[skip[0]] if len(matches) > skip[0] else None
            skip[0] -= len(matches)
        except BusError as error:
            value, page["error"] = None, error.code
        page.update(ms=round((monotonic() - started) * 1000), calls=bus.trace_total - calls)
        pages.append(page)
        if not value or not value.get("hasMore") or page.get("match"):
            break
        cursor = value["cursor"]
    return pages


def mutate(bus, registry, binding, args, match, cache, run):
    if match is None:
        return {"error": "no-match", "role": args.role, "name": args.name}
    try:
        return {"target": {"role": role(match), "name": match["name"]},
                "result": run(RequestContext(bus, registry, binding, args.deadline_ms, None, cache), match)}
    except BusError as error:
        return {"target": {"role": role(match), "name": match["name"]}, "error": error.code}


def act(bus, registry, binding, args, match, cache):
    if match is None:
        return {"error": "no-match", "role": args.role, "name": args.name}
    context = RequestContext(bus, registry, binding, args.deadline_ms, None, cache)
    try:
        # Like ui_act: a lone action is implied (passed by ID, as the plugin does); otherwise prefer the
        # primary activation verb. Qt names it "Press", GTK "click"/"activate".
        actions = {action["name"]: action["id"] for action in match["actions"]}
        chosen = next(iter(actions.values()), None) if len(actions) == 1 else next(
            (actions[name] for name in actions if name.lower() in ("press", "click", "activate", "toggle")), None)
        return {"target": {"role": role(match), "name": match["name"], "actions": sorted(actions)},
                "result": invoke(context, match["ref"], chosen)}
    except BusError as error:
        return {"target": {"role": role(match), "name": match["name"], "actions": [a["name"] for a in match["actions"]]},
                "error": error.code}


def role(item):
    return ROLES[item["role"]] if 0 <= item["role"] < len(ROLES) else item["roleName"]


if __name__ == "__main__":
    main()
