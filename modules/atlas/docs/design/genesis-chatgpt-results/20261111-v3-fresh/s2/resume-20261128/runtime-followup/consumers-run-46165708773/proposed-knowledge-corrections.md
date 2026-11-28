# S2 consumer HOLD knowledge deltas

Status: source-grounded proposal only. No candidate update, re-admission, consumer rerun, or judgment is claimed. Source pin: `gustavomhss/hugr-orchestra@1cde2ff7a71bcf7aecb5d030917b577165135d38`, using the accepted materialized corpus at `evidence/s2-admission-46162067144/*/run/corpus`. Frozen question source: `modules/atlas/docs/design/genesis-chatgpt-results/20261111-v3-fresh/s2/requests/consumer-question-deck.json` (`source_revision` equals the pin). The old-body hashes below are SHA-256 of the full current accepted body file; preserve all text outside each quoted splice.

## S2-C1 — failed first-send cleanup

Target `s2/layers/l2/app-session/body.md`; old-body SHA256 `302011411d509ca96abf0fc538425a2d0db7c73d49186f1ac45f83db5d2e3de7`. Replace the paragraph beginning “In this submit path, optimistic presentation can be removed.” (body lines 29–29) with:

> In this submit path, optimistic presentation can be removed, but that alone does not settle whether the server admitted the prompt. A first-send Session is removed only when the policy write failed before prompt dispatch **and** a server read confirms that the Session has no messages; a failed read or nonempty result retains the Session. Once dispatched, keep the Session/request identity for exact retry because admission can precede promotion into a visible message. After admission, edits made during the send are handed to the Session composer unsent and must not overwrite newer input. These are observations of this submit path, not a guarantee about every failure branch. [`packages/app-shell/src/components/prompt-input/submit.ts:455–476,583–674`; `s2.l1.app-session` §Prompt admission and draft ownership]

Source check: `submit.ts:455–476` shows cleanup requiring `!dispatched && empty === true`, with policy-failure-specific reset; `:660–672` shows response failure after dispatch calls `settleEmptySession(true)`, which cannot delete. `:547–575` hands edits to the session unsent. Do not generalize to other send paths.

## S2-C2 — untrusted renderer IPC

Target `s2/layers/l2/desktop-web/body.md`; old-body SHA256 `03cd2b45638ff7ce0061f03477dff3d2129dc11ddbdbbc9694e6040a5a70a457`. Replace body line 29 (paragraph beginning “The general IPC wrapper checks renderer origin…”) with:

> The shared IPC wrapper checks the sender frame's renderer origin. For `ipcMain.handle` channels, an untrusted sender causes the invocation promise to reject with `Untrusted IPC sender`; for `ipcMain.on` channels, the event is dropped without invoking its listener. This applies only to handlers registered through that wrapper. App Dock has separate registration and checks the owning window and its main frame; Live and WSL direct registrations are outside the shared wrapper's origin gate, so inspect their own handler and preload/navigation scope before drawing a conclusion. Packaged windows ignore `ELECTRON_RENDERER_URL`. The enforced CSP remains only `object-src 'none'; base-uri 'self'`; the broader policy is report-only, so CSP cannot substitute for sender/handler checks. (`apps/desktop/src/main/ipc.ts:69–82`; `apps/desktop/src/main/ipc-app-dock.ts:76`; `apps/desktop/src/main/renderer-origin.ts:7–22,25–45`; `s2.l1.desktop-web` §2.)

Source check: the `handle` wrapper throws while `on` silently declines (`ipc.ts:74–82`); App Dock's own check is in `ipc-app-dock.ts:76`; packaged origin and CSP scope are explicit in `renderer-origin.ts`. This describes registration/source scope, not a live exploit or packaged runtime test.

## S2-C4 — owned startup versus configured remote recovery

Target `s2/layers/l2/desktop-web/body.md`; same old-body SHA256 as above. Replace body line 13 (paragraph beginning “Instruction and historical rationale…”) with:

> **Instruction and historical rationale:** the startup skill prescribes `userData/global`; its earlier report says a first run can spend about 30 seconds scanning a new unsigned macOS executable. That is historical rationale, not a measurement of this launch. The owned child has distinct outcomes: an exit before health fails immediately, while a live child that never answers is capped at 120 seconds; a 35-second wait alone is therefore still within the configured readiness window. Diagnose through existing logs/process state without restarting an existing app. After local startup failure, renderer recovery considers only configured HTTP(S) connections that pass the health probe, trying the configured preferred URL first and then remaining entries in their stored order; it does not discover arbitrary servers. Startup resolves the CLI and launch environment together before starting the child, while remote recovery is a later renderer path. (`apps/desktop/src/main/owned-serve.ts:16–18,41–48,92–102,135–147`; `apps/desktop/src/renderer/initialization.ts:3–9,12–52`; `apps/desktop/src/main/index.ts:431–475`; `.orchestra/skills/desktop-startup-maintenance/SKILL.md:10–26`; `s2.l1.desktop-web` §1, §3.)

Source check: `owned-serve.ts:94–102` races health against first exit and the 120-second timeout; `initialization.ts:20–52` filters and probes configured HTTP(S) candidates, preferred first. The unsigned scan duration is historical skill context only. Existing runtime recovery was not executed by this proposal.

## S2-I2U — prompt context and V2 selection order

Target `s2/layers/l2/design-tui/body.md`; old-body SHA256 `21a5416918430c88d13679611736bf89ee554c4c75fc49405bcd5fb3dca4c4b1`. Replace body line 32 (paragraph beginning “These are pinned declarations and call selections…”) with:

> For V2 prompt actions, the TUI selects the Session's agent and model before sending the prompt: `switchAgent` is awaited first, then `switchModel`; prompt submission uses the session's selected model rather than attaching an agent/model override to each prompt. Editor context is admitted as a synthetic input that does not wake the Session, so the following prompt carries it into the same turn. These are pinned declarations and call selections, not observed server outcomes. (`packages/tui/src/context/session-actions.ts:7–16,26–28,29–63`; `packages/protocol/src/groups/session.ts:379–394,431–443,550–582,655–665`; `s2.l1.design-tui`, **V2 session action boundary**.)

Source check: `session-actions.ts:10–16` gives literal ordering; `:26–28` states selection and synthetic context behavior. This does not establish an observed server turn or execution result.

## Scope and verification notes

- These four proposals answer only the frozen C1, C2, C4, and I2U questions in the cited deck; they do not revise any other accepted body or expand its source scope.
- L2 contains historic synthesis. Where an implementation's behavior is asserted, the proposal binds it to the exact pinned source path and line span above; historic unsigned-build scan rationale is explicitly labeled historical.
- A changed body requires normal identity/result regeneration and fresh consumer/judge work by the owning integration path. This dossier itself does not update body files or claim re-admission.
