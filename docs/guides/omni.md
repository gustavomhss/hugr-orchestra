# Omni

Agents start many processes: test runners, dev servers, language servers, package managers, shells. When an agent or the app dies, the usual result is orphans holding ports and memory. Omni is a Rust layer that starts child processes for Orchestra and owns each one's whole process tree.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="../images/readme/omni-dark.png">
  <img src="../images/readme/omni-light.png" alt="Omni: the app or server, where one module imports the hugr_omni.node addon and output pumps pause at 8 MiB per stream, talks over a socketpair or named pipe to the hugr-omni-supervisor started with --host-pid, which owns up to 4,096 trees such as bun test with vite dev and esbuild, a language server with tsserver, and a zsh PTY running git log. On Unix a stop sends SIGTERM, SIGHUP for a PTY and SIGCONT, then SIGKILL every 10 ms after the grace; on Windows each tree is a Job object, stopped with CTRL_BREAK then TerminateJobObject. The supervisor watches the host with pidfd, kqueue, a process handle or getppid every 250 ms, plus channel EOF.">
</picture>

## How it works

The app loads omni as a native addon (`hugr_omni.node`). On first use the addon starts a separate supervisor process with the app's process id (`--host-pid`) and talks to it over a private channel (length-prefixed frames of at most 1 MiB). Every spawn goes to the supervisor, which owns up to 4,096 process trees.

| | Unix | Windows |
| --- | --- | --- |
| Channel | socketpair | Named pipe with a random name |
| Tree | Root starts as a session leader; Linux pins it with a pidfd so a reused process id is never hit | Job object that kills on close and refuses breakaway |
| Stop | SIGTERM to the session (SIGHUP for a PTY) with SIGCONT, wait the grace (2 s default), then SIGKILL every 10 ms until empty | CTRL_BREAK, then `TerminateJobObject` |
| Host watch | pidfd (Linux), kqueue `NOTE_EXIT` (macOS), or `getppid` every 250 ms; plus channel close | Process handle; plus channel close |
| Terminals | PTY from `/dev/ptmx` | ConPTY |
| Commands | No shell; npm shims resolve the same everywhere | No shell; `PATHEXT` honored; `.cmd` and `.bat` run through `cmd.exe` |

- **Host death.** The supervisor stops every tree with its grace, then sweeps for up to 5 seconds. In a test of 25 host deaths it left no survivor and finished in 1.1–1.4 seconds.
- **Output never blocks a child.** Pipes are always drained. A slow reader pauses the pump at 8 MiB per stream instead of dropping bytes; if bytes are lost anyway, the stream fails or shows a marker line saying where.

*Example:* the agent runs `bun test`, which starts a dev server on port 3000. Halfway through, the app crashes. The supervisor sees its host disappear, sends the test tree SIGTERM and SIGCONT, and two seconds later SIGKILL to what is left. Port 3000 is free on restart and no `vite` process remains.

## Platforms and switch

Omni is on by default in builds that include it: macOS arm64 and x64, Linux x64 and arm64 (glibc), Windows x64. musl and Windows arm64 are planned.

| `ORCHESTRA_EXPERIMENTAL_OMNI_SPAWNER` | Behavior |
| --- | --- |
| unset or `1` | Omni; options it does not support yet (`pipeTo`, inherited stdio, extra file descriptors, a kill signal other than SIGTERM or SIGKILL) go to the older spawner |
| `strict` | Omni; unsupported options are refused |
| `0` | Older spawner |
| empty or invalid | Older spawner (warning for an invalid value) |

A build without omni for its platform also uses the older spawner.

## Limits

- A process that calls `setsid` itself leaves its session on Unix and escapes the tree. If the supervisor itself is killed, Unix trees keep running.
- Only one module may import omni; a parser-based check fails on any other process-spawning import. 66 sites still spawn outside omni, listed in an allowlist that only shrinks.
- A conformance suite of 45 scenarios defines the guarantees; a guarantee counts only once its scenario is green in CI. CI also checks that tests really spawn through omni.
- Early macOS measurements from one machine: no orphans where Node's `child_process` left four; a 95th-percentile stop 23 ms longer than the grace. Omni is pre-release (0.1).
