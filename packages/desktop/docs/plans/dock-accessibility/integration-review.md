# I0 / independent integration review wave

Baseline: `5e4bea3b519c04cebfb787e98dfa171f5771d25c`. Lead source: `/Users/gustavoschneiter/Documents/HuGR/_worktrees/dock-accessibility`. User explicitly requested parallel execution on 2026-10-03.

Decision: HYBRID. Two independent readonly reviewers; lead owns runtime seam analysis and decisions. No GUI, Docker or heavyweight tests in reviewer tasks. No shared edits; source under review stays frozen until both reports return. Each reviewer hashes its exact input files before/after and reports drift rather than reviewing a moving target.

| Slice | Isolated scratch worktree | Exact primary review files | Acceptance |
| --- | --- | --- | --- |
| H — Guest bootstrap/bindings | `/Users/gustavoschneiter/Documents/HuGR/_worktrees/a11y-helper-review` | `resources/linux/app-dock-accessibility/{main,bindings}.py`; context/bus/ref modules and native tests are readonly supporting contracts | Host-confirmed admission, serialized semantic/control lifecycle, cancellation/deadline/reaping, startup and event invalidation. Reproducible safety/correctness findings with exact call order and a focused control. |
| R — Host RPC/plugin lifecycle | `/Users/gustavoschneiter/Documents/HuGR/_worktrees/a11y-rpc-review` | `src/main/app-dock-rpc.ts`, `packages/orchestra/src/plugin/app-dock.ts`; API/protocol/native/client/tests are readonly supporting contracts | Permission/admission/cancellation correlation, retirement/rebind/generation, native tombstones, bounded state and browser compatibility. Reproducible findings with a focused test shape. |
| L — Runtime seam | Lead worktree; runtime worktree readonly | Current runtime controller/coordinator, guest workspace launcher, packaging and shared-file diffs | Concrete compatibility/ownership map, existing capabilities versus required additions, exact next implementation boundary. Runtime acknowledgment remains explicit. |

Paths in H/R are relative to `packages/desktop` unless another package is specified. Reviewers read the designated lead files readonly; their detached `--no-checkout` scratch worktrees intentionally contain no baseline checkout. They must not treat missing checkout files as deletions to stage or restore.

Return shape: `APPROVE-scoped | REQUEST_CHANGES | BLOCKED`; severity and exact file/line; trigger/call order; minimum meaningful test; reviewed hashes; checks actually executed and limits; one correction to the lead's framing. Source-only review is not a test pass or release approval.

Lead verification order: reproduce each finding with the real production boundary, RED → repair → PASS plus relevant mutation control, then affected tests/typechecks only. Integrate findings sequentially if they share a contract. Preserve finite budgets, independent effect oracles and unknown/no-replay semantics.

No commits, staging, pushes, PRs or merges are authorized for this wave. Reviews stop at the compact verdict. Runtime-owned files and active demo resources remain under their current owner until coordination is resolved.

## Review repairs and composition ownership

Both review slices returned reproducible findings. H repaired subscription retirement/publication locking, rejection correlation for replayed envelopes, and fatal output saturation. Lead ran seven Linux helper-composition tests and all three named mutation controls. R repaired cross-reset client retirement ownership, awaited viewer-close teardown and tombstone viewer lifecycle; generation/UUID/capacity checks were added. Lead independently reproduced retiring-client and close-order mutation failures, restored source and passed the 43-case RPC/native set. A pre-existing capacity fixture used a scheduler turn per held client and could hit the actual reap watchdog; it now waits for actual termination admission, prepares hello before retirement, and joins/clears cleanup even on failure. Runtime limits were unchanged.

User selected **“Integre nesta frente”**: compose in `dock-accessibility` from a verified runtime snapshot and keep `dock-runtime` intact. Snapshot `runtime-input-20261003T215908Z.tar.gz`, SHA256 `baaded54211890279f499e762b94bfe5307a966f436f56eecd3fb7f8942f2116`, manifest `runtime-input-current.json`, lives in the private evidence directory. Its 105 owned source files and archive hashes were checked against stable runtime bytes during capture. Later runtime edits are not silently adopted.

Composition wave: two lightweight mechanical transfers, no GUI/test builds in the workers. A owns the snapshot's `packages/app/**` files; B owns snapshot desktop files except `src/main/app-dock.ts` and `src/main/app-dock-api.ts`. Lead owns the two shared-file merges, accessibility composition design, source correspondence and affected verification. Existing bridge/RPC/helper fixes and native test files are outside both transfer sets. Each target must be baseline-identical or absent before transfer, then match the immutable snapshot hash. No logic/translation edits are delegated as part of transfer.
