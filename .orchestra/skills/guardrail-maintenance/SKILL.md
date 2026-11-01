---
name: guardrail-maintenance
description: Use when adding, tightening, promoting (warn to gate), retiring or testing a Guardrail rule or engine option in `script/guards`, regenerating `docs/guardrail/catalog.md`, or handling a false positive, a `guardrail-ignore` or an approval label
---

# Guardrail maintenance

Ownership and invariants: skill `guardrail-ownership`. Option reference: `script/guards/README.md`.

## Add a rule

1. Copy `script/guards/rule.template.toml` to `script/guards/rules/<id>.toml`; the id is the file name.
2. `bun run script/guards/baseline.ts <id>` lists what it flags in the tree today. Each hit is a real defect or a false positive. Put every false positive in `negative` and tighten `match`.
3. For a rule that needs a diff (line balance, deletions, lockfiles) run `bun run script/guards/history.ts -n 300 <id>` and read the hits like baseline hits.
4. Fill `positive` and `negative` with real lines (paths for `changed-paths`).
5. Start `warn` unless a hit is almost always a defect. Write the `message` as what is wrong plus what to do.
6. Regenerate the catalog (below) and run the guards test.

## Tighten, promote, retire

- False positive in the wild: add the line to `negative`, fix `match`, never widen `exclude` just to hide one file unless the path is truly out of scope.
- Promote `warn` to `gate` only with evidence (history replay or a measured period). Demote when it blocks legitimate work: a one-line severity change in a PR.
- Retire by deleting the file and regenerating the catalog. Record why in the PR.
- Engine option: parse it in `rule.ts`, reject it on the wrong `on` kind, apply it in `engine.ts`, document it in `README.md` and `rule.template.toml`, and add a scenario to `guards.test.ts`. A new option is a strengthening or it needs a reason.

## Test

- On Actions: the suite lives under `script/guards` and runs in the CI step "Test guards".
- Local single file only when the owner allows it: from `script/guards`, `ORCHESTRA_LOCAL_TESTS=1 ORCHESTRA_EXPERIMENTAL_OMNI_SPAWNER=0 bun test ./guards.test.ts`. No typecheck or full suites on this Mac.
- Dry run on your own change: `bun run check:guards --base origin/dev` (add `--warn` to see gate findings without failing).
- Mutation habit: a new test must fail when the behaviour it covers is removed.

## Catalog

`docs/guardrail/catalog.md` is generated. After any rule change:

```bash
bun run script/guards/catalog.ts > docs/guardrail/catalog.md
```

Never edit it by hand. It lists id and message only; samples stay in the rule files, because printed here the credential and conflict-marker samples would trip the guards on the catalog itself.

## Approvals and escapes

- Line rule, genuine exception: `guardrail-ignore: <rule id> <reason>` on the line. Reviewers see it through `guardrail-ignore-added`.
- Path rule: ask a writer to apply the label `guardrail-approved:<rule id>` to the PR. Do not apply it to your own PR to get past a gate without telling the owner (the label is a reviewer decision).
- Edits to `script/guards/**` trip `protected-paths`: the PR needs its approval label. The change takes effect after merge, since rules come from the base.

## Workflow

`.github/workflows/guards.yml` runs from the base branch's engine when it supports `--cwd`. Changing the workflow or the runner's CLI contract: keep the old base working for one merge (the base engine runs first), and test with a PR that touches nothing else.

## Landing

Small PRs, conventional titles (`feat(guards): ...`, `fix(guards): ...`, `docs(guardrail): ...`). Surgical tests only; the full epic runs once per milestone, not per rule.
