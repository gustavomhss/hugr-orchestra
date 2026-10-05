// @atlas/cli — test/check-cli.test.ts  (WP-10.A3.CLI — `atlas check <anchor> <slot> <claim>` end to end)
//
// Mirrors slots-draft-cli.test.ts's shape: argv→dispatch wiring over the REAL composed `fix-author` fixture
// (not a hand-held stub, so the gate-chain verdict is exactly what the shipped `check` leg returns). `atlas
// check` is the CLI transport counterpart of the already-shipped `atlas-check` MCP tool (server-read-tools.ts):
// it composes a candidate through the SAME `draft` planner, then DRY-RUNS the governed emit door's whole gate
// chain over it WITHOUT any write (AUTHOR-11/12). The `wouldEmit` verdict agrees with the real door's BY
// CONSTRUCTION (PROP-AUTH-11, the SAME `runGateChain` fold). This test pins: (1) the parser/registry wiring,
// (2) a real dry-run reaching the composed leg, (3) fail-closed with no runtime, (4) an out-of-vocabulary slot
// refused at the SAME surface as `atlas draft` (the shared `draftVerdict` composition), (5) write-freedom.

import { execFileSync } from "node:child_process"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { composeRuntime, initAst } from "@atlas/adapter-io"
import type { CheckApi, DraftApi, SlotsApi } from "@atlas/tools"
import { GOVERNANCE_SURFACE, WRITE_PATHS } from "@atlas/tools"
import { main } from "../src/cli.js"
import { COMMANDS, COMMAND_LEG, authorityOf } from "../src/map.js"
import { parse } from "../src/parse.js"
import { createWriteSpyStore, seedSomeBytes } from "./write-spy-store.js"

// ── the `fix-author` fixture (the same repo anchors-cli.test.ts / slots-draft-cli.test.ts use) ──
const FILES: Readonly<Record<string, string>> = {
  ".gitignore": "dist/\n",
  "src/app.ts":
    "export function run(): string {\n  return `running`;\n}\n\nexport function helper(): number {\n  return 1;\n}\n",
  "src/util.ts": "export function greet(name: string): string {\n  return `hi ${name}`;\n}\n",
}

function makeFixAuthor(): string {
  const repoPath = mkdtempSync(join(tmpdir(), "atlas-check-cli-"))
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
  return repoPath
}

interface FixAuthor {
  readonly repoPath: string
  readonly slots: SlotsApi["slots"]
  readonly draft: DraftApi["draft"]
  readonly check: CheckApi["check"]
  cleanup(): void
}

let fix: FixAuthor
let writes: string[]

beforeAll(async () => {
  await initAst()
  const repoPath = makeFixAuthor()
  const runtime = composeRuntime(repoPath)
  fix = {
    repoPath,
    slots: runtime.slots,
    draft: runtime.draft,
    check: runtime.check,
    cleanup: () => rmSync(repoPath, { recursive: true, force: true }),
  }
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

// ── (1) `atlas check` is a real command that reaches a real leg ──────────────────────────────────────────────

describe("WP-10.A3.CLI — `atlas check <anchor> <slot> <claim>` wiring", () => {
  it("parses with THREE required positionals and routes to the READ authority oracle", () => {
    const p = parse(["check", "src/app.ts::run", "invariant", "never returns empty"])
    expect(p.ok).toBe(true)
    expect(p.ok && p.command).toBe("check")
    expect(p.ok && p.positionals).toEqual(["src/app.ts::run", "invariant", "never returns empty"])
    expect(COMMANDS).toContain("check")
    expect(COMMAND_LEG.check).toBe("atlas-query")
    expect(authorityOf("check")).toBe("read")
  })

  it("dry-runs the emit gate chain over a composed candidate — a legible verdict, off the composed leg", async () => {
    const code = await main(["check", "src/app.ts::run", "invariant", "never returns empty"], {
      check: fix.check,
      draft: fix.draft,
      slots: fix.slots,
    })
    expect(code).toBe(0) // a dry-run ANSWER (admit or refuse) is exit 0, never a crash
    const out = writes.join("")
    expect(out).toContain("status: ok")
    // the verdict names whether the candidate WOULD be admitted, and does so through the gate-chain language.
    expect(out).toMatch(/ADMITTED|REFUSED/)
    // the WHOLE gate ledger is rendered at the CLI — not just the first refusal the `next:` line names — so the
    // CLI is not asymmetric with the MCP `atlas-check` tool (WP-10.A3.CLI render branch). The `data:` block
    // carries the overall `wouldEmit:` decision and at least one per-gate row (`gate <name>: pass|refuse`).
    // This assertion has teeth ONLY because the render branch exists: without it renderData returns '' and no
    // `data:`/`wouldEmit:`/`gate ` line is printed (the exact CLI-vs-MCP asymmetry this closes).
    expect(out).toContain("data:")
    expect(out).toMatch(/wouldEmit: (true|false)/)
    expect(out).toMatch(/gate \w+: (pass|refuse)/)
  })

  it("an out-of-vocabulary slot is refused at the SAME surface as `atlas draft` — check leg never reached", async () => {
    let called = 0
    const checkLeg: CheckApi["check"] = (c, at) => {
      called++
      return fix.check(c, at)
    }
    const code = await main(["check", "src/app.ts::run", "not-a-real-slot", "x"], {
      check: checkLeg,
      draft: fix.draft,
      slots: fix.slots,
    })
    expect(code).toBe(1)
    expect(called).toBe(0) // the shared draftVerdict composition refused BEFORE the dry-run leg
    expect(writes.join("")).toContain("unknown slot 'not-a-real-slot'")
  })

  it("FAILS CLOSED when the runtime is not composed — never a silent dry-run over nothing", async () => {
    const code = await main(["check", "src/app.ts::run", "invariant", "x"], {})
    expect(code).toBe(1)
    expect(writes.join("")).toContain("atlas runtime is not composed yet")
  })

  it("a missing claim fails at the parser arity floor, before any leg is reached", async () => {
    let called = 0
    const checkLeg: CheckApi["check"] = (c, at) => {
      called++
      return fix.check(c, at)
    }
    const code = await main(["check", "src/app.ts::run", "invariant"], {
      check: checkLeg,
      draft: fix.draft,
      slots: fix.slots,
    })
    expect(code).toBe(1)
    expect(called).toBe(0)
    expect(writes.join("")).toContain("requires 3 positional argument(s), got 2")
  })
})

// ── (2) write-freedom — `check` is a PLANNER: leg ∉ WRITE_PATHS ∧ ∉ GOVERNANCE_SURFACE, spy records 0 ─────────

describe("PROP-AUTH-2 — `atlas check` writes nothing (dry-run planner)", () => {
  it("completes under the write-spy and the spy records ZERO calls", async () => {
    const h = createWriteSpyStore()
    seedSomeBytes(h.seed)
    try {
      const code = await main(["check", "src/app.ts::run", "invariant", "a write-freedom claim"], {
        check: fix.check,
        draft: fix.draft,
        slots: fix.slots,
      })
      expect(code).toBe(0)
      expect(h.calls()).toEqual([])
    } finally {
      h.dispose()
    }
  })

  it("PROP-AUTH-2 (set-level) — `check`: leg ∉ WRITE_PATHS ∧ leg ∉ GOVERNANCE_SURFACE", () => {
    expect(authorityOf("check")).toBe("read")
    expect((WRITE_PATHS as readonly string[]).includes(COMMAND_LEG.check)).toBe(false)
    // WP-11.W8: GOVERNANCE_SURFACE/WRITE_PATHS grew from 5/2 to 6/3 (`atlas-memory-emit`); `check` still
    // opens neither, which is the property under test here.
    expect(GOVERNANCE_SURFACE.length).toBe(6)
    expect((WRITE_PATHS as readonly string[]).length).toBe(3)
  })
})
