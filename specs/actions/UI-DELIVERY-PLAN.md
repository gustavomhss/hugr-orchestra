# Actions UI delivery — 0 to 100

Inventory first: [UI-INVENTORY.md](UI-INVENTORY.md). Integration baseline is current
dev `e6d9a35f1b2434262ae846f37d5725b1f062e085`; existing Actions backend is preserved
uncommitted. Canonical/peer checkouts remain independent. No new source commit,
push or PR authorization inferred.

## The delivery

An actual Orchestra chapter, matching approved Actions finish, with real connection,
workflow library, history, workflow/source/DAG, run/attempt/jobs/steps, bounded log
viewer, artifact discovery/download and native execution dialogs. Existing local
pipeline operations remain reachable under Local. CI/CD route remains compatible.

The backend already built supplies identity, reads, graphs, commands and durable
receipts. Owner then explicitly required **100% approved mock parity**. That includes
the six resource tabs, project settings, source editing/review and every production
dialog/control in the mock. New backend work is restricted to these visible mock
controls, not every GitHub/GitLab API. Missing controls cannot be silently dropped
or reported as provider-native unavailability.

No fixture-powered successful production path. A server without Actions shows an
explicit unavailable state and Local destination. Empty, loading, denied sign-in,
provider auth, rate-limit, stale identity, partial graph and unknown command outcome
are distinct states. No action silently retargets another binding/run/source.

## Stages

| Range | Work | Exit evidence |
| --- | --- | --- |
| 0–10 | Inventory and current-dev reconciliation | recorded source, API readiness, real baseline HEAD, confirmed Luna |
| 10–20 | Production browser baseline and frozen view/data contract | baseline artifacts; callback/state contract; disjoint writers |
| 20–45 | Parallel shell/style/library/detail/graph/dialog rendering | real Solid components, typed copy, approved geometry, no mock sample data |
| 20–55 | Parallel bounded controller and missing output API | actual generated client with ServerConnection auth; cancellation; raw bytes |
| 55–70 | Integrate route, connection/settings and Local access | app chapter navigable; all shown controls target actual APIs |
| 70–85 | Functional qualification on integrated candidate | coherent journey, races, errors, command receipts, downloads, Back/Forward |
| 85–95 | Visual/keyboard/RTL/responsive and performance comparison | approved-view screenshots plus measured lifecycle/retained-memory curve |
| 95–100 | Cold review, focal package checks, final handoff | precise candidate/source/evidence, usable screen, no unresolved blocker |

Ranges describe sequence, not a claim that 10% of engineering is already complete.

## Parallel wave and shared ownership

Maximum six nontrivial writers, each in an isolated worktree. Dependencies are
supplied as exact read-only support; each writer edits only its slice. Simple
visual/structural work uses confirmed `openai/gpt-5.6-luna`. Sol owns effectful data,
raw transport and integration decisions. Cold reviewer is never the author.

| Slice | Owner files (under packages/) | Model | Depends on |
| --- | --- | --- | --- |
| Data | `app/src/orchestra/actions/{api,model,requests,commands}.ts` + focal tests | Sol | frozen view contract and existing generated API |
| CI output | `core/src/actions/output/**`, narrow raw-opening transport seam + focal tests | Sol | existing transport, immutable run/job/binding |
| Collections/detail | `app/src/orchestra/actions/{library,detail}.tsx` | Luna | frozen ViewProps |
| Graph | `app/src/orchestra/actions/{graph,layout}.tsx/ts` | Luna | native Graph + frozen ViewProps |
| Dialogs/settings | `app/src/orchestra/actions/{dialogs,settings}.tsx` | Luna | frozen ViewProps and native command schemas |
| Visual primitives | `app/src/orchestra/actions/{components,format}.tsx/ts`, `actions*.css` | Luna | approved mock + shared Mx/Relay tokens |

Lead owns `contract.ts`, chapter entry/registration/navigation, typed i18n integration,
App package dependency, Protocol/Server registration, generated clients, final data
binding and browser/performance evidence. Source/log/artifact view glue is lead-owned.
No writer touches Session/timeline or provider-admin registries.

## Frozen source/data seams

View contract: `packages/app/src/orchestra/actions/contract.ts`. Render components
read one view-owned Store and call callbacks. They neither fetch data independently,
create global caches, poll nor serialize SDK objects into persistence.

Actions client is lazy within chapter. It preserves selected ServerConnection URL,
configured fetch, Basic credentials, Location and binding revision. Do not gate
Actions solely on legacy protocol label: normal combined CLI classifies v1 but
already mounts typed `/api/actions/*` routes.

Selection persistence holds small IDs/filter/route only, keyed by ServerConnection
and canonical directory. Payloads, secrets, source documents, graphs, logs, provider
responses and signed URLs are never persisted as navigation state.

One coherent request owner cancels stale reads on route/binding changes. Results
reconcile by binding/revision/run/attempt/source identity. Pagination retains native
opaque cursor and unknown totals. Refresh is explicit or bounded while visible;
no background polling after chapter exit.

Commands capture one immutable payload and client-intent ID. Prepare then execute
existing durable endpoint; duplicates observe same receipt. Unknown outcome remains
unknown; the UI cannot auto-admit a replacement lease or infer a nearby run.

## Output seam

Read-only artifact listing and log/artifact metadata/download use current immutable
provider project/run/job IDs. No new upload/Secure Files management is required.
GitLab authenticated 3xx is handled explicitly; signed destination fetch is HTTPS
and credential-free. Provider/Orchestra auth cannot follow signed redirects.
Raw streams preserve blank/non-UTF8 bytes, cancellation and failed partial transfer.
UI log preview has a fixed retained/rendered bound; complete download remains raw.

## Performance contract

- Chapter lazy; graph/source/dialogs load only when requested. No Relay editor or
  workflow authoring engine imported for a read-only DAG.
- Pure DAG layout computed once per source version; viewport drawing and maps avoid
  repeated per-node array scans. Dynamic matrices remain definitions, not fabricated
  Cartesian execution cells.
- Current page retained only; lists are paginated/windowed as needed. Source, graph,
  artifact bytes and log buffers cannot accumulate across navigation.
- Logs retain at most 64 KiB preview and render a bounded window. Full output is
  streamed directly to caller-owned save path, not converted to one Blob/arrayBuffer.
- Every listener, timer, RAF, observer, stream, request and temporary URL has an
  owner cleanup. No new process-global Actions UI Map/createRoot.
- Only small preferences persist. On leave, stale requests abort and active refresh
  stops. Background local pipeline runs retain their existing established ownership.
- Production baseline and final comparison run serially with identical navigation,
  profile and data workload. Measure CDP heap after warm-up/GC, DOM/listener counts,
  requests, long tasks, navigation latency and loaded chunks. Raw samples retained.
- A retained-memory growth curve must be classified before any profiler. RSS alone
  cannot prove leak. No machine-dependent threshold invented; repeatable regression
  or retained ownership is fixed before delivery. No "leak-free" blanket claim.

## Verification cadence

No per-edit/per-agent `bun typecheck`. Render workers provide source and screenshots
only; lead runs one affected-package check on coherent integration. Backend/output
changes get their necessary focal checks, not the unchanged full backend suites.
New failures justify targeted reruns after the root fix.

Tests use explicit files via test:ci; no local unit suites or full test:bench. Manual
browser validation/performance capture uses real built app and isolated own backend.
Never restart existing app/server. Any started verification process is owned and
uses separate ports/data root, and only that owned process may be stopped.

Acceptance journey: connect actual repo → library → filtered history → run/attempt
→ source DAG → job/steps → bounded logs/raw save → artifacts/raw save → source →
native dispatch/retry/cancel receipt → Back/Forward/reload. Repeat different binding,
rate/auth/error states, English LTR/forced RTL, narrow width, keyboard and rapid
open/close. Actual remote writes require authorized disposable fixtures; simulated
provider CI is labelled, never sold as production mutation proof.
