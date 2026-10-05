# Charlie variants — independent research/design review

**Verdict: acceptable within reviewed scope. No material findings.**

## Baseline

Reviewed 2026-10-04. Own metadata worktree `charlie-variants-review` and source worktree `/Users/gustavoschneiter/Documents/HuGR/_worktrees/charlie-plugin` independently returned HEAD `76015a9dcd5b0c77164a3f1bee49b0060a4d37f0`; rechecked before report write. `specs/charlie/` is untracked: HEAD identifies native source baseline, not reviewed document contents. Snapshot hashes below identify documents.

## Reviewed scope

- `specs/charlie/skill-catalog.md:20–108,123–151`: proposed six entries, common-reference bundle, folded memory/handoff, conditional language/framework profiles, authoring sequence and evidence states.
- `specs/charlie/skill-matrix.md:53–116`: composed assignments, framework/mode differences and proposed evaluation boundaries.
- `specs/charlie/capabilities.md:9–108,124–136,194–200` and `specs/charlie/README.md:15–30,156–158,261–268`: closed implementation role, local coding freedom, host/Atlas ownership, assigned test authoring and proportionate checks.
- Source controls: `research/46-skill-composition.md`, `47-scope-variants.md`, `61-matt-pocock-skills.md`; frozen research contract also read.

Native cross-checks support documented composition: V1 body/base/sample delivery (`packages/opencode/src/tool/skill.ts:54–96`), V2 equivalent (`packages/core/src/tool/skill.ts:70–96`), actual discovery/collision/cache code and directory/URL registration. Shared sibling references require explicit reads and complete bundle; design states both. Native Charlie admission dependency is correctly retained: `maestro/roster.ts:10–18,54–62`, `agent/agent.ts:310–317`, `session/tools.ts:87–104` under `packages/opencode/src/`.

Pinned Matt Pocock TDD, implement and writing-for-agents bodies independently fetched at `d81f3a183412e71a5b1e84ca21bc1a35eea03a60`. Source contains repeat seam approval, review and commit directions; adaptations explicitly remove those responsibilities. Reusable behavior/oracle/reference methods remain scoped.

## Limits

Source/document review only. Runtime installation, activation, reference delivery and backend outcomes remain unexercised by this review. Public IDs remain proposals. Language-profile organization and composition reviewed; every framework/version claim and wider GitHub collection was not independently re-audited. No correction required within reviewed scope.

## Document snapshot — Git blob hashes

Paths relative to `specs/charlie/`:

| File | Hash |
| --- | --- |
| `skill-catalog.md` | `c70cb89e4705c65ba841134abaaef5cb34d0b4ae` |
| `skill-matrix.md` | `cac9ea4fe97c77ff3e83d9c4dbf332f0c28254e7` |
| `capabilities.md` | `63d9757add815039683eba4b10c6daa1cf712318` |
| `README.md` | `e19b8a5eabc49c49d53aa572b83570fe34ed59a5` |
| `research/46-skill-composition.md` | `a4684f2a87588742c83a867fb775a106edd82db1` |
| `research/47-scope-variants.md` | `88475b1d1594a2cc7f9f387668a07230398a3dd0` |
| `research/61-matt-pocock-skills.md` | `99817bb7d2ac5eeb3568c4ea0d178b04cf8383ff` |
