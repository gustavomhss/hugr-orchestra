import { describe, expect } from "bun:test"
import path from "path"
import { readFile, readdir, writeFile } from "fs/promises"
import { createHash } from "crypto"
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
import { ChildProcessSpawner } from "effect/unstable/process/ChildProcessSpawner"

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

// Complete project byte snapshot, including hidden metadata and directory entries (new files must also fail).
async function projectBytes(directory: string): Promise<ReadonlyArray<readonly [string, string]>> {
  const entries = await readdir(directory, { withFileTypes: true })
  return (await Promise.all(entries.sort((a, b) => a.name.localeCompare(b.name)).map(async (entry) => {
    if (entry.isDirectory()) return [[`${entry.name}/`, ""], ...(await projectBytes(path.join(directory, entry.name))).map(([file, bytes]) => [`${entry.name}/${file}`, bytes] as const)] as const
    return [[entry.name, (await readFile(path.join(directory, entry.name))).toString("base64")]] as const
  }))).flat()
}

const generationFixture = Effect.gen(function* () {
  const project = yield* tmpdirScoped()
  const tools = yield* tmpdirScoped()
  const fs = yield* FSUtil.Service
  const root = path.join(tools, "cache")
  yield* fs.writeWithDirs(path.join(project, "openapi-generator.yaml"), "generatorName: python\ninputSpec: contract.yaml\noutputDir: generated\n")
  yield* fs.writeWithDirs(path.join(project, "contract.yaml"), "openapi: 3.0.3\ninfo: {title: bench13, version: '1.0.0'}\npaths: {}\n")
  yield* fs.writeWithDirs(path.join(project, "source.py"), "owned source bytes\n")
  yield* fs.writeWithDirs(path.join(project, "generated/client.py"), "generated source bytes\n")
  yield* fs.writeWithDirs(path.join(project, "generated/.openapi-generator/VERSION"), "7.12.0\n")
  yield* fs.writeWithDirs(path.join(project, "generated/.openapi-generator/FILES"), "client.py\n")
  yield* fs.writeWithDirs(path.join(project, "generated/.openapi-generator-ignore"), "handwritten.py\n")
  const launched = path.join(tools, "launches")
  const argv = path.join(tools, "argv.json")
  const script = path.join(tools, "fixture.ts")
  yield* fs.writeFileString(script, `
    await Bun.write(${JSON.stringify(launched)}, "STUB_SPAWN_REACHED");
    await Bun.write(${JSON.stringify(argv)}, JSON.stringify(Bun.argv.slice(2)));
    console.log("STUB_SPAWN_REACHED", JSON.stringify(Bun.argv.slice(2)));
    await Bun.write("source.py", "MUTATED SOURCE");
    await Bun.write("generated/client.py", "MUTATED OUTPUT");
  `)
  const executable = process.platform === "win32" ? "openapi-generator.cmd" : "openapi-generator"
  const contents = process.platform === "win32"
    ? `@echo off\r\n"${process.execPath}" "${script}" %*\r\n`
    : `#!/bin/sh\nexec '${process.execPath}' '${script}' "$@"\n`
  const hits: string[] = []
  const server = yield* Effect.acquireRelease(Effect.sync(() => Bun.serve({ port: 0, fetch: (request) => {
    hits.push(new URL(request.url).pathname)
    return new Response(contents)
  } })), (server) => Effect.promise(() => server.stop(true)))
  const pin = {
    artifact: { url: `http://127.0.0.1:${server.port}/${executable}`, integrity: `sha256-${createHash("sha256").update(contents).digest("base64")}` as const,
      format: "raw" as const, entries: [{ from: executable, to: executable, executable: true }] },
    executable,
  }
  const pack = BackendToolkitManifest.ENGINES["openapi-generator"]
  const manifest = { ...BackendToolkitManifest.ENGINES, "openapi-generator": {
    id: pack.id, version: pack.version, license: pack.license, upstream: pack.upstream, fit: pack.fit,
    targets: { "darwin-arm64": pin, "darwin-x64": pin, "linux-arm64": pin, "linux-x64": pin, "win32-x64": pin },
  } }
  const within = <A, E, R>(effect: Effect.Effect<A, E, R>) => effect.pipe(
    Effect.provideService(BackendToolkit.Root, root), Effect.provideService(BackendToolkit.Manifest, manifest),
  )
  const command = Shell.ps(Shell.acceptable())
    ? '& "$env:BACKEND_TOOLKIT_BIN\\openapi-generator.cmd" generate -c openapi-generator.yaml'
    : '"$BACKEND_TOOLKIT_BIN/openapi-generator" generate -c openapi-generator.yaml'
  const literal = `${Shell.ps(Shell.acceptable()) ? "& " : ""}"${root.replaceAll("\\", "/")}/bin/./${executable}" generate -c openapi-generator.yaml`
  const wrapped = `env "${root.replaceAll("\\", "/")}/bin/./${executable}" generate -c openapi-generator.yaml`
  const execute = (ask = () => Effect.void, text = command) => Effect.gen(function* () {
    const info = yield* ShellTool
    const tool = yield* info.init()
    return yield* tool.execute({ command: text }, { ...context("backend"), ask })
  }).pipe(provideInstance(project), within)
  return { project, tools, root, hits, launched, argv, command, literal, wrapped, within, execute }
})

describe("scenario13 project pin enforcement at native shell boundary", () => {
  for (const warm of [false, true]) {
    it.live(`scenario13 mismatch preserves all project bytes before acquisition/launch (${warm ? "warm" : "cold"})`, () => Effect.gen(function* () {
      const f = yield* generationFixture
      const spawner = yield* ChildProcessSpawner
      let spawns = 0
      if (warm) {
        expect((yield* BackendToolkit.prepare(f.command).pipe(f.within)).blocked).toBeUndefined()
        expect(f.hits).toEqual([process.platform === "win32" ? "/openapi-generator.cmd" : "/openapi-generator"])
      }
      const before = yield* Effect.promise(() => projectBytes(f.project))
      const acquired = f.hits.length
      let approved = 0
      const result = yield* f.execute(() => Effect.sync(() => { approved++ })).pipe(
        Effect.provideService(ChildProcessSpawner, { ...spawner, spawn: (...args) => {
          spawns++
          return spawner.spawn(...args)
        } }),
      )
      if (process.env.ORCHESTRA_PROJECT_GATE_MUTANT === "1") console.log("mutation evidence:", { spawns, downloads: f.hits.length - acquired }, result.output,
        yield* Effect.promise(() => readFile(path.join(f.project, "generated/client.py"), "utf8")))
      expect(yield* Effect.promise(() => projectBytes(f.project))).toEqual(before)
      expect(result.output).toBe("engine-version-mismatch(project=7.12.0, bundled=7.25.0)")
      expect(approved).toBeGreaterThan(0)
      expect(spawns).toBe(0)
      expect(f.hits.length).toBe(acquired)
      expect(yield* Effect.promise(() => Bun.file(f.launched).exists())).toBe(false)
      if (!warm) expect(yield* Effect.promise(() => Bun.file(path.join(f.root, "bin", process.platform === "win32" ? "openapi-generator.cmd" : "openapi-generator")).exists())).toBe(false)
    }), 60_000)
  }

  for (const placement of ["variable", "literal"] as const) {
    for (const warm of [false, true]) {
      it.live(`matching pin acquires/launches exact bench13 argv once (${placement}, ${warm ? "warm" : "cold"})`, () => Effect.gen(function* () {
        const f = yield* generationFixture
        yield* Effect.promise(() => writeFile(path.join(f.project, "generated/.openapi-generator/VERSION"), "7.25.0\n"))
        if (warm) yield* BackendToolkit.ensure("openapi-generator").pipe(f.within)
        const result = yield* f.execute(undefined, placement === "literal" ? f.literal : f.command)
        expect(result.metadata.exit).toBe(0)
        expect(result.output).toContain('STUB_SPAWN_REACHED ["generate","-c","openapi-generator.yaml"]')
        expect(f.hits).toEqual([process.platform === "win32" ? "/openapi-generator.cmd" : "/openapi-generator"])
        expect(yield* Effect.promise(() => readFile(f.launched, "utf8"))).toBe("STUB_SPAWN_REACHED")
        expect(yield* Effect.promise(() => readFile(path.join(f.project, "generated/client.py"), "utf8"))).toBe("MUTATED OUTPUT")
      }), 60_000)
    }
  }

  for (const warm of [false, true]) {
    for (const placement of ["literal", "wrapped"] as const) {
      it.live(`owned literal boundary preserves all bytes without acquisition/launch (${placement}, ${warm ? "warm" : "cold"})`, () => Effect.gen(function* () {
        const f = yield* generationFixture
        if (warm) yield* BackendToolkit.ensure("openapi-generator").pipe(f.within)
        const acquired = f.hits.length
        const before = yield* Effect.promise(() => projectBytes(f.project))
        const spawner = yield* ChildProcessSpawner
        let spawns = 0
        const result = yield* f.execute(undefined, placement === "literal" ? f.literal : f.wrapped).pipe(
          Effect.provideService(ChildProcessSpawner, { ...spawner, spawn: (...args) => {
            spawns++
            return spawner.spawn(...args)
          } }),
        )
        expect(result.output).toBe(placement === "literal" ? "engine-version-mismatch(project=7.12.0, bundled=7.25.0)" : "engine-project-version:unsupported-owned-call")
        expect(yield* Effect.promise(() => projectBytes(f.project))).toEqual(before)
        expect(f.hits.length).toBe(acquired)
        expect(spawns).toBe(0)
        expect(yield* Effect.promise(() => Bun.file(f.launched).exists())).toBe(false)
      }), 60_000)
    }
  }

  it.live("literal echo data does not acquire or execute the generator", () => Effect.gen(function* () {
    const f = yield* generationFixture
    const before = yield* Effect.promise(() => projectBytes(f.project))
    const executable = f.literal.slice(0, f.literal.lastIndexOf(" generate"))
    const text = executable.startsWith("& ") ? executable.slice(2) : executable
    const result = yield* f.execute(undefined, `echo ${text}`)
    expect(result.metadata.exit).toBe(0)
    expect(f.hits).toEqual([])
    expect(yield* Effect.promise(() => Bun.file(f.launched).exists())).toBe(false)
    expect(yield* Effect.promise(() => projectBytes(f.project))).toEqual(before)
  }))

  it.live("YAML alias selecting old output blocks before acquisition/launch despite matching generated pin", () => Effect.gen(function* () {
    const f = yield* generationFixture
    const fs = yield* FSUtil.Service
    yield* fs.writeFileString(path.join(f.project, "generated/.openapi-generator/VERSION"), "7.25.0\n")
    yield* fs.writeWithDirs(path.join(f.project, "old/.openapi-generator/VERSION"), "7.10.0\n")
    yield* fs.writeFileString(path.join(f.project, "openapi-generator.yaml"), "checked: &checked generated\nselected: &old old\noutputDir: *old\ninputSpec: contract.yaml\n")
    const before = yield* Effect.promise(() => projectBytes(f.project))
    const result = yield* f.execute()
    expect(result.output).toBe("engine-project-version:unsupported-yaml-config")
    expect(f.hits).toEqual([])
    expect(yield* Effect.promise(() => projectBytes(f.project))).toEqual(before)
    expect(yield* Effect.promise(() => Bun.file(f.launched).exists())).toBe(false)
  }))

  it.live("multiple PowerShell equals flags match actual native fixture argv, cold and warm", () => Effect.gen(function* () {
    const f = yield* generationFixture
    const fs = yield* FSUtil.Service
    const pwsh = Bun.which("pwsh")
    if (!pwsh) throw new Error("fixture-prerequisite-missing:pwsh")
    yield* fs.writeFileString(path.join(f.project, "orchestra.json"), JSON.stringify({ shell: pwsh }))
    yield* fs.writeFileString(path.join(f.project, "generated/.openapi-generator/VERSION"), "7.25.0\n")
    const text = `& "$env:BACKEND_TOOLKIT_BIN/${process.platform === "win32" ? "openapi-generator.cmd" : "openapi-generator"}" generate --config=openapi-generator.yaml --output=generated --strict-spec=false`
    const parsed = yield* ShellScan.ownedToolArgv({ command: text, shell: pwsh, toolkitBin: path.join(f.root, "bin") })
    expect(parsed.calls?.[0].argv).toEqual(["generate", "--config=openapi-generator.yaml", "--output=generated", "--strict-spec=false"])
    for (const warm of [false, true]) {
      const result = yield* f.execute(undefined, text)
      expect(result.metadata.exit).toBe(0)
      expect(yield* Effect.promise(async () => JSON.parse(await readFile(f.argv, "utf8")))).toEqual(parsed.calls?.[0].argv)
      expect(f.hits).toEqual([process.platform === "win32" ? "/openapi-generator.cmd" : "/openapi-generator"])
      if (warm) expect(result.output).toContain("STUB_SPAWN_REACHED")
    }
  }), 60_000)

  it.live("permission refusal precedes project-pin checking and acquisition", () => Effect.gen(function* () {
    const f = yield* generationFixture
    const before = yield* Effect.promise(() => projectBytes(f.project))
    const exit = yield* f.execute(() => Effect.die(new Error("approval refused"))).pipe(Effect.exit)
    expect(exit._tag).toBe("Failure")
    expect(f.hits).toEqual([])
    expect(yield* Effect.promise(() => projectBytes(f.project))).toEqual(before)
  }))

  it.live("gate-omission mutation reaches stub/spawn and fails unchanged-output assertion", () => Effect.gen(function* () {
    const directory = yield* tmpdirScoped()
    const preload = path.join(directory, "omit-project-gate.ts")
    yield* Effect.promise(() => writeFile(preload, `
      import { plugin } from "bun";
      plugin({ name: "omit-project-pin-gate", setup(build) {
        build.onLoad({ filter: /[\\\\/]src[\\\\/]tool[\\\\/]shell\\.ts$/ }, async (args) => {
          const text = await Bun.file(args.path).text();
          const hook = "BackendToolkitProject.checkProjectVersion({";
          if (text.split(hook).length !== 2) throw new Error("mutation hook missing or ambiguous");
          return { contents: text.replace(hook, process.env.ORCHESTRA_PROJECT_GATE_MUTANT === "1"
            ? "((_: unknown) => Effect.void)({" : "BackendToolkitProject.checkProjectVersion({ /* no-op control */"), loader: "ts" };
        });
      }});
    `))
    for (const omit of [false, true]) {
      const child = Bun.spawn([process.execPath, "test", "--preload", preload, "./test/tool/shell-toolkit.test.ts", "-t", "scenario13 mismatch preserves all project bytes", "--timeout", "60000"], {
        cwd: path.resolve(import.meta.dir, "../.."), env: { ...process.env, ORCHESTRA_PROJECT_GATE_MUTANT: omit ? "1" : "0" }, stdout: "pipe", stderr: "pipe",
      })
      yield* Effect.addFinalizer(() => Effect.sync(() => child.kill()))
      const output = yield* Effect.promise(async () => (await new Response(child.stdout).text()) + (await new Response(child.stderr).text()))
      const code = yield* Effect.promise(() => child.exited)
      if (!omit) {
        expect(code).toBe(0)
        expect(output).toContain("2 pass")
        continue
      }
      expect(code).not.toBe(0)
      expect(output).toContain("STUB_SPAWN_REACHED")
      expect(output).toContain("MUTATED OUTPUT")
      expect(output).toMatch(/spawns: [1-9]/)
      expect(output).toContain("toEqual(before)")
      expect(output).toContain("2 fail")
    }
  }), 180_000)
})
