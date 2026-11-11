# Host composition and native process infrastructure

Layer: **L1 — pinned factual basis**. Need: `component`. Scope: `orchestra.s1`.
Source revision: `1cde2ff7a71bcf7aecb5d030917b577165135d38`.

## Observed implementation

`Host.merge` validates contribution IDs, extra node names and Location additions, refusing contributions that own reserved SessionExecution, Session, LocationServiceMap or scheduler nodes. Built-in Location nodes can change only through replacements. `app-node` tags allow Location nodes to depend on global nodes and keep the converse boundary closed. Global paths use Orchestra's XDG data/cache/config/state roots; the module creates required directories at import. These are product data locations, not arbitrary cache names. [1,2,3]

`AppProcess` centralizes spawn, collected output and stream output. Optional collectors cap retained bytes while continuing to drain input and set truncation flags. Inspectors see raw chunks before capture limits. Timeouts and caller AbortSignals terminate the scoped collection path. Memory-tree caps are documented and supplied to Omni; the legacy spawner does not enforce them. Native collection is selected only for eligible commands/options, otherwise the configured spawner path runs. No universal output or timeout bound exists unless the caller supplies one. [4]

Omni loads once, accepts explicit paths only before first load, requires an addon/supervisor pair and throws when requested native components cannot load. It does not silently fall back during acquisition. Lookup checks configured paths, environment overrides, shipped binary locations and checkout targets. Its test-control predicate rejects an enabled run with no native spawn and a strict run with any delegation; reading this predicate is not running that control. Child environment assembly removes `HUGR_OMNI_*` and folds Windows variable names. [5]

PTY sessions keep a bounded retained output ring and at most 25 exited sessions. `exact:true` uses supplied environment plus terminal defaults and adds no login argument; on Windows locale defaults are also added. Attachment returns replay/cursor before live activation. A replay gap sends terminal reset plus a cleaned first-line boundary and requests repaint. Inactive subscribers accumulate pending chunks until activation; synchronous callbacks and a bounded replay ring do not establish network backpressure. Teardown stops or explicitly adopts Omni descendants, and layer finalization waits only up to seven seconds for pending stops. The maintenance skill separately records the unresolved non-reading WebSocket client memory limit. [6,7]

LSP and formatter project commands pass through ConfigTrust. LSP filters files outside active/project roots and shares in-flight launches per root/server. Workspace-code commands use confinement; trusted system commands may use the ordinary launch path. Formatter execution similarly confines workspace-code commands and limits allowed writes; logged spawn/format failure is distinct from successful formatting. Installation lookup falls back to the running version on release-query failure, so an unchanged “latest” value can reflect unavailable observation. OTLP logs/traces initialize only with a configured endpoint. [8,9,10,11]

## Normative intent and gaps

Core owns platform composition; product modules contribute through its ports. Native Rust, OS-specific spawners, PTY adapters, language servers, formatter packages and telemetry exporters remain separate implementations. No process was spawned through product code, no upgrade occurred and no native or network test ran. Source contracts about limits should be rechecked against the exact backend when runtime verification is needed.

## Source anchors

- **1.** `packages/core/src/host.ts:a0fc5bc9a36e50315b0ddddf4de3566555711250` — contribution merge and reserved nodes, lines 15–63.
- **2.** `packages/core/src/effect/app-node.ts:e8112f921ad7a7dcefbf6985c24995df1855c96b` — scope dependency tags, lines 1–14.
- **3.** `packages/core/src/global.ts:ba7790536b60c6075ff37854c4db14909b779183` — XDG data roots and overrides, lines 10–43,59–85.
- **4.** `packages/core/src/process.ts:a2c29d4a18c44ff407e6055b27830fade5d43f20` — capture, cancellation and native selection, lines 25–65,131–217,221–272,319–324.
- **5.** `packages/core/src/omni.ts:94a19789cef782806a80432c9a86f28bccbdecac` — native acquisition and control predicate, lines 25–112,139–174.
- **6.** `packages/core/src/pty.ts:fc08cb64d832f77b145c4c9702d417d7db49c14f` — retention, exact creation, replay and teardown, lines 23–39,74–108,139–197,229–329,370–423.
- **7.** `.orchestra/skills/terminal-maintenance/SKILL.md:610fa93e3ec385790509b0c7fd0181fd30adc727` — terminal ownership, invariants and WebSocket limit, lines 10–29.
- **8.** `packages/core/src/lsp/lsp.ts:7848ef568344421190171962367fe2836170d084` — trust, confinement and shared launch, lines 149–215,223–282.
- **9.** `packages/core/src/format/format.ts:0198f9c0d4aa4a9e1452339ca5c3302611478aba` — trust, command cache and confinement, lines 46–62,73–158.
- **10.** `packages/core/src/installation/service.ts:4a75cd0fdf8467866c10c692987769751edd0f42` — latest lookup and explicit upgrade commands, lines 156–196.
- **11.** `packages/core/src/observability/otlp.ts:4d403d30bded809a37d426a8c56361ca8d66ddf7` — configured OTLP startup, lines 7–18,36–76.
