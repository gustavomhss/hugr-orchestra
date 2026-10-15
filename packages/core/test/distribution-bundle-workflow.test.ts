import { YAML } from "bun"
import { expect, test } from "bun:test"
import { statSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { Schema } from "effect"
import { preloadsControl } from "../../../script/test-ci-request"

const root = fileURLToPath(new URL("../../../", import.meta.url))
const Step = Schema.Struct({
  name: Schema.optional(Schema.String), run: Schema.optional(Schema.String), uses: Schema.optional(Schema.String),
  if: Schema.optional(Schema.String), shell: Schema.optional(Schema.String), "working-directory": Schema.optional(Schema.String),
  "continue-on-error": Schema.optional(Schema.Boolean), env: Schema.optional(Schema.Record(Schema.String, Schema.String)),
  with: Schema.optional(Schema.Record(Schema.String, Schema.Unknown)),
})
const Row = Schema.Struct({ lane: Schema.optional(Schema.String), package: Schema.String, host: Schema.String, cpu: Schema.String, platform: Schema.String,
  files: Schema.optional(Schema.Array(Schema.String)) })
const Job = Schema.Struct({ name: Schema.optional(Schema.String), "runs-on": Schema.String, "timeout-minutes": Schema.Number,
  defaults: Schema.optional(Schema.Struct({ run: Schema.Struct({ shell: Schema.String }) })),
  "continue-on-error": Schema.optional(Schema.Boolean), if: Schema.optional(Schema.String),
  env: Schema.optional(Schema.Record(Schema.String, Schema.String)), steps: Schema.Array(Step),
  strategy: Schema.optional(Schema.Struct({ "fail-fast": Schema.Boolean, "max-parallel": Schema.Number,
    matrix: Schema.StructWithRest(Schema.Struct({ include: Schema.optional(Schema.Array(Row)) }), [Schema.Record(Schema.String, Schema.Unknown)]) })) })
const Workflow = Schema.Struct({ name: Schema.String, on: Schema.Record(Schema.String, Schema.Unknown),
  permissions: Schema.Record(Schema.String, Schema.String), defaults: Schema.Struct({ run: Schema.Struct({ shell: Schema.String }) }),
  env: Schema.Record(Schema.String, Schema.String), jobs: Schema.Record(Schema.String, Job) })
const source = YAML.parse(await Bun.file(path.join(root, ".github/workflows/distribution-bundle.yml")).text())
const selector = await Bun.file(path.join(root, "packages/cli/script/test.ts")).text()
const distribution = [...new Bun.Glob("test/distribution-*.test.ts").scanSync({ cwd: path.join(root, "packages/cli") })].map((file) => `./${file.replaceAll("\\", "/")}`)
const checkout = "actions/checkout@34e114876b0b11c390a56381ad16ebd13914f8d5"
const upload = "actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02"
const localized = ["./test/fixture/distribution-aur/sandbox-evidence.test.ts", "./test/fixture/distribution-aur/bootstrap-config.test.ts",
  ...["compiler-edge", "tool-result", "capture-bytes", "provenance", "model-pull"].map((file) => `./test/fixture/distribution-provider/${file}.test.ts`)]

test("real bundle source passes structural coverage and generic CLI discovery checks", async () => {
  inspect(source)
  check(preloadsControl(Schema.decodeUnknownSync(Schema.Struct({ test: Schema.Struct({ preload: Schema.Array(Schema.String) }) }))(Bun.TOML.parse(await Bun.file(path.join(root, "packages/core/bunfig.toml")).text()))), "BUNDLE_CORE_PRELOAD")
  check(preloadsControl(Schema.decodeUnknownSync(Schema.Struct({ test: Schema.Struct({ preload: Schema.Array(Schema.String) }) }))(Bun.TOML.parse(await Bun.file(path.join(root, "packages/desktop/bunfig.toml")).text()))), "BUNDLE_DESKTOP_PRELOAD")
  for (const platform of ["linux", "win32", "darwin"]) {
    for (const exitCode of [0, 17]) {
      const calls: string[][] = []
      const exits: number[] = []
      await new Function("Bun", "process", `return (async () => {${new Bun.Transpiler({ loader: "ts" }).transformSync(selector.startsWith("#!") ? selector.slice(selector.indexOf("\n") + 1) : selector)}})()`)(
        { file: (file: string) => Bun.file(path.join(root, "packages/cli", file)), spawn: (args: string[]) => { calls.push(args); return { exited: Promise.resolve(exitCode) } } },
        { platform, execPath: "bun", argv: ["bun", "script/test.ts", "sentinel"], exit: (code: number) => exits.push(code) },
      )
      check(calls.length === 1, "CLI_SELECTOR_SPAWN")
      expect(exits, "CLI_SELECTOR_EXIT").toEqual([exitCode])
      const args = calls[0] ?? []
      const exclusions = args.filter((arg) => arg.startsWith("--path-ignore-patterns=")).map((arg) => `./${arg.slice("--path-ignore-patterns=".length)}`)
      expect(exclusions).toEqual(["./test/distribution-native.test.ts", "./test/distribution-homebrew.test.ts", "./test/distribution-windows.test.ts", "./test/distribution-aur.test.ts", "./test/fixture/distribution-aur-guest.test.ts", "./test/distribution-musl.test.ts", "./test/fixture/distribution-musl-guest.test.ts", "./test/distribution-provider.test.ts", "./test/artifact-native-lane.test.ts", "./test/artifact-case-alias.test.ts", ...(platform === "win32" ? ["./test/artifact-posix-race.test.ts", "./test/distribution-recipes.test.ts"] : [])])
      expect(args).toEqual(["bun", "test", "--timeout", "30000", ...exclusions.map((file) => `--path-ignore-patterns=${file.slice(2)}`), "sentinel"])
      exclusions.forEach((file) => check(statSync(path.join(root, "packages/cli", file)).isFile(), `CLI_EXCLUSION_MISSING: ${file}`))
    }
  }
})

test("mutations of parsed real source fail by defect name", () => {
  const mutations: [string, (value: typeof Workflow.Type) => unknown][] = [
    ["BUNDLE_MATRIX", (value) => ({ ...value, jobs: { ...value.jobs, qualification: { ...value.jobs.qualification, strategy: undefined } } })],
    ["BUNDLE_MATRIX", (value) => patchMatrix(value, (rows) => rows, { "max-parallel": 3 })],
    ["BUNDLE_MATRIX", (value) => patchMatrix(value, (rows) => rows, { "fail-fast": true })],
    ["BUNDLE_MATRIX", (value) => patchMatrix(value, () => [])],
    ["BUNDLE_MATRIX", (value) => patchMatrix(value, (rows) => rows, {}, { exclude: [{ lane: "provider" }] })],
    ["BUNDLE_MATRIX", (value) => patchMatrix(value, (rows) => rows, {}, { lane: ["regression"] })],
    ["BUNDLE_LANE", (value) => patchRows(value, (row) => ({ ...row, lane: undefined }))],
    ["BUNDLE_LANE", (value) => patchRows(value, (row) => ({ ...row, lane: "heavy" }))],
    ["BUNDLE_ROWS_REPEATED", (value) => patchMatrix(value, (rows) => [...rows.slice(0, -1), rows[0]])],
    ["BUNDLE_ROWS_REPEATED", (value) => patchRows(value, (row) => row.lane === "provider" ? { ...row, lane: "regression" } : row)],
    ["BUNDLE_ROWS", (value) => patchMatrix(value, (rows) => rows.filter((row) => row.lane !== "aur"))],
    ["BUNDLE_ROWS", (value) => patchRows(value, (row) => row.lane === "musl" ? { ...row, cpu: "X86" } : row)],
    ["BUNDLE_ROWS", (value) => patchRows(value, (row) => row.lane === "provider" ? { ...row, platform: "darwin" } : row)],
    ["BUNDLE_ROWS", (value) => patchRows(value, (row) => row.host === "windows-11-arm" ? { ...row, host: "windows-latest" } : row)],
    ["BUNDLE_JOB_NAME", (value) => ({ ...value, jobs: { ...value.jobs, qualification: { ...value.jobs.qualification, name: "qualification (${{ matrix.package }}, ${{ matrix.host }})" } } })],
    ["BUNDLE_ARTIFACT_NAME", (value) => patchStep(value, undefined, (step) => step.uses === upload ? { ...step, with: { ...step.with, name: "distribution-${{ matrix.package }}-${{ matrix.host }}-${{ github.run_attempt }}" } } : step)],
    ["BUNDLE_FILES", (value) => patchRows(value, (row) => ({ ...row, files: undefined }))],
    ["BUNDLE_FILES", (value) => patchRows(value, (row) => ({ ...row, files: [] }))],
    ["BUNDLE_FILES_REPEATED", (value) => patchRows(value, (row) => ({ ...row, files: [...(row.files ?? []), ...(row.files?.slice(0, 1) ?? [])] }))],
    ["BUNDLE_FILES_OVERLAP", (value) => patchRows(value, (row) => row.lane === "regression" && row.package === "cli" && row.platform === "linux" ? { ...row, files: [...(row.files ?? []), "./test/distribution-aur.test.ts"] } : row)],
    ["BUNDLE_FILES_OVERLAP", (value) => patchRows(value, (row) => row.lane === "musl" ? { ...row, files: [...(row.files ?? []), "./test/packaged-skills-build.test.ts"] } : row)],
    ["BUNDLE_FILES_OVERLAP", (value) => patchRows(value, (row) => row.lane === "provider" ? { ...row, files: [...(row.files ?? []), "./test/build-runtime.test.ts"] } : row)],
    ["BUNDLE_EXACT_FILES", (value) => patchRows(value, (row) => row.lane === "provider" ? { ...row, files: [...(row.files ?? []), "./test/artifact-native-lane.test.ts"] } : row)],
    ["BUNDLE_EXACT_FILES", (value) => patchRows(value, (row) => row.package === "core" ? { ...row, files: row.files?.filter((file) => !file.endsWith("ripgrep-binary.test.ts")) } : row)],
    ["BUNDLE_NATIVE_PROOF", (value) => patchRows(value, (row) => ({ ...row, files: row.files?.filter((file) => !file.endsWith("distribution-native.test.ts")) }))],
    ["BUNDLE_HOMEBREW_PROOF", (value) => patchRows(value, (row) => ({ ...row, files: row.files?.filter((file) => !file.endsWith("distribution-homebrew.test.ts")) }))],
    ["BUNDLE_WINDOWS_PROOF", (value) => patchRows(value, (row) => ({ ...row, files: row.files?.filter((file) => !file.endsWith("distribution-windows.test.ts")) }))],
    ["BUNDLE_AUR_PROOF", (value) => patchRows(value, (row) => row.lane === "aur" ? { ...row, files: ["./test/artifact-native-lane.test.ts"] } : row)],
    ["BUNDLE_MUSL_PROOF", (value) => patchRows(value, (row) => row.lane === "musl" ? { ...row, files: ["./test/artifact-native-lane.test.ts"] } : row)],
    ["BUNDLE_PROVIDER_PROOF", (value) => patchRows(value, (row) => row.lane === "provider" ? { ...row, files: ["./test/artifact-native-lane.test.ts"] } : row)],
    ["BUNDLE_DENO", (value) => patchStep(value, "Install native Deno", () => undefined)],
    ["BUNDLE_DENO", (value) => patchStep(value, "Install native Deno", (step) => ({ ...step, if: "matrix.lane == 'regression' && matrix.package == 'cli'" }))],
    ["BUNDLE_NATIVE_JOB", (value) => patchStep(value, "Prove native Windows Job handle closure", () => undefined)],
    ["BUNDLE_NATIVE_POSIX", (value) => patchStep(value, "Prove native POSIX ABI", () => undefined)],
    ["BUNDLE_NATIVE_POSIX", (value) => patchStep(value, "Prove native POSIX ABI", (step) => ({ ...step, if: "matrix.platform == 'linux'" }))],
    ["BUNDLE_NATIVE_POSIX", (value) => patchStep(value, "Prove native POSIX ABI", (step) => ({ ...step, run: step.run?.replace("-t POSIX", "-t unobserved") }))],
    ["BUNDLE_NATIVE_POSIX", (value) => patchStep(value, "Prove native POSIX ABI", (step) => ({ ...step, run: step.run?.replace("export ORCHESTRA_ARTIFACT_DARWIN_SDK", "export UNOBSERVED_SDK") }))],
    ["BUNDLE_SOURCE_ABI", (value) => patchStep(value, "Prove source ABI producers", () => undefined)],
    ["BUNDLE_SOURCE_ABI", (value) => patchStep(value, "Prove source ABI producers", (step) => ({ ...step, if: "matrix.package == 'cli' && matrix.host == 'ubuntu-latest'" }))],
    ["BUNDLE_DESKTOP_ABI", (value) => patchStep(value, "Prove Desktop ABI consumer", () => undefined)],
    ["BUNDLE_SCHEMA_ELF", (value) => patchStep(value, "Prove Schema ELF ABI", () => undefined)],
    ["BUNDLE_PARSER_ABI", (value) => patchStep(value, "Prove packaged parser ABI", () => undefined)],
    ["BUNDLE_LOCALIZED_ORACLES", (value) => patchStep(value, "Prove localized proof oracles", () => undefined)],
    ["BUNDLE_LOCALIZED_ORACLES", (value) => patchStep(value, "Prove localized proof oracles", (step) => ({ ...step, if: "matrix.package == 'cli'" }))],
    ["BUNDLE_LOCALIZED_ORACLES", (value) => patchStep(value, "Prove localized proof oracles", (step) => ({ ...step, "working-directory": "packages/core" }))],
    ["BUNDLE_LOCALIZED_ORACLES", (value) => patchStep(value, "Prove localized proof oracles", (step) => ({ ...step, run: step.run?.replace("set -euo pipefail", "set -eu") }))],
    ["BUNDLE_LOCALIZED_ORACLES", (value) => patchStep(value, "Prove localized proof oracles", (step) => ({ ...step, run: step.run?.replace("localized-oracles.log", "wrong.log") }))],
    ["BUNDLE_LOCALIZED_ORACLES", (value) => patchStep(value, "Prove localized proof oracles", (step) => ({ ...step, run: step.run?.split("\n").map((line) => `# ${line}`).join("\n") }))],
    ["BUNDLE_LOCALIZED_ORACLES", (value) => patchStep(value, "Prove localized proof oracles", (step) => ({ ...step, run: `${step.run}\nexit 0` }))],
    ["BUNDLE_CONTROL", (value) => patchStep(value, "Require nonce-bound positive control", () => undefined)],
  ]
  localized.forEach((file) => mutations.push(["BUNDLE_LOCALIZED_ORACLES", (value) => patchStep(value, "Prove localized proof oracles", (step) => ({ ...step, run: step.run?.replace(file, "") }))]))
  mutations.forEach(([name, mutate]) => expect(() => inspect(mutate(Schema.decodeUnknownSync(Workflow)(source))), name).toThrow(name))
})

test("root discovery coverage rejects omissions in both directions and accepts row/file reordering", () => {
  expect(() => inspect(source, [])).toThrow("BUNDLE_DISTRIBUTION_DISCOVERY_EMPTY")
  expect(() => inspect(source, [...distribution, "./test/distribution-new.test.ts"])).toThrow("BUNDLE_UNREACHED: ./test/distribution-new.test.ts")
  expect(() => inspect(source, distribution.filter((file) => file !== "./test/distribution-aur.test.ts"))).toThrow("BUNDLE_UNDISCOVERED: ./test/distribution-aur.test.ts")
  inspect(patchMatrix(Schema.decodeUnknownSync(Workflow)(source), (rows) => rows.toReversed().map((row) => ({ ...row, files: row.files?.toReversed() }))))
})

function inspect(input: unknown, discovered = distribution) {
  const value = Schema.decodeUnknownSync(Workflow)(input)
  check(value.name === "distribution-bundle" && Object.keys(value.on).toSorted().join() === "push,workflow_dispatch", "BUNDLE_TRIGGERS")
  expect(value.on.push).toEqual({ branches: ["distribution-bundle"] })
  expect(value.permissions).toEqual({ contents: "read" })
  expect(Object.keys(value.jobs).toSorted()).toEqual(["qualification", "static"])
  check(value.defaults.run.shell === "bash" && value.env.CI === "true", "BUNDLE_SHELL_CI")
  const job = value.jobs.qualification
  check(job?.strategy?.matrix.include?.length && job.strategy["fail-fast"] === false && job.strategy["max-parallel"] === 13, "BUNDLE_MATRIX")
  check(Object.keys(job.strategy.matrix).join() === "include", "BUNDLE_MATRIX")
  const rows = job.strategy.matrix.include
  rows.forEach((row) => check(row.lane && ["regression", "aur", "musl", "provider"].includes(row.lane), `BUNDLE_LANE: ${row.package}/${row.host}`))
  check(new Set(rows.map((row) => `${row.lane}/${row.package}/${row.host}`)).size === rows.length, "BUNDLE_ROWS_REPEATED")
  check(JSON.stringify(rows.map((row) => [row.lane, row.package, row.host, row.cpu, row.platform]).toSorted()) === JSON.stringify([
    ["regression", "core", "ubuntu-latest", "X64", "linux"], ["regression", "core", "windows-latest", "X64", "win32"],
    ["regression", "cli", "ubuntu-latest", "X64", "linux"], ["regression", "cli", "windows-latest", "X64", "win32"],
    ["regression", "cli", "ubuntu-24.04-arm", "ARM64", "linux"], ["regression", "cli", "macos-14", "ARM64", "darwin"], ["regression", "cli", "macos-15-intel", "X64", "darwin"],
    ["regression", "cli", "windows-11-arm", "ARM64", "win32"],
    ["aur", "cli", "ubuntu-latest", "X64", "linux"], ["aur", "cli", "ubuntu-24.04-arm", "ARM64", "linux"],
    ["musl", "cli", "ubuntu-latest", "X64", "linux"], ["musl", "cli", "ubuntu-24.04-arm", "ARM64", "linux"],
    ["provider", "cli", "ubuntu-latest", "X64", "linux"],
  ].toSorted()), "BUNDLE_ROWS")
  check(job.name === "qualification (${{ matrix.lane }}, ${{ matrix.package }}, ${{ matrix.host }})", "BUNDLE_JOB_NAME")
  check(job["runs-on"] === "${{ matrix.host }}" && job.env?.ROW === "${{ toJSON(matrix) }}" && job.env.PACKAGE === "${{ matrix.package }}" && job.env.ORCHESTRA_OMNI_CONTROL === "suite", "BUNDLE_MATRIX_WIRING")
  check(job.env.ORCHESTRA_EXPERIMENTAL_DISABLE_FILEWATCHER === "${{ matrix.platform == 'win32' && 'true' || 'false' }}", "BUNDLE_JOB_ENV_CONTEXT")
  check(!JSON.stringify(value).includes("ORCHESTRA_EXPERIMENTAL_OMNI_SPAWNER"), "BUNDLE_SPAWNER_OVERRIDE")
  Object.values(value.jobs).forEach((lane) => { check(!lane.if && !lane["continue-on-error"] && lane["timeout-minutes"] > 0 && (!lane.defaults || lane.defaults.run.shell === "bash"), "BUNDLE_JOB_BYPASS"); lane.steps.forEach((step) => check(!step["continue-on-error"] && (!step.shell || step.shell === "bash"), "BUNDLE_STEP_BYPASS")) })
  const admission = requireStep(job.steps, "Assert native CPU and exact files", "BUNDLE_CPU")
  const control = requireStep(job.steps, "Require nonce-bound positive control", "BUNDLE_CONTROL")
  const run = requireStep(job.steps, "Run tests", "BUNDLE_RUN")
  const deno = requireStep(job.steps, "Install native Deno", "BUNDLE_DENO")
  const nativeJob = requireStep(job.steps, "Prove native Windows Job handle closure", "BUNDLE_NATIVE_JOB")
  const posix = requireStep(job.steps, "Prove native POSIX ABI", "BUNDLE_NATIVE_POSIX")
  const abi = requireStep(job.steps, "Prove source ABI producers", "BUNDLE_SOURCE_ABI")
  const denoExtract = requireStep(job.steps, "Extract native Deno", "BUNDLE_DENO")
  const desktop = requireStep(job.steps, "Prove Desktop ABI consumer", "BUNDLE_DESKTOP_ABI")
  const elf = requireStep(job.steps, "Prove Schema ELF ABI", "BUNDLE_SCHEMA_ELF")
  const parser = requireStep(job.steps, "Prove packaged parser ABI", "BUNDLE_PARSER_ABI")
  const oracles = requireStep(job.steps, "Prove localized proof oracles", "BUNDLE_LOCALIZED_ORACLES")
  check(abi.if === "matrix.lane == 'regression' && matrix.package == 'cli' && matrix.host == 'ubuntu-latest'" && abi["working-directory"] === "packages/script" && desktop.if === abi.if && desktop["working-directory"] === "packages/desktop" && job.steps.indexOf(abi) < job.steps.indexOf(desktop) && job.steps.indexOf(desktop) < job.steps.indexOf(run), "BUNDLE_SOURCE_ABI")
  check(elf.if === abi.if && elf["working-directory"] === "packages/schema" && job.steps.indexOf(elf) < job.steps.indexOf(run), "BUNDLE_SCHEMA_ELF")
  check(parser.if === abi.if && parser["working-directory"] === "packages/maestro-arsenal" && job.steps.indexOf(parser) < job.steps.indexOf(run), "BUNDLE_PARSER_ABI")
  check(oracles.if === `${abi.if} && matrix.cpu == 'X64'` && oracles["working-directory"] === "packages/cli" && job.steps.indexOf(parser) < job.steps.indexOf(oracles) && job.steps.indexOf(oracles) < job.steps.indexOf(run), "BUNDLE_LOCALIZED_ORACLES")
  check(oracles.run === `set -euo pipefail\nmkdir -p ../../distribution-logs\nGITHUB_ACTIONS=false ORCHESTRA_OMNI_CONTROL=declared bun test --timeout 30000 ${localized.join(" ")} 2>&1 | tee ../../distribution-logs/localized-oracles.log\n`, "BUNDLE_LOCALIZED_ORACLES")
  localized.forEach((file) => check(statSync(path.join(root, "packages/cli", file), { throwIfNoEntry: false })?.isFile() && !rows.some((row) => row.files?.includes(file)), `BUNDLE_LOCALIZED_ORACLE_MISSING_OR_REPEATED: ${file}`))
  check(job["timeout-minutes"] === 90, "BUNDLE_NATIVE_TIMEOUT")
  check(deno.if === "matrix.package == 'cli'" && denoExtract.if === deno.if && !deno["working-directory"] && !denoExtract["working-directory"] && job.steps.indexOf(admission) < job.steps.indexOf(deno) && job.steps.indexOf(deno) < job.steps.indexOf(denoExtract) && job.steps.indexOf(denoExtract) < job.steps.indexOf(run), "BUNDLE_DENO")
  check(nativeJob.if === "matrix.platform == 'win32'" && nativeJob["working-directory"] === "packages/omni" && job.steps.indexOf(nativeJob) < job.steps.indexOf(run), "BUNDLE_NATIVE_JOB")
  check(posix.if === "matrix.lane == 'regression' && matrix.package == 'cli' && matrix.platform != 'win32'" && posix["working-directory"] === "packages/cli" && job.steps.indexOf(posix) < job.steps.indexOf(run), "BUNDLE_NATIVE_POSIX")
  check(posix.run === 'set -euo pipefail\nmkdir -p ../../distribution-logs\nif [ "$RUNNER_OS" = macOS ]; then\n  sdk=$(xcrun --sdk macosx --show-sdk-path)\n  export ORCHESTRA_ARTIFACT_DARWIN_SDK="$sdk"\nfi\nGITHUB_ACTIONS=false ORCHESTRA_OMNI_CONTROL=declared bun test --timeout 120000 ./test/artifact-abi.test.ts -t POSIX 2>&1 | tee ../../distribution-logs/native-posix-abi.log\n', "BUNDLE_NATIVE_POSIX")
  check(!admission.if && !run.if && control.if === "always()" && run["working-directory"] === "packages/${{ matrix.package }}", "BUNDLE_EXECUTION")
  check(job.steps.indexOf(admission) < job.steps.indexOf(run) && job.steps.indexOf(run) < job.steps.indexOf(control), "BUNDLE_ORDER")
  check(discovered.length > 0, "BUNDLE_DISTRIBUTION_DISCOVERY_EMPTY")
  rows.forEach((row) => {
    const files = row.files
    check(files?.length, `BUNDLE_FILES: ${row.lane}/${row.package}/${row.host}`)
    check(new Set(files).size === files.length, `BUNDLE_FILES_REPEATED: ${row.lane}/${row.package}/${row.host}`)
    files.forEach((file) => {
      check(!rows.some((other) => other !== row && other.package === row.package && other.host === row.host && other.files?.includes(file)), `BUNDLE_FILES_OVERLAP: ${row.lane}/${row.package}/${row.host}/${file}`)
      check(file.startsWith("./test/") && file.endsWith(".test.ts") && !file.slice(2).split("/").some((part) => !part || part === "." || part === "..") && statSync(path.join(root, "packages", row.package, file), { throwIfNoEntry: false })?.isFile(), `BUNDLE_FILE_INVALID_OR_MISSING: ${file}`)
    })
    if (row.package === "cli") {
      check(files.includes("./test/distribution-native.test.ts") === (row.lane === "regression" && row.platform !== "win32"), `BUNDLE_NATIVE_PROOF: ${row.lane}/${row.host}`)
      check(files.includes("./test/distribution-homebrew.test.ts") === (row.lane === "regression" && row.platform === "darwin"), `BUNDLE_HOMEBREW_PROOF: ${row.lane}/${row.host}`)
      check(files.includes("./test/distribution-windows.test.ts") === (row.lane === "regression" && row.platform === "win32"), `BUNDLE_WINDOWS_PROOF: ${row.lane}/${row.host}`)
      check(files.includes("./test/distribution-aur.test.ts") === (row.lane === "aur"), `BUNDLE_AUR_PROOF: ${row.lane}/${row.host}`)
      check(files.includes("./test/distribution-musl.test.ts") === (row.lane === "musl"), `BUNDLE_MUSL_PROOF: ${row.lane}/${row.host}`)
      check(files.includes("./test/distribution-provider.test.ts") === (row.lane === "provider"), `BUNDLE_PROVIDER_PROOF: ${row.lane}/${row.host}`)
    }
  })
  discovered.forEach((file) => check(rows.some((row) => row.package === "cli" && row.files?.includes(file)), `BUNDLE_UNREACHED: ${file}`))
  const scheduled = [...new Set(rows.filter((row) => row.package === "cli").flatMap((row) => row.files ?? []))].filter((file) => /^\.\/test\/distribution-[^/]+\.test\.ts$/.test(file))
  scheduled.forEach((file) => check(discovered.includes(file), `BUNDLE_UNDISCOVERED: ${file}`))
  rows.forEach((row) => {
    const expected = row.package === "core" ? ["packaged-skills", "packaged-skills-corruption", "setup-bun-cache", "test-ci-request", "distribution-bundle-workflow", "distribution-bundle-execution", "distribution-bundle-boundaries", "distribution-bundle-deno", "effect/cross-spawn-spawner", "session-runner-model", "ripgrep-binary", "ripgrep-bundle"].map((name) => `./test/${name}.test.ts`)
      : row.lane !== "regression" ? [`./test/distribution-${row.lane}.test.ts`]
      : [...(row.host === "ubuntu-latest" ? discovered.filter((file) => !["homebrew", "windows", "aur", "musl", "provider"].some((name) => file === `./test/distribution-${name}.test.ts`))
        : (row.platform === "darwin" ? ["payload", "payload-integrity", "launcher", "native", "homebrew"] : row.platform === "win32" ? ["payload", "payload-integrity", "launcher", "windows"] : ["native", "payload-integrity", "install-preservation"]).map((name) => `./test/distribution-${name}.test.ts`)), ...(row.host === "ubuntu-latest" ? ["./test/build-runtime.test.ts"] : []), "./test/packaged-skills-build.test.ts", "./test/distribution-process.test.ts"]
    check(JSON.stringify(row.files?.toSorted()) === JSON.stringify([...new Set(expected)].toSorted()), `BUNDLE_EXACT_FILES: ${row.lane}/${row.package}/${row.host}`)
  })
  // Runtime conformance lives in distribution-bundle-execution.test.ts; unordered source lines cannot prove exit or IO behavior.
  expect(job.steps.filter((step) => step.uses).map((step) => step.uses)).toEqual([checkout, "./.github/actions/setup-bun", "./.github/actions/ripgrep", "./.github/actions/omni-binaries", upload])
  check(job.steps.find((step) => step.uses === upload)?.if === "always()" && job.steps.find((step) => step.uses === upload)?.with?.["if-no-files-found"] === "error" && job.steps.find((step) => step.uses === upload)?.with?.path === "distribution-logs", "BUNDLE_LOG_RETENTION")
  check(job.steps.find((step) => step.uses === upload)?.with?.name === "distribution-${{ matrix.lane }}-${{ matrix.package }}-${{ matrix.host }}-${{ github.run_attempt }}", "BUNDLE_ARTIFACT_NAME")
  const staticJob = value.jobs.static
  check(staticJob?.["timeout-minutes"] === 20, "BUNDLE_STATIC_TIMEOUT")
  check(staticJob?.steps[0]?.uses === checkout && staticJob.steps[1]?.uses === "./.github/actions/setup-bun", "BUNDLE_STATIC_SETUP")
  expect(staticJob.steps.filter((step) => step.run).map((step) => [step.run, step["working-directory"], step.env])).toEqual([
    ["git fetch --depth=1 origin dev:refs/remotes/origin/dev", undefined, undefined], ["bun typecheck", "packages/cli", undefined], ["bun typecheck", "packages/core", undefined], ["bun typecheck", "packages/script", undefined], ["bun typecheck", "packages/schema", undefined], ["bun typecheck", "packages/maestro-arsenal", undefined],
    ["bun run check:spawn-imports", undefined, undefined], ["bun run check:godfile", undefined, { GODFILE_BASE_REF: "origin/dev" }], ["git diff --check origin/dev HEAD", undefined, undefined],
  ])
}

function check(value: unknown, name: string): asserts value { if (!value) throw new Error(name) }
function requireStep(steps: readonly typeof Step.Type[], name: string, failure: string) {
  const matches = steps.filter((step) => step.name === name)
  check(matches.length === 1 && matches[0], failure)
  return matches[0]
}
function patchRows(value: typeof Workflow.Type, patch: (row: typeof Row.Type) => typeof Row.Type) {
  return { ...value, jobs: { ...value.jobs, qualification: { ...value.jobs.qualification, strategy: { ...value.jobs.qualification?.strategy, matrix: { include: value.jobs.qualification?.strategy?.matrix.include?.map(patch) } } } } }
}
function patchMatrix(value: typeof Workflow.Type, patch: (rows: readonly typeof Row.Type[]) => readonly typeof Row.Type[], strategy = {}, matrix = {}) {
  return { ...value, jobs: { ...value.jobs, qualification: { ...value.jobs.qualification, strategy: { ...value.jobs.qualification?.strategy, ...strategy, matrix: { ...matrix, include: patch(value.jobs.qualification?.strategy?.matrix.include ?? []) } } } } }
}
function patchStep(value: typeof Workflow.Type, name: string | undefined, patch: (step: typeof Step.Type) => typeof Step.Type | undefined) {
  return { ...value, jobs: { ...value.jobs, qualification: { ...value.jobs.qualification, steps: value.jobs.qualification?.steps.flatMap((step) => step.name === name ? [patch(step)].filter((step) => step !== undefined) : [step]) } } }
}
