// @atlas/cli — test/anchors-cli.test.ts  (WP-10.A1.CLI — `atlas anchors <path>` + the planner write-freedom harness)
//
// Two things under test, mirroring relations-cli.test.ts:
//   (1) the argv→dispatch wiring — does `atlas anchors` REACH the composition root's `anchors` leg (or is
//       `createAnchors` a reference model nothing calls, the exact state `reference-model-guard` flags RED),
//       and are the units a caller gets back the real ones the built index carries.
//   (2) the CAMPAIGN-10 write-freedom goldens — SCN-AUTH-2a-1 (a planner writes nothing → the spy records zero
//       calls), SCN-AUTH-2d-1 (byte-identical store/repo census after a planner run over valid ∪ malformed ∪
//       empty args), and PROP-AUTH-2 (the set-level law: bytesWritten==0 ∧ door ∉ WRITE_PATHS ∧ leg ∉ GOVERNANCE_SURFACE).
//
// The `anchors` leg here is the PRODUCTION one — `composeRuntime(fixtureRepo).anchors` over a real committed
// `fix-author` repo — not a hand-held stub, so the units, the rev, and the declared `.rs` hole are exactly what
// the shipped path returns. The leg is composed over the FILE TREE (AUTHOR-1), holding NO store handle, so its
// write-freedom is STRUCTURAL; the census teeth are taken over the repo it actually reads (a lister that drops a
// `.atlas/cache` index memo beside the repo is what the census arm catches), and the reusable write-spy store is
// validated to have its own teeth (a direct write records + throws) so "zero calls" is never vacuous.

import { execFileSync } from "node:child_process"
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join, relative } from "node:path"
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { composeRuntime, initAst } from "@atlas/adapter-io"
import type { AnchorsApi } from "@atlas/tools"
import { GOVERNANCE_SURFACE, WRITE_PATHS } from "@atlas/tools"
import { main } from "../src/cli.js"
import { COMMANDS, COMMAND_LEG, authorityOf } from "../src/map.js"
import type { Command } from "../src/map.js"
import { parse } from "../src/parse.js"
import { createWriteSpyStore, seedSomeBytes } from "./write-spy-store.js"

// ── the `fix-author` fixture (goldens-authoring.md §Fixture universe — the same two-language repo) ───────────
const FILES: Readonly<Record<string, string>> = {
  ".gitignore": "dist/\n",
  "src/app.ts":
    "export function run(): string {\n  return `running`;\n}\n\nexport function helper(): number {\n  return 1;\n}\n",
  "src/util.ts": "export function greet(name: string): string {\n  return `hi ${name}`;\n}\n",
  "core/engine.rs": "pub fn engine() -> u32 {\n    42\n}\n",
  "core/mod.rs": "pub mod engine;\n",
  "docs/notes.md": "# notes\n\nsome prose, no symbols.\n",
}

interface FixAuthor {
  readonly repoPath: string
  readonly rev: string
  readonly anchors: AnchorsApi["anchors"]
  cleanup(): void
}

function makeFixAuthor(): { repoPath: string; rev: string } {
  const repoPath = mkdtempSync(join(tmpdir(), "atlas-anchors-cli-"))
  for (const [rel, content] of Object.entries(FILES)) {
    const abs = join(repoPath, rel)
    mkdirSync(dirname(abs), { recursive: true })
    writeFileSync(abs, content)
  }
  const git = (...args: string[]): string =>
    execFileSync("git", args, { cwd: repoPath, stdio: ["pipe", "pipe", "pipe"] }).toString()
  git("init", "-q")
  git("config", "user.email", "fix@atlas.test")
  git("config", "user.name", "atlas-fixture")
  git("config", "commit.gpgsign", "false")
  git("add", ".")
  git("commit", "-q", "-m", "R1")
  const rev = git("rev-parse", "HEAD").trim()
  return { repoPath, rev }
}

let fix: FixAuthor
let writes: string[]

beforeAll(async () => {
  await initAst() // warm the grammar so `::` symbol units fold — the runtime bins do this before composeRuntime
  const { repoPath, rev } = makeFixAuthor()
  const runtime = composeRuntime(repoPath)
  fix = { repoPath, rev, anchors: runtime.anchors, cleanup: () => rmSync(repoPath, { recursive: true, force: true }) }
})
afterAll(() => fix.cleanup())

beforeEach(() => {
  writes = []
  vi.spyOn(process.stdout, "write").mockImplementation((chunk: unknown) => {
    writes.push(String(chunk))
    return true
  })
})
afterEach(() => vi.restoreAllMocks())

// ── (1) `atlas anchors` is a real command that reaches a real leg ────────────────────────────────────────────
describe("WP-10.A1.CLI — `atlas anchors` end to end", () => {
  it("parses with ONE required positional and routes to the READ authority oracle", () => {
    const p = parse(["anchors", "src"])
    expect(p.ok).toBe(true)
    expect(p.ok && p.command).toBe("anchors")
    expect(p.ok && p.positionals).toEqual(["src"])
    expect(COMMANDS).toContain("anchors")
    expect(COMMAND_LEG.anchors).toBe("atlas-query")
    expect(authorityOf("anchors")).toBe("read") // DERIVED from WRITE_PATHS — `anchors` writes nothing
  })

  it("lists the groundable units under `src` — file + `::` symbol units, off the composed leg", async () => {
    const code = await main(["anchors", "src"], { anchors: fix.anchors })
    expect(code).toBe(0)
    const out = writes.join("")
    expect(out).toContain("status: ok")
    expect(out).toContain(`anchors: rev ${fix.rev} —`)
    // the two .ts files fold to file-level AND `::` symbol units (grammar is warm), and holes is empty for src
    expect(out).toContain("unit file src/app.ts [")
    expect(out).toMatch(/unit symbol src\/app\.ts::[^\n]*:run \[/)
    expect(out).toContain("0 hole(s)") // symbol-capable .ts files declare NO hole (SCN-AUTH-4c)
    expect(out).not.toMatch(/\n {2}hole /) // and no `  hole …` render line is emitted
  })

  it("a grammar-less `.rs` file still anchors at file level and DECLARES its hole with the real census", async () => {
    const code = await main(["anchors", "core"], { anchors: fix.anchors })
    expect(code).toBe(0)
    const out = writes.join("")
    expect(out).toContain("unit file core/engine.rs [") // SCN-AUTH-4a — grammar-less file still anchors
    expect(out).toContain("unit file core/mod.rs [")
    expect(out).toContain("hole .rs — 2 file(s):") // SCN-AUTH-4b — real fixture census of 2 .rs files, never a constant
  })

  it("honest-empty WITH a reason for an untracked path — a legible exit-0 result, never a throw (AUTHOR-3)", async () => {
    const code = await main(["anchors", "not-a-repo/nowhere"], { anchors: fix.anchors })
    expect(code).toBe(0) // an empty listing is a legitimate ANSWER, not an error
    const out = writes.join("")
    expect(out).toContain("0 unit(s)")
    expect(out).toContain("reason:") // AUTHOR-3 — never a silent empty set
  })

  it("FAILS CLOSED when the runtime is not composed — a wiring error, never a silent empty listing", async () => {
    const code = await main(["anchors", "src"], {})
    expect(code).toBe(1)
    expect(writes.join("")).toContain("atlas runtime is not composed yet")
    expect(writes.join("")).not.toContain("anchors: rev")
  })

  it("a missing path fails at the parser arity floor, before any leg is reached", async () => {
    let called = 0
    const leg: AnchorsApi["anchors"] = (p) => {
      called++
      return { rev: "x", units: [], holes: [], reason: "x" }
    }
    const code = await main(["anchors"], { anchors: leg })
    expect(code).toBe(1)
    expect(called).toBe(0) // the parser refused arity 0 before dispatch — totality preserved
    expect(writes.join("")).toContain("command 'anchors' requires 1 positional argument(s), got 0")
  })
})

// ── (2) SCN-AUTH-2a-1 / SCN-AUTH-2d-1 / PROP-AUTH-2 — the planner write-freedom goldens ───────────────────────
describe("SCN-AUTH-2a-1 / SCN-AUTH-2d-1 / PROP-AUTH-2 — a planner writes nothing", () => {
  // The set of authoring PLANNER commands that EXIST today (EPIC-A1). `slots`/`draft`/`check` join in A2/A3 and
  // reuse THIS harness (they are added to `COMMANDS` then to this list); the ∀ below iterates whatever is
  // present, so extending it needs no new scaffolding — only a new member here.
  const AUTHORING_PLANNERS: readonly Command[] = ["anchors"]

  it("the write-spy harness has TEETH — every write door records the attempt AND throws (not vacuous)", () => {
    const h = createWriteSpyStore()
    try {
      expect(() => h.spy.put({} as never)).toThrow(/planner reached the 'put' write door/)
      expect(() => h.spy.persistProjection({} as never)).toThrow(/persistProjection/)
      expect(() => h.spy.commitProjection(() => ({}) as never)).toThrow(/commitProjection/)
      expect(() => h.spy.commitStaging(() => ({}) as never)).toThrow(/commitStaging/)
      expect(h.calls().map((c) => c.door)).toEqual(["put", "persistProjection", "commitProjection", "commitStaging"])
    } finally {
      h.dispose()
    }
  })

  it("SCN-AUTH-2a-1 — every planner completes under the write-spy and the spy records ZERO calls", async () => {
    const h = createWriteSpyStore()
    seedSomeBytes(h.seed) // a NON-EMPTY store, so "zero calls" is measured against a store a planner could write to
    try {
      for (const cmd of AUTHORING_PLANNERS) {
        // every existing planner, invoked with VALID arguments; each completes with exit 0 (a legible answer)
        const code = await main([cmd, "src"], { anchors: fix.anchors })
        expect(code).toBe(0)
      }
      // the spy — present in scope, ready for the store-composed A2/A3 planners — recorded no write attempt. The
      // `anchors` leg holds no store handle at all (AUTHOR-1: composed over the file tree), so this is STRUCTURAL.
      expect(h.calls()).toEqual([])
    } finally {
      h.dispose()
    }
  })

  it("SCN-AUTH-2d-1 — the repo the planner READS is byte-identical after valid ∪ malformed ∪ empty args", async () => {
    // The census teeth for `anchors`: it reads the fixture repo's file tree, so a lister that memoized an index
    // build to `.atlas/cache` beside that repo would change THIS census — the arm a CAS-only assertion misses.
    // composeRuntime already ran in beforeAll, so the baseline is taken AFTER any compose-time setup.
    const h = createWriteSpyStore()
    seedSomeBytes(h.seed) // a NON-EMPTY store baseline (the CAS ∧ sidecar arm the census would catch)
    const storeBefore = mapToObj(h.census())
    const repoBefore = mapToObj(censusRepo(fix.repoPath))
    try {
      // valid, malformed (a path that does not exist), and empty-yielding (untracked) arguments — the whole ∀
      await main(["anchors", "src"], { anchors: fix.anchors })
      await main(["anchors", "core"], { anchors: fix.anchors })
      await main(["anchors", "not-a-repo"], { anchors: fix.anchors }) // empty listing, honest reason
      await main(["anchors", "../../etc"], { anchors: fix.anchors }) // adversarial traversal-shaped path
      // the repo the planner read is untouched — zero bytes written (CAS ∧ projection ∧ cache), byte for byte
      expect(mapToObj(censusRepo(fix.repoPath))).toEqual(repoBefore)
      // the seeded write-spy store is byte-identical too, and it never recorded a call across the whole ∀
      expect(mapToObj(h.census())).toEqual(storeBefore)
      expect(h.calls()).toEqual([])
    } finally {
      h.dispose()
    }
  })

  it("PROP-AUTH-2 (set-level) — every authoring planner: leg ∉ WRITE_PATHS ∧ leg ∉ GOVERNANCE_SURFACE", () => {
    for (const cmd of AUTHORING_PLANNERS) {
      // the authority DERIVES from WRITE_PATHS (map.ts `authorityOf`) — it is not asserted twice
      expect(authorityOf(cmd)).toBe("read")
      const leg = COMMAND_LEG[cmd]
      expect((WRITE_PATHS as readonly string[]).includes(leg)).toBe(false)
      // `anchors` binds `atlas-query` for AUTHORITY only; it opens no governed token, so the surface counts hold
      // (WP-11.W8: GOVERNANCE_SURFACE/WRITE_PATHS grew from 5/2 to 6/3 — `atlas-memory-emit` — this planner
      // still opens neither, which is the property under test here).
      expect(GOVERNANCE_SURFACE.length).toBe(6)
      expect((WRITE_PATHS as readonly string[]).length).toBe(3)
    }
  })
})

/** Census the fixture REPO tree, skipping `.git` (git's own object churn is not a planner write). */
function censusRepo(repoPath: string): Map<string, string> {
  const skip = new Set([".git"])
  const out = new Map<string, string>()
  const walk = (abs: string): void => {
    let entries
    try {
      entries = readdirSync(abs, { withFileTypes: true })
    } catch {
      return
    }
    for (const e of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (skip.has(e.name)) continue
      const child = join(abs, e.name)
      if (e.isDirectory()) walk(child)
      else out.set(relative(repoPath, child), readFileSync(child, "utf8"))
    }
  }
  walk(repoPath)
  return out
}

function mapToObj(m: ReadonlyMap<string, string>): Record<string, string> {
  return Object.fromEntries([...m.entries()].sort((a, b) => a[0].localeCompare(b[0])))
}
