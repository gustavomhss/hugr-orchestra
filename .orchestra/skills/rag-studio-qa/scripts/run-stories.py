#!/usr/bin/env python3
"""User stories for Rag Studio. The oracle is the HTTP API, not the screen."""

import base64
import json
import os
import pathlib
import subprocess
import urllib.error
import urllib.parse
import urllib.request

url = os.environ.get("RAG_STUDIO_URL", "http://127.0.0.1:4097").rstrip("/")
directory = os.environ["RAG_STUDIO_DIR"]
token = os.environ.get("RAG_STUDIO_TOKEN")
if not token:
    password = os.environ["RAG_STUDIO_PASSWORD"]
    token = base64.b64encode(f"orchestra:{password}".encode()).decode()

failed = []


def query(directory):
    return urllib.parse.urlencode([("location[directory]", directory)])


def call(method, path, body=None, directory=directory):
    data = None if body is None else json.dumps(body).encode()
    req = urllib.request.Request(
        f"{url}{path}?{query(directory)}",
        data=data,
        headers={"Authorization": f"Basic {token}", "Content-Type": "application/json"},
        method=method,
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as res:
            raw = res.read().decode()
            return res.status, json.loads(raw) if raw else None
    except urllib.error.HTTPError as error:
        raw = error.read().decode()
        try:
            parsed = json.loads(raw)
        except json.JSONDecodeError:
            parsed = raw
        return error.code, parsed


def check(name, ok, detail):
    print(("PASS" if ok else "FAIL"), name)
    if not ok:
        print(" ", detail)
        failed.append(name)


def data_of(payload):
    if isinstance(payload, dict) and "data" in payload:
        return payload["data"]
    return payload


corpus = pathlib.Path(directory) / "corpus"
corpus.mkdir(parents=True, exist_ok=True)
note = corpus / "note.txt"
note.write_text("The harbor light is blue.\nA second sentence stays in the file.\n")

status, listed = call("GET", "/api/rag-studio/sources")
rows = data_of(listed)
check("open-empty-or-known", status == 200 and isinstance(rows, list), listed)

status, admitted = call("POST", "/api/rag-studio/sources", {"path": str(note)})
admitted = data_of(admitted)
check("admit-note", status == 200 and isinstance(admitted, dict) and "id" in admitted, admitted)
if not (isinstance(admitted, dict) and "id" in admitted):
    raise SystemExit(1)
source_id = admitted["id"]
check("not-yet-read", admitted.get("status") == "not_yet_read", admitted.get("status"))

status, parsed = call("POST", f"/api/rag-studio/sources/{source_id}/parse")
parsed = data_of(parsed)
check("read", status == 200 and isinstance(parsed, dict) and parsed.get("status") == "read", parsed)

status, revision = call("POST", "/api/rag-studio/revisions")
revision = data_of(revision)
check("revision", status == 200 and isinstance(revision, dict) and "id" in revision, revision)
revision_id = revision["id"]

status, asked = call("POST", "/api/rag-studio/ask", {"revisionId": revision_id, "text": "The harbor light is blue."})
asked = data_of(asked)
span = asked.get("span") if isinstance(asked, dict) else None
piece = note.read_text()[span["start"] : span["end"]] if isinstance(span, dict) else ""
check(
    "sentence-in-file",
    isinstance(asked, dict)
    and asked.get("light") == "sent"
    and isinstance(span, dict)
    and span.get("sourceId") == source_id
    and "The harbor light is blue." in piece
    and "model used" not in json.dumps(asked).lower(),
    asked,
)

status, missing = call(
    "POST",
    "/api/rag-studio/ask",
    {"revisionId": revision_id, "text": "this sentence is not in the file"},
)
missing = data_of(missing)
check(
    "sentence-missing",
    isinstance(missing, dict) and missing.get("light") == "not_in_corpus" and missing.get("span") is None,
    missing,
)

repo = pathlib.Path(directory) / "repo-atlas"
(repo / "src").mkdir(parents=True, exist_ok=True)
source_file = repo / "src" / "main.ts"
source_file.write_text("export const n = 1\n")
subprocess.run(["git", "-C", str(repo), "init", "-q"], check=True)
status, atlas = call("POST", "/api/rag-studio/sources", {"path": str(source_file)}, directory=str(repo))
atlas = data_of(atlas)
status, repo_list = call("GET", "/api/rag-studio/sources", directory=str(repo))
repo_rows = data_of(repo_list)
check(
    "project-source-refused",
    status == 200 and isinstance(atlas, dict) and atlas.get("refused") == "atlas" and repo_rows == [],
    {"atlas": atlas, "list": repo_rows},
)

outside = "/tmp/rag-studio-not-in-location.txt"
status, refused = call("POST", "/api/rag-studio/sources", {"path": outside})
refused = data_of(refused)
check("outside-refused", status == 200 and isinstance(refused, dict) and refused.get("refused") == "permission", refused)

status, embedding = call("POST", "/api/rag-studio/embedding")
embedding = data_of(embedding)
check("embedding-stays-off", status == 200 and isinstance(embedding, dict) and embedding.get("refused") == "embedding_off", embedding)

status, batch = call("POST", "/api/rag-studio/passes/batch", {"passes": ["reparse", "rechunk"]})
batch = data_of(batch)
check("two-passes-refused", status == 200 and isinstance(batch, dict) and batch.get("refused") == "one_pass", batch)

status, _removed = call("DELETE", f"/api/rag-studio/sources/{source_id}")
status, after = call("GET", "/api/rag-studio/sources")
after_rows = data_of(after)
check(
    "removed-from-list",
    status == 200 and isinstance(after_rows, list) and all(row.get("id") != source_id for row in after_rows),
    after_rows,
)

print("FAILED", failed if failed else "none")
raise SystemExit(1 if failed else 0)
