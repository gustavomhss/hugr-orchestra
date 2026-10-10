# Backend repairs — resumed execution and disk hygiene

## Landing update — 2026-10-09

This section supersedes every pending-publication, active-campaign and HOLD-blocker statement below. The historical sections remain dated evidence, not current instructions.

- Functional repair slices are merged into `dev`: #146 guidance, #147 fixed Unix broker, #148 parent planning/rollback, #149 native exact grants, #150 scratch/Unix tests, #151 physical OpenAPI pins, #153 literal argv/approval facts, #154 native shell admission, #155 listener context, #158 overlapping SDK routing, #160 owned Cassandra runtime, #161 actual acquisition/Go proof, and #162 final toolkit/runtime tests. Toolkit acquisition #112 and framework #93 had already landed.
- Final functional milestone #162 merge is `16400d9ad778e11c974c28b81ecd290abf3ae21c`. Exact pre-merge head `0908a6af8522b0a58f9e34023713b5e9284c252f` passed full epic CI: [test](https://github.com/gustavomhss/hugr-orchestra/actions/runs/37982685067), [typecheck](https://github.com/gustavomhss/hugr-orchestra/actions/runs/37982684978), [native](https://github.com/gustavomhss/hugr-orchestra/actions/runs/37982684993), [Nix](https://github.com/gustavomhss/hugr-orchestra/actions/runs/37982684955), [Storybook](https://github.com/gustavomhss/hugr-orchestra/actions/runs/37982685053). Linux/Windows units and Linux e2e passed; Atlas scope passed and its vendor job skipped. This is not an Atlas execution claim.
- Full CI first exposed three native recorded-loop request mismatches. Cassettes expected `city:{}` while first recorded responses and runtime carried `city:"Paris"`. Only three second-request fields were corrected; every response/header/metadata/other request byte, strict matcher and assertions stayed unchanged. Independent cold review and restored-broken-fixture RED/restored-correction GREEN closed the issue. Initial failed full run remains [37978401167](https://github.com/gustavomhss/hugr-orchestra/actions/runs/37978401167).
- Independent landing reviews also closed actual cwd symlink/`..` binding and wrong-shell toolkit-expansion bugs. Darwin listener tests now distinguish raw TCP denial from supported adapted Unix broker transport. Generator license/notice and missing-source assertions were added. No gate cap, oracle or stored model grade was relaxed.
- Provenance/current contracts #168 merged at `fab026f021cf8b0ec87f9dd96710e5265d41acd9`. Residual write-scope guidance #169 merged at `76c17eeb2620b1430d0f593119cb4ef730793773`; Core 5 tests and Orchestra 34 tests passed per OS on exact source. HOLD code/enforcement stayed unchanged. Stale pre-rename #90 is closed as superseded by #93/#146/#168/#169; its branch/history was not rewritten.
- Current Cassandra is `3.0.4+orchestra.cassandra2`, library/project pin `3.0.4`: hash-authorized private metadata backport plus command-only Go Dialer overlay and scoped fixed-target Unix broker. No experimental C/DYLD transport remains in product. [Current/historical provenance](cassandra-build.md) distinguishes binary/source pins and measurements. Real Cassandra generation and final Luna case21 PASS remain retained; the owned database was stopped.
- Backend-bench publication is merged into `main`: [#1 archive](https://github.com/gustavomhss/backend-bench/pull/1), merge `7e431924eae85e5b43ee8eaacb643c8bce5ec94a`; [#2 protocol](https://github.com/gustavomhss/backend-bench/pull/2), merge `3ef688ba61e5a1667c2c4009821b548617f138be`. Original runner branch adopted those data/docs at `0422c41`; its final evaluated harness source remains preserved at `734cc61e49bf7f72573317a720c9c892f3b416c7`, not retrospectively attributed to every attempt. Harness implementation history remains on that published branch; publication PRs changed only evidence/protocol.
- [Published byte manifest/archive](https://github.com/gustavomhss/backend-bench/blob/main/evidence/2026-10-09-luna-native-repairs.md): 150 original files, 13 campaigns, 63 primary attempts; stored 29 PASS/28 FAIL/6 operational null. These are inventory counts, not a new performance rate. Archive SHA-256 `94c64efb29e7e6a606f96d624e044f555bff167730b5d53678773b15782d8d19`; independent review matched every extracted/original byte/hash and calibrated an in-memory bad manifest hash. Original grades, reports, raw streams and missing operational source refs were preserved.
- Recorded model IDs are `openai/gpt-6-luna` in 62 attempts plus one earlier `openrouter/openai/gpt-6-luna` setup record. Later direct-OpenAI OAuth transport stays distinct from catalog metadata and that historical setup. All affected cases have valid measured PASS evidence; the original retired direct-language case07 keeps its grade. There was no new full 21/21 campaign and no new model rerun during landing.
- Limits remain explicit: exact endpoint capability has Darwin runtime evidence and Linux/Windows named HOLD; Windows POSIX-only fixture branches are not runtime proof. Scylla runtime/present-extension error injection, ARM runtime, and Go in-flight cancellation/write-deadline expiry are not claimed. External diagnostic paths are not all bundled in the public archive.
- Owner apps/server/Docker were not stopped or restarted. No real OAuth token was printed/persisted/refreshed for this work. Only owned temporary services were stopped; database files/logs and original attempts remain retained. Concurrent cleanup removed publication dependencies once; only that worktree's dependencies were restored and package typechecks rerun.

Next work starts from current `fork/dev`, not the historical repair branch tips below. Backend repair/publication closure is complete after this handoff lands; new runtime/contract changes require their own scoped verification. Do not repeat successful Luna cases without a specific invalidating change.

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
