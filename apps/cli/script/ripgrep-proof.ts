#!/usr/bin/env bun

// Proves on a real runner that a packaged CLI searches with the rg it ships and never downloads one:
//   1. --ripgrep holds the pinned rg for --target (RipgrepBundle.verify against release.ts: the pinned executable, or
//      once signed a valid signature (codesign / Authenticode), executable bit, license texts), and it runs and
//      reports the pinned version;
//   2. the CLI at --binary serves its API with no rg on PATH, an empty cache and every HTTP(S) request routed to a
//      local proxy that counts connections; its project index (ripgrep, fff off) finds a planted file, and the proxy
//      sees no connection and nothing lands in the download cache;
//   3. with --mutate, the same run with --ripgrep moved away finds nothing, the server logs the packaged fail-closed
//      reason, and still the proxy sees nothing and nothing is downloaded; then --ripgrep is restored and step 2
//      passes again.
// The proxy's own positive control: a request this script sends through it must be counted.
// Each run has its own HOME/XDG sandbox, as apps/cli/script/runtime-proof.ts does.

import { createHash } from "node:crypto"
import { mkdir, mkdtemp, readdir, readFile, realpath, rename, rm, writeFile } from "node:fs/promises"
import { existsSync } from "node:fs"
import { tmpdir } from "node:os"
import { delimiter, join, resolve } from "node:path"
import { parseArgs } from "node:util"
import { RipgrepBundle } from "@orchestra/core/ripgrep/bundle"
import { RipgrepRelease } from "@orchestra/core/ripgrep/release"
import { signatureCheck } from "../../desktop/src/main/cli-artifacts"
import { namedTargets } from "./targets"

const args = parseArgs({
  options: {
    binary: { type: "string" },
    ripgrep: { type: "string" },
    target: { type: "string" },
    mutate: { type: "boolean" },
    // Extra NAME=VALUE pairs for the CLI, e.g. HUGR_OMNI_* for a desktop's installed CLI copy.
    env: { type: "string", multiple: true },
  },
  strict: true,
  allowPositionals: false,
}).values

const item = namedTargets.find((item) => item.target === args.target)
const key = item ? RipgrepBundle.key(item) : undefined
if (!args.binary || !args.ripgrep || !item || !key)
  throw new Error("Usage: ripgrep-proof.ts --binary <cli> --ripgrep <dir> --target <cli target> [--mutate]")
const target = item.target
// Absolute: each CLI run has its sandbox as working directory.
const binary = resolve(args.binary)
const ripgrep = resolve(args.ripgrep)
const executable = RipgrepRelease.executable(key.slice(key.indexOf("-") + 1))
// What RipgrepBinary says when a packaged build finds no rg (packages/core/src/ripgrep/binary.ts).
const FAIL_CLOSED = "packaged builds never download it"

const verified = await RipgrepBundle.verify(ripgrep, key, {
  signature: async (file) => {
    const check = signatureCheck(target, file)
    if (!check) return false
    const result = await command([check.command, ...check.args], process.env, tmpdir())
    return result.code === 0 && check.valid(result.stdout)
  },
})
const version = await command([join(ripgrep, executable), "--version"], process.env, tmpdir())
if (version.code !== 0 || !version.stdout.startsWith(`ripgrep ${RipgrepRelease.VERSION}`))
  throw new Error(`RIPGREP_VERSION_MISMATCH: ${version.stdout.split("\n")[0]}`)
console.log(
  `RIPGREP_BUNDLE ${JSON.stringify({
    key,
    archive: verified.manifest.archive,
    executable: createHash("sha256")
      .update(await readFile(join(ripgrep, executable)))
      .digest("hex"),
    pinned: verified.manifest.executable.sha256,
    signed: verified.signed,
    version: version.stdout.split("\n")[0],
  })}`,
)

// Every outbound HTTP(S) request of the CLI goes through this proxy, which counts connections and answers none.
const proxy = { connections: 0 }
const listener = Bun.listen({
  hostname: "127.0.0.1",
  port: 0,
  socket: {
    open: (socket) => {
      proxy.connections++
      socket.end()
    },
    data: () => {},
  },
})
const proxyUrl = `http://127.0.0.1:${listener.port}`
await fetch("https://github.com/BurntSushi/ripgrep", { proxy: proxyUrl, signal: AbortSignal.timeout(10_000) }).catch(
  () => undefined,
)
if (proxy.connections < 1) throw new Error("PROXY_CONTROL_FAILED: the proxy counted no connection")
proxy.connections = 0

const found = await search(false)
if (!found.matched) throw new Error(`BUNDLED_SEARCH_FAILED: HTTP ${found.status} ${found.body.slice(0, 1000)}`)
console.log(`RIPGREP_BUNDLED_SEARCH ${JSON.stringify({ binary, matched: true, proxied: found.proxied })}`)

if (args.mutate) {
  await rename(ripgrep, `${ripgrep}.away`)
  const missing = await search(true).finally(() => rename(`${ripgrep}.away`, ripgrep))
  if (missing.matched) throw new Error("MUTANT_SURVIVED: the CLI found files without its bundled rg")
  if (!missing.failClosed)
    throw new Error(
      `MUTANT_NOT_FAIL_CLOSED: HTTP ${missing.status} ${missing.body.slice(0, 500)}\nserver output:\n${missing.output.slice(-4000)}`,
    )
  console.log(
    `RIPGREP_MUTANT_KILLED ${JSON.stringify({ matched: false, status: missing.status, failClosed: true, proxied: missing.proxied })}`,
  )
  const restored = await search(false)
  if (!restored.matched) throw new Error("RESTORED_SEARCH_FAILED")
  console.log('RIPGREP_RESTORED_SEARCH {"matched":true}')
}
listener.stop(true)

/**
 * One foreground `serve` in a fresh sandbox: does the project index (ripgrep) find the planted file? With
 * `failClosed`, waits up to 20 s for the server's output to show the packaged fail-closed reason. Fails when the CLI
 * reached the network or left an rg in the download cache.
 */
async function search(failClosed: boolean) {
  const sandbox = await realpath(await mkdtemp(join(tmpdir(), "orchestra-ripgrep-proof-")))
  await Promise.all(["data", "state", "config", "cache", "tmp", "project"].map((name) => mkdir(join(sandbox, name))))
  const token = `needle${createHash("sha256").update(sandbox).digest("hex").slice(0, 12)}`
  await writeFile(join(sandbox, "project", `${token}.txt`), "planted\n")
  const path = Object.entries(process.env).find(([name]) => name.toLowerCase() === "path")?.[1] ?? ""
  const env: Record<string, string | undefined> = {
    ...Object.fromEntries(
      Object.entries(process.env).filter(([name]) =>
        ["systemroot", "windir", "comspec", "pathext", "lang", "lc_all"].includes(name.toLowerCase()),
      ),
    ),
    // No rg on PATH, so only the bundled one can answer.
    PATH: path
      .split(delimiter)
      .filter((entry) => entry && !["rg", "rg.exe"].some((name) => existsSync(join(entry, name))))
      .join(delimiter),
    HOME: sandbox,
    USERPROFILE: sandbox,
    ORCHESTRA_TEST_HOME: sandbox,
    APPDATA: join(sandbox, "config"),
    LOCALAPPDATA: join(sandbox, "data"),
    XDG_DATA_HOME: join(sandbox, "data"),
    XDG_STATE_HOME: join(sandbox, "state"),
    XDG_CONFIG_HOME: join(sandbox, "config"),
    XDG_CACHE_HOME: join(sandbox, "cache"),
    TMPDIR: join(sandbox, "tmp"),
    TMP: join(sandbox, "tmp"),
    TEMP: join(sandbox, "tmp"),
    ORCHESTRA_DB: join(sandbox, "proof.sqlite"),
    ORCHESTRA_INHERIT_CREDENTIALS: "0",
    ORCHESTRA_EXPERIMENTAL_DISABLE_FILEWATCHER: "true",
    ORCHESTRA_DISABLE_MODELS_FETCH: "1",
    ORCHESTRA_PRINT_LOGS: "1",
    // The project index then comes from ripgrep rather than fff.
    ORCHESTRA_DISABLE_FFF: "1",
    HTTP_PROXY: proxyUrl,
    HTTPS_PROXY: proxyUrl,
    http_proxy: proxyUrl,
    https_proxy: proxyUrl,
    NO_PROXY: "127.0.0.1,localhost",
    no_proxy: "127.0.0.1,localhost",
    ...Object.fromEntries(
      (args.env ?? []).map((pair) => [pair.slice(0, pair.indexOf("=")), pair.slice(pair.indexOf("=") + 1)]),
    ),
  }
  const password = await command([binary, "service", "password"], env, sandbox)
  if (password.code !== 0) throw new Error(`CLI_COMMAND_FAILED: service password: ${password.stderr.slice(-2000)}`)
  const server = Bun.spawn([binary, "serve"], { env, cwd: sandbox, stdout: "pipe", stderr: "pipe" })
  const output = { text: "" }
  const decoder = new TextDecoder()
  const drain = (stream: ReadableStream<Uint8Array>) =>
    stream.pipeTo(new WritableStream({ write: (chunk) => void (output.text += decoder.decode(chunk)) }))
  const drained = Promise.all([drain(server.stdout), drain(server.stderr)]).catch(() => undefined)
  const until = async (done: () => boolean, ms: number) => {
    const deadline = Date.now() + ms
    while (!done() && Date.now() < deadline && server.exitCode === null) await Bun.sleep(200)
    return done()
  }
  return Promise.resolve()
    .then(async () => {
      if (!(await until(() => /server listening on (\S+)/.test(output.text), 60_000)))
        throw new Error(`SERVER_NOT_LISTENING: ${output.text.slice(-4000)}`)
      const url = new URL("/api/fs/find", /server listening on (\S+)/.exec(output.text)![1])
      url.searchParams.set("query", token)
      url.searchParams.set("type", "file")
      url.searchParams.set("location[directory]", join(sandbox, "project"))
      const response = await fetch(url, {
        headers: { Authorization: `Basic ${Buffer.from(`orchestra:${password.stdout.trim()}`).toString("base64")}` },
        signal: AbortSignal.timeout(60_000),
      })
      const body = await response.text()
      // Without rg the search fails with ripgrep's reason in the server log (FileSystemSearch.SearchError).
      if (!response.ok && !failClosed)
        throw new Error(`FIND_REQUEST_FAILED: HTTP ${response.status}: ${body.slice(0, 2000)}`)
      if (failClosed) await until(() => output.text.includes(FAIL_CLOSED), 20_000)
      return { status: response.status, ok: response.ok, body }
    })
    .finally(async () => {
      server.kill()
      await Promise.race([server.exited, Bun.sleep(10_000)])
      if (server.exitCode === null) server.kill("SIGKILL")
      await drained
    })
    .then(async (response) => {
      const cache = join(sandbox, "cache", "orchestra", "bin")
      const downloads = existsSync(cache) ? (await readdir(cache)).filter((name) => /^rg(\.exe)?$/.test(name)) : []
      if (downloads.length > 0) throw new Error(`RIPGREP_DOWNLOADED: ${downloads.join(", ")} in ${cache}`)
      if (proxy.connections > 0) throw new Error(`NETWORK_REACHED: the CLI made ${proxy.connections} proxied requests`)
      return {
        ...response,
        matched: response.ok && response.body.includes(`${token}.txt`),
        failClosed: output.text.includes(FAIL_CLOSED),
        output: output.text,
        proxied: proxy.connections,
      }
    })
    .finally(() => rm(sandbox, { recursive: true, force: true }).catch(() => undefined))
}

async function command(input: string[], env: Record<string, string | undefined>, cwd: string) {
  const child = Bun.spawn(input, { env, cwd, stdout: "pipe", stderr: "pipe" })
  const timeout = setTimeout(() => child.kill("SIGKILL"), 60_000)
  const [code, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]).finally(() => clearTimeout(timeout))
  return { code, stdout, stderr }
}
