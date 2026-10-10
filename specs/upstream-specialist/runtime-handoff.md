# Upstream runtime handoff

Current identity correction: active upstream ID `archie`, profile `upstream`, assets `packages/archie-specialist`, config `agent.archie.name`; see [NAMING-CORRECTION.md](NAMING-CORRECTION.md). Old IDs, source paths, quotations and qualification pins below are historical, not active aliases or renamed-runtime proof.

Status: reviewed candidate slice, not landed, deployed or end-to-end qualified. No feature-branch commit, push or PR was made. The clean SHAs below are temporary CI snapshots produced by the repository's prescribed test runner.

## Source identity

- Runtime worktree: `/var/folders/lt/z11pyzhj0m17vn798jkk69hh0000gn/T/opencode/archie-runtime`.
- Branch: `archie-runtime`; baseline HEAD `73651a0e69` includes seat-framework #93 and capability baseline #100.
- Latest reviewed code snapshot: `abf7a72c77fcaeee1206400a8270b2581ae9839c`.
- Earlier registration/bundle proof snapshot: `d363d39e393b9e4f89031c48a43838e8ba45ebf1`.
- Latest snapshot differs from the earlier one only in the result/parser and their tests. Registration/assets are unchanged.
- Original planning/research worktree and its dirty work remain preserved at `/var/folders/lt/z11pyzhj0m17vn798jkk69hh0000gn/T/opencode/archie-planning`.
- This handoff document was written after the latest code snapshot; it is not part of that SHA.

## Implemented candidate scope

- `walt` native subagent, stable profile projection `upstream`, built on the installed execution permission base.
- Central default label `UPSTREAM_DEFAULT_LABEL`; config `agent.walt.name`, environment key `HUGR_UPSTREAM_NAME` through the existing resolver.
- Native config cannot disable/change the charter, primary mode or grants. Labels do not become routing IDs.
- Seat-scoped `walt-plan` and `walt-work-package` skills plus native proposal reference, using the existing source/bundled asset machinery.
- Host write roots and strict logical-task resume inherited from the seat framework. Shell confinement retains the framework's reported sandbox availability/fallback; charter prohibitions are not semantic command enforcement.
- Architecture-only reviewer `bobby` removed from installed seat registry and prompt files. Superseded roster hashes remain historically verifiable, without restoring routing/authority.
- Strict `upstream-result` JSON card: proposal artifacts (including inline lightweight Tasks), blockers, risks and next actions. Worker authority/identity/verification fields are rejected at every level.
- `upstream-work-result-v1` projection through existing SeatWork, without editing Task/Session/W6 integration files. Actual assistant actor must be `walt`; execution Session/message authorship comes from host message data. Existing host task/write-root facts remain separate from worker claims.
- Result must be a unique complete terminal card across all text parts. Supported outer code fences use explicit ASCII space/tab delimiters; this is not a full Markdown renderer or intention detector.
- Invalid/conflicting cards or material blockers hold an upstream assignment. Host failure/interruption prevails. Durable background results retain host-observed authorship; no-message running/cancelled results invent none.

## Owned files / integration boundary

Upstream owns roster/seats/charter/assets, result parser/projection, their tests and canonical upstream docs. The optional `Seat.profileKey` is a stable projection alias, not another permission base or agent ID; collisions fail registration.

Relay lead is the sole integrator for Relay service/schema and W6-specific Task/Session/`arsenal-completion` patches. Upstream supplies explicit handoffs. Overlapping Maestro/runtime claims require coordination before edits. This candidate edits none of those W6 source files and grants no approval or permission change through peer coordination.

The worker card is defined in `packages/orchestra/src/maestro/upstream-result.ts`. Host assembly is in `src/maestro/backend-result.ts`, consumed by the existing `backend-work.ts`/SeatWork path. Artifact paths remain worker claims; there is no claim of content acquisition, immutable publication, approval or adoption.

## Observed verification

- `bun typecheck` in `packages/orchestra`: passed for latest code. Earlier timeout and test-type error were resolved; neither is reported as green.
- Registration/roster/hash/card/Task/truncation/seat-framework tests: Linux and Windows, 57 pass per lane, including genuine source/bundle/restoration checks and existing isolated mutations: <https://github.com/gustavomhss/hugr-orchestra/actions/runs/37784637252>.
- Final parser/Task lifecycle tests: Linux and Windows, 36 pass per lane: <https://github.com/gustavomhss/hugr-orchestra/actions/runs/37789277776>.
- Closed-schema negative control: allowing excess fields made authority/extra-field tests fail in both lanes: <https://github.com/gustavomhss/hugr-orchestra/actions/runs/37787013417>.
- Final delimiter/whole-message negative control: Unicode-trimming closers and last-text-only parsing made their respective regression tests fail in both lanes: <https://github.com/gustavomhss/hugr-orchestra/actions/runs/37789843987>. Isolated probes were restored afterward.
- Cold registry/assets review: `APPROVE` for its slice on `d363d39`, reviewer Session `ses_ee445d03cffe7XDfrku6n1cGbx`.
- Cold result review: initial `FIX_FIRST` findings fixed; final `APPROVE` for result slice on `abf7a72`, reviewer Session `ses_ee445cffcffe3bGXJxEqoRwmBh`.
- No local tests, live model evaluation or app/server restart was performed.

The first CI exposed a fixture that copied only the backend tree. The fixture now copies installed specialist trees before registry loading, preserving source/bundle proofs and their mutation controls. Subsequent result checks exposed an incorrect race-dependent background assertion; deterministic running-without-message coverage now tests that contract separately.

## Mandatory remaining closure

This slice is not the full upstream/WP feature and must not be sold as such:

1. Restricted native Arsenal authoring subset is not installed here. No forged `nativeMaestro` flag or wholesale governance grant was introduced.
2. Maestro/runtime lead must transfer planning orientation/playbooks and coordinate adoption without relabeling upstream authorship.
3. Relay/W6 must implement immutable proposal publication/revision/digest binding, actual upstream provenance and applicable native approved scope. Card/path/`done`/structural validation cannot supply authority.
4. Host persistence/PlanRevision provenance integration must represent the upstream author rather than claiming stakeholder or Maestro authorship.
5. Progressive current-step delivery, replay/transitions, stop/resume and global completion remain Relay/W6-owned integration. Tasks stay lightweight.
6. Canonical TEAM/class-map changes and research/contracts remain in `archie-planning`; reconcile them deliberately before landing, updating their old implementation-status wording. Do not discard those artifacts or land stale standalone documentation.
7. Real Maestro seat/domain evaluation and same-model progressive/eager benchmark remain required to claim qualification or gains.

The existing `project-config.ts` GitHub Project option binding still contains the retired reviewer. It is a reference to actual external board option IDs, not a new native seat or an alias for upstream. No external board mutation was performed; coordinate any board migration separately and never reuse the retired reviewer option as invented upstream identity.

Relay native proposal schema pin remains `c0fcf4f394`, `packages/schema/src/relay-sprint.ts`, `RelaySprint.Sprint`. `gen` is ledger generation, not schema version or approval; preserved unknown metadata is ignored by runtime. Public authoring check is peer-reported Maestro-only; publishing cannot mint authority.
