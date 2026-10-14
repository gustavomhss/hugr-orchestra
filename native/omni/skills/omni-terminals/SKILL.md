---
name: omni-terminals
description: "How to run programs inside a real terminal with hugr-omni (the pty option - openpty on Unix, ConPTY on Windows) - prompts and REPLs, typing with write, Enter as \\r, Ctrl-C as \\x03 and end of input as \\x04 (there is no closeStdin), resize and stty, CRLF line ends, echo, escape sequences, detecting a prompt with one iterator, and ConPTY specifics. Use when a program only behaves under a terminal (prompts, colors, isatty, REPLs, bash, git rebase -i), when driving an interactive session from code, when matching terminal output fails because of \\r\\n, echo or escape codes, or when porting node-pty or bun-pty code."
---

# Terminals with hugr-omni

With `pty`, the child sees a real terminal of the size you ask for: openpty on Unix, ConPTY on Windows. Everything
the terminal shows arrives on one channel labeled `pty`. The rules are in
[contract §10](../../docs/api-contract.md#10-terminal-pty). The runnable walkthroughs are
[recipes §3](../../docs/guide/recipes.md#3-an-interactive-terminal) (a prompt, cross-platform) and
[recipes §9](../../docs/guide/recipes.md#9-unix-drive-bash-in-a-terminal) (bash, several steps, resize).

## When to use

- The program changes behavior without a terminal: it hides prompts, drops colors, buffers output, or refuses to run.
- You drive an interactive program from code: a REPL, a shell, an installer that asks questions.
- Matching terminal output fails because of `\r\n`, the echo of what you typed, or escape sequences.
- You are porting node-pty or bun-pty code. The `omni-migrate` skill has the mapping table.

## When not to use

- The program works fine with pipes. Prefer pipes: separate stdout and stderr, `closeStdin()`, no echo, no escape
  codes. Use the `omni-processes` skill.
- You need the user's own terminal (an editor, a pager the user types into). hugr-omni always captures the terminal
  it creates. It never hands over yours.

## The surface

- `spawn(cmd, args, { pty: true })` (80 x 24) or `{ pty: { cols, rows } }` returns a `PtyChild`. Sizes are integers
  from 1 to 32767, otherwise `INVALID_ARGUMENT`.
- `run(cmd, args, { pty })` collects everything into `stdout`, while `stderr` is empty. `maxOutputBytes` applies.
  It takes no `input` (`INVALID_ARGUMENT`), because nobody types. A program that waits for input waits until
  `timeoutMs`, so always give `run()` with `pty` a `timeoutMs`.
- `write(text)` types into the terminal. `resize(cols, rows)` takes columns first and returns nothing. Called after
  exit, it is `CLOSED`.
- There is no `closeStdin()`: a terminal has no separate end of input. Send the program's own: on a Unix terminal,
  `"\x04"` (Ctrl-D) at the start of a line.
- `mergeStderr` does not apply: the terminal already mixes everything.
- Output beyond the buffers is dropped and counted like pipe output. Terminal output counts as `stdout` in
  `droppedBytes`, and the first chunk after a gap carries `lostBefore`.

## Keys

| Key | Write | Effect |
|---|---|---|
| Enter | `"\r"` | the terminal turns it into a newline for the program (ICRNL) |
| Ctrl-C | `"\x03"` | interrupts the foreground program (SIGINT on Unix, CTRL_C_EVENT through ConPTY) |
| Ctrl-D | `"\x04"` | end of input for a Unix program reading a line, at the start of a line |
| Ctrl-Z | `"\x1a"` | Unix: suspends the foreground job (job control) |

To Ctrl-C a command that prints nothing (a `sleep` in a shell), first wait until `processes()` lists it. Otherwise
the Ctrl-C may reach the shell before the command starts.

## What the output looks like

- **Line ends are `\r\n`.** The terminal translates every `\n` (ONLCR). Split on `\r\n`, or remove `\r`.
- **Echo.** The terminal echoes what you type. A reply to a command is the echo, then the output, then the next
  prompt. Unix also echoes Ctrl-C as `^C`; ConPTY does not.
- **Escape sequences.** Programs that see a terminal add colors and cursor moves. ConPTY on Windows also adds its
  own: cursor hide and show, clear screen, home, and a window title (OSC 0) holding the program's path. It may also
  move the cursor instead of sending a line feed ([ADR-0003 Q6](../../docs/adr/0003-pty.md#q6-output-noise-raw-samples-and-the-matcher)).
- **Prompts end without a newline.** Read `output` (chunks), not `lines()`, and match on the accumulated text.

```ts
import { run } from "hugr-omni";

const r = await run("node", ["-e", "console.log(process.stdout.isTTY ? 'tty' : 'pipe'); console.log('done')"], { pty: true, timeoutMs: 30_000 });
const visible = r.stdout
  .replace(/\x1b\][^\x07\x1b]*(\x07|\x1b\\)/g, "") // OSC: the window title ConPTY sets
  .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "") // CSI: colors, cursor, clear screen
  .replace(/\r/g, "");
console.log(visible.split("\n").filter((l) => l.trim() !== "")); // [ 'tty', 'done' ]
```

This strip is enough for matching markers. It does not render a screen: it turns no cursor move into text.

## Driving a conversation

1. **Choose a marker you control.** For a shell, set the prompt yourself (bash: `PS1` in `env`, plus `--norc`,
   `--noprofile` and `--noediting`), so a banner or the user's startup files cannot fool you.
2. **Take the iterator once.** Leaving a `for await` loop detaches for good, and a second claim is
   `INVALID_ARGUMENT`. Keep `const it = term.output[Symbol.asyncIterator]()` and an accumulated `seen` string. Write
   an `until(marker)` that calls `it.next()` until `seen` holds the marker, and fails if the stream ends first.
3. **Type, then wait for the next marker.** Cut the echo (the first line) and the prompt (the last) from the reply.
4. **Bound every wait.** Give `spawn` a `timeoutMs` when a reply might never come.

```ts
import { spawn } from "hugr-omni";

const program = `let n = 0; const ask = () => process.stdout.write(n === 0 ? "name? " : "color? "); ask();
process.stdin.on("data", (d) => { console.log("got " + String(d).trim()); if (++n < 2) ask(); else console.log("all done"); });`;
await using term = spawn("node", ["-e", program], { pty: { cols: 100, rows: 30 }, timeoutMs: 60_000 });

const it = term.output[Symbol.asyncIterator](); // the one claim
let seen = "";
async function until(marker: string): Promise<void> {
  while (!seen.includes(marker)) {
    const next = await it.next();
    if (next.done) throw new Error(`the terminal ended before ${JSON.stringify(marker)}`);
    seen += next.value.data;
  }
  seen = seen.slice(seen.indexOf(marker) + marker.length);
}

await until("name?");
await term.write("alice\r");
await until("color?");
await term.write("green\r");
await until("all done");
await term.write("\x03"); // Ctrl-C: the program is still reading, so interrupt it
console.log((await term.wait()).reason); // signal on Unix (SIGINT); exit on Windows (code 3221225786)
```

## Resize and size

- The child sees the initial size before its first instruction. `resize(cols, rows)` reaches it at once: SIGWINCH on
  Unix, `ResizePseudoConsole` on Windows. The measured round trip was about 1 ms on Linux, 6 to 12 ms on macOS, and
  16 to 24 ms on Windows ([ADR-0003 Q4](../../docs/adr/0003-pty.md#q4-initial-size-and-resize)).
- `stty size` prints rows first. `resize()` takes columns first. Both are the usual orders.
- bash with line editing redraws its prompt on a resize, and the redraw looks like a new prompt. Start it with
  `--noediting` when you resize during a conversation.

## Windows (ConPTY) notes

- Ctrl-C works: hugr-omni clears the inherited "ignore Ctrl-C" flag for terminal children and never puts them in a
  new process group ([ADR-0003 Q3](../../docs/adr/0003-pty.md#q3-x03-interrupts-the-foreground-program)).
- `cmd.exe` and `powershell.exe` have their own prompt and echo rules. Print a transcript once before you pick the
  markers. The bash recipe is Unix only.
- `stop()` closes the pseudo console for the graceful step. Closing can block for seconds on Server 2022, so the
  supervisor does it on a worker under an independent deadline. `stop()` still honors `graceMs`.
- On builds before 26100 (Server 2022 is 20348), one handle per terminal session stays in the supervisor. This is
  declared in [GUARANTEES.md](../../GUARANTEES.md#promises).

## Review checklist

- Prompts are matched on accumulated `output` chunks, not on `lines()`.
- There is one iterator per terminal, and every `until` can fail on end of stream.
- Matching tolerates `\r\n`, echo and escape sequences.
- `run()` with `pty` has a `timeoutMs` and no `input`.
- No `closeStdin()` on a `PtyChild`. End input with the program's own key, or stop it.
