# Relay agent entrypoint

Audience: agents. Status: current.

## Route before editing

1. Read [SPEC.md](SPEC.md) for installed contracts and driver differences.
2. Load [relay-ownership](docs/skills/relay-ownership/SKILL.md); claim exact files.
3. Load [relay-blast-radius](docs/skills/relay-blast-radius/SKILL.md); identify consumers and checks.
4. Read [docs/skills.json](docs/skills.json), then load the module's `SKILL.md`.
5. Use [relay-maintenance](docs/skills/relay-maintenance/SKILL.md) for changes/recovery or
   [relay-integration](docs/skills/relay-integration/SKILL.md) for harness integration.

Skills live under `docs/skills/`; load them by path on demand, not all at once. No harness
discovers them automatically.

## Authority and scope

- Code defines installed behavior. Update SPEC and affected skills with behavior changes.
- `Status: historical` marks evidence or superseded plans, not operating instructions.
- Preserve meaning of `docs/fixtures/`, `test/fixtures/`, `benchmark/judge_cases/` and recorded results. Never edit
  a failing example solely to make a new claim green.
- `runs/`, `.live-runs/`, generated campaigns and local archives are runtime artifacts.
- Compiler acceptance does not imply every driver implements a field. Check SPEC's matrix.

## Execution discipline

- Keep edits within ownership claims; one integrating owner handles shared catalogs and cross-module contracts.
- Parallel authors use isolated worktrees and disjoint scopes. Do not run full runtime suites concurrently.
- Do not commit, push, publish or create a PR unless requested. Preserve unrelated work.
- Require **cold review**: a different agent/context receives frozen baseline/files, verifies source
  contracts and named checks, and returns `APPROVE`, `FIX-FIRST` or `REJECT` with evidence.
- Fix findings, freeze the new candidate and repeat review. Author self-report is not independent approval.
- Skill review instructions are not mechanical enforcement by Relay.

## Documentation checks

Run at repository root. Dependencies: [requirements-dev.txt](requirements-dev.txt).

```sh
python3 bin/check-docs.py
python3 bin/gen-doc-index.py
python3 bin/gen-doc-index.py --check
python3 -m pytest tests/test_docs.py -q
git diff --check
```

Structural guard checks links, skill metadata/cold-review headings and source ownership coverage.
Hash index detects byte drift. Independent cold review checks prose against code; neither automated
check proves semantic freshness. Select runtime checks from module skills for executable changes.
