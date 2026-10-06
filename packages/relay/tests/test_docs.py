"""Structural doc guard: known-good corpus, named defects and recursive hash reach.

These tests establish structural discrimination, not semantic freshness or reviewer independence.
"""
import importlib.util
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys

import pytest

ROOT = Path(__file__).resolve().parent.parent


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


guard = load("doc_guard", ROOT / "bin/check-docs.py")
index = load("doc_index_tests", ROOT / "bin/gen-doc-index.py")


def skill(name):
    return f"---\nname: {name}\ndescription: Use when maintaining example source.\n---\n\n# {name}\n\n## Cold review\n\nRequire an independent reviewer.\n"


@pytest.fixture
def corpus(tmp_path):
    for path, text in {
        "README.md": "# Corpus\n\n[Catalog](docs/skills.json)\n",
        "bin/a.py": "print('fixture')\n",
        "tests/test_a.py": "def test_a():\n    assert 1 == 1\n",
        ".opencode/skills/relay-example/SKILL.md": skill("relay-example"),
        ".opencode/skills/relay-route/SKILL.md": skill("relay-route"),
    }.items():
        target = tmp_path / path
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(text)
    for folder in guard.SOURCE_ROOTS:
        (tmp_path / folder).mkdir(exist_ok=True)
    (tmp_path / "docs").mkdir(exist_ok=True)
    manifest = {
        "version": 1, "source_roots": sorted(guard.SOURCE_ROOTS),
        "workflows": [{"id": "route", "skill": ".opencode/skills/relay-route/SKILL.md"}],
        "modules": [{"id": "example", "skill": ".opencode/skills/relay-example/SKILL.md",
                     "sources": ["bin/a.py"], "tests": ["tests/test_a.py"], "depends_on": []}],
    }
    (tmp_path / "docs/skills.json").write_text(json.dumps(manifest))
    return tmp_path


def amend(root, mutate):
    path = root / "docs/skills.json"
    data = json.loads(path.read_text())
    mutate(data)
    path.write_text(json.dumps(data))


def test_good_corpus(corpus):
    assert guard.check(corpus) == []


def test_empty_tree_fails_closed(tmp_path):
    errors = guard.check(tmp_path)
    assert any("documentation-empty" in e for e in errors)
    assert any("skills-empty" in e for e in errors)
    assert any("catalog-invalid" in e for e in errors)


@pytest.mark.parametrize("replacement", ["{", "{}", '{"version":1,"modules":[],"workflows":[]}'])
def test_bad_catalog(corpus, replacement):
    (corpus / "docs/skills.json").write_text(replacement)
    assert any("catalog-invalid" in e for e in guard.check(corpus))


@pytest.mark.parametrize("change,expected", [
    (lambda d: d["source_roots"].remove("bin"), "catalog-invalid"),
    (lambda d: d["modules"][0].update(sources=[]), "catalog-sources"),
    (lambda d: d["modules"][0].update(sources=["bin/missing.py"]), "catalog-source"),
    (lambda d: d["modules"][0].update(tests=["tests/missing.py"]), "catalog-test"),
    (lambda d: d["modules"][0].update(depends_on=["missing"]), "catalog-dependency"),
    (lambda d: d["modules"][0].update(skill=".opencode/skills/missing/SKILL.md"), "catalog-skill"),
    (lambda d: d["modules"].append(dict(d["modules"][0])), "catalog-id"),
    (lambda d: d["modules"][0].update(id={"bad": 1}), "catalog-id"),
])
def test_catalog_defects(corpus, change, expected):
    amend(corpus, change)
    assert any(expected in e for e in guard.check(corpus))


def test_source_addition_and_overlap(corpus):
    (corpus / "bin/b.py").write_text("pass\n")
    assert "source-unowned: bin/b.py" in guard.check(corpus)
    amend(corpus, lambda d: d["modules"][0]["sources"].append("bin/*.py"))
    assert any("source-overlap: bin/a.py" in e for e in guard.check(corpus))


@pytest.mark.parametrize("value", ["tests/../README.md", "tests/../../outside.py"])
def test_test_paths_cannot_traverse(corpus, value):
    (corpus.parent / "outside.py").write_text("pass\n")
    amend(corpus, lambda d: d["modules"][0].update(tests=[value]))
    assert any("catalog-test" in e for e in guard.check(corpus))


def test_external_source_and_test_symlinks(corpus):
    outside = corpus.parent / "outside.py"
    outside.write_text("#!/usr/bin/env python3\n")
    source = corpus / "bin/alias"
    source.symlink_to(outside)
    assert any("source-inventory" in e and "alias" in e for e in guard.check(corpus))
    source.unlink()
    target = corpus / "tests/alias.py"
    target.symlink_to(outside)
    amend(corpus, lambda d: d["modules"][0].update(tests=["tests/alias.py"]))
    assert any("catalog-test" in e for e in guard.check(corpus))


@pytest.mark.parametrize("folder,expected", [("bin/denied", "source-inventory"),
                                             ("docs/denied", "documentation-inventory")])
@pytest.mark.parametrize("error_type", [PermissionError, FileNotFoundError])
def test_denied_subtree_fails_named(corpus, monkeypatch, folder, expected, error_type):
    path = corpus / folder
    path.mkdir()
    (path / ("hidden.py" if folder.startswith("bin") else "hidden.md")).write_text("# hidden\n")
    if folder.startswith("bin"):
        amend(corpus, lambda d: d["modules"][0]["sources"].append("bin/denied/*.py"))
    assert guard.check(corpus) == []
    original = os.scandir

    def denied(where):
        if Path(where).resolve() == path.resolve():
            raise error_type(f"denied inventory: {where}")
        return original(where)

    monkeypatch.setattr(os, "scandir", denied)
    assert any(expected in e and "denied" in e for e in guard.check(corpus))
    if folder.startswith("docs"):
        with pytest.raises(error_type):
            index.doc_files(corpus)


def test_post_open_inventory_failure_is_not_optional(corpus, monkeypatch):
    path = corpus / "docs/bad.md"
    path.write_text("[broken](missing.md)\n")
    assert any("broken-link" in e for e in guard.check(corpus))
    original = os.scandir

    class FailingRows:
        def __init__(self, rows):
            self.rows = rows

        def __enter__(self):
            self.rows.__enter__()
            return self

        def __exit__(self, *args):
            return self.rows.__exit__(*args)

        def __iter__(self):
            yield next(self.rows)
            raise FileNotFoundError("post-open inventory failure")

    def fail_after_open(where):
        rows = original(where)
        return FailingRows(rows) if Path(where).resolve() == (corpus / "docs").resolve() else rows

    monkeypatch.setattr(os, "scandir", fail_after_open)
    assert any("documentation-inventory" in e and "post-open" in e for e in guard.check(corpus))
    with pytest.raises(FileNotFoundError, match="post-open"):
        index.doc_files(corpus)
    monkeypatch.undo()
    assert any("broken-link" in e for e in guard.check(corpus))
    path.unlink()
    assert guard.check(corpus) == []


@pytest.mark.parametrize("mutate,expected", [
    (lambda t: t.replace("name: relay-example", "name: wrong"), "skill-metadata"),
    (lambda t: t.replace("description: Use when maintaining example source.", "description:"), "skill-metadata"),
    (lambda t: t.replace("## Cold review", "Cold review"), "cold-review-missing"),
    (lambda t: t.replace("---\n", "", 1), "skill-metadata"),
])
def test_skill_defects(corpus, mutate, expected):
    path = corpus / ".opencode/skills/relay-example/SKILL.md"
    path.write_text(mutate(path.read_text()))
    assert any(expected in e for e in guard.check(corpus))


def test_unregistered_skill(corpus):
    path = corpus / ".opencode/skills/relay-orphan/SKILL.md"
    path.parent.mkdir()
    path.write_text(skill("relay-orphan"))
    assert any("skill-unregistered" in e for e in guard.check(corpus))


def test_links_use_markdown_parser(corpus):
    path = corpus / "README.md"
    path.write_text("[catalog][c]\n\n[c]: docs/skills.json\n\n`[ignored](absent.md)`\n\n"
                    "```md\n[ignored](absent.md)\n```\n\n[external](https://example.org/x)\n")
    assert guard.check(corpus) == []
    path.write_text(path.read_text() + "\n![missing image](missing.png)\n[missing][m]\n\n[m]: docs/gone.md\n")
    errors = guard.check(corpus)
    assert any("missing.png" in e for e in errors)
    assert any("docs/gone.md" in e for e in errors)


def test_recursive_index_and_runtime_exclusion(corpus):
    for rel in ("docs/roadmaps/example.md", "benchmark/RESULTS.md", "examples/demo/README.md",
                "benchmark/campaigns/_gen-example/README.md", "runs/README.md"):
        path = corpus / rel
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text("# Fixture\n")
    files = index.doc_files(corpus)
    assert "docs/roadmaps/example.md" in files
    assert "benchmark/RESULTS.md" in files and "examples/demo/README.md" in files
    assert ".opencode/skills/relay-example/SKILL.md" in files
    assert not any("_gen-example" in p or p.startswith("runs/") for p in files)


def test_index_detects_nested_skill_drift(corpus):
    (corpus / "bin/gen-doc-index.py").write_bytes((ROOT / "bin/gen-doc-index.py").read_bytes())
    cmd = [sys.executable, str(corpus / "bin/gen-doc-index.py")]
    assert subprocess.run(cmd, capture_output=True).returncode == 0
    assert subprocess.run(cmd + ["--check"], capture_output=True).returncode == 0
    path = corpus / ".opencode/skills/relay-example/SKILL.md"
    path.write_text(path.read_text() + "\nChanged artifact.\n")
    result = subprocess.run(cmd + ["--check"], capture_output=True, text=True)
    assert result.returncode == 1 and "STALE" in result.stderr


def test_repository_structure_and_real_source_coverage():
    assert guard.check(ROOT) == []


def test_real_catalog_row_removal_is_detected(tmp_path):
    """Probe an actual catalog against actual sources, not only a synthetic expected list."""
    for folder in (*guard.SOURCE_ROOTS, "docs", ".opencode/skills", "tests", "profiles", "specs", "policies"):
        shutil.copytree(ROOT / folder, tmp_path / folder, dirs_exist_ok=True,
                        ignore=shutil.ignore_patterns("__pycache__", "_gen*", "_runs", ".relay-ledger"))
    for path in [*ROOT.glob("*.md"), ROOT / "requirements-dev.txt"]:
        shutil.copy2(path, tmp_path / path.name)
    assert guard.check(tmp_path) == []
    amend(tmp_path, lambda d: d["modules"].__setitem__(slice(None),
          [m for m in d["modules"] if m["id"] != "arm-hook"]))
    assert "source-unowned: bin/relay-arm-hook.sh" in guard.check(tmp_path)
