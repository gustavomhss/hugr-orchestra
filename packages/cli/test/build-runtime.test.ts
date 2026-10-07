import { afterAll, beforeAll, expect, test } from "bun:test"
import { mkdir, mkdtemp, open, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"

const root = path.resolve(import.meta.dirname, "..")
const version = "1.18.27-closure-test"
const targets = [
  "linux-arm64", "linux-x64", "linux-x64-baseline", "linux-arm64-musl", "linux-x64-musl",
  "linux-x64-baseline-musl", "darwin-arm64", "darwin-x64", "darwin-x64-baseline",
  "windows-arm64", "windows-x64", "windows-x64-baseline",
]
const native = `${process.platform === "win32" ? "windows" : process.platform}-${process.arch}`
const binary = path.join(root, `dist/cli-${native}/bin/orchestra${process.platform === "win32" ? ".exe" : ""}`)
let home: string
let env: Record<string, string | undefined>

beforeAll(async () => {
  if (process.env.GITHUB_ACTIONS !== "false" || !process.env.RUNNER_OS)
    throw new Error("Compiled CLI acceptance requires the Actions test-ci runner; local execution is forbidden")
  home = await mkdtemp(path.join(tmpdir(), "orchestra-cli-acceptance-"))
  await Promise.all(["data", "config", "cache", "state", "tmp"].map((dir) => mkdir(path.join(home, dir))))
  await Bun.write(path.join(home, "models.json"), "{}")
  env = {
    ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^(ORCHESTRA_|XDG_|HOME$|USERPROFILE$|APPDATA$|LOCALAPPDATA$)/.test(key))),
    HOME: home, USERPROFILE: home, APPDATA: home, LOCALAPPDATA: home,
    TMPDIR: path.join(home, "tmp"), TMP: path.join(home, "tmp"), TEMP: path.join(home, "tmp"),
    XDG_DATA_HOME: path.join(home, "data"), XDG_CONFIG_HOME: path.join(home, "config"),
    XDG_CACHE_HOME: path.join(home, "cache"), XDG_STATE_HOME: path.join(home, "state"),
    ORCHESTRA_TEST_HOME: home, ORCHESTRA_VERSION: version, ORCHESTRA_CHANNEL: "dev",
    ORCHESTRA_PURE: "1", ORCHESTRA_DISABLE_MODELS_FETCH: "1",
    MODELS_DEV_API_JSON: path.join(home, "models.json"),
  }
})

afterAll(async () => {
  if (home) await rm(home, { recursive: true, force: true })
})

async function run(argv: string[], timeout = 120_000, overrides = {}) {
  const child = Bun.spawn(argv, { cwd: root, env: { ...env, ...overrides }, stdout: "pipe", stderr: "pipe", timeout })
  const [stdout, stderr, code] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited])
  return { stdout: stdout.trim(), stderr: stderr.trim(), code }
}

async function build(args: string[]) {
  const result = await run([process.execPath, "script/build.ts", "--skip-install", ...args], 600_000)
  if (result.code !== 0) throw new Error(`Builder failed (${result.code}):\n${result.stdout}\n${result.stderr}`)
}

test("rejects bad targets before loading fixtures or touching any artifact", async () => {
  const sentinel = path.join(root, "dist/cli-preserved/sentinel")
  await Bun.write(sentinel, "preserve these bytes")
  for (const args of [["--target", "../foreign"], ["--target"], ["--target", "linux-arm"], ["--target", native, "--target", native]]) {
    const result = await run([process.execPath, "script/build.ts", "--skip-install", "--single", ...args], 30_000, {
      MODELS_DEV_API_JSON: path.join(home, "deliberately-missing.json"),
    })
    expect(result.code).not.toBe(0)
    expect(result.stderr).toContain("Invalid --target")
    expect(await Bun.file(sentinel).text()).toBe("preserve these bytes")
  }
}, 180_000)

test("compiled native CLI exposes owned help/version and isolated service/serve lifecycle", async () => {
  await build(["--single", "--target", native])
  const identity = await run([binary, "--version"])
  expect(identity.code).toBe(0)
  expect(identity.stdout).toBe(version)
  const help = await run([binary, "--help"])
  expect(help.code).toBe(0)
  expect(help.stdout).toContain("orchestra")
  expect(help.stdout).not.toContain("lildax")
  const launched = await run(["node", "bin/orchestra.cjs", "--version"], 30_000, { ORCHESTRA_BIN_PATH: binary })
  expect(launched.code).toBe(0)
  expect(launched.stdout).toBe(version)
  const manifest = await Bun.file(path.join(root, `dist/cli-${native}/package.json`)).json()
  expect(manifest.version).toBe(version)
  expect(manifest.repository.url).toBe("git+https://github.com/gustavomhss/hugr-orchestra.git")
  expect((await run([binary, "service", "status"])).stdout).toBe("stopped")
  try {
    const started = await run([binary, "service", "start"])
    expect(started.code).toBe(0)
    expect(URL.canParse(started.stdout)).toBe(true)
    expect((await run([binary, "service", "status"])).stdout).toBe(`running ${started.stdout}`)
    expect((await run([binary, "service", "start"])).stdout).toBe(started.stdout)
    const registration = await Bun.file(path.join(home, "state/orchestra/server.json")).json()
    expect(registration.version).toBe(version)
    const password = await run([binary, "service", "password"])
    expect(password.code).toBe(0)
    expect(password.stdout.length > 0).toBe(true)
    await authenticatedHealth(started.stdout, password.stdout)
    const stopped = await run([binary, "service", "stop"])
    expect(stopped.code).toBe(0)
    expect((await run([binary, "service", "status"])).stdout).toBe("stopped")

    const child = Bun.spawn([binary, "serve", "--hostname", "127.0.0.1", "--port", "0"], {
      cwd: home, env, stdout: "pipe", stderr: "pipe", timeout: 30_000,
    })
    const errors = new Response(child.stderr).text()
    try {
      const reader = child.stdout.getReader()
      const decoder = new TextDecoder()
      let output = ""
      while (!/server listening on (http:\/\/\S+)/.test(output)) {
        const chunk = await reader.read()
        if (chunk.done) throw new Error(`Foreground serve exited before ready: ${await errors}`)
        output += decoder.decode(chunk.value, { stream: true })
      }
      await reader.cancel()
      const address = /server listening on (http:\/\/\S+)/.exec(output)
      if (!address) throw new Error("Missing foreground address")
      await authenticatedHealth(address[1], password.stdout)
    } finally {
      child.kill()
      await child.exited
      await errors
    }
  } finally {
    const stop = await run([binary, "service", "stop"])
    if (stop.code !== 0) throw new Error(`Isolated daemon cleanup failed: ${stop.stderr}`)
  }
}, 900_000)

async function authenticatedHealth(url: string, password: string) {
  const good = await fetch(new URL("/api/health", url), {
    headers: { authorization: `Basic ${Buffer.from(`orchestra:${password}`).toString("base64")}` },
    signal: AbortSignal.timeout(10_000),
  })
  expect(good.status).toBe(200)
  expect(await good.json()).toEqual({ healthy: true })
  const bad = await fetch(new URL("/api/health", url), {
    headers: { authorization: `Basic ${Buffer.from("orchestra:wrong-credential").toString("base64")}` },
    signal: AbortSignal.timeout(10_000),
  })
  expect(bad.status).toBe(401)
}

test("all explicit targets produce correct executable format/architecture and preserve siblings", async () => {
  const sentinel = path.join(root, "dist/cli-preserved/sentinel")
  await Bun.write(sentinel, "preserve these bytes")
  for (const target of targets) {
    const stale = path.join(root, `dist/cli-${target}/stale-output`)
    await Bun.write(stale, "selected target must replace this")
    await build(["--target", target])
    expect(await Bun.file(stale).exists()).toBe(false)
    expect(await Bun.file(sentinel).text()).toBe("preserve these bytes")
    const file = path.join(root, `dist/cli-${target}/bin/orchestra${target.startsWith("windows-") ? ".exe" : ""}`)
    const handle = await open(file)
    const bytes = Buffer.alloc(4096)
    await handle.read(bytes, 0, bytes.length, 0).finally(() => handle.close())
    const arm = target.includes("arm64")
    if (target.startsWith("linux-")) {
      expect(bytes.subarray(0, 4).toString("hex")).toBe("7f454c46")
      expect(bytes[4]).toBe(2)
      expect(bytes.readUInt16LE(18)).toBe(arm ? 183 : 62)
    }
    if (target.startsWith("darwin-")) {
      expect(bytes.readUInt32LE(0)).toBe(0xfeedfacf)
      expect(bytes.readUInt32LE(4)).toBe(arm ? 0x100000c : 0x1000007)
    }
    if (target.startsWith("windows-")) {
      expect(bytes.subarray(0, 2).toString()).toBe("MZ")
      const pe = bytes.readUInt32LE(0x3c)
      expect(bytes.readUInt32LE(pe)).toBe(0x4550)
      expect(bytes.readUInt16LE(pe + 4)).toBe(arm ? 0xaa64 : 0x8664)
    }
    const manifest = await Bun.file(path.join(root, `dist/cli-${target}/package.json`)).json()
    expect(manifest.name).toBe(`@orchestra/cli-${target}`)
    expect(manifest.version).toBe(version)
    expect(manifest.os).toEqual([target.startsWith("windows-") ? "win32" : target.split("-")[0]])
    expect(manifest.cpu).toEqual([arm ? "arm64" : "x64"])
  }
}, 1_800_000)
