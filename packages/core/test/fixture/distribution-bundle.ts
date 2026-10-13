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
  steps: Schema.Array(Schema.Struct({ name: Schema.optional(Schema.String), run: Schema.optional(Schema.String) })),
}) }) }))(YAML.parse(await Bun.file(path.join(root, ".github/workflows/distribution-bundle.yml")).text()))

export function check(value: unknown, name: string): asserts value {
  if (!value) throw new Error(name)
}

function shell(name: string, delimited = false) {
  const steps = workflow.jobs.qualification.steps.filter((step) => step.name === name)
  check(steps.length === 1 && steps[0]?.run?.trim(), `BUNDLE_SHELL_MISSING: ${name}`)
  const text = steps[0].run
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
