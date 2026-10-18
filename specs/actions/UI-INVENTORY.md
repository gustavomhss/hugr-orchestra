# UI delivery inventory — 2026-10-13

Owner correction: deliver the approved CI/CD screen using the backend already built;
do not expand provider-admin parity. Latest request adds a complete delivery plan,
maximum disjoint parallelism, Luna for simple work and sacred runtime performance.

## Verified state

- Runtime integration: `actions-runtime`, HEAD `e8319438e5cfb7a8039915ce6e8c2cf6ef390f6d`;
  all Actions source work remains uncommitted. Latest fetched `fork/dev`:
  `e6d9a35f1b2434262ae846f37d5725b1f062e085`.
- Current App CI screen is unchanged from fetched dev; local pipeline operations,
  filesystem inventory and source preview exist. Approved Actions mock lives in
  `actions-campaign/artifacts/actions-mock`; no production Actions UI module exists
  in the reviewed chapter path.
- Assembled backend/client groups: bindings, operations, workflows/source/graph,
  runs/jobs, native job commands and GitLab pipeline commands.
- Missing UI-essential wire: artifact discovery and log/artifact raw download/info.
  Resource/transfer group declarations and handwritten Client exist but are unassembled.
- App uses a separate compatibility/current client. Actions requires a narrowly lazy
  `@orchestra/client` adapter with the same configured ServerConnection fetch/auth.
- Scope ends at CI journeys: connection, library/history, workflow/run/jobs/steps,
  source/DAG, native execution controls, logs/artifacts and existing local pipelines.
  Broad variables/runners/cache/environment administration is frozen outside this
  delivery unless directly needed for an existing CI operation.

## Performance evidence and constraints

Static inventory identifies lazy chapter loading, SDK ref-counted contexts and
coalesced events. Existing local pipeline logs are bounded to 20,000 characters;
global profile map has no demonstrated eviction. This is a growth risk, not a
measured leak. New Actions state must be view-owned and bounded; legacy background
runner semantics stay outside this UI change.

No runtime baseline measured yet. Required before UI changes: production-build
navigation/JS heap/DOM/listener samples over serial open-use-close cycles. Repeat
same workload after integration, compare warmed retained-memory curve and latency.
Do not substitute RSS alone for live-heap evidence or profile before a growth curve.
Existing manual benchmark harness is timeline-focused and test suites remain CI-only.

## Agent evidence

Luna invocation verified `openai/gpt-5.6-luna`, session
`ses_ec965e498ffeU5dHhahnlK21sM`. Read-only inventory sessions:
- UI: `ses_ec9604105ffeZAABp8NZunUiuX`.
- API: `ses_ec96056bdffewkEFr3KbbctOO0`.
- Performance: `ses_ec9607969ffepGiXBepJ2JvTqu`.

The first API/performance attempts read empty review worktrees; retries with explicit
runtime paths succeeded. Empty output was not treated as absence. `agent-browser`
is unavailable; browser tooling will use installed Playwright or an explicit install.

## Baseline reconciliation

Fast-forward refused only `bun.lock` and `packages/core/package.json`. These two
known lead changes add `yaml@2.8.2` and Bun's dependency ordering. Preserve that
dependency intent, temporarily return these files to recorded base, fast-forward
private integration branch to current dev, then re-add exact YAML dependency.
No stash/reset/clean, peer checkout edit, source commit or dev freeze is involved.

Reconciliation completed: runtime HEAD now
`e6d9a35f1b2434262ae846f37d5725b1f062e085`. Existing Actions changes survived the
fast-forward. Core dependency intent restored explicitly; install/lock update next.
