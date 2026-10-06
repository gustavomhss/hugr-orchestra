#!/usr/bin/env python3
"""Check links, skill structure and catalog ownership, not semantic prose freshness.

Scope: authored Markdown selected by gen-doc-index.py; Python, shell and extensionless
shebang scripts under the catalog's fixed source roots. Missing/empty inventories fail.
Cold-review headings are structural requirements, not proof a review occurred.
Exit 0: structural checks passed; 1: named findings; 2: dependencies unavailable.
"""
import argparse
from collections import defaultdict
from fnmatch import fnmatchcase
import importlib.util
import json
from pathlib import Path
import re
import sys
from urllib.parse import unquote, urlsplit

try:
    from markdown_it import MarkdownIt
    import yaml
except ImportError as exc:
    print(f"check-docs: {exc}; install requirements-dev.txt", file=sys.stderr)
    raise SystemExit(2)

ROOT = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location("doc_index", ROOT / "bin/gen-doc-index.py")
index = importlib.util.module_from_spec(spec)
spec.loader.exec_module(index)
SOURCE_ROOTS = {"bin", "lib", "tools", "benchmark", "demo", "examples"}
MD = MarkdownIt("commonmark")


def is_source(path):
    if path.suffix in (".py", ".sh"):
        return True
    if not path.suffix:
        with path.open("rb") as handle:
            return handle.read(2) == b"#!"
    return False


def source_files(root):
    out = set()
    for folder in SOURCE_ROOTS:
        for path in index.walk_files(root / folder):
            target = path.resolve()
            if not target.is_relative_to(root) or target.relative_to(root).parts[0] not in SOURCE_ROOTS:
                raise OSError(f"source target outside maintained roots: {path}")
            if is_source(path):
                out.add(path.relative_to(root).as_posix())
    return out


def matches(parts, pattern):
    """Match glob components against the already-enumerated, error-checked inventory."""
    if not pattern:
        return not parts
    if pattern[0] == "**":
        return any(matches(parts[i:], pattern[1:]) for i in range(len(parts) + 1))
    return bool(parts) and fnmatchcase(parts[0], pattern[0]) and matches(parts[1:], pattern[1:])


def check(root):
    root = Path(root).resolve()
    errors = []
    try:
        documents = index.doc_files(root)
    except OSError as exc:
        errors.append(f"documentation-inventory: {exc}")
        documents = []
    if not documents:
        errors.append("documentation-empty: no authored Markdown")
    for rel in documents:
        path = root / rel
        try:
            text = path.read_text(encoding="utf-8")
        except (OSError, UnicodeError) as exc:
            errors.append(f"documentation-read: {rel}: {exc}")
            continue
        for token in MD.parse(text):
            for child in token.children or []:
                dest = child.attrGet("href") if child.type == "link_open" else child.attrGet("src") if child.type == "image" else None
                if not dest:
                    continue
                url = urlsplit(dest)
                if url.scheme or url.netloc or not url.path:
                    continue
                target = (path.parent / unquote(url.path)).resolve()
                if not target.is_relative_to(root) or not target.exists():
                    errors.append(f"broken-link: {rel} -> {dest}")

    skills = {p for p in documents if p.startswith("docs/skills/") and Path(p).name == "SKILL.md"}
    if not skills:
        errors.append("skills-empty: no project skills")
    for rel in sorted(skills):
        text = (root / rel).read_text(encoding="utf-8")
        lines = text.splitlines()
        try:
            if not lines or lines[0] != "---":
                raise ValueError("missing opening frontmatter delimiter")
            end = lines.index("---", 1)
            meta = yaml.safe_load("\n".join(lines[1:end]))
            name = meta.get("name") if isinstance(meta, dict) else None
            desc = meta.get("description") if isinstance(meta, dict) else None
            if name != Path(rel).parent.name or not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", name or "") or len(name) > 64:
                raise ValueError("name must match folder and skill naming grammar")
            if not isinstance(desc, str) or not desc.strip():
                raise ValueError("description must be a non-empty string")
        except (ValueError, yaml.YAMLError) as exc:
            errors.append(f"skill-metadata: {rel}: {exc}")
        tokens = MD.parse(text)
        headings = [tokens[i + 1].content for i, t in enumerate(tokens[:-1])
                    if t.type == "heading_open" and t.tag == "h2" and tokens[i + 1].type == "inline"]
        if "Cold review" not in headings:
            errors.append(f"cold-review-missing: {rel}")

    catalog_path = root / "docs/skills.json"
    try:
        catalog = json.loads(catalog_path.read_text(encoding="utf-8"))
        if not isinstance(catalog, dict) or type(catalog.get("version")) is not int or catalog.get("version") != 1:
            raise ValueError("expected version 1 object")
        modules, workflows = catalog.get("modules"), catalog.get("workflows")
        if not isinstance(modules, list) or not modules or not isinstance(workflows, list) or not workflows:
            raise ValueError("modules and workflows must be non-empty arrays")
        if not all(isinstance(row, dict) for row in modules + workflows):
            raise ValueError("catalog rows must be objects")
        roots = catalog.get("source_roots")
        if not isinstance(roots, list) or not all(isinstance(r, str) for r in roots) or len(roots) != len(SOURCE_ROOTS) or set(roots) != SOURCE_ROOTS:
            raise ValueError("source_roots must preserve documented source scope")
    except (OSError, ValueError) as exc:
        errors.append(f"catalog-invalid: docs/skills.json: {exc}")
        return errors

    try:
        actual = source_files(root)
    except OSError as exc:
        errors.append(f"source-inventory: {exc}")
        return errors
    ids, registered, owners = set(), set(), defaultdict(list)
    module_ids = {row.get("id") for row in modules if isinstance(row.get("id"), str)}
    for row in modules + workflows:
        ident, skill = row.get("id"), row.get("skill")
        if not isinstance(ident, str) or not ident or ident in ids:
            errors.append(f"catalog-id: invalid/duplicate {ident!r}")
            continue
        else:
            ids.add(ident)
        if not isinstance(skill, str) or skill not in skills or skill in registered:
            errors.append(f"catalog-skill: {ident}: missing/duplicate {skill!r}")
        else:
            registered.add(skill)
        if row not in modules:
            continue
        for field in ("sources", "tests", "depends_on"):
            values = row.get(field)
            if not isinstance(values, list) or (field != "depends_on" and not values) or not all(isinstance(v, str) and v for v in values):
                errors.append(f"catalog-{field}: {ident}: invalid/empty list")
                continue
            for value in values:
                if field == "depends_on":
                    if value not in module_ids or value == ident:
                        errors.append(f"catalog-dependency: {ident} -> {value}")
                elif field == "tests":
                    target = (root / value).resolve()
                    if Path(value).is_absolute() or ".." in Path(value).parts or not value.startswith("tests/") or not target.is_relative_to(root / "tests") or not target.is_file():
                        errors.append(f"catalog-test: {ident} -> {value}")
                else:
                    if Path(value).is_absolute() or ".." in Path(value).parts:
                        errors.append(f"catalog-source: {ident}: unsafe {value}")
                        continue
                    found = [p for p in actual if matches(Path(p).parts, Path(value).parts)]
                    if not found:
                        errors.append(f"catalog-source: {ident}: unmatched {value}")
                    for path in found:
                        owners[path].append(ident)
    for skill in sorted(skills - registered):
        errors.append(f"skill-unregistered: {skill}")
    if not actual:
        errors.append("sources-empty: no executable sources")
    for path in sorted(actual - owners.keys()):
        errors.append(f"source-unowned: {path}")
    for path, claimed in sorted(owners.items()):
        if path not in actual:
            errors.append(f"source-outside-scope: {path}")
        if len(claimed) != 1:
            errors.append(f"source-overlap: {path}: {', '.join(claimed)}")
    return errors


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=ROOT, help="repository/fixture root; read-only")
    args = parser.parse_args()
    try:
        errors = check(args.root)
    except (OSError, UnicodeError, ValueError) as exc:
        errors = [f"documentation-check-error: {exc}"]
    if errors:
        print("\n".join(errors), file=sys.stderr)
        return 1
    print("Documentation structure valid; semantic freshness and actual cold review require independent evidence.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
