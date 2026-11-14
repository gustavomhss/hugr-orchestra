# Omni L1 review — slice 4/5, position 28

## Pins and provenance

- Snapshot: `343d056ffef7f4a0052da8e2e55559c95169f462`
- Source baseline: `1cde2ff7a71bcf7aecb5d030917b577165135d38`
- Protocol: `ee2521a5b966bd505cc95bd1c733e09e12f33531`
- Manifest: `modules/atlas/docs/design/genesis-chatgpt-results/20261113-external-omni-393/manifest.json`, blob `f875188b9daa58a3acda33c07d9f96e5e44f7ba3`
- Body: `bodies/surface/records-10.json`, blob `3473f6001beb1eadf305cd940e9c320f3459c69d`

## Exclusive body contents

1. `native/omni/docs/research/landscape.md` — source blob `cfcf1b71e16a377198104d4995e4a058b5b63cec`; source SHA-256 `3bad4ab1409bb0d158cde674ea17c366c5ff1aa074612b589e83b133256b1b13`.
2. `native/omni/PLAN.md` — source blob `f8a105e63117dfb8a5ad1c911210b3993c34e1ca`; source SHA-256 `cd01cdec5108fa10da0b1a5e3e816da5670d0a525c8c2fd4efc250978b0e07c5`.

Both source Git blob IDs fetched at the pinned baseline match the manifest.

## Findings

**No mandatory documentary contradiction identified in this single-reviewer inspection.**

- `landscape.md` explicitly says its 2026-10-01 candidate facts were read, not installed or executed. The L1 body correctly describes its 22-behavior scoring scheme, 32 candidates and documentation-derived 81.8% combination headline as an upper bound rather than current runtime evidence.
- The strict/relaxed coverage distinction, half-credit for partial cells, and zero strict credit for fewer-than-three-OS support are represented accurately. The report also states that combinations select best cells without charging integration friction.
- The lead spot-check at lines 627–633 records 12 supported and eight partial cells from 20 samples, and identifies three overstated Y cells. The L1 record captures this qualification and correctly points to the later measured fit (1/24 items as-is) as the basis used by G0.
- `PLAN.md` is treated as historical planning/decision history, not proof that the baseline still runs the listed gates. Its ownership table separates public API, host client, supervisor, PTY and fixture seams; its history records the G0 pivot to an owned core and the later ADR-0005 supervisor decision.
- The L1 record correctly flags old 650-line and multi-language/five-target statements as historical. The current repository guard and more recent scope must be consulted before treating those historical entries as active policy. The cited PLAN history itself documents the 400/600/650 progression and subsequent CI changes.
- The body distinguishes the historical ADR-0005 acceptance/status narrative from present product validation and says mutable status rows and CI outcomes were not revalidated.

## Protocol and decision boundary

The protocol's judging requirements call for two persistent independent judges on the same fixed body/evidence. This execution has no retrievable J1/J2 handles or actual decisions through the authorized Chat + GitHub MCP surface. This is a consultive single-reviewer assessment, not a protocol PASS, dual acceptance, or layer release. No manifest status or authored body was changed.

## Scope exclusions

No product/runtime/CI execution occurred. No other body outside position 28 was reviewed in this file. No other branch or faixa was modified.
