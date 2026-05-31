# Changelog

All notable changes to HuGR Relay are documented here. Format loosely follows
[Keep a Changelog](https://keepachangelog.com/); the project is pre-release.

## [Unreleased]

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
