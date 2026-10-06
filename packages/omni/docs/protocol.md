# Host ↔ supervisor protocol (v1)

Frozen in W00. Why and how it was proven: ADR-0005. Types and codec: `crates/omni-proto` (W00). Host client: W04.
Supervisor: W05 (Unix), W06 (Windows).

**Start.** On its first spawn the host execs `hugr-omni-supervisor --host-pid <pid> [--pipe <name>]`. The binary is
found via `HUGR_OMNI_SUPERVISOR`, then next to the native module, then next to the current executable.
- **Unix:** a `socketpair(AF_UNIX, SOCK_STREAM)`; the supervisor's end is its fd 0, in its own process group.
- **Windows:** the host creates `\\.\pipe\hugr-omni-<pid>-<128-bit random hex>` (first instance, remote clients
  rejected) and starts the supervisor with `bInheritHandles = FALSE`. It accepts only the client whose
  `GetNamedPipeClientProcessId` is the pid it created.

**CLOEXEC.** Linux creates every fd with CLOEXEC atomically (`pipe2`, `SOCK_CLOEXEC`, `MSG_CMSG_CLOEXEC`). macOS uses
`pipe`/`socketpair` + `fcntl(FD_CLOEXEC)` at once. That leaves a window in which a concurrent `fork` in the host can
inherit the fd; this is declared in GUARANTEES.

The supervisor arms host-death detection (pidfd, kqueue or a process handle; `getppid` polling otherwise) **before**
it sends `Ready`. The host refuses another `version`, and a forked copy of the host refuses to use the client.

**Frame.** `u32 LE length` (1..=1 MiB, of what follows), then `u8 kind`, then the fields in the order below.
- Integers are LE. `bytes` = `u32 len` + data. `list` = `u32 count` + items. `bool` = `u8` 0 or 1.
- OS strings (`program`, `argv`, `env`, `cwd`) are raw bytes on Unix and WTF-8 on Windows. `msg` and `name` are
  UTF-8: the supervisor converts lossily on every OS; an empty `name` = unknown.
- Without a PTY, `pty` = 0 and `cols` = `rows` = 0.
- Any other value is malformed: unknown kind, bad length, trailing bytes, a non-0/1 `bool`, a slot not allowed for its
  field, or a signal outside 1..=127. A malformed frame ends the connection; for the supervisor that is host death.

| kind | message | fields |
|---|---|---|
| 0x01 | `Spawn` | req u64 · program bytes · argv list<bytes> · env list<(bytes, bytes)> · cwd bytes · pty bool · cols u16 · rows u16 · stdin u8 (0 null, 1 pipe) · stderr u8 (1 pipe, 2 merge) · grace_ms u32 · handles 3×u64 |
| 0x02 | `Go` | req u64 · id u64 |
| 0x03 | `Stop` | req u64 · id u64 · grace_ms u32 |
| 0x04 | `Resize` | req u64 · id u64 · cols u16 · rows u16 |
| 0x05 | `List` | req u64 · id u64 |
| 0x06 | `Release` | req u64 · id u64 |
| 0x81 | `Ready` | version u32 · pid u32 · info u32 (bit 0: event-based host watch — pidfd on Linux, kqueue on macOS, process handle on Windows; unset = `getppid` polling. bit 1: members signalled through pidfds) |
| 0x82 | `Spawned` | req u64 · id u64 · pid u32 · pty_ends 2×u64 |
| 0x83 | `SpawnFailed` | req u64 · code u8 (1 not found, 2 not executable, 3 bad cwd, 4 invalid, 5 io) · errno i32 · msg bytes |
| 0x84 | `Exited` | id u64 · kind u8 (0 code, 1 signal) · value u32 |
| 0x85 | `Stopped` | req u64 · id u64 |
| 0x86 | `Processes` | req u64 · id u64 · list<(pid u32 · ppid u32, 0 = parent not in list · name bytes)> |
| 0x87 | `Ack` | req u64 · id u64 · result u8 (0 ok, 2 unknown, 3 error, 4 closed; 1 is reserved) |

stdout is always a pipe. A `null` stdin is the null device opened for reading by the supervisor (`/dev/null`,
`NUL`), so the child reads end of input at once.

**Replies.** Every request gets exactly one reply carrying its `req`, even when host threads overlap. An unknown or
released `id` gets `Ack unknown` for every request.

| Request | Reply |
|---|---|
| `Spawn` | `Spawned`, or `SpawnFailed` (nothing left running) |
| `Go` | `Ack ok` once exec succeeded, or `SpawnFailed` (then no `Exited` follows) |
| `Stop` | `Stopped` only once the tree is gone (at once if it already is); overlapping `Stop`s share the earliest deadline |
| `Resize` | `Ack ok` / `closed` |
| `List` | `Processes` (empty once gone), or `Ack error` if the inventory is incomplete |
| `Release` | `Ack ok`; the supervisor keeps cleanup duty |

- **Unsolicited:** `Ready` (once, first) and `Exited` (at root exit; descendants may live on).
- **Tree ids:** never reused by one supervisor; the host pairs them with the supervisor generation.
- **Limit:** a supervisor holds at most 4096 trees (live or not yet released); a `Spawn` beyond that gets
  `SpawnFailed io` with a message naming the limit.

**Descriptors.** I/O never crosses the supervisor.
- **Unix pipes:** the child ends of the pipes travel as SCM_RIGHTS on the `Spawn` frame, in stdin, stdout, stderr
  order, one per pipe (stdout always).
- **Unix PTY:** no fds travel with the `Spawn`; the supervisor opens the PTY and returns the master on `Spawned`
  (`pty_ends = [1, 0]`).
- **Windows:** the host `DuplicateHandle`s its pipe ends into the supervisor and lists them in `handles`. PTY ends
  come back as values in `pty_ends`, which the host pulls out with `DUPLICATE_CLOSE_SOURCE`.

**Trees** follow ADR-0005 §3–§8 (session or Job as the kill unit, pinning, host and supervisor death). `List`
returns the members `Stop` would reach at the time of the scan, without the zombie root, with `ppid` set only when
the parent is listed. On host death every tree gets a `Stop` with its own `grace_ms`.
