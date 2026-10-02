# Contributing — agent workflow

Audience: agents. Status: current.

## Establish scope

1. Read [AGENTS.md](AGENTS.md),
   [relay-ownership](.opencode/skills/relay-ownership/SKILL.md), and
   [relay-blast-radius](.opencode/skills/relay-blast-radius/SKILL.md).
2. Inspect branch baseline, working-tree changes, affected runtime source, and
   tests. Treat unfamiliar edits as another author's work.
3. Claim explicit, disjoint paths before editing. Resolve shared-path ownership
   with the lead; include generated artifacts in the claim or request their owner.
4. Load [relay-maintenance](.opencode/skills/relay-maintenance/SKILL.md) and the
   affected module skills through [documentation routes](docs/README.md).

## Change contract

- Runtime source and executable evidence win over historical prose when describing
  shipped behavior. [SPEC.md](SPEC.md) also contains intended behavior; identify
  the gap rather than copying a design claim into a current recipe.
- Preserve surrounding structure and naming. Keep gate logic driven by the plan.
- Prefer named deterministic `checklist[].cmd` controls. Judge verdicts remain
  non-independent even when explicitly blocking.
- Trace both gate consumers and audit readers when changing controls or ledger
  fields. Keep-best means regression checks, not immutable files or rollback.
- Update affected docs and project skills in the same change. New task guides
  belong in `.opencode/skills/relay-*/SKILL.md`; route them from the owned index.
- Keep docs aimed at agents: required inputs, commands, outcomes, source authority,
  and actual limits. Mark current references `Audience: agents. Status: current.`
- Use relative links. Distinguish deterministic fixtures, recorded live evidence,
  and unverified claims.

## Verify documentation

From repository root, after dependent routes and skills are present:

```sh
python3 bin/check-docs.py
python3 bin/gen-doc-index.py
python3 bin/gen-doc-index.py --check
python3 -m pytest tests/test_docs.py -q
git diff --check
```

`check-docs.py` validates links, skill frontmatter, and inventory. These checks do
not establish semantic correctness of prose; compare behavioral claims with
runtime source and relevant tests. Coordinate index regeneration with its owner
when `docs/INDEX.md` falls outside the path claim. Report unavailable checks as
blocked, with the missing artifact named.

For runtime changes, run change-scoped checks selected by the blast-radius skill.
Record exact commands, results, and coverage limits. Follow the assigned landing
workflow; do not infer permission to stage, commit, push, or open a PR.

## Return for review

Report changed paths, corrected contracts with source citations, executed checks,
and remaining blockers. Flag historical framing that still contradicts runtime
outside the claimed paths so its owner can repair it.
