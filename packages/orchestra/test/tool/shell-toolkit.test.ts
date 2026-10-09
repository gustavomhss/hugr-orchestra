import { describe, expect } from "bun:test"
import path from "path"
import { readFile } from "fs/promises"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { Effect, Layer } from "effect"
import { Shell } from "@orchestra/core/shell"
import { CrossSpawnSpawner } from "@orchestra/core/cross-spawn-spawner"
import { FSUtil } from "@orchestra/core/fs-util"
import { BackendToolkit } from "@orchestra/core/backend-toolkit"
import { BackendToolkitManifest } from "@orchestra/core/backend-toolkit/manifest"
import { Config } from "@/config/config"
import { RuntimeFlags } from "@/effect/runtime-flags"
import { Truncate } from "@/tool/truncate"
import { ShellTool } from "../../src/tool/shell"
import { Agent } from "../../src/agent/agent"
import { Plugin } from "../../src/plugin"
import { SessionID, MessageID } from "../../src/session/schema"
import { provideInstance, testInstanceStoreLayer, tmpdirScoped } from "../fixture/fixture"
import { testEffect } from "../lib/effect"
import { ShellScan } from "../../src/tool/shell/scan"

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

describe("owned OpenAPI argv extraction", () => {
  const extract = (command: string, shell = "bash") => ShellScan.ownedToolArgv({ command, shell, toolkitBin: path.resolve("owned-toolkit/bin") })
  const forms = [
    '"$BACKEND_TOOLKIT_BIN/openapi-generator"',
    '${BACKEND_TOOLKIT_BIN}/openapi-generator',
    '"$BACKEND_TOOLKIT_BIN"/openapi-generator',
  ]
  for (const executable of forms) {
    it.live(`extracts bench13 literal config argv: ${executable}`, () => Effect.gen(function* () {
      expect(yield* extract(`${executable} generate -c openapi-generator.yaml`)).toEqual({
        calls: [{ engine: "openapi-generator", argv: ["generate", "-c", "openapi-generator.yaml"] }],
      })
    }))
  }
  it.live("extracts quoted args and equals flags without reparsing CLI prose", () => Effect.gen(function* () {
    expect(yield* extract(`${forms[0]} generate --config='config file.yaml' -o="out dir" --dry-run`)).toEqual({
      calls: [{ engine: "openapi-generator", argv: ["generate", "--config=config file.yaml", "-o=out dir", "--dry-run"] }],
    })
    expect(yield* extract('echo "openapi-generator generate -o elsewhere"')).toEqual({ calls: [] })
    expect(yield* extract('"$BACKEND_TOOLKIT_BIN/sqlc" generate')).toEqual({ calls: [] })
  }))
  for (const executable of ['& "$env:BACKEND_TOOLKIT_BIN\\openapi-generator.cmd"', '& $env:BACKEND_TOOLKIT_BIN\\openapi-generator.cmd']) {
    it.live(`extracts PowerShell literal config argv: ${executable}`, () => Effect.gen(function* () {
      expect(yield* extract(`${executable} generate -c 'config file.yaml' --output=generated`, "pwsh")).toEqual({
        calls: [{ engine: "openapi-generator", argv: ["generate", "-c", "config file.yaml", "--output=generated"] }],
      })
    }))
  }
  it.live("PowerShell equals projection keeps quoted values bound and refuses empty/dynamic values", () => Effect.gen(function* () {
    const executable = '& "$env:BACKEND_TOOLKIT_BIN\\openapi-generator.cmd"'
    expect(yield* extract(`${executable} generate --output="out dir"`, "pwsh")).toEqual({
      calls: [{ engine: "openapi-generator", argv: ["generate", "--output=out dir"] }],
    })
    expect(yield* extract(`${executable} generate --output=`, "pwsh")).toEqual({ blocked: "engine-project-version:unbound-args" })
    expect(yield* extract(`${executable} generate --output=$out`, "pwsh")).toEqual({ blocked: "engine-project-version:unbound-args" })
    expect(yield* extract(`${executable} generate --output= generated`, "pwsh")).toEqual({ blocked: "engine-project-version:unbound-args" })
    expect(yield* extract(`${executable} generate --config=openapi-generator.yaml --output=generated --strict-spec=false`, "pwsh")).toEqual({
      calls: [{ engine: "openapi-generator", argv: ["generate", "--config=openapi-generator.yaml", "--output=generated", "--strict-spec=false"] }],
    })
    expect(yield* extract(`${executable} generate --config=openapi-generator.yaml --output=$out --strict-spec=false`, "pwsh")).toEqual({ blocked: "engine-project-version:unbound-args" })
  }))
  it.live("toolkit executable expansions bind only their own shell's environment syntax", () => Effect.gen(function* () {
    for (const executable of ['& "$BACKEND_TOOLKIT_BIN\\openapi-generator.cmd"', '& "${BACKEND_TOOLKIT_BIN}\\openapi-generator.cmd"']) {
      expect(yield* extract(`${executable} generate -o out`, "pwsh")).toEqual({ blocked: "engine-project-version:unsupported-owned-call" })
    }
    expect(yield* extract('"${env:BACKEND_TOOLKIT_BIN}/openapi-generator" generate -o out', "bash")).toEqual({ blocked: "engine-project-version:unsupported-owned-call" })
  }))
  for (const command of [
    `${forms[0]} generate -o "$OUT"`, `${forms[0]} generate $ARGS`,
    `${forms[0]} generate -c $(printf config.yaml)`, `${forms[0]} generate -o generated/*`,
  ]) {
    it.live(`dynamic args block: ${command}`, () => Effect.gen(function* () {
      expect(yield* extract(command)).toEqual({ blocked: "engine-project-version:unbound-args" })
    }))
  }
  it.live("cd, shell wrappers, redirected and unsupported owned expressions block by name", () => Effect.gen(function* () {
    expect(yield* extract(`cd sub && ${forms[0]} generate -o out`)).toEqual({ blocked: "engine-project-version:unbound-cwd" })
    for (const command of [`env ${forms[0]} generate -o out`, `${forms[0]} generate -o out > transcript`, `BACKEND_TOOLKIT_BIN=/elsewhere ${forms[0]} generate -o out`, '"$BACKEND_TOOLKIT_BIN/$ENGINE" generate -o out'])
      expect(yield* extract(command)).toEqual({ blocked: "engine-project-version:unsupported-owned-call" })
    expect(yield* extract('& "$env:BACKEND_TOOLKIT_BIN\\openapi-generator.cmd" generate -o $out', "pwsh")).toEqual({ blocked: "engine-project-version:unbound-args" })
    expect(yield* extract('& "$env:BACKEND_TOOLKIT_BIN\\openapi-generator.cmd" generate --% -o out', "pwsh")).toEqual({ blocked: "engine-project-version:unsupported-owned-call" })
  }))
  it.live("literal owned paths behind executor wrappers block; echo path operands remain data", () => Effect.gen(function* () {
    const toolkitBin = path.resolve("owned-toolkit/bin")
    const executable = path.join(toolkitBin, process.platform === "win32" ? "openapi-generator.cmd" : "openapi-generator").replaceAll("\\", "/")
    for (const wrapper of ["env", "/usr/bin/env", "command", "exec", "nohup", "nice", "timeout", "sudo"]) {
      expect(yield* extract(`${wrapper} "${executable}" generate -o out`)).toEqual({ blocked: "engine-project-version:unsupported-owned-call" })
    }
    expect(yield* extract(`echo "${executable}" generate -o out`)).toEqual({ calls: [] })
    expect(yield* extract('echo "$BACKEND_TOOLKIT_BIN/openapi-generator"')).toEqual({ calls: [] })
    expect(yield* extract(`env "${executable}" generate -o out`, "pwsh")).toEqual({ blocked: "engine-project-version:unsupported-owned-call" })
  }))
})
