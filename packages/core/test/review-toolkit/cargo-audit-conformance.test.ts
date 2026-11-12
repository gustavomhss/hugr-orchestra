import { expect } from "bun:test"
import path from "node:path"
import { access, mkdir, readFile, readdir, realpath, writeFile } from "node:fs/promises"
import { Effect } from "effect"
import { BackendToolkit } from "../../src/backend-toolkit"
import pinned from "../../src/backend-toolkit/packs/cargo-audit"
import { LayerNode } from "../../src/effect/layer-node"
import { AppProcess } from "../../src/process"
import { ReviewCatalog } from "../../src/review/catalog"
import { cargoAudit } from "../../src/review/catalog/cargo-audit"
import type { ReviewAnalyze } from "../../src/review-toolkit/analyze"
import { ReviewCargoAudit } from "../../src/review-toolkit/cargo-audit"
import { ReviewCargoAuditFacts } from "../../src/review-toolkit/cargo-audit-facts"
import { ReviewRustsecDb } from "../../src/review-toolkit/rustsec-db"
import { ResearchProcess } from "../../src/research-toolkit/process"
import { Probe } from "../../src/research-toolkit/probe/types"
import { ToolSafetySandbox } from "../../src/tool-safety-sandbox"
import { advisory, BUILD_RS, COMMITTED, HOSTILE, ID, lock, pointer, REFRESHED, span } from "../fixture/cargo-audit"
import { FileDigests } from "../fixture/file-digests"
import { expectSpawn } from "../fixture/omni-expect"
import { tmpdir } from "../fixture/tmpdir"
import { testEffect } from "../lib/effect"
import { jail } from "../lib/sandbox-host"

const it = testEffect(LayerNode.compile(LayerNode.group([AppProcess.node])))
const rule = cargoAudit.rules[0]

it.live.skipIf(process.platform !== "linux" || process.arch !== "x64")("pinned cargo-audit 0.23.0 audits a local RustSec DB and ignores hostile config", () => Effect.gen(function* () {
  expect(jail, "conformance-missing: sandbox").toBeTruthy()
  expectSpawn(import.meta.path)
  const temp = yield* Effect.acquireRelease(Effect.promise(() => tmpdir()), (value) => Effect.promise(() => value[Symbol.asyncDispose]()))
  const install = path.join(temp.path, "toolkit")
  const dbRoot = path.join(temp.path, "rustsec")
  const generation = `gen-${crypto.randomUUID()}`
  const db = path.join(dbRoot, generation, "db")
  const userHome = path.join(temp.path, "user-home")
  yield* Effect.promise(async () => {
    await mkdir(path.join(db, "crates", "fixture-dependency"), { recursive: true })
    await mkdir(path.join(userHome, ".cargo"), { recursive: true })
    await writeFile(path.join(db, "crates", "fixture-dependency", `${ID}.md`), advisory())
    await writeFile(path.join(userHome, ".cargo", "audit.toml"), HOSTILE)
  })
  yield* git(db, [["init", "-q"], ["config", "user.email", "audit@example.com"], ["config", "user.name", "Audit"], ["add", "."], ["commit", "-q", "-m", "advisory"]])
  const revision = yield* rev(db)
  const body = pointer(generation, revision)
  yield* Effect.promise(async () => {
    await writeFile(path.join(dbRoot, "current.json"), body)
    await writeFile(path.join(dbRoot, generation, "manifest.json"), body)
  })
  const ready = yield* BackendToolkit.ensure(pinned.id).pipe(
    Effect.provideService(BackendToolkit.Root, install),
    Effect.provideService(BackendToolkit.Manifest, { [pinned.id]: pinned }),
  )
  expect(pinned.version).toBe("0.23.0")
  expect(path.basename(ready.executable)).toBe("cargo-audit")
  expect(ready.executable).toBeTruthy()
  const installBytes = yield* Effect.promise(() => FileDigests.capture(install))
  const dbBytes = yield* Effect.promise(() => FileDigests.capture(db))
  const homes: string[] = []
  const outputs: string[] = []
  let expected = ""
  const advisoryPath = path.join(db, "crates", "fixture-dependency", `${ID}.md`)
  const confine: ReviewAnalyze.Confine = (input) => Effect.scoped(Effect.gen(function* () {
    homes.push(input.cwd)
    const request = { command: input.argv[0], args: input.argv.slice(1), cwd: input.cwd, env: input.env, write: input.write }
    expect(input.argv[0]).toBe(ready.executable)
    expect(request.command).toBe(ready.executable)
    expect(Object.hasOwn(request, "network")).toBe(false)
    expect(input.argv).toEqual(ReviewCargoAuditFacts.argv(input.argv[0], input.argv[3], input.argv[5]))
    expect(input.argv).toContain("--no-fetch")
    expect(input.write).toEqual([input.cwd])
    expect(input.argv[5]).toBe(yield* Effect.promise(() => realpath(db)))
    expect(input.write.some((root) => input.argv[5].startsWith(root))).toBe(false)
    expect(input.cwd).not.toBe(userHome)
    expect(input.env.HOME).toBe(input.cwd)
    expect(input.env.CARGO_HOME).toBe(input.cwd)
    expect(input.env.XDG_CONFIG_HOME).toBe(input.cwd)
    expect(input.env.PATH).toBe(process.env.PATH ?? "")
    for (const key of ["RUSTUP_HOME", "XDG_CACHE_HOME", "TMPDIR"]) expect(input.env[key]).toBe(input.cwd)
    for (const key of ["CARGO_HTTP_PROXY", "RUSTUP_TOOLCHAIN", "RUSTSEC_LOG", "CI", "ORCHESTRA_LOCAL_TESTS", "NODE_OPTIONS"]) expect(input.env[key]).toBeUndefined()
    expect(yield* Effect.promise(() => Bun.file(input.argv[3]).text())).toBe(expected)
    expect(yield* Effect.promise(() => Bun.file(path.join(input.cwd, ".cargo", "audit.toml")).exists())).toBe(false)
    const advisoryBytes = yield* Effect.promise(() => readFile(advisoryPath))
    const probeLaunch = yield* ToolSafetySandbox.confine({
      command: process.execPath,
      args: ["-e", "console.log('rustsec-db-write-probe'); await Bun.write(process.argv[1], 'tampered')", advisoryPath],
      cwd: input.cwd,
      env: input.env,
      write: input.write,
    }).pipe(Effect.orDie)
    const probe = yield* ResearchProcess.run({
      command: probeLaunch.command,
      args: probeLaunch.args,
      cwd: input.cwd,
      env: Object.fromEntries(Object.entries(probeLaunch.env).filter((entry): entry is [string, string] => entry[1] !== undefined)),
      timeoutMs: 30_000,
      maxBytes: 64 * 1024,
      maxRssBytes: Probe.Limits.rssBytes,
    })
    expect(probe.stdout.data.toString("utf8")).toContain("rustsec-db-write-probe")
    expect(probe.exitCode).not.toBe(0)
    expect(probe.failure).toBeUndefined()
    expect(probe.timedOut || probe.overflow || probe.memoryExceeded).toBe(false)
    expect(probe.stderr.data.toString("utf8")).toMatch(/EROFS|EACCES|EPERM/)
    expect(yield* Effect.promise(() => readFile(advisoryPath))).toEqual(advisoryBytes)
    const launch = yield* ToolSafetySandbox.confine(request).pipe(Effect.orDie)
    expect(launch.command).not.toBe(request.command)
    const outcome = yield* ResearchProcess.run({
      command: launch.command,
      args: launch.args,
      cwd: input.cwd,
      env: Object.fromEntries(Object.entries(launch.env).filter((entry): entry is [string, string] => entry[1] !== undefined)),
      timeoutMs: input.timeoutMs,
      maxBytes: input.maxBytes,
      maxRssBytes: Probe.Limits.rssBytes,
    })
    outputs.push(outcome.stdout.data.toString("utf8"))
    return { outcome }
  }))
  const vulnText = lock("1.0.0")
  const cleanText = lock("2.0.0")
  const vulnRoot = path.join(temp.path, "vuln")
  const cleanRoot = path.join(temp.path, "clean")
  yield* Effect.promise(() => seed(vulnRoot, vulnText))
  yield* Effect.promise(() => seed(cleanRoot, cleanText))
  const before = yield* Effect.promise(() => readFile(path.join(vulnRoot, "build.rs"), "utf8"))
  expected = vulnText
  const vulnerable = yield* hosted(install, dbRoot, run(confine, vulnRoot, vulnRoot).pipe(Effect.provideService(ReviewCargoAudit.ParentEnvironment, { ...process.env, HOME: userHome, CARGO_HOME: userHome, CARGO_HTTP_PROXY: "http://127.0.0.1:9", RUSTUP_TOOLCHAIN: "hostile", RUSTSEC_LOG: "hostile" })))
  const raw = [...vulnerable.kept.values()].join("\n")
  expect(vulnerable.kept.get("raw/cargo-audit-head-0.json")).toBe(outputs[0])
  expect(vulnerable.kept.get("raw/cargo-audit-base-0.json")).toBe(outputs[1])
  if (vulnerable.checks[0]?.status !== "fail") throw new Error(JSON.stringify({ checks: vulnerable.checks, raw }))
  const firstKey = [...vulnerable.kept.keys()][0]
  expect(firstKey).toBe("raw/cargo-audit-head-0.json")
  expect(vulnerable.cards[0]).toBe("review:raw/cargo-audit-head-0.json")
  const report = JSON.parse(vulnerable.kept.get(firstKey) ?? "")
  expect(firstKey.endsWith(".json")).toBe(true)
  expect(vulnerable.checks[0]).toMatchObject({ status: "fail", workspaceExecuted: false, version: ReviewCargoAuditFacts.VERSION })
  expect(vulnerable.checks[0].reason).toContain(revision)
  expect(vulnerable.checks[0].reason).toContain(COMMITTED)
  expect(vulnerable.checks[0].reason).toContain(REFRESHED)
  expect(vulnerable.checks[0].reason).toContain("yanked: not examined")
  expect(report.vulnerabilities.count).toBe(1)
  expect(report.vulnerabilities.list).toHaveLength(1)
  expect(report.settings.ignore).toEqual([])
  expect(raw).toContain(ID)
  expect(raw).not.toContain("cargo-audit-hostile-build")
  expect(vulnerable.head).toHaveLength(1)
  expect(vulnerable.base).toHaveLength(1)
  const lines = span(vulnText)
  expect(vulnerable.head[0]?.item).toMatchObject({ path: "Cargo.lock", rule: ReviewCargoAuditFacts.RULE, line: lines.start, endLine: lines.end })
  expect(homes).toHaveLength(2)
  expect(new Set(homes).size).toBe(homes.length)
  for (const home of homes) expect(yield* Effect.promise(() => access(home).then(() => true, () => false))).toBe(false)
  expected = cleanText
  const clean = yield* hosted(install, dbRoot, run(confine, cleanRoot, cleanRoot).pipe(Effect.provideService(ReviewCargoAudit.ParentEnvironment, { ...process.env, HOME: userHome, CARGO_HOME: userHome, CARGO_HTTP_PROXY: "http://127.0.0.1:9", RUSTUP_TOOLCHAIN: "hostile", RUSTSEC_LOG: "hostile" })))
  const cleanFirst = [...clean.kept.keys()][0]
  expect(cleanFirst).toBe("raw/cargo-audit-head-0.json")
  expect(clean.cards[0]).toBe("review:raw/cargo-audit-head-0.json")
  expect(outputs).toHaveLength(4)
  expect(clean.kept.get("raw/cargo-audit-head-0.json")).toBe(outputs[2])
  expect(clean.kept.get("raw/cargo-audit-base-0.json")).toBe(outputs[3])
  const cleanReport = JSON.parse(clean.kept.get(cleanFirst) ?? "")
  expect(clean.checks[0]).toMatchObject({ status: "pass", workspaceExecuted: false })
  expect(cleanReport.vulnerabilities.count).toBe(0)
  expect(cleanReport.vulnerabilities.list).toEqual([])
  expect(cleanReport.settings.ignore).toEqual([])
  expect(clean.head).toEqual([])
  expect([...clean.kept.values()].join("\n")).not.toContain("cargo-audit-hostile-build")
  expect(before).toBe(BUILD_RS)
  expect(yield* Effect.promise(() => readFile(path.join(vulnRoot, ".cargo", "audit.toml"), "utf8"))).toBe(HOSTILE)
  expect(yield* Effect.promise(() => readdir(vulnRoot))).not.toContain("target")
  expect(yield* Effect.promise(() => FileDigests.capture(install))).toEqual(installBytes)
  expect(yield* Effect.promise(() => FileDigests.capture(db))).toEqual(dbBytes)
  expect(homes).toHaveLength(4)
  expect(new Set(homes).size).toBe(homes.length)
  for (const home of homes) expect(yield* Effect.promise(() => access(home).then(() => true, () => false))).toBe(false)
}), 300_000)

function hosted<A, E, R>(install: string, dbRoot: string, effect: Effect.Effect<A, E, R>) {
  return effect.pipe(
    Effect.provideService(BackendToolkit.Root, install),
    Effect.provideService(BackendToolkit.Manifest, { [pinned.id]: pinned }),
    Effect.provideService(BackendToolkit.Target, { target: "linux-x64" }),
    Effect.provideService(ReviewRustsecDb.Root, dbRoot),
  )
}

function run(confine: ReviewAnalyze.Confine, head: string, base: string) {
  const kept = new Map<string, string>()
  const cards: string[] = []
  return ReviewCargoAudit.run(cargoAudit.pack, {
    catalog: ReviewCatalog.current,
    input: { worktree: head, base: "base", tier: "standard", store: path.dirname(head), trusted: false, lane: "no-build", packs: [cargoAudit.pack.id], scope: "diff", changed: { "Cargo.lock": [{ start: 1, end: 20 }] } },
    write: (name, text) => Effect.sync(() => {
      kept.set(name, typeof text === "string" ? text : Buffer.from(text).toString("utf8"))
      const uri = `review:${name}`
      cards.push(uri)
      return uri
    }),
    head: Effect.succeed(copy(head)),
    base: Effect.succeed(copy(base)),
  }, confine, (pack, id) => pack === cargoAudit.pack.id && id === rule.rule ? {
    class: rule.class, lens: rule.lens, severity: "P2", status: rule.status, triage: rule.triage,
  } : undefined).pipe(Effect.map((outcome) => ({ ...outcome, kept, cards })))
}

function copy(root: string): ReviewAnalyze.Copy {
  return { snapshot: { root, origin: root, kind: "worktree", revision: "fixture", files: 1, dependencyRoots: [], scratch: path.dirname(root), digest: root } }
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

async function seed(root: string, text: string) {
  await mkdir(path.join(root, ".cargo"), { recursive: true })
  await writeFile(path.join(root, "Cargo.lock"), text)
  await writeFile(path.join(root, ".cargo", "audit.toml"), HOSTILE)
  await writeFile(path.join(root, "build.rs"), BUILD_RS)
}
