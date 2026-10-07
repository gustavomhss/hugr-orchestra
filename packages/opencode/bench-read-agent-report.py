#!/usr/bin/env python3
"""Durable, fail-closed A/B evaluator for `opencode run --format json`."""
import argparse
import hashlib
import json
import os
import signal
import statistics
import subprocess
import tempfile
from pathlib import Path

TASKS = (
    ("tail", "tail-marker.txt", "READ_AGENT_TAIL_MARKER_6C8A7E"),
    ("middle", "middle-marker.txt", "READ_AGENT_MIDDLE_MARKER_3F91BD"),
    ("long_line", "long-line-marker.txt", "READ_AGENT_LONG_LINE_MARKER_8D42C1"),
)
PLAN_NAME = "plan.json"
ROWS_NAME = "raw-results.jsonl"


class Invalid(ValueError):
    pass


def require(condition, message):
    if not condition:
        raise Invalid(message)


def number(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool) and value >= 0


def sha256(path):
    digest = hashlib.sha256()
    with path.open("rb") as file:
        for chunk in iter(lambda: file.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


def parse_stream(text):
    events = []
    for line_number, line in enumerate(text.splitlines(), 1):
        require(line.strip(), f"malformed stream: blank line {line_number}")
        try:
            event = json.loads(line)
        except json.JSONDecodeError as error:
            raise Invalid(f"malformed stream line {line_number}: {error.msg}") from error
        require(isinstance(event, dict), f"unsupported schema line {line_number}: event is not object")
        kind = event.get("type")
        require(kind in {"tool_use", "text", "step_start", "step_finish", "error"}, f"unsupported schema line {line_number}: {kind!r}")
        require(isinstance(event.get("part") if kind != "error" else event.get("error"), dict), f"unsupported schema line {line_number}: missing payload")
        events.append(event)
    require(events, "malformed stream: no events")
    return events


def parse_trial(text, marker):
    tools, final, calls, telemetry = [], [], set(), []
    for event in parse_stream(text):
        kind = event["type"]
        if kind == "error":
            raise Invalid("model error event")
        part = event["part"]
        require(isinstance(part.get("type"), str), "unsupported schema: part type missing")
        if kind == "tool_use":
            require(part["type"] == "tool", "unsupported schema: tool_use part")
            require(isinstance(part.get("callID"), str) and part["callID"], "unsupported schema: tool call id")
            require(part["callID"] not in calls, "duplicate tool result")
            calls.add(part["callID"])
            state = part.get("state")
            require(isinstance(state, dict) and state.get("status") in {"completed", "error"}, "unsupported schema: tool result")
            require(isinstance(part.get("tool"), str) and isinstance(state.get("input"), dict), "unsupported schema: tool input")
            result = state.get("output") if state["status"] == "completed" else state.get("error")
            require(isinstance(result, str), "unsupported schema: tool result body")
            tools.append({"call_id": part["callID"], "tool": part["tool"], "status": state["status"], "input": state["input"], "result": result})
        elif kind == "text":
            require(part["type"] == "text" and isinstance(part.get("text"), str), "unsupported schema: text part")
            final.append(part["text"])
        elif kind == "step_start":
            require(part["type"] == "step-start", "unsupported schema: step_start part")
        elif kind == "step_finish":
            require(part["type"] == "step-finish", "unsupported schema: step_finish part")
            tokens, cost = part.get("tokens"), part.get("cost")
            require(isinstance(tokens, dict) and number(tokens.get("input")) and number(tokens.get("output")) and number(cost), "unsupported schema: step telemetry")
            telemetry.append((tokens["input"], tokens["output"], cost))
    answer = "\n".join(final).strip()
    require(answer, "missing final response")
    require(any(tool["tool"] == "read" for tool in tools), "no read call")
    require(marker in answer, "missing exact marker")
    return {"outcome": "success", "final": answer, "tool_calls": tools, "read_calls": sum(tool["tool"] == "read" for tool in tools), "retries": None, "tokens_input": None if not telemetry else sum(item[0] for item in telemetry), "tokens_output": None if not telemetry else sum(item[1] for item in telemetry), "cost": None if not telemetry else sum(item[2] for item in telemetry)}


def corpus_spec():
    contents = {
        "tail-marker.txt": "".join(f"tail decoy line {index:05d}\n" for index in range(20_000)) + TASKS[0][2] + "\n",
        "middle-marker.txt": "".join(f"middle decoy line {index:05d}\n" for index in range(10_000)) + TASKS[1][2] + "\n" + "".join(f"middle decoy line {index:05d}\n" for index in range(10_000, 20_000)),
        "long-line-marker.txt": ("long-line-decoy-" * 8_192) + TASKS[2][2] + ("-long-line-decoy" * 8_192) + "\n",
    }
    fixtures = [{"file": name, "sha256": hashlib.sha256(content.encode()).hexdigest()} for name, content in contents.items()]
    manifest = {"tasks": [{"id": task, "file": file, "answer": answer} for task, file, answer in TASKS], "fixtures": fixtures}
    return contents, manifest, hashlib.sha256((json.dumps(manifest, indent=2) + "\n").encode()).hexdigest()


def write_corpus(out, contents, manifest):
    corpus = out / "corpus"
    corpus.mkdir(parents=True, exist_ok=True)
    for name, content in contents.items():
        (corpus / name).write_text(content, encoding="utf-8", newline="\n")
    manifest_path = corpus / "manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    return corpus


def validate_corpus(corpus, plan):
    manifest = corpus / "manifest.json"
    require(manifest.is_file() and sha256(manifest) == plan["manifest_sha256"], "corpus manifest hash mismatch")
    for fixture in plan["fixtures"]:
        path = corpus / fixture["file"]
        require(path.is_file() and sha256(path) == fixture["sha256"], f"corpus fixture hash mismatch: {path}")


def binary_info(binary):
    path = Path(binary).resolve()
    require(path.is_file() and os.access(path, os.X_OK), f"missing executable binary: {path}")
    try:
        version = subprocess.run([str(path), "--version"], text=True, capture_output=True, timeout=30, check=False)
        version_text = version.stdout.strip() if version.returncode == 0 else f"exit {version.returncode}: {version.stderr.strip()}"
    except subprocess.TimeoutExpired:
        version_text = "timeout"
    return {"path": str(path), "sha256": sha256(path), "version": version_text}


def selected_tasks(value, manifest):
    selected = [task["id"] for task in manifest["tasks"]] if value is None else value.split(",")
    known = {task["id"] for task in manifest["tasks"]}
    require(selected and all(task in known for task in selected) and len(set(selected)) == len(selected), "--tasks must contain unique known task IDs")
    return [next(task for task in manifest["tasks"] if task["id"] == selected_id) for selected_id in selected]


def build_plan(args, manifest, manifest_sha, tasks):
    return {"format": 1, "binaries": {"baseline": binary_info(args.baseline), "candidate": binary_info(args.candidate)}, "models": args.models.split(","), "tasks": tasks, "fixtures": manifest["fixtures"], "manifest_sha256": manifest_sha, "runs": args.runs, "timeout_sec": args.timeout_sec}


def load_plan(path):
    try:
        plan = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise Invalid(f"invalid plan: {error}") from error
    require(isinstance(plan, dict) and plan.get("format") == 1, "invalid plan format")
    return plan


def create_or_match_plan(out, expected, resume):
    path = out / PLAN_NAME
    if resume:
        require(path.is_file(), f"--resume requires {path}")
        plan = load_plan(path)
        require(plan == expected, "plan mismatch; refuse resume")
        return plan
    require(not any(out.iterdir()), f"output exists and is nonempty: {out}; use --resume")
    with path.open("x", encoding="utf-8") as file:
        file.write(json.dumps(expected, indent=2) + "\n")
        file.flush()
        os.fsync(file.fileno())
    return expected


def keys(plan):
    return {(binary, model, task["id"], run) for binary in ("baseline", "candidate") for model in plan["models"] for task in plan["tasks"] for run in range(plan["runs"])}


def row_key(row):
    return (row.get("binary"), row.get("model"), row.get("task"), row.get("run"))


def pending_keys(plan, rows):
    return keys(plan) - {row_key(row) for row in rows}


def read_rows(out, plan):
    path = out / ROWS_NAME
    if not path.is_file():
        return []
    rows, expected, seen = [], keys(plan), set()
    for line_number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        require(line.strip(), f"malformed result row {line_number}: blank")
        try:
            row = json.loads(line)
        except json.JSONDecodeError as error:
            raise Invalid(f"malformed result row {line_number}: {error.msg}") from error
        require(isinstance(row, dict), f"malformed result row {line_number}: not object")
        key = row_key(row)
        require(key in expected, f"unexpected result key {key}")
        require(key not in seen, f"duplicate result key {key}")
        require(row.get("outcome") in {"success", "failed", "timeout"}, f"unknown outcome for {key}")
        require(isinstance(row["run"], int), f"invalid run for {key}")
        if row["outcome"] == "success":
            require(isinstance(row.get("final"), str) and isinstance(row.get("tool_calls"), list) and isinstance(row.get("read_calls"), int), f"malformed success row {key}")
            marker = next(task["answer"] for task in plan["tasks"] if task["id"] == key[2])
            require(marker in row["final"] and row["read_calls"] > 0, f"invalid success evidence for {key}")
        else:
            require(isinstance(row.get("error"), str), f"malformed failure row {key}")
        seen.add(key)
        rows.append(row)
    return rows


def require_complete(rows, plan):
    missing = pending_keys(plan, rows)
    if missing:
        raise Invalid(f"partial results: missing {len(missing)} keys, for example {sorted(missing)[0]}")


def append_row(out, row):
    with (out / ROWS_NAME).open("a", encoding="utf-8") as file:
        file.write(json.dumps(row, separators=(",", ":")) + "\n")
        file.flush()
        os.fsync(file.fileno())


def median(values):
    present = [value for value in values if value is not None]
    return "N/A" if not present else statistics.median(present)


def report(rows, plan, out):
    require_complete(rows, plan)
    summary = []
    for model in plan["models"]:
        for task in plan["tasks"]:
            entry = {"model": model, "task": task["id"], "binaries": {}}
            for binary in ("baseline", "candidate"):
                samples = [row for row in rows if row_key(row)[:3] == (binary, model, task["id"])]
                entry["binaries"][binary] = {"outcomes": {outcome: sum(row["outcome"] == outcome for row in samples) for outcome in ("success", "failed", "timeout")}, "success_rate": sum(row["outcome"] == "success" for row in samples) / len(samples), "median_read_calls": median([row.get("read_calls") for row in samples]), "median_retries": median([row.get("retries") for row in samples]), "median_tokens_input": median([row.get("tokens_input") for row in samples]), "median_tokens_output": median([row.get("tokens_output") for row in samples]), "median_cost": median([row.get("cost") for row in samples])}
            summary.append(entry)
    (out / "results.json").write_text(json.dumps({"plan": plan, "rows": rows, "paired": summary}, indent=2) + "\n", encoding="utf-8")
    lines = ["# Read Agent A/B", "", "| model | task | binary | outcomes | success | median read calls | median retries | tokens in/out | cost |", "|---|---|---|---|---:|---:|---:|---:|---:|"]
    for pair in summary:
        for binary in ("baseline", "candidate"):
            value = pair["binaries"][binary]
            tokens = "N/A" if value["median_tokens_input"] == "N/A" else f"{value['median_tokens_input']}/{value['median_tokens_output']}"
            outcomes = ", ".join(f"{name}:{count}" for name, count in value["outcomes"].items() if count)
            lines.append(f"| {pair['model']} | {pair['task']} | {binary} | {outcomes} | {value['success_rate']:.0%} | {value['median_read_calls']} | {value['median_retries']} | {tokens} | {value['median_cost']} |")
    (out / "report.md").write_text("\n".join(lines) + "\n", encoding="utf-8")


def run_child(command, cwd, timeout):
    process = subprocess.Popen(command, cwd=cwd, text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, start_new_session=True)
    try:
        stdout, stderr = process.communicate(timeout=timeout)
        return False, process.returncode, stdout, stderr
    except subprocess.TimeoutExpired:
        os.killpg(process.pid, signal.SIGTERM)
        try:
            stdout, stderr = process.communicate(timeout=5)
        except subprocess.TimeoutExpired:
            os.killpg(process.pid, signal.SIGKILL)
            stdout, stderr = process.communicate()
        return True, process.returncode, stdout, stderr


def diagnostic(value):
    return value[-8192:]


def task_prompt(path):
    return f"Find exact marker in {path}. Reply with marker only."


def run(args):
    models = args.models.split(",")
    if not models or any(not model or "/" not in model or model.startswith("/") or model.endswith("/") for model in models) or len(set(models)) != len(models):
        raise SystemExit("--models must be unique explicit provider/model IDs")
    out = Path(args.out).resolve()
    out.mkdir(parents=True, exist_ok=True)
    contents, manifest, manifest_sha = corpus_spec()
    plan = create_or_match_plan(out, build_plan(args, manifest, manifest_sha, selected_tasks(args.tasks, manifest)), args.resume)
    corpus = out / "corpus" if args.resume else write_corpus(out, contents, manifest)
    validate_corpus(corpus, plan)
    rows = read_rows(out, plan)
    complete = {row_key(row) for row in rows}
    total = len(keys(plan))
    raw = out / "raw-events"
    raw.mkdir(exist_ok=True)
    for binary, model, task, trial in sorted(pending_keys(plan, rows)):
        marker = next(item["answer"] for item in plan["tasks"] if item["id"] == task)
        file = next(item["file"] for item in plan["tasks"] if item["id"] == task)
        event_path = raw / f"{binary}--{model.replace('/', '_')}--{task}--{trial}.jsonl"
        require(not event_path.exists(), f"orphan raw events for {(binary, model, task, trial)}; refuse overwrite")
        fixture_path = (corpus / file).resolve()
        timeout, code, stdout, stderr = run_child([plan["binaries"][binary]["path"], "run", "--format", "json", "--auto", "--model", model, task_prompt(fixture_path)], corpus, plan["timeout_sec"])
        event_path.write_text(stdout, encoding="utf-8")
        stderr_path = event_path.with_suffix(event_path.suffix + ".stderr")
        stderr_path.write_text(stderr, encoding="utf-8")
        row = {"binary": binary, "model": model, "task": task, "run": trial, "raw_events": str(event_path.relative_to(out)), "raw_stderr": str(stderr_path.relative_to(out))}
        if timeout:
            row.update(outcome="timeout", error=f"timeout after {plan['timeout_sec']} seconds", stderr=diagnostic(stderr), read_calls=None, retries=None, tokens_input=None, tokens_output=None, cost=None)
        else:
            try:
                require(code == 0, f"unknown model outcome: process exited {code}: {stderr.strip()}")
                row.update(parse_trial(stdout, marker))
            except Invalid as error:
                row.update(outcome="failed", error=str(error), stderr=diagnostic(stderr), read_calls=None, retries=None, tokens_input=None, tokens_output=None, cost=None)
        append_row(out, row)
        complete.add(row_key(row))
        print(f"row {len(complete)}/{total} {binary} {model} {task} {trial} {row['outcome']}", flush=True)
    rows = read_rows(out, plan)
    report(rows, plan, out)
    if any(row["outcome"] != "success" for row in rows):
        raise SystemExit("trials failed closed; inspect raw-results.jsonl")


def report_only(args):
    out = Path(args.out).resolve()
    plan = load_plan(out / PLAN_NAME)
    validate_corpus(out / "corpus", plan)
    rows = read_rows(out, plan)
    report(rows, plan, out)
    if any(row["outcome"] != "success" for row in rows):
        raise SystemExit("trials failed closed; inspect raw-results.jsonl")


def self_test():
    tool = {"type": "tool_use", "part": {"type": "tool", "callID": "call-1", "tool": "read", "state": {"status": "completed", "input": {}, "output": "x"}}}
    text = {"type": "text", "part": {"type": "text", "text": "MARKER"}}
    finish = {"type": "step_finish", "part": {"type": "step-finish", "cost": 1, "tokens": {"input": 2, "output": 3}}}
    assert parse_trial("\n".join(json.dumps(item) for item in (tool, text, finish)), "MARKER")["outcome"] == "success"
    timed_out, code, stdout, stderr = run_child(["/bin/sh", "-c", "printf out; printf err >&2"], ".", 1)
    assert not timed_out and code == 0 and stdout == "out" and stderr == "err"
    timed_out, _, _, _ = run_child(["/bin/sh", "-c", "sleep 60"], ".", 0.01)
    assert timed_out
    prompt = task_prompt(Path("/tmp/read-agent/corpus/tail-marker.txt"))
    assert "/tmp/read-agent/corpus/tail-marker.txt" in prompt and "offset" not in prompt and "limit" not in prompt
    manifest = {"tasks": [{"id": "tail"}, {"id": "middle"}]}
    assert [task["id"] for task in selected_tasks("middle", manifest)] == ["middle"]
    for value in ("", "missing", "tail,tail"):
        try:
            selected_tasks(value, manifest)
        except Invalid:
            continue
        raise AssertionError(f"invalid task selection: {value}")
    with tempfile.TemporaryDirectory() as directory:
        out = Path(directory)
        plan = {"format": 1, "binaries": {}, "models": ["x/y"], "tasks": [{"id": "task", "file": "x", "answer": "MARKER"}], "fixtures": [], "manifest_sha256": hashlib.sha256(b"{}").hexdigest(), "runs": 1, "timeout_sec": 1}
        (out / PLAN_NAME).write_text(json.dumps(plan), encoding="utf-8")
        try:
            create_or_match_plan(out, {**plan, "runs": 2}, True)
        except Invalid:
            pass
        else:
            raise AssertionError("plan mismatch rejection")
        malformed = out / ROWS_NAME
        malformed.write_text("not-json\n", encoding="utf-8")
        duplicate = json.dumps({"binary": "baseline", "model": "x/y", "task": "task", "run": 0, "outcome": "timeout", "error": "timeout"}) + "\n"
        for content, name in (("not-json\n", "malformed row"), (duplicate * 2, "duplicate row")):
            malformed.write_text(content, encoding="utf-8")
            try:
                read_rows(out, plan)
            except Invalid:
                continue
            raise AssertionError(name)
        timeout_row = {"binary": "baseline", "model": "x/y", "task": "task", "run": 0, "outcome": "timeout", "error": "timeout after 1 seconds", "read_calls": None, "retries": None, "tokens_input": None, "tokens_output": None, "cost": None}
        malformed.write_text(json.dumps(timeout_row) + "\n", encoding="utf-8")
        rows = read_rows(out, plan)
        assert rows[0]["outcome"] != "success"
        try:
            require_complete(rows, plan)
        except Invalid:
            pass
        else:
            raise AssertionError("partial report refusal")
        assert pending_keys(plan, rows) == {("candidate", "x/y", "task", 0)}
        subset_plan = {**plan, "tasks": [{"id": "task", "file": "x", "answer": "MARKER"}]}
        subset_rows = [
            {"binary": binary, "model": "x/y", "task": "task", "run": 0, "outcome": "timeout", "error": "timeout"}
            for binary in ("baseline", "candidate")
        ]
        malformed.write_text("".join(json.dumps(row) + "\n" for row in subset_rows), encoding="utf-8")
        require_complete(read_rows(out, subset_plan), subset_plan)
        malformed.write_text(json.dumps({**subset_rows[0], "task": "unselected"}) + "\n", encoding="utf-8")
        try:
            read_rows(out, subset_plan)
        except Invalid:
            pass
        else:
            raise AssertionError("subset expected-row validation")
        all_timeout = [
            {"binary": binary, "model": "x/y", "task": "task", "run": 0, "outcome": "timeout", "error": "timeout", "read_calls": None, "retries": None, "tokens_input": None, "tokens_output": None, "cost": None}
            for binary in ("baseline", "candidate")
        ]
        report(all_timeout, plan, out)
        assert "timeout:1" in (out / "report.md").read_text(encoding="utf-8")
        mixed = [
            {"binary": "baseline", "model": "x/y", "task": "task", "run": 0, "outcome": "success", "final": "MARKER", "tool_calls": [], "read_calls": 1, "retries": None, "tokens_input": None, "tokens_output": None, "cost": None},
            all_timeout[1],
        ]
        report(mixed, plan, out)
        report_text = (out / "report.md").read_text(encoding="utf-8")
        assert "success:1" in report_text and "timeout:1" in report_text
    print("bench-read-agent self-test: pass")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("command", choices=["run", "report"], nargs="?")
    parser.add_argument("--baseline")
    parser.add_argument("--candidate")
    parser.add_argument("--models")
    parser.add_argument("--tasks")
    parser.add_argument("--runs", type=int, default=1)
    parser.add_argument("--timeout-sec", type=int, default=180)
    parser.add_argument("--out")
    parser.add_argument("--resume", action="store_true")
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args()
    if args.self_test:
        self_test()
        return
    require(args.out, "--out required")
    if args.command == "report":
        report_only(args)
        return
    require(args.command == "run" and all((args.baseline, args.candidate, args.models)) and args.runs > 0 and args.timeout_sec > 0, "invalid evaluator arguments")
    run(args)


if __name__ == "__main__":
    main()
