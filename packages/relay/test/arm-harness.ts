import { existsSync, realpathSync } from "node:fs"
import { mkdir, mkdtemp, readdir, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { Effect, Layer, Option, Redacted } from "effect"
import { TestClock } from "effect/testing"
import { ArmState } from "../src/arm/state"
import { GateShell } from "../src/gate/shell"
import { JudgeConfig } from "../src/judge/config"

// The WP6 arm tests' harness: the golden generator's layout, its pinned git, and the ports bound the way core binds
// them (WP10): a fresh bash through GateShell.argv with a scrubbed environment, and git without optional locks.

export const TOKEN = "tok"
export const EPOCH = 1700000000
const PATH = process.env.PATH ?? "/usr/bin:/bin"
// The generator's pinned identity (test/golden/arm/GENERATOR.json), so fixture commits have the oracle's SHAs.
const PINNED = Object.fromEntries(
  ["AUTHOR", "COMMITTER"].flatMap((role) => [
    [`GIT_${role}_NAME`, "Relay Golden"],
    [`GIT_${role}_EMAIL`, "golden@relay.invalid"],
    [`GIT_${role}_DATE`, "1700000000 +0000"],
  ]),
)

export type Files = Record<string, string | Uint8Array | null>
export type Entry = Record<string, unknown>
export interface Env {
  readonly dir: string
  readonly arms: string
  readonly arm: string
  readonly work: string
  readonly home: string
  readonly transcript: string
}

const made: string[] = []
export const cleanup = () => Promise.all(made.map((dir) => rm(dir, { recursive: true, force: true })))

// The generator's layout: arms/tok, work, home and transcript.jsonl under one real (symlink-free) root.
export async function scratch(): Promise<Env> {
  const dir = realpathSync(await mkdtemp(path.join(os.tmpdir(), "relay-wp6-")))
  made.push(dir)
  const env = {
    dir,
    arms: path.join(dir, "arms"),
    arm: path.join(dir, "arms", TOKEN),
    work: path.join(dir, "work"),
    home: path.join(dir, "home"),
    transcript: path.join(dir, "transcript.jsonl"),
  }
  await Promise.all([env.arm, env.work, env.home].map((directory) => mkdir(directory, { recursive: true })))
  return env
}

// null deletes; a name ending in "/" is a directory.
export async function write(dir: string, files: Files) {
  for (const [name, value] of Object.entries(files)) {
    const file = path.join(dir, name)
    if (value === null) await rm(file, { recursive: true, force: true })
    if (value === null) continue
    await mkdir(name.endsWith("/") ? file : path.dirname(file), { recursive: true })
    if (!name.endsWith("/")) await Bun.write(file, value)
  }
}

export async function git(cwd: string, home: string, ...args: string[]) {
  const proc = Bun.spawn(["git", "-c", "core.fsmonitor=false", ...args], {
    cwd,
    env: { PATH, HOME: home, GIT_OPTIONAL_LOCKS: "0", GIT_CONFIG_NOSYSTEM: "1", ...PINNED },
    stdin: "ignore",
    stdout: "pipe",
    stderr: "ignore",
  })
  const [stdout, exitCode] = await Promise.all([proc.stdout.bytes(), proc.exited])
  return { exitCode, stdout }
}

// Commits like the generator; the message is part of the SHA a golden records.
export async function repo(env: Env, commits: ReadonlyArray<Files>, messages: ReadonlyArray<string> = []) {
  await git(env.work, env.home, "-c", "init.defaultBranch=main", "init", "-q")
  const shas: string[] = []
  for (const [k, files] of commits.entries()) {
    await write(env.work, files)
    await git(env.work, env.home, "add", "-A")
    await git(env.work, env.home, "commit", "-q", "--allow-empty", "-m", messages[k] ?? "fixture")
    shas.push(new TextDecoder().decode((await git(env.work, env.home, "rev-parse", "HEAD")).stdout).trim())
  }
  return shas
}

// The stub backend as Orchestra config selects it (WP4); RELAY_JUDGE_STUB only forces pass or fail.
export const stub = (forced?: string) =>
  JudgeConfig.layer({ ...JudgeConfig.defaults, stub: forced === "pass" || forced === "fail" ? forced : undefined })

function ports(env: Env, options: Run) {
  const shell = GateShell.Service.of({
    run: (input) =>
      Effect.tryPromise({
        try: () =>
          Bun.spawn([...GateShell.argv(input.program)], {
            cwd: input.cwd,
            env: { PATH, HOME: env.home, ...input.env },
            stdin: "ignore",
            stdout: "ignore",
            stderr: "ignore",
          }).exited,
        catch: () => new GateShell.Unavailable({ reason: "spawn" }),
      }).pipe(Effect.map((exitCode) => ({ exitCode }))),
  })
  const sandboxed = GateShell.Git.of({ run: (cwd, args) => Effect.promise(() => git(cwd, env.home, ...args)) })
  const ledgerKey = options.key ? Option.some(Redacted.make(options.key)) : Option.none()
  return Layer.mergeAll(
    Layer.succeed(GateShell.Service, options.shell ?? shell),
    Layer.succeed(GateShell.Git, sandboxed),
    Layer.succeed(ArmState.Store, { armsDir: env.arms, ledgerKey }),
    options.judge ?? stub(),
    TestClock.layer(),
  )
}

export type Requirements = ArmState.Store | GateShell.Service | GateShell.Git | JudgeConfig.Service
export interface Run {
  readonly at?: number
  readonly judge?: Layer.Layer<JudgeConfig.Service>
  readonly key?: string
  // Replaces the bash port, to make a check unrunnable.
  readonly shell?: GateShell.Interface
}

// One fire: the generator's fake `date` becomes the TestClock's time.
export function run<A, E>(env: Env, effect: Effect.Effect<A, E, Requirements>, options: Run = {}) {
  return Effect.runPromise(
    TestClock.setTime((options.at ?? EPOCH) * 1000).pipe(Effect.andThen(effect), Effect.provide(ports(env, options))),
  )
}

export const read = (file: string) =>
  Bun.file(file)
    .text()
    .catch(() => "")
export const parse = (text: string): Entry[] =>
  text
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line))
export const entries = async (env: Env) => parse(await read(path.join(env.arm, "ledger.jsonl")))
export const events = async (env: Env) => (await entries(env)).map((entry) => entry.event)

// Every arm file the hook could write, as latin1 text with the scratch root written `<root>`.
export async function armFiles(dir: string, scratchRoot?: string): Promise<Record<string, string>> {
  if (!existsSync(dir)) return {}
  const names = (await readdir(dir, { recursive: true, withFileTypes: true }))
    .filter((entry) => entry.isFile())
    .map((entry) => path.relative(dir, path.join(entry.parentPath, entry.name)))
    .filter((name) => !["relay.log", "ledger.jsonl"].includes(name))
    .filter((name) => !name.startsWith(".run.lock") && !name.startsWith(".chain.lock"))
  const text = async (name: string) => {
    const bytes = Buffer.from(await Bun.file(path.join(dir, name)).bytes()).toString("latin1")
    return scratchRoot ? bytes.replaceAll(scratchRoot, "<root>") : bytes
  }
  return Object.fromEntries(await Promise.all(names.sort().map(async (name) => [name, await text(name)])))
}
