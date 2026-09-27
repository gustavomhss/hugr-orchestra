import { $ } from "bun"
import { describe, expect, test } from "bun:test"
import fs from "fs/promises"
import os from "os"
import path from "path"
import { tmpdir, tmpdirScoped } from "./fixture"

async function withGitProxy(fn: (calls: string) => Promise<void>) {
  const real = Bun.which("git")
  if (!real) throw new Error("git not found")

  const root = await fs.mkdtemp(path.join(os.tmpdir(), "opencode-git-proxy-"))
  const bin = path.join(root, "bin")
  const calls = path.join(root, "calls.jsonl")
  const proxy = path.join(root, "proxy.mjs")
  await fs.mkdir(bin)
  await fs.writeFile(
    proxy,
    [
      'import { appendFileSync } from "fs"',
      'import { spawnSync } from "child_process"',
      'appendFileSync(process.env.GIT_PROXY_CALLS, JSON.stringify(process.argv.slice(2)) + "\\n")',
      'const result = spawnSync(process.env.GIT_PROXY_REAL, process.argv.slice(2), { stdio: "inherit" })',
      "process.exit(result.status ?? 1)",
    ].join("\n"),
  )
  await fs.writeFile(
    path.join(bin, "git"),
    `#!/bin/sh\nexec ${JSON.stringify(process.execPath)} ${JSON.stringify(proxy)} "$@"\n`,
  )
  await fs.chmod(path.join(bin, "git"), 0o755)
  await fs.writeFile(path.join(bin, "git.cmd"), `@"${process.execPath}" "${proxy}" %*\r\n`)

  const previousPath = process.env.PATH
  process.env.PATH = [bin, previousPath].filter(Boolean).join(path.delimiter)
  process.env.GIT_PROXY_CALLS = calls
  process.env.GIT_PROXY_REAL = real
  try {
    await fn(calls)
  } finally {
    if (previousPath === undefined) delete process.env.PATH
    else process.env.PATH = previousPath
    delete process.env.GIT_PROXY_CALLS
    delete process.env.GIT_PROXY_REAL
    await fs.rm(root, { recursive: true, force: true })
  }
}

async function gitCalls(calls: string) {
  return (await fs.readFile(calls, "utf8"))
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as string[])
}

async function disposeGitFixtures() {
  const fixture = path.join(process.cwd(), "test/fixture/fixture.ts")
  const script = [
    `const { tmpdir, tmpdirScoped } = await import(${JSON.stringify(fixture)})`,
    'const { Effect } = await import("effect")',
    'const { CrossSpawnSpawner } = await import("@opencode-ai/core/cross-spawn-spawner")',
    'const { LayerNode } = await import("@opencode-ai/core/effect/layer-node")',
    "const tmp = await tmpdir({ git: true })",
    "await tmp[Symbol.asyncDispose]()",
    "await Effect.runPromise(Effect.scoped(tmpdirScoped({ git: true }).pipe(Effect.provide(LayerNode.compile(CrossSpawnSpawner.node)))))",
  ].join("; ")
  const child = Bun.spawn([process.execPath, "-e", script], { cwd: process.cwd(), env: process.env })
  expect(await child.exited).toBe(0)
}

describe("tmpdir", () => {
  test("disables fsmonitor for git fixtures", async () => {
    await using tmp = await tmpdir({ git: true })

    const value = (await $`git config core.fsmonitor`.cwd(tmp.path).quiet().text()).trim()
    expect(value).toBe("false")
  })

  test("removes directories on dispose", async () => {
    const tmp = await tmpdir({ git: true })
    const dir = tmp.path

    await tmp[Symbol.asyncDispose]()

    const exists = await fs
      .stat(dir)
      .then(() => true)
      .catch(() => false)
    expect(exists).toBe(false)
  })

  test("does not stop fsmonitor while disposing git fixtures", async () => {
    await withGitProxy(async (calls) => {
      await disposeGitFixtures()

      expect(await gitCalls(calls)).not.toContainEqual(["fsmonitor--daemon", "stop"])
    })
  }, 60_000)
})
