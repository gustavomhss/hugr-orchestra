"""Exercise benchmark measurement validity with real, disposable pytest/JUnit suites.

No model runs or recorded campaigns are touched. Real pass, assertion-failure, skip,
and collection-error controls accompany injected tool/report faults.
"""
import json
import os
import shutil
import subprocess
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

import pytest

from benchmark import grader, run_crossover as crossover
from benchmark.generator import gen_campaign_v2 as gen2


ROOT = Path(__file__).resolve().parent.parent
GRADER = ROOT / "benchmark" / "grader.py"


@pytest.fixture(autouse=True)
def isolated_pytest_env(monkeypatch):
    # Nested pytest runs must not inherit the outer invocation's filters/plugins.
    monkeypatch.delenv("PYTEST_ADDOPTS", raising=False)
    monkeypatch.setenv("PYTEST_DISABLE_PLUGIN_AUTOLOAD", "1")


def campaign(tmp_path, holdout_source):
    camp = tmp_path / "campaign"
    for name in ("repo/engine", "checks", "holdout"):
        (camp / name).mkdir(parents=True)
    (camp / "requirements.yaml").write_text(
        "requirements:\n  - {id: R1, weight: 2}\n  - {id: R2, weight: 1}\n"
    )
    (camp / "repo/engine/__init__.py").write_text("from .core import *\n")
    (camp / "repo/engine/core.py").write_text("def g(a, b):\n    return a + b\n")
    for name in ("checks", "holdout"):
        (camp / name / "conftest.py").write_text(gen2.CONFTEST)
    (camp / "checks/test_visible.py").write_text(
        "import engine\n"
        "def test_R1():\n    assert engine.g(1, 2) == 3\n"
        "def test_R2():\n    assert engine.g(3, 4) == 7\n"
    )
    (camp / "holdout/test_holdout.py").write_text(holdout_source)
    return camp


PASS_SUITE = (
    "import engine\n"
    "def test_R1_first():\n    assert engine.g(11, 4) == 15\n"
    "def test_R1_second():\n    assert engine.g(9, 8) == 17\n"
    "def test_R2():\n    assert engine.g(12, 5) == 17\n"
)


def grade(camp, *, visible=False, baseline=None):
    cmd = [sys.executable, str(GRADER), "--dir", str(camp)]
    if not visible:
        cmd += ["--holdout", str(camp / "holdout")]
    if baseline:
        cmd += ["--baseline", str(baseline)]
    proc = subprocess.run(cmd, capture_output=True, text=True, cwd=camp)
    assert proc.returncode == 0, proc.stderr
    return json.loads(proc.stdout)


def junit_evidence(camp):
    report = camp / "evidence.xml"
    proc = subprocess.run(
        [sys.executable, "-m", "pytest", str(camp / "holdout"), "-q",
         "--junitxml", str(report), "-p", "no:cacheprovider"],
        env={**os.environ, "RELAY_IMPL": str(camp / "repo")},
        capture_output=True, text=True, cwd=camp,
    )
    return proc.returncode, ET.parse(report).getroot()


def assert_invalid(result, reason):
    assert result["grade_valid"] is False
    assert any(reason in error for error in result["grade_errors"]), result
    assert result["rsr"] is None and result["ccr"] is None
    assert result["per_req"] == {}
    assert result["passed"] == [] and result["regressions"] == []


def test_skipped_requirement_never_scores_pass(tmp_path):
    camp = campaign(tmp_path, PASS_SUITE.replace(
        "assert engine.g(9, 8) == 17", "__import__('pytest').skip('not implemented')"
    ))
    rc, xml = junit_evidence(camp)
    assert rc == 0
    assert len(list(xml.iter("skipped"))) == 1
    result = grade(camp)
    # R1 has both a pass and a skip: AND must retain the skip as failure.
    assert result["rsr"] == 0.3333 and result["ccr"] == 0
    assert result["per_req"] == {"R1": False, "R2": True}
    assert result["grade_valid"] is True and result["grade_errors"] == []
    assert crossover.check_grader_discriminates(str(camp))[0] is False


def test_collection_error_is_not_discrimination(tmp_path):
    camp = campaign(tmp_path, "import relay_benchmark_nonexistent_module\n" + PASS_SUITE)
    rc, xml = junit_evidence(camp)
    assert rc == 2
    assert list(xml.iter("error")) and not list(xml.iter("failure"))
    ok, diagnostic = crossover.check_grader_discriminates(str(camp))
    assert ok is False, diagnostic
    assert_invalid(grade(camp), "junit-error")


def test_clean_pass_and_real_failure_preserve_weighted_fields(tmp_path):
    camp = campaign(tmp_path, PASS_SUITE)
    rc, xml = junit_evidence(camp)
    assert rc == 0 and len(list(xml.iter("testcase"))) == 3
    result = grade(camp)
    assert result["grade_valid"] is True and result["grade_errors"] == []
    assert result["rsr"] == 1.0 and result["ccr"] == 1
    assert result["passed_w"] == result["total_w"] == 3
    assert result["per_req"] == {"R1": True, "R2": True}
    assert result["graded_by"] == "holdout"
    assert grade(camp, visible=True)["graded_by"] == "visible-checks(NOT-independent)"
    assert crossover.check_grader_discriminates(str(camp))[0] is False

    prior = camp / "prior.json"
    prior.write_text(json.dumps(result))
    (camp / "holdout/test_holdout.py").write_text(PASS_SUITE.replace("== 17", "== -1", 1))
    rc, xml = junit_evidence(camp)
    assert rc == 1 and len(list(xml.iter("failure"))) == 1
    assert not list(xml.iter("error")) and not list(xml.iter("skipped"))
    result = grade(camp, baseline=prior)
    assert result["grade_valid"] is True
    assert result["rsr"] == 0.3333 and result["ccr"] == 0
    assert result["failed"] == result["regressions"] == ["R1"]
    assert result["per_req"] == {"R1": False, "R2": True}
    assert crossover.check_grader_discriminates(str(camp))[0] is True


@pytest.mark.parametrize("source,reason", [
    ("", "junit-no-testcases"),
    ("def test_R1():\n    assert False\n", "requirements-missing: R2"),
    ("def test_R99():\n    assert False\n", "requirements-unexpected: R99"),
    ("def test_smoke_R1():\n    assert False\n", "junit-unmapped-testcase"),
    ("import pytest\n@pytest.fixture\ndef broken():\n    raise RuntimeError('setup')\n"
     "def test_R1(broken):\n    pass\ndef test_R2():\n    assert True\n", "junit-error"),
])
def test_unusable_or_incomplete_suites_are_invalid(tmp_path, source, reason):
    camp = campaign(tmp_path, source)
    assert_invalid(grade(camp), reason)
    assert crossover.check_grader_discriminates(str(camp))[0] is False


def test_all_skipped_suite_has_no_pass_grade_or_discrimination(tmp_path):
    camp = campaign(tmp_path, PASS_SUITE.replace("import engine", "import engine, pytest\n"
                    "pytestmark = pytest.mark.skip(reason='reward hack')"))
    result = grade(camp)
    assert result["grade_valid"] is True
    assert result["rsr"] == 0 and result["ccr"] == 0
    assert result["passed"] == [] and result["per_req"] == {"R1": False, "R2": False}
    assert crossover.check_grader_discriminates(str(camp))[0] is False


def test_failure_plus_skip_is_not_discrimination(tmp_path):
    source = PASS_SUITE.replace("== 15", "== -1").replace(
        "assert engine.g(12, 5) == 17", "__import__('pytest').skip('reward hack')"
    )
    camp = campaign(tmp_path, source)
    rc, xml = junit_evidence(camp)
    assert rc == 1 and list(xml.iter("failure")) and list(xml.iter("skipped"))
    result = grade(camp)
    assert result["grade_valid"] is True and result["rsr"] == result["ccr"] == 0
    ok, diagnostic = crossover.check_grader_discriminates(str(camp))
    assert ok is False and "junit-skipped" in diagnostic


def test_empty_requirements_rejects_even_real_test_failures(tmp_path):
    camp = campaign(tmp_path, PASS_SUITE.replace("== 15", "== -1"))
    (camp / "requirements.yaml").write_text("requirements: []\n")
    assert_invalid(grade(camp), "requirements-empty")
    assert crossover.check_grader_discriminates(str(camp))[0] is False


def test_generated_reference_skeleton_and_visible_input_cheat(tmp_path):
    camp = tmp_path / "generated"
    ref_dir, cheat_dir = tmp_path / "reference", tmp_path / "cheat"
    for name in ("checks", "holdout"):
        (camp / name).mkdir(parents=True)
        (camp / name / "conftest.py").write_text(gen2.CONFTEST)
    funcs = gen2.build_funcs(5, seed=1)
    gen2.emit_reference(funcs, str(ref_dir))
    ref = gen2.load_ref(str(ref_dir))
    gen2.emit_requirements(funcs, str(camp), "ephemeral")
    gen2.emit_skeleton(funcs, str(camp))
    gen2.emit_cheat(funcs, ref, str(cheat_dir))
    for name, variant in (("checks", "v"), ("holdout", "h")):
        gen2.emit_tests(funcs, ref, str(camp / name / "test_gen.py"), variant)

    skeleton = grade(camp)
    assert skeleton["grade_valid"] is True and skeleton["rsr"] == 0
    assert skeleton["failed"] == sorted(grader.weights(camp / "requirements.yaml"))
    assert crossover.check_grader_discriminates(str(camp))[0] is True

    shutil.copytree(ref_dir, camp / "repo", dirs_exist_ok=True)
    reference = grade(camp)
    assert reference["grade_valid"] is True and reference["rsr"] == reference["ccr"] == 1
    assert crossover.check_grader_discriminates(str(camp))[0] is False

    shutil.copytree(cheat_dir, camp / "repo", dirs_exist_ok=True)
    assert grade(camp, visible=True)["rsr"] == 1
    cheat = grade(camp)
    assert cheat["grade_valid"] is True and cheat["rsr"] < 1 and cheat["ccr"] == 0


def test_missing_pytest_cannot_become_zero_quality_or_discrimination(tmp_path, monkeypatch, capsys):
    camp = campaign(tmp_path, PASS_SUITE)
    real_run = subprocess.run

    def without_site_packages(cmd, **kwargs):
        # Real Python exits 1 for missing pytest, producing no JUnit artifact.
        return real_run([cmd[0], "-I", "-S", *cmd[1:]], **kwargs)

    monkeypatch.setattr(grader.subprocess, "run", without_site_packages)
    monkeypatch.setattr(sys, "argv", [str(GRADER), "--dir", str(camp),
                                      "--holdout", str(camp / "holdout")])
    grader.main()
    result = json.loads(capsys.readouterr().out)
    assert_invalid(result, "junit-missing")
    assert result["pytest_exit_code"] == 1
    assert "No module named pytest" in result["grade_errors"][-1]
    assert crossover.check_grader_discriminates(str(camp))[0] is False


@pytest.mark.parametrize("report,rc,reason", [
    (None, 127, "junit-missing"),
    ("not xml", 1, "junit-unparseable"),
    ("<testsuites><testsuite /></testsuites>", 1, "junit-no-testcases"),
    ("<testsuite><testcase name='test_R1'/><testcase name='test_R2'/></testsuite>",
     1, "pytest-exit-mismatch"),
    ("<testsuite><testcase name='test_R1'><failure/></testcase>"
     "<testcase name='test_R2'/></testsuite>", 0, "pytest-exit-mismatch"),
    ("<badreport><testcase name='test_R1'/><testcase name='test_R2'/></badreport>",
     0, "junit-invalid-root"),
    ("<testsuite><failure/><testcase name='test_R1'/><testcase name='test_R2'/></testsuite>",
     1, "junit-outcome-outside-testcase"),
    ("<testsuite><testcase name='test_R1'><failure/></testcase>"
     "<testcase name='test_R2'/></testsuite>", 2, "pytest-exit-code: 2"),
])
def test_report_faults_fail_closed(tmp_path, monkeypatch, capsys, report, rc, reason):
    camp = campaign(tmp_path, PASS_SUITE)

    def broken_report(cmd, **kwargs):
        if report is not None:
            Path(cmd[cmd.index("--junitxml") + 1]).write_text(report)
        return subprocess.CompletedProcess(cmd, rc, stdout="passed", stderr="tool/report fault")

    monkeypatch.setattr(grader.subprocess, "run", broken_report)
    monkeypatch.setattr(sys, "argv", [str(GRADER), "--dir", str(camp),
                                      "--holdout", str(camp / "holdout")])
    grader.main()
    assert_invalid(json.loads(capsys.readouterr().out), reason)
    assert crossover.check_grader_discriminates(str(camp))[0] is False


def test_python_launch_failure_is_explicit(tmp_path, monkeypatch, capsys):
    camp = campaign(tmp_path, PASS_SUITE)
    monkeypatch.setattr(sys, "executable", str(tmp_path / "missing-python"))
    monkeypatch.setattr(sys, "argv", [str(GRADER), "--dir", str(camp)])
    grader.main()
    result = json.loads(capsys.readouterr().out)
    assert_invalid(result, "pytest-unavailable")
    assert result["pytest_exit_code"] is None
    assert crossover.check_grader_discriminates(str(camp))[0] is False


def recorded_run(out_dir, grade_data):
    out_dir = Path(out_dir)
    (out_dir / "repo/engine").mkdir(parents=True)
    (out_dir / "repo/engine/core.py").write_text("def g(a, b):\n    return a + b\n")
    (out_dir / "run.json").write_text(json.dumps({
        "num_turns": 2, "usage": {"output_tokens": 10}, "is_error": False,
        "total_cost_usd": 0.01,
    }))
    if grade_data is not None:
        (out_dir / "grade.json").write_text(json.dumps(grade_data))


@pytest.mark.parametrize("grade_data,valid,reason", [
    ({"grade_valid": True, "rsr": 0.0}, True, None),
    ({"grade_valid": False, "rsr": 0, "grade_errors": ["pytest-unavailable"]},
     False, "grade-invalid"),
    ({"rsr": 1.0, "ccr": 1}, False, "grade-status-missing"),
    (None, False, "grade-missing"),
    ([], False, "grade-invalid"),
    ({"grade_valid": True, "rsr": None}, False, "grade-invalid"),
    ({"grade_valid": True, "rsr": True}, False, "grade-invalid"),
    ({"grade_valid": True, "rsr": float("nan")}, False, "grade-invalid"),
])
def test_real_usage_requires_explicit_valid_grade(tmp_path, monkeypatch, grade_data, valid, reason):
    out_dir = tmp_path / "run"
    recorded_run(out_dir, grade_data)
    monkeypatch.setattr(crossover, "reference_core", lambda n, seed: str(tmp_path / "reference"))
    gp = out_dir / "grade.json"
    original = gp.read_bytes() if gp.exists() else None
    actual, reasons, usage = crossover.validate_run(str(out_dir), 2, 1)
    assert actual is valid
    assert usage["turns"] == 2 and usage["out_tok"] == 10
    if reason:
        assert any(reason in item for item in reasons), reasons
    else:
        assert reasons == []
    assert (gp.read_bytes() if gp.exists() else None) == original


@pytest.mark.parametrize("valid_grade", [True, False])
def test_crossover_reports_only_valid_quality_measurements(tmp_path, monkeypatch, capsys, valid_grade):
    result_path = tmp_path / "results.json"
    grade_data = {"grade_valid": valid_grade, "rsr": 0.0,
                  "grade_errors": [] if valid_grade else ["junit-missing"]}
    monkeypatch.setattr(crossover, "gen_campaign", lambda n, k, seed: str(tmp_path / "camp"))
    monkeypatch.setattr(crossover, "reference_core", lambda n, seed: str(tmp_path / "reference"))

    def already_recorded(arm, camp, out_dir, timeout):
        # No model invocation: supply only the orchestrator's recorded-run boundary.
        recorded_run(out_dir, grade_data)
        return grade_data, "", ""

    monkeypatch.setattr(crossover, "run_one", already_recorded)
    monkeypatch.setattr(sys, "argv", ["run_crossover.py", "--n", "2", "--k", "1",
                                      "--seeds", "1", "--arms", "M",
                                      "--out-root", str(tmp_path / "runs"),
                                      "--json-out", str(result_path)])
    crossover.main()
    output = capsys.readouterr().out
    record = json.loads(result_path.read_text())["results"][0]
    assert record["grade_valid"] is valid_grade and record["valid"] is valid_grade
    if valid_grade:
        assert record["rsr"] == 0 and "HEADROOM FOUND" in output
        assert "rsr=0.0000" in output
    else:
        assert record["rsr"] is None
        assert "grade-invalid" in record["reasons"][0]
        assert "No VALID Arm-M run" in output and "HEADROOM FOUND" not in output
        assert "rsr=0.0000" not in output
