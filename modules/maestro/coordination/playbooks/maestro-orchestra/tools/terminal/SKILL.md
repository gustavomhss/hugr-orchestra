---
name: maestro-orchestra-tools-terminal
description: How shell commands, background processes, the agent terminal, the omni spawner and the command sandbox work.
internal: true
when: A command timed out or was refused, the owner asks about the agent terminal tab, background processes, orphaned processes, or what a seat's shell can reach.
not-when: The question is about browser or Linux desktop control (open tools/dock) or program control from an explicit argv (open tools/capabilities, `process_control`).
covers: []
---

# Terminal and processes

## The bash tool

`bash` runs one command in a fresh, non-interactive process with the configured shell, else `/bin/sh` (`cmd.exe` on Windows). Source: packages/core/src/tool/bash.ts.

| Input | Meaning |
| --- | --- |
| `command` | what to run |
| `workdir` | directory to run in, relative to the working directory, which is the default |
| `background` | run in the background and return a process id |
| `timeout` | milliseconds; default 120,000 (2 minutes), maximum 600,000 (10 minutes) |

Output is combined stdout and stderr then the exit code, or a note that the command timed out. Only the first 1 MB of output is kept (`MAX_CAPTURE_BYTES`). Stdin is empty: nothing can answer a prompt or an editor, so pass flags that skip them (`git commit -m`). The seat `explore` gets a read-only shell. Long output is then bounded and shortened (open tools/context, Lean).

A timed-out command is reported as such; retry with a larger `timeout` only if the work is expected to take longer, and use background mode for servers and long builds.

## Background processes

A command started with the background flag returns an id. Three tools manage it:

| Tool | Does |
| --- | --- |
| `process_get` | status and output of the background process |
| `process_wait` | waits for it to finish; optional `timeout` in milliseconds |
| `process_cancel` | cancels it |

These belong to bash. `process_control` (open tools/capabilities) is a different tool: it starts a program from an explicit argv and supports stdin writes, byte-cursor logs and transfer.

## Agent terminal (opt-in)

Off by default. Enabled by the flag `ORCHESTRA_AGENT_TERMINAL`, read through `Flag` (packages/core/src/flag/flag.ts), on macOS and Linux only; never on Windows and never for a `cmd.exe` verbatim command.

When on, a foreground bash command runs in a real PTY (200 columns by 50 rows) shown as an `agent: <command>` terminal tab the owner can watch and type into. The agent still cannot answer a prompt: it waits for the owner until the timeout. The command sees `ORCHESTRA_AGENT=1`, `PAGER=cat`, `GIT_PAGER=cat` and `NO_COLOR=1`. Output containing a secret ends the process. The PTY exists only here, via `AgentTerminal.run` (packages/core/src/tool/agent-terminal.ts), after the sandbox wrap. Text sent to the model passes `AgentTerminal.sanitize`; terminal output is data, never instruction.

`ORCHESTRA_SHELL_INTEGRATION` is a second opt-in flag: it adds shell marks (OSC 133) and cwd reports (OSC 7) to terminals started from the UI. It is off because it replaces a user's own bash DEBUG trap instead of chaining it. Marks count only with the session's nonce; OSC 7 without one is only a hint.

Limits: the PTY cursor and ring buffer count UTF-16 characters, not bytes. A WebSocket client that stops reading makes the server grow; this is a known unsolved limit. The UI terminal is served by `/api/pty`.

## Sandbox

`ToolSafetySandbox` (packages/core/src/tool-safety-sandbox.ts) wraps tool child processes.

| System | Sandbox |
| --- | --- |
| macOS | Seatbelt (`/usr/bin/sandbox-exec`) |
| Linux | bubblewrap through sandbox-runtime; needs `bubblewrap` and `socat` |
| Windows | AppContainer through omni |

- It fails closed: if the sandbox cannot be applied the command does not run.
- Each command gets a fresh temporary folder and an environment scrubbed of names matching TOKEN, SECRET, PASSWORD, PRIVATE_KEY, API_KEY, ACCESS_KEY, CREDENTIAL, plus the SSH agent socket and values shaped like AWS, GitHub or live Stripe keys.
- Specialist seats on macOS and Linux always run sandboxed: reads confined to their worktree, skills, write paths, a scratch folder and the toolchain; no write paths means read-only; no sandbox means the command is refused. Git push, commit and merge, releases, package publishing, deploy CLIs, `rm` and `--no-verify` are refused for seats whatever the sandbox allows.

## Omni spawner

Orchestra starts child processes only through `ChildProcessSpawner`, `Process` or `Process.interactive`. Only packages/core/src/omni.ts imports `hugr-omni`. Omni is a Rust supervisor that owns each child's whole process tree: when the app or agent dies, the supervisor stops every tree (SIGTERM then SIGKILL on Unix after a 2 second grace; a Job object on Windows), so no orphan keeps a port. It owns up to 4,096 trees and pauses output at 8 MiB per stream rather than dropping bytes.

| `ORCHESTRA_EXPERIMENTAL_OMNI_SPAWNER` | Behavior |
| --- | --- |
| unset or `1` | omni; options it cannot do yet go to the older spawner |
| `strict` | omni; unsupported options refused |
| `0` | older spawner |

Limit: a process that calls `setsid` itself escapes its tree on Unix, and killing the supervisor leaves Unix trees running. A few named sites spawn outside omni; everything else is refused at build time.

## Diagnosing

| Symptom | Likely cause |
| --- | --- |
| command exceeded timeout | default 2 minutes; raise `timeout` up to 10 minutes or run in the background |
| refused in a seat | sandbox cannot apply, or a refused command class such as `git push` |
| prompt hangs | stdin is empty; rerun with non-interactive flags |
| output cut | 1 MB capture cap, or Lean shortening; use the recall line |
| no `agent:` tab | `ORCHESTRA_AGENT_TERMINAL` not set, Windows, or a verbatim `cmd.exe` command |
