export * as ProbeRunners from "./runners"

import path from "path"
import { lstat, mkdir, readdir, realpath } from "fs/promises"
import { Effect } from "effect"
import { FSUtil } from "../../fs-util"
import { ResearchProcess } from "../process"
import { Probe } from "./types"
import { ProbeAssets, denied } from "./assets"
import { ProbeTypecheck } from "./typecheck"
import type { ProbeSnapshot } from "./snapshot"

// J4.3: the closed runner set. The host fixes every binary and argument; the model only picks a path inside the
// snapshot (checked after realpath, J4.2), a test name passed as its own argument, or a script written to the scratch.

export type Plan = {
  readonly kind: Probe.ProbeInput["runner"]["kind"]
  readonly binary: string
  readonly version: string
  /** The full argv, program first, with scratch paths. */
  readonly argv: ReadonlyArray<string>
  /** Inside the snapshot: its root, or the directory whose config picked the test runner. */
  readonly cwd: string
  readonly env: Record<string, string>
}

export type TestRunner = "bun" | "vitest" | "jest" | "pytest" | "go"

export const plan = Effect.fn("ProbeRunners.plan")(function* (input: {
  readonly runner: Probe.ProbeInput["runner"]
  readonly snapshot: ProbeSnapshot.Snapshot
  readonly scratch: string
  readonly heapMiB: number
  readonly unused?: boolean
  readonly env: Record<string, string>
}) {
  const runner = input.runner
  const root = input.snapshot.root
  if (runner.kind === "script") return yield* script(runner, input)
  if (runner.kind === "typecheck") {
    const file = yield* inside(root, runner.project)
    const project = yield* ProbeTypecheck.project(file, root)
    if (!project) return yield* denied(`typecheck-no-tsconfig: ${runner.project}`)
    const tsc = yield* ProbeAssets.typescript(path.dirname(project), root)
    const node = yield* program("node", input.env)
    return {
      kind: "typecheck", binary: tsc.entry, version: tsc.version, cwd: root, env: {},
      argv: ProbeTypecheck.argv({ node, tsc: tsc.entry, project: path.relative(root, project) || ".", heapMiB: input.heapMiB, unused: input.unused }),
    } satisfies Plan
  }
  const file = yield* inside(root, runner.file)
  const found = yield* Effect.promise(() => detect(file, root))
  if (!found) return yield* denied(`test-runner-unknown: no test runner config found for ${runner.file}`)
  if (found.runners.length > 1) return yield* denied(`test-runner-ambiguous: ${runner.file}`, found.runners)
  return yield* test(found.runners[0], { file: path.relative(found.dir, file), name: runner.name, cwd: found.dir, root }, input)
})

const test = Effect.fnUntraced(function* (
  runner: TestRunner,
  target: { file: string; name?: string; cwd: string; root: string },
  input: { heapMiB: number; env: Record<string, string>; scratch: string },
) {
  const filter = (flag: string) => (target.name === undefined ? [] : [flag, target.name])
  if (runner === "bun")
    return { kind: "test", binary: process.execPath, version: Bun.version, cwd: target.cwd, env: BUN,
      argv: [process.execPath, "--no-env-file", "test", target.file, ...filter("-t")] } satisfies Plan
  if (runner === "vitest" || runner === "jest") {
    const asset = yield* ProbeAssets.project(runner, target.cwd, target.root)
    if (!asset) return yield* denied(`test-runner-missing: ${runner} is configured but not installed`)
    const node = yield* program("node", input.env)
    const args = runner === "vitest" ? ["run", target.file] : ["--runTestsByPath", target.file]
    return { kind: "test", binary: asset.entry, version: asset.version, cwd: target.cwd, env: {},
      argv: [node, `--max-old-space-size=${input.heapMiB}`, asset.entry, ...args, ...filter("-t")] } satisfies Plan
  }
  if (runner === "pytest") {
    const python = yield* program("python3", input.env)
    return { kind: "test", binary: python, version: yield* version(python, ["--version"], input), cwd: target.cwd, env: PYTHON,
      argv: [python, "-B", "-m", "pytest", "-p", "no:cacheprovider", target.file, ...filter("-k")] } satisfies Plan
  }
  const go = yield* program("go", input.env)
  const dir = path.dirname(target.file)
  return { kind: "test", binary: go, version: yield* version(go, ["version"], input), cwd: target.cwd, env: GO,
    argv: [go, "test", dir === "." ? "." : `./${dir.split(path.sep).join("/")}`, ...filter("-run")] } satisfies Plan
})

const script = Effect.fnUntraced(function* (
  runner: Extract<Probe.ProbeInput["runner"], { kind: "script" }>,
  input: { snapshot: ProbeSnapshot.Snapshot; scratch: string; env: Record<string, string> },
) {
  if (Buffer.byteLength(runner.source, "utf8") > Probe.Limits.scriptBytes) return yield* denied("script-too-large")
  // Written to the scratch, never into the snapshot.
  const file = path.join(input.scratch, "script", `probe.${runner.language}`)
  yield* Effect.promise(() => mkdir(path.dirname(file)).then(() => Bun.write(file, runner.source)))
  if (runner.language === "py") {
    const python = yield* program("python3", input.env)
    return { kind: "script", binary: python, version: yield* version(python, ["--version"], input), cwd: input.snapshot.root,
      env: { ...PYTHON, PYTHONPATH: input.snapshot.root }, argv: [python, "-B", file] } satisfies Plan
  }
  return { kind: "script", binary: process.execPath, version: Bun.version, cwd: input.snapshot.root, env: BUN,
    argv: [process.execPath, "--no-env-file", file] } satisfies Plan
})

// A compiled Orchestra binary is Bun; BUN_BE_BUN makes it act as the bun CLI. --no-env-file keeps a workspace .env out.
const BUN = { BUN_BE_BUN: "1" }
const PYTHON = { PYTHONDONTWRITEBYTECODE: "1", PYTHONNOUSERSITE: "1" }
// No toolchain download and no module proxy: the jail has no network anyway, this fails fast instead of timing out.
const GO = { GOTOOLCHAIN: "local", GOPROXY: "off" }

/** A model-chosen path, accepted only as an existing entry inside the snapshot after realpath (J4.2). */
export const inside = Effect.fn("ProbeRunners.inside")(function* (root: string, file: string) {
  const physical = yield* Effect.promise(() => realpath(path.resolve(root, file)).catch(() => undefined))
  if (!physical || !FSUtil.contains(root, physical)) return yield* denied(`path-outside-snapshot: ${file}`)
  return physical
})

const program = Effect.fnUntraced(function* (name: string, env: Record<string, string>) {
  const found = Bun.which(name, { PATH: env.PATH ?? "" })
  if (!found) return yield* denied(`runner-binary-missing: ${name}`)
  return found
})

/** A toolchain's own version line, run outside the snapshot with GOTOOLCHAIN=local so go cannot fetch one. */
const version = Effect.fnUntraced(function* (binary: string, args: ReadonlyArray<string>, input: { env: Record<string, string>; scratch: string }) {
  const outcome = yield* ResearchProcess.run({ command: binary, args, cwd: input.scratch, env: { ...input.env, ...GO }, timeoutMs: 10_000, maxBytes: 4096 })
  return `${outcome.stdout.data}${outcome.stderr.data}`.trim().split("\n")[0] || "unknown"
})

const MARKERS: ReadonlyArray<{ runner: TestRunner; files: ReadonlyArray<string>; languages: ReadonlyArray<string> }> = [
  { runner: "bun", files: ["bunfig.toml"], languages: ["js"] },
  { runner: "vitest", files: ["ts", "mts", "cts", "js", "mjs", "cjs"].map((ext) => `vitest.config.${ext}`), languages: ["js"] },
  { runner: "jest", files: ["ts", "mts", "cts", "js", "mjs", "cjs", "json"].map((ext) => `jest.config.${ext}`), languages: ["js"] },
  { runner: "pytest", files: ["pytest.ini", "conftest.py", "pyproject.toml", "setup.cfg", "tox.ini"], languages: ["py"] },
  { runner: "go", files: ["go.mod"], languages: ["go"] },
]

/** The nearest directory, from the test file up to the snapshot root, whose config names runners for its language. */
export async function detect(file: string, root: string) {
  const language = file.endsWith(".py") ? "py" : file.endsWith(".go") ? "go" : "js"
  const markers = MARKERS.filter((marker) => marker.languages.includes(language))
  const search = async (dir: string): Promise<{ dir: string; runners: TestRunner[] } | undefined> => {
    const names = new Set(await readdir(dir).catch(() => []))
    const pkg = names.has("package.json") ? await Bun.file(path.join(dir, "package.json")).json().catch(() => undefined) : undefined
    const runners = markers.filter((marker) => marker.files.some((name) => names.has(name)) ||
      (marker.runner === "jest" && pkg && typeof pkg === "object" && "jest" in pkg)).map((marker) => marker.runner)
    if (runners.length) return { dir, runners }
    if (dir === root || !FSUtil.contains(root, dir)) return undefined
    return search(path.dirname(dir))
  }
  const start = await lstat(file).then((stat) => (stat.isDirectory() ? file : path.dirname(file)))
  return search(start)
}
