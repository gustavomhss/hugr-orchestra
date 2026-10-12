# Native Archie authoring — measured qualification

## Scope and source identity

The owner corrected the active native member ID to `archie`, retaining the `upstream` profile. Current seat, assets, native discovery, Task attribution, Session settlement and Core receipt recognition use that identity without a `walt` alias. Historical receipts and immutable PlanRevision V1/V2 records retain their original identity.

The successful ordinary authoring run used committed candidate `f8df7e017369c12b9d6bb2b733625aa75b95c313`, tree `f5ecbe2d3aada067594cf768eacaf98719a907c3`. This is the run's source identity, not a claim about subsequent source revisions or the complete Runtime milestone.

The explicit read-only legacy Codex consumer is source-qualified at `6d325f9356a100ea684fc9c302015557d33b1bfa`:

| Source | Git blob |
|---|---|
| `packages/orchestra/src/plugin/openai/legacy-codex-readonly.ts` | `5e357d979ab74a6415821bd7747bf47d35ebceba` |
| `packages/orchestra/src/plugin/index.ts` | `6588027dd666cd6d1a3dd437bec548e53622afda` |

The four existing Auth/Codex/Siwc source guards remain unchanged from the qualified baseline. This separately selected consumer uses inherited metadata-absent legacy OAuth credentials, fixed response transport and expiry checks; it adds no login, refresh, credential write, registration fallback or consent claim.

## Actual ordinary native execution

The real candidate runtime registered native Maestro and native Archie. Maestro made one foreground native Task call to `archie`. The child used `openai/gpt-6.1-sol`, read supplied source, wrote the single permitted proposal and returned its actual upstream-result card. Multiple provider turns occurred; one Task is not one provider request.

| Host identity | Observed value |
|---|---|
| Parent Session | `ses_edbe60321ffey5J7whNh9ut9AN` |
| Parent dispatch assistant | `msg_1241a002c0011P0SLQmd8JOnc2` |
| Task call | `call_80c8adc3eb53477c9146c48174489900` |
| Child Session | `ses_edbe56b33ffeUYrXndzsK51hmL` |
| Logical Task | `tsk_1241a94d1001FZX8o7Y7lEm3rK` |
| Captured returned assistant | `msg_1241d951c001j6pcmv9bWWOgOF` |

The existing Task result selected the returned assistant before subsequent parent continuation. Read-only DB verification and independent host-receipt review followed that captured ID, not a later assistant lookup. Stored card/author IDs, actual Session lineage, host logical binding, native member and model agree.

The fixture's project is nested under its Git worktree. Native Task therefore received worktree-relative `closure-output/pilot/project/proposal.md`; actual reserved absolute write root resolves only the project-relative `proposal.md`. Parent/child permissions deny other edits and shell execution. Stored completed patch targets only the proposal.

The owned initializer/process group exited with status 0 after disposal. Actual live-admission positive control, exit and close events, and primary/group ESRCH observations are recorded. Elapsed wall time was 262648 ms.

## Original input and output bytes

| Artifact | Bytes | SHA-256 |
|---|---:|---|
| Canonical input artifacts-array inventory | See producer packet | `80bdd0f9e2cb3195fbdc64ad7d1e8fb1d2e06bb55ceabcb213e28e4bed4ae465` |
| Rendered Task assignment | See host receipt | `10d2ee16d36c48c173572f3904fb7543b8bd514b83fc6e32640fd870f78aa20a` |
| Original `proposal.md` | 32944 | `3b2dcfd36480a9913e6b0fd55c498bc1d80c3500d7d38014d84287387126511e` |
| Original returned assistant/card | 1821 | `5905926e6ba844e577267d8a7a3d45cfe8a06193b5857818ed271cfad3ec00ab` |
| Host `report.json` | See original file | `6f8eda71dc091b3017e7e50d71132e914fc1f3b3bb34122a4a2c5b86763486ba` |

Original receipts are in the owner fixture's `closure-output/pilot/ordinary-authoring-rKW4L8/`: `report.json`, `prepared.json`, `launcher.json`, `stages.jsonl`, `events.jsonl`, `returned-assistant.txt` and the private run DB. The proposal is `closure-output/pilot/project/proposal.md`. These paths identify local originals, not uploaded CI artifacts.

All 33 frozen inventory files were rehashed before/after the run and independently audited. Request rendering removes the final source-file LF; original input hashes remain exact, and rendered assignment has its own receipt. The demand remains `57970f797c7c7724b95c0bbed1fd1ec54dc089bdf26165581e9ab7e296af7c5a`.

## Focused implementation evidence

| Check | Actual Actions run | Result and reach |
|---|---|---|
| Legacy consumer hooks/transport | [38016351540](https://github.com/gustavomhss/hugr-orchestra/actions/runs/38016351540) | Linux/Windows: 32 tests, 0 failures, 315 assertions each; exact consumer/test blobs retained in the authoring candidate |
| Renamed Orchestra consumers | [38018528560](https://github.com/gustavomhss/hugr-orchestra/actions/runs/38018528560) | Linux/Windows: 186 tests, 0 failures, 1806 assertions each across 14 affected files |
| Renamed Core guards/receipts | [38019106393](https://github.com/gustavomhss/hugr-orchestra/actions/runs/38019106393) | Linux/Windows: 66 tests, 0 failures, 764 assertions each across four affected files |
| Repaired ordinary-authoring prompt/playbook pins | [38024190713](https://github.com/gustavomhss/hugr-orchestra/actions/runs/38024190713) | Linux/Windows: 23 tests, 0 failures, 151 assertions each |
| Legacy consumer mutation | [38019869958](https://github.com/gustavomhss/hugr-orchestra/actions/runs/38019869958) | Removing pro-option filtering and output-cap omission made all three selected tests fail; implementation restored |
| Native authorship mutation | [38025092625](https://github.com/gustavomhss/hugr-orchestra/actions/runs/38025092625) | Removing actual assistant-agent equality made old/generic-author rejection fail while two controls passed; implementation restored |
| Attribution schema counterexample | [38019106475](https://github.com/gustavomhss/hugr-orchestra/actions/runs/38019106475) | Linux/Windows: 32 pass, seven failures; explicit `undefined` got schema type error instead of required `UPSTREAM_ATTRIBUTION_MISSING` |
| Attribution schema repair | [38028673763](https://github.com/gustavomhss/hugr-orchestra/actions/runs/38028673763) | Linux/Windows: 40 tests, 0 failures, 227 assertions each; reviewed schema/test blobs copied unchanged into `175187aef14bc75580245a6ce4560644f95beb37` |

Package `bun typecheck` completed for Orchestra, Core and Schema on composed renamed source and after the attribution repair. Supported generators ran through `packages/client`'s `bun run generate` and `./packages/sdk/js/script/build.ts`; both completed without a tracked output diff. Atlas Boundary `bun typecheck` and `bun run check:generated` completed. These scoped checks do not become full-milestone or every-descendant CI evidence.

The Godfile gate first failed on the observer test at 758 nonblank LOC. The reviewed repair removed eight comments and one blank line without changing executable fixtures or assertions. `GODFILE_BASE_REF=fork/dev bun run check:godfile` then inspected 4029 source files with 325 warnings and zero errors; the observer fixture is exactly 750 nonblank LOC. No waiver or gate change was added.

The original Maestro prompt demanded model-side inspection unavailable in the actual tool surface. Actual inference returned HOLD. The repaired prompt delegates workflow/completion observation to the existing native Task gate; no runtime gate, known HOLD, governed lifecycle or approval requirement was removed. An earlier Task attempt failed on a final-LF request mismatch; exact rendered assignment corrected that failure. Earlier failed attempts remain failed receipts.

## Remaining acceptance and landing

- Independent host review accepted the successful foreground receipt. Independent Archie domain judgment of the proposal remains separate and pending.
- Seven Schema named-refusal failures and the observer fixture's Godfile over-cap finding are corrected at `175187aef14bc75580245a6ce4560644f95beb37`. Schema repair changes only explicit-undefined decoding/encoding and preserves strict attribution refusals; observer executable fixtures remain unchanged.
- Later Maestro text accurately describes V3 host-observed upstream attribution while retaining V1/V2 sources. The successful run remains attributed to its original source head.
- This proves ordinary native authoring through V1 message/part storage. It does not prove dual-view/V2 delivery, governed W6, same-Session resume, exact retry, background delivery, Nix distribution, Desktop/WSL or operational Orchestra OAuth consent.
- The Runtime branch's diff from `fork/dev` contains broader unlanded work. PR scope, required evidence and independent landing review must be reconciled before merging; this receipt does not qualify that broader work automatically.
