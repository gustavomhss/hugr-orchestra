import { describe, expect } from "bun:test"
import { Effect, Layer } from "effect"
import { existsSync, realpathSync } from "node:fs"
import { mkdir, mkdtemp, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { Config } from "@orchestra/core/config"
import { AppNodeBuilder } from "@orchestra/core/effect/app-node-builder"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { EventV2 } from "@orchestra/core/event"
import { Location } from "@orchestra/core/location"
import { Pty } from "@orchestra/core/pty"
import { ShellMarks } from "@orchestra/core/pty/shell-marks"
import { AbsolutePath } from "@orchestra/core/schema"
import { location } from "../fixture/location"
import { testEffect } from "../lib/effect"

const locationLayer = Layer.succeed(
  Location.Service,
  Location.Service.of(location({ directory: AbsolutePath.make("/tmp") })),
)
const configLayer = Layer.mock(Config.Service)({ entries: () => Effect.succeed([]) })
const it = testEffect(
  AppNodeBuilder.build(LayerNode.group([Pty.node, EventV2.node]), [
    [Config.node, configLayer],
    [Location.node, locationLayer],
  ]),
)

// A shell that opens, runs commands and exits through its own marks. HOME is an empty directory so the user's own
// startup files do not take part, except one file each shell would otherwise ask the user to create.
const session = Effect.fn("ShellIntegrationTest.session")(function* (shell: string, args: string[] = []) {
  const pty = yield* Pty.Service
  const home = yield* Effect.promise(() => mkdtemp(path.join(os.tmpdir(), "orchestra-si-home-")))
  yield* Effect.promise(() => writeFile(path.join(home, ".zshrc"), ""))
  const info = yield* Effect.acquireRelease(
    pty.create(
      { command: shell, args, cwd: "/tmp", env: { HOME: home, PS1: "$ ", PROMPT: "$ ", BASH_SILENCE_DEPRECATION_WARNING: "1" } },
      { shellIntegration: true },
    ),
    (created) => pty.remove(created.id).pipe(Effect.ignore),
  )
  const attachment = yield* pty.attach(info.id, {
    onData: (chunk) => received(chunk),
    onEnd: () => {},
  })
  const nonce = attachment.shellNonce
  if (!nonce) throw new Error("shell integration did not start for " + shell)
  const parser = ShellMarks.parser(nonce)
  const marks: ShellMarks.Mark[] = []
  let text = ""
  const received = (chunk: string) => {
    text += chunk
    marks.push(...parser.push(chunk))
  }
  received(attachment.replay)
  attachment.activate()

  const until = (what: string, done: () => boolean) =>
    Effect.gen(function* () {
      while (!done()) yield* Effect.sleep("25 millis")
    }).pipe(
      Effect.timeoutOrElse({
        duration: "10 seconds",
        orElse: () =>
          Effect.fail(new Error(`${shell}: timeout waiting for ${what}; marks ${JSON.stringify(marks)}; text ${JSON.stringify(text.slice(-300))}`)),
      }),
    )
  // The marks sit between the command and its output, so strip them before reading the output.
  const plain = () => text.replace(/\x1b\][^\x07]*\x07/g, "")
  return { attachment, marks, parser, until, text: () => text, plain, id: info.id }
})

// /bin/bash is 3.2 on macOS, which has no PS0, so the older path matters; /usr/local/bin/bash covers a current one there.
const shells = ["/bin/zsh", "/bin/bash", "/usr/local/bin/bash"].filter((shell) => existsSync(shell))
const shellTest = process.platform === "win32" ? it.live.skip : it.live

describe("shell integration", () => {
  for (const shell of shells)
    shellTest(
      `${shell} marks prompt, start and end with the exit code`,
      () =>
        Effect.gen(function* () {
          const { attachment, marks, until } = yield* session(shell)
          yield* until("first prompt", () => marks.some((mark) => mark.kind === "prompt"))
          expect(marks).toEqual([{ kind: "prompt", seq: 0 }])

          attachment.write("sh -c 'exit 7'\n")
          yield* until("end of first command", () => marks.some((mark) => mark.kind === "end"))
          expect(marks.slice(1, 3)).toEqual([
            { kind: "start", seq: 1 },
            { kind: "end", seq: 1, exit: 7 },
          ])
          yield* until("prompt after it", () => marks.length >= 4)

          // An empty line starts nothing; the next real command is number 2.
          attachment.write("\n")
          attachment.write("true\n")
          yield* until("second command", () => marks.some((mark) => mark.kind === "end" && mark.seq === 2))
          expect(marks.filter((mark) => mark.kind === "start").map((mark) => mark.seq)).toEqual([1, 2])
          expect(marks.find((mark) => mark.kind === "end" && mark.seq === 2)).toEqual({ kind: "end", seq: 2, exit: 0 })
        }),
      30000,
    )

  for (const shell of shells)
    shellTest(
      `${shell} ignores a forged mark and keeps the nonce from programs it runs`,
      () =>
        Effect.gen(function* () {
          const { attachment, marks, parser, until, text, plain } = yield* session(shell)
          yield* until("first prompt", () => marks.length > 0)

          attachment.write("printf '\\033]133;D;0;orchestra=forged:9\\007'\n")
          yield* until("the forged mark to be counted", () => parser.rejected >= 1)
          expect(marks.some((mark) => mark.seq === 9)).toBe(false)

          // The shell variable is not exported, and the file that carried the nonce is gone.
          const nonce = attachment.shellNonce!
          attachment.write("env | grep -c ORCHESTRA_SI_NONCE; echo done-$((6*7))\n")
          yield* until("env check", () => plain().includes("done-42\r\n"))
          expect(plain()).toMatch(/[\r\n]0\r\ndone-42/)
          expect(text().replaceAll(nonce, "")).not.toContain("nonce-")
          expect(existsSync(path.join(os.tmpdir(), `orchestra-shell-integration-${process.getuid?.() ?? 0}`))).toBe(true)
        }),
      30000,
    )

  for (const shell of shells)
    shellTest(
      `${shell} reports its directory so Info.cwd follows a cd`,
      () =>
        Effect.gen(function* () {
          const pty = yield* Pty.Service
          const { attachment, marks, until, id } = yield* session(shell)
          yield* until("first prompt", () => marks.length > 0)
          // The OS resolves the symlink the shell starts in, and the shell reports what it has.
          expect((yield* pty.get(id)).cwd).toBe(realpathSync("/tmp"))

          const base = yield* Effect.promise(() => mkdtemp(path.join(os.tmpdir(), "orchestra-si-cwd-")))
          const target = path.join(base, "a b%c")
          yield* Effect.promise(() => mkdir(target))
          attachment.write(`cd '${target}'\n`)
          yield* until("the shell to report it", () => marks.some((mark) => mark.kind === "prompt" && mark.seq === 1))
          expect((yield* pty.get(id)).cwd).toBe(target)
        }),
      30000,
    )

  if (existsSync("/bin/bash"))
    shellTest(
      "bash as a login shell runs the login startup files and still marks",
      () =>
        Effect.gen(function* () {
          const { marks, until } = yield* session("/bin/bash", ["-l"])
          yield* until("first prompt", () => marks.some((mark) => mark.kind === "prompt"))
        }),
      30000,
    )
})
