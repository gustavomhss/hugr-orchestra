# S4 L1B coverage summary

Execution `a2095d5a-1464-4c38-a222-6376974fc9c9`; source `1cde2ff7a71bcf7aecb5d030917b577165135d38`; protocol `ee2521a5b966bd505cc95bd1c733e09e12f33531`.

**All 2,220 assigned paths are preserved, uniquely classified and bound to exact source hashes.** This is population integrity, not complete semantic understanding or executed product validation.

- Sorted-path-set SHA-256: `0b99735199c8a9a4db61bf506dafe92acb76909dd9f9c48d8f521fb920c6cd1d` (UTF-8 paths sorted, each with LF).
- Inventory SHA-256: `3a24c33385bb1f302bf7136707461935378ce541f3fe15a0ff3a64c4be9c6877`.
- Source-capture receipt SHA-256: `a41b96c8633c7f4381eb8c1c21e4db42651bdca4925e0222a0e0a2340cc5d00b`.
- Coverage JSON SHA-256: `9d0473edc9de818e36111cd741928d5ab5be05ac063439aeac11719ac0fc9759`.
- No symlinks; all 2,220 raw bodies match their captured SHA-256, byte length and Git blob.

## Bounded bodies

| Key | UTF-8 bytes | SHA-256 |
|---|---:|---|
| `S4:L1:atlas-engine` | 17,987 | `c0d39faabe422adcfb5a6b4e67b0d105931d90661b695fbcaa7571187b4f103e` |
| `S4:L1:atlas-host-genesis` | 17,595 | `97b3adc25e1a8754ebdbab0b27040403893e90d410df08a5c8f90520e3a0156d` |
| `S4:L1:continuity-rag` | 17,429 | `2a286b2570b9967c1e78ee14b671f333957a6a54c97427dc24feaec7ccab5b38` |
| `S4:L1:coverage-governance` | 17,988 | `201b5cc97ba7ae5b1148b98377a174ba3d00c8f4d9d521b4fadc6c1d69a03381` |

Primary population: engine 318; host/Genesis 658; Continuity/RAG 63; governance 1,181. Each row also maps to coverage-governance. All build dependencies are empty; L1A is navigation only.

## Classification

| Classification | Paths |
|---|---:|
| build-or-policy-config | 46 |
| ci-workflow | 6 |
| contributor-skill | 18 |
| dependency-lock | 1 |
| design-contract | 1 |
| design-data | 2 |
| design-document | 433 |
| executable-component | 383 |
| generated-ownership-artifact | 3 |
| generated-runtime-bundle | 18 |
| generated-ui-data | 2 |
| generator-script | 2 |
| historical-consultation | 2 |
| historical-evaluation-data | 8 |
| historical-evidence | 368 |
| historical-probe-data | 20 |
| historical-prompt | 13 |
| license | 2 |
| operational-script | 55 |
| package-documentation | 21 |
| prompt-template | 20 |
| repository-event-data | 3 |
| repository-placeholder | 1 |
| test-fixture | 25 |
| test-harness | 7 |
| test-probe | 33 |
| test-source | 687 |
| ui-prototype | 14 |
| validation-support | 12 |
| validation-tool | 14 |

## Inspection depth

| Disposition | Paths |
|---|---:|
| generator-and-integrity | 21 |
| group-context-and-integrity | 355 |
| origin-and-integrity | 487 |
| preserved-by-origin | 411 |
| source-excerpts-inspected | 158 |
| structure-and-integrity | 3 |
| support-role-and-integrity | 43 |
| test-role-and-integrity | 742 |

Excerpt inspection does not establish every branch/caller. Historical preservation does not import old authority. Fixtures/test files identify validation surfaces without a test result. Generated artifacts retain source/generator routes without a parity claim.

## Observer-limited files retained

- `.atlas/members/orch/memory/logbook.jsonl`.
- `.atlas/project/board.jsonl`.
- `.atlas/project/orientation.jsonl`.
- `modules/atlas/boundary/src/generated/mine.js`.
- `modules/atlas/boundary/src/generated/surface.js`.
- `modules/atlas/harness/probes/__fixtures__/bench-driver-corpus/pkg-a/.atlas/index.scip`.
- `modules/atlas/harness/probes/__fixtures__/bench-driver-corpus/pkg-b/.atlas/index.scip`.
- `specs/atlas-ui/mock/data-real.js`.

Five paths contain `.atlas`; three exceed 256,000 bytes. No observer was invoked. These are source-code-derived limits, not absence claims.

## Material findings and limits

- Pure engine models and actual host doors must be distinguished; actor/ratifier names are not authenticated identities.
- Provenance, source freshness, truth, review and publication remain separate checks; a CAS object is not necessarily published ownership.
- Continuity has a local persistent archive; its Atlas context adapter hashes/checks data but leaves the blob flag to its host caller.
- RAG reads current corpus rows without enforcing saved revision membership and uses divergent ask/proof trace keys; docs/test setup do not close those links.
- Legacy checkpoint/calibration/publish scripts and old receipts are specific evidence, not fresh native Genesis execution or acceptance.
- Remaining depth gaps include uninspected branches/recovery variants, generated parity, current remote CI enforcement and external Session/Store/UI integration. No local product tests ran.
