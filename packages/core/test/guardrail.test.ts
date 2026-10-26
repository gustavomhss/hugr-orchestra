import { describe, expect } from "bun:test"
import fs from "fs/promises"
import path from "path"
import { Effect } from "effect"
import { Guardrail } from "@orchestra/core/guardrail"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { AppProcess } from "@orchestra/core/process"
import { tmpdir } from "./fixture/tmpdir"
import { testEffect } from "./lib/effect"

const it = testEffect(LayerNode.compile(AppProcess.node))

const rule = {
  id: "js-debugger",
  group: "leftovers",
  severity: "gate",
  kind: "added-lines",
  message: "Remove the debugger statement",
  summary: null,
  positive: ["debugger"],
  negative: ["debugging"],
  paths: ["**/*.ts"],
  clearedBy: "ignore",
}
const report = {
  base: "abc123",
  bootstrap: false,
  rules: 1,
  files: 2,
  findings: [
    {
      rule: "js-debugger",
      severity: "gate",
      path: "src/a.ts",
      line: 3,
      message: "Remove the debugger statement",
      excerpt: "debugger",
      match: [0, 8],
    },
  ],
  errors: [],
  approved: [],
  touchesGuards: false,
}

// A stand-in for script/guards/run.ts: it echoes canned JSON and records its argv, which is all the service reads.
function engine(stdout: string) {
  return `await Bun.write(import.meta.dir + "/argv.json", JSON.stringify(process.argv.slice(2)))
console.log(${JSON.stringify(stdout)})
process.exit(1)
`
}

function withRepository<A, E, R>(
  script: string | undefined,
  body: (directory: string) => Effect.Effect<A, E, R>,
) {
  return Effect.acquireUseRelease(
    Effect.promise(async () => {
      const tmp = await tmpdir()
      if (script !== undefined) {
        await fs.mkdir(path.join(tmp.path, "script", "guards"), { recursive: true })
        await Bun.write(path.join(tmp.path, "script", "guards", "run.ts"), script)
      }
      return tmp
    }),
    (tmp) => body(tmp.path),
    (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()),
  )
}

const argv = (directory: string) => Bun.file(path.join(directory, "script", "guards", "argv.json")).json()

describe("Guardrail", () => {
  it.live("lists the rules the engine prints, even when it exits non-zero", () =>
    withRepository(engine(JSON.stringify({ rules: [rule], errors: [] })), (directory) =>
      Effect.gen(function* () {
        const listed = yield* (yield* Guardrail.make({ directory })).rules()
        expect(listed.rules.map((item) => item.id)).toEqual(["js-debugger"])
        expect(listed.rules[0]?.summary).toBeNull()
        expect(yield* Effect.promise(() => argv(directory))).toEqual(["--cwd", directory, "--rules"])
      }),
    ),
  )

  it.live("runs the engine as JSON and passes the base behind --base", () =>
    withRepository(engine(JSON.stringify(report)), (directory) =>
      Effect.gen(function* () {
        const service = yield* Guardrail.make({ directory })
        const result = yield* service.run({ base: "origin/dev" })
        expect(result.findings[0]?.match).toEqual([0, 8])
        expect(result.touchesGuards).toBe(false)
        expect(yield* Effect.promise(() => argv(directory))).toEqual([
          "--cwd",
          directory,
          "--json",
          "--base",
          "origin/dev",
        ])
        yield* service.run({})
        expect(yield* Effect.promise(() => argv(directory))).toEqual(["--cwd", directory, "--json"])
      }),
    ),
  )

  it.live("says so when the repository has no engine", () =>
    withRepository(undefined, (directory) =>
      Effect.gen(function* () {
        const error = yield* (yield* Guardrail.make({ directory })).run({}).pipe(Effect.flip)
        expect(error.kind).toBe("no-engine")
      }),
    ),
  )

  it.live("does not trust output that is not a report", () =>
    withRepository(engine("not json"), (directory) =>
      Effect.gen(function* () {
        const error = yield* (yield* Guardrail.make({ directory })).run({}).pipe(Effect.flip)
        expect(error.kind).toBe("unreadable")
      }),
    ),
  )

  it.live("starts the engine without the server's secrets", () =>
    withRepository(
      `await Bun.write(import.meta.dir + "/env.json", JSON.stringify(process.env))
console.log(${JSON.stringify(JSON.stringify(report))})
process.exit(1)
`,
      (directory) =>
        Effect.gen(function* () {
          const service = yield* Guardrail.make({
            directory,
            env: { ...process.env, ANTHROPIC_API_KEY: "sk-secret", GITHUB_TOKEN: "ghp-secret", GUARDRAIL_BASE_REF: "origin/dev" },
          })
          yield* service.run({})
          const seen = yield* Effect.promise(() => Bun.file(path.join(directory, "script", "guards", "env.json")).json())
          expect(seen.PATH).toBe(process.env.PATH)
          expect(seen.GUARDRAIL_BASE_REF).toBe("origin/dev")
          expect(seen.ANTHROPIC_API_KEY).toBeUndefined()
          expect(seen.GITHUB_TOKEN).toBeUndefined()
        }),
    ),
  )
})
