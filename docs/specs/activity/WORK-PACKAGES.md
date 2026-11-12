# Activity monitor — work-package contract

Owner instruction: every WP and every task must contain axioms, DoD,
completeness criteria, invariants, success criteria and quality standards.
This applies to implementation, contracts, tests, reviews and integration work.

## Planning and dispatch gate

The five remaining product blocks are roadmap boundaries, not five atomic WPs:
worktree/external-cache measurements; remaining category collectors; use proofs;
cleanup/process controls; integrated delivery. Their detailed decomposition is
not yet approved or ready for dispatch. Reconcile the roadmap against all
R1–R20 requirements and acceptance items before declaring coverage complete;
resource readings, provenance, diagnostics and control requirements cannot be
dropped merely because they do not fit those five labels.

Before dispatching any WP:

1. Give it a stable ID, objective, baseline SHA, owner, explicit write paths,
   dependencies, frozen interfaces and acceptance-item ownership.
2. Fill all six fields below for the WP and independently for each child task.
   A task cannot say only “same as parent”. Repeat the relevant constraints and
   add its own concrete checks. References identify evidence; they do not
   replace the field's content.
3. Map each acceptance item to exactly one implementing WP and task. Review
   tasks verify that ownership without claiming the same implementation item.
   Record excluded scope and dependencies explicitly. Missing coverage blocks
   dispatch; splitting a WP must preserve its complete acceptance ownership.
4. Define executable acceptance checks before implementation, obtain independent
   coverage criticism and capture the hosted failing baseline. Pending evidence
   is pending, never a pass. Separate planning status from execution status.
5. Freeze dependent contracts and assign shared Schema, Protocol, generated
   Client, route registry, page and localization edits to one integration owner.
   Parallel execution requires disjoint writes or isolated branches with an
   explicitly serialized integration plan. Cap the initial wave at six agents.
6. Keep each review unit within 400 changed lines; split larger work by coherent
   responsibility without removing its acceptance obligations.

## Required WP and task record

Use this same record for a WP and for every task inside it. Empty fields,
“TBD”, “tests pass”, and “implemented” alone do not satisfy the dispatch gate.

```text
ID / parent:
Objective and observable result:
Status: draft | ready | active | awaiting-evidence | complete
Owner / baseline SHA:
Write paths / prohibited paths:
Dependencies / frozen contract reference:
Acceptance item IDs / executable checks:
Excluded scope:

Axioms:
  Explicit domain facts and non-negotiable premises this unit relies on.
  Include the relevant R1–R20 references and explain their local application.

DoD:
  Required deliverables, integration, review, documentation and evidence.
  Name the exact hosted test pack, package typecheck and applicable guards.
  Completion requires inspected evidence for the final source, not self-report.

Completeness criteria:
  Enumerate every owned acceptance item and all branches needed to cover it:
  success, empty, unread, stale, partial, failure, cancellation, races,
  restart and platform limits where applicable. Explain any inapplicability.
  No unowned subtask or deferred requirement may disappear during splitting.

Invariants:
  State what must remain true across every transition, retry and error.
  Specify identity, provenance, permissions, data retention and effect limits
  relevant to this unit, with checks that detect a violation.

Success criteria:
  Name the observable oracle for each acceptance item, expected outcome and
  failure condition. Attach hosted run URL, tested SHA/snapshot, counts and
  platform scope when available. Unrun checks remain explicitly pending.

Quality standards:
  Concrete architecture, repository style, accessibility, localization,
  performance bounds and review requirements relevant to this unit.
  State how each applicable standard is checked; do not invent numeric targets.

Evidence / review verdict / remaining blockers:
```

The six fields have different purposes: axioms establish premises, invariants
constrain transitions, completeness closes coverage, success names observable
outcomes, quality standards constrain implementation, and DoD closes delivery.
Acceptance IDs and test evidence are shared references across these fields;
do not maintain competing acceptance lists with different meanings.

## Mandatory domain constraints to specialize in each record

- Owner comes only from provenance recorded at creation/spawn. Current session,
  display selection, process name and cwd cannot manufacture ownership.
- Unread, unavailable and partial are not zero or an empty machine. Retain the
  last valid value with its original timestamp and expose current gaps.
- No automatic whole-machine filesystem or process-table walk to paint a frame.
  Disk reads use declared roots, named sources and explicit bounded requests.
- Logical bytes are not unique, allocated or reclaimable bytes. Unique remains
  “não colapsei” until the required identity/copy relationships are proved.
- Unsupported, failed or unrun use checks never prove idle. Object and claimant
  proofs cannot be inherited from aggregates or nearby paths.
- Read-only collectors cannot mutate resources. Docker has no effects. Cleanup
  and process control require their own durable identity, generation, human
  confirmation, fresh validation and verified postconditions. An observation
  UUID, PID, root ID or native tree identity alone is not an action capability.
- Never remove a registered worktree as a cleanup shortcut. Never expand
  disposable scope based on gitignore or filenames alone.
- Preserve the owner's running app/server. Installation and restarts remain
  separate delivery operations requiring the owner's direction.

## Repository quality floor

Specialize this floor into both WP and task records rather than copying a vague
“follow repo rules” reference:

- Preserve Schema → Core/Protocol → Server runtime dependencies. Client must not
  depend on Core/Server. Generate Client after public Protocol/HttpApi changes;
  never manually edit generated directories.
- Run applicable tests through hosted `bun run test:ci`; no local test suites.
  Run `bun typecheck` inside affected packages and completion guardrails with
  `bun run check:guards --base origin/dev`. Do not claim full-suite or platform
  proof from a focused run. Tie evidence to the tested source scope.
- Use actual implementations and fixtures; avoid mocks. Check formatting and
  diffs; run spawn-import checks when process boundaries are affected.
- Keep visible copy in EN and pt-BR, formatter placeholders correct, eight tab
  names in English, keyboard navigation and readable narrow layouts intact.
- Obtain independent scoped review and lead sign-off. State missing mechanical
  enforcement honestly; a manual checklist is not an installed stop hook.
- Preserve unrelated and inherited work. Do not merge, release or install as a
  side effect of completing a WP. Report the remaining product coverage openly.
