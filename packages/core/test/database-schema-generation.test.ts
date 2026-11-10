import { expect, test } from "bun:test"
import { $ } from "bun"
import path from "node:path"
import { rm } from "node:fs/promises"

// Pin committed bytes before exercising the real generator in CI and both helper drift controls.
test("schema generation reproduces both modules and rejects a changed or missing board helper", async () => {
  const script = path.resolve(import.meta.dir, "../script/migration.ts")
  const schema = path.resolve(import.meta.dir, "../src/database/schema.gen.ts")
  const helper = path.resolve(import.meta.dir, "../src/database/schema-board.gen.ts")
  const original = await Bun.file(schema).text()
  if (!(await Bun.file(helper).exists())) throw new Error("Committed board project database schema helper is missing")
  const previous = await Bun.file(helper).text()
  const run = (check: boolean) => $`bun ${script} ${check ? ["--check"] : []}`.quiet().nothrow()
  try {
    const committed = await run(true)
    if (committed.exitCode !== 0) {
      console.error("Committed database schema byte diagnostics:", JSON.stringify({
        main: { first120: original.slice(0, 120), crlf: original.includes("\r\n") },
        helper: { first120: previous.slice(0, 120), crlf: previous.includes("\r\n") },
      }))
    }
    expect(committed.exitCode, `Committed database schema drift check failed: ${committed.stderr.toString()}`).toBe(0)
    const generated = await run(false)
    expect(generated.exitCode, generated.stderr.toString()).toBe(0)
    const main = await Bun.file(schema).text()
    const board = await Bun.file(helper).text()
    expect(main, "Regeneration changed committed main database schema bytes").toBe(original)
    expect(board, "Regeneration changed committed board project database schema bytes").toBe(previous)
    expect(main).toContain("yield* boardProject.up(tx)")
    expect(board).toContain("review_tier")
    expect(board).toContain("review_accepted_unavailable")
    expect((await run(true)).exitCode).toBe(0)

    await Bun.write(helper, board.replace("review_tier", "unrelated_tier"))
    const corrupt = await run(true)
    expect(corrupt.exitCode).not.toBe(0)
    expect(corrupt.stderr.toString()).toContain("Board project database schema is missing or stale")

    await rm(helper)
    const missing = await run(true)
    expect(missing.exitCode).not.toBe(0)
    expect(missing.stderr.toString()).toContain("Board project database schema is missing or stale")
    await Bun.write(helper, board)
  } finally {
    await Bun.write(schema, original)
    await Bun.write(helper, previous)
  }
}, 120_000)
