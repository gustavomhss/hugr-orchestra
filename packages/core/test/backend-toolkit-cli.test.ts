import { expect } from "bun:test"
import path from "path"
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "fs/promises"
import { tmpdir } from "os"
import { Effect, Fiber } from "effect"
import { BackendToolkit } from "../src/backend-toolkit"
import { BackendToolkitManifest } from "../src/backend-toolkit/manifest"
import { BackendToolkitTarget } from "../src/backend-toolkit/target"
import { it } from "./lib/effect"

// Actual pinned engines, actual installers and real generated/parsed/planned outputs. No host engine substitutes.
const fixture = Effect.gen(function* () {
  const root = yield* Effect.acquireRelease(
    Effect.promise(async () => realpath(await mkdtemp(path.join(tmpdir(), "backend-toolkit-cli-")))),
    (root) => Effect.promise(() => rm(root, { recursive: true, force: true })),
  )
  const project = path.join(root, "project")
  yield* Effect.promise(() => mkdir(project))
  return { root, project }
})

const run = (root: string, engine: BackendToolkitManifest.EngineId, args: ReadonlyArray<string>, cwd: string, env?: NodeJS.ProcessEnv, stdin?: string) =>
  Effect.promise(async () => {
    const executable = path.join(root, "bin", process.platform === "win32" ? `${engine}.cmd` : engine)
    const child = Bun.spawn(process.platform === "win32" ? [process.env.ComSpec ?? path.join(process.env.SystemRoot ?? "C:\\Windows", "System32", "cmd.exe"), "/c", executable, ...args] : [executable, ...args], {
      cwd, env: { ...process.env, ...env }, stdin: stdin === undefined ? "ignore" : Buffer.from(stdin),
      stdout: "pipe", stderr: "pipe", timeout: 60_000,
    })
    const [stdout, stderr, exitCode] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited])
    return { stdout, stderr, exitCode }
  })

it.live("cold and warm Buf generation launches its pinned ES dependency from the toolkit", () =>
  Effect.gen(function* () {
    const f = yield* fixture
    yield* Effect.promise(async () => {
      await writeFile(path.join(f.project, "buf.yaml"), "version: v2\nmodules:\n  - path: .\n")
      await writeFile(path.join(f.project, "buf.gen.yaml"), "version: v2\nplugins:\n  - local: protoc-gen-es\n    out: gen\n    opt: target=ts\n")
      await writeFile(path.join(f.project, "message.proto"), 'syntax = "proto3";\npackage probe.v1;\nmessage Message { string label = 1; }\n')
    })
    // A PATH with no host protoc-gen-es: prepare and the Buf shim must preserve caller paths after the owned bin.
    const prepared = yield* BackendToolkit.prepare('"$BACKEND_TOOLKIT_BIN/buf" generate', { PATH: path.join(f.root, "no-host-plugin") }).pipe(
      Effect.provideService(BackendToolkit.Root, f.root),
    )
    expect(prepared.blocked).toBeUndefined()
    expect(prepared.env.PATH).toBe(`${path.join(f.root, "bin")}${path.delimiter}${path.join(f.root, "no-host-plugin")}`)
    const cold = yield* run(f.root, "buf", ["generate"], f.project, prepared.env)
    expect(cold, cold.stderr).toMatchObject({ exitCode: 0 })
    const generated = yield* Effect.promise(() => readFile(path.join(f.project, "gen", "message_pb.ts"), "utf8"))
    expect(generated).toContain(`protoc-gen-es v${BackendToolkitManifest.ENGINES["protoc-gen-es"].version}`)
    expect(generated).toContain("label: string")
    const plugin = yield* run(f.root, "protoc-gen-es", ["--version"], f.project)
    expect(plugin, plugin.stderr).toMatchObject({ exitCode: 0 })
    expect(plugin.stdout.trim()).toBe(`protoc-gen-es v${BackendToolkitManifest.ENGINES["protoc-gen-es"].version}`)
    const states = yield* BackendToolkit.status().pipe(Effect.provideService(BackendToolkit.Root, f.root))
    expect(states.filter((state) => state.status === "ready").map((state) => state.engine).toSorted()).toEqual(["buf", "protoc-gen-es"])
    yield* Effect.promise(() => rm(path.join(f.project, "gen"), { recursive: true }))
    yield* BackendToolkit.ensure("buf").pipe(Effect.provideService(BackendToolkit.Root, f.root))
    const warm = yield* run(f.root, "buf", ["generate"], f.project)
    expect(warm, warm.stderr).toMatchObject({ exitCode: 0 })
    expect(yield* Effect.promise(() => readFile(path.join(f.project, "gen", "message_pb.ts"), "utf8"))).toBe(generated)
    // Negative control: remove the owned shim; a missing plugin must not be scored as successful generation.
    yield* Effect.promise(() => rm(path.join(f.root, "bin", process.platform === "win32" ? "protoc-gen-es.cmd" : "protoc-gen-es")))
    const missing = yield* run(f.root, "buf", ["generate"], f.project, { PATH: path.join(f.root, "no-host-plugin") })
    expect(missing.exitCode).not.toBe(0)
    expect(missing.stderr).toContain("protoc-gen-es")
  }), 5 * 60_000,
)

it.live("pinned SQLglot installs, parses Spark, rejects invalid SQL and transpiles Spark to DuckDB", () =>
  Effect.gen(function* () {
    const f = yield* fixture
    yield* BackendToolkit.ensure("sqlglot").pipe(Effect.provideService(BackendToolkit.Root, f.root))
    // Shadowing package in the project must not replace the pinned engine.
    yield* Effect.promise(() => writeFile(path.join(f.project, "sqlglot.py"), 'raise RuntimeError("project package must not run")\n'))
    const version = yield* run(f.root, "sqlglot", ["--version"], f.project)
    expect(version, version.stderr).toMatchObject({ exitCode: 0 })
    expect(version.stdout.trim()).toBe(BackendToolkitManifest.ENGINES.sqlglot.version)
    const sql = "SELECT date_trunc('DAY', occurred_at) AS day, channel, sum(amount_cents) AS revenue_cents FROM order_events GROUP BY day, channel ORDER BY day, channel"
    const parsed = yield* run(f.root, "sqlglot", ["--read", "spark", "--parse", "-"], f.project, undefined, sql)
    expect(parsed, parsed.stderr).toMatchObject({ exitCode: 0 })
    expect(parsed.stdout).toContain("Select(")
    const invalid = yield* run(f.root, "sqlglot", ["--read", "spark", "--parse", "-"], f.project, undefined, "SELECT ( FROM")
    expect(invalid.exitCode).toBe(1)
    expect(invalid.stderr).toContain("sqlglot.errors.ParseError")
    const translated = yield* run(f.root, "sqlglot", ["--read", "spark", "--write", "duckdb", "-"], f.project, undefined, sql)
    expect(translated, translated.stderr).toMatchObject({ exitCode: 0 })
    expect(translated.stdout).toContain('DATE_TRUNC(\'DAY\', "occurred_at")')
    expect(translated.stdout).toContain('SUM("amount_cents") AS "revenue_cents"')
    expect(translated.stdout).toContain("GROUP BY")
    expect(yield* run(f.root, "sqlglot", ["--read", "duckdb", "--parse", "-"], f.project, undefined, translated.stdout)).toMatchObject({ exitCode: 0 })
    // Integrity negative control uses the same real pip and wheel, but a wrong hash in a fresh engine directory.
    const pin = BackendToolkitManifest.ENGINES.sqlglot
    yield* Effect.promise(() => rm(path.join(f.root, "engines", "sqlglot"), { recursive: true }))
    const failed = yield* BackendToolkit.ensure("sqlglot").pipe(
      Effect.provideService(BackendToolkit.Root, f.root),
      Effect.provideService(BackendToolkit.Manifest, { ...BackendToolkitManifest.ENGINES, sqlglot: { ...pin, install: { ...pin.install, requirements: pin.install.requirements.replace("816d1a", "000000") } } }),
      Effect.flip,
    )
    expect(failed.reason).toStartWith("toolkit-not-ready:failed:sqlglot:install:pip:exit:1:")
    expect(failed.reason).toContain("THESE PACKAGES DO NOT MATCH THE HASHES")
  }), 5 * 60_000,
)

// Windows is explicitly unsupported by this pack: no MSVC linker is bundled. That lane asserts the named exclusion;
// Linux/macOS must acquire the real crate and plan a real CSV fixture rather than skip because acquisition is costly.
it.live("DataFusion either names its manifest target exclusion or builds and plans a local CSV fixture", () =>
  Effect.gen(function* () {
    const f = yield* fixture
    const host = BackendToolkitTarget.detect()
    expect(host).toHaveProperty("target")
    if (!("target" in host)) throw new Error(`unsupported test host: ${host.unsupported}`)
    const engine: BackendToolkitManifest.HostedEngine = BackendToolkitManifest.ENGINES["datafusion-cli"]
    const unsupported = engine.unsupported?.[host.target]
    if (unsupported) {
      expect(yield* BackendToolkit.ensure("datafusion-cli").pipe(Effect.provideService(BackendToolkit.Root, f.root), Effect.flip, Effect.map((error) => error.reason))).toBe(`unsupported-target:${unsupported}`)
      return
    }
    const scoped = <A, E, R>(self: Effect.Effect<A, E, R>) => self.pipe(Effect.provideService(BackendToolkit.Root, f.root))
    const acquiring = yield* BackendToolkit.ensure("datafusion-cli").pipe(scoped, Effect.forkChild)
    yield* Effect.sleep("100 millis")
    expect(yield* BackendToolkit.status("datafusion-cli").pipe(scoped)).toMatchObject([{ status: "fetching", at: expect.any(Number), budgetMs: 30 * 60_000 }])
    yield* Fiber.join(acquiring)
    yield* Effect.promise(() => writeFile(path.join(f.project, "events.csv"), "amount_cents,channel,occurred_at\n100,web,2026-10-07T00:00:00\n"))
    const version = yield* run(f.root, "datafusion-cli", ["--version"], f.project)
    expect(version, version.stderr).toMatchObject({ exitCode: 0 })
    expect(version.stdout).toContain(BackendToolkitManifest.ENGINES["datafusion-cli"].version)
    const planned = yield* run(f.root, "datafusion-cli", ["-q", "-c", "CREATE EXTERNAL TABLE events (amount_cents BIGINT, channel VARCHAR, occurred_at TIMESTAMP) STORED AS CSV LOCATION 'events.csv' OPTIONS ('format.has_header' 'true');", "-c", "EXPLAIN SELECT date_trunc('day', occurred_at), channel, sum(amount_cents) FROM events GROUP BY 1, 2"], f.project)
    expect(planned, planned.stderr).toMatchObject({ exitCode: 0 })
    expect(planned.stdout).toContain("physical_plan")
    expect(planned.stdout).toContain("Aggregate")
    const invalid = yield* run(f.root, "datafusion-cli", ["-q", "-c", "EXPLAIN SELECT missing_column FROM missing_table"], f.project)
    expect(invalid.exitCode).not.toBe(0)
    expect(invalid.stdout + invalid.stderr).toContain("missing_table")
  }), 35 * 60_000,
)
