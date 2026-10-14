import { expect, test } from "bun:test"
import { createHash } from "node:crypto"
import { link, mkdir, mkdtemp, readFile, readdir, realpath, rm, symlink, writeFile } from "node:fs/promises"
import { createServer } from "node:http"
import type { Socket } from "node:net"
import path from "node:path"
import { Cause, Effect } from "effect"
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
  const state = { transportClosed: false, responseFinished: false, chunks: 0, sockets: new Set<Socket>() }
  const bytes = new TextEncoder().encode("digest control")
  const digest = createHash("sha256").update(bytes).digest("hex")
  const server = yield* Effect.acquireRelease(Effect.promise(async () => {
    const server = createServer((request, response) => {
      state.sockets.add(request.socket)
      request.socket.once("close", () => {
        state.sockets.delete(request.socket)
        // Observe the real connection, not a ReadableStream cancellation callback.
        if (!response.writableFinished) state.transportClosed = true
      })
      response.once("finish", () => { state.responseFinished = true })
      const route = new URL(request.url ?? "/", "http://127.0.0.1").pathname
      if (route === "/ok") return response.end(bytes)
      if (route === "/http-error") { response.statusCode = 503; return response.end("unavailable") }
      if (route === "/empty") return response.end()
      if (route === "/length") {
        response.setHeader("content-length", String(distributionDenoMaxBytes + 1))
        response.flushHeaders()
        response.write(bytes)
        return // Deliberately unfinished: the client must close this transport.
      }
      response.flushHeaders()
      const chunk = Buffer.alloc(8 * 1024 * 1024)
      const pump = () => {
        while (!response.destroyed && state.chunks < 64) {
          state.chunks++
          if (!response.write(chunk)) { response.once("drain", pump); return }
        }
        // Never end the response: draining buffered bytes is not a cancellation oracle.
      }
      pump()
    })
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject)
      server.listen(0, "127.0.0.1", () => { server.off("error", reject); resolve() })
    })
    return server
  }), (server) => Effect.promise(() => new Promise<void>((resolve) => {
    server.close(() => resolve())
    state.sockets.forEach((socket) => socket.destroy())
  })))
  const address = server.address()
  if (!address || typeof address === "string") throw new Error("DENO_HTTP_FIXTURE_ADDRESS_MISSING")
  return { state, bytes, digest, url: `http://127.0.0.1:${address.port}` }
})

it.live("Deno actual streaming download returns bytes only after digest positive control", () => Effect.gen(function* () {
  yield* box()
  const server = yield* http()
  const result = yield* Effect.promise(() => downloadDistributionDeno(`${server.url}/ok`, server.digest))
  expect(result.bytes).toEqual(Buffer.from(server.bytes))
  expect(result.sha256).toBe(server.digest)
  expect(server.state.responseFinished, "DENO_HTTP_POSITIVE_RESPONSE_INCOMPLETE").toBe(true)
  expect(server.state.transportClosed).toBe(false)
}))

it.live("Deno HTTP cancellation oracle rejects a live response and observes actual fetch abort", () => Effect.gen(function* () {
  yield* box()
  const server = yield* http()
  const controller = yield* Effect.acquireRelease(Effect.sync(() => new AbortController()),
    (controller) => Effect.sync(() => controller.abort()))
  const response = yield* Effect.promise(() => fetch(`${server.url}/length`, { signal: controller.signal }))
  expect(response.headers.get("content-length")).toBe(String(distributionDenoMaxBytes + 1))
  const live = yield* Effect.exit(Effect.promise(() => requireTransportClosed(server.state, "length", 50)))
  expect(live._tag === "Failure" && Cause.pretty(live.cause).includes("DENO_OVERFLOW_HTTP_LENGTH_NOT_CANCELLED")).toBe(true)
  controller.abort()
  yield* Effect.promise(async () => { await response.body?.cancel().catch(() => {}) })
  yield* Effect.promise(() => requireTransportClosed(server.state, "length"))
}))

for (const [route, diagnostic] of [["http-error", "DENO_UPSTREAM_DOWNLOAD_FAILED: HTTP 503"], ["empty", "DENO_DOWNLOAD_SIZE_MISMATCH"],
  ["length", "DENO_DOWNLOAD_CONTENT_LENGTH_LIMIT"], ["ok", "DENO_UPSTREAM_DIGEST_MISMATCH"], ["stream", "DENO_DOWNLOAD_STREAM_LIMIT"]]) {
  it.live(`Deno actual HTTP rejects ${route} with ${diagnostic}`, () => Effect.gen(function* () {
    const owned = yield* box()
    const server = yield* http()
    yield* Effect.promise(async () => {
      const error = await downloadDistributionDeno(`${server.url}/${route}`, "0".repeat(64)).then(() => undefined, (error: unknown) => error)
      if (!(error instanceof Error)) throw new Error("DENO_DOWNLOAD_NAMED_ERROR_MISSING")
      if (route === "length" || route === "stream") { expect(error.message).toBe(diagnostic); return }
      expect(error.message).toContain(diagnostic)
    })
    if (route === "length" || route === "stream") {
      yield* Effect.promise(() => requireTransportClosed(server.state, route))
    }
    if (route === "stream") {
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

async function requireTransportClosed(state: { transportClosed: boolean; responseFinished: boolean }, route: string, timeout = 5000) {
  const deadline = Date.now() + timeout
  while (!state.transportClosed && Date.now() < deadline) await Bun.sleep(10)
  if (!state.transportClosed || state.responseFinished) throw new Error(`DENO_OVERFLOW_HTTP_${route.toUpperCase()}_NOT_CANCELLED`)
}
