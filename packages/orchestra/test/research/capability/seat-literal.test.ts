import { expect, test } from "bun:test"
import path from "node:path"

// JE-AC-E2 (J1.2): the research seat id is spelled once, in ResearchSeatTools.SEAT. The directories below use it.
const root = path.join(import.meta.dir, "../../../src")
const allowed = ["maestro/seats/jimmy.ts", "maestro/roster.ts", "research/seat-tools.ts"]
const globs = [
  "research/**/*.ts",
  "tool/research-*.ts",
  "tool/code-*.ts",
  "tool/probe-run.ts",
  "tool/inquiry.ts",
  "claude-code/host/**/*.ts",
]
const literal = /["'`]jimmy["'`]/

test("the seat id literal appears only in the descriptor, the seat and the roster", async () => {
  const files = (await Promise.all(globs.map((pattern) => Array.fromAsync(new Bun.Glob(pattern).scan({ cwd: root })))))
    .flat()
    .map((file) => file.replaceAll("\\", "/"))
  // A scan that finds nothing would pass vacuously.
  expect(files.length).toBeGreaterThan(20)
  expect(files).toContain("research/seat-tools.ts")

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
