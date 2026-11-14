# Omni L1 review — slice 4/5, position 27

## Pins and provenance

- Snapshot: `343d056ffef7f4a0052da8e2e55559c95169f462`
- Source baseline: `1cde2ff7a71bcf7aecb5d030917b577165135d38`
- Protocol: `ee2521a5b966bd505cc95bd1c733e09e12f33531`
- Manifest: `modules/atlas/docs/design/genesis-chatgpt-results/20261113-external-omni-393/manifest.json`, blob `f875188b9daa58a3acda33c07d9f96e5e44f7ba3`
- Body: `bodies/surface/records-09.json`, blob `71b262fc679abdfb76fa3d5a2ab35bd1a670992b`

## Exclusive body contents

1. `native/omni/docs/research/processkit-eval.md` — source blob `bb931c13589a4e3dc04b4e985a92fbaca19f67c1`; source SHA-256 `e6a211d67bb0db4d2773f2b131e916268d914773e4cb412c0bf8d2948c1c5798`.
2. `native/omni/docs/research/processkit-fit.md` — source blob `0da0d9dcd11e9eb6e6b099cebb542e47adda2389`; source SHA-256 `231cdb3b768ffa19baa46da5923887f913afc51b13f15f6469e8efdaf4d551ec`.
3. `native/omni/docs/research/pain.md` — source blob `8d88b0880eb8f96ff5bd02b10aec7093a1469939`; source SHA-256 `ed858e0f3d9fb5ac315ea37eb5165723b2aff42a4cd853f5594a3567ca8585a1`.

All three Git blob IDs returned by fetching the source files at the pinned baseline match the manifest. The body source map and hashes match the manifest entries.

## Findings

**No mandatory documentary contradiction identified in this single-reviewer inspection.** The body preserves material distinctions that are easy to collapse incorrectly:

- `processkit-eval.md` says hosted CI did not start, macOS ran natively, Linux process-group runs stopped during W3, cgroup evidence was smoke-only, Windows was not measured, and the upstream suite was not run. Its reported K1/K2/K3/K4/K5 cells and the fixed five-second drain/slow-reader failure are explicitly scoped to the observed harness and platform cells.
- The independent OS/tag survivor-counting method, calibration control and numbered output comparison are described without implying that processkit itself supplied the oracle.
- The conclusion's approximately 3,800 teardown count corresponds to the documented approximately 2,500 macOS and 1,300 Linux observations; it is qualified as the set where measured. The body does not turn this into cross-platform proof.
- `processkit-fit.md` separately records the 244/244 upstream suite and its scratchpad probes on darwin-x64, v3.3.4. The L1 body explicitly says this separate fit-study claim does not contradict the evaluation report's own Part 1 being unrun.
- The fit record correctly distinguishes measured, documented, source-inspected and unknown claims, and does not promote the processkit proposal to the adopted Omni architecture.
- `pain.md`'s 1,592 count is the sum of the three ecosystem totals (659 + 104 + 829) and the seven primary categories (253 + 97 + 200 + 323 + 192 + 156 + 371). The 873/1,592 Windows mention ratio is approximately 54.8%. The record preserves the capped-query, unread-tail, single-reader and snapshot limitations, and does not call these counts prevalence or defect rates.

## Protocol and decision boundary

The judging contract at protocol commit requires two persistent independent judges to evaluate the same fixed body and evidence; a single reviewer cannot create a layer PASS or acceptance. No judge IDs/decisions for this execution were available through the authorized Chat + GitHub MCP surface. This is therefore a consultive technical assessment only. No manifest status, author body or acceptance record was changed.

## Scope exclusions

No source code/product/runtime/CI test was executed. No other position in the 25–31 allocation was assessed in this file. No work outside this branch was changed.
