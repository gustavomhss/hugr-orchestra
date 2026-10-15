# Runtime integration execution plan

Status: planned F3 execution, 2026-10-03. Local results and receipts are in [closeout.md](closeout.md); the runtime contract packet is [handoff.md](handoff.md). This plan does not claim production integration or CI execution.

## Ordered slices and stop conditions

| Slice | Execution and ownership | Evidence required before advancing |
| --- | --- | --- |
| I0 — Freeze the shared boundary | Lead and runtime owner compare their current source revisions, agree ownership of shared RPC/API/IPC/packaging sites, the raw channel contract, process/window authority, lifecycle and supported host/guest matrix. Runtime worktree remains read-only to this effort until ownership is agreed. | Acknowledged packet with exact symbols/files, identities, resource-exit/termination semantics and deployment path. Missing ownership evidence blocks the affected slice; title/PID-only matching is not a substitute. |
| I1 — Deploy and supervise | Runtime owner composes the tested payload with the actual app session and process channel. Lead verifies deployed hashes, hello/version/session, a bounded discovery proposal using runtime launch evidence and termination/reaping through that channel. Then inject wrong payload/version, EOF and delayed completion at this boundary. | Actual channel receipt, named negative failures, finite cleanup and retained unknown/no-replay semantics. A hello or root proposal alone does not authorize a binding or semantic read. |
| I2 — Bind the actual app/window | Runtime supplies fresh process sets, launch/runtime/session epochs and window/transient/portal association. Helper proposes roots; runtime confirms. Register the exact Dock generation/profile. | One valid binding plus foreign-window/profile/generation and ambiguous-association rejection. Close/restart/rebind invalidate the old refs; hidden or newly focused viewers do not change the captured target. |
| I3 — Exercise production tools and permissions | Lead operates one exclusive test GUI. Execute actual installed tools through the production permission and utility-process/RPC path. Start with one read, then one effect/restore workflow per GTK, Qt and Electron app. | Permission denial before dispatch, native error/unknown propagation, independent app-written file/config effects and restoration. Existing in-process fixture receipts remain supporting evidence, not this oracle. |
| I4 — Freeze the composed candidate | After I1–I3 and their affected regressions pass, independent review checks bootstrap/bindings, RPC/plugin/lifecycle and deployment against the contract. Fix each finding with its focused control before refreezing. | Frozen source/dependency/config/image/payload identifiers, resolved findings and an exact required-case/platform manifest. Review tasks have disjoint readonly slices and separate worktrees. |
| I5 — Packaged joint acceptance | Build each required package once for its frozen inputs. Execute N12 through the packaged application and real runtime/Xpra: deploy, operate the same displayed app, restart, reopen and verify persisted bytes/config and new epochs. Run normal and negative-effect acceptance on this composition. | Complete required manifests, raw receipts, restoration/reaping and verified package/deployed hashes. Start with the established macOS/Linux x64 route for feedback; the agreed Windows/guest-architecture matrix still requires actual execution before broader claims. |
| I6 — Performance and release judgment | Calibrate the actual runtime baseline/instruments and noise; agree and freeze the numeric policy before judging candidate measurements. Run P01–P05 as one scheduled campaign with the same frozen candidate, then review the aggregate delivery evidence. | Paired baseline/candidate samples, failures retained, all required environments accounted for and policy-based verdict. Publication remains a separate explicitly authorized action. |

Dependency chain: `I0 → I1 → I2 → I3 → I4 → I5 → final I6 verdict`. Instrument calibration and baseline preparation can begin after I1, provided they do not compete with GUI/effect tests or change their session. Candidate benchmarking waits for functional closure and frozen thresholds.

While awaiting I0 acknowledgment, lead can finish the readonly bootstrap/RPC/plugin review map, package-byte checks and candidate command/platform manifest. Those tasks produce reusable artifacts without guessing runtime-owned APIs.

## Feedback tiers

1. **Preflight:** validate required inputs, resource ownership, runtime/session identity, sockets/channel, pinned versions and hash correspondence. An environment failure ends the attempt before GUI mutation.
2. **Focused diagnosis:** one hypothesis, one predicted observable, one bounded probe of the actual failing path, one durable receipt. Use a 60-second supervisory target for a single-path diagnostic including startup/cleanup; if that cannot cover the intended question, split the question before launching it. This is an execution budget, not a latency SLA or a change to the helper's 10-second request limit.
3. **Affected regressions:** once the focused failure has a meaningful RED → fix → PASS control, run only suites whose contracts or execution environment changed. Preserve production config, package preloads and real-provider coverage.
4. **Consolidated acceptance:** run the complete normal/negative pair once per frozen composition, not once per edit. A failure returns to its focused path. Successful unrelated checks retain their evidence; the required aggregate verdict closes only when every affected gate has passed on the candidate.

After two probes without the predicted explanatory evidence, stop cycling probes and inspect the mechanism/source/trace. No blind full-suite rerun. Never resend an uncertain mutation as a diagnostic retry; use fresh readonly observations and an explicitly separate restoration/setup operation.

## Change-to-check map

| Changed surface | Immediate checks | Broader rerun trigger |
| --- | --- | --- |
| Documentation or handoff metadata | Diff, links/paths and claimed evidence correspondence | No application-suite trigger unless the actual acceptance contract changes. |
| Guest refs/snapshot/actions/keyboard | Affected real-wire/native tests and relevant mutation controls; failing real-app scenario | Full registered normal/negative pair after payload refreezes. |
| Client/channel/supervisor | Client transport/lifecycle tests; actual-channel startup/EOF/cancel/reap controls | Composed tool proof when channel, deadlines, process identity or cleanup changes. |
| Binding/RPC/plugin/permissions | Native adapter and plugin tests, package typecheck, scoped production admission/denial/cancel | Actual registered path after composition refreezes; browser RPC if shared routing changes. |
| Browser Dock visibility/tab lifecycle | Focused actual Electron case, then affected RPC/security acceptance | Complete browser gate after lifecycle source refreezes; native close/unbind proof if that callback changes. |
| Packaging/deployment | Build once, inspect package contents/resolved payload and hashes, real launch probe | N12 on the newly built package; payload or channel changes also trigger their rows above. |
| Lockfile, toolchain, image, session environment or gate/oracle | Revalidate preflight and enumerate all checks that consume the changed input | Invalidate affected prior evidence even when application source hashes match. An altered oracle requires measured negative controls and review. |

These are routing rules, not a replacement for required CI checks. A new integration boundary earns new evidence even if the helper bytes are unchanged. Changes with uncertain reach trigger dependency review before choosing a narrower suite.

## Reuse, concurrency and CI scheduling

- Reuse immutable image layers and version-matched dependencies. Cache keys include lockfile/patches, toolchain, OS/architecture and build configuration. Built packages are reusable only for the same complete source/build-input fingerprint.
- Each result records source, dependencies, configuration, harness/required manifest, payload/image/app/toolkit versions and host/guest environment. Fresh process/session identities are always reacquired; cached refs, PIDs, sockets and bind confirmations are never reused as proof.
- One heavyweight build/GUI/benchmark process at a time on the shared machine. At most two lightweight readonly reviews may overlap after their slices freeze. Reviewer worktrees remain isolated; shared-source changes wait for the owning slice.
- Before CI dispatch, inexpensive source/contract/type checks run first. The heavyweight integration job starts only after its prerequisites pass. Use the same built package across downstream checks for that candidate instead of rebuilding per scenario.
- When implementing the integration workflow, group concurrency by branch/candidate and cancel superseded runs. Required lanes still run on the supported real runner/platform; a local pass or cached receipt cannot stand in for an unexecuted CI environment. Do not cancel another branch/session's work.
- Give every launched child an explicit outer deadline and joined cleanup. Save failure receipts as artifacts even on timeout; cleanup failure remains a failure. Job budgets are set from the first measured executions and kept separate from product latency thresholds.
- Repeat a green gate only when its inputs, covered boundary, required environment or oracle changed, or when a specific unresolved concern justifies it. Flaky failures get diagnosis; rerunning until green is not acceptance.

No workflow/source change is made by this planning document. Exact runtime-channel, packaged and CI commands are frozen in I0–I4 when their real entrypoints and runner exist. Existing runnable local commands and the broader planned N/P requirements are in [validation.md](validation.md).

## Checkpoints and delivery claim

After each slice, append a compact card: input fingerprint, actual command, receipt path/hash, verdict, cleanup/restoration, remaining blocker and next operation. Snapshot source/evidence after a meaningful source or integration milestone; do not recopy the entire session database after each probe.

Current first dependency: runtime-owner acknowledgment of the packet and exclusive ownership of the composition seam. Local E01–E10 closure is reusable evidence for its recorded scope. Delivery completion requires the real runtime/permission/window/Xpra boundary, required platform runs, remaining global review and calibrated performance verdict; neither elapsed effort nor isolated passes close those items.
