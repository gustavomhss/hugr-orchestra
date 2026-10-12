#!/usr/bin/env bun

// Proves on a real runner that a packaged CLI searches with the rg it ships and never downloads one:
//   1. --ripgrep holds the pinned rg for --key (RipgrepBundle.verify: pin, bytes unless --signed, executable bit,
//      license texts), and it runs and reports the pinned version;
//   2. the CLI at --binary, with no rg on PATH and an empty cache, starts its service and indexes a project through
//      ripgrep (fff off), finding a planted file, and nothing lands in the download cache;
//   3. with --mutate, the same run with --ripgrep moved away finds nothing, logs the packaged fail-closed message and
//      still downloads nothing; then --ripgrep is restored and step 2 passes again.
// Each run has its own HOME/XDG sandbox, as packages/cli/script/runtime-proof.ts does.

import { createHash } from "node:crypto"
import { mkdir, mkdtemp, readdir, readFile, realpath, rename, rm, writeFile } from "node:fs/promises"
import { existsSync } from "node:fs"
import { tmpdir } from "node:os"
import { delimiter, join, resolve } from "node:path"
import { parseArgs } from "node:util"
import { RipgrepBundle } from "@orchestra/core/ripgrep/bundle"
import { RipgrepRelease } from "@orchestra/core/ripgrep/release"
import { namedTargets } from "./targets"

const args = parseArgs({
  options: {
    binary: { type: "string" },
    ripgrep: { type: "string" },
    // The pin key, or the CLI build target it follows from.
    key: { type: "string" },
    target: { type: "string" },
    signed: { type: "boolean" },
    mutate: { type: "boolean" },
    // Extra NAME=VALUE pairs for the CLI, e.g. HUGR_OMNI_* for a desktop's installed CLI copy.
    env: { type: "string", multiple: true },
  },
  strict: true,
  allowPositionals: false,
}).values

const item = namedTargets.find((item) => item.target === args.target)
const key = args.key ?? (item ? RipgrepBundle.key(item) : undefined)
if (!args.binary || !args.ripgrep || !key)
  throw new Error(
    "Usage: ripgrep-proof.ts --binary <cli> --ripgrep <dir> (--key <arch-platform> | --target <cli target>) [--signed] [--mutate]",
  )
// Absolute: each CLI run has its sandbox as working directory.
const binary = resolve(args.binary)
const ripgrep = resolve(args.ripgrep)
const executable = RipgrepRelease.executable(key.slice(key.indexOf("-") + 1))

const manifest = await RipgrepBundle.verify(ripgrep, key, { signed: args.signed })
const version = await command([join(ripgrep, executable), "--version"], process.env, tmpdir())
if (version.code !== 0 || !version.stdout.startsWith(`ripgrep ${RipgrepRelease.VERSION}`))
  throw new Error(`RIPGREP_VERSION_MISMATCH: ${version.stdout.split("\n")[0]}`)
console.log(
  `RIPGREP_BUNDLE ${JSON.stringify({
    key,
    archive: manifest.archive,
    executable: createHash("sha256")
      .update(await readFile(join(ripgrep, executable)))
      .digest("hex"),
    pinned: manifest.executable.sha256,
    signed: Boolean(args.signed),
    version: version.stdout.split("\n")[0],
  })}`,
)

// What RipgrepBinary logs when a packaged build finds no rg (packages/core/src/ripgrep/binary.ts).
const FAIL_CLOSED = "packaged builds never download it"

const found = await search()
if (!found.matched) throw new Error(`BUNDLED_SEARCH_FAILED: ${found.body}`)
console.log(`RIPGREP_BUNDLED_SEARCH ${JSON.stringify({ binary, matched: true, downloads: found.downloads })}`)

if (args.mutate) {
  await rename(ripgrep, `${ripgrep}.away`)
  const missing = await search(true).finally(() => rename(`${ripgrep}.away`, ripgrep))
  if (missing.matched) throw new Error("MUTANT_SURVIVED: the CLI found files without its bundled rg")
  if (!missing.failClosed)
    throw new Error(
      `MUTANT_NOT_FAIL_CLOSED: no packaged fail-closed message in the CLI logs:\n${missing.lines.join("\n")}`,
    )
  console.log(
    `RIPGREP_MUTANT_KILLED ${JSON.stringify({ matched: false, failClosed: true, downloads: missing.downloads })}`,
  )
  const restored = await search()
  if (!restored.matched) throw new Error("RESTORED_SEARCH_FAILED")
  console.log('RIPGREP_RESTORED_SEARCH {"matched":true}')
}

/**
 * One CLI service run in a fresh sandbox: does the project index (ripgrep) find the planted file? With `failClosed`,
 * the run waits (up to 20 s) for the service's batched file log to show the packaged fail-closed message.
 */
async function search(failClosed = false) {
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
    // The project index then comes from ripgrep rather than fff.
    ORCHESTRA_DISABLE_FFF: "1",
    ...Object.fromEntries(
      (args.env ?? []).map((pair) => [pair.slice(0, pair.indexOf("=")), pair.slice(pair.indexOf("=") + 1)]),
    ),
  }
  const run = async (input: string[]) => {
    const result = await command([binary, ...input], env, sandbox)
    if (result.code !== 0) throw new Error(`CLI_COMMAND_FAILED: ${input.join(" ")}: ${result.stderr.slice(-2000)}`)
    return result.stdout.trim()
  }
  return Promise.resolve()
    .then(async () => {
      const endpoint = new URL(await run(["service", "start"]))
      const password = await run(["service", "password"])
      const url = new URL("/api/fs/find", endpoint)
      url.searchParams.set("query", token)
      url.searchParams.set("type", "file")
      url.searchParams.set("location[directory]", join(sandbox, "project"))
      const response = await fetch(url, {
        headers: { Authorization: `Basic ${Buffer.from(`orchestra:${password}`).toString("base64")}` },
        signal: AbortSignal.timeout(30_000),
      })
      const body = await response.text()
      if (!response.ok) throw new Error(`FIND_REQUEST_FAILED: HTTP ${response.status}: ${body.slice(0, 2000)}`)
      const deadline = Date.now() + 20_000
      while (failClosed && Date.now() < deadline && !(await text(sandbox)).includes(FAIL_CLOSED)) await Bun.sleep(500)
      return body
    })
    .finally(() => run(["service", "stop"]).catch(() => undefined))
    .then(async (body) => {
      const logs = await text(sandbox)
      const cache = join(sandbox, "cache", "orchestra", "bin")
      const downloads = existsSync(cache) ? (await readdir(cache)).filter((name) => /^rg(\.exe)?$/.test(name)) : []
      if (downloads.length > 0) throw new Error(`RIPGREP_DOWNLOADED: ${downloads.join(", ")} in ${cache}`)
      return {
        body,
        matched: body.includes(`${token}.txt`),
        failClosed: logs.includes(FAIL_CLOSED),
        // What the service logged about ripgrep, for a failure message.
        lines: logs
          .split("\n")
          .filter((line) => /ripgrep/i.test(line))
          .slice(-10),
        downloads: downloads.length,
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

// Every log line the sandboxed CLI and its service wrote.
async function text(directory: string): Promise<string> {
  const entries = await readdir(directory, { withFileTypes: true, recursive: true })
  const files = entries.filter((entry) => entry.isFile() && /\.(log|txt|jsonl?)$/.test(entry.name))
  const contents = await Promise.all(
    files.map((entry) => readFile(join(entry.parentPath, entry.name), "utf8").catch(() => "")),
  )
  return contents.join("\n")
}
