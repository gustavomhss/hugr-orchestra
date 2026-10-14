import { YAML } from "bun"
import { copyFile, chmod, mkdir, mkdtemp, rm } from "node:fs/promises"
import { existsSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { Effect, Schema } from "effect"
import { ChildProcess } from "effect/unstable/process"
import { AppProcess } from "../../src/process"

const root = path.resolve(import.meta.dirname, "../../../..")
const Row = Schema.Struct({ package: Schema.String, host: Schema.String, cpu: Schema.String,
  platform: Schema.String, files: Schema.Array(Schema.String) })
const workflow = Schema.decodeUnknownSync(Schema.Struct({ jobs: Schema.Struct({ qualification: Schema.Struct({
  strategy: Schema.Struct({ matrix: Schema.Struct({ include: Schema.Array(Row) }) }),
  steps: Schema.Array(Schema.Struct({ name: Schema.optional(Schema.String), run: Schema.optional(Schema.String),
    "working-directory": Schema.optional(Schema.String) })),
}) }) }))(YAML.parse(await Bun.file(path.join(root, ".github/workflows/distribution-bundle.yml")).text()))

export function check(value: unknown, name: string): asserts value {
  if (!value) throw new Error(name)
}

function shell(name: string, delimited = false) {
  const steps = workflow.jobs.qualification.steps.filter((step) => step.name === name)
  check(steps.length === 1 && steps[0]?.run?.trim(), `BUNDLE_SHELL_MISSING: ${name}`)
  const text = steps[0].run
  check(typeof text === "string" && text.trim().length > 0, `BUNDLE_SHELL_MISSING: ${name}`)
  if (delimited) {
    const parts = text.split("// bundle-program:begin\n")
    check(parts.length === 2 && parts[1]?.split("// bundle-program:end").length === 2,
      `BUNDLE_PROGRAM_DELIMITERS: ${name}`)
    check(parts[1].split("// bundle-program:end")[0]?.trim(), `BUNDLE_PROGRAM_EMPTY: ${name}`)
  }
  // Run the entire emitted shell, including its actual imports and delimited JavaScript, unchanged.
  return text
}

export const admission = shell("Assert native CPU and exact files", true)
export const run = shell("Run tests")
export const control = shell("Require nonce-bound positive control", true)

export const boundaries = ["Install native Deno", "Extract native Deno", "Prove native Windows Job handle closure",
  "Prove source ABI producers", "Prove Desktop ABI consumer", "Prove Schema ELF ABI", "Prove packaged parser ABI"].map((name) => ({ name, run: shell(name),
    cwd: workflow.jobs.qualification.steps.find((step) => step.name === name)?.["working-directory"] ?? "." }))

// Git Bash PATH entries use /c/...; ordinary command arguments retain native paths for Bun/Node.
function shellPath(file: string) {
  const normalized = file.replaceAll("\\", "/")
  return process.platform === "win32" ? normalized.replace(/^([A-Za-z]):\//, (_, drive: string) => `/${drive.toLowerCase()}/`) : normalized
}

export const fixture = (pkg: "core" | "cli", files?: string[]) => Effect.gen(function* () {
  const selected = workflow.jobs.qualification.strategy.matrix.include.find((row) =>
    row.package === pkg && row.platform === process.platform && row.cpu === (process.arch === "x64" ? "X64" : "ARM64"))
  check(selected, `BUNDLE_FIXTURE_NATIVE_ROW_MISSING: ${pkg}/${process.platform}/${process.arch}`)
  const row = { ...selected, files: files ?? [...selected.files] }
  const dir = yield* Effect.acquireRelease(
    Effect.promise(() => mkdtemp(path.join(tmpdir(), "distribution-bundle-"))),
    (dir) => Effect.promise(() => rm(dir, { recursive: true, force: true })),
  )
  yield* Effect.promise(async () => {
    await mkdir(path.join(dir, "script"))
    await mkdir(path.join(dir, "fake-bin"))
    await mkdir(path.join(dir, "distribution-logs"))
    await mkdir(path.join(dir, "packages", pkg), { recursive: true })
    await copyFile(path.join(root, "script/test-ci-request.ts"), path.join(dir, "script/test-ci-request.ts"))
    await copyFile(path.join(root, "packages", pkg, "package.json"), path.join(dir, "packages", pkg, "package.json"))
    await Promise.all(row.files.map(async (file) => {
      await mkdir(path.dirname(path.join(dir, "packages", pkg, file)), { recursive: true })
      await Bun.write(path.join(dir, "packages", pkg, file), "// ORCHESTRATION-ONLY: inert file-selection input\n")
    }))
    // Only the Bun command boundary is fake. Bash, tee, Node, filesystem IO and AppProcess are real.
    await Bun.write(path.join(dir, "fake-bin/bun"), '#!/usr/bin/env bash\nexec "$BUNDLE_REAL_BUN" "$BUNDLE_CHILD" "$@"\n')
    await chmod(path.join(dir, "fake-bin/bun"), 0o755)
    await Bun.write(path.join(dir, "child.ts"), `
import { readFileSync, statSync, writeFileSync } from "node:fs"
const log = process.env.BUNDLE_LOG
const readLog = () => statSync(log, { throwIfNoEntry: false })?.isFile() ? readFileSync(log, "utf8") : false
const before = readLog()
const nonce = process.env.ORCHESTRA_OMNI_CONTROL_NONCE
console.log("ORCHESTRATION-ONLY: fake Bun child; not native omni evidence")
console.log("child stdout")
console.error("child stderr")
console.log("omni positive control [" + nonce + "]: pass (suite)")
// Tee-failure case waits for the host to observe tee's real error and repair its destination.
if (process.env.BUNDLE_WAIT_LOG === "1") {
  const deadline = Date.now() + 5000
  while (!statSync(log, { throwIfNoEntry: false })?.isFile()) {
    if (Date.now() > deadline) throw new Error("BUNDLE_TEE_ERROR_NOT_OBSERVED")
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
}
const after = readLog()
writeFileSync(process.env.BUNDLE_CAPTURE, JSON.stringify({ argv: process.argv.slice(2), nonce,
  githubActions: process.env.GITHUB_ACTIONS, before, after }))
process.exitCode = Number(process.env.BUNDLE_CHILD_EXIT)
`)
  })
  const capture = path.join(dir, "capture.json")
  const log = path.join(dir, "distribution-logs/run.log")
  return { dir, row, capture, log, cwd: path.join(dir, "packages", pkg), env: {
    ...process.env,
    ROW: JSON.stringify(row), PACKAGE: pkg, GITHUB_WORKSPACE: dir,
    RUNNER_ARCH: row.cpu, RUNNER_OS: row.platform === "linux" ? "Linux" : "Windows",
    BUNDLE_REAL_BUN: process.execPath.replaceAll("\\", "/"),
    BUNDLE_REAL_BIN: shellPath(path.dirname(process.execPath)), BUNDLE_BIN: shellPath(path.join(dir, "fake-bin")),
    BUNDLE_CHILD: path.join(dir, "child.ts").replaceAll("\\", "/"),
    BUNDLE_LOG: log, BUNDLE_CAPTURE: capture, BUNDLE_CHILD_EXIT: "0",
  } }
})

export type Fixture = Effect.Success<ReturnType<typeof fixture>>

export const boundaryFixture = () => Effect.gen(function* () {
  const box = yield* fixture("core")
  const trace = path.join(box.dir, "commands.jsonl")
  const deno = path.join(box.dir, "deno runtime", "deno")
  yield* Effect.promise(async () => {
    await Promise.all(["script", "desktop", "omni", "schema", "maestro-arsenal"].map((pkg) => mkdir(path.join(box.dir, "packages", pkg))))
    await mkdir(path.dirname(deno))
    await copyFile(path.join(root, "script/distribution-deno.ts"), path.join(box.dir, "script/distribution-deno.ts"))
    await mkdir(path.join(box.dir, "packages/core/test"), { recursive: true })
    await copyFile(path.join(root, "packages/core/test/distribution-bundle-gates.ts"), path.join(box.dir, "packages/core/test/distribution-bundle-gates.ts"))
    await Bun.write(trace, "")
    await Bun.write(path.join(box.dir, "boundary.ts"), `
import { appendFileSync, realpathSync } from "node:fs"
const [cmd, ...argv] = process.argv.slice(2)
appendFileSync(process.env.BUNDLE_TRACE, JSON.stringify({ cmd, argv, cwd: realpathSync(process.cwd()),
  githubActions: process.env.GITHUB_ACTIONS, control: process.env.ORCHESTRA_OMNI_CONTROL }) + "\\n")
const key = cmd === "bun" && argv[0] === "script/distribution-deno.ts" ? (argv[1] ?? "download") : cmd
if (key === process.env.BUNDLE_FAIL) {
  console.log("ORCHESTRATION-ONLY failed " + key)
  console.error("boundary stderr " + key)
  process.exit(17)
}
if (cmd === "deno") console.log(process.env.BUNDLE_VERSION ?? "deno 2.9.7 (stable, release, fake)")
if (cmd === "cargo") { console.log(process.env.BUNDLE_CARGO_OUTPUT); console.error("boundary stderr cargo") }
if (cmd === "unzip" || cmd === "chmod") {
  console.log("ORCHESTRATION-ONLY stdout " + cmd)
  console.error("boundary stderr " + cmd)
}
if (cmd === "bun" && (argv[0] === "test" || key === "download")) {
  console.log("ORCHESTRATION-ONLY stdout " + key)
  console.error("boundary stderr " + key)
}
`)
    await Promise.all(["bun", "cargo", "unzip", "chmod", "deno"].map(async (cmd) => {
      const file = cmd === "deno" ? deno : path.join(box.dir, "fake-bin", cmd)
      await Bun.write(file, `#!/usr/bin/env bash\n"$BUNDLE_REAL_BUN" "$BUNDLE_BOUNDARY_CHILD" ${cmd} "$@" || exit $?\n` + (cmd === "bun" ?
        'if [[ "$1" == "../core/test/distribution-bundle-gates.ts" || ( "$1" == "script/distribution-deno.ts" && "${2:-}" == "--verify-version" ) ]]; then exec "$BUNDLE_REAL_BUN" "$@"; fi\n' : ""))
      await chmod(file, 0o755)
    }))
  })
  return { ...box, trace, deno, env: { ...box.env, BUNDLE_TRACE: trace,
    BUNDLE_BOUNDARY_CHILD: path.join(box.dir, "boundary.ts").replaceAll("\\", "/"),
    DISTRIBUTION_DENO_DIRECTORY: path.dirname(deno).replaceAll("\\", "/"), ORCHESTRA_DISTRIBUTION_DENO: deno.replaceAll("\\", "/"),
  } }
})

export const command = (box: Fixture, text: string, fake = false, env: Record<string, string | undefined> = box.env,
  cwd = box.dir, inspect?: (chunk: Uint8Array) => void) =>
  Effect.gen(function* () {
    // Match Actions' Windows Bash shell, not System32's WSL launcher that may precede Git on PATH.
    const bash = process.platform === "win32"
      ? path.join(process.env.ProgramFiles ?? "C:\\Program Files", "Git/bin/bash.exe")
      : Bun.which("bash")
    check(bash && existsSync(bash), "BUNDLE_BASH_MISSING")
    const service = yield* AppProcess.Service
    return yield* service.run(ChildProcess.make(bash,
      ["--noprofile", "--norc", "-e", "-o", "pipefail", "-c",
        `export PATH="$BUNDLE_REAL_BIN:$PATH"\n${fake ? 'export PATH="$BUNDLE_BIN:$PATH"\n' : ""}${text}`], {
        cwd, env, extendEnv: false, stdin: "ignore", stdout: "pipe", stderr: "pipe", forceKillAfter: "2 seconds",
      }), { timeout: "10 seconds", maxOutputBytes: 64 * 1024, maxErrorBytes: 64 * 1024, inspect })
  })

export const Capture = Schema.Struct({ argv: Schema.Array(Schema.String), nonce: Schema.String,
  githubActions: Schema.String, before: Schema.Union([Schema.String, Schema.Literal(false)]),
  after: Schema.Union([Schema.String, Schema.Literal(false)]) })

export function requireExit(result: AppProcess.RunResult, code: number, name: string) {
  check(!result.stdoutTruncated && !result.stderrTruncated, "BUNDLE_COMMAND_OUTPUT_TRUNCATED")
  check(result.exitCode === code, `${name}: expected ${code}, got ${result.exitCode}: ${result.stderr.toString()}`)
}
