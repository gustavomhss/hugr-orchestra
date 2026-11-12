import { expect, test } from "bun:test"
import path from "node:path"
import { link, mkdir, rename, stat, symlink, unlink, writeFile } from "node:fs/promises"
import { Deferred, Effect, Fiber } from "effect"
import { BackendToolkit } from "../../src/backend-toolkit"
import pinned from "../../src/backend-toolkit/packs/cargo-audit"
import { LayerNode } from "../../src/effect/layer-node"
import { AppProcess } from "../../src/process"
import { ReviewCatalog } from "../../src/review/catalog"
import { cargoAudit } from "../../src/review/catalog/cargo-audit"
import { ReviewAnalyze } from "../../src/review-toolkit/analyze"
import { ReviewCargoAudit } from "../../src/review-toolkit/cargo-audit"
import { ReviewCargoAuditFacts } from "../../src/review-toolkit/cargo-audit-facts"
import { ReviewNoise } from "../../src/review-toolkit/noise"
import { ReviewRustsecDb } from "../../src/review-toolkit/rustsec-db"
import { ReviewScratch } from "../../src/review-toolkit/scratch-copy"
import type { ReviewSarif } from "../../src/review-toolkit/sarif"
import { ResearchProcess } from "../../src/research-toolkit/process"
import { ID, HOSTILE, lock, nativeReport, pointer, span } from "../fixture/cargo-audit"
import { expectSpawn } from "../fixture/omni-expect"
import { tmpdir } from "../fixture/tmpdir"
import { testEffect } from "../lib/effect"

const it = testEffect(LayerNode.compile(LayerNode.group([AppProcess.node])))
const linux = process.platform === "linux" && process.arch === "x64"
const lookup: ReviewSarif.Lookup = (pack, rule) =>
  pack === cargoAudit.pack.id && rule === ReviewCargoAuditFacts.RULE
    ? { class: cargoAudit.rules[0].class, lens: cargoAudit.rules[0].lens, severity: "P2", status: cargoAudit.rules[0].status, triage: cargoAudit.rules[0].triage }
    : undefined
type Launch = Parameters<ReviewAnalyze.Confine>[0]
type Script = "clean" | "vuln" | "bad" | "timeout" | "memory" | "cap" | "deny" | "ignore"

test("unqualified runtime and an absent pin never confine or pass", async () => {
  let calls = 0
  const confine = () => {
    calls += 1
    return Effect.die("invoked")
  }
  const unqualified = await Effect.runPromise(ReviewCargoAudit.run(cargoAudit.pack, { ...context({ "Cargo.lock": [{ start: 1, end: 4 }] }), head: Effect.die("head forbidden"), base: Effect.die("base forbidden"), write: () => Effect.die("write forbidden") }, confine, lookup).pipe(
    Effect.scoped,
    Effect.provideService(BackendToolkit.Target, { unsupported: "libc-musl" }),
    Effect.provideService(ReviewCargoAudit.Host, { locate: () => Effect.die("pin forbidden"), database: () => Effect.die("DB forbidden") }),
  ))
  expect(calls).toBe(0)
  expect(unqualified.checks[0]).toMatchObject({ status: "not-run", reason: "native-runtime-unqualified", workspaceExecuted: false })
  expect(unqualified.head).toEqual([])
  expect(unqualified.base).toEqual([])
  if (!linux) {
    const host = await Effect.runPromise(ReviewCargoAudit.run(cargoAudit.pack, context({ "Cargo.lock": [{ start: 1, end: 4 }] }), confine, lookup).pipe(Effect.scoped))
    expect(calls).toBe(0)
    expect(host.checks[0]).toMatchObject({ status: "not-run", reason: "native-runtime-unqualified", workspaceExecuted: false })
    return
  }
  const absent = await Effect.runPromise(ReviewCargoAudit.run(cargoAudit.pack, context({ "Cargo.lock": [{ start: 1, end: 4 }] }), confine, lookup).pipe(
    Effect.scoped,
    Effect.provideService(BackendToolkit.Target, { target: "linux-x64" }),
    Effect.provideService(BackendToolkit.Root, "/review/cargo-audit-absent-root"),
    Effect.provideService(BackendToolkit.Manifest, { [pinned.id]: pinned }),
  ))
  expect(calls).toBe(0)
  expect(absent.checks[0]).toMatchObject({ status: "not-run", workspaceExecuted: false, version: "0.23.0" })
  expect(absent.checks[0].workspaceExecuted).toBe(false)
  expect(absent.checks[0].reason === "cargo-audit absent" || absent.checks[0].reason?.startsWith("cargo-audit absent:")).toBe(true)
  expect(absent.head).toEqual([])
})

it.live.skipIf(!linux)("runner closes argv over captured locks and refuses broken sides without partial findings", () => Effect.gen(function* () {
  expectSpawn(import.meta.path)
  const temp = yield* Effect.acquireRelease(Effect.promise(() => tmpdir()), (value) => Effect.promise(() => value[Symbol.asyncDispose]()))
  const install = path.join(temp.path, "toolkit")
  const dbRoot = path.join(temp.path, "rustsec")
  const revision = "a".repeat(40)
  const generation = `gen-${crypto.randomUUID()}`
  const db = path.join(dbRoot, generation, "db")
  yield* Effect.promise(() => mkdir(path.join(db, "crates"), { recursive: true }))
  yield* Effect.promise(() => mkdir(path.join(db, ".git")))
  const body = pointer(generation, revision)
  yield* Effect.promise(() => writeFile(path.join(dbRoot, "current.json"), body))
  yield* Effect.promise(() => writeFile(path.join(dbRoot, generation, "manifest.json"), body))
  const repo = path.join(temp.path, "repo")
  const store = path.join(temp.path, "store")
  yield* Effect.promise(() => mkdir(path.join(repo, ".cargo"), { recursive: true }))
  yield* Effect.promise(() => mkdir(store))
  const headLock = lock("1.0.0", "# head side\n")
  const baseLock = lock("1.0.0")
  yield* Effect.promise(() => writeFile(path.join(repo, ".cargo", "audit.toml"), HOSTILE))
  yield* git(repo, [["init", "-q"], ["config", "user.email", "audit@example.com"], ["config", "user.name", "Audit"]])
  yield* Effect.promise(() => writeFile(path.join(repo, "README.md"), "base\n"))
  yield* git(repo, [["add", "."], ["commit", "-q", "-m", "base"]])
  const emptyRev = yield* rev(repo)
  yield* Effect.promise(() => writeFile(path.join(repo, "Cargo.lock"), baseLock))
  yield* git(repo, [["add", "."], ["commit", "-q", "-m", "base lock"]])
  const baseRev = yield* rev(repo)
  yield* Effect.promise(() => writeFile(path.join(repo, "Cargo.lock"), headLock))
  yield* git(repo, [["add", "."], ["commit", "-q", "-m", "head"]])
  const headRev = yield* rev(repo)
  const ready = yield* BackendToolkit.ensure(pinned.id).pipe(
    Effect.provideService(BackendToolkit.Root, install),
    Effect.provideService(BackendToolkit.Manifest, { [pinned.id]: pinned }),
  )
  expect(path.basename(ready.executable)).toBe("cargo-audit")
  const installed = yield* Effect.promise(() => Array.fromAsync(new Bun.Glob("**/*").scan({ cwd: install, onlyFiles: true })))
  let script: Script = "vuln"
  const launches: Launch[] = []
  const confine: ReviewCargoAudit.Confine<never> = (input) => {
    launches.push(input)
    expect(input.argv).toEqual(ReviewCargoAuditFacts.argv(input.argv[0], input.argv[3], input.argv[5]))
    expect(input.argv).toContain("--no-fetch")
    expect(input.argv[0]).toBe(ready.executable)
    expect(input.write).toEqual([input.cwd])
    expect(input.argv[5]).toBe(db)
    expect(input.write.includes(db)).toBe(false)
    expect(input.timeoutMs).toBe(300_000)
    expect(input.maxBytes).toBe(4 * 1024 * 1024)
    for (const key of ["HOME", "CARGO_HOME", "RUSTUP_HOME", "XDG_CONFIG_HOME", "XDG_CACHE_HOME", "TMPDIR"]) expect(input.env[key]).toBe(input.cwd)
    for (const key of ["CARGO_HTTP_PROXY", "RUSTUP_TOOLCHAIN", "RUSTSEC_LOG", "XDG_DATA_HOME", "CI", "ORCHESTRA_LOCAL_TESTS", "NODE_OPTIONS"]) expect(input.env[key]).toBeUndefined()
    expect(input.cwd.startsWith(repo)).toBe(false)
    if (script === "deny") return Effect.succeed({ denied: "sandbox: refused" })
    const text = script === "bad" ? "{" : nativeReport(script === "ignore" ? "ignore" : script === "clean" ? "clean" : "vuln", input.argv[3])
    return Effect.promise(() => stat(input.argv[3])).pipe(Effect.map((info) => {
      expect(info.mode & 0o777).toBe(0o600)
      return { outcome: ran(script, text) }
    }))
  }
  const provide = <A, E, R>(effect: Effect.Effect<A, E, R>) => effect.pipe(
    Effect.provideService(ReviewRustsecDb.Root, dbRoot),
    Effect.provideService(ReviewCargoAudit.ParentEnvironment, { ...process.env, CARGO_HTTP_PROXY: "hostile", RUSTUP_TOOLCHAIN: "hostile", RUSTSEC_LOG: "hostile", XDG_DATA_HOME: "hostile" }),
    Effect.provideService(BackendToolkit.Root, install),
    Effect.provideService(BackendToolkit.Manifest, { [pinned.id]: pinned }),
    Effect.provideService(BackendToolkit.Target, { target: "linux-x64" }),
  )
  const kept = new Map<string, string>()
  const write = (name: string, text: string | Uint8Array) => Effect.sync(() => {
    kept.set(name, typeof text === "string" ? text : Buffer.from(text).toString("utf8"))
    return `review:${name}`
  })
  const headSpan = span(headLock)
  const baseSpan = span(baseLock)
  const both = yield* provide(run(confine, write, yield* copied(repo, headRev), yield* copied(repo, baseRev), { "Cargo.lock": [{ start: headSpan.start, end: headSpan.end }] }))
  expect(launches.length).toBe(2)
  expect(both.checks[0]).toMatchObject({ status: "fail", workspaceExecuted: false, version: "0.23.0" })
  expect(both.checks[0].reason).toContain(revision)
  expect(both.checks[0].reason).toContain("yanked: not examined")
  expect(both.checks[0].uri).toBeTruthy()
  expect([...kept.values()].join("\n")).toContain(ID)
  expect(both.head[0]?.item).toMatchObject({ path: "Cargo.lock", rule: ReviewCargoAuditFacts.RULE, line: headSpan.start, endLine: headSpan.end })
  expect(both.base[0]?.item).toMatchObject({ path: "Cargo.lock", line: baseSpan.start, endLine: baseSpan.end })
  expect(both.head[0]?.item.fingerprint).toBe("b2ab73fdba76830073cfa16ac512e58442d0b00001ac311b793471068a07adef")
  expect(both.head[0]?.item.fingerprint).toBe(both.base[0]?.item.fingerprint)
  expect(headSpan.start).not.toBe(baseSpan.start)
  const catalog = ReviewCatalog.current
  const bound = ReviewNoise.pipeline({ head: both.head, base: both.base, changed: { "Cargo.lock": [{ start: headSpan.start, end: headSpan.end }] }, tier: "standard", catalog })
  expect(bound.items.security ?? []).toEqual([])
  expect(bound.debt.map((item) => item.path)).toEqual(["Cargo.lock"])
  const addedBase = yield* copied(repo, emptyRev)
  const added = yield* provide(run(confine, write, yield* copied(repo, headRev), addedBase, { "Cargo.lock": [{ start: headSpan.start, end: headSpan.end }] }))
  expect(added.base).toEqual([])
  expect(added.head.length).toBe(1)
  expect(ReviewNoise.pipeline({ head: added.head, base: added.base, changed: { "Cargo.lock": [{ start: headSpan.start, end: headSpan.end }] }, tier: "standard", catalog }).items.security?.map((item) => item.path)).toEqual(["Cargo.lock"])
  expect(ReviewNoise.pipeline({ head: added.head, base: added.base, changed: { "Cargo.lock": [{ start: 1, end: 1 }] }, tier: "standard", catalog }).items.security ?? []).toEqual([])
  const missingHead = yield* provide(run(confine, write, addedBase, yield* copied(repo, headRev), { "Cargo.lock": [{ start: 1, end: 4 }] }))
  expect(missingHead.checks[0]).toMatchObject({ status: "not-run", reason: "lockfile-missing", workspaceExecuted: false })
  expect(missingHead.head).toEqual([])
  expect(missingHead.base).toEqual([])
  const brokenBase = yield* copied(repo, headRev)
  if (!("snapshot" in brokenBase)) throw new Error("base snapshot missing")
  yield* Effect.promise(() => rename(path.join(brokenBase.snapshot.root, "Cargo.lock"), path.join(brokenBase.snapshot.root, "Cargo.lock.real")))
  yield* Effect.promise(() => symlink("Cargo.lock.real", path.join(brokenBase.snapshot.root, "Cargo.lock")))
  const before = launches.length
  const partial = yield* provide(run(confine, write, yield* copied(repo, headRev), brokenBase, { "Cargo.lock": [{ start: headSpan.start, end: headSpan.end }] }))
  expect(partial.head).toEqual([])
  expect(partial.base).toEqual([])
  expect(partial.checks[0].status).not.toBe("pass")
  expect(partial.checks[0].reason).toBe("lockfile-symlink")
  expect(launches.length).toBe(before)
  const huge = yield* copied(repo, headRev)
  if (!("snapshot" in huge)) throw new Error("oversize snapshot missing")
  yield* Effect.promise(() => writeFile(path.join(huge.snapshot.root, "Cargo.lock"), "x".repeat(4 * 1024 * 1024 + 1)))
  const oversize = yield* provide(run(confine, write, yield* copied(repo, headRev), huge, { "Cargo.lock": [{ start: 1, end: 1 }] }))
  expect(oversize.checks[0].reason).toBe("lockfile-size-cap")
  expect(oversize.head).toEqual([])
  expect(oversize.base).toEqual([])
  const many = Object.fromEntries(Array.from({ length: 17 }, (_, index) => [`n${index}/Cargo.lock`, [{ start: 1, end: 1 }]]))
  const capped = yield* provide(run(confine, write, yield* copied(repo, headRev), yield* copied(repo, headRev), many))
  expect(capped.checks[0]).toMatchObject({ status: "not-run", reason: "lockfile-count-cap" })
  expect(capped.head).toEqual([])
  expect(capped.base).toEqual([])
  expect(launches.length).toBe(before)
  for (const [refusal, status, reason] of [
    ["timeout", "not-run", "timeout"], ["memory", "not-run", "memory cap"], ["cap", "acquisition-error", "output cap"],
    ["deny", "not-run", "sandbox: refused"], ["bad", "acquisition-error", "malformed-json"], ["ignore", "acquisition-error", "ignore-filter"],
  ] as const) {
    script = refusal
    const first = launches.length
    const refused = yield* provide(run(confine, write, yield* copied(repo, headRev), yield* copied(repo, headRev), { "Cargo.lock": [{ start: headSpan.start, end: headSpan.end }] }))
    expect(refused.checks[0]).toMatchObject({ status, reason })
    expect(refused.head).toEqual([])
    expect(refused.base).toEqual([])
    expect(launches.length).toBeGreaterThan(first)
    for (const launch of launches.slice(first)) {
      expect(yield* Effect.promise(() => Bun.file(launch.argv[3]).exists())).toBe(false)
      expect(yield* Effect.promise(() => stat(launch.cwd).then(() => true, () => false))).toBe(false)
    }
  }
  const entered = yield* Deferred.make<Launch>()
  const interrupted = yield* provide(run((launch) => Deferred.succeed(entered, launch).pipe(Effect.andThen(Effect.never)), write, yield* copied(repo, headRev), yield* copied(repo, headRev), { "Cargo.lock": [{ start: headSpan.start, end: headSpan.end }] })).pipe(Effect.forkChild)
  const interruptedLaunch = yield* Deferred.await(entered)
  expect(yield* Effect.promise(() => stat(interruptedLaunch.cwd).then(() => true, () => false))).toBe(true)
  yield* Fiber.interrupt(interrupted)
  expect(yield* Effect.promise(() => stat(interruptedLaunch.cwd).then(() => true, () => false))).toBe(false)
  expect(yield* Effect.promise(() => Bun.file(path.join(repo, ".cargo", "audit.toml")).text())).toBe(HOSTILE)
  script = "vuln"
  const seen: string[] = []
  const held = yield* copied(repo, headRev)
  const stable = yield* provide(run((input) => Effect.promise(async () => {
    if ("snapshot" in held) await writeFile(path.join(held.snapshot.root, "Cargo.lock"), lock("2.0.0"))
    seen.push(await Bun.file(input.argv[3]).text())
  }).pipe(Effect.andThen(Effect.suspend(() => confine(input)))), write, held, held, { "Cargo.lock": [{ start: headSpan.start, end: headSpan.end }] }))
  expect(seen).toEqual([headLock, headLock])
  expect(stable.base[0]?.item).toMatchObject({ line: headSpan.start })
  expect(stable.head[0]?.item).toMatchObject({ line: headSpan.start })
  script = "clean"
  const rewritten = yield* provide(run((launch) => Effect.promise(() => writeFile(launch.argv[3], lock("2.0.0"))).pipe(Effect.andThen(Effect.suspend(() => confine(launch)))), write, yield* copied(repo, headRev), yield* copied(repo, headRev), { "Cargo.lock": [{ start: 1, end: 4 }] }))
  expect(rewritten.checks[0]).toMatchObject({ status: "not-run", reason: "lockfile-changed" })
  expect(rewritten.head).toEqual([])
  expect(rewritten.base).toEqual([])
  script = "vuln"
  const swapping = launches.length
  const swapped = yield* provide(run(confine, write, yield* copied(repo, headRev), yield* copied(repo, headRev), { "Cargo.lock": [{ start: 1, end: 4 }] }).pipe(
    Effect.provideService(ReviewCargoAudit.BeforeLockRead, (file) => Effect.promise(async () => {
      const parent = path.dirname(file)
      await rename(parent, `${parent}-old`)
      await mkdir(parent)
      await writeFile(file, lock("2.0.0"))
    })),
  ))
  expect(swapped.checks[0].status).not.toBe("pass")
  expect(launches.length).toBe(swapping)
  expect(swapped.head).toEqual([])
  expect(swapped.base).toEqual([])
  for (const kind of ["leaf", "hardlink", "utf8", "fifo"] as const) {
    const changed = yield* copied(repo, headRev)
    if (!("snapshot" in changed)) throw new Error("capture fixture missing")
    const file = path.join(changed.snapshot.root, "Cargo.lock")
    const outside = path.join(temp.path, `replacement-${kind}`)
    yield* Effect.promise(() => writeFile(outside, lock("2.0.0")))
    if (kind === "utf8") yield* Effect.promise(() => writeFile(file, Buffer.from([0xff, 0xfe])))
    if (kind === "fifo") {
      yield* Effect.promise(() => unlink(file))
      const made = yield* ResearchProcess.run({ command: "mkfifo", args: [file], cwd: temp.path, env: ResearchProcess.environment(), timeoutMs: 10_000, maxBytes: 4096 })
      expect(made.exitCode).toBe(0)
    }
    const first = launches.length
    let replaced = false
    const refused = yield* provide(run(confine, write, changed, yield* copied(repo, headRev), { "Cargo.lock": [{ start: 1, end: 4 }] }).pipe(
      Effect.provideService(ReviewCargoAudit.BeforeLockRead, (opened) => Effect.promise(async () => {
        if (replaced || opened !== file || (kind !== "leaf" && kind !== "hardlink")) return
        replaced = true
        await rename(file, `${file}-old`)
        if (kind === "hardlink") await link(outside, file)
        if (kind === "leaf") await writeFile(file, lock("2.0.0"))
      })),
    ))
    expect(refused.checks[0].status).not.toBe("pass")
    expect(refused.head).toEqual([])
    expect(refused.base).toEqual([])
    expect(launches.length).toBe(first)
    if (kind === "leaf" || kind === "hardlink") expect(replaced).toBe(true)
  }
  const emptyDb = yield* provide(ReviewCargoAudit.run(cargoAudit.pack, {
    catalog, input: input({ "Cargo.lock": [{ start: 1, end: 4 }] }, repo, store), write, head: copied(repo, headRev), base: copied(repo, headRev),
  }, confine, lookup).pipe(Effect.provideService(ReviewRustsecDb.Root, path.join(temp.path, "missing-db"))))
  expect(emptyDb.checks[0]).toMatchObject({ status: "not-run", reason: ReviewCargoAuditFacts.DATABASE_ABSENT, workspaceExecuted: false })
  expect(ReviewCatalog.current.packs.some((item) => item.id === cargoAudit.pack.id)).toBe(true)
  const observed = { calls: 0 }
  const routed = yield* ReviewAnalyze.run({
    worktree: repo, base: baseRev, head: headRev, tier: "standard", store, trusted: false, lane: "no-build",
    packs: [cargoAudit.pack.id], scope: "diff", changed: { "Cargo.lock": [{ start: headSpan.start, end: headSpan.end }] },
  }).pipe(Effect.provideService(ReviewCargoAudit.Host, {
    locate: () => Effect.sync(() => { observed.calls += 1; return { absent: "cargo-audit absent: public-dispatch" } }),
    database: () => Effect.die("public dispatch must stop before DB"),
  }))
  expect(observed.calls).toBe(1)
  expect(routed.checks).toMatchObject([{ pack: cargoAudit.pack.id, status: "not-run", reason: "cargo-audit absent: public-dispatch", workspaceExecuted: false }])
  expect(yield* Effect.promise(() => Array.fromAsync(new Bun.Glob("**/*").scan({ cwd: install, onlyFiles: true })))).toEqual(installed)
}), 300_000)

function context(changed: ReviewAnalyze.RunInput["changed"]) {
  return {
    catalog: ReviewCatalog.current,
    input: input(changed, "/review/root", "/review/store"),
    write: () => Effect.die("write"),
    head: Effect.succeed({ snapshot: { root: "/review/root", origin: "/review/root", kind: "commit", revision: "head", files: 1, dependencyRoots: [], scratch: "/review", digest: "head" } }),
    base: Effect.succeed({ snapshot: { root: "/review/base", origin: "/review/root", kind: "commit", revision: "base", files: 1, dependencyRoots: [], scratch: "/review", digest: "base" } }),
  } satisfies ReviewAnalyze.RunContext
}

function input(changed: ReviewAnalyze.RunInput["changed"], worktree: string, store: string): ReviewAnalyze.RunInput {
  return { worktree, base: "base", head: "head", tier: "standard", store, trusted: false, lane: "no-build", packs: [cargoAudit.pack.id], scope: "diff", changed }
}

function run(confine: ReviewAnalyze.Confine, write: ReviewAnalyze.RunContext["write"], head: ReviewAnalyze.Copy, base: ReviewAnalyze.Copy, changed: ReviewAnalyze.RunInput["changed"]) {
  return ReviewCargoAudit.run(cargoAudit.pack, {
    catalog: ReviewCatalog.current,
    input: input(changed, "/review/root", "/review/store"),
    write, head: Effect.succeed(head), base: Effect.succeed(base),
  }, confine, lookup)
}

function copied(worktree: string, revision: string) {
  return ReviewScratch.create({ worktree, revision }).pipe(
    Effect.map((snapshot): ReviewAnalyze.Copy => ({ snapshot })),
    Effect.catch((error) => Effect.succeed<ReviewAnalyze.Copy>({ failed: `scratch: ${error.reason}` })),
  )
}

function ran(script: Script, text: string): ResearchProcess.Outcome {
  return {
    exitCode: script === "vuln" ? 1 : script === "cap" || script === "timeout" || script === "memory" ? null : 0,
    durationMs: 1, timedOut: script === "timeout", overflow: script === "cap", memoryExceeded: script === "memory",
    stdout: { data: Buffer.from(text), bytes: Buffer.byteLength(text), truncated: false },
    stderr: { data: Buffer.alloc(0), bytes: 0, truncated: false },
  }
}

function git(cwd: string, commands: string[][]) {
  return Effect.gen(function* () {
    for (const args of commands) {
      const result = yield* ResearchProcess.run({ command: "git", args, cwd, env: ResearchProcess.environment(), timeoutMs: 10_000, maxBytes: 4096 })
      expect(result.exitCode).toBe(0)
    }
  })
}

function rev(cwd: string) {
  return Effect.gen(function* () {
    const result = yield* ResearchProcess.run({ command: "git", args: ["rev-parse", "HEAD"], cwd, env: ResearchProcess.environment(), timeoutMs: 10_000, maxBytes: 128 })
    expect(result.exitCode).toBe(0)
    return result.stdout.data.toString("utf8").trim()
  })
}


test.skipIf(!linux)("runner refuses missing or unsafe lock targets before DB, pin or copy acquisition", async () => {
  const calls = { count: 0 }
  const confine: ReviewCargoAudit.Confine<never> = () => { calls.count += 1; return Effect.die("must not confine") }
  const noHost = { locate: () => Effect.die("pin lookup forbidden"), database: () => Effect.die("DB lookup forbidden") }
  const guarded = (changed: ReviewAnalyze.RunInput["changed"]) => ({
    ...context(changed), head: Effect.die("head copy forbidden"), base: Effect.die("base copy forbidden"), write: () => Effect.die("retained write forbidden"),
  })
  const untargeted: Array<ReviewAnalyze.RunInput["changed"]> = [{}, { "src/a.rs": [{ start: 1, end: 1 }] }]
  for (const changed of untargeted) {
    const result = await Effect.runPromise(ReviewCargoAudit.run(cargoAudit.pack, guarded(changed), confine, lookup).pipe(
      Effect.scoped, Effect.provideService(BackendToolkit.Target, { target: "linux-x64" }), Effect.provideService(ReviewCargoAudit.Host, noHost),
    ))
    expect(result.checks[0]).toMatchObject({ status: "not-run", reason: "target-missing: Cargo.lock", workspaceExecuted: false })
    expect(result.head).toEqual([])
    expect(result.base).toEqual([])
  }
  for (const file of ["../Cargo.lock", "/outside/Cargo.lock", "a\0/Cargo.lock", "C:\\outside\\Cargo.lock"]) {
    const result = await Effect.runPromise(ReviewCargoAudit.run(cargoAudit.pack, guarded({ [file]: [{ start: 1, end: 1 }], "Cargo.lock": [{ start: 1, end: 1 }] }), confine, lookup).pipe(
      Effect.scoped, Effect.provideService(BackendToolkit.Target, { target: "linux-x64" }), Effect.provideService(ReviewCargoAudit.Host, noHost),
    ))
    expect(result.checks[0]).toMatchObject({ status: "not-run", reason: "lockfile-path-invalid", workspaceExecuted: false })
    expect(result.head).toEqual([])
    expect(result.base).toEqual([])
  }
  expect(calls.count).toBe(0)
})


test("unqualified target wins even when no lockfile was requested", async () => {
  for (const changed of [{}, { "src/a.rs": [{ start: 1, end: 1 }] }] as Array<ReviewAnalyze.RunInput["changed"]>) {
    const result = await Effect.runPromise(ReviewCargoAudit.run(cargoAudit.pack, { ...context(changed), head: Effect.die("head forbidden"), base: Effect.die("base forbidden"), write: () => Effect.die("write forbidden") }, () => Effect.die("confine forbidden"), lookup).pipe(
      Effect.scoped,
      Effect.provideService(BackendToolkit.Target, { unsupported: "test-host" }),
      Effect.provideService(ReviewCargoAudit.Host, { locate: () => Effect.die("locate forbidden"), database: () => Effect.die("DB forbidden") }),
    ))
    expect(result.checks[0]).toMatchObject({ status: "not-run", reason: "native-runtime-unqualified", workspaceExecuted: false })
    expect(result.head).toEqual([])
    expect(result.base).toEqual([])
  }
})

test.skipIf(!linux)("unsafe non-lock changes do not hide a safe requested Cargo.lock", async () => {
  const seen = { locate: 0 }
  const result = await Effect.runPromise(ReviewCargoAudit.run(cargoAudit.pack, { ...context({ "../evil.rs": [{ start: 1, end: 1 }], "Cargo.lock": [{ start: 1, end: 1 }] }), head: Effect.die("head forbidden"), base: Effect.die("base forbidden"), write: () => Effect.die("write forbidden") }, () => Effect.die("confine forbidden"), lookup).pipe(
    Effect.scoped,
    Effect.provideService(BackendToolkit.Target, { target: "linux-x64" }),
    Effect.provideService(ReviewCargoAudit.Host, { locate: () => { seen.locate += 1; return Effect.succeed({ absent: "cargo-audit absent: admitted" }) }, database: () => Effect.die("DB forbidden") }),
  ))
  expect(seen.locate).toBe(1)
  expect(result.checks[0]).toMatchObject({ status: "not-run", reason: "cargo-audit absent: admitted", workspaceExecuted: false })
  expect(result.head).toEqual([])
  expect(result.base).toEqual([])
})
