# Changelog

All notable changes to HuGR Relay are documented here. Format loosely follows
[Keep a Changelog](https://keepachangelog.com/); the project is pre-release.

## [Unreleased]

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

[Unreleased]: https://example.invalid/hugr/relay
