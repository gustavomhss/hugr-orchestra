# Packaged native Lean, durable KPIs and UI wave

Baseline: revalidated dev40eadbe8827b0cb44722b6d878d89c00f444a1ac with reviewed
native cohort and approved immutable0.2.0 package. Current compiling scaffolds
declare unavailable metrics; they do not claim successful collection or totals.

## Frozen cross-owner contract

- Schema `LeanMetrics.Decision/Summary/decode`, Schema `LeanSummary.Input/summarize`
  and Core `LeanTelemetry.Input/measure` signatures are frozen for this wave.
  Pure aggregation stays in Schema so Client/UI never imports Core runtime.
- Persist one namespaced `ToolPart.state.metadata.lean` Decision only after final
  selected output. Metadata flows through existing SessionProcessor and SDK's
  unknown metadata map; no hand-edit generated DTO or Core runtime import in UI.
- Owner includes actual native project/repository ID and placement directory/Session/call; model identity is actual
  selected provider/model, not parsed command or user-claimed evidence. Metrics
  must contain no raw command, output, credentials or transcript.
- Whole selected text UTF-8 byte delta exact. Tokens initially use existing
  Token.estimate (`round(JS UTF-16 length/4)`), explicitly estimated counter ID.
  Signed delta; no billing/cost or arbitrary tokenizer/provider-name inference.
- Status describes applied final selection only. Eligible means issued complete
  exit-zero shell capture; unverified calls cannot imply native source facts.
- Scope is standard registry calls, not missing MCP/SDK/hosted calls. Disabled,
  missing capability, unsafe mapping, processor/budget refusal get honest labels.
- Primary aggregate scope is actual caller project/repository ID, not a reducer profile.
  Orchestra profile and filter profile are separately named dimensions; missing
  Orchestra profile evidence stays absent, never guessed from unrelated App Dock profile.
  Optional Session/location filters narrow a project view; project-only aggregate
  includes that project's worktrees/Sessions without mixing another repository.
- Aggregate unique persisted project/location/session/call identity; reject invalid records
  and foreign caller project or requested profile/Session/location. Identical duplicates count once; conflicting duplicates
  are not summed into savings. Replay/retry must not increase a total.
- Loaded browser history summaries are explicitly `loaded-history`, not falsely
  whole-Session totals. Complete-history applies only to an actually complete
  durable source. No in-memory event increment scoreboard.
- Percentiles use measured projection durations only and nearest-rank method;
  no samples returns null. Zero eligible denominator must not display 100%.
- Metric/counter/serialization error must preserve execution/policy/output; return
  unavailable data. UI decodes persisted values and never recalculates tokens.

## Disjoint implementation slices

1. Package proof: actual build-node/CLI builders, packaged loopback native proof,
   retained dependency license materials; no source-import counterfeit artifact.
2. Measurement/decoder: schema decoder + pure Core measurement, exact bytes,
   explicit token estimate, privacy, malformed values and safe unavailable path.
3. Native instrumentation: standard projection + SessionTools context only,
   monotonic duration/final decision, persisted metadata without provider-body
   original duplication or changing flags/policy outcomes.
4. Summary: pure unique-record aggregation and latency statistics; duplicate/
   conflicting/foreign/invalid/empty/negative-token cases, precise coverage label.
5. Tool UI: dedicated persisted KPI component + message-part placement/UI strings;
   exact/estimated/unavailable labels, no Core/Server runtime dependency.
6. Settings/Session UI: backend-owned toggle through current config patch, loaded
   history KPI panel using summary contract, app strings and focused tests.

No owners share writes. Parent owns shared contracts and later integration seam
verification. All heavy tests/builds run through scoped `bun run test:ci` in CI;
no local tests or app restarts. Named staging, first compiling checkpoint push,
small PRs, independent cold review, measured preservation controls, no merge.
