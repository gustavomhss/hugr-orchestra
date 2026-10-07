import { describe, expect } from "bun:test"
import path from "path"
import { readFile } from "fs/promises"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { Effect, Layer } from "effect"
import { Shell } from "@opencode-ai/core/shell"
import { CrossSpawnSpawner } from "@opencode-ai/core/cross-spawn-spawner"
import { FSUtil } from "@opencode-ai/core/fs-util"
import { BackendToolkit } from "@opencode-ai/core/backend-toolkit"
import { BackendToolkitManifest } from "@opencode-ai/core/backend-toolkit/manifest"
import { Config } from "@/config/config"
import { RuntimeFlags } from "@/effect/runtime-flags"
import { Truncate } from "@/tool/truncate"
import { ShellTool } from "../../src/tool/shell"
import { Agent } from "../../src/agent/agent"
import { Plugin } from "../../src/plugin"
import { SessionID, MessageID } from "../../src/session/schema"
import { provideInstance, testInstanceStoreLayer, tmpdirScoped } from "../fixture/fixture"
import { testEffect } from "../lib/effect"

const it = testEffect(
  Layer.mergeAll(
    LayerNode.compile(
      LayerNode.group([CrossSpawnSpawner.node, FSUtil.node, Plugin.node, Truncate.node, Config.node, Agent.node, RuntimeFlags.node]),
    ),
    testInstanceStoreLayer,
  ),
)

const context = (agent: string) => ({
  sessionID: SessionID.make("ses_test"),
  messageID: MessageID.make("msg_test"),
  callID: "",
  agent,
  agentID: agent,
  abort: AbortSignal.any([]),
  messages: [],
  metadata: () => Effect.void,
  ask: () => Effect.void,
})

Shell.acceptable.reset()
const bin = `"${process.execPath.replaceAll("\\", "/")}"`
const shell = Shell.name(Shell.acceptable())
// A Bun one-liner (no quotes inside `code`) followed by its arguments, spelled for the session's shell.
const bun = (code: string, ...args: string[]) => {
  const text = `${bin} -e ${shell === "cmd" ? `"${code}"` : `'${code}'`} ${args.join(" ")}`
  return shell === "pwsh" || shell === "powershell" ? `& ${text}` : text
}
// Records what the command saw as BACKEND_TOOLKIT_BIN into `sentinel`; the trailing argument names sqlc for prepare.
const command = bun("Bun.write(Bun.argv[1],String(process.env.BACKEND_TOOLKIT_BIN))", "sentinel", "$BACKEND_TOOLKIT_BIN/sqlc")

// The fixture serves nothing, so sqlc's fetch fails with a 404 and never leaves the machine.
const fixture = Effect.gen(function* () {
  const directory = yield* tmpdirScoped()
  const hits: string[] = []
  const server = yield* Effect.acquireRelease(
    Effect.sync(() =>
      Bun.serve({
        port: 0,
        fetch: (request) => {
          hits.push(new URL(request.url).pathname)
          return new Response("missing", { status: 404 })
        },
      }),
    ),
    (server) => Effect.promise(() => server.stop(true)),
  )
  const engine = BackendToolkitManifest.ENGINES.sqlc
  const pin = (target: keyof typeof engine.targets) => ({
    ...engine.targets[target],
    artifact: { ...engine.targets[target].artifact, url: `http://127.0.0.1:${server.port}/sqlc` },
  })
  const manifest = {
    ...BackendToolkitManifest.ENGINES,
    sqlc: {
      ...engine,
      targets: {
        "darwin-arm64": pin("darwin-arm64"),
        "darwin-x64": pin("darwin-x64"),
        "linux-arm64": pin("linux-arm64"),
        "linux-x64": pin("linux-x64"),
        "win32-x64": pin("win32-x64"),
      },
    },
  }
  const root = path.join(directory, "toolkit")
  const execute = (agent: string) =>
    Effect.gen(function* () {
      const info = yield* ShellTool
      const tool = yield* info.init()
      return yield* tool.execute({ command }, context(agent))
    }).pipe(
      provideInstance(directory),
      Effect.provideService(BackendToolkit.Root, root),
      Effect.provideService(BackendToolkit.Manifest, manifest),
    )
  const sentinel = Effect.promise(() => readFile(path.join(directory, "sentinel"), "utf8").catch(() => undefined))
  return { directory, root, hits, execute, sentinel }
})

describe("tool.shell backend toolkit preparation", () => {
  it.live("a blocked engine is the backend seat's output and the command never runs", () =>
    Effect.gen(function* () {
      const f = yield* fixture
      const result = yield* f.execute("backend")
      expect(result.output).toContain("toolkit-not-ready:failed:sqlc:download:404")
      expect(f.hits).toEqual(["/sqlc"])
      expect(yield* f.sentinel).toBeUndefined()
    }), 60_000,
  )

  it.live("the backend seat's shell sees BACKEND_TOOLKIT_BIN as the toolkit's bin directory", () =>
    Effect.gen(function* () {
      const f = yield* fixture
      const info = yield* ShellTool
      const result = yield* Effect.gen(function* () {
        const tool = yield* info.init()
        return yield* tool.execute({ command: bun("console.log(process.env.BACKEND_TOOLKIT_BIN)") }, context("backend"))
      }).pipe(provideInstance(f.directory), Effect.provideService(BackendToolkit.Root, f.root))
      expect(result.metadata.exit).toBe(0)
      expect(result.output.trim()).toBe(path.join(f.root, "bin"))
      expect(f.hits).toEqual([])
    }), 60_000,
  )

  it.live("another agent gets no preparation: nothing is fetched and the command runs without the variable", () =>
    Effect.gen(function* () {
      const f = yield* fixture
      const result = yield* f.execute("maestro")
      expect(result.metadata.exit).toBe(0)
      expect(f.hits).toEqual([])
      expect(yield* f.sentinel).toBe(String(process.env.BACKEND_TOOLKIT_BIN))
    }), 60_000,
  )
})
