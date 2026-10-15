"""Regression for bin/relay-spec.py — the executable-spec library (Relay Roadmap R3).

Drives the REAL relay-spec.py via subprocess. Asserts the catalog (list/show), that instantiate
substitutes ${params}, that a missing param fails loudly, and — the load-bearing claim — that a
rendered spec is schema-valid for the hook and actually runs through the REAL bin/relay-gate eval.

Every spec catalog used here is built in tmp_path and pointed at via $RELAY_SPECS_DIR, so the tests
never depend on (or mutate) the shipped specs/ — except test_shipped_catalog_*, which deliberately
exercises the real catalog read-only. Mirrors tests/test_corpus.py + tests/test_gate_cli.py style.
"""
import json
import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TOOL = ROOT / "bin" / "relay-spec.py"
GATE = ROOT / "bin" / "relay-gate"


# ---------- helpers -----------------------------------------------------------------------

def _base_env(extra=None):
    """Clean env with RELAY_* stripped, then layer on `extra`."""
    env = {k: v for k, v in os.environ.items() if not k.startswith("RELAY_")}
    env.pop("ANTHROPIC_API_KEY", None)
    if extra:
        env.update({k: str(v) for k, v in extra.items()})
    return env


def _spec(specs_dir, *args, expect_ok=None):
    """Run relay-spec.py against a given catalog; return CompletedProcess."""
    p = subprocess.run(
        [sys.executable, str(TOOL), "--specs", str(specs_dir), *args],
        capture_output=True, text=True, env=_base_env(),
    )
    if expect_ok is True:
        assert p.returncode == 0, f"expected success, got rc={p.returncode}\n{p.stderr}"
    elif expect_ok is False:
        assert p.returncode != 0, f"expected failure, got rc=0\n{p.stdout}"
    return p


def _mk_spec(specs_dir, spec_id, meta, sprint):
    d = specs_dir / spec_id
    d.mkdir(parents=True)
    (d / "meta.json").write_text(json.dumps(meta))
    (d / "sprint.json").write_text(json.dumps(sprint))
    return d


def _sample_meta(spec_id="demo"):
    return {
        "id": spec_id, "title": "Demo spec", "description": "a demo",
        "version": "0.1.0",
        "params": [
            {"name": "name", "description": "a thing"},
            {"name": "runner", "description": "runner", "default": "python3 -m pytest"},
        ],
    }


def _sample_sprint():
    return {
        "brief": "do ${name}",
        "retry_budget": 2,
        "work_packages": [
            {"id": "wp1-${name}", "title": "first", "instructions": "make ${name}",
             "checklist": [{"id": "C1", "assert": "${name} ok",
                            "cmd": "${runner} test_${name}.py -q"}]},
        ],
    }


# ---------- list / show -------------------------------------------------------------------

def test_list_shows_catalog(tmp_path):
    _mk_spec(tmp_path, "demo", _sample_meta(), _sample_sprint())
    _mk_spec(tmp_path, "other", {**_sample_meta("other"), "title": "Other", "version": "2.3.4"},
             _sample_sprint())
    out = _spec(tmp_path, "list", expect_ok=True).stdout
    assert "demo" in out and "other" in out
    assert "0.1.0" in out and "2.3.4" in out
    assert "Demo spec" in out and "Other" in out


def test_list_empty_catalog_is_not_a_crash(tmp_path):
    p = _spec(tmp_path, "list")
    assert p.returncode == 0
    assert "no specs" in p.stderr.lower()


def test_show_reports_meta_wps_and_params(tmp_path):
    _mk_spec(tmp_path, "demo", _sample_meta(), _sample_sprint())
    out = _spec(tmp_path, "show", "demo", expect_ok=True).stdout
    assert "demo" in out and "0.1.0" in out
    assert "Demo spec" in out
    assert "wp1-${name}" in out          # WP title/id surfaced
    assert "${name}" in out and "${runner}" in out  # declared params listed
    assert "python3 -m pytest" in out    # default shown


def test_show_unknown_spec_fails_clearly(tmp_path):
    p = _spec(tmp_path, "show", "nope")
    assert p.returncode != 0
    assert "no such spec" in p.stderr and "nope" in p.stderr


def test_spec_id_path_traversal_is_rejected(tmp_path):
    """A spec id must name one catalog entry, never escape the catalog. An absolute or '../'-laden
    id must be refused before it can load an un-reviewed meta.json/sprint.json from elsewhere."""
    # Plant a valid spec OUTSIDE the catalog dir.
    outside = tmp_path / "outside"
    _mk_spec(outside, "evil", {"id": "evil", "title": "e", "version": "1"},
             {"work_packages": [{"id": "wp1", "checklist": [{"id": "C1", "cmd": "true"}]}]})
    catalog = tmp_path / "catalog"
    catalog.mkdir()
    for mode in ("show", "instantiate"):
        for bad_id in (str(outside / "evil"),               # absolute
                       "../outside/evil",                    # relative traversal
                       "sub/dir"):                           # nested segment
            p = _spec(catalog, mode, bad_id)
            assert p.returncode != 0, f"{mode} {bad_id!r} was not rejected\n{p.stdout}"
            assert "invalid spec id" in p.stderr, p.stderr
            assert "e" not in p.stdout  # the outside spec's title never rendered


def test_list_tolerates_neighbor_with_nonstring_version(tmp_path):
    """One malformed neighbor (e.g. version is a JSON list) must not crash the whole catalog
    listing — version/title are coerced to str before formatting."""
    _mk_spec(tmp_path, "good", _sample_meta("good"), _sample_sprint())
    bad = tmp_path / "badver"
    bad.mkdir()
    (bad / "meta.json").write_text(json.dumps({"id": "badver", "title": ["x"], "version": [1, 2]}))
    (bad / "sprint.json").write_text(json.dumps({"work_packages": []}))
    p = _spec(tmp_path, "list", expect_ok=True)
    assert "good" in p.stdout and "badver" in p.stdout


# ---------- instantiate -------------------------------------------------------------------

def test_instantiate_substitutes_params(tmp_path):
    _mk_spec(tmp_path, "demo", _sample_meta(), _sample_sprint())
    out = _spec(tmp_path, "instantiate", "demo", "--param", "name=alpha", expect_ok=True).stdout
    rendered = json.loads(out)
    # No placeholder survives.
    assert "${" not in out
    assert rendered["brief"] == "do alpha"
    wp = rendered["work_packages"][0]
    assert wp["id"] == "wp1-alpha"
    # runner came from the meta default, name from --param
    assert wp["checklist"][0]["cmd"] == "python3 -m pytest test_alpha.py -q"


def test_explicit_param_overrides_default(tmp_path):
    _mk_spec(tmp_path, "demo", _sample_meta(), _sample_sprint())
    out = _spec(tmp_path, "instantiate", "demo",
                "--param", "name=beta", "--param", "runner=pytest",
                expect_ok=True).stdout
    rendered = json.loads(out)
    assert rendered["work_packages"][0]["checklist"][0]["cmd"] == "pytest test_beta.py -q"


def test_missing_required_param_errors_clearly(tmp_path):
    _mk_spec(tmp_path, "demo", _sample_meta(), _sample_sprint())
    p = _spec(tmp_path, "instantiate", "demo")  # 'name' has no default -> required
    assert p.returncode != 0
    assert "missing required param" in p.stderr
    assert "name" in p.stderr
    # runner has a default, so it must NOT be reported missing
    assert "runner" not in p.stderr.split("missing required param")[1].split("\n")[0]


def test_param_value_may_contain_equals_and_spaces(tmp_path):
    _mk_spec(tmp_path, "demo", _sample_meta(), _sample_sprint())
    out = _spec(tmp_path, "instantiate", "demo",
                "--param", "name=alpha", "--param", "runner=python3 -m pytest -k a=b",
                expect_ok=True).stdout
    assert "python3 -m pytest -k a=b test_alpha.py -q" in out


def test_param_value_with_dollar_placeholder_is_not_re_expanded(tmp_path):
    """A value that itself contains ${other} is substituted verbatim (no double-expansion) and
    must NOT trip a false 'missing required param' for `other` (regression: single-pass detection
    re-scanned the rendered output)."""
    _mk_spec(tmp_path, "demo", _sample_meta(), _sample_sprint())
    p = _spec(tmp_path, "instantiate", "demo", "--param", "name=${runner}", expect_ok=True)
    rendered = json.loads(p.stdout)
    # ${runner} survives as literal text inside the value; runner is NOT reported missing.
    assert "${runner}" in rendered["work_packages"][0]["checklist"][0]["cmd"]


def test_param_quote_does_not_inject_shell_into_cmd(tmp_path):
    """Core 'shlex-safe' guarantee: a single-quote-bearing param value must NOT break out of the
    control's quoting. The rendered cmd, parsed as shell, keeps the value as ONE argument and
    contains no injected command separator."""
    import shlex
    _mk_spec(tmp_path, "demo", _sample_meta(), _sample_sprint())
    out = _spec(tmp_path, "instantiate", "demo",
                "--param", "name=x'; touch PWNED; echo '", expect_ok=True).stdout
    rendered = json.loads(out)
    cmd = rendered["work_packages"][0]["checklist"][0]["cmd"]
    # Shell-parse it: the malicious payload must be inert (no bare ';', 'touch', 'PWNED' as args).
    toks = shlex.split(cmd)
    assert ";" not in toks
    assert "touch" not in toks
    # the whole injected blob lives inside a single shell word (the test path arg)
    assert any("touch PWNED" in t for t in toks)


def test_instantiate_writes_to_outfile(tmp_path):
    _mk_spec(tmp_path, "demo", _sample_meta(), _sample_sprint())
    outfile = tmp_path / "sprint.json"
    p = _spec(tmp_path, "instantiate", "demo", "--param", "name=alpha", "-o", str(outfile),
              expect_ok=True)
    assert outfile.exists()
    rendered = json.loads(outfile.read_text())
    assert rendered["brief"] == "do alpha"
    assert "wrote sprint" in p.stderr


# ---------- rendered sprint is hook-consumable (schema + real gate) -----------------------

def test_rendered_sprint_has_hook_schema(tmp_path):
    _mk_spec(tmp_path, "demo", _sample_meta(), _sample_sprint())
    rendered = json.loads(
        _spec(tmp_path, "instantiate", "demo", "--param", "name=alpha", expect_ok=True).stdout)
    for wp in rendered["work_packages"]:
        assert wp.get("id")
        assert wp.get("checklist")
        for ctrl in wp["checklist"]:
            assert ctrl.get("id")
            assert ctrl.get("cmd") or ctrl.get("judge")


def test_malformed_spec_is_caught_at_render(tmp_path):
    """A spec that renders to an invalid sprint (control with no cmd/judge) must fail loudly."""
    bad_sprint = {
        "brief": "b", "retry_budget": 1,
        "work_packages": [{"id": "wp1", "checklist": [{"id": "C1", "assert": "x"}]}],
    }
    _mk_spec(tmp_path, "bad", _sample_meta("bad"), bad_sprint)
    p = _spec(tmp_path, "instantiate", "bad", "--param", "name=x")
    assert p.returncode != 0
    assert "neither a cmd nor a judge" in p.stderr


def test_rendered_sprint_runs_through_real_gate(tmp_path):
    """The load-bearing claim: a spec instantiated here is consumed UNCHANGED by bin/relay-gate.

    Build a spec whose control is a file-existence check on a ${param}-named file, render it, then
    run the produced sprint through the REAL gate and assert it gate-fails (file absent) then
    advances (file present) — i.e. the gate understood the rendered schema.
    """
    work = tmp_path / "work"
    work.mkdir()
    sprint_tmpl = {
        "brief": "make ${marker}",
        "retry_budget": 3,
        "work_packages": [
            {"id": "wp1-${marker}", "title": "T", "instructions": "create it",
             "checklist": [{"id": "C-FILE", "assert": "${marker} exists",
                            "cmd": "test -f " + str(work) + "/${marker}"}]},
        ],
    }
    meta = {"id": "filespec", "title": "file", "description": "", "version": "1.0.0",
            "params": [{"name": "marker", "description": "filename"}]}
    specs = tmp_path / "specs"
    _mk_spec(specs, "filespec", meta, sprint_tmpl)

    sprint_out = tmp_path / "rendered.json"
    _spec(specs, "instantiate", "filespec", "--param", "marker=alpha.txt",
          "-o", str(sprint_out), expect_ok=True)

    def _eval(state):
        return subprocess.run(
            [str(GATE), "eval", "--sprint", str(sprint_out),
             "--workdir", str(work), "--state", str(state)],
            capture_output=True, text=True, env=_base_env({"RELAY_JUDGE_BACKEND": "stub"}))

    state = tmp_path / "state"
    r1 = _eval(state)
    assert r1.returncode == 1, f"expected gate-fail, got {r1.returncode}\n{r1.stdout}{r1.stderr}"
    body1 = json.loads(r1.stdout.strip())
    assert body1["outcome"] == "gate-fail"
    assert "C-FILE" in body1["failing"]

    (work / "alpha.txt").touch()
    r2 = _eval(state)
    assert r2.returncode == 0, f"expected advance/complete, got {r2.returncode}\n{r2.stdout}{r2.stderr}"
    assert json.loads(r2.stdout.strip())["outcome"] in ("advance", "complete")


def test_injecting_param_cannot_execute_or_forge_pass_through_real_gate(tmp_path):
    """End-to-end: a quote-bearing --param value rendered into a cmd and fed to the REAL gate must
    NOT (a) execute injected shell or (b) forge a green verdict. Regression for the high-severity
    injection: a payload like  x'; touch SENTINEL; echo '  once defeated the spec's hand-quoting."""
    work = tmp_path / "work"
    work.mkdir()
    sentinel = tmp_path / "RELAY_PWNED_SENTINEL"
    # The control runs `${runner} ${tests} -q`; runner defaults to a no-op so the only shell that
    # could run the payload is the (now shell-quoted) value itself.
    sprint_tmpl = {
        "brief": "b", "retry_budget": 1,
        "work_packages": [
            {"id": "wp1", "title": "T", "instructions": "x",
             "checklist": [{"id": "C-INJ", "assert": "a",
                            "cmd": "true ${tests}"}]},
        ],
    }
    meta = {"id": "injspec", "title": "i", "description": "", "version": "1.0.0",
            "params": [{"name": "tests", "description": "p"}]}
    specs = tmp_path / "specs"
    _mk_spec(specs, "injspec", meta, sprint_tmpl)

    sprint_out = tmp_path / "rendered.json"
    payload = f"x'; touch {sentinel}; echo '"
    _spec(specs, "instantiate", "injspec", "--param", f"tests={payload}",
          "-o", str(sprint_out), expect_ok=True)

    r = subprocess.run(
        [str(GATE), "eval", "--sprint", str(sprint_out),
         "--workdir", str(work), "--state", str(tmp_path / "state")],
        capture_output=True, text=True, env=_base_env({"RELAY_JUDGE_BACKEND": "stub"}))
    # The injected `touch` must never have run.
    assert not sentinel.exists(), "injected shell executed through the gate's eval"
    # And the gate's verdict must be honest about whatever `true <quoted-junk>` did, not crash.
    assert r.returncode in (0, 1)


# ---------- the shipped starter catalog ---------------------------------------------------

def _shipped(*args, expect_ok=None):
    """Run the tool against the REAL shipped specs/ catalog (read-only)."""
    p = subprocess.run([sys.executable, str(TOOL), *args],
                       capture_output=True, text=True, env=_base_env())
    if expect_ok is True:
        assert p.returncode == 0, f"expected success, got rc={p.returncode}\n{p.stderr}"
    return p


def test_shipped_catalog_lists_both_starters():
    out = _shipped("list", expect_ok=True).stdout
    assert "pytest-green" in out
    assert "py-package-skeleton" in out


def test_shipped_pytest_green_instantiates_and_is_gate_valid(tmp_path):
    out = _shipped("instantiate", "pytest-green", "--param", "tests=tests/",
                   expect_ok=True).stdout
    rendered = json.loads(out)
    assert "${" not in out  # all placeholders bound (runner via default)
    for wp in rendered["work_packages"]:
        assert wp.get("id") and wp.get("checklist")
        for ctrl in wp["checklist"]:
            assert ctrl.get("id") and ctrl.get("cmd")


def test_shipped_pytest_green_is_injection_safe(tmp_path):
    """The shipped pytest-green spec, instantiated with a quote-bearing `tests`, must render a cmd
    in which the payload is one inert shell word (its hand-quoting is gone — the renderer quotes)."""
    import shlex
    out = _shipped("instantiate", "pytest-green",
                   "--param", "tests=t'; touch PWNED; echo '", expect_ok=True).stdout
    rendered = json.loads(out)
    for wp in rendered["work_packages"]:
        cmd = wp["checklist"][0]["cmd"]
        toks = shlex.split(cmd)
        assert ";" not in toks and "touch" not in toks, f"injection survived in: {cmd}"


def test_shipped_py_package_skeleton_instantiates(tmp_path):
    out = _shipped("instantiate", "py-package-skeleton", "--param", "pkg=mylib",
                   expect_ok=True).stdout
    rendered = json.loads(out)
    assert "${" not in out
    # root defaults to "." ; pkg substituted everywhere
    blob = json.dumps(rendered)
    assert "mylib" in blob
    assert len(rendered["work_packages"]) == 3
