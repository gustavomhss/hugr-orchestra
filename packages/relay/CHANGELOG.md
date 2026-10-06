# Changelog

Audience: agents. Status: historical entries with a current unreleased change record.

Read dated entries as evidence of their recorded revisions, not installed contracts. Use [SPEC.md](SPEC.md)
and [AGENTS.md](AGENTS.md) for current behavior and work routing.

All notable changes to HuGR Relay are documented here. Format loosely follows
[Keep a Changelog](https://keepachangelog.com/); the project is pre-release.

## [Unreleased]

### Runtime — repair failures exposed by independent review

- Preserve decoded command/control text through current checks and JSONL regression/DoD transport,
  including tabs and trailing LF. Protect transport stdin from oracle programs; explicit command pipes
  and heredocs remain supported. Malformed required values and unavailable blocking judges fail closed.
- Reject nonarray current checklists before item execution while retaining missing/null/empty-array
  acceptance; reject decoder output names in the reserved `__relay_json_string_*` namespace.
- Preserve raw ARM position and current/migrated/next WP/macro identities. Resolve raw whole ID,
  then raw first-dot suffix, with LF-only legacy cleanup on a miss and CR retained. CLI validates
  current ID/macro and next ID before commands; ARM validates next ID/macro inside advancement,
  after commands but before passing-round flush. Named CLI checks validate only their selected WP.
- Resolve releases by the actual WP ID, reset the matching retry state and reject blank reasons.
  Serialize whole ARM evaluations with `.run.lock`; contention returns exit 3 without grading.
- Make mandatory ARM/CLI/benchmark evidence and disposition append failures fatal before corresponding
  state/counter/retry publication; ARM release evidence precedes consumption/reset/reactivation.
  Earlier effects/records and later state-write failures remain possible. Ancillary ARM appends and
  archives remain best-effort; ordering provides no atomicity, rollback, or fsync-backed durability.
- Preserve `${name}` bindings when compiling bare `{macro}`, `{sub}` and `{criterion}` placeholders.
  Parse judge prose verdicts exactly. Typed judge samples/ballots decide availability and voting;
  backend/model/truncation labels are display metadata. JSON adds boolean `available` while public
  API/CLI functions retain three-tuples. Calibration requires valid exit-0 response fields and literal
  true availability, excludes invalid measurements, and reports all-invalid agreement as unavailable;
  import does not launch model calls. The shared gate does not enforce that added availability field.
- Check reachable sprint control IDs in both directions, reject unusable records/sprints with structured
  audit results, and distinguish legacy-oracle uncertainty from an executed comparison.
- Reject duplicate decoded ledger keys at every depth, escaped equivalents, unsigned suffix fields,
  and nonfinal root hashes; reserve append-body root `h` while retaining nested hash data and original
  signed-body bytes. Shared verifier/audit decoding also rejects unquoted `NaN`, `Infinity`, and
  `-Infinity`; quoted strings and valid lexical numbers such as `1e999` remain allowed. This is not
  arbitrary numeric exactness or complete finite-valued schema validation.
- Resolve `/ask` against the arm's current position and baseline; distinguish busy/error preconditions
  from satisfied checks. Serialize ask/answer operations and surface required-note write failures.
- Treat Git scan errors as failed policy evaluation, skipped benchmark tests as unmet requirements,
  and invalid JUnit/collection results as invalid measurements. Require real failures for grader sanity.
- Require state, flags and an auditable terminal pass for fleet-example completion. Regression cases
  preserve real failure probes while using bounded test-specific retry budgets.

### Documentation — agent skill corpus

- Added project-local skills for ownership, blast radius, maintenance, integration and module maintenance.
  Every skill requires independent cold review of frozen artifacts before completion.
- Reconciled current references against implemented driver differences; marked superseded plans and dated
  measurements as historical, preserving benchmark/fixture evidence.
- Added `AGENTS.md`, documentation routing and `docs/skills.json` source ownership catalog.
- Added structural documentation validation and regression tests; expanded the hash index to recursive
  documentation and skills. These checks do not prove semantic freshness or actual review independence.

### Fixed — 2026-08-24 (research-v2: two GRADE defects and one self-graded review verdict)
Three defects found by RUNNING the `research-v2` profile agent-driven end to end, not by reading it.
All three were visible in the same live run (52 sources, 41 findings, 8 conclusions, 199 min).
- **The GRADE starting level was an unchecked free parameter.** `calibration_is_derived` verified
  `final = start − downgrades` but never the `start`, so the agent picked `low` for all eight
  conclusions by fiat and the arithmetic ratified it — GRADE's own failure mode, one level upstream of
  where it was being caught. GRADE fixes the starting level by the KIND of evidence, so the rule is
  now declared once over kinds: `calibration_policy_is_declared` + `starting_level_is_derived`.
  `conclusions.json` becomes `{calibration_policy, conclusions}` so a level cannot be revised without
  the rule that produced it appearing in the same diff.
- **The four-level scale bottomed out and the label kept implying a distinction.** `very-low` absorbs,
  and all eight conclusions landed there. The scale is kept faithful to GRADE; what is added is
  disclosure. `the_certainty_floor_is_disclosed` fires when the arithmetic runs off the end of the
  scale or every label ties, and requires `floor_disclosure` to name what the reader should read
  instead; `report_discloses_the_certainty_floor` requires that substitute — the downgrade domains,
  beside each conclusion — to reach the reader. Being very-low about everything is not a defect;
  letting the label imply a distinction it has stopped making is. The report control FAILS on the very
  corpus it was derived from, and that artifact is left failing rather than edited to agree with it.
- **A review verdict the executor writes is self-graded evidence.**
  `test "$(jq -r .verdict review-synthesis.json)" = APPROVE` is a command run by the gate over a file
  written by the executor — the agent's own claim advancing the chain, which `enforcement-model.md` §4
  forbids, wearing a `jq` as a disguise. Because the executor knows the gate wants APPROVE, it
  re-spawned reviewers locally until one gave it: **21 clones, 21 of 21 rounds changing the artifact,
  `conclusions.json` growing 11,365 → 35,664 chars, 11.16M tokens, ~2h — and 3 rows on the ledger, all
  `pass`, one gate fire.** A justification ratchet, invisible to audit, and `retry_budget` never
  applied because the gate never re-fired. Both verdict controls are replaced by blocking judge
  controls run BY THE GATE over the artifact itself (`evidence-withstands-cold-review`,
  `conclusions-withstand-cold-review`). The executor still writes its review and is still graded
  against the diff; it no longer declares the outcome. Nine controls of the same shape remain in
  `design`, `spec-decompose` and `planning` — see `docs/FINDING-self-graded-review-verdicts.md`.

### Added — 2026-08-24 (a judge entry records the artifact's STATE, not just its address)
`oracle` records what was asked, `scope` records where. Neither recorded what was **there**, so two
fires of the same control over a file that tripled in size between them were byte-identical on the
chain — which is how the ratchet above stayed invisible. Judge entries now carry `artifact`: the
sha-256 of the contents at the scoped paths at the moment of grading, each path contributing its name
as well as its bytes (so a rename with identical content still moves the digest) and `absent` where
there is no readable file. Emitted only where there is a scope to digest, so a deterministic
control's entry is byte-identical to what it always was and legacy chains still verify — the verifier
recomputes the MAC from stored bytes, so additive fields stay backward-compatible.
sha-256 and not a faster hash, for consistency rather than speed: the chain is sha-256 end to end,
`shasum` is already a dependency of `lib/relay-gate.sh`, and at kilobyte artifacts hashed once per
gate fire the difference does not exist.

research-v2: 52 → 56 controls (52 mechanical, 4 judge), zero ungated. Suite 497 → 504.

### Added — 2026-08-22 (control plane, R5–R7: an orchestrator may mutate a live chain)
`docs/control-plane.md` designs how an orchestrator amends a **running** chain and how a human watches
and intervenes. R5–R7 build the record that has to carry it. Three defects were reproduced first, then
fixed, then locked as regression tests. Full suite 138 green.
- **R5 accountable chain entries** — entries now carry `oracle` (sha-256 of the `cmd` or judge
  criterion that produced the verdict), `origin` (`sprint` / `policy:<bundle>` / `injected:<actor>`)
  and `gen` (the plan generation evaluated), inside the hashed body. **The defect:** swapping only a
  control's `cmd` — `! grep -q '@' app.log` for `true` — while keeping its `id` and `assert`
  byte-identical turned a failing PII control into `RESULT: PASS — auditable`, exit 0, chain INTACT,
  with the violation still on disk. The chain recorded *that* something was graded, never *what
  graded it*. `relay verify` gained the `ORACLE-CHANGED` verdict (exit 2). `verify_ledger.py` needed
  no change — it recomputes the MAC from stored bytes, so additive fields are backward-compatible and
  legacy entries without them still verify.
- **R6 position by id, keep-best by acceptance** — an arm's position is a WP **id**, not an array
  index, and `state` (`active|complete|escalated`) is kept separate from it: position is a fact, not a
  status enum. **The defect:** splicing a WP *before* the cursor livelocked — the index re-aimed at
  different work, the regression guard charged controls the runner had never been given, and since a
  regression-only failure deliberately spends no gate budget, nothing escalated: 12 fires, counter
  frozen, zero escalations, one model turn burned per fire. The fix is the compliance criterion — an
  amended plan binds only where the existing ledger is still a valid trace of it, so a control with no
  recorded pass on this chain was never accepted and cannot regress. A position absent from the
  current generation is now a named `position-lost` event, never a silent re-aim.
- **R7 stuck-gate economics** — a fire that carries no new information no longer grows the record: a
  round is identified by `round` (a sha over its verdicts and the failing set they produced), the first
  occurrence is written in full, and identical consecutive rounds become one `gate-fail-repeat` with a
  `repeat` count under that same sha. Anything that differs, and every terminal outcome, is written in
  full. **The defect:** the regression-only path had no budget at all — "not the current gate's budget"
  had been implemented as *none* — so an unfixable backslide re-blocked forever at a model turn per
  fire. It now has its own, cleared by a clean pass. `relay-corpus.py` counts `gate-fail-repeat` so a
  stuck gate is not undercounted.
- **Correction to the design doc:** §8 first claimed Temporal's retry backoff transfers directly. It
  does not. Backoff rations *polls*, which arrive on a timer; the Gate fires only when the Runner has
  stopped, so sleeping buys latency and saves no turns. The transferable bound is a turn count.
- `bin/relay-gate` and `benchmark/relay_hook.sh` deliberately stay on the integer counter and do not
  collapse rounds: the benchmark hook is the measurement harness (historical ledgers must stay
  comparable) and the CLI is driven by external loops that own their state and cadence. Recorded as a
  decision in `docs/control-plane.md` §13, not an oversight.

### Added — 2026-06-01 (4 expansion roadmaps, built in parallel)
Four §12 expansion bets, built concurrently by a 20-agent fleet (5 per roadmap: implement + two
adversarial reviews + fix + verify), each owning a disjoint subtree, then tech-lead-verified end to end
(full suite 118 green, zero tracked-file drift, injection-closed, cross-roadmap integration proven).
- **R1 telemetry** — `bin/relay-dash.py`: burndown + fleet-health over the trace corpus (reuses
  `relay-corpus.py`'s verify-then-include; tampered traces excluded). `docs/telemetry.md`.
- **R2 guardrails** — `bin/relay-policy.py` + `policies/`: org DoD policy bundles prepended to every WP
  (no-debug-prints, no-loosened-tests, coverage-floor). `docs/guardrails.md`.
- **R3 spec library** — `bin/relay-spec.py` + `specs/`: versioned reusable sprints with `${param}`
  instantiation (shlex-safe). `docs/spec-library.md`.
- **R4 daemon** — `bin/relay-daemon.py`: HTTP gate service over `relay-gate` (one gate, no logic
  duplication; localhost-only, auth/TLS noted as next). `docs/daemon.md`.

### Docs — 2026-06-01 (reconcile PRODUCT/WHITEPAPER with shipped reality)
- The product docs were written before the roadmap shipped and marked ~6 capabilities as
  "UNBUILT / not yet implemented / aspirational / roadmap-not-running" that are now built and tested:
  the verified-trace ledger + retained corpus, the SubagentStop multi-runner hook, auto-decomposition,
  gate ≠ grader, in-hook compaction, and the high-N generator. Reconciled `PRODUCT.md` (§6 table, §7.2,
  §8.3/8.5/8.6/8.8, §9 table, §11 roadmap) and `WHITEPAPER.md` (bumped to v0.2) to the artifacts that
  close each gap — and, symmetrically, dialed back two over-claims of mine (the "15+ concurrent agents"
  line now points at the reproducible `examples/fleet-chain/` distillation, not an un-rerunnable live
  run; "model-agnostic SDK/daemon" is corrected to the CLI that actually ships). The crossover is
  restated from "UNKNOWN" to "measured, no crossover up to N=500 — amplifier thesis falsified." Every
  still-real limit (gate-expressiveness wall, tail-rot beyond agent-side compaction, corpus volume,
  M+CI not run as a separate arm, vendor dependency on hook paths) is kept stated as such.

### Security — 2026-06-01 (ledger mode-binding — close the keyed→plain downgrade)
- **[HIGH] Mode is now bound to the artifact.** Each ledger entry stamps its MAC algorithm
  (`mac: sha256 | hmac-sha256`) inside the hashed body, and `verify_ledger.py` refuses to validate a
  chain under a different mode than it was sealed with. This closes the downgrade an adversarial review
  found: re-sealing a keyed chain in plain sha256 (no key needed) to forge a verdict is now REFUSED by
  an auditor holding the key; a keyed chain checked without the key is REFUSED ("set RELAY_LEDGER_KEY")
  instead of silently accepted as plain. Legacy ledgers without `mac` read as plain (back-compatible).
- **[MED] `verify_ledger.py`** reports a line missing its `h` field as TAMPERED cleanly instead of
  raising an uncaught traceback. SPEC §7 updated; 4 regression tests (stamp, refuse-without-key,
  full-downgrade-forgery-caught, missing-h-no-crash).
- **[MED] No silent ledger-append loss**: `relay_chain_append` no longer swallows a failed write
  (`|| true`); a failed append is logged loudly and returns non-zero so a dropped verdict is visible.
- **Concurrency limitation disclosed (not faked)**: the append is unlocked (`flock` is absent on
  macOS); a rare simultaneous double-append forks the chain and fails CLOSED (spurious TAMPERED, never
  an accepted forgery). Documented in SPEC §7 rather than papered over with an unportable dependency.

### Added — 2026-06-01 (model-agnostic gate CLI + compaction)
- **Vendor-neutral gate CLI** (`bin/relay-gate eval`): evaluates one gate step with ZERO Claude-Code
  knowledge — pure JSON outcome + exit code, so any harness can drive Relay (Roadmap #7, the
  single-vendor-lock-in wedge). Docs: `docs/sdk.md`.
- **Compaction for tail-context rot** (`bin/relay-arm-hook.sh`): repeated re-blocks on the same gate
  inject a shortened reason (failing ids only, not the full instructions re-dump); a deep advance past
  `RELAY_COMPACT_AFTER` (default 6) appends a checkpoint hint and logs a `compaction-hint` ledger event.
  The full audit trail is unchanged — only the agent-facing reason compacts (Roadmap #6). Docs:
  `docs/compaction.md`.

### Fixed — 2026-06-01 (adversarial review pass)
- **[HIGH] Command injection** in `relay-autodecompose.py`: pytest nodeids were `repr`-quoted, so a
  parametrized id with a quote + `$(...)` executed under the hook's `eval`. Now `shlex.quote`'d.
- **[HIGH] `relay verify` over-claims**: an empty ledger (zero controls) and a tail-truncated trace
  (non-terminal end) both printed a green "auditable PASS". Now report NO CONTROLS / TRUNCATED and
  exit non-zero — the §7 truncation flag reaches the compliance verdict.
- **[MED] Escalation now terminal**: an escalated arm marked the chain done so it can't silently reopen
  and self-complete on a later fire (was double-counting in the corpus).
- **[MED] Regression-only failures** no longer burn the current gate's retry budget or escalate it —
  re-block cites the regressed earlier control instead.
- **[MED] `relay-corpus controls`** no longer KeyErrors on an integrity-valid checklist-item lacking
  `item`; token binding uses the FIRST transcript marker (not an echoed later one) and rejects `..`.

### Added — 2026-06-01 (fleet orchestration: arms, auto-decompose, trace corpus)
- **Per-agent checklist chains ("arms").** `bin/relay-arm-hook.sh` (SubagentStop) holds each spawned
  agent to its own ordered chain of checklists, bound by a `RELAY-ARM:<token>` marker recovered from
  the agent's transcript — async / multi-model / multi-worktree fan-out with per-token state. Authored
  via the `relay-arm` MCP tool (in the techlead repo). Docs: `docs/per-agent-arms.md`;
  `examples/fleet-chain/` is a deterministic LLM-free proof of the loop.
- **Auto-decomposition.** `bin/relay-autodecompose.py` drafts a `sprint.json` from a repo's existing
  pytest suite (one WP per test file, one named control per test) — driving authoring cost toward zero.
  Docs: `docs/auto-decompose.md`.
- **Verified-trace corpus (the data flywheel).** The arm hook now RETAINS each terminal trace (ledger
  + sprint + meta) under `$RELAY_CORPUS_DIR` on complete/escalate — runs are no longer ephemeral.
  `bin/relay-corpus.py` extracts the per-step reward signal (retries→green, per-control difficulty,
  complete/escalate rates) and excludes tampered traces. Docs: `docs/trace-corpus.md`.
- **Doc-index generator.** `bin/gen-doc-index.py` (idempotent, `--check` for CI) regenerates the hashed
  `docs/INDEX.md` that CONTRIBUTING required but had no generator for.

### Changed / Security — 2026-05-31 (ledger hardening)
- **Keyed ledger mode.** `relay_hook.sh` and `verify_ledger.py` now seal each line with
  `HMAC-SHA256(RELAY_LEDGER_KEY, body)` when the env var is set (**unforgeable without the secret**),
  falling back to plain `SHA-256` otherwise. Same key must be present to write and to verify; a
  missing/wrong key fails verification identically to a tampered line. See `docs/configuration.md`.
- **Truncation surface.** Each entry now carries an explicit 0-based `seq`; the verifier checks `seq`
  continuity and flags a trace that does not end in a terminal event (`sprint-complete` / `escalate`)
  as possible tail-truncation.
- **Honest claims.** Dropped the "proof you cannot forge" / "verify without trusting the producer"
  overclaims for **plain** mode across `SPEC.md` §7, `compliance_demo.sh`, and the verifier docstring:
  plain mode is tamper-*evident* (catches edits/reorders/middle-deletes) but a file-holder can re-seal
  the whole chain — only keyed mode is unforgeable.
- **Regression suite** (`tests/test_relay.py`, 19 tests): plain/keyed integrity, in-place edit /
  reorder / truncation detection, `seq` checks, and wrong-key rejection.

### Added — 2026-05-31 (semantic judge, wired honestly)
- **`benchmark/judge.py`** — real LLM judge for `judge` checklist items. Independent-auditor system
  prompt that **defaults to FAIL on insufficient/uncertain evidence**. Backends auto-select: `stub`
  (deterministic — PASS iff context contains `RELAY_JUDGE_OK`; demos/CI only) → `api` (Anthropic
  Messages API via urllib when `ANTHROPIC_API_KEY` set; model via `RELAY_JUDGE_MODEL`). Fails safe
  (network/auth error ⇒ FAIL). The hook runs it per `judge` item; verdict logged
  `judge:<backend>(non-independent)`, **advisory** unless the item sets `"blocking": true` (still
  logged as judge, never deterministic). `relay verify` reports but never counts judge items.
  `compliance_demo.sh` now exercises the wired judge (stub) — PRIV-1 flips FAIL→PASS with the fix.

### Added — 2026-05-31 (compliance CLI)
- **`bin/relay verify <run-dir>`** — the compliance-facing command: verifies the ledger hash chain
  (reusing `verify_ledger.py`) *and* reports each named control's final verdict + how it was graded,
  with `--json` for pipelines. Exit 0 = intact + all deterministic controls passed; 1 = TAMPERED
  (overrides green verdicts — a forged pass is worthless); 2 = a deterministic control failed. Advisory
  (`judge`) controls are reported, never counted. SPEC.md §7 + README updated.

### Added — 2026-05-31 (compliance surface: checklist gate + tamper-evident ledger)
- **Hash-chained ledger.** The verified-trace ledger is now an append-only hash chain (each line
  carries `prev`=previous `h`, `h`=sha256 of the line w/o `h`); `benchmark/verify_ledger.py` checks
  it offline (exit 0 intact / 1 tampered). Turns the trace from "a log we wrote" into a signed proof.
- **Checklist gate.** A WP may carry a `checklist` of **named controls** (LGPD / guardrail / business
  rule). Deterministic items (`cmd`) block advancement and log `graded_by: deterministic`; semantic
  items (`judge`) are **advisory, non-independent, never silently blocking** — honest by construction.
  Every item's verdict is a `checklist-item` entry on the chain (per-control proof, not per-WP).
- **`demo/compliance_demo.sh`** — runnable, deterministic, no API key: a vanilla agent ships 3 violated
  controls and calls it done; under Relay the gate names each failing control, holds the door until all
  pass, and leaves a chain that `verify_ledger.py` confirms — and flags as TAMPERED when one verdict is
  edited after the fact. Documented in SPEC.md §4.1 + §7.

### Changed — 2026-05-31 (honest reframe after measurement)
- **Retracted the amplifier thesis.** Benchmark measurement (held-out, contamination-immune)
  showed a strong model implements a complete, precise spec of up to N=300 distinct, coupled
  requirements first-pass on two substrates (templated + non-compressible) — the monolith does not
  break, so there is no crossover. Repositioned Relay as a **control-plane / compliance product**
  ("proof, not speed"): deterministic external oracle + keep-best ratchet + verified-trace ledger.
- Rewrote `README.md` positioning; corrected `docs/architecture.md` Finding 3; added `WHITEPAPER.md`
  (v0.1) + `PRODUCT.md` (fresh, internal north-star) with an explicit MEASURED/ARGUED/UNKNOWN ledger.

### Added — 2026-05-30/31
- **Integrity: gate ≠ grader.** Held-out grader suites (`holdout/`) for campaigns 01 + 02, disjoint
  inputs + metamorphic invariants; `grader.py` scores held-out; `run_arm.sh` strips `holdout/` from the
  run dir. A reward-hacker that aces the visible gate scores ≈0.08–0.38 held-out. Verified-trace ledger
  (`relay_hook.sh` JSONL + `benchmark/.relay-ledger/`).
- **Parametric campaign generators** (`benchmark/generator/`): `gen_campaign.py` (templated) and
  `gen_campaign_v2.py` (non-compressible bespoke-function graph), both contamination-immune with a /tmp
  reference oracle and auto-emitted reward-hacker. `benchmark/RESULTS.md` records the negative result.

### Added
- **North Star (v0)** documentation set:
  - `WHITEPAPER.md` — motivation, evidence base, and design.
  - `SPEC.md` — canonical source of truth (schema, DoD catalog, worked example, verified payload).
  - `docs/concepts.md`, `docs/getting-started.md`, `docs/authoring-sprints.md`, `docs/gates.md`,
    `docs/architecture.md`, `docs/configuration.md`, `docs/faq.md`.
  - `README.md`, `CONTRIBUTING.md`, this changelog.
  - `docs/INDEX.md` — hashed integrity index of the documentation set.

### Established (design)
- Single continuous Runner driven by a `SubagentStop` hook through ordered Work Packages.
- Gated advancement against per-WP Definition of Done; forward-only keep-best (anti-regression).
- `decision:block` continuation, per-`agent_id` counter, and bounded-retry escalation verified
  against Claude Code 2.1.x.

[Unreleased]: #unreleased
