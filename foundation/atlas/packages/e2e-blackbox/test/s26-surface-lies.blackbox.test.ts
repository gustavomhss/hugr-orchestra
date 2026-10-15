// @atlas/e2e-blackbox — test/s26-surface-lies.blackbox.test.ts  (S26 — the published surface tells the truth)
//
// NARRATIVE: an agent reads the published `atlas-*` schemas over real MCP stdio and takes them literally,
// while an operator drives the same governed core through the real `atlas` CLI subprocess. Everything the
// surface DECLARES must work, and everything that WORKS must be declared. Three measured lies motivated this
// story, and each is pinned here in BOTH directions:
//
//   1. `acceptReground` — the schema declared it TOP-LEVEL; the wired leg read `args.options.acceptReground`
//      (adapter-io/src/wire.ts). Measured before the fix: `{mergeBase,acceptReground:true}` (the DECLARED
//      spelling) returned `regroundedCount: 0` and `{mergeBase,options:{acceptReground:true}}` (an
//      UNDECLARED spelling) returned `regroundedCount: 1`. The knob a reader of the schema would reach for
//      did nothing, and the one that worked was invisible. Both halves are a lie and both are pinned.
//   2. `additionalProperties:false` — declared by every governance schema and enforced by none. Measured:
//      `{scope:'src',bogusKey:1}` was accepted and routed.
//   3. `atlas init <path>` — the rendered territory block ignored the path. Measured back-to-back in ONE
//      repo state: `init .`, `init src` and `init README.md` printed an IDENTICAL block, and `init
//      no/such/path` reported a full successful move-in of a path that does not exist.
//
// These could only be caught from OUTSIDE: a unit test against `createHandler` sees the schema and the leg
// as one object and never crosses the wire that separates them. So every assertion below drives the real
// `atlas-mcp` stdio server or the real `atlas` binary.

import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { execFileSync } from "node:child_process"
import { makeFixtureRepo, mcpSession, runAtlas } from "../src/harness.js"
import type { FixtureRepo } from "../src/harness.js"
import { draftFact } from "./support.js"
import type { GroundedFact } from "@atlas/knowledge"
import { ACTOR, RATIFIER, emitFact, scopedPolicy } from "./support.js"

interface Body {
  data?: unknown
  rejected?: string
  guidance?: { next?: string; invariant?: string }
}
const bodyOf = (r: unknown): Body =>
  JSON.parse((r as { content: Array<{ text?: string }> }).content[0]?.text ?? "{}") as Body

/** The DISCRIMINANT of a refusal — the text before the first `:` (ADR-0007). Asserted by EQUALITY. */
const reasonOf = (b: Body): string => (b.rejected ?? "").split(":")[0]!

/** The rendered `  territory: <name>` lines of an `atlas init` verdict — the block the path must select. */
const territoryLines = (stdout: string): string[] =>
  stdout
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.startsWith("territory: "))

const recon = (out: unknown): { regroundedCount: number; mechanical: string[]; exitCode: number } =>
  out as { regroundedCount: number; mechanical: string[]; exitCode: number }

let repo: FixtureRepo
let fact: GroundedFact
let genesis: string // the sha the fact was grounded at — the merge base WITH one MECHANICAL drift
let priorActor: string | undefined
let priorRatify: string | undefined

beforeAll(() => {
  priorActor = process.env.ATLAS_ACTOR
  priorRatify = process.env.ATLAS_RATIFY_TOKEN
  process.env.ATLAS_ACTOR = ACTOR
  process.env.ATLAS_RATIFY_TOKEN = RATIFIER
  repo = makeFixtureRepo({
    files: {
      "src/foo.ts": "export const foo = 1;\n",
      "src/deep/nested.ts": "export const nested = 2;\n",
      "README.md": "# demo\n",
    },
    policy: scopedPolicy("src"),
  })
  fact = draftFact(repo, "src/foo.ts", "invariant", "foo is 1").fact
  genesis = repo.sha()
  const e = emitFact(repo, fact)
  if (e.exitCode !== 0) throw new Error(`S26 setup: grounded emit failed:\n${e.stdout}\n${e.stderr}`)
  // A PURE RENAME — identical bytes at a new path. The anchor moves, the claim survives ⇒ the drift
  // classifies MECHANICAL, which is the ONLY subset `acceptReground` counts. Without a mechanical drift the
  // whole knob is vacuous and a broken one would read the same as a working one.
  execFileSync("git", ["mv", "src/foo.ts", "src/bar.ts"], { cwd: repo.repoPath, stdio: "ignore" })
  execFileSync("git", ["commit", "-q", "-m", "pure rename"], { cwd: repo.repoPath, stdio: "ignore" })
})

afterAll(() => {
  repo?.cleanup()
  if (priorActor === undefined) delete process.env.ATLAS_ACTOR
  else process.env.ATLAS_ACTOR = priorActor
  if (priorRatify === undefined) delete process.env.ATLAS_RATIFY_TOKEN
  else process.env.ATLAS_RATIFY_TOKEN = priorRatify
})

// ── 1. acceptReground — the declared shape is the shape that works, and the other one is refused ──────────

describe("S26.1 — the published `acceptReground` is the one the door reads", () => {
  it("the CANONICAL shape is what the CLI already marshals: `{mergeBase, options:{acceptReground}}`", async () => {
    const session = await mcpSession(repo.repoPath)
    try {
      const { tools } = await session.client.listTools()
      const schema = tools.find((t) => t.name === "atlas-reconcile")?.inputSchema as {
        properties?: Record<string, { type?: string; properties?: Record<string, { type?: string }> }>
      }
      const props = schema.properties ?? {}
      // the frozen leg signature is `reconcile(mergeBase, options?)` (tools/src/reconcile.ts) and the CLI
      // marshaller produces exactly that (cli/src/marshal.ts) — the schema now names the same shape.
      expect(props["options"]?.type).toBe("object")
      expect(props["options"]?.properties?.["acceptReground"]?.type).toBe("boolean")
      // …and the dead top-level spelling is GONE from the published surface.
      expect(Object.keys(props)).not.toContain("acceptReground")
    } finally {
      await session.close()
    }
  }, 20000)

  it("the DECLARED spelling actually re-grounds: `regroundedCount` counts the mechanical subset", async () => {
    const session = await mcpSession(repo.repoPath)
    try {
      const res = await session.client.callTool({
        name: "atlas-reconcile",
        arguments: { mergeBase: genesis, options: { acceptReground: true } },
      })
      expect(res.isError).toBeFalsy()
      const out = recon(bodyOf(res).data)
      expect(out.mechanical).toHaveLength(1) // non-vacuous: there IS something to re-ground
      expect(out.regroundedCount).toBe(1)

      // …and OMITTING it is still report-only (the knob is what makes the difference, not the drift).
      const off = await session.client.callTool({
        name: "atlas-reconcile",
        arguments: { mergeBase: genesis },
      })
      expect(recon(bodyOf(off).data).regroundedCount).toBe(0)
    } finally {
      await session.close()
    }
  }, 20000)

  it("the UNDECLARED top-level spelling is REFUSED, not silently ignored", async () => {
    // The other half of the lie. Accepting `{acceptReground:true}` and doing nothing is exactly as
    // dishonest as declaring a knob that does nothing: the caller is told the call succeeded.
    const session = await mcpSession(repo.repoPath)
    try {
      const res = await session.client.callTool({
        name: "atlas-reconcile",
        arguments: { mergeBase: genesis, acceptReground: true },
      })
      expect(res.isError).toBe(true)
      const body = bodyOf(res)
      expect(reasonOf(body)).toBe("malformed-args")
      expect(body.rejected).toContain("acceptReground") // it NAMES the argument it would not honour
      expect(body.guidance?.next).toBeTruthy()
    } finally {
      await session.close()
    }
  }, 20000)

  it("a non-boolean NESTED `acceptReground` is malformed input, not a silently-dropped option", async () => {
    const session = await mcpSession(repo.repoPath)
    try {
      const res = await session.client.callTool({
        name: "atlas-reconcile",
        arguments: { mergeBase: genesis, options: { acceptReground: "yes" } },
      })
      expect(res.isError).toBe(true)
      expect(bodyOf(res).rejected).toContain("'options.acceptReground' must be boolean")
    } finally {
      await session.close()
    }
  }, 20000)

  it("an undeclared key INSIDE `options` is refused too — the closed set is closed all the way down", async () => {
    const session = await mcpSession(repo.repoPath)
    try {
      const res = await session.client.callTool({
        name: "atlas-reconcile",
        arguments: { mergeBase: genesis, options: { acceptRegound: true } }, // a typo a human really makes
      })
      expect(res.isError).toBe(true)
      expect(reasonOf(bodyOf(res))).toBe("malformed-args")
      expect(bodyOf(res).rejected).toContain("options.acceptRegound")
    } finally {
      await session.close()
    }
  }, 20000)

  it("TRANSPORT PARITY: the CLI `--accept-reground` still works, over the shape the schema now names", () => {
    const r = runAtlas(repo.repoPath, ["reconcile", genesis, "--accept-reground"])
    expect(r.exitCode).toBe(0) // a mechanical-only drift never blocks
    expect(r.stdout).toContain("status: ok")
  })
})

// ── 2. additionalProperties:false — declared AND enforced ─────────────────────────────────────────────────

describe("S26.2 — `additionalProperties:false` is enforced, and every working argument is declared", () => {
  it("an undeclared property is REFUSED (it used to be accepted and routed)", async () => {
    const session = await mcpSession(repo.repoPath)
    try {
      const res = await session.client.callTool({
        name: "atlas-query",
        arguments: { scope: "src", bogusKey: 1 },
      })
      expect(res.isError).toBe(true)
      const body = bodyOf(res)
      expect(reasonOf(body)).toBe("malformed-args")
      expect(body.rejected).toContain("bogusKey")
      expect(body.rejected).toContain("scope") // the message NAMES what the schema does accept
    } finally {
      await session.close()
    }
  }, 20000)

  it("`by` was the UNDER-declared argument — now published, so enforcement does not break a working call", async () => {
    const session = await mcpSession(repo.repoPath)
    try {
      const { tools } = await session.client.listTools()
      const schema = tools.find((t) => t.name === "atlas-query")?.inputSchema as {
        properties?: Record<string, { type?: string; enum?: string[] }>
      }
      expect(schema.properties?.["by"]?.type).toBe("string")
      expect(schema.properties?.["by"]?.enum).toEqual(["scope", "dependency", "trigger"])

      // the call that WORKED while being undeclared keeps working, now honestly.
      const ok = await session.client.callTool({
        name: "atlas-query",
        arguments: { scope: "src", by: "dependency" },
      })
      expect(ok.isError).toBeFalsy()
    } finally {
      await session.close()
    }
  }, 20000)

  it("TRANSPORT PARITY: an unknown `--by` mode is refused on BOTH doors, not just the CLI", async () => {
    const cli = runAtlas(repo.repoPath, ["query", "src", "--by=graph"])
    expect(cli.exitCode).not.toBe(0)
    expect(cli.stdout).toContain("query --by must be one of scope|dependency|trigger")

    const session = await mcpSession(repo.repoPath)
    try {
      const res = await session.client.callTool({
        name: "atlas-query",
        arguments: { scope: "src", by: "graph" },
      })
      expect(res.isError).toBe(true) // MCP used to accept this and silently serve `by: scope`
      expect(bodyOf(res).rejected).toContain("'by' must be one of")
    } finally {
      await session.close()
    }
  }, 20000)

  it("every governance tool enforces it — a bogus key is refused on all five doors", async () => {
    const CALLS: ReadonlyArray<readonly [string, Record<string, unknown>]> = [
      ["atlas-init", { path: ".", bogusKey: 1 }],
      ["atlas-query", { scope: "src", bogusKey: 1 }],
      ["atlas-emit", { node: {}, at: genesis, bogusKey: 1 }],
      ["atlas-reconcile", { mergeBase: genesis, bogusKey: 1 }],
      ["atlas-link", { a: "nkA", b: "nkB", bogusKey: 1 }],
    ]
    const session = await mcpSession(repo.repoPath)
    try {
      for (const [name, args] of CALLS) {
        const res = await session.client.callTool({ name, arguments: args })
        expect(res.isError, `${name} must refuse an undeclared property`).toBe(true)
        expect(reasonOf(bodyOf(res)), `${name} refusal class`).toBe("malformed-args")
      }
    } finally {
      await session.close()
    }
  }, 30000)

  it("CONTROL: the declared arguments of every door still pass the validator", async () => {
    const session = await mcpSession(repo.repoPath)
    try {
      const q = await session.client.callTool({ name: "atlas-query", arguments: { scope: "src" } })
      expect(q.isError).toBeFalsy()
      const i = await session.client.callTool({ name: "atlas-init", arguments: { path: "." } })
      expect(i.isError).toBeFalsy()
      const r = await session.client.callTool({ name: "atlas-reconcile", arguments: { mergeBase: genesis } })
      expect(r.isError).toBeFalsy()
    } finally {
      await session.close()
    }
  }, 20000)
})

// ── 3. atlas init <path> — the path selects what is rendered ──────────────────────────────────────────────

describe("S26.3 — `atlas init <path>` honours its path", () => {
  it("BACK-TO-BACK in ONE repo state, three paths render three DIFFERENT territory blocks", () => {
    const root = runAtlas(repo.repoPath, ["init", "."])
    const src = runAtlas(repo.repoPath, ["init", "src"])
    const readme = runAtlas(repo.repoPath, ["init", "README.md"])

    expect(root.exitCode).toBe(0)
    expect(src.exitCode).toBe(0)
    expect(readme.exitCode).toBe(0)

    // the exact measurement that exposed the defect: these three were byte-identical.
    expect(territoryLines(src.stdout)).not.toEqual(territoryLines(root.stdout))
    expect(territoryLines(readme.stdout)).not.toEqual(territoryLines(root.stdout))
    expect(territoryLines(readme.stdout)).not.toEqual(territoryLines(src.stdout))

    // `.` is the whole repo — the top-level territories, unchanged from before this fix.
    expect(territoryLines(root.stdout)).toContain("territory: src")
    expect(territoryLines(root.stdout)).toContain("territory: README.md")

    // `src` reports what lives UNDER src, and nothing outside it.
    expect(territoryLines(src.stdout)).toEqual(["territory: src/bar.ts", "territory: src/deep"])

    // a leaf path is its own single territory.
    expect(territoryLines(readme.stdout)).toEqual(["territory: README.md"])
  })

  it("a path that names NOTHING is refused — never a phantom successful move-in", () => {
    const r = runAtlas(repo.repoPath, ["init", "no/such/path"])
    expect(r.exitCode).not.toBe(0) // measured before the fix: exit 0 with the full five-territory block
    expect(territoryLines(r.stdout)).toEqual([])
    expect(r.stdout).toContain("no/such/path")
  })

  it("TRANSPORT PARITY: MCP `atlas-init` selects the same territories for the same path", async () => {
    const session = await mcpSession(repo.repoPath)
    try {
      const res = await session.client.callTool({ name: "atlas-init", arguments: { path: "src" } })
      expect(res.isError).toBeFalsy()
      const names = (bodyOf(res).data as { territories: Array<{ name: string; tier: string }> }).territories
      expect(names.map((t) => t.name)).toEqual(["src/bar.ts", "src/deep"])
      expect(names.every((t) => t.tier === "T2")).toBe(true) // move-in tier is untouched (TOOLS-5)

      const miss = await session.client.callTool({ name: "atlas-init", arguments: { path: "no/such/path" } })
      expect(miss.isError).toBe(true)
    } finally {
      await session.close()
    }
  }, 20000)
})
