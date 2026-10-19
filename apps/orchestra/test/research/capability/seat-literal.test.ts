import { expect, test } from "bun:test"
import path from "node:path"

// JE-AC-E2 (J1.2): the research seat id is spelled once, in ResearchSeatTools.SEAT. The directories below use it.
const root = path.join(import.meta.dir, "../../../../..")
const descriptor = "packages/core/src/research/seat-tools.ts"
const allowed = ["modules/maestro/coordination/src/seats/jimmy.ts", "modules/maestro/coordination/src/roster.ts", descriptor]
const globs = [
  "apps/orchestra/src/research/**/*.ts",
  "apps/orchestra/src/tool/research-*.ts",
  "apps/orchestra/src/tool/code-*.ts",
  "apps/orchestra/src/tool/probe-run.ts",
  "apps/orchestra/src/tool/inquiry.ts",
  "apps/orchestra/src/claude-code/host/**/*.ts",
  "modules/engine-adapters/claude-code/src/host/**/*.ts",
  descriptor,
]
const literal = /["'`]jimmy["'`]/

test("the seat id literal appears only in the descriptor, the seat and the roster", async () => {
  const files = (await Promise.all(globs.map((pattern) => Array.fromAsync(new Bun.Glob(pattern).scan({ cwd: root })))))
    .flat()
    .map((file) => file.replaceAll("\\", "/"))
  // A scan that finds nothing would pass vacuously.
  expect(files.length).toBeGreaterThan(20)
  expect(files).toContain(descriptor)

  const offenders = (
    await Promise.all(
      files
        .filter((file) => !allowed.includes(file))
        .map(async (file) => ((await Bun.file(path.join(root, file)).text()).split("\n").flatMap((line, index) =>
          literal.test(line) ? [`${file}:${index + 1}`] : [],
        ))),
    )
  ).flat()
  expect(offenders).toEqual([])
})
