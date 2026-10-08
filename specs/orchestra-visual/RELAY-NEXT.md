# Relay completion: Maestro-only campaign

Baseline: `57a3d32731326e7625d52d3e3f3bab66f0b35e20`.

## Owner decisions

- Workflows execute through Maestro only. The app creates, modifies, explains and observes workflows; it does not dispatch them.
- Planning, decomposition, tasks and work packages are moving to Archie (previously called Wallie), which another front is building. Maestro owns orchestration, organization and decision. This is the owner-directed target, not a claim that the transition already shipped.
- Agents, MCP, CI/CD, Workspaces and Janitor remain deferred. This campaign does not reopen their product specification.
- The lead owns architecture, shared contracts, integration and the final milestone. Authors own disjoint work packages; cold reviewers cannot author their reviewed changes.
- Each work package runs only affected tests on Actions. The complete suite runs at milestone close.

## Existing behavior versus new work

- The native Relay arm already owns evaluation, parking, per-gate retry budgets, release and audit. Arsenal binds actual Maestro/Task/Session authority to that arm.
- Published authoring definitions currently do not bind directly to an approved native Task contract. Publishing itself must not arm or schedule work.
- Historical WP15/WP16 labels do not authorize a second planner, an autonomous workflow scheduler, or UI execution. New lifecycle work stays Session-owned; planning artifacts come from Archie's eventual authoritative interface, and Maestro remains the orchestrator.
- Prompt hook Remind notes are produced but discarded by the Session path. They must become durable prompt-bound context without rewriting user text.
- Receipt recovery currently happens at an enabled-hook boundary in the same Session. Recovery outside that boundary must never invoke hooks, models, tools, SessionExecution.wake or resume.
- Python runtime is not used by the native engine. Legacy services/tools, workload checks and frozen oracle sources still exist; those roles must not be retired as one blanket deletion.

## Work packages

### W1 — UI authoring and observation policy

- Remove workflow start/recheck/release dispatch affordances from UI and command-palette actions. Preserve authoring, publish/unpublish, structural diagnostics, graph navigation, read-only execution/audit explanations and existing Hook installation policy.
- A UI definition check must not execute shell commands, judges or model work. Native Maestro tooling owns executable gate checks.
- Preserve the approved design and geometry. Use existing copy keys where applicable; no invented product capability or PT-BR product text.
- Owners: app Relay editor/header/dialog/command actions and their affected tests. Lead owns any Protocol/Server operation-policy contract changes.

### W2 — durable prompt reminders

- Persist a typed host-owned `promptContext` sidecar, separate from `Prompt.text`, containing ordered rendered reminders. Public prompt input does not accept this privileged sidecar.
- Allocate the final message ID before prompt hooks. Exact admitted-ID retries skip hooks and retain the winning admission's original sidecar. Retry equality remains Session + original Prompt + delivery.
- The admission event, inbox projection, promotion event and projected User message carry the same immutable sidecar. Historical events/rows omit it safely.
- Lower reminders as separate labeled text content associated with that user message, not as Location-wide Context Sources or standalone context before promotion. Preserve original stored user text, attachments, chronology and permissions.
- Continuations see the admitted reminder while its prompt remains in active history; normal compaction summarizes it with that history. Do not reinsert compacted reminders as fresh instructions.
- Core hook results remain neutral data; denial and native approval behavior do not change. V1 parity is a distinct integration slice if its admission path needs different storage.
- W2a owns Schema event/message/input fields and inbox SQL/migration/projection. W2b owns hook-result propagation, prompt admission and lowering after W2a's field contract freezes. Shared generator and migration indexes stay lead-owned.
- Required proofs: provider request capture; user text unchanged; retry after hook edits/uninstall; identical text with distinct IDs isolated; concurrent same-ID admission delivers only the stored sidecar; replay/promotion/compaction; Remind cannot allow a denied tool.

### W3 — receipt-only Location catch-up

- Add a Location-scoped recovery operation over durable hook decisions joined to stored Session ownership. Restrict to the exact implicit-local project/directory placement. Explicit workspace placement remains reserved.
- One pass pages Session IDs in stable order, with bounded batches, and reuses the existing shipper. Empty selection performs no Relay filesystem operation.
- Initialization may schedule best-effort scoped receipt IO after the Location graph is available. Never place filesystem IO inside Event projection transactions.
- Preserve current per-Session sequence/inFlight/idempotency semantics; do not claim or impose a total cross-Session order. Orphaned decisions retain their durable records rather than inventing placement.
- An explicit trusted recovery method provides another opportunity after transient failure. It does not imply automatic provider continuation or global recovery for unopened projects.
- Owners: new Core recovery module/tests. Lead owns registration in `location-services.ts` and trusted post-replay trigger integration.
- Required proofs: no-hooks recovery; two projects and two same-project Locations; concurrent live shipment; repeated acquisition dedup; ledger/key failure; empty placement laziness; no new hook decisions/model calls/wakes.

### W4 — macOS icon

- Choose the dark macOS variant, using the official immutable inverse symbol, standard rounded-square silhouette, padding and shadow.
- Change only channel `icon.icns` and Darwin-only `dock.png` plus a reproducible asset-generation script/evidence. Windows ICO and Linux/window PNG assets remain byte-identical.
- No CLI-resource or shared packaging ownership changes: those belong to Maestro's runtime-closure campaign.
- Lead reviews raster previews at Dock size and checks official source hashes before landing.

### W5 — Nix preparation and final closure

- Own `nix/**`, final dependency/output hashes and Nix build checks. Inspect actual derivations before changing them.
- Prepare derivation/build contracts now; compute final hashes only after Maestro publishes finalized manifests/dependencies/CLI artifact closure.
- Nix evaluation is not a Nix build. Verify real supported builds, exact artifact inputs, source/runtime dependency boundaries and installer identity.
- CI gate changes require anti-vacuity and meaningful negative controls. No source hash is guessed or copied from a different tree.

### W6 — Maestro definition binding and lifecycle

- Bind selected published document/version/checksum and Archie-produced planning artifacts to actual approved native dispatch authority. Authoring state alone cannot mint execution permission.
- Reuse native dispatch and the single Relay evaluator. The current Task path is an implementation fact, not a mandate to leave planning/tasks/WPs owned by Maestro. Coordinate with Archie's construction front before fixing member IDs or changing ownership/charters.
- No additional provider loop, second grader, autonomous supervisor or UI scheduler.
- Reject unsupported profile tooling and invalid/unpublished/drifted definitions before dispatch; `runnable` is necessary, not a substitute for authority or publication checks.
- Define any `session.next.settled` event at the existing Session execution ownership boundary, with no durable drain identity. Joins, advisory wakes and idle/missing interruptions must not synthesize duplicate work.
- This package follows W2's Session schema contract and the lead's precise lifecycle design. Do not dispatch speculative interface work before that design is fixed.

### W7 — legacy Python disposition

- Preserve golden/fixture bytes, oracle-pinned source bytes, generator reproducibility and historical review records.
- Retire unneeded legacy service entrypoints only after each reachable caller/skill/document has a native replacement or explicit historical disposition.
- Python workload checks are not the Python Relay runtime. Tooling not yet ported must remain unavailable rather than become unchecked runnable profiles.
- Separate evidence/oracle CI from native production/release packaging. Do not remove a guard or a pytest lane before its owned properties have reachable replacement coverage.
- Lead owns shared catalog, operational documentation reconciliation and generated documentation index. Frozen parity exceptions require owner review before destructive retirement.

## External ownership

Maestro runtime-closure owns release lookup, CLI artifacts/background CLI, desktop CLI resources/bootstrap, WSL, Core npm/SDK helpers and provider OAuth/registration probes. Its branch is `runtime-closure`; do not duplicate these files. Nix final hashes depend on its final tree. Backend charter/prompt/roster coordination stays with that lead, and Archie construction/charters stay with their separate owner, until ownership is explicitly transferred. Candidate lead Session: `ses_ee6d55370ffe6CYDCP42Ox46NN`; confirm its interface before treating this contact as ownership. Do not claim universal UI/API agent routing from roster prose alone.

## Landing

Push compiling author checkpoints early. Stage by explicit filename; no blanket staging, history rewrite, force push, hook bypass, worktree cleanup or owner-server restart. Capture every required mutation before trusting a green result. Integrate DAG order, regenerate public clients through their generators, verify frozen tree hashes, and close one final milestone PR on applicable CI.
