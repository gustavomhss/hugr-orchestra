import { expect, test } from "bun:test"
import { existsSync, readFileSync } from "node:fs"
import path from "node:path"
import { Glob } from "bun"

// WP18 gate: Relay's arm is the one completion evaluator (port plan §6). Maestro Arsenal's own evaluator and its
// runner are gone from source, tests and docs, and nothing may bring them back under the same names.
const repository = path.resolve(import.meta.dir, "../../../..")
const removed = /\b(?:evaluateCompletion|runCompletion)\b/
const scope = [
  "packages/opencode/src",
  "packages/opencode/test",
  "packages/opencode/playbooks",
  "packages/maestro-arsenal/src",
  "packages/maestro-arsenal/test",
  "packages/core/src",
  "packages/relay/src",
  "specs/hugr-maestro",
]

test("no source, test or doc names the removed Arsenal evaluator", () => {
  const files = scope.flatMap((directory) =>
    [...new Glob("**/*.{ts,tsx,md,txt}").scanSync({ cwd: path.join(repository, directory) })].map((file) =>
      path.join(repository, directory, file),
    ),
  )
  // The scan reaches the files that held the evaluator and its callers, so an empty result is not an empty scan.
  for (const known of [
    "packages/opencode/src/maestro/arsenal-completion.ts",
    "packages/opencode/src/maestro/arsenal-bindings.ts",
    "packages/maestro-arsenal/src/index.ts",
    "packages/maestro-arsenal/src/governance/completion.ts",
    "packages/maestro-arsenal/src/tools/relay-arm.ts",
    "packages/maestro-arsenal/src/governance/HOST-BINDINGS.md",
    "specs/hugr-maestro/arsenal-port.md",
  ])
    expect(files).toContain(path.join(repository, known))
  expect(files.length).toBeGreaterThan(500)
  // The pattern matches both names as code spells them, and not a longer identifier.
  expect(["export function evaluateCompletion(", "runCompletion(context)", "verifiedCompletion("].map((text) => removed.test(text)))
    .toEqual([true, true, false])
  const self = path.join(import.meta.dir, "arsenal-one-evaluator.test.ts")
  expect(files.filter((file) => file !== self && removed.test(readFileSync(file, "utf8")))).toEqual([])
  expect(existsSync(path.join(repository, "packages/maestro-arsenal/src/governance/completion-evaluation.ts"))).toBe(false)
})
