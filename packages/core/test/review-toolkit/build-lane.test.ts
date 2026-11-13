import { describe, expect, test } from "bun:test"
import path from "path"
import { cp, mkdir, readFile, readdir, realpath, writeFile } from "fs/promises"
import { Effect } from "effect"
import { LayerNode } from "../../src/effect/layer-node"
import { AppProcess } from "../../src/process"
import { Probe } from "../../src/research-toolkit/probe/types"
import { BackendToolkit } from "../../src/backend-toolkit"
import { ReviewCatalog } from "../../src/review/catalog"
import { ReviewRoute } from "../../src/review/route"
import { ReviewAnalyze } from "../../src/review-toolkit/analyze"
import { ReviewBuildLane } from "../../src/review-toolkit/build-lane"
import { ReviewGolangci } from "../../src/review-toolkit/golangci"
import { ReviewInvoke } from "../../src/review-toolkit/invoke"
import { ReviewOsv } from "../../src/review-toolkit/osv"
import { ReviewGoPinned } from "../../src/review-toolkit/go-pinned"
import { ReviewGoVet } from "../../src/review-toolkit/govet"
import { testEffect } from "../lib/effect"
import { jail } from "../lib/sandbox-host"
import { expectSpawn } from "../fixture/omni-expect"
import { git } from "../fixture/git"
import { tmpdir } from "../fixture/tmpdir"

const it = testEffect(LayerNode.compile(LayerNode.group([AppProcess.node])))
const live = jail ? it.live : it.live.skip
const unjailed = jail ? it.live.skip : it.live

const TOKEN = "fixture-tsc"
const lspAbsent = {
  id: "lsp", pack: "lsp", version: "project", lane: "build", status: "not-run" as const,
  reason: ReviewAnalyze.LSP_ABSENT, workspaceExecuted: false,
}
const GREEN = "export const value: number = 1\n"
const RED = "export const value: number = \"nope\"\n"
const TSCONFIG = `${JSON.stringify({
  compilerOptions: { strict: true, noEmit: true, skipLibCheck: true, types: [] },
  files: ["src/a.ts"],
})}\n`
const GUARD = "echo 'do not run tests from root' && exit 1"

describe("build lane catalog", () => {
  test("standard routes tsc, quick does not, and formal and fuzz stay out", () => {
    const ids: string[] = ReviewCatalog.current.options.map((option) => option.id)
    expect(ids).toContain("probe:test")
    expect(ids).toContain("probe:race")
    for (const id of ["probe:mutants", "probe:interleave", "probe:property"]) expect(ids).toContain(id)
    for (const id of ["probe:formal", "probe:fuzz"]) expect(ids).not.toContain(id)
    expect(ReviewCatalog.current.route.tiers.find((tier) => tier.id === "deep")).toMatchObject({ built: true, runs: "deep" })
    const base = { files: ["package.json", "tsconfig.json"] }
    const head = {
      files: ["package.json", "tsconfig.json", "src/a.ts"],
      changes: [{ path: "src/a.ts", added: [{ line: 1, text: "export const a = 1" }], removed: 0 }],
    }
    const settings = { acceptedUnavailable: [] }
    const routed = { id: "tsc", source: "catalog" as const, lane: "build", status: "routed" as const }
    const standard = ReviewRoute.route({ stage: "code", tier: "standard", settings }, base, head, ReviewCatalog.current)
    expect(standard.packs).toContainEqual(routed)
    const quick = ReviewRoute.route({ stage: "code", tier: "quick", settings }, base, head, ReviewCatalog.current)
    expect(quick.packs.some((pack) => pack.id === "tsc")).toBe(false)
    const deep = ReviewRoute.route({ stage: "code", tier: "deep", settings }, base, head, ReviewCatalog.current)
    expect(deep.tier).toMatchObject({ id: "deep" })
    expect(deep.tier.requested).toBeUndefined()
    expect(deep.packs).toContainEqual(routed)
    const goBase = { files: ["go.mod", "pkg/a.go"] }
    const goHead = {
      files: ["go.mod", "pkg/a.go"],
      changes: [{ path: "pkg/a.go", added: [{ line: 1, text: "package pkg" }], removed: 0 }],
    }
    const vet = { id: "go-vet", source: "catalog" as const, lane: "build", status: "routed" as const }
    expect(ReviewRoute.route({ stage: "code", tier: "standard", settings }, goBase, goHead, ReviewCatalog.current).packs).toContainEqual(vet)
    expect(ReviewRoute.route({ stage: "code", tier: "quick", settings }, goBase, goHead, ReviewCatalog.current).packs.some((pack) => pack.id === "go-vet")).toBe(false)
    expect(ReviewRoute.route({ stage: "code", tier: "deep", settings }, goBase, goHead, ReviewCatalog.current).packs).toContainEqual(vet)
    expect(ReviewGoVet.packages(["pkg/a.go", "pkg/b.go", "a.go", "notes.md"])).toEqual([".", "./pkg"])
    expect(ReviewGoVet.argv("/usr/bin/go", [".", "./pkg"])).toEqual(["/usr/bin/go", "vet", ".", "./pkg"])
    expect(ReviewRoute.route({ stage: "code", tier: "standard", settings }, goBase, goHead, ReviewCatalog.current).packs).toContainEqual({ id: "staticcheck", source: "catalog", lane: "build", status: "routed" })
    expect(ReviewRoute.route({ stage: "code", tier: "standard", settings }, goBase, goHead, ReviewCatalog.current).packs).toContainEqual({ id: "gosec", source: "catalog", lane: "build", status: "routed" })
    expect(ReviewRoute.route({ stage: "code", tier: "quick", settings }, goBase, goHead, ReviewCatalog.current).packs.some((pack) => pack.id === "staticcheck" || pack.id === "gosec")).toBe(false)
    expect(ReviewGoPinned.staticcheckArgv("/opt/staticcheck", ["./pkg"])).toEqual(["/opt/staticcheck", "./pkg"])
    expect(ReviewGoPinned.gosecArgv("/opt/gosec", "/tmp/gosec.sarif", ["./pkg"])).toEqual(["/opt/gosec", "-fmt", "sarif", "-out", "/tmp/gosec.sarif", "./pkg"])
    expect(ReviewGoPinned.gosecArgv("/opt/gosec", "/tmp/gosec.sarif", ["./pkg"]).join(" ")).not.toContain("-ai-api")
    expect(ReviewRoute.route({ stage: "code", tier: "standard", settings }, goBase, goHead, ReviewCatalog.current).packs).toContainEqual({ id: "golangci-lint", source: "catalog", lane: "build", status: "routed" })
    expect(ReviewRoute.route({ stage: "code", tier: "quick", settings }, goBase, goHead, ReviewCatalog.current).packs.some((pack) => pack.id === "golangci-lint")).toBe(false)
    expect(ReviewGolangci.argv("/opt/golangci-lint", "abc123", "/tmp/out.sarif")).toEqual([
      "/opt/golangci-lint", "run", "--new-from-merge-base=abc123", "--output.sarif.path=/tmp/out.sarif",
    ])
    const shellBase = { files: ["script.sh", "Dockerfile"] }
    const shellHead = {
      files: ["script.sh", "Dockerfile"],
      changes: [
        { path: "script.sh", added: [{ line: 1, text: "echo hi" }], removed: 0 },
        { path: "Dockerfile", added: [{ line: 1, text: "FROM scratch" }], removed: 0 },
      ],
    }
    const standardShell = ReviewRoute.route({ stage: "code", tier: "standard", settings }, shellBase, shellHead, ReviewCatalog.current)
    expect(standardShell.packs).toContainEqual({ id: "shellcheck", source: "catalog", lane: "no-build", status: "routed" })
    expect(standardShell.packs).toContainEqual({ id: "hadolint", source: "catalog", lane: "no-build", status: "routed" })
    expect(ReviewRoute.route({ stage: "code", tier: "quick", settings }, shellBase, shellHead, ReviewCatalog.current).packs.some((pack) => pack.id === "shellcheck" || pack.id === "hadolint")).toBe(false)
    expect(ReviewInvoke.argv("/opt/shellcheck", ["script.sh"])).toEqual(["/opt/shellcheck", "script.sh"])
    expect(ReviewInvoke.absent("shellcheck")).toBe("not run: shellcheck absent")
    expect(ReviewInvoke.files("hadolint", ["Dockerfile", "app.dockerfile", "script.sh"])).toEqual(["Dockerfile", "app.dockerfile"])
    const lockBase = { files: ["bun.lock"] }
    const lockHead = {
      files: ["bun.lock"],
      changes: [{ path: "bun.lock", added: [{ line: 1, text: "{}" }], removed: 0 }],
    }
    expect(ReviewRoute.route({ stage: "code", tier: "standard", settings }, lockBase, lockHead, ReviewCatalog.current).packs).toContainEqual({ id: "osv-scanner", source: "catalog", lane: "no-build", status: "routed" })
    expect(ReviewRoute.route({ stage: "code", tier: "quick", settings }, lockBase, lockHead, ReviewCatalog.current).packs.some((pack) => pack.id === "osv-scanner")).toBe(false)
    const scan = ReviewOsv.argv("/opt/osv-scanner", "/tmp/copy")
    expect(scan).toEqual(["/opt/osv-scanner", "scan", "source", "-r", "/tmp/copy", "--offline"])
    expect(scan.join(" ")).not.toContain("fix")
    expect(scan.join(" ")).not.toContain("download")
    expect(ReviewOsv.lockfiles(["bun.lock", "pkg/a.go", "../bun.lock"])).toEqual(["bun.lock"])
  })

  test("this repository cites typecheck.yml, and a near-miss does not", async () => {
    const root = path.resolve(import.meta.dir, "../../../..")
    expect(await Effect.runPromise(ReviewBuildLane.citesTypecheckCi(root))).toBe(true)
    const cited = await tmpdir()
    await writeTree(cited.path, {
      "package.json": JSON.stringify({ name: "orchestra", scripts: { test: GUARD } }),
      ".github/workflows/typecheck.yml": "name: typecheck\n",
    })
    expect(await Effect.runPromise(ReviewBuildLane.citesTypecheckCi(cited.path))).toBe(true)
    const other = await tmpdir()
    await writeTree(other.path, {
      "package.json": JSON.stringify({ name: "other", scripts: { test: GUARD } }),
      ".github/workflows/typecheck.yml": "name: typecheck\n",
    })
    expect(await Effect.runPromise(ReviewBuildLane.citesTypecheckCi(other.path))).toBe(false)
    const unmarked = await tmpdir()
    await writeTree(unmarked.path, {
      "package.json": JSON.stringify({ name: "orchestra", scripts: { test: GUARD } }),
    })
    expect(await Effect.runPromise(ReviewBuildLane.citesTypecheckCi(unmarked.path))).toBe(false)
    await cited[Symbol.asyncDispose]()
    await other[Symbol.asyncDispose]()
    await unmarked[Symbol.asyncDispose]()
  })
})

const input = (
  made: { root: string; store: string },
  extra: Partial<ReviewAnalyze.RunInput>,
): ReviewAnalyze.RunInput => ({
  worktree: made.root,
  base: "base",
  // Isolate compiler-lane checks; production Deep caller evidence is qualified in deep-cache.test.ts.
  tier: "standard",
  store: made.store,
  changed: { "src/a.ts": [{ start: 1, end: 1 }] },
  trusted: true,
  lane: "build",
  packs: ["tsc"],
  scope: "diff",
  ...extra,
})

it.live("a build pack below the lane, an untrusted target, an unknown template and a dropped pack do not run", () =>
  Effect.gen(function* () {
    const made = yield* scratch()
    const lane = yield* ReviewAnalyze.run(input(made, { lane: "repo" }))
    expect(lane.checks).toEqual([
      { id: "tsc", pack: "tsc", version: "project", lane: "build", status: "not-run", reason: "lane: build is above repo", workspaceExecuted: false },
    ])
    const untrusted = yield* ReviewAnalyze.run(input(made, { trusted: false }))
    expect(untrusted.checks).toEqual([
      { id: "tsc", pack: "tsc", version: "project", lane: "build", status: "not-run", reason: "build lane off (D6)", workspaceExecuted: false },
    ])
    const catalog = {
      ...ReviewCatalog.current,
      packs: ReviewCatalog.current.packs.map((pack) => pack.id === "tsc" ? { ...pack, template: "other" } : pack),
    }
    const unknown = yield* ReviewAnalyze.run(input(made, { catalog }))
    expect(unknown.checks[0]).toMatchObject({ status: "not-run", reason: "not-built", workspaceExecuted: false })
    const droppedCatalog = {
      ...ReviewCatalog.current,
      packs: ReviewCatalog.current.packs.map((pack) => pack.id === "tsc" ? { ...pack, status: "dropped" as const } : pack),
    }
    const dropped = yield* ReviewAnalyze.run(input(made, { catalog: droppedCatalog }))
    expect(dropped.checks[0]).toMatchObject({ status: "not-run", reason: "dropped", workspaceExecuted: false })
  }),
)

it.live("a missing compiler is not-run, and nothing is fetched", () =>
  Effect.gen(function* () {
    const made = yield* repo(sample())
    const result = yield* ReviewAnalyze.run(input(made, {}))
    expect(result.checks).toEqual([{
      id: "tsc", pack: "tsc", version: "project", lane: "build", status: "not-run",
      reason: "tsc absent", workspaceExecuted: false,
    }, lspAbsent])
    expect(result.checks[0]?.uri).toBeUndefined()
  }),
)

it.live("this repository's base cites typecheck.yml and does not run tsc", () =>
  Effect.gen(function* () {
    const made = yield* repo({
      "package.json": JSON.stringify({ name: "orchestra", scripts: { test: GUARD } }) + "\n",
      ".github/workflows/typecheck.yml": "name: typecheck\n",
      ".gitignore": "node_modules\n",
      "tsconfig.json": TSCONFIG,
      "src/a.ts": GREEN,
    })
    const result = yield* ReviewAnalyze.run(input(made, {}))
    expect(result.checks).toEqual([{
      id: "tsc", pack: "tsc", version: "project", lane: "build", status: "not-run",
      reason: ReviewBuildLane.TYPECHECK_CI, workspaceExecuted: false,
    }, lspAbsent])
    expect(result.checks[0]?.uri).toBeUndefined()
  }),
)

live("a trusted build lane runs the project's tsc with the closed argv", () =>
  Effect.gen(function* () {
    expectSpawn(import.meta.path)
    const made = yield* repo(sample())
    yield* Effect.promise(() => plantTsc(made.root))
    const result = yield* ReviewAnalyze.run(input(made, {}))
    expect(result.checks[0]).toMatchObject({
      id: "tsc", status: "pass", version: "9.9.9-fixture", lane: "build", workspaceExecuted: true,
    })
    const text = yield* Effect.promise(() => readLog(made.store, result.checks[0]?.uri))
    expect(text).toContain(TOKEN)
    expect(text).toContain(`--max-old-space-size=${Probe.Limits.heapMiB}`)
    expect(text).toContain("-p tsconfig.json --noEmit --pretty false")
    expect(text).not.toContain("--pretty true")
  }),
  120_000,
)

live("a head that adds this repository's marker does not turn the lane off", () =>
  Effect.gen(function* () {
    expectSpawn(import.meta.path)
    const made = yield* repo(sample())
    yield* Effect.promise(() => plantTsc(made.root))
    yield* Effect.promise(() => writeTree(made.root, {
      "package.json": JSON.stringify({ name: "orchestra", scripts: { test: GUARD } }) + "\n",
      ".github/workflows/typecheck.yml": "name: typecheck\n",
    }))
    const result = yield* ReviewAnalyze.run(input(made, {}))
    expect(result.checks[0]).toMatchObject({ status: "pass", workspaceExecuted: true })
    expect(yield* Effect.promise(() => readLog(made.store, result.checks[0]?.uri))).toContain(TOKEN)
  }),
  120_000,
)

live("the installed compiler passes a green file and fails a type error", () =>
  Effect.gen(function* () {
    expectSpawn(import.meta.path)
    const installed = yield* Effect.promise(async () => realpath(await installedTypescript()))
    const made = yield* repo(sample())
    const dest = path.join(made.root, "node_modules", "typescript")
    // Bun links node_modules/typescript into its store. Copy the package into a real directory.
    yield* Effect.promise(async () => {
      await mkdir(path.dirname(dest), { recursive: true })
      await cp(installed, dest, { recursive: true, dereference: true })
    })
    const version = yield* Effect.promise(() => packageVersion(path.join(installed, "package.json")))
    const green = yield* ReviewAnalyze.run(input(made, {}))
    expect(green.checks[0]?.status, yield* Effect.promise(() => readLog(made.store, green.checks[0]?.uri))).toBe("pass")
    expect(green.checks[0]).toMatchObject({ version, workspaceExecuted: true })
    expect(yield* Effect.promise(() => readFile(path.join(made.root, "src", "a.ts"), "utf8"))).toBe(GREEN)
    yield* Effect.promise(() => writeFile(path.join(made.root, "src", "a.ts"), RED))
    const red = yield* ReviewAnalyze.run(input(made, {}))
    const redLog = yield* Effect.promise(() => readLog(made.store, red.checks[0]?.uri))
    expect(red.checks[0]?.status, redLog).toBe("fail")
    expect(red.checks[0]?.workspaceExecuted).toBe(true)
    expect(redLog).toContain("TS2322")
    expect(yield* Effect.promise(() => readFile(path.join(made.root, "src", "a.ts"), "utf8"))).toBe(RED)
    expect(yield* Effect.promise(() => readdir(made.root))).not.toContain("tsconfig.tsbuildinfo")
  }),
  120_000,
)

live("a trusted build lane runs go vet and adds no vet flag", () =>
  Effect.gen(function* () {
    expectSpawn(import.meta.path)
    const made = yield* repo({
      "go.mod": "module example.com/probe\n\ngo 1.22\n",
      "pkg/a.go": "package pkg\n\nfunc OK() int { return 1 }\n",
    })
    const result = yield* ReviewAnalyze.run(input(made, {
      packs: ["go-vet"],
      changed: { "pkg/a.go": [{ start: 1, end: 1 }] },
    }))
    const check = result.checks.find((item) => item.id === "go-vet")
    if (check?.reason === "go absent") return
    const text = yield* Effect.promise(() => readLog(made.store, check?.uri))
    expect(`${check?.status} ${check?.reason ?? ""} ${text}`).toContain(" vet ./pkg")
    expect(check?.workspaceExecuted).toBe(true)
    expect(text).toContain(" vet ./pkg")
    expect(text).not.toContain("-json")
    expect(text).not.toContain("./...")
  }),
  120_000,
)

const qualified = process.platform === "linux" && process.arch === "x64" && jail ? it.live : it.live.skip

qualified("Linux x64 runs pinned staticcheck and gosec with the closed argv", () =>
  Effect.gen(function* () {
    expectSpawn(import.meta.path)
    const made = yield* repo({
      "go.mod": "module example.com/probe\n\ngo 1.22\n",
      "pkg/a.go": "package pkg\n\nfunc OK() int { return 1 }\n",
    })
    const result = yield* ReviewAnalyze.run(input(made, {
      packs: ["staticcheck", "gosec"],
      changed: { "pkg/a.go": [{ start: 1, end: 1 }] },
    })).pipe(Effect.provideService(BackendToolkit.Root, path.join(made.dir.path, "toolkit")))
    for (const id of ["staticcheck", "gosec"]) {
      const check = result.checks.find((item) => item.id === id)
      const text = yield* Effect.promise(() => readLog(made.store, check?.uri))
      expect(`${id} ${check?.status} ${check?.reason ?? ""} ${text}`).toContain(" ./pkg")
      expect(text).not.toContain("-ai-api")
      expect(check?.workspaceExecuted).toBe(true)
    }
    expect(result.checks.find((item) => item.id === "gosec") && true).toBe(true)
    const gosecLog = yield* Effect.promise(() => readLog(made.store, result.checks.find((item) => item.id === "gosec")?.uri))
    expect(gosecLog).toContain("-fmt sarif")
    expect(gosecLog).toContain("-out")
  }),
  180_000,
)

unjailed("without a jail the build lane is not-run and does not pass", () =>
  Effect.gen(function* () {
    const made = yield* repo(sample())
    yield* Effect.promise(() => plantTsc(made.root))
    const result = yield* ReviewAnalyze.run(input(made, {}))
    expect(result.checks[0]).toMatchObject({ status: "not-run", workspaceExecuted: false })
    expect(result.checks[0]?.reason).toStartWith("sandbox:")
    expect(result.checks[0]?.status).not.toBe("pass")
  }),
)

const scratch = () => Effect.acquireRelease(Effect.promise(async () => {
  const dir = await tmpdir()
  await mkdir(path.join(dir.path, "store"))
  return { dir, root: dir.path, store: path.join(dir.path, "store") }
}), (made) => Effect.promise(() => made.dir[Symbol.asyncDispose]()))

const repo = (files: Readonly<Record<string, string>>) => Effect.acquireRelease(Effect.promise(async () => {
  const dir = await tmpdir()
  const root = path.join(dir.path, "repo")
  await mkdir(root, { recursive: true })
  await git(root, "init", "-q")
  await git(root, "config", "user.email", "build-lane@example.com")
  await git(root, "config", "user.name", "Build Lane")
  await writeTree(root, files)
  await git(root, "add", ".")
  await git(root, "commit", "-q", "-m", "base")
  await git(root, "tag", "base")
  const store = path.join(dir.path, "store")
  await mkdir(store)
  return { dir, root, store }
}), (made) => Effect.promise(() => made.dir[Symbol.asyncDispose]()))

function sample() {
  return {
    "package.json": "{\"name\":\"sample\",\"private\":true}\n",
    ".gitignore": "node_modules\n",
    "tsconfig.json": TSCONFIG,
    "src/a.ts": GREEN,
  }
}

async function plantTsc(root: string) {
  const bin = path.join(root, "node_modules", "typescript", "bin")
  await mkdir(bin, { recursive: true })
  await writeFile(path.join(root, "node_modules", "typescript", "package.json"), JSON.stringify({
    name: "typescript",
    version: "9.9.9-fixture",
    bin: { tsc: "./bin/tsc.js" },
  }))
  await writeFile(path.join(bin, "tsc.js"), `process.stdout.write(${JSON.stringify(`${TOKEN}\n`)})\nprocess.stdout.write(process.argv.slice(2).join("\\n"))\n`)
}

async function packageVersion(file: string) {
  const meta: unknown = await Bun.file(file).json()
  if (!meta || typeof meta !== "object" || !("version" in meta) || typeof meta.version !== "string")
    throw new Error(`${file} has no version`)
  return meta.version
}

async function installedTypescript() {
  const candidates = [
    path.resolve(import.meta.dir, "../../../../node_modules/typescript"),
    path.resolve(import.meta.dir, "../../node_modules/typescript"),
  ]
  for (const candidate of candidates) {
    if (await Bun.file(path.join(candidate, "package.json")).exists()) return candidate
  }
  throw new Error(`typescript is not installed; looked in ${candidates.join(", ")}`)
}

async function writeTree(root: string, files: Readonly<Record<string, string>>) {
  for (const [name, text] of Object.entries(files)) {
    const file = path.join(root, name)
    await mkdir(path.dirname(file), { recursive: true })
    await writeFile(file, text)
  }
}

async function readLog(store: string, uri: string | undefined) {
  if (!uri) return ""
  return readFile(path.join(store, uri.slice("review:".length)), "utf8")
}
