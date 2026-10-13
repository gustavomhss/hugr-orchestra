import { YAML } from "bun"
import { expect, test } from "bun:test"
import { realpathSync, statSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { Schema } from "effect"
import { controlVerdict, preloadsControl, validateRequest } from "../../../script/test-ci-request"

const root = fileURLToPath(new URL("../../../", import.meta.url))
const Step = Schema.Struct({
  name: Schema.optional(Schema.String), run: Schema.optional(Schema.String), uses: Schema.optional(Schema.String),
  if: Schema.optional(Schema.String), shell: Schema.optional(Schema.String), "working-directory": Schema.optional(Schema.String),
  "continue-on-error": Schema.optional(Schema.Boolean), env: Schema.optional(Schema.Record(Schema.String, Schema.String)),
  with: Schema.optional(Schema.Record(Schema.String, Schema.Unknown)),
})
const Row = Schema.Struct({ package: Schema.String, host: Schema.String, cpu: Schema.String, platform: Schema.String,
  files: Schema.optional(Schema.Array(Schema.String)) })
const Job = Schema.Struct({ "runs-on": Schema.String, "timeout-minutes": Schema.Number,
  defaults: Schema.optional(Schema.Struct({ run: Schema.Struct({ shell: Schema.String }) })),
  "continue-on-error": Schema.optional(Schema.Boolean), if: Schema.optional(Schema.String),
  env: Schema.optional(Schema.Record(Schema.String, Schema.String)), steps: Schema.Array(Step),
  strategy: Schema.optional(Schema.Struct({ "fail-fast": Schema.Boolean, "max-parallel": Schema.Number,
    matrix: Schema.Struct({ include: Schema.optional(Schema.Array(Row)) }) })) })
const Workflow = Schema.Struct({ name: Schema.String, on: Schema.Record(Schema.String, Schema.Unknown),
  permissions: Schema.Record(Schema.String, Schema.String), defaults: Schema.Struct({ run: Schema.Struct({ shell: Schema.String }) }),
  env: Schema.Record(Schema.String, Schema.String), jobs: Schema.Record(Schema.String, Job) })
const source = YAML.parse(await Bun.file(path.join(root, ".github/workflows/distribution-bundle.yml")).text())
const selector = await Bun.file(path.join(root, "packages/cli/script/test.ts")).text()
const distribution = [...new Bun.Glob("test/distribution-*.test.ts").scanSync({ cwd: path.join(root, "packages/cli") })].map((file) => `./${file.replaceAll("\\", "/")}`)
const checkout = "actions/checkout@34e114876b0b11c390a56381ad16ebd13914f8d5"
const upload = "actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02"

test("real bundle source passes structural, executable wiring and generic CLI discovery checks", async () => {
  inspect(source)
  check(preloadsControl(Schema.decodeUnknownSync(Schema.Struct({ test: Schema.Struct({ preload: Schema.Array(Schema.String) }) }))(Bun.TOML.parse(await Bun.file(path.join(root, "packages/core/bunfig.toml")).text()))), "BUNDLE_CORE_PRELOAD")
  for (const platform of ["linux", "win32", "darwin"]) {
    const calls: string[][] = []
    await new Function("Bun", "process", `return (async () => {${new Bun.Transpiler({ loader: "ts" }).transformSync(selector.startsWith("#!") ? selector.slice(selector.indexOf("\n") + 1) : selector)}})()`)(
      { file: (file: string) => Bun.file(path.join(root, "packages/cli", file)), spawn: (args: string[]) => { calls.push(args); return { exited: Promise.resolve(0) } } },
      { platform, execPath: "bun", argv: ["bun", "script/test.ts", "sentinel"], exit: (code: number) => check(code === 0, "CLI_SELECTOR_EXIT") },
    )
    check(calls.length === 1, "CLI_SELECTOR_SPAWN")
    const args = calls[0] ?? []
    const exclusions = args.filter((arg) => arg.startsWith("--path-ignore-patterns=")).map((arg) => `./${arg.slice("--path-ignore-patterns=".length)}`)
    expect(exclusions).toEqual(["./test/distribution-native.test.ts", "./test/distribution-homebrew.test.ts", "./test/artifact-native-lane.test.ts", "./test/artifact-case-alias.test.ts", ...(platform === "win32" ? ["./test/artifact-posix-race.test.ts"] : [])])
    expect(args).toEqual(["bun", "test", "--timeout", "30000", ...exclusions.map((file) => `--path-ignore-patterns=${file.slice(2)}`), "sentinel"])
    exclusions.forEach((file) => check(statSync(path.join(root, "packages/cli", file)).isFile(), `CLI_EXCLUSION_MISSING: ${file}`))
  }
})

test("mutations of parsed real source fail by defect name", () => {
  const mutations: [string, (value: typeof Workflow.Type) => unknown][] = [
    ["BUNDLE_MATRIX", (value) => ({ ...value, jobs: { ...value.jobs, qualification: { ...value.jobs.qualification, strategy: undefined } } })],
    ["BUNDLE_FILES", (value) => patchRows(value, (row) => ({ ...row, files: undefined }))],
    ["BUNDLE_FILES", (value) => patchRows(value, (row) => ({ ...row, files: [] }))],
    ["BUNDLE_NATIVE_PROOF", (value) => patchRows(value, (row) => ({ ...row, files: row.files?.filter((file) => !file.endsWith("distribution-native.test.ts")) }))],
    ["BUNDLE_HOMEBREW_PROOF", (value) => patchRows(value, (row) => ({ ...row, files: row.files?.filter((file) => !file.endsWith("distribution-homebrew.test.ts")) }))],
    ["BUNDLE_CPU_BLIND", (value) => patchStep(value, "Assert native CPU and exact files", (step) => ({ ...step, run: step.run?.replace("process.arch !== arch", "false") }))],
    ["BUNDLE_CONTROL", (value) => patchStep(value, "Require nonce-bound positive control", () => undefined)],
    ["BUNDLE_CONTROL_BLIND", (value) => patchStep(value, "Require nonce-bound positive control", (step) => ({ ...step, run: "// bundle-program:begin\n// bundle-program:end" }))],
  ]
  mutations.forEach(([name, mutate]) => expect(() => inspect(mutate(Schema.decodeUnknownSync(Workflow)(source))), name).toThrow(name))
})

function inspect(input: unknown) {
  const value = Schema.decodeUnknownSync(Workflow)(input)
  check(value.name === "distribution-bundle" && Object.keys(value.on).toSorted().join() === "push,workflow_dispatch", "BUNDLE_TRIGGERS")
  expect(value.on.push).toEqual({ branches: ["distribution-bundle"] })
  expect(value.permissions).toEqual({ contents: "read" })
  expect(Object.keys(value.jobs).toSorted()).toEqual(["qualification", "static"])
  check(value.defaults.run.shell === "bash" && value.env.CI === "true", "BUNDLE_SHELL_CI")
  const job = value.jobs.qualification
  check(job?.strategy?.matrix.include?.length === 7 && job.strategy["fail-fast"] === false && job.strategy["max-parallel"] === 3, "BUNDLE_MATRIX")
  const rows = job.strategy.matrix.include
  expect(rows.map((row) => [row.package, row.host, row.cpu, row.platform])).toEqual([
    ["core", "ubuntu-latest", "X64", "linux"], ["core", "windows-latest", "X64", "win32"],
    ["cli", "ubuntu-latest", "X64", "linux"], ["cli", "windows-latest", "X64", "win32"],
    ["cli", "ubuntu-24.04-arm", "ARM64", "linux"], ["cli", "macos-14", "ARM64", "darwin"], ["cli", "macos-15-intel", "X64", "darwin"],
  ])
  check(job["runs-on"] === "${{ matrix.host }}" && job.env?.ROW === "${{ toJSON(matrix) }}" && job.env.PACKAGE === "${{ matrix.package }}" && job.env.ORCHESTRA_OMNI_CONTROL === "suite", "BUNDLE_MATRIX_WIRING")
  check(!JSON.stringify(value).includes("ORCHESTRA_EXPERIMENTAL_OMNI_SPAWNER"), "BUNDLE_SPAWNER_OVERRIDE")
  Object.values(value.jobs).forEach((lane) => { check(!lane.if && !lane["continue-on-error"] && lane["timeout-minutes"] > 0 && (!lane.defaults || lane.defaults.run.shell === "bash"), "BUNDLE_JOB_BYPASS"); lane.steps.forEach((step) => check(!step["continue-on-error"] && (!step.shell || step.shell === "bash"), "BUNDLE_STEP_BYPASS")) })
  const admission = requireStep(job.steps, "Assert native CPU and exact files", "BUNDLE_CPU")
  const control = requireStep(job.steps, "Require nonce-bound positive control", "BUNDLE_CONTROL")
  const run = requireStep(job.steps, "Run tests", "BUNDLE_RUN")
  check(!admission.if && !run.if && control.if === "always()" && run["working-directory"] === "packages/${{ matrix.package }}", "BUNDLE_EXECUTION")
  check(job.steps.indexOf(admission) < job.steps.indexOf(run) && job.steps.indexOf(run) < job.steps.indexOf(control), "BUNDLE_ORDER")
  check(distribution.length > 0, "BUNDLE_DISTRIBUTION_DISCOVERY_EMPTY")
  rows.forEach((row) => {
    check(row.files?.length, `BUNDLE_FILES: ${row.package}/${row.host}`)
    if (row.package === "cli") {
      check(row.files.includes("./test/distribution-native.test.ts") === (row.platform !== "win32"), `BUNDLE_NATIVE_PROOF: ${row.host}`)
      check(row.files.includes("./test/distribution-homebrew.test.ts") === (row.platform === "darwin"), `BUNDLE_HOMEBREW_PROOF: ${row.host}`)
    }
    const expected = row.package === "core" ? ["packaged-skills", "setup-bun-cache", "test-ci-request", "distribution-bundle-workflow", "effect/cross-spawn-spawner"].map((name) => `./test/${name}.test.ts`)
      : [...(row.host === "ubuntu-latest" ? distribution.filter((file) => !file.endsWith("distribution-homebrew.test.ts"))
        : (row.platform === "darwin" ? ["payload", "launcher", "native", "homebrew"] : row.platform === "win32" ? ["payload", "launcher"] : ["native"]).map((name) => `./test/distribution-${name}.test.ts`)), "./test/packaged-skills-build.test.ts", "./test/distribution-process.test.ts"]
    expect(row.files.toSorted(), `BUNDLE_EXACT_FILES: ${row.host}`).toEqual([...new Set(expected)].toSorted())
    admit(admission, row)
    requireRejection(() => admit(admission, row, { arch: row.cpu === "X64" ? "arm64" : "x64" }), "BUNDLE_CPU_BLIND", "BUNDLE_NATIVE_HOST_MISMATCH")
    requireRejection(() => admit(admission, row, { platform: "unsupported" }), "BUNDLE_PLATFORM_BLIND", "BUNDLE_NATIVE_HOST_MISMATCH")
    expect(() => admit(admission, { ...row, files: [] })).toThrow("BUNDLE_FILES_EMPTY")
    expect(() => admit(admission, { ...row, files: undefined })).toThrow("args must be a string array")
    expect(() => admit(admission, { ...row, files: [row.files[0], row.files[0]] })).toThrow("BUNDLE_FILES_REPEATED")
    expect(() => admit(admission, { ...row, files: ["./test/missing.test.ts"] })).toThrow("BUNDLE_FILE_INVALID_OR_MISSING")
    expect(() => admit(admission, { ...row, files: ["./test/../../package.json.test.ts"] })).toThrow("BUNDLE_FILE_INVALID_OR_MISSING")
  })
  distribution.forEach((file) => check(rows.some((row) => row.package === "cli" && row.files?.includes(file)), `BUNDLE_UNREACHED: ${file}`))
  const nonce = "0123456789abcdef0123456789abcdef"
  const verdict = new Function("process", "readFileSync", "controlVerdict", program(control))
  const log = (text: string) => `omni control nonce: ${nonce}\nomni positive control [${nonce}]: ${text}\n`
  verdict({ env: { ROW: "calibration" } }, () => log("pass (suite)"), controlVerdict)
  ;["", `omni control nonce: ${nonce}\n`, log("off (legacy rollback)"), log("not applicable (focused)"), log("FAIL (suite)"), log("pass (suite)") + log("pass (suite)"), log("pass (suite)") + `omni positive control [${nonce}]: pass (suite)\n`, log("pass (suite)").replace(`[${nonce}]`, "[wrong]")].forEach((text) =>
    requireRejection(() => verdict({ env: { ROW: "calibration" } }, () => text, controlVerdict), "BUNDLE_CONTROL_BLIND"))
  const lines = run.run?.trim().split("\n") ?? []
  ["set -euo pipefail", 'while IFS= read -r file; do args+=("$file"); done < ../../.distribution-files',
    'if [ "$PACKAGE" = cli ]; then preload=(--preload ../../script/test-omni-control.ts); fi',
    'nonce=$(node -e "process.stdout.write(require(\'node:crypto\').randomBytes(16).toString(\'hex\'))")',
    'status=0',
    'GITHUB_ACTIONS=false ORCHESTRA_OMNI_CONTROL_NONCE="$nonce" bun test "${preload[@]}" --timeout 30000 "${args[@]}" 2>&1 | tee ../../distribution-logs/run.log || status=$?',
    'printf \'omni control nonce: %s\\n\' "$nonce" >> ../../distribution-logs/run.log', 'exit "$status"',
  ].forEach((line) => check(lines.includes(line), `BUNDLE_TEST_CONTROL_WIRING: ${line}`))
  expect(job.steps.filter((step) => step.uses).map((step) => step.uses)).toEqual([checkout, "./.github/actions/setup-bun", "./.github/actions/ripgrep", "./.github/actions/omni-binaries", upload])
  check(job.steps.find((step) => step.uses === upload)?.if === "always()" && job.steps.find((step) => step.uses === upload)?.with?.["if-no-files-found"] === "error" && job.steps.find((step) => step.uses === upload)?.with?.path === "distribution-logs", "BUNDLE_LOG_RETENTION")
  const staticJob = value.jobs.static
  check(staticJob?.steps[0]?.uses === checkout && staticJob.steps[1]?.uses === "./.github/actions/setup-bun", "BUNDLE_STATIC_SETUP")
  expect(staticJob.steps.filter((step) => step.run).map((step) => [step.run, step["working-directory"], step.env])).toEqual([
    ["git fetch --depth=1 origin dev:refs/remotes/origin/dev", undefined, undefined], ["bun typecheck", "packages/cli", undefined], ["bun typecheck", "packages/core", undefined],
    ["bun run check:spawn-imports", undefined, undefined], ["bun run check:godfile", undefined, { GODFILE_BASE_REF: "origin/dev" }], ["git diff --check origin/dev HEAD", undefined, undefined],
  ])
}

function check(value: unknown, name: string): asserts value { if (!value) throw new Error(name) }
function requireRejection(run: () => unknown, name: string, diagnostic = "") {
  try { run() } catch (error) { check(error instanceof Error && error.message.includes(diagnostic), name); return }
  throw new Error(name)
}
function requireStep(steps: readonly typeof Step.Type[], name: string, failure: string) {
  const matches = steps.filter((step) => step.name === name)
  check(matches.length === 1 && matches[0], failure)
  return matches[0]
}
function program(step: typeof Step.Type) {
  const parts = step.run?.split("// bundle-program:begin\n")
  check(parts?.length === 2 && parts[1]?.split("// bundle-program:end").length === 2, "BUNDLE_PROGRAM_DELIMITERS")
  return parts[1].split("// bundle-program:end")[0] ?? ""
}
function admit(step: typeof Step.Type, row: typeof Row.Type, override = {}) {
  const writes: string[] = []
  new Function("process", "realpathSync", "statSync", "writeFileSync", "path", "validateRequest", program(step))(
    { arch: row.cpu === "X64" ? "x64" : "arm64", platform: row.platform, ...override,
      env: { ROW: JSON.stringify(row), GITHUB_WORKSPACE: root, RUNNER_ARCH: row.cpu, RUNNER_OS: row.platform === "linux" ? "Linux" : row.platform === "darwin" ? "macOS" : "Windows" } },
    realpathSync, statSync, (_file: string, data: string) => writes.push(data), path, validateRequest,
  )
  expect(writes).toEqual([row.files?.join("\n") + "\n"])
}
function patchRows(value: typeof Workflow.Type, patch: (row: typeof Row.Type) => typeof Row.Type) {
  return { ...value, jobs: { ...value.jobs, qualification: { ...value.jobs.qualification, strategy: { ...value.jobs.qualification?.strategy, matrix: { include: value.jobs.qualification?.strategy?.matrix.include?.map(patch) } } } } }
}
function patchStep(value: typeof Workflow.Type, name: string, patch: (step: typeof Step.Type) => typeof Step.Type | undefined) {
  return { ...value, jobs: { ...value.jobs, qualification: { ...value.jobs.qualification, steps: value.jobs.qualification?.steps.flatMap((step) => step.name === name ? [patch(step)].filter((step) => step !== undefined) : [step]) } } }
}
