import { describe, expect, test } from "bun:test"
import { Effect, Fiber, Layer } from "effect"
import { ChildProcess } from "effect/unstable/process"
import { Config } from "@orchestra/core/config"
import { AppNodeBuilder } from "@orchestra/core/effect/app-node-builder"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { EventV2 } from "@orchestra/core/event"
import { Location } from "@orchestra/core/location"
import { Pty } from "@orchestra/core/pty"
import { AbsolutePath } from "@orchestra/core/schema"
import { ToolSafety } from "@orchestra/core/tool-safety"
import { AgentTerminal } from "@orchestra/core/tool/agent-terminal"
import { location } from "./fixture/location"
import { testEffect } from "./lib/effect"

const it = testEffect(
  AppNodeBuilder.build(LayerNode.group([Pty.node, EventV2.node]), [
    [Config.node, Layer.mock(Config.Service)({ entries: () => Effect.succeed([]) })],
    [Location.node, Layer.succeed(Location.Service, Location.Service.of(location({ directory: AbsolutePath.make("/tmp") })))],
  ]),
)
const ptyTest = process.platform === "win32" ? it.live.skip : it.live

const command = (script: string) => {
  const made = ChildProcess.make(script, [], {
    cwd: "/tmp",
    shell: "/bin/sh",
    extendEnv: false,
    env: { PATH: process.env.PATH ?? "/usr/bin:/bin" },
  })
  if (made._tag !== "StandardCommand") throw new Error("expected a standard command")
  return made
}

const run = (script: string, options: { timeout?: number; maxChars?: number } = {}) =>
  Effect.gen(function* () {
    const pty = yield* Pty.Service
    return yield* AgentTerminal.run(pty, {
      command: command(script),
      title: script,
      timeout: options.timeout ?? 10_000,
      maxChars: options.maxChars ?? 1024 * 1024,
    })
  })

describe("AgentTerminal.sanitize", () => {
  test("strips CSI, OSC and other escapes, including an OSC 52 clipboard write", () => {
    expect(AgentTerminal.sanitize("\x1b[31mred\x1b[0m \x1b]0;title\x07ok \x1b]52;c;aGk=\x1b\\done\x1bc")).toBe("red ok done")
  })

  test("a carriage return overwrites its line and a trailing one keeps it", () => {
    expect(AgentTerminal.sanitize("10%\r50%\r100%\nnext\r\nlast\r")).toBe("100%\nnext\nlast")
  })

  test("drops control characters but keeps newline and tab", () => {
    expect(AgentTerminal.sanitize("a\tb\x00c\x07d\x08e\nf")).toBe("a\tbcde\nf")
  })
})

describe("AgentTerminal.run", () => {
  test("the stdin note the model reads follows the flag", () => {
    const before = process.env.ORCHESTRA_AGENT_TERMINAL
    try {
      delete process.env.ORCHESTRA_AGENT_TERMINAL
      expect(AgentTerminal.stdinNote()).toContain("Stdin is empty")
      process.env.ORCHESTRA_AGENT_TERMINAL = "1"
      expect(AgentTerminal.stdinNote()).toContain(process.platform === "win32" ? "Stdin is empty" : "terminal tab the owner can watch")
    } finally {
      if (before === undefined) delete process.env.ORCHESTRA_AGENT_TERMINAL
      else process.env.ORCHESTRA_AGENT_TERMINAL = before
    }
  })

  test("enabled follows the flag", () => {
    const before = process.env.ORCHESTRA_AGENT_TERMINAL
    try {
      delete process.env.ORCHESTRA_AGENT_TERMINAL
      expect(AgentTerminal.enabled(command("true"))).toBe(false)
      process.env.ORCHESTRA_AGENT_TERMINAL = "1"
      expect(AgentTerminal.enabled(command("true"))).toBe(process.platform !== "win32")
    } finally {
      if (before === undefined) delete process.env.ORCHESTRA_AGENT_TERMINAL
      else process.env.ORCHESTRA_AGENT_TERMINAL = before
    }
  })

  ptyTest("returns clean output and the exit code, and keeps the tab", () =>
    Effect.gen(function* () {
      const pty = yield* Pty.Service
      const result = yield* run("printf 'a\\r\\n\\033[31mred\\033[0m\\n'; exit 3")
      expect(result).toEqual({ exitCode: 3, output: "a\nred\n", truncated: false })
      const tab = (yield* pty.list()).find((info) => info.title.startsWith("agent: printf"))
      expect(tab?.status).toBe("exited")
      expect(tab?.exitCode).toBe(3)
    }),
  )

  ptyTest("the command is a terminal, with the agent environment and nothing from the server", () =>
    Effect.gen(function* () {
      process.env.AGENT_TERMINAL_TEST_SECRET = "leak"
      const result = yield* run(
        `test -t 0 && test -t 1 && echo tty; echo "$ORCHESTRA_AGENT|$ORCHESTRA_TERMINAL|$NO_COLOR|$PAGER|$GIT_PAGER|$TERM|\${AGENT_TERMINAL_TEST_SECRET-unset}|$(stty size)"`,
      ).pipe(Effect.ensuring(Effect.sync(() => delete process.env.AGENT_TERMINAL_TEST_SECRET)))
      expect(result.output).toBe("tty\n1|1|1|cat|cat|xterm-256color|unset|50 200\n")
    }),
  )

  ptyTest("a person can answer a command that reads stdin", () =>
    Effect.gen(function* () {
      const pty = yield* Pty.Service
      const fiber = yield* Effect.forkChild(run("read -r name; echo got-$name"))
      const tab = yield* Effect.gen(function* () {
        for (let i = 0; i < 100; i++) {
          const found = (yield* pty.list()).find((info) => info.title.startsWith("agent: read"))
          if (found) return found
          yield* Effect.sleep("50 millis")
        }
        throw new Error("the agent tab never appeared")
      })
      yield* Effect.sleep("300 millis")
      yield* pty.write(tab.id, "ana\n")
      const result = yield* Fiber.join(fiber)
      expect(result).toMatchObject({ exitCode: 0 })
      expect(result.output).toContain("got-ana")
    }),
  )

  ptyTest("nobody answering ends in a timeout and kills the command", () =>
    Effect.gen(function* () {
      const pty = yield* Pty.Service
      const result = yield* run("read -r name", { timeout: 300 })
      expect(result).toEqual({ timedOut: true, output: "" })
      expect((yield* pty.list()).filter((info) => info.title.startsWith("agent: read"))).toEqual([])
    }),
  )

  ptyTest("a timeout returns what the command printed, the end of it included", () =>
    Effect.gen(function* () {
      const result = yield* run("printf 'x%.0s' $(seq 1 500); echo; echo tail-mark; read -r name", {
        timeout: 2_000,
        maxChars: 100,
      })
      expect(result).toMatchObject({ timedOut: true })
      expect(result.output).toContain("characters omitted from the middle of the output]")
      expect(result.output.trimEnd().endsWith("tail-mark")).toBe(true)
    }),
  )

  ptyTest("output that shows a secret is denied and the command is killed", () =>
    Effect.gen(function* () {
      const pty = yield* Pty.Service
      const exit = yield* run("printf 'ghp_%s\\n' abcdefghijklmnopqrstuvwxyzABCDEFGHIJKL; sleep 30").pipe(Effect.flip)
      expect(exit).toBeInstanceOf(ToolSafety.Denied)
      expect((yield* pty.list()).filter((info) => info.status === "running")).toEqual([])
    }),
  )

  ptyTest("output past the cap keeps its start and its end, and reports what it dropped", () =>
    Effect.gen(function* () {
      const result = yield* run("printf 'head-'; printf 'x%.0s' $(seq 1 500); echo; echo end-tail", { maxChars: 100 })
      expect(result).toMatchObject({ truncated: true })
      expect(result.output.startsWith("head-")).toBe(true)
      expect(result.output).toContain("characters omitted from the middle of the output]")
      expect(result.output.trimEnd().endsWith("end-tail")).toBe(true)
    }),
  )
})
