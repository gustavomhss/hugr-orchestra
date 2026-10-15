"""Authoring application services, injectable independently of the HTTP host."""
from __future__ import annotations

import copy
import json
import subprocess

from . import __version__, graph, hooks
from .config import AuthoringError
from .graph import compile_document, loads, project_sprint, validate_document
from .hooks import compile_hook, is_hook
from .runs import Runner
from .skills import Skills
from .store import DEFAULT_NAME, Store, document_checksum


class AuthoringApplication:
    def __init__(self, config, *, store=None, gate=None, skills=None):
        self.config = config
        self._owns_store = store is None
        if store is not None and store.workspace_id != config.workspace_id:
            raise AuthoringError("Store belongs to another workspace", 409, "workspace-mismatch")
        self.store = store or Store(config.data_dir, config.workspace_id)
        self.skills = skills or Skills(config.workspace, config.data_dir / config.workspace_id, config.skill_roots)
        self.skills.refresh()
        self.runner = Runner(config, self.store, self.skills, gate)

    def seed_profiles(self):
        directory = self.config.relay_root / "profiles"
        if not directory.is_dir():
            raise AuthoringError("The installed Relay profile directory is unavailable", 503, "profiles-unavailable")
        profiles = sorted(directory.glob("*.sprint.json"))
        if not profiles:
            raise AuthoringError("The installed Relay profile catalog is empty", 503, "profiles-unavailable")
        for path in profiles:
            name = path.name.removesuffix(".sprint.json")
            self.store.seed("relay-" + name, project_sprint("Relay · " + name, loads(path.read_text(encoding="utf-8"))))

    def capabilities(self):
        return {"protocolVersion": 1, "serviceVersion": __version__,
                "workspace": {"id": self.config.workspace_id, "name": self.config.workspace.name, "directory": str(self.config.workspace)},
                "driver": "cli", "features": {"documents": True, "scopes": True, "skills": True, "skillUpload": True, "hookAuthoring": True, "hookExecution": False,
                "publishDefinition": True, "evaluate": True, "retryFrozenExecution": True, "audit": True,
                "cancelEvaluation": False, "dispatchAgent": False, "armRelease": False, "orchestraBinding": False},
                "authenticationBoundary": "host-owned; standalone service is trusted loopback"}

    def node_types(self):
        return {"workflow": graph.node_types(), "hook": hooks.node_types()}

    def view(self, document):
        """A stored document plus its checksum, published version and expanded scopes. Unsupported stored shapes are refused."""
        result = copy.deepcopy(document)
        validate_document(result)
        result["checksum"] = document_checksum(document)
        result["activeVersion"] = self.store.version(document["id"], document["activeVersionId"]) if document.get("activeVersionId") else None
        available = {s["id"]: s for s in self.store.scopes()}
        result["tags"] = [available[t.get("id") if isinstance(t, dict) else t] for t in result.get("tags", []) if (t.get("id") if isinstance(t, dict) else t) in available]
        return result

    def document(self, identifier):
        return self.view(self.store.get(identifier))

    def documents(self):
        return [self.view(document) for document in self.store.documents()]

    def save(self, payload, identifier=None, *, force=False):
        before = self.store.get(identifier) if identifier else {}
        candidate = {**copy.deepcopy(before), **payload}
        candidate.setdefault("name", DEFAULT_NAME)
        candidate.setdefault("nodes", []); candidate.setdefault("connections", {})
        candidate.setdefault("meta", {})
        # Only publish/unpublish changes definition availability, never a draft save.
        candidate["active"] = before.get("active", False)
        candidate["activeVersionId"] = before.get("activeVersionId")
        validate_document(candidate)
        candidate["meta"].setdefault("relay", {"schema": 1, "kind": "workflow"})
        candidate["meta"]["relay"]["kind"] = "hook" if is_hook(candidate) else "workflow"
        try:
            if is_hook(candidate):
                compile_hook(candidate)
            else:
                sprint, _ = compile_document(candidate, self.skills.resolve)
                retained = candidate["meta"]["relay"].setdefault("sprint", {"work_packages": [], "macros": []})
                retained.update(brief=sprint["brief"], retry_budget=sprint["retry_budget"])
                titles = {wp["id"]: wp["title"] for wp in sprint["work_packages"]}
                for wp in retained.get("work_packages", []):
                    if wp["id"] in titles:
                        wp["title"] = titles[wp["id"]]
                candidate["meta"]["relay"]["names"] = {n["id"]: n["name"] for n in candidate["nodes"]}
                for node in candidate["nodes"]:
                    if "title" in node.get("parameters", {}) and node["id"] in titles:
                        node["parameters"]["title"] = titles[node["id"]]
            candidate["meta"]["relay"]["diagnostics"] = []
        except AuthoringError as error:
            # Incomplete drafts persist with their diagnostics; publish and evaluate still refuse them.
            candidate["meta"]["relay"]["diagnostics"] = [str(error)]
        result = self.store.save(candidate, identifier, payload.get("versionId") if identifier and not force else None,
                                 expected_checksum=payload.get("expectedChecksum") if identifier and not force else None)
        self.runner.emit({"type": "document.saved", "documentId": result["id"], "versionId": result["versionId"]})
        return self.view(result)

    def publish(self, identifier, version, expected_checksum=None):
        document = self.store.get(identifier)
        compile_hook(document) if is_hook(document) else compile_document(document, self.skills.resolve)
        return self.view(self.store.publish(identifier, version or document["versionId"], expected_checksum))

    def unpublish(self, identifier, expected_checksum=None):
        return self.view(self.store.unpublish(identifier, expected_checksum))

    def export(self, identifier):
        document = self.store.get(identifier)
        if is_hook(document):
            return {"kind": "hook", "definition": compile_hook(document)}
        return {"kind": "workflow", "definition": compile_document(document, self.skills.resolve)[0]}

    def sprint(self, identifier):
        sprint, bindings = compile_document(self.store.get(identifier), self.skills.resolve)
        return {"sprint": sprint, "skillBindings": [{k: v for k, v in b.items() if k != "content"} for b in bindings]}

    def start(self, document_id, destination=None):
        return self.runner.start(self.store.get(document_id), destination)

    def retry(self, execution_id):
        return self.runner.start(self.store.execution(execution_id)["workflowData"], retry_of=execution_id)

    def audit(self, identifier):
        execution = self.store.execution(identifier)
        state = self.config.data_dir / "runs" / self.config.workspace_id / execution["relay"]["runId"]
        if not (state / "ledger.jsonl").exists():
            raise AuthoringError("This execution has no ledger yet", 409, "ledger-unavailable")
        process = subprocess.run(["python3", str(self.config.relay_root / "bin/relay"), "verify", str(state / "ledger.jsonl"), "--sprint", str(state / "sprint.json"), "--json"], capture_output=True, text=True)
        try:
            report = json.loads(process.stdout)
        except ValueError as error:
            raise AuthoringError("Relay audit returned no usable report: " + process.stderr, 502, "audit-error") from error
        return {"exitCode": process.returncode, "report": report}

    def close(self):
        self.runner.close()
        if self._owns_store:
            self.store.close()
