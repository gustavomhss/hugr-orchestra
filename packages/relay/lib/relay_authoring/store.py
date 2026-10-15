"""Persistent authoring documents and execution receipts, scoped to one host workspace."""
from __future__ import annotations

import copy
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import sqlite3
import threading
import uuid

from .config import AuthoringError

DOCUMENT_FIELDS = ("name", "description", "nodes", "connections", "tags", "meta", "isArchived", "active", "activeVersionId", "nodeGroups")
DEFAULT_NAME = "New Relay workflow"


def now():
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def document_checksum(document):
    return hashlib.sha256(json.dumps(document, sort_keys=True, ensure_ascii=False, allow_nan=False).encode()).hexdigest()


def check_checksum(document, expected):
    if expected is not None and expected != document_checksum(document):
        raise AuthoringError("The workflow changed. Reload it before saving.", 409, "version-conflict")


class Store:
    def __init__(self, data_dir: Path, workspace_id: str):
        self.data_dir, self.workspace_id = Path(data_dir), workspace_id
        self.data_dir.mkdir(parents=True, exist_ok=True)
        self.lock = threading.RLock()
        self.db = sqlite3.connect(self.data_dir / "authoring.sqlite3", check_same_thread=False)
        self.db.execute("PRAGMA journal_mode=WAL")
        self.db.execute("PRAGMA foreign_keys=ON")
        self.db.executescript("""
            CREATE TABLE IF NOT EXISTS documents(workspace TEXT, id TEXT, body TEXT NOT NULL, PRIMARY KEY(workspace,id));
            CREATE TABLE IF NOT EXISTS versions(workspace TEXT, document_id TEXT, id TEXT, body TEXT NOT NULL, PRIMARY KEY(workspace,id));
            CREATE TABLE IF NOT EXISTS scopes(workspace TEXT, id TEXT, body TEXT NOT NULL, PRIMARY KEY(workspace,id));
            CREATE TABLE IF NOT EXISTS executions(workspace TEXT, id TEXT, body TEXT NOT NULL, PRIMARY KEY(workspace,id));
        """)

    def close(self):
        with self.lock:
            self.db.close()

    def _get(self, table, identifier):
        row = self.db.execute(f"SELECT body FROM {table} WHERE workspace=? AND id=?", (self.workspace_id, identifier)).fetchone()
        if row is None:
            raise AuthoringError("Resource not found", 404, "not-found")
        return json.loads(row[0])

    def _put(self, table, identifier, body):
        self.db.execute(f"INSERT INTO {table}(workspace,id,body) VALUES(?,?,?) ON CONFLICT(workspace,id) DO UPDATE SET body=excluded.body",
                        (self.workspace_id, identifier, json.dumps(body, ensure_ascii=False, allow_nan=False)))

    def documents(self):
        with self.lock:
            return [json.loads(row[0]) for row in self.db.execute("SELECT body FROM documents WHERE workspace=? ORDER BY rowid DESC", (self.workspace_id,))]

    def get(self, identifier):
        with self.lock:
            return self._get("documents", identifier)

    def save(self, body, identifier=None, expected_version=None, *, create_id=None, expected_checksum=None):
        with self.lock, self.db:
            previous = self._get("documents", identifier) if identifier else None
            if previous is not None:
                check_checksum(previous, expected_checksum)
            if previous is not None and expected_version is not None and previous["versionId"] != expected_version:
                raise AuthoringError("The workflow changed. Reload it before saving.", 409, "version-conflict")
            document = copy.deepcopy(previous or {})
            for field in DOCUMENT_FIELDS:
                if field in body:
                    document[field] = copy.deepcopy(body[field])
            document.setdefault("name", DEFAULT_NAME)
            document.setdefault("nodes", [])
            document.setdefault("connections", {})
            document.setdefault("tags", [])
            document.setdefault("meta", {})
            document.setdefault("active", False)
            document.setdefault("activeVersionId", None)
            document.setdefault("isArchived", False)
            document["id"] = identifier or create_id or str(uuid.uuid4())
            document["createdAt"] = previous["createdAt"] if previous else now()
            document["updatedAt"] = now()
            document["versionId"] = str(uuid.uuid4())
            document["versionCounter"] = (previous or {}).get("versionCounter", 0) + 1
            self._put("documents", document["id"], document)
            version = {**document, "workflowId": document["id"]}
            self.db.execute("INSERT INTO versions(workspace,document_id,id,body) VALUES(?,?,?,?)", (self.workspace_id, document["id"], document["versionId"], json.dumps(version, ensure_ascii=False, allow_nan=False)))
            return document

    def seed(self, identifier, body):
        with self.lock, self.db:
            row = self.db.execute("SELECT 1 FROM documents WHERE workspace=? AND id=?", (self.workspace_id, identifier)).fetchone()
            if row:
                return
            self.save(body, create_id=identifier)

    def delete(self, identifier):
        with self.lock, self.db:
            self._get("documents", identifier)
            self.db.execute("DELETE FROM documents WHERE workspace=? AND id=?", (self.workspace_id, identifier))

    def versions(self, identifier):
        with self.lock:
            return [json.loads(r[0]) for r in self.db.execute("SELECT body FROM versions WHERE workspace=? AND document_id=? ORDER BY rowid DESC", (self.workspace_id, identifier))]

    def version(self, identifier, version):
        with self.lock:
            value = self._get("versions", version)
            if value["workflowId"] != identifier:
                raise AuthoringError("Version not found", 404, "not-found")
            return value

    def publish(self, identifier, expected_version, expected_checksum=None):
        with self.lock, self.db:
            document = self._get("documents", identifier)
            check_checksum(document, expected_checksum)
            if document["versionId"] != expected_version:
                raise AuthoringError("The version changed before publishing", 409, "version-conflict")
            document.update(active=True, activeVersionId=expected_version, updatedAt=now())
            self._put("documents", identifier, document)
            return document

    def unpublish(self, identifier, expected_checksum=None):
        with self.lock, self.db:
            document = self._get("documents", identifier)
            check_checksum(document, expected_checksum)
            document.update(active=False, activeVersionId=None, updatedAt=now())
            self._put("documents", identifier, document)
            return document

    def scopes(self):
        with self.lock:
            return [json.loads(r[0]) for r in self.db.execute("SELECT body FROM scopes WHERE workspace=? ORDER BY rowid", (self.workspace_id,))]

    def save_scope(self, body, identifier=None):
        name = body.get("name", "").strip()
        if not name:
            raise AuthoringError("A scope needs a name")
        with self.lock, self.db:
            existing = self._get("scopes", identifier) if identifier else None
            if any(s["name"].casefold() == name.casefold() and s["id"] != identifier for s in self.scopes()):
                raise AuthoringError("This scope already exists", 409, "duplicate-scope")
            scope = {"id": identifier or str(uuid.uuid4()), "name": name, "description": body.get("description", ""), "createdAt": (existing or {}).get("createdAt", now()), "updatedAt": now()}
            self._put("scopes", scope["id"], scope)
            return scope

    def delete_scope(self, identifier):
        with self.lock, self.db:
            self._get("scopes", identifier)
            self.db.execute("DELETE FROM scopes WHERE workspace=? AND id=?", (self.workspace_id, identifier))
            for document in self.documents():
                document["tags"] = [t for t in document.get("tags", []) if (t.get("id") if isinstance(t, dict) else t) != identifier]
                self._put("documents", document["id"], document)

    def put_execution(self, execution):
        with self.lock, self.db:
            self._put("executions", execution["id"], execution)

    def execution(self, identifier):
        with self.lock:
            return self._get("executions", identifier)

    def executions(self, workflow_id=None):
        with self.lock:
            values = [json.loads(r[0]) for r in self.db.execute("SELECT body FROM executions WHERE workspace=? ORDER BY rowid DESC", (self.workspace_id,))]
            return [e for e in values if not workflow_id or e["workflowId"] == workflow_id]
