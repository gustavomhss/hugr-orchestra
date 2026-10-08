// The omni terminal backend (integration plan WP2, D-L7), through the Pty service as the server uses it and through the
// adapter where the service cannot observe the property (output queued before any listener). Runs only with
// ORCHESTRA_EXPERIMENTAL_OMNI_SPAWNER on; processes are identified by the nonce tree's oracle, never by a bare pid.
import { describe, expect } from "bun:test"
import { existsSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import { Effect, Exit, Layer, Queue, Scope } from "effect"
import { Config } from "@orchestra/core/config"
import { AppNodeBuilder } from "@orchestra/core/effect/app-node-builder"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { EventV2 } from "@orchestra/core/event"
import { Flag } from "@orchestra/core/flag/flag"
import { Location } from "@orchestra/core/location"
import { OmniAdoption } from "@orchestra/core/omni-adoption"
import { Pty } from "@orchestra/core/pty"
import { PtyOmni } from "@orchestra/core/pty/omni"
import { PtyProtocol } from "@orchestra/core/pty/protocol"
import type { PtyID } from "@orchestra/core/pty/schema"
import { AbsolutePath } from "@orchestra/core/schema"
import { location } from "../fixture/location"
import { alive, gone, reap, sweep, tree } from "../fixture/process-tree"
import { testEffect } from "../lib/effect"

const windows = process.platform === "win32"
const tmp = os.tmpdir()
const SHELL = windows ? "cmd.exe" : "/bin/sh"
const ENTER = "\r"
const ptyLayer = () =>
  AppNodeBuilder.build(LayerNode.group([Pty.node, EventV2.node]), [
    [Config.node, Layer.mock(Config.Service)({ entries: () => Effect.succeed([]) })],
    [
      Location.node,
      Layer.succeed(Location.Service, Location.Service.of(location({ directory: AbsolutePath.make(tmp) }))),
    ],
  ])
const it = testEffect(ptyLayer())
const omniTest = Flag.ORCHESTRA_EXPERIMENTAL_OMNI_SPAWNER === "off" ? it.live.skip : it.live

// Terminal output carries escape sequences (ConPTY rewrites runs of spaces as cursor moves); oracles read plain text.
const plain = (text: string) =>
  text.replace(/\x1b\[[0-?]*[ -/]*[@-~]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b[()][0-9A-Za-z]|\x1b[=>78]/g, "")

const attach = Effect.fn("PtyOmniTest.attach")(function* (id: PtyID, cursor?: number) {
  const pty = yield* Pty.Service
  const chunks = yield* Queue.unbounded<string>()
  const seen = { text: "" }
  const attachment = yield* pty.attach(id, {
    cursor,
    onData: (chunk) => {
      seen.text += chunk
      Queue.offerUnsafe(chunks, chunk)
    },
    onEnd: () => {},
  })
  attachment.activate()
  // Everything this attachment has: the replay, then every live chunk.
  const full = () => attachment.replay + seen.text
  // `match` gets the raw text: large outputs check it as it is, small ones through plain().
  const until = (match: (text: string) => boolean, what: string) =>
    Effect.gen(function* () {
      while (!match(seen.text)) yield* Queue.take(chunks)
    }).pipe(
      Effect.timeoutOrElse({
        duration: "30 seconds",
        orElse: () => Effect.die(new Error(`no ${what} in the terminal output:\n${plain(full()).slice(-2000)}`)),
      }),
    )
  return { attachment, full, seen, until }
})

const create = Effect.fn("PtyOmniTest.create")(function* (input: Pty.CreateInput) {
  const pty = yield* Pty.Service
  return yield* Effect.acquireRelease(pty.create({ cwd: tmp, cols: 200, ...input }), (info) =>
    pty.remove(info.id).pipe(Effect.ignore),
  )
})

// The nonce tree with its script in a file, so a shell can start it from a plain command line on every OS.
function launcher() {
  const fixture = tree(2)
  const dir = fixture.args.at(-1) ?? ""
  const script = path.join(dir, "tree.cjs")
  writeFileSync(script, fixture.args[1] ?? "")
  const line = `"${fixture.command}" "${script}" ${fixture.nonce} 2 "${dir}"`
  return { ...fixture, line }
}

const ended = (nonce: string) =>
  Effect.promise(async () => {
    const left = await gone(nonce)
    const swept = left === 0 ? await sweep(nonce) : []
    await reap(nonce)
    return { left, swept }
  })

describe("pty text splits", () => {
  it.live("replay frames never split a surrogate pair", () =>
    Effect.sync(() => {
      const data = "a" + "\u{1F600}".repeat(PtyProtocol.REPLAY_CHUNK)
      const frames = PtyProtocol.chunks(data)
      expect(frames.join("")).toBe(data)
      for (const frame of frames) {
        expect(frame.length).toBeLessThanOrEqual(PtyProtocol.REPLAY_CHUNK)
        expect(/^[\uDC00-\uDFFF]|[\uD800-\uDBFF]$/.test(frame)).toBe(false)
      }
      expect(PtyProtocol.cut("a\u{1F600}", 2)).toBe(1)
      expect(PtyProtocol.cut("ab", 1)).toBe(1)
    }),
  )
})

describe("pty on omni", () => {
  omniTest(
    "removing a session ends its whole tree: the tree as the root, and typed into a shell",
    () =>
      Effect.gen(function* () {
        const pty = yield* Pty.Service
        const direct = tree(2)
        const root = yield* create({ command: direct.command, args: direct.args })
        yield* (yield* attach(root.id)).until((text) => plain(text).includes(direct.ready), "ready line")
        expect(yield* Effect.promise(() => alive(direct.nonce))).toBe(direct.size)
        yield* pty.remove(root.id)
        expect(yield* ended(direct.nonce)).toEqual({ left: 0, swept: [] })

        const typed = launcher()
        const shell = yield* create({ command: SHELL })
        const session = yield* attach(shell.id)
        session.attachment.write(typed.line + ENTER)
        yield* session.until((text) => plain(text).includes(typed.ready), "ready line")
        yield* pty.remove(shell.id)
        expect(yield* ended(typed.nonce)).toEqual({ left: 0, swept: [] })
      }),
    90_000,
  )

  omniTest(
    "a program that prints and exits at once loses nothing, 50 times, read only after it exited",
    () =>
      Effect.gen(function* () {
        const { spawn } = yield* Effect.promise(() => PtyOmni.load())
        const digits = "0123456789".repeat(10)
        for (let round = 0; round < 50; round++) {
          const text = `BEGIN-${round} ${digits} END-${round}`
          const proc = spawn(SHELL, windows ? ["/d", "/c", `echo ${text}`] : ["-c", `printf '%s' '${text}'`], {
            name: "xterm-256color",
            cols: 200,
            cwd: tmp,
          })
          const result = yield* Effect.promise(async () => {
            await proc.child.wait()
            const chunks: string[] = []
            proc.onData((data) => chunks.push(data))
            const exit = await new Promise<Parameters<Parameters<typeof proc.onExit>[0]>[0]>((resolve) =>
              proc.onExit(resolve),
            )
            return { exit, output: plain(chunks.join("")).replace(/[\r\n]/g, "") }
          })
          expect({ round, exitCode: result.exit.exitCode, found: result.output.includes(text) }).toEqual({
            round,
            exitCode: 0,
            found: true,
          })
        }
      }),
    180_000,
  )

  omniTest(
    "the exit code is the root's, or 128 + the signal's number",
    () =>
      Effect.gen(function* () {
        const { spawn } = yield* Effect.promise(() => PtyOmni.load())
        const exitOf = (args: string[]) =>
          Effect.promise(
            () =>
              new Promise<number>((resolve) =>
                spawn(SHELL, args, { name: "xterm-256color", cwd: tmp }).onExit((event) => resolve(event.exitCode)),
              ),
          )
        expect(yield* exitOf(windows ? ["/d", "/c", "exit 3"] : ["-c", "exit 3"])).toBe(3)
        if (!windows) expect(yield* exitOf(["-c", "kill -TERM $$"])).toBe(128 + os.constants.signals.SIGTERM)
      }),
    60_000,
  )

  omniTest(
    "the size is set at create and on update, clamped to 32767",
    () =>
      Effect.gen(function* () {
        const pty = yield* Pty.Service
        const ask = windows ? "mode con" : "stty size"
        const shows = (rows: number, cols: number) => (text: string) =>
          windows
            ? new RegExp(`Lines:\\s*${rows}\\b[\\s\\S]*Columns:\\s*${cols}\\b`).test(text)
            : // The shell's prompt may land before the answer on the same line.
              new RegExp(`\\b${rows} ${cols}\\r?\\n`).test(text)
        const check = Effect.fn("PtyOmniTest.check")(function* (
          session: Effect.Success<ReturnType<typeof attach>>,
          rows: number,
          cols: number,
        ) {
          const from = session.seen.text.length
          session.attachment.write(ask + ENTER)
          yield* session.until((text) => shows(rows, cols)(plain(text.slice(from))), `${rows}x${cols}`)
        })

        const info = yield* create({ command: SHELL, cols: 100, rows: 30 })
        const session = yield* attach(info.id)
        yield* check(session, 30, 100)
        yield* pty.update(info.id, { size: { cols: 120, rows: 40 } })
        yield* check(session, 40, 120)
        if (windows) return
        // A huge side is clamped, not refused, on update and on create.
        yield* pty.update(info.id, { size: { cols: 99_999, rows: 50 } })
        yield* check(session, 50, 32767)
        const wide = yield* create({ command: SHELL, cols: 70_000, rows: 24 })
        yield* check(yield* attach(wide.id), 24, 32767)
      }),
    90_000,
  )

  omniTest(
    "replay after a reconnect is exact and the cursor counts UTF-16 units",
    () =>
      Effect.gen(function* () {
        const pty = yield* Pty.Service
        const nonce = `replay-${crypto.randomUUID()}`
        const script = `process.stdout.write("aé\u{1F600}b ".repeat(500) + "READY-" + process.argv.at(-1) + "\\n"); process.stdin.on("data", (d) => process.stdout.write("[" + String(d).trim() + "\u{1F600}]"))`
        const info = yield* create({ command: process.execPath, args: ["-e", script, nonce] })
        const first = yield* attach(info.id)
        yield* first.until((text) => plain(text).includes(`READY-${nonce}`), "ready line")
        expect(first.attachment.replay.length).toBe(first.attachment.cursor)

        // Every later attachment sees exactly what the first one had at its cursor.
        const again = yield* pty.attach(info.id, { cursor: 0, onData: () => {}, onEnd: () => {} })
        expect(again.replay).toBe(first.full().slice(0, again.cursor))
        const middle = Math.floor(again.cursor / 2)
        const half = yield* pty.attach(info.id, { cursor: middle, onData: () => {}, onEnd: () => {} })
        expect(half.replay).toBe(first.full().slice(middle, half.cursor))
        const tail = yield* pty.attach(info.id, { cursor: -1, onData: () => {}, onEnd: () => {} })
        expect(tail.replay).toBe("")
        for (const attachment of [again, half, tail]) attachment.detach()

        // Disconnect, let output happen, reconnect at the last cursor: the replay is exactly what was missed.
        const left = first.full().length
        first.attachment.detach()
        yield* pty.write(info.id, `more-${nonce}${ENTER}`)
        const watcher = yield* attach(info.id, left)
        yield* watcher.until(() => plain(watcher.full()).includes(`more-${nonce}\u{1F600}]`), "echoed input")
        const whole = yield* pty.attach(info.id, { cursor: 0, onData: () => {}, onEnd: () => {} })
        expect(whole.replay.slice(0, left)).toBe(first.full())
        expect(whole.replay.slice(left)).toBe(watcher.full().slice(0, whole.cursor - left))
        expect(whole.cursor).toBe(whole.replay.length)
        whole.detach()
      }),
    60_000,
  )

  // A real gap needs more than 16 MiB of terminal output while the host is not reading. ConPTY renders frames and
  // never produces that much, so on Windows the marker is checked through the adapter below.
  ;(windows ? it.live.skip : omniTest)(
    "a gap becomes a visible marker counted in the cursor",
    () =>
      Effect.gen(function* () {
        const pty = yield* Pty.Service
        const nonce = `gap-${crypto.randomUUID()}`
        const done = path.join(tmp, `${nonce}.done`)
        const script = [
          `const fs = require("node:fs"); const line = "x".repeat(1023) + "\\n"; const block = line.repeat(1024)`,
          `for (let i = 0; i < 40; i++) fs.writeSync(1, block)`,
          `fs.writeFileSync(${JSON.stringify(done)}, "")`,
          `setTimeout(() => fs.writeSync(1, "END-" + process.argv.at(-1) + "\\n"), 300); setInterval(() => {}, 1e9)`,
        ].join("\n")
        const info = yield* create({ command: process.execPath, args: ["-e", script, nonce] })
        const session = yield* attach(info.id)
        // Hold the host's thread while the child writes 40 MiB: omni keeps 16 MiB for the consumer, drops the rest.
        yield* Effect.sync(() => {
          const deadline = Date.now() + 120_000
          while (!existsSync(done) && Date.now() < deadline) Bun.sleepSync(20)
        })
        yield* session.until((text) => text.includes(`END-${nonce}`), "end line")
        const skipped = [...session.full().matchAll(/\[orchestra: (\d+) bytes of output skipped\]/g)].map((match) =>
          Number(match[1]),
        )
        expect(skipped.length).toBeGreaterThan(0)
        expect(skipped.every((bytes) => bytes > 0)).toBe(true)
        const later = yield* pty.attach(info.id, { cursor: 0, onData: () => {}, onEnd: () => {} })
        expect(later.cursor).toBe(session.full().length)
        expect(later.replay).toBe(session.full().slice(later.cursor - later.replay.length))
        later.detach()
      }),
    180_000,
  )

  omniTest("the adapter turns a gap into the marker, in order, before the data that follows it", () =>
    Effect.promise(async () => {
      const items = [{ data: "a" }, { data: "b", lostBefore: 7 }, { data: "", lostBefore: 3 }]
      const child = {
        pid: 1,
        output: {
          async *[Symbol.asyncIterator]() {
            for (const item of items) yield { stream: "pty" as const, ...item }
          },
        },
        wait: async () => ({ exitCode: 0, signal: null, reason: "exit" as const, success: true }),
        stop: async () => ({ exitCode: 0, signal: null, reason: "exit" as const, success: true }),
      }
      const proc = PtyOmni.adapt(child as unknown as Parameters<typeof PtyOmni.adapt>[0])
      const data: string[] = []
      proc.onData((chunk) => data.push(chunk))
      await new Promise((resolve) => proc.onExit(resolve))
      expect(data).toEqual(["a", PtyOmni.marker(7), "b", PtyOmni.marker(3)])
      expect(PtyOmni.marker(7)).toBe("\x1b[0m\r\n[orchestra: 7 bytes of output skipped]\r\n")
    }),
  )

  omniTest(
    "closing a session with live descendants hands the tree to the adoption registry, which stops it",
    () =>
      Effect.gen(function* () {
        const pty = yield* Pty.Service
        const registered: OmniAdoption.RegisterInput[] = []
        const registry: OmniAdoption.Interface = {
          register: (child, input) =>
            Effect.suspend(() => {
              registered.push(input)
              return OmniAdoption.stub.register(child, input)
            }),
        }
        const fixture = tree(2)
        const info = yield* create({ command: fixture.command, args: fixture.args, title: "adopted" }).pipe(
          Effect.provideService(OmniAdoption.Service, { sessionID: "ses_test", policy: "tool" }),
          Effect.provideService(OmniAdoption.Registry, registry),
        )
        yield* (yield* attach(info.id)).until((text) => plain(text).includes(fixture.ready), "ready line")
        yield* pty.remove(info.id)
        expect(yield* ended(fixture.nonce)).toEqual({ left: 0, swept: [] })
        expect(registered).toEqual([{ sessionID: "ses_test", title: "adopted" }])
      }),
    60_000,
  )

  omniTest(
    "the layer's end awaits every stop: nothing of the tree is alive once it returns",
    () =>
      Effect.gen(function* () {
        const fixture = tree(2)
        // Its own memo map: the test's Pty layer would otherwise be shared, and end only with the test.
        const scope = yield* Scope.make()
        const context = yield* Layer.buildWithMemoMap(ptyLayer(), yield* Layer.makeMemoMap, scope)
        yield* Effect.gen(function* () {
          const pty = yield* Pty.Service
          const info = yield* pty.create({ command: fixture.command, args: fixture.args, cwd: tmp })
          yield* (yield* attach(info.id)).until((text) => plain(text).includes(fixture.ready), "ready line")
        }).pipe(Effect.scoped, Effect.provide(context))
        yield* Scope.close(scope, Exit.void)
        expect(yield* Effect.promise(() => alive(fixture.nonce))).toBe(0)
        expect(yield* ended(fixture.nonce)).toEqual({ left: 0, swept: [] })
      }),
    60_000,
  )
})
