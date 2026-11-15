#!/usr/bin/env python3
"""Summarize preserved consumer evidence. Never run Atlas or a native agent.

This program performs mechanical comparisons only. It is intentionally
conservative about body consumption: the authorized public inputs do not
supply the ownership.read response schema. An otherwise successful unknown
response remains UNKNOWN, rather than being converted into consumed content.
"""
from pathlib import Path
from datetime import datetime
import argparse
import base64
import hashlib
import json
import re
import sys

EXECUTION = "34269cf4-d631-41c5-a30b-85b0ec217390"
CANDIDATE = "e3a8ab8cf56dbff1ee91272df51ffa398d882aa1"
RELEASE = "db9b4235022c4df32fe3bfd4faeea8adcd69abb7"
PACKAGE = ("modules/atlas/docs/design/genesis-chatgpt-results/"
           "20261111-v3-fresh/s1/subslices/03-automation/native-package.json")
CASE_IDS = (
    "A-PERMITTED", "A-VIOLATION", "A-IMPACT", "S-FAILURE",
    "R-FAILURE", "B-ABSTAIN", "ENTRY-NAV",
)
PINS = {
    "scripts/atlas-consumer-bridge-v2.py":
        (7710, "461762d20372f8beec3bbfc1b0f5e7ff464872f4095a43f2987ff7e36724269b"),
    "scripts/prepare-consumer-dispatch.py":
        (3418, "c1bcddbe233a4e0ae53a38d2e5ebdfa53d82aab583d5d3d5f094d2f8002576d3"),
    "scripts/prepare-consumer-dispatch-v2.py":
        (4138, "47c30adf8cd8308549d338b560d6b9edd8f7d0f5e397b4aeec0e8032a286512c"),
    "scripts/run-native-final-prepare.py":
        (4275, "42be8809d41bb12f851e4048b8ee4ea346abda5e80eeef54704a1e4e06752a4e"),
    "payload/consumers/public-cases.json":
        (2568, "6f555dc22ea571bc2d6a683587cb320b7681b6bd22367a2f33e6fc8eb3741ab2"),
    "payload/consumers/public-bridge-protocol.md":
        (3285, "83ee13b6ee7a92ceb87be728640f028769e88be69eb72eebde2a33b7a2ad1839"),
    "payload/artifact-plan.json":
        (5017, "6bf70a5c448d65ec3a046aefc0b0b9db2f783dcd8573a2d2ea69487bec7ce9ad"),
    "payload/consumers/direct-read-supplement-v1.json":
        (1409, "cbcf7cdce494e2b07affb8cd95a0f80c0f23a64f49dcc98e292c78e4268bc85a"),
}
TIMEOUT_NOTICE = (
    "This is an observed timeout. Any returned stream is partial; "
    "no completed Atlas answer or domain result is asserted."
)
BASE64_NOTICE = (
    "A non-UTF-8 stream is represented by exact base64; original bytes "
    "are also preserved in the receipt files."
)
BUDGET_NOTICE = (
    "Actual CLI streams are preserved verbatim in the receipt files; "
    "no content was truncated or substituted as a completed Atlas answer."
)


class EvidenceError(Exception):
    """Missing or inconsistent evidence; not a semantic verdict."""


def need(condition, message):
    if not condition:
        raise EvidenceError(message)


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def encoded(value):
    return (json.dumps(value, ensure_ascii=False, indent=2,
                       allow_nan=False) + "\n").encode("utf-8")


def unique_object(pairs):
    result = {}
    for key, value in pairs:
        need(key not in result, "duplicate JSON property: " + key)
        result[key] = value
    return result


def invalid_constant(value):
    raise EvidenceError("non-standard JSON constant: " + value)


def parse_json(raw, label):
    try:
        return json.loads(raw, object_pairs_hook=unique_object,
                          parse_constant=invalid_constant)
    except (ValueError, UnicodeDecodeError, EvidenceError) as error:
        raise EvidenceError(label + ": invalid JSON: " + str(error)) from error


def as_object(value, label):
    need(isinstance(value, dict), label + ": expected JSON object")
    return value


def count(value, label, minimum=0):
    need(type(value) is int and value >= minimum,
         label + ": expected integer >= " + str(minimum))
    return value


def digest(value, label, length=64):
    need(isinstance(value, str)
         and re.fullmatch("[0-9a-f]{" + str(length) + "}", value) is not None,
         label + ": invalid lowercase hexadecimal digest")
    return value


def instant(value, label):
    need(isinstance(value, str), label + ": missing timestamp")
    try:
        result = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as error:
        raise EvidenceError(label + ": invalid ISO timestamp") from error
    need(result.tzinfo is not None, label + ": timezone required")
    return result


def no_symlinks(path):
    for component in [path, *path.parents]:
        need(not component.is_symlink(), "symlink not accepted: " + str(component))


class Records:
    def __init__(self, root):
        self.root = root
        self.cache = {}
        self.directories = {}

    def path(self, relative):
        part = Path(relative)
        need(not part.is_absolute() and ".." not in part.parts,
             "unsafe evidence path: " + str(relative))
        need(not any(x.lower() in {"oracle", "oracles", "reserved"} for x in part.parts),
             "reserved evidence is outside helper scope")
        path = self.root / part
        no_symlinks(path)
        return path

    def raw(self, relative):
        name = Path(relative).as_posix()
        if name not in self.cache:
            path = self.path(name)
            need(path.is_file(), "missing evidence file: " + name)
            self.cache[name] = path.read_bytes()
        return self.cache[name]

    def obj(self, relative):
        return as_object(parse_json(self.raw(relative), relative), relative)

    def identity(self, relative):
        raw = self.raw(relative)
        return {"path": Path(relative).as_posix(), "bytes": len(raw), "sha256": sha(raw)}

    def check_identity(self, relative, record, path_value=None):
        as_object(record, str(relative) + ": identity")
        raw = self.raw(relative)
        need(type(record.get("bytes")) is int and record["bytes"] == len(raw),
             str(relative) + ": byte count mismatch")
        need(record.get("sha256") == sha(raw), str(relative) + ": SHA-256 mismatch")
        if path_value is not None:
            need(record.get("path") == path_value, str(relative) + ": path mismatch")

    def bridge_inventory(self, relative):
        directory = self.path(relative)
        need(directory.is_dir(), "missing bridge directory: " + relative)
        patterns = ("call-*.json", "query-*.json", "call-*.stdout",
                    "call-*.stderr", "forward-*.json")
        names = sorted({path.name for pattern in patterns for path in directory.glob(pattern)})
        self.directories[relative] = (patterns, names)
        return names

    def stable(self):
        for relative, original in self.cache.items():
            path = self.path(relative)
            need(path.is_file() and path.read_bytes() == original,
                 "evidence changed during summary: " + relative)
        for relative, (patterns, names) in self.directories.items():
            directory = self.path(relative)
            current = sorted({p.name for pattern in patterns for p in directory.glob(pattern)})
            need(current == names, "bridge inventory changed during summary: " + relative)


def stream(raw):
    try:
        return raw.decode("utf-8", errors="strict"), None
    except UnicodeDecodeError:
        return None, base64.b64encode(raw).decode("ascii")


def stream_json(raw):
    text, b64 = stream(raw)
    if text is None:
        return {"encoding": "base64", "json_state": "NON_UTF8", "json": None, "base64": b64}
    if not text.strip():
        return {"encoding": "utf-8", "json_state": "EMPTY", "json": None, "text": text}
    try:
        value = parse_json(text, "actual runtime stream")
    except EvidenceError:
        return {"encoding": "utf-8", "json_state": "INVALID_JSON", "json": None, "text": text}
    return {"encoding": "utf-8", "json_state": "JSON", "json": value}


def literal_statuses(observation):
    value = observation["json"]
    if not isinstance(value, dict):
        return {}
    return {name: value[name] for name in
            ("kind", "status", "state", "type", "_tag", "outcome", "reason", "error")
            if name in value}


def hold_marker(statuses):
    return any(isinstance(value, str) and value.casefold() == "hold"
               for key, value in statuses.items()
               if key in {"kind", "status", "state", "type", "_tag", "outcome"})


def observed_content(mode, query, complete_forward, code, stdout, stderr):
    """No unprovided ownership.read schema is guessed here."""
    if mode != "read":
        return {"consumed_body": False, "state": "NOT_A_READ", "key": None}
    key = query.get("key")
    if not complete_forward:
        state = "NO_COMPLETE_RUNTIME_FORWARD"
    elif code != 0:
        state = "CLI_DID_NOT_REPORT_SUCCESS"
    elif hold_marker(literal_statuses(stdout)) or hold_marker(literal_statuses(stderr)):
        state = "LITERAL_HOLD_REPORTED"
    elif any(bool(literal_statuses(x).get("error")) for x in (stdout, stderr)):
        state = "ERROR_FIELD_REPORTED"
    elif stdout["json_state"] != "JSON":
        state = "NO_STRUCTURED_UTF8_READ_RESPONSE"
    else:
        return {
            "consumed_body": "UNKNOWN",
            "state": "UNKNOWN_OWNERSHIP_READ_RESPONSE_SCHEMA",
            "key": key,
            "historical_requested": query.get("historical", False),
            "reason": (
                "A complete forward and CLI exit 0 are necessary but do not "
                "identify a body without the official ownership.read response schema."
            ),
        }
    return {"consumed_body": False, "state": state, "key": key}


def load_controls(records):
    for path, (size, expected) in PINS.items():
        raw = records.raw(path)
        need(len(raw) == size and sha(raw) == expected, "frozen authority drift: " + path)
    public = records.obj("payload/consumers/public-cases.json")
    plan = records.obj("payload/artifact-plan.json")
    supplement = records.obj("payload/consumers/direct-read-supplement-v1.json")
    need(public.get("execution_id") == EXECUTION and plan.get("execution_id") == EXECUTION,
         "execution identity mismatch")
    need(tuple(case["id"] for case in public["cases"]) == CASE_IDS,
         "expected the seven frozen public cases")
    limits = public["limits"]
    need((limits["max_index_calls_per_case"], limits["max_read_calls_per_case"],
          limits["max_returned_utf8_bytes_per_case"]) == (2, 5, 60000),
         "frozen quota mismatch")
    need(public.get("source_access") is False and public.get("oracle_access") is False
         and limits.get("source_access") is False and limits.get("oracle_access") is False,
         "public access boundary mismatch")
    artifacts = plan["artifacts"]
    keys = [row["key"] for row in artifacts]
    need(len(keys) == 12 and len(set(keys)) == 12, "expected twelve unique planned artifacts")
    need(supplement["original_artifact_plan"]["sha256"]
         == sha(records.raw("payload/artifact-plan.json")),
         "supplement/original-plan pin mismatch")
    need(supplement["public_cases"]["sha256"]
         == sha(records.raw("payload/consumers/public-cases.json")),
         "supplement/public-question pin mismatch")
    need(supplement["build_graph_unchanged"] is True
         and supplement["public_cases"]["questions_and_quotas_unchanged"] is True,
         "supplement cannot change graph, questions or quotas")
    direct = {}
    for case in CASE_IDS:
        direct[case] = list(dict.fromkeys(
            plan["direct_use_case_plan"][case]
            + supplement["additional_required_direct_keys"].get(case, [])))
        need(set(direct[case]) <= set(keys), case + ": unplanned direct key")
        need(len(direct[case]) <= limits["max_read_calls_per_case"],
             case + ": direct keys cannot fit read quota")
    need(set().union(*(set(v) for v in direct.values())) == set(keys),
         "original plan plus supplement must cover all twelve keys")
    return public, plan, supplement, direct


def load_preparation(records):
    relative = "payload/receipts/native-prepare-final.json"
    record = records.obj(relative)
    root = records.root
    need(record.get("schema") == "s1-03-full-selection-native-prepare/v1",
         "missing actual full-selection preparation schema")
    need(type(record.get("artifact_count")) is int and record["artifact_count"] == 12,
         "actual preparation must contain twelve artifacts")
    need(record.get("source_root") == str(root / "native-source"),
         "preparation root differs; moved roots need their own runtime bindings")
    need(record.get("candidate_revision") == CANDIDATE and record.get("release_revision") == RELEASE,
         "preparation candidate/release mismatch")
    expected_command = [
        str(root / "runtime-preflight/bun-runtime/node_modules/.bin/bun"),
        "scripts/genesis-native.ts", "prepare", str(root / "native-source"),
        PACKAGE, str(root / "runtime-final/selection-prepared.json"),
    ]
    need(record.get("command") == expected_command, "actual prepare command mismatch")
    need(record.get("cwd") == str(root / "runtime-preflight/candidate/modules/atlas"),
         "actual prepare cwd mismatch")
    need(record.get("package_path") == PACKAGE, "preparation package path mismatch")
    digest(record.get("package_sha256"), "preparation package_sha256")
    count(record.get("package_bytes"), "preparation package_bytes", 1)
    digest(record.get("source_payload_commit"), "preparation source payload commit", 40)
    count(record.get("unique_input_count"), "preparation unique_input_count")
    need(type(record.get("timeout")) is bool, "preparation timeout must be boolean")
    need(type(record.get("prepared_file_exists")) is bool,
         "preparation prepared_file_exists must be boolean")
    code = record.get("exit_code")
    need((record["timeout"] and code is None)
         or (not record["timeout"] and type(code) is int),
         "preparation exit code/timeout mismatch")
    start = instant(record.get("started_utc"), "preparation start")
    end = instant(record.get("ended_utc"), "preparation end")
    need(end >= start, "preparation ends before it starts")
    expected_state = ("PREPARED" if code == 0 and record["prepared_file_exists"]
                      else "NOT_COMPLETED_TIMEOUT" if record["timeout"]
                      else "BLOCKED_ACTUAL_PREPARE")
    need(record.get("state") == expected_state, "preparation outcome mismatch")
    for channel in ("stdout", "stderr"):
        path = "payload/receipts/native-prepare-final." + channel
        need(record.get(channel + "_file") == "receipts/native-prepare-final." + channel,
             "preparation stream path mismatch: " + channel)
        raw = records.raw(path)
        need(type(record.get(channel + "_bytes")) is int
             and record[channel + "_bytes"] == len(raw)
             and record.get(channel + "_sha256") == sha(raw),
             "preparation stream identity mismatch: " + channel)
    error_observation = stream_json(records.raw("payload/receipts/native-prepare-final.stderr"))
    error_value = error_observation["json"]
    observed_error = error_value.get("error") if isinstance(error_value, dict) else None
    need(record.get("observed_error") == observed_error,
         "preparation observed_error differs from the preserved stderr")
    if record["prepared_file_exists"]:
        count(record.get("prepared_bytes"), "preparation reported prepared_bytes", 1)
        digest(record.get("prepared_sha256"), "preparation reported prepared_sha256")
    need(record.get("prepared_file") == str(root / "runtime-final/selection-prepared.json"),
         "preparation candidate-file path mismatch")
    return record, records.identity(relative), end


def expected_request(case, required, protocol):
    return (
        f'Você é um consumidor nativo independente do caso {case["id"]} da missão S1-03, execução {EXECUTION}. '
        'Seu contexto é novo, fork_turns none, sem produção, fontes brutas, oracle reservado, julgamentos ou respostas de outros consumidores. '
        'Não use ferramentas, filesystem ou rede. Não delegue. A principal executará somente suas consultas Atlas por ponte fiel. '
        'A separação é por contexto e instruções, sem alegação de sandbox técnico.\n\n'
        f'Pergunta pública congelada: {case["question"]}\n\n'
        'Chaves previstas para consulta direta neste caso, conforme o plano público e o suplemento de uso direto congelado antes dos consumidores: '
        + ', '.join(required) + '. As chaves não são evidência de conteúdo disponível.\n\n'
        + protocol
        + '\n\nPara pedir uma consulta, termine sua resposta visível com exatamente o JSON de uma operação, sem executar ferramenta. '
          'A principal responderá com o envelope literal da CLI; então escolha a próxima consulta necessária. '
          'Quando concluir as consultas previstas dentro da quota, entregue uma resposta final em português com base apenas no conteúdo efetivamente recebido, '
          'indicando limites e consultas. Não antecipe o resultado operacional nem resolva a pergunta com memória geral do produto. '
          'Comece agora pelo pedido index pertinente.\n'
    ).encode("utf-8")


def validate_freeze(records, case, required, prep_identity, prep_end, supplement):
    case_id = case["id"]
    base = "payload/consumers/" + case_id
    freeze = records.obj(base + "/request-freeze.json")
    need(freeze.get("schema") == "s1-03-public-consumer-request-freeze/v2"
         and freeze.get("case_id") == case_id, case_id + ": request freeze v2 required")
    need(freeze.get("state") == "PREPARED_NOT_DISPATCHED"
         and freeze.get("native_consumer_created") is False,
         case_id + ": request preparation is not dispatch evidence")
    need(freeze.get("required_fork_turns") == "none"
         and freeze.get("reserved_oracle_read_by_this_script") is False,
         case_id + ": fresh-context request declarations differ")
    need(freeze.get("required_direct_keys") == required,
         case_id + ": request must include the original map plus supplement")
    records.check_identity(base + "/request.txt", freeze.get("request"),
                           "consumers/" + case_id + "/request.txt")
    controls = freeze.get("public_controls")
    need(isinstance(controls, list), case_id + ": missing frozen public controls")
    for index, control in enumerate(controls):
        as_object(control, case_id + ": public control " + str(index))
    expected_paths = [
        "consumers/public-cases.json", "artifact-plan.json",
        "consumers/public-bridge-protocol.md", "consumers/direct-read-supplement-v1.json",
    ]
    need([row.get("path") for row in controls] == expected_paths,
         case_id + ": frozen control paths/order differ")
    for row in controls:
        records.check_identity("payload/" + row["path"], row, row["path"])
    records.check_identity("payload/receipts/native-prepare-final.json",
                           freeze.get("actual_prepare_receipt"),
                           "receipts/native-prepare-final.json")
    protocol = records.raw("payload/consumers/public-bridge-protocol.md").decode("utf-8")
    need(records.raw(base + "/request.txt") == expected_request(case, required, protocol),
         case_id + ": preserved request differs from the frozen v2 procedure")
    at = instant(freeze.get("at_utc"), case_id + ": request freeze time")
    need(at >= prep_end, case_id + ": request predates actual full prepare completion")
    need(at >= instant(supplement["frozen_at_utc"], "direct-read supplement time"),
         case_id + ": request predates the frozen supplement")
    return at


def validate_query(query, mode, remaining, label):
    as_object(query, label)
    allowed = {"scope", "need"} if mode == "index" else {
        "scope", "need", "key", "maxBytes", "section", "historical"}
    need(set(query) <= allowed and query.get("scope") == "orchestra.s1",
         label + ": forbidden query field or scope")
    if mode == "index":
        need(isinstance(query.get("need"), str) and bool(query["need"]),
             label + ": index need must be a nonempty string")
        return
    need(("key" in query) != ("need" in query), label + ": exactly one key or need required")
    selection = query.get("key", query.get("need"))
    need(isinstance(selection, str) and bool(selection), label + ": empty selection")
    maximum = count(query.get("maxBytes"), label + ": maxBytes", 1)
    need(maximum <= remaining, label + ": maxBytes exceeds remaining case byte quota")
    if "section" in query:
        need(isinstance(query["section"], str) and bool(query["section"]),
             label + ": section must be a nonempty string")
    if "historical" in query:
        need(type(query["historical"]) is bool, label + ": historical must be boolean")


def validate_call(records, case_id, number, previous_end, spent, counts, limits,
                  preparation, preparation_identity):
    base = "payload/consumers/" + case_id + "/bridge"
    name = f"call-{number:02}"
    label = case_id + "/" + name
    record = records.obj(base + "/" + name + ".json")
    need(record.get("schema") == "s1-03-real-atlas-consumer-bridge/v2"
         and record.get("bridge_version") == 2, label + ": bridge v2 receipt required")
    need(record.get("case_id") == case_id and type(record.get("call")) is int
         and record["call"] == number, label + ": case or sequence mismatch")
    mode = record.get("mode")
    need(mode in ("index", "read"), label + ": operation is outside public protocol")
    need(number != 1 or mode == "index", label + ": first operation must be index")
    quota = limits["max_" + mode + "_calls_per_case"]
    need(counts[mode] < quota, label + ": operation quota exceeded")
    remaining = limits["max_returned_utf8_bytes_per_case"] - spent
    need(remaining >= 1024, label + ": bridge would refuse exhausted byte quota")
    query = records.obj(base + f"/query-{number:02}.json")
    validate_query(query, mode, remaining, label)
    need(record.get("query") == query, label + ": receipt/query mismatch")
    query_raw = records.raw(base + f"/query-{number:02}.json")
    need(record.get("query_sha256") == sha(query_raw) and query_raw == encoded(query),
         label + ": query identity/bridge serialization mismatch")
    root = records.root
    need(record.get("bridge_procedure_path") == str(root / "scripts/atlas-consumer-bridge-v2.py"),
         label + ": bridge procedure path mismatch")
    bridge_size, bridge_hash = PINS["scripts/atlas-consumer-bridge-v2.py"]
    need(record.get("bridge_procedure_sha256") == bridge_hash
         and record.get("bridge_procedure_bytes") == bridge_size,
         label + ": bridge procedure identity mismatch")
    expected_command = [
        str(root / "runtime-preflight/bun-runtime/node_modules/.bin/bun"),
        "scripts/genesis-native.ts", mode, str(root / "native-source"),
        str(root / base / f"query-{number:02}.json"),
    ]
    need(record.get("command") == expected_command, label + ": actual CLI command mismatch")
    need(record.get("cwd") == str(root / "runtime-preflight/candidate/modules/atlas"),
         label + ": actual CLI cwd mismatch")
    need(record.get("candidate_revision") == CANDIDATE
         and record.get("source_root") == str(root / "native-source"),
         label + ": candidate/root mismatch")
    need(record.get("preparation_receipt_sha256") == preparation_identity["sha256"],
         label + ": preparation identity mismatch")
    need(record.get("prepared_file_exists") is preparation["prepared_file_exists"],
         label + ": preparation state differs")
    need(record.get("source_access_granted_to_consumer") is False
         and record.get("oracle_access_granted_to_consumer") is False
         and record.get("not_a_domain_case_pass") is True,
         label + ": access/verdict boundary differs")
    start = instant(record.get("started_utc"), label + ": start")
    end = instant(record.get("ended_utc"), label + ": end")
    need(start >= previous_end and end >= start, label + ": invocation order/timing mismatch")
    timed_out = record.get("timeout")
    need(type(timed_out) is bool and record.get("timeout_seconds") == 60,
         label + ": timeout metadata mismatch")
    code = record.get("exit_code")
    need((timed_out and code is None) or (not timed_out and type(code) is int),
         label + ": exit code/timeout mismatch")
    need(record.get("runtime_response_complete") is (not timed_out),
         label + ": completion flag mismatch")
    need(record.get("state") == ("CLI_TIMEOUT_NO_COMPLETION" if timed_out else "CLI_COMPLETED"),
         label + ": state/timeout mismatch")
    streams = {}
    decoded = {}
    observations = {}
    for channel in ("stdout", "stderr"):
        relative = base + "/" + name + "." + channel
        raw = records.raw(relative)
        text, b64 = stream(raw)
        need(record.get(channel + "_file") == name + "." + channel,
             label + ": stream filename mismatch")
        need(record.get("runtime_" + channel + "_bytes") == len(raw)
             and type(record.get("runtime_" + channel + "_bytes")) is int
             and record.get("runtime_" + channel + "_sha256") == sha(raw),
             label + ": stream identity mismatch: " + channel)
        need(channel in record and channel + "_base64" in record
             and record[channel] == text and record[channel + "_base64"] == b64,
             label + ": stream text/base64 is not a lossless representation: " + channel)
        if b64 is not None:
            need(base64.b64decode(b64, validate=True) == raw, label + ": base64 mismatch")
        streams[channel] = records.identity(relative)
        decoded[channel] = (text, b64)
        observations[channel] = stream_json(raw)
    forward = {
        "case_id": case_id, "call": number, "operation": mode,
        "query": query, "exit_code": code,
        "stdout": decoded["stdout"][0], "stderr": decoded["stderr"][0],
    }
    if timed_out:
        forward.update({
            "bridge_state": "CLI_TIMEOUT_NO_COMPLETION", "timeout_seconds": 60,
            "runtime_response_complete": False, "notice": TIMEOUT_NOTICE,
        })
    if decoded["stdout"][1] is not None or decoded["stderr"][1] is not None:
        forward.update({
            "stdout_base64": decoded["stdout"][1], "stderr_base64": decoded["stderr"][1],
            "non_utf8_stream_notice": BASE64_NOTICE,
        })
    unbounded = encoded(forward)
    within_budget = len(unbounded) <= remaining
    if not within_budget:
        forward = {
            "case_id": case_id, "call": number, "operation": mode,
            "bridge_state": "RESPONSE_NOT_FORWARDED_CASE_BYTE_LIMIT",
            "actual_response_utf8_bytes": len(unbounded),
            "remaining_utf8_bytes": remaining, "notice": BUDGET_NOTICE,
        }
    expected_forward = encoded(forward)
    forward_relative = base + f"/forward-{number:02}.json"
    raw_forward = records.raw(forward_relative)
    need(raw_forward == expected_forward, label + ": forwarded envelope differs from actual streams")
    need(len(raw_forward) <= remaining, label + ": actual forwarded bytes exceed quota")
    complete_forward = within_budget and not timed_out
    need(record.get("forwarded_runtime_response") is complete_forward
         and record.get("forwarded_partial_runtime_output") is (within_budget and timed_out),
         label + ": forwarding flags mismatch")
    need(type(record.get("returned_utf8_bytes")) is int
         and record["returned_utf8_bytes"] == len(raw_forward)
         and record.get("forward_sha256") == sha(raw_forward),
         label + ": forward byte/hash mismatch")
    total = spent + len(raw_forward)
    need(type(record.get("case_returned_utf8_bytes_total")) is int
         and record["case_returned_utf8_bytes_total"] == total,
         label + ": cumulative returned-byte count mismatch")
    content = observed_content(mode, query, complete_forward, code,
                               observations["stdout"], observations["stderr"])
    statuses = {channel: literal_statuses(value) for channel, value in observations.items()}
    if not within_budget:
        outcome = "RUNTIME_RESPONSE_NOT_FORWARDED_BYTE_LIMIT"
    elif timed_out:
        outcome = "TIMEOUT_PARTIAL_STREAMS_ONLY"
    elif any(hold_marker(value) for value in statuses.values()):
        outcome = "LITERAL_HOLD_REPORTED"
    elif code != 0:
        outcome = "CLI_NONZERO_EXIT"
    elif observations["stdout"]["json_state"] != "JSON":
        outcome = "CLI_COMPLETED_WITHOUT_STRUCTURED_UTF8_RESPONSE"
    else:
        outcome = "CLI_COMPLETED_STRUCTURED_RESPONSE_SCHEMA_UNCLASSIFIED"
    result = {
        "sequence": number, "operation": mode, "query": query,
        "direct_key_attempted": query.get("key") if mode == "read" else None,
        "need_selection_attempted": query.get("need") if mode == "read" else None,
        "historical_requested": query.get("historical", False),
        "section_navigation_proof": "UNKNOWN" if "section" in query else "NOT_REQUESTED",
        "started_utc": record["started_utc"], "ended_utc": record["ended_utc"],
        "exit_code": code, "timeout": timed_out, "outcome_observed": outcome,
        "literal_runtime_status_fields": statuses,
        "runtime_response_complete": not timed_out,
        "complete_runtime_envelope_in_forward_file": complete_forward,
        "native_delivery_of_forward_file_independently_attested": "UNKNOWN",
        "raw_streams": streams, "runtime_observation": observations,
        "pre_limit_envelope_utf8_bytes": len(unbounded),
        "forwarded_envelope_utf8_bytes": len(raw_forward),
        "case_forwarded_utf8_bytes_total": total,
        "body_content_observation": content,
        "proofs": {
            "receipt": records.identity(base + "/" + name + ".json"),
            "query": records.identity(base + f"/query-{number:02}.json"),
            "forward": records.identity(forward_relative),
        },
        "tokens": "UNKNOWN", "physical_model_attempts": "UNKNOWN", "cost": "UNKNOWN",
    }
    counts[mode] += 1
    return result, end, total


def capture_final(records, case_id):
    base = "payload/consumers/" + case_id
    relative = base + "/final-response.md"
    record = records.obj(base + "/final-capture.json")
    capture = as_object(record.get("capture"), case_id + ": final capture")
    need(capture.get("literal") is True, case_id + ": literal=true final capture required")
    agent = capture.get("agent_id")
    need(isinstance(agent, str) and bool(agent.strip()) and agent != "UNKNOWN",
         case_id + ": actual captured agent_id required")
    aliases = {
        "final-response.md", "consumers/" + case_id + "/final-response.md",
        relative, str(records.root / relative),
    }
    need(isinstance(capture.get("file"), str) and capture["file"] in aliases,
         case_id + ": final capture points to a different file")
    if "case_id" in record:
        need(record["case_id"] == case_id, case_id + ": final capture case mismatch")
    records.check_identity(relative, capture)
    raw = records.raw(relative)
    need(len(raw) > 0, case_id + ": empty final response")
    try:
        raw.decode("utf-8", errors="strict")
    except UnicodeDecodeError as error:
        raise EvidenceError(case_id + ": final response is not valid UTF-8") from error
    return {
        "agent_id": agent, "literal": True,
        "response": records.identity(relative),
        "capture_record": records.identity(base + "/final-capture.json"),
        "host_wire_checksum": "UNKNOWN",
        "agent_identity_basis": "Principal-preserved capture.agent_id; no host-log lookup.",
        "native_delivery_binding_independently_verified": "UNKNOWN",
    }


def summarize_case(records, case, required, public, supplement, preparation,
                   prep_identity, prep_end):
    case_id = case["id"]
    frozen = validate_freeze(records, case, required, prep_identity, prep_end, supplement)
    final = capture_final(records, case_id)
    base = "payload/consumers/" + case_id + "/bridge"
    inventory = records.bridge_inventory(base)
    calls = [name for name in inventory if name.startswith("call-") and name.endswith(".json")]
    need(bool(calls), case_id + ": no actual bridge receipts")
    for name in calls:
        need(re.fullmatch(r"call-[0-9]{2}\.json", name) is not None,
             case_id + ": noncanonical receipt filename: " + name)
    numbers = sorted(int(name[5:7]) for name in calls)
    need(numbers == list(range(1, len(numbers) + 1)), case_id + ": call numbering has a gap")
    expected = sorted(name for number in numbers for name in (
        f"call-{number:02}.json", f"query-{number:02}.json",
        f"call-{number:02}.stdout", f"call-{number:02}.stderr", f"forward-{number:02}.json"))
    need(inventory == expected, case_id + ": missing or orphaned query/stream/forward file")
    operations = []
    counts = {"index": 0, "read": 0}
    previous_end, spent = max(prep_end, frozen), 0
    for number in numbers:
        operation, previous_end, spent = validate_call(
            records, case_id, number, previous_end, spent, counts,
            public["limits"], preparation, prep_identity)
        operations.append(operation)
    attempted = list(dict.fromkeys(
        row["direct_key_attempted"] for row in operations if row["direct_key_attempted"] is not None))
    missing = [key for key in required if key not in attempted]
    need(not missing, case_id + ": required direct read not attempted: " + ", ".join(missing))
    unknown = sorted({row["direct_key_attempted"] for row in operations
                      if row["direct_key_attempted"] is not None
                      and row["body_content_observation"]["consumed_body"] == "UNKNOWN"})
    return {
        "case_id": case_id, "public_kind": case["kind"], "public_question": case["question"],
        "required_direct_keys_original_plus_supplement": required,
        "direct_keys_attempted": attempted, "required_direct_keys_not_attempted": missing,
        "direct_keys_with_confirmed_body_content": [],
        "direct_keys_with_unknown_body_content": unknown,
        "body_consumption_assessment": (
            "UNKNOWN_RESPONSE_SCHEMA" if unknown else "NO_CONFIRMED_BODY_CONTENT_IN_RECORDED_FORWARDS"),
        "queries_by_mode": counts, "forwarded_utf8_bytes": spent,
        "remaining_utf8_bytes": public["limits"]["max_returned_utf8_bytes_per_case"] - spent,
        "operations": operations, "final_native_response": final,
        "request_freeze": records.identity("payload/consumers/" + case_id + "/request-freeze.json"),
        "context_isolation": "Declared in frozen request; not an independently verified filesystem sandbox.",
        "domain_or_criterion_verdict": "NOT_EVALUATED",
        "tokens": "UNKNOWN", "physical_model_attempts": "UNKNOWN", "cost": "UNKNOWN",
    }


def cell(value):
    text = value if isinstance(value, str) else json.dumps(value, ensure_ascii=False, sort_keys=True)
    return text.replace("\\", "\\\\").replace("|", "\\|").replace("\r", "\\r").replace("\n", "\\n")


def markdown(summary):
    prep = summary["preparation"]
    lines = [
        "# Consolidação mecânica dos sete consumidores", "",
        "Este documento descreve evidências preservadas. Não emite juízo de domínio, critério, binding ou conclusão da missão.", "",
        "## Preparação e controles", "",
        f"- Preparação: {prep['receipt_identity']['path']}; SHA-256 {prep['receipt_identity']['sha256']}.",
        f"- Estado registrado: {prep['record']['state']}; exit code {prep['record']['exit_code']}; timeout {prep['record']['timeout']}.",
        "- Seleção: 12 artefatos; sete casos; mapa original mais suplemento de read de research-maintenance em R-FAILURE.",
        "- Limites por caso: 2 index, 5 read e 60.000 bytes UTF-8 do envelope encaminhado.",
        "- Bytes não são tokens. Tokens, tentativas físicas de modelo e custos: UNKNOWN.", "",
        "## Visão por caso", "",
        "| Caso | Index | Read | Bytes UTF-8 encaminhados | Chaves tentadas | Consumo de corpo |",
        "|---|---:|---:|---:|---|---|",
    ]
    for case in summary["cases"]:
        lines.append("| " + " | ".join(cell(x) for x in (
            case["case_id"], case["queries_by_mode"]["index"], case["queries_by_mode"]["read"],
            case["forwarded_utf8_bytes"], case["direct_keys_attempted"],
            case["body_consumption_assessment"])) + " |")
    for case in summary["cases"]:
        lines += ["", "## " + case["case_id"], "",
                  "Pergunta pública: " + cell(case["public_question"]), "",
                  "Chaves exigidas: " + cell(case["required_direct_keys_original_plus_supplement"]), "",
                  "| Nº | Operação | Seleção | Exit | Bytes do forward | Estado observado | Conteúdo |",
                  "|---:|---|---|---:|---:|---|---|"]
        for row in case["operations"]:
            selection = row["query"].get("key", row["query"].get("need"))
            lines.append("| " + " | ".join(cell(x) for x in (
                row["sequence"], row["operation"], selection, row["exit_code"],
                row["forwarded_envelope_utf8_bytes"], row["outcome_observed"],
                row["body_content_observation"]["state"])) + " |")
        lines += ["", "### Provas das operações", ""]
        for row in case["operations"]:
            lines.append(f"- Operação {row['sequence']}: " + cell(row["literal_runtime_status_fields"]))
            for channel, observation in row["runtime_observation"].items():
                if observation["json_state"] in ("INVALID_JSON", "NON_UTF8"):
                    lines.append("  - Stream " + channel + ": " + cell(observation))
            for proof in row["proofs"].values():
                lines.append(f"  - {proof['path']}: {proof['bytes']} bytes; SHA-256 {proof['sha256']}.")
            for proof in row["raw_streams"].values():
                lines.append(f"  - {proof['path']}: {proof['bytes']} bytes; SHA-256 {proof['sha256']}.")
        final = case["final_native_response"]
        lines += ["", "### FINAL preservado", "",
                  "- Agent id declarado pela captura: " + cell(final["agent_id"]) + "."]
        for key in ("response", "capture_record"):
            proof = final[key]
            lines.append(f"- {proof['path']}: {proof['bytes']} bytes; SHA-256 {proof['sha256']}.")
        lines += ["- literal=true conferido; bytes finais preservados sem normalizar LF.",
                  "- O helper não avalia o teor da resposta contra critérios ou oracle."]
    lines += [
        "", "## Limites", "",
        "- O schema formal de ownership.read não consta dos inputs autorizados do helper. Saídas estruturadas de exit 0 não reconhecidas permanecem UNKNOWN para consumo de corpo.",
        "- Um read tentado, um HOLD, um erro, um timeout ou um envelope suprimido por quota não é prova de corpo consumido.",
        "- As provas demonstram arquivos de forward completos e coerentes com os streams. A entrega nativa desses envelopes não possui atestado independente nestes inputs.",
        "- A identidade nativa final é a captura literal mantida pela principal; não foram consultados logs internos do host.",
        "- Os hashes e comandos da preparação são conferidos contra seus recibos/streams; nenhum pacote, corpo, CAS ou fonte de produto foi aberto para reexecutar sua validação.",
        "- Recusas anteriores à criação de um recibo da ponte não podem ser inventariadas a partir de arquivos inexistentes.",
        "- Nenhuma chamada Atlas ou de colaboração é criada por esta consolidação.",
        "", "O JSON acompanha as observações estruturadas integrais dos streams e as identidades de todos os arquivos lidos.", "",
    ]
    return "\n".join(lines).encode("utf-8")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("execution_root", help="Unmoved root bound by the actual preparation receipt.")
    parser.add_argument("new_destination", help="New output directory; parent must already exist.")
    args = parser.parse_args()
    try:
        root = Path(args.execution_root).absolute()
        destination = Path(args.new_destination).absolute()
        need(".." not in root.parts and ".." not in destination.parts, "paths must not contain '..'")
        no_symlinks(root)
        no_symlinks(destination)
        need(root.is_dir(), "execution root does not exist")
        need(not destination.exists(), "output destination already exists; refusing overwrite")
        need(destination.parent.is_dir(), "output parent directory must already exist")
        records = Records(root)
        public, plan, supplement, direct = load_controls(records)
        preparation, prep_identity, prep_end = load_preparation(records)
        cases = [summarize_case(records, case, direct[case["id"]], public, supplement,
                                preparation, prep_identity, prep_end)
                 for case in public["cases"]]
        agents = [case["final_native_response"]["agent_id"] for case in cases]
        need(len(set(agents)) == 7, "seven fresh consumers require seven distinct captured agent IDs")
        records.stable()
        helper_raw = Path(__file__).read_bytes()
        summary = {
            "schema": "s1-03-mechanical-consumer-summary/v1",
            "execution_id": EXECUTION, "artifact_count": 12, "case_count": 7,
            "evidence_state": "MECHANICALLY_CONSISTENT_FILES",
            "domain_or_criterion_verdict": "NOT_EVALUATED",
            "runtime_or_collaboration_calls_performed_by_helper": 0,
            "reserved_content_read_by_helper": False,
            "preparation": {
                "receipt_identity": prep_identity, "record": preparation,
                "independent_host_execution_attestation": "UNKNOWN",
                "package_and_prepared_file_contents_read_by_helper": False,
            },
            "public_limits": public["limits"],
            "required_direct_keys_by_case": direct,
            "all_twelve_planned_keys_have_a_required_direct_case": True,
            "cases": cases,
            "totals": {
                "recorded_bridge_operations": sum(len(case["operations"]) for case in cases),
                "index_operations": sum(case["queries_by_mode"]["index"] for case in cases),
                "read_operations": sum(case["queries_by_mode"]["read"] for case in cases),
                "forwarded_envelope_utf8_bytes": sum(case["forwarded_utf8_bytes"] for case in cases),
                "tokens": "UNKNOWN", "physical_model_attempts": "UNKNOWN", "cost": "UNKNOWN",
            },
            "read_response_schema": "UNKNOWN_NOT_PROVIDED_BY_AUTHORIZED_PUBLIC_INPUTS",
            "body_consumption_rule": "Complete forward is necessary; an unknown response schema never proves body consumption.",
            "helper_identity": {
                "file": Path(__file__).name, "bytes": len(helper_raw), "sha256": sha(helper_raw),
            },
            "input_identities": [records.identity(name) for name in sorted(records.cache)],
            "snapshot_limit": "Read bytes and inventories checked again before output; no claim about future changes.",
        }
        outputs = {
            "consumer-summary.json": encoded(summary),
            "consumer-summary.md": markdown(summary),
        }
        destination.mkdir()
        written = []
        for name, raw in outputs.items():
            with (destination / name).open("xb") as handle:
                handle.write(raw)
            written.append({"file": str(destination / name), "bytes": len(raw), "sha256": sha(raw)})
        print(json.dumps({"state": "MECHANICAL_REPORT_WRITTEN", "files": written},
                         ensure_ascii=False))
        return 0
    except (EvidenceError, OSError, KeyError, TypeError, UnicodeError) as error:
        print("consumer-summary: " + str(error), file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())

