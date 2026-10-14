import { YAML } from "bun"
import { describe, expect, test } from "bun:test"
import path from "node:path"
import { Effect, Option, Schema } from "effect"
import { ChildProcess } from "effect/unstable/process"
import { LayerNode } from "../src/effect/layer-node"
import { AppProcess } from "../src/process"
import { expectSpawn } from "./fixture/omni-expect"
import { tmpdir } from "./fixture/tmpdir"
import { testEffect } from "./lib/effect"

const it = testEffect(LayerNode.compile(AppProcess.node))
const Step = Schema.Struct({
  name: Schema.optional(Schema.String),
  id: Schema.optional(Schema.String),
  shell: Schema.optional(Schema.String),
  run: Schema.optional(Schema.String),
  uses: Schema.optional(Schema.String),
  with: Schema.optional(Schema.Record(Schema.String, Schema.String)),
})
const Action = Schema.Struct({
  runs: Schema.Struct({ using: Schema.Literal("composite"), steps: Schema.Array(Step) }),
})
// Fixed hash isolates architecture semantics. GitHub owns hashFiles; this test does not implement it.
const hash = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
const runners = ["Linux", "macOS", "Windows"].flatMap((os) => ["X64", "ARM64"].map((arch) => ({ os, arch })))

describe("setup-bun cache architecture repair", () => {
  it.live("real YAML Bash outputs isolate architectures and restore/save share those outputs", () =>
    Effect.gen(function* () {
      expectSpawn(import.meta.path)
      const steps = yield* Effect.promise(loadSteps)
      const keys = requireStep(steps, "id", "keys")
      expect(keys.shell).toBe("bash")
      const bunRestore = requireStep(steps, "id", "bun-cache")
      const modulesRestore = requireStep(steps, "id", "modules-cache")
      const bunSave = requireStep(steps, "name", "Save Bun dependencies")
      const modulesSave = requireStep(steps, "name", "Save node_modules")
      ;[bunRestore, modulesRestore].forEach((step) => {
        expect(text(step.uses, "CACHE_RESTORE_USES_MISSING")).toStartWith("actions/cache/restore@")
        expect(steps.indexOf(keys)).toBeLessThan(steps.indexOf(step))
      })
      ;[bunSave, modulesSave].forEach((step) =>
        expect(text(step.uses, "CACHE_SAVE_USES_MISSING")).toStartWith("actions/cache/save@"),
      )
      expect(bunRestore.with?.key).toBe("${{ steps.keys.outputs.bun }}")
      expect(bunSave.with?.key).toBe(bunRestore.with?.key)
      expect(modulesRestore.with?.key).toBe("${{ steps.keys.outputs.modules }}")
      expect(modulesSave.with?.key).toBe(modulesRestore.with?.key)
      expect(modulesRestore.with?.["restore-keys"]).toBeUndefined()
      expect(modulesSave.with?.path).toBe(modulesRestore.with?.path)
      const paths = text(modulesRestore.with?.path, "CACHE_MODULE_PATHS_MISSING").trim().split(/\r?\n/)
      ;["packages/*/node_modules", "packages/*/*/node_modules", "modules/*/node_modules", "modules/*/*/node_modules"]
        .forEach((pattern) => expect(paths).toContain(pattern))

      const rows = yield* Effect.all(
        runners.map((runner) => runEmitter(text(keys.run, "CACHE_KEY_SCRIPT_MISSING"), runner)),
        { concurrency: 1 },
      )
      expect(architectureCollisions(rows)).toEqual([])
      rows.forEach((row) => {
        expect(row.outputs).toEqual({
          bun: `${row.os}-${row.arch}-bun-v3-${hash}`,
          modules: `${row.os}-${row.arch}-modules-v2-${hash}`,
        })
        const prefixes = expand(text(bunRestore.with?.["restore-keys"], "BUN_RESTORE_PREFIX_MISSING"), row)
          .trim()
          .split(/\r?\n/)
          .map((line) => line.trim())
        expect(prefixes).toEqual([`${row.os}-${row.arch}-bun-v3-`])
        prefixes.forEach((prefix) => {
          expect(row.outputs.bun.startsWith(prefix)).toBe(true)
          rows
            .filter((other) => other.arch !== row.arch)
            .forEach((other) => {
              expect(other.outputs.bun.startsWith(prefix)).toBe(false)
            })
        })
      })
    }),
  )

  it.live("same collision oracle rejects the old OS-only Bash emitter", () =>
    Effect.gen(function* () {
      expectSpawn(import.meta.path)
      // Original emitter is the regression control, executed by the same Bash path as the parsed action.
      const legacy = `echo "bun=\${{ runner.os }}-bun-v2-\${{ hashFiles('bun.lock') }}" >> "$GITHUB_OUTPUT"
echo "modules=\${{ runner.os }}-modules-v1-\${{ hashFiles('bun.lock', 'patches/**', 'package.json') }}" >> "$GITHUB_OUTPUT"`
      const rows = yield* Effect.all(runners.map((runner) => runEmitter(legacy, runner)), { concurrency: 1 })
      expect(architectureCollisions(rows)).toEqual([
        "CACHE_ARCH_COLLISION bun: Linux/X64 and Linux/ARM64",
        "CACHE_ARCH_COLLISION modules: Linux/X64 and Linux/ARM64",
        "CACHE_ARCH_COLLISION bun: macOS/X64 and macOS/ARM64",
        "CACHE_ARCH_COLLISION modules: macOS/X64 and macOS/ARM64",
        "CACHE_ARCH_COLLISION bun: Windows/X64 and Windows/ARM64",
        "CACHE_ARCH_COLLISION modules: Windows/X64 and Windows/ARM64",
      ])
    }),
  )

  test("extraction and controlled expressions fail closed with named failures", () => {
    const runner = { os: "Linux", arch: "ARM64" }
    expect(() => requireStep([], "id", "keys")).toThrow("CACHE_STEP_MISSING_OR_DUPLICATE: id=keys")
    expect(() => requireStep([{ id: "keys" }, { id: "keys" }], "id", "keys")).toThrow(
      "CACHE_STEP_MISSING_OR_DUPLICATE: id=keys",
    )
    expect(() => expand("${{ runner.temp }}", runner)).toThrow("CACHE_EXPRESSION_UNSUPPORTED: runner.temp")
    expect(() => expand("${{ hashFiles('unknown') }}", runner)).toThrow(
      "CACHE_EXPRESSION_UNSUPPORTED: hashFiles('unknown')",
    )
    expect(() => expand("${{ runner.arch }", runner)).toThrow("CACHE_EXPRESSION_UNEXPANDED")
    expect(() => expand("${{ }}", runner)).toThrow("CACHE_EXPRESSION_UNSUPPORTED")
    expect(() => parseOutputs("")).toThrow("CACHE_GITHUB_OUTPUT_EMPTY")
    expect(() => parseOutputs("bun=ok\n")).toThrow("CACHE_OUTPUT_MISSING_OR_EMPTY: modules")
    expect(() => parseOutputs("bun=\nmodules=ok\n")).toThrow("CACHE_OUTPUT_MISSING_OR_EMPTY: bun")
    expect(() => parseOutputs("bun=ok\nbun=again\nmodules=ok\n")).toThrow("CACHE_OUTPUT_DUPLICATE: bun")
    expect(() => parseOutputs("not-an-output\n")).toThrow("CACHE_OUTPUT_INVALID_LINE")
    expect(() => parseOutputs("bun=ok\nmodules=ok\nextra=ok\n")).toThrow("CACHE_OUTPUT_NAMES_INVALID")
    expect(() => architectureCollisions([])).toThrow("CACHE_RUNNER_MATRIX_INCOMPLETE")
    expect(parseOutputs("bun=ok\nmodules=ok\n")).toEqual({ bun: "ok", modules: "ok" })
    expect(expand("${{ runner.os }}-${{ runner.arch }}-${{ hashFiles('bun.lock') }}", runner)).toBe(`Linux-ARM64-${hash}`)
  })
})

async function loadSteps() {
  const file = Bun.file(new URL("../../../.github/actions/setup-bun/action.yml", import.meta.url))
  if (!(await file.exists())) throw new Error("SETUP_BUN_ACTION_MISSING")
  const action = Schema.decodeUnknownOption(Action)(YAML.parse(await file.text()))
  if (Option.isNone(action)) throw new Error("SETUP_BUN_ACTION_SCHEMA_INVALID")
  if (action.value.runs.steps.length === 0) throw new Error("SETUP_BUN_ACTION_STEPS_EMPTY")
  return action.value.runs.steps
}

function requireStep(steps: ReadonlyArray<typeof Step.Type>, field: "id" | "name", value: string) {
  const matches = steps.filter((step) => step[field] === value)
  const step = matches[0]
  if (matches.length !== 1 || !step) throw new Error(`CACHE_STEP_MISSING_OR_DUPLICATE: ${field}=${value}`)
  return step
}

function text(value: string | undefined, failure: string) {
  if (!value?.trim()) throw new Error(failure)
  return value
}

function expand(source: string, runner: { os: string; arch: string }) {
  const result = source.replace(/\$\{\{([\s\S]*?)\}\}/g, (_, expression: string) => {
    switch (expression.trim()) {
      case "runner.os":
        return runner.os
      case "runner.arch":
        return runner.arch
      case "hashFiles('bun.lock')":
      case "hashFiles('bun.lock', 'patches/**', 'package.json')":
        return hash
      default:
        throw new Error(`CACHE_EXPRESSION_UNSUPPORTED: ${expression.trim()}`)
    }
  })
  if (result.includes("${{") || result.includes("}}")) throw new Error("CACHE_EXPRESSION_UNEXPANDED")
  return result
}

function runEmitter(script: string, runner: { os: string; arch: string }) {
  return Effect.gen(function* () {
    const app = yield* AppProcess.Service
    const directory = yield* Effect.acquireRelease(
      Effect.promise(tmpdir),
      (directory) => Effect.promise(() => directory[Symbol.asyncDispose]()),
    )
    const output = path.join(directory.path, "github-output")
    // Git Bash on hosted Windows, not the WSL launcher. Forward slashes make GITHUB_OUTPUT usable by Git Bash.
    const bash =
      process.platform === "win32"
        ? path.join(process.env.ProgramFiles ?? "C:\\Program Files", "Git", "bin", "bash.exe")
        : text(Bun.which("bash") ?? undefined, "CACHE_BASH_MISSING")
    const result = yield* app
      .run(
        ChildProcess.make(bash, ["--noprofile", "--norc", "-e", "-o", "pipefail", "-c", expand(script, runner)], {
          cwd: directory.path,
          env: {
            ...process.env,
            GITHUB_OUTPUT: output.replaceAll("\\", "/"),
            RUNNER_OS: runner.os,
            RUNNER_ARCH: runner.arch,
          },
        }),
      )
      .pipe(Effect.flatMap(AppProcess.requireSuccess))
    expect(result.stdoutTruncated).toBe(false)
    expect(result.stderrTruncated).toBe(false)
    const outputs = yield* Effect.promise(async () => {
      if (!(await Bun.file(output).exists())) throw new Error("CACHE_GITHUB_OUTPUT_MISSING")
      return parseOutputs(await Bun.file(output).text())
    })
    return { ...runner, outputs }
  })
}

function parseOutputs(source: string) {
  if (!source.trim()) throw new Error("CACHE_GITHUB_OUTPUT_EMPTY")
  const outputs = new Map<string, string>()
  source.trimEnd().split(/\r?\n/).forEach((line) => {
    const separator = line.indexOf("=")
    if (separator <= 0) throw new Error(`CACHE_OUTPUT_INVALID_LINE: ${line}`)
    const name = line.slice(0, separator)
    if (outputs.has(name)) throw new Error(`CACHE_OUTPUT_DUPLICATE: ${name}`)
    outputs.set(name, line.slice(separator + 1))
  })
  const bun = text(outputs.get("bun"), "CACHE_OUTPUT_MISSING_OR_EMPTY: bun")
  const modules = text(outputs.get("modules"), "CACHE_OUTPUT_MISSING_OR_EMPTY: modules")
  if (outputs.size !== 2) throw new Error("CACHE_OUTPUT_NAMES_INVALID")
  return { bun, modules }
}

function architectureCollisions(
  rows: ReadonlyArray<{ os: string; arch: string; outputs: { bun: string; modules: string } }>,
) {
  if (
    rows.length !== runners.length ||
    runners.some((runner) => rows.filter((row) => row.os === runner.os && row.arch === runner.arch).length !== 1)
  )
    throw new Error("CACHE_RUNNER_MATRIX_INCOMPLETE")
  return rows.flatMap((row, index) =>
    rows.slice(0, index).flatMap((other) =>
      (["bun", "modules"] as const).flatMap((name) =>
        row.outputs[name] === other.outputs[name]
          ? [`CACHE_ARCH_COLLISION ${name}: ${other.os}/${other.arch} and ${row.os}/${row.arch}`]
          : [],
      ),
    ),
  )
}
