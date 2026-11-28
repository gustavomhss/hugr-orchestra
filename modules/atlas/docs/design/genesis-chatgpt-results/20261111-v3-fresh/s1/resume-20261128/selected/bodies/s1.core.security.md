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
