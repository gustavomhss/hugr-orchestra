import { expect } from "bun:test"
import path from "node:path"
import { lstat, mkdir, readFile, realpath, writeFile } from "node:fs/promises"
import { Effect, Option, Schema } from "effect"
import { LayerNode } from "../../src/effect/layer-node"
import { AppProcess } from "../../src/process"
import { BackendToolkit } from "../../src/backend-toolkit"
import { Probe } from "../../src/research-toolkit/probe/types"
import { ResearchProcess } from "../../src/research-toolkit/process"
import { ReviewPackSquawk } from "../../src/review-toolkit/packs/squawk"
import { ReviewSquawkReport } from "../../src/review-toolkit/packs/squawk-report"
import { ToolSafetySandbox } from "../../src/tool-safety-sandbox"
import { testEffect } from "../lib/effect"
import { expectSpawn } from "../fixture/omni-expect"
import { provision } from "../fixture/lucy-squawk/host"
import { tmpdir } from "../fixture/tmpdir"

// Jailed pinned-binary conformance. Every scanner and the write probe go through ToolSafetySandbox.confine
// with write:[]. ResearchProcess.run only launches that confined argv. Not an unconfined CLI claim.
// Network isolation is not tested and is not claimed: a jail deny-network setting is not an offline proof.
// Columns are squawk's own JSON fields, not a kernel byte map.

// Independent of the production manifest import. Frozen from ce2c386a7c backend squawk.ts.
const APPROVED_VERSION = "2.67.0"
const APPROVED_INTEGRITY = {
  "darwin-arm64": "sha256-e5gACNJYxhvQZcrG8AtvnG/dzSPsoiSTuoem0ZktTD4=",
  "darwin-x64": "sha256-GaB1M0nnKOMZGrqd1ZPICxhjVBWZfW8JW5EV2yrygsc=",
  "linux-arm64": "sha256-JcT5X4G827Cg3JCYIMIutlehI4FVi3J1vWn5jyU7m2Q=",
  "linux-x64": "sha256-A+/g5ma2O/M+JJNpPuCqnb7QfL3NIPeoKSJFwdqdeQo=",
  "win32-x64": "sha256-1gBKh1opxNmyUfkm7s2MNT59ZESusZ+Zxkrfz5gZY8Q=",
} as const

const it = testEffect(LayerNode.compile(LayerNode.group([AppProcess.node])))
const fixtureRoot = path.join(import.meta.dir, "../fixture/lucy-squawk")
const owned = ["unsafe.sql", "benign.sql", "invalid.sql", "broken.toml"]
const Native = Schema.Array(Schema.Struct({
  file: Schema.String, line: Schema.Number, column: Schema.Number, line_end: Schema.Number, column_end: Schema.Number,
  level: Schema.String, rule_name: Schema.String,
}))
const held = Effect.acquireRelease(
  Effect.promise(() => tmpdir()),
  (made) => Effect.promise(() => made[Symbol.asyncDispose]()),
)

if (process.platform !== "win32") it.live("conformance: pinned squawk under the jail, unsafe warning versus nonempty SELECT 1", () =>
  Effect.gen(function* () {
    expectSpawn(import.meta.path)
    expect(pinGap(ReviewPackSquawk.manifest)).toBeUndefined()
    expect(pinGap({ version: "9.9.9", targets: {} })).toBe("version:9.9.9")
    expect(pinGap({ version: APPROVED_VERSION, targets: {} })).toBe("targets")
    expect(pinGap({ version: APPROVED_VERSION, targets: {
      "darwin-arm64": { artifact: { integrity: "sha256-no" } },
      "darwin-x64": { artifact: { integrity: APPROVED_INTEGRITY["darwin-x64"] } },
      "linux-arm64": { artifact: { integrity: APPROVED_INTEGRITY["linux-arm64"] } },
      "linux-x64": { artifact: { integrity: APPROVED_INTEGRITY["linux-x64"] } },
      "win32-x64": { artifact: { integrity: APPROVED_INTEGRITY["win32-x64"] } },
    } })).toBe("integrity:darwin-arm64")
    const made = yield* held
    const fixture = yield* Effect.promise(() => readFile(path.join(fixtureRoot, "unsafe.sql")))
    expect(fixture.includes("ADD COLUMN") && fixture.includes("NOT NULL") && fixture.includes("café")).toBe(true)
    const installed = yield* provision(path.join(made.path, "toolkit"))
    const located = yield* ReviewPackSquawk.locate().pipe(Effect.provideService(BackendToolkit.Root, path.join(made.path, "toolkit")))
    expect(located).toEqual({ executable: installed.executable })
    expect(ReviewPackSquawk.pgVersion).toBe("unspecified")
    expect(ReviewPackSquawk.upstreamVersionDefault).toBe("15.0.0")
    const host = yield* ReviewPackSquawk.prepare(path.join(made.path, "host"))
    expect(yield* Effect.promise(() => readFile(host, "utf8"))).toBe(ReviewPackSquawk.hostToml)
    expect(ReviewPackSquawk.hostToml.includes("pg_version")).toBe(false)
    const tree = path.join(made.path, "tree")
    yield* Effect.promise(() => copy(tree, { "unsafe.sql": "unsafe.sql", "benign.sql": "benign.sql" }))
    yield* Effect.promise(() => writeFile(path.join(tree, "crlf.sql"), fixture.toString("utf8").replaceAll("\n", "\r\n")))
    const watched = [...owned.map((name) => path.join(fixtureRoot, name)), path.join(tree, "unsafe.sql"), path.join(tree, "benign.sql"), path.join(tree, "crlf.sql")]
    const before = yield* Effect.promise(() => shot(watched))
    yield* Effect.gen(function* () {
    expect(yield* ReviewPackSquawk.argv({ executable: installed.executable, config: host, root: tree, files: [] })).toEqual({
      status: "not-run", reason: "no-input",
    })
    const probe = yield* scan(["/bin/sh", "-c", "/usr/bin/touch \"$TMPDIR/jail-ok\"; /usr/bin/touch ./jail-denied"], tree)
    expect(yield* Effect.promise(() => readFile(path.join(probe.scratch, "jail-ok"), "utf8"))).toBe("")
    expect(yield* Effect.promise(() => lstat(path.join(tree, "jail-denied")).then(() => true, () => false))).toBe(false)
    const version = yield* scan([installed.executable, "--version"], tree)
    expect(text(version.outcome)).toContain(installed.version)
    const clean = yield* product(installed.executable, host, tree, [path.join(tree, "benign.sql")])
    expect(clean.outcome.exitCode, stderr(clean.outcome)).toBe(0)
    expect(ReviewPackSquawk.settle(clean.outcome, tree)).toEqual({ status: "ok", results: [], excluded: [] })
    expect(ReviewSquawkReport.parseReport(stdout(clean.outcome), { root: tree })).toEqual({ status: "ok", results: [], excluded: [] })
    const hit = yield* product(installed.executable, host, tree, [path.join(tree, "unsafe.sql")])
    expect(hit.outcome.exitCode, stderr(hit.outcome)).toBe(1)
    const native = rows(hit.outcome)
    expect(native.length > 0 && native.every((row) => row.level === "Warning" && known(row.rule_name))).toBe(true)
    const settled = ReviewPackSquawk.settle(hit.outcome, tree)
    expect(settled.status).not.toBe("not-run")
    if (settled.status === "not-run") throw new Error(settled.reason)
    expect(settled.status).toBe("ok")
    expect(ReviewSquawkReport.parseReport(stdout(hit.outcome), { root: tree })).toEqual(settled)
    if (settled.status === "ok") {
      for (const row of native) {
        const inclusive = row.column_end === 0 ? row.line_end - 1 : row.line_end
        expect(settled.results).toContainEqual(expect.objectContaining({
          pack: "squawk", rule: row.rule_name, path: "unsafe.sql", line: row.line + 1, endLine: inclusive + 1,
        }))
      }
    }
    const crlf = yield* product(installed.executable, host, tree, [path.join(tree, "crlf.sql")])
    const crlfRows = rows(crlf.outcome)
    const crlfParsed = ReviewSquawkReport.parseReport(stdout(crlf.outcome), { root: tree })
    expect(crlfParsed.status).toBe("ok")
    if (crlfParsed.status === "ok") {
      expect(crlfParsed.results.some((result) => result.line === crlfRows[0].line + 1 && result.path === "crlf.sql")).toBe(true)
    }
    const full = rawRows(stdout(hit.outcome))
    const source = full[0]
    if (!source || typeof source.message !== "string" || typeof source.rule_name !== "string") {
      throw new Error("conformance: raw row incomplete")
    }
    const mixed = full.map((row, index) => index === 0 ? { ...row, rule_name: "not-a-native-rule" } : row)
    expect(ReviewSquawkReport.parseReport(JSON.stringify(mixed), { root: tree })).toEqual({ status: "acquisition-error", reason: "unknown-rule" })
    }).pipe(Effect.ensuring(Effect.promise(async () => {
      expect(await shot(watched)).toEqual(before)
    })))
  }), 600_000,
)

if (process.platform !== "win32") it.live("conformance: a broken repo config is ignored only with the host toml; bad host config and invalid SQL are not passes", () =>
  Effect.gen(function* () {
    expectSpawn(import.meta.path)
    expect(pinGap(ReviewPackSquawk.manifest)).toBeUndefined()
    const made = yield* held
    const installed = yield* provision(path.join(made.path, "toolkit"))
    const host = yield* ReviewPackSquawk.prepare(path.join(made.path, "host"))
    const clean = path.join(made.path, "clean")
    const broken = path.join(made.path, "broken")
    const invalidSql = path.join(broken, "invalid.sql")
    yield* Effect.promise(async () => {
      await copy(clean, { "unsafe.sql": "unsafe.sql" })
      await copy(broken, { "unsafe.sql": "unsafe.sql", ".squawk.toml": "broken.toml" })
      await place(broken, "invalid.sql")
    })
    const watched = [
      ...owned.map((name) => path.join(fixtureRoot, name)),
      path.join(clean, "unsafe.sql"), path.join(broken, "unsafe.sql"), path.join(broken, ".squawk.toml"), invalidSql,
    ]
    const before = yield* Effect.promise(() => shot(watched))
    yield* Effect.gen(function* () {
    const baseline = yield* product(installed.executable, host, clean, [path.join(clean, "unsafe.sql")])
    const baseRules = rows(baseline.outcome).map((row) => row.rule_name).sort()
    expect(baseRules).toContain("adding-required-field")
    const omitted = yield* scan([installed.executable, "--reporter", "json", "--", path.join(broken, "unsafe.sql")], broken)
    expect(omitted.outcome.exitCode, "positive control: omitting --config must read the broken repo toml").toBe(1)
    expect(stderr(omitted.outcome)).toContain("Configuration error")
    expect(stdout(omitted.outcome).trim().startsWith("[")).toBe(false)
    expect(ReviewPackSquawk.settle(omitted.outcome, broken)).toEqual({ status: "acquisition-error", reason: "configuration-error" })
    const kept = yield* product(installed.executable, host, broken, [path.join(broken, "unsafe.sql")])
    expect(kept.outcome.exitCode, stderr(kept.outcome)).toBe(1)
    expect(rows(kept.outcome).map((row) => row.rule_name).sort()).toEqual(baseRules)
    expect(ReviewPackSquawk.settle(kept.outcome, broken).status).toBe("ok")
    expect(yield* ReviewPackSquawk.argv({
      executable: installed.executable, config: path.join(made.path, "missing.toml"), root: broken, files: [path.join(broken, "unsafe.sql")],
    })).toEqual({ status: "not-run", reason: "config-missing" })
    const invalidHost = path.join(made.path, "host", "bad.toml")
    yield* Effect.promise(() => writeFile(invalidHost, "included_rules = [\n"))
    const invalid = yield* product(installed.executable, invalidHost, broken, [path.join(broken, "unsafe.sql")])
    expect(ReviewPackSquawk.settle(invalid.outcome, broken)).toEqual({ status: "acquisition-error", reason: "configuration-error" })
    const syntax = yield* product(installed.executable, host, broken, [invalidSql])
    expect(ReviewPackSquawk.settle(syntax.outcome, broken)).toEqual({ status: "acquisition-error", reason: "syntax-error" })
    expect(ReviewSquawkReport.parseReport(stdout(syntax.outcome), { root: broken }).status).not.toBe("ok")
    }).pipe(Effect.ensuring(Effect.promise(async () => {
      expect(await shot(watched)).toEqual(before)
    })))
  }), 600_000,
)

if (process.platform !== "win32") it.live("conformance: glob metacharacters and spaces stay literal; a sibling match is not scanned", () =>
  Effect.gen(function* () {
    expectSpawn(import.meta.path)
    expect(pinGap(ReviewPackSquawk.manifest)).toBeUndefined()
    const made = yield* held
    const installed = yield* provision(path.join(made.path, "toolkit"))
    const host = yield* ReviewPackSquawk.prepare(path.join(made.path, "host"))
    const tree = path.join(made.path, "glob")
    const selected = [path.join(tree, "my file.sql"), path.join(tree, "keep[a]?*.sql")]
    const sibling = path.join(tree, "keepaZunsafe.sql")
    yield* Effect.promise(async () => {
      await mkdir(tree, { recursive: true })
      const bytes = await readFile(path.join(fixtureRoot, "unsafe.sql"))
      await Promise.all([...selected, sibling].map((file) => writeFile(file, bytes)))
    })
    expect(yield* Effect.promise(() => readFile(sibling, "utf8"))).toContain("ADD COLUMN")
    const watched = [...owned.map((name) => path.join(fixtureRoot, name)), ...selected, sibling]
    const before = yield* Effect.promise(() => shot(watched))
    yield* Effect.gen(function* () {
    const built = yield* ReviewPackSquawk.argv({ executable: installed.executable, config: host, root: tree, files: selected })
    expect(built.status).toBe("ok")
    if (built.status !== "ok") throw new Error(built.reason)
    expect(built.argv).toContain(`${tree}/keep[[]a[]][?][*].sql`)
    expect(built.argv).toContain(`${tree}/my file.sql`)
    expect(built.argv.join("\0")).not.toContain("\"")
    const ran = yield* scan(built.argv, tree)
    expect(ran.outcome.exitCode, stderr(ran.outcome)).toBe(1)
    const native = rows(ran.outcome)
    expect(native.every((row) => row.level === "Warning" && known(row.rule_name))).toBe(true)
    const reported = yield* Effect.promise(() => Promise.all([...new Set(native.map((row) => row.file))].map((file) => realpath(file))))
    const intended = yield* Effect.promise(() => Promise.all(selected.map((file) => realpath(file))))
    expect(reported.sort()).toEqual(intended.sort())
    expect(reported).not.toContain(yield* Effect.promise(() => realpath(sibling)))
    const parsed = ReviewSquawkReport.parseReport(stdout(ran.outcome), { root: tree })
    expect(parsed.status).toBe("ok")
    if (parsed.status === "ok") expect(new Set(parsed.results.map((result) => result.path))).toEqual(new Set(["my file.sql", "keep[a]?*.sql"]))
    expect(ReviewPackSquawk.settle(ran.outcome, tree).status).toBe("ok")
    }).pipe(Effect.ensuring(Effect.promise(async () => {
      expect(await shot(watched)).toEqual(before)
    })))
  }), 600_000,
)

function scan(argv: readonly string[], cwd: string) {
  return Effect.gen(function* () {
    const command = argv[0]
    if (!command) return yield* Effect.die(new Error("conformance-missing: empty argv"))
    const launch = yield* ToolSafetySandbox.confine({
      command, args: argv.slice(1), cwd, env: ResearchProcess.environment(), write: [],
    }).pipe(Effect.catch((error) => Effect.die(new Error(`conformance-missing: ${error.reason}`))))
    const scratch = launch.env.TMPDIR
    if (typeof scratch !== "string") return yield* Effect.die(new Error("conformance-missing: jail scratch missing"))
    const outcome = yield* ResearchProcess.run({
      command: launch.command, args: launch.args, cwd,
      env: Object.fromEntries(Object.entries(launch.env).filter((entry): entry is [string, string] => entry[1] !== undefined)),
      timeoutMs: 60_000, maxBytes: Probe.Limits.outputBytes, maxRssBytes: Probe.Limits.rssBytes,
    })
    return { outcome, scratch }
  })
}

function product(executable: string, config: string, root: string, files: readonly string[]) {
  return Effect.gen(function* () {
    const built = yield* ReviewPackSquawk.argv({ executable, config, root, files })
    if (built.status !== "ok") return yield* Effect.die(new Error(`argv ${built.status}: ${built.reason}`))
    return yield* scan(built.argv, root)
  })
}

function pinGap(manifest: { version: string; targets: Readonly<Record<string, { artifact: { integrity: string } }>> }) {
  if (manifest.version !== APPROVED_VERSION) return `version:${manifest.version}`
  const keys = Object.keys(APPROVED_INTEGRITY)
  const actual = Object.keys(manifest.targets)
  if (actual.length !== keys.length || keys.some((key) => !actual.includes(key))) return "targets"
  const mismatch = keys.find((key) => manifest.targets[key]?.artifact.integrity !== APPROVED_INTEGRITY[key as keyof typeof APPROVED_INTEGRITY])
  return mismatch ? `integrity:${mismatch}` : undefined
}

function stdout(outcome: ResearchProcess.Outcome) {
  return outcome.stdout.data.toString("utf8")
}

function stderr(outcome: ResearchProcess.Outcome) {
  return outcome.stderr.data.toString("utf8")
}

function text(outcome: ResearchProcess.Outcome) {
  return `${stdout(outcome)}${stderr(outcome)}`
}

function rawRows(text: string) {
  const json = Schema.decodeUnknownOption(Schema.UnknownFromJsonString)(text)
  if (Option.isNone(json) || !Array.isArray(json.value) || json.value.length === 0 || !json.value.every(rawRecord)) {
    throw new Error(`conformance: not a raw squawk array: ${text.slice(0, 400)}`)
  }
  return json.value
}

function rawRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}

function rows(outcome: ResearchProcess.Outcome) {
  const json = Schema.decodeUnknownOption(Schema.UnknownFromJsonString)(stdout(outcome))
  if (Option.isNone(json)) throw new Error(`conformance: not json: ${stdout(outcome).slice(0, 400)}`)
  const decoded = Schema.decodeUnknownOption(Native)(json.value)
  if (Option.isNone(decoded)) throw new Error(`conformance: not squawk rows: ${stdout(outcome).slice(0, 400)}`)
  return decoded.value
}

function known(rule: string) {
  return ReviewPackSquawk.RULES.some((id) => id === rule)
}

async function copy(root: string, files: Record<string, string>) {
  await Promise.all(Object.entries(files).map(async ([name, source]) => {
    const target = path.join(root, name)
    await mkdir(path.dirname(target), { recursive: true })
    await writeFile(target, await readFile(path.join(fixtureRoot, source)))
  }))
}

async function place(root: string, source: string) {
  const target = path.join(root, source)
  await writeFile(target, await readFile(path.join(fixtureRoot, source)))
  return target
}

async function shot(files: readonly string[]) {
  return Promise.all(files.map(async (file) => {
    const info = await lstat(file)
    const bytes = await readFile(file)
    return `${file}:${info.mode}:${info.nlink}:${bytes.toString("base64")}`
  }))
}
