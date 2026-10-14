---
name: relay-doc-tooling
description: Use when changing Relay agent manuals, checking docs/skills.json ownership, validating documentation structure, or regenerating the documentation index.
---

# Relay documentation tooling

Audience: agents. Status: current.

## Trigger

Use when changing authored Markdown, source-to-skill ownership, or documentation validation/index behavior.

## Read first

- [Structural guard](../../../bin/check-docs.py), [index generator](../../../bin/gen-doc-index.py), [catalog](../../../docs/skills.json).
- [Guard/index tests](../../../tests/test_docs.py), [dev dependencies](../../../requirements-dev.txt), [contribution reference](../../../CONTRIBUTING.md).
- Read affected module source and consumers; structural checks cannot decide technical prose truth.

## Ownership

- `doc-tooling` owns `bin/check-docs.py`, `bin/gen-doc-index.py`, and maintenance of `tests/test_docs.py`.
- Lead integrates the shared catalog and generated `docs/INDEX.md` during a documentation wave.
- Module authors own manual accuracy and source/test links; independent reviewers verify technical claims.

## Contracts

- `check-docs.py` uses the generator's authored-Markdown inventory and MarkdownIt `commonmark` tokens.
  It checks parsed Markdown link `href` and image `src`, including reference links; code examples are not links.
- Local URL paths are percent-decoded, resolved relative to the document, and must exist inside the repository.
  Directory targets count as existing. Schemes, network locations, and pathless URLs are skipped.
- Fragments/query strings do not participate in path checks. Anchors and raw HTML links/images are not checked;
  external URLs are not fetched. There is no automatic prose-quality or semantic-staleness oracle.
- Skill YAML frontmatter uses PyYAML `safe_load`: name must match folder and `[a-z0-9]+(?:-[a-z0-9]+)*`,
  at most 64 characters; description must be a nonempty string. Markdown parsing requires a `Cold review` H2.
- That H2 is structural only: the guard does not establish reviewer independence, actual review, or approval.
  Other manual headings, single-line trigger descriptions, and line budgets are authoring conventions, not guard checks.
  README review instructions also remain prose, not evidence that an independent review occurred.
- Catalog requires integer `version:1` and nonempty `modules` and `workflows` arrays of objects; booleans are rejected.
  Modules use `{id,skill,sources[],tests[],depends_on[]}`; workflows use `{id,skill}`.
- IDs and registered skill paths must be unique across both lists; every inventoried project `SKILL.md` must be registered.
  Module dependency IDs must exist and differ from the module itself; this does not check dependency cycles.
- Module sources/tests must be nonempty string lists; dependencies may be empty. Test entries are literal paths
  beginning `tests/`: absolute paths/`..` are rejected and resolved file targets must remain inside `root/tests`.
  File symlinks resolving outside that tree fail; confined aliases may pass. Existence is not execution or coverage.
- Fixed source roots are `bin`, `lib`, `tools`, `benchmark`, `demo`, `examples`; catalog must preserve that set.
  Included sources are `.py`, `.sh`, or extensionless files beginning with `#!`; executable mode is not checked.
- Source-tree file canonical targets must stay inside the resolved repository and fixed roots, including file symlinks.
- `sources` entries reject absolute paths/`..`; literal/component globs, including `**`, match the checked inventory,
  not a `Path.glob` traversal. Each pattern must match. Ownership remains an exact complete partition:
  omitted sources and repeated matches fail, including overlapping patterns within one module.
- Inventories use explicit `os.scandir`; traversal IO errors become named `documentation-inventory`/`source-inventory`
  findings instead of empty glob results. Missing starting doc folders are optional; source roots are required.
- Encountered, nonexcluded directory-symlink entries raise an unsupported inventory error. Starting scan folders
  do not receive that entry-level test; `--root` resolves the repository root. Do not claim blanket root-alias rejection.
  Selected Markdown targets must resolve inside the repository; source targets also need fixed-root confinement.
- Document read/decode failures become `documentation-read` findings; guard CLI also reports caught check errors.
- Empty documentation, skill, or source inventories produce findings; malformed/missing catalog produces findings.
  Guard exits 0 for valid structure, 1 for named findings, 2 for missing imported dependencies.
- Index selects root `*.md` and recursively selects Markdown under `docs` (skills included), `benchmark`
  and `examples`; it excludes `docs/INDEX.md` itself and applies the shared authored-path filter.
- Any path component beginning `_gen` or equal to `.git`, `__pycache__`, `.pytest_cache`, `.relay-state`,
  `.relay-ledger`, `_runs`, `runs`, `.live-runs`, `node_modules`, `.venv`, or `venv` is excluded.
- Index hashes file bytes and a sorted hash/path manifest. `--check` writes nothing, ignores only the generated
  stamp, and exits 1 on stale content or 0 on agreement. Hash agreement does not prove prose freshness.
- Dev dependencies are pytest, PyYAML, and markdown-it-py; supported ranges are in `requirements-dev.txt`.
- Author skills with the nine headings used here, folder-matching name, and single-line trigger description.
  Module budget is 50–125 lines; integration may use 180. Reference docs retain concise agent-facing contracts.
  Skill source links use `../../../path`; sibling skills use `../name/SKILL.md`.

## Procedure

1. Resolve ownership and dependencies from the catalog; inspect actual source, consumers, and test bodies.
2. Install dev dependencies in the intended environment with `python3 -m pip install -r requirements-dev.txt`.
3. Update the manual's contracts, procedure, checks, and cold-review requirements; reconcile shared edits with lead.
4. Validate structure, regenerate the shared index through its lead owner, then check index and guard tests:

   ```sh
   python3 bin/check-docs.py
   python3 bin/gen-doc-index.py
   python3 bin/gen-doc-index.py --check
   python3 -m pytest tests/test_docs.py -q
   ```

## Checks

`tests/test_docs.py` exercises a valid fixture and named catalog, metadata, missing-H2, unregistered-skill,
source-addition/overlap, parsed reference-link/image, recursive-index, and byte-drift defects.
It also probes test-path traversal, external source/test file symlinks, and monkeypatched scandir permission/missing-subtree errors.
Repository/source-coverage checks cover only fixed-root `.py`, `.sh`, and extensionless-shebang sources, not all languages.
They also detect removal of an actual catalog row in an isolated copy; other-language sources are outside this inventory.
The separate current-authoring test reads the explicitly delimited handler/source table and checks native
file existence, today's `HttpApiBuilder.group` export spelling and Server registration. It rejects retired
launcher names in code spans/blocks in its named current authoring pages; it is not a TypeScript parser
or a general prose-freshness guard. The structural guard's language inventory remains unchanged.
Inspect positive/negative controls and what they execute; these tests do not judge prose truth or review independence.
Guard `--root <fixture>` is read-only; index generation writes the target index. Keep destructive probes isolated.

## Cold review

Mandatory: reviewer must differ from author and use a fresh isolated context without author-session history.
Freeze baseline commit, exact diff path, and artifact paths; reviewer inspects checker/index source and consumers.
Exercise this skill's manifest/checker/index integration with Procedure's named commands.
Inspect test controls, exact source partition, recursive authored-Markdown inclusion, and exclusions; probe
Markdown/YAML parsing and path checks without claiming anchor/raw-HTML validation or semantic staleness detection.
Review resolved test/source targets, checked-inventory glob matching, explicit IO errors, and directory-symlink/root-alias limits.
Write `APPROVE`, `FIX-FIRST`, or `REJECT` to a review evidence file, citing filepaths, exact commands/exits,
observed results, and residual limits. Missing validation evidence blocks `APPROVE`.
Fix findings, freeze revised diff/artifacts, and obtain independent re-review before Done.
This documented duty is not automatic enforcement and does not guarantee error-free results.
Commit or PR requires explicit authorization.

## Failure handling

Dependency exit 2: install the declared dev dependencies in the Python environment running the guard.
Structural exit 1: repair the named link, metadata, catalog, or partition finding, then rerun the affected check.
Inventory/read errors: restore access or correct confinement/symlink layout; do not treat unreadable trees as empty.
Stale index: regenerate after integrated authored edits; do not patch hashes by hand.
Behavioral uncertainty: inspect source/consumers or narrow the statement; an index hash cannot resolve it.

## Done

Independent `APPROVE` evidence and applicable validation for the frozen revision are required.
Catalog/source partition, structural checks, guard tests, and regenerated index agree after integration.
Independent source review supports prose claims; structural green alone does not establish their truth.
