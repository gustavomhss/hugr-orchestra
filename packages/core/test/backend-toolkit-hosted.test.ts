import { expect } from "bun:test"
import path from "path"
import { createHash } from "crypto"
import { access, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "fs/promises"
import { tmpdir } from "os"
import { Effect } from "effect"
import { BackendToolkit } from "../src/backend-toolkit"
import { BackendToolkitManifest } from "../src/backend-toolkit/manifest"
import { BackendToolkitTarget } from "../src/backend-toolkit/target"
import { it } from "./lib/effect"

// The fake runtime's interpreter and its archive are POSIX sh and tar, so these run on macOS and Linux only; the
// Windows launcher format is the same code path as the native engines' `.cmd` shims.
const posix = process.platform === "win32" ? it.live.skip : it.live

const VERSION = "1.0.0-fixture"
const JAR = "fake jar bytes"
// Records how it was called next to itself (the installer's argv is not otherwise observable), then echoes what a
// launcher passed it. A package.json naming `fixture-fail` makes the npm install fail.
const INTERPRETER = [
  "#!/bin/sh",
  `printf '%s|%s|%s|%s\\n' "$PWD" "$npm_config_cache" "$PIP_CACHE_DIR" "$*" >> "$(dirname "$0")/../calls.log"`,
  `if grep -qs fixture-fail package.json; then echo 'fixture installer failure' >&2; exit 3; fi`,
  `if grep -qs fixture-secret package.json; then printf '%s' '${"ghp_" + "x".repeat(36)}' >&2; printf '%05000d' 0 >&2; exit 4; fi`,
  `echo "greeting=$FIXTURE_GREETING pythonpath=$PYTHONPATH argv=$*"`,
  "",
].join("\n")

const sri = (bytes: string | Uint8Array) => `sha256-${createHash("sha256").update(bytes).digest("base64")}` as const

const fixture = Effect.gen(function* () {
  const root = yield* Effect.acquireRelease(
    Effect.promise(async () => realpath(await mkdtemp(path.join(tmpdir(), "backend-toolkit-hosted-")))),
    (directory) => Effect.promise(() => rm(directory, { recursive: true, force: true })),
  )
  const archive = yield* Effect.promise(async () => {
    const work = path.join(root, "archive")
    await mkdir(path.join(work, "rt", "bin"), { recursive: true })
    await mkdir(path.join(work, "rt", "lib", "node_modules", "npm", "bin"), { recursive: true })
    await writeFile(path.join(work, "rt", "bin", "node"), INTERPRETER, { mode: 0o755 })
    await writeFile(path.join(work, "rt", "lib", "node_modules", "npm", "bin", "npm-cli.js"), "")
    Bun.spawnSync(["tar", "-czf", "runtime.tar.gz", "rt"], { cwd: work })
    const bytes = new Uint8Array(await readFile(path.join(work, "runtime.tar.gz")))
    await rm(work, { recursive: true, force: true })
    return bytes
  })
  const hits: Record<string, number> = {}
  const server = yield* Effect.acquireRelease(
    Effect.sync(() =>
      Bun.serve({
        port: 0,
        fetch: async (request) => {
          const pathname = new URL(request.url).pathname
          hits[pathname] = (hits[pathname] ?? 0) + 1
          // Slow enough that concurrent needs overlap one download.
          await Bun.sleep(150)
          if (/^\/(node|java|python)\.tar\.gz$/.test(pathname)) return new Response(archive)
          if (pathname === "/fake.jar") return new Response(JAR)
          return new Response("missing", { status: 404 })
        },
      }),
    ),
    (server) => Effect.promise(() => server.stop(true)),
  )
  const base = `http://127.0.0.1:${server.port}`
  const runtime = (id: BackendToolkitManifest.RuntimeId, missing = false): BackendToolkitManifest.Runtime => {
    const pin = {
      artifact: {
        url: `${base}/${missing ? "missing/" : ""}${id}.tar.gz`,
        integrity: sri(archive),
        format: "tar.gz" as const,
        entries: [
          { from: "rt/bin/node", to: "bin/node", executable: true },
          { from: "rt/lib", to: "lib" },
        ],
      },
      executable: "bin/node",
    }
    return {
      id,
      version: VERSION,
      license: "MIT",
      upstream: "fixture/runtime",
      targets: { "darwin-arm64": pin, "darwin-x64": pin, "linux-arm64": pin, "linux-x64": pin, "win32-x64": pin },
    }
  }
  const runtimes = (missing: ReadonlyArray<BackendToolkitManifest.RuntimeId> = []) => ({
    node: runtime("node", missing.includes("node")),
    java: runtime("java", missing.includes("java")),
    python: runtime("python", missing.includes("python")),
    go: runtime("go", missing.includes("go")),
    rust: runtime("rust", missing.includes("rust")),
  })
  const jar = { kind: "jar" as const, artifact: { url: `${base}/fake.jar`, integrity: sri(JAR), format: "raw" as const, entries: [{ from: "fake.jar", to: "fake.jar" }] } }
  const engine = (
    id: BackendToolkitManifest.EngineId,
    runtime: BackendToolkitManifest.RuntimeId,
    install: BackendToolkitManifest.HostedEngine["install"],
    launch: ReadonlyArray<string>,
  ): BackendToolkitManifest.HostedEngine => ({
    id,
    version: VERSION,
    license: "MIT",
    upstream: "fixture/engine",
    runtime,
    install,
    launch,
    env: { FIXTURE_GREETING: "hello {runtime}" },
  })
  const manifest = (engines: ReadonlyArray<BackendToolkitManifest.HostedEngine>) => ({
    ...BackendToolkitManifest.ENGINES,
    ...Object.fromEntries(engines.map((item) => [item.id, item])),
  })
  return { root, hits, jar, engine, manifest, runtimes }
})

const within =
  (
    root: string,
    manifest: Record<BackendToolkitManifest.EngineId, BackendToolkitManifest.Engine>,
    runtimes: Record<BackendToolkitManifest.RuntimeId, BackendToolkitManifest.Runtime>,
  ) =>
  <A, E, R>(self: Effect.Effect<A, E, R>) =>
    self.pipe(
      Effect.provideService(BackendToolkit.Root, root),
      Effect.provideService(BackendToolkit.Manifest, manifest),
      Effect.provideService(BackendToolkit.Runtimes, runtimes),
      Effect.provideService(BackendToolkit.Target, BackendToolkitTarget.detect()),
    )

const host = () => {
  const detected = BackendToolkitTarget.detect()
  if (!("target" in detected)) throw new Error(`BLOCKED: test host has no toolkit target: ${detected.unsupported}`)
  return detected.target
}

const exists = (file: string) =>
  Effect.promise(() =>
    access(file).then(
      () => true,
      () => false,
    ),
  )

/** Every call the fake interpreter of one runtime received, oldest first. */
const calls = (root: string, runtime: BackendToolkitManifest.RuntimeId) =>
  Effect.promise(async () =>
    (await readFile(path.join(root, "runtimes", runtime, `${VERSION}-${host()}`, "calls.log"), "utf8"))
      .trim()
      .split("\n")
      .map((line) => {
        const [cwd, npmCache, pipCache, argv] = line.split("|")
        return { cwd, npmCache, pipCache, argv }
      }),
  )

posix("two hosted engines share one runtime install and the launcher runs the runtime with expanded arguments", () =>
  Effect.gen(function* () {
    const f = yield* fixture
    const scoped = within(
      f.root,
      f.manifest([
        f.engine("openapi-generator", "java", f.jar, ["-jar", "{install}/fake.jar"]),
        f.engine("orval", "java", f.jar, ["-jar", "{install}/fake.jar"]),
      ]),
      f.runtimes(),
    )
    const target = host()
    const install = path.join(f.root, "engines", "openapi-generator", `${VERSION}-${target}`)
    const home = path.join(f.root, "runtimes", "java", `${VERSION}-${target}`)
    const [generator] = yield* Effect.all([BackendToolkit.ensure("openapi-generator"), BackendToolkit.ensure("orval")], {
      concurrency: "unbounded",
    }).pipe(scoped)
    expect(generator).toEqual({ executable: path.join(install, "openapi-generator") })
    expect(f.hits).toEqual({ "/java.tar.gz": 1, "/fake.jar": 2 })
    expect(yield* exists(path.join(home, ".complete"))).toBe(true)
    expect(yield* Effect.promise(() => readFile(path.join(install, "fake.jar"), "utf8"))).toBe(JAR)
    expect(yield* BackendToolkit.status("openapi-generator").pipe(scoped)).toEqual([
      { engine: "openapi-generator", version: VERSION, target, status: "ready", directory: install, executable: path.join(install, "openapi-generator") },
    ])
    const run = Bun.spawnSync([path.join(f.root, "bin", "openapi-generator"), "generate", "-i", "api.yaml"])
    expect(run.exitCode).toBe(0)
    expect(run.stdout.toString().trim()).toBe(`greeting=hello ${home} pythonpath= argv=-jar ${install}/fake.jar generate -i api.yaml`)
    // The install's own launcher is the engine's executable and behaves like the shim.
    expect(Bun.spawnSync([generator.executable, "version"]).stdout.toString().trim()).toBe(
      `greeting=hello ${home} pythonpath= argv=-jar ${install}/fake.jar version`,
    )
  }), 30_000,
)

posix("a runtime that cannot be fetched blocks every engine on it with runtime-<cause> and fetches no engine bytes", () =>
  Effect.gen(function* () {
    const f = yield* fixture
    const scoped = within(
      f.root,
      f.manifest([
        f.engine("openapi-generator", "java", f.jar, ["-jar", "{install}/fake.jar"]),
        f.engine("orval", "java", f.jar, ["-jar", "{install}/fake.jar"]),
      ]),
      f.runtimes(["java"]),
    )
    const reason = (id: BackendToolkitManifest.EngineId) =>
      BackendToolkit.ensure(id).pipe(scoped, Effect.flip, Effect.map((error) => error.reason))
    expect(yield* reason("openapi-generator")).toBe("toolkit-not-ready:failed:openapi-generator:runtime-download:404")
    expect(yield* reason("orval")).toBe("toolkit-not-ready:failed:orval:runtime-download:404")
    const [state] = yield* BackendToolkit.status("openapi-generator").pipe(scoped)
    expect(state).toMatchObject({ engine: "openapi-generator", status: "failed", cause: "runtime-download:404" })
    expect(yield* BackendToolkit.prepare("$BACKEND_TOOLKIT_BIN/orval --version").pipe(scoped)).toEqual({
      env: { BACKEND_TOOLKIT_BIN: path.join(f.root, "bin") },
      blocked: "toolkit-not-ready:failed:orval:runtime-download:404",
    })
    // The runtime failure is remembered for both engines inside the retry window.
    expect(f.hits).toEqual({ "/missing/java.tar.gz": 1 })
  }), 30_000,
)

posix("prepare makes a hosted engine and its runtime ready before the command runs", () =>
  Effect.gen(function* () {
    const f = yield* fixture
    const scoped = within(f.root, f.manifest([f.engine("openapi-generator", "java", f.jar, ["-jar", "{install}/fake.jar"])]), f.runtimes())
    const target = host()
    expect(yield* BackendToolkit.prepare("$BACKEND_TOOLKIT_BIN/openapi-generator generate -i api.yaml").pipe(scoped)).toEqual({
      env: { BACKEND_TOOLKIT_BIN: path.join(f.root, "bin") },
    })
    expect(yield* exists(path.join(f.root, "runtimes", "java", `${VERSION}-${target}`, ".complete"))).toBe(true)
    expect(yield* exists(path.join(f.root, "engines", "openapi-generator", `${VERSION}-${target}`, ".complete"))).toBe(true)
    expect(yield* exists(path.join(f.root, "bin", "openapi-generator"))).toBe(true)
    expect(f.hits).toEqual({ "/java.tar.gz": 1, "/fake.jar": 1 })
  }), 30_000,
)

posix("an npm engine installs its pinned lockfile with the runtime's bundled npm and a failed install blocks it", () =>
  Effect.gen(function* () {
    const f = yield* fixture
    const packageJson = '{ "name": "toolkit-orval", "private": true }'
    const lock = '{ "lockfileVersion": 3 }'
    const scoped = within(
      f.root,
      f.manifest([
        f.engine("orval", "node", { kind: "npm", packageJson, lock }, ["{install}/node_modules/orval/dist/bin/orval.js"]),
        f.engine("protoc-gen-es", "node", { kind: "npm", packageJson: '{ "name": "fixture-fail" }', lock }, ["{install}/x.js"]),
      ]),
      f.runtimes(),
    )
    const target = host()
    const home = path.join(f.root, "runtimes", "node", `${VERSION}-${target}`)
    const install = path.join(f.root, "engines", "orval", `${VERSION}-${target}`)
    yield* BackendToolkit.ensure("orval").pipe(scoped)
    const [call] = yield* calls(f.root, "node")
    expect(call.argv).toBe(`${home}/lib/node_modules/npm/bin/npm-cli.js ci --ignore-scripts --no-audit --no-fund --offline=false`)
    expect(call.cwd).toStartWith(path.join(f.root, "engines", "orval", ".staging-"))
    expect(call.npmCache).toBe(path.join(f.root, "cache", "npm"))
    expect(yield* Effect.promise(() => readFile(path.join(install, "package.json"), "utf8"))).toBe(packageJson)
    expect(yield* Effect.promise(() => readFile(path.join(install, "package-lock.json"), "utf8"))).toBe(lock)
    const run = Bun.spawnSync([path.join(f.root, "bin", "orval"), "--config", "orval.config.ts"])
    expect(run.stdout.toString().trim()).toBe(
      `greeting=hello ${home} pythonpath= argv=${install}/node_modules/orval/dist/bin/orval.js --config orval.config.ts`,
    )
    const reason = yield* BackendToolkit.ensure("protoc-gen-es").pipe(scoped, Effect.flip, Effect.map((error) => error.reason))
    expect(reason).toBe("toolkit-not-ready:failed:protoc-gen-es:install:npm:exit:3:fixture installer failure")
    expect(yield* exists(path.join(f.root, "engines", "protoc-gen-es", `${VERSION}-${target}`))).toBe(false)
    expect(f.hits).toEqual({ "/node.tar.gz": 1 })
  }), 30_000,
)

posix("installer diagnostics inspect all output before retaining a bounded tail", () =>
  Effect.gen(function* () {
    const f = yield* fixture
    const scoped = within(f.root, f.manifest([f.engine("orval", "node", { kind: "npm", packageJson: '{ "name": "fixture-secret" }', lock: "{}" }, ["{install}/x.js"])]), f.runtimes())
    const reason = yield* BackendToolkit.ensure("orval").pipe(scoped, Effect.flip, Effect.map((error) => error.reason))
    expect(reason).toBe("toolkit-not-ready:failed:orval:install:npm:details-redacted")
    expect(reason).not.toContain("ghp_")
  }), 30_000,
)

posix("a pip engine installs its hash-pinned requirements into its own directory and runs with PYTHONPATH there", () =>
  Effect.gen(function* () {
    const f = yield* fixture
    const requirements = "datamodel-code-generator==1.0.0 --hash=sha256:00\n"
    const scoped = within(
      f.root,
      f.manifest([f.engine("datamodel-codegen", "python", { kind: "pip", requirements }, ["-m", "datamodel_code_generator"])]),
      f.runtimes(),
    )
    const target = host()
    const home = path.join(f.root, "runtimes", "python", `${VERSION}-${target}`)
    const install = path.join(f.root, "engines", "datamodel-codegen", `${VERSION}-${target}`)
    yield* BackendToolkit.ensure("datamodel-codegen").pipe(scoped)
    const [call] = yield* calls(f.root, "python")
    expect(call.cwd).toStartWith(path.join(f.root, "engines", "datamodel-codegen", ".staging-"))
    expect(call.argv).toBe(
      `-m pip install --require-hashes --no-deps --only-binary=:all: --target ${call.cwd} -r ${call.cwd}/requirements.txt`,
    )
    expect(call.pipCache).toBe(path.join(f.root, "cache", "pip"))
    expect(yield* Effect.promise(() => readFile(path.join(install, "requirements.txt"), "utf8"))).toBe(requirements)
    const run = Bun.spawnSync([path.join(f.root, "bin", "datamodel-codegen"), "--version"])
    expect(run.stdout.toString().trim()).toBe(`greeting=hello ${home} pythonpath=${install} argv=-m datamodel_code_generator --version`)
    yield* Effect.promise(() => rm(path.join(install, ".launchers"), { recursive: true }))
    const cached = yield* BackendToolkit.ensure("datamodel-codegen").pipe(scoped)
    expect(cached.executable).toBe(path.join(install, ".launchers", "datamodel-codegen"))
    expect(yield* exists(cached.executable)).toBe(true)
    expect((yield* calls(f.root, "python")).filter((call) => call.argv?.startsWith("-m pip install "))).toHaveLength(1)
  }), 30_000,
)

posix("prefetch for another target installs a jar engine without a shim and refuses an npm install it cannot run", () =>
  Effect.gen(function* () {
    const f = yield* fixture
    const other = BackendToolkitTarget.TARGETS.find((target) => target !== host())!
    const states = yield* BackendToolkit.prefetch(["openapi-generator", "orval"], other).pipe(
      within(
        f.root,
        f.manifest([
          f.engine("openapi-generator", "java", f.jar, ["-jar", "{install}/fake.jar"]),
          f.engine("orval", "node", { kind: "npm", packageJson: "{}", lock: "{}" }, ["{install}/orval.js"]),
        ]),
        f.runtimes(),
      ),
    )
    expect(states).toMatchObject([
      { engine: "openapi-generator", target: other, status: "ready" },
      { engine: "orval", target: other, status: "failed", cause: "cross-target:npm" },
    ])
    expect(yield* exists(path.join(f.root, "bin", "openapi-generator"))).toBe(false)
    expect(f.hits).toEqual({ "/java.tar.gz": 1, "/fake.jar": 1 })
  }), 30_000,
)
