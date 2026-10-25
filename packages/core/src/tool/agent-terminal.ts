export * as AgentTerminal from "./agent-terminal"

import { Deferred, Duration, Effect, Exit } from "effect"
import type { ChildProcess } from "effect/unstable/process"
import { Flag } from "../flag/flag"
import { OmniSpawner } from "../omni-spawner"
import { OutputInspector } from "../output-inspector"
import type { Pty } from "../pty"
import { ToolSafety } from "../tool-safety"

// Wide enough that `ls` and compiler output are not folded at 80 columns.
const COLS = 200
const ROWS = 50

// The command sees a terminal but not a person: no pager, no color, and a marker for scripts that care.
const ENVIRONMENT = {
  ORCHESTRA_AGENT: "1",
  PAGER: "cat",
  GIT_PAGER: "cat",
  NO_COLOR: "1",
}

export type Result = {
  readonly exitCode: number
  readonly output: string
  readonly truncated: boolean
}

/** What the bash tool tells the model about stdin, which differs once the command runs in a terminal the owner can see. */
export function stdinNote() {
  if (!Flag.ORCHESTRA_AGENT_TERMINAL || process.platform === "win32")
    return "Stdin is empty and there is no terminal, so nothing can answer a prompt or an editor: pass flags that skip them, such as `-m` for `git commit`."
  return "The command runs in a terminal tab the owner can watch and type into, but you cannot answer it: a prompt or an editor waits for the owner until the timeout, so pass flags that skip them, such as `-m` for `git commit`. Output has no color."
}

export function enabled(command: ChildProcess.StandardCommand) {
  // cmd.exe parses its own command line and needs omni's verbatim form, which a PTY spawn cannot take.
  return Flag.ORCHESTRA_AGENT_TERMINAL && process.platform !== "win32" && OmniSpawner.program(command).verbatim === undefined
}

/**
 * Runs an already confined command in a PTY of its own so the owner sees it in a tab and can answer it. The caller
 * keeps the sandbox scope open until this returns. Resolves undefined on timeout, fails Denied when the output shows a
 * recognized secret, and kills the process on either. A finished command's tab stays, as an exited terminal does.
 */
export const run = Effect.fn("AgentTerminal.run")(function* (
  pty: Pty.Interface,
  input: {
    readonly command: ChildProcess.StandardCommand
    readonly title: string
    readonly timeout: number
    readonly maxChars: number
  },
) {
  const inspector = OutputInspector.make()
  const done = Deferred.makeUnsafe<number>()
  const chunks: string[] = []
  const state = { size: 0, truncated: false, denied: undefined as string | undefined }
  const program = OmniSpawner.program(input.command)

  const info = yield* pty.create(
    {
      command: program.file,
      args: program.args,
      ...(input.command.options.cwd === undefined ? {} : { cwd: input.command.options.cwd }),
      env: { ...OmniSpawner.environment(input.command.options), ...ENVIRONMENT },
      title: `agent: ${input.title}`,
      cols: COLS,
      rows: ROWS,
    },
    {
      exact: true,
      observe: {
        onData: (chunk) => {
          if (state.denied) return
          state.denied = inspector.push(chunk)
          if (state.denied) return Deferred.doneUnsafe(done, Exit.succeed(-1))
          const room = Math.max(input.maxChars - state.size, 0)
          if (chunk.length > room) state.truncated = true
          chunks.push(chunk.slice(0, room))
          state.size += Math.min(chunk.length, room)
        },
        onExit: (exitCode) => Deferred.doneUnsafe(done, Exit.succeed(exitCode)),
      },
    },
  )

  const kill = pty.remove(info.id).pipe(Effect.ignore)
  const exitCode = yield* Deferred.await(done).pipe(
    Effect.timeoutOption(Duration.millis(input.timeout)),
    Effect.onInterrupt(() => kill),
  )
  if (exitCode._tag === "None") {
    yield* kill
    return undefined
  }
  if (state.denied) {
    yield* kill
    return yield* new ToolSafety.Denied({ reason: state.denied })
  }
  const reason = inspector.finish()
  if (reason) return yield* new ToolSafety.Denied({ reason })
  return { exitCode: exitCode.value, output: sanitize(chunks.join("")), truncated: state.truncated } satisfies Result
})

const OSC = /\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)?/g
const CSI = /\x1b\[[0-?]*[ -/]*[@-~]/g
const ESCAPE = /\x1b[ -\/]*[0-~]/g
const CONTROL = /[\x00-\x08\x0b-\x1f\x7f]/g

/**
 * What the model reads of terminal output: no escape sequences (OSC 52 clipboard writes and titles included), a carriage
 * return overwrites its line the way a terminal paints it, and no control characters but newline and tab.
 */
export function sanitize(text: string) {
  return text
    .replace(OSC, "")
    .replace(CSI, "")
    .replace(ESCAPE, "")
    .replaceAll("\r\n", "\n")
    .split("\n")
    .map((line) => line.split("\r").filter(Boolean).at(-1) ?? "")
    .join("\n")
    .replace(CONTROL, "")
}
