// Shared fixtures for the omni spawner tests (omni-spawner*.test.ts): the spawner layers, the nonce-tree roots and
// the output, polling and git helpers.
import { NodeFileSystem, NodePath } from "@effect/platform-node"
import { spawnSync } from "node:child_process"
import { createHash } from "node:crypto"
import fs from "node:fs/promises"
import { readdirSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import { Effect, Layer, Stream } from "effect"
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process"
import { CrossSpawnSpawner } from "@orchestra/core/cross-spawn-spawner"
import { omniSpawner } from "@orchestra/core/flag/flag"
import { AppProcess } from "@orchestra/core/process"
import { sweep, type tree } from "../fixture/process-tree"
import { testEffect } from "../lib/effect"

const platform = Layer.mergeAll(NodeFileSystem.layer, NodePath.layer)
const spawner = (mode: "on" | "strict") =>
  Layer.effect(ChildProcessSpawner.ChildProcessSpawner, CrossSpawnSpawner.makeWith(mode)).pipe(Layer.provide(platform))
const strict = spawner("strict")
export const fx = testEffect(Layer.mergeAll(strict, AppProcess.layerWith("strict").pipe(Layer.provide(strict))))
export const on = testEffect(spawner("on"))

export const LONG = 120_000
export const BOUND = 20_000

export const Spawner = ChildProcessSpawner.ChildProcessSpawner

/**
 * A root that starts the nonce tree with `stdio`, waits until every tree process wrote its record, then exits 0. On
 * Windows the tree is started detached: libuv puts a non-detached child in a kill-on-close job of its parent, so it
 * would die with the root, unlike a grandchild that `start` or a shell leaves behind. omni's Job still holds it.
 */
export function exiting(fixture: ReturnType<typeof tree>, stdio: "inherit" | "ignore") {
  const code = `
const cp = process.getBuiltinModule("node:child_process")
const fs = process.getBuiltinModule("node:fs")
const [file, args, dir, size] = JSON.parse(process.argv.at(-1))
cp.spawn(file, args, { stdio: ["ignore", "${stdio}", "${stdio}"], windowsHide: true, detached: process.platform === "win32" })
const tick = () => fs.readdirSync(dir).filter((name) => name.endsWith(".json")).length >= size ? process.exit(0) : setTimeout(tick, 20)
tick()`
  return ChildProcess.make(process.execPath, [
    "-e",
    code,
    JSON.stringify([fixture.command, fixture.args, fixture.args.at(-1), fixture.size]),
  ])
}

/** Reads stdout lines until the tree's ready line. */
export const ready = (handle: ChildProcessSpawner.ChildProcessHandle, line: string) =>
  handle.stdout.pipe(
    Stream.decodeText,
    Stream.splitLines,
    Stream.filter((text) => text.includes(line)),
    Stream.take(1),
    Stream.runDrain,
  )

export const bytes = (stream: Stream.Stream<Uint8Array, unknown>) =>
  Stream.runCollect(stream).pipe(Effect.map((chunks) => Buffer.concat([...chunks])))

/** Polls the process table until no process carries the nonce (or the bound passes); returns what is left. */
export async function swept(nonce: string) {
  const deadline = Date.now() + BOUND
  for (;;) {
    const left = await sweep(nonce)
    if (left.length === 0 || Date.now() > deadline) return left
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
}

export const records = (fixture: ReturnType<typeof tree>) =>
  readdirSync(fixture.args.at(-1) ?? "").filter((name) => name.endsWith(".json")).length

export async function until(check: () => boolean) {
  const deadline = Date.now() + BOUND
  while (!check()) {
    if (Date.now() > deadline) throw new Error("condition not reached within the bound")
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
}

/** A git repository holding `blobs` (contents), and the exact `git cat-file --batch` output for their ids. */
export async function repository(blobs: Buffer[]) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "omni-cat-file-"))
  const git = (args: string[], input?: string) => {
    const out = spawnSync("git", args, { cwd: dir, input, encoding: "utf8", maxBuffer: 1 << 20 })
    if (out.status !== 0) throw new Error(`git ${args.join(" ")}: ${out.stderr}`)
    return out.stdout
  }
  git(["init", "-q"])
  const files = await Promise.all(
    blobs.map(async (blob, index) => {
      const file = path.join(dir, `blob-${index}`)
      await fs.writeFile(file, blob)
      return file
    }),
  )
  const ids = git(["hash-object", "-w", "--no-filters", "--stdin-paths"], files.join("\n") + "\n")
    .trim()
    .split("\n")
  const expected = Buffer.concat(
    blobs.flatMap((blob, index) => [Buffer.from(`${ids[index]} blob ${blob.length}\n`), blob, Buffer.from("\n")]),
  )
  return { dir, ids, expected, [Symbol.asyncDispose]: () => fs.rm(dir, { recursive: true, force: true }) }
}

export const catFile = (repo: { dir: string; ids: string[] }) =>
  ChildProcess.make("git", ["cat-file", "--batch"], {
    cwd: repo.dir,
    stdin: Stream.make(Buffer.from(repo.ids.join("\n") + "\n")),
  })

export const sha = (data: Buffer) => createHash("sha256").update(data).digest("hex")

export const mode = omniSpawner(process.env.ORCHESTRA_EXPERIMENTAL_OMNI_SPAWNER)
