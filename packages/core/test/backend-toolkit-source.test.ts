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

// The fake toolchains and their archives are POSIX sh and tar, so these run on macOS and Linux only; the Windows
// launcher format is the same code path as the native engines' `.cmd` shims.
const posix = process.platform === "win32" ? it.live.skip : it.live

const VERSION = "1.0.0-fixture"
const RECORDED = ["GOFLAGS", "GOTOOLCHAIN", "GOPATH", "GOCACHE", "GOPROXY", "GOSUMDB", "CGO_ENABLED", "CARGO_HOME", "CARGO_TARGET_DIR", "RUSTC"]
// Each fake toolchain records how it was called next to itself, then writes a binary that echoes its argv and the launcher's environment.
const TOOLCHAIN = [
  "#!/bin/sh",
  `{ echo "cwd=$PWD"; echo "argv=$*"; for key in ${RECORDED.join(" ")}; do eval "echo $key=\\\${$key-unset}"; done; echo ---; } >> "$(dirname "$0")/../calls.log"`,
  'prev=""; for arg in "$@"; do [ "$prev" = -o ] && out="$arg"; [ "$prev" = --root ] && out="$arg/bin/sqlx" && mkdir -p "$arg/bin"; prev="$arg"; done',
  `printf '#!/bin/sh\\necho "built argv=$* greeting=$FIXTURE_GREETING"\\n' > "$out"`,
  'chmod +x "$out"',
  "",
].join("\n")

const sri = (bytes: string | Uint8Array) => `sha256-${createHash("sha256").update(bytes).digest("base64")}` as const

/** A tar.gz of `files` (relative path to contents), built in `root` and removed again. */
const tarball = async (root: string, files: Record<string, string>) => {
  const work = await mkdtemp(path.join(root, "tar-"))
  await Promise.all(
    Object.entries(files).map(async ([name, text]) => {
      await mkdir(path.dirname(path.join(work, name)), { recursive: true })
      await writeFile(path.join(work, name), text, { mode: 0o755 })
    }),
  )
  Bun.spawnSync(["tar", "-czf", "out.tar.gz", ...new Set(Object.keys(files).map((name) => name.split("/")[0]))], { cwd: work })
  const bytes = new Uint8Array(await readFile(path.join(work, "out.tar.gz")))
  await rm(work, { recursive: true, force: true })
  return bytes
}

const fixture = Effect.gen(function* () {
  const root = yield* Effect.acquireRelease(
    Effect.promise(async () => realpath(await mkdtemp(path.join(tmpdir(), "backend-toolkit-source-")))),
    (directory) => Effect.promise(() => rm(directory, { recursive: true, force: true })),
  )
  const archives = yield* Effect.promise(async () => ({
    // One archive holds both toolchains; the go runtime runs `bin/go`, the rust runtime `bin/cargo` beside `bin/rustc`.
    "/toolchain.tar.gz": await tarball(root, {
      "tc/bin/go": TOOLCHAIN,
      "tc/bin/cargo": TOOLCHAIN,
      "tc/bin/rustc": "#!/bin/sh\nexit 9\n",
    }),
    "/ogen.tar.gz": await tarball(root, { "example.com/ogen@v1.0.0/go.mod": "module example.com/ogen\n" }),
    "/sqlx.tar.gz": await tarball(root, { "sqlx-cli-1.0.0/Cargo.toml": "[package]\n", "sqlx-cli-1.0.0/Cargo.lock": "" }),
  }))
  const hits: Record<string, number> = {}
  const server = yield* Effect.acquireRelease(
    Effect.sync(() =>
      Bun.serve({
        port: 0,
        fetch: (request) => {
          const pathname = new URL(request.url).pathname
          hits[pathname] = (hits[pathname] ?? 0) + 1
          const bytes = archives[pathname as keyof typeof archives]
          if (bytes) return new Response(bytes)
          return new Response("missing", { status: 404 })
        },
      }),
    ),
    (server) => Effect.promise(() => server.stop(true)),
  )
  const base = `http://127.0.0.1:${server.port}`
  const runtime = (id: "go" | "rust", missing = false): BackendToolkitManifest.Runtime => {
    const pin = {
      artifact: {
        url: `${base}/${missing ? "missing/" : ""}toolchain.tar.gz`,
        integrity: sri(archives["/toolchain.tar.gz"]),
        format: "tar.gz" as const,
        entries: [{ from: "tc/bin", to: "bin" }],
      },
      executable: id === "go" ? "bin/go" : "bin/cargo",
    }
    return {
      id,
      version: VERSION,
      license: "MIT",
      upstream: "fixture/toolchain",
      targets: { "darwin-arm64": pin, "darwin-x64": pin, "linux-arm64": pin, "linux-x64": pin, "win32-x64": pin },
    }
  }
  const runtimes = (missing: ReadonlyArray<"go" | "rust"> = []) => ({
    ...BackendToolkitManifest.RUNTIMES,
    go: runtime("go", missing.includes("go")),
    rust: runtime("rust", missing.includes("rust")),
  })
  const source = (name: keyof typeof archives, top: string) => ({
    url: `${base}${name}`,
    integrity: sri(archives[name]),
    format: "tar.gz" as const,
    entries: [{ from: top, to: "src" }],
  })
  const engine = (
    id: BackendToolkitManifest.EngineId,
    runtime: "go" | "rust",
    install: BackendToolkitManifest.HostedEngine["install"],
  ): BackendToolkitManifest.HostedEngine => ({
    id,
    version: VERSION,
    license: "MIT",
    upstream: "fixture/engine",
    runtime,
    install,
    launch: [],
    env: { FIXTURE_GREETING: "hello {install}" },
  })
  const ogen = engine("ogen", "go", {
    kind: "source",
    artifact: source("/ogen.tar.gz", "example.com/ogen@v1.0.0"),
    build: "go",
    path: "./cmd/ogen",
    binary: "ogen",
  })
  const sqlx = engine("sqlx", "rust", {
    kind: "source",
    artifact: source("/sqlx.tar.gz", "sqlx-cli-1.0.0"),
    build: "cargo",
    path: ".",
    binary: "sqlx",
    features: ["postgres", "rustls"],
  })
  const manifest = (engines: ReadonlyArray<BackendToolkitManifest.HostedEngine>) => ({
    ...BackendToolkitManifest.ENGINES,
    ...Object.fromEntries(engines.map((item) => [item.id, item])),
  })
  return { root, hits, ogen, sqlx, manifest, runtimes }
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

/** Every call one fake toolchain received, oldest first, as recorded key/value pairs. */
const calls = (root: string, runtime: "go" | "rust") =>
  Effect.promise(async () =>
    (await readFile(path.join(root, "runtimes", runtime, `${VERSION}-${host()}`, "calls.log"), "utf8"))
      .split("---\n")
      .filter((block) => block.trim())
      .map((block): Record<string, string> =>
        Object.fromEntries(block.trim().split("\n").map((line) => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1)])),
      ),
  )

posix("a go source engine is extracted, built with the pinned go env, and its built binary is the launcher target", () =>
  Effect.gen(function* () {
    const f = yield* fixture
    const scoped = within(f.root, f.manifest([f.ogen]), f.runtimes())
    const target = host()
    const install = path.join(f.root, "engines", "ogen", `${VERSION}-${target}`)
    const home = path.join(f.root, "runtimes", "go", `${VERSION}-${target}`)
    expect(yield* BackendToolkit.ensure("ogen").pipe(scoped)).toEqual({ executable: path.join(install, "ogen") })
    const log = yield* calls(f.root, "go")
    expect(log).toHaveLength(1)
    const staging = path.dirname(log[0].cwd)
    expect(log[0].cwd).toBe(path.join(staging, "src"))
    expect(path.dirname(staging)).toBe(path.join(f.root, "engines", "ogen"))
    expect(path.basename(staging)).toStartWith(".staging-")
    // The other toolchain's variables pass through from the caller's environment; only the build's own are pinned.
    expect(log[0]).toMatchObject({
      cwd: path.join(staging, "src"),
      argv: `build -trimpath -o ${path.join(staging, "ogen")} ./cmd/ogen`,
      GOFLAGS: "-mod=readonly",
      GOTOOLCHAIN: "local",
      GOPATH: path.join(f.root, "cache", "go"),
      GOCACHE: path.join(f.root, "cache", "go-build"),
      GOPROXY: "https://proxy.golang.org",
      GOSUMDB: "sum.golang.org",
      CGO_ENABLED: "0",
    })
    expect(yield* Effect.promise(() => readFile(path.join(install, "src", "go.mod"), "utf8"))).toBe("module example.com/ogen\n")
    expect(yield* exists(path.join(home, ".complete"))).toBe(true)
    // No launcher of its own: the shim execs the built binary with the engine's environment.
    expect(yield* exists(path.join(install, "ogen"))).toBe(true)
    const shim = yield* Effect.promise(() => readFile(path.join(f.root, "bin", "ogen"), "utf8"))
    expect(shim).toContain(`exec '${path.join(install, "ogen")}' "$@"`)
    const run = Bun.spawnSync([path.join(f.root, "bin", "ogen"), "--target", "api"])
    expect(run.exitCode).toBe(0)
    expect(run.stdout.toString().trim()).toBe(`built argv=--target api greeting=hello ${install}`)
    expect(yield* BackendToolkit.status("ogen").pipe(scoped)).toEqual([
      { engine: "ogen", version: VERSION, target, status: "ready", directory: install, executable: path.join(install, "ogen") },
    ])
    expect(f.hits).toEqual({ "/toolchain.tar.gz": 1, "/ogen.tar.gz": 1 })
  }), 30_000,
)

posix("a cargo source engine is installed --locked into the staging root with the pinned cargo env and rustc", () =>
  Effect.gen(function* () {
    const f = yield* fixture
    const scoped = within(f.root, f.manifest([f.sqlx]), f.runtimes())
    const target = host()
    const install = path.join(f.root, "engines", "sqlx", `${VERSION}-${target}`)
    const home = path.join(f.root, "runtimes", "rust", `${VERSION}-${target}`)
    expect(yield* BackendToolkit.ensure("sqlx").pipe(scoped)).toEqual({ executable: path.join(install, "bin", "sqlx") })
    const log = yield* calls(f.root, "rust")
    expect(log).toHaveLength(1)
    const staging = path.dirname(log[0].cwd)
    expect(path.dirname(staging)).toBe(path.join(f.root, "engines", "sqlx"))
    expect(log[0]).toMatchObject({
      cwd: path.join(staging, "src"),
      argv: `install --path ${path.join(staging, "src")} --locked --root ${staging} --no-default-features --features postgres,rustls`,
      CARGO_HOME: path.join(f.root, "cache", "cargo"),
      CARGO_TARGET_DIR: path.join(f.root, "cache", "cargo-target"),
      RUSTC: path.join(home, "bin", "rustc"),
    })
    const run = Bun.spawnSync([path.join(f.root, "bin", "sqlx"), "migrate", "run"])
    expect(run.exitCode).toBe(0)
    expect(run.stdout.toString().trim()).toBe(`built argv=migrate run greeting=hello ${install}`)
    expect(f.hits).toEqual({ "/toolchain.tar.gz": 1, "/sqlx.tar.gz": 1 })
  }), 30_000,
)

posix("a toolchain that cannot be fetched blocks the engine with runtime-<cause> and fetches no source", () =>
  Effect.gen(function* () {
    const f = yield* fixture
    const scoped = within(f.root, f.manifest([f.sqlx]), f.runtimes(["rust"]))
    expect(yield* BackendToolkit.prepare("$BACKEND_TOOLKIT_BIN/sqlx migrate run").pipe(scoped)).toEqual({
      env: { BACKEND_TOOLKIT_BIN: path.join(f.root, "bin") },
      blocked: "toolkit-not-ready:failed:sqlx:runtime-download:404",
    })
    expect(f.hits).toEqual({ "/missing/toolchain.tar.gz": 1 })
  }), 30_000,
)
