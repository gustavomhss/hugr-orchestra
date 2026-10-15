"""Evaluate compiled workflows through the one Relay gate and publish progress as host events."""
from __future__ import annotations

import copy
import importlib.util
import json
import queue
import threading
import time
import urllib.error
import urllib.request
import uuid

from .config import AuthoringError
from .graph import START_TYPE, compile_document
from .hooks import is_hook
from .store import now

HOST = "host"


class Events:
    def __init__(self):
        self.lock, self.channels = threading.RLock(), {}

    def subscribe(self, key):
        channel = queue.Queue(maxsize=256)
        with self.lock:
            self.channels.setdefault(key, []).append(channel)
        return channel

    def unsubscribe(self, key, channel):
        with self.lock:
            if channel in self.channels.get(key, []):
                self.channels[key].remove(channel)
            if not self.channels.get(key):
                self.channels.pop(key, None)

    def emit(self, key, message):
        with self.lock:
            for channel in list(self.channels.get(key, [])):
                try:
                    channel.put_nowait(message)
                except queue.Full:
                    # Closing the lagging stream makes loss explicit, not an unbounded buffer.
                    self.unsubscribe(key, channel)
                    while not channel.empty():
                        channel.get_nowait()
                    channel.put_nowait(None)


class GateClient:
    """The Relay daemon in-process on a private loopback port, or an explicitly configured daemon URL."""
    def __init__(self, config):
        self.server = None
        self.url = config.relay_url
        if self.url is None:
            path = config.relay_root / "bin/relay-daemon.py"
            if not path.is_file():
                raise AuthoringError("Relay daemon source is unavailable", 503, "relay-unavailable")
            spec = importlib.util.spec_from_file_location("relay_authoring_daemon", path)
            daemon = importlib.util.module_from_spec(spec); spec.loader.exec_module(daemon)
            self.server = daemon.make_server("127.0.0.1", 0)
            self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
            self.thread.start()
            self.url = f"http://127.0.0.1:{self.server.server_port}"
        self.url = self.url.rstrip("/")

    def evaluate(self, sprint, workdir, state_dir):
        request = urllib.request.Request(self.url + "/gate/eval", data=json.dumps({"sprint": sprint, "workdir": str(workdir), "state_dir": str(state_dir)}, ensure_ascii=False).encode(), headers={"Content-Type": "application/json"}, method="POST")
        try:
            response = urllib.request.urlopen(request)  # Relay core has no command timeout.
        except urllib.error.HTTPError as error:
            response = error
        with response:
            status, body = response.status, json.load(response)
        expected = {"advance": 200, "complete": 200, "gate-fail": 409, "escalate": 423}
        if not isinstance(body, dict) or (body.get("outcome") in expected and expected[body["outcome"]] != status):
            raise AuthoringError("Relay returned an inconsistent gate response", 502, "relay-protocol")
        if status == 200 and body.get("outcome") not in ("advance", "complete"):
            raise AuthoringError("Relay returned success without a gate outcome", 502, "relay-protocol")
        return status, body

    def close(self):
        if self.server:
            self.server.shutdown(); self.server.server_close(); self.thread.join(timeout=5)


class Runner:
    def __init__(self, config, store, skills, gate=None):
        self.config, self.store, self.skills = config, store, skills
        self._owns_gate = gate is None
        self.gate = gate or GateClient(config)
        self.events, self.lock, self.active = Events(), threading.RLock(), {}
        # A process restart cannot silently resume or report an abandoned evaluation as successful.
        for execution in store.executions():
            if execution["status"] == "running":
                execution.update(status="crashed", finished=True, stoppedAt=now())
                execution["data"]["resultData"]["error"] = {"name": "RelayInterrupted", "message": "The service restarted during evaluation. Inspect the ledger before retrying."}
                store.put_execution(execution)

    def emit(self, message):
        self.events.emit(HOST, {**message, "workspaceId": self.config.workspace_id})

    def start(self, document, destination=None, retry_of=None):
        with self.lock:
            if is_hook(document):
                raise AuthoringError("The hook is saved as configuration. Installing its events and actions belongs to the Orchestra binding.", 409, "host-binding-required")
            previous = self.store.execution(retry_of) if retry_of else None
            if not previous and document.get("isArchived"):
                raise AuthoringError("Restore the archived workflow before running it", 409, "document-archived")
            if previous:
                if previous["status"] != "error" or previous["workflowId"] != document["id"]:
                    raise AuthoringError("This execution cannot be retried", 409, "retry-unavailable")
                lineage = [e for e in self.store.executions(previous["workflowId"]) if e["relay"]["runId"] == previous["relay"]["runId"]]
                if any(e["relay"].get("outcome") == "escalate" for e in lineage):
                    raise AuthoringError("Relay escalated. Release belongs to the host; a retry does not reset the budget.", 409, "intervention-required")
                if lineage[0]["id"] != previous["id"]:
                    raise AuthoringError("A later attempt replaced this one. Inspect the run's latest execution.", 409, "retry-unavailable")
                document = previous["workflowData"]
                sprint, bindings = previous["relay"]["sprint"], previous["relay"]["skills"]
                run_id = previous["relay"]["runId"]
                previous_destination = previous["relay"].get("destination")
                if destination is not None and destination != previous_destination:
                    raise AuthoringError("A retry keeps the original destination. Start another run to change the scope.", 409, "snapshot-required")
                destination = previous_destination
            else:
                sprint, bindings = compile_document(document, self.skills.resolve)
                run_id = str(uuid.uuid4())
            if any(w.get("kind") == "human" for w in sprint["work_packages"]):
                raise AuthoringError("The CLI driver does not implement human approval. This profile can be edited, but another driver must run it.")
            if destination is not None and destination not in {n["name"] for n in document["nodes"]}:
                raise AuthoringError("Destination step not found")
            if any(n["name"] == destination and n["type"] == START_TYPE for n in document["nodes"]):
                raise AuthoringError("The start holds configuration, not a WP. Run the workflow or choose a step.")
            if run_id in self.active:
                raise AuthoringError("This run is already evaluating a step", 409, "run-busy")
            retained = {} if not previous else copy.deepcopy(previous["data"]["resultData"].get("runData", {}))
            retained = {name: values for name, values in retained.items() if values and values[-1].get("status") == "success"}
            execution = {"id": str(uuid.uuid4()), "workflowId": document["id"], "workflowData": copy.deepcopy(document), "status": "running", "finished": False,
                         "createdAt": now(), "startedAt": now(), "stoppedAt": None, "retryOf": retry_of, "executedNode": destination,
                         "relay": {"runId": run_id, "sprint": sprint, "skills": bindings, "actor": self.config.principal.id, "workspaceId": self.config.workspace_id, "scope": "gate-evaluation", "destination": destination},
                         "data": {"resultData": {"runData": retained}}}
            self.store.put_execution(execution)
            thread = threading.Thread(target=self._run, args=(execution, destination), daemon=True)
            self.active[run_id] = thread
            thread.start()
            return execution

    def _run(self, execution, destination):
        run_id, sprint = execution["relay"]["runId"], execution["relay"]["sprint"]
        state = self.config.data_dir / "runs" / self.config.workspace_id / run_id
        names = {node["id"]: node["name"] for node in execution["workflowData"]["nodes"]}
        output = execution["data"]["resultData"]["runData"]
        ids = {"executionId": execution["id"], "documentId": execution["workflowId"]}
        try:
            state.mkdir(parents=True, exist_ok=True)
            sprint_path = state / "sprint.json"
            if not sprint_path.exists():
                sprint_path.write_text(json.dumps(sprint, ensure_ascii=False, indent=2), encoding="utf-8")
            elif json.loads(sprint_path.read_text()) != sprint:
                raise AuthoringError("Retained sprint changed; refusing to resume", 409, "snapshot-changed")
            counter = int((state / "counter").read_text()) if (state / "counter").exists() else 0
            destination_index = next((i for i, w in enumerate(sprint["work_packages"]) if names[w["id"]] == destination), len(sprint["work_packages"])-1)
            if not 0 <= counter <= destination_index:
                raise AuthoringError("The destination was already evaluated or the cursor is invalid", 409, "invalid-position")
            self.emit({"type": "execution.started", **ids, "startedAt": execution["startedAt"]})
            for index in range(counter, destination_index+1):
                wp = sprint["work_packages"][index]; name = names[wp["id"]]; started = time.time()
                step = {"startTime": int(started*1000), "executionTime": 0, "index": index,
                        "previousNode": names[sprint["work_packages"][index-1]["id"]] if index else None, "status": "running"}
                self.emit({"type": "node.started", **ids, "node": name, "index": index})
                status, outcome = self.gate.evaluate(sprint, self.config.workspace, state)
                if type(status) is not int or not isinstance(outcome, dict):
                    raise AuthoringError("Relay returned an invalid response", 502, "relay-protocol")
                if status in (200, 409, 423) and (type(outcome.get("i")) is not int or outcome.get("wp") != wp["id"] or outcome.get("i") != index):
                    raise AuthoringError("Relay answered for another step. Inspect state and ledger.", 502, "relay-position-mismatch")
                if status == 200 and outcome.get("outcome") != ("complete" if index == len(sprint["work_packages"])-1 else "advance"):
                    raise AuthoringError("Relay returned a transition that does not match the sprint", 502, "relay-transition-mismatch")
                if status == 200 and index+1 < len(sprint["work_packages"]) and outcome.get("next") != sprint["work_packages"][index+1]["id"]:
                    raise AuthoringError("Relay returned a next WP that does not match the sprint", 502, "relay-transition-mismatch")
                success = status == 200 and outcome.get("outcome") in ("advance", "complete")
                step.update(executionTime=int((time.time()-started)*1000), status="success" if success else "error",
                            output={"instructions": wp.get("instructions", ""), "httpStatus": status, "relay": outcome})
                execution["relay"].update(outcome=outcome.get("outcome", "error"), httpStatus=status, stateDir=str(state), ledger=str(state / "ledger.jsonl"))
                if not success:
                    step["error"] = {"name": "RelayGateError", "message": f"Relay: {outcome.get('outcome', 'gate error')}", "description": json.dumps(outcome, ensure_ascii=False)}
                    execution["data"]["resultData"]["error"] = step["error"]
                output[name] = [step]; execution["data"]["resultData"]["lastNodeExecuted"] = name
                self.store.put_execution(execution)
                self.emit({"type": "node.finished", **ids, "node": name, "index": index, "status": step["status"], "step": step})
                if not success:
                    execution["status"] = "error"; break
            if execution["status"] == "running":
                execution["status"] = "success"
        except Exception as error:
            execution["status"] = "error"
            execution["data"]["resultData"]["error"] = {"name": "RelayAuthoringError", "message": str(error)}
        finally:
            execution.update(finished=True, stoppedAt=now())
            with self.lock:
                self.store.put_execution(execution)
                self.active.pop(run_id, None)
            self.emit({"type": "execution.finished", **ids, "status": execution["status"]})

    def close(self):
        with self.lock:
            threads = list(self.active.values())
        for thread in threads:
            thread.join()
        if self._owns_gate:
            self.gate.close()
