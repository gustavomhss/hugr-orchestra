import { expect, test } from "bun:test"
import { createHash } from "node:crypto"
import { link, mkdir, mkdtemp, readFile, readdir, realpath, rm, symlink, writeFile } from "node:fs/promises"
import path from "node:path"
import { Effect } from "effect"
import { it } from "./lib/effect"
import { admitDistributionDeno, distributionDenoMaxBytes, distributionDenoVersion, downloadDistributionDeno,
  installDistributionDeno, requireDistributionDenoVersion } from "../../../script/distribution-deno"

const box = () => Effect.gen(function* () {
  if (process.env.RUNNER_ENVIRONMENT !== "github-hosted" || !process.env.RUNNER_TEMP) throw new Error("DENO_CONTROLS_HOSTED_ONLY")
  const root = yield* Effect.promise(() => realpath(path.resolve(import.meta.dirname, "../../..")))
  const parent = process.env.RUNNER_TEMP
  const temp = yield* Effect.acquireRelease(Effect.promise(() => mkdtemp(path.join(parent, "deno-controls-"))),
    (temp) => Effect.promise(() => rm(temp, { recursive: true, force: true })))
  const envFile = path.join(temp, "github-env")
  yield* Effect.promise(() => writeFile(envFile, "existing environment\n"))
  const row = { package: "cli", platform: process.platform, cpu: process.arch === "x64" ? "X64" : "ARM64",
    host: process.platform === "win32" ? "windows-latest" : "ubuntu-latest" }
  return { root, temp, envFile, env: { ...process.env, GITHUB_WORKSPACE: root, RUNNER_TEMP: temp, GITHUB_ENV: envFile,
    ROW: JSON.stringify(row), RUNNER_OS: process.platform === "win32" ? "Windows" : "Linux", RUNNER_ARCH: row.cpu }, row }
})

it.live("Deno setup admits actual hosted row and regular single-link environment without writes", () => Effect.gen(function* () {
  const owned = yield* box()
  expect(yield* Effect.promise(() => admitDistributionDeno(owned.env))).toMatchObject({ checkout: owned.root, temp: owned.temp, githubEnv: owned.envFile })
  expect(yield* Effect.promise(() => readFile(owned.envFile, "utf8"))).toBe("existing environment\n")
  expect(yield* Effect.promise(() => readdir(owned.temp))).toEqual(["github-env"])
}))

const hosts = [
  ["wrong hosted environment", { RUNNER_ENVIRONMENT: "self-hosted" }, "DENO_OWNED_HOSTED_SETUP_REQUIRED"],
  ["wrong runner OS", { RUNNER_OS: "unsupported" }, "DENO_NATIVE_HOST_MISMATCH"],
  ["wrong runner CPU", { RUNNER_ARCH: "unsupported" }, "DENO_NATIVE_HOST_MISMATCH"],
  ["missing row", { ROW: "null" }, "DENO_NATIVE_HOST_MISMATCH"],
] as const
hosts.forEach(([name, env, diagnostic]) => it.live(`Deno actual admission rejects ${name} before writes`, () => Effect.gen(function* () {
  const owned = yield* box()
  yield* Effect.promise(() => rejectDenoSetup({ ...owned.env, ...env }, diagnostic))
  expect(yield* Effect.promise(() => readFile(owned.envFile, "utf8"))).toBe("existing environment\n")
  expect(yield* Effect.promise(() => readdir(owned.temp))).toEqual(["github-env"])
})))

for (const field of ["platform", "cpu", "host", "package"]) it.live(`Deno actual admission rejects wrong row ${field}`, () => Effect.gen(function* () {
  const owned = yield* box()
  yield* Effect.promise(() => rejectDenoSetup({ ...owned.env, ROW: JSON.stringify({ ...owned.row, [field]: "unsupported" }) }, "DENO_NATIVE_HOST_MISMATCH"))
  expect(yield* Effect.promise(() => readFile(owned.envFile, "utf8"))).toBe("existing environment\n")
}))

for (const defect of ["wrong checkout", "relative temp", "outside environment", "missing environment", "directory environment", "hardlink environment", "symlink environment", "symlink temp"]) {
  it.live(`Deno actual filesystem admission rejects ${defect}`, () => Effect.gen(function* () {
    const owned = yield* box()
    const changed = { ...owned.env }
    const target = path.join(owned.temp, "control")
    yield* Effect.promise(async () => {
      if (defect === "wrong checkout") changed.GITHUB_WORKSPACE = owned.temp
      if (defect === "relative temp") changed.RUNNER_TEMP = path.relative(process.cwd(), owned.temp)
      if (defect === "outside environment") {
        await mkdir(target)
        changed.RUNNER_TEMP = target
      }
      if (defect === "missing environment") changed.GITHUB_ENV = target
      if (defect === "directory environment") { await mkdir(target); changed.GITHUB_ENV = target }
      if (defect === "hardlink environment") await link(owned.envFile, target)
      if (defect === "symlink environment") { await symlink(owned.envFile, target); changed.GITHUB_ENV = target }
      if (defect === "symlink temp") { await symlink(owned.temp, target, process.platform === "win32" ? "junction" : "dir"); changed.RUNNER_TEMP = target }
    })
    const diagnostic = ["wrong checkout", "outside environment"].includes(defect) ? "DENO_OWNED_SETUP_PATH_MISMATCH"
      : defect === "missing environment" ? "DENO_SETUP_PATH_MISSING" : defect === "relative temp" ? "DENO_SETUP_PATH_CANONICAL" : "DENO_SETUP_PATH_TYPE"
    yield* Effect.promise(() => rejectDenoSetup(changed, diagnostic))
    expect(yield* Effect.promise(() => readFile(owned.envFile, "utf8"))).toBe("existing environment\n")
  }))
}

const http = () => Effect.gen(function* () {
  const state = { cancelled: false, chunks: 0 }
  const bytes = new TextEncoder().encode("digest control")
  const digest = createHash("sha256").update(bytes).digest("hex")
  const server = yield* Effect.acquireRelease(Effect.sync(() => Bun.serve({ hostname: "127.0.0.1", port: 0,
    fetch(request) {
      const route = new URL(request.url).pathname
      if (route === "/ok") return new Response(bytes)
      if (route === "/http-error") return new Response("unavailable", { status: 503 })
      if (route === "/empty") return new Response(new Uint8Array())
      if (route === "/length") return new Response(new ReadableStream({
        start(controller) { controller.enqueue(bytes) },
      }), { headers: { "content-length": String(distributionDenoMaxBytes + 1) } })
      // Real socket and fetch reader; chunked transfer cannot hide behind Content-Length.
      request.signal.addEventListener("abort", () => { state.cancelled = true })
      return new Response(new ReadableStream<Uint8Array>({
        pull(controller) {
          state.chunks++
          controller.enqueue(new Uint8Array(8 * 1024 * 1024))
          if (state.chunks === 64) controller.close()
        },
        cancel() { state.cancelled = true },
      }))
    },
  })), (server) => Effect.sync(() => server.stop(true)))
  return { state, bytes, digest, url: `http://127.0.0.1:${server.port}` }
})

it.live("Deno actual streaming download returns bytes only after digest positive control", () => Effect.gen(function* () {
  yield* box()
  const server = yield* http()
  const result = yield* Effect.promise(() => downloadDistributionDeno(`${server.url}/ok`, server.digest))
  expect(result.bytes).toEqual(Buffer.from(server.bytes))
  expect(result.sha256).toBe(server.digest)
}))

for (const [route, diagnostic] of [["http-error", "DENO_UPSTREAM_DOWNLOAD_FAILED: HTTP 503"], ["empty", "DENO_DOWNLOAD_SIZE_MISMATCH"],
  ["length", "DENO_DOWNLOAD_CONTENT_LENGTH_LIMIT"], ["ok", "DENO_UPSTREAM_DIGEST_MISMATCH"], ["stream", "DENO_DOWNLOAD_STREAM_LIMIT"]]) {
  it.live(`Deno actual HTTP rejects ${route} with ${diagnostic}`, () => Effect.gen(function* () {
    const owned = yield* box()
    const server = yield* http()
    yield* Effect.promise(async () => { await expect(downloadDistributionDeno(`${server.url}/${route}`, "0".repeat(64))).rejects.toThrow(diagnostic) })
    if (route === "stream") {
      yield* Effect.promise(async () => {
        const deadline = Date.now() + 5000
        while (!server.state.cancelled && Date.now() < deadline) await Bun.sleep(10)
      })
      expect(server.state.cancelled, "DENO_OVERFLOW_HTTP_STREAM_NOT_CANCELLED").toBe(true)
      expect(server.state.chunks).toBeGreaterThan(16)
    }
    expect(yield* Effect.promise(() => readdir(owned.temp))).toEqual(["github-env"])
  }))
}

test("Deno actual runtime version parser rejects wrong/empty/comment-only version", () => {
  requireDistributionDenoVersion(`deno ${distributionDenoVersion} (stable, release, x86_64-unknown-linux-gnu)\nv8 14\ntypescript 6\n`)
  for (const output of ["", "# deno 2.9.7", "deno 2.9.70", "deno 2.9.6", "deno 2.9.7-canary", "warning\ndeno 2.9.7"]) {
    expect(() => requireDistributionDenoVersion(output), output).toThrow("DENO_RUNTIME_VERSION_MISMATCH")
  }
})

async function rejectDenoSetup(env: typeof process.env, diagnostic: string) {
  await expect(admitDistributionDeno(env)).rejects.toThrow(diagnostic)
  await expect(installDistributionDeno(env)).rejects.toThrow(diagnostic)
}
