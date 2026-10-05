# Linux workspace: CLI, files and terminals

These entrypoints use the **same owned container and persistent home as App Dock**.
Commands run as `dock` (UID 10001), with the actual display/session D-Bus environment.
`sudo -n` is available inside the guest for package/system work. There is no new
container, image build, host-directory mount or dependency on a visible GUI tab.

Open Linux in App Dock first. Access adopts an existing running workspace; it does
not provision or restart one when a command is submitted.

## CLI

From `packages/desktop`:

The development CLI uses Bun to build its small runner and Node 22+ for I/O.
Descriptors are inherited directly: this avoids observed Bun stdin truncation
under piped binary input. The generated temporary runner is removed on exit.

```sh
export ORCHESTRA_LINUX_ROOT="<desktop userData>/app-dock-linux"

bun run linux exec -- uname -a
bun run linux exec --cwd /home/dock -- /bin/bash -lc 'pwd; ls -la'
bun run linux shell
bun run linux ls /home/dock
bun run linux read /home/dock/example.txt
bun run linux write /home/dock/example.txt < example.txt

# Streaming transfer works for binary data and large files too.
bun run linux exec -- cat /home/dock/example.bin > example.bin
bun run linux exec -- /bin/bash -lc 'cat > /home/dock/example.bin' < example.bin
```

`--root` can replace the environment variable. The root is the desktop's private
runtime-state directory, not a Linux working directory. Linux `--cwd` and file
paths are absolute paths inside the guest. In the current isolated validation
instance the runtime root is recorded privately in its recovery checkpoint.
New integrated host terminals inherit `ORCHESTRA_LINUX_ROOT` from the desktop
sidecar, so the same CLI can enter its workspace without rediscovering metadata.

`exec` preserves argv boundaries, streams stdin/stdout/stderr with backpressure,
and exits with the guest result. Shell operators require an explicit shell such
as `/bin/bash -lc`. Default command deadline is 60 seconds; `--timeout 300000`
allows five minutes, and CLI-only `--timeout 0` disables that deadline. Ctrl-C or
SIGTERM requests cancellation of the particular guest command group.

`shell` uses Docker's actual interactive PTY and the host terminal's raw input
and resize handling. It requires an interactive host terminal. Shells retain
normal Linux job-control behavior; deliberately detached jobs with redirected
stdio are user-managed guest processes.

## Agent tools

The desktop sidecar registers an independent `LinuxWorkspacePlugin` alongside
the existing Dock plugin. The private `linux.rpc` channel targets the runtime
already bound by the desktop; models cannot choose Docker endpoints, container
IDs, host metadata paths or another workspace.

| Tool | Function |
| --- | --- |
| `linux_exec` | argv, cwd, env and stdin; stdout/stderr, guest exit code, cancellation/timeout and truncation |
| `linux_read` | paged Linux file reads; UTF-8 or lossless base64 |
| `linux_write` | write/replace guest bytes; UTF-8 or base64 |
| `linux_list` | paged directory enumeration |
| `linux_terminal_open` | actual Linux PTY; optional argv/cwd/env and dimensions |
| `linux_terminal_read` | drain bounded output, inspect running/attachment exit state |
| `linux_terminal_write` | exact input; newline submits a command and character 3 sends Ctrl-C |
| `linux_terminal_resize` | update PTY dimensions and terminal size notification |
| `linux_terminal_close` | retire the owned terminal attachment |

All tool calls use the existing `ToolContext.ask` permission mechanism under the
`linux` namespace. PTY IDs belong to a Session; another Session cannot read,
write, resize or close them. Session deletion retires its terminals and cancels
its pending requests. Sidecar exit and runtime shutdown retire access resources.

A terminal write reply acknowledges input dispatch, not completion of whatever
command was entered. Inspect output and application-specific postconditions.
Cancellation and transport failure are never followed by automatic command replay.

## Identity, bounds and lifecycle

- Every operation validates saved owner/immutable container identity, captured
  local endpoint, home volume, resource limits and sandbox configuration.
- An execution/terminal additionally captures the container's start epoch.
  Later operations must still match it, even when the container ID was reused
  across a stop/start.
- The root-owned access helper is deployed separately from the GUI/AT-SPI helper.
  Long execution is outside the runtime mutation queue, so a running shell does
  not serialize GUI operations behind it.
- Noninteractive commands have a guest supervisor with a separate process group
  and PID/start-time evidence. Cancellation targets this group, not the display,
  Slack or the whole workspace. A guest completion receipt distinguishes actual
  exit status from Docker-client transport failure.
- Runtime-owned display/password data is not included in access replies or
  inherited automatically as `APP_DOCK_RUNTIME_PASSWORD`. Command output and
  requested file contents are the guest data explicitly selected by the caller.
- Buffered command results are bounded at 1 MiB combined; CLI output streams
  continue beyond that capture limit. Reads are at most 64 KiB per call, writes
  at most 1 MiB input, directory pages at most 1000 entries, and PTY output at
  most 65536 characters with an explicit truncation flag. UTF-8 range boundaries
  can replace partial characters; base64 is the lossless range representation.
- Access admits at most eight simultaneous commands and eight terminals. Closed
  terminals should be closed explicitly to release their retained final output.
  Host and guest preparation/control operations have independent deadlines;
  unproven termination is reported as an error, not successful cleanup.

## Verification

Run package-local tests against an existing owned workspace:

```sh
APP_DOCK_ACCESS_INTEGRATION=1 \
APP_DOCK_ACCESS_ROOT="$ORCHESTRA_LINUX_ROOT" \
bun test src/main/linux-workspace.integration.test.ts
```

The full proof exercises actual guest bytes, Unicode/binary ranges, streaming
input, separate stderr, nonzero status, timeout/cancellation with child-PID
inspection, actual guest PTY size, resize, Ctrl-C, Session ownership, registered
tool definitions through a real MessageChannel and production main dispatcher,
permission denial, foreign container-identity rejection and unchanged GUI PIDs.
It allocates and removes its own unique guest fixture directory.

Focused mutation controls use `APP_DOCK_ACCESS_PROOF_SCOPE=file|pty` and
`APP_DOCK_ACCESS_MUTATION=file|resize`. The file mutation lies about bytes written
but fails the independent guest read; the resize mutation acknowledges resize
without changing it and fails the actual guest `stty size` check. Focused receipts
name their scope and are not a replacement for the full proof.

Measured integration platform is macOS/amd64 with Ubuntu/Linux amd64 and the
existing Electron/Node PTY binding. Other platform/architecture combinations
need their own live receipts.
