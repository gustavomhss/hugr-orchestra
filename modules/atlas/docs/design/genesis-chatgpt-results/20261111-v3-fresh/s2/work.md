# Genesis S2 — execution work
execution_id: 46d09d97-39a9-482a-a290-646ba1d94c99 (locally generated UUID, not a host conversation ID)
session: S2; domain: desktop, web, app-shell, UI, session-ui, TUI, Storybook and assigned supporting material.
branch: genesis-fresh-s2
start_mode: fresh_chat; history_required: false
source_revision: 1cde2ff7a71bcf7aecb5d030917b577165135d38
protocol_revision: ee2521a5b966bd505cc95bd1c733e09e12f33531
prompt_revision: d2d985c28947c7f984a36b07ad34ede3d4d2d6b4
observed_branch_head: d2d985c28947c7f984a36b07ad34ede3d4d2d6b4
status: IN_PROGRESS

## Start contract
GitHub connector observed the assigned branch and no prior S2 execution directory (404).
The branch descends directly from the protocol; compare against baseline has six kit-only commits and no product-source edits.
Only this principal writes this remote branch, using expected_sha and force:false.
Isolated local area: genesis-s2 in this chat workspace; no other chat directory is used.
Complete S2 enumeration: 4506; path SHA256 8b70f96dcbb623bdd1cc2a48b61d51d255d9d9ce90836efc9a5cd05f1fc5a582;
tree-record SHA256 cb4f96b19e248e923485db63de87e56b45523428e1cb891a8746ec8189dffd88.
Both recomputed from untruncated Git subtree responses. Full-repository recursive read had transport failure; bounded subtree reads succeeded.

## Finite work queue
| Unit | Population | Required outputs | State |
|---|---:|---|---|
| desktop-web | 532 | s2.l1.desktop-web, s2.l2.desktop-web, s2.l3.desktop-web, s2.l4.desktop-web | PENDING |
| app-session | 1887 | s2.l1.app-session, s2.l2.app-session, s2.l3.app-session, s2.l4.app-session | PENDING |
| design-tui | 2087 | s2.l1.design-tui, s2.l2.design-tui, s2.l3.design-tui, s2.l4.design-tui | PENDING |
| Each complete layer | 4506 | Both persistent judges; corrections and same-pair reevaluation; accepted-layer manifest | PENDING |
| Native transport | all required artifacts | native-package.json, source/recipe/dependency/authority bindings | PENDING |
| Runtime and consumers | five fixed ownership cases plus direct intermediates | exact S4 runtime, ownership.index/read trace, update/impact/reuse proofs | PENDING |
| Verification and closure | full S2 | accounting, guards, obligations matrix, sealed handoff and Git readback | PENDING |

## Needs and depth
Cover user journeys and observable failures, interface state and persistence, session composition, API/SSE boundaries, IPC/desktop lifecycle, UI accessibility, themes, i18n, TUI navigation and configuration.
Every tracked path is assigned once in coverage.tsv. Assets, generated families, locale dictionaries, fixtures and tests are reconciled by family with provenance and justified depth. Enumeration is not a claim of semantic reading.
L1 supplies captured evidence and limits; L2 interprets local behavior; L3 connects flows and impact; L4 prescribes ownership and maintenance.
No dependent layer starts until the entire required local predecessor layer has two valid decisions and mandatory findings are resolved.
Exact sources at the baseline may be read across domains to establish boundaries.

## Contract and economy
Inherit GO-A1..7, QS-1..6, CC-1..7, SC-1..5, GO-I1..8, DOD-1..7 and pertinent AC-01..10; semantic cases and read bounds freeze before their evaluated production.
First batch: three L1 producer dispatches, two judge dispatches, up to one correction/reevaluation round per producer before plan review; additional necessary work is replanned, never silently retried or used as a mission stop.
No external paid calls. Host token counts, billing and internal physical attempts UNKNOWN. Record all visible dispatches, corrections, judge rounds and consumer reads. Historical accounting remains GLOBAL_UNRECONCILED for ROOT.
No gh/login/GH_TOKEN, force-push, PR/merge, activation or historical deletion.
Tests obey AGENTS.md: remote Actions only. No product code edits are currently proposed. Missing runtime or execution remains open; cannot be called PASS.

## Current next action
Freeze and hash L1 oracles, dispatch the three native producers into exclusive local areas, and verify their returned bodies and source captures.
