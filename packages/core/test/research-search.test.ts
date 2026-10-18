import { describe, expect, test } from "bun:test"
import fs from "fs/promises"
import path from "path"
import { Effect } from "effect"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { AppProcess } from "@orchestra/core/process"
import { RipgrepBinary } from "@orchestra/core/ripgrep/binary"
import { CodeSearch } from "@orchestra/core/research-toolkit/search"
import { tmpdir } from "./fixture/tmpdir"
import { testEffect } from "./lib/effect"

const it = testEffect(LayerNode.compile(LayerNode.group([AppProcess.node, RipgrepBinary.node])))

const files = (root: string, tree: Record<string, string>) =>
  Effect.promise(async () => {
    for (const [name, text] of Object.entries(tree)) {
      await fs.mkdir(path.dirname(path.join(root, name)), { recursive: true })
      await Bun.write(path.join(root, name), text)
    }
  })

const withTree = <A, E, R>(tree: Record<string, string>, use: (root: string) => Effect.Effect<A, E, R>) =>
  Effect.acquireUseRelease(
    Effect.promise(() => tmpdir()),
    (tmp) => files(tmp.path, tree).pipe(Effect.andThen(use(tmp.path))),
    (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()),
  )

describe("CodeSearch", () => {
  it.live("reads a pattern that starts with a dash as a pattern, literally", () =>
    withTree({ "a.ts": "const flag = '--force'\nother\n" }, (cwd) =>
      Effect.gen(function* () {
        const result = yield* CodeSearch.run({ pattern: "--force" }, { cwd })
        expect(result.matches.map((m) => `${m.path}:${m.line}`)).toEqual(["a.ts:1"])
        expect(result.basis.coverage.complete).toBe(true)
      }),
    ),
  )

  it.live("identifier mode bounds the match; literal does not", () =>
    withTree({ "a.ts": "parse(x)\nparseJson(x)\nreparse\n" }, (cwd) =>
      Effect.gen(function* () {
        const id = yield* CodeSearch.run({ pattern: "parse", mode: "identifier" }, { cwd })
        expect(id.matches.map((m) => m.line)).toEqual([1])
        const lit = yield* CodeSearch.run({ pattern: "parse" }, { cwd })
        expect(lit.matches.map((m) => m.line)).toEqual([1, 2, 3])
      }),
    ),
  )

  it.live("respects .gitignore without a git repository and declares it", () =>
    withTree({ ".gitignore": "gen/\n", "gen/x.ts": "needle\n", "src/y.ts": "needle\n" }, (cwd) =>
      Effect.gen(function* () {
        const result = yield* CodeSearch.run({ pattern: "needle" }, { cwd })
        expect(result.matches.map((m) => m.path)).toEqual(["src/y.ts"])
        expect(result.basis.coverage.ignoreRespected).toBe(true)
        expect(result.basis.coverage.documents).toBeGreaterThan(0)
      }),
    ),
  )

  it.live("narrows by paths globs and ignores case only when asked", () =>
    withTree({ "src/a.ts": "Needle\n", "test/b.ts": "Needle\n" }, (cwd) =>
      Effect.gen(function* () {
        const scoped = yield* CodeSearch.run({ pattern: "Needle", paths: ["src/**"] }, { cwd })
        expect(scoped.matches.map((m) => m.path)).toEqual(["src/a.ts"])
        expect((yield* CodeSearch.run({ pattern: "needle" }, { cwd })).matches).toEqual([])
        const loose = yield* CodeSearch.run({ pattern: "needle", caseSensitive: false }, { cwd })
        expect(loose.matches).toHaveLength(2)
      }),
    ),
  )

  it.live("pages deterministically and marks a cut page incomplete", () =>
    withTree(Object.fromEntries([1, 2, 3, 4, 5].map((n) => [`f${n}.ts`, "hit\nhit\n"])), (cwd) =>
      Effect.gen(function* () {
        const first = yield* CodeSearch.run({ pattern: "hit", limit: 4 }, { cwd })
        expect(first.matches).toHaveLength(4)
        expect(first.next).toBe(4)
        expect(first.basis.bounds.truncated).toBe(true)
        expect(first.basis.coverage.complete).toBe(false)
        const second = yield* CodeSearch.run({ pattern: "hit", limit: 4, offset: first.next }, { cwd })
        expect(second.matches.map((m) => `${m.path}:${m.line}`)).toEqual(["f3.ts:1", "f3.ts:2", "f4.ts:1", "f4.ts:2"])
        const last = yield* CodeSearch.run({ pattern: "hit", limit: 4, offset: 8 }, { cwd })
        expect(last.matches).toHaveLength(2)
        expect(last.next).toBeUndefined()
        expect(last.basis.coverage.complete).toBe(true)
      }),
    ),
  )

  it.live("attaches context lines to the hit they surround", () =>
    withTree({ "a.ts": "one\ntwo\nhit\nfour\nfive\n" }, (cwd) =>
      Effect.gen(function* () {
        const [match] = (yield* CodeSearch.run({ pattern: "hit", context: 2 }, { cwd })).matches
        expect(match?.before).toEqual(["one", "two"])
        expect(match?.after).toEqual(["four", "five"])
      }),
    ),
  )

  it.live("a clean zero is complete; an invalid regex fails by name", () =>
    withTree({ "a.ts": "x\n" }, (cwd) =>
      Effect.gen(function* () {
        const zero = yield* CodeSearch.run({ pattern: "absent" }, { cwd })
        expect(zero.matches).toEqual([])
        expect(zero.basis.coverage.complete).toBe(true)
        const bad = yield* CodeSearch.run({ pattern: "(", mode: "regex" }, { cwd }).pipe(Effect.flip)
        expect(bad.reason).toBe("pattern_invalid")
      }),
    ),
  )

  it.live("counts binaries it skipped and truncates long lines", () =>
    withTree({ "bin.dat": "needle\u0000\u0001", "long.ts": `needle ${"x".repeat(2000)}\n` }, (cwd) =>
      Effect.gen(function* () {
        const result = yield* CodeSearch.run({ pattern: "needle" }, { cwd })
        expect(result.matches.map((m) => m.path)).toEqual(["long.ts"])
        expect(result.matches[0]?.text.length).toBeLessThanOrEqual(303)
        expect(result.basis.coverage.binariesSkipped).toBe(1)
      }),
    ),
  )

  test("builds the argv from the host: -e carries the pattern, globs come only from paths", () => {
    const args = CodeSearch.argv({ pattern: "--glob=x", paths: ["src/**"] })
    expect(args.slice(args.indexOf("-e"))).toEqual(["-e", "--glob=x", "--", "."])
    expect(args.filter((arg) => arg.startsWith("--glob="))).toEqual(["--glob=!**/.git/**", "--glob=src/**"])
  })
})
