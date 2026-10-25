---
name: guardrail-ownership
description: Who owns each piece of Guardrail (the declarative CI guards in script/guards), the invariants that must not regress, and what is deliberately out of scope
---

# Guardrail ownership

Guardrail is 73 small deterministic CI rules over the lines and paths a pull request adds. No AI in the loop: the same diff always gives the same findings. Code is `script/guards/`; background is `docs/guardrail/` (`pilot-catalog.md` why, `validation.md` evidence, `sources.md` origins, `catalog.md` generated rule list, `frontend-brief.md` the screen). How to change it: skill `guardrail-maintenance`.

## Ownership

| Piece | Owner file | Rule |
|---|---|---|
| Rules | `script/guards/rules/<id>.toml` | One file per rule, the file name is the id. No positive and negative sample, no load |
| Rule parsing and options | `script/guards/rule.ts` | A new option is parsed here, rejected where it does not apply, documented in `README.md` and in `rule.template.toml` |
| Matching | `script/guards/engine.ts` | Pure: rules, config, diff and approvals in, findings out. No git, no network |
| Diff reading | `script/guards/diff.ts` | The only place that talks to git |
| Runner, report, exit code | `script/guards/run.ts` | Reads rules and config from the merge-base; owns `Report`, the text output and annotations |
| Shared config | `script/guards/config.toml` | Generated-file list, excluded paths, `[sets]` globs |
| CI wiring | `.github/workflows/guards.yml` | Runs on every PR from the base branch's copy of the engine; turns labels into approvals |
| Scenario and sample tests | `script/guards/guards.test.ts` | Runs every rule against its own samples plus golden scenarios (escapes, renames, moved code) |
| Dev tools | `baseline.ts`, `history.ts`, `catalog.ts` | Not gates. Baseline and history evaluate a rule against today's tree and past commits |
| Product screen | `docs/guardrail/frontend-brief.md` | Screens belong to the Interface session; engine and data contract belong to Guardrail |

## Invariants

- A PR cannot weaken its own guards: rules and `config.toml` come from the merge-base. Only when the base has no rules does the runner read the working tree and print `BOOTSTRAP`.
- A guard that ran nothing proves nothing: setup errors or zero rules fail the run, in `--warn` too. Never turn that into a pass.
- `added-lines` rules read only added lines; old code never fails. A line moved elsewhere in the same diff does not count, one removal excusing one addition.
- Every rule carries a positive and a negative sample, and the sample test is the proof it fires and stays quiet. A `gate` rule needs a baseline run and, for diff-shaped rules, a history run before it lands.
- `gate` only when a match is almost certainly a defect; anything a regex cannot decide exactly is `warn`. When in doubt, `warn`.
- Escapes stay visible: `guardrail-ignore: <rule id> <reason>` needs a reason and is itself reported by `guardrail-ignore-added`; a changed-paths rule is cleared only by the label, and any other rule can be cleared by it when an ignore comment cannot be written (JSON) `guardrail-approved:<rule id>` from someone with write access. Plain `guardrail-approved` means `protected-paths` only. `script/guards/**` is protected.
- The `message` is the whole error text: say what is wrong and what to do. The UI shows it verbatim.
- Size limits stay in `script/godfile.ts`. Guardrail does not reimplement them.
- Spawn only through the existing paths; `bun run check:spawn-imports` must stay green.

## Known limits (declared, not bugs)

- Regex cannot parse: rules that need syntax are `warn` or stay out.
- Not yet built: `commit-title-format` and `branch-name` (need PR metadata), `import-direction` (B1), `legacy-name` (N1), `generated-stale` (G1). The owner postponed them.
- No auto-fix, no comment posting, no JSON output or server route yet (the screen needs them; see the brief).
- `guards` is not a required check on `dev` (no branch protection); the gate fails the job, not the merge button.
