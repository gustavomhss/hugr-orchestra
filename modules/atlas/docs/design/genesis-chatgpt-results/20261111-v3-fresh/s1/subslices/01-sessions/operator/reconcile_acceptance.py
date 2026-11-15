"""Bind actual judge records to exact candidate bytes. No inferred or synthetic votes."""
from pathlib import Path
import hashlib
import json
import datetime

W = Path(__file__).resolve().parents[1]
required = {"QS-1", "QS-2", "QS-4", "QS-5", "QS-6", "CC-1", "CC-3", "CC-7", "GO-I1", "GO-I2", "GO-I7", "GO-I8"}
candidates = {
    "s1.core.session-admission": "a1/originals/bodies/session-admission.md",
    "s1.core.session-execution": "a1/originals/bodies/session-execution.md",
    "s1.core.persistence": "a1/recovery/candidate/bodies/persistence.md",
    "s1.core.context": "a1_completion/bodies/context.md",
    "s1.core.configuration": "config_project/inherited/configuration.md",
    "s1.core.project": "config_project/inherited/project.md",
    "s1.core.runtime": "runtime_completion/inherited-bodies/runtime.md",
    "s1.core.models": "runtime_completion/inherited-bodies/models.md",
    "s1.core.economy": "runtime_completion/inherited-bodies/economy.md",
    "s1.subslice01.session-state-completion": "a1_completion/bodies/session-state-completion.md",
    "s1.subslice01.config-project-supplement": "config_project/bodies/config-project-supplement-v2.md",
    "s1.subslice01.runtime-models-economy-completion": "runtime_completion/bodies/runtime-models-economy-completion.md",
}
for name in ["session-lifecycle", "environment-runtime", "change-impact", "session-ownership"]:
    p = W / "upper" / name / "body.md"
    if p.exists():
        candidates["s1.subslice01." + name] = str(p.relative_to(W))
decisions = []
for p in sorted((W / "judgments").glob("*.json")):
    if p.name == "acceptance-index.json":
        continue
    d = json.loads(p.read_text())
    role = d.get("judge")
    if role not in {"parallel-v3-fresh/S1-01/J1", "parallel-v3-fresh/S1-01/J2"}:
        continue
    if d.get("execution", d.get("execution_id")) != "6e9b2070-17eb-4e92-bba6-64ce616d6116":
        raise ValueError((p, "wrong execution"))
    for record in d.get("decisions", d.get("artifacts", [])):
        decisions.append((role, p, record))
out = {"schema": "genesis-s1-01-real-acceptance-index/v1", "recorded_at": datetime.datetime.now(datetime.timezone.utc).isoformat(), "required_criteria": sorted(required), "native_judge_handles": {"parallel-v3-fresh/S1-01/J1": "/root/judge1", "parallel-v3-fresh/S1-01/J2": "/root/judge2"}, "artifacts": {}}
for key, local in candidates.items():
    p = W / local
    if not p.exists():
        raise FileNotFoundError(p)
    body_sha = hashlib.sha256(p.read_bytes()).hexdigest()
    matches = {}
    for role, source, record in decisions:
        if record.get("artifact", record.get("key")) != key or record.get("body_sha256") != body_sha:
            continue
        verdicts = record.get("criteria", {})
        if record.get("verdict") == "PASS" and required.issubset(verdicts) and all(verdicts[k] == "PASS" for k in required):
            matches[role] = {"decision_file": str(source.relative_to(W)), "response_sha256": hashlib.sha256(source.read_bytes()).hexdigest(), "verdict": "PASS", "criterion_count": len(required)}
    out["artifacts"][key] = {"body_path": local, "body_sha256": body_sha, "body_bytes": p.stat().st_size, "state": "ACCEPTED_BY_SAME_NATIVE_PAIR" if len(matches) == 2 else "PENDING_SAME_PAIR_REVIEW", "judgments": matches}
(W / "judgments/acceptance-index.json").write_text(json.dumps(out, ensure_ascii=False, indent=2) + "\n")
print(json.dumps({"accepted": [k for k,v in out["artifacts"].items() if v["state"] == "ACCEPTED_BY_SAME_NATIVE_PAIR"], "pending": [k for k,v in out["artifacts"].items() if v["state"] != "ACCEPTED_BY_SAME_NATIVE_PAIR"]}))
