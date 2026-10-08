"""Authoring service: graph compilation, persistence, real gate evaluation and the versioned host API."""
import copy
import json
from pathlib import Path
import sys
import threading
import time
import urllib.error
import urllib.request

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "lib"))
from relay_authoring.application import AuthoringApplication
from relay_authoring.config import AuthoringConfig, AuthoringError
from relay_authoring.graph import START_TYPE, compile_document, loads, project_sprint
from relay_authoring.runs import Runner
from relay_authoring.server import AuthoringServer
from relay_authoring.skills import Skills
from relay_authoring.store import Store


@pytest.fixture
def config(tmp_path, monkeypatch):
    workspace = tmp_path / "project"; workspace.mkdir()
    home = tmp_path / "home"; home.mkdir()
    monkeypatch.setattr(Path, "home", lambda: home)
    return AuthoringConfig(workspace=workspace, data_dir=tmp_path / "state", base_path="/module/relay/")


@pytest.fixture
def sprint():
    return {"brief": "Exact author intent\n", "gen": 7, "retry_budget": 2, "extra": {"retained": True},
            "macros": [{"id": "phase", "title": "Phase", "instructions": "Context\n", "extra": 3}],
            "work_packages": [
                {"id": "first\n", "title": "Same name", "macro": "phase", "instructions": "Do it\n\n", "self_check": ["Evidence?"], "checklist": [{"id": "check\r\n", "assert": "Keep\tbytes\n", "cmd": "printf 'a\\tb\\n' > evidence.txt\n", "context": ["a.md"], "origin": "test"}], "dod": [{"cmd": "test -s evidence.txt"}]},
                {"id": "second", "title": "Same name", "macro": "phase", "kind": "review", "instructions": "Review", "checklist": [{"id": "review", "judge": "Keep exact\n", "blocking": True}]},
            ]}


def finished(store, execution):
    deadline = time.monotonic() + 30
    while time.monotonic() < deadline:
        value = store.execution(execution["id"])
        if value["finished"]: return value
        time.sleep(.05)
    pytest.fail("Gate did not finish")


def test_graph_preserves_exact_ids_control_bytes_and_extra_fields(sprint):
    document = project_sprint("Title", sprint)
    assert document["nodes"][0]["type"] == START_TYPE
    assert document["nodes"][1]["name"] != document["nodes"][2]["name"]
    document["nodes"].reverse()  # Graph order, not array order, controls the sprint.
    result, bindings = compile_document(document)
    assert [wp["id"] for wp in result["work_packages"]] == ["first\n", "second"]
    assert result["work_packages"][0]["checklist"] == sprint["work_packages"][0]["checklist"]
    assert result["work_packages"][0]["dod"] == sprint["work_packages"][0]["dod"]
    assert result["work_packages"][0]["self_check"] == ["Evidence?"]
    assert result["work_packages"][1]["title"] == "Same name"
    assert result["macros"] == sprint["macros"]
    assert result["extra"] == sprint["extra"] and bindings == []


def test_start_is_not_a_wp_and_does_not_collide_with_authored_identity():
    sprint = {"work_packages": [{"id": "relay-start", "title": "Workflow start", "checklist": []}]}
    document = project_sprint("Start collision", sprint)
    assert len({n["id"] for n in document["nodes"]}) == len(document["nodes"]) == 2
    assert len({n["name"] for n in document["nodes"]}) == 2
    compiled, _ = compile_document(document)
    assert [wp["id"] for wp in compiled["work_packages"]] == ["relay-start"]


def test_noncontiguous_phases_are_refused_before_projection_or_persistence(config):
    sprint = {"macros": [{"id": "A", "instructions": "Protocol A"}, {"id": "B", "instructions": "Protocol B"}],
              "work_packages": [{"id": "a1", "macro": "A"}, {"id": "b", "macro": "B"}, {"id": "a2", "macro": "A"}]}
    original = copy.deepcopy(sprint)
    with pytest.raises(AuthoringError, match="contiguous"): project_sprint("Interleaved", sprint)
    assert sprint == original
    app = AuthoringApplication(config)
    try:
        document = {"name": "Interleaved", "nodes": [{"id": wp["id"], "name": wp["id"], "type": "relay.execute", "position": [i*224, 0], "parameters": {}} for i, wp in enumerate(sprint["work_packages"])],
                    "connections": {"a1": {"main": [[{"node": "b", "type": "main", "index": 0}]]}, "b": {"main": [[{"node": "a2", "type": "main", "index": 0}]]}},
                    "nodeGroups": [{"id": "A", "name": "A", "description": "Protocol A", "nodeIds": ["a1", "a2"]}, {"id": "B", "name": "B", "description": "Protocol B", "nodeIds": ["b"]}]}
        with pytest.raises(AuthoringError, match="contiguous"): app.save(document)
        assert app.store.documents() == []
        # An unsupported definition written straight to storage still cannot be read back or exported.
        stored = app.store.save(document)
        with pytest.raises(AuthoringError, match="contiguous"): app.document(stored["id"])
        with pytest.raises(AuthoringError, match="contiguous"): compile_document(stored)
        assert app.store.get(stored["id"]) == stored
    finally:
        app.close()


def test_rename_and_phase_membership_are_authored_data(sprint):
    document = project_sprint("Title", sprint)
    document["nodes"][2]["name"] = "New name"
    document["connections"][document["nodes"][1]["name"]]["main"][0][0]["node"] = "New name"
    protocol = "# Phase\n\n" + "Keep the full protocol and its exact newlines.\n" * 20
    document["nodeGroups"][0].update(name="New phase", description=protocol)
    result, _ = compile_document(document)
    assert result["work_packages"][1]["title"] == "New name"
    assert result["macros"][0]["instructions"] == protocol and result["macros"][0]["extra"] == 3
    document["nodeGroups"] = []
    assert all("macro" not in wp for wp in compile_document(document)[0]["work_packages"])


@pytest.mark.parametrize("mutation", ["empty", "disconnected", "cycle", "branch", "duplicate-id", "duplicate-control", "bad-port", "invalid-skill", "grouped-start"])
def test_unexecutable_graphs_never_compile(sprint, mutation):
    document = project_sprint("Title", sprint)
    start, a, b = document["nodes"]
    if mutation == "empty": document["nodes"] = []
    if mutation == "disconnected": document["connections"] = {}
    if mutation == "cycle": document["connections"][b["name"]] = {"main": [[{"node": a["name"], "type": "main", "index": 0}]]}
    if mutation == "branch": document["connections"][a["name"]]["main"][0].append({"node": b["name"], "type": "main", "index": 0})
    if mutation == "duplicate-id": b["id"] = a["id"]
    if mutation == "duplicate-control": b["parameters"]["checklist"] = a["parameters"]["checklist"]
    if mutation == "bad-port": document["connections"][a["name"]]["main"][0][0]["index"] = 1
    if mutation == "invalid-skill": a["parameters"]["skill"] = ["one", "two"]
    if mutation == "grouped-start": document["nodeGroups"][0]["nodeIds"].insert(0, start["id"])
    with pytest.raises(AuthoringError): compile_document(document)


def test_strict_json_rejects_duplicate_and_nonstandard_numbers():
    assert loads('{"a":1}') == {"a": 1}
    for value in ('{"a":1,"a":2}', '{"a":NaN}', '{"a":Infinity}'):
        with pytest.raises(AuthoringError): loads(value)


def test_start_node_holds_whole_sprint_objective_and_retry_budget(sprint):
    document = project_sprint("Title", sprint)
    document["nodes"][0]["parameters"].update(relayBrief="New objective\n", relayRetryBudget=5)
    compiled, _ = compile_document(document)
    assert compiled["brief"] == "New objective\n" and compiled["retry_budget"] == 5
    for value in (-1, 2.5, True, "3"):
        document["nodes"][0]["parameters"]["relayRetryBudget"] = value
        with pytest.raises(AuthoringError): compile_document(document)


@pytest.mark.parametrize("field", ["connections", "retained-wp", "retained-names", "group-member", "tags"])
def test_malformed_drafts_are_refused_before_persistence(config, sprint, field):
    app = AuthoringApplication(config)
    document = project_sprint("Malformed", sprint)
    if field == "connections": document["connections"][document["nodes"][0]["name"]]["main"] = None
    if field == "retained-wp": document["meta"]["relay"]["sprint"]["work_packages"] = [None]
    if field == "retained-names": document["meta"]["relay"]["names"] = []
    if field == "group-member": document["nodeGroups"][0]["nodeIds"] = [{}]
    if field == "tags": document["tags"] = [["bad"]]
    try:
        with pytest.raises(AuthoringError): app.save(document)
        assert app.store.documents() == []
    finally:
        app.close()


def test_checksums_and_published_versions_follow_actual_persistence(config, sprint):
    app = AuthoringApplication(config)
    try:
        original = app.save(project_sprint("Checksum", sprint))
        assert len(original["checksum"]) == 64 and original["activeVersion"] is None
        assert app.document(original["id"])["nodes"] == original["nodes"]
        updated = app.save({"name": "Changed", "versionId": original["versionId"], "expectedChecksum": original["checksum"]}, original["id"])
        assert updated["checksum"] != original["checksum"]
        with pytest.raises(AuthoringError):
            app.save({"name": "Stale", "versionId": updated["versionId"], "expectedChecksum": original["checksum"]}, original["id"])
        assert app.save({"name": "Forced", "expectedChecksum": original["checksum"]}, original["id"], force=True)["name"] == "Forced"
        forced = app.document(original["id"])
        published = app.publish(original["id"], forced["versionId"], forced["checksum"])
        assert published["activeVersion"]["versionId"] == forced["versionId"]
        assert published["activeVersion"]["nodes"] == forced["nodes"]
        with pytest.raises(AuthoringError): app.unpublish(original["id"], forced["checksum"])
        assert app.unpublish(original["id"], published["checksum"])["activeVersion"] is None
    finally:
        app.close()


def test_store_persists_versions_conflicts_scopes_and_workspace_isolation(config, sprint):
    store = Store(config.data_dir, "workspace-a")
    original = store.save(project_sprint("Title", sprint))
    changed = store.save({"name": "Changed"}, original["id"], original["versionId"])
    with pytest.raises(AuthoringError, match="changed"): store.save({"name": "Stale"}, original["id"], original["versionId"])
    assert store.get(original["id"])["name"] == "Changed"
    assert store.version(original["id"], original["versionId"])["name"] == "Title"
    published = store.publish(original["id"], changed["versionId"])
    assert published["activeVersionId"] == changed["versionId"]
    assert store.unpublish(original["id"])["active"] is False
    scope = store.save_scope({"name": "Review", "description": "Review deliveries"})
    with pytest.raises(AuthoringError): store.save_scope({"name": "REVIEW"})
    store.save({"tags": [scope]}, original["id"])
    store.delete_scope(scope["id"]); assert store.get(original["id"])["tags"] == []
    store.close()
    reopened = Store(config.data_dir, "workspace-a")
    assert reopened.get(original["id"])["name"] == "Changed"
    other = Store(config.data_dir, "workspace-b")
    assert other.documents() == []
    with pytest.raises(AuthoringError): other.get(original["id"])
    other.close(); reopened.close()


@pytest.mark.parametrize("content", [None, b"# Review\n\nUse evidence.\n\n", b"# Review\r\n\r\nUse evidence.\r\n\r\n"],
                         ids=["platform", "lf", "crlf"])
def test_skills_discovery_upload_and_exact_single_binding(config, sprint, content):
    source = config.workspace / ".agents/skills/review/SKILL.md"
    source.parent.mkdir(parents=True)
    if content is None:
        source.write_text("# Review\n\nUse evidence.\n\n")
    else:
        source.write_bytes(content)
    skills = Skills(config.workspace, config.data_dir)
    entries = skills.refresh(); assert len(entries) == 1
    assert entries[0]["origin"] == "repo"
    document = project_sprint("Skills", sprint)
    params = document["nodes"][1]["parameters"]; params.update(skill=entries[0]["id"], skillMode="replace")
    compiled, bindings = compile_document(document, skills.resolve)
    assert compiled["work_packages"][0]["instructions"] == source.read_bytes().decode("utf8")
    assert params["instructions"] == "Do it\n\n"
    params["skillMode"] = "combine"
    assert compile_document(document, skills.resolve)[0]["work_packages"][0]["instructions"] == source.read_bytes().decode("utf8") + "\n\nDo it\n\n"
    uploaded = skills.upload("custom.md", "# Custom\nPreserve the file.\n")
    assert skills.resolve(uploaded["id"])["content"].endswith("\n")
    assert skills.upload("custom.md", "# Custom\nPreserve the file.\n")["id"] == uploaded["id"]
    for filename, content in (("x.txt", "content"), ("../x.md", "content"), ("x.md", ""), ("x.md", "\0")):
        with pytest.raises(AuthoringError): skills.upload(filename, content)
    source.unlink()
    with pytest.raises(AuthoringError): skills.resolve(entries[0]["id"])


def test_real_gate_retry_retains_state_and_freezes_definition(config):
    skills = Skills(config.workspace, config.data_dir); skills.refresh()
    store = Store(config.data_dir, config.workspace_id)
    document = store.save(project_sprint("Real gate", {"brief": "Retry", "retry_budget": 2, "work_packages": [
        {"id": "check", "instructions": "Check", "checklist": [{"id": "file", "cmd": "test -s result.txt"}]}]}))
    runner = Runner(config, store, skills)
    events = runner.events.subscribe("host")
    try:
        failed = finished(store, runner.start(document))
        assert failed["status"] == "error" and failed["relay"]["outcome"] == "gate-fail", json.dumps(failed, ensure_ascii=False)
        received = [events.get(timeout=5)["type"] for _ in range(4)]
        assert received == ["execution.started", "node.started", "node.finished", "execution.finished"]
        state = Path(failed["relay"]["stateDir"])
        assert (state / "retry_0").read_text().strip() == "1"
        altered = copy.deepcopy(document); altered["nodes"][1]["parameters"]["checklist"] = '[{"id":"wrong","cmd":"false"}]'
        (config.workspace / "result.txt").write_text("Real artifact")
        passed = finished(store, runner.start(altered, retry_of=failed["id"]))
        assert passed["status"] == "success" and passed["relay"]["outcome"] == "complete"
        assert passed["relay"]["runId"] == failed["relay"]["runId"]
        assert passed["workflowData"] == failed["workflowData"]
        ledger = [json.loads(line) for line in (state / "ledger.jsonl").read_text().splitlines()]
        controls = [entry for entry in ledger if entry["event"] == "checklist-item"]
        assert [entry["item"] for entry in controls] == ["file", "file"]
        assert [entry["verdict"] for entry in controls] == ["fail", "pass"]
    finally:
        runner.events.unsubscribe("host", events)
        runner.close(); store.close()


def test_real_prefix_retry_keeps_destination_and_escalation_cannot_reset_budget(config):
    app = AuthoringApplication(config)
    try:
        document = app.save(project_sprint("Prefix", {"retry_budget": 1, "work_packages": [
            {"id": "first", "title": "First", "checklist": [{"id": "artifact", "cmd": "test -s result.txt"}]},
            {"id": "second", "title": "Second", "checklist": [{"id": "later", "cmd": "touch later.txt; test -s final.txt"}]},
        ]}))
        failed = finished(app.store, app.start(document["id"], "First"))
        assert failed["relay"]["outcome"] == "gate-fail", json.dumps(failed, ensure_ascii=False)
        with pytest.raises(AuthoringError, match="original destination"):
            app.runner.start(document, "Second", retry_of=failed["id"])
        (config.workspace / "result.txt").write_text("Actual evidence")
        passed = finished(app.store, app.retry(failed["id"]))
        assert passed["status"] == "success" and passed["relay"]["outcome"] == "advance"
        assert passed["executedNode"] == "First" and list(passed["data"]["resultData"]["runData"]) == ["First"]
        assert not (config.workspace / "later.txt").exists()
        failed = finished(app.store, app.start(document["id"]))
        assert failed["relay"]["outcome"] == "gate-fail" and (config.workspace / "later.txt").exists()
        escalated = finished(app.store, app.retry(failed["id"]))
        assert escalated["status"] == "error" and escalated["relay"]["outcome"] == "escalate"
        with pytest.raises(AuthoringError, match="escalated"):
            app.retry(escalated["id"])
        # An ancestor receipt must not bypass the same run's later escalation.
        (config.workspace / "final.txt").write_text("Repaired after escalation")
        app.close(); app = AuthoringApplication(config)
        with pytest.raises(AuthoringError, match="escalated"):
            app.retry(failed["id"])
        app.save({"isArchived": True}, document["id"])
        with pytest.raises(AuthoringError, match="archived"):
            app.start(document["id"])
    finally:
        app.close()


def test_disambiguated_titles_survive_saves_and_renames(config, sprint):
    app = AuthoringApplication(config)
    try:
        document = app.save(project_sprint("Titles", sprint))
        for node in document["nodes"]: node["parameters"].pop("title", None)
        document = app.save(document, document["id"])
        assert [wp["title"] for wp in compile_document(document)[0]["work_packages"]] == ["Same name", "Same name"]
        node = next(n for n in document["nodes"] if n["id"] == "second")
        first_name = next(n for n in document["nodes"] if n["id"] == "first\n")["name"]
        old_name = node["name"]
        node["name"] = "Renamed"
        document["connections"][first_name]["main"][0][0]["node"] = "Renamed"
        document = app.save(document, document["id"])
        assert compile_document(document)[0]["work_packages"][1]["title"] == "Renamed"
        next(n for n in document["nodes"] if n["id"] == "second")["name"] = old_name
        document["connections"][first_name]["main"][0][0]["node"] = old_name
        document = app.save(document, document["id"])
        assert compile_document(document)[0]["work_packages"][1]["title"] == old_name
    finally:
        app.close()


def test_api_base_path_drafts_catalog_and_invalid_execution(config):
    app = AuthoringApplication(config); app.seed_profiles()
    server = AuthoringServer(("127.0.0.1", 0), app)
    thread = threading.Thread(target=server.serve_forever, daemon=True); thread.start()
    base = f"http://127.0.0.1:{server.server_port}{config.base_path}"
    def request(path, body=None, origin=None, method=None):
        headers = {"Content-Type": "application/json"}
        if origin: headers["Origin"] = origin
        req = urllib.request.Request(base+path, data=None if body is None else json.dumps(body).encode(), headers=headers, method=method)
        try: response = urllib.request.urlopen(req)
        except urllib.error.HTTPError as error: response = error
        with response: return response.status, json.load(response)
    try:
        status, bootstrap = request("api/v1/bootstrap")
        assert status == 200 and bootstrap["workspace"]["directory"] == str(config.workspace)
        status, catalog = request("api/v1/node-types")
        assert status == 200 and {t["type"] for t in catalog["workflow"]} >= {START_TYPE, "relay.execute"}
        assert next(t for t in catalog["hook"] if t["type"] == "relay.hookCondition")["outputs"] == ["Yes", "No"]
        status, documents = request("api/v1/documents")
        assert status == 200 and len(documents["items"]) == len(list((ROOT / "profiles").glob("*.sprint.json")))
        assert all(d["name"].startswith("Relay · ") for d in documents["items"])
        status, draft = request("api/v1/documents", {"name": "Incomplete", "nodes": [], "connections": {}, "active": True, "activeVersionId": "forged"})
        assert status == 201 and draft["meta"]["relay"]["diagnostics"]
        assert draft["active"] is False and draft["activeVersionId"] is None
        status, error = request("api/v1/executions", {"documentId": draft["id"]})
        assert status == 400 and "step" in error["message"]
        status, _ = request("api/v1/documents/" + draft["id"] + "/publish", {"versionId": draft["versionId"]})
        assert status == 400
        status, _ = request("api/v1/documents", {"name": "Cross origin"}, "https://outside.invalid")
        assert status == 403
        status, _ = request("api/v1/documents/" + draft["id"] + "/unknown")
        assert status == 404
        status, _ = request("rest/workflows")
        assert status == 404
        status, deleted = request("api/v1/documents/" + draft["id"], method="DELETE")
        assert status == 200 and deleted == {"deleted": True}
    finally:
        server.shutdown(); server.server_close(); thread.join(); app.close()


def test_injected_dependencies_remain_host_owned_and_wrong_workspace_is_refused(config):
    class Gate:
        closed = False
        def evaluate(self, *args): pytest.fail("No gate evaluation belongs in a lifetime test")
        def close(self): self.closed = True
    gate = Gate(); store = Store(config.data_dir, config.workspace_id)
    app = AuthoringApplication(config, gate=gate, store=store)
    app.close()
    assert gate.closed is False and store.documents() == []
    other = Store(config.data_dir, "other")
    with pytest.raises(AuthoringError, match="another workspace"): AuthoringApplication(config, store=other, gate=gate)
    other.close(); store.close()


@pytest.mark.parametrize("base", ["bad", "/../", "/x?q=1", "//evil.invalid/"])
def test_invalid_host_prefix_is_refused(config, base):
    with pytest.raises(AuthoringError):
        AuthoringConfig(workspace=config.workspace, data_dir=config.data_dir, base_path=base)
