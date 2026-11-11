"""Check the saved transport bytes and references; never grants semantic/runtime acceptance."""
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent
PREFIX = "modules/atlas/docs/design/genesis-chatgpt-results/20261111-v3-fresh/s3/"
NEEDS = {"entry", "ownership", "maintenance", "operational", "flow", "evidence", "component"}

def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def verify():
    package = json.loads((ROOT / "native-package.json").read_text())
    artifacts = package["artifacts"]
    by_key = {item["key"]: item for item in artifacts}
    assert len(by_key) == len(artifacts), "duplicate key"
    required = package["required_artifact_keys"]
    assert len(required) == len(set(required)), "duplicate required key"
    assert set(package["missing_required_artifact_keys"]) == set(required) - set(by_key)
    references = []
    def check_ref(value):
        if isinstance(value, dict):
            if "payload_path" in value:
                assert value["payload_path"].startswith(PREFIX)
                relative = Path(value["payload_path"][len(PREFIX):])
                assert not relative.is_absolute() and ".." not in relative.parts
                path = ROOT / relative
                assert path.is_file() and not path.is_symlink(), str(relative)
                assert digest(path) == value["sha256"], str(relative)
                references.append(str(relative))
            for item in value.values(): check_ref(item)
        elif isinstance(value, list):
            for item in value: check_ref(item)
    check_ref(package)
    visiting, visited = set(), set()
    def visit(key):
        assert key not in visiting, "build dependency cycle"
        if key in visited: return
        visiting.add(key)
        item = by_key[key]
        for dep in item["build_dependencies"]:
            if dep.get("same_package"):
                assert dep["key"] in by_key
                assert by_key[dep["key"]]["layer"] < item["layer"]
                visit(dep["key"])
            else:
                assert "package_ref" in dep
        visiting.remove(key)
        visited.add(key)
    for item in artifacts:
        assert item["scope"] == package["scope"]
        assert item["layer"] in (1, 2, 3, 4) and item["need"] in NEEDS
        body = item["body"]
        relative = Path(body["path"])
        assert not relative.is_absolute() and ".." not in relative.parts
        path = ROOT / relative
        assert path.is_file() and not path.is_symlink()
        raw = path.read_bytes()
        assert raw.decode("utf-8").encode("utf-8") == raw
        assert len(raw) == body["byte_length"] and digest(path) == body["sha256"]
        assert item["validity"] in ("supported", "blocked")
        assert len(item["input_keys"]) == len(set(item["input_keys"]))
        assert item["recipe_ref"] and item["producer_request_ref"] and item["producer_response_ref"]
        if item["validity"] == "supported":
            assert len(item["semantic_review_refs"]) >= 2
        visit(item["key"])
    return {"status": "PASS_TRANSPORT_BYTES_AND_REFERENCES_ONLY", "artifact_count": len(artifacts),
            "required_count": len(required), "missing": package["missing_required_artifact_keys"],
            "payload_references_checked": len(references), "distinct_payload_files": len(set(references)),
            "package_sha256": digest(ROOT / "native-package.json"),
            "does_not_prove": ["semantic acceptance", "runtime import", "input versions", "ownership.index/read", "consumer performance", "CI"]}

if __name__ == "__main__":
    report = verify()
    (ROOT / "evidence/transport-verification.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps(report, ensure_ascii=False))
