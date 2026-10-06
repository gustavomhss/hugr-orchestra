#!/usr/bin/env python3
"""G1 goldens: the compact writer's JSON tables, the fixture ledgers' mutants, and verify/audit output per ledger.

Dev-only. It runs the Python/bash Relay oracle pinned in test/golden/ORACLE and writes committed goldens; TS tests
read them and never spawn Python. Run it from anywhere: `python3 packages/relay/test/golden/generate/ledger.py`.
Two consecutive runs must leave the tree byte-identical.

This file also holds the harness shared by audit.py, authoring.py and judge.py: the clean environment, the tool and
oracle-pin assertions, the oracle runners and the deterministic writers.

Outputs, every path relative to packages/relay (the cwd every oracle runs in, so paths in messages are stable):

- test/golden/json/escape.json, numbers.json, objects.json: rows `{input, ...}` where `input` is ASCII JSON text and
  the other members are what `jq -c` printed for it (`numbers.json` has `literal`, passed through, and `computed`,
  after `+ 0`). string.json: `relay_json_string` on each input, `{input, ok, value | stderr}`. decode.json:
  verify_ledger's `strict_json_loads`, `{input, ok, error?}`.
- test/fixtures/mutants/<name>.ledger.jsonl: the mutants of the fixture ledgers (see MUTANTS below).
- test/golden/ledger/<name>/ for every fixture and `mutant-<name>` for every mutant:
  - case.json `{ledger, keys}`: the ledger path and the RELAY_LEDGER_KEY of each extra verify mode;
  - verify.stdout, verify.exit, verify.stderr (only when nonempty): `verify_ledger.py` without a key;
  - verify.<mode>.stdout|exit|stderr: the same with the key of `keys[mode]`;
  - verify.json, verify.<mode>.json, problems.json, cost.json: `bin/relay <cmd> <ledger> --json` stdout, parsed
    (null when empty);
  - exits.json: the exit code of each of those commands; stderr.json (only when nonempty): their stderr, a Python
    traceback cut to its last line.
- test/golden/ledger/writer-<name>/: `bin/relay-note` appends. case.json `{sprint, key, bodies}` (sprint null: no
  file), outcomes.json `[{exit, stderr}]` per append (stderr informational), ledger.jsonl, verify.stdout|exit.
"""
import base64
import hashlib
import hmac
import importlib.util
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

PKG = Path(__file__).resolve().parents[3]
GOLDEN = PKG / "test" / "golden"
FIXTURES = PKG / "test" / "fixtures"
EPOCH = 1700000000
# The ledger key of every keyed golden. A test value, never a secret.
KEY = "relay-golden-ledger-key"
WRONG_KEY = "relay-golden-wrong-key"
REQUIRED_TOOLS = ("python3", "bash", "jq", "git", "openssl", "shasum")


# ---- harness ------------------------------------------------------------------------------------------------------

def enter_clean_env():
    """Re-exec under the equivalent of `env -i`, once; returns the run's scratch directory.

    The clean environment holds PATH (a fake `date` printing EPOCH first, then the tool directories), HOME (scratch),
    and three Python switches that keep the oracle deterministic and the tree clean: PYTHONHASHSEED=0,
    PYTHONDONTWRITEBYTECODE=1 and PYTHONUTF8=1. Oracle subprocesses get exactly that plus explicit RELAY_* values.
    """
    if os.environ.get("RELAY_GOLDEN_TMP"):
        return Path(os.environ["RELAY_GOLDEN_TMP"])
    found = {tool: shutil.which(tool) for tool in REQUIRED_TOOLS}
    missing = [tool for tool, where in found.items() if not where]
    if missing:
        sys.exit(f"golden generator: missing tools: {', '.join(missing)}")
    tmp = Path(tempfile.mkdtemp(prefix="relay-golden-"))
    (tmp / "bin").mkdir()
    (tmp / "home").mkdir()
    date = tmp / "bin" / "date"
    date.write_text(f"#!/bin/sh\nprintf '%s\\n' {EPOCH}\n")
    date.chmod(0o755)
    dirs = list(dict.fromkeys([str(Path(where).parent) for where in found.values()] + ["/usr/bin", "/bin"]))
    env = {"PATH": ":".join([str(tmp / "bin"), *dirs]), "HOME": str(tmp / "home"), "RELAY_GOLDEN_TMP": str(tmp),
           "PYTHONHASHSEED": "0", "PYTHONDONTWRITEBYTECODE": "1", "PYTHONUTF8": "1"}
    python = found["python3"]
    os.execve(python, [python, str(Path(sys.argv[0]).resolve()), *sys.argv[1:]], env)


def oracle_env(**relay):
    """The clean environment plus explicit values (RELAY_* and the like); never the caller's environment."""
    env = {name: os.environ[name] for name in ("PATH", "HOME", "PYTHONHASHSEED", "PYTHONDONTWRITEBYTECODE", "PYTHONUTF8")}
    env.update({name: str(value) for name, value in relay.items() if value is not None})
    return env


def assert_tools():
    """jq 1.7.x or 1.8.x (see ORACLE), Python 3.10+, bash, git, openssl and shasum, before anything is written."""
    jq = run(["jq", "--version"]).stdout.decode().strip()
    if not re.fullmatch(r"jq-1\.[78](\.\d+)?", jq):
        sys.exit(f"golden generator: jq 1.7.x or 1.8.x required, found {jq!r}")
    if sys.version_info < (3, 10):
        sys.exit("golden generator: Python 3.10+ required")
    for argv in (["bash", "--version"], ["git", "--version"], ["openssl", "version"], ["shasum", "--version"]):
        if run(argv).returncode != 0:
            sys.exit(f"golden generator: {argv[0]} is not usable")


def assert_oracle_pins():
    """Every `sha256 <hex> <path>` line of ORACLE must match the oracle file on disk."""
    pins = [line.split() for line in (GOLDEN / "ORACLE").read_text().splitlines() if line.startswith("sha256 ")]
    if not pins:
        sys.exit("golden generator: ORACLE pins no oracle file")
    drift = [path for _, digest, path in pins if hashlib.sha256((PKG / path).read_bytes()).hexdigest() != digest]
    if drift:
        sys.exit(f"golden generator: oracle files differ from ORACLE: {', '.join(drift)}")


def start():
    tmp = enter_clean_env()
    assert_tools()
    assert_oracle_pins()
    return tmp


def run(argv, cwd=PKG, env=None, stdin=None):
    return subprocess.run(argv, cwd=cwd, env=env if env is not None else oracle_env(), input=stdin,
                          capture_output=True, timeout=120)


def reset(directory):
    shutil.rmtree(directory, ignore_errors=True)
    directory.mkdir(parents=True)


def write_bytes(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)


def write_json(path, value):
    write_bytes(path, (json.dumps(value, indent=2, ensure_ascii=False) + "\n").encode())


def write_rows(path, rows):
    """One compact ASCII row per line, so table diffs stay readable."""
    write_bytes(path, ("[\n" + ",\n".join(json.dumps(row) for row in rows) + "\n]\n").encode())


def rel(path):
    return Path(path).relative_to(PKG).as_posix()


def parsed(stdout):
    text = stdout.decode()
    return json.loads(text) if text.strip() else None


def stderr_text(stderr):
    """Stderr as recorded: a Python traceback becomes its last line, since its frames carry absolute paths."""
    text = stderr.decode()
    if "Traceback (most recent call last)" in text:
        return [line for line in text.splitlines() if line.strip()][-1]
    return text


def load_module(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def seal(events, key=None, legacy=False, spaced=False, raw_extra=None, gen=0, start_prev="GENESIS", seqs=None,
         mac=None):
    """Chain bodies in relay_chain_append's member order: the event, then gen, prev, seq and mac, then the final h.

    `legacy` drops gen and mac (pre-mac ledgers); `raw_extra` is spliced in literally just before h, so ambiguous or
    non-JSON bytes are sealed exactly as written; `seqs` and `mac` override the recorded seq and algorithm name.
    """
    lines, prev = [], start_prev
    for n, event in enumerate(events):
        chain = {"prev": prev, "seq": n if seqs is None else seqs[n]}
        if not legacy:
            chain = {"gen": gen, **chain, "mac": mac or ("hmac-sha256" if key else "sha256")}
        body = json.dumps({**event, **chain}, separators=(", ", ": ") if spaced else (",", ":"), ensure_ascii=False)
        if raw_extra is not None:
            body = body[:-1] + "," + raw_extra + "}"
        digest = (hmac.new(key.encode(), body.encode(), hashlib.sha256).hexdigest() if key
                  else hashlib.sha256(body.encode()).hexdigest())
        lines.append(body[:-1] + ',"h":' + json.dumps(digest) + "}")
        prev = digest
    return ("\n".join(lines) + "\n").encode() if lines else b""


def verify_ledger(target, key=None):
    return run([sys.executable, "benchmark/verify_ledger.py", target], env=oracle_env(RELAY_LEDGER_KEY=key))


def relay_cli(*args, key=None):
    return run([sys.executable, "bin/relay", *args], env=oracle_env(RELAY_LEDGER_KEY=key))


def record_audit(out, target, verify_args=(), keys=None):
    """verify/problems/cost --json for one target, written as <cmd>.json plus exits.json and stderr.json."""
    exits, errors = {}, {}
    runs = [("verify", relay_cli("verify", target, *verify_args, "--json"))]
    runs += [(f"verify.{mode}", relay_cli("verify", target, *verify_args, "--json", key=key))
             for mode, key in (keys or {}).items()]
    runs += [(cmd, relay_cli(cmd, target, "--json")) for cmd in ("problems", "cost")]
    for name, result in runs:
        write_json(out / f"{name}.json", parsed(result.stdout))
        exits[name] = result.returncode
        if result.stderr:
            errors[name] = stderr_text(result.stderr)
    write_json(out / "exits.json", exits)
    if errors:
        write_json(out / "stderr.json", errors)


def record_verify(out, target, mode=None, key=None):
    result = verify_ledger(target, key)
    stem = "verify" if mode is None else f"verify.{mode}"
    write_bytes(out / f"{stem}.stdout", result.stdout)
    write_bytes(out / f"{stem}.exit", f"{result.returncode}\n".encode())
    if result.stderr:
        write_bytes(out / f"{stem}.stderr", stderr_text(result.stderr).encode())


# ---- JSON tables --------------------------------------------------------------------------------------------------

ESCAPE_POINTS = [*range(0x80), 0x80, 0x9F, 0xA0, 0xAD, 0xE9, 0x7FF, 0x800, 0x2028, 0x2029, 0xD7FF, 0xE000, 0xFEFF,
                 0xFFFD, 0xFFFF, 0x10000, 0x1F600, 0x10FFFF]
ESCAPE_EXTRA = ['"\\ud800"', '"\\udc00"', '"\\udc00\\ud800"', '"a\\ud800b"', '""',
                json.dumps("mixed \x00\x1f\x7f\"\\/\b\f\n\r\t\u2028\u2029\U0001F600 é end")]
ARG_BYTES = [b"\xed\xa0\x80", b"\xff", b"a\xc3", b"\xf4\x90\x80\x80", b"\xc0\x80", b"ok \xe2\x80\xa8 \x7f"]
NUMBERS = ["0", "-0", "1", "-1", "7", "42", "2147483647", "2147483648", "-2147483649", "4294967296",
           "9007199254740991", "9007199254740992", "9007199254740993", "-9007199254740993", "99999999999999999",
           "100000000000000000", "1000000000000000000", "12345678901234567890", "0.0", "1.0", "1.000", "1.5", "-1.25",
           "0.1", "1e2", "1E2", "1e-2", "1E+2", "100e-2", "1e17", "1e999", "-1e999", "5e-324", "1.7976931348623157e308"]
OBJECTS = ['{}', '[]', 'null', 'true', 'false', '"s"', '{"b":1,"a":2}', '{"2":"two","1":"one","10":"ten","a":"a"}',
           '{"a":1,"a":2}', '{"a":1,"b":2,"a":3}', '{"\\u0068":1}', '{"\\u00e9":"key","\\ud83d\\ude00":"astral"}',
           '{ "a" : [ 1 , { "b" : null } ] , "c" : "d" }', '[1,[2,[3,[]]],{}]', '{"nested":{"h":"x","rows":[{"h":"y"}]}}',
           '{"":"empty key"}', '{"a":"\\u007f","b":"\\u2028"}']
JSON_STRINGS = ['"abc"', 'null', '"a\\nb\\n"', '"\\t"', '""', '"\\n"', '"x\\r\\n"', '"\\u00e9"', '"\\ud83d\\ude00"',
                '"\\u2028"', '  "padded"  ', '"\\u0000"', '"a\\u0000b"', '1', 'true', '{}', '[]', '["a"]',
                '"a" "b"', '', '"unterminated', '"\\ud800"']
DECODE = ['{"a":1}', '{"a":1,"a":2}', '{"a":1,"\\u0061":2}', '{"d":{"n":1,"n":2}}', '[{"n":1,"\\u006e":2}]',
          '{"h":"x","\\u0068":"y"}', 'NaN', '[NaN]', '{"v":Infinity}', '-Infinity', '{"v":-Infinity}', '"NaN"',
          '["Infinity","-Infinity"]', '1e999', '-0', '0.5', ' {"a":1} ', '{broken', '[]', '"s"', '3', 'null', '',
          '{"a":1} {"b":2}', '{"a":1,}', "{'a':1}", '{"a":01}', '{"a":"\\x"}', '{"a":"\t"}', '{"\\ud800":1}',
          '{"a":nan}', '{"a":infinity}', '{"a":true,"b":false,"c":null}']


def jq_each(program, text):
    """`jq -c <program>` over one input: its printed line, or the parse error jq refused it with."""
    result = run(["jq", "-c", program], stdin=(text + "\n").encode())
    if result.returncode != 0:
        return {"error": result.stderr.decode()}
    lines = result.stdout.split(b"\n")
    if len(lines) != 2 or lines[1]:
        sys.exit(f"golden generator: jq {program!r} printed {result.stdout!r} for {text!r}")
    return {"output": lines[0].decode()}


def generate_json_tables():
    out = GOLDEN / "json"
    reset(out)
    escapes = [json.dumps(chr(point)) for point in ESCAPE_POINTS] + ESCAPE_EXTRA
    rows = [{"input": text, **jq_each(".", text)} for text in escapes]
    # Text reaches jq through --arg as bytes too (fails, reasons); jq replaces invalid UTF-8 rather than refusing it.
    for raw in ARG_BYTES:
        result = run(["jq", "-nc", "--arg", "v", raw, "$v"])
        rows.append({"arg": {"base64": base64.b64encode(raw).decode()}, "output": result.stdout.decode().rstrip("\n")})
    write_rows(out / "escape.json", rows)
    write_rows(out / "numbers.json", [{"input": text, "literal": jq_each(".", text).get("output"),
                                       "computed": jq_each(". + 0", text).get("output")} for text in NUMBERS])
    write_rows(out / "objects.json", [{"input": text, **jq_each(".", text)} for text in OBJECTS])
    script = '. "$1"; relay_json_string out "$2" || exit 1; printf "%s" "$out"'
    rows = []
    for text in JSON_STRINGS:
        result = run(["bash", "-c", script, "_", "lib/relay-gate.sh", text])
        rows.append({"input": text, "ok": True, "value": result.stdout.decode()} if result.returncode == 0
                    else {"input": text, "ok": False, "stderr": result.stderr.decode()})
    write_rows(out / "string.json", rows)
    verifier = load_module("relay_golden_verifier", PKG / "benchmark" / "verify_ledger.py")
    rows = []
    for text in DECODE:
        try:
            verifier.strict_json_loads(text)
            rows.append({"input": text, "ok": True})
        except ValueError as error:
            rows.append({"input": text, "ok": False, "error": str(error)})
    write_rows(out / "decode.json", rows)


# ---- mutants ------------------------------------------------------------------------------------------------------

BASE = "tdd-feature-live"


def splice(lines):
    return b"".join(line + b"\n" for line in lines)


def flip(line, offset, mask):
    return line[:offset] + bytes([line[offset] ^ mask]) + line[offset + 1:]


def after_h(line, suffix):
    """An unsigned member appended after the final root h: the attacker has bytes, not the key."""
    return line[:-1] + b"," + suffix + b"}"


def without_h(line):
    return line[:line.rfind(b',"h":')] + b"}"


def control(**extra):
    return {"wp": "wp1", "i": 0, "event": "checklist-item", "item": "C1", "assert": "real control", "verdict": "pass",
            "graded_by": "deterministic", "oracle": hashlib.sha256(b"true").hexdigest(), "origin": "sprint", **extra}


COMPLETE = {"wp": "wp1", "i": 0, "event": "sprint-complete", "retry": 0, "fails": "", "reg": ""}


def in_place_mutants(base):
    """Edits of the base fixture's bytes, never resealed."""
    lines = base.split(b"\n")[:-1]
    first, second = lines[0], lines[1]
    event_at = second.index(b'"event":"') + len(b'"event":"')
    digest = json.loads(first)["h"].encode()
    return {
        "byte-flip": splice([first, flip(second, event_at, 0x20), *lines[2:]]),
        "invalid-utf8": splice([flip(first, 2, 0x80), *lines[1:]]),
        "line-swap": splice([first, lines[2], second, *lines[3:]]),
        "line-deleted": splice([first, second, *lines[3:]]),
        "line-replayed": splice([first, second, second, *lines[2:]]),
        "head-deleted": splice(lines[1:]),
        "tail-truncated": splice(lines[:-1]),
        "duplicate-key": splice([first, after_h(second, b'"verdict":"pass"'), *lines[2:]]),
        "duplicate-key-escaped-h": splice([after_h(first, b'"\\u0068":"' + digest + b'"'), *lines[1:]]),
        "duplicate-key-nested-escaped": splice([after_h(first, b'"data":{"n":1,"\\u006e":2}'), *lines[1:]]),
        "unsigned-after-h": splice([after_h(first, b'"unsigned":true'), *lines[1:]]),
        "missing-h": splice([without_h(first), *lines[1:]]),
        "h-uppercase": splice([first.replace(digest, digest.upper()), *lines[1:]]),
        "nested-h-only": splice([without_h(first)[:-1] + b',"data":{"h":"' + digest + b'"}}', *lines[1:]]),
        "crlf": base.replace(b"\n", b"\r\n"),
        "cr": base.replace(b"\n", b"\r"),
        "blank-lines": b"\n" + b"\n  \n\t\n".join(lines) + b"\n\n",
        "trailing-space": b"".join(line + b" \t \n" for line in lines),
        "no-final-newline": base[:-1],
        "empty": b"",
        "whitespace-only": b"\n \n\t\n",
    }


def sealed_mutants():
    """Small chains sealed on purpose, so the verifier's later checks are reached with a valid MAC."""
    done = [control(), COMPLETE]
    nested = control(data={"h": "nested data, not the root digest", "rows": [{"h": "also data"}]})
    return {
        "sealed-seq-gap": seal(done, seqs=[0, 2]),
        "sealed-seq-float": seal(done, seqs=[0.0, 1]),
        "sealed-seq-bool": seal(done, seqs=[False, 1]),
        "sealed-prev-wrong": seal(done[:1]) + seal(done[1:], seqs=[1]),
        "sealed-mac-unknown": seal(done, mac="md5"),
        "sealed-event-empty": seal([{**COMPLETE, "event": ""}]),
        "sealed-event-missing": seal([{key: value for key, value in COMPLETE.items() if key != "event"}]),
        "sealed-duplicate-key": seal(done, raw_extra='"verdict":"pass"'),
        "sealed-duplicate-key-escaped": seal(done, raw_extra='"\\u0076erdict":"pass"'),
        "sealed-duplicate-key-escaped-h": seal(done, raw_extra='"\\u0068":"body-reserved-field"'),
        "sealed-duplicate-key-nested": seal(done, raw_extra='"data":{"n":1,"n":2}'),
        "sealed-nested-h": seal([nested, COMPLETE]),
        "sealed-nested-h-spaced": seal([nested, COMPLETE], spaced=True),
        "sealed-nan": seal(done, spaced=True, raw_extra='"data":{"value":NaN}'),
        "sealed-infinity": seal(done, spaced=True, raw_extra='"data":[Infinity]'),
        "sealed-negative-infinity": seal(done, spaced=True, raw_extra='"data":{"value":-Infinity}'),
        "sealed-numbers": seal(done, spaced=True, raw_extra='"data":{"numbers":[0,-0,17,-42,0.5,-1.25,1e2,1E-2,1e999],'
                                                        '"strings":["NaN","Infinity","-Infinity"]}'),
        "sealed-legacy": seal(done, legacy=True),
        "sealed-keyed": seal(done, key=KEY),
        "sealed-keyed-spaced": seal(done, key=KEY, spaced=True),
        "raw-broken": b"{broken\n",
        "raw-array": b"[]\n",
        "raw-null": b"null\n",
        "raw-string": b'"string"\n',
        "raw-number": b"3\n",
        "raw-empty-object": b"{}\n",
    }


def note(cwd, ledger, sprint, body, key=None):
    return run(["bash", str(PKG / "bin" / "relay-note"), ledger, sprint, body], cwd=cwd,
               env=oracle_env(RELAY_LEDGER_KEY=key))


def rechain(tmp, base, keys):
    """The base fixture's bodies re-appended through the real writer (`relay-note`), one key per line."""
    work = Path(tempfile.mkdtemp(dir=tmp))
    (work / "sprint.json").write_text('{"work_packages":[]}')
    for line, key in zip(base.split(b"\n")[:-1], keys):
        entry = json.loads(line)
        body = {name: value for name, value in entry.items() if name not in ("gen", "prev", "seq", "mac", "h")}
        result = note(work, "ledger.jsonl", "sprint.json", json.dumps(body, separators=(",", ":"), ensure_ascii=False),
                      key)
        if result.returncode != 0:
            sys.exit(f"golden generator: relay-note refused a fixture body: {result.stderr.decode()}")
    return (work / "ledger.jsonl").read_bytes()


# Mutants verified under more than the plain mode: a keyed chain without and with the key, and plain chains with one.
KEYED_MODES = {"keyed": KEY, "wrong-key": WRONG_KEY}
MODES = {BASE: {"keyed": KEY}, "mutant-keyed": KEYED_MODES, "mutant-keyed-mixed": KEYED_MODES,
         "mutant-sealed-keyed": KEYED_MODES, "mutant-sealed-keyed-spaced": KEYED_MODES,
         "mutant-sealed-legacy": {"keyed": KEY}, "mutant-sealed-nested-h": {"keyed": KEY}}


def generate_mutants(tmp):
    out = FIXTURES / "mutants"
    reset(out)
    base = (FIXTURES / f"{BASE}.ledger.jsonl").read_bytes()
    count = len(base.split(b"\n")) - 1
    # The real writer must reproduce the recorded fixture from its bodies, or the keyed copies below are not copies.
    if rechain(tmp, base, [None] * count) != base:
        sys.exit(f"golden generator: relay-note does not reproduce {BASE} from its bodies")
    mutants = {**in_place_mutants(base), **sealed_mutants(),
               "keyed": rechain(tmp, base, [KEY] * count),
               # A keyed chain whose fourth line was appended without the key: a downgrade mid-chain.
               "keyed-mixed": rechain(tmp, base, [KEY, KEY, KEY, None, *[KEY] * (count - 4)])}
    for name, data in mutants.items():
        write_bytes(out / f"{name}.ledger.jsonl", data)
    return sorted(mutants)


# ---- ledger goldens -----------------------------------------------------------------------------------------------

def generate_ledger_goldens(mutants):
    out = GOLDEN / "ledger"
    for entry in out.glob("*"):
        if not entry.name.startswith("writer-"):
            shutil.rmtree(entry)
    fixtures = sorted(path.name.removesuffix(".ledger.jsonl") for path in FIXTURES.glob("*.ledger.jsonl"))
    targets = [(name, f"test/fixtures/{name}.ledger.jsonl") for name in fixtures]
    targets += [(f"mutant-{name}", f"test/fixtures/mutants/{name}.ledger.jsonl") for name in mutants]
    for name, target in targets:
        case = out / name
        keys = MODES.get(name, {})
        write_json(case / "case.json", {"ledger": target, "keys": keys})
        record_verify(case, target)
        for mode, key in keys.items():
            record_verify(case, target, mode, key)
        record_audit(case, target, keys=keys)


# ---- writer goldens -----------------------------------------------------------------------------------------------

BODIES = [
    '{"event":"note","s":"plain"}',
    '{"event":"note","esc":"\\u0000\\u0001\\u001f\\u007f\\"\\\\\\/\\b\\f\\n\\r\\t","u2028":"\\u2028\\u2029",'
    '"astral":"\\ud83d\\ude00","latin":"\\u00e9"}',
    '{"event":"note","raw":"é😀\u2028·"}',
    '{ "event" : "note" , "spaced" : [ 1 , 2 ] , "nested" : { "a" : null } }',
    '{"event":"note","n":[0,-0,1,-1,9007199254740993,12345678901234567890,1.0,1.5,1E2,1e-2]}',
    '{"event":"note","order":{"b":1,"a":2,"2":3,"1":4}}',
    '{"event":"note","data":{"h":"nested","rows":[{"h":"x"}]}}',
    '{"event":"note","bool":true,"nil":null,"empty":{},"list":[]}',
    '{"event":"note","dup":1,"dup":2}',
    '{"event":"note","\\u0068ash":"escaped key","gen":"body gen is overwritten","seq":99}',
]
SIMPLE = ['{"event":"note","wp":"wp1"}', '{"event":"sprint-complete","wp":"wp1"}']
REFUSED = ['{"h":"top-level h is reserved"}', '{"\\u0068":"escaped top-level h"}', '[]', '"string"', '3', 'null',
           '{"a":1} {"b":2}', '{broken', '', '{"lone":"\\ud800"}', '{"event":"accepted","data":{"h":"nested h is data"}}']
WRITERS = {
    "writer-plain": {"sprint": {"work_packages": []}, "key": None, "bodies": BODIES},
    "writer-keyed": {"sprint": {"work_packages": []}, "key": KEY, "bodies": BODIES},
    "writer-gen": {"sprint": {"gen": 7, "work_packages": []}, "key": None, "bodies": SIMPLE},
    "writer-gen-string": {"sprint": {"gen": "7", "work_packages": []}, "key": None, "bodies": SIMPLE},
    "writer-gen-negative": {"sprint": {"gen": -1, "work_packages": []}, "key": None, "bodies": SIMPLE},
    "writer-gen-float": {"sprint": {"gen": 7.0, "work_packages": []}, "key": None, "bodies": SIMPLE},
    "writer-gen-null": {"sprint": {"gen": None, "work_packages": []}, "key": None, "bodies": SIMPLE},
    "writer-gen-no-sprint": {"sprint": None, "key": None, "bodies": SIMPLE},
    "writer-refusals": {"sprint": {"work_packages": []}, "key": None, "bodies": REFUSED},
}


def generate_writer_goldens(tmp):
    out = GOLDEN / "ledger"
    for entry in out.glob("writer-*"):
        shutil.rmtree(entry)
    for name, case in WRITERS.items():
        work = Path(tempfile.mkdtemp(dir=tmp))
        if case["sprint"] is not None:
            (work / "sprint.json").write_text(json.dumps(case["sprint"]))
        outcomes = []
        for body in case["bodies"]:
            result = note(work, "ledger.jsonl", "sprint.json", body, case["key"])
            outcomes.append({"exit": result.returncode, "stderr": result.stderr.decode()})
        target = out / name
        write_json(target / "case.json", case)
        write_json(target / "outcomes.json", outcomes)
        ledger = work / "ledger.jsonl"
        write_bytes(target / "ledger.jsonl", ledger.read_bytes() if ledger.exists() else b"")
        record_verify(target, rel(target / "ledger.jsonl"), None, case["key"])


def main():
    tmp = start()
    try:
        generate_json_tables()
        mutants = generate_mutants(tmp)
        generate_ledger_goldens(mutants)
        generate_writer_goldens(tmp)
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


if __name__ == "__main__":
    main()
