# Backend repairs — resumed execution and disk hygiene

## Current update — 2026-10-09

This section supersedes the historical execution/limitation state below.

- Integration branch `backend-failures` is pushed at `6417e702b1`. Experimental C/DYLD interposer and proof sources were removed in `847b70c9bd`; final transport is the owned Go dialer plus scoped fixed-destination Unix broker. Source trees and experimental branches/artifacts remain recoverable.
- Owned generator revision is `3.0.4+orchestra.cassandra2`; project/library pin remains `3.0.4`. A private hash-authorized Scylla-driver metadata backport handles absent optional extension tables, and a command-only Go overlay uses ordinary Unix `net.Conn` operations. No project module edits, protocol-response fabrication, general TCP allowance or native loader injection.
- Real Cassandra 5.0.5 schema generation passed through the actual sandbox with concrete Carts keys/types and unchanged schema/marker. LAN, undeclared ports, IPv6, malformed map and missing grant controls failed without unauthorized receipts. Final Go and broker cold reviews approved their scoped implementation.
- Bench `seat-runner` is pushed at `734cc61e49bf7f72573317a720c9c892f3b416c7`: native case21 preflight requires actual no-grant EPERM/zero receipts and granted EOF/positive receipts plus process/socket/scratch cleanup before candidate start. Independent cold review approved it. `protocol/PRE-REGISTRATION.md` still contains unstaged lead-owned amendments.
- Final integrated Core gate: https://github.com/gustavomhss/hugr-orchestra/actions/runs/37888100562 — Linux14 pass/1skip; Windows6 pass/8explicit skips. Core package typecheck passed. Skill guards/cap: https://github.com/gustavomhss/hugr-orchestra/actions/runs/37885547775 —17pass per OS. These do not replace Darwin runtime evidence.
- **All affected cases now have valid Luna PASS evidence:** 02 in original partial repair campaign;10–13,16,18 in `2026-10-08-gpt6-luna-serial-repairs`;14,17,19 in `2026-10-08-gpt6-luna-guidance-repairs`;21 in **`2026-10-09-gpt6-luna-cassandra-typed`**. Original results/oracles retained. Case21 previously diagnosed the missing cluster correctly but omitted/misnamed its required typed blocker code; recipe clarified exact result shape. Final model run passed unchanged oracle with native preflight and cleanup.
- Latest case21 log: approved temp `backend-cassandra-typed.log`; primary JSON/event stream under independent bench `results/2026-10-09-gpt6-luna-cassandra-typed/gpt-6-luna/`. Failed/interrupted/code-omission attempts remain in distinct earlier campaigns, never overwritten/regraded.
- PR **#112 merged**, merge SHA **`e3c0f9b5e36d329aa7a7f59f7c877070379a8b36`**: https://github.com/gustavomhss/hugr-orchestra/pull/112 . Exact-head full CI passed; Atlas was scoped skip. Other integration-branch slices are still awaiting publication/integration; do not claim whole backend milestone landed.
- Owned Cassandra fixture was stopped by its identity-checked stop script; files/logs retained. Final broker scopes closed before grading. Do not signal historical PID82966 without fresh identity proof.
- Disk filled again during resume. Removed completed implementation-worktree dependency duplicates and regenerable active-cache Cargo download intermediates; preserved active engine/runtime binaries and all model evidence. Last observed free space was1.4GiB: check before large builds. Do not touch owner apps, other peers' worktrees, or credential stores.
- Next: publish remaining review-sized source/test/docs slices, exact-head checks and milestone merge; reconcile stale #90; commit bench protocol/evidence separately after reviewing final amendments. Update historical snapshot pointer after those land. No further Luna rerun is justified absent new runtime/contract changes.

Current execution snapshot after `session-state-2026-10-08.md`. The owner explicitly resumed work and then requested safe disk hygiene followed by continued execution.

## Current refs

- Integration worktree `backend-failures`, branch pushed to `fork/backend-failures`, runtime HEAD `13c8c8b1ea0757348f9c796e5feadda5eb868376`.
- Verified toolkit, generator, listener and sandbox follow-ups integrated. Catch-up with `fork/dev` includes framework #93 and captured-capability discovery #94.
- Independent `backend-bench`, `seat-runner`, pushed HEAD `a3beb188d7e1f5fe3c3fb4e3981be3d2906b6d47`. `protocol/PRE-REGISTRATION.md` remains lead-owned, unstaged WIP.
- Backend repairs have not been merged. No backend repair PR opened yet. Old #90 still needs reconciliation.

## Repairs closed since resume

1. Sandbox preparation is opt-in at approved native V1/V2 execution. Relay prehooks do not mkdir. Multi-root failure/interruption rolls back only own empty directories with unchanged identity.
2. Native no-op shell scans (`cd .`, empty/comment-only input) return false for preparation; they cannot implicitly create parents without Bash permission.
3. Unix grant shape validation is typed HOLD; foreign placement does not inspect irrelevant socket leaves.
4. Real Go FILE-proxy download/build exposed read-only module-directory cleanup `EACCES`. Confined scratch supplies writable `-modcacherw`; explicit effective false flags HOLD before writes. Parser follows Go `quoted.Split`, evaluates last matching flag, and does not HOLD disabled/unconfined fallback. Owner flags/cache bytes remain unchanged; nested scope cleanup measured successful.
5. Claude-Code permission adapter discards new scanner boolean with `Effect.asVoid`; package typechecks passed on integrated head.
6. Bench bootstrap is separate/bounded, default90s/max300s, with durable stages. Operational failures have `grade:null`, exclusive result admission/publication and retained streams.
7. Supervisor cancellation remains operational through all phases; partial/failed helper exports retain raw bytes, recovered events and incomplete status. Every helper validates cleanup.
8. Post-SIGKILL settlement polls actual owned PID/start identities and root exit notification against2s deadline, then classifies a fresh snapshot. No fabricated successful exit, ignored live child or discarded diagnostic.

Independent cold reviewers initially found real issues in items2,4,5,7. Fixes were re-reviewed; sandbox scope and final bench settlement received APPROVE. Author reports alone were not accepted.

## Verification pointers

- Integrated Core initial gate: https://github.com/gustavomhss/hugr-orchestra/actions/runs/37729461001 — Linux52 pass/2skip, Windows44pass/10skip.
- Integrated Orchestra final gate: https://github.com/gustavomhss/hugr-orchestra/actions/runs/37782211034 — each43pass/1skip. Prior Windows stale loopback-reason expectation failed and was corrected to the actual HOLD contract.
- Latest Go guard scope/order controls: https://github.com/gustavomhss/hugr-orchestra/actions/runs/37787593478 — each16pass/3explicit confinement skips; mutation37787102014 failed3controls/OS.
- Bench lifecycle: https://github.com/gustavomhss/hugr-orchestra/actions/runs/37781216030 — Linux27pass/1skip, Windows17pass/11skip; mutation37780737558 failed6controls.
- Bench settlement: https://github.com/gustavomhss/hugr-orchestra/actions/runs/37795184476 — Linux31pass/1skip, Windows18pass/14skip; mutation37794540984 failed delayed-root/live-child/unobserved-root controls. Independent reviewer verified CI source blobs against actual commit.
- Local `bun typecheck` passed integrated Core and Orchestra. Earlier parallel120s attempts timed out under load; serial600s calls passed. No local unit suite executed.
- Real macOS probes under approved temp: `ms-arSohp`, `ms-v9V6jB`, `ms-9dA9wG`, `ms-XO2FxP` preserve boundary controls, failed cleanup and restored cleanup evidence. Unit skips are not kernel-conformance proof.

## TCP limitation remains an actual blocker

Matched exact `127.0.0.1:<port>` capability remains `sandbox-loopback-endpoint-exact-policy-unsupported`. macOS15.3.2 Seatbelt `localhost` selector admitted working host LAN IPv4 at the same port. TCP-specific grammar removed UDP access but did not close the LAN path; numeric hosts were rejected with exit65, `sandbox-exec: host must be * or localhost in network address`.

Dedicated listener controls and rejected grammar are in approved temp `seatbelt-exact-20261008/{OUTCOME.md,evidence.json,probe.py,verify.py}`. This is a measured unsupported deployment result, not universal impossibility. Do not restore broad localhost permission or claim case21's missing-cluster outcome passed. Bench refuses that grant before model execution. A supported enforcement design or explicit owner scope decision remains necessary.

## Campaigns and active continuation

- Preserve original `2026-10-07-gpt6-luna-native-isolation` campaign and partial `2026-10-08-gpt6-luna-repairs` (01/02PASS).
- `2026-10-08-gpt6-luna-verified-repairs`: actual Luna control reached backend and passed requested tests, but old50ms host settlement classified operational failure. Original ungraded record preserved.
- `2026-10-08-gpt6-luna-reap-verified`: **01PASS** with new settlement. 10/11 then hit **ENOSPC**, not model-quality failure; 11 publication itself could not create its event file. Do not overwrite or silently re-grade those attempts.
- Active continuation: **`2026-10-08-gpt6-luna-post-hygiene`**, source13c8c8b1ea/bencha3beb188. Explicitly reuses exact-source PASS01 control, preserves prior PASS02, schedules10 and11–14/16–19 with at most2shards. Candidate budget900s; bootstrap180s. Case21 separately unsupported.
- Driver: approved temp `backend-verified-campaign.ts`; active log `backend-post-hygiene-campaign.log`; launch PID70676 at snapshot (verify identity/liveness before any signal, do not trust stale PID).
- Owner OAuth access checked ready at2026-10-08T13:56:24Z; no refresh attempted. Only supervisor reads auth; candidate receives inert credentials and native neverTouch denial. Metadata origin catalog is not provider routing: requests go directly to OpenAI Codex responses endpoint, model `openai/gpt-6-luna`.

## Disk hygiene completed

Observed filesystem availability: **1.1GiB before →12GiB after**. Concurrent system activity exists; this is measured availability, not an exact exclusive attribution of freed bytes.

Removed only identified disposable material:
- Cargo build intermediates under active `toolkit-repairs-cache/cache/cargo-target` and old bench cache.
- Root `node_modules` in completed implementation worktrees `toolkit-repairs`, `generator-pins`, `listener-binding`, `sandbox-repairs`, `seat-framework`. Source, branches and commits remain. Reinstall only if a later task actually needs that worktree.
- Superseded bench `.cache/gpt6-luna-toolkit`, after confined owned-module cleanup via its own Go binary.
- Closed framework's untracked `packages/orchestra/dist` build products.

Preserved active `backend-failures/node_modules`, current `toolkit-repairs-cache` engine/runtime binaries, all results/raw evidence/protocol WIP and review worktrees. Post-cleanup actual `datafusion-cli --version` returned55.1.0. Git status confirmed integration clean and bench protocol WIP intact.

## Next actions

1. Monitor post-hygiene campaign, inspect real results and independently calibrate any generated-marker discrepancy before changing an oracle. Do not rerun PASS01/02.
2. Update this snapshot with exact latest outcomes. Preserve infrastructure failures and partial evidence.
3. Resolve case21's supported enforcement/scope decision; never count it as successful model evaluation while unmeasured.
4. Publish review-sized repair deliveries, exact-head CI and final milestone integration. Ownership includes commits, PRs and merges under standing owner authorization; no merge with unresolved claims or unreviewed diff.
