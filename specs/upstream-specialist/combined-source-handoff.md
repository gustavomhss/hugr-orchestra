# Upstream composition on current runtime baseline

2026-10-09. Implementation-first owner cadence remains active: no tests, typecheck, mutation, CI or model pilot until combined W6/runtime code is ready. This is source composition and ownership reconciliation, not acceptance or deploy.

## Why this composition exists

Relay's clean inspected `b1cad41dc515eec9dcf474c413da853061894ac1` still has the old native roster, including retired `bobby`, and no `walt` registration. The standalone attribution/schema and verifier commits alone cannot provision native upstream on that baseline.

Dedicated candidate worktree:

```text
/var/folders/lt/z11pyzhj0m17vn798jkk69hh0000gn/T/opencode/upstream-combined
```

It composes the previously reviewed/tested upstream source delta `73651a0e69..05a431167bead651abcc3e748f1516cf4a3035f4` plus source-reviewed schema `8f73c045307f06da311ee6f8b1bb6ba378bf265c` and host `cc6f5a8f755bb7d765c5d918ecd23180244be006` onto runtime `b1cad41dc515eec9dcf474c413da853061894ac1`. The old `.ci-run.json` snapshot request is deliberately excluded. `upstream-host` and all previous dirty/untracked owner work remain preserved.

**Exact source commit:** `01a48f6a22158437ce544d8cdcef08a29ddcd7fb`, parent `b1cad41dc515eec9dcf474c413da853061894ac1`, published as `fork/upstream-combined`. Source-only resumability checkpoint; no PR or validation dispatch. This is the complete upstream source transfer for Relay on b1. Do not apply its earlier component commits again on top of it.

## Source audit and composition seam

Independent source-identity audit `ses_ee115d6e5ffe0TiacekylDCXIE` measured the intended 63 paths and exact staged set; every intended Git blob/mode and working-tree byte matches prior source pins except the sole expected ToolRegistry composition.

- Existing runtime SDK admission uses `loadExternalTool` → `PluginSdkRuntime.prepareExternalImport` → install → dynamic import.
- Upstream native `walt` Arsenal visibility hunk occupies a disjoint region of the same `packages/orchestra/src/tool/registry.ts`.
- Both are preserved. The known different registry blob calibrated the comparison; no whole-file replacement erased runtime admission.
- Retired reviewer prompt/seat are absent on both source and composed index, with their original presence checked in baselines.
- No runtime auth/provider/native/WSL source or unrelated tool state was introduced by this transfer.

Cold composition review `ses_ee115d6f7ffe4JbY8s74h3xUmi` APPROVE covers those seams and compatibility with runtime Event.define's optional dataIdentifier. It is a static review, not an executed check or full feature acceptance.

## Parallel ownership and readiness

- Upstream supplies the complete native seat/charter/skills, restricted authoring Arsenal, parser/projection/materialization helper, V2 bootstrap/lease/activation fixes, Maestro authoring transfer and attribution/V3/verifier source.
- Relay integrates its independent publication/approved-scope binding, V3 inventory/reader/producer/hash, current-step/transition and exact existing Task settlement. It preserves the two nativeUpstream sites and canonical upstream DTO/source definitions.
- Runtime's launcher source is published UNVALIDATED as `fe3760f621a987809990d95f73979bdfb80f5994` (`runtime-pilot`): `packages/orchestra/script/maestro-pilot.ts` and `specs/runtime-closure/PILOT-CREDENTIALS.md`. Existing `ORCHESTRA_AUTH_CONTENT` and pre-refresh refusal are present on runtime b1; V2 Credential.layerFrom is distinct. Actual installed store selection/compatibility remains unproved. Do not invoke the launcher, including default/prepare-only modes, before combined implementation readiness.
- Native/WSL/Nix build drafts do not gate W6 or trigger unrelated validation.

Background attribution remains named HOLD until Relay persists final workResult from the actual returned assistant and a referenced durable delivery on the exact existing Task part. Public synthetic notices, process-local job completion, clocks and matching bytes cannot replace those facts. See `attribution-relay-handoff.md` in the preserved upstream-host worktree.

Prepared pilot working directory points at **`upstream-combined/packages/orchestra`**, not the older `upstream-host` candidate. Engine is retained V1 Run/SessionPrompt/Provider/Auth, model `openai/gpt-6.1-sol`. The prepared launcher creates a fresh isolated DB/XDG/HOME under the existing fixture and pins four credential source blobs. Its source does not qualify an installed credential. Detailed old invocation and prepared wrapper command are in `pilot-runtime-handoff.md`.

Relay has separately published UNVALIDATED binding/currentstep `d438ef8eabe33f36357e61cb0d727e604c176bf6`, lifecycle draft `b72bfccf250d42831596fd59b0d068c9a754909c`, and same-lock signed evaluator adapter `d2cc5b16bf8bc4c64ce5949021d57d282170d506`. They are composed provisionally in the lead candidate index, with only the duplicate optional/import conflict reconciled. Final native-host/V3 hash/lifecycle wiring is still Relay-owned and incomplete. Signed workflow disposition is not background upstream author/delivery evidence.

## Final validation boundary

Prepare and reuse existing discriminating cases now. Consume reviewed Relay settlement/binding and runtime V1 credential launch handoffs, reconcile source once, then run one scoped final batch and one final typecheck per actually affected package. Do not rerun old passing suites merely because source was copied; historical byte identity carries its limited evidence, while new integration still needs final proof. Exact final candidate model is `openai/gpt-6.1-sol`; no live pilot runs during incomplete implementation.
