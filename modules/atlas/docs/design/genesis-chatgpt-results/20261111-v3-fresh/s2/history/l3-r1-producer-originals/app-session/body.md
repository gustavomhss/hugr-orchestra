# App/session journeys, ownership and failure boundaries

## Reading the handoffs

This unit integrates source revision `1cde2ff7a71bcf7aecb5d030917b577165135d38`. Its factual foundations are accepted `s2.l2.app-session`, selected desktop and shared-UI sections, and `s2.l1.app-session` test evidence. It carries forward the app unit's 59-family coverage without converting family evidence into exhaustive file inspection. Dependencies and exact pins are in `dependencies.json`; direct captures are in `sources.json`.

Unless marked **instruction** or **inference**, mechanisms below are static observations inherited from the cited predecessor sections. Verification routes are recommendations for a subsequent authorized change, all **unexecuted here**. An accepted description, a durable input, a visible transcript and a completed provider turn are different evidence. The following boundaries explain where those distinctions affect maintenance.

## Enter the intended server and workspace

| Handoff | Owner and stable identity | Failure observation and affected components |
|---|---|---|
| Desktop startup → shared app | Electron main starts the authenticated loopback child, waits for health, then publishes URL and credentials; preload exposes selected host operations. | Child exit, health failure or timeout blocks readiness; the renderer may choose a healthy stored remote. **Inference:** choosing it does not acquire process ownership. |
| Route → workspace providers | App navigation uses the connection key; workspace lifetime includes server scope and directory. Transport lifetime additionally includes URL and credentials. | An unresolved target route navigates home; credential replacement disposes the old context even when the navigation key survives. Requests and streams must follow the replacement. |
| Session → asynchronous callback | A captured session generation owns completion. | Leaving expires it permanently, including A→B→A. Old work must not update the revisited session. |

Desktop health accepts HTTP success; shared-app health requires `healthy === true`. Neither proves future availability. The desktop stable-exit branch resets the failure counter before indexing `BACKOFF[-1]`, so initial readiness does not establish automatic restart. IPC checks also differ by handler; preload reachability alone establishes neither uniform authorization nor an exploit. **Instruction:** onboarding asks the user to trust the folder before adding its project; trust remains a server-owned execution capability.

**Verification:** inspect desktop readiness/IPC ownership, then use the existing `packages/app-shell/test-browser/server-transport.test.ts` and `packages/app-shell/test-browser/prompt-admission-owner.suite.ts` evidence for credential replacement and generation expiry. Sources: `s2.l2.desktop-web` §§ “Startup publishes readiness before the renderer proceeds”, “Privilege is checked at each request boundary”, “Persistence and recovery have several owners”; `s2.l2.app-session` §§ “Composition, identity and asynchronous ownership”, “Navigation, settings and feature controllers”; `.orchestra/skills/onboarding-usage/SKILL.md`, `.orchestra/skills/settings-usage/SKILL.md`; `s2.l1.app-session` § “Assets, localization and verification evidence”; `packages/app-shell/src/app.tsx:99–115`.

## Submit once, then hand the draft to its session

The shared editor owns interaction; app submission owns session policy, attachments and admission. Follow these stages rather than treating Enter as one transaction:

| Stage | Identity or state that must survive | Failure and change impact |
|---|---|---|
| Capture source | Credentials, server scope, directory, draft/tab, prompt snapshot and owner generation. | Navigation invalidates UI ownership; changing capture boundaries affects draft isolation and attachments. |
| Establish session and policy | Retained session/worktree; serialized policy write plus canonical read receipt. | A failed predecessor blocks sending. Recheck ownership and policy revision after asynchronous work and at dispatch. |
| Dispatch admission | For an unchanged action and acknowledged policy revision, retain the selected request ID. | Exact retry requires equivalent session, encoded prompt and delivery mode; conflicting reuse fails. Context reconciliation also checks projection equivalence. |
| Hand off draft | Admission acknowledgment, destination session, current composer edits and tab identity. | Move later edits into the session unsent. Do not overwrite them with the submitted snapshot or let the old draft submit the admitted input again. |

A failed/ambiguous response can remove optimistic content and restore its snapshot while retaining the dispatched session/request. Deletion is restricted to never-dispatched, server-confirmed-empty sessions. A new admission requires its durable sequence and projected record; it is separate from safe-boundary transcript promotion and execution completion. **Instruction:** `resume: false` admits without waking execution.

Browser draft documents use IndexedDB with hashed blobs; native desktop drafts use SQLite/WAL and batching. Shared draft behavior is not evidence of identical crash durability. **Verification:** inspect `packages/app-shell/src/components/prompt-input/submit.ts`, and use `packages/app-shell/src/components/prompt-input/submit-admission.suite.ts` plus `packages/app-shell/e2e/regression/draft-admission-handoff.spec.ts` for policy failure, duplicate entry and delayed acknowledgment. Sources: `s2.l2.app-session` § “Durable admission, optimistic state and draft storage”; `s2.l2.desktop-web` § “Persistence and recovery have several owners”; `s2.l1.app-session` § “Assets, localization and verification evidence”.

## Recover the projection without inventing execution recovery

The app adapter connects generated API/event contracts to view state. Scoped fetch combines context, request and call cancellation. Readiness retains success and retries rejection; startup accepts a numeric PID or `healthy: true`, whereas ongoing app health requires the latter and uses two failed probes plus stream activity before declaring failure.

SSE raw heartbeats establish liveness even without domain events. The server subscribes before its connected event, uses a bounded 4096-event queue and 15-second heartbeat; the client reconnects after 45-second silence with bounded backoff. Adjacent deltas coalesce only for matching identity/directory, preserving intervening order. There is no replay ID: a reconnected socket is not proof that every event arrived.

Canonical reconciliation therefore owns recovery. Fetches preserve live-touched values, tombstones and generations; session/ancestor pins and user-turn boundaries constrain paging. Session recovery coalesces reads, rejects superseded results and repeats GET when policy changes. A local read receipt is not a backend revision; compatibility snapshots lack canonical V2 policy provenance. Rendering keeps pending admission separate from promoted transcript content; adapted part ordinals do not establish chronological order.

**Instruction:** root `AGENTS.md:209–216` keeps drains process-local and requires a separate design for post-crash provider continuation. **Inference:** neither UI reconnection nor durable inbox retention authorizes provider retry or clustered execution claims. Changes affect transport, sync/recovery and timeline together. **Verification:** inspect recovery fences and existing `packages/app-shell/src/utils/server-health.test.ts`; do not interpret its assertions as a run. Source: `s2.l2.app-session` § “Transport, liveness and canonical recovery”; `s2.l1.app-session` § “Assets, localization and verification evidence”.

## Answer requests without transferring server authority to the UI

Permission requests retain server, session and request identity while the UI walks descendants. Auto-accept follows ancestry with cycle protection; explicit false wins fallback, and Relay-hook requests never auto-accept. Server-scoped pending deduplication prevents simultaneous responses; failure clears it for retry. Empty scope cannot support the UI's “always” action. Question state is per request; saved permissions require list/remove/refetch. These mechanisms coordinate presentation, not server authorization.

Terminal access separately obtains a ticket before WebSocket connection. Server/workspace identity scopes persisted tabs, exited agent tabs remain visible, and cursor accounting uses JavaScript UTF-16 units. “Gone” differs from reconnecting. **Instruction:** agent PTYs use the sandbox-wrapped Core `AgentTerminal.run` path; root guidance records unresolved slow-reader buffer growth.

Changes touch prompt gating, pending decisions, saved-permission refresh and terminal restoration. **Verification:** follow request identity through reply failure, then inspect `packages/app-shell/src/context/permission-auto-respond.test.ts` and `packages/app-shell/src/context/terminal.test.ts`; no interactive approval, terminal or load experiment occurred. Sources: `s2.l2.app-session` § “Permission requests and terminal boundaries”; `s2.l1.app-session` § “Assets, localization and verification evidence”.

## Change settings and Skills under the original owner

Global preferences, scoped catalogs and session choices have different scopes. Project chapters remount with server/directory ownership, though some data is server-wide. Shell settings roll back optimistic failure; plugin saved state differs from applied state. Actions pin host/location, decode responses and require receipt reconciliation after an ambiguous POST. **Instruction:** `.orchestra/skills/settings-usage/SKILL.md` treats trust as an execution capability, including inherited trust; visual toggles cannot establish filesystem authorization.

Skills make the mutation boundary concrete. Catalog cache identity is server scope plus normalized directory; warm data refreshes. Decode the entire array before filtering/sorting/cache writes: one malformed row fails the load. HTTP 404/405/501 means unavailable; malformed/other failures mean error, distinct from empty/no matches. Lexical classification controls the edit UI: governed project paths take precedence; editable roots and lowercase `.md` are restrictions on affordances, not symlink-safe authorization.

An edit carries location and optional `mtime`; Add has no existing path. Dialog identity, busy state and disposal prevent stale updates. Reads use cancellation; writes do not receive the page abort signal. Leaving can suppress completion UI without cancelling an issued save/remove. Success closes the originating dialog and reloads; a returned location can still be unlisted.

**Inference/verification:** changes must preserve catalog decoding, mutation identity and late-completion handling together. Trace `skills-data.ts`, `skills.tsx` and `skills-dialog.tsx` under `packages/app-shell/src/orchestra/chapters/`, then check service conflict mapping before an authorized edit/delete walkthrough. Underlying `SkillV2` filesystem enforcement remains uninspected. Source: `s2.l2.app-session` §§ “Navigation, settings and feature controllers”, “Skills catalog, content and editing ownership”.

## Render and localize under caller-owned lifetimes

App `DataProvider` supplies ordered state, navigation and artifact callbacks; artifact operations pin session/location/revision and idempotency. Shared UI primitives provide mechanisms while callers own meaningful labels. Ordinary dialogs can outlive a caller; `showOwned` binds that lifetime. Markdown's final renderer sanitizes and fails closed; parser configuration alone is not that boundary. A latest-per-key serial worker queue governs streamed work and disposal.

Browser theme loading has asynchronous preview/commit/cancel ownership; app first paint also guards late loading. Locale and layout direction are independent inputs, and segmented-control arrow handling follows DOM order rather than direction. **Instruction:** app/session copy requires localization while preserving existing English text byte-for-byte. Palette generation, UI tokens and desktop theme mirroring have separate producers; not all CSS is generated.

**Verification:** inspect caller cleanup, theme race/preview state, generated-output ownership and both direction settings; use `packages/session-ui/src/components/markdown-worker-queue.test.ts` for existing disposal assertions. Visual geometry, focus behavior, contrast and language completeness remain unverified. Sources: `s2.l2.app-session` §§ “Shared rendering, files and evidence interpretation”, “Visual resources and prescribed maintenance”; `s2.l2.design-tui` §§ “Browser UI ownership, lifecycle and accessibility”, “Localization, direction and two theme systems”, “Generated products and asset provenance”; `s2.l1.app-session` § “Assets, localization and verification evidence”.

## Route a change through its affected contracts

**Inference:** diagnose by retained identity and authoritative owner before changing UI behavior. A stable navigation key does not preserve obsolete credentials; cancellation does not erase dispatched writes; heartbeat health does not settle admission; displayed history does not prove provider recovery.

**Instructions:** public Protocol/Server `HttpApi` changes require client generation rather than hand edits to generated trees. Client runtime depends on Schema/Protocol, not Core/Server. Session/timeline production changes require before/after benchmarking under app maintenance guidance; normal Playwright excludes performance diagnostics. This documentation change executed no product checks, benchmarks, CI, provider calls or host operations. Existing tests supply proposed verification routes only.

Optional navigation to `s2.l3.desktop-web` and `s2.l3.design-tui` is not evidence from those still-separately-produced units. Sources: root `AGENTS.md:1–2`, `packages/app-shell/AGENTS.md`, `packages/session-ui/AGENTS.md`; `s2.l2.app-session` §§ “Visual resources and prescribed maintenance”, “Verification limits and ownership use”; `s2.l1.app-session` § “Assets, localization and verification evidence”.
