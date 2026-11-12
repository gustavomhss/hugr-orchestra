# Genesis S2 — desktop/web journeys and change impact

## Orientation and evidence boundaries

`s2.l3.desktop-web` traces handoffs between the desktop/browser hosts, shared application and reusable UI at revision `1cde2ff7a71bcf7aecb5d030917b577165135d38`. Build evidence is accepted `s2.l2.desktop-web`, `s2.l2.app-session` and the cited browser-UI sections of `s2.l2.design-tui`. Observations below remain static; **interpretation** identifies maintenance conclusions and **verification route** identifies future work, never an executed result. Representative coverage and metadata-only gaps retain their prior depth.

Read the section matching the user-visible transition. Each relation table identifies the responsible owner, stable payload/identity, observable failure, affected components and an appropriate verification route. Desktop main owns host resources; preload exposes selected capabilities; desktop and web supply `Platform` adapters to the shared application. Shared UI supplies presentation/lifecycle primitives without taking over server or host authority. (Evidence: `s2.l2.desktop-web`, “Orientation and ownership”; `s2.l2.app-session`, “Composition, identity and asynchronous ownership”; `s2.l2.design-tui`, “Browser UI ownership, lifecycle and accessibility”; `apps/web/AGENTS.md:1–3`.)

## Launch, choose a server and identify the health decision

Desktop resolves the CLI/environment, launches its owned loopback server in `userData/global`, waits for health and publishes credentials through initialization. A healthy stored remote can recover the renderer after local failure; that is a server-selection outcome, not evidence that the local child recovered. Shared-daemon mode has different lifetime ownership. (Observation: `s2.l2.desktop-web`, “Startup publishes readiness before the renderer proceeds” and “Persistence and recovery have several owners.”)

| Handoff and owner | Stable payload; observed failure | Change surface and verification route |
|---|---|---|
| Main → owned CLI → renderer initialization | CLI/environment/cwd and authenticated URL; health races first-child exit and 120-second timeout. Publication follows HTTP success. | Startup/environment/renderer initialization. Compare launch-stage logs and authorized startup-failure coverage; preserve health-before-publication. |
| WSL controller → renderer server list | Distro/job generation and verified executable/companions; only ready servers enter the list. Health requires authenticated `healthy: true` and wrong-password 401. | WSL artifact/startup/controller and renderer connection adapter. Check stale completions, authentication rejection and unavailable-selection fallback. |
| Shared-app startup → ongoing health | Startup accepts numeric PID **or** `healthy: true`; the separate probe requires `healthy === true`. Two missed polls plus stream-activity policy govern demotion. | Shared transport/health and disabled-action feedback. Exercise distinct response shapes and controlled stream/poll clocks. |

The table combines `s2.l2.desktop-web`, “Startup publishes readiness before the renderer proceeds” and “Linux workspaces and WSL have different lifetimes,” with `s2.l2.app-session`, “Transport, liveness and canonical recovery.” **Interpretation:** report which predicate failed before replacing a check or calling the server unavailable.

Retain two discrepancies: the renderer's early-credential comment contradicts main ordering; stable-child exit resets failures to zero then reads `BACKOFF[-1]`, taking the no-restart branch. The accepted mode-only test does not cover that restart path. Startup guidance recommends comparing cold/warm log timestamps and avoiding extra warm-path hashing; its historical timings are not present measurements. (Evidence: `s2.l2.desktop-web`, “Startup publishes readiness before the renderer proceeds”; `.orchestra/skills/desktop-startup-maintenance/SKILL.md:18–26`.)

## Reconnect without transferring work to a replacement owner

The web entry separates saved default-server preference from current-origin token authentication and removes `auth_token` from history. Once either host enters the shared app, the stable server key owns navigation/storage, while changed credentials dispose the old same-key transport context. Server/directory scope owns workspaces; session generations reject departed owners even after A→B→A. **Interpretation:** a route that looks unchanged does not authorize an old asynchronous response. (Evidence: `s2.l2.desktop-web`, “Host adapters own platform differences and copy”; `s2.l2.app-session`, “Composition, identity and asynchronous ownership.”)

SSE raw bytes, including 15-second comment heartbeats, establish liveness. After 45 seconds of silence, reconnect proceeds with bounded backoff; canonical reads reconcile state under generation/tombstone guards. Frames carry no replay IDs. A failed first-send response can follow durable admission, so dispatched session/request identity may survive removal of optimistic presentation. Exact retry requires the same admitted request semantics. Neither reconnect nor a refreshed transcript proves resumed provider work or clustered execution recovery. (Observation and limit: `s2.l2.app-session`, “Transport, liveness and canonical recovery” and “Durable admission, optimistic state and draft storage.”)

**Change/verification route:** coordinate host connection adapters, shared server/global contexts, submission ownership and canonical recovery. Check credential replacement, A→B→A callbacks, heartbeat-only activity, stalled streams and ambiguous admission responses. These are bounded handoff cases, not a losslessness guarantee. Startup guidance prescribes injected-clock edge checks for liveness. (`.orchestra/skills/desktop-startup-maintenance/SKILL.md:28–37`; the accepted app/session sections above.)

## Cross renderer, preload and main with a scoped capability

Desktop isolation, sandboxing and disabled Node integration establish parts of the host boundary; actual request admission remains channel-specific. Packaged origin handling ignores the development URL. Only `object-src 'none'; base-uri 'self'` is enforced CSP; the broader policy is report-only. **Interpretation:** track the sender and acquired capability through each asynchronous operation, rather than treating the preload's presence as universal authorization. (Evidence: `s2.l2.desktop-web`, “Privilege is checked at each request boundary.”)

| Handoff and owner | Stable identity; failure observation | Affected components and verification route |
|---|---|---|
| Renderer → `window.api` → general main IPC | Renderer origin is checked by the general wrapper. Live/WSL registration bypasses that wrapper in inspected modules. | Preload/types, main registration and navigation policy. Review each channel's reachability/admission; the difference alone proves no exploit. |
| Renderer → attachment picker / response transfer | Sender-bound one-use path tokens or originating-main-frame save handle; bounded bytes, sequence and exclusive temporary-file ownership. | Picker, preload, renderer streaming and main writer. Check foreign sender, sequence gap, partial write and unowned collision expectations. |
| Transfer completion → destination | Rename commits the acquired temporary file; later cancellation must preserve committed output. | Writer/cancellation and lifecycle callers. Verify before/after-commit cancellation separately; shutdown alone is no completion receipt. |

All rows inherit `s2.l2.desktop-web`, “Privilege is checked at each request boundary.” Desktop instructions keep renderer calls on the preload API; they do not erase the observed registration differences. (`apps/desktop/AGENTS.md:3–4`.)

## Move from a visible Dock to a browser, native or guest effect

The app-side Dock controller scopes profiles by server/directory and serializes revisioned writes; main owns browser views and persistent partitions. Their shared concern is rejecting stale generations/attachments. Visible selection, a browser reference and guest-access authority remain different identities. (Evidence: `s2.l2.app-session`, “Host capabilities and auxiliary lifetimes”; `s2.l2.desktop-web`, “Browser Dock operates on current tab observations.”)

| Owner handoff | Identity and failure outcome | Change surface and verification route |
|---|---|---|
| Renderer Dock → main browser tools | Profile revision, tab ID/generation and numeric reference namespace; replacement/navigation invalidates prior observations. | Renderer controller, profile/view lifecycle and page tools. Check delayed attachment, revision conflict, popup denial and reference invalidation. |
| Main native host → accessibility helper | Runtime/binding epochs, process birth/namespaces and confirmed AT-SPI roots; cancel after dispatch is `unknown`, and ACK does not release the original slot. | Admission/channel/workspace/helper lifecycle. Check stale rebind and cancellation ordering; observe the actual postcondition separately. |
| Linux access RPC → owned guest runtime | Saved local endpoint/container identity plus session-owned exec/file/terminal work; absolute guest paths are not host-path restrictions, and uncertain termination remains uncertain. | Runtime/access RPC/guest helpers. Verify ownership changes, cancellation and real termination independently of visible-tab/native readiness. |

Evidence: `s2.l2.desktop-web`, “Browser Dock operates on current tab observations,” “Native Dock preserves identity and uncertain outcomes,” and “Linux workspaces and WSL have different lifetimes.” **Interpretation:** preserve these distinct authorities through tool results and cleanup; bounded, non-atomic snapshots and dispatch acknowledgments cannot establish successful UI mutation.

## Finish capture, persistence and installation at the right boundary

| Journey and owner | Stable state; observable incomplete outcome | Affected components and verification route |
|---|---|---|
| Live settings → main capture → meeting/session delivery → overlay | Permission, source availability and key configuration differ from deliberately unknown provider reachability. Stable segment IDs support retries; stop reports unsent data. | Optional shared Live callbacks, capture/transcriber/clients and overlay bridge. Check denied microphone, audio degradation, retry/stop and overlay sender ownership; platform capture protection needs separate evidence. |
| Window close → renderer flush → main stores | Per-window ACK IDs and bounded three-second handoff; drafts additionally have pending writes, SQLite WAL and content-addressed blobs. Timeout permits closing, not universal durability. | Window/preload lifecycle and draft/store owners. Check independent/coalesced ACKs, pending writes and WAL-aware backup, including the main-file-only negative control. |
| Update-ready state → stop resources → installation | Stored version is revalidated against backend/cache; installation failure returns to ready. Child exit differs from drained close. | Updater, windows, sidecars and executable resources. Check stop/install failure transitions and real packaged ownership; mock states do not prove installer/signature behavior. |

Evidence: `s2.l2.desktop-web`, “Live separates readiness, capture and delivery,” “Persistence and recovery have several owners,” and “Executable staging and update state are separate evidence”; `s2.l2.app-session`, “Host capabilities and auxiliary lifetimes.” **Interpretation:** retain each owner's completion evidence when adding an aggregate stop or recovery flow.

## Carry changes through shared UI and distribution

| Change crossing owners | Required stable contract and observed gap | Impact and verification route |
|---|---|---|
| Host/shared application → UI dialog/worker consumers | Ordinary dialog roots are detached; `showOwned` opts into caller lifetime. WorkerPoolProvider selects pools without owning disposal. | Route/unmount callers, dialogs and worker owners. Check cleanup/focus restoration; Storybook's presentation mocks and accessibility `todo` supply no runtime proof. |
| Language/settings → shared copy → native menus/errors | Typed phrases/placeholders and locale/direction ownership must survive changes. Main's startup fallback still hardcodes English; dictionary presence establishes no translation completeness. | Shared language bundles, desktop translator/native bridge and error paths. Preserve intentional English; verify copy, direction, labels and real focus behavior. |
| Theme/assets/build inputs → generated products → host package | Terminal and desktop theme schemas differ; particular generators own named outputs only. Build declarations and remembered update state do not establish installed artifacts. | Theme consumers, sprite/token generators, staging and packaging. Follow each demonstrated producer/consumer chain; check signed/installed output separately. |

Evidence: `s2.l2.design-tui`, “Browser UI ownership, lifecycle and accessibility,” “Localization, direction and two theme systems,” “Generated products and asset provenance,” and “Storybook, design intent and verification limits”; `s2.l2.desktop-web`, “Host adapters own platform differences and copy” and “Executable staging and update state are separate evidence.”

**Instruction:** public Protocol/Server HttpApi changes require Client regeneration, not edits to generated trees; session/timeline changes require before/after production benchmarks. These obligations are change routes, not work executed here. (`AGENTS.md:1–2`; `packages/app-shell/AGENTS.md:3–4,23–28`; `apps/desktop/AGENTS.md:5–9`.)

## Verification status and remaining evidence

The tables propose focused future checks. No product test, benchmark, build, generation, browser/native/WSL/Docker/provider operation or CI ran. Root guidance assigns product tests to CI; logs remain data, and repeated noise belongs at its source. Mechanical hashes bind these artifacts only. (`AGENTS.md:156–166`; `.orchestra/skills/app-log-hygiene/SKILL.md:8–16`.)

Preserve the restart and health discrepancies, partial CSP/channel audit, startup localization conflict, uncertain native/provider outcomes, WAL/OS behavior and release/visual evidence gaps. Historical/generated status labels do not close them. (Evidence: `s2.l2.desktop-web`, “Maintenance evidence retains its original limits”; `s2.l2.app-session`, “Verification limits and ownership use”; `s2.l2.design-tui`, “Storybook, design intent and verification limits.”)
