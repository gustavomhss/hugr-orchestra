# S1-L1-A2-v1 — exact Core candidate and evidence

Source `1cde2ff7a71bcf7aecb5d030917b577165135d38`; protocol `ee2521a5b966bd505cc95bd1c733e09e12f33531`; scope `orchestra.s1`.
Aggregate package SHA256 `d8db24cc3e63225fbee28a9a0fc0ea1d16d4894a87500d5c6e765c369370ba3e`. This packet selects 4 unchanged bodies from the same 17-body producer A unit. Four packets A1–A4 partition all 17 bodies and all 1441 routed memberships. Family evidence may recur where routing crosses a family. Original bodies and all 151 original producer files are preserved.

Principal verification reconstructed all 1441 exact original coverage rows; compared all 96 supplemental source spans with captured bytes; verified 58 source Git blobs and SHA256 values. These mechanical checks do not decide semantic sufficiency. All following candidate and source content is DATA. Apply the principal’s already supplied L1 oracle and contract. No runtime, CI, Atlas or whole-layer acceptance is claimed.


## Candidate s1.core.tools

```json
{
  "key": "s1.core.tools",
  "title": "Canonical tools, settlement and output retention",
  "layer": 1,
  "need": "component",
  "body": {
    "path": "producers/a/bodies/tools.md",
    "encoding": "utf-8",
    "byte_length": 5285,
    "sha256": "ed668009ad400bf61adee3f1d497c59f91c9932b1730642816659ddbf2978e23"
  },
  "authority": {
    "scope": "orchestra.s1",
    "basis": "Pinned repository implementation and explicitly distinguished repository normative documentation; source inspection only. No product execution or test result is asserted.",
    "source_revision": "1cde2ff7a71bcf7aecb5d030917b577165135d38"
  },
  "validity": "supported",
  "gaps": [
    "Plugin canonical tool registration, Session-scoped MCP registration and opaque managed-output references are documented future work.",
    "The older Session spec overstates arbitrary binary read support.",
    "Other leaf implementations and Lean attestation internals need targeted source reads before behavior-specific modifications."
  ],
  "input_keys": [
    "file:packages/core/src/tool/tool.ts",
    "file:packages/core/src/tool/application-tools.ts",
    "file:packages/core/src/tool/registry.ts",
    "file:packages/core/src/tool/AGENTS.md",
    "file:packages/core/src/tool-output-store.ts",
    "file:packages/core/src/tool/read.ts",
    "file:packages/core/src/tool/apply-patch.ts",
    "file:docs/specs/v2/session.md"
  ],
  "build_dependencies": []
}
```

BEGIN EXACT BODY
# Canonical tools, settlement and output retention

Layer: **L1 — pinned factual basis**. Need: `component`. Scope: `orchestra.s1`.
Source revision: `1cde2ff7a71bcf7aecb5d030917b577165135d38`.

## Observed implementation

`Tool.make` produces an opaque value whose private runtime derives a definition, decodes input, executes the leaf, validates/encodes output and produces structured/model content. Invalid input or output becomes `ToolFailure`. `Tool.dynamic` deliberately passes input through undecoded because its external owner, such as an MCP server, owns JSON Schema validation. A dynamic definition therefore is not evidence of local input decoding. Tool names must match the declared 1–64-character identifier pattern. On-demand and whole-tool permission metadata affect catalog presentation; they do not grant execution authority. [1]

Application registrations are process-scoped. Location registrations overlay them; the latest active registration for a name wins. Scope cleanup removes only its own token. Materialization captures eligible registration identities and derived definitions. Settlement checks the current identity against the captured identity and returns a stale-call error after replacement/removal, instead of dispatching to a different tool under an old definition. It captures the selected executable at settlement start. [2,3]

`ToolRegistry` wraps canonical settlement in `ToolSafety`, inspects outputs, bounds contextual output through `ToolOutputStore`, then applies optional Lean projection only where the generic bound left the result whole. Declared typed tool failures become tool results; mixed interruption/defect causes are preserved. Failed text is bounded through the same managed-output path. Registry code does not acquire `PermissionV2.Service`; resource/action permission remains the leaf's responsibility, distinct from the registry's safety wrapper and catalog filtering. [3,4]

The output store defaults to 2,000 lines and 50 KiB of contextual text, with configuration overrides. It keeps a bounded head/tail preview and saves full contextual text under the managed `tool-output` directory when exceeded. Structured output and file parts are retained in the returned output shape; this is not a global cap on every possible payload. Retention scans delete old `tool_*` files after seven days, with an hourly globally composed cleanup layer. Managed paths remain observable in public settlement results. [5]

`read` resolves paths through `LocationMutation`, authorizes an external directory when required, inspects the target, then asks the `read` permission before content retrieval. It pages text/directories and supports JPEG/PNG/GIF/WebP attachments; other base64 binary content is rejected. Its own advertised description refuses PDFs, Office files, archives and non-UTF-8 text. The older Session spec's broad “base64 binary content” description is not the current leaf contract. [6,8]

`apply_patch` parses all hunks, rejects moves, resolves all targets, approves external directories and one `edit` batch, and preflights existing update/delete targets. Commits are sequential; updates use `writeIfUnchanged`. A later failure reports the earlier applied resources. This is intentionally not an atomic multi-file rollback API. [7]

## Normative intent and limits

The nested tool AGENTS requires one canonical representation, scoped registration, captured leaf policy and generic output bounding at settlement. It identifies plugin canonical registration and Session-scoped MCP registrations as unfinished designs, and an opaque replacement for exposed managed paths as future work. [4]

These sources establish the dispatch and representative leaf boundaries. Other tool leaves, Lean producer attestation/recall and platform-specific file mutation remain separately owned leaf detail. Producer capture loss, generic model truncation and Lean summarization are different operations; a model preview is not proof of complete original capture. No tool invocation or tool test ran here.

## Source anchors

- **1.** `packages/core/src/tool/tool.ts:2ecde42373ef59b1bf2352e6272141a610feea16` — Tool.make, dynamic, registration and metadata, lines 11–77,82–177,180–216.
- **2.** `packages/core/src/tool/application-tools.ts:1633897cd6c71cc3abdd22901829b95af2dd96aa` — process-scoped register, lines 21–57.
- **3.** `packages/core/src/tool/registry.ts:ab6a6dc2f8c993aec804ebdfc73d89885e8a1453` — settleWith and materialize, lines 90–180,243–296,314–337.
- **4.** `packages/core/src/tool/AGENTS.md:98ab3e6cc58259a418b7ab80d939295a21eeba2e` — architecture, permission/output boundaries and gaps, lines 1–63.
- **5.** `packages/core/src/tool-output-store.ts:605a99e72e0482a998e2521a26f025589f81da68` — limits, bound and retention, lines 16–59,126–140,156–238.
- **6.** `packages/core/src/tool/read.ts:1e38e74b7231691a31d2ba217267326e74189558` — advertised contract and leaf execution, lines 17–29,41–109.
- **7.** `packages/core/src/tool/apply-patch.ts:c8ba6c68abbd121db47475f17163d72c381f55f9` — preflight, permission and sequential commit, lines 93–219.
- **8.** `docs/specs/v2/session.md:e3574b87bc3b12c0eca603f96821a16ec89399fc` — earlier tool slice descriptions, lines 193–210.
END EXACT BODY


## Candidate s1.core.security

```json
{
  "key": "s1.core.security",
  "title": "Permission, tool safety, shell confinement and secret storage",
  "layer": 1,
  "need": "evidence",
  "body": {
    "path": "producers/a/bodies/security.md",
    "encoding": "utf-8",
    "byte_length": 7043,
    "sha256": "dd6e7372b2c26c8c05435db8a55dfa05cd42813a9f105f48dc8b5d702bacbbcf"
  },
  "authority": {
    "scope": "orchestra.s1",
    "basis": "Pinned repository implementation and explicitly distinguished repository normative documentation; source inspection only. No product execution or test result is asserted.",
    "source_revision": "1cde2ff7a71bcf7aecb5d030917b577165135d38"
  },
  "validity": "supported",
  "gaps": [
    "Per-Session rules are consumed differently by materialization/capability context and ordinary PermissionV2.configured; universal enforcement is not established.",
    "The Session spec contains an overbroad unsandboxed-Bash statement.",
    "Confinement and secret recognition were inspected but not exercised on any OS.",
    "Fallback credential key-file storage and readable legacy plaintext are explicit implementation limits."
  ],
  "input_keys": [
    "file:packages/core/src/permission.ts",
    "file:packages/core/src/question.ts",
    "file:packages/core/src/session/runner/llm.ts",
    "file:packages/core/src/tool-safety.ts",
    "file:packages/core/src/tool/bash.ts",
    "file:packages/core/src/tool-safety-sandbox.ts",
    "file:packages/core/src/tool/agent-terminal.ts",
    "file:packages/core/src/credential/cipher.ts",
    "file:packages/core/src/credential.ts",
    "file:docs/specs/v2/session.md",
    "file:AGENTS.md",
    "file:.orchestra/skills/session-requests-usage/SKILL.md"
  ],
  "build_dependencies": []
}
```

BEGIN EXACT BODY
# Permission, tool safety, shell confinement and secret storage

Layer: **L1 — pinned factual basis**. Need: `evidence`. Scope: `orchestra.s1`.
Source revision: `1cde2ff7a71bcf7aecb5d030917b577165135d38`.

## Observed implementation

`PermissionV2.evaluate` uses the last matching action/resource rule and defaults to `ask`. The Location-owned service resolves the selected agent; an absent resolved agent receives deny-all. A configured deny is checked before saved project allows, so a remembered allow cannot override that deny. Pending asks are in-memory Deferred values. `authorize` waits interruptibly, and cancellation publishes rejection. “Always” saves only requested save patterns for the current project. Rejecting a permission also rejects other pending permissions in the same Session. Questions have their own Location-owned pending map and reject on interruption/cleanup. [1,2]

**Do not collapse Session policy surfaces.** The runner builds agent rules plus `SessionStore.permissions` for materialization and capability context. The inspected `PermissionV2.configured` method instead returns selected-agent permissions; it does not load the Session's own rules before ordinary leaf authorization. This is an observed difference, not a claim that all Session permissions are ignored or universally enforced. A maintainer must trace the exact leaf/capability path before changing this boundary. [1,3]

`ToolSafety` provides profile-driven checks, output inspection, hooks and optional acquisition. Profile loading and native placement bind it to the current project/Location. It can constrain write roots, protected instructions/configuration, never-touch paths, explicit approval triggers, bounded corpus/transcript reads and sandbox requirements. The registry safety wrapper is additional to leaf permission; neither an advertised tool nor a recorded call substitutes for these checks. [4]

Bash resolves its workdir, requests external-directory and command permissions, runs Git safety checks and calls `ToolSafetySandbox.wrap`. Read-only seats receive a required sandbox profile with no write root and no unconfined fallback. A profile requiring confinement rejects a background process whose lifetime cannot bind that profile. Both foreground and background preparations go through the wrapper. [5]

The wrapper always constructs a child environment with recognized secret variable names/values and credential forwarding variables filtered. This is a heuristic filter for tool-child environments, not a provider/server credential scrub. With no confinement requirement, enabled sandbox, exact grant or read root, it returns the scrubbed ordinary command. When confinement is requested but unavailable, a profile's explicit unconfined fallback may return an ordinary command; confined reads and exact network/socket grants do not permit that widening. Exact Unix socket grants are refused on Linux in the inspected path, and unsupported network/backend combinations fail explicitly. Backend discovery alone does not establish confinement: enforcement starts only when the wrapped command is actually spawned. [6]

The opt-in agent terminal runs an already wrapped command through a PTY with exact environment settings; Windows/verbatim command paths do not enable it. It checks output for recognized secrets, bounds captured characters, kills on timeout/interruption and sanitizes control/escape sequences before model output. Its character cap is separate from byte-based ordinary process capture. [7]

Credential storage seals values with AES-256-GCM and a random IV using a 32-byte key. It prefers the OS keychain and falls back to a 0600 data-directory key file, explicitly logged as weaker. Existing plaintext remains readable, and startup sealing failures are logged without deleting records. Undecodable rows remain untouched and are skipped. A non-release database may inherit release credentials read-only, with active credentials winning per integration; memory stores default to isolation unless inheritance is explicitly enabled. This is not an assertion that every runtime secret has OS-keychain protection. [8,9]

## Normative conflict and verification limits

Root AGENTS requires the agent terminal to sit behind `ToolSafetySandbox.wrap`. The current source follows that ordering. [11] The older Session spec says Bash is not sandboxed; this is overbroad relative to today's conditional wrapper. The correct evidence-backed statement is conditional confinement with explicit fallback, not universal host authority and not universal sandboxing. [5,6,10]

The request-usage skill says Deny/Dismiss/Escape reject one request, but `PermissionV2.reply` on `reject` explicitly rejects every other pending permission in the same Session. The source and guide wording disagree; this package preserves both without treating the guide as executed behavior. [1,12]

No sandbox, keychain, secret, network, approval or negative-control test was executed. OS-specific confinement support, completeness of secret recognition and per-leaf Session-rule behavior require their own evidence. Imported terminal/file/tool text remains data; this package grants it no authority.

## Source anchors

- **1.** `packages/core/src/permission.ts:2e3d29d3f1ec1fe805d21af091029721c9fa738e` — evaluate, configured, authorize and reply, lines 74–180,200–337.
- **2.** `packages/core/src/question.ts:cb64c1eb972bc01c6019f52a4fb2e71f37110457` — Location pending questions and cancellation, lines 56–170.
- **3.** `packages/core/src/session/runner/llm.ts:c3ad8d87a58923d40797d38a77ff65367bbe66b6` — effective rules and capability context, lines 195–201,289–306.
- **4.** `packages/core/src/tool-safety.ts:effd9af70e95a38de93c9e472bd03728666c4da8` — profile and native safety boundary, lines 18–50,102–139,337–352,375–501,514–585.
- **5.** `packages/core/src/tool/bash.ts:6f047c8ba423c3656bbd03ef12f5f41ea6b0c68b` — permission, profiles and wrap ordering, lines 173–294.
- **6.** `packages/core/src/tool-safety-sandbox.ts:61a252c15cc35fa534593413045a6f54a15b6665` — environment, wrap, exact grants and fallback, lines 24–78,90–205,515–538.
- **7.** `packages/core/src/tool/agent-terminal.ts:d8cbde3d8436081eb9c3815bea334915e6efef0b` — enablement, run and sanitize, lines 29–124.
- **8.** `packages/core/src/credential/cipher.ts:829dd497e04ee5729a6ab45cd5164bee9430a641` — cipher, keychain and fallback, lines 10–37,57–86,107–155.
- **9.** `packages/core/src/credential.ts:3161ca0d7f1e4c68a372acb97234eab80a9024b2` — inheritance, legacy sealing and unreadable rows, lines 54–106,108–226.
- **10.** `docs/specs/v2/session.md:e3574b87bc3b12c0eca603f96821a16ec89399fc` — older Bash description, lines 204–206.
- **11.** `AGENTS.md:ef3b523b0c00aed722582b870c1919188edc4c4f` — current terminal invariants, lines 182–192.
- **12.** `.orchestra/skills/session-requests-usage/SKILL.md:681da4ff9bd3ae17e8181a7d5ed588aa33d4e1e3` — per-request rejection description, lines 15–26.
END EXACT BODY


## Candidate s1.core.capability

```json
{
  "key": "s1.core.capability",
  "title": "Native capability identity, policy and leaf registration",
  "layer": 1,
  "need": "component",
  "body": {
    "path": "producers/a/bodies/capability.md",
    "encoding": "utf-8",
    "byte_length": 4469,
    "sha256": "a5d40d013b3976a612a53acb7999ea498c32c71bff5f7acb276f1ddc3be95e7a"
  },
  "authority": {
    "scope": "orchestra.s1",
    "basis": "Pinned repository implementation and explicitly distinguished repository normative documentation; source inspection only. No product execution or test result is asserted.",
    "source_revision": "1cde2ff7a71bcf7aecb5d030917b577165135d38"
  },
  "validity": "supported",
  "gaps": [
    "Leaf capability behavior is represented by the actual invocation/policy/registration boundary; vendor and leaf-specific algorithms need deeper reads when consumed.",
    "Native MCP transport bounds and mutation ambiguity are documented contract, not a newly executed protocol qualification."
  ],
  "input_keys": [
    "file:packages/core/src/capability/invocation.ts",
    "file:packages/core/src/capability/policy.ts",
    "file:packages/core/src/capability/tools.ts",
    "file:packages/core/src/scheduled-task/port.ts",
    "file:packages/core/src/capability/mcp/README.md",
    "file:docs/guides/artifacts-and-processes.md"
  ],
  "build_dependencies": []
}
```

BEGIN EXACT BODY
# Native capability identity, policy and leaf registration

Layer: **L1 — pinned factual basis**. Need: `component`. Scope: `orchestra.s1`.
Source revision: `1cde2ff7a71bcf7aecb5d030917b577165135d38`.

## Observed implementation

Capability host authority is an issued Context frame, not model-supplied JSON. `withContext` validates matching owner/invocation Session and agent IDs, freezes identity and captured rules, and marks the frame with a private Symbol. It explicitly does not establish persisted Session/tool-part existence. Child frames additionally require an exact parent context, deterministic child ID, ordinal 1–64, maximum lineage depth 8 and a 64-character request hash. `require` checks current tool invocation and exact project/directory/workspace placement. [1]

`CapabilityPolicy` supplies the persistence check: the Session must still occupy that project/Location, and the root assistant message must still contain the named pending/running tool part for the same agent. Each child proof must match a running child SQL row and every lineage field. Native captured deny rules are a restrict-only floor; later allow/ask rules cannot erase one. Authorization rechecks the binding and current configured permission after any approval. [2]

Permits are frozen objects issued into a private WeakSet. `commitMany` accepts at most 16 permits sharing the same binding, refuses an existing ambient SQL transaction, holds the agent's materialized permission state, starts an immediate database transaction, verifies the same current frame and persisted invocation again, and rechecks current denies before the write callback. Approval occurs before these locks. The guarantee here concerns this native capability boundary; it must not be generalized to every arbitrary plugin/tool. [2]

The Location capability node creates connections/jobs/artifacts/channels/media/document/sheet/service/process/schedule leaves and registers their canonical names once. Vendor resolution and I/O are deliberately first-use. A startup process sweep records stale ownership using the current host registry; a non-interruption sweep failure is logged so Location startup can continue. Schedule management reaches the host scheduler through a separate process-bound port; an unbound scheduler defects explicitly. [3,4]

## Normative intent and limits

The native Streamable HTTP MCP README assigns transport only `listTools` and scoped `open/callTool`. Approved endpoint and exact credential come from the caller. Its stated contract bounds catalogs, requests, responses and session generations; it deliberately omits retry, resumability, OAuth discovery and server-triggered model/tool execution. It requires ambiguous remote mutations to retain `outcome_unknown`: abort/DELETE does not prove nonexecution. These are the transport owner's documented constraints, not fresh runtime verification by this producer. The ordinary SDK-backed MCP service in `s1.core.extensions` is a different surface. [5]

The artifact/process guide explicitly presents artifact content verification and latest-observed process state as limited evidence. This matches why registration or a “running” record must not be reported as verified content or current remote liveness. Leaf artifact revision, sharing, vendor schema validation and process cancellation rules are outside the inspected policy module; the inventory retains those sources for deeper consumption. No native capability operation or vendor call was executed. [6]

## Source anchors

- **1.** `packages/core/src/capability/invocation.ts:e2ddcb3e3f0da61b8d9d5fe8c7c74436b844e890` — issued root/child frames and require, lines 12–141.
- **2.** `packages/core/src/capability/policy.ts:d75718a6ac8d6d3e36c5b791301a68a728be26b0` — validate, authorize, commitMany, lines 35–170.
- **3.** `packages/core/src/capability/tools.ts:1103ab0c8eb3d9d79cc5ff295cb267847eab629e` — canonical Location leaf registration and process sweep, lines 36–68.
- **4.** `packages/core/src/scheduled-task/port.ts:8ea347436e18a93f8dc43926c7fb84108fc0a20c` — scheduler binding port, lines 7–40.
- **5.** `packages/core/src/capability/mcp/README.md:95f3154aef1625eaac3cd8feb500504996eb074f` — native transport contract and deliberate limits, lines 3–9,29–37,43–126.
- **6.** `docs/guides/artifacts-and-processes.md:b9e9c90310318f99a1efaa3ae2952026796364c4` — verification status and observed process state, lines 7–31,33–51.
END EXACT BODY


## Candidate s1.core.extensions

```json
{
  "key": "s1.core.extensions",
  "title": "Plugin, integration, MCP and skill lifetimes",
  "layer": 1,
  "need": "component",
  "body": {
    "path": "producers/a/bodies/extensions.md",
    "encoding": "utf-8",
    "byte_length": 4994,
    "sha256": "1adfea6dc88bb969fb2c9232c82b81ae917e8112a9d0993273733450891984d4"
  },
  "authority": {
    "scope": "orchestra.s1",
    "basis": "Pinned repository implementation and explicitly distinguished repository normative documentation; source inspection only. No product execution or test result is asserted.",
    "source_revision": "1cde2ff7a71bcf7aecb5d030917b577165135d38"
  },
  "validity": "supported",
  "gaps": [
    "Individual plugin/provider/OAuth implementations and live MCP operation were not exercised.",
    "OAuth attempts and plugin activations are scoped in-memory state, not durable resumable workflows."
  ],
  "input_keys": [
    "file:packages/core/src/state.ts",
    "file:packages/core/src/plugin.ts",
    "file:packages/core/src/integration.ts",
    "file:packages/core/src/mcp.ts",
    "file:packages/core/src/skill.ts",
    "file:packages/core/src/agent.ts",
    "file:packages/core/src/plugin/README.md"
  ],
  "build_dependencies": []
}
```

BEGIN EXACT BODY
# Plugin, integration, MCP and skill lifetimes

Layer: **L1 — pinned factual basis**. Need: `component`. Scope: `orchestra.s1`.
Source revision: `1cde2ff7a71bcf7aecb5d030917b577165135d38`.

## Observed implementation

`State.create` rebuilds each materialized value from its initial state and ordered active transforms. It commits only after optional finalization. A semaphore serializes rebuilds and effectful `withRead` consumers. Disposing a scoped transform removes it and rebuilds; `State.batch` collects reloads until the enclosing effect succeeds. This is in-memory materialization, not a durable transaction. [1]

`PluginV2` owns Location-lifetime scopes and per-ID locks. `ensure` preserves an existing activation; install executes the plugin effect inside a child scope, materializes registrations, then publishes `Added`. Failure closes the scope and replays state while preserving combined failure causes. Boot tries one collected flush, then removes and reinstalls the batch one-by-one if that flush fails. Active ancestry detects own load cycles; a live nested request for another loading target fails `PLUGIN_DEPENDENCY_BLOCKED`. Its own comment explicitly rejects interpreting this as a general dependency-cycle proof or outer-batch atomicity. [2]

Integration definitions are scoped State transforms; connection views combine saved credentials in reverse storage order with available environment methods. `active` chooses the first. Resolving an environment connection reads its variable on demand. OAuth attempts live in an in-memory synchronized map with child scopes, expiry and retained terminal status. Successful settlement stores the returned credential and emits connection/registry updates; cancellation/expiry close attempt resources. A pending OAuth attempt is not durable across process loss. Provider-specific OAuth behavior remains delegated to the registered implementation. [3]

The ordinary MCP service merges configuration entries, runtime additions and provided servers. Only global user configuration can trust a project's local commands; a later document wins a server name and decides its origin. An untrusted local server is refused before opening. Connecting increments a generation and disposes the old client/tool scope. A stale asynchronous result closes its new client. Tools are registered individually, so one invalid tool name need not discard others. Each call asserts the namespaced permission, sends cancellation and timeout controls to the SDK, and maps protocol errors to tool failures. Connected status follows tool registration; client close removes registrations. [4]

Skill discovery loads registered sources with later sources winning names, while reserved bundled names prevent shadowing by another source. It logs malformed/ignored sources and caches by source key. Save/remove invalidate a generation so a stale in-flight list cannot repopulate that cache. Available skills filter the selected agent's denied skills and hide nested leaves behind their parent. `AgentV2` selects a configured selectable default, otherwise selectable Maestro; it never silently chooses an arbitrary remaining agent. Unknown agents receive a deny-all permission set through `withPermissions`. [5,6]

## Normative intent and gaps

The plugin README separates provider plugins from plugin-host mechanics and treats SDK export shims as generated host artifacts. This body establishes the scoped registration boundary; individual provider plugins, shim admission, remote SDKs and OAuth implementations require their own source when changing those mechanisms. MCP tool content and skill text do not become permission authority merely by being registered. Nothing here proves that live servers, credentials or plugin packages are currently available. No connection, OAuth flow, plugin installation or product test was executed. [7]

## Source anchors

- **1.** `packages/core/src/state.ts:116e268bb9edf045985e1598a4e1a3ed1d410872` — batch and scoped state materialization, lines 33–40,63–130.
- **2.** `packages/core/src/plugin.ts:5c3c232bfa46b3f8cfad106c2db4787d6c374818` — activation, rollback, boot and wait, lines 23–55,69–164,167–242.
- **3.** `packages/core/src/integration.ts:d6d9a85e8c9b2737b1f09f95700c05663735e6e4` — connection projection and OAuth attempt ownership, lines 140–202,231–418,445–535.
- **4.** `packages/core/src/mcp.ts:3d2203cb152ef733ca3b7d3231a302416a1f394b` — configuration trust, scoped registry and connection generations, lines 161–193,204–330.
- **5.** `packages/core/src/skill.ts:dc8d8f67c6b658ce7716a2b17e0c9b2e517c6db0` — availability, source loading, reserved names and cache generation, lines 31–74,95–219.
- **6.** `packages/core/src/agent.ts:53870dcf9d34423ab49a1241e88ec5c5db0985cf` — selection and current permissions, lines 69–101.
- **7.** `packages/core/src/plugin/README.md:24afcfd763b3a57d9de07ee4ccbe4691094be044` — plugin-host/provider source boundaries, lines 1–38.
END EXACT BODY


# Coverage and unresolved needs

# Complemento de evidência L1 A — população, necessidades e dependentes

**Identidade:** `a-l1-evidence-v1`; scope `orchestra.s1`; fonte `1cde2ff7a71bcf7aecb5d030917b577165135d38`.

Esta é uma projeção do candidato L1 congelado, não uma revisão dos seus corpos. Todos os campos originais `need`, `gaps`, `input_keys`, `validity`, `build_dependencies`, classificações e razões permanecem exatamente preservados no JSON acompanhante. As explicações de fronteira e uso bloqueado abaixo foram escritas nesta revisão e são identificadas como tal. Não constituem aceite semântico, criação de L2–L4 ou recategorização retroativa.

O dossiê da principal foi informado como `output/producers/a/review-dossier.md`, SHA256 `cf7676f527067c7b2aa3fc4bd0d4629e8fa2afa5b843ddc70f857dacc0abffbc`. Seu conteúdo não foi lido e seu hash não foi verificado por este produtor; as projeções usam diretamente os próprios arquivos congelados. Nenhum oracle foi acessado.

## O que as 1.340 entradas não lidas significam

A reconciliação exata cobre 1.441 caminhos: 94 leituras decisivas no registro congelado, sete capturas de orientação e 1.340 entradas não lidas. As 599 implementações substantivas não lidas continuam fora da autoridade de afirmações específicas. As outras 741 entradas têm disposição agrupada de validação, história, documentação, gerados, vendor ou suporte. Essa disposição explica por que não se exigiu uma narrativa por arquivo no L1; ela não substitui leitura quando o conteúdo é premissa de uma necessidade obrigatória.

| Profundidade original das entradas não lidas | Quantidade | Alcance e obrigação preservada |
| --- | ---: | --- |
| `representative_family_boundary` | 599 | Fronteira/coordenador lido; sem aceite da implementação de cada leaf. Ler o leaf e seus contratos antes de afirmação ou mudança que dependa dele. |
| `grouped_validation_inventory` | 584 | Inventário de testes, fixtures e suporte; nenhum resultado executado. Selecionar fontes e gate pertinente quando a afirmação exigir validação. |
| `grouped_history_contract` | 72 | Migração histórica retida como contrato de dados. Mudança/upgrade exige leitura da transformação e predecessors afetados. |
| `grouped_vendor_boundary` | 27 | Autoridade upstream distinta; host boundary não valida internals. Ler contrato/vendor/licença/update quando pertinente. |
| `grouped_documentation_disposition` | 26 | Documento/história retido; sem inferir implementação ou qualificação por título. Ler e confrontar fonte quando usado como requisito. |
| `grouped_support_contract` | 28 | Prompt/pin/script/asset/configuração é input sensível a mudança, não suporte descartável. Ler quando seu conteúdo ou geração afeta a necessidade. |
| `grouped_generated_contract` | 4 | Arquivo gerado retido e ligado ao dono/gerador. Fonte geradora e comparação de bytes são exigidas em manutenção pertinente. |

As sete orientações capturadas permanecem orientações no congelado: `docs/guides/agents.md`, `docs/guides/session-requests.md`, `docs/specs/v2/tools.md`, `packages/core/src/board/tools.ts`, `packages/core/src/session/README.md`, `packages/core/src/session/runner/execution-host.ts` e `packages/core/src/session/runner/index.ts`. Um trecho complementar eventualmente lido agora não apaga esse estado histórico.

**Lacuna obrigatória:** se uma pergunta L1 exigida depende de um leaf não lido, a lacuna permanece aberta nesse ponto. Não se presume que o requisito possa ser adiado por conveniência. O mesmo vale para a família util, sem fonte própria lida, e para documentos históricos ainda não confrontados. A suficiência do conjunto continua sujeita aos dois juízes da principal.


### `s1.core.tools` — `component`

Corpo congelado: `bodies/tools.md`, SHA256 `ed668009ad400bf61adee3f1d497c59f91c9932b1730642816659ddbf2978e23`. Validade original: `supported`.

**Gaps originais, verbatim:**

- Plugin canonical tool registration, Session-scoped MCP registration and opaque managed-output references are documented future work.
- The older Session spec overstates arbitrary binary read support.
- Other leaf implementations and Lean attestation internals need targeted source reads before behavior-specific modifications.

**Inputs originais:** `file:packages/core/src/tool/tool.ts`, `file:packages/core/src/tool/application-tools.ts`, `file:packages/core/src/tool/registry.ts`, `file:packages/core/src/tool/AGENTS.md`, `file:packages/core/src/tool-output-store.ts`, `file:packages/core/src/tool/read.ts`, `file:packages/core/src/tool/apply-patch.ts`, `file:docs/specs/v2/session.md`.

**Explicitação nova nesta revisão:** Representação canônica, identidade capturada, settlement e limites de output. Outra folha, Lean, output/atestado e plataforma de mutação exigem leitura; os designs futuros do AGENTS não são comportamento disponível.

**Uso dependente bloqueado:** Claims sobre cada tool, rollback multi-file, input validation dinâmica ou cap total de mídia ficam bloqueados; a fronteira de registry não os prova.


### `s1.core.security` — `evidence`

Corpo congelado: `bodies/security.md`, SHA256 `dd6e7372b2c26c8c05435db8a55dfa05cd42813a9f105f48dc8b5d702bacbbcf`. Validade original: `supported`.

**Gaps originais, verbatim:**

- Per-Session rules are consumed differently by materialization/capability context and ordinary PermissionV2.configured; universal enforcement is not established.
- The Session spec contains an overbroad unsandboxed-Bash statement.
- Confinement and secret recognition were inspected but not exercised on any OS.
- Fallback credential key-file storage and readable legacy plaintext are explicit implementation limits.

**Inputs originais:** `file:packages/core/src/permission.ts`, `file:packages/core/src/question.ts`, `file:packages/core/src/session/runner/llm.ts`, `file:packages/core/src/tool-safety.ts`, `file:packages/core/src/tool/bash.ts`, `file:packages/core/src/tool-safety-sandbox.ts`, `file:packages/core/src/tool/agent-terminal.ts`, `file:packages/core/src/credential/cipher.ts`, `file:packages/core/src/credential.ts`, `file:docs/specs/v2/session.md`, `file:AGENTS.md`, `file:.orchestra/skills/session-requests-usage/SKILL.md`.

**Explicitação nova nesta revisão:** Permissões, regra da Session por caminho, sandbox condicional e segredos. Rastrear o leaf antes de afirmar aplicação de Session rules; manter conflitos com docs; backend/OS e secret recognition precisam de prova específica.

**Uso dependente bloqueado:** Enforcamento universal, sandbox universal, proteção keychain universal e rejeição individual uniforme permanecem bloqueados.


### `s1.core.capability` — `component`

Corpo congelado: `bodies/capability.md`, SHA256 `a5d40d013b3976a612a53acb7999ea498c32c71bff5f7acb276f1ddc3be95e7a`. Validade original: `supported`.

**Gaps originais, verbatim:**

- Leaf capability behavior is represented by the actual invocation/policy/registration boundary; vendor and leaf-specific algorithms need deeper reads when consumed.
- Native MCP transport bounds and mutation ambiguity are documented contract, not a newly executed protocol qualification.

**Inputs originais:** `file:packages/core/src/capability/invocation.ts`, `file:packages/core/src/capability/policy.ts`, `file:packages/core/src/capability/tools.ts`, `file:packages/core/src/scheduled-task/port.ts`, `file:packages/core/src/capability/mcp/README.md`, `file:docs/guides/artifacts-and-processes.md`.

**Explicitação nova nesta revisão:** Frame emitido, autorização persistida e commit de permit nativo. Ler a operação e vendor exatos; o README MCP é contrato normativo e não prova código de limites/qualificação executada.

**Uso dependente bloqueado:** Uso remoto que conclua nonexecution após abort ou autoridade inferida do JSON/registro fica bloqueado; semântica de cada leaf permanece obrigatória.


### `s1.core.extensions` — `component`

Corpo congelado: `bodies/extensions.md`, SHA256 `1adfea6dc88bb969fb2c9232c82b81ae917e8112a9d0993273733450891984d4`. Validade original: `supported`.

**Gaps originais, verbatim:**

- Individual plugin/provider/OAuth implementations and live MCP operation were not exercised.
- OAuth attempts and plugin activations are scoped in-memory state, not durable resumable workflows.

**Inputs originais:** `file:packages/core/src/state.ts`, `file:packages/core/src/plugin.ts`, `file:packages/core/src/integration.ts`, `file:packages/core/src/mcp.ts`, `file:packages/core/src/skill.ts`, `file:packages/core/src/agent.ts`, `file:packages/core/src/plugin/README.md`.

**Explicitação nova nesta revisão:** Lifecycle in-memory de State/plugin/integration/MCP/skills. Ler provider/plugin/OAuth específico e obter evidência de operação quando necessária; tentativas OAuth/ativação não sobrevivem por contrato ao processo.

**Uso dependente bloqueado:** Resumabilidade durável, disponibilidade live de MCP e compatibilidade de todo plugin ficam bloqueadas.



## Family dispositions relevant to this batch

The exact family counts below refer to the original whole family; the membership groups further below partition only this packet’s assigned keys.

### agent — 10 entradas

**Profundidades originais:** `decisive_source_read`=1, `grouped_support_contract`=6, `grouped_validation_inventory`=1, `orientation_read`=1, `representative_family_boundary`=1.

**Read status original:** `captured_targeted_orientation_only`=1, `not_read`=8, `semantically_read_decisive_ranges`=1.

**Rota original:** `s1.core.extensions`. **Artefatos que de fato citam fontes da família:** `s1.core.extensions`.

**Fontes decisivas listadas no original:** `packages/core/src/agent.ts`.

**Razões originais aplicáveis:** R008, R027, R040, R073, R102.

**Alcance sustentado (explicitação):** A seleção de agente e o fallback deny-all estão observados em agent.ts. O guia de agentes é somente orientação capturada no congelado.

**Obrigação/lacuna retida (explicitação):** Prompts empacotados, composição do agente e o guia não são automaticamente instruções de runtime aceitas. Mudança de agente, seleção ou prompt exige ler os membros exatos e seu carregamento.


### capability — 170 entradas

**Profundidades originais:** `decisive_source_read`=5, `grouped_documentation_disposition`=2, `grouped_support_contract`=1, `grouped_validation_inventory`=73, `representative_family_boundary`=89.

**Read status original:** `not_read`=165, `semantically_read_decisive_ranges`=5.

**Rota original:** `s1.core.capability`. **Artefatos que de fato citam fontes da família:** `s1.core.capability`.

**Fontes decisivas listadas no original:** `docs/guides/artifacts-and-processes.md`, `packages/core/src/capability/invocation.ts`, `packages/core/src/capability/mcp/README.md`, `packages/core/src/capability/policy.ts`, `packages/core/src/capability/tools.ts`.

**Razões originais aplicáveis:** R003, R032, R043, R076, R104.

**Alcance sustentado (explicitação):** Frames emitidos, revalidação persistida e commit de permits sustentam a fronteira de autoridade nativa. Registro de nomes não prova comportamento de cada leaf.

**Obrigação/lacuna retida (explicitação):** Os 89 leaves não lidos retêm obrigações de compartilhamento, conteúdo, vendor schemas, processos e demais operações. O README de MCP sustenta intenção normativa; prova da implementação de limites do transporte requer seu código.


### identity — 15 entradas

**Profundidades originais:** `decisive_source_read`=3, `grouped_validation_inventory`=5, `representative_family_boundary`=7.

**Read status original:** `not_read`=12, `semantically_read_decisive_ranges`=3.

**Rota original:** `s1.core.extensions`, `s1.core.security`. **Artefatos que de fato citam fontes da família:** `s1.core.extensions`, `s1.core.security`.

**Fontes decisivas listadas no original:** `packages/core/src/credential.ts`, `packages/core/src/credential/cipher.ts`, `packages/core/src/integration.ts`.

**Razões originais aplicáveis:** R008, R015, R049, R050, R082.

**Alcance sustentado (explicitação):** credential/cipher/integration sustentam armazenamento, fallback, herança e ciclo de conexão observado.

**Obrigação/lacuna retida (explicitação):** Account, integração específica, OAuth page, share e credential SQL permanecem leaves próprios. Criptografia do valor não prova todo fluxo de login nem que todo segredo passa pela mesma proteção.


### instruction — 21 entradas

**Profundidades originais:** `decisive_source_read`=1, `grouped_documentation_disposition`=1, `grouped_validation_inventory`=11, `representative_family_boundary`=8.

**Read status original:** `not_read`=20, `semantically_read_decisive_ranges`=1.

**Rota original:** `s1.core.extensions`. **Artefatos que de fato citam fontes da família:** `s1.core.extensions`.

**Fontes decisivas listadas no original:** `packages/core/src/skill.ts`.

**Razões originais aplicáveis:** R008, R034, R051, R083.

**Alcance sustentado (explicitação):** skill.ts sustenta nomes reservados, descoberta, permissões e invalidação do cache. O consumo de instruções tem evidência separada em context.

**Obrigação/lacuna retida (explicitação):** O documento não lido e os oito leaves não lidos retêm obrigações de autoria/carga/visibilidade. Texto de skill não se torna autoridade executável por registro.


### permission — 9 entradas

**Profundidades originais:** `decisive_source_read`=3, `grouped_validation_inventory`=3, `orientation_read`=1, `representative_family_boundary`=2.

**Read status original:** `captured_targeted_orientation_only`=1, `not_read`=5, `semantically_read_decisive_ranges`=3.

**Rota original:** `s1.core.security`. **Artefatos que de fato citam fontes da família:** `s1.core.security`.

**Fontes decisivas listadas no original:** `.orchestra/skills/session-requests-usage/SKILL.md`, `packages/core/src/permission.ts`, `packages/core/src/question.ts`.

**Razões originais aplicáveis:** R015, R028, R053, R085.

**Alcance sustentado (explicitação):** O serviço e question.ts, junto ao skill de uso, sustentam avaliação, pending maps e o conflito preservado entre rejeição individual descrita e fan-out implementado.

**Obrigação/lacuna retida (explicitação):** Os dois leaves não lidos e o guia somente orientado permanecem necessários para seus detalhes. A diferença Session rules/materialization versus configured impede afirmar enforcamento universal sem rastrear o leaf.


### plugin-host — 63 entradas

**Profundidades originais:** `decisive_source_read`=2, `grouped_documentation_disposition`=1, `grouped_support_contract`=2, `grouped_validation_inventory`=46, `representative_family_boundary`=12.

**Read status original:** `not_read`=61, `semantically_read_decisive_ranges`=2.

**Rota original:** `s1.core.extensions`. **Artefatos que de fato citam fontes da família:** `s1.core.extensions`.

**Fontes decisivas listadas no original:** `packages/core/src/plugin.ts`, `packages/core/src/plugin/README.md`.

**Razões originais aplicáveis:** R008, R035, R054, R086, R106.

**Alcance sustentado (explicitação):** Plugin e README, com State de runtime, sustentam escopos, rebuild, rollback local e limites de ciclo/batch.

**Obrigação/lacuna retida (explicitação):** Doze implementações, documento e suporte não lidos incluem fronteiras SDK/host e carregamento. Ativação em memória não prova durability, compatibilidade de cada plugin ou ordem global atômica.


### tool — 114 entradas

**Profundidades originais:** `decisive_source_read`=11, `grouped_documentation_disposition`=2, `grouped_support_contract`=4, `grouped_validation_inventory`=43, `orientation_read`=1, `representative_family_boundary`=53.

**Read status original:** `captured_targeted_orientation_only`=1, `not_read`=102, `semantically_read_decisive_ranges`=11.

**Rota original:** `s1.core.extensions`, `s1.core.runtime`, `s1.core.tools`. **Artefatos que de fato citam fontes da família:** `s1.core.extensions`, `s1.core.runtime`, `s1.core.security`, `s1.core.tools`.

**Fontes decisivas listadas no original:** `packages/core/src/lsp/lsp.ts`, `packages/core/src/mcp.ts`, `packages/core/src/tool-output-store.ts`, `packages/core/src/tool/AGENTS.md`, `packages/core/src/tool/agent-terminal.ts`, `packages/core/src/tool/application-tools.ts`, `packages/core/src/tool/apply-patch.ts`, `packages/core/src/tool/bash.ts`, `packages/core/src/tool/read.ts`, `packages/core/src/tool/registry.ts`, `packages/core/src/tool/tool.ts`.

**Razões originais aplicáveis:** R008, R014, R015, R021, R030, R038, R067, R068, R069, R097, R109.

**Alcance sustentado (explicitação):** Tool/registry/output e folhas representativas sustentam identidade, settlement, permissões locais, output e o contraste do read. MCP/LSP/terminal são usados por outros artefatos.

**Obrigação/lacuna retida (explicitação):** 53 leaves não lidos, orientação do spec, docs e suporte não validam cada ferramenta. Lean/attestation, outras mutações, parsing e payloads devem ser lidos antes de prometer esse comportamento; caminhos de output continuam expostos.


### tool-safety — 36 entradas

**Profundidades originais:** `decisive_source_read`=2, `grouped_validation_inventory`=22, `representative_family_boundary`=12.

**Read status original:** `not_read`=34, `semantically_read_decisive_ranges`=2.

**Rota original:** `s1.core.security`. **Artefatos que de fato citam fontes da família:** `s1.core.security`.

**Fontes decisivas listadas no original:** `packages/core/src/tool-safety-sandbox.ts`, `packages/core/src/tool-safety.ts`.

**Razões originais aplicáveis:** R015, R070, R096.

**Alcance sustentado (explicitação):** Safety e sandbox sustentam checks, scrub heurístico, wrapper e recusa/fallback condicionais; bash é evidência da chamada após permissões.

**Obrigação/lacuna retida (explicitação):** Doze leaves não lidos de perfis/backends/recognizers retêm obrigações específicas. Confinamento efetivo e completude de reconhecimento de segredo exigem qualificação; wrapper descoberto não equivale a processo confinado observado.



## Exact original justification dictionary used in this batch


**R003**: Captured pinned bytes and inspected cited definitions/control flow used by s1.core.capability; conclusions are limited to these source ranges and explicit normative sections.


**R008**: Captured pinned bytes and inspected cited definitions/control flow used by s1.core.extensions; conclusions are limited to these source ranges and explicit normative sections.


**R015**: Captured pinned bytes and inspected cited definitions/control flow used by s1.core.security; conclusions are limited to these source ranges and explicit normative sections.


**R021**: Captured pinned bytes and inspected cited definitions/control flow used by s1.core.tools; conclusions are limited to these source ranges and explicit normative sections.


**R027**: Pinned bytes captured; orientation/header inspection does not authorize leaf-specific behavior claims. Family boundary is documented in s1.core.extensions; deeper source read required before operational use of this file.


**R028**: Pinned bytes captured; orientation/header inspection does not authorize leaf-specific behavior claims. Family boundary is documented in s1.core.security; deeper source read required before operational use of this file.


**R030**: Pinned bytes captured; orientation/header inspection does not authorize leaf-specific behavior claims. Family boundary is documented in s1.core.tools; deeper source read required before operational use of this file.


**R032**: Repository document retained with capability family; no current implementation or executed qualification is inferred from its filename/status. Consult alongside s1.core.capability before relying on historical intent or a specific guide requirement.


**R034**: Repository document retained with instruction family; no current implementation or executed qualification is inferred from its filename/status. Consult alongside s1.core.extensions before relying on historical intent or a specific guide requirement.


**R035**: Repository document retained with plugin-host family; no current implementation or executed qualification is inferred from its filename/status. Consult alongside s1.core.extensions before relying on historical intent or a specific guide requirement.


**R038**: Repository document retained with tool family; no current implementation or executed qualification is inferred from its filename/status. Consult alongside s1.core.tools before relying on historical intent or a specific guide requirement.


**R040**: Substantive agent leaf, not discarded as support. The coherent family entry/authority/lifecycle boundary is sourced in s1.core.extensions; this individual implementation is not semantically accepted and needs deeper reading for leaf-specific claims or changes.


**R043**: Substantive capability leaf, not discarded as support. The coherent family entry/authority/lifecycle boundary is sourced in s1.core.capability; this individual implementation is not semantically accepted and needs deeper reading for leaf-specific claims or changes.


**R049**: Substantive identity leaf, not discarded as support. The coherent family entry/authority/lifecycle boundary is sourced in s1.core.extensions; this individual implementation is not semantically accepted and needs deeper reading for leaf-specific claims or changes.


**R050**: Substantive identity leaf, not discarded as support. The coherent family entry/authority/lifecycle boundary is sourced in s1.core.security; this individual implementation is not semantically accepted and needs deeper reading for leaf-specific claims or changes.


**R051**: Substantive instruction leaf, not discarded as support. The coherent family entry/authority/lifecycle boundary is sourced in s1.core.extensions; this individual implementation is not semantically accepted and needs deeper reading for leaf-specific claims or changes.


**R053**: Substantive permission leaf, not discarded as support. The coherent family entry/authority/lifecycle boundary is sourced in s1.core.security; this individual implementation is not semantically accepted and needs deeper reading for leaf-specific claims or changes.


**R054**: Substantive plugin-host leaf, not discarded as support. The coherent family entry/authority/lifecycle boundary is sourced in s1.core.extensions; this individual implementation is not semantically accepted and needs deeper reading for leaf-specific claims or changes.


**R067**: Substantive tool leaf, not discarded as support. The coherent family entry/authority/lifecycle boundary is sourced in s1.core.extensions; this individual implementation is not semantically accepted and needs deeper reading for leaf-specific claims or changes.


**R069**: Substantive tool leaf, not discarded as support. The coherent family entry/authority/lifecycle boundary is sourced in s1.core.tools; this individual implementation is not semantically accepted and needs deeper reading for leaf-specific claims or changes.


**R070**: Substantive tool-safety leaf, not discarded as support. The coherent family entry/authority/lifecycle boundary is sourced in s1.core.security; this individual implementation is not semantically accepted and needs deeper reading for leaf-specific claims or changes.


**R073**: Validation/fixture population is retained under agent; grouped at L1 because no executed result is inferred from test existence. Select exact tests only when a behavior change or runtime gate requires them.


**R076**: Validation/fixture population is retained under capability; grouped at L1 because no executed result is inferred from test existence. Select exact tests only when a behavior change or runtime gate requires them.


**R082**: Validation/fixture population is retained under identity; grouped at L1 because no executed result is inferred from test existence. Select exact tests only when a behavior change or runtime gate requires them.


**R083**: Validation/fixture population is retained under instruction; grouped at L1 because no executed result is inferred from test existence. Select exact tests only when a behavior change or runtime gate requires them.


**R085**: Validation/fixture population is retained under permission; grouped at L1 because no executed result is inferred from test existence. Select exact tests only when a behavior change or runtime gate requires them.


**R086**: Validation/fixture population is retained under plugin-host; grouped at L1 because no executed result is inferred from test existence. Select exact tests only when a behavior change or runtime gate requires them.


**R096**: Validation/fixture population is retained under tool-safety; grouped at L1 because no executed result is inferred from test existence. Select exact tests only when a behavior change or runtime gate requires them.


**R097**: Validation/fixture population is retained under tool; grouped at L1 because no executed result is inferred from test existence. Select exact tests only when a behavior change or runtime gate requires them.


**R102**: agent support input retained under s1.core.extensions. Runtime text/pins/generator inputs are behavior-relevant when changed; this L1 claims only inspected owner/entry boundaries, not the unseen content.


**R104**: capability support input retained under s1.core.capability. Runtime text/pins/generator inputs are behavior-relevant when changed; this L1 claims only inspected owner/entry boundaries, not the unseen content.


**R106**: plugin-host support input retained under s1.core.extensions. Runtime text/pins/generator inputs are behavior-relevant when changed; this L1 claims only inspected owner/entry boundaries, not the unseen content.


**R109**: tool support input retained under s1.core.tools. Runtime text/pins/generator inputs are behavior-relevant when changed; this L1 claims only inspected owner/entry boundaries, not the unseen content.



## Complete routed membership groups

Each row below retains its original shared classification. Paths are exact; Git blob identities remain in the unchanged original population and losslessly reconstructed coverage JSON. These are dispositions, not claims that unread content was inspected.


### G006 — 1 memberships

```json
{
  "family": "agent",
  "kind": "implementation",
  "depth": "decisive_source_read",
  "justification": "Captured pinned bytes and inspected cited definitions/control flow used by s1.core.extensions; conclusions are limited to these source ranges and explicit normative sections.",
  "source_read_status": "semantically_read_decisive_ranges",
  "need": "component",
  "proposed_artifact_key": "s1.core.extensions",
  "requires_deeper_read_for_leaf_specific_use": true,
  "semantic_acceptance": false
}
```

- `packages/core/src/agent.ts`


### G007 — 6 memberships

```json
{
  "family": "agent",
  "kind": "bundled_instruction",
  "depth": "grouped_support_contract",
  "justification": "agent support input retained under s1.core.extensions. Runtime text/pins/generator inputs are behavior-relevant when changed; this L1 claims only inspected owner/entry boundaries, not the unseen content.",
  "source_read_status": "not_read",
  "need": "component",
  "proposed_artifact_key": "s1.core.extensions",
  "requires_deeper_read_for_leaf_specific_use": true,
  "semantic_acceptance": false
}
```

- `packages/core/src/agent/prompt/compaction.txt`
- `packages/core/src/agent/prompt/explore.txt`
- `packages/core/src/agent/prompt/general.txt`
- `packages/core/src/agent/prompt/maestro.txt`
- `packages/core/src/agent/prompt/summary.txt`
- `packages/core/src/agent/prompt/title.txt`


### G008 — 1 memberships

```json
{
  "family": "agent",
  "kind": "test_code",
  "depth": "grouped_validation_inventory",
  "justification": "Validation/fixture population is retained under agent; grouped at L1 because no executed result is inferred from test existence. Select exact tests only when a behavior change or runtime gate requires them.",
  "source_read_status": "not_read",
  "need": "component",
  "proposed_artifact_key": "s1.core.extensions",
  "requires_deeper_read_for_leaf_specific_use": false,
  "semantic_acceptance": false
}
```

- `packages/core/test/agent.test.ts`


### G009 — 1 memberships

```json
{
  "family": "agent",
  "kind": "documentation",
  "depth": "orientation_read",
  "justification": "Pinned bytes captured; orientation/header inspection does not authorize leaf-specific behavior claims. Family boundary is documented in s1.core.extensions; deeper source read required before operational use of this file.",
  "source_read_status": "captured_targeted_orientation_only",
  "need": "component",
  "proposed_artifact_key": "s1.core.extensions",
  "requires_deeper_read_for_leaf_specific_use": true,
  "semantic_acceptance": false
}
```

- `docs/guides/agents.md`


### G010 — 1 memberships

```json
{
  "family": "agent",
  "kind": "implementation",
  "depth": "representative_family_boundary",
  "justification": "Substantive agent leaf, not discarded as support. The coherent family entry/authority/lifecycle boundary is sourced in s1.core.extensions; this individual implementation is not semantically accepted and needs deeper reading for leaf-specific claims or changes.",
  "source_read_status": "not_read",
  "need": "component",
  "proposed_artifact_key": "s1.core.extensions",
  "requires_deeper_read_for_leaf_specific_use": true,
  "semantic_acceptance": false
}
```

- `packages/core/src/agent/prompt.ts`


### G023 — 2 memberships

```json
{
  "family": "capability",
  "kind": "documentation",
  "depth": "decisive_source_read",
  "justification": "Captured pinned bytes and inspected cited definitions/control flow used by s1.core.capability; conclusions are limited to these source ranges and explicit normative sections.",
  "source_read_status": "semantically_read_decisive_ranges",
  "need": "component",
  "proposed_artifact_key": "s1.core.capability",
  "requires_deeper_read_for_leaf_specific_use": false,
  "semantic_acceptance": false
}
```

- `docs/guides/artifacts-and-processes.md`
- `packages/core/src/capability/mcp/README.md`


### G024 — 3 memberships

```json
{
  "family": "capability",
  "kind": "implementation",
  "depth": "decisive_source_read",
  "justification": "Captured pinned bytes and inspected cited definitions/control flow used by s1.core.capability; conclusions are limited to these source ranges and explicit normative sections.",
  "source_read_status": "semantically_read_decisive_ranges",
  "need": "component",
  "proposed_artifact_key": "s1.core.capability",
  "requires_deeper_read_for_leaf_specific_use": true,
  "semantic_acceptance": false
}
```

- `packages/core/src/capability/invocation.ts`
- `packages/core/src/capability/policy.ts`
- `packages/core/src/capability/tools.ts`


### G025 — 2 memberships

```json
{
  "family": "capability",
  "kind": "documentation",
  "depth": "grouped_documentation_disposition",
  "justification": "Repository document retained with capability family; no current implementation or executed qualification is inferred from its filename/status. Consult alongside s1.core.capability before relying on historical intent or a specific guide requirement.",
  "source_read_status": "not_read",
  "need": "component",
  "proposed_artifact_key": "s1.core.capability",
  "requires_deeper_read_for_leaf_specific_use": true,
  "semantic_acceptance": false
}
```

- `packages/core/src/capability/document/PROVENANCE.md`
- `packages/core/src/capability/service/PROVENANCE.md`


### G026 — 1 memberships

```json
{
  "family": "capability",
  "kind": "runtime_asset",
  "depth": "grouped_support_contract",
  "justification": "capability support input retained under s1.core.capability. Runtime text/pins/generator inputs are behavior-relevant when changed; this L1 claims only inspected owner/entry boundaries, not the unseen content.",
  "source_read_status": "not_read",
  "need": "component",
  "proposed_artifact_key": "s1.core.capability",
  "requires_deeper_read_for_leaf_specific_use": true,
  "semantic_acceptance": false
}
```

- `packages/core/src/capability/document/NOTICES`


### G027 — 73 memberships

```json
{
  "family": "capability",
  "kind": "test_code",
  "depth": "grouped_validation_inventory",
  "justification": "Validation/fixture population is retained under capability; grouped at L1 because no executed result is inferred from test existence. Select exact tests only when a behavior change or runtime gate requires them.",
  "source_read_status": "not_read",
  "need": "component",
  "proposed_artifact_key": "s1.core.capability",
  "requires_deeper_read_for_leaf_specific_use": false,
  "semantic_acceptance": false
}
```

- `packages/core/test/capability-artifact-management-mutation.test.ts`
- `packages/core/test/capability-artifact-management.test.ts`
- `packages/core/test/capability-artifact-selection.test.ts`
- `packages/core/test/capability-artifacts-integrity.test.ts`
- `packages/core/test/capability-artifacts-lifecycle.test.ts`
- `packages/core/test/capability-channel-native-interruption.test.ts`
- `packages/core/test/capability-channel-read.test.ts`
- `packages/core/test/capability-channel-recovery.test.ts`
- `packages/core/test/capability-channel-send.test.ts`
- `packages/core/test/capability-child-stores.test.ts`
- `packages/core/test/capability-children.test.ts`
- `packages/core/test/capability-commit.test.ts`
- `packages/core/test/capability-connection-binding-live.test.ts`
- `packages/core/test/capability-connection-binding-refresh.test.ts`
- `packages/core/test/capability-connection-binding.test.ts`
- `packages/core/test/capability-connection-management-authority.test.ts`
- `packages/core/test/capability-connection-management-cleanup.test.ts`
- `packages/core/test/capability-connection-management-cursor.test.ts`
- `packages/core/test/capability-connection-management-races.test.ts`
- `packages/core/test/capability-connection-management-rollback.test.ts`
- `packages/core/test/capability-connection-management.test.ts`
- `packages/core/test/capability-connection-setup-bot.test.ts`
- `packages/core/test/capability-connection-setup-boundaries.test.ts`
- `packages/core/test/capability-connection-setup-consumption.test.ts`
- `packages/core/test/capability-connection-setup-frames.test.ts`
- `packages/core/test/capability-connection-setup-labels.test.ts`
- `packages/core/test/capability-connection-setup-races.test.ts`
- `packages/core/test/capability-connection-setup.test.ts`
- `packages/core/test/capability-connection-store.test.ts`
- `packages/core/test/capability-connection-verifiers.test.ts`
- `packages/core/test/capability-connection-verify.test.ts`
- `packages/core/test/capability-connections.test.ts`
- `packages/core/test/capability-descriptors.test.ts`
- `packages/core/test/capability-discovery-acquisition.test.ts`
- `packages/core/test/capability-discovery-cursors.test.ts`
- `packages/core/test/capability-discovery-publication.test.ts`
- `packages/core/test/capability-document.test.ts`
- `packages/core/test/capability-invocation.test.ts`
- `packages/core/test/capability-jobs-transfer.test.ts`
- `packages/core/test/capability-jobs.test.ts`
- `packages/core/test/capability-materialization-context.test.ts`
- `packages/core/test/capability-materialization.test.ts`
- `packages/core/test/capability-mcp-bounds.test.ts`
- `packages/core/test/capability-mcp-lifecycle.test.ts`
- `packages/core/test/capability-mcp-protocol.test.ts`
- `packages/core/test/capability-media-helper.test.ts`
- `packages/core/test/capability-media.test.ts`
- `packages/core/test/capability-operator.test.ts`
- `packages/core/test/capability-policy-boundaries.test.ts`
- `packages/core/test/capability-policy.test.ts`
- `packages/core/test/capability-process-control-safety.test.ts`
- `packages/core/test/capability-process-control.test.ts`
- `packages/core/test/capability-process-output.test.ts`
- `packages/core/test/capability-process-registry.test.ts`
- `packages/core/test/capability-process-sweep.test.ts`
- `packages/core/test/capability-request-reconcile.test.ts`
- `packages/core/test/capability-request.test.ts`
- `packages/core/test/capability-runner.test.ts`
- `packages/core/test/capability-runtime-metadata.test.ts`
- `packages/core/test/capability-runtime.test.ts`
- `packages/core/test/capability-schedule.test.ts`
- `packages/core/test/capability-service-call.test.ts`
- `packages/core/test/capability-services.test.ts`
- `packages/core/test/capability-sheet-boundaries.test.ts`
- `packages/core/test/capability-sheet.test.ts`
- `packages/core/test/capability-tools.test.ts`
- `packages/core/test/capability-vendor-schema.test.ts`
- `packages/core/test/capability-verifier-cloudflare.test.ts`
- `packages/core/test/capability-verifier-credential-only.test.ts`
- `packages/core/test/capability-verifier-linear.test.ts`
- `packages/core/test/capability-verifier-neon.test.ts`
- `packages/core/test/capability-verifier-stripe.test.ts`
- `packages/core/test/capability-verifier-supabase.test.ts`


### G028 — 89 memberships

```json
{
  "family": "capability",
  "kind": "implementation",
  "depth": "representative_family_boundary",
  "justification": "Substantive capability leaf, not discarded as support. The coherent family entry/authority/lifecycle boundary is sourced in s1.core.capability; this individual implementation is not semantically accepted and needs deeper reading for leaf-specific claims or changes.",
  "source_read_status": "not_read",
  "need": "component",
  "proposed_artifact_key": "s1.core.capability",
  "requires_deeper_read_for_leaf_specific_use": true,
  "semantic_acceptance": false
}
```

- `packages/core/src/capability/artifact/blob.ts`
- `packages/core/src/capability/artifact/error.ts`
- `packages/core/src/capability/artifact/index.ts`
- `packages/core/src/capability/artifact/management-contract.ts`
- `packages/core/src/capability/artifact/management-mutation.ts`
- `packages/core/src/capability/artifact/management-shared.ts`
- `packages/core/src/capability/artifact/management.ts`
- `packages/core/src/capability/artifact/mime.ts`
- `packages/core/src/capability/artifact/selection.ts`
- `packages/core/src/capability/catalog/cursors.ts`
- `packages/core/src/capability/catalog/descriptors.ts`
- `packages/core/src/capability/catalog/discovery.ts`
- `packages/core/src/capability/catalog/schema.ts`
- `packages/core/src/capability/channel/http.ts`
- `packages/core/src/capability/channel/index.ts`
- `packages/core/src/capability/channel/request.ts`
- `packages/core/src/capability/channel/schema.ts`
- `packages/core/src/capability/children.ts`
- `packages/core/src/capability/connection/bindings-contract.ts`
- `packages/core/src/capability/connection/bindings.ts`
- `packages/core/src/capability/connection/index.ts`
- `packages/core/src/capability/connection/input.ts`
- `packages/core/src/capability/connection/management-contract.ts`
- `packages/core/src/capability/connection/management-cursor.ts`
- `packages/core/src/capability/connection/management.ts`
- `packages/core/src/capability/connection/setup-contract.ts`
- `packages/core/src/capability/connection/setup.ts`
- `packages/core/src/capability/connection/store-contract.ts`
- `packages/core/src/capability/connection/store.ts`
- `packages/core/src/capability/connection/verifiers/cloudflare.ts`
- `packages/core/src/capability/connection/verifiers/contract.ts`
- `packages/core/src/capability/connection/verifiers/discord.ts`
- `packages/core/src/capability/connection/verifiers/globalping.ts`
- `packages/core/src/capability/connection/verifiers/index.ts`
- `packages/core/src/capability/connection/verifiers/linear.ts`
- `packages/core/src/capability/connection/verifiers/neon.ts`
- `packages/core/src/capability/connection/verifiers/openai.ts`
- `packages/core/src/capability/connection/verifiers/runway.ts`
- `packages/core/src/capability/connection/verifiers/slack.ts`
- `packages/core/src/capability/connection/verifiers/stripe.ts`
- `packages/core/src/capability/connection/verifiers/supabase.ts`
- `packages/core/src/capability/connection/verify.ts`
- `packages/core/src/capability/document/index.ts`
- `packages/core/src/capability/document/native.ts`
- `packages/core/src/capability/document/pdf.ts`
- `packages/core/src/capability/document/schema.ts`
- `packages/core/src/capability/document/work.ts`
- `packages/core/src/capability/document/worker.ts`
- `packages/core/src/capability/job/index.ts`
- `packages/core/src/capability/mcp/http.ts`
- `packages/core/src/capability/mcp/index.ts`
- `packages/core/src/capability/mcp/protocol.ts`
- `packages/core/src/capability/media/http.ts`
- `packages/core/src/capability/media/index.ts`
- `packages/core/src/capability/media/schema.ts`
- `packages/core/src/capability/operator/contract.ts`
- `packages/core/src/capability/operator/index.ts`
- `packages/core/src/capability/operator/request-contract.ts`
- `packages/core/src/capability/operator/request-data.ts`
- `packages/core/src/capability/operator/request.ts`
- `packages/core/src/capability/operator/scope.ts`
- `packages/core/src/capability/process-control/contract.ts`
- `packages/core/src/capability/process-control/index.ts`
- `packages/core/src/capability/process-control/output.ts`
- `packages/core/src/capability/process-control/registry.ts`
- `packages/core/src/capability/process-control/sweep.ts`
- `packages/core/src/capability/providers/discord/index.ts`
- `packages/core/src/capability/providers/discord/permissions.ts`
- `packages/core/src/capability/providers/slack/index.ts`
- `packages/core/src/capability/schedule/contract.ts`
- `packages/core/src/capability/schedule/index.ts`
- `packages/core/src/capability/schedule/management.ts`
- `packages/core/src/capability/service/contract.ts`
- `packages/core/src/capability/service/execute.ts`
- `packages/core/src/capability/service/execution/data.ts`
- `packages/core/src/capability/service/execution/projection.ts`
- `packages/core/src/capability/service/index.ts`
- `packages/core/src/capability/service/providers.ts`
- `packages/core/src/capability/service/schema.ts`
- `packages/core/src/capability/sheet/archive.ts`
- `packages/core/src/capability/sheet/csv.ts`
- `packages/core/src/capability/sheet/formula.ts`
- `packages/core/src/capability/sheet/index.ts`
- `packages/core/src/capability/sheet/schema.ts`
- `packages/core/src/capability/sheet/workbook.ts`
- `packages/core/src/capability/sheet/zip.ts`
- `packages/core/src/capability/sql.ts`
- `packages/core/src/toolkit/install.ts`
- `packages/core/src/toolkit/runtime.ts`


### G050 — 1 memberships

```json
{
  "family": "identity",
  "kind": "implementation",
  "depth": "decisive_source_read",
  "justification": "Captured pinned bytes and inspected cited definitions/control flow used by s1.core.extensions; conclusions are limited to these source ranges and explicit normative sections.",
  "source_read_status": "semantically_read_decisive_ranges",
  "need": "component",
  "proposed_artifact_key": "s1.core.extensions",
  "requires_deeper_read_for_leaf_specific_use": true,
  "semantic_acceptance": false
}
```

- `packages/core/src/integration.ts`


### G051 — 2 memberships

```json
{
  "family": "identity",
  "kind": "test_code",
  "depth": "grouped_validation_inventory",
  "justification": "Validation/fixture population is retained under identity; grouped at L1 because no executed result is inferred from test existence. Select exact tests only when a behavior change or runtime gate requires them.",
  "source_read_status": "not_read",
  "need": "component",
  "proposed_artifact_key": "s1.core.extensions",
  "requires_deeper_read_for_leaf_specific_use": false,
  "semantic_acceptance": false
}
```

- `packages/core/test/integration.test.ts`
- `packages/core/test/oauth-page.test.ts`


### G052 — 6 memberships

```json
{
  "family": "identity",
  "kind": "implementation",
  "depth": "representative_family_boundary",
  "justification": "Substantive identity leaf, not discarded as support. The coherent family entry/authority/lifecycle boundary is sourced in s1.core.extensions; this individual implementation is not semantically accepted and needs deeper reading for leaf-specific claims or changes.",
  "source_read_status": "not_read",
  "need": "component",
  "proposed_artifact_key": "s1.core.extensions",
  "requires_deeper_read_for_leaf_specific_use": true,
  "semantic_acceptance": false
}
```

- `packages/core/src/account.ts`
- `packages/core/src/account/sql.ts`
- `packages/core/src/claude-code-account.ts`
- `packages/core/src/integration/connection.ts`
- `packages/core/src/oauth/page.ts`
- `packages/core/src/share/sql.ts`


### G053 — 2 memberships

```json
{
  "family": "identity",
  "kind": "implementation",
  "depth": "decisive_source_read",
  "justification": "Captured pinned bytes and inspected cited definitions/control flow used by s1.core.security; conclusions are limited to these source ranges and explicit normative sections.",
  "source_read_status": "semantically_read_decisive_ranges",
  "need": "evidence",
  "proposed_artifact_key": "s1.core.security",
  "requires_deeper_read_for_leaf_specific_use": true,
  "semantic_acceptance": false
}
```

- `packages/core/src/credential.ts`
- `packages/core/src/credential/cipher.ts`


### G054 — 3 memberships

```json
{
  "family": "identity",
  "kind": "test_code",
  "depth": "grouped_validation_inventory",
  "justification": "Validation/fixture population is retained under identity; grouped at L1 because no executed result is inferred from test existence. Select exact tests only when a behavior change or runtime gate requires them.",
  "source_read_status": "not_read",
  "need": "evidence",
  "proposed_artifact_key": "s1.core.security",
  "requires_deeper_read_for_leaf_specific_use": false,
  "semantic_acceptance": false
}
```

- `packages/core/test/credential-at-rest.test.ts`
- `packages/core/test/credential-inherit.test.ts`
- `packages/core/test/credential.test.ts`


### G055 — 1 memberships

```json
{
  "family": "identity",
  "kind": "implementation",
  "depth": "representative_family_boundary",
  "justification": "Substantive identity leaf, not discarded as support. The coherent family entry/authority/lifecycle boundary is sourced in s1.core.security; this individual implementation is not semantically accepted and needs deeper reading for leaf-specific claims or changes.",
  "source_read_status": "not_read",
  "need": "evidence",
  "proposed_artifact_key": "s1.core.security",
  "requires_deeper_read_for_leaf_specific_use": true,
  "semantic_acceptance": false
}
```

- `packages/core/src/credential/sql.ts`


### G056 — 1 memberships

```json
{
  "family": "instruction",
  "kind": "implementation",
  "depth": "decisive_source_read",
  "justification": "Captured pinned bytes and inspected cited definitions/control flow used by s1.core.extensions; conclusions are limited to these source ranges and explicit normative sections.",
  "source_read_status": "semantically_read_decisive_ranges",
  "need": "component",
  "proposed_artifact_key": "s1.core.extensions",
  "requires_deeper_read_for_leaf_specific_use": true,
  "semantic_acceptance": false
}
```

- `packages/core/src/skill.ts`


### G057 — 1 memberships

```json
{
  "family": "instruction",
  "kind": "documentation",
  "depth": "grouped_documentation_disposition",
  "justification": "Repository document retained with instruction family; no current implementation or executed qualification is inferred from its filename/status. Consult alongside s1.core.extensions before relying on historical intent or a specific guide requirement.",
  "source_read_status": "not_read",
  "need": "component",
  "proposed_artifact_key": "s1.core.extensions",
  "requires_deeper_read_for_leaf_specific_use": true,
  "semantic_acceptance": false
}
```

- `docs/specs/v2/instructions.md`


### G058 — 11 memberships

```json
{
  "family": "instruction",
  "kind": "test_code",
  "depth": "grouped_validation_inventory",
  "justification": "Validation/fixture population is retained under instruction; grouped at L1 because no executed result is inferred from test existence. Select exact tests only when a behavior change or runtime gate requires them.",
  "source_read_status": "not_read",
  "need": "component",
  "proposed_artifact_key": "s1.core.extensions",
  "requires_deeper_read_for_leaf_specific_use": false,
  "semantic_acceptance": false
}
```

- `packages/core/test/command.test.ts`
- `packages/core/test/packaged-skills-corruption.test.ts`
- `packages/core/test/packaged-skills.test.ts`
- `packages/core/test/reference-guidance.test.ts`
- `packages/core/test/reference.test.ts`
- `packages/core/test/skill-discovery.test.ts`
- `packages/core/test/skill.test.ts`
- `packages/core/test/skill/backend-families.test.ts`
- `packages/core/test/skill/file.test.ts`
- `packages/core/test/skill/guidance.test.ts`
- `packages/core/test/slash-command.test.ts`


### G059 — 8 memberships

```json
{
  "family": "instruction",
  "kind": "implementation",
  "depth": "representative_family_boundary",
  "justification": "Substantive instruction leaf, not discarded as support. The coherent family entry/authority/lifecycle boundary is sourced in s1.core.extensions; this individual implementation is not semantically accepted and needs deeper reading for leaf-specific claims or changes.",
  "source_read_status": "not_read",
  "need": "component",
  "proposed_artifact_key": "s1.core.extensions",
  "requires_deeper_read_for_leaf_specific_use": true,
  "semantic_acceptance": false
}
```

- `packages/core/src/command.ts`
- `packages/core/src/packaged-skills.ts`
- `packages/core/src/reference.ts`
- `packages/core/src/reference/guidance.ts`
- `packages/core/src/skill/discovery.ts`
- `packages/core/src/skill/file.ts`
- `packages/core/src/skill/guidance.ts`
- `packages/core/src/slash-command.ts`


### G070 — 1 memberships

```json
{
  "family": "permission",
  "kind": "repository_skill",
  "depth": "decisive_source_read",
  "justification": "Captured pinned bytes and inspected cited definitions/control flow used by s1.core.security; conclusions are limited to these source ranges and explicit normative sections.",
  "source_read_status": "semantically_read_decisive_ranges",
  "need": "evidence",
  "proposed_artifact_key": "s1.core.security",
  "requires_deeper_read_for_leaf_specific_use": false,
  "semantic_acceptance": false
}
```

- `.orchestra/skills/session-requests-usage/SKILL.md`


### G071 — 2 memberships

```json
{
  "family": "permission",
  "kind": "implementation",
  "depth": "decisive_source_read",
  "justification": "Captured pinned bytes and inspected cited definitions/control flow used by s1.core.security; conclusions are limited to these source ranges and explicit normative sections.",
  "source_read_status": "semantically_read_decisive_ranges",
  "need": "evidence",
  "proposed_artifact_key": "s1.core.security",
  "requires_deeper_read_for_leaf_specific_use": true,
  "semantic_acceptance": false
}
```

- `packages/core/src/permission.ts`
- `packages/core/src/question.ts`


### G072 — 1 memberships

```json
{
  "family": "permission",
  "kind": "test_support",
  "depth": "grouped_validation_inventory",
  "justification": "Validation/fixture population is retained under permission; grouped at L1 because no executed result is inferred from test existence. Select exact tests only when a behavior change or runtime gate requires them.",
  "source_read_status": "not_read",
  "need": "evidence",
  "proposed_artifact_key": "s1.core.security",
  "requires_deeper_read_for_leaf_specific_use": false,
  "semantic_acceptance": false
}
```

- `packages/core/test/permission-fixture.ts`


### G073 — 2 memberships

```json
{
  "family": "permission",
  "kind": "test_code",
  "depth": "grouped_validation_inventory",
  "justification": "Validation/fixture population is retained under permission; grouped at L1 because no executed result is inferred from test existence. Select exact tests only when a behavior change or runtime gate requires them.",
  "source_read_status": "not_read",
  "need": "evidence",
  "proposed_artifact_key": "s1.core.security",
  "requires_deeper_read_for_leaf_specific_use": false,
  "semantic_acceptance": false
}
```

- `packages/core/test/permission.test.ts`
- `packages/core/test/question.test.ts`


### G074 — 1 memberships

```json
{
  "family": "permission",
  "kind": "documentation",
  "depth": "orientation_read",
  "justification": "Pinned bytes captured; orientation/header inspection does not authorize leaf-specific behavior claims. Family boundary is documented in s1.core.security; deeper source read required before operational use of this file.",
  "source_read_status": "captured_targeted_orientation_only",
  "need": "evidence",
  "proposed_artifact_key": "s1.core.security",
  "requires_deeper_read_for_leaf_specific_use": true,
  "semantic_acceptance": false
}
```

- `docs/guides/session-requests.md`


### G075 — 2 memberships

```json
{
  "family": "permission",
  "kind": "implementation",
  "depth": "representative_family_boundary",
  "justification": "Substantive permission leaf, not discarded as support. The coherent family entry/authority/lifecycle boundary is sourced in s1.core.security; this individual implementation is not semantically accepted and needs deeper reading for leaf-specific claims or changes.",
  "source_read_status": "not_read",
  "need": "evidence",
  "proposed_artifact_key": "s1.core.security",
  "requires_deeper_read_for_leaf_specific_use": true,
  "semantic_acceptance": false
}
```

- `packages/core/src/permission/saved.ts`
- `packages/core/src/permission/sql.ts`


### G076 — 1 memberships

```json
{
  "family": "plugin-host",
  "kind": "implementation",
  "depth": "decisive_source_read",
  "justification": "Captured pinned bytes and inspected cited definitions/control flow used by s1.core.extensions; conclusions are limited to these source ranges and explicit normative sections.",
  "source_read_status": "semantically_read_decisive_ranges",
  "need": "component",
  "proposed_artifact_key": "s1.core.extensions",
  "requires_deeper_read_for_leaf_specific_use": true,
  "semantic_acceptance": false
}
```

- `packages/core/src/plugin.ts`


### G077 — 1 memberships

```json
{
  "family": "plugin-host",
  "kind": "documentation",
  "depth": "decisive_source_read",
  "justification": "Captured pinned bytes and inspected cited definitions/control flow used by s1.core.extensions; conclusions are limited to these source ranges and explicit normative sections.",
  "source_read_status": "semantically_read_decisive_ranges",
  "need": "component",
  "proposed_artifact_key": "s1.core.extensions",
  "requires_deeper_read_for_leaf_specific_use": false,
  "semantic_acceptance": false
}
```

- `packages/core/src/plugin/README.md`


### G078 — 1 memberships

```json
{
  "family": "plugin-host",
  "kind": "documentation",
  "depth": "grouped_documentation_disposition",
  "justification": "Repository document retained with plugin-host family; no current implementation or executed qualification is inferred from its filename/status. Consult alongside s1.core.extensions before relying on historical intent or a specific guide requirement.",
  "source_read_status": "not_read",
  "need": "component",
  "proposed_artifact_key": "s1.core.extensions",
  "requires_deeper_read_for_leaf_specific_use": true,
  "semantic_acceptance": false
}
```

- `docs/specs/v2/catalog-config-plugin-lifecycle.md`


### G079 — 2 memberships

```json
{
  "family": "plugin-host",
  "kind": "bundled_instruction",
  "depth": "grouped_support_contract",
  "justification": "plugin-host support input retained under s1.core.extensions. Runtime text/pins/generator inputs are behavior-relevant when changed; this L1 claims only inspected owner/entry boundaries, not the unseen content.",
  "source_read_status": "not_read",
  "need": "component",
  "proposed_artifact_key": "s1.core.extensions",
  "requires_deeper_read_for_leaf_specific_use": true,
  "semantic_acceptance": false
}
```

- `packages/core/src/plugin/command/initialize.txt`
- `packages/core/src/plugin/command/review.txt`


### G080 — 39 memberships

```json
{
  "family": "plugin-host",
  "kind": "test_code",
  "depth": "grouped_validation_inventory",
  "justification": "Validation/fixture population is retained under plugin-host; grouped at L1 because no executed result is inferred from test existence. Select exact tests only when a behavior change or runtime gate requires them.",
  "source_read_status": "not_read",
  "need": "component",
  "proposed_artifact_key": "s1.core.extensions",
  "requires_deeper_read_for_leaf_specific_use": false,
  "semantic_acceptance": false
}
```

- `packages/core/test/plugin-boot.test.ts`
- `packages/core/test/plugin-ensure.test.ts`
- `packages/core/test/plugin.test.ts`
- `packages/core/test/plugin/command.test.ts`
- `packages/core/test/plugin/host.ts`
- `packages/core/test/plugin/models-dev.test.ts`
- `packages/core/test/plugin/promise.test.ts`
- `packages/core/test/plugin/provider-amazon-bedrock.test.ts`
- `packages/core/test/plugin/provider-anthropic.test.ts`
- `packages/core/test/plugin/provider-azure-cognitive-services.test.ts`
- `packages/core/test/plugin/provider-azure.test.ts`
- `packages/core/test/plugin/provider-cerebras.test.ts`
- `packages/core/test/plugin/provider-cloudflare-ai-gateway.test.ts`
- `packages/core/test/plugin/provider-cloudflare-workers-ai.test.ts`
- `packages/core/test/plugin/provider-cohere.test.ts`
- `packages/core/test/plugin/provider-deepinfra.test.ts`
- `packages/core/test/plugin/provider-dynamic.test.ts`
- `packages/core/test/plugin/provider-gateway.test.ts`
- `packages/core/test/plugin/provider-github-copilot.test.ts`
- `packages/core/test/plugin/provider-gitlab.test.ts`
- `packages/core/test/plugin/provider-google-vertex-anthropic.test.ts`
- `packages/core/test/plugin/provider-google-vertex.test.ts`
- `packages/core/test/plugin/provider-kilo.test.ts`
- `packages/core/test/plugin/provider-llmgateway.test.ts`
- `packages/core/test/plugin/provider-nvidia.test.ts`
- `packages/core/test/plugin/provider-openai-compatible.test.ts`
- `packages/core/test/plugin/provider-openai.test.ts`
- `packages/core/test/plugin/provider-opencode.test.ts`
- `packages/core/test/plugin/provider-openrouter.test.ts`
- `packages/core/test/plugin/provider-sap-ai-core.test.ts`
- `packages/core/test/plugin/provider-snowflake-cortex.test.ts`
- `packages/core/test/plugin/provider-table.test.ts`
- `packages/core/test/plugin/provider-vercel.test.ts`
- `packages/core/test/plugin/provider-zenmux.test.ts`
- `packages/core/test/plugin/sdk-authority-entry.ts`
- `packages/core/test/plugin/sdk-authority.test.ts`
- `packages/core/test/plugin/sdk-runtime.node-entry.ts`
- `packages/core/test/plugin/sdk-runtime.test.ts`
- `packages/core/test/plugin/variant.test.ts`


### G081 — 1 memberships

```json
{
  "family": "plugin-host",
  "kind": "test_support",
  "depth": "grouped_validation_inventory",
  "justification": "Validation/fixture population is retained under plugin-host; grouped at L1 because no executed result is inferred from test existence. Select exact tests only when a behavior change or runtime gate requires them.",
  "source_read_status": "not_read",
  "need": "component",
  "proposed_artifact_key": "s1.core.extensions",
  "requires_deeper_read_for_leaf_specific_use": false,
  "semantic_acceptance": false
}
```

- `packages/core/test/plugin/fixture.ts`


### G082 — 6 memberships

```json
{
  "family": "plugin-host",
  "kind": "test_fixture",
  "depth": "grouped_validation_inventory",
  "justification": "Validation/fixture population is retained under plugin-host; grouped at L1 because no executed result is inferred from test existence. Select exact tests only when a behavior change or runtime gate requires them.",
  "source_read_status": "not_read",
  "need": "component",
  "proposed_artifact_key": "s1.core.extensions",
  "requires_deeper_read_for_leaf_specific_use": false,
  "semantic_acceptance": false
}
```

- `packages/core/test/plugin/fixtures/config-effect-plugin.ts`
- `packages/core/test/plugin/fixtures/config-promise-plugin.ts`
- `packages/core/test/plugin/fixtures/invalid-plugin.ts`
- `packages/core/test/plugin/fixtures/models-dev-public.json`
- `packages/core/test/plugin/fixtures/models-dev.json`
- `packages/core/test/plugin/fixtures/provider-factory.ts`


### G083 — 12 memberships

```json
{
  "family": "plugin-host",
  "kind": "implementation",
  "depth": "representative_family_boundary",
  "justification": "Substantive plugin-host leaf, not discarded as support. The coherent family entry/authority/lifecycle boundary is sourced in s1.core.extensions; this individual implementation is not semantically accepted and needs deeper reading for leaf-specific claims or changes.",
  "source_read_status": "not_read",
  "need": "component",
  "proposed_artifact_key": "s1.core.extensions",
  "requires_deeper_read_for_leaf_specific_use": true,
  "semantic_acceptance": false
}
```

- `packages/core/src/plugin/agent.ts`
- `packages/core/src/plugin/command.ts`
- `packages/core/src/plugin/host.ts`
- `packages/core/src/plugin/internal.ts`
- `packages/core/src/plugin/layer-map.example.ts`
- `packages/core/src/plugin/promise.ts`
- `packages/core/src/plugin/sdk-admission.ts`
- `packages/core/src/plugin/sdk-limits.ts`
- `packages/core/src/plugin/sdk-package.ts`
- `packages/core/src/plugin/sdk-reconcile.ts`
- `packages/core/src/plugin/sdk-registry.ts`
- `packages/core/src/plugin/sdk-runtime.ts`


### G143 — 1 memberships

```json
{
  "family": "tool",
  "kind": "implementation",
  "depth": "decisive_source_read",
  "justification": "Captured pinned bytes and inspected cited definitions/control flow used by s1.core.extensions; conclusions are limited to these source ranges and explicit normative sections.",
  "source_read_status": "semantically_read_decisive_ranges",
  "need": "component",
  "proposed_artifact_key": "s1.core.extensions",
  "requires_deeper_read_for_leaf_specific_use": true,
  "semantic_acceptance": false
}
```

- `packages/core/src/mcp.ts`


### G144 — 10 memberships

```json
{
  "family": "tool",
  "kind": "test_code",
  "depth": "grouped_validation_inventory",
  "justification": "Validation/fixture population is retained under tool; grouped at L1 because no executed result is inferred from test existence. Select exact tests only when a behavior change or runtime gate requires them.",
  "source_read_status": "not_read",
  "need": "component",
  "proposed_artifact_key": "s1.core.extensions",
  "requires_deeper_read_for_leaf_specific_use": false,
  "semantic_acceptance": false
}
```

- `packages/core/test/mcp-debug.test.ts`
- `packages/core/test/mcp-provided.test.ts`
- `packages/core/test/mcp-trust.test.ts`
- `packages/core/test/mcp.test.ts`
- `packages/core/test/mcp/auth.test.ts`
- `packages/core/test/mcp/oauth-callback.test.ts`
- `packages/core/test/mcp/oauth-provider.test.ts`
- `packages/core/test/mcp/project-config.test.ts`
- `packages/core/test/mcp/session-recovery.test.ts`
- `packages/core/test/mcp/transport.test.ts`


### G145 — 8 memberships

```json
{
  "family": "tool",
  "kind": "implementation",
  "depth": "representative_family_boundary",
  "justification": "Substantive tool leaf, not discarded as support. The coherent family entry/authority/lifecycle boundary is sourced in s1.core.extensions; this individual implementation is not semantically accepted and needs deeper reading for leaf-specific claims or changes.",
  "source_read_status": "not_read",
  "need": "component",
  "proposed_artifact_key": "s1.core.extensions",
  "requires_deeper_read_for_leaf_specific_use": true,
  "semantic_acceptance": false
}
```

- `packages/core/src/mcp/auth.ts`
- `packages/core/src/mcp/catalog.ts`
- `packages/core/src/mcp/client.ts`
- `packages/core/src/mcp/oauth-callback.ts`
- `packages/core/src/mcp/oauth-provider.ts`
- `packages/core/src/mcp/project-config.ts`
- `packages/core/src/mcp/provided.ts`
- `packages/core/src/mcp/stdio.ts`


### G149 — 6 memberships

```json
{
  "family": "tool",
  "kind": "implementation",
  "depth": "decisive_source_read",
  "justification": "Captured pinned bytes and inspected cited definitions/control flow used by s1.core.tools; conclusions are limited to these source ranges and explicit normative sections.",
  "source_read_status": "semantically_read_decisive_ranges",
  "need": "component",
  "proposed_artifact_key": "s1.core.tools",
  "requires_deeper_read_for_leaf_specific_use": true,
  "semantic_acceptance": false
}
```

- `packages/core/src/tool-output-store.ts`
- `packages/core/src/tool/application-tools.ts`
- `packages/core/src/tool/apply-patch.ts`
- `packages/core/src/tool/read.ts`
- `packages/core/src/tool/registry.ts`
- `packages/core/src/tool/tool.ts`


### G150 — 1 memberships

```json
{
  "family": "tool",
  "kind": "documentation",
  "depth": "decisive_source_read",
  "justification": "Captured pinned bytes and inspected cited definitions/control flow used by s1.core.tools; conclusions are limited to these source ranges and explicit normative sections.",
  "source_read_status": "semantically_read_decisive_ranges",
  "need": "component",
  "proposed_artifact_key": "s1.core.tools",
  "requires_deeper_read_for_leaf_specific_use": false,
  "semantic_acceptance": false
}
```

- `packages/core/src/tool/AGENTS.md`


### G151 — 2 memberships

```json
{
  "family": "tool",
  "kind": "implementation",
  "depth": "decisive_source_read",
  "justification": "Captured pinned bytes and inspected cited definitions/control flow used by s1.core.security; conclusions are limited to these source ranges and explicit normative sections.",
  "source_read_status": "semantically_read_decisive_ranges",
  "need": "component",
  "proposed_artifact_key": "s1.core.tools",
  "requires_deeper_read_for_leaf_specific_use": true,
  "semantic_acceptance": false
}
```

- `packages/core/src/tool/agent-terminal.ts`
- `packages/core/src/tool/bash.ts`


### G152 — 2 memberships

```json
{
  "family": "tool",
  "kind": "documentation",
  "depth": "grouped_documentation_disposition",
  "justification": "Repository document retained with tool family; no current implementation or executed qualification is inferred from its filename/status. Consult alongside s1.core.tools before relying on historical intent or a specific guide requirement.",
  "source_read_status": "not_read",
  "need": "component",
  "proposed_artifact_key": "s1.core.tools",
  "requires_deeper_read_for_leaf_specific_use": true,
  "semantic_acceptance": false
}
```

- `packages/core/src/tool/LEAN-DASHBOARD-CONTRACT.md`
- `packages/core/src/tool/MODEL-CAPTURE-CONTRACT.md`


### G153 — 4 memberships

```json
{
  "family": "tool",
  "kind": "bundled_instruction",
  "depth": "grouped_support_contract",
  "justification": "tool support input retained under s1.core.tools. Runtime text/pins/generator inputs are behavior-relevant when changed; this L1 claims only inspected owner/entry boundaries, not the unseen content.",
  "source_read_status": "not_read",
  "need": "component",
  "proposed_artifact_key": "s1.core.tools",
  "requires_deeper_read_for_leaf_specific_use": true,
  "semantic_acceptance": false
}
```

- `packages/core/src/tool/question.txt`
- `packages/core/src/tool/skill.txt`
- `packages/core/src/tool/todowrite.txt`
- `packages/core/src/tool/websearch.txt`


### G154 — 32 memberships

```json
{
  "family": "tool",
  "kind": "test_code",
  "depth": "grouped_validation_inventory",
  "justification": "Validation/fixture population is retained under tool; grouped at L1 because no executed result is inferred from test existence. Select exact tests only when a behavior change or runtime gate requires them.",
  "source_read_status": "not_read",
  "need": "component",
  "proposed_artifact_key": "s1.core.tools",
  "requires_deeper_read_for_leaf_specific_use": false,
  "semantic_acceptance": false
}
```

- `packages/core/test/application-tools.test.ts`
- `packages/core/test/lean-items.test.ts`
- `packages/core/test/lean-processor.test.ts`
- `packages/core/test/lean-project-v2.test.ts`
- `packages/core/test/lean-recall.test.ts`
- `packages/core/test/lean-telemetry.test.ts`
- `packages/core/test/lean-v2-projection.test.ts`
- `packages/core/test/tool-apply-patch.test.ts`
- `packages/core/test/tool-bash.test.ts`
- `packages/core/test/tool-edit.test.ts`
- `packages/core/test/tool-error-output.test.ts`
- `packages/core/test/tool-live-look.test.ts`
- `packages/core/test/tool-meeting-recall.test.ts`
- `packages/core/test/tool-model-capture.acceptance.test.ts`
- `packages/core/test/tool-model-producer.test.ts`
- `packages/core/test/tool-model-projection.test.ts`
- `packages/core/test/tool-output-store.test.ts`
- `packages/core/test/tool-question.test.ts`
- `packages/core/test/tool-read-filesystem.test.ts`
- `packages/core/test/tool-read.test.ts`
- `packages/core/test/tool-search-ripgrep.test.ts`
- `packages/core/test/tool-skill.test.ts`
- `packages/core/test/tool-task-cold.test.ts`
- `packages/core/test/tool-task-governance.test.ts`
- `packages/core/test/tool-task-http.test.ts`
- `packages/core/test/tool-task.test.ts`
- `packages/core/test/tool-team-message.test.ts`
- `packages/core/test/tool-todowrite.test.ts`
- `packages/core/test/tool-webfetch.test.ts`
- `packages/core/test/tool-websearch-domains.test.ts`
- `packages/core/test/tool-websearch.test.ts`
- `packages/core/test/tool-write.test.ts`


### G155 — 1 memberships

```json
{
  "family": "tool",
  "kind": "documentation",
  "depth": "orientation_read",
  "justification": "Pinned bytes captured; orientation/header inspection does not authorize leaf-specific behavior claims. Family boundary is documented in s1.core.tools; deeper source read required before operational use of this file.",
  "source_read_status": "captured_targeted_orientation_only",
  "need": "component",
  "proposed_artifact_key": "s1.core.tools",
  "requires_deeper_read_for_leaf_specific_use": true,
  "semantic_acceptance": false
}
```

- `docs/specs/v2/tools.md`


### G156 — 33 memberships

```json
{
  "family": "tool",
  "kind": "implementation",
  "depth": "representative_family_boundary",
  "justification": "Substantive tool leaf, not discarded as support. The coherent family entry/authority/lifecycle boundary is sourced in s1.core.tools; this individual implementation is not semantically accepted and needs deeper reading for leaf-specific claims or changes.",
  "source_read_status": "not_read",
  "need": "component",
  "proposed_artifact_key": "s1.core.tools",
  "requires_deeper_read_for_leaf_specific_use": true,
  "semantic_acceptance": false
}
```

- `packages/core/src/tool/builtins.ts`
- `packages/core/src/tool/edit.ts`
- `packages/core/src/tool/glob.ts`
- `packages/core/src/tool/grep.ts`
- `packages/core/src/tool/http-body.ts`
- `packages/core/src/tool/lean-output.ts`
- `packages/core/src/tool/lean-processor.ts`
- `packages/core/src/tool/lean-recall.ts`
- `packages/core/src/tool/lean-summary.ts`
- `packages/core/src/tool/lean-telemetry.ts`
- `packages/core/src/tool/live-look.ts`
- `packages/core/src/tool/maestro-arsenal-omni.ts`
- `packages/core/src/tool/maestro-arsenal.ts`
- `packages/core/src/tool/meeting-recall.ts`
- `packages/core/src/tool/model-capture.ts`
- `packages/core/src/tool/model-projection.ts`
- `packages/core/src/tool/process.ts`
- `packages/core/src/tool/question.ts`
- `packages/core/src/tool/read-filesystem.ts`
- `packages/core/src/tool/skill.ts`
- `packages/core/src/tool/task-background.ts`
- `packages/core/src/tool/task-governance.ts`
- `packages/core/src/tool/task-permission.ts`
- `packages/core/src/tool/task.ts`
- `packages/core/src/tool/team-message.ts`
- `packages/core/src/tool/text.ts`
- `packages/core/src/tool/todowrite.ts`
- `packages/core/src/tool/tools.ts`
- `packages/core/src/tool/truncation-dir.ts`
- `packages/core/src/tool/upstream-arsenal.ts`
- `packages/core/src/tool/webfetch.ts`
- `packages/core/src/tool/websearch.ts`
- `packages/core/src/tool/write.ts`


### G157 — 2 memberships

```json
{
  "family": "tool-safety",
  "kind": "implementation",
  "depth": "decisive_source_read",
  "justification": "Captured pinned bytes and inspected cited definitions/control flow used by s1.core.security; conclusions are limited to these source ranges and explicit normative sections.",
  "source_read_status": "semantically_read_decisive_ranges",
  "need": "evidence",
  "proposed_artifact_key": "s1.core.security",
  "requires_deeper_read_for_leaf_specific_use": true,
  "semantic_acceptance": false
}
```

- `packages/core/src/tool-safety-sandbox.ts`
- `packages/core/src/tool-safety.ts`


### G158 — 22 memberships

```json
{
  "family": "tool-safety",
  "kind": "test_code",
  "depth": "grouped_validation_inventory",
  "justification": "Validation/fixture population is retained under tool-safety; grouped at L1 because no executed result is inferred from test existence. Select exact tests only when a behavior change or runtime gate requires them.",
  "source_read_status": "not_read",
  "need": "evidence",
  "proposed_artifact_key": "s1.core.security",
  "requires_deeper_read_for_leaf_specific_use": false,
  "semantic_acceptance": false
}
```

- `packages/core/test/sandbox-project-config.test.ts`
- `packages/core/test/tool-safety-actions.test.ts`
- `packages/core/test/tool-safety-appcontainer-runtimes.test.ts`
- `packages/core/test/tool-safety-appcontainer.test.ts`
- `packages/core/test/tool-safety-approval.test.ts`
- `packages/core/test/tool-safety-binding.test.ts`
- `packages/core/test/tool-safety-close.test.ts`
- `packages/core/test/tool-safety-git-host.test.ts`
- `packages/core/test/tool-safety-hooks.test.ts`
- `packages/core/test/tool-safety-jail-enforced.test.ts`
- `packages/core/test/tool-safety-loopback.test.ts`
- `packages/core/test/tool-safety-p1.test.ts`
- `packages/core/test/tool-safety-relay.test.ts`
- `packages/core/test/tool-safety-remediation.test.ts`
- `packages/core/test/tool-safety-sandbox-project-config.hosted.ts`
- `packages/core/test/tool-safety-sandbox-repairs.test.ts`
- `packages/core/test/tool-safety-sandbox-runtime.test.ts`
- `packages/core/test/tool-safety-sandbox-workspace-code.test.ts`
- `packages/core/test/tool-safety-sandbox.test.ts`
- `packages/core/test/tool-safety-srt-endpoint.hosted.ts`
- `packages/core/test/tool-safety-srt-read-alias.hosted.ts`
- `packages/core/test/tool-safety.test.ts`


### G159 — 12 memberships

```json
{
  "family": "tool-safety",
  "kind": "implementation",
  "depth": "representative_family_boundary",
  "justification": "Substantive tool-safety leaf, not discarded as support. The coherent family entry/authority/lifecycle boundary is sourced in s1.core.security; this individual implementation is not semantically accepted and needs deeper reading for leaf-specific claims or changes.",
  "source_read_status": "not_read",
  "need": "evidence",
  "proposed_artifact_key": "s1.core.security",
  "requires_deeper_read_for_leaf_specific_use": true,
  "semantic_acceptance": false
}
```

- `packages/core/src/sandbox-parents.ts`
- `packages/core/src/sandbox-project-config.ts`
- `packages/core/src/tool-safety-appcontainer.ts`
- `packages/core/src/tool-safety-commands.ts`
- `packages/core/src/tool-safety-git-host.ts`
- `packages/core/src/tool-safety-git.ts`
- `packages/core/src/tool-safety-hooks.ts`
- `packages/core/src/tool-safety-output.ts`
- `packages/core/src/tool-safety-profile.ts`
- `packages/core/src/tool-safety-sandbox-homes.ts`
- `packages/core/src/tool-safety-sandbox-runtime.ts`
- `packages/core/src/tool-safety-srt-read-alias.ts`


# Original exact decisive source spans

# Producer A L1 exact source evidence — compact judge projection

Source commit: `1cde2ff7a71bcf7aecb5d030917b577165135d38`. Excerpts are exact UTF-8 source slices, with source Git blob identity and inclusive line spans. They are evidence for source observations and separately labeled repository intent; they are not executed tests or live qualification. Body hashes bind the artifact map below. The full source archive remains in `sources/`; `review-evidence.md` preserves all cited anchor spans.


## C020

`packages/core/src/tool/registry.ts:ab6a6dc2f8c993aec804ebdfc73d89885e8a1453` — lines 97–108.

```typescript
    const settleWith = Effect.fn("ToolRegistry.settle")(function* (input: ExecuteInput, advertised?: object) {
      const registration =
        local.get(input.call.name)?.at(-1)?.registration ?? applications.entries().get(input.call.name)
      if (!registration)
        return {
          result: {
            type: "error" as const,
            value: advertised ? `Stale tool call: ${input.call.name}` : `Unknown tool: ${input.call.name}`,
          },
        }
      if (advertised && registration.identity !== advertised)
        return { result: { type: "error" as const, value: `Stale tool call: ${input.call.name}` } }
```


## C021

`packages/core/src/tool/AGENTS.md:98ab3e6cc58259a418b7ab80d939295a21eeba2e` — lines 43–49.

```text
## Permissions

The registry has no `PermissionV2.Service` dependency and performs no execution authorization. An internal built-in-only operation attaches a permission action solely to preserve whole-tool definition filtering; it is not part of public `Tool.make`. Most tools default to their registered name; `edit`, `write`, and `apply_patch` declare the shared `edit` action.

Definition filtering is catalog visibility, not execution authorization. A call still executes the captured leaf policy if it reaches settlement.

Built-in `Tool.withOnDemand` marks catalog metadata only. These tools stay eligible in captured definition/identity lookup and canonical settlement, but default model advertisement omits them. An explicit host-owned `advertisedNames` projection may include them; it never grants execution permission.
```


## C022

`packages/core/src/tool/read.ts:1e38e74b7231691a31d2ba217267326e74189558` — lines 17–29.

```typescript
export const name = "read"
const SUPPORTED_IMAGE_MIMES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"])
const LocationInput = Schema.Struct({
  path: Schema.String,
  offset: ReadToolFileSystem.PageInput.fields.offset.annotate({
    description: "The 1-based directory entry or text line offset to start reading from",
  }),
  limit: ReadToolFileSystem.PageInput.fields.limit.annotate({
    description: "The maximum number of directory entries or text lines to read",
  }),
})
const Input = LocationInput
const Output = Schema.Union([FileSystem.Content, ReadToolFileSystem.TextPage, ReadToolFileSystem.ListPage])
```


## C023

`packages/core/src/tool/apply-patch.ts:c8ba6c68abbd121db47475f17163d72c381f55f9` — lines 204–219.

```typescript
                )
                return { applied, files: patchFiles }
              }).pipe(Effect.mapError((error) => (error instanceof ToolFailure ? error : fail("patch"))))
            },
          }),
          "edit",
        ),
      })
      .pipe(Effect.orDie)
  }),
)

export const node = makeLocationNode({
  name: "tool/apply-patch",
  layer,
  deps: [ToolRegistry.node, LocationMutation.node, FileMutation.node, FSUtil.node, PermissionV2.node],
```


## C024

`docs/specs/v2/session.md:e3574b87bc3b12c0eca603f96821a16ec89399fc` — lines 193–200.

````text
The first built-in contribution is bounded `read`:

```text
resolve one path relative to the Location or a named project reference
-> reject absolute paths, path escapes, and symlink escapes
-> authorize read against the canonical resource identity
-> for a file: return UTF-8 text or base64 binary content; page oversized UTF-8 text by bounded line ranges
-> for a directory: return direct children in directory-first alphabetical order
````


## C025

`packages/core/src/permission.ts:2e3d29d3f1ec1fe805d21af091029721c9fa738e` — lines 130–141.

```typescript
        discard: true,
      }).pipe(
        EffectRuntime.ensuring(
          EffectRuntime.sync(() => {
            pending.clear()
          }),
        ),
      ),
    )

    const savedRules = EffectRuntime.fnUntraced(function* () {
      return (yield* saved.list({ projectID: location.project.id })).map(
```


## C026

`packages/core/src/permission.ts:2e3d29d3f1ec1fe805d21af091029721c9fa738e` — lines 282–298.

```typescript
          if (input.reply === "reject") {
            yield* Deferred.fail(
              existing.deferred,
              input.message ? new CorrectedError({ feedback: input.message }) : new DeclinedError(),
            )
            pending.delete(input.requestID)
            for (const [id, item] of pending) {
              if (item.request.sessionID !== existing.request.sessionID) continue
              yield* events.publish(Event.Replied, {
                sessionID: item.request.sessionID,
                requestID: item.request.id,
                reply: "reject",
              })
              yield* Deferred.fail(item.deferred, new DeclinedError())
              pending.delete(id)
            }
            return
```


## C027

`packages/core/src/tool-safety-sandbox.ts:61a252c15cc35fa534593413045a6f54a15b6665` — lines 103–105.

```typescript
  const reads = profile?.sandbox?.readRoots
  if (!profile?.requireSandbox && !profile?.sandbox?.enabled && grants.length === 0 && endpointGrants.length === 0 && !reads) return ordinary
  // Exact endpoint/socket capabilities never permit unconfined fallback, including during runtime acquisition.
```


## C028

`packages/core/src/tool-safety-sandbox.ts:61a252c15cc35fa534593413045a6f54a15b6665` — lines 122–130.

```typescript
  if (discovered?.kind === "none") {
    if (reads) return yield* new ToolSafety.Denied({ reason: `shell-read-sandbox-unavailable: ${discovered.reason}` })
    if (!profile?.sandbox?.unconfinedFallback) return yield* new ToolSafety.Denied({
      reason: process.platform === "darwin" || process.platform === "linux"
        ? "required-process-sandbox-unavailable" : "sandbox-platform-unavailable",
    })
    // Owner fallback remains available only without an exact network capability.
    yield* ToolSafety.reportShell({ shellWrites: "unenforced", shellSandbox: { kind: "none", reason: discovered.reason } })
    return ordinary
```


## C029

`packages/core/src/credential/cipher.ts:829dd497e04ee5729a6ab45cd5164bee9430a641` — lines 107–120.

```typescript
function keys() {
  if (loaded) return loaded
  const file = Flag.ORCHESTRA_CREDENTIAL_KEY_FILE
  if (!file) throw new Error("The credential key is not loaded; build the CredentialCipher layer first")
  loaded = [fileKey(file)]
  return loaded
}

async function keychainKey() {
  if (typeof Bun === "undefined") throw new Error("The OS keychain needs the Bun runtime")
  // Linux keychains are the Secret Service on the D-Bus session bus; without a bus (headless, CI, bare WSL) the
  // native lookup can stall for a long time before it fails, so skip it and use the key file.
  if (process.platform === "linux" && !process.env.DBUS_SESSION_BUS_ADDRESS) throw new Error("No Secret Service session bus")
  const stored = await Bun.secrets.get(KEYCHAIN)
```


## C030

`docs/specs/v2/session.md:e3574b87bc3b12c0eca603f96821a16ec89399fc` — lines 204–204.

```text
V2 `bash` uses the normal permission semantics: configured agent rules plus saved project approvals, with `ask` as the default when no rule matches. Bash is not sandboxed: the spawned shell runs with the host user's filesystem, process, and network authority. Structured external `workdir` resolution remains an enforced `external_directory` authority check. Best-effort scans of absolute command arguments produce advisory warnings only; they are not sandbox boundaries and do not request or enforce `external_directory` approval.
```


## C031

`.orchestra/skills/session-requests-usage/SKILL.md:681da4ff9bd3ae17e8181a7d5ed588aa33d4e1e3` — lines 15–19.

```text
## What Stop does

- The active turn is interrupted. The turn ends, and the tool it waited on does not run.
- Every open permission and question of the session is settled as rejected. Clients receive `permission.v2.replied` (reject) and `question.v2.rejected`, so the docks clear.
- Deny, Dismiss and Escape reject one request. Stop rejects all of them. Nothing is approved by Stop.
```


## C039

`packages/core/src/plugin.ts:5c3c232bfa46b3f8cfad106c2db4787d6c374818` — lines 23–26.

```typescript
/**
 * Live activations fail fast on another in-flight activation target with PLUGIN_DEPENDENCY_BLOCKED.
 * Independent callers queue; retired ancestry is ignored. Own live ancestry retains the load-cycle failure.
 * This is a conservative dependency policy, not a general wait-for graph or cycle proof.
```


## C040

`packages/core/src/plugin.ts:5c3c232bfa46b3f8cfad106c2db4787d6c374818` — lines 69–78.

```typescript
    const checkAccess = Effect.fnUntraced(function* (id: ID, operation: "install" | "wait" | "remove") {
      const ancestry = (yield* LoadingAncestry).filter((entry) => entry.live)
      if (ancestry.some((entry) => entry.scope === scope && entry.id === id))
        return yield* Effect.die(
          operation === "remove"
            ? `Cannot remove plugin ${id} while it is loading`
            : `Plugin load cycle detected for ${id}`,
        )
      if (ancestry.length > 0 && loading.has(id)) return yield* Effect.die(`PLUGIN_DEPENDENCY_BLOCKED: ${id}`)
      return ancestry
```


## C041

`packages/core/src/mcp.ts:3d2203cb152ef733ca3b7d3231a302416a1f394b` — lines 269–281.

```typescript
      const generation = ++current.generation
      yield* release(current)
      if (server.disabled) {
        blocked.delete(name)
        current.status = { status: "disabled" }
        return
      }
      if (server.type === "local" && found.unapproved.has(name)) {
        blocked.add(name)
        current.status = failed(
          `Not started: this project's config declares a local command for this server. ${ConfigTrust.approveHint(location.directory)}`,
        )
        return
```


## C042

`packages/core/src/skill.ts:dc8d8f67c6b658ce7716a2b17e0c9b2e517c6db0` — lines 174–188.

```typescript
      const owners = new Map(
        sources
          .filter((source) => data.reserved.includes(source.key))
          .flatMap((source) => source.skills.map((skill) => [skill.name, source.key] as const)),
      )
      const skills = new Map<string, Info>()
      for (const source of sources) {
        for (const skill of source.skills) {
          const owner = owners.get(skill.name)
          if (owner === undefined || owner === source.key) {
            skills.set(skill.name, skill)
            continue
          }
          if (!shadowed.has(skill.location))
            yield* Effect.logWarning(`Ignoring skill ${skill.location}: the name ${skill.name} is reserved by a bundled skill`)
```


## C043

`packages/core/src/agent.ts:53870dcf9d34423ab49a1241e88ec5c5db0985cf` — lines 69–84.

```typescript
    const selectable = (agent: Info | undefined) =>
      agent && agent.mode !== "subagent" && !agent.hidden ? agent : undefined
    // Maestro is the default unless configuration names another selectable agent. No other agent becomes the
    // default implicitly, so without Maestro an omitted-agent Session resolves to no agent.
    const selectedDefault = () => {
      const data = state.get()
      const configured = data.default ? selectable(data.agents.get(data.default)) : undefined
      return configured ?? selectable(data.agents.get(defaultID))
    }

    return Service.of({
      transform: state.transform,
      reload: state.reload,
      withPermissions: (id, use) => state.withRead((data) => use(
        data.agents.get(id)?.permissions ?? [{ action: "*", resource: "*", effect: "deny" }],
      )),
```


## C044

`packages/core/src/integration.ts:d6d9a85e8c9b2737b1f09f95700c05663735e6e4` — lines 367–384.

```typescript
    const scrub = Effect.fnUntraced(function* () {
      const now = yield* Clock.currentTimeMillis
      const expired = yield* SynchronizedRef.modify(attempts, (current) => {
        const next = new Map(current)
        const scopes: Scope.Closeable[] = []
        for (const [id, attempt] of current) {
          if (attempt.status === "pending" && attempt.time.expires <= now) {
            scopes.push(attempt.scope)
            next.set(id, {
              status: "expired",
              integrationID: attempt.integrationID,
              time: attempt.time,
              removeAt: now + terminalRetention,
            })
            continue
          }
          if (attempt.status !== "pending" && attempt.removeAt <= now) next.delete(id)
        }
```


## C045

`packages/core/src/capability/invocation.ts:e2ddcb3e3f0da61b8d9d5fe8c7c74436b844e890` — lines 88–101.

```typescript
  return Effect.gen(function* () {
    const current = yield* Current
    if (!current || current[issued] !== true || !proof || !matches(parentContext, current.invocation) ||
      proof.parentCallID !== current.invocation.callID || !Number.isSafeInteger(proof.ordinal) ||
      proof.ordinal < 1 || proof.ordinal > 64 || current.lineage.length >= 8 ||
      proof.callID !== childID(current.invocation, proof.ordinal) ||
      typeof proof.toolName !== "string" || !/^[A-Za-z][A-Za-z0-9_-]{0,63}(?![\s\S])/.test(proof.toolName) ||
      typeof proof.requestHash !== "string" || !/^[0-9a-f]{64}(?![\s\S])/.test(proof.requestHash)) return yield* mismatch()
    const frame: Frame = Object.freeze({
      ...current,
      invocation: Object.freeze({ ...current.invocation, callID: proof.callID }),
      lineage: Object.freeze([...current.lineage, Object.freeze({
        callID: proof.callID, parentCallID: proof.parentCallID, ordinal: proof.ordinal,
        toolName: proof.toolName, requestHash: proof.requestHash,
```


## C046

`packages/core/src/capability/policy.ts:d75718a6ac8d6d3e36c5b791301a68a728be26b0` — lines 104–110.

```typescript
    // Native floor is restrict-only: later allow/ask rules cannot erase any captured deny.
    const floor = binding.nativeDenyFloor.filter((rule) => rule.effect === "deny")
    const effects = input.resources.map((resource) => {
      if (PermissionV2.evaluate(input.action, resource, floor).effect === "deny") return "deny"
      return PermissionV2.evaluate(input.action, resource, binding.effectiveRules).effect
    })
    if (effects.includes("deny")) return yield* denied()
```


## C047

`packages/core/src/capability/policy.ts:d75718a6ac8d6d3e36c5b791301a68a728be26b0` — lines 141–165.

```typescript
  const commitMany = <A, E, R>(supplied: readonly Permit[], write: (tx: Transaction) => Effect.Effect<A, E, R>) =>
    Effect.gen(function* () {
      const pending = [...supplied]
      const permit = pending[0]
      if (!permit || pending.length > 16 || pending.some((item) => !item || item[approved] !== true ||
        !permits.has(item) || item.binding !== permit.binding)) return yield* mismatch()
      if (!database.inTransaction) return yield* Effect.die("Capability commit requires SQL transaction identity")
      if (yield* database.inTransaction) return yield* mismatch()
      // Lock ordering is actor state -> SQLite writer. Approval never happens under either lock.
      return yield* agents.withPermissions(permit.context.agent, () => database.db.transaction((tx) => Effect.gen(function* () {
        const current = yield* CapabilityInvocation.require(permit.context, {
          projectID: location.project.id,
          location: Location.Ref.make({ directory: location.directory, workspaceID: location.workspaceID }),
        })
        if (current !== permit.binding) return yield* mismatch()
        yield* validate(current)
        yield* Effect.forEach(pending, (item) => Effect.gen(function* () {
          const request = { sessionID: item.context.sessionID, agent: item.context.agent,
            action: item.action, resources: [...item.resources] }
          if ((yield* permissions.evaluate(request).pipe(
            Effect.catchTag("Session.NotFoundError", () => Effect.fail(mismatch())),
          )) === "deny") return yield* denied()
        }))
        return yield* write(tx)
      }), { behavior: "immediate" }))
```


## C048

`packages/core/src/capability/mcp/README.md:95f3154aef1625eaac3cd8feb500504996eb074f` — lines 94–106.

```text
## Deliberate limits and caller responsibilities

- POST Streamable HTTP only: no GET listener, reconnection, resumability, retry,
  legacy SSE/stdio fallback, OAuth refresh/discovery, tasks, roots or sampling.
- A disconnect before a response fails. HTTP 404 invalidates the current session;
  a later explicit host operation can open a new one. A call is never reposted.
- Aborting local fetch or deleting a session does not prove a remote mutation was
  cancelled. Callers must retain durable intent and reconcile ambiguous failures;
  post-dispatch loss without a definitive correlated result/error reports
  `outcome_unknown`, including disconnect, body loss, malformed results, ambiguous
  HTTP errors and timeout. Definitive HTTP 401/403/404 and correlated protocol
  errors retain typed failures. Interruption retains its Effect cause and still
  requires reconciliation; neither abort nor DELETE proves remote nonexecution.
```



# Supplemental exact source spans

## Preserved conflicts and mandatory limits

- Session rules: the runner merges Session rules (AEX009) while ordinary PermissionV2.configured returns selected-agent permissions. Both executable branches are included. No universal enforcement/ignoring claim is substituted.
- Bash: original C030 preserves the old unsandboxed wording. Added foreground/background permission→wrapper branches and the current AGENTS requirement preserve the actual conditional confinement boundary. C027/C028 preserve no-requirement/fallback cases.
- Permission rejection: original C026 and C031 retain implementation fan-out versus one-request guide wording. No source here resolves that conflict by fiat.
- Binary read: original C022 and C024 preserve the current supported-image restriction versus the earlier broad binary description.
- Native MCP bounds remain normative README authority. The transport implementation was not captured/read here; behavioral guarantees beyond the inspected policy/registration boundary remain mandatory gaps.
- 599 unread implementation leaves, seven orientation-only frozen entries and external engine/OS/provider boundaries remain outside exhaustive semantic acceptance. This revision supplies material source context; it does not certify those members or qualify runtime.


### AEX009

**Artifacts:** `s1.core.session-execution`, `s1.core.security`, `s1.core.context`.

**Claim/limit supported:** Stored placement and governance precede promotion; agent and Session rules are materialized; missing context is initialized before input visibility and new input resets the step allowance.

**Authority:** `observed_implementation`. **Source:** `packages/core/src/session/runner/llm.ts:c3ad8d87a58923d40797d38a77ff65367bbe66b6`, lines 185–215.

**Source commit:** `1cde2ff7a71bcf7aecb5d030917b577165135d38`; **full source SHA256:** `03b1068354e6bc049f2f30125f413f2b2a966817ac59e69e98bce561c87305c7`; **excerpt SHA256:** `40a74fe87d62c5123691e911ff20e4b37e59b8e4d3d30ed7c6cfeeb3cee56802` (1724 bytes).

````text
    const runTurnAttempt = Effect.fn("SessionRunner.runTurn")(function* (
      sessionID: SessionSchema.ID,
      promotion: SessionInput.Delivery | undefined,
      step: number,
      recoverOverflow?: typeof compaction.compactAfterOverflow,
    ) {
      const session = yield* getSession(sessionID)
      if (session.location.directory !== location.directory || session.location.workspaceID !== location.workspaceID)
        return yield* Effect.interrupt
      // Before agent selection and promotion: a refused turn leaves pending input pending.
      yield* governance.beforeTurn(session)
      const agent = yield* agents.select(session.agent)
      // A Session's own permission rules, after its agent's as the earlier runtime merged them, so a Session rule wins over the agent's.
      const effectiveRules = [
        ...(agent.info?.permissions.map((rule) => ({ ...rule })) ?? []),
        ...(yield* store.permissions(session.id)),
      ]
      const initialized = yield* SessionContextEpoch.initialize(db, loadSystemContext(session.id, agent), session.id)
      const toolFibers = yield* FiberSet.make<void, ToolOutputStore.Error>()
      let needsContinuation = false
      let currentStep = step
      if (promotion) {
        const cutoff = yield* EventV2.latestSequence(db, session.id)
        let promoted = 0
        if (promotion === "steer") promoted = yield* SessionInput.promoteSteers(db, events, session.id, cutoff)
        if (promotion === "queue") {
          promoted += Number(yield* SessionInput.promoteNextQueued(db, events, session.id))
          promoted += yield* SessionInput.promoteSteers(db, events, session.id, cutoff)
        }
        if (promoted > 0) {
          currentStep = 1
````


### AEX028

**Artifacts:** `s1.core.tools`.

**Claim/limit supported:** Canonical Tool.make decodes input and encodes/validates output, mapping violations to ToolFailure.

**Authority:** `observed_implementation`. **Source:** `packages/core/src/tool/tool.ts:2ecde42373ef59b1bf2352e6272141a610feea16`, lines 102–122.

**Source commit:** `1cde2ff7a71bcf7aecb5d030917b577165135d38`; **full source SHA256:** `69633b1e0a9932a7b6d7126f7f9c86a2147869544c295416dfae817e4639643e`; **excerpt SHA256:** `380555d95b7ae4aa1f43c17dd1e3d97d50dcdcd172f5e10cab8509d8eca4387e` (1071 bytes).

````text
    settle: (call, context) =>
      Schema.decodeUnknownEffect(config.input)(call.input).pipe(
        Effect.mapError((error) => new ToolFailure({ message: `Invalid tool input: ${error.message}` })),
        Effect.flatMap((input) =>
          config.execute(input, context).pipe(
            Effect.flatMap((output) =>
              Schema.encodeEffect(config.output)(output).pipe(
                Effect.flatMap((output) => {
                  if (!config.structured || !config.toStructuredOutput)
                    return Effect.succeed({ output, structured: output })
                  return Schema.encodeEffect(config.structured)(config.toStructuredOutput({ input, output })).pipe(
                    Effect.map((structured) => ({ output, structured })),
                  )
                }),
                Effect.mapError(
                  (error) =>
                    new ToolFailure({
                      message: `Tool returned an invalid value for its output schema: ${error.message}`,
                    }),
                ),
              ),
````


### AEX029

**Artifacts:** `s1.core.tools`.

**Claim/limit supported:** Tool.dynamic passes input undecoded to its external owner; local JSON Schema decoding must not be inferred.

**Authority:** `observed_implementation`. **Source:** `packages/core/src/tool/tool.ts:2ecde42373ef59b1bf2352e6272141a610feea16`, lines 156–177.

**Source commit:** `1cde2ff7a71bcf7aecb5d030917b577165135d38`; **full source SHA256:** `69633b1e0a9932a7b6d7126f7f9c86a2147869544c295416dfae817e4639643e`; **excerpt SHA256:** `a3c4679c3514d44d563ddbc8a1dd38567f4d3b4bd5ee3a4ccc2f75aa50729be1` (896 bytes).

````text
/**
 * A tool whose input contract is a JSON Schema owned by another system, such as an MCP server. The input reaches
 * `execute` undecoded: the owner validates it.
 */
export function dynamic(config: {
  readonly description: string
  readonly inputSchema: JsonSchema.JsonSchema
  readonly execute: (input: unknown, context: Context) => Effect.Effect<ToolOutput, ToolFailure>
}): AnyTool {
  const tool = Object.freeze({}) as AnyTool
  const definitions = new Map<string, ToolDefinition>()
  runtimes.set(tool, {
    definition: (name) => {
      const cached = definitions.get(name)
      if (cached) return cached
      const definition = new ToolDefinition({ name, description: config.description, inputSchema: config.inputSchema })
      definitions.set(name, definition)
      return definition
    },
    settle: (call, context) => config.execute(call.input, context),
  })
  return tool
````


### AEX030

**Artifacts:** `s1.core.tools`.

**Claim/limit supported:** Safety inspection precedes contextual bounding; Lean projection is selected only when generic bounding has not already retained a full file.

**Authority:** `observed_implementation`. **Source:** `packages/core/src/tool/registry.ts:ab6a6dc2f8c993aec804ebdfc73d89885e8a1453`, lines 145–173.

**Source commit:** `1cde2ff7a71bcf7aecb5d030917b577165135d38`; **full source SHA256:** `276f5d6bc32ca3020058a0e8acb429301a834d77d0a4382c09c3ebe8b647f085`; **excerpt SHA256:** `0901e6b8ed67a3034c6981bf0958916ed8ee2b375e1bad68f10c9ef83f99bdc8` (1635 bytes).

````text
          const output = attempted.value
          yield* safety.inspect(output)
          const bounded = yield* resources.bound({ sessionID: input.sessionID, toolCallID: input.call.id, output })
          // Lean selects the model view of a complete result only; a bounded result already points at its full file.
          const projected = bounded.outputPaths.length
            ? ToolSafetyOutput.nudge(bounded.output, bounded.outputPaths, yield* resources.limits())
            : location ? yield* lean(input, output, bounded.output, location) : bounded.output
          const result = ToolOutput.toResultValue(projected)
          if (result.type === "error")
            return bounded.outputPaths.length > 0 ? { result, outputPaths: bounded.outputPaths } : { result }
          return bounded.outputPaths.length > 0
            ? { result, output: projected, outputPaths: bounded.outputPaths }
            : { result, output: projected }
        })
      return yield* safety.run(
        invocation,
        acquire ? acquire(invocation, settlement) : settlement,
        (observation) => events ? Effect.gen(function* () {
          yield* events.publish(SessionEvent.Tool.Progress, {
            timestamp: yield* DateTime.now,
            sessionID: input.sessionID,
            assistantMessageID: input.assistantMessageID,
            callID: input.call.id,
            structured: { toolSafety: observation },
            content: [],
          }, { location })
        }) : Effect.void,
        (settlement) => settlement.result.type === "error" ? "failure" : ToolSafetyOutput.outcome(settlement.output),
      ).pipe(
````


### AEX031

**Artifacts:** `s1.core.tools`.

**Claim/limit supported:** Scoped cleanup removes its own registrations, and latest local entries overlay process registrations during materialization.

**Authority:** `observed_implementation`. **Source:** `packages/core/src/tool/registry.ts:ab6a6dc2f8c993aec804ebdfc73d89885e8a1453`, lines 243–274.

**Source commit:** `1cde2ff7a71bcf7aecb5d030917b577165135d38`; **full source SHA256:** `276f5d6bc32ca3020058a0e8acb429301a834d77d0a4382c09c3ebe8b647f085`; **excerpt SHA256:** `a06a94b6ef1b38598f48b9c325a65f0c13b2d57c50944b79c9b8664ef5a7bf91` (1630 bytes).

````text
      register: Effect.fn("ToolRegistry.register")(function* (tools) {
        const entries = Object.entries(tools)
        if (entries.length === 0) return
        yield* Effect.forEach(entries, ([name]) => validateName(name), { discard: true })
        yield* Effect.uninterruptible(
          Effect.gen(function* () {
            const token = {}
            for (const [name, tool] of entries)
              local.set(name, [...(local.get(name) ?? []), { token, registration: { identity: {}, tool } }])
            yield* Effect.addFinalizer(() =>
              Effect.sync(() => {
                for (const [name] of entries) {
                  const registrations = local.get(name)?.filter((registration) => registration.token !== token) ?? []
                  if (registrations.length > 0) local.set(name, registrations)
                  else local.delete(name)
                }
              }),
            )
          }),
        )
      }),
      materialize: Effect.fn("ToolRegistry.materialize")(function* (permissions = [], options) {
        const registrations = new Map(applications.entries())
        for (const [name, entries] of local) {
          const registration = entries.at(-1)?.registration
          if (registration) registrations.set(name, registration)
        }
        for (const [name, registration] of registrations)
          if (whollyDisabled(permission(registration.tool, name), permissions)) registrations.delete(name)
        const definitions = new Map(
          Array.from(registrations, ([name, registration]) => [name, definition(name, registration.tool)] as const),
        )
````


### AEX032

**Artifacts:** `s1.core.tools`.

**Claim/limit supported:** Registry composition depends on safety/output, not PermissionV2; ordinary action/resource authorization remains a leaf boundary.

**Authority:** `observed_implementation`. **Source:** `packages/core/src/tool/registry.ts:ab6a6dc2f8c993aec804ebdfc73d89885e8a1453`, lines 321–334.

**Source commit:** `1cde2ff7a71bcf7aecb5d030917b577165135d38`; **full source SHA256:** `276f5d6bc32ca3020058a0e8acb429301a834d77d0a4382c09c3ebe8b647f085`; **excerpt SHA256:** `ea906471c29ba8d9454c854588d40127e924f466947419a325441a6b21f95891` (646 bytes).

````text
export const node = makeLocationNode({
  service: Service,
  layer,
  deps: [ApplicationTools.node, ToolOutputStore.node, ToolSafety.node],
})

/** Native host composition replacements: captures real Location/Event services while constructing the registry. */
export const nativeNode = makeLocationNode({
  service: Service, layer: nativeLayer,
  deps: [ApplicationTools.node, ToolOutputStore.node, ToolSafety.node, Location.node, EventV2.node],
})
export const nativeToolsNode = makeLocationNode({
  service: Tools.Service, layer: nativeLayer,
  deps: [ApplicationTools.node, ToolOutputStore.node, ToolSafety.node, Location.node, EventV2.node],
````


### AEX033

**Artifacts:** `s1.core.tools`.

**Claim/limit supported:** The generic bound limits contextual text but preserves structured output and media; managed paths remain observable.

**Authority:** `observed_implementation`. **Source:** `packages/core/src/tool-output-store.ts:605a99e72e0482a998e2521a26f025589f81da68`, lines 165–200.

**Source commit:** `1cde2ff7a71bcf7aecb5d030917b577165135d38`; **full source SHA256:** `179b486daca21ebf7aa9302cd7c5135f8afd0d2df1d719ad9826da0fdcbb50d8`; **excerpt SHA256:** `fd4f3b8d80a50b0ffa17b119cfdcb14d0f873db6e8f3bc2dd2b762c1543a9ed9` (1374 bytes).

````text
    const bound = Effect.fn("ToolOutputStore.bound")(function* (input: BoundInput) {
      const outputLimits = yield* limits()
      const media = input.output.content.filter((item) => item.type === "file")
      const text = input.output.content.filter((item) => item.type === "text")
      const contextual =
        input.output.content.length === 0
          ? yield* Effect.try({
              try: () => JSON.stringify(input.output.structured, null, 2) ?? String(input.output.structured),
              catch: (cause) => new StorageError({ operation: "encode", cause }),
            })
          : text.map((item) => item.text).join("")
      if (
        lineCount(contextual) <= outputLimits.maxLines &&
        Buffer.byteLength(contextual, "utf-8") <= outputLimits.maxBytes
      )
        return {
          output: input.output,
          outputPaths: [],
        }

      const outputPath = yield* write(contextual)
      const marker = `... output truncated; full content saved to ${outputPath} ...`

      return {
        output: {
          structured: input.output.structured,
          content: [
            {
              type: "text" as const,
              text: boundedPreview(contextual, marker, outputLimits.maxLines, outputLimits.maxBytes),
            },
            ...media,
          ],
        },
        outputPaths: [outputPath],
      }
````


### AEX034

**Artifacts:** `s1.core.tools`.

**Claim/limit supported:** Default contextual limits and retained-output lifetime are fixed constants.

**Authority:** `observed_implementation`. **Source:** `packages/core/src/tool-output-store.ts:605a99e72e0482a998e2521a26f025589f81da68`, lines 16–19.

**Source commit:** `1cde2ff7a71bcf7aecb5d030917b577165135d38`; **full source SHA256:** `179b486daca21ebf7aa9302cd7c5135f8afd0d2df1d719ad9826da0fdcbb50d8`; **excerpt SHA256:** `d10720a05d25042b0f1f41c05ecdc646a0ca177c6ccc58abb767d63e212f0cc8` (109 bytes).

````text
export const MAX_LINES = 2_000
export const MAX_BYTES = 50 * 1024
export const RETENTION = Duration.days(7)

````


### AEX035

**Artifacts:** `s1.core.tools`.

**Claim/limit supported:** Retention deletes only old tool_* files; capture/body state is not inferred from a model preview.

**Authority:** `observed_implementation`. **Source:** `packages/core/src/tool-output-store.ts:605a99e72e0482a998e2521a26f025589f81da68`, lines 203–215.

**Source commit:** `1cde2ff7a71bcf7aecb5d030917b577165135d38`; **full source SHA256:** `179b486daca21ebf7aa9302cd7c5135f8afd0d2df1d719ad9826da0fdcbb50d8`; **excerpt SHA256:** `3997df78515c887ddd9c50c542c8edc0ff10b38a0d475e050ed83dff1b14db94` (716 bytes).

````text
    const cleanup = Effect.fn("ToolOutputStore.cleanup")(function* () {
      const entries = yield* fs.readDirectory(directory).pipe(Effect.catch(() => Effect.succeed([])))
      const cutoff = Date.now() - Duration.toMillis(RETENTION)
      for (const entry of entries) {
        if (!entry.startsWith("tool_")) continue
        const file = path.join(directory, entry)
        const info = yield* fs.stat(file).pipe(Effect.catch(() => Effect.void))
        const modified = info?.mtime.pipe(
          Option.map((date) => date.getTime()),
          Option.getOrElse(() => 0),
        )
        if (modified !== undefined && modified < cutoff) yield* fs.remove(file).pipe(Effect.catch(() => Effect.void))
      }
````


### AEX036

**Artifacts:** `s1.core.security`.

**Claim/limit supported:** Rule evaluation is last-match with default ask.

**Authority:** `observed_implementation`. **Source:** `packages/core/src/permission.ts:2e3d29d3f1ec1fe805d21af091029721c9fa738e`, lines 76–85.

**Source commit:** `1cde2ff7a71bcf7aecb5d030917b577165135d38`; **full source SHA256:** `19e4a3668e1689c0b9565cb4d09444e155e1a06a571484e37e642d3cff3857d6`; **excerpt SHA256:** `216c5fe263c3dafe28825e350af01962771cab5b94c2c0d2666360c6b48c3911` (328 bytes).

````text
export function evaluate(action: string, resource: string, ...rulesets: Permission.Ruleset[]): Permission.Rule {
  return (
    rulesets
      .flat()
      .findLast((rule) => Wildcard.match(action, rule.action) && Wildcard.match(resource, rule.resource)) ?? {
      action,
      resource: "*",
      effect: "ask",
    }
  )
````


### AEX037

**Artifacts:** `s1.core.security`.

**Claim/limit supported:** Ordinary configured authorization resolves agent permissions, and configured deny precedes saved project allow; compare Session rules in the runner excerpt.

**Authority:** `observed_implementation`. **Source:** `packages/core/src/permission.ts:2e3d29d3f1ec1fe805d21af091029721c9fa738e`, lines 140–170.

**Source commit:** `1cde2ff7a71bcf7aecb5d030917b577165135d38`; **full source SHA256:** `19e4a3668e1689c0b9565cb4d09444e155e1a06a571484e37e642d3cff3857d6`; **excerpt SHA256:** `f13c5dc4f2aa57b618ce0741c79c05b9a6bed23961e40415570768adaf648a07` (1545 bytes).

````text
    const savedRules = EffectRuntime.fnUntraced(function* () {
      return (yield* saved.list({ projectID: location.project.id })).map(
        (item): Permission.Rule => ({ action: item.action, resource: item.resource, effect: "allow" }),
      )
    })

    const configured = EffectRuntime.fn("PermissionV2.configured")(function* (
      sessionID: SessionV2.ID,
      agentID?: AgentV2.ID,
    ) {
      const session = yield* sessions.get(sessionID)
      if (!session) return yield* new SessionV2.NotFoundError({ sessionID })
      const agent = yield* agents.resolve(agentID ?? session.agent)
      return agent?.permissions ?? missingAgentPermissions
    })

    function denied(input: AssertInput, rules: Permission.Ruleset) {
      return input.resources.some((resource) => evaluate(input.action, resource, rules).effect === "deny")
    }

    function relevant(input: AssertInput, rules: Permission.Ruleset) {
      return rules.filter((rule) => Wildcard.match(input.action, rule.action))
    }

    const evaluateInput = EffectRuntime.fnUntraced(function* (input: AssertInput) {
      const rules = yield* configured(input.sessionID, input.agent)
      if (denied(input, rules)) return { effect: "deny" as const, rules }
      const all = [...rules, ...(yield* savedRules())]
      const effects = input.resources.map((resource) => evaluate(input.action, resource, all).effect)
      const effect: Permission.Effect = effects.includes("deny") ? "deny" : effects.includes("ask") ? "ask" : "allow"
      return { effect, rules: all }
````


### AEX038

**Artifacts:** `s1.core.security`.

**Claim/limit supported:** Bash permission precedes profile handling; read-only agents require confinement without fallback; confined background launches are refused.

**Authority:** `observed_implementation`. **Source:** `packages/core/src/tool/bash.ts:6f047c8ba423c3656bbd03ef12f5f41ea6b0c68b`, lines 193–217.

**Source commit:** `1cde2ff7a71bcf7aecb5d030917b577165135d38`; **full source SHA256:** `e16afdfbf390d4350be701b010c5c6be44e36c313deffd2a4761ee827a618473`; **excerpt SHA256:** `ca224d3de695daab052a1baf8ca3b9cddb40374c061036784a06171793c72f06` (1391 bytes).

````text
              yield* permission.assert({
                action: name,
                resources: [input.command],
                save: [input.command],
                sessionID: context.sessionID,
                agent: context.agent,
                source,
              })

              if ((yield* fs.stat(target.canonical)).type !== "Directory")
                return yield* Effect.fail(new Error(`Working directory is not a directory: ${target.canonical}`))

              const project = yield* ToolSafety.RuntimeProfile
              // A read-only agent's shell runs inside the OS sandbox with no write root; a host without one refuses the command.
              const profile = context.agent && READ_ONLY_SHELL.has(context.agent)
                ? {
                    ...project,
                    writeRoots: [],
                    requireSandbox: true,
                    sandbox: { ...project?.sandbox, enabled: true, scratch: true, unconfinedFallback: false },
                  } satisfies ToolSafety.Profile
                : project
              // A background process outlives the call, so a profile that confines shells refuses it.
              if (input.background && (profile?.requireSandbox || profile?.sandbox?.enabled || profile?.sandbox?.readRoots))
                return yield* new ToolSafety.Denied({ reason: "background-process-sandbox-unbound" })
````


### AEX039

**Artifacts:** `s1.core.security`.

**Claim/limit supported:** Background launch preparation uses the same sandbox wrapper with its lifetime bound to the process.

**Authority:** `observed_implementation`. **Source:** `packages/core/src/tool/bash.ts:6f047c8ba423c3656bbd03ef12f5f41ea6b0c68b`, lines 233–245.

**Source commit:** `1cde2ff7a71bcf7aecb5d030917b577165135d38`; **full source SHA256:** `e16afdfbf390d4350be701b010c5c6be44e36c313deffd2a4761ee827a618473`; **excerpt SHA256:** `a912a5db0b6c45314424b6f18fe663b87a9a5df12cdee88f70d37b22bfd7d668` (789 bytes).

````text
              if (input.background) {
                if (Option.isNone(sessionProcess))
                  return yield* new ToolFailure({ message: "Session process registry is unavailable" })
                // The same confinement and environment scrub as a foreground call, kept open for the process's life.
                const launched = yield* sessionProcess.value.launch({
                  sessionID: context.sessionID,
                  command,
                  title: input.command,
                  prepare: (command) =>
                    ToolSafetySandbox.wrap(command, { prepareParents: true }).pipe(
                      Effect.provideService(FSUtil.Service, fs),
                      Effect.provideService(ToolSafety.RuntimeProfile, profile),
                    ),
````


### AEX040

**Artifacts:** `s1.core.security`.

**Claim/limit supported:** Foreground execution wraps before agent-terminal launch; this is the actual order needed to interpret the older unsandboxed claim.

**Authority:** `observed_implementation`. **Source:** `packages/core/src/tool/bash.ts:6f047c8ba423c3656bbd03ef12f5f41ea6b0c68b`, lines 255–267.

**Source commit:** `1cde2ff7a71bcf7aecb5d030917b577165135d38`; **full source SHA256:** `e16afdfbf390d4350be701b010c5c6be44e36c313deffd2a4761ee827a618473`; **excerpt SHA256:** `69e73d0d28d4e608c9b67c5ea24fcbd984e13128d076a6223a3e4155d8e413de` (825 bytes).

````text
              const result = yield* Effect.scoped(Effect.gen(function* () {
                const inspector = OutputInspector.make()
                const wrapped = yield* ToolSafetySandbox.wrap(command, { prepareParents: true }).pipe(
                  Effect.provideService(FSUtil.Service, fs),
                  Effect.provideService(ToolSafety.RuntimeProfile, profile),
                )
                // Same confinement and inspection, but the command runs in a terminal tab the owner can see and answer.
                if (wrapped._tag === "StandardCommand" && AgentTerminal.enabled(wrapped)) {
                  const ran = yield* AgentTerminal.run(pty, {
                    command: wrapped,
                    title: input.command,
                    timeout,
                    maxChars: MAX_CAPTURE_BYTES,
````


### AEX041

**Artifacts:** `s1.core.security`.

**Claim/limit supported:** Environment scrub is limited to tool children and recognized patterns; discovery alone does not establish confinement.

**Authority:** `observed_implementation`. **Source:** `packages/core/src/tool-safety-sandbox.ts:61a252c15cc35fa534593413045a6f54a15b6665`, lines 24–47.

**Source commit:** `1cde2ff7a71bcf7aecb5d030917b577165135d38`; **full source SHA256:** `bbf5091b282f9fbeea862f3ebc3d9365a87a59fb414197eb6524268fbc32478a`; **excerpt SHA256:** `9a7106a9a342184ee35c180abd873c30d9fb08dfc94d26488b6c7126a6e86d18` (1396 bytes).

````text
/** Tool-child environment only. Never applied to provider adapters or the server process. */
export function environment(input: NodeJS.ProcessEnv = process.env) {
  return Object.fromEntries(Object.entries(input).filter(([name, value]) =>
    value !== undefined && !/(?:TOKEN|SECRET|PASSWORD|PASSWD|PRIVATE_KEY|API_KEY|ACCESS_KEY|CREDENTIAL)/i.test(name) &&
    !["SSH_AUTH_SOCK", "SSH_ASKPASS", "GIT_ASKPASS", "ORCHESTRA_AUTH_CONTENT"].includes(name) &&
    !/\b(?:AKIA|ASIA)[A-Z0-9]{16}\b|\bgh[pousr]_[A-Za-z0-9]{36,}\b|\bsk_live_[A-Za-z0-9]{20,}\b/.test(value)))
}

/** The macOS seatbelt launcher. A host without it (or with this pointed elsewhere) has no seatbelt sandbox. */
export const Seatbelt = Context.Reference<string>("@orchestra/ToolSafetySandbox/Seatbelt", {
  defaultValue: () => "/usr/bin/sandbox-exec",
})

/** Discovery performs filesystem checks only; confinement starts when the caller spawns the command. */
export const available = (executable?: string) => Effect.gen(function* () {
  const seatbelt = yield* Seatbelt
  return yield* Effect.tryPromise({
    try: async () => {
      const binary = await which(executable ?? "srt", { nothrow: true })
      if (binary || executable || process.platform !== "darwin") return binary
      return which(seatbelt, { nothrow: true })
    },
    catch: () => new ToolSafety.Denied({ reason: "sandbox-binary-acquisition" }),
  })
````


### AEX042

**Artifacts:** `s1.core.security`.

**Claim/limit supported:** Agent terminal is opt-in, excludes Windows/verbatim command paths and takes an already confined command.

**Authority:** `observed_implementation`. **Source:** `packages/core/src/tool/agent-terminal.ts:d8cbde3d8436081eb9c3815bea334915e6efef0b`, lines 36–44.

**Source commit:** `1cde2ff7a71bcf7aecb5d030917b577165135d38`; **full source SHA256:** `a869ee14c21054a21d7f7adbe289588655f49d3c1cad7d21b6d4f22a30000fc4`; **excerpt SHA256:** `db4250f446e1abe7840677cdbf1a1256ea0f54ac86d9a97558a65b30b4cb52b7` (653 bytes).

````text
export function enabled(command: ChildProcess.StandardCommand) {
  // cmd.exe parses its own command line and needs omni's verbatim form, which a PTY spawn cannot take.
  return Flag.ORCHESTRA_AGENT_TERMINAL && process.platform !== "win32" && OmniSpawner.program(command).verbatim === undefined
}

/**
 * Runs an already confined command in a PTY of its own so the owner sees it in a tab and can answer it. The caller
 * keeps the sandbox scope open until this returns. Resolves undefined on timeout, fails Denied when the output shows a
 * recognized secret, and kills the process on either. A finished command's tab stays, as an exited terminal does.
````


### AEX043

**Artifacts:** `s1.core.security`.

**Claim/limit supported:** Cipher implementation uses AES-256-GCM with a random 12-byte IV and auth tag.

**Authority:** `observed_implementation`. **Source:** `packages/core/src/credential/cipher.ts:829dd497e04ee5729a6ab45cd5164bee9430a641`, lines 27–37.

**Source commit:** `1cde2ff7a71bcf7aecb5d030917b577165135d38`; **full source SHA256:** `599393f98c4a3dbc80ccaaf14bbdaee62417a557dc1425f77fd4781dc8e7edd7`; **excerpt SHA256:** `2b32b9c003c4820d511b3f1b0defe5dc7af350482bf958e35c91231fc9c28a9c` (587 bytes).

````text
export function seal(plain: string, key = keys()[0]) {
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", key, iv)
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()])
  return PREFIX + Buffer.concat([iv, cipher.getAuthTag(), data]).toString("base64")
}

/** Returns the plaintext, or undefined when no loaded key opens the sealed text. */
export function open(text: string) {
  const raw = Buffer.from(text.slice(PREFIX.length), "base64")
  return keys().reduce<string | undefined>((plain, key) => plain ?? attempt(key, raw), undefined)
````


### AEX044

**Artifacts:** `s1.core.security`.

**Claim/limit supported:** OS keychain is preferred; fallback to a data-directory key file is explicitly weaker.

**Authority:** `observed_implementation`. **Source:** `packages/core/src/credential/cipher.ts:829dd497e04ee5729a6ab45cd5164bee9430a641`, lines 57–75.

**Source commit:** `1cde2ff7a71bcf7aecb5d030917b577165135d38`; **full source SHA256:** `599393f98c4a3dbc80ccaaf14bbdaee62417a557dc1425f77fd4781dc8e7edd7`; **excerpt SHA256:** `f8cbeb99fd06e013efb47a865c17419a26f493c65d0aea1a80938ce8ea8c797c` (855 bytes).

````text
function load() {
  return Effect.gen(function* () {
    const file = Flag.ORCHESTRA_CREDENTIAL_KEY_FILE
    if (file) {
      yield* Effect.promise(() => refuseNewKey(file))
      return [fileKey(file)]
    }
    const { Global } = yield* Effect.promise(() => import("../global"))
    const fallback = path.join(Global.Path.data, "credential.key")
    const keychain = yield* Effect.tryPromise(() => keychainKey()).pipe(Effect.timeout("10 seconds"), Effect.option)
    if (Option.isSome(keychain)) return [keychain.value, ...(existsSync(fallback) ? [fileKey(fallback)] : [])]
    yield* Effect.logWarning(
      "OS keychain unavailable: stored credentials are encrypted with a key file in the data directory, which is weaker",
      { path: fallback },
    )
    yield* Effect.promise(() => refuseNewKey(fallback))
    return [fileKey(fallback)]
  })
}
````


### AEX045

**Artifacts:** `s1.core.security`.

**Claim/limit supported:** Memory inheritance is opt-in; legacy sealing failure preserves readability; undecodable rows are skipped and left untouched.

**Authority:** `observed_implementation`. **Source:** `packages/core/src/credential.ts:3161ca0d7f1e4c68a372acb97234eab80a9024b2`, lines 83–117.

**Source commit:** `1cde2ff7a71bcf7aecb5d030917b577165135d38`; **full source SHA256:** `d091c6c02c5ba51b930ac55cf8ca473d048f8b336e9dccf310e2c2f6f978b2e8`; **excerpt SHA256:** `d74e28a7457cc84f7f8d8dcedb4ddb6c3e6d7156cf3b1c6190ede36093efa0ab` (1524 bytes).

````text
 * Returns the release database to inherit credentials from, or undefined when
 * this build must stay isolated.
 */
export function inheritedPath(active = Database.path(), release = Database.releasePath()) {
  const flag = Flag.ORCHESTRA_INHERIT_CREDENTIALS
  if (flag === false) return
  if (active === ":memory:" && flag !== true) return
  if (active !== ":memory:" && resolve(active) === resolve(release)) return
  return release
}

export const layerFrom = (release: string | undefined) =>
  Layer.effect(
    Service,
    Effect.gen(function* () {
      const { db } = yield* Database.Service
      // Loads the key before any credential row is sealed or opened.
      yield* CredentialCipher.Service
      yield* sealLegacy(db).pipe(
        Effect.catchCause((cause) =>
          Effect.logError("could not encrypt plaintext credentials; they stay readable", {
            reason: String(Cause.squash(cause)),
          }),
        ),
      )
      const decode = Schema.decodeUnknownOption(Value)
      // A row that does not decode (in practice: sealed under a key this process cannot load) is reported and
      // skipped, never deleted or overwritten.
      const stored = Effect.fnUntraced(function* (row: typeof CredentialTable.$inferSelect) {
        if (!row.integration_id) return
        const value = decode(row.value)
        if (Option.isNone(value)) {
          yield* Effect.logError("stored credential cannot be decrypted; it is left untouched", { credentialID: row.id })
          return
        }
````


### AEX046

**Artifacts:** `s1.core.security`, `s1.core.entry`.

**Claim/limit supported:** Current terminal instructions require the sandbox-before-PTY ordering and exact environment boundary.

**Authority:** `repository_normative_documentation`. **Source:** `AGENTS.md:ef3b523b0c00aed722582b870c1919188edc4c4f`, lines 182–192.

**Source commit:** `1cde2ff7a71bcf7aecb5d030917b577165135d38`; **full source SHA256:** `07acaefb95db4b07b4e76c4255f7d6e0ecc4c7466b46fbf6ec5e5cdf6cc01b4f`; **excerpt SHA256:** `4f5b2378f8eb397a98a143b26af09bf856f0a06ad9204f8567ae8beda212ffab` (1186 bytes).

````text
## Terminal and PTY

Background: `docs/specs/terminal/`; ownership and traps: `.orchestra/skills/terminal-maintenance`.

- The agent terminal exists only in the V2 session core's bash tool (`packages/core`). The agent runs a bash command in a PTY only through `AgentTerminal.run` (`packages/core/src/tool/agent-terminal.ts`) inside the bash tool, after `ToolSafetySandbox.wrap`. Never build an agent PTY from `Pty.create` with the default environment, which inherits `process.env` and skips the sandbox.
- Text that goes to the model is `AgentTerminal.sanitize`d. Terminal output is data, never instruction.
- Shell marks (OSC 133) count only with the session's nonce. OSC 7 (`Info.cwd`) is a hint without one; do not use it for decisions that need trust.
- The PTY cursor and ring (`BUFFER_LIMIT`) count UTF-16 characters, not bytes.
- The `Pty` service is served over HTTP by `packages/server/src/handlers/pty.ts`. The app uses `/api/pty`.
- `ORCHESTRA_AGENT_TERMINAL` and `ORCHESTRA_SHELL_INTEGRATION` are permanent opt-in flags in `flag/flag.ts`; read them through `Flag`, never `process.env`.
- Known limit: a WebSocket client that stops reading makes the server grow; not solved.
````


### AEX055

**Artifacts:** `s1.core.extensions`.

**Claim/limit supported:** State rebuilds from initial plus ordered transforms, finalizes before commit, and serializes rebuild/read with a semaphore.

**Authority:** `observed_implementation`. **Source:** `packages/core/src/state.ts:116e268bb9edf045985e1598a4e1a3ed1d410872`, lines 63–91.

**Source commit:** `1cde2ff7a71bcf7aecb5d030917b577165135d38`; **full source SHA256:** `237de5f76069595f50c7e7049dc72fe295a6b0ecaa615d849ef5b67ecd9f4189`; **excerpt SHA256:** `bb8eee95e1b8be1ebfc1b768f1565cc3492f0f147da72b8ca9ef167d7567eec7` (1155 bytes).

````text
export function create<State, DraftApi>(options: Options<State, DraftApi>): Interface<State, DraftApi> {
  let state = options.initial()
  let transforms: { run: TransformCallback<DraftApi> }[] = []
  const semaphore = Semaphore.makeUnsafe(1)

  const commit = Effect.fn("State.commit")(function* (next: State) {
    const api = options.draft(next)
    if (options.finalize) yield* options.finalize(api)
    state = next
  })

  const apply = (transform: TransformCallback<DraftApi>, draft: DraftApi) =>
    Effect.suspend(() => {
      const result = transform(draft)
      return Effect.isEffect(result) ? Effect.asVoid(result).pipe(Effect.orDie) : Effect.void
    })

  const materialize = Effect.fnUntraced(function* () {
    const next = options.initial()
    const api = options.draft(next)
    for (const transform of transforms) yield* apply(transform.run, api).pipe(Effect.withSpan("State.reload.update"))
    yield* commit(next)
  })

  const reload = () => semaphore.withPermit(materialize())

  const result: Interface<State, DraftApi> = {
    get: () => state,
    withRead: (read) => semaphore.withPermit(Effect.suspend(() => read(state))),
````


### AEX056

**Artifacts:** `s1.core.extensions`.

**Claim/limit supported:** Plugin activation uses a child scope, publishes only after materialization, and closes/replays after failure.

**Authority:** `observed_implementation`. **Source:** `packages/core/src/plugin.ts:5c3c232bfa46b3f8cfad106c2db4787d6c374818`, lines 115–151.

**Source commit:** `1cde2ff7a71bcf7aecb5d030917b577165135d38`; **full source SHA256:** `8b7221fadc81a9cac0b7a1b3229a3bdb098966c8474c261b9ae971d9ad7d4302`; **excerpt SHA256:** `a81d00696236d7272c0c9920bdeb0bf9173d85d9a58c7560d25490e2b7f75b63` (1786 bytes).

````text
          if (retain && active.has(id)) return
          const child = yield* Scope.fork(scope)
          const reloads = new Set<State.Reload>()
          const token = { scope, id, live: true }
          loading.add(id)
          failures.delete(id)
          const activate = Effect.gen(function* () {
            const existing = active.get(id)
            active.delete(id)
            if (existing) yield* Scope.close(existing, Exit.void)
            yield* effect(host).pipe(
              Scope.provide(child),
              Effect.withSpan("Plugin.load", { attributes: { "plugin.id": id } }),
            )
            yield* settle(reloads, boot).pipe(Scope.provide(child))
            yield* Effect.uninterruptible(
              Effect.gen(function* () {
                yield* events.publish(Event.Added, { id })
                active.set(id, child)
                yield* Effect.forEach(waiters.get(id) ?? [], (waiter) => Deferred.succeed(waiter, undefined), {
                  discard: true,
                })
                waiters.delete(id)
              }),
            ).pipe(Effect.provideService(StateBatch, undefined))
          })
          yield* Effect.uninterruptibleMask((restore) =>
            Effect.gen(function* () {
              const primary = yield* restore(activate).pipe(Effect.exit)
              if (Exit.isSuccess(primary)) return
              active.delete(id)
              const combined = yield* closeAndReplay(child, primary, reloads, boot)
              failures.set(id, combined)
              yield* Effect.forEach(waiters.get(id) ?? [], (waiter) => Deferred.done(waiter, combined), {
                discard: true,
              }).pipe(Effect.ensuring(Effect.sync(() => waiters.delete(id))))
              return yield* combined
````


### AEX057

**Artifacts:** `s1.core.extensions`.

**Claim/limit supported:** Boot retry is collected flush followed by per-plugin reinstall after failure; this is not outer-batch durable atomicity.

**Authority:** `observed_implementation`. **Source:** `packages/core/src/plugin.ts:5c3c232bfa46b3f8cfad106c2db4787d6c374818`, lines 187–207.

**Source commit:** `1cde2ff7a71bcf7aecb5d030917b577165135d38`; **full source SHA256:** `8b7221fadc81a9cac0b7a1b3229a3bdb098966c8474c261b9ae971d9ad7d4302`; **excerpt SHA256:** `26b5001b777fffbd379a0fdbb0a7ac676074fe66f09a6e6dedc03f885bb86c36` (1184 bytes).

````text
    const boot = Effect.fn("Plugin.boot")(function* (
      plugins: Iterable<{ readonly id: ID; readonly effect: PluginRuntime["effect"] }>,
    ) {
      const reloads = new Set<State.Reload>()
      const installed: { readonly id: ID; readonly effect: PluginRuntime["effect"] }[] = []
      const booted = yield* Effect.forEach(
        plugins,
        (plugin) =>
          install(plugin.id, plugin.effect, false, reloads).pipe(
            Effect.andThen(Effect.sync(() => installed.push(plugin))),
          ),
        { discard: true },
      ).pipe(Effect.exit)
      const flushed = yield* flush(reloads).pipe(Effect.exit)
      if (Exit.isSuccess(flushed)) return yield* booted
      // One flush cannot tell which plugin's state failed. Remove the booted plugins, then add them back one at a
      // time so the per-plugin flush rolls back the failing one and stops there, as a boot of plain adds would.
      yield* Effect.forEach(installed.toReversed(), (plugin) => remove(plugin.id).pipe(Effect.exit), { discard: true })
      yield* Effect.forEach(installed, (plugin) => install(plugin.id, plugin.effect, false), { discard: true })
      return yield* booted
    })
````


### AEX058

**Artifacts:** `s1.core.extensions`.

**Claim/limit supported:** Each ordinary MCP call asserts its namespaced permission and forwards cancellation and timeout to the SDK.

**Authority:** `observed_implementation`. **Source:** `packages/core/src/mcp.ts:3d2203cb152ef733ca3b7d3231a302416a1f394b`, lines 235–263.

**Source commit:** `1cde2ff7a71bcf7aecb5d030917b577165135d38`; **full source SHA256:** `73c99e41cceb9e58ba89ca9b7aa93049b5aa3620a962ee5166e5496fc8c78f59`; **excerpt SHA256:** `a96a12bface5460a64ba71b4f8fa58ab12d45c8f9eec707091d51a23721e679b` (1667 bytes).

````text
    const mcpTool = (server: string, client: Client, def: ListToolsResult["tools"][number], timeout: number) =>
      Tool.dynamic({
        description: def.description ?? "",
        inputSchema: { ...def.inputSchema, type: "object", properties: def.inputSchema.properties ?? {} },
        execute: (input, context) =>
          Effect.gen(function* () {
            yield* permission.assert({
              action: McpCatalog.toolName(server, def.name),
              resources: ["*"],
              save: ["*"],
              metadata: { server, tool: def.name },
              sessionID: context.sessionID,
              agent: context.agent,
              source: { type: "tool", messageID: context.assistantMessageID, callID: context.toolCallID },
            })
            const result = yield* Effect.tryPromise((signal) =>
              client.callTool(
                { name: def.name, arguments: isObject(input) ? input : {} },
                CallToolResultSchema,
                // The MCP SDK only sends a progress token when `onprogress` is set, which enables timeout resets.
                { signal, timeout, resetTimeoutOnProgress: true, onprogress: () => {} },
              ),
            )
            if ("toolResult" in result) return yield* Effect.fail(new Error("MCP tool returned no content"))
            if (result.isError) return yield* Effect.fail(new Error(McpCatalog.resultText(result) || "MCP tool returned an error"))
            return { structured: result.structuredContent ?? {}, content: McpCatalog.resultContent(result) }
          }).pipe(Effect.mapError((error) => new ToolFailure({ message: error.message }))),
      })

````


### AEX059

**Artifacts:** `s1.core.extensions`.

**Claim/limit supported:** Stale asynchronous connection/catalog results close their client before registration; connected follows successful tools registration.

**Authority:** `observed_implementation`. **Source:** `packages/core/src/mcp.ts:3d2203cb152ef733ca3b7d3231a302416a1f394b`, lines 283–309.

**Source commit:** `1cde2ff7a71bcf7aecb5d030917b577165135d38`; **full source SHA256:** `73c99e41cceb9e58ba89ca9b7aa93049b5aa3620a962ee5166e5496fc8c78f59`; **excerpt SHA256:** `7596c50ca4f5c6c1b197e640be2c61da9200dc0fca8e6877afd08a00d900b4a9` (1253 bytes).

````text
      blocked.delete(name)
      const startup = server.timeout?.startup ?? found.timeout?.startup ?? DEFAULT_TIMEOUT
      const request = server.timeout?.request ?? found.timeout?.request ?? DEFAULT_TIMEOUT
      const opened = yield* open(name, server, startup)
      const client = opened.client
      if (current.generation !== generation) {
        if (client) yield* Effect.promise(() => client.close().catch(() => undefined))
        return
      }
      if (!client) {
        current.status = opened.status
        return
      }
      const listed = client.getServerCapabilities()?.tools
        ? yield* McpCatalog.tools(client, request).pipe(Effect.result)
        : undefined
      if (current.generation !== generation) return yield* Effect.promise(() => client.close().catch(() => undefined))
      if (listed?._tag === "Failure") {
        yield* Effect.promise(() => client.close().catch(() => undefined))
        current.status = failed(
          McpStdio.failure(opened.transport, new Error(`Listing tools failed: ${messageOf(listed.failure)}`)),
        )
        return
      }
      const defs = listed?.success ?? []
      // Connected is reported only once the server's tools are in the registry.
      current.client = client
````


### AEX060

**Artifacts:** `s1.core.extensions`.

**Claim/limit supported:** Generation invalidation prevents stale in-flight skill loading from refilling a new cache.

**Authority:** `observed_implementation`. **Source:** `packages/core/src/skill.ts:dc8d8f67c6b658ce7716a2b17e0c9b2e517c6db0`, lines 153–172.

**Source commit:** `1cde2ff7a71bcf7aecb5d030917b577165135d38`; **full source SHA256:** `07c062a4f778a329572ba0217df3e72315c61bf5baa135414324af63dd28a18b`; **excerpt SHA256:** `e40643e1c1479fe8d72d0d372730d699ba2c4fdb81dc94c10eec089136e6d2b8` (983 bytes).

````text
    // QUESTION(Dax): Should local skill sources invalidate on filesystem watch
    // events, following the reload policy chosen for other context sources?
    const cache = new Map<string, Info[]>()
    // A write bumps the generation, so a list() that started loading before it cannot refill the cache.
    const generation = { current: 0 }
    const invalidate = () => {
      generation.current++
      cache.clear()
    }
    // Each dropped skill file is reported once, not on every list.
    const shadowed = new Set<string>()
    const list = Effect.fn("SkillV2.list")(function* () {
      const started = generation.current
      const data = state.get()
      const sources: { key: string; skills: Info[] }[] = []
      for (const source of data.sources) {
        const key = Source.key(source)
        const loaded = cache.get(key) ?? (yield* load(source))
        if (generation.current === started) cache.set(key, loaded)
        sources.push({ key, skills: loaded })
````


### AEX061

**Artifacts:** `s1.core.extensions`.

**Claim/limit supported:** OAuth attempts are synchronized in-memory state owned by the Location layer; this map does not establish a durable resumable workflow.

**Authority:** `observed_implementation`. **Source:** `packages/core/src/integration.ts:d6d9a85e8c9b2737b1f09f95700c05663735e6e4`, lines 231–238.

**Source commit:** `1cde2ff7a71bcf7aecb5d030917b577165135d38`; **full source SHA256:** `d1952b88c361ed35ac1dd3b2f736b6aa9588bd7e82db37c1f88fb878f09f9796`; **excerpt SHA256:** `2f145cb1b2e6a1da3e03631f4ca8b4524d65392196c697ca5876a3fd92046bea` (341 bytes).

````text
export const locationLayer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const credentials = yield* Credential.Service
    const events = yield* EventV2.Service
    const scope = yield* Scope.Scope
    const attempts = SynchronizedRef.makeUnsafe(new Map<AttemptID, AttemptEntry>())
    const state = State.create<Data, Draft>({
````


### AEX062

**Artifacts:** `s1.core.capability`.

**Claim/limit supported:** The issued-frame symbol is private and the host boundary expressly does not prove persisted Session/tool-part existence.

**Authority:** `observed_implementation`. **Source:** `packages/core/src/capability/invocation.ts:e2ddcb3e3f0da61b8d9d5fe8c7c74436b844e890`, lines 34–50.

**Source commit:** `1cde2ff7a71bcf7aecb5d030917b577165135d38`; **full source SHA256:** `6f7d95bbb07aa7d3e12c63d56dbf8458bde5b7053aaf51f97b078c41a2da53ae`; **excerpt SHA256:** `a2ae78bd0dff991cf5b4361aaca7432b3a7bd56e284e6f130f3ebedb502b2b8f` (664 bytes).

````text
const issued = Symbol("CapabilityInvocation.issued")
type Frame = Binding & { readonly [issued]: true }
const Current = Context.Reference<Frame | undefined>("@orchestra/core/CapabilityInvocation", {
  defaultValue: () => undefined,
})
const Input = Schema.Struct({
  issuer: Schema.Literals(["app", "core", "sdk"]),
  owner: Capability.Owner,
  invocation: Capability.InvocationRef,
  rootToolName: Schema.NonEmptyString,
  effectiveRules: Permission.Ruleset,
  nativeDenyFloor: Permission.Ruleset,
})

/** Trusted host boundary only: validates caller claims, not persisted Session/tool-part existence. */
export function withContext<A, E, R>(
  input: HostInput,
````


### AEX063

**Artifacts:** `s1.core.capability`.

**Claim/limit supported:** Persisted validation rechecks placement, current root pending/running tool and the exact running child lineage.

**Authority:** `observed_implementation`. **Source:** `packages/core/src/capability/policy.ts:d75718a6ac8d6d3e36c5b791301a68a728be26b0`, lines 35–78.

**Source commit:** `1cde2ff7a71bcf7aecb5d030917b577165135d38`; **full source SHA256:** `9ae8ac1edc77785058071356c0927b1d8c1a019a2b6be5cdf564c3b0dad65022`; **excerpt SHA256:** `ed0cf6e1c4a25ec2b18050e5d5837504dc00fe09d64a29d3194f9e2fb828a196` (2701 bytes).

````text
  const validate = Effect.fn("CapabilityPolicy.validate")(function* (binding: CapabilityInvocation.Binding) {
    const session = yield* sessions.get(binding.owner.sessionID)
    const stored = yield* sessions.message(binding.rootInvocation.assistantMessageID)
    if (
      !session ||
      session.id !== binding.owner.sessionID ||
      session.projectID !== binding.owner.projectID ||
      session.location.directory !== binding.owner.location.directory ||
      session.location.workspaceID !== binding.owner.location.workspaceID ||
      !stored ||
      stored.sessionID !== binding.rootInvocation.sessionID ||
      stored.message.id !== binding.rootInvocation.assistantMessageID ||
      stored.message.type !== "assistant" ||
      stored.message.agent !== binding.rootInvocation.agentID ||
      !stored.message.content.some(
        (part) =>
          part.type === "tool" &&
          part.id === binding.rootInvocation.callID &&
          part.name === binding.rootToolName &&
          (part.state.status === "pending" || part.state.status === "running"),
      )
    )
      return yield* mismatch()
    if (binding.lineage.length > 8) return yield* mismatch()
    yield* Effect.forEach(binding.lineage, (proof, index) => Effect.gen(function* () {
      const parentCallID = index === 0 ? binding.rootInvocation.callID : binding.lineage[index - 1]?.callID
      const row = yield* database.db.select().from(CapabilityChildTable)
        .where(eq(CapabilityChildTable.id, proof.callID)).get().pipe(
          Effect.catchIf((error) => error instanceof SqlError || error instanceof EffectDrizzleQueryError,
            () => Effect.fail(mismatch())),
        )
      if (!row || proof.parentCallID !== parentCallID || !Number.isSafeInteger(proof.ordinal) ||
        proof.ordinal < 1 || proof.ordinal > 64 || proof.callID !== CapabilityInvocation.childID({
          ...binding.rootInvocation, callID: proof.parentCallID,
        }, proof.ordinal) || row.id !== proof.callID || row.session_id !== binding.owner.sessionID ||
        row.agent_id !== binding.owner.agentID || row.assistant_message_id !== binding.rootInvocation.assistantMessageID ||
        row.root_call_id !== binding.rootInvocation.callID || row.root_tool_name !== binding.rootToolName ||
        row.parent_call_id !== proof.parentCallID || row.ordinal !== proof.ordinal || row.depth !== index + 1 ||
        row.tool_name !== proof.toolName || row.request_hash !== proof.requestHash || row.state !== "running")
        return yield* mismatch()
    }), { discard: true })
    if (binding.invocation.callID !== (binding.lineage.at(-1)?.callID ?? binding.rootInvocation.callID))
      return yield* mismatch()
  })
````


### AEX064

**Artifacts:** `s1.core.capability`.

**Claim/limit supported:** Leaf construction/registration is Location-owned and lazy vendor I/O stays first-use; a failed noninterrupt startup sweep is logged.

**Authority:** `observed_implementation`. **Source:** `packages/core/src/capability/tools.ts:1103ab0c8eb3d9d79cc5ff295cb267847eab629e`, lines 36–68.

**Source commit:** `1cde2ff7a71bcf7aecb5d030917b577165135d38`; **full source SHA256:** `7704b7d8c7742deece88da2fd87f6fb2064eb580659548d159565f10893d3b46`; **excerpt SHA256:** `1f073ebdbe1ec722b474dc85fea55007e56ef2d6ae722d8c121a7b2c605f442c` (2436 bytes).

````text
// Stable canonical leaves are registered once per Location. Account resolution and vendor I/O stay first-use.
export const node = makeLocationNode({
  name: "capability/tools",
  layer: Layer.effectDiscard(Effect.gen(function* () {
    const tools = yield* Tools.Service
    const connections = yield* CapabilityConnections.make
    const jobs = yield* CapabilityJobs.make
    const location = yield* Location.Service
    const registry = yield* CapabilityProcessRegistry.Service
    // Startup-only evidence: rows this host never held are lost. A sweep failure must not block the Location.
    yield* CapabilityProcessSweep.run({ jobs, live: registry.live(), startedAt: registry.startedAt,
      placement: { projectID: location.project.id,
        location: Location.Ref.make({ directory: location.directory, workspaceID: location.workspaceID }) } }).pipe(
      Effect.catchCauseIf((cause) => !Cause.hasInterrupts(cause), (cause) => Effect.logWarning("process sweep failed", { cause })))
    const processControl = yield* CapabilityProcessControl.make({ jobs })
    const schedule = yield* CapabilitySchedule.make()
    const artifacts = yield* CapabilityArtifacts.make()
    const channels = yield* CapabilityChannels.make({ connections, jobs, artifacts })
    const media = yield* CapabilityMedia.make()
    const documents = yield* CapabilityDocuments.make()
    const sheets = yield* CapabilitySheets.make()
    const transport = CapabilityMcp.make()
    const discovery = yield* CapabilityDiscovery.make({ source: { listTools: (selection) => transport.listTools(selection).pipe(
      Effect.map((catalog) => CapabilityServiceProviders.filterCatalog(selection.connection.provider, catalog)),
    ) } })
    const execute = yield* CapabilityServiceExecution.make({ transport, discovery, connections, jobs, artifacts,
      filterCatalog: CapabilityServiceProviders.filterCatalog })
    const services = yield* CapabilityServices.make({ discovery, execute })
    yield* tools.register({ ...channels.tools, ...media.tools, ...documents, ...sheets, ...services.tools, ...processControl.tools, ...schedule.tools }).pipe(Effect.orDie)
  }).pipe(Effect.orDie)),
  deps: [ToolRegistry.node, EventV2.node, AgentV2.node, Credential.node, Database.node, Location.node,
    PermissionV2.node, SessionStore.node, Global.node, FSUtil.node,
    CapabilityProcessRegistry.node, LocationMutation.node, AppProcess.node, ScheduledTaskPort.node],
````


### AEX065

**Artifacts:** `s1.core.capability`.

**Claim/limit supported:** The host binds scheduler process state and an absent binding defects explicitly.

**Authority:** `observed_implementation`. **Source:** `packages/core/src/scheduled-task/port.ts:8ea347436e18a93f8dc43926c7fb84108fc0a20c`, lines 7–26.

**Source commit:** `1cde2ff7a71bcf7aecb5d030917b577165135d38`; **full source SHA256:** `5fb969a9e8a030b02e31ff1678e1e0c2887c4e30c3078a5016642131de95ead7`; **excerpt SHA256:** `3e4e3ec6645c53013117f41f8dcdf0041ce290b35a0d91c481b07edd5f70ea5c` (1002 bytes).

````text
// Capability tools reach the scheduler through this port so the Location graph never imports the
// Session graph (Session -> LocationServiceMap -> capability tools would close a type cycle). Location
// graphs hoist their own global nodes, so the running scheduler binds itself here for the process.
export class Service extends Context.Service<Service, ScheduledTaskCapability.Interface>()("@orchestra/v2/ScheduledTaskPort") {}

const state: { bound?: ScheduledTaskCapability.Interface } = {}

/** Called by the scheduler layer; the previous binding is restored when that layer's Scope closes. */
export const bind = (api: ScheduledTaskCapability.Interface) => Effect.acquireRelease(
  Effect.sync(() => {
    const previous = state.bound
    state.bound = api
    return previous
  }),
  (previous) => Effect.sync(() => {
    state.bound = previous
  }),
)

const current = Effect.suspend(() => state.bound ? Effect.succeed(state.bound) : Effect.die("schedule_manage requires the host scheduler"))
````


### AEX066

**Artifacts:** `s1.core.capability`.

**Claim/limit supported:** Transport catalog/session bounds are documented by the native MCP owner; this is normative intent, not a newly observed implementation run.

**Authority:** `repository_normative_documentation`. **Source:** `packages/core/src/capability/mcp/README.md:95f3154aef1625eaac3cd8feb500504996eb074f`, lines 43–70.

**Source commit:** `1cde2ff7a71bcf7aecb5d030917b577165135d38`; **full source SHA256:** `f9b7b9df6645714b942f2adc46c9c1a727def9ea39a1f9e33782519bb14ca662`; **excerpt SHA256:** `dad31b1ba08d4e1cef714ba7f71b284c5b63f5573f4dbbb87bccc912ea80a47b` (1967 bytes).

````text
## Bounds and lifecycle

Defaults: 4 MiB aggregate catalog envelopes (including initialization and all read
SSE framing/notifications), 256 tools, 16 pages, 4 MiB call response envelopes,
256 KiB encoded requests, 30 seconds total acquisition/call, four scoped sessions
per factory, 512 generation identities, and 64 JSON-RPC SSE messages per acquisition
or call. UTF-8 bytes are counted before decoding/buffering/parsing. JSON nesting
is bounded at 64, cursor bytes at 4096, session IDs at 256 visible ASCII characters,
tool names at 256 characters, descriptions at 2048, and credential headers at 16384.
Positive integer options are required; timeout must fit a native timer.
Incoming HTTP headers are subject to native fetch's bounds, not a custom aggregate
header-byte quota. Only the assigned session-ID value has the transport's explicit header bound.

Catalog acquisition returns complete coverage only after the terminal page.
Duplicates, cursor cycles and all exhausted budgets fail. `byteLength` measures
response body bytes, including full envelopes and read SSE framing, not HTTP header
or compressed wire bytes. SSE acquisition ends at the correlated response and cancels
its reader; later unsolicited traffic is not read or included. Repeat session lists
include the original initialization byte cost in their catalog budget.

Generations increase monotonically within a factory. Keys bind Connection/Target
references and generations, owner and approved endpoint; values hash all sorted raw
tools, including schemas, descriptions and metadata. Identical catalogs reuse their
generation. A full identity map fails closed rather than evicting and reusing history.
Create one host factory for the required generation lifetime; generations are not
persisted or deterministic across host restarts: numeric generations depend on each
factory's acquisition order. Credential rotation always requires an explicit new
open; sessions are never shared or pooled.
````

