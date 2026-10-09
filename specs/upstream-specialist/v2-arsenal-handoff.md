# V2 upstream Arsenal binding handoff

Baseline: `abf7a72c77fcaeee1206400a8270b2581ae9839c`. Frozen contract: `specs/upstream-specialist/wave-2.md` in the lead worktree.

Integration owner: the Relay/runtime owner of `packages/orchestra/src/maestro/arsenal-bindings.ts`. This document is an additive handoff; the shared source has not been edited by the binding worker.

## Exact additive change

In the top process-scoped application-tools layer, keep the existing actual native and V2 service lookups and `nativeMaestro` calculation. Immediately after them, add the upstream attestation:

```ts
const native = yield* nativeAgents.get(context.agent).pipe(Effect.provideService(InstanceRef, instance))
const agent = yield* agents.get(context.agent)
const nativeMaestro = agent?.id === "maestro" && native?.id === "maestro" && native.native === true
const nativeUpstream = agent?.id === "walt" && native?.id === "walt" && native.native === true
```

Add only that flag to the existing host object:

```ts
const host = { directory, stateDirectory, projectID: session.projectID, nativeMaestro, nativeUpstream, ask }
```

Both identities must be the actual service results for this invocation and its loaded Instance. A V2 ID, display label, config value, tool argument, Session metadata or receipt alone does not attest a native seat. Missing, custom, non-native or mismatched service results keep the flag false.

## Preserve the surrounding boundary

- Keep the Session lookup, Location placement validation, plugin readiness, Instance validation and Location service provisioning unchanged.
- Keep `nativeMaestro` separate. Do not OR upstream into it. Keep the existing `nativeMaestro`-only `prepareState` branch; upstream does not bootstrap a managed root through this new flag.
- Keep directory, state directory and Project identity, `ask`, output limits, filesystem authorization, mutation containment, resource guard, observations, before/after execution hooks, Session/message/call identity and native services unchanged.
- Keep all three existing tool IDs: `maestro_arsenal_catalog`, `maestro_arsenal_describe`, `maestro_arsenal_execute`. Core restricts upstream catalog, describe and execute to `UPSTREAM_AUTHORING_OPERATIONS`; permission checks remain independent and current. Describe receipts remain bounded and tied to Project/directory/Session/agent.
- The application's `applicationTools` resolver returns the host flag directly. Core's separate scoped registration `Options.nativeUpstream` callback is not a replacement for this per-invocation dual-service attestation.
- Do not create or initialize an Arsenal completion arm, approval, authorization, workflow, Relay runtime or public namespace. Pure authoring results remain advice and structural checks, not authority, publication or execution receipts.
- Preserve the separate public authoring check as Maestro-only. Discovery of these pure helpers does not widen that boundary.

## Integration dependencies and acceptance

1. Integrate the sibling Core implementation exporting the immutable 13-ID `UPSTREAM_AUTHORING_OPERATIONS` list, `Host.nativeUpstream?: boolean`, the optional scoped attestation callback and the pure-only restrictions across all three handlers.
2. Integrate the lead-owned real `walt` roster grants: catalog allowance, exact listed operation patterns for describe/execute, deny fallback. No blanket `maestro_*` allowance; no governor or Atlas tools.
3. The Relay/runtime owner applies and acknowledges the two additive code sites above. The binding worker does not edit the shared seam or Task/Session/completion sources.
4. Exercise real V2 services: actual V2 `walt` plus actual native V1 `walt` succeeds only for the granted pure subset. Mismatched V2/native IDs, native:false, custom label impersonation and an ungranted operation fail. Confirm native Maestro retains its existing surface and the public authoring boundary remains Maestro-only.
5. Run the worker's V1 boundary tests through `bun run test:ci orchestra test/tool/upstream-arsenal.test.ts --os both` from the assigned root; run `bun typecheck` from `packages/orchestra`. Final integrated CI and boundary mutation evidence remain lead-owned.

## Discriminating mutations for integration

- Remove V1 `nativeUpstream` from the host: the real native upstream catalog/describe/execute test must fail on identity.
- Restore the registry's previous Maestro-only Arsenal filter: the real upstream discovery test must lose the three tools and fail.
- Remove the V1 stable `agentID: "walt"` prerequisite and fall back to `agent`: the direct/legacy omitted-ID label-impostor test must fail on catalog identity before any permission request. A stale display label with actual host `agentID: "walt"` must still work when restored. Existing label/ID-precedence cases alone do not prove necessity of the real service recheck; mismatched actual-service coverage is a separate integration obligation.
- Widen upstream into `nativeMaestro`: the real catalog test must see more than the 13 pure IDs and fail.
- Remove registry permission filtering: native or Session deny tests must fail.
- Widen the V2 attestation to either service alone: real mismatched-service tests owned by the runtime integrator must fail.

Restore every mutation before handoff. A dependency failure, skipped test or unchanged failure before and after a mutation is not mutation evidence.

## Worker verification at the local handoff

The assigned worktree remains on the baseline above. The Core contract and lead-owned roster grants had not been integrated when these checks ran.

- Initial Linux/Windows CI: [37801225577](https://github.com/gustavomhss/hugr-orchestra/actions/runs/37801225577). Each OS reported 1 pass / 5 fail: four named Core-export dependency failures and one test adapter defect (`Effect.tap` returned `undefined`). The adapter was corrected to use an Effect generator.
- Identity-filter mutation: [37801835431](https://github.com/gustavomhss/hugr-orchestra/actions/runs/37801835431). Temporarily bypassing only the registry's Arsenal identity filter exposed all three Arsenal tools to the wrong caller; the wrong/custom/native:false denial test failed on both OSes at its empty-result assertion. Four Core-dependent tests remained blocked. The mutation was removed.
- Restored CI: [37802359621](https://github.com/gustavomhss/hugr-orchestra/actions/runs/37802359621). Both OSes reported 2 pass / 4 fail. Registry identity denial and all-three-surface V1 impersonation denial passed. The four remaining failures were exactly `DEPENDENCY_MISSING: Core MaestroArsenal.UPSTREAM_AUTHORING_OPERATIONS`, before their positive boundary assertions. This is not an integrated green result.
- Package `bun typecheck` reached the compiler and reported only five `TS2339` references to the missing Core export in the new tests. Positive operation execution, native upstream discovery, permission-deny filtering and their mutations still require the explicit dependency handoff.
- Full dependency installation initially failed on vendored client tarballs and `ghostty-web`; `bun install --filter "./packages/orchestra" --frozen-lockfile --ignore-scripts` succeeded without changing the lockfile. New test/document formatting was checked with embedded snippet formatting disabled; the existing source files have baseline formatting debt outside the tiny binding diff.

The measured mutation evidence is limited to registry identity denial. V1 positive-host, permission filtering and V2 mismatched-service mutations remain integration checks, not worker claims.

## Lead integration update

Core implementation and real roster grants were integrated into candidate `ff3b57d4a6323a150949072d06ad379f666a65af`. V1 discovery/real-host operation/deny filtering, structural inspection and source/bundle registration tests passed Linux and Windows in run [37810980116](https://github.com/gustavomhss/hugr-orchestra/actions/runs/37810980116). Subsequent cold review identified omitted stable-ID ambiguity; the lead added an explicit stable-ID requirement and direct-call regression. That later change needs its own final CI evidence. Actual V2 application binding remains the neighboring owner's unapplied handoff.
