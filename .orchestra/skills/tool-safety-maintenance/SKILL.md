---
name: tool-safety-maintenance
description: Who owns each piece of the Orchestra tool-safety stack (profile checks, shell sandbox backends, git guards, output inspection, Relay hooks), the invariants that must not regress, and how to change and test it
---

# Tool safety maintenance and ownership

Everything lives in `packages/core/src` (`tool-safety*.ts`, plus `sandbox-parents.ts`, `sandbox-project-config.ts`, `output-inspector.ts`, `tcp-proxy.ts`). Terminal and PTY rules are in `terminal-maintenance`; this skill covers the policy and the sandbox that wrap a tool call.

## Ownership

| Piece | Owner file | Rule |
|---|---|---|
| Service, `Denied`, HOLD text, remediation table | `tool-safety.ts` | `before` (static checks), `run` (observe, hooks, sanitize), `inspect`, `session` (Session-event hooks). `Denied.message` keeps the first line exactly `Tool safety HOLD: <reason>` (tests match it) and appends a second remediation line from the `remediations` table |
| Profile type, host-bound preferences | `tool-safety.ts` (`Profile`) | Never decoded from tool arguments or inherited environment. `native(profile)` strips hooks; hooks are `run`'s alone |
| Profile loader | `tool-safety-profile.ts` (`makeLoader`) | Reads `<state>/<projectID>/profile/preferences.json` and Relay's `hooks.json`: regular file, at most 512 KiB, no symlink, unchanged while read, strict decode. The state directory may not lie inside the project (`profile-state-inside-project`) |
| Raw command forms | `tool-safety-commands.ts` | `reason` (gate bypass, destructive, catastrophic delete and find, unrecoverable `git clean`) and `actions` (push, commit, merge, release, publish, deploy, delete, removeexternal) are closed raw regexes. No shell parsing: native shell permission owns every other spelling |
| Git add and commit hygiene | `tool-safety-git.ts` | Runs from `before` for any command matching `git ... add|commit`; every failure is a named `git-hygiene-*` reason |
| Shell sandbox: wrap and confine | `tool-safety-sandbox.ts` | `wrap` confines a shell command for the bash tool and other command producers; `confine` is the no-network launcher for language servers and formatters; `runsWorkspaceCode` decides whether a program must be confined |
| Linux runtime (srt over bubblewrap) | `tool-safety-sandbox-runtime.ts`, `tool-safety-srt-read-alias.ts` | Pinned `@anthropic-ai/sandbox-runtime` 0.0.78 plus four npm dependencies and ripgrep, each verified against a pinned integrity digest before anything is extracted. The read-alias patch applies only to the one verified upstream file hash |
| Sandbox homes, toolchain reads | `tool-safety-sandbox-homes.ts` | `toolchain`, `homeGrants`, `secrets`, `canonical`: what a read-confined command may see |
| Windows AppContainer | `tool-safety-appcontainer.ts`, `tool-safety-git-host.ts` | Launch through the omni supervisor for pwsh and cmd only; the one read-only git call that cannot start inside the container runs on the host under `tool-safety-git-host.ts` |
| Project config guard | `sandbox-project-config.ts` | A sandboxed command never writes `orchestra.json(c)`, `tui.json(c)` or `.orchestra` in the working directory, the project root or any ancestor, because the host executes what they name |
| Missing write-root parents | `sandbox-parents.ts` | `plan` before approval, `prepare` only when the caller passes `prepareParents: true` after the shell's permission approval |
| Loopback endpoint broker | `tcp-proxy.ts` | macOS only: host Unix broker for owned route-adapted clients; kernel TCP stays denied. Linux uses srt's strict-allowlist proxy plus the forwarder script embedded in `tool-safety-sandbox.ts` |
| Secret scan | `output-inspector.ts` | A recognized shape latches HOLD (`recognized-secret-output`); `quarantine` delays retention by a fixed window of 64 UTF-16 units |
| Output outcome and nudge | `tool-safety-output.ts` | `outcome` derives success, failure or cancelled from producer metadata (`cancelled`, `timeout`, `exit`, `exitCode`); `nudge` rewrites the first text part when the output overflowed |
| Relay hooks on the tool path | `tool-safety-hooks.ts` | `before` and `after` over one profile snapshot loaded at the start of the call. Hooks only restrict: Block, Repair, a rejected Approve and a failed Verify deny; Remind, Record and Allow grant nothing |
| Agent PTY | `tool/agent-terminal.ts` | Always through `AgentTerminal.run` inside the bash tool, after `ToolSafetySandbox.wrap`. See `terminal-maintenance` |

Callers of `ToolSafetySandbox.wrap` or `confine` today: `tool/bash.ts`, `capability/process-control`, `lsp/launch.ts` and `lsp/lsp.ts`, `format/format.ts`, `research-toolkit`, `relay.ts`, `session/runner/hosted-call.ts` and Maestro's `v2/workflow/settlement.ts`. Re-run `grep -rn "ToolSafetySandbox\.\(wrap\|confine\)" packages modules --include='*.ts'` before relying on this list.

## Invariants

- Every shell command that must be confined goes through `ToolSafetySandbox.wrap` (language servers and formatters through `confine`). Never build a child process for a tool from the default environment: `wrap` strips credential-shaped names (`TOKEN`, `SECRET`, `PASSWORD`, `API_KEY`, ...), `SSH_AUTH_SOCK`, `SSH_ASKPASS`, `GIT_ASKPASS`, `ORCHESTRA_AUTH_CONTENT` and values that look like AWS, GitHub or Stripe keys. That environment is for tool children only, never for provider adapters or the server.
- Exact capabilities never fall back to an unconfined run: exact Unix sockets, exact loopback endpoints and `readRoots` (confined reads) refuse the command when no backend is ready, whatever `unconfinedFallback` says. Only a profile with `unconfinedFallback` and none of those capabilities may run unconfined, and then `reportShell` records `shellWrites: "unenforced"`; a later enforced fact never hides it.
- A pipeline (`pipeTo`) under a sandbox profile is confined per side, or refused with `sandbox-pipeline-unbound` when the profile sets an exact grant.
- Always-denied paths: Orchestra's data and state directories, `~/.ssh`, `~/.aws`, `~/.git-credentials`, `~/.npmrc`, plus the profile's `managedPaths`, `sandbox.denyPaths` and `neverTouch`. With confined reads, missing credential names are denied too, so a file created later stays unreadable.
- Policy paths are literal subtrees. A glob (`*`, `?`, `[`) in a deny path is refused with a `sandbox-*-glob-policy-unenforceable` reason; only a trailing `/**` is accepted on seatbelt and Linux. Do not turn a refusal into a silent skip.
- The project-config guard is separate from the profile's `protectedWrites`: an owner-approved edit-tool exception (`allowedConfigEdits`) does not reach the shell, and combining `protectedWrites` with `allowedConfigEdits` makes the shell policy inexpressible (`sandbox-config-write-exception-unenforceable`).
- `prepareParents` is passed only by the native host after the shell's permission approval; pre-hooks leave it absent. A new write-root parent is never created before approval.
- The Linux runtime is fetched only from the pinned URLs, verified against the pinned digest before any byte reaches disk, extracted in staging and moved into place with one rename. Changing a pin, the version or the read-alias patch changes the install directory (`<version>-<REVISION>-<arch>`); bump `REVISION` in `tool-safety-srt-read-alias.ts` with the patch. The patch refuses to apply when the upstream file hash or a patch anchor no longer matches.
- Output that holds a recognized credential shape is discarded, not redacted (`recognized-secret-output`). The scan is for recognized shapes only (private key blocks, `AKIA`/`ASIA`, `gh[pousr]_`, `sk_live_`, `sk-proj-`); it is not confinement. If a closed shape ever needs a longer minimum, extend the `quarantine` window with it.
- `Denied` reasons are an interface. The remediation table covers only codes raised by these modules; approval, completion and Maestro profile-snapshot codes belong to their owners and keep the bare first line. Add a table entry with every new reason that a model can act on.
- Hooks are one snapshot per call: `run` loads the profile once, so the after hooks see the same installs as the before hooks even if `hooks.json` changes meanwhile. Each install must still match its sha256 at load.
- No new agent PTY outside `AgentTerminal.run`. `bun run check:spawn-imports` must stay green; spawn through `ChildProcessSpawner` or `Process` only.

## Testing

Tests run on GitHub Actions only: `bun run test:ci core <files>` from the repository root (see AGENTS.md for the omni control and the local-run guard).

- Core policy: `test/tool-safety.test.ts`, `tool-safety-p1.test.ts`, `tool-safety-actions.test.ts`, `tool-safety-binding.test.ts`, `tool-safety-approval.test.ts`, `tool-safety-close.test.ts`, `tool-safety-remediation.test.ts`.
- Sandbox: `tool-safety-sandbox.test.ts`, `tool-safety-sandbox-repairs.test.ts`, `tool-safety-sandbox-runtime.test.ts`, `tool-safety-sandbox-workspace-code.test.ts`, `tool-safety-jail-enforced.test.ts`, `tool-safety-loopback.test.ts`, `sandbox-project-config.test.ts`, `tcp-proxy.test.ts`.
- Windows: `tool-safety-appcontainer.test.ts`, `tool-safety-appcontainer-runtimes.test.ts`, `tool-safety-git-host.test.ts`.
- Hooks: `tool-safety-hooks.test.ts`, `tool-safety-relay.test.ts`.
- Agent terminal: `agent-terminal.test.ts`, `agent-terminal-e2e.test.ts`.
- `tool-safety-sandbox-project-config.hosted.ts`, `tool-safety-srt-endpoint.hosted.ts` and `tool-safety-srt-read-alias.hosted.ts` do not match the `*.test.ts` pattern: they need a host with the real backend and are not part of a normal `test:ci` run. Say so when a change touches what they cover.
- A change to a sandbox policy needs a test that proves the denial on a real backend (`tool-safety-jail-enforced.test.ts`), not only the generated policy text.

## Traps

- On Windows the AppContainer cannot start git: exactly one read-only host git call runs (`git-host-*` reasons), everything else is held. A deny ACE inside a granted tree does not hold there, so a denied or protected path inside a granted root makes the policy inexpressible and the command is refused (or falls back only for a profile with `unconfinedFallback` and no exact endpoint).
- Seatbelt cannot enforce domain allowlists (`sandbox-seatbelt-domain-policy-unenforceable`), and exact endpoint and domain grants are mutually exclusive. On Linux an exact Unix-socket grant is refused (`sandbox-unix-socket-exact-policy-unsupported`) because srt 0.0.78 only offers allow-all.
- An `srt` on PATH is unverified and may lack the seccomp helper, which leaves AF_UNIX connects open. Exact endpoint grants therefore ignore PATH and take only the pinned runtime with `apply-seccomp` present.
- The first Linux runtime acquisition runs in the background. Commands with confined reads wait up to 180 seconds for it (never run unconfined); others see `sandbox-runtime-acquiring`. A failed acquisition is retried after five minutes, not per command. `bwrap` and `socat` come from the system package manager and are reported missing, never installed.
- Bun loads `bunfig.toml` and `.env` from its cwd, and the command's cwd is a writable workspace. Every launch of srt or the forwarder under Bun passes `--no-env-file` and `--config=/dev/null`; keep that when adding a new launcher.
- srt replaces the child's `TMPDIR` with `CLAUDE_CODE_TMPDIR`, a path that does not exist in the jail; both launchers pin it to the command's own scratch.
- A missing write root is created as an empty placeholder file for srt and removed afterwards only if nothing wrote to it; a root meant as a directory stays unwritable.
- With `scratch`, caches move into the scratch directory and Go gets `-modcacherw`. A caller-supplied read-only Go module cache (`readonlyGoCache`) is refused.
- `Profile.hooks` carriers: a profile made only to carry hooks is invisible to the native checks (`hookCarriers`); do not read `profile.hooks` outside `run`, `session` and the `before*` helpers.
- The per-Session shell fact (`ToolSafety.shellFact`) is process-local and bounded to 1024 Sessions, oldest dropped first.
- The seat prompt or a shipped seat skill is where a model learns a HOLD remediation; this skill is repo-only and must never be added to a seat's `skills`.
