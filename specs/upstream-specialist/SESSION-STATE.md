# Current combined-source checkpoint

Updated 2026-10-09. Implementation-first owner cadence: no typecheck/test/mutation/CI/launcher/private-auth/model execution while combined implementation is incomplete. One final scoped validation batch follows readiness; no PR before the final milestone.

## Active candidate

Canonical worktree:

```text
/private/var/folders/lt/z11pyzhj0m17vn798jkk69hh0000gn/T/opencode/upstream-combined
```

- HEAD `9214c542699012288f9e47f2fb82671ee6dc5cb4`, published `fork/upstream-combined`.
- Parent `01a48f6a22158437ce544d8cdcef08a29ddcd7fb`: complete reviewed upstream source composed over runtime `b1cad41dc515eec9dcf474c413da853061894ac1`.
- Latest commit composes UNVALIDATED Relay binding/currentstep `d438ef8eabe33f36357e61cb0d727e604c176bf6`, lifecycle draft `b72bfccf250d42831596fd59b0d068c9a754909c`, signed same-lock evaluator `d2cc5b16bf8bc4c64ce5949021d57d282170d506`, runtime V1 launcher `fe3760f621a987809990d95f73979bdfb80f5994`, and canonical docs/receipts `de29f15a9752489b744020fd0197862fdd04db23`.
- Only composition source resolution: retain both UpstreamAttribution and RelayArm imports, with one optional import. Pilot docs now gate prepare/default mode as well as run. No credential-source blobs changed.
- The recorded source was committed/pushed under explicit owner resumability permission. No PR, landing or deploy. This checkpoint is post-commit coordination, not evidence that source compiles or executes.
- Old `upstream-host` dirty/index/untracked state is preserved; do not discard it. Original author/reviewer worktrees and original pilot evidence remain intact.

## Scope already supplied

- Native walt/upstream registration, charters/skills, restricted authoring Arsenal, result/parser, strict byte inspector, bootstrap and bounded Plugin/lease fixes, Maestro authoring transfer.
- Canonical UpstreamAttribution.V1 and PlanRevision RecordedV3 source region; synchronous V1/current V2 host verifier. Actor/Project/parent call/child/LogicalTask/author/proposal/host-result reconcile through real records. Background remains named HOLD.
- Exact production-source base inventory and source-bound reviewerSession/message receipts in `base-source-receipts.md`; do not rerun old reviews to record receipts.
- Prior passing suites belong to their historical source pins, not the new combined source. No checks executed in this implementation-first wave.

## Active ownership / unfinished wiring

Relay consumes schema/host component patches as `30ac511984` / `4385c5847d` and is directly finishing concrete WorkflowNativeHost, V3 producer/reader/hash and current lifecycle. It owns final shared maestro-event integration, publication/Task binding, Core Relay/workflow and minimal Task/Session settlement. Preserve canonical DTO/version/brands and two nativeUpstream sites; no invented equivalent upstream implementation.

Current composed draft is not final wiring:

- `WorkflowFields` is exported, but canonical V3 data still needs its field spread; V3 inventory/reader/producer/hash reconciliation remains pending the Relay final source.
- Signed workflow evaluator disposition and repair use the existing lock/evaluator; they are not proof of returned upstream assistant or background delivery.
- Background success requires final host workResult tied to actual returned assistant and referenced durable delivery on exact existing parent Task part, with async/resume and completed-part races resolved. Verifier presently names UPSTREAM_ATTRIBUTION_PROPOSAL_UNAVAILABLE HOLD; do not loosen it to trust synthetic notices, process-local job status, clocks or equal bytes.
- Wait for the exact host settlement field shape before updating upstream-owned verifier; no concurrent shared Task/Session edits.

## Pilot source, still UNRUN

Runtime launcher `packages/orchestra/script/maestro-pilot.ts` defaults to prepare-only but both modes read private auth and create directories; do not invoke any mode yet. V1 source CLI uses legacy Run -> SessionPrompt -> Provider/Auth, not V2 Credential.layerFrom.

At permitted final boundary, use canonical absolute candidate and existing fixture paths:

```text
--candidate /private/var/folders/lt/z11pyzhj0m17vn798jkk69hh0000gn/T/opencode/upstream-combined
--pilot /private/var/folders/lt/z11pyzhj0m17vn798jkk69hh0000gn/T/opencode/upstream-authoring-pilot-01
--auth-source <explicit existing private compatible legacy Auth.json>
--run
```

The launcher uses Maestro / openai/gpt-6.1-sol, demand stdin, fresh isolated run DB/XDG/HOME, private redacted evidence, four exact b1 credential source pins, and ten-minute deadline plus five-minute refresh margin. Expired/incompatible registration or plan scope is a named blocker; no refresh/rotation, migration, invented IDs or re-login. Installed store compatibility and actual source-file selection remain unproved. No private auth store was read during source composition.

Prior pilot remains failed provider preflight at Session ses_ee29a94c6ffeTkLltsxz8j7ydu; it is not model/behavior qualification. Runtime native/WSL draft proof branches f1a4d8c747 and 80f3ebecfc do not gate W6 or justify unrelated reruns.

## Next concrete continuation

1. Consume Relay's final concrete host/V3/lifecycle source, preserving ownership and source pins.
2. Reconcile upstream verifier with the exact host-written background settlement/delivery facts; prepare discriminating cases and static review only until source combined-ready.
3. Once ready, execute the scoped final batch and one final bun typecheck per actually affected package; then one isolated real Maestro pilot through runtime launcher and actual compatible auth source. Required failure/negative controls remain intact; old passing broad suites are not repeated.
4. Persist final receipts/result and only then prepare the owner-authorized milestone PR.
